import { type ContentBlock } from "./content-block.js";
import { type FinishReason } from "./finish-reason.js";
import { type Usage } from "./usage.js";

/**
 * Complete result of a non-streaming generation request.
 * Immutable value object. (TypeSpecification Section 1.3)
 */
export interface CompletionResponse {
  readonly completionId: string;
  readonly model: string;
  readonly content: ContentBlock[];
  readonly finishReason: FinishReason;
  readonly usage: Usage;
  readonly extensionData?: Readonly<Record<string, unknown>> | undefined;
}
