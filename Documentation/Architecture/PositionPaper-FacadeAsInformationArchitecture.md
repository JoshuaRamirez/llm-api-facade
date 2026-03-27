# Position Paper: The Facade as Information Architecture

> The facade does not exist to hide provider specificity. It exists to organize
> the entire space of LLM interaction — universal and specific — into a single,
> navigable surface.

**Date:** 2026-03-27
**Status:** Accepted
**Supersedes:** The implicit assumption in all prior documents that the facade's
purpose is exclusively normalization and that provider-specific features are
contaminants to be excluded or suppressed.

---

## 1. The Prior Position

The project began with a clear framing: the facade normalizes what is universal
and excludes what is provider-specific. The seam is a wall. Provider Opacity
(Principle #1) means the consumer never encounters provider-specific concepts.
The `provider_extensions` field was conceived as an escape hatch — an opaque
`Map<string, any>` that the facade passes through without interpreting, existing
because pragmatism demands it, not because the architecture wants it.

This framing is internally consistent. It produces a clean universal surface.
And it is incomplete.

---

## 2. The Problem with Pure Normalization

Pure normalization assumes the consumer's intent is provider-agnostic: "I want
a completion from *any* model." But consumers often have specific intent:

- "I want Claude with extended thinking and prompt caching because this task
  requires deep reasoning and the context is expensive to re-encode."
- "I want GPT-4o with predicted output because I'm doing speculative edits
  and want latency reduction."
- "I want a local Ollama model with GBNF grammar constraints because I need
  guaranteed structural conformance without network dependency."

In each case, the consumer chose a specific model for specific reasons. The
universal layer (capability discovery, parameter normalization, typed responses)
is valuable — it provides the vocabulary to express the request and the structure
to interpret the response. But the provider-specific features are not accidents
or exceptions. They are the *reason the consumer chose that model*.

A facade that suppresses these features forces the consumer into one of two
positions:

1. **Use the opaque bag.** The consumer stuffs provider-specific configuration
   into `provider_extensions`, bypassing all type safety, discoverability, and
   validation. The facade becomes a pass-through for the most valuable part of
   the interaction. The abstraction exists but adds no value for the features
   that motivated the model choice.

2. **Go around the facade.** The consumer uses the provider's native API
   directly for anything the facade can't express. The facade becomes irrelevant
   for advanced use cases — precisely the cases where a well-organized interface
   would be most valuable.

Neither outcome serves the consumer. Both indicate that the architecture's
boundary is drawn at the wrong level.

---

## 3. The Reframing: Information Architecture

The facade's purpose is not to hide specificity. It is to **organize the entire
space of LLM interaction** into a coherent, navigable surface. This surface has
two layers, both first-class:

### Layer 1: Universal (Core + Extended)

What all or most LLM interactions share. Messages, completions, token usage,
generation parameters, capability discovery, error taxonomy. This layer is
normalized — the consumer uses facade vocabulary regardless of provider. An
adapter translates at the seam.

This layer is unchanged from the prior position. It is the foundation.

### Layer 2: Provider-Specific (Structured Extensions)

What distinguishes one provider or model from another. Prompt caching strategies,
reasoning budgets, safety configuration, grounding, code execution, speculative
decoding, content moderation granularity. This layer is **structured and
discoverable** — the consumer can query what extensions are available for a given
model and use them through typed schemas.

This layer replaces the opaque `provider_extensions` bag. Instead of an untyped
map, extensions are:

- **Named.** Each extension has a canonical identifier (e.g., `cache_control`,
  `safety_settings`, `predicted_output`).
- **Typed.** Each extension has a schema that the facade knows and can validate.
- **Discoverable.** The consumer queries `get_model_info` and learns which
  extensions are available, with their schemas.
- **Provider-attributed.** The consumer knows this is a provider-specific
  feature. There is no pretense of universality. The attribution is honest.

### The Relationship Between Layers

Layer 1 is stable. It changes slowly and only through ADRs (as with ADR-003
through ADR-005). Layer 2 is dynamic. Extensions appear when providers innovate
and may be removed or graduated to Layer 1 when the industry converges.

Layer 1 is the consumer's default surface — it works without knowing anything
about providers. Layer 2 is the consumer's power surface — it requires knowing
which provider is targeted but rewards that knowledge with access to the full
capability space.

The two layers compose naturally. A request uses Layer 1 types for messages,
parameters, and tools, and optionally includes Layer 2 extensions for provider-
specific features. A response uses Layer 1 types for content, finish reason,
and usage, and optionally includes Layer 2 extension data in the response.

---

## 4. The Seam, Reconceived

Under the prior position, the seam was a lossy funnel: many shapes in, one
shape out, information dropped. This remains true for Layer 1 — the universal
layer still normalizes.

For Layer 2, the seam is a **lens**: it focuses provider-specific features
into a consistent organizational structure without altering their semantics.
The facade does not normalize cache control across Anthropic and Gemini (their
mechanisms are genuinely different). It exposes each through a typed, named
extension that the consumer can discover and use intentionally.

```
  Consumer Side                THE SEAM               Provider Side

  Layer 1 (Universal)         Normalizes              Provider-native formats
  - facade types              - names, shapes          - wire protocols
  - facade parameters         - protocols              - native parameters
  - facade errors             - errors                 - native errors

  Layer 2 (Extensions)        Organizes               Provider-specific features
  - typed, named schemas      - discovery              - prompt caching
  - discoverable              - validation             - safety configuration
  - provider-attributed       - passthrough            - predicted output
                              (semantics preserved)    - grounding, etc.
```

The seam has two modes:
- **Normalization mode** (Layer 1): Many shapes converge into one. Information
  that doesn't fit is dropped. This is the lossy funnel from the original
  taxonomy.
- **Organization mode** (Layer 2): Provider-specific shapes are cataloged,
  typed, and made discoverable. Information is preserved. This is the lens.

---

## 5. What Changes Structurally

### 5.1 `provider_extensions` Becomes `extensions`

The opaque `Map<string, any>` is replaced by a structured map where each key
is a known extension identifier and each value conforms to the extension's
registered schema.

```
NormalizedRequest {
    model: ModelIdentity
    messages: Message[]
    parameters: GenerationParameters
    extensions: Map<ExtensionId, ExtensionValue>?
}
```

The facade validates extension values against their schemas before passing
them to the adapter. Invalid extensions are rejected with a validation error,
not silently passed through.

### 5.2 `ModelCapabilities` Includes Extension Discovery

```
ModelCapabilities {
    // Layer 1 (unchanged)
    context_window: int
    max_output_tokens: int
    supports_streaming: bool
    supports_tool_calling: bool
    supports_thinking: bool
    supports_vision: bool
    supported_parameters: ParameterSupport

    // Layer 2 (new)
    available_extensions: ExtensionDescriptor[]
}
```

Each `ExtensionDescriptor` carries:
- `id`: canonical extension identifier
- `name`: human-readable name
- `description`: what the extension does
- `schema`: the input schema (for request-side extensions)
- `response_schema`: the output schema (for response-side extensions, if any)

### 5.3 Responses May Include Extension Data

```
CompletionResponse {
    // Layer 1 (unchanged)
    completion_id: string
    model: string
    content: ContentBlock[]
    finish_reason: FinishReason
    usage: Usage

    // Layer 2 (new)
    extension_data: Map<ExtensionId, ExtensionValue>?
}
```

Extension data on the response carries provider-specific information that the
consumer opted into (e.g., cache hit/miss indicators, detailed token breakdowns,
safety ratings).

### 5.4 The MCP Surface Exposes Extensions

`get_model_info` returns `available_extensions` with schemas. Consumers can
inspect what's available before using it. `complete` and `stream_complete`
accept an `extensions` parameter. Responses include `extension_data` when
relevant.

---

## 6. What Does NOT Change

- **Layer 1 types are unchanged.** Message, ContentBlock, CompletionResponse,
  FinishReason, Usage, the error hierarchy — all remain as specified in the
  TypeSpecification.
- **The seam interface is unchanged.** `ICompletionProvider` still normalizes
  Layer 1 types. Adapters still translate wire formats.
- **Layer 1 remains the default.** A consumer who ignores extensions entirely
  gets the same experience as before — universal types, normalized parameters,
  provider opacity within Layer 1.
- **Core principles hold for Layer 1.** Provider Opacity applies to the
  universal layer. The Seam Is Sacred applies to Layer 1 normalization.

---

## 7. Graduation as a Natural Process

The dual-layer model makes graduation explicit:

| Stage | Layer | Discovery | Typing | Provider Attribution |
|-------|-------|-----------|--------|---------------------|
| **Experimental** | Layer 2 (single provider) | Available on specific models | Extension schema | Explicitly attributed |
| **Converging** | Layer 2 (multi-provider) | Available across providers | Extension schema (may differ per provider) | Attributed but conceptually shared |
| **Graduated** | Layer 1 (Extended) | Capability flag on ModelCapabilities | Facade type (in TypeSpecification) | Provider-agnostic |
| **Core** | Layer 1 (Core) | Always present | Facade type | Universal |

Tool calling followed this path: experimental (provider-specific) → converging
(similar across providers) → graduated (Extended Tier 1, ADR-005). Extended
thinking followed the same path (ADR-004). The dual-layer model makes this
lifecycle visible and intentional rather than implicit.

---

## 8. Philosophical Grounding

The prior position treated the facade as an **epistemological filter**: it
determined what the consumer was allowed to know (universal concepts only) and
suppressed everything else. Provider specificity was noise to be filtered out.

The revised position treats the facade as an **ontological organizer**: it
determines how the entire space of LLM interaction is structured and made
navigable. Universal concepts occupy the stable core. Provider-specific concepts
occupy a dynamic but equally legitimate periphery. Both are part of the map.

This aligns with the project's stated purpose: "a compound and complex basis
for using any LLM via any invocation method, before the integration planes
take effect." The basis includes knowing what's universal AND knowing what's
distinctive. A basis that suppresses distinctiveness is incomplete.

The seam remains the architectural boundary. But its function shifts from
**suppression** (blocking provider-specific information) to **organization**
(structuring provider-specific information alongside universal types). The
seam is not a wall. It is a lens.

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Extension proliferation — too many extensions make the surface overwhelming | Extensions must be registered with schemas. Unregistered keys are rejected. The facade controls the vocabulary. |
| Consumers couple to extensions — then can't switch providers | Extensions are explicitly provider-attributed. The consumer knows they're using a non-universal feature. Layer 1 remains the portable surface. |
| Extension schemas diverge across adapter versions | Schema versioning on ExtensionDescriptor. Breaking changes require a new extension ID. |
| Layer 2 becomes the de facto API, undermining Layer 1 | Monitor the ratio of extension usage to Layer 1 usage. If an extension is used by >50% of requests, it's a graduation candidate. |
| Validation complexity — the facade must understand extension schemas | Schema validation is mechanical (JSON Schema). The facade validates structure; the adapter validates semantics. |

---

## 10. Summary

The facade is not a normalizer that happens to have an escape hatch. It is an
information architecture with two layers:

- **Layer 1 (Universal):** Normalized, provider-agnostic, stable. The default
  surface for consumers who want portability.
- **Layer 2 (Extensions):** Structured, discoverable, provider-attributed. The
  power surface for consumers who want capability.

Both layers are organized by the facade. Both cross the seam. Both are typed
and validated. The difference is that Layer 1 normalizes (one vocabulary for
all providers) while Layer 2 organizes (each provider's distinctive features
in a consistent structure).

This is not a relaxation of architectural rigor. It is a more complete
expression of what the facade exists to do.
