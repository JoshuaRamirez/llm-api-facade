# Soft Spots Analysis -- llm-api-facade Ontological Taxonomy

> Where the conceptual model is most likely to need revision as the LLM industry
> evolves. This document exists to help future sessions know where to look first
> when the taxonomy feels stale.

**Status:** Active reference (13/13 resolved or positioned)
**Last updated:** 2026-03-26
**Depends on:** `OntologicalTaxonomy.md`, `DomainModel.md`, `McpServerSpec.md`, cross-validation findings from OpenAI/Anthropic/Gemini/Mistral/Cohere/xAI/Local agents
**Purpose:** Intellectual honesty about where the model is weakest. Named by likelihood, severity, and seam-boundary impact.

---

## Priority Legend

Each soft spot is rated on three axes:

| Axis | Scale | Meaning |
|------|-------|---------|
| **Revision likelihood** | HIGH / MEDIUM / LOW | Probability of needing revision within 12 months |
| **Severity** | CRITICAL / HIGH / MEDIUM / LOW | Impact on the facade if the taxonomy is wrong |
| **Seam impact** | SEAM / NEAR-SEAM / BELOW-SEAM | Whether the soft spot affects the seam boundary (highest architectural impact), the types that cross it, or only below-seam implementation details |

---

## Soft Spot 1: Content Is Not a String

**Revision likelihood:** HIGH
**Severity:** CRITICAL
**Seam impact:** SEAM

### What it is

The facade defines `content` as `string` in the Message schema (McpServerSpec Section 6.1) and in the DomainModel (Section 1.1: "Content is text. Every provider accepts plain text content for every role."). The OntologicalTaxonomy Section 6.1 lists Content as "Substance (the payload)" at the Core level, but then describes it as "Ordered array of typed content blocks" -- contradicting the Domain Model and MCP spec, which use plain strings.

### Why it is soft

Every major provider already represents content as typed blocks internally, not strings:
- **Anthropic:** Content MUST be an array of typed blocks (`{type: "text", text: "..."}`, `{type: "image", ...}`, `{type: "tool_use", ...}`). String is a convenience shorthand that the SDK expands.
- **OpenAI:** Content can be a string OR an array of typed parts (`{type: "text", text: "..."}`, `{type: "image_url", ...}`).
- **Gemini:** Content is always an array of `Part` objects (`{text: "..."}`, `{inlineData: {...}}`).
- **Cohere:** Content supports typed blocks in v2 API.

The string representation is the lowest-energy state today. It is also the representation most likely to become inadequate within months, not years.

### Current taxonomy position

The OntologicalTaxonomy contains an internal inconsistency: Section 6.1 classifies Content as "Ordered array of typed content blocks" while the DomainModel and MCP spec both define `content: string`. The McpServerSpec Section 6.1 includes a forward-looking note: "Future extension: content may accept an array of typed content blocks (text, image) in a later version. The string form will remain valid."

### Direction of drift

The industry has already arrived at blocks-based content. Anthropic enforces it; OpenAI and Gemini support it natively. The trend is toward richer block types: tool-use blocks, thinking blocks, citation blocks, executable code blocks. Content-as-string is a simplification that buys initial simplicity at the cost of a mandatory breaking change later.

### Trigger for revision

Any of these events forces a revision:
- A user needs to pass an image or document through the facade (multimodal input).
- A user needs to receive tool-call structured data as part of a completion (tool use output).
- Extended thinking content must be distinguished from regular output content (thinking blocks).
- A provider stops accepting plain string content as a valid input format.

### Consequence if wrong

If the facade ships with `content: string` and the taxonomy is not revised in time:
- Every consumer that sends messages and receives completions has a broken contract when content blocks become necessary.
- The `ICompletionProvider` seam interface must change its `NormalizedRequest` and `CompletionResponse` types -- this is the most invasive change possible.
- The streaming contract (content deltas as strings) cannot represent heterogeneous block types in the chunk stream.
- The MCP tool schemas for `complete` and `stream_complete` require breaking input/output changes.

This is the single highest-priority soft spot because it affects every type that crosses the seam.

### Resolution

**Status:** RESOLVED
**Resolved by:** ADR-003 (Content Blocks Replace String as Facade Content Type)
**Date resolved:** 2026-03-27

ADR-003 replaced `content: string` with `content: ContentBlock[]` as the facade's content type for both messages and completions. ContentBlock is a discriminated union with five variants: TextBlock (Core), ToolUseBlock (Extended Tier 1), ToolResultBlock (Extended Tier 1), ThinkingBlock (Extended Tier 2), and ImageBlock (Extended Tier 2). The string shorthand is preserved at API boundaries as a convenience constructor that expands to `[TextBlock { text: <the string> }]`. The DomainModel, TypeSpecification, McpServerSpec, and OntologicalTaxonomy have all been updated to reflect this.

**Residual risk:** None. The internal inconsistency that motivated this soft spot no longer exists.

---

## Soft Spot 2: Token Accounting Assumes Simple Arithmetic

**Revision likelihood:** HIGH
**Severity:** HIGH
**Seam impact:** SEAM

### What it is

The facade defines token usage as a simple pair: `{input_tokens, output_tokens}`. The context window constraint is modeled as `effective_input_limit = context_window - max_output_tokens`. The taxonomy treats this arithmetic as a universal truth.

### Why it is soft

Reasoning models (OpenAI o-series, Anthropic with extended thinking, Gemini thinking models) consume "reasoning tokens" that are invisible to the caller but count against `max_tokens` or consume output budget:
- **OpenAI o-series:** Reasoning tokens consume `max_completion_tokens` invisibly. The caller sets a budget, the model spends some on reasoning and the rest on visible output. The caller cannot predict or control the split.
- **Anthropic extended thinking:** `thinking.budget_tokens` is a separate allocation, but thinking tokens still consume billing tokens and affect total usage.
- **Gemini thinking:** Similar pattern -- thinking tokens are a hidden cost center.

The simple formula `context_window - max_output_tokens = space_for_input` breaks when max_output_tokens includes invisible reasoning overhead. A caller who sets `max_tokens: 4096` expecting 4096 visible output tokens may get 500 visible tokens because 3596 were consumed by reasoning.

### Current taxonomy position

The OntologicalTaxonomy Section 6.1 notes this tension: "Max tokens [...] semantics diverge for reasoning models where the budget includes invisible reasoning tokens." The DomainModel Section 1.4 lists `thinking` / `reasoning_effort` as "NOT universal (deferred)." The taxonomy acknowledges the problem but defers it, betting that reasoning tokens are a Tier 3 concern.

### Direction of drift

Extended thinking / chain-of-thought is becoming standard, not rare. The Anthropic cross-validation found that extended thinking is available on ALL current Anthropic models. The reasoning-effort parameter is converging across 3+ vendors (OpenAI, Anthropic, xAI, Gemini). Within 12 months, the majority of frontier models will likely have reasoning capabilities. The Tier 3 classification is already stale.

### Trigger for revision

- When a majority of models behind the facade support reasoning, and callers cannot predict their actual visible output length because of invisible reasoning overhead.
- When a user's `validate_request` returns `valid: true` but the actual request fails because reasoning tokens consumed the budget.
- When the `usage` object needs to report `reasoning_tokens` separately for cost or debugging purposes.

### Consequence if wrong

- Token estimation (`estimate_tokens`) becomes meaningfully inaccurate because it cannot estimate reasoning overhead.
- `validate_request` produces false positives: it says the request fits but the model exhausts its budget on reasoning.
- Cost attribution breaks: a caller paying per-output-token has no visibility into the reasoning tax.
- The `usage` type in the seam contract (`CompletionResponse`) must grow to include reasoning tokens -- a seam-level type change.

### Resolution

**Status:** PARTIALLY RESOLVED
**Resolved by:** ADR-004 (Thinking Promoted to Extended Tier 2), DomainModel revision (reasoning_effort as Generation Parameter, `is_approximate` on Usage)
**Date resolved:** 2026-03-27

The reclassification of reasoning to Extended Tier 2 (ADR-004) brought `reasoning_effort` into the facade's parameter set and `supports_thinking` into ModelCapabilities. The DomainModel now documents max_tokens semantics divergence for reasoning models. The `Usage` type carries `is_approximate` to signal when token counts are estimates.

**Residual risk:** The `Usage` type still has only `{input_tokens, output_tokens, is_approximate}`. It does not carry a separate `reasoning_tokens` field. When reasoning token reporting stabilizes across providers (currently Anthropic and OpenAI report them differently), Usage will need an optional `reasoning_tokens` field. The context window formula `effective_input_limit = context_window - max_output_tokens` remains an approximation for reasoning models. Both are tracked as future refinements, not architectural risks.

---

## Soft Spot 3: Tool Calling Deferred as Monolith Below the Seam

**Revision likelihood:** HIGH
**Severity:** HIGH
**Seam impact:** SEAM

### What it is

The taxonomy classifies tool calling as "Extended (Tier 1)" and defers it entirely to the integration plane via `provider_extensions`. The DomainModel explicitly excludes it: "Tool / function calling -- Schema formats diverge completely across providers." The MCP spec's Open Questions (Section 8, item 2) asks whether tool use should be "a parameter on `complete` or a separate tool" -- it is unresolved.

### Why it is soft

Tool calling is not a single feature. The OpenAI cross-validation identified it as an ecosystem of at least 7 interrelated concepts:
1. Tool definition schemas (function name, description, parameters JSON Schema)
2. Tool choice constraints (auto, none, required, specific function)
3. Tool call output blocks in completions (the model deciding to call a tool)
4. Tool result messages (feeding results back to the model)
5. Parallel tool calling (multiple calls in one turn)
6. Tool call IDs (correlating calls to results)
7. Strict mode / schema enforcement (OpenAI-specific but spreading)

Additionally, Gemini introduces vendor-provided built-in tools (Google Search, Code Execution) that are not user-defined at all -- they are capabilities the model has natively. This is a categorically different thing from user-defined function schemas.

Despite the schema divergence, the conceptual structure is converging: every major provider (OpenAI, Anthropic, Gemini, Mistral, Cohere, xAI) supports tool calling with functionally equivalent semantics. The divergence is in wire format, not in conceptual model.

### Current taxonomy position

Tool calling is listed in OntologicalTaxonomy Section 3.4 as a "Structural Parameter" and in Section 6.2 as "Extended (Tier 1)." It sits in the explicit exclusions table of the DomainModel. The `tool` role is classified as an "integration-plane role" in OntologicalTaxonomy Section 1.1.1.

### Direction of drift

Agentic AI workflows depend on tool calling. It is the primary mechanism by which LLMs interact with external systems. MCP itself is built on the concept of tools. The facade is an MCP server that provides tools -- but cannot represent tool-calling within its own completions. This creates an ironic gap: the facade understands tools at the protocol level but cannot express tool-use within the generation domain.

The industry is converging on a common conceptual model even as wire formats differ. The integration plane can absorb the wire-format differences. What it cannot absorb is the absence of tool-calling concepts in the facade's type system.

### Trigger for revision

- When a user needs to define tools, receive tool-call completions, and feed results back through the facade -- the core agentic loop.
- When the `provider_extensions` bag becomes the primary mechanism for tool calling, making it a de-facto shadow API that the facade neither validates nor understands.
- When the MCP spec's Open Question #2 must be resolved.

### Consequence if wrong

- The facade cannot participate in agentic workflows, which is the fastest-growing use case for LLM APIs.
- The `content: string` contract (Soft Spot 1) and the tool-calling gap compound: tool-call outputs are structured content blocks, not strings.
- If tool calling enters the facade late, it creates a second parallel type system (tool-call types alongside completion types) that should have been integrated from the start.
- The Message schema, the role enumeration, the finish_reason enumeration, and the CompletionResponse type all need revision simultaneously.

### Resolution

**Status:** RESOLVED
**Resolved by:** ADR-005 (Tool Calling Promoted to Extended Tier 1), ToolCallingChoreography.md, TypeSpecification.md (ToolDefinition, ToolChoice, ToolUseBlock, ToolResultBlock, ToolUseDelta, tool role, tool_use finish reason)
**Date resolved:** 2026-03-27

ADR-005 promoted tool calling from the explicit exclusions list into the facade's type system as Extended Tier 1. All 7 interrelated concepts identified in this soft spot are now represented: ToolDefinition (name, description, input_schema), ToolChoice (auto/none/required/specific), ToolUseBlock and ToolResultBlock as ContentBlock variants, the `tool` role, the `tool_use` finish reason, tool_call_id/tool_use_id correlation, and parallel tool calling. The ToolCallingChoreography document specifies the exact translation from each provider's wire format into facade types. The DomainModel, TypeSpecification, and McpServerSpec have all been updated.

**Residual risk:** Strict mode / schema enforcement (item 7 in the original list) remains a Layer 2 extension. It is currently OpenAI-specific (`strict: true`). If strict mode converges across providers, it becomes a graduation candidate.

---

## Soft Spot 4: Three Finish Reasons Collapse Eleven with Information Loss

**Revision likelihood:** HIGH
**Severity:** MEDIUM
**Seam impact:** SEAM

### What it is

The facade normalizes all provider finish reasons to `{stop, length, content_filter}`. The DomainModel Section 1.2 defines these three. The MCP spec Section 3.1 adds `max_tokens` and `stop_sequence` as distinct values (inconsistency with DomainModel, which conflates them under `stop` and `length`). But the real problem is that providers report 11+ distinct finish reasons that carry structurally meaningful information.

### Why it is soft

- **`tool_calls` / `tool_use`** (OpenAI, Anthropic, Gemini, Mistral): Generation stopped because the model wants to invoke a tool. This is not a `stop` -- it requires a different caller response (execute the tool, feed results back). Collapsing it to `stop` loses the signal that drives the agentic loop.
- **`recitation`** (Gemini): The model's output was flagged as potentially reproducing training data. This is distinct from `content_filter` (safety) -- it is a copyright concern, not a safety concern.
- **`safety`** vs **`content_filter`**: Some providers distinguish between input rejection and output filtering. The facade conflates them.
- **`end_turn`** vs **`stop_sequence`** (Anthropic): Natural completion vs. hitting a caller-defined stop sequence. These have different implications for whether the output is complete.
- **`max_tokens`** vs **`length`** ambiguity: When a reasoning model hits the limit, was it the visible output that was truncated or the reasoning that exhausted the budget?

The Gemini cross-validation found that 11 provider-specific finish reasons collapse to 3 with meaningful information loss.

### Current taxonomy position

OntologicalTaxonomy Section 6.1 lists finish reason as "Universal" at the Core level, normalized to `{stop, length, content_filter, tool_use, error}`. Note that the taxonomy itself has 5 values, but the DomainModel has 3 and the MCP spec has a mix. There is already internal inconsistency.

### Direction of drift

As tool calling becomes standard and reasoning models proliferate, `tool_use` and reasoning-related finish reasons will be needed at the facade level, not below it. The set will likely stabilize at 5-7 values across providers.

### Trigger for revision

- Tool calling enters the facade (Soft Spot 3) and `tool_use` becomes a mandatory finish reason.
- A caller needs to distinguish "output was complete" from "output was truncated" from "model wants to act" -- three categorically different states that require different programmatic responses.

### Consequence if wrong

- Callers cannot build correct control flow for agentic loops (they cannot distinguish "done" from "needs tool execution").
- Callers cannot distinguish truncated output from complete output, leading to silent data loss.
- The finish_reason enum is part of `CompletionResponse`, which crosses the seam -- any expansion is a seam-level change.

### Resolution

**Status:** RESOLVED
**Resolved by:** TypeSpecification.md Section 2.2 FinishReason (expanded enumeration), ADR-005 (tool_use finish reason), DomainModel Section 1.2 (revised finish reasons)
**Date resolved:** 2026-03-27

The FinishReason enumeration was expanded from 3 to 5 values: `{stop, length, content_filter, tool_use, error}`. The internal inconsistency between the DomainModel (3 values), taxonomy (5 values), and MCP spec (mixed) has been resolved -- all documents now agree on the 5-value set. The TypeSpecification provides detailed invariants and provider mappings for each value. Gemini's `RECITATION` maps to `content_filter` (the broadest interpretation of content-based generation termination). Anthropic's `end_turn` and `stop_sequence` both map to `stop` (the facade does not distinguish natural completion from stop-sequence termination; the caller's stop_sequences are known to the caller, so the distinction is reconstructible).

**Residual risk:** The `stop` value still conflates natural completion and stop-sequence hits. If consumers demonstrate a need to distinguish these programmatically, a future revision could split `stop` into `end_turn` and `stop_sequence`. This is low priority: the caller knows whether it set stop sequences and can infer which case applies.

---

## Soft Spot 5: Streaming Protocol Treated as Uniform SSE

**Revision likelihood:** MEDIUM
**Severity:** HIGH
**Seam impact:** NEAR-SEAM

### What it is

The DomainModel Section 1.5 states streaming is "Server-Sent Events (SSE), chunked" and universal. The streaming contract defines flat delta chunks with `content_delta`, optional `finish_reason`, and optional `usage`. The taxonomy classifies SSE vs. NDJSON as a below-seam detail.

### Why it is soft

The streaming landscape is more fragmented than the taxonomy acknowledges:
- **Anthropic:** Uses named SSE event types (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`). These are not flat deltas -- they carry lifecycle semantics about content blocks. Flattening them loses information about where one content block ends and another begins.
- **Ollama:** Uses NDJSON, not SSE. Each line is a complete JSON object. This is a different transport protocol, not a parameter difference.
- **Gemini:** Uses SSE but with `alt=sse` query parameter opt-in; the default response is a single JSON object (no streaming by default in the REST API, only via SDK or explicit parameter).
- **OpenAI:** Uses SSE with `data:` prefixed lines and a `[DONE]` sentinel.
- **Local runtimes:** Mix of SSE (vLLM, LM Studio) and NDJSON (Ollama, some llama.cpp configurations).

The deeper issue is that Anthropic's block-lifecycle events carry information that flat deltas cannot represent. When content blocks are heterogeneous (text block, tool-use block, thinking block), the flat delta model cannot signal block boundaries to the caller.

### Current taxonomy position

OntologicalTaxonomy Section 1.3.2 treats streaming as "the same process with a different observation mode." Section 6.4 classifies "SSE vs. NDJSON streaming" as a Below-Seam protocol variant. The MCP spec defines a flat `{completion_id, chunk_index, delta, finish_reason}` chunk schema.

### Direction of drift

As content blocks become the standard content model (Soft Spot 1), streaming must convey block boundaries. The flat delta model works for text-only output but fails for heterogeneous output (text + tool calls + thinking). The streaming contract will need to evolve to carry typed deltas or block-boundary events.

### Trigger for revision

- Content blocks enter the facade (Soft Spot 1) and the streaming contract must distinguish which block a delta belongs to.
- A caller needs to render thinking blocks differently from output blocks in real time during streaming.
- A caller needs to detect tool-call blocks arriving in the stream before the generation is complete.

### Consequence if wrong

- The streaming contract cannot represent multi-block output, forcing callers to parse and reassemble blocks from flat deltas with heuristics.
- The `CompletionChunk` type that crosses the seam must be revised to carry block identity.
- Streaming becomes the bottleneck for adopting content blocks, tool calling, and extended thinking at the facade level.

### Resolution

**Status:** RESOLVED (with one gap to close)
**Resolved by:** TypeSpecification.md Section 1.4 (CompletionChunk), Section 1.5 (ContentBlockDelta as discriminated union), ToolCallingChoreography.md Section 2.7 (streaming accumulation per provider), ADR-003 (content blocks), ADR-005 (tool calling)
**Date resolved:** 2026-03-27

The core concern -- "flat deltas cannot represent multi-block output" -- has been addressed through three coordinated changes:

1. **ContentBlockDelta is a discriminated union** (TypeSpec Section 1.5) with three typed variants: TextDelta, ToolUseDelta, and ThinkingDelta. Each chunk carries a typed delta, not a flat string. The caller knows what kind of content block is being streamed from the delta variant itself.

2. **ToolUseDelta carries block identity within the variant.** The first ToolUseDelta for a given tool call carries `tool_use_id` and `name`; subsequent deltas for the same call carry `null` for both. This is sufficient for the caller to accumulate tool call arguments without ambiguity when only one tool call streams at a time.

3. **ToolCallingChoreography Section 2.7** documents the exact streaming accumulation algorithm for each provider (OpenAI, Anthropic, Gemini, local runtimes). Each adapter translates provider-specific streaming events (Anthropic's `content_block_start`/`content_block_delta`/`content_block_stop`, OpenAI's `tool_calls[index]`, Gemini's single-frame `functionCall`, Ollama's final-message tool calls) into the facade's ToolUseDelta model.

**Gap identified: `block_index` is missing from CompletionChunk.** The current CompletionChunk carries `{completion_id, chunk_index, delta, finish_reason, usage}`. It does not carry a `block_index` field that identifies which content block within the response the delta belongs to. When multiple content blocks stream concurrently -- for example, a TextBlock followed by two parallel ToolUseBlocks -- the caller needs `block_index` to route each delta to the correct accumulator. OpenAI uses `tool_calls[index]` and Anthropic uses `content_block_start.index` for exactly this purpose.

**Required change:** Add `block_index: non-negative integer` to the CompletionChunk type in TypeSpecification.md Section 1.4. This field identifies which content block (by position in the eventual `content: ContentBlock[]` array) the delta contributes to. Chunks belonging to different content blocks may interleave in the stream. The `block_index` is assigned by the adapter during translation from provider-native events. This change must be made in the TypeSpecification, the DomainModel Section 1.5 streaming contract, and the McpServerSpec chunk schema.

**Residual risk:** Low. The typed delta model absorbs the overwhelming majority of the streaming complexity. The `block_index` addition is a straightforward field addition with clear semantics, not an architectural change. Wire protocol differences (SSE vs. NDJSON) remain correctly classified as below-seam, absorbed by adapters.

---

## Soft Spot 6: The Extension Bag Is Load-Bearing in Disguise

**Revision likelihood:** HIGH
**Severity:** MEDIUM
**Seam impact:** SEAM

### What it is

The facade defines `provider_extensions: Map<string, any>` as an "opaque pass-through" for provider-specific features that do not fit the normalized model. Tool calling, structured output, reasoning configuration, vision, caching -- all are routed through this bag. The taxonomy treats it as an escape hatch.

### Why it is soft

When the features that transit the extension bag constitute the majority of real-world usage, the "escape hatch" becomes the main door. Currently deferred to extensions:
- Tool calling (the primary mechanism for agentic workflows)
- Structured output / JSON mode (required for reliable programmatic consumption)
- Reasoning configuration (becoming standard on frontier models)
- Vision / multimodal input (widespread capability)
- Safety configuration (configurable on Gemini, fixed on others)

If a typical advanced request uses 3-4 of these features, the normalized `NormalizedRequest` carries the minority of the request's semantic content. The extension bag carries the majority. The facade's validation, capability discovery, and parameter normalization -- the things that justify its existence -- do not operate on extension data.

### Current taxonomy position

OntologicalTaxonomy Section 6.3 classifies `provider_extensions` as a "Container (opaque pass-through)" at the Seam level. DomainModel Section 4.4 says "The facade validates and operates on universal fields only. Extension data is the integration plane's responsibility entirely."

### Direction of drift

The extension bag will accumulate weight until it either:
1. Gets promoted: Key features move from extensions into the normalized model (tool calling, structured output, reasoning). The bag becomes genuinely residual.
2. Gets structured: The bag develops sub-schemas, validation rules, and capability queries -- becoming a second, shadow facade.
3. Gets abused: Callers learn to pass everything through extensions, bypassing the facade's normalization entirely.

Option 1 is the healthy path. Options 2 and 3 are the failure modes. The taxonomy provides no guidance on when a feature should graduate from extension to core.

### Trigger for revision

- When more than 50% of real-world requests include extension data.
- When callers start passing core parameters (like temperature or max_tokens) through extensions to get provider-specific behavior.
- When the facade's value proposition is questioned because it only validates a minority of the request payload.

### Consequence if wrong

- The facade becomes ceremonial: it routes requests but does not meaningfully abstract them.
- The principle of Provider Opacity (Principle 1) is violated in practice: callers must know which provider they target to construct correct extension data.
- The seam contract becomes structurally dishonest: `NormalizedRequest` suggests normalization, but the real payload is in the opaque bag.

### Resolution

**Status:** RESOLVED
**Resolved by:** ADR-006 (Structured Extensions Replace Opaque Bag), combined with ADR-003 (content blocks), ADR-004 (thinking), ADR-005 (tool calling) graduating key features to Layer 1
**Date resolved:** 2026-03-27

Two complementary changes resolved this soft spot:

1. **Graduated key features out of extensions into Layer 1.** Tool calling (ADR-005), content blocks including vision (ADR-003), and reasoning (ADR-004) are no longer extension territory. They are first-class facade types with validation, capability discovery, and normalization. This removed the three heaviest items from the extension bag.

2. **Replaced the opaque bag with structured, typed extensions** (ADR-006). `provider_extensions: Map<string, any>` became `extensions: Map<ExtensionId, ExtensionValue>` where each extension has a registered identifier, JSON Schema, and description. Extensions are discoverable via `get_model_info` and validated by the facade against their schemas before dispatch. The bag is no longer opaque; it is a structured, discoverable, validated namespace for provider-specific features.

The DomainModel Section 4.4 now defines the graduation criteria: extensions that converge across multiple providers may be promoted to Layer 1 through an ADR. Safety configuration, structured output, and prompt caching remain as structured extensions -- appropriate given their current divergence across providers.

**Residual risk:** The structured extension system is only as good as its schemas. Poorly specified extension schemas could recreate the opaque bag problem within a typed wrapper. Extension schema quality is an ongoing operational concern, not an architectural risk.

---

## Soft Spot 7: Reasoning/Thinking Classified as Tier 3 (Rare)

**Revision likelihood:** HIGH
**Severity:** MEDIUM
**Seam impact:** NEAR-SEAM

### What it is

The taxonomy classifies extended thinking and reasoning effort as "Rare" (Tier 3, Singular) and "Below-Seam." The DomainModel lists `thinking` / `reasoning_effort` in the "NOT universal" exclusion list. The ProviderAnalysis confirms them as provider-specific.

### Why it is soft

This classification was defensible 6 months ago but is becoming inaccurate:
- **Anthropic:** Extended thinking is available on ALL current models, not just specialized ones. It is a standard parameter, not a rare capability.
- **OpenAI:** `reasoning_effort` (low/medium/high) is available on o-series models and may spread to other model families.
- **xAI:** Supports reasoning effort on Grok models.
- **Gemini:** Thinking models with `thinkingConfig.thinkingBudget` are available.

The cross-validation found that reasoning effort is converging across 3+ vendors. The parameter names differ (`reasoning_effort`, `thinking.budget_tokens`, `thinkingConfig.thinkingBudget`) but the conceptual model is identical: a control that trades compute cost for output quality by allocating resources to internal deliberation.

### Current taxonomy position

OntologicalTaxonomy Section 3.5 classifies reasoning parameters as "Meta-Parameters" with "Rare" universality. Section 6.4 places "Extended thinking / reasoning config" in the Below-Seam table with the note "Rapidly evolving; not normalizable yet."

### Direction of drift

Reasoning is moving from Tier 3 toward Tier 1. The conceptual model is converging even as the parameter names diverge. A normalized `reasoning_effort` parameter (mapping to provider-specific equivalents) is feasible now and will likely be necessary within 6-12 months. The taxonomy's "not normalizable yet" assessment was cautious but time-limited.

### Trigger for revision

- When more than half of the frontier models behind the facade support some form of reasoning configuration.
- When a caller needs to control reasoning effort to manage cost (reasoning tokens are expensive) and cannot do so through the normalized interface.

### Consequence if wrong

- Callers must use the extension bag to control reasoning effort, defeating normalization for one of the most impactful parameters.
- Token accounting (Soft Spot 2) and reasoning configuration are coupled: you cannot accurately account for tokens without understanding the reasoning budget.
- Capability discovery cannot report reasoning support because it is not in the capability model.

### Resolution

**Status:** RESOLVED
**Resolved by:** ADR-004 (Extended Thinking Promoted from Below-Seam to Extended Tier 2), TypeSpecification.md (ReasoningEffort enum, ThinkingBlock, ThinkingDelta, `supports_thinking` capability), DomainModel revision (reasoning_effort as Generation Parameter)
**Date resolved:** 2026-03-27

ADR-004 reclassified extended thinking from Tier 3 (Rare, Below-Seam) to Extended Tier 2 (capability-gated). The facade now includes: a `ReasoningEffort` enumeration (`low`, `medium`, `high`) as a Generation Parameter, `supports_thinking` as a capability flag on ModelCapabilities, `ThinkingBlock` as a ContentBlock variant, and `ThinkingDelta` as a ContentBlockDelta variant for streaming. The integration plane maps the categorical effort levels to provider-specific mechanisms (Anthropic `thinking.budget_tokens` / `output_config.effort`, OpenAI `reasoning_effort`, Gemini `thinkingConfig`).

**Residual risk:** The categorical model (`low`/`medium`/`high`) is a deliberate simplification of providers that offer numeric budget controls (Anthropic `budget_tokens`, Gemini `thinkingBudget`). If consumers need fine-grained numeric control, this would be exposed as a Layer 2 extension alongside the categorical Layer 1 parameter. Currently assessed as low risk because the industry is converging toward categorical levels.

---

## Soft Spot 8: Local Runtime Model Management Is Absent

**Revision likelihood:** MEDIUM
**Severity:** MEDIUM
**Seam impact:** NEAR-SEAM

### What it is

The taxonomy assumes models are always available. There is no concept of model lifecycle -- loading, unloading, warm vs. cold state. The DomainModel's `ModelIdentity` and `ModelCapabilities` are static: a model is registered at startup and is either available or not.

### Why it is soft

Local runtimes (Ollama, llama.cpp, vLLM, LM Studio) have a fundamentally different model lifecycle from cloud APIs:
- **Ollama:** Models must be pulled (downloaded) before use. They can be loaded into memory or unloaded. Loading takes seconds to minutes. Memory is a hard constraint.
- **vLLM:** Models are loaded at server startup. Multiple models require multiple server instances or explicit model swapping.
- **llama.cpp:** One model per server instance. Changing models requires restarting with a different model file.
- **LM Studio:** GUI-managed model loading. Models can be swapped but not programmatically in all configurations.

Cloud APIs abstract this entirely -- the provider manages model availability. Local runtimes expose it as a first-class operational concern. The facade's "model is either available or not" binary does not capture the state space of local runtimes.

### Current taxonomy position

OntologicalTaxonomy Section 1.1.4 lists rate limits and safety filters as constraints but does not address model readiness or memory constraints. The DomainModel's `model_unavailable` error category (Section 2.4) captures "Model does not exist or is down" but not "Model exists but is not loaded and loading will take 30 seconds."

### Direction of drift

As local and self-hosted inference grows (driven by cost, privacy, and latency requirements), the facade will serve more local backends. The distinction between "model not found" and "model not loaded" will become operationally significant. Users will need to know whether a model requires loading time before it can serve requests.

### Trigger for revision

- When a user's request to a local model times out because the model was not loaded, and the error message is unhelpful ("model unavailable" when the model exists but needs to be loaded).
- When users need programmatic control over which models are loaded in local runtimes to manage memory.
- When the facade needs to report estimated readiness time for cold models.

### Consequence if wrong

- Local runtime users get a degraded experience: opaque timeouts instead of informative state reporting.
- The facade cannot participate in resource management for local runtimes, which may be the primary value of a facade in a local-only deployment.
- The `model_unavailable` error category is semantically overloaded, violating Principle 6 (Fail Explicitly).

### Resolution

**Status:** POSITION TAKEN
**Resolved by:** Formal position on model lifecycle architecture (documented below), with changes required in TypeSpecification.md, DomainModel.md, McpServerSpec.md, and OntologicalTaxonomy.md
**Date resolved:** 2026-03-26

**Position:**

1. **Layer 1 discovery reports current state, not potential state.** The `list_models` and `get_model_info` tools report what is available NOW. A model that exists in the local runtime's catalog but is not loaded into memory reports as unavailable through Layer 1 discovery. This is consistent with the cloud API model where a decommissioned model simply does not appear.

2. **Add `model_state` to the response of `get_model_info`.** A new type captures the readiness of a model:

   ```
   ModelReadiness {
       state: "available" | "loading" | "unloading" | "not_loaded" | "unavailable"
       estimated_ready_seconds: positive integer?   // present when state is "loading" or "not_loaded"
   }
   ```

   - `available`: The model is loaded and ready to serve requests. Cloud models are always in this state.
   - `loading`: The model is actively being loaded into memory. `estimated_ready_seconds` provides a forecast.
   - `unloading`: The model is being evicted from memory (e.g., to make room for another model).
   - `not_loaded`: The model exists in the runtime's catalog but is not loaded. It can be loaded on demand. `estimated_ready_seconds` estimates load time.
   - `unavailable`: The model cannot serve requests and cannot be loaded (corrupt files, incompatible hardware, missing dependencies).

   For cloud providers, the adapter always returns `{ state: "available" }`. The field is structurally present but trivially constant for cloud backends.

3. **Define a `model_lifecycle` Layer 2 extension for local runtimes.** This extension exposes load/unload operations and reports loading progress. It is discoverable via `get_model_info` as an `ExtensionDescriptor` with id `model_lifecycle`. The extension's `input_schema` accepts `{ action: "load" | "unload" }` and the `response_schema` includes progress reporting. This is a Layer 2 extension because model lifecycle management is not universal -- it applies exclusively to local runtimes.

4. **Refine the error taxonomy.** Split `model_unavailable` into two species:

   | Code | Meaning | Retryable? |
   |------|---------|------------|
   | `precondition.model_not_found` | The model ID does not exist in any registered provider | No |
   | `precondition.model_not_ready` | The model exists but is not loaded; includes `estimated_ready_seconds` when available | Conditional (retry after estimated wait) |

   The existing `model_unavailable` becomes the genus; the two new codes are species beneath it. Existing consumers that match on `model_unavailable` continue to work because the genus-level match still applies. New consumers can match on the species for finer-grained handling.

**Changes required:**
- **TypeSpecification.md:** Add `ModelReadiness` type. Add `readiness: ModelReadiness` field to the `get_model_info` response shape. Add `model_not_found` and `model_not_ready` to the error code enumeration.
- **DomainModel.md Section 2.2:** Add `readiness` to the capability discovery contract. Add a note that cloud adapters always return `state: "available"`.
- **DomainModel.md Section 2.4:** Split `model_unavailable` into `model_not_found` and `model_not_ready` in the Precondition Failures table.
- **McpServerSpec.md:** Update `get_model_info` output schema to include `readiness`. Update error code documentation.
- **OntologicalTaxonomy.md Section 6.5:** Reclassify "Model load / unload" from purely "Below-Seam (infrastructure)" to "Below-Seam infrastructure with Layer 2 extension surface." Add `ModelReadiness` as a Layer 1 concept (it is universal -- cloud models simply have a trivially constant value).

**Residual risk:** The `estimated_ready_seconds` field is inherently approximate. Model loading time depends on file size, disk speed, available memory, GPU state, and concurrent operations. The facade makes no guarantee about accuracy -- it is advisory information from the adapter. Consumers should treat it as a hint for UX purposes, not as a contract.

---

## Soft Spot 9: Safety as Fixed Binary vs. Configurable Spectrum

**Revision likelihood:** MEDIUM
**Severity:** MEDIUM
**Seam impact:** NEAR-SEAM

### What it is

The taxonomy treats safety filtering as a fixed property of the provider: content either passes or gets filtered, and `content_filtered` is the error category. There is no concept of configurable safety thresholds.

### Why it is soft

Safety configuration has a dual nature across providers:
- **Gemini:** Safety settings are explicitly configurable per request with per-category thresholds (`HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_HATE_SPEECH`, etc.) and blocking levels (`BLOCK_LOW_AND_ABOVE` through `BLOCK_NONE`). This is not a fixed filter -- it is a parameter.
- **OpenAI:** Safety is a fixed pipeline. Some models offer `moderation` as a separate API. No per-request configuration.
- **Anthropic:** Safety is largely fixed with system-prompt-based behavioral controls. No explicit per-request safety parameters.
- **Local runtimes:** No safety filtering by default. Safety is the caller's responsibility.

The facade's model -- safety as a fixed constraint discovered by violation (OntologicalTaxonomy Section 1.1.4: "Normative boundary on content [...] discovered by violation") -- is accurate for OpenAI and Anthropic but structurally wrong for Gemini and local runtimes.

### Current taxonomy position

OntologicalTaxonomy Section 1.1.4 classifies safety filters as constraints "discovered by violation." Section 4.3 classifies `content_filtered` as a Process Failure. The DomainModel does not expose safety configuration as a parameter.

### Direction of drift

As regulatory requirements grow (EU AI Act, etc.), configurable safety settings may become more common across providers. Gemini's approach may spread. Simultaneously, local runtimes with no safety filtering create a liability gap that the facade currently does not address.

### Trigger for revision

- When a user needs to configure Gemini's safety thresholds through the facade and the only mechanism is the extension bag.
- When regulatory requirements mandate that the facade expose or enforce safety configuration.
- When the absence of safety reporting on local runtimes creates operational risk.

### Consequence if wrong

- Gemini safety configuration is permanently relegated to the extension bag, making Gemini a second-class citizen in the facade.
- The facade cannot report safety metadata (Gemini returns safety ratings on every response), losing information that may be operationally or legally required.
- The binary model (filtered/not-filtered) cannot represent partial filtering or configurable thresholds.

### Resolution

**Status:** POSITION TAKEN
**Resolved by:** Classification as Layer 2 structured extension (per ADR-006), OntologicalTaxonomy Section 1.1.4 revision
**Date resolved:** 2026-03-27

The dual nature of safety across providers makes it a textbook case for the Layer 2 structured extension pattern established by ADR-006. Per-request safety configuration (Gemini `safetySettings`) is exposed as a `safety_settings` extension with a defined schema. Safety response metadata (Gemini safety ratings) is exposed via `extension_data` on the response. The facade's Layer 1 position remains: safety as a constraint discovered by violation, with `content_filtered` as the normalized finish reason. The OntologicalTaxonomy Section 1.1.4 now acknowledges both modes: safety as fixed constraint (OpenAI, Anthropic) and safety as configurable parameter (Gemini, Layer 2 extension).

**Residual risk:** If configurable safety converges across multiple providers (as regulatory pressure may cause), it becomes a graduation candidate from Layer 2 to Layer 1. Currently assessed as medium-term risk. The structured extension pattern means Gemini safety is no longer opaque or undiscoverable.

---

## Soft Spot 10: Structured Output Treated as Single Feature

**Revision likelihood:** MEDIUM
**Severity:** MEDIUM
**Seam impact:** NEAR-SEAM

### What it is

The taxonomy classifies structured output / JSON mode as a single "Structural Parameter" (Section 3.4) with "Widespread but divergent" universality, deferred to Tier 1 extensions.

### Why it is soft

The OpenAI cross-validation found that structured output has at least 3 tiers of guarantee strength, not one:
1. **Instructed JSON:** The model is asked to produce JSON via the prompt. No enforcement. May fail.
2. **JSON mode:** The provider guarantees the output is valid JSON, but no schema validation. (OpenAI `response_format: {type: "json_object"}`, Gemini `responseMimeType: "application/json"`).
3. **Schema-enforced:** The provider guarantees the output conforms to a specific JSON Schema. (OpenAI `response_format: {type: "json_schema", json_schema: {...}}`, Anthropic output schema in tool definitions, Gemini `responseSchema`).

Additionally, local runtimes offer grammar-based constraints (BNF/GBNF in llama.cpp) that enforce arbitrary output structure, not just JSON. This is a fourth tier: syntax-enforced generation.

Treating these as one feature obscures the guarantee semantics. A caller who needs schema-enforced output and gets instructed JSON has a reliability gap that the facade cannot communicate.

### Current taxonomy position

OntologicalTaxonomy Section 3.4 lists `response_format` as a single Structural Parameter. Section 6.2 classifies it as "Extended (Tier 1)" with the note "Guarantee strength varies by provider."

### Direction of drift

Schema-enforced output is becoming the standard for programmatic LLM consumption. OpenAI, Anthropic, and Gemini all support it in some form. The tiers will likely stabilize, and the facade will need to express what level of guarantee a given model provides.

### Trigger for revision

- When a caller needs to know whether a model supports schema-enforced output vs. best-effort JSON before sending a request.
- When capability discovery needs to report structured output tiers, not just a binary "supports structured output" flag.

### Consequence if wrong

- Callers cannot make informed decisions about output reliability.
- The extension bag becomes the mechanism for structured output configuration, but the guarantee semantics are not discoverable through capability queries.
- Testing and validation strategies differ by tier -- a caller using tier 3 needs schema validation; a caller using tier 1 needs fallback parsing.

### Resolution

**Status:** POSITION TAKEN
**Resolved by:** Classification as Layer 2 structured extension (per ADR-006) with multi-tier guarantee semantics documented in extension schema
**Date resolved:** 2026-03-27

Structured output remains a Layer 2 extension -- the guarantee semantics diverge too much across providers for a single Layer 1 representation. Per ADR-006, it is a structured extension (id: `structured_output`) with a discoverable schema. The extension schema expresses the guarantee tier the model supports, not just a binary flag. The adapter reports which tiers are available, and the consumer selects the desired tier in the extension input. Grammar-based constraints (llama.cpp GBNF) are a separate extension (id: `grammar_constraint`) specific to local runtimes.

**Residual risk:** If schema-enforced output converges across all three major cloud providers (which is occurring), it becomes a strong graduation candidate to Layer 1. The tier model (instructed < json_mode < schema_enforced) is stable enough to formalize. This should be re-evaluated within 6 months.

---

## Soft Spot 11: Sampling Pipeline Assumed Fixed-Order

**Revision likelihood:** LOW
**Severity:** MEDIUM
**Seam impact:** BELOW-SEAM

### What it is

The OntologicalTaxonomy Section 3.1 defines a specific sampling pipeline: `Raw Logits -> temperature -> softmax -> top_k -> top_p -> min_p -> sample`. This is presented as the canonical order.

### Why it is soft

The Mistral/Local cross-validation found that sampler chain ordering is configurable in several local runtimes:
- **llama.cpp:** Sampler order is explicitly configurable via `--samplers` flag.
- **text-generation-webui:** Offers UI-configurable sampler ordering.
- **vLLM:** Adds advanced samplers (mirostat, DRY) that do not fit the linear pipeline model.

Additionally, the pipeline model does not account for:
- **Mirostat sampling:** An algorithm that targets a specific perplexity, replacing the temperature/top-k/top-p pipeline entirely.
- **DRY (Don't Repeat Yourself) penalty:** A repetition penalty with lookback that operates on a different principle than frequency/presence penalties.
- **Dynamic temperature:** Temperature that varies based on token entropy, not a static value.
- **min_p:** Already listed in the taxonomy as "Rare" but growing in adoption among local runtimes.

### Current taxonomy position

The pipeline diagram in Section 3.1 is presented as the standard. `min_p` is noted as rare. Mirostat, DRY, and dynamic temperature are not mentioned.

### Direction of drift

These advanced sampling methods are predominantly a local-runtime concern. Cloud providers are unlikely to expose sampler chain configuration. The impact on the facade is limited because the facade already classifies these as below-seam. However, if the facade serves primarily local runtimes for a given deployment, the fixed-pipeline model in the taxonomy could mislead adapter implementors.

### Trigger for revision

- When the taxonomy is used as a guide for implementing local runtime adapters and the fixed-pipeline model causes incorrect parameter translation.
- When a provider (cloud or local) adds sampler configuration as a first-class API feature.

### Consequence if wrong

- Adapter implementors for local runtimes misunderstand the parameter interaction model.
- Parameters that should be mutually exclusive (mirostat vs. temperature+top_p) are both accepted without warning.
- The taxonomy's intellectual claim to describe the "parameter space topology" is undermined for local runtimes.

This is below-seam and does not affect the facade's public interface, limiting its severity.

### Resolution

**Status:** POSITION TAKEN
**Resolved by:** Formal position on pipeline scope and advanced sampling classification (documented below), with annotation required in OntologicalTaxonomy.md Section 3.1
**Date resolved:** 2026-03-26

**Position:**

1. **The taxonomy's pipeline is a pedagogical model, not an execution specification.** The diagram `Raw Logits -> temperature -> softmax -> top_k -> top_p -> min_p -> sample` describes the canonical conceptual relationship between sampling parameters -- specifically, that temperature operates in logit space (pre-softmax) while top_k, top_p, and min_p operate in probability space (post-softmax). It establishes that these parameters compose sequentially and are not alternatives to each other. It does not prescribe the order in which an inference engine must apply them. Local runtimes may reorder the pipeline, and the facade neither guarantees nor constrains sampling order.

2. **The facade's Layer 1 parameters remain the universal vocabulary.** `temperature`, `top_p`, and `top_k` are the portable sampling parameters. Their semantics (logit scaling, cumulative probability threshold, rank-order threshold) are stable across providers regardless of execution order. The facade normalizes these names; it does not normalize execution behavior.

3. **Advanced sampling methods are Layer 2 extensions.** Mirostat, DRY, dynamic temperature, min_p, and configurable sampler chain ordering are classified as a `sampling_advanced` extension (or a family of related extensions). They are discoverable on models that support them via `get_model_info`. This classification acknowledges their existence and provides a structured mechanism for consumers to use them, without pretending they are universal.

4. **Mirostat is categorically incompatible with the pipeline model.** Mirostat replaces the temperature/top_k/top_p pipeline with a perplexity-targeting algorithm. When mirostat is active, temperature/top_k/top_p parameters are either ignored or conflict. The `sampling_advanced` extension schema should document this mutual exclusion so that adapter implementors and consumers are aware of it.

**Changes required:**
- **OntologicalTaxonomy.md Section 3.1:** Add a clarifying note after the pipeline diagram: "This pipeline describes the canonical conceptual relationship between sampling parameters. It is a pedagogical model for understanding parameter interactions, not a specification of execution order. Local runtimes (llama.cpp, vLLM, text-generation-webui) may reorder the pipeline or replace it entirely with alternative sampling algorithms (mirostat, DRY). The facade does not guarantee or constrain the order in which an inference engine applies these parameters." Also add min_p, mirostat, DRY, and dynamic temperature to the parameter table with "Local runtimes, Layer 2 extension" annotation.

**Residual risk:** Low. This soft spot is below-seam by nature. The position clarifies the taxonomy's claims without requiring any change to the facade's public interface. The primary benefit is preventing misunderstanding by adapter implementors.

---

## Soft Spot 12: Role Alternation Constraint Invisible

**Revision likelihood:** MEDIUM
**Severity:** LOW
**Seam impact:** NEAR-SEAM

### What it is

The taxonomy defines messages as "an ordered sequence" with three roles but does not address structural constraints on role ordering. The DomainModel says "Messages are ordered. Sequence determines conversational context." The MCP spec accepts any sequence of messages with any role ordering.

### Why it is soft

Anthropic enforces strict role alternation: messages must alternate between `user` and `assistant` roles (after an optional system message). Two consecutive `user` messages are rejected. This is not a preference -- it is a hard validation constraint that the API enforces.

Other providers are more permissive (OpenAI accepts consecutive same-role messages), but Anthropic's constraint means the facade may pass through a message sequence that is valid for OpenAI but rejected by Anthropic. The facade currently has no mechanism to validate or communicate provider-specific ordering constraints.

### Current taxonomy position

Not addressed. The OntologicalTaxonomy Section 1.2 lists "Message --> Sequence" as a "Compositional" relation with "Order is load-bearing" but does not mention ordering constraints.

### Direction of drift

This is unlikely to converge across providers. Anthropic has strong architectural reasons for their alternation requirement. Other providers are unlikely to adopt it. This means the facade must either:
1. Enforce the strictest constraint (Anthropic's alternation) on all providers, or
2. Validate ordering per-provider at the integration plane and surface ordering violations as validation errors.

Option 2 is more consistent with the facade's principle of LCD + capability discovery, but it means the facade cannot fully validate messages before dispatch -- it must know the target provider's ordering rules.

### Trigger for revision

- When a caller's messages are rejected by Anthropic after passing facade-level validation, violating Principle 6 (Fail Explicitly).
- When the facade's `validate_request` tool needs to account for provider-specific message ordering constraints.

### Consequence if wrong

- False-positive validation: `validate_request` says the message sequence is valid but Anthropic rejects it.
- Users targeting Anthropic through the facade are surprised by ordering rejections that the facade did not prevent.
- The severity is limited because the error is still reported (Anthropic returns a clear error); it is just not caught early.

### Resolution

**Status:** POSITION TAKEN
**Resolved by:** Formal position on validation layering and capability-advertised ordering constraints (documented below), with changes required in DomainModel.md and TypeSpecification.md
**Date resolved:** 2026-03-26

**Position:**

1. **Layer 1 validation checks structural invariants, not provider-specific ordering.** The facade's `validate_request` tool performs Layer 1 validation: non-empty messages, valid roles, content block type invariants (ToolResultBlock only in tool-role messages, etc.), context window estimation. It does not enforce provider-specific message ordering because ordering constraints are not universal.

2. **Provider-specific ordering constraints are validated by the adapter at the seam.** The Anthropic adapter validates alternation before dispatch. The Gemini adapter validates its own ordering rules. The OpenAI adapter imposes no ordering constraint. When an adapter rejects a message sequence for ordering violations, it returns a `validation_error` with a message that identifies the specific constraint (e.g., "Anthropic requires strict user/assistant role alternation; found consecutive user messages at positions 3 and 4"). This is consistent with Principle 6 (Fail Explicitly): the error is clear, actionable, and occurs before the request reaches the provider.

3. **Add `requires_alternation` to ModelCapabilities.** A new boolean field on ModelCapabilities:

   ```
   requires_alternation: boolean   // true when the provider enforces strict user/assistant role alternation
   ```

   This lets consumers who want to pre-validate check the constraint before sending. It is a discoverable capability, consistent with the facade's pattern of making constraints explicit through capability discovery rather than hiding them until failure.

4. **The ToolCallingChoreography already handles alternation for tool messages.** Anthropic tool results are embedded in user messages (ToolCallingChoreography Section 3.2), which naturally maintains alternation within tool-calling flows. The adapter ensures this structural compliance. Consumers building manual message sequences (without tool calling) are the primary audience for `requires_alternation`.

5. **The facade does not enforce Anthropic's alternation on all providers.** Enforcing the strictest constraint universally would reject valid OpenAI requests and violate the principle that the facade abstracts commonality without imposing unnecessary restrictions. The constraint is provider-specific and is treated as such.

**Changes required:**
- **TypeSpecification.md Section 3.2 (ModelCapabilities):** Add `requires_alternation: boolean` field with invariant: "When true, the message sequence must alternate between user and assistant roles after an optional initial system message. Tool-role messages follow assistant messages containing ToolUseBlocks and do not count as violations."
- **DomainModel.md Section 2.2:** Add `requires_alternation` to the capability table with the note: "Provider-specific constraint. True for Anthropic and Gemini. False for OpenAI, Mistral, Cohere, and most local runtimes."
- **DomainModel.md Section 1.1:** Add a note to the Role Alternation paragraph: "The facade does not enforce alternation universally. Providers that require alternation advertise this via `requires_alternation` in ModelCapabilities. The adapter validates ordering at the seam and returns a `validation_error` with a clear message on violation."

**Residual risk:** Low. The combination of capability-advertised constraints and adapter-level validation provides both discoverability and enforcement. The only gap is that `validate_request` cannot catch ordering violations without knowing the target model -- but `validate_request` already requires a model parameter, so it can look up `requires_alternation` and perform the check. This means `validate_request` can give accurate ordering feedback when implemented. No fundamental architectural change is needed.

---

## Soft Spot 13: Vendor-Provided Built-In Tools Are Uncategorized

**Revision likelihood:** MEDIUM
**Severity:** LOW
**Seam impact:** BELOW-SEAM

### What it is

The taxonomy classifies tool calling as user-defined function schemas. The Gemini cross-validation identified a distinct category: vendor-provided built-in tools (Google Search grounding, Code Execution) that the model can use natively without user-defined schemas.

### Why it is soft

These built-in tools are ontologically different from user-defined tools:
- They are capabilities of the model-provider pair, not of the caller's schema.
- They do not require the caller to define or implement anything.
- They produce output that is structurally different from user-defined tool results (search grounding produces citations, code execution produces stdout/stderr).
- They blur the line between "generation" and "tool use" -- the model generates content that includes search results or code execution results as part of its output.

Currently only Gemini exposes these prominently, but the pattern may spread as models gain native capabilities (web browsing, code execution, file analysis).

### Current taxonomy position

Not addressed. Tool calling in the taxonomy is exclusively about user-defined function schemas.

### Direction of drift

If other providers follow Gemini's pattern (OpenAI's browsing and code interpreter, Anthropic's computer use, etc.), vendor-provided tools become a common capability that the facade should discover and possibly configure, even if their results are provider-specific.

### Trigger for revision

- When multiple providers offer built-in tools and callers need to enable/disable them through the facade.
- When built-in tool output (citations, code execution results) needs to be represented in completion responses.

### Consequence if wrong

- Built-in tools are invisible to the facade: callers cannot enable Google Search grounding or Code Execution through the normalized interface.
- The capability discovery model cannot report built-in tool availability.
- The impact is low because built-in tools work through the extension bag and are currently a Gemini-specific feature.

### Resolution

**Status:** POSITION TAKEN
**Resolved by:** Formal position on built-in tool classification and extension architecture (documented below), with taxonomy already partially updated
**Date resolved:** 2026-03-26

**Position:**

1. **Vendor-provided built-in tools are Layer 2 extensions, not Layer 1 tool definitions.** They are ontologically distinct from user-defined tools: the caller does not define them, does not implement them, and does not receive their results through the tool-calling protocol. They are server-side capabilities of the model-provider pair. Representing them as ToolDefinitions in the `tools` parameter would be a category error -- they have no `input_schema` the caller controls and no `tool_use_id` the caller correlates.

2. **Define a `built_in_tools` extension.** This structured extension (per ADR-006) exposes available vendor tools and allows enabling/disabling them per request. The extension's `input_schema` accepts an array of tool identifiers to enable (e.g., `["google_search", "code_execution"]`). The extension's `response_schema` includes tool-specific metadata (search grounding metadata, code execution output). This is discoverable via `get_model_info` for models that support built-in tools.

3. **Built-in tool output remains below the seam in provider-native format.** Search grounding metadata (citations, URLs, relevance scores) and code execution output (stdout, stderr, exit code) appear in `extension_data` on the response, not in the normalized `content: ContentBlock[]`. The output schemas are too divergent and too provider-specific to normalize at Layer 1. The facade passes this data through the structured extension channel so consumers can use it, but does not pretend it is universal.

4. **The taxonomy already classifies these correctly.** The OntologicalTaxonomy Section 2 (Function Taxonomy, Level 1 Species) includes "Augmented Generation" under the Generative Genus: "Generation enhanced by vendor-provided tools (search grounding, code execution) -- Not exposed at core (Tier 2/3, capability-gated)." This classification is accurate and sufficient. The `built_in_tools` extension is the mechanism through which this species is exposed to consumers.

5. **Graduation path.** If built-in tools converge across providers (Google Search grounding + OpenAI web search + Anthropic web search all providing equivalent functionality with comparable output schemas), the converged capability becomes a graduation candidate from Layer 2 to Layer 1. The graduation criteria from ADR-006 apply: multi-provider convergence, normalizable semantics, and demonstrated consumer demand. As of this writing, convergence is occurring (OpenAI, Anthropic, and Google all offer web search), but output schemas remain too divergent for normalization.

**Changes required:**
- **OntologicalTaxonomy.md Section 1.1.3 (Capabilities):** Add a note distinguishing user-defined tool calling (Layer 1, Extended Tier 1) from vendor-provided built-in tools (Layer 2, extension). Reference the Augmented Generation species.
- **OntologicalTaxonomy.md Section 6.5 (Local Runtime Concepts):** No change needed; local runtimes do not have vendor-provided built-in tools.

**Residual risk:** Medium-term. The multi-vendor convergence of web search capabilities (OpenAI, Anthropic, Google all offering it) is creating pressure for graduation. If output schemas converge sufficiently, a `web_search` Layer 1 capability with normalized citation output would be warranted. This should be re-evaluated within 6 months.

---

## Summary: Priority-Ordered Revision Watchlist

| Priority | Soft Spot | Likelihood | Severity | Seam Impact | Resolution Status | Resolved By | Date |
|----------|-----------|------------|----------|-------------|-------------------|-------------|------|
| 1 | **Content is not a string** | HIGH | CRITICAL | SEAM | RESOLVED | ADR-003 | 2026-03-27 |
| 2 | **Token accounting assumes simple arithmetic** | HIGH | HIGH | SEAM | PARTIALLY RESOLVED | ADR-004 + DomainModel | 2026-03-27 |
| 3 | **Tool calling deferred as monolith** | HIGH | HIGH | SEAM | RESOLVED | ADR-005 + ToolCallingChoreography | 2026-03-27 |
| 4 | **Finish reasons collapse with info loss** | HIGH | MEDIUM | SEAM | RESOLVED | TypeSpec FinishReason expansion | 2026-03-27 |
| 5 | **Streaming protocol treated as uniform** | MEDIUM | HIGH | NEAR-SEAM | RESOLVED (gap: block_index) | TypeSpec + ToolCallingChoreography | 2026-03-27 |
| 6 | **Extension bag is load-bearing** | HIGH | MEDIUM | SEAM | RESOLVED | ADR-006 + feature graduations | 2026-03-27 |
| 7 | **Reasoning classified as Tier 3** | HIGH | MEDIUM | NEAR-SEAM | RESOLVED | ADR-004 | 2026-03-27 |
| 8 | **Local runtime model management absent** | MEDIUM | MEDIUM | NEAR-SEAM | POSITION TAKEN | ModelReadiness + error split + extension | 2026-03-26 |
| 9 | **Safety as fixed binary** | MEDIUM | MEDIUM | NEAR-SEAM | POSITION TAKEN | Layer 2 structured extension | 2026-03-27 |
| 10 | **Structured output as single feature** | MEDIUM | MEDIUM | NEAR-SEAM | POSITION TAKEN | Layer 2 extension + tier model | 2026-03-27 |
| 11 | **Sampling pipeline assumed fixed** | LOW | MEDIUM | BELOW-SEAM | POSITION TAKEN | Pedagogical clarification + Layer 2 extension | 2026-03-26 |
| 12 | **Role alternation invisible** | MEDIUM | LOW | NEAR-SEAM | POSITION TAKEN | requires_alternation + adapter validation | 2026-03-26 |
| 13 | **Vendor built-in tools uncategorized** | MEDIUM | LOW | BELOW-SEAM | POSITION TAKEN | built_in_tools Layer 2 extension | 2026-03-26 |

---

## Compound Risks: Where Soft Spots Interact

Some soft spots are not independent. They interact to create compound failure modes that are worse than the sum of their parts.

### Compound Risk A: Content Blocks + Tool Calling + Streaming

**Status: RESOLVED.**

Soft Spots 1, 3, and 5 were addressed together as recommended. ADR-003 (content blocks), ADR-005 (tool calling), and the TypeSpecification's CompletionChunk + ContentBlockDelta model were developed as a coordinated set. Content is now `ContentBlock[]` with ToolUseBlock/ToolResultBlock variants. Streaming carries typed `ContentBlockDelta` (TextDelta, ToolUseDelta, ThinkingDelta). The ToolCallingChoreography documents the complete streaming accumulation algorithm for each provider. One gap remains: `block_index` must be added to CompletionChunk to support interleaved multi-block streaming. This is a field addition, not an architectural change.

### Compound Risk B: Token Accounting + Reasoning + Extension Bag

**Status: PARTIALLY RESOLVED.**

Soft Spots 2, 6, and 7 were addressed together. ADR-004 brought reasoning into the facade (resolving Soft Spot 7). ADR-006 replaced the opaque extension bag with structured extensions (resolving Soft Spot 6). The remaining gap is that the `Usage` type does not carry `reasoning_tokens` separately (Soft Spot 2 residual). When reasoning token reporting converges across providers, this field should be added. The compound risk is no longer critical because reasoning is now a first-class facade concept with capability discovery and parameter normalization.

### Compound Risk C: Finish Reasons + Tool Calling + Agentic Loops

**Status: RESOLVED.**

Soft Spots 3 and 4 were addressed together. ADR-005 brought tool calling into the facade, including the `tool_use` finish reason and the `tool` role. The FinishReason enumeration was expanded to 5 values. The agentic loop (generate -> tool_use -> execute -> feed_result -> generate) is now fully representable in facade types. The ToolCallingChoreography documents the complete multi-turn flow.

---

## Recommendation: Revision Sequencing

Based on compound risk analysis, the optimal revision order is:

1. **Wave 1 (address together):** Content blocks + Tool calling + Finish reasons + Streaming typed deltas. These are architecturally coupled. Doing them piecemeal creates worse intermediate states than doing them together. **STATUS: COMPLETE.** ADR-003, ADR-004, ADR-005, ADR-006, TypeSpecification, ToolCallingChoreography, and DomainModel all revised together.

2. **Wave 2 (address together):** Reasoning tier reclassification + Token accounting expansion + Extension bag graduation criteria. These are operationally coupled. **STATUS: SUBSTANTIALLY COMPLETE.** ADR-004 and ADR-006 addressed the core issues. Residual: `reasoning_tokens` on Usage type.

3. **Wave 3 (address independently):** Local runtime model management, safety configuration, structured output tiers, role alternation. These are independent and can be addressed as needed. **STATUS: POSITIONS TAKEN.** Concrete positions documented for all four. Implementation deferred to when the changes are made to the TypeSpecification and DomainModel.

**Remaining implementation work:**
- Add `block_index` to CompletionChunk in TypeSpecification, DomainModel, and McpServerSpec.
- Add `ModelReadiness` type and `model_not_found` / `model_not_ready` error codes to TypeSpecification and DomainModel.
- Add `requires_alternation` to ModelCapabilities in TypeSpecification and DomainModel.
- Add pedagogical clarification note to OntologicalTaxonomy Section 3.1.
- Add `built_in_tools` and `sampling_advanced` extension descriptors to implementation guidance.

This document should be revisited at minimum every 3 months, or immediately when a cross-validation run produces findings that contradict the taxonomy's Tier classifications.
