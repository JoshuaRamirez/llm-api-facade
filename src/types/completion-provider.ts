import { type ModelIdentity } from "./model-identity.js";
import { type ModelCapabilities } from "./model-capabilities.js";
import { type NormalizedRequest } from "./normalized-request.js";
import { type CompletionResponse } from "./completion-response.js";
import { type CompletionChunk } from "./completion-chunk.js";

/**
 * The seam interface. Adapters implement this.
 * (TypeSpecification Section 6)
 *
 * Implementors translate NormalizedRequest to provider wire format,
 * execute, and translate back. They must never expose provider types
 * above the seam.
 */
export interface CompletionProvider {
  /** Unique provider name (e.g., "openai", "anthropic", "ollama"). */
  readonly providerId: string;

  /** Resolve a model identity and its capabilities. */
  resolveModel(modelId: string): Promise<{ identity: ModelIdentity; capabilities: ModelCapabilities } | null>;

  /** Execute a batch completion request. */
  complete(request: NormalizedRequest): Promise<CompletionResponse>;

  /** Execute a streaming completion request. Yields chunks in order. */
  completeStream(request: NormalizedRequest): AsyncIterable<CompletionChunk>;
}
