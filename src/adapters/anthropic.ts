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
 * Anthropic Messages API adapter.
 * Handles: system-as-parameter, content block arrays, role alternation,
 * tool results in user messages, named SSE events.
 * (ToolCallingChoreography Section 3.2, Vendors/Anthropic.md)
 */

interface AnthropicConfig {
  apiKey: string;
  apiVersion?: string;
}

export class AnthropicAdapter implements CompletionProvider {
  readonly providerId = "anthropic";
  private apiKey: string;
  private apiVersion: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion ?? "2023-06-01";
  }

  async resolveModel(modelId: string): Promise<{ identity: ModelIdentity; capabilities: ModelCapabilities } | null> {
    // Anthropic model IDs are known; check against known prefixes
    const knownPrefixes = ["claude-opus", "claude-sonnet", "claude-haiku", "claude-3", "claude-4"];
    if (!knownPrefixes.some(p => modelId.startsWith(p))) {
      return null;
    }

    return {
      identity: createModelIdentity(this.providerId, modelId),
      capabilities: {
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsSystemMessage: true,
        supportsToolCalling: true,
        supportsThinking: true,
        supportsVision: true,
        requiresAlternation: true,
        modelReadiness: { state: "available" },
        supportedParameters: {
          temperature: { supported: true, min: 0, max: 1, default: 1 },
          topP: { supported: true, min: 0, max: 1 },
          topK: { supported: true, min: 1 },
          frequencyPenalty: { supported: false },
          presencePenalty: { supported: false },
          seed: { supported: false },
          stopSequences: { supported: true },
        },
        availableExtensions: [],
      },
    };
  }

  async complete(request: NormalizedRequest): Promise<CompletionResponse> {
    const wireRequest = this.translateRequest(request);
    console.error(`[anthropic] POST /v1/messages model=${wireRequest.model as string}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[anthropic] error ${response.status}`);
      throw this.translateError(response.status, errorBody);
    }

    const data = await response.json() as AnthropicResponse;
    return this.translateResponse(data);
  }

  async *completeStream(request: NormalizedRequest): AsyncIterable<CompletionChunk> {
    const wireRequest = { ...this.translateRequest(request), stream: true };
    const correlationId = `str_${Date.now().toString(36)}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    let finishReason: FinishReason | undefined;
    let usageEmitted = false;

    // Accumulator for tool_use input JSON fragments per block index
    const toolInputAccumulators: Map<number, string> = new Map();

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

          // Anthropic uses "event: <type>" + "data: <json>" pairs
          if (trimmed.startsWith("event: ")) continue; // We parse from data lines
          if (!trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          let event: AnthropicStreamEvent;
          try {
            event = JSON.parse(payload) as AnthropicStreamEvent;
          } catch {
            throw new FacadeError("process.stream_interrupted", "MALFORMED_STREAM_CHUNK", "Failed to parse Anthropic SSE event", correlationId, true);
          }

          switch (event.type) {
            case "message_start": {
              const msg = (event as AnthropicMessageStart).message;
              completionId = msg.id;
              inputTokens = msg.usage?.input_tokens ?? 0;
              break;
            }

            case "content_block_start": {
              const e = event as AnthropicContentBlockStart;
              const block = e.content_block;
              if (block.type === "text") {
                // Text block starting — no content yet
              } else if (block.type === "tool_use") {
                toolInputAccumulators.set(e.index, "");
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: e.index,
                  delta: {
                    type: "tool_use_delta" as const,
                    toolUseId: block.id,
                    name: block.name,
                    inputJsonDelta: "",
                  },
                };
              } else if (block.type === "thinking") {
                // Thinking block starting
              }
              break;
            }

            case "content_block_delta": {
              const e = event as AnthropicContentBlockDelta;
              if (e.delta.type === "text_delta") {
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: e.index,
                  delta: { type: "text_delta" as const, text: e.delta.text },
                };
              } else if (e.delta.type === "input_json_delta") {
                const accum = toolInputAccumulators.get(e.index) ?? "";
                toolInputAccumulators.set(e.index, accum + e.delta.partial_json);
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: e.index,
                  delta: {
                    type: "tool_use_delta" as const,
                    inputJsonDelta: e.delta.partial_json,
                  },
                };
              } else if (e.delta.type === "thinking_delta") {
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: e.index,
                  delta: { type: "thinking_delta" as const, thinking: e.delta.thinking },
                };
              }
              break;
            }

            case "content_block_stop":
              // Block closed — no action needed
              break;

            case "message_delta": {
              const e = event as AnthropicMessageDelta;
              finishReason = this.mapStopReason(e.delta.stop_reason);
              outputTokens = e.usage?.output_tokens ?? outputTokens;
              break;
            }

            case "message_stop": {
              // Emit final chunk with usage
              if (!usageEmitted) {
                usageEmitted = true;
                yield {
                  completionId,
                  chunkIndex: chunkIndex++,
                  blockIndex: 0,
                  delta: { type: "text_delta" as const, text: "" },
                  finishReason: finishReason ?? FinishReason.Stop,
                  usage: createUsage(inputTokens, outputTokens, false),
                };
              }
              break;
            }

            case "ping":
            case "error":
              if (event.type === "error") {
                const err = event as AnthropicErrorEvent;
                throw new FacadeError(
                  "process.stream_interrupted",
                  "STREAM_ERROR",
                  `Anthropic stream error: ${err.error?.message ?? "unknown"}`,
                  correlationId,
                  true,
                );
              }
              break;
          }
        }
      }

      // Flush buffer
      if (buffer.trim() && buffer.trim().startsWith("data: ")) {
        // Process remaining line if present
      }

      // Guarantee usage chunk
      if (!usageEmitted && chunkIndex > 0) {
        yield {
          completionId,
          chunkIndex,
          blockIndex: 0,
          delta: { type: "text_delta" as const, text: "" },
          finishReason: finishReason ?? FinishReason.Stop,
          usage: createUsage(inputTokens, outputTokens, outputTokens === 0),
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  // --- Translation: Facade → Anthropic Wire ---

  private translateRequest(request: NormalizedRequest): Record<string, unknown> {
    const wire: Record<string, unknown> = {
      model: request.model.modelId,
      max_tokens: request.parameters.constraints?.maxTokens ?? 4096,
    };

    // Extract system messages → top-level system parameter
    const systemMessages: string[] = [];
    const conversationMessages: Array<{ role: string; content: unknown }> = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        const text = msg.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map(b => b.text)
          .join("\n");
        if (text) systemMessages.push(text);
      } else if (msg.role === "tool") {
        // Facade tool messages → Anthropic user messages with tool_result blocks
        // Must be merged with previous user message if one exists, or create new user message
        const toolResult = {
          type: "tool_result",
          tool_use_id: msg.toolCallId,
          content: this.contentToWireString(msg.content),
        };
        // Check if previous message is a user message we can append to
        const prev = conversationMessages[conversationMessages.length - 1];
        if (prev && prev.role === "user" && Array.isArray(prev.content)) {
          (prev.content as unknown[]).push(toolResult);
        } else {
          conversationMessages.push({ role: "user", content: [toolResult] });
        }
      } else if (msg.role === "assistant") {
        conversationMessages.push({
          role: "assistant",
          content: this.contentToAnthropicBlocks(msg.content),
        });
      } else {
        // user messages
        conversationMessages.push({
          role: "user",
          content: this.contentToAnthropicBlocks(msg.content),
        });
      }
    }

    if (systemMessages.length > 0) {
      wire.system = systemMessages.join("\n\n");
    }

    wire.messages = conversationMessages;

    // Sampling parameters
    const params = request.parameters;
    if (params.sampling?.temperature !== undefined) wire.temperature = params.sampling.temperature;
    if (params.sampling?.topP !== undefined) wire.top_p = params.sampling.topP;
    if (params.sampling?.topK !== undefined) wire.top_k = params.sampling.topK;
    if (params.constraints?.stopSequences !== undefined) wire.stop_sequences = params.constraints.stopSequences;

    // Tools
    if (params.structural?.tools && params.structural.tools.length > 0) {
      wire.tools = params.structural.tools.map(t => ({
        name: t.name,
        description: t.description ?? "",
        input_schema: t.parameters ?? { type: "object", properties: {} },
      }));
    }

    return wire;
  }

  private contentToAnthropicBlocks(content: readonly ContentBlock[]): unknown[] {
    return content.map(block => {
      switch (block.type) {
        case "text":
          return { type: "text", text: block.text };
        case "tool_use":
          return { type: "tool_use", id: block.toolUseId, name: block.name, input: block.input };
        case "tool_result":
          return { type: "tool_result", tool_use_id: block.toolUseId, content: this.contentToWireString(block.content) };
        case "thinking":
          return { type: "thinking", thinking: block.thinking, signature: block.signature };
        case "image":
          if (block.data) {
            return { type: "image", source: { type: "base64", media_type: block.mediaType, data: block.data } };
          }
          return { type: "image", source: { type: "url", url: block.sourceUrl } };
      }
    });
  }

  private contentToWireString(content: readonly ContentBlock[]): string {
    return content
      .map(b => b.type === "text" ? b.text : `[${b.type}]`)
      .join("");
  }

  // --- Translation: Anthropic Wire → Facade ---

  private translateResponse(data: AnthropicResponse): CompletionResponse {
    const content: ContentBlock[] = [];

    for (const block of data.content) {
      switch (block.type) {
        case "text":
          content.push({ type: "text", text: block.text });
          break;
        case "tool_use":
          content.push({
            type: "tool_use",
            toolUseId: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
          break;
        case "thinking":
          content.push({
            type: "thinking",
            thinking: block.thinking,
            signature: block.signature,
          });
          break;
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "" });
    }

    return {
      completionId: data.id,
      model: data.model,
      content,
      finishReason: this.mapStopReason(data.stop_reason),
      usage: createUsage(
        data.usage.input_tokens,
        data.usage.output_tokens,
        false,
      ),
    };
  }

  private mapStopReason(reason: string | null): FinishReason {
    switch (reason) {
      case "end_turn": return FinishReason.Stop;
      case "stop_sequence": return FinishReason.Stop;
      case "max_tokens": return FinishReason.Length;
      case "tool_use": return FinishReason.ToolUse;
      default:
        if (reason) console.error(`[anthropic] unknown stop_reason: '${reason}'`);
        return FinishReason.Stop;
    }
  }

  private translateError(status: number, body: string): FacadeError {
    const correlationId = `err_${Date.now().toString(36)}`;
    switch (status) {
      case 400: return new FacadeError("precondition.validation_error", "INVALID_PARAMS", body, correlationId, false);
      case 401: return new FacadeError("precondition.authentication", "AUTH_FAILED", "Invalid Anthropic API key", correlationId, false);
      case 403: return new FacadeError("precondition.permission", "PERMISSION_DENIED", "Insufficient access", correlationId, false);
      case 404: return new FacadeError("precondition.model_not_found", "MODEL_NOT_FOUND", "Model not found", correlationId, false);
      case 429: return new FacadeError("capacity.rate_limited", "RATE_LIMITED", "Rate limited", correlationId, true);
      case 529: return new FacadeError("capacity.overloaded", "OVERLOADED", "Anthropic API overloaded", correlationId, true);
      default: return new FacadeError("system.provider_error", "PROVIDER_ERROR", `HTTP ${status}`, correlationId, true);
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": this.apiVersion,
    };
  }
}

// --- Anthropic Wire Types ---

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
    id: string;
    name: string;
    input: unknown;
    thinking: string;
    signature: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
}

interface AnthropicMessageStart extends AnthropicStreamEvent {
  message: {
    id: string;
    usage?: { input_tokens: number };
  };
}

interface AnthropicContentBlockStart extends AnthropicStreamEvent {
  index: number;
  content_block: {
    type: string;
    id: string;
    name: string;
    text: string;
  };
}

interface AnthropicContentBlockDelta extends AnthropicStreamEvent {
  index: number;
  delta: {
    type: string;
    text: string;
    partial_json: string;
    thinking: string;
  };
}

interface AnthropicMessageDelta extends AnthropicStreamEvent {
  delta: {
    stop_reason: string | null;
  };
  usage?: {
    output_tokens: number;
  };
}

interface AnthropicErrorEvent extends AnthropicStreamEvent {
  error?: { type: string; message: string };
}
