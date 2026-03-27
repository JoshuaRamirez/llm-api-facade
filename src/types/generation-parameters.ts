import { type ReasoningEffort } from "./reasoning-effort.js";

/**
 * Generation parameters grouped by topological region.
 * NOT a flat bag. (TypeSpecification Section 4.1)
 */

export interface SamplingParameters {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
}

export interface ConstraintParameters {
  readonly maxTokens?: number | undefined;
  readonly stopSequences?: string[] | undefined;
}

export interface BehavioralParameters {
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
}

export interface MetaParameters {
  readonly seed?: number | undefined;
  readonly reasoningEffort?: ReasoningEffort | undefined;
}

export interface GenerationParameters {
  readonly sampling?: SamplingParameters | undefined;
  readonly constraints?: ConstraintParameters | undefined;
  readonly behavioral?: BehavioralParameters | undefined;
  readonly meta?: MetaParameters | undefined;
}
