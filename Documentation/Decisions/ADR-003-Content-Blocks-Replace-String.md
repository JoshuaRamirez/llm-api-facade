# ADR-003: Content Blocks Replace String as Facade Content Type

| Field  | Value      |
|--------|------------|
| ID     | ADR-003    |
| Date   | 2026-03-27 |
| Status | Accepted   |

## Context

The initial domain model (v1, 2026-03-26) defined message content and completion content as plain strings. This was a deliberate simplification — the lowest common denominator across all providers.

Cross-validation of the ontological taxonomy against all 11 vendor inventories revealed that this commitment is not sustainable:

- **Anthropic** always returns content as an array of typed blocks (`text`, `tool_use`, `thinking`, `redacted_thinking`), never a bare string. Flattening to string destroys tool invocation data and thinking blocks required for multi-turn.
- **Google Gemini** uses a parts-based content model with 7+ part types (`text`, `inlineData`, `functionCall`, `functionResponse`, `executableCode`, `codeExecutionResult`, `thought`). Content is structurally never a string.
- **OpenAI** returns content as a string but places tool calls in a separate `tool_calls` field on the assistant message — a different structural representation of the same concept.
- **Tool calling** (classified as Extended Tier 1) is impossible without non-text content blocks. A model that wants to invoke a tool must express that in the response content. A string cannot carry tool invocation structure.
- **Extended thinking** (reclassified to Extended Tier 2) produces thinking blocks that must be preserved as opaque passthrough in multi-turn conversations. A string cannot carry cryptographic signatures.

The string content model forces the facade to either (a) exclude tool calling and thinking entirely, or (b) invent side-channel fields that duplicate what content blocks already express. Both are worse than adopting blocks.

## Decision

Replace `string` with `ContentBlock[]` as the facade's content type for both messages and completions. ContentBlock is a discriminated union with five variants:

| Variant | Tier | Purpose |
|---------|------|---------|
| `TextBlock` | Core | Plain text content |
| `ToolUseBlock` | Extended (Tier 1) | Model requesting tool execution |
| `ToolResultBlock` | Extended (Tier 1) | Caller providing tool execution results |
| `ThinkingBlock` | Extended (Tier 2) | Model reasoning trace (opaque passthrough) |
| `ImageBlock` | Extended (Tier 2) | Visual content input |

A bare string is accepted as shorthand for `[TextBlock { text: "..." }]` at API boundaries. Internally, content is always `ContentBlock[]`.

## Consequences

- The facade can now participate in tool-calling workflows and multi-turn reasoning without side channels.
- Every type that references content changes: Message, CompletionResponse, CompletionChunk (delta becomes ContentBlockDelta), session state.
- Streaming becomes structurally richer — deltas are typed (TextDelta, ToolUseDelta, ThinkingDelta) rather than plain string fragments.
- The string shorthand preserves backward compatibility for simple text-only use cases.
- Integration plane adapters must map between provider-specific block representations and the facade's five-variant union. This is a seam translation concern.
- The MCP tool schemas grow more complex. `complete` output is now a block array, not a string field.
- The `provider_extensions` bag becomes less necessary for tool calling and thinking, since these now have first-class representation.

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Keep string, add side-channel fields for tools/thinking | Duplicates what content blocks already express. Creates two parallel representations of the same data. Every consumer must know about both. |
| Keep string, exclude tool calling and thinking from facade | Excludes the two capabilities driving the most industry investment. The facade becomes irrelevant for agentic workflows. |
| Adopt provider-native block schemas (Anthropic blocks, Gemini parts) | Violates Provider Opacity (Principle #1). The facade's block types must be its own, with adapters translating at the seam. |
| Union type (string or blocks) with no canonical form | Ambiguity — every consumer must handle both forms everywhere, not just at API boundaries. The canonical form must be blocks. |
