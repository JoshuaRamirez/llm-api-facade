/**
 * Discriminated union of typed content blocks.
 * The fundamental content primitive — replaces bare strings.
 * (TypeSpecification Section 1.2, ADR-003)
 */

export interface TextBlock {
  readonly type: "text";
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: "tool_use";
  readonly toolUseId: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ToolResultBlock {
  readonly type: "tool_result";
  readonly toolUseId: string;
  readonly content: ContentBlock[];
}

export interface ThinkingBlock {
  readonly type: "thinking";
  readonly thinking: string;
  readonly signature: string;
}

export interface ImageBlock {
  readonly type: "image";
  readonly mediaType: string;
  readonly data?: string | undefined;
  readonly sourceUrl?: string | undefined;
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | ImageBlock;

/** Convenience: wrap a bare string into a single TextBlock array. */
export function normalizeContent(content: string | ContentBlock[]): ContentBlock[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

/** Validate a ContentBlock against its invariants. Throws on violation. */
export function validateContentBlock(block: ContentBlock): void {
  switch (block.type) {
    case "text":
      if (typeof block.text !== "string") {
        throw new Error("TextBlock: text field must be a string");
      }
      break;

    case "tool_use":
      if (!block.toolUseId) throw new Error("ToolUseBlock: toolUseId must be non-empty");
      if (!block.name) throw new Error("ToolUseBlock: name must be non-empty");
      if (block.input === null || block.input === undefined) {
        throw new Error("ToolUseBlock: input must be a valid object");
      }
      break;

    case "tool_result":
      if (!block.toolUseId) throw new Error("ToolResultBlock: toolUseId must be non-empty");
      if (!block.content.length) throw new Error("ToolResultBlock: content must contain at least one element");
      for (const inner of block.content) {
        if (inner.type === "tool_use" || inner.type === "tool_result") {
          throw new Error("ToolResultBlock: content must not contain ToolUseBlock or ToolResultBlock (no recursive nesting)");
        }
        validateContentBlock(inner);
      }
      break;

    case "thinking":
      if (!block.thinking) throw new Error("ThinkingBlock: thinking must be non-empty");
      if (!block.signature) throw new Error("ThinkingBlock: signature must be non-empty");
      break;

    case "image":
      if (!block.mediaType.startsWith("image/")) {
        throw new Error("ImageBlock: mediaType must match image/*");
      }
      if (block.data && block.sourceUrl) {
        throw new Error("ImageBlock: exactly one of data or sourceUrl must be present, not both");
      }
      if (!block.data && !block.sourceUrl) {
        throw new Error("ImageBlock: exactly one of data or sourceUrl must be present");
      }
      break;
  }
}
