# Architectural Principles

These principles govern all design and implementation decisions in the llm-api-facade project. Each principle carries a definition, a rationale, and a concrete implication for the codebase.

The facade operates as an **information architecture** with two layers: a universal layer (Layer 1) that normalizes what is common across providers, and an extension layer (Layer 2) that organizes what is distinctive. Both layers are first-class. See `PositionPaper-FacadeAsInformationArchitecture.md` for the philosophical grounding.

## Principle Table

| # | Principle | Definition | Rationale | Implication |
|---|-----------|------------|-----------|-------------|
| 1 | **Provider Opacity (Layer 1)** | The universal layer contains zero references to any specific LLM provider, model family, or vendor SDK. A consumer using only Layer 1 types cannot detect which backend serves a request. | If universal types leak provider identity, the normalization has failed and the facade becomes a routing layer, not an abstraction. | No provider names, SDK types, or vendor-specific error codes may appear in any Layer 1 type, parameter, or response shape. Layer 2 (extensions) is explicitly provider-attributed — opacity does not apply there. |
| 2 | **Lowest Common Denominator + Capability Discovery** | The default contract (Layer 1) exposes only what every supported LLM can do; additional capabilities are surfaced through discovery — both universal capabilities (Layer 1 Extended) and provider-specific extensions (Layer 2). | Designing for the union of all features creates a brittle surface; designing for the intersection keeps the contract stable. Designing for only the intersection leaves valuable features inaccessible. | The base request/response types remain minimal. Consumers query `get_model_info` to discover both capability flags (Layer 1) and available extensions with schemas (Layer 2). |
| 3 | **Parameter Normalization** | One canonical vocabulary describes all generation parameters (temperature, max tokens, stop sequences, etc.), and the facade maps these to each provider's native terms internally. | Forcing consumers to learn provider-specific parameter names defeats the purpose of a facade and creates coupling that survives backend swaps. | A single parameter schema exists at the seam for Layer 1 parameters. Layer 2 extensions have their own schemas, registered per extension, validated by the facade. |
| 4 | **The Seam Organizes** | The seam is the boundary between the facade and the integration plane. For Layer 1, it normalizes (many shapes into one). For Layer 2, it organizes (provider-specific features into typed, discoverable extensions). Infrastructure concerns (authentication, retry, rate limiting, credentials) never cross the seam in either direction. | The seam's dual function — normalization and organization — serves consumers who want portability (Layer 1) and consumers who want capability (Layer 2). Suppressing all specificity forces advanced consumers around the facade. | Consumer-facing modules depend on facade types only (Layer 1 + extension schemas). Adapter modules translate both Layer 1 types and Layer 2 extension values. Infrastructure concerns (auth, retry, transport) remain entirely within adapters. |
| 5 | **Stateless by Default** | The facade does not own, persist, or manage conversation history; each request is self-contained. | State ownership creates coupling between the facade and a storage layer, introduces consistency problems across distributed instances, and conflates message processing with session management. | Consumers pass full context with each request; if conversation management is needed, it is handled by a layer above the facade that composes messages before submission. |
| 6 | **Fail Explicitly** | Every error is represented as a typed, categorized value with enough information for the consumer to decide what to do next; no error is swallowed, generalized, or logged-and-ignored. | Silent failures and generic error messages force consumers into defensive guessing and make debugging distributed systems nearly impossible. | The error model includes a category (genus.species from the error taxonomy), a human-readable message, a retryable flag, and a correlation ID. Extension-related errors carry the extension ID that caused them. |
| 7 | **Token Awareness** | Every interaction reports token consumption (input tokens, output tokens, total tokens) as a first-class part of the response, regardless of whether the provider natively surfaces this data. | Token counts are the fundamental unit of LLM economics and the primary lever for capacity planning; a facade that hides them is hiding the most important operational signal. | Every response shape includes a token usage block with an `is_approximate` flag. If a provider does not return token counts natively, the adapter estimates them and marks the estimate as approximate. |
| 8 | **Structured Extension Discovery** | Provider-specific features are exposed as named, typed, discoverable extensions — never as opaque pass-through data. | An opaque extension bag provides no validation, no discoverability, and no schema. It forces consumers to have out-of-band knowledge of provider APIs, undermining the facade's organizational value. | Every extension is registered with an identifier, description, and JSON Schema. `get_model_info` reports available extensions. The facade validates extension values against schemas. Invalid extensions are rejected at the facade boundary. |

## How to Read This Table

- **Definition** states what the principle requires in concrete terms.
- **Rationale** explains why violating it causes architectural harm.
- **Implication** describes the specific constraint it places on implementation.

When a design decision conflicts with one of these principles, the conflict must be documented and justified before proceeding. These are load-bearing constraints, not aspirational guidelines.

## Layer Summary

| Layer | Governed By | Consumer Experience | Provider Knowledge Required |
|-------|------------|--------------------|-----------------------------|
| Layer 1 (Universal) | Principles 1-7 | Provider-agnostic. Portable across backends. | None. |
| Layer 2 (Extensions) | Principle 8 | Provider-attributed. Typed and discoverable. | Consumer knows which extensions they want. |
| Infrastructure | Principle 4 (excluded) | Invisible. Never crosses the seam. | None. |
