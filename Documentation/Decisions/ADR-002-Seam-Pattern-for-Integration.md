# ADR-002: Seam Pattern for Provider Integration

| Field  | Value      |
|--------|------------|
| ID     | ADR-002    |
| Date   | 2026-03-26 |
| Status | Accepted   |

## Context

The facade must work with multiple LLM backends (OpenAI, Anthropic, local models, future providers) without coupling the public surface to any specific provider. We need an internal boundary that isolates provider-specific integration code from the facade's MCP tools and resources.

## Decision

Define a "seam" -- an internal interface boundary where provider-specific integration code plugs in. The seam is a contract that each provider implementation fulfills. The MCP-facing surface delegates to the seam and has no knowledge of which provider is behind it.

The seam is broader than a simple adapter. It encompasses:
- Request translation (facade semantics to provider API calls)
- Capability negotiation (what a given provider supports)
- Response normalization (provider output to facade semantics)

## Consequences

- Adding a new provider means implementing the seam contract. No MCP tool definitions change.
- Removing or swapping a provider is a localized operation with no ripple effects on consumers.
- The seam contract becomes the critical internal API. Its stability matters more than any single provider integration.
- Testing is simplified: the seam can be fulfilled by a test double without invoking any real provider.

## Alternatives Considered

| Alternative            | Why Not |
|------------------------|---------|
| Direct provider SDKs   | Tight coupling. Every provider change ripples into the facade surface. Violates the core purpose of the project. |
| Plugin system           | Adds dynamic loading, discovery, and versioning machinery. Over-engineered for the current scale of providers. Can evolve to this later if needed. |
| Adapter pattern only    | Adapters handle request/response translation but not capability negotiation or feature detection. The seam is a broader concept that includes adapters as one part. |
