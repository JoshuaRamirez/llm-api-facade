import { type Message } from "./message.js";
import { type ModelIdentity } from "./model-identity.js";
import { type GenerationParameters } from "./generation-parameters.js";

/**
 * The canonical request type that crosses the seam.
 * (TypeSpecification Section 4.5)
 */
export interface NormalizedRequest {
  readonly model: ModelIdentity;
  readonly messages: readonly Message[];
  readonly parameters: GenerationParameters;
  readonly stream: boolean;
  readonly extensions?: Readonly<Record<string, unknown>> | undefined;
}
