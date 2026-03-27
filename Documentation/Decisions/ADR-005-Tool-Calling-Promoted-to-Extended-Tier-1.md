# ADR-005: Tool Calling Promoted from Excluded to Extended Tier 1

| Field  | Value      |
|--------|------------|
| ID     | ADR-005    |
| Date   | 2026-03-27 |
| Status | Accepted   |

## Context

The initial domain model (v1, 2026-03-26) explicitly excluded tool/function calling from the facade, listing it under "Integration-Plane Concerns" with the rationale: "Schema formats diverge completely (OpenAI vs Anthropic vs Gemini)."

Cross-validation revealed two problems with this exclusion:

**1. Tool calling is the mechanism for agentic workflows.** The primary growth vector in the LLM industry is agent-based systems where models invoke tools, receive results, and continue reasoning. A facade that excludes tool calling cannot participate in this ecosystem. It becomes a text-in/text-out pipe in a world that has moved beyond text-in/text-out.

**2. Tool calling is an ecosystem of interrelated concepts, not a single feature.** The cross-validation identified 7+ concepts that must move together:
- `tools` parameter (tool definitions on the request)
- `tool_choice` parameter (control over tool invocation)
- `tool` role (messages carrying tool results)
- `ToolUseBlock` (model requesting tool execution, in response content)
- `ToolResultBlock` (caller providing results, in request content)
- `tool_use` finish reason (model wants tools executed before continuing)
- `tool_call_id` / `tool_use_id` linkage (correlating results to invocations)

These are inseparable. You cannot have tool calling without the tool role, without tool content blocks, without the tool_use finish reason. The taxonomy's original position — tool calling below seam, tool role below seam, but no alternative mechanism above seam — was an internal inconsistency.

**3. Schema divergence is a seam concern, not an exclusion rationale.** The schemas do diverge (OpenAI uses `functions` with JSON Schema, Anthropic uses `input_schema`, Gemini uses OpenAPI subset). But the facade already normalizes divergent schemas for every other concept (parameter names, response shapes, finish reasons, error codes). Tool definition schemas are no different — the facade defines its own `ToolDefinition` shape and adapters translate at the seam.

## Decision

Promote tool calling from Excluded to Extended (Tier 1, capability-gated).

The facade exposes:
- `tools`: array of `ToolDefinition` on `complete`/`stream_complete` requests
- `tool_choice`: enum (`auto`, `any`, `required`, `none`) controlling invocation behavior
- `tool` role: valid in messages when tool calling is active
- `ToolUseBlock`: content block variant in completion responses
- `ToolResultBlock`: content block variant in request messages
- `tool_use` finish reason: signals model wants tool execution
- `tool_call_id` / `tool_use_id`: correlation identifiers linking results to invocations

The facade does NOT normalize:
- Provider-specific tool schema extensions (strict mode, VALIDATED mode)
- Parallel vs. sequential tool calling behavior (provider-dependent)
- Provider-built-in tools (Google Search, code execution, computer_use) — these remain Below-Seam

## Consequences

- The facade supports agentic multi-turn workflows: prompt → tool_use response → tool results → continued generation.
- `supports_tool_calling` is a capability flag. Models without tool support reject tool definitions at validation time.
- The `ToolDefinition` schema is facade-owned: `{ name, description, parameters }` where `parameters` follows JSON Schema. Adapters translate to provider-native schemas.
- `tool_choice` vocabulary is normalized. The mapping (`any` ↔ `required`, `none` ↔ `none`, `auto` ↔ `AUTO`) is an adapter concern.
- Streaming with tool calling produces `ToolUseDelta` content block deltas, requiring consumers to handle interleaved text and tool-use deltas.
- Three items previously excluded are now Extended: tool calling (this ADR), vision (ImageBlock in ADR-003), thinking (ADR-004). The exclusions list shrinks to authentication, wire protocols, embeddings, retry, cost, prompt caching, batch, fine-tuning, and routing.

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Keep excluded, use `provider_extensions` for tool calling | Forces every tool-calling consumer to understand provider-specific schemas. Defeats the purpose of the facade. The extensions bag becomes the real API. |
| Expose as a separate MCP tool (`invoke_tool`) | Tool calling is part of the generation process, not a separate operation. The model decides to call tools during generation; the caller cannot predict when. Separating it from `complete` breaks the request-response flow. |
| Normalize only the request side (tool definitions), leave response side in extensions | Half-measures create asymmetry. If the request has tool definitions, the response will have tool use blocks. They must be normalized together or not at all. |
| Wait for schema convergence | Schemas have been divergent for 2+ years and show no signs of converging. The facade's job is to normalize divergence, not wait for it to resolve itself. |
