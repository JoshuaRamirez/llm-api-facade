/**
 * Unique identity of a model within the facade.
 * Composite key: (provider, modelId). (TypeSpecification Section 3.1)
 */
export interface ModelIdentity {
  readonly provider: string;
  readonly modelId: string;
}

export function createModelIdentity(provider: string, modelId: string): ModelIdentity {
  if (!provider.trim()) throw new Error("ModelIdentity: provider must be non-empty");
  if (!modelId.trim()) throw new Error("ModelIdentity: modelId must be non-empty");
  return Object.freeze({ provider, modelId });
}
