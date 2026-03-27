import { type Role } from "./role.js";
import { type ContentBlock, normalizeContent, validateContentBlock } from "./content-block.js";

/**
 * A single unit of conversational content, tagged with a functional role.
 * Immutable value object. (TypeSpecification Section 1.1)
 */
export interface Message {
  readonly role: Role;
  readonly content: readonly ContentBlock[];
  readonly toolCallId?: string | undefined;
}

/**
 * Create a validated Message. Accepts string content as convenience shorthand.
 * Throws on invariant violation.
 */
export function createMessage(
  role: Role,
  content: string | ContentBlock[],
  toolCallId?: string,
): Message {
  const blocks = normalizeContent(content);

  // MSG-1: content must contain at least one element
  if (blocks.length === 0) {
    throw new Error("Message: content must contain at least one element");
  }

  // MSG-2: when role is tool, toolCallId must be non-null and non-empty
  if (role === "tool") {
    if (!toolCallId) {
      throw new Error("Message: when role is 'tool', toolCallId must be non-empty");
    }
  }

  // MSG-3: when role is not tool, toolCallId must be null
  if (role !== "tool" && toolCallId !== undefined) {
    throw new Error("Message: when role is not 'tool', toolCallId must not be set");
  }

  for (const block of blocks) {
    validateContentBlock(block);
  }

  return Object.freeze({ role, content: Object.freeze(blocks), toolCallId });
}
