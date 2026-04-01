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
 * Cohere v2 Chat API adapter.
 * Handles: flat response (no choices array), uppercase finish reasons,
 * required stream parameter, named SSE events, content block arrays,
 * tool role with tool_call_id.
 * (Vendors/Mistral-Cohere-xAI.md Cohere section)
 */

interface CohereConfig {
  apiKey: string;
}

export class CohereAdapter implements CompletionProvider {
  readonly providerId = "cohere";
  private apiKey: string;

  constructor(config: CohereConfig) {
    this.apiKey = config.apiKey;
  }

  async resolveModel(modelId: string): Promise<{ identity: ModelIdentity; capabilities: ModelCapabilities } | null> {
    const knownPrefixes = ["command-", "c4ai-"];
    if (!knownPrefixes.some(p => modelId.startsWith(p))) {
      return null;
    }

    return {
      identity: createModelIdentity(this.providerId, modelId),
      capabilities: {
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsSystemMessage: true,
        supportsToolCalling: true,
        supportsThinking: modelId.includes("reasoning"),
        supportsVision: modelId.includes("vision"),
        requiresAlternation: false,
        modelReadiness: { state: "available" },
        supportedParameters: {
          temperature: { supported: true, min: 0, max: 5, default: 0.3 },
          topP: { supported: true, min: 0.01, max: 0.99, default: 0.75 },
          topK: { supported: true, min: 0, max: 500, default: 0 },
          frequencyPenalty: { supported: true, min: 0, max: 1, default: 0 },
          presencePenalty: { supported: true, min: 0, max: 1, default: 0 },
          seed: { supported: true },
          stopSequences: { supported: true },
        },
        availableExtensions: [],
      },
    };
  }

  async complete(request: NormalizedRequest): Promise<CompletionResponse> {
    const wireRequest = this.translateRequest(request, false);
    console.error(`[cohere] POST /v2/chat model=${wireRequest.model as string}`);

    const response = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[cohere] error ${response.status}`);
      throw this.translateError(response.status, errorBody);
    }

    const data = await response.json() as CohereResponse;
    return this.translateResponse(data);
  }

  async *completeStream(request: NormalizedRequest): AsyncIterable<CompletionChunk> {
    const wireRequest = this.translateRequest(request, true);
    const correlationId = `str_${Date.now().toString(36)}`;

    const response = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: this.buildHeaders(),
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
    let inputTokens = 0;
    let outputTokens = 0;
    let finalFinishReason: FinishReason | undefined;
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

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          let event: CohereStreamEvent;
          try {
            event = JSON.parse(payload) as CohereStreamEvent;
          } catch {
            throw new FacadeError("process.stream_interrupted", "MALFORMED_STREAM_CHUNK", "Failed to parse Cohere SSE event", correlationId, true);
          }

          switch (event.type) {
            case "message-start": {
              const e = event as CohereMessageStart;
              completionId = e.id ?? completionId;
              break;
            }

            case "content-delta": {
              const e = event as CohereContentDelta;
              const text = e.delta?.message?.content?.text ?? "";
              if (text) {
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: 0,
                  delta: { type: "text_delta" as const, text },
                };
              }
              break;
            }

            case "tool-call-start": {
              const e = event as CohereToolCallStart;
              yield {
                completionId,
                chunkIndex: chunkIndex++,
                blockIndex: 1,
                delta: {
                  type: "tool_use_delta" as const,
                  toolUseId: e.delta?.message?.tool_calls?.id,
                  name: e.delta?.message?.tool_calls?.function?.name,
                  inputJsonDelta: "",
                },
              };
              break;
            }

            case "tool-call-delta": {
              const e = event as CohereToolCallDelta;
              yield {
                completionId,
                chunkIndex: chunkIndex++,
                blockIndex: 1,
                delta: {
                  type: "tool_use_delta" as const,
                  inputJsonDelta: e.delta?.message?.tool_calls?.function?.arguments ?? "",
                },
              };
              break;
            }

            case "message-end": {
              const e = event as CohereMessageEnd;
              finalFinishReason = this.mapFinishReason(e.delta?.finish_reason);
              inputTokens = e.delta?.usage?.tokens?.input_tokens ?? 0;
              outputTokens = e.delta?.usage?.tokens?.output_tokens ?? 0;
              break;
            }
          }
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
          finishReason: finalFinishReason ?? FinishReason.Stop,
          usage: createUsage(inputTokens, outputTokens, inputTokens === 0 && outputTokens === 0),
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  // --- Translation: Facade → Cohere Wire ---

  private translateRequest(request: NormalizedRequest, stream: boolean): Record<string, unknown> {
    const messages: Array<Record<string, unknown>> = [];

    for (const msg of request.messages) {
      if (msg.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: this.contentToString(msg.content),
        });
      } else if (msg.role === "assistant") {
        const wireMsg: Record<string, unknown> = { role: "assistant" };
        const textParts: string[] = [];
        const toolCalls: unknown[] = [];

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

        if (textParts.length > 0) {
          wireMsg.content = [{ type: "text", text: textParts.join("") }];
        }
        if (toolCalls.length > 0) {
          wireMsg.tool_calls = toolCalls;
        }
        messages.push(wireMsg);
      } else {
        // system and user
        messages.push({
          role: msg.role,
          content: this.contentToString(msg.content),
        });
      }
    }

    const wire: Record<string, unknown> = {
      model: request.model.modelId,
      messages,
      stream,
    };

    const params = request.parameters;
    if (params.sampling?.temperature !== undefined) wire.temperature = params.sampling.temperature;
    if (params.sampling?.topP !== undefined) wire.p = params.sampling.topP;
    if (params.sampling?.topK !== undefined) wire.k = params.sampling.topK;
    if (params.constraints?.maxTokens !== undefined) wire.max_tokens = params.constraints.maxTokens;
    if (params.constraints?.stopSequences !== undefined) wire.stop_sequences = params.constraints.stopSequences;
    if (params.behavioral?.frequencyPenalty !== undefined) {
      wire.frequency_penalty = Math.min(1, Math.max(0, params.behavioral.frequencyPenalty));
    }
    if (params.behavioral?.presencePenalty !== undefined) {
      wire.presence_penalty = Math.min(1, Math.max(0, params.behavioral.presencePenalty));
    }
    if (params.meta?.seed !== undefined) wire.seed = params.meta.seed;

    // Tools
    if (params.structural?.tools && params.structural.tools.length > 0) {
      wire.tools = params.structural.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description ?? "",
          parameters: t.parameters ?? { type: "object", properties: {} },
        },
      }));
    }

    return wire;
  }

  private contentToString(content: readonly ContentBlock[]): string {
    return content
      .map(b => b.type === "text" ? b.text : `[${b.type}]`)
      .join("");
  }

  // --- Translation: Cohere Wire → Facade ---

  private translateResponse(data: CohereResponse): CompletionResponse {
    const content: ContentBlock[] = [];

    // Text content from message.content array
    if (data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === "text" && block.text) {
          content.push({ type: "text", text: block.text });
        }
      }
    }

    // Tool calls from message.tool_calls
    if (data.message?.tool_calls) {
      for (const tc of data.message.tool_calls) {
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

    return {
      completionId: data.id,
      model: data.message?.role === "assistant" ? "cohere" : "cohere",
      content,
      finishReason: this.mapFinishReason(data.finish_reason),
      usage: createUsage(
        data.usage?.tokens?.input_tokens ?? 0,
        data.usage?.tokens?.output_tokens ?? 0,
        data.usage === undefined,
      ),
    };
  }

  private mapFinishReason(reason: string | undefined): FinishReason {
    switch (reason) {
      case "COMPLETE": return FinishReason.Stop;
      case "STOP_SEQUENCE": return FinishReason.Stop;
      case "MAX_TOKENS": return FinishReason.Length;
      case "TOOL_CALL": return FinishReason.ToolUse;
      case "ERROR": return FinishReason.Error;
      case "TIMEOUT": return FinishReason.Error;
      default:
        if (reason) console.error(`[cohere] unknown finish_reason: '${reason}'`);
        return FinishReason.Stop;
    }
  }

  private translateError(status: number, body: string): FacadeError {
    const correlationId = `err_${Date.now().toString(36)}`;
    switch (status) {
      case 400: return new FacadeError("precondition.validation_error", "INVALID_PARAMS", body, correlationId, false);
      case 401: return new FacadeError("precondition.authentication", "AUTH_FAILED", "Invalid Cohere API key", correlationId, false);
      case 402: return new FacadeError("capacity.quota_exceeded", "QUOTA_EXCEEDED", "Cohere billing limit reached", correlationId, false);
      case 403: return new FacadeError("precondition.permission", "PERMISSION_DENIED", "Forbidden", correlationId, false);
      case 404: return new FacadeError("precondition.model_not_found", "MODEL_NOT_FOUND", "Model not found", correlationId, false);
      case 429: return new FacadeError("capacity.rate_limited", "RATE_LIMITED", "Rate limited", correlationId, true);
      case 498: return new FacadeError("precondition.validation_error", "TOKEN_DENIED", "Deny-listed token detected", correlationId, false);
      case 503: return new FacadeError("capacity.overloaded", "OVERLOADED", "Cohere service unavailable", correlationId, true);
      case 504: return new FacadeError("process.timeout", "TIMEOUT", "Cohere request timed out", correlationId, true);
      default: return new FacadeError("system.provider_error", "PROVIDER_ERROR", `HTTP ${status}`, correlationId, true);
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };
  }
}

// --- Cohere Wire Types ---

interface CohereResponse {
  id: string;
  finish_reason: string;
  message?: {
    role: string;
    content?: Array<{ type: string; text?: string }>;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
    tool_plan?: string;
  };
  usage?: {
    billed_units?: { input_tokens: number; output_tokens: number };
    tokens?: { input_tokens: number; output_tokens: number };
  };
}

interface CohereStreamEvent {
  type: string;
}

interface CohereMessageStart extends CohereStreamEvent {
  id?: string;
}

interface CohereContentDelta extends CohereStreamEvent {
  delta?: { message?: { content?: { text?: string } } };
}

interface CohereToolCallStart extends CohereStreamEvent {
  delta?: { message?: { tool_calls?: { id?: string; function?: { name?: string } } } };
}

interface CohereToolCallDelta extends CohereStreamEvent {
  delta?: { message?: { tool_calls?: { function?: { arguments?: string } } } };
}

interface CohereMessageEnd extends CohereStreamEvent {
  delta?: {
    finish_reason?: string;
    usage?: {
      tokens?: { input_tokens: number; output_tokens: number };
    };
  };
}
