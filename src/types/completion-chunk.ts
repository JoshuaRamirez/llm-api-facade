import { type FinishReason } from "./finish-reason.js";
import { type Usage } from "./usage.js";

/**
 * Delta types for streaming content blocks.
 * (TypeSpecification Section 1.4)
 */
export interface TextDelta {
  readonly type: "text_delta";
  readonly text: string;
}

export interface ToolUseDelta {
  readonly type: "tool_use_delta";
  readonly toolUseId?: string | undefined;
  readonly name?: string | undefined;
  readonly inputFragment?: string | undefined;
}

export interface ThinkingDelta {
  readonly type: "thinking_delta";
  readonly thinking?: string | undefined;
  readonly signature?: string | undefined;
}

export type ContentBlockDelta = TextDelta | ToolUseDelta | ThinkingDelta;

/**
 * A single incremental piece of a streaming generation response.
 * (TypeSpecification Section 1.4)
 */
export interface CompletionChunk {
  readonly completionId: string;
  readonly chunkIndex: number;
  readonly blockIndex: number;
  readonly delta: ContentBlockDelta;
  readonly finishReason?: FinishReason | undefined;
  readonly usage?: Usage | undefined;
}
