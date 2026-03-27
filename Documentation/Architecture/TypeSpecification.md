# Type Specification -- llm-api-facade

> Formal, language-agnostic specification of all types, their invariants, legal
> state transitions, and construction rules for the llm-api-facade system. This
> document is derived from `OntologicalTaxonomy.md`, `DomainModel.md`, and
> `Principles.md`. It is the authoritative reference from which implementations
> in any language (TypeScript, Python, C#, Rust, Go) should be produced without
> ambiguity.

**Status:** Draft
**Last updated:** 2026-03-26
**Depends on:** `OntologicalTaxonomy.md`, `DomainModel.md`, `Principles.md`
**Scope:** All types that exist at or above the seam. Provider-specific wire
types (below the seam) are explicitly excluded.

---

## Notation Conventions

Throughout this document:

- **T?** means the field is optional (may be absent or null).
- **T[]** means an ordered sequence (array/list) of T.
- **Map<K, V>** means an associative collection from keys of type K to values of type V.
- **positive integer** means an integer strictly greater than zero.
- **non-negative integer** means an integer greater than or equal to zero.
- **float** means a real number, typically IEEE 754 double-precision.
- **string** means a UTF-8 encoded character sequence.
- **object** means an opaque key-value structure whose schema is not constrained by the facade.
- **Invariant** statements are conditions that must hold at all times for any valid instance of the type. Constructing an instance that violates an invariant is a programming error.
- **Construction rule** statements describe the only legal way to create an instance.
- Field names use `snake_case` throughout. Implementations should map to their language's idiomatic casing.

---

## 1. Value Objects (Immutable Artifacts)

All types in this section are immutable once constructed. They have no identity
beyond the equality of their fields. Two value objects with identical fields are
interchangeable. They are never modified in place; new instances are created
when different values are needed.

This immutability reflects the ontological commitment that artifacts are
"events with residue" -- produced once, then consumed (Taxonomy Section 1.1.2).

---

### 1.1 Message

A single unit of conversational content, tagged with a functional role.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | Role | Yes | The functional role this content occupies in the conversational protocol |
| `content` | ContentBlock[] | Yes | The payload of the message, as one or more typed blocks |
| `tool_call_id` | string? | Conditional | Identifies which tool invocation this message responds to |

**Invariants:**

1. `content` must contain at least one element. An empty content sequence is not a valid message.
2. When `role` is `tool`, `tool_call_id` must be non-null and non-empty. A tool result without a correlation to its invocation is meaningless.
3. When `role` is not `tool`, `tool_call_id` must be null. Attaching a tool correlation to a non-tool message is a type error.

**Construction rules:**

- Messages are constructed from their fields and validated at construction time. No post-construction mutation is permitted.
- Convenience: when the caller provides a bare string as content, the constructor must wrap it as `[TextBlock { text: <the string> }]`. This shorthand exists only at API boundaries; internally, content is always `ContentBlock[]`.

---

### 1.2 ContentBlock (Discriminated Union)

A single block of typed content within a message. ContentBlock is a tagged
union (sum type). Every instance is exactly one of the following variants.
The discriminant is the variant tag itself (the type of block).

#### Variant: TextBlock

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Plain text content |

**Invariant:** `text` may be the empty string (representing an empty text delta in streaming) but the field itself must be present.

#### Variant: ToolUseBlock

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_use_id` | string | Yes | Unique identifier for this tool invocation |
| `name` | string | Yes | The name of the tool being invoked |
| `input` | object | Yes | The arguments to pass to the tool, as an opaque key-value structure |

**Invariants:**

1. `tool_use_id` must be non-empty.
2. `name` must be non-empty and must match a tool name from the request's tool definitions.
3. `input` must be a valid object (may be empty `{}` if the tool takes no arguments).

#### Variant: ToolResultBlock

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_use_id` | string | Yes | The `tool_use_id` from the ToolUseBlock this result responds to |
| `content` | ContentBlock[] | Yes | The result payload, as one or more content blocks |

**Invariants:**

1. `tool_use_id` must be non-empty and must correspond to a previously issued `ToolUseBlock.tool_use_id` within the same conversation sequence.
2. `content` must contain at least one element.
3. `content` must not contain ToolUseBlock or ToolResultBlock variants (no recursive tool nesting).

#### Variant: ThinkingBlock

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `thinking` | string | Yes | The model's internal reasoning text |
| `signature` | string | Yes | Provider-issued cryptographic signature for the thinking content |

**Invariants:**

1. Both `thinking` and `signature` must be non-empty.
2. The facade treats this block as **opaque passthrough**. The facade must not interpret, transform, validate, or strip the thinking content or its signature. It must be passed through exactly as received from the provider and returned exactly as received from the caller (in multi-turn scenarios).
3. ThinkingBlock is valid only when the model's `supports_thinking` capability is true.

#### Variant: ImageBlock

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `media_type` | string | Yes | MIME type of the image (e.g., `image/png`, `image/jpeg`, `image/webp`, `image/gif`) |
| `data` | string? | Conditional | Base64-encoded image data |
| `source_url` | string? | Conditional | URL pointing to the image |

**Invariants:**

1. Exactly one of `data` or `source_url` must be present and non-empty. Never both. Never neither.
2. `media_type` must be a valid MIME type string matching the pattern `image/*`.
3. When `data` is present, it must be valid base64-encoded content.
4. When `source_url` is present, it must be a well-formed URL.

#### Convenience Construction Rule (applies to all contexts accepting ContentBlock[])

A bare string value is shorthand for `[TextBlock { text: <the string> }]`.
Implementations must accept this shorthand at API boundaries and expand it
before internal processing.

---

### 1.3 CompletionResponse

The complete result of a non-streaming generation request. Represents a
generation event that has concluded.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `completion_id` | string | Yes | Unique identifier for this completion, traceable to the originating request |
| `model` | string | Yes | The model that performed the generation (facade-canonical model identifier) |
| `content` | ContentBlock[] | Yes | The generated content |
| `finish_reason` | FinishReason | Yes | Why generation stopped |
| `usage` | Usage | Yes | Token consumption data for this generation |
| `extension_data` | Map\<string, object\>? | No | Provider-specific response data keyed by extension ID. Present when the provider returns extension-specific information (e.g., cache hit/miss indicators, detailed token breakdowns, safety ratings). |

**Invariants:**

1. `completion_id` must be non-empty. If the provider does not return a completion ID, the facade must generate one.
2. `content` may be empty **only** when `finish_reason` is `content_filter` or `error`. In all other cases, `content` must contain at least one element.
3. When `finish_reason` is `tool_use`, `content` must contain at least one ToolUseBlock.
4. `usage.input_tokens` and `usage.output_tokens` must be present (zero is valid; absent is not). Per Principle 7 (Token Awareness), usage is never omitted.
5. When `extension_data` is present, every key must match a registered extension ID for the model that produced the response. Values must conform to the corresponding `ExtensionDescriptor.response_schema`.

**Construction rule:** Produced exclusively by the integration plane's translation of a provider response into facade types. Never constructed by consumer-side code.

---

### 1.4 CompletionChunk

A single incremental piece of a streaming generation response. Chunks are
produced in order and, when concatenated, yield the equivalent of a
CompletionResponse.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `completion_id` | string | Yes | Stable across all chunks in one stream; identifies the generation |
| `chunk_index` | non-negative integer | Yes | Position of this chunk in the stream, starting at 0 |
| `block_index` | non-negative integer | Yes | Identifies which content block in the final response this delta belongs to (0-based). Required for multi-block streaming where text, tool-use, and thinking deltas interleave. |
| `delta` | ContentBlockDelta | Yes | The incremental content in this chunk |
| `finish_reason` | FinishReason? | Conditional | Present only on the final chunk; null on all preceding chunks |
| `usage` | Usage? | Conditional | Present only on the final chunk; null on all preceding chunks |

**Invariants:**

1. `completion_id` must be non-empty and identical across all chunks in a single stream.
2. `chunk_index` values across all chunks in a single stream must form a contiguous, monotonically increasing sequence beginning at 0: `{0, 1, 2, ..., N}`.
3. `finish_reason` is null on every chunk except the final chunk, where it must be non-null.
4. `usage` is null on every chunk except the final chunk, where it must be non-null.
5. Exactly one chunk in any stream carries a non-null `finish_reason`. This chunk is the terminal chunk.
6. No chunks may be emitted after the terminal chunk.

**Construction rule:** Produced exclusively by the integration plane's translation of a provider's streaming response. The facade may assign `chunk_index` values if the provider does not supply ordered indices natively.

---

### 1.5 ContentBlockDelta (Discriminated Union)

An incremental update to a content block within a streaming chunk. This is the
streaming counterpart of ContentBlock -- it represents a partial addition rather
than a complete block.

#### Variant: TextDelta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | The incremental text fragment |

**Invariant:** `text` may be the empty string (heartbeat or keep-alive delta) but the field must be present.

#### Variant: ToolUseDelta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_use_id` | string? | Conditional | Present on the first delta for a given tool call; null on subsequent deltas for the same call |
| `name` | string? | Conditional | Present on the first delta for a given tool call; null on subsequent deltas |
| `input_json_delta` | string | Yes | Incremental fragment of the JSON-serialized tool input |

**Invariants:**

1. `tool_use_id` and `name` are present together on the first delta of a tool call and null together on subsequent deltas.
2. When all `input_json_delta` fragments for a single tool call are concatenated in order, the result must be a valid JSON object.

#### Variant: ThinkingDelta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `thinking` | string | Yes | Incremental fragment of the model's reasoning |

**Invariant:** Opaque passthrough. The facade must not interpret the content.

---

### 1.6 Usage

Token consumption data for a generation request. Per Principle 7 (Token
Awareness), every response and every terminal streaming chunk must include
this type.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input_tokens` | non-negative integer | Yes | Number of tokens consumed by the input (prompt) |
| `output_tokens` | non-negative integer | Yes | Number of tokens produced in the output (completion) |
| `is_approximate` | boolean | Yes | True when the provider did not report token counts and the facade estimated them |

**Invariants:**

1. Neither `input_tokens` nor `output_tokens` may be negative.
2. When `is_approximate` is false, the values are as reported by the provider. When `is_approximate` is true, the values are facade-generated estimates and must be treated as lower-confidence data.
3. `is_approximate` must be true when the provider does not natively return token counts. It must be false when the provider's reported values are used directly.

---

## 2. Enumerations

Enumerations are closed sets of named values. Adding a new member to an
enumeration is a breaking change to the specification.

---

### 2.1 Role

The functional role a message occupies in the conversational protocol. Roles
are positions in a protocol, not identities of agents (Taxonomy Section 1.1.1).

| Value | Semantics | Constraints |
|-------|-----------|-------------|
| `system` | Behavioral framing; sets tone, constraints, and instructions for the model | At most one system message per request; when present, it must be the first message in the sequence |
| `user` | Content offered in the position of the human interlocutor | At least one user message must appear in any valid message sequence |
| `assistant` | Content offered in the position of the model's prior output | Valid only after at least one user message in the sequence |
| `tool` | Content offered as the result of a tool invocation | Valid only when tool calling capability is active for the target model; must reference a preceding ToolUseBlock via `tool_call_id` |

**Invariants:**

1. The `tool` role is valid only when the target model's `supports_tool_calling` capability is true. Submitting a tool-role message to a model that does not support tool calling is a validation error.
2. The sequence of roles in a message array must follow a legal conversational grammar. The minimal legal sequence is `[user]`. The maximal grammar is specified in Section 7 (State Machine) under message sequence validation.

---

### 2.2 FinishReason

Why a generation process terminated. Normalized from provider-specific
vocabularies into this canonical set.

| Value | Semantics | Provider Mappings (representative) |
|-------|-----------|-----------------------------------|
| `stop` | Natural completion: the model produced an end-of-sequence token, or a caller-specified stop sequence was encountered | OpenAI `stop`, Anthropic `end_turn` + `stop_sequence`, Gemini `STOP`, Cohere `COMPLETE`, Ollama `stop` |
| `length` | The generation reached the `max_tokens` limit before natural completion | OpenAI `length`, Anthropic `max_tokens`, Gemini `MAX_TOKENS`, Cohere `MAX_TOKENS` |
| `content_filter` | The request or response was blocked by a safety or moderation filter | OpenAI `content_filter`, Gemini `SAFETY` + `RECITATION`, Anthropic: no distinct code (error response) |
| `tool_use` | The model is requesting execution of one or more tools before continuing generation | OpenAI `tool_calls`, Anthropic `tool_use`, Gemini `function_call` |
| `error` | Generation failed for a non-safety reason (provider-side generation failure) | Not a standard provider value; facade-assigned when generation fails mid-process |

**Invariants:**

1. Every CompletionResponse must carry exactly one FinishReason.
2. `tool_use` is valid only when the request included tool definitions and the model's `supports_tool_calling` capability is true.
3. When `finish_reason` is `content_filter`, the response `content` may be empty or may contain partial content up to the filter trigger point.
4. When `finish_reason` is `error`, the response `content` may be empty.

---

### 2.3 ReasoningEffort

A categorical indicator of how much computational effort the model should
invest in internal reasoning (chain-of-thought). This is a facade-level
abstraction over provider-specific reasoning controls.

| Value | Semantics |
|-------|-----------|
| `low` | Minimize reasoning; prioritize speed and token efficiency |
| `medium` | Balanced reasoning depth (provider default when unspecified) |
| `high` | Maximize reasoning depth; the model should invest heavily in internal deliberation |

**Construction rule:** ReasoningEffort is meaningful only for models where `supports_thinking` is true. When submitted to a model that does not support thinking, it is silently ignored with a warning. The integration plane maps these categorical values to provider-specific mechanisms (e.g., Anthropic `thinking.budget_tokens`, OpenAI `reasoning_effort` string values).

---

## 3. Entity Types

Entity types have identity -- two instances with identical field values are
still distinct entities if they have different identities. In this system,
entity identity is established by composite keys, not by surrogate IDs.

---

### 3.1 ModelIdentity

The unique identity of a model within the facade. A model is identified by the
pair of its provider and its model ID, not by either alone (Taxonomy Section
1.1.3: capabilities are relational properties of the model-provider pair).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | Canonical provider name (e.g., `"openai"`, `"anthropic"`, `"ollama"`) |
| `model_id` | string | Yes | Provider-specific model identifier (e.g., `"gpt-4o"`, `"claude-sonnet-4-20250514"`, `"llama3:70b"`) |

**Invariants:**

1. `provider` must be non-empty and must match a registered provider in the facade's current configuration.
2. `model_id` must be non-empty.
3. The pair `(provider, model_id)` is unique within the facade. No two model registrations may share the same composite key.
4. Neither `provider` nor `model_id` may contain whitespace or control characters.

**Equality:** Two ModelIdentity values are equal if and only if both `provider` and `model_id` are equal (case-sensitive string comparison).

---

### 3.2 ModelCapabilities

The set of discoverable capabilities and constraints for a specific model
registration. This is not a static schema -- it is a snapshot of what a
particular model-provider pair can do at the time of query.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `context_window` | positive integer | Yes | Maximum total tokens (input + output) the model can process |
| `max_output_tokens` | positive integer | Yes | Maximum tokens the model can generate in a single completion |
| `supports_streaming` | boolean | Yes | Whether the model supports streaming observation mode |
| `supports_system_message` | boolean | Yes | Whether the model accepts a system-role message |
| `supports_tool_calling` | boolean | Yes | Whether the model supports tool/function calling |
| `supports_thinking` | boolean | Yes | Whether the model supports extended thinking / reasoning |
| `supports_vision` | boolean | Yes | Whether the model accepts ImageBlock content in messages |
| `supported_parameters` | ParameterSupport | Yes | Detailed support information for each optional generation parameter |
| `requires_alternation` | boolean | Yes | Whether the model requires strict user/assistant role alternation in messages. When true, consecutive same-role messages are rejected by the provider. |
| `model_readiness` | ModelReadiness | Yes | Current operational state of the model (always `available` for cloud providers) |
| `available_extensions` | ExtensionDescriptor[] | Yes | Provider-specific features available for this model, with schemas. Empty array if none. |

**Invariants:**

1. `context_window` must be strictly greater than `max_output_tokens`. A model that cannot accept any input is not a valid generation target.
2. `max_output_tokens` must be at least 1.
3. When `supports_system_message` is false, any system-role message in the request must be handled by the integration plane (merged into the first user message, or rejected -- this is an adapter concern).
4. When `supports_tool_calling` is false, submitting tool definitions or tool-role messages is a validation error.
5. Extension IDs within `available_extensions` must be unique. No two ExtensionDescriptor entries may share the same `id`.
6. When `requires_alternation` is true, `validate_request` should check that messages alternate between user and assistant roles (after system message).
7. When `model_readiness.state` is not `available`, the model cannot serve generation requests.

---

### 3.3 ModelReadiness

Represents the current operational state of a model. Cloud providers always
report `available`. Local runtimes expose the full lifecycle.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `state` | string | Yes | One of: `available` (ready to serve), `loading` (being loaded into memory), `unloading` (being removed), `not_loaded` (exists but not in memory), `unavailable` (cannot be used) |
| `estimated_ready_seconds` | integer? | No | Estimated seconds until model reaches `available` state. Present only when `state` is `loading`. Null otherwise. |

**Invariants:**

1. `estimated_ready_seconds` must be non-negative when present.
2. `estimated_ready_seconds` is present only when `state` is `loading`.
3. Cloud adapters always return `{ state: "available", estimated_ready_seconds: null }`.

---

### 3.4 ParameterSupport

Describes which optional generation parameters a specific model accepts, and
what value ranges are legal. This is a structured capability description, not
a parameter set.

For each optional parameter, there is a support descriptor:

#### ParameterDescriptor

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `supported` | boolean | Yes | Whether the model accepts this parameter at all |
| `min` | number? | No | Minimum legal value (inclusive). Present only when `supported` is true and the parameter is numeric. |
| `max` | number? | No | Maximum legal value (inclusive). Present only when `supported` is true and the parameter is numeric. |
| `default` | number? | No | The provider's default value when the caller does not specify one. Present only when `supported` is true. |

#### ParameterSupport Fields

| Field | Type | Description |
|-------|------|-------------|
| `temperature` | ParameterDescriptor | Sampling: logit scaling factor |
| `top_p` | ParameterDescriptor | Sampling: cumulative probability threshold |
| `top_k` | ParameterDescriptor | Sampling: rank-order threshold |
| `frequency_penalty` | ParameterDescriptor | Behavioral: penalize frequent tokens |
| `presence_penalty` | ParameterDescriptor | Behavioral: penalize any repeated tokens |
| `seed` | ParameterDescriptor | Meta: request deterministic generation |
| `stop_sequences` | ParameterDescriptor | Constraint: content-triggered termination sequences |

**Invariants:**

1. When `supported` is false, `min`, `max`, and `default` must all be null.
2. When `supported` is true and `min` and `max` are both present, `min` must be less than or equal to `max`.
3. When `supported` is true and `default` is present and `min`/`max` are present, `default` must fall within `[min, max]`.

---

### 3.4 ExtensionDescriptor

Describes a single provider-specific extension available for a model.
Extensions are the structured, discoverable mechanism through which the
facade organizes provider-specific features (Layer 2 of the dual-layer
architecture). Each descriptor carries enough information for a consumer to
discover, understand, and use an extension without out-of-band knowledge.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Canonical extension identifier (e.g., `"cache_control"`, `"safety_settings"`, `"predicted_output"`) |
| `name` | string | Yes | Human-readable display name |
| `description` | string | Yes | What the extension does |
| `input_schema` | object? | No | JSON Schema for request-side extension values. Null if the extension is response-only. |
| `response_schema` | object? | No | JSON Schema for response-side extension data. Null if the extension is request-only. |

**Invariants:**

1. `id` must be non-empty, lowercase, underscore-separated (`snake_case`). It must match the pattern `[a-z][a-z0-9_]*`.
2. `name` must be non-empty.
3. `description` must be non-empty.
4. At least one of `input_schema` or `response_schema` must be non-null. An extension that accepts no input and produces no output has no reason to exist.
5. `id` must be unique within a provider's extension registry (enforced via ModelCapabilities invariant 5).
6. When `input_schema` is present, it must be a valid JSON Schema object.
7. When `response_schema` is present, it must be a valid JSON Schema object.

**Construction rule:** ExtensionDescriptors are produced by the integration-plane adapter during model registration or discovery. The adapter defines which extensions its provider supports and provides the schemas for each. The facade treats these descriptors as authoritative for validation.

---

## 4. Request Types

Request types carry the caller's intent into the facade. The
NormalizedRequest is the pivotal type that crosses the seam -- it is the
canonical representation that every integration-plane adapter receives.

---

### 4.1 GenerationParameters

Parameters that govern how generation behaves. Organized by topological
region (Taxonomy Section 3) rather than as a flat bag of key-value pairs.
This grouping reflects the ontological distinction between parameters that
shape the probability distribution, parameters that define boundaries,
parameters that modify the scoring process, and parameters that govern the
meta-level process.

#### Sampling Region

Parameters that shape the token probability distribution. They operate on the
logit or probability space during the sampling pipeline.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `temperature` | float? | No | Logit scaling factor. Higher values flatten the distribution (more random); lower values sharpen it (more deterministic). |
| `top_p` | float? | No | Cumulative probability threshold. Only tokens whose cumulative probability mass is within this threshold are considered. |
| `top_k` | non-negative integer? | No | Rank-order threshold. Only the top K most probable tokens are considered. |

**Invariants:**

1. When present, `temperature` must be within the range `[0.0, 2.0]`. A value of 0.0 collapses the distribution to argmax (greedy decoding).
2. When present, `top_p` must be within the range `(0.0, 1.0]`. A value of 0.0 is degenerate and not permitted. A value of 1.0 means no truncation.
3. When present, `top_k` must be a positive integer (at least 1). A value of 1 collapses to argmax regardless of temperature.
4. These parameters compose sequentially in the order: temperature, then top_k, then top_p (per Taxonomy Section 3.1). However, the facade does not enforce this ordering -- it is an implementation detail of the generation engine.

#### Constraints Region

Parameters that define boundaries on generation. Violating a constraint is an
error condition, not a preference (Taxonomy Ontological Commitment 4).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `max_tokens` | positive integer | Yes | Maximum number of tokens to generate. This is the caller's output budget. |
| `stop_sequences` | string[]? | No | Sequences that, when generated, cause generation to halt. The stop sequence itself may or may not be included in the output, depending on the provider. |

**Invariants:**

1. `max_tokens` must be at least 1 and must not exceed the model's `max_output_tokens` capability.
2. When present, `stop_sequences` must contain at least one element and each element must be a non-empty string.
3. The maximum number of stop sequences is provider-dependent. The facade accepts up to 8; the integration plane may truncate with a warning for providers with lower limits.

#### Behavioral Region

Parameters that modify how token scores are computed, based on prior context.
These alter the logit distribution construction, not the sampling from it
(Taxonomy Section 3.3).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `frequency_penalty` | float? | No | Penalizes tokens proportional to their frequency in prior output |
| `presence_penalty` | float? | No | Flat penalty for any token that has appeared in prior output |

**Invariants:**

1. When present, `frequency_penalty` must be within `[-2.0, 2.0]`.
2. When present, `presence_penalty` must be within `[-2.0, 2.0]`.

#### Meta Region

Parameters that govern the generation process at a level above individual
token decisions (Taxonomy Section 3.5).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `seed` | integer? | No | Requests deterministic generation (best-effort; not guaranteed by any provider) |
| `reasoning_effort` | ReasoningEffort? | No | How much internal reasoning the model should perform |

**Invariants:**

1. When present, `seed` must be a non-negative integer.
2. `reasoning_effort` is meaningful only when the target model's `supports_thinking` capability is true. When submitted to a non-thinking model, it must be silently ignored with a warning emitted.

#### Structural Region

Parameters that constrain the shape or format of the output, distinct from
its semantic content (Taxonomy Section 3.4).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `response_format` | ResponseFormat? | No | Constrains the serialization format of the output |
| `tools` | ToolDefinition[]? | No | Definitions of tools the model may invoke |
| `tool_choice` | ToolChoice? | No | Constrains whether and which tools the model may invoke |

**Invariants:**

1. `tools` may only be present when the target model's `supports_tool_calling` capability is true.
2. When `tools` is present, it must contain at least one element.
3. `tool_choice` may only be present when `tools` is present.
4. When `response_format` is present, the integration plane is responsible for determining whether the target model supports it and how to translate it.

---

### 4.2 ResponseFormat

Specifies the desired output serialization format.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | The format type: `"text"`, `"json"`, or `"json_schema"` |
| `schema` | object? | Conditional | A JSON Schema object. Required when `type` is `"json_schema"`; must be null otherwise. |

**Invariants:**

1. When `type` is `"json_schema"`, `schema` must be non-null and must be a valid JSON Schema object.
2. When `type` is `"text"` or `"json"`, `schema` must be null.

---

### 4.3 ToolDefinition

The specification of a tool that the model may invoke during generation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique name of the tool within this request |
| `description` | string | Yes | Human-readable description of what the tool does, used by the model to decide when to invoke it |
| `input_schema` | object | Yes | JSON Schema describing the expected input structure |

**Invariants:**

1. `name` must be non-empty and must be unique within the `tools` array of a single request.
2. `name` must match the pattern `[a-zA-Z0-9_-]+` (alphanumeric, underscore, hyphen only).
3. `description` must be non-empty.
4. `input_schema` must be a valid JSON Schema object.

---

### 4.4 ToolChoice

Constrains the model's tool invocation behavior.

| Value / Form | Semantics |
|-------------|-----------|
| `"auto"` | The model decides whether to invoke a tool or generate text (default) |
| `"none"` | The model must not invoke any tool; generate text only |
| `"required"` | The model must invoke at least one tool |
| `{ name: string }` | The model must invoke the specific named tool |

**Invariants:**

1. When ToolChoice is `{ name: string }`, the named tool must exist in the request's `tools` array.

---

### 4.5 NormalizedRequest

The canonical request type that crosses the seam. This is the single shape
that every integration-plane adapter receives, regardless of provider. It is
the outbound half of the seam contract (Taxonomy Section 5.1).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelIdentity | Yes | The target model for generation |
| `messages` | Message[] | Yes | The conversational context, ordered |
| `parameters` | GenerationParameters | Yes | All generation parameters, grouped by region |
| `stream` | boolean | Yes | Whether the caller requests streaming observation mode |
| `extensions` | Map\<string, object\>? | No | Typed extension values keyed by extension ID. Each value must conform to the corresponding `ExtensionDescriptor.input_schema`. |

**Invariants:**

1. `messages` must be non-empty.
2. The first message in `messages` must have role `system` or `user`. No other role may occupy the first position.
3. When a `system` message is present, it must be the first and only system message.
4. The estimated input token count plus `parameters.constraints.max_tokens` must not exceed `model`'s `context_window`. This is the context window pre-check required by the domain model (DomainModel Section 1.6).
5. All tool-role messages must have `tool_call_id` values that reference `tool_use_id` values from ToolUseBlocks in preceding assistant messages within the same sequence.
6. Every key in `extensions` must match an `id` in the target model's `available_extensions`. Keys that do not correspond to a registered extension are rejected at validation time.
7. Every value in `extensions` must validate against the corresponding `ExtensionDescriptor.input_schema`. Schema validation failures are reported as `validation_error`.

**Construction rule:** The facade layer constructs a NormalizedRequest from the caller's raw input by:
1. Resolving the model identifier to a ModelIdentity.
2. Normalizing messages (applying the bare-string convenience rule).
3. Validating all invariants.
4. Assigning a correlation ID (carried externally, not on this type).

---

## 5. Error Hierarchy

Errors are classified by their **nature** -- the kind of failure they
represent -- not by transport codes (Taxonomy Section 4, Ontological
Commitment 7). The error hierarchy has four genera and thirteen species.

---

### 5.1 FacadeError

The base error type. Every error in the facade system is a FacadeError.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | ErrorCategory | Yes | The genus and species of the error |
| `code` | string | Yes | A machine-readable error code (e.g., `"validation_error.empty_messages"`) |
| `message` | string | Yes | Human-readable description of what went wrong |
| `retryable` | boolean | Yes | Whether the caller should retry the same request |
| `correlation_id` | string | Yes | Links this error to the originating request |
| `provider_code` | string? | No | The raw error code from the provider, preserved for diagnostics but opaque to the facade layer |

**Invariants:**

1. `code` must be non-empty and should follow the pattern `"<genus>.<species>"` or `"<genus>.<species>.<detail>"`.
2. `message` must be non-empty.
3. `correlation_id` must be non-empty and must match the correlation ID assigned to the request that produced this error.
4. `provider_code` must be null for errors that originate within the facade itself (validation errors, internal errors). It may be non-null only for errors that originate from a provider response.
5. The `retryable` flag must be consistent with the error category's retryability as specified below. A non-retryable category must not carry `retryable: true`.

---

### 5.2 ErrorCategory (4-Genus, 13-Species Hierarchy)

```
ErrorCategory
 |
 +-- PreconditionFailure
 |    |
 |    +-- validation_error         Retryable: No
 |    |   The request is malformed, incomplete, or violates an invariant.
 |    |   Examples: missing model, empty messages, parameter out of range,
 |    |   wrong message role ordering.
 |    |
 |    +-- authentication           Retryable: No
 |    |   The caller's identity cannot be verified.
 |    |   Examples: invalid API key, expired bearer token, missing credentials.
 |    |
 |    +-- permission               Retryable: No
 |    |   The caller's identity is verified but lacks access.
 |    |   Examples: valid key without access to the requested model or feature.
 |    |
 |    +-- model_not_found           Retryable: No
 |    |   The target model does not exist in the provider's registry.
 |    |   Examples: typo in model name, model deregistered.
 |    |
 |    +-- model_not_ready           Retryable: Yes
 |         The target model exists but is not currently available to
 |         serve requests. Check model_readiness for state details.
 |         Examples: model not loaded (local runtime), model loading,
 |         model temporarily offline.
 |
 +-- CapacityFailure
 |    |
 |    +-- context_overflow          Retryable: No
 |    |   The input exceeds the model's structural capacity (context window).
 |    |   The caller must reduce input size, not retry the same request.
 |    |
 |    +-- rate_limited              Retryable: Yes
 |    |   The provider is throttling requests. The caller should wait and
 |    |   retry after a backoff period.
 |    |
 |    +-- quota_exceeded            Retryable: No
 |         A billing or allocation limit has been reached.
 |         The caller must increase their allocation, not retry.
 |
 +-- ProcessFailure
 |    |
 |    +-- content_filtered          Retryable: No
 |    |   The request or response violated a normative (safety) boundary
 |    |   during processing. The caller must change the prompt or accept
 |    |   the filter.
 |    |
 |    +-- timeout                   Retryable: Yes
 |    |   The generation process exceeded its time budget. Retrying may
 |    |   succeed if load conditions change.
 |    |
 |    +-- stream_interrupted        Retryable: Yes
 |         A streaming generation was broken mid-delivery. Partial data
 |         delivered before the interruption must be discarded. Retry
 |         from scratch.
 |
 +-- SystemFailure
      |
      +-- provider_error            Retryable: Yes
      |   The provider returned an internal error (typically HTTP 5xx).
      |   Transient; retrying is appropriate.
      |
      +-- internal_error            Retryable: Conditional
      |   The facade itself failed. Retryable if the cause is transient
      |   (e.g., temporary resource exhaustion); not retryable if the
      |   cause is a bug.
      |
      +-- unknown                   Retryable: Unknown
           An error that cannot be classified into any other species.
           The raw provider error is preserved in `provider_code` when
           available. The caller must decide retry strategy based on
           context.
```

**Invariant:** Every FacadeError must be classifiable into exactly one species. If classification is not possible, the error is `unknown`.

---

### 5.3 Retryability Contract

| Retryable Value | Meaning for the Caller |
|----------------|----------------------|
| `true` | The same request, submitted again after an appropriate delay, has a reasonable chance of succeeding. |
| `false` | The same request will fail again regardless of timing. The caller must change the request or the system configuration. |
| `conditional` (represented as `false` with metadata) | Retryability depends on context. The `message` field should explain the condition. Implementations may use a tri-state or encode the condition in the error code. |

---

## 6. The Seam Interface

The seam is the ontological boundary between the universal domain (facade)
and the particular domain (provider-specific integration). It is defined by
a single interface contract that all integration-plane adapters must
implement.

---

### 6.1 ICompletionProvider

```
interface ICompletionProvider {

    resolve_model(model_id: string)
        -> (ModelIdentity, ModelCapabilities)
         | FacadeError[model_not_found / model_not_ready]

    complete(request: NormalizedRequest)
        -> CompletionResponse
         | FacadeError

    complete_stream(request: NormalizedRequest)
        -> Stream<CompletionChunk>
         | FacadeError
}
```

#### Method: resolve_model

**Purpose:** Given a model identifier string, determine whether this provider can serve it and, if so, return the model's identity and capabilities.

**Preconditions:**
- `model_id` is a non-empty string.

**Postconditions on success:**
- Returns a valid ModelIdentity where `provider` matches this adapter's provider name.
- Returns a valid ModelCapabilities reflecting the model's current capabilities.

**Postconditions on failure:**
- Returns a FacadeError with category `model_not_found / model_not_ready` if the model does not exist or is not currently available from this provider.

#### Method: complete

**Purpose:** Execute a batch (non-streaming) completion request against the provider's API.

**Preconditions:**
- `request` is a valid NormalizedRequest (all invariants satisfied).
- `request.stream` is false.
- `request.model` identifies a model served by this provider.

**Postconditions on success:**
- Returns a valid CompletionResponse.
- The response was produced by translating the provider's native response into facade types. No provider-specific types, field names, or structures are present in the return value.
- `usage` is populated (estimated if the provider does not report it natively, with `is_approximate` set to true).

**Postconditions on failure:**
- Returns a FacadeError with the appropriate category from the error hierarchy.
- `provider_code` is populated when the error originated from the provider.
- No provider-specific exception types, error structures, or HTTP status codes are exposed.

#### Method: complete_stream

**Purpose:** Execute a streaming completion request against the provider's API.

**Preconditions:**
- `request` is a valid NormalizedRequest (all invariants satisfied).
- `request.stream` is true.
- `request.model` identifies a model served by this provider.
- The model's `supports_streaming` capability is true.

**Postconditions on success:**
- Returns a Stream (asynchronous ordered sequence) of valid CompletionChunks.
- Chunks are emitted in order with contiguous `chunk_index` values starting at 0.
- The final chunk carries a non-null `finish_reason` and non-null `usage`.
- No chunks are emitted after the final chunk.
- Concatenating all TextDelta values in order produces the same text content as a batch completion for the same request would have returned (modulo non-determinism in generation).

**Postconditions on failure (before streaming begins):**
- Returns a FacadeError with the appropriate category.

**Postconditions on failure (during streaming):**
- The stream terminates with a FacadeError (category `stream_interrupted`, `timeout`, `provider_error`, or `content_filtered` as appropriate).
- Any chunks emitted before the error are valid individually but represent an incomplete generation. The caller must discard partial results unless the error metadata indicates otherwise.

---

### 6.2 Implementor Contract

Every implementation of ICompletionProvider must satisfy these obligations:

1. **Translation responsibility:** The adapter translates NormalizedRequest into the provider's native wire format (outbound) and translates the provider's native response into facade types (inbound). The translation is the adapter's entire purpose.

2. **Provider type containment:** No provider-specific type, field name, SDK class, HTTP header, or error code may appear in any return value. Provider types exist only within the adapter's internal implementation. They must never cross the seam boundary upward.

3. **Error mapping completeness:** Every error the provider can return must be mapped to a FacadeError species. If no mapping exists, the error must be classified as `unknown` with the raw provider error preserved in `provider_code`.

4. **Token awareness:** If the provider does not report token usage, the adapter must estimate it and set `is_approximate` to true on the Usage object.

5. **Capability accuracy:** The ModelCapabilities returned by `resolve_model` must accurately reflect what the model can do. Claiming a capability that does not exist (or omitting one that does) violates the discovery contract.

6. **Statelessness:** Adapters must not maintain conversational state between calls. Each call to `complete` or `complete_stream` is independent. (Principle 5: Stateless by Default.)

7. **Extension handling:** When `extensions` is present on the request, the adapter must translate the validated extension values into the provider's native request format. The adapter does not need to validate extension schemas -- the facade validates before dispatching. The adapter is responsible for semantic translation only (mapping facade extension keys/values to provider-native parameters). When the provider's response includes data corresponding to registered extensions, the adapter must map it into `extension_data` on the CompletionResponse.

---

## 7. State Machine: Request Lifecycle

Every request passes through a deterministic sequence of states. The facade
owns the states from Created through Validated (and the terminal Done/Failed
states). The integration plane owns the states from Dispatched through
Complete/Streaming.

---

### 7.1 State Diagram

```
                         +----------+
                         | Created  |
                         +----+-----+
                              |
                    validate request
                    assign correlation ID
                    resolve model
                    check context window
                              |
                    +---------+---------+
                    |                   |
               [valid]            [invalid]
                    |                   |
               +----v-----+      +-----v------+
               | Validated |      |  Rejected  |
               +----+------+      +------------+
                    |                (terminal)
               dispatch to
               integration plane
                    |
               +----v------+
               | Dispatched |
               +----+------+
                    |
          +---------+---------+
          |                   |
     [batch mode]      [stream mode]
          |                   |
     +----v-----+      +-----v------+
     | Complete  |      | Streaming  |
     +----+------+      +-----+------+
          |                    |
          |    [all chunks     |
          |     delivered,     |
          |     terminal chunk |
          |     received]      |
          |                    |
          +--------+-----------+
                   |
              record usage
              deliver response
                   |
              +----v----+
              |  Done   |
              +---------+
               (terminal)
```

Error transitions (any state may transition to Failed):

```
     Created ----[facade internal error]----> Failed
     Validated --[dispatch failure]----------> Failed
     Dispatched -[provider error / timeout]--> Failed
     Streaming --[stream interrupted]--------> Failed
     Complete ---[post-processing error]-----> Failed
```

```
              +---------+
              | Failed  |
              +---------+
               (terminal)
```

---

### 7.2 State Transition Specifications

#### Transition: Created -> Validated

| Aspect | Specification |
|--------|--------------|
| **Trigger** | Caller submits a request to the facade |
| **Actions performed** | 1. Assign a unique correlation ID to the request. 2. Resolve the model identifier to a ModelIdentity via `ICompletionProvider.resolve_model`. 3. Validate all NormalizedRequest invariants (Section 4.5). 4. Validate message sequence grammar (roles in legal order). 5. Check that estimated input tokens + max_tokens does not exceed context_window. 6. Normalize parameters: apply bare-string content expansion, clamp out-of-range values with warnings, ignore unsupported parameters with warnings. |
| **Data type produced** | NormalizedRequest (fully validated) |
| **Invariants that must hold** | All NormalizedRequest invariants (Section 4.5) are satisfied. All Message invariants (Section 1.1) are satisfied. All GenerationParameters invariants (Section 4.1) are satisfied. |
| **Failure mode** | Transition to Rejected with a FacadeError of category `validation_error`, `model_not_found / model_not_ready`, or `context_overflow`. |

#### Transition: Created -> Rejected

| Aspect | Specification |
|--------|--------------|
| **Trigger** | Validation failure during the Created -> Validated transition |
| **Actions performed** | Construct a FacadeError with the appropriate category, code, and message. Attach the correlation ID. |
| **Data type produced** | FacadeError |
| **Terminal** | Yes. No further transitions occur. The error is returned synchronously to the caller. |

#### Transition: Validated -> Dispatched

| Aspect | Specification |
|--------|--------------|
| **Trigger** | Validation succeeds; the facade hands the NormalizedRequest to the appropriate ICompletionProvider |
| **Actions performed** | Route the request to the correct adapter based on `model.provider`. Invoke `complete` or `complete_stream` depending on `request.stream`. |
| **Data type produced** | The NormalizedRequest is consumed by the adapter. No new facade type is produced at this transition -- the adapter begins its work. |
| **Invariants that must hold** | The adapter registered for `model.provider` exists and is operational. |
| **Failure mode** | Transition to Failed with a FacadeError of category `provider_error` or `internal_error`. |

#### Transition: Dispatched -> Complete (batch mode)

| Aspect | Specification |
|--------|--------------|
| **Trigger** | The adapter's `complete` method returns successfully |
| **Actions performed** | The adapter translates the provider's response into a CompletionResponse. |
| **Data type produced** | CompletionResponse |
| **Invariants that must hold** | All CompletionResponse invariants (Section 1.3) are satisfied. |
| **Failure mode** | Transition to Failed with a FacadeError from the adapter. |

#### Transition: Dispatched -> Streaming (stream mode)

| Aspect | Specification |
|--------|--------------|
| **Trigger** | The adapter's `complete_stream` method begins emitting chunks |
| **Actions performed** | The adapter translates provider streaming events into CompletionChunks and emits them to the caller. |
| **Data type produced** | Stream\<CompletionChunk\> (chunks emitted incrementally) |
| **Invariants that must hold** | Each chunk satisfies all CompletionChunk invariants (Section 1.4). Chunk indices are contiguous and increasing. |
| **Failure mode** | Transition to Failed. The stream terminates with a FacadeError. Partial chunks already delivered are valid individually but represent an incomplete generation. |

#### Transition: Complete -> Done

| Aspect | Specification |
|--------|--------------|
| **Trigger** | The CompletionResponse has been assembled and is ready for delivery |
| **Actions performed** | Record usage data. Deliver the CompletionResponse to the caller. |
| **Data type produced** | CompletionResponse (same instance, now delivered) |
| **Terminal** | Yes. |

#### Transition: Streaming -> Done

| Aspect | Specification |
|--------|--------------|
| **Trigger** | The terminal chunk (with non-null `finish_reason` and `usage`) has been emitted |
| **Actions performed** | Record aggregate usage data. Close the stream. |
| **Data type produced** | The final CompletionChunk has already been emitted. The stream is now closed. |
| **Terminal** | Yes. |

#### Transition: (any state) -> Failed

| Aspect | Specification |
|--------|--------------|
| **Trigger** | An error condition occurs at any point in the lifecycle |
| **Actions performed** | Construct a FacadeError with the appropriate category, code, message, retryable flag, and correlation ID. If the error originated from a provider, preserve the raw provider code. If streaming was in progress, terminate the stream. |
| **Data type produced** | FacadeError |
| **Terminal** | Yes. No further transitions occur after Failed. |

---

### 7.3 Message Sequence Grammar

The sequence of roles in a NormalizedRequest's messages array must conform to
the following grammar. This is validated during the Created -> Validated
transition.

```
MessageSequence ::= SystemPrefix? ConversationBody

SystemPrefix    ::= Message[role=system]

ConversationBody ::= UserTurn (AssistantTurn UserTurn)*
                   | UserTurn (AssistantTurn ToolExchange* UserTurn)*

UserTurn        ::= Message[role=user]

AssistantTurn   ::= Message[role=assistant]

ToolExchange    ::= Message[role=assistant, content contains ToolUseBlock]
                    Message[role=tool]+
```

**Rules in prose:**

1. The sequence optionally begins with exactly one system message.
2. After the optional system message, the sequence must begin with a user message.
3. Messages then alternate between assistant and user roles.
4. After an assistant message that contains one or more ToolUseBlocks, one or more tool-role messages must follow (one per tool invocation), before the next user or assistant message.
5. The sequence must not end with a system message (system is always first or absent).
6. Two consecutive messages with the same role are permitted only for tool-role messages following a tool-using assistant message.

---

## 8. Cross-Cutting Constraints

These constraints span multiple types and govern the system as a whole.

### 8.1 Provider Opacity (Principle 1)

No type defined in this specification (Sections 1-7) may contain a reference
to a specific provider name, SDK type, or vendor-specific concept in its
field definitions. The `provider` field in ModelIdentity is a string that
identifies which adapter to route to; it is not a provider-specific type.
The `provider_code` field in FacadeError is explicitly opaque -- the facade
layer must never interpret its value.

### 8.2 Statelessness (Principle 5)

No type in this specification carries session state. Each NormalizedRequest
is self-contained. There is no session ID, no conversation ID, and no
reference to prior requests at the type level. If conversation management is
needed, it is the responsibility of a layer above the facade.

### 8.3 Token Awareness (Principle 7)

Every CompletionResponse and every terminal CompletionChunk must include a
valid Usage object. There is no code path in which a response is delivered
to the caller without token consumption data.

### 8.4 Immutability of Artifacts

All types in Section 1 (Value Objects) are immutable after construction.
Implementations must enforce this through language-appropriate mechanisms
(frozen objects, readonly fields, sealed records, etc.). No method on a
value object may mutate its state.

### 8.5 Extension Validation (Layer 2 Responsibility Boundary)

Extension validation is a facade responsibility. The facade validates
extension keys and values against the target model's `available_extensions`
before dispatching the request to the integration plane. Specifically:

1. The facade checks that every key in the request's `extensions` map
   corresponds to a registered extension ID in the model's
   `available_extensions`.
2. The facade validates each extension value against the extension's
   `input_schema` using JSON Schema validation.
3. Invalid extension keys or values result in a `validation_error`; the
   request is never dispatched.

The adapter does not need to validate extension schemas. It receives
pre-validated extension data and is responsible only for translating
that data into the provider's native wire format. This separation
ensures that schema enforcement happens once, at the architectural
boundary, rather than redundantly in each adapter implementation.

---

## Appendix A: Type Dependency Graph

```
NormalizedRequest
 +-- ModelIdentity
 +-- Message[]
 |    +-- Role
 |    +-- ContentBlock[]
 |         +-- TextBlock
 |         +-- ToolUseBlock
 |         +-- ToolResultBlock
 |         +-- ThinkingBlock
 |         +-- ImageBlock
 +-- GenerationParameters
 |    +-- Sampling { temperature, top_p, top_k }
 |    +-- Constraints { max_tokens, stop_sequences }
 |    +-- Behavioral { frequency_penalty, presence_penalty }
 |    +-- Meta { seed, reasoning_effort: ReasoningEffort }
 |    +-- Structural { response_format: ResponseFormat, tools: ToolDefinition[], tool_choice: ToolChoice }
 +-- extensions: Map<string, object>?      (Layer 2: keyed by ExtensionDescriptor.id)

CompletionResponse
 +-- ContentBlock[]
 +-- FinishReason
 +-- Usage
 +-- extension_data: Map<string, object>?  (Layer 2: keyed by ExtensionDescriptor.id)

CompletionChunk
 +-- ContentBlockDelta
 |    +-- TextDelta
 |    +-- ToolUseDelta
 |    +-- ThinkingDelta
 +-- FinishReason?
 +-- Usage?

FacadeError
 +-- ErrorCategory (4 genera, 13 species)

ModelCapabilities
 +-- ParameterSupport
 |    +-- ParameterDescriptor (per optional parameter)
 +-- ExtensionDescriptor[]                 (Layer 2: available extensions with schemas)
      +-- id, name, description
      +-- input_schema: object?
      +-- response_schema: object?

ICompletionProvider
 <- consumes: NormalizedRequest, ModelIdentity
 -> produces: CompletionResponse, CompletionChunk, ModelCapabilities, FacadeError
```

---

## Appendix B: Invariant Index

A consolidated index of all invariants defined in this specification, for
verification during implementation and testing.

| ID | Type | Invariant |
|----|------|-----------|
| MSG-1 | Message | `content` contains at least one element |
| MSG-2 | Message | When `role` is `tool`, `tool_call_id` is non-null and non-empty |
| MSG-3 | Message | When `role` is not `tool`, `tool_call_id` is null |
| CB-IMG-1 | ImageBlock | Exactly one of `data` or `source_url` is present |
| CB-IMG-2 | ImageBlock | `media_type` matches `image/*` |
| CB-TU-1 | ToolUseBlock | `tool_use_id` is non-empty |
| CB-TU-2 | ToolUseBlock | `name` is non-empty |
| CB-TR-1 | ToolResultBlock | `tool_use_id` references a prior ToolUseBlock |
| CB-TR-2 | ToolResultBlock | `content` contains at least one element |
| CB-TR-3 | ToolResultBlock | `content` contains no ToolUseBlock or ToolResultBlock |
| CB-TH-1 | ThinkingBlock | `thinking` and `signature` are non-empty |
| CB-TH-2 | ThinkingBlock | Opaque passthrough; facade does not interpret |
| CR-1 | CompletionResponse | `completion_id` is non-empty |
| CR-2 | CompletionResponse | `content` may be empty only when `finish_reason` is `content_filter` or `error` |
| CR-3 | CompletionResponse | When `finish_reason` is `tool_use`, `content` contains at least one ToolUseBlock |
| CR-4 | CompletionResponse | `usage` is always present |
| CK-1 | CompletionChunk | `completion_id` is stable across all chunks in a stream |
| CK-2 | CompletionChunk | `chunk_index` values are contiguous starting at 0 |
| CK-3 | CompletionChunk | `finish_reason` is non-null only on the terminal chunk |
| CK-4 | CompletionChunk | `usage` is non-null only on the terminal chunk |
| CK-5 | CompletionChunk | Exactly one chunk per stream is terminal |
| CK-6 | CompletionChunk | No chunks after terminal |
| U-1 | Usage | `input_tokens` and `output_tokens` are non-negative |
| U-2 | Usage | `is_approximate` is true when facade-estimated |
| R-1 | Role | `tool` is valid only when `supports_tool_calling` is true |
| FR-1 | FinishReason | `tool_use` valid only when tools were defined and capability exists |
| MI-1 | ModelIdentity | `(provider, model_id)` is unique within the facade |
| MI-2 | ModelIdentity | Neither field contains whitespace or control characters |
| MC-1 | ModelCapabilities | `context_window` > `max_output_tokens` |
| MC-2 | ModelCapabilities | `max_output_tokens` >= 1 |
| PS-1 | ParameterSupport | When `supported` is false, range/default fields are null |
| PS-2 | ParameterSupport | When range is present, `min` <= `max` |
| PS-3 | ParameterSupport | When `default` and range are present, `default` is within range |
| GP-S-1 | GenerationParameters.sampling | `temperature` in `[0.0, 2.0]` |
| GP-S-2 | GenerationParameters.sampling | `top_p` in `(0.0, 1.0]` |
| GP-S-3 | GenerationParameters.sampling | `top_k` >= 1 |
| GP-C-1 | GenerationParameters.constraints | `max_tokens` >= 1 and <= model max |
| GP-C-2 | GenerationParameters.constraints | `stop_sequences` elements are non-empty |
| GP-B-1 | GenerationParameters.behavioral | `frequency_penalty` in `[-2.0, 2.0]` |
| GP-B-2 | GenerationParameters.behavioral | `presence_penalty` in `[-2.0, 2.0]` |
| GP-M-1 | GenerationParameters.meta | `seed` is non-negative |
| GP-ST-1 | GenerationParameters.structural | `tools` only when `supports_tool_calling` is true |
| GP-ST-2 | GenerationParameters.structural | `tools` contains at least one element when present |
| GP-ST-3 | GenerationParameters.structural | `tool_choice` only when `tools` is present |
| NR-1 | NormalizedRequest | `messages` is non-empty |
| NR-2 | NormalizedRequest | First message role is `system` or `user` |
| NR-3 | NormalizedRequest | At most one system message, and it must be first |
| NR-4 | NormalizedRequest | Estimated input tokens + max_tokens <= context_window |
| NR-5 | NormalizedRequest | Tool-role messages reference valid preceding ToolUseBlocks |
| NR-6 | NormalizedRequest | Every key in `extensions` matches a registered extension ID for the target model |
| NR-7 | NormalizedRequest | Every value in `extensions` validates against the extension's `input_schema` |
| CR-5 | CompletionResponse | `extension_data` keys match registered extension IDs for the responding model |
| MC-3 | ModelCapabilities | Extension IDs within `available_extensions` are unique |
| ED-1 | ExtensionDescriptor | `id` is non-empty, lowercase, snake_case, matches `[a-z][a-z0-9_]*` |
| ED-2 | ExtensionDescriptor | `name` is non-empty |
| ED-3 | ExtensionDescriptor | `description` is non-empty |
| ED-4 | ExtensionDescriptor | At least one of `input_schema` or `response_schema` is non-null |
| ED-5 | ExtensionDescriptor | `id` is unique within a provider's extension registry |
| EXT-1 | Extension (cross-cutting) | Every extension key in a request must match a registered extension ID for the target model |
| EXT-2 | Extension (cross-cutting) | Extension values must conform to the extension's `input_schema` |
| EXT-3 | Extension (cross-cutting) | Extension response data keys must match registered extension IDs |
| EXT-4 | Extension (cross-cutting) | Extension IDs must be unique within a model's `available_extensions` |
| FE-1 | FacadeError | `code` is non-empty |
| FE-2 | FacadeError | `message` is non-empty |
| FE-3 | FacadeError | `correlation_id` matches the originating request |
| FE-4 | FacadeError | `provider_code` is null for facade-originated errors |
| FE-5 | FacadeError | `retryable` is consistent with category retryability |
