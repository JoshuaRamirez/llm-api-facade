# ADR-004: Extended Thinking Promoted from Below-Seam to Extended Tier 2

| Field  | Value      |
|--------|------------|
| ID     | ADR-004    |
| Date   | 2026-03-27 |
| Status | Accepted   |

## Context

The initial ontological taxonomy (v1, 2026-03-26) classified extended thinking / reasoning configuration as "Rare, Below-Seam (Tier 3)" with the note "rapidly evolving; not normalizable yet."

Cross-validation against vendor inventories revealed this classification is wrong on both counts:

**Not rare.** Three of five major cloud providers now support thinking/reasoning configuration:
- **Anthropic**: Extended thinking on 100% of current models (Opus 4.6, Sonnet 4.6, Haiku 4.5). `thinking.budget_tokens` being replaced by `output_config.effort` (categorical: low/medium/high/max).
- **OpenAI**: `reasoning_effort` on o-series models (categorical: low/medium/high).
- **Google Gemini**: `thinkingConfig` on 2.5 and 3.x models. Dual mechanisms: `thinkingBudget` (numeric) on 2.5, `thinkingLevel` (categorical: minimal/low/medium/high) on 3.x.

Three providers is "Partial" universality, not "Rare."

**Normalizable.** The industry is converging on a categorical effort level (low/medium/high). All three providers either already support or are migrating toward this model. A facade-level `ReasoningEffort` enum with three values maps cleanly to each provider's mechanism.

**Structural dependency on ADR-003.** Thinking produces `ThinkingBlock` and `RedactedThinkingBlock` content in responses. These blocks carry cryptographic signatures that must be preserved exactly in multi-turn conversations. With ADR-003 adopting content blocks, thinking blocks have a natural home. Without content blocks, thinking would require a side channel.

**Multi-turn integrity.** Anthropic requires that thinking blocks from a previous response be included verbatim in subsequent requests. The signature is integrity-checked. If the facade strips thinking blocks (as Below-Seam classification implies), multi-turn conversations with thinking-enabled models break silently.

## Decision

Reclassify extended thinking from Below-Seam (Tier 3) to Extended (Tier 2, capability-gated).

This means:
1. `supports_thinking` is a first-class capability flag on `ModelCapabilities`.
2. `ThinkingBlock` is a content block variant at the facade layer (per ADR-003).
3. `ReasoningEffort` (low/medium/high) is a facade-level meta-parameter, mapped to provider-specific mechanisms at the seam.
4. Thinking blocks are opaque passthrough — the facade preserves them without interpreting their content or signature.

The facade does NOT normalize:
- Provider-specific budget tokens vs. categorical levels (the seam maps `ReasoningEffort` to whichever mechanism the provider uses)
- Thinking block content (opaque; signature integrity is the provider's concern)
- Redacted thinking (treated as a ThinkingBlock variant; content may be empty)

## Consequences

- Models that support thinking are discoverable via `supports_thinking: true`.
- Callers can request reasoning effort without knowing which provider serves the model.
- Multi-turn conversations with thinking-enabled models work correctly — thinking blocks flow through the facade without corruption.
- The `provider_extensions` bag is no longer needed for basic reasoning configuration (though provider-specific tuning like exact budget_tokens values can still use it).
- Integration plane adapters for Anthropic, OpenAI, and Gemini must map `ReasoningEffort` to their native parameter and must preserve thinking blocks in both directions.
- The parameter space partition (ADR not yet written, documented in OntologicalTaxonomy Section 3.6) interacts with this: on OpenAI o-series, enabling reasoning means sampling parameters are rejected.

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Keep Below-Seam (Tier 3) | Multi-turn with thinking models breaks. The facade becomes a barrier to the fastest-growing capability in the industry. Three providers is not "rare." |
| Promote to Core (Tier 0) | Not universal — many models (GPT-4o, local runtimes) don't support thinking. Capability-gating is appropriate. |
| Expose only the effort enum, strip thinking blocks | Blocks carry signatures required for multi-turn integrity. Stripping them makes the facade incompatible with Anthropic's API contract for thinking conversations. |
| Wait for further convergence | The categorical effort level has already converged across three vendors. Waiting gains nothing; the normalization is clear now. |
