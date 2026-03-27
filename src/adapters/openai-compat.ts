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
    // Query the provider's model list to check availability
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        console.log(`[${this.providerId}] models endpoint returned ${response.status}`);
        return null;
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      const model = data.data.find(m => m.id === modelId);

      if (!model) {
        // Try with default model
        if (this.defaultModel && modelId === this.defaultModel) {
          return this.buildModelResult(modelId);
        }
        return null;
      }

      return this.buildModelResult(modelId);
    } catch (err) {
      console.log(`[${this.providerId}] resolveModel error: ${err}`);
      // Fallback: assume the model exists if we can't query
      return this.buildModelResult(modelId);
    }
  }

  async complete(request: NormalizedRequest): Promise<CompletionResponse> {
    const wireRequest = this.translateRequest(request);
    console.log(`[${this.providerId}] POST /v1/chat/completions model=${wireRequest.model}`);

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(wireRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.log(`[${this.providerId}] error ${response.status}: ${errorBody}`);
      throw this.translateError(response.status, errorBody, request.model.modelId);
    }

    const data = await response.json() as OpenAIChatCompletion;
    return this.translateResponse(data);
  }

  async *completeStream(request: NormalizedRequest): AsyncIterable<CompletionChunk> {
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
      throw new FacadeError("system.provider_error", "No response body for stream", "stream", true);
    }

    const completionId = `cpl_${Date.now().toString(36)}`;
    let chunkIndex = 0;

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
          if (payload === "[DONE]") return;

          const chunk = JSON.parse(payload) as OpenAIStreamChunk;
          const choice = chunk.choices[0];
          if (!choice) continue;

          const delta = choice.delta;
          const finishReason = choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined;

          // Text content delta
          if (delta.content !== null && delta.content !== undefined) {
            yield {
              completionId,
              chunkIndex: chunkIndex++,
              blockIndex: 0,
              delta: { type: "text_delta" as const, text: delta.content },
              finishReason,
              usage: chunk.usage ? createUsage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens, false) : undefined,
            };
          } else if (finishReason) {
            // Final chunk with no content
            yield {
              completionId,
              chunkIndex: chunkIndex++,
              blockIndex: 0,
              delta: { type: "text_delta" as const, text: "" },
              finishReason,
              usage: chunk.usage ? createUsage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens, false) : undefined,
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // --- Translation: Facade → Wire ---

  private translateRequest(request: NormalizedRequest): Record<string, unknown> {
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: this.contentToWire(msg.content),
      ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
    }));

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

    return wire;
  }

  private contentToWire(content: readonly ContentBlock[]): string | unknown[] {
    // Optimization: if content is a single TextBlock, send as string
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
        default: return { type: "text", text: `[${block.type} block]` };
      }
    });
  }

  // --- Translation: Wire → Facade ---

  private translateResponse(data: OpenAIChatCompletion): CompletionResponse {
    const choice = data.choices[0];
    if (!choice) {
      throw new FacadeError("system.provider_error", "No choices in response", "translate", true);
    }

    const content: ContentBlock[] = [];

    // Text content
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    // Tool calls → ToolUseBlock
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool_use",
          toolUseId: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
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
      case "tool": return FinishReason.ToolUse; // llama.cpp uses "tool" singular
      default: return FinishReason.Stop;
    }
  }

  private translateError(status: number, body: string, modelId: string): FacadeError {
    const correlationId = `err_${Date.now().toString(36)}`;
    switch (status) {
      case 400: return new FacadeError("precondition.validation_error", body, correlationId, false);
      case 401: return new FacadeError("precondition.authentication", "Invalid credentials", correlationId, false);
      case 403: return new FacadeError("precondition.permission", "Insufficient access", correlationId, false);
      case 404: return new FacadeError("precondition.model_not_found", `Model '${modelId}' not found`, correlationId, false);
      case 429: return new FacadeError("capacity.rate_limited", "Rate limited", correlationId, true);
      case 503: return new FacadeError("capacity.overloaded", "Service overloaded", correlationId, true);
      default: return new FacadeError("system.provider_error", `HTTP ${status}: ${body}`, correlationId, true);
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
        supportsToolCalling: false, // conservative default
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

// --- OpenAI Wire Types (subset needed for translation) ---

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
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
