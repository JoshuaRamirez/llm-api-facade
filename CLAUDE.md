# llm-api-facade

## What This Is

An MCP server providing a universal abstraction layer for any LLM backend (local or cloud). The facade exposes a single, stable MCP tool/resource interface. Provider-specific concerns live below the "seam" in the integration plane.

## Architecture

- **Facade surface**: MCP tools (`complete`, `stream_complete`, `list_models`, `get_model_info`, `validate_request`, `estimate_tokens`) and resources (`models://catalog`, `config://state`, `session://{id}`)
- **The Seam**: Load-bearing boundary between universal domain and provider-specific integration. Nothing provider-specific crosses upward.
- **Integration Plane**: Not yet implemented. Will contain provider adapters implementing `ICompletionProvider`.

## Key Principles

1. Provider Opacity (Layer 1) — universal types contain no provider references
2. Lowest Common Denominator + Capability Discovery — default is universal; discover extensions for more
3. Parameter Normalization — one vocabulary for Layer 1, typed schemas for Layer 2
4. The Seam Organizes — normalizes Layer 1 (lossy funnel), organizes Layer 2 (lossless lens)
5. Stateless by Default
6. Fail Explicitly — typed, categorized errors
7. Token Awareness — every response reports token usage
8. Structured Extension Discovery — provider-specific features are named, typed, discoverable, never opaque

## Project Phase

Documentation and architectural design. No implementation code yet.

## Documentation

### Architecture
- `Documentation/Architecture/Principles.md` — 7 governing principles
- `Documentation/Architecture/DomainModel.md` — universal concepts, behavioral contracts, seam definition
- `Documentation/Architecture/McpServerSpec.md` — MCP server surface spec (tools, resources, schemas)
- `Documentation/Architecture/ProviderAnalysis.md` — cross-provider analysis (11 providers)
- `Documentation/Architecture/OntologicalTaxonomy.md` — categorical framework, cross-validated against all vendor inventories (843 lines, 15 corrections applied)
- `Documentation/Architecture/TypeSpecification.md` — formal type specification: value objects, enumerations, entities, request types, error hierarchy, seam interface, state machine, 48 named invariants (1160 lines)
- `Documentation/Architecture/SoftSpots.md` — 13 identified weak points in the conceptual model, prioritized by likelihood/severity/seam-impact, with compound risk analysis and revision wave sequencing
- `Documentation/Architecture/ToolCallingChoreography.md` — multi-turn tool calling flows through the facade, provider divergence map (7 dimensions × 8 providers), role translation, streaming accumulation, thinking interaction, adapter implementor checklist (1137 lines)
- `Documentation/Architecture/PositionPaper-FacadeAsInformationArchitecture.md` — the facade organizes the entire LLM interaction space (universal + provider-specific), not just normalizes. The seam is a lens, not a wall. Dual-layer ontology.
- `Documentation/Architecture/ExtensionCatalog.md` — 5 concrete Layer 2 extensions with full schemas, adapter translation tables, guarantee-level matrices, and graduation likelihood

### Vendor Inventories (authoritative reference)
- `Documentation/Vendors/OpenAI.md` — 581 lines. Every parameter, role, content block, error, model. Boundary-classified.
- `Documentation/Vendors/Anthropic.md` — 702 lines. Messages API, content blocks, streaming events, cache control, thinking.
- `Documentation/Vendors/Google-Gemini.md` — 634 lines. Parts-based content, safety settings, thinking config, AI Studio vs Vertex.
- `Documentation/Vendors/Mistral-Cohere-xAI.md` — 811 lines. Three providers with divergence analysis.
- `Documentation/Vendors/Local-Runtimes.md` — 1134 lines. Ollama, llama.cpp, vLLM, LM Studio, text-generation-webui. Native + OAI-compat gaps.

### Decisions
- `Documentation/Decisions/ADR-*.md` — architecture decision records

## Conventions

- ADR format: use `Documentation/Decisions/ADR-Template.md`
- Each class in its own file
- No provider-specific concepts in facade-layer code
- Errors must be typed and categorized per the error taxonomy in DomainModel.md
