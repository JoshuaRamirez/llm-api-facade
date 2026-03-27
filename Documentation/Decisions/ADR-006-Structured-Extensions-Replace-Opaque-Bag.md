# ADR-006: Structured Extensions Replace Opaque Provider Extensions Bag

| Field  | Value      |
|--------|------------|
| ID     | ADR-006    |
| Date   | 2026-03-27 |
| Status | Accepted   |

## Context

The initial domain model defined `provider_extensions: Map<string, any>` as an opaque pass-through on NormalizedRequest. The intent was pragmatic: provider-specific features could flow through the facade without the facade interpreting them.

This design treated provider specificity as an exception — an escape hatch from the normalization that the facade exists to provide. Cross-validation and architectural review revealed two problems:

1. **The opaque bag undermines the facade's value for advanced use cases.** A consumer using Claude's prompt caching or Gemini's safety settings must construct untyped, undiscoverable payloads. The facade provides no validation, no schema, and no way to learn what's available. The consumer needs out-of-band knowledge of the provider's native API, defeating the purpose of having a facade.

2. **Provider specificity is not an exception — it is the reason consumers choose specific models.** A consumer who selects Claude Opus for extended thinking is not fighting the abstraction. They made an intentional choice. The facade should make that choice expressible through the same structured, typed surface that serves universal features.

See: `PositionPaper-FacadeAsInformationArchitecture.md` for the full philosophical grounding.

## Decision

Replace `provider_extensions: Map<string, any>` with `extensions: Map<ExtensionId, ExtensionValue>` where:

- Each extension has a registered identifier, human-readable name, description, and JSON Schema.
- Extensions are discoverable via `get_model_info`, which reports `available_extensions` with schemas.
- The facade validates extension values against their schemas before passing to the adapter.
- Responses include `extension_data: Map<ExtensionId, ExtensionValue>` for provider-specific response information the consumer opted into.

Extensions are explicitly provider-attributed. The consumer knows they are using a non-universal feature. Layer 1 (universal types) remains the portable default.

## Consequences

- Consumers can discover what provider-specific features are available for any model through the same MCP tool (`get_model_info`) they already use for universal capabilities.
- Extension values are validated against schemas at the facade boundary. Malformed extension data is rejected before reaching the adapter.
- Adapters register their supported extensions at startup alongside model capabilities. Adding a new extension requires registering its schema, not changing facade core types.
- The facade vocabulary grows to include extension registration, but the growth is in configuration, not in core types.
- `provider_extensions: Map<string, any>` is removed from NormalizedRequest. Existing references must update to the typed `extensions` field.
- The graduation path (experimental → converging → graduated to Layer 1) becomes an explicit lifecycle, not an implicit hope.

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Keep opaque `Map<string, any>` | No validation, no discovery, no typing. The bag becomes the de facto API for power users, undermining the facade's reason for existing. |
| Type every provider feature into Layer 1 | The facade would grow to encompass every provider's full API surface. Unsustainable. Layer 1 must remain stable. |
| Separate MCP tools per provider | Defeats the single-surface design. The consumer must know which tool to call based on provider, reintroducing the provider-awareness the facade was meant to organize. |
| Provider-specific MCP resources instead of extensions on tools | Splits the interaction: the consumer configures via resources but sends requests via tools. Awkward composition. Extensions on the request keep configuration and execution in one place. |
