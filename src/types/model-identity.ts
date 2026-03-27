/**
 * Unique identity of a model within the facade.
 * Composite key: (provider, modelId). (TypeSpecification Section 3.1)
 */
export interface ModelIdentity {
  readonly provider: string;
  readonly modelId: string;
}

const WHITESPACE_OR_CONTROL = /\s|\p{Cc}/u;

export function createModelIdentity(provider: string, modelId: string): ModelIdentity {
  if (!provider || WHITESPACE_OR_CONTROL.test(provider)) {
    throw new Error("ModelIdentity: provider must be non-empty and must not contain whitespace or control characters");
  }
  if (!modelId || WHITESPACE_OR_CONTROL.test(modelId)) {
    throw new Error("ModelIdentity: modelId must be non-empty and must not contain whitespace or control characters");
  }
  return Object.freeze({ provider, modelId });
}
