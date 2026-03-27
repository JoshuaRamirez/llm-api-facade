# Soft Spots Analysis -- llm-api-facade Ontological Taxonomy

> Where the conceptual model is most likely to need revision as the LLM industry
> evolves. This document exists to help future sessions know where to look first
> when the taxonomy feels stale.

**Status:** Active reference
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

---

## Summary: Priority-Ordered Revision Watchlist

| Priority | Soft Spot | Likelihood | Severity | Seam Impact | First Thing That Breaks |
|----------|-----------|------------|----------|-------------|------------------------|
| 1 | **Content is not a string** | HIGH | CRITICAL | SEAM | Multimodal input, tool-call output, thinking blocks |
| 2 | **Token accounting assumes simple arithmetic** | HIGH | HIGH | SEAM | Reasoning model cost prediction, validate_request accuracy |
| 3 | **Tool calling deferred as monolith** | HIGH | HIGH | SEAM | Agentic workflows, the primary growth vector |
| 4 | **Finish reasons collapse with info loss** | HIGH | MEDIUM | SEAM | Agentic control flow (stop vs. needs-tool-execution) |
| 5 | **Streaming protocol treated as uniform** | MEDIUM | HIGH | NEAR-SEAM | Multi-block streaming (tool calls + text in same response) |
| 6 | **Extension bag is load-bearing** | HIGH | MEDIUM | SEAM | Facade value proposition, normalization coverage |
| 7 | **Reasoning classified as Tier 3** | HIGH | MEDIUM | NEAR-SEAM | Cost control, capability discovery for reasoning models |
| 8 | **Local runtime model management absent** | MEDIUM | MEDIUM | NEAR-SEAM | Local deployment UX, model loading latency |
| 9 | **Safety as fixed binary** | MEDIUM | MEDIUM | NEAR-SEAM | Gemini safety configuration, regulatory compliance |
| 10 | **Structured output as single feature** | MEDIUM | MEDIUM | NEAR-SEAM | Output reliability guarantees, capability discovery |
| 11 | **Sampling pipeline assumed fixed** | LOW | MEDIUM | BELOW-SEAM | Local runtime adapter correctness |
| 12 | **Role alternation invisible** | MEDIUM | LOW | NEAR-SEAM | Anthropic message validation, validate_request accuracy |
| 13 | **Vendor built-in tools uncategorized** | MEDIUM | LOW | BELOW-SEAM | Gemini Search/Code Execution enablement |

---

## Compound Risks: Where Soft Spots Interact

Some soft spots are not independent. They interact to create compound failure modes that are worse than the sum of their parts.

### Compound Risk A: Content Blocks + Tool Calling + Streaming

Soft Spots 1, 3, and 5 interact. If content becomes typed blocks, and tool-call output is a block type, then streaming must convey block identity. Fixing any one of these without the other two creates an inconsistent intermediate state. These three should be revised together as a single architectural change.

### Compound Risk B: Token Accounting + Reasoning + Extension Bag

Soft Spots 2, 6, and 7 interact. If reasoning tokens are significant, they must be accounted for in `usage`. If reasoning configuration is in the extension bag, the facade cannot validate or predict reasoning token consumption. The facade's `validate_request` becomes unreliable for reasoning models.

### Compound Risk C: Finish Reasons + Tool Calling + Agentic Loops

Soft Spots 3 and 4 interact. Tool calling requires `tool_use` as a finish reason. Without both, the facade cannot represent the basic agentic loop: generate -> tool_use -> execute -> feed_result -> generate. This is not two separate features; it is one workflow that requires coordinated changes to tool schemas, finish reasons, message roles, and content types.

---

## Recommendation: Revision Sequencing

Based on compound risk analysis, the optimal revision order is:

1. **Wave 1 (address together):** Content blocks + Tool calling + Finish reasons + Streaming typed deltas. These are architecturally coupled. Doing them piecemeal creates worse intermediate states than doing them together.

2. **Wave 2 (address together):** Reasoning tier reclassification + Token accounting expansion + Extension bag graduation criteria. These are operationally coupled.

3. **Wave 3 (address independently):** Local runtime model management, safety configuration, structured output tiers, role alternation. These are independent and can be addressed as needed.

This document should be revisited at minimum every 3 months, or immediately when a cross-validation run produces findings that contradict the taxonomy's Tier classifications.
