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
 * OpenAI-compatible adapter. Works with OpenAI, Ollama (/v1), vLLM, LM Studio,
 * llama.cpp, Mistral, xAI, and any provider exposing /v1/chat/completions.
 * (ToolCallingChoreography Section 2, ProviderAnalysis)
 */

interface OpenAICompatConfig {
  providerId: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
}

export class OpenAICompatAdapter implements CompletionProvider {
  readonly providerId: string;
  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultModel: string | undefined;

  constructor(config: OpenAICompatConfig) {
    this.providerId = config.providerId;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
  }

  async resolveModel(modelId: string): Promise<{ identity: ModelIdentity; capabilities: ModelCapabilities } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        console.error(`[${this.providerId}] models endpoint returned ${response.status}`);
        return null;
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      const model = data.data.find(m => m.id === modelId);

      if (!model) {
        if (this.defaultModel && modelId === this.defaultModel) {
          return this.buildModelResult(modelId);
        }
        return null;
      }

      return this.buildModelResult(modelId);
    } catch (_err) {
      // Network failure: model is not resolvable at this time.
      // Do NOT fabricate capabilities — return null so the facade reports model_not_found.
      console.error(`[${this.providerId}] resolveModel: provider unreachable`);
      return null;
    }
  }

  async complete(request: NormalizedRequest): Promise<CompletionResponse> {
    const wireRequest = this.translateRequest(request);
    console.error(`[${this.providerId}] POST /v1/chat/completions model=${wireRequest.model as string}`);

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[${this.providerId}] error ${response.status}`);
      throw this.translateError(response.status, errorBody, request.model.modelId);
    }

    const data = await response.json() as OpenAIChatCompletion;
    return this.translateResponse(data);
  }

  async *completeStream(request: NormalizedRequest): AsyncIterable<CompletionChunk> {
    const correlationId = `str_${Date.now().toString(36)}`;
    const wireRequest = { ...this.translateRequest(request), stream: true };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw this.translateError(response.status, errorBody, request.model.modelId);
    }

    if (!response.body) {
      throw new FacadeError("system.provider_error", "NO_STREAM_BODY", "No response body for stream", correlationId, true);
    }

    const completionId = `cpl_${Date.now().toString(36)}`;
    let chunkIndex = 0;
    let outputTokenEstimate = 0;
    let lastUsage: { prompt_tokens: number; completion_tokens: number } | undefined;
    let usageEmitted = false;

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

        yield* this.processSSELines(lines, completionId, chunkIndex, outputTokenEstimate, lastUsage, usageEmitted,
          (ci, ote, lu, ue) => { chunkIndex = ci; outputTokenEstimate = ote; lastUsage = lu; usageEmitted = ue; });
      }

      // Flush remaining buffer (handles missing trailing newline after [DONE])
      if (buffer.trim()) {
        yield* this.processSSELines([buffer], completionId, chunkIndex, outputTokenEstimate, lastUsage, usageEmitted,
          (ci, ote, lu, ue) => { chunkIndex = ci; outputTokenEstimate = ote; lastUsage = lu; usageEmitted = ue; });
      }

      // Guarantee final usage chunk if stream ended without one
      if (!usageEmitted && chunkIndex > 0) {
        yield {
          completionId,
          chunkIndex,
          blockIndex: 0,
          delta: { type: "text_delta" as const, text: "" },
          finishReason: FinishReason.Stop,
          usage: lastUsage
            ? createUsage(lastUsage.prompt_tokens, lastUsage.completion_tokens, false)
            : createUsage(0, outputTokenEstimate, true),
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  private *processSSELines(
    lines: string[],
    completionId: string,
    chunkIndex: number,
    outputTokenEstimate: number,
    lastUsage: { prompt_tokens: number; completion_tokens: number } | undefined,
    usageEmitted: boolean,
    setState: (ci: number, ote: number, lu: typeof lastUsage, ue: boolean) => void,
  ): Generator<CompletionChunk> {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") {
        setState(chunkIndex, outputTokenEstimate, lastUsage, usageEmitted);
        return;
      }

      let chunk: OpenAIStreamChunk;
      try {
        chunk = JSON.parse(payload) as OpenAIStreamChunk;
      } catch {
        throw new FacadeError(
          "process.stream_interrupted",
          "MALFORMED_STREAM_CHUNK",
          "Failed to parse streaming chunk as JSON",
          completionId,
          true,
        );
      }

      const choice = chunk.choices[0];
      if (!choice) continue;

      if (chunk.usage) {
        lastUsage = chunk.usage;
      }

      const delta = choice.delta;
      const finishReason = choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined;

      // Tool call deltas — finishReason only on the last one
      if (delta.tool_calls) {
        for (let i = 0; i < delta.tool_calls.length; i++) {
          const tc = delta.tool_calls[i]!;
          const isLast = i === delta.tool_calls.length - 1;
          const tcIndex = typeof tc.index === "number" && tc.index >= 0 ? tc.index : 0;
          yield {
            completionId,
            chunkIndex: chunkIndex++,
            blockIndex: tcIndex + 1,
            delta: {
              type: "tool_use_delta" as const,
              toolUseId: tc.id,
              name: tc.function?.name,
              inputJsonDelta: tc.function?.arguments ?? "",
            },
            // Only attach finishReason to the very last delta in this wire chunk
            finishReason: isLast && !delta.content ? finishReason : undefined,
          };
        }
      }

      // Text content delta
      if (delta.content !== null && delta.content !== undefined) {
        outputTokenEstimate++;
        yield {
          completionId,
          chunkIndex: chunkIndex++,
          blockIndex: 0,
          delta: { type: "text_delta" as const, text: delta.content },
          // Only attach finishReason if there were no tool_calls in this chunk
          finishReason: !delta.tool_calls ? finishReason : undefined,
        };
      }

      // Emit final usage chunk when finishReason is present
      if (finishReason && !usageEmitted) {
        usageEmitted = true;
        yield {
          completionId,
          chunkIndex: chunkIndex++,
          blockIndex: 0,
          delta: { type: "text_delta" as const, text: "" },
          finishReason,
          usage: lastUsage
            ? createUsage(lastUsage.prompt_tokens, lastUsage.completion_tokens, false)
            : createUsage(0, outputTokenEstimate, true),
        };
      }
    }
    setState(chunkIndex, outputTokenEstimate, lastUsage, usageEmitted);
  }

  // --- Translation: Facade → Wire ---

  private translateRequest(request: NormalizedRequest): Record<string, unknown> {
    const messages: Record<string, unknown>[] = [];

    for (const msg of request.messages) {
      if (msg.role === "tool") {
        // Facade tool-role message → OpenAI tool message with tool_call_id
        messages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: this.contentToWireString(msg.content),
        });
      } else if (msg.role === "assistant" && this.hasToolUseBlocks(msg.content)) {
        // Assistant message with ToolUseBlocks → OpenAI assistant with tool_calls field
        const textParts: string[] = [];
        const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];

        for (const block of msg.content) {
          if (block.type === "text") {
            textParts.push(block.text);
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.toolUseId,
              type: "function",
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }

        messages.push({
          role: "assistant",
          content: textParts.join("") || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      } else {
        messages.push({
          role: msg.role,
          content: this.contentToWire(msg.content),
        });
      }
    }

    const wire: Record<string, unknown> = {
      model: request.model.modelId,
      messages,
    };

    const params = request.parameters;
    if (params.sampling?.temperature !== undefined) wire.temperature = params.sampling.temperature;
    if (params.sampling?.topP !== undefined) wire.top_p = params.sampling.topP;
    if (params.constraints?.maxTokens !== undefined) wire.max_tokens = params.constraints.maxTokens;
    if (params.constraints?.stopSequences !== undefined) wire.stop = params.constraints.stopSequences;
    if (params.behavioral?.frequencyPenalty !== undefined) wire.frequency_penalty = params.behavioral.frequencyPenalty;
    if (params.behavioral?.presencePenalty !== undefined) wire.presence_penalty = params.behavioral.presencePenalty;
    if (params.meta?.seed !== undefined) wire.seed = params.meta.seed;

    // Structural: tools
    if (params.structural?.tools && params.structural.tools.length > 0) {
      wire.tools = params.structural.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters ?? { type: "object", properties: {} },
        },
      }));
    }

    return wire;
  }

  private contentToWire(content: readonly ContentBlock[]): string | unknown[] {
    if (content.length === 1 && content[0]!.type === "text") {
      return content[0]!.text;
    }
    return content.map(block => {
      switch (block.type) {
        case "text": return { type: "text", text: block.text };
        case "image": return {
          type: "image_url",
          image_url: block.data
            ? { url: `data:${block.mediaType};base64,${block.data}` }
            : { url: block.sourceUrl },
        };
        case "thinking": return { type: "text", text: block.thinking };
        case "tool_use": return { type: "text", text: `[tool_use: ${block.name}]` };
        case "tool_result": return { type: "text", text: this.contentToWireString(block.content) };
      }
    });
  }

  private contentToWireString(content: readonly ContentBlock[]): string {
    return content
      .map(b => b.type === "text" ? b.text : `[${b.type}]`)
      .join("");
  }

  private hasToolUseBlocks(content: readonly ContentBlock[]): boolean {
    return content.some(b => b.type === "tool_use");
  }

  // --- Translation: Wire → Facade ---

  private translateResponse(data: OpenAIChatCompletion): CompletionResponse {
    const choice = data.choices[0];
    if (!choice) {
      throw new FacadeError("system.provider_error", "NO_CHOICES", "No choices in response", `err_${Date.now().toString(36)}`, true);
    }

    const content: ContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let parsedInput: Record<string, unknown>;
        try {
          parsedInput = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          parsedInput = { _raw: tc.function.arguments };
        }
        content.push({
          type: "tool_use",
          toolUseId: tc.id,
          name: tc.function.name,
          input: parsedInput,
        });
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "" });
    }

    const finishReason = this.mapFinishReason(choice.finish_reason);

    return {
      completionId: data.id,
      model: data.model,
      content,
      finishReason,
      usage: createUsage(
        data.usage?.prompt_tokens ?? 0,
        data.usage?.completion_tokens ?? 0,
        data.usage === undefined,
      ),
    };
  }

  private mapFinishReason(raw: string): FinishReason {
    switch (raw) {
      case "stop": return FinishReason.Stop;
      case "length": return FinishReason.Length;
      case "content_filter": return FinishReason.ContentFilter;
      case "tool_calls": return FinishReason.ToolUse;
      case "tool": return FinishReason.ToolUse;
      default:
        console.error(`[${this.providerId}] unknown finish_reason: '${raw}', mapping to stop`);
        return FinishReason.Stop;
    }
  }

  private translateError(status: number, body: string, modelId: string): FacadeError {
    const correlationId = `err_${Date.now().toString(36)}`;
    switch (status) {
      case 400: return new FacadeError("precondition.validation_error", "INVALID_PARAMS", body, correlationId, false);
      case 401: return new FacadeError("precondition.authentication", "AUTH_FAILED", "Invalid credentials", correlationId, false);
      case 403: return new FacadeError("precondition.permission", "PERMISSION_DENIED", "Insufficient access", correlationId, false);
      case 404: return new FacadeError("precondition.model_not_found", "MODEL_NOT_FOUND", `Model '${modelId}' not found`, correlationId, false);
      case 429: return new FacadeError("capacity.rate_limited", "RATE_LIMITED", "Rate limited", correlationId, true);
      case 503: return new FacadeError("capacity.overloaded", "OVERLOADED", "Service overloaded", correlationId, true);
      default: return new FacadeError("system.provider_error", "PROVIDER_ERROR", `HTTP ${status}`, correlationId, true);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private buildModelResult(modelId: string): { identity: ModelIdentity; capabilities: ModelCapabilities } {
    return {
      identity: createModelIdentity(this.providerId, modelId),
      capabilities: {
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsSystemMessage: true,
        supportsToolCalling: false,
        supportsThinking: false,
        supportsVision: false,
        requiresAlternation: false,
        modelReadiness: { state: "available" },
        supportedParameters: {
          temperature: { supported: true, min: 0, max: 2, default: 1 },
          topP: { supported: true, min: 0, max: 1, default: 1 },
          topK: { supported: false },
          frequencyPenalty: { supported: true, min: -2, max: 2, default: 0 },
          presencePenalty: { supported: true, min: -2, max: 2, default: 0 },
          seed: { supported: false },
          stopSequences: { supported: true },
        },
        availableExtensions: [],
      },
    };
  }
}

// --- OpenAI Wire Types ---

interface OpenAIChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
