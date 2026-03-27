import { type Message, type CompletionResponse, type CompletionChunk, type GenerationParameters, FacadeError } from "../types/index.js";
import { type NormalizedRequest } from "../types/normalized-request.js";
import { ProviderRegistry } from "./provider-registry.js";

/**
 * The facade core. Validates, normalizes, dispatches, translates.
 * (DomainModel Section 2.1 — Request Lifecycle)
 */
export class FacadeCore {
  private registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  async complete(
    modelId: string,
    messages: readonly Message[],
    parameters: GenerationParameters = {},
    extensions?: Record<string, unknown>,
  ): Promise<CompletionResponse> {
    const correlationId = generateCorrelationId();
    console.error(`[facade] complete: model=${modelId} messages=${messages.length} correlationId=${correlationId}`);

    const resolved = await this.registry.resolveModel(modelId);
    if (!resolved) {
      throw new FacadeError(
        "precondition.model_not_found",
        "MODEL_NOT_FOUND",
        `No model registered with identifier '${modelId}'`,
        correlationId,
        false,
      );
    }

    // Check model readiness
    if (resolved.capabilities.modelReadiness.state !== "available") {
      throw new FacadeError(
        "precondition.model_not_ready",
        "MODEL_NOT_READY",
        `Model '${modelId}' is ${resolved.capabilities.modelReadiness.state}`,
        correlationId,
        true,
      );
    }

    if (messages.length === 0) {
      throw new FacadeError(
        "precondition.validation_error",
        "EMPTY_MESSAGES",
        "Messages array must contain at least one message",
        correlationId,
        false,
      );
    }

    const request: NormalizedRequest = {
      model: resolved.identity,
      messages: Object.freeze([...messages]),
      parameters,
      stream: false,
      extensions,
    };

    console.error(`[facade] dispatching to provider: ${resolved.provider.providerId}`);
    const response = await resolved.provider.complete(request);
    console.error(`[facade] complete: finishReason=${response.finishReason} tokens=${response.usage.inputTokens}+${response.usage.outputTokens}`);
    return response;
  }

  async *completeStream(
    modelId: string,
    messages: readonly Message[],
    parameters: GenerationParameters = {},
    extensions?: Record<string, unknown>,
  ): AsyncIterable<CompletionChunk> {
    const correlationId = generateCorrelationId();
    console.error(`[facade] stream_complete: model=${modelId} messages=${messages.length} correlationId=${correlationId}`);

    const resolved = await this.registry.resolveModel(modelId);
    if (!resolved) {
      throw new FacadeError(
        "precondition.model_not_found",
        "MODEL_NOT_FOUND",
        `No model registered with identifier '${modelId}'`,
        correlationId,
        false,
      );
    }

    if (resolved.capabilities.modelReadiness.state !== "available") {
      throw new FacadeError(
        "precondition.model_not_ready",
        "MODEL_NOT_READY",
        `Model '${modelId}' is ${resolved.capabilities.modelReadiness.state}`,
        correlationId,
        true,
      );
    }

    if (!resolved.capabilities.supportsStreaming) {
      throw new FacadeError(
        "precondition.validation_error",
        "STREAMING_NOT_SUPPORTED",
        `Model '${modelId}' does not support streaming`,
        correlationId,
        false,
      );
    }

    if (messages.length === 0) {
      throw new FacadeError(
        "precondition.validation_error",
        "EMPTY_MESSAGES",
        "Messages array must contain at least one message",
        correlationId,
        false,
      );
    }

    const request: NormalizedRequest = {
      model: resolved.identity,
      messages: Object.freeze([...messages]),
      parameters,
      stream: true,
      extensions,
    };

    console.error(`[facade] dispatching stream to provider: ${resolved.provider.providerId}`);
    yield* resolved.provider.completeStream(request);
  }
}

function generateCorrelationId(): string {
  return `cpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
