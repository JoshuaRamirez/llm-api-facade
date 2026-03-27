import { type CompletionProvider, type ModelIdentity, type ModelCapabilities } from "../types/index.js";

/**
 * Manages registered completion providers and routes model lookups.
 */
export class ProviderRegistry {
  private providers: Map<string, CompletionProvider> = new Map();

  register(provider: CompletionProvider): void {
    console.error(`[registry] Registering provider: ${provider.providerId}`);
    this.providers.set(provider.providerId, provider);
  }

  async resolveModel(modelId: string): Promise<{
    provider: CompletionProvider;
    identity: ModelIdentity;
    capabilities: ModelCapabilities;
  } | null> {
    for (const provider of this.providers.values()) {
      const result = await provider.resolveModel(modelId);
      if (result) {
        return { provider, ...result };
      }
    }
    return null;
  }

  listProviders(): string[] {
    return [...this.providers.keys()];
  }
}
