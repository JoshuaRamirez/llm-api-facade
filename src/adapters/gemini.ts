import {
  type CompletionProvider,
  type ModelIdentity,
  type ModelCapabilities,
  type NormalizedRequest,
  type CompletionResponse,
  type CompletionChunk,
  type ContentBlock,
  FinishReason,
  FacadeError,
  createModelIdentity,
  createUsage,
} from "../types/index.js";

/**
 * Google Gemini API adapter (AI Studio surface).
 * Handles: parts-based content, "model" role, functionCall/functionResponse
 * as parts, systemInstruction as separate field, STOP finishReason for
 * tool calls (must inspect parts), complete-object SSE chunks.
 * (ToolCallingChoreography Section 3.3, Vendors/Google-Gemini.md)
 */

interface GeminiConfig {
  apiKey: string;
  apiVersion?: string;
}

export class GeminiAdapter implements CompletionProvider {
  readonly providerId = "gemini";
  private apiKey: string;
  private apiVersion: string;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion ?? "v1beta";
  }

  async resolveModel(modelId: string): Promise<{ identity: ModelIdentity; capabilities: ModelCapabilities } | null> {
    if (!modelId.startsWith("gemini-")) {
      return null;
    }

    return {
      identity: createModelIdentity(this.providerId, modelId),
      capabilities: {
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsStreaming: true,
        supportsSystemMessage: true,
        supportsToolCalling: true,
        supportsThinking: modelId.includes("2.5") || modelId.includes("3"),
        supportsVision: true,
        requiresAlternation: true,
        modelReadiness: { state: "available" },
        supportedParameters: {
          temperature: { supported: true, min: 0, max: 2, default: 1 },
          topP: { supported: true, min: 0, max: 1, default: 0.95 },
          topK: { supported: true, min: 1 },
          frequencyPenalty: { supported: true, min: -2, max: 2, default: 0 },
          presencePenalty: { supported: true, min: -2, max: 2, default: 0 },
          seed: { supported: true },
          stopSequences: { supported: true },
        },
        availableExtensions: [],
      },
    };
  }

  async complete(request: NormalizedRequest): Promise<CompletionResponse> {
    const wireRequest = this.translateRequest(request);
    const url = this.buildUrl(request.model.modelId, "generateContent");
    console.error(`[gemini] POST generateContent model=${request.model.modelId}`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[gemini] error ${response.status}`);
      throw this.translateError(response.status, errorBody);
    }

    const data = await response.json() as GeminiResponse;
    return this.translateResponse(data);
  }

  async *completeStream(request: NormalizedRequest): AsyncIterable<CompletionChunk> {
    const wireRequest = this.translateRequest(request);
    const url = this.buildUrl(request.model.modelId, "streamGenerateContent") + "?alt=sse";
    const correlationId = `str_${Date.now().toString(36)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw this.translateError(response.status, errorBody);
    }

    if (!response.body) {
      throw new FacadeError("system.provider_error", "NO_STREAM_BODY", "No response body for stream", correlationId, true);
    }

    let completionId = `cpl_${Date.now().toString(36)}`;
    let chunkIndex = 0;
    let lastUsage: GeminiUsageMetadata | undefined;
    let usageEmitted = false;
    let lastFinishReason: FinishReason | undefined;
    const textBlockIndex = 0;
    let toolBlockCount = 0;


    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);

          let chunk: GeminiResponse;
          try {
            chunk = JSON.parse(payload) as GeminiResponse;
          } catch {
            throw new FacadeError("process.stream_interrupted", "MALFORMED_STREAM_CHUNK", "Failed to parse Gemini SSE chunk", correlationId, true);
          }

          if (chunk.usageMetadata) {
            lastUsage = chunk.usageMetadata;
          }

          const candidate = chunk.candidates?.[0];
          if (!candidate) continue;

          if (candidate.finishReason) {
            lastFinishReason = this.mapFinishReason(candidate.finishReason, candidate.content?.parts);
          }

          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text !== undefined) {
                // Gemini streams incremental text per chunk — same block across chunks
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: textBlockIndex,
                  delta: { type: "text_delta" as const, text: part.text },
                };
              } else if (part.functionCall) {
                // Each function call is a distinct block after the text block
                const toolIdx = textBlockIndex + 1 + toolBlockCount;
                toolBlockCount++;
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: toolIdx,
                  delta: {
                    type: "tool_use_delta" as const,
                    toolUseId: part.functionCall.id ?? `fc_${chunkIndex}`,
                    name: part.functionCall.name,
                    inputJsonDelta: JSON.stringify(part.functionCall.args ?? {}),
                  },
                };
              }
            }
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim() && buffer.trim().startsWith("data: ")) {
        // Process final line if present
        const payload = buffer.trim().slice(6);
        try {
          const chunk = JSON.parse(payload) as GeminiResponse;
          if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
        } catch {
          // Ignore malformed final fragment
        }
      }

      // Guarantee final usage chunk
      if (!usageEmitted && chunkIndex > 0) {
        usageEmitted = true;
        yield {
          completionId,
          chunkIndex,
          blockIndex: 0,
          delta: { type: "text_delta" as const, text: "" },
          finishReason: lastFinishReason ?? FinishReason.Stop,
          usage: lastUsage
            ? createUsage(lastUsage.promptTokenCount, lastUsage.candidatesTokenCount, false)
            : createUsage(0, 0, true),
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  // --- Translation: Facade → Gemini Wire ---

  private translateRequest(request: NormalizedRequest): Record<string, unknown> {
    const wire: Record<string, unknown> = {};

    // Build tool name map from all tool_use blocks in conversation history
    const toolNameMap = new Map<string, string>();
    for (const msg of request.messages) {
      for (const block of msg.content) {
        if (block.type === "tool_use") {
          toolNameMap.set(block.toolUseId, block.name);
        }
      }
    }

    // Extract system messages → systemInstruction
    const systemParts: string[] = [];
    const contents: Array<{ role: string; parts: unknown[] }> = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        const text = msg.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map(b => b.text)
          .join("\n");
        if (text) systemParts.push(text);
      } else if (msg.role === "tool") {
        // Facade tool messages → Gemini user content with functionResponse parts
        const functionResponse = {
          functionResponse: {
            name: this.findToolName(request, msg.toolCallId),
            id: msg.toolCallId,
            response: { result: this.contentToString(msg.content) },
          },
        };
        contents.push({ role: "user", parts: [functionResponse] });
      } else if (msg.role === "assistant") {
        contents.push({
          role: "model", // Gemini uses "model" not "assistant"
          parts: this.contentToGeminiParts(msg.content, toolNameMap),
        });
      } else {
        contents.push({
          role: "user",
          parts: this.contentToGeminiParts(msg.content, toolNameMap),
        });
      }
    }

    if (systemParts.length > 0) {
      wire.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
    }

    wire.contents = contents;

    // Generation config
    const genConfig: Record<string, unknown> = {};
    const params = request.parameters;
    if (params.sampling?.temperature !== undefined) genConfig.temperature = params.sampling.temperature;
    if (params.sampling?.topP !== undefined) genConfig.topP = params.sampling.topP;
    if (params.sampling?.topK !== undefined) genConfig.topK = params.sampling.topK;
    if (params.constraints?.maxTokens !== undefined) genConfig.maxOutputTokens = params.constraints.maxTokens;
    if (params.constraints?.stopSequences !== undefined) genConfig.stopSequences = params.constraints.stopSequences;
    if (params.behavioral?.frequencyPenalty !== undefined) genConfig.frequencyPenalty = params.behavioral.frequencyPenalty;
    if (params.behavioral?.presencePenalty !== undefined) genConfig.presencePenalty = params.behavioral.presencePenalty;
    if (params.meta?.seed !== undefined) genConfig.seed = params.meta.seed;

    // Response format
    if (params.structural?.responseFormat) {
      const rf = params.structural.responseFormat;
      if (rf.type === "json" || rf.type === "json_schema") {
        genConfig.responseMimeType = "application/json";
        if (rf.schema) {
          genConfig.responseSchema = rf.schema;
        }
      }
    }

    if (Object.keys(genConfig).length > 0) {
      wire.generationConfig = genConfig;
    }

    // Tools
    if (params.structural?.tools && params.structural.tools.length > 0) {
      wire.tools = [{
        functionDeclarations: params.structural.tools.map(t => ({
          name: t.name,
          description: t.description ?? "",
          parameters: t.parameters ?? { type: "object", properties: {} },
        })),
      }];
    }

    return wire;
  }

  private contentToGeminiParts(content: readonly ContentBlock[], toolNameMap: Map<string, string>): unknown[] {
    return content.map(block => {
      switch (block.type) {
        case "text":
          return { text: block.text };
        case "tool_use":
          return {
            functionCall: {
              name: block.name,
              id: block.toolUseId,
              args: block.input,
            },
          };
        case "tool_result":
          return {
            functionResponse: {
              name: toolNameMap.get(block.toolUseId) ?? "tool_result",
              id: block.toolUseId,
              response: { result: this.contentToString(block.content) },
            },
          };
        case "thinking":
          return { text: block.thinking };
        case "image":
          if (block.data) {
            return { inlineData: { mimeType: block.mediaType, data: block.data } };
          }
          return { fileData: { mimeType: block.mediaType, fileUri: block.sourceUrl } };
      }
    });
  }

  private contentToString(content: readonly ContentBlock[]): string {
    return content
      .map(b => b.type === "text" ? b.text : `[${b.type}]`)
      .join("");
  }

  private findToolName(request: NormalizedRequest, toolCallId: string | undefined): string {
    // Search conversation history for the tool_use block with matching ID
    for (const msg of request.messages) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && block.toolUseId === toolCallId) {
          return block.name;
        }
      }
    }
    throw new FacadeError(
      "precondition.validation_error",
      "UNRESOLVABLE_TOOL_ID",
      `Cannot find tool name for toolCallId '${toolCallId}' in message history`,
      `err_${Date.now().toString(36)}`,
      false,
    );
  }

  // --- Translation: Gemini Wire → Facade ---

  private translateResponse(data: GeminiResponse): CompletionResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      // Check for prompt feedback (input blocked)
      if (data.promptFeedback?.blockReason) {
        return {
          completionId: data.responseId ?? `cpl_${Date.now().toString(36)}`,
          model: data.modelVersion ?? "gemini",
          content: [{ type: "text", text: "" }],
          finishReason: FinishReason.ContentFilter,
          usage: createUsage(
            data.usageMetadata?.promptTokenCount ?? 0,
            0,
            data.usageMetadata === undefined,
          ),
        };
      }
      throw new FacadeError("system.provider_error", "NO_CANDIDATES", "No candidates in Gemini response", `err_${Date.now().toString(36)}`, true);
    }

    const content: ContentBlock[] = [];
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text !== undefined) {
          content.push({ type: "text", text: part.text });
        } else if (part.functionCall) {
          content.push({
            type: "tool_use",
            toolUseId: part.functionCall.id ?? `fc_${Date.now().toString(36)}`,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "" });
    }

    // Gemini uses STOP even for tool calls — detect from parts
    const finishReason = this.mapFinishReason(candidate.finishReason, candidate.content?.parts);

    return {
      completionId: data.responseId ?? `cpl_${Date.now().toString(36)}`,
      model: data.modelVersion ?? "gemini",
      content,
      finishReason,
      usage: createUsage(
        data.usageMetadata?.promptTokenCount ?? 0,
        data.usageMetadata?.candidatesTokenCount ?? 0,
        data.usageMetadata === undefined,
      ),
    };
  }

  private mapFinishReason(reason: string | undefined, parts?: GeminiPart[]): FinishReason {
    // Gemini returns STOP even for function calls — must inspect parts
    if (parts?.some(p => p.functionCall)) {
      return FinishReason.ToolUse;
    }

    switch (reason) {
      case "STOP":
      case "FINISH_REASON_STOP":
        return FinishReason.Stop;
      case "MAX_TOKENS":
      case "FINISH_REASON_MAX_TOKENS":
        return FinishReason.Length;
      case "SAFETY":
      case "RECITATION":
      case "BLOCKLIST":
      case "PROHIBITED_CONTENT":
      case "IMAGE_PROHIBITED_CONTENT":
      case "SPII":
      case "FINISH_REASON_SAFETY":
      case "FINISH_REASON_RECITATION":
      case "FINISH_REASON_BLOCKLIST":
      case "FINISH_REASON_PROHIBITED_CONTENT":
        return FinishReason.ContentFilter;
      case "MALFORMED_FUNCTION_CALL":
      case "FINISH_REASON_MALFORMED_FUNCTION_CALL":
      case "NO_IMAGE":
      case "FINISH_REASON_NO_IMAGE":
        return FinishReason.Error;
      default:
        if (reason) console.error(`[gemini] unknown finishReason: '${reason}'`);
        return FinishReason.Stop;
    }
  }

  private translateError(status: number, body: string): FacadeError {
    const correlationId = `err_${Date.now().toString(36)}`;
    switch (status) {
      case 400: return new FacadeError("precondition.validation_error", "INVALID_PARAMS", body, correlationId, false);
      case 403: return new FacadeError("precondition.permission", "PERMISSION_DENIED", "Invalid Gemini API key or insufficient permissions", correlationId, false);
      case 404: return new FacadeError("precondition.model_not_found", "MODEL_NOT_FOUND", "Model not found", correlationId, false);
      case 429: return new FacadeError("capacity.rate_limited", "RATE_LIMITED", "Rate limited", correlationId, true);
      case 500: return new FacadeError("system.provider_error", "PROVIDER_ERROR", "Gemini internal error", correlationId, true);
      case 503: return new FacadeError("capacity.overloaded", "OVERLOADED", "Gemini service unavailable", correlationId, true);
      case 504: return new FacadeError("process.timeout", "TIMEOUT", "Gemini request timed out", correlationId, true);
      default: return new FacadeError("system.provider_error", "PROVIDER_ERROR", `HTTP ${status}`, correlationId, true);
    }
  }

  private buildUrl(modelId: string, method: string): string {
    return `https://generativelanguage.googleapis.com/${this.apiVersion}/models/${modelId}:${method}`;
  }
}

// --- Gemini Wire Types ---

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    id?: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    id?: string;
    response?: unknown;
  };
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { role: string; parts: GeminiPart[] };
    finishReason?: string;
    safetyRatings?: Array<{ category: string; probability: string; blocked: boolean }>;
    index?: number;
  }>;
  promptFeedback?: { blockReason?: string; safetyRatings?: unknown[] };
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}
