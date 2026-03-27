/**
 * Discoverable capabilities and constraints for a specific model registration.
 * (TypeSpecification Section 3.2)
 */

export interface ParameterDescriptor {
  readonly supported: boolean;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly default?: number | undefined;
}

export interface ParameterSupport {
  readonly temperature: ParameterDescriptor;
  readonly topP: ParameterDescriptor;
  readonly topK: ParameterDescriptor;
  readonly frequencyPenalty: ParameterDescriptor;
  readonly presencePenalty: ParameterDescriptor;
  readonly seed: ParameterDescriptor;
  readonly stopSequences: ParameterDescriptor;
}

export interface ModelReadiness {
  readonly state: "available" | "loading" | "unloading" | "not_loaded" | "unavailable";
  readonly estimatedReadySeconds?: number | undefined;
}

export interface ExtensionDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown> | undefined;
  readonly responseSchema?: Record<string, unknown> | undefined;
}

export interface ModelCapabilities {
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly supportsStreaming: boolean;
  readonly supportsSystemMessage: boolean;
  readonly supportsToolCalling: boolean;
  readonly supportsThinking: boolean;
  readonly supportsVision: boolean;
  readonly requiresAlternation: boolean;
  readonly modelReadiness: ModelReadiness;
  readonly supportedParameters: ParameterSupport;
  readonly availableExtensions: ExtensionDescriptor[];
}
