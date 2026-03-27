# Domain Model -- llm-api-facade

> Universal abstraction layer capturing what is shared across all known LLM
> interaction surfaces, plus Extended capabilities that are near-universal and
> normalizable. This is the common ground before any integration-specific concern
> applies.
>
> **Authoritative type definitions:** see `TypeSpecification.md`.
> **Categorical foundations:** see `OntologicalTaxonomy.md`.

**Status:** Revised (cross-validated)
**Last updated:** 2026-03-27
**Scope boundary:** Everything above the seam (facade layer). Everything below the
seam (integration plane) is explicitly out of scope.

---

## 1. Universal Concepts

### 1.1 Message Sequence

A conversation is an ordered sequence of typed messages. Every provider examined
(OpenAI, Anthropic, Google Gemini, Mistral, Cohere, Ollama, vLLM, LM Studio)
converges on three Core roles and one Extended role:

| Role        | Tier     | Semantics                                      | Cardinality in sequence |
|-------------|----------|-------------------------------------------------|------------------------|
| `system`    | Core     | Behavioral framing; sets tone, constraints      | 0..1 (first position, or absent) |
| `user`      | Core     | Human-originated input (or any content offered in the interlocutor position) | 1..N |
| `assistant` | Core     | Model-generated output (or prefilled)           | 0..N |
| `tool`      | Extended | Result of a tool invocation, correlating to a prior ToolUseBlock | 0..N (only when tool calling is active) |

Roles are **functional positions in a conversational protocol**, not identities
of agents. "User" denotes a position in the protocol, not a human being. An
automated pipeline can occupy the User role. The role is orthogonal to the
identity of whoever authored the content (Taxonomy Section 1.1.1).

**Role alternation.** Some providers (Anthropic, Gemini) enforce strict
user/assistant role alternation. Others (OpenAI, Ollama) are permissive. The
facade must decide whether to enforce alternation universally or normalize
non-conforming sequences at the seam. Tool-role messages follow an assistant
message containing ToolUseBlocks and do not violate the alternation rule; they
are part of a tool exchange cycle that precedes the next user turn.

**Content is an ordered array of typed content blocks.** Every message carries
its payload as a `ContentBlock[]`, not a plain string. TextBlock is the
universal block type. Additional block types are available at Extended tiers:

| Block Type       | Tier              | Direction | Description |
|-----------------|-------------------|-----------|-------------|
| `TextBlock`      | Core              | Both      | Plain text content. Universal across all providers. |
| `ToolUseBlock`   | Extended (Tier 1) | Response  | Model is requesting tool execution. Contains tool name, call ID, and arguments. |
| `ToolResultBlock`| Extended (Tier 1) | Request   | Caller supplies the result of a prior tool invocation. Contains call ID and output. |
| `ThinkingBlock`  | Extended (Tier 2) | Response  | Extended thinking / chain-of-thought trace. Opaque passthrough with cryptographic signature. |
| `ImageBlock`     | Extended (Tier 2) | Request   | Image content for vision-capable models. Base64 data or URL source. |

**String shorthand.** A bare string is accepted as shorthand for
`[TextBlock { text: <the string> }]` at API boundaries. Internally, content is
always `ContentBlock[]`.

**What is NOT universal (deferred to integration plane):**
- Audio and video content blocks (no convergent schema across providers)
- Metadata attached to individual messages (e.g., `name`)
- Provider-specific content block types (Gemini `executableCode`, `codeExecutionResult`)

### 1.2 Completion Response

The output of a generation request. Every provider returns at minimum:

| Field              | Type              | Description                                       |
|--------------------|-------------------|---------------------------------------------------|
| `completion_id`    | string            | Unique identifier for this completion, traceable to the request |
| `model`            | string            | The model that performed the generation            |
| `content`          | ContentBlock[]    | The generated content, as one or more typed blocks |
| `finish_reason`    | enum              | Why generation stopped (see below)                |
| `usage.input_tokens`  | int            | Tokens consumed by the prompt                     |
| `usage.output_tokens` | int            | Tokens produced in the response                   |
| `usage.is_approximate` | bool          | True when the facade estimated token counts because the provider did not report them |

**Finish reasons** (normalized union across all providers):

| Normalized Value   | Meaning                                          | Provider Mappings (representative) |
|--------------------|--------------------------------------------------|-------------------------------------|
| `stop`             | Natural completion or hit a stop sequence         | OpenAI `stop`, Anthropic `end_turn` / `stop_sequence`, Gemini `STOP`, Cohere `COMPLETE` |
| `length`           | Hit max_tokens limit                              | OpenAI `length`, Anthropic `max_tokens`, Gemini `MAX_TOKENS` |
| `content_filter`   | Blocked by safety/moderation layer                | OpenAI `content_filter`, Gemini `SAFETY` / `BLOCKLIST` / `PROHIBITED_CONTENT` |
| `tool_use`         | Model is requesting execution of one or more tools | OpenAI `tool_calls`, Anthropic `tool_use`, Gemini `function_call` |
| `error`            | Generation failed for non-safety reasons          | Facade-assigned when generation fails mid-process (e.g., Gemini `MALFORMED_FUNCTION_CALL`) |

When `finish_reason` is `tool_use`, `content` must contain at least one
ToolUseBlock. When `finish_reason` is `content_filter` or `error`, `content`
may be empty.

### 1.3 Model Identity

A model is identified by a composite of provider and model name. Capabilities are
discoverable, not assumed.

```
ModelIdentity {
    provider: string       // "openai", "anthropic", "ollama", etc.
    model_id: string       // "gpt-4o", "claude-sonnet-4-20250514", "llama3:70b"
}
```

Context window sizes vary from 2K (small local models) to 1M+ (Gemini, Claude).
The facade must expose these as discoverable constraints via the capability
profile (Section 2.2), not hardcode them.

### 1.4 Generation Parameters

These parameters exist across every provider examined. Names differ; semantics converge.
They are organized by their ontological function (see Taxonomy Section 3).

| Facade Parameter  | Type       | Range / Constraint     | Provider Name Variants                          |
|-------------------|-----------|------------------------|--------------------------------------------------|
| `temperature`     | float     | 0.0 -- 2.0            | `temperature` (universal)                        |
| `max_tokens`      | int       | 1 -- model max         | `max_tokens`, `max_completion_tokens`, `maxOutputTokens` |
| `top_p`           | float     | 0.0 -- 1.0 exclusive  | `top_p`, `topP`, `nucleus_sampling`              |
| `top_k`           | int       | >= 1 or disabled       | `top_k`, `topK` (absent in OpenAI)               |
| `stop_sequences`  | string[]  | 0 -- 4 typical         | `stop`, `stop_sequences`, `stopSequences`        |
| `frequency_penalty` | float   | -2.0 -- 2.0           | `frequency_penalty` (absent in Anthropic)         |
| `presence_penalty`  | float   | -2.0 -- 2.0           | `presence_penalty` (absent in Anthropic)          |
| `seed`            | int?      | nullable               | `seed` (best-effort determinism; not guaranteed) |
| `reasoning_effort` | enum?    | low / medium / high    | `reasoning_effort` (OpenAI), mapped from `thinking.budget_tokens` (Anthropic), `thinkingBudget` (Gemini) |

**Design rule:** Parameters not supported by a target model are silently ignored
with a warning emitted to the caller, not rejected. The facade normalizes names;
the integration plane validates ranges.

**Parameter mutual exclusion.** The parameter space partitions into disjoint
regions based on model type. Reasoning models (OpenAI o-series, xAI reasoning
models) reject sampling parameters (`temperature`, `top_p`) and behavioral
parameters (`frequency_penalty`, `presence_penalty`). These are not capability
gaps where a parameter is absent; they are categorical incompatibilities where
the parameter is forbidden because external distribution shaping conflicts with
the model's internal reasoning process. Sending `temperature` to an o-series
model is a validation error, not a silent omission.

**Max tokens semantics divergence.** For reasoning models, the `max_tokens` budget
may include invisible reasoning tokens consumed by the model's internal
chain-of-thought. The caller's requested output budget is not necessarily the
number of visible tokens returned. The facade should surface this divergence
through capability metadata, not attempt to normalize it away.

**Parameters that are NOT universal** (deferred):
- `logit_bias`, `logprobs` -- not supported by Anthropic, Cohere, most local runtimes
- `response_format` / JSON mode -- provider-specific schemas and enforcement levels
- `tools` / `functions` -- Extended (Tier 1); schema formats require per-provider translation

### 1.5 Response Modes

Two modes are universally supported:

| Mode       | Mechanism                          | Universality |
|------------|------------------------------------|--------------|
| `batch`    | Single response, full payload      | All providers |
| `streaming`| Server-Sent Events (SSE), chunked  | All providers |

The facade defines a response as either a complete object or an ordered stream of
delta chunks. Streaming is an observation mode, not a different process -- the same
generation produces the same output whether observed as a batch or a stream
(Taxonomy Section 1.3.2).

The streaming contract:

1. Each chunk contains a `delta` (a `ContentBlockDelta` -- TextDelta, ToolUseDelta, or ThinkingDelta).
2. The final chunk carries `finish_reason` and `usage`.
3. Errors during streaming terminate the stream with a `stream_interrupted` error.

### 1.6 Context Window Constraints

The facade treats context windows as a hard constraint, not a suggestion.

```
effective_input_limit = context_window - max_output_tokens
```

The facade MUST:
- Expose `context_window` and `max_output_tokens` per model.
- Reject requests where estimated input tokens exceed `effective_input_limit`
  before forwarding to the provider (fail fast, not fail expensively).
- Provide a token estimation interface (not a precise tokenizer -- that is
  provider-specific -- but a conservative estimator).

---

## 2. Behavioral Contracts

### 2.1 Request Lifecycle

Every request passes through exactly these states:

```
[Created] --> [Validated] --> [Dispatched] --> [Streaming | Complete] --> [Done]
                  |                |                                        |
                  v                v                                        v
               [Rejected]     [Failed]                                  [Failed]
```

| State        | Responsibility                                              |
|--------------|-------------------------------------------------------------|
| `Created`    | Caller submits request; facade assigns correlation ID       |
| `Validated`  | Parameters normalized, context window checked, model resolved |
| `Rejected`   | Validation failed; synchronous error returned               |
| `Dispatched` | Handed to integration plane                                 |
| `Streaming`  | Deltas flowing back to caller                               |
| `Complete`   | Full response assembled                                     |
| `Done`       | Usage recorded, response delivered                          |
| `Failed`     | Error captured, classified, returned                        |

The facade owns states `Created` through `Validated` and `Done`. The integration
plane owns `Dispatched` through `Complete`/`Failed` and reports back.

### 2.2 Capability Discovery

Models are not equal. The facade exposes a capability query interface:

```
ModelCapabilities {
    context_window: int
    max_output_tokens: int
    supports_streaming: bool
    supports_system_message: bool
    supports_tool_calling: bool
    supports_thinking: bool
    supports_vision: bool
    supported_parameters: ParameterSupport
}
```

The `supported_parameters` structure provides detailed support information for
each optional generation parameter -- whether it is supported, its legal range,
and its default value. This includes temperature, top_p, top_k, frequency_penalty,
presence_penalty, seed, and stop_sequences. Each is described by a
`ParameterDescriptor` with `supported`, `min`, `max`, and `default` fields.

**Tool calling, thinking, and vision** are no longer "provider-specific
capabilities surfaced by the integration plane." They are discoverable Extended
capabilities represented as first-class boolean flags on the capability profile:

| Capability Flag        | Tier              | Meaning |
|------------------------|-------------------|---------|
| `supports_tool_calling`| Extended (Tier 1) | Model can invoke caller-defined tools during generation |
| `supports_thinking`    | Extended (Tier 2) | Model supports extended thinking / chain-of-thought with ThinkingBlocks |
| `supports_vision`      | Extended (Tier 2) | Model accepts ImageBlock content in input messages |

When a capability flag is false, submitting content that requires it (tool-role
messages, ToolUseBlocks, ImageBlocks) is a validation error.

### 2.3 Parameter Normalization

The facade accepts its own canonical parameter names and maps them to
provider-specific equivalents. The mapping is the integration plane's
responsibility but the contract is:

1. Caller uses facade parameter names exclusively.
2. Unsupported parameters for the target model produce a warning, not an error.
3. Range mismatches (e.g., temperature 2.0 sent to a provider capping at 1.0)
   are clamped with a warning.
4. The facade never silently transforms semantics -- only names and ranges.

### 2.4 Error Taxonomy

Errors are classified by their **nature** -- the kind of failure they represent --
not by HTTP status codes. The integration plane maps provider-specific error codes
into these normalized categories. The taxonomy is organized into four genera
(Precondition, Capacity, Process, System) following Taxonomy Section 4.

#### Precondition Failures

The request cannot be attempted. Generation cannot begin because prerequisites
are not met.

| Category              | Meaning                                          | Retryable? |
|-----------------------|--------------------------------------------------|------------|
| `validation_error`    | Bad input from caller (missing model, empty messages, wrong parameter type) | No     |
| `authentication`      | Invalid or expired credentials                   | No         |
| `permission`          | Valid credentials, insufficient access            | No         |
| `model_unavailable`   | Model does not exist or is not currently available | Conditional |

#### Capacity Failures

The request is valid but the resources required exceed current availability.

| Category              | Meaning                                          | Retryable? |
|-----------------------|--------------------------------------------------|------------|
| `context_overflow`    | Input exceeds model context window               | No         |
| `rate_limited`        | Provider throttling (too many requests per time window) | Yes   |
| `overloaded`          | Provider infrastructure at capacity (Anthropic 529 -- system cannot accept new requests regardless of caller's rate allocation) | Yes |
| `quota_exceeded`      | Billing or allocation limit reached (distinct from rate limiting -- this is a budget boundary, not a temporal throttle) | No |

#### Process Failures

Generation began but could not complete. The system accepted the request and
began work, then encountered a condition that prevented completion.

| Category              | Meaning                                          | Retryable? |
|-----------------------|--------------------------------------------------|------------|
| `content_filtered`    | Request or response blocked by safety            | No         |
| `timeout`             | No response within deadline                      | Yes        |
| `stream_interrupted`  | Streaming generation broken mid-delivery (partial data delivered before failure must be discarded; retry from scratch) | Yes |

#### System Failures

Infrastructure failure unrelated to the specific request.

| Category              | Meaning                                          | Retryable? |
|-----------------------|--------------------------------------------------|------------|
| `provider_error`      | Unexpected provider-side failure (5xx)           | Yes        |
| `internal_error`      | The facade itself failed                         | Conditional |
| `unknown`             | Unmapped error; includes raw provider error       | Unknown    |

Each error carries:
- `category` (genus from the four groups above)
- `code` (species: e.g., `"capacity.rate_limited"`, `"process.content_filtered"`)
- `message` (human-readable)
- `provider_code` (raw error code from provider, nullable)
- `retryable` (bool)
- `correlation_id` (links to the request)

---

## 3. Explicit Exclusions (Integration-Plane Concerns)

These are real, important concerns. They are excluded from the facade domain model
because they are not universal across providers or they belong to infrastructure.

| Concern                        | Why excluded                                              |
|--------------------------------|-----------------------------------------------------------|
| Authentication mechanisms      | API keys, OAuth, none (local) -- no common model          |
| Wire protocols / HTTP details  | REST, gRPC, WebSocket -- transport is below the seam      |
| Structured output / JSON mode  | Enforcement levels and schema specs vary                  |
| Embeddings                     | Different API surface entirely                            |
| Retry / circuit-breaker        | Infrastructure policy, not domain                         |
| Cost calculation               | Pricing models change independently of the domain         |
| Prompt caching                 | Provider-specific optimization (Anthropic, Google)        |
| Batch API / async jobs         | Only OpenAI and Google offer this; not universal          |
| Fine-tuning / training         | Separate lifecycle entirely                               |
| Model aliases / routing        | Operational concern above the facade                      |

---

## 4. The Seam

The seam is the boundary between the facade (universal domain) and the integration
plane (provider-specific translation). It is defined by two interfaces:

### 4.1 Outbound Contract (Facade to Integration Plane)

```
interface ICompletionProvider {
    // Resolve a model identity and its capabilities
    resolve_model(model_id: string): ModelIdentity + ModelCapabilities

    // Execute a completion request (batch)
    complete(request: NormalizedRequest): CompletionResponse

    // Execute a streaming completion request
    complete_stream(request: NormalizedRequest): Stream<CompletionChunk>
}
```

`NormalizedRequest` contains the concepts from Section 1 in their canonical form:
messages as `Message[]` (where each message carries `ContentBlock[]` content),
generation parameters grouped by topological region, model identity, stream flag,
and optional typed `extensions` for provider-specific features.

The integration plane is responsible for:
1. Translating parameter names to provider conventions.
2. Constructing the provider-specific HTTP request.
3. Handling authentication.
4. Mapping provider responses back to facade types.
5. Mapping provider errors into the error taxonomy.

### 4.2 Inbound Contract (Integration Plane to Facade)

The integration plane reports back using facade types exclusively:
- `CompletionResponse` (Section 1.2) -- content as `ContentBlock[]`, finish reason, usage with `is_approximate`
- `CompletionChunk` -- `ContentBlockDelta` (TextDelta, ToolUseDelta, or ThinkingDelta) + optional finish_reason + optional usage
- `FacadeError` (Section 2.4)

**Response normalization** takes two distinct forms depending on provider
structure: **extraction** (unwrapping a completion from a wrapper array --
OpenAI `choices[0]`, Gemini `candidates[0]`) and **synthesis** (constructing
the normalized response from a flat or differently-shaped structure --
Anthropic, Cohere, Ollama). Both produce the same `CompletionResponse`, but
the cognitive and implementation complexity differ. Extraction is a structural
unwrapping with a clear path; synthesis requires the adapter to actively
assemble the facade type from dispersed fields.

### 4.3 Registration

Integration planes register themselves with the facade at startup. Each
registration declares:
- Provider name
- Supported model patterns (glob or exact match)
- Capability profile per model

The facade routes requests to the correct integration plane based on model identity.

### 4.4 Structured Extensions (Layer 2)

Provider-specific features are exposed as **structured, typed, discoverable
extensions** — not as an opaque pass-through bag. Each extension is registered
with a canonical identifier, description, and JSON Schema. The consumer discovers
available extensions via `get_model_info` and uses them through typed values on
the request. Responses may include extension data with provider-specific
information the consumer opted into.

```
extensions: Map<ExtensionId, ExtensionValue>  // on request (typed, validated)
extension_data: Map<ExtensionId, ExtensionValue>  // on response (typed)
```

The facade validates extension values against their registered schemas before
dispatching to the adapter. Invalid extensions are rejected at the facade
boundary. The adapter translates extension values to provider-native formats
and maps provider response data into `extension_data`.

This is not an escape hatch. Provider-specific features are a first-class part
of the facade's information architecture. The facade organizes them alongside
universal types — both are navigable from a single surface. See
`PositionPaper-FacadeAsInformationArchitecture.md` for the philosophical
grounding and `Principles.md` Principle #8 for the governing constraint.

**Graduation:** Extensions that converge across multiple providers may be
promoted to Layer 1 (Extended tier) through an ADR. Tool calling (ADR-005)
and extended thinking (ADR-004) followed this path.

---

## Appendix: Provider Parameter Cross-Reference

Evidence base for universality claims. Checked 2026-03-27.

| Parameter          | OpenAI | Anthropic | Gemini | Mistral | Cohere | Ollama | vLLM | LM Studio |
|--------------------|--------|-----------|--------|---------|--------|--------|------|-----------|
| temperature        | Y      | Y         | Y      | Y       | Y      | Y      | Y    | Y         |
| max_tokens         | Y      | Y         | Y      | Y       | Y      | Y      | Y    | Y         |
| top_p              | Y      | Y         | Y      | Y       | Y      | Y      | Y    | Y         |
| top_k              | --     | Y         | Y      | --      | Y      | Y      | Y    | --        |
| stop_sequences     | Y      | Y         | Y      | Y       | Y      | Y      | Y    | Y         |
| frequency_penalty  | Y      | --        | Y      | Y       | Y      | Y      | Y    | Y         |
| presence_penalty   | Y      | --        | Y      | Y       | Y      | Y      | Y    | Y         |
| seed               | Y      | --        | Y      | Y       | Y      | --     | Y    | --        |
| streaming          | Y      | Y         | Y      | Y       | Y      | Y      | Y    | Y         |
| system role        | Y      | Y (param) | Y      | Y       | Y      | Y      | Y    | Y         |

`Y` = supported. `--` = not supported or not applicable. `(param)` = supported but
via a different mechanism than message role.
