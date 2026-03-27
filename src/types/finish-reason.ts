/**
 * Why a generation process terminated.
 * Normalized from provider-specific vocabularies.
 * (TypeSpecification Section 2.2)
 */
export const FinishReason = {
  Stop: "stop",
  Length: "length",
  ContentFilter: "content_filter",
  ToolUse: "tool_use",
  Error: "error",
} as const;

export type FinishReason = (typeof FinishReason)[keyof typeof FinishReason];
