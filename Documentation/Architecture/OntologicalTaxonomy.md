# Ontological Taxonomy -- llm-api-facade

> Categorical framework establishing what entities, relations, and processes exist
> across all LLM interaction surfaces, and how they exist, before any code is written.
> This is philosophical engineering: the ontology of the system determines the shape
> of every type, interface, and boundary that follows.

**Status:** Draft
**Last updated:** 2026-03-26
**Depends on:** `DomainModel.md`, `ProviderAnalysis.md`, `Principles.md`,
`PositionPaper-FacadeAsInformationArchitecture.md`
**Scope:** All layers. This document classifies concepts regardless of which side of
the seam they inhabit. The seam itself is analyzed as an ontological boundary.

---

## 1. Ontological Categories

### 1.1 Entities (What Exists)

An entity is anything the system must represent, reference, or reason about. Not all
entities have the same mode of existence. We distinguish four kinds.

#### 1.1.1 Participants

**System, User, Assistant, Tool** -- these appear in every provider's API. But what
are they?

They are **functional roles**, not agents and not identities. A role is a tag that
determines how the inference engine treats a block of content. "User" does not denote
a human being; it denotes a position in a conversational protocol. An automated
pipeline can occupy the User role. A human can dictate content that occupies the
System role. The role is orthogonal to the identity of whoever authored the content.

This has a concrete consequence: the facade must never conflate role with identity.
Role is a closed enumeration (`system`, `user`, `assistant`) at the facade layer,
with `tool` as an **Extended role** present when tool calling capability is active.
The `tool` role carries structurally divergent semantics across providers (it is a
response-to-a-request, not an independent conversational turn), but because tool
calling itself is Tier 1 Extended, the role that completes the tool-calling cycle
must be representable at the same tier.

**Ontological status:** Functional role (a category of relation between content and
the inference process, not a substance).

#### 1.1.2 Artifacts

**Messages, Completions, Tokens, Chunks** -- are these substances or events?

They are **events with residue**. A message does not exist independently of the act
of composing and submitting it. A completion does not exist until generation produces
it. A token has no independent existence outside the encoding process that creates it.
Yet once produced, each persists as a datum that can be stored, counted, and referenced.

This dual nature matters for system design:
- As events, they have a temporal ordering that cannot be violated (a completion
  cannot precede the request that caused it).
- As residue, they have structural properties that can be validated, measured, and
  transformed after the fact.

The facade treats artifacts as **immutable value objects** produced by processes.
They are never modified in place, only produced and consumed.

| Artifact | Produced By | Consumed By | Immutable? |
|----------|------------|-------------|------------|
| Message | Caller (or prior completion) | Generation process | Yes |
| Completion | Generation process | Caller | Yes |
| Chunk | Streaming process | Caller (accumulator) | Yes |
| Token | Encoding process | Counting, billing, constraint checking | Yes (a count, not the token itself) |

#### 1.1.3 Capabilities

**Streaming, Vision, Tool Use, Structured Output, Extended Thinking** -- are these
properties of models or of the interaction surface?

They are **properties of the model-provider pair**, not of the model alone and not of
the provider alone. A model architecture may support vision, but if the provider's API
does not expose image input parameters, the capability does not exist at the
interaction surface. Conversely, a provider may define tool-use parameters, but if the
loaded model was not trained for tool use, the capability is nominal, not real.

Capabilities are therefore **relational properties**: they exist at the intersection
of model, provider, and API version. The facade must treat them as discoverable facts
about a specific model registration, not as static attributes of a model family.

**Ontological status:** Relational property (exists between model and provider, not
in either alone).

**Capability tiers** (from `ProviderAnalysis.md` Section 11.2, reframed ontologically):

| Tier | Ontological Character | Examples |
|------|----------------------|----------|
| Tier 0: Core | Universal properties -- present wherever the interaction surface exists | Text generation, message roles, temperature, max_tokens |
| Tier 1: Common | Near-universal properties -- present in most but not all surfaces, normalizable | Tool calling, structured output, finish reason classification |
| Tier 2: Gated | Contingent properties -- depend on specific model-provider combinations | Vision, frequency/presence penalties, top_k, seed, extended thinking/reasoning |
| Tier 3: Singular | Idiosyncratic properties -- unique to one or two providers | Prompt caching, document input, vendor-provided built-in tools |

#### 1.1.4 Constraints

**Context Windows, Rate Limits, Safety Filters, Max Output Tokens** -- what kind of
existence do limits have?

Constraints are **boundary conditions on processes**. They do not exist as independent
entities; they exist as properties of the space within which generation occurs. A
context window is not a thing; it is a measurement of the boundary of a thing (the
model's attention mechanism). A rate limit is not a property of the request; it is a
property of the infrastructure's capacity allocation.

This distinction determines how the facade handles them:

| Constraint | Nature | Known When? | Owned By |
|-----------|--------|-------------|----------|
| Context window | Structural boundary of model architecture | Before request (discoverable) | Model-provider pair |
| Max output tokens | Structural boundary of generation | Before request (discoverable or set by caller) | Model-provider pair / caller |
| Rate limit | Temporal capacity boundary of infrastructure | During or after request (reactive) | Provider infrastructure |
| Safety filter | Normative boundary on content | During generation (discovered by violation) | Provider policy |
| Token budget | Caller-imposed boundary on generation | Before request (set by caller) | Caller |

Safety manifests in two modes across providers: as a **fixed constraint** imposed by
provider policy (OpenAI, Anthropic) and as a **configurable parameter** adjustable
per-request (Gemini `safetySettings`). The facade classifies safety as a constraint
at the facade layer; per-request safety configuration is a Layer 2 extension passed
through the structured `extensions` namespace.

Constraints that are known before a request should be exposed through capability
discovery. Constraints that manifest only during execution produce errors classified
by their nature (Section 4).

---

### 1.2 Relations (How Things Connect)

Relations are the structural connections between entities. Each has a character that
determines how it should be represented in code.

| Relation | Type | Character | Facade Implication |
|----------|------|-----------|-------------------|
| Request --> Response | Causal | A request **causes** a response. The response cannot exist without the request. One-to-one. | Every response carries a `completion_id` traceable to its request. |
| Request --> Stream | Causal, distributed | A request causes a temporally extended sequence of chunks. One-to-many-ordered. | Chunks carry `completion_id` + `chunk_index` for reconstruction. |
| Message --> Sequence | Compositional | Messages compose into an ordered sequence. The sequence is the conversational context. Order is load-bearing. Some providers (Anthropic, Gemini) enforce strict user/assistant role alternation; the facade must decide whether to enforce this universally or normalize non-conforming sequences at the seam. | Messages are an ordered array. No set semantics. No reordering. Role-sequencing constraints are a validation concern. |
| Model --> Capability | Attributive | A capability is an attribute of a model-provider registration. Not inherent to the model name. | Capabilities are queried per registration, never assumed. |
| Parameter --> Behavior | Functional | A parameter is a function from its value to a modification of generation behavior. The same parameter name across providers may map to different functions. | Parameters are normalized by name; behavioral equivalence is not guaranteed and must not be promised. |
| Error --> State | Diagnostic | An error is a report about why a state transition failed. It is evidence, not a thing. | Errors are value objects carrying category, message, and correlation data. |
| Caller --> Facade | Contractual | The caller interacts exclusively with the facade's public surface (MCP tools/resources). The contract is structural uniformity. | No provider-specific concepts cross this boundary. |
| Facade --> Provider | Delegational | The facade delegates generation to a provider through the seam. The provider is interchangeable. | `ICompletionProvider` is the delegation contract. |
| Provider --> Model | Registrative | A provider registers models it can serve. A model may be served by multiple providers. | Model identity is a composite of provider + model_id. |

---

### 1.3 Processes (What Happens)

A process is a transformation that takes the system from one state to another. These
are the irreducible processes in the LLM interaction domain.

#### 1.3.1 Generation (the core act)

The transformation of an input message sequence and parameter set into new text. This
is the raison d'etre of the entire system. Every other process exists in service of,
in preparation for, or in reaction to generation.

- **Input:** Message sequence + parameters + model identity
- **Output:** Completion (content + finish reason + usage)
- **Character:** Non-deterministic (same input may produce different output), non-reversible (cannot recover input from output), expensive (consumes compute and tokens)

#### 1.3.2 Streaming (generation distributed over time)

Not a different process from generation -- it is the same process with a different
**observation mode**. Streaming does not change what is generated; it changes when
the caller can observe partial results. The underlying generation is identical.

- **Input:** Same as generation
- **Output:** Ordered sequence of chunks that, when concatenated, equals the batch completion
- **Character:** Temporally extended observation of the generation process. Introduces partial-state visibility, which generation-as-batch does not.

The facade treats batch and streaming as two observation modes of one process, not as
two processes. This is why `complete` and `stream_complete` accept identical parameters.

#### 1.3.3 Validation (pre-generation checks)

Determining whether a generation request is satisfiable before committing resources.
This is prediction about a future process, not generation itself.

- **Input:** Request parameters + model capabilities
- **Output:** Validity judgment + estimated token count + warnings
- **Character:** Deterministic (same input always produces the same validity judgment), cheap (no inference compute), approximate (token estimation is not exact)

#### 1.3.4 Discovery (learning what is possible)

Interrogating the system to learn what models exist, what they can do, and what
constraints apply. Discovery answers questions about the system's current
configuration, not about any specific generation.

- **Input:** Optional filters (capability, model ID)
- **Output:** Model catalog, capability profiles, parameter ranges
- **Character:** Reflective (the system reporting on itself), temporal (the answer may change as providers come online or go offline)

#### 1.3.5 Estimation (approximating without doing)

Computing an approximate answer to a question that would be precisely answered by
performing the actual operation. Token counting is the primary example: exact token
count requires the provider's tokenizer, but an approximate count using a compatible
tokenizer is sufficient for capacity planning.

- **Input:** Content + model identity (to select tokenizer)
- **Output:** Approximate count + confidence indicator (exact vs. approximate)
- **Character:** Cheap surrogate for an expensive precise operation

#### 1.3.6 Translation (the seam process)

The transformation of facade-normalized types into provider-specific wire formats,
and the reverse transformation of provider responses back into facade types. This
process is invisible to the caller but is the defining act of the integration plane.

- **Input (outbound):** `NormalizedRequest` (facade types)
- **Output (outbound):** Provider-specific HTTP request (provider types)
- **Input (inbound):** Provider-specific HTTP response
- **Output (inbound):** `CompletionResponse` or `CompletionChunk` (facade types)
- **Character:** Deterministic, bidirectional, lossy in one direction (provider-specific features not representable in facade types are lost on the inbound path)

---

## 2. Function Taxonomy

Every function exposed by LLM APIs, across all providers, classified into a
categorical hierarchy. The genera and species here determine what MCP tools the
facade needs and how the integration plane organizes its adapters.

### Level 0: Genera

| Genus | Definition | Ontological Character |
|-------|-----------|----------------------|
| **Generative** | Functions that invoke the inference engine to produce new content | Causal, non-deterministic, resource-consuming |
| **Interrogative** | Functions that report on the system's state or configuration | Reflective, deterministic, cheap |
| **Preparatory** | Functions that validate, estimate, or pre-check before generation | Predictive, deterministic, cheap |
| **Administrative** | Functions that manage sessions, configuration, or lifecycle | Stateful, environment-modifying |

### Level 1: Species

#### Generative Genus

| Species | Definition | Facade Tool | Provider Expressions |
|---------|-----------|-------------|---------------------|
| **Batch Completion** | Submit a message sequence, receive a single complete response | `complete` | OpenAI `POST /chat/completions`, Anthropic `POST /messages`, Gemini `POST /models/{id}:generateContent`, Cohere `POST /chat`, Ollama `POST /api/chat` |
| **Streaming Completion** | Submit a message sequence, receive an ordered chunk sequence | `stream_complete` | Same endpoints with `stream: true` (or `alt=sse` for Gemini) |
| **Multi-Completion** | Generate N independent completions for one input | Not exposed (below seam) | OpenAI `n` param, Gemini `candidateCount` -- not universal |
| **Structured Generation** | Generate content conforming to a schema | Not exposed at core (extension) | OpenAI `response_format`, Anthropic `output_config.format`, Gemini `responseMimeType` |
| **Augmented Generation** | Generation enhanced by vendor-provided tools (search grounding, code execution) | Not exposed at core (Tier 2/3, capability-gated) | Gemini `google_search_retrieval` / `code_execution`, Anthropic `computer_use` / `web_search` -- vendor-supplied tools invoked server-side, distinct from caller-defined tool schemas |

#### Interrogative Genus

| Species | Definition | Facade Tool | Provider Expressions |
|---------|-----------|-------------|---------------------|
| **Model Enumeration** | List available models | `list_models` | OpenAI `GET /models`, Gemini `GET /models`, Ollama `GET /api/tags` -- Anthropic: none |
| **Model Inspection** | Get detailed metadata for one model | `get_model_info` | OpenAI `GET /models/{id}`, Gemini model metadata -- often requires static config supplement |
| **Configuration State** | Report current facade/backend status | `config://state` resource | No direct provider equivalent; facade-internal |
| **Session Inspection** | Report accumulated conversation state | `session://{id}` resource | No direct provider equivalent; facade-managed |

#### Preparatory Genus

| Species | Definition | Facade Tool | Provider Expressions |
|---------|-----------|-------------|---------------------|
| **Request Validation** | Check whether a request is satisfiable | `validate_request` | No direct provider equivalent; facade pre-checks context window, parameter ranges |
| **Token Estimation** | Approximate token count for content | `estimate_tokens` | OpenAI tiktoken (client-side), Anthropic token counting API, Gemini `countTokens` -- mostly client-side |

#### Administrative Genus

| Species | Definition | Facade Tool | Provider Expressions |
|---------|-----------|-------------|---------------------|
| **Session Management** | Create, maintain, expire conversation state | Implicit via `session_id` on generative tools | No direct provider equivalent; facade manages state above stateless provider APIs |
| **Provider Registration** | Register/deregister backend providers | Internal startup process | No consumer-facing API; configuration-driven |

### Level 2: Variants (Provider-Specific Expressions)

The table below shows how a single species manifests differently. These differences
are what the integration plane must absorb.

**Species: Batch Completion**

| Aspect | OpenAI | Anthropic | Gemini | Cohere | Ollama |
|--------|--------|-----------|--------|--------|--------|
| Endpoint | `POST /v1/chat/completions` | `POST /v1/messages` | `POST /v1beta/models/{id}:generateContent` | `POST /v2/chat` | `POST /api/chat` |
| Messages field | `messages` | `messages` | `contents` | `messages` | `messages` |
| System message | In messages array | Top-level `system` param | Top-level `systemInstruction` | In messages array | In messages array |
| Content path in response | `choices[0].message.content` | `content[0].text` | `candidates[0].content.parts[0].text` | `message.content[0].text` | `message.content` |
| Required params | `model`, `messages` | `model`, `messages`, `max_tokens` | model in path, `contents` | `model`, `messages` | `model`, `messages` |
| Finish reason field | `choices[0].finish_reason` | `stop_reason` | `candidates[0].finishReason` | `finish_reason` | `done_reason` |

This table is not exhaustive; it illustrates the pattern. Every species has an
equivalent variant table. `ProviderAnalysis.md` contains the complete mapping data.

---

## 3. Parameter Space Topology

Generation parameters are not a flat list. They occupy a structured space with
distinct regions that serve different ontological functions. Understanding this
topology prevents the mistake of treating all parameters as equivalent knobs.

### 3.1 Sampling Parameters (Distribution Shapers)

These parameters modify the probability distribution from which the next token is
selected. They operate on the same underlying object (the logit distribution) but at
different stages of the sampling pipeline.

```
Raw Logits
    |
    v
[temperature] -- scales logits (sharpens or flattens the entire distribution)
    |
    v
Softmax --> Probability Distribution
    |
    v
[top_k] -- truncates to K highest-probability tokens (hard cutoff)
    |
    v
[top_p] -- truncates to smallest set summing to P probability (adaptive cutoff)
    |
    v
[min_p] -- removes tokens below a fraction of the top token's probability
    |
    v
Renormalized Distribution --> Sample
```

**Geometric relationship:** Temperature operates on the logit space (pre-softmax).
Top-k and top-p operate on the probability space (post-softmax). They are not
alternatives to each other; they compose sequentially. Setting temperature=0 collapses
the distribution to a point mass regardless of top_k or top_p values. Setting top_k=1
also collapses to argmax regardless of temperature.

| Parameter | Space | Operation | Universality |
|-----------|-------|-----------|-------------|
| `temperature` | Logit | Multiplicative scaling (divide logits by T) | Universal |
| `top_p` | Probability | Cumulative probability threshold | Universal |
| `top_k` | Probability | Rank-order threshold | Partial (absent in OpenAI, Mistral, xAI) |
| `min_p` | Probability | Relative probability threshold | Rare (vLLM, text-gen-webui, some local) |

**Facade treatment:** `temperature` and `top_p` are core parameters. `top_k` is
capability-gated. `min_p` is below-seam (provider extension only).

### 3.2 Constraint Parameters (Boundaries)

These parameters define the boundaries of the generation space. They do not influence
what is generated within those boundaries; they determine where generation stops or
cannot begin.

| Parameter | Boundary Type | Known When | Facade Position |
|-----------|-------------- |------------|-----------------|
| `max_tokens` | Output length ceiling | Set by caller, validated pre-dispatch | Core |
| `stop_sequences` | Content-triggered termination | Set by caller, evaluated during generation | Core |
| `context_window` | Input capacity limit | Discoverable per model | Core (read-only, not a request parameter) |
| `max_output_tokens` (model-imposed) | Provider-enforced output ceiling | Discoverable per model | Core (read-only) |

**Ontological distinction from sampling parameters:** Constraints define the box.
Sampling parameters shape what happens inside the box. A constraint failure is a
boundary violation (error). A sampling parameter value is a preference (warning at
most if unsupported).

### 3.3 Behavioral Parameters (Process Modifiers)

These parameters modify the generation process itself -- specifically, they alter the
scoring of candidate tokens based on prior context. Unlike sampling parameters (which
shape the final distribution), behavioral parameters change how the distribution is
constructed.

| Parameter | Mechanism | Effect | Universality |
|-----------|-----------|--------|-------------|
| `frequency_penalty` | Subtracts a value proportional to token frequency in prior output | Discourages repetition of frequently used tokens | Partial (absent in Anthropic) |
| `presence_penalty` | Subtracts a flat value for any token that has appeared | Discourages any repetition, encourages topic breadth | Partial (absent in Anthropic) |
| `repetition_penalty` | Divides logits by a factor for repeated tokens | Same goal as above, different mechanism | Rare (local runtimes: vLLM, text-gen-webui) |

**Relationship between the three:** Frequency penalty and presence penalty are additive
adjustments to logits. Repetition penalty is a multiplicative adjustment. They target
the same phenomenon (repetition) through different mathematical operations. The facade
should not attempt to translate between them; they are distinct parameters that happen
to share a goal.

**Facade treatment:** `frequency_penalty` and `presence_penalty` are capability-gated
(Tier 2). `repetition_penalty` is below-seam (provider extension).

### 3.4 Structural Parameters (Output Shape Constraints)

These parameters constrain the shape or format of the output without directly
influencing its semantic content. They are boundary conditions on structure, not on
meaning.

| Parameter | Constrains | Mechanism | Universality |
|-----------|-----------|-----------|-------------|
| `response_format` | Output serialization | Forces JSON, specific schema, or plain text | Widespread but divergent |
| `tools` | Output vocabulary | Defines callable functions; model may produce tool-call structures | Widespread but divergent |
| `tool_choice` | Output decision space | Constrains whether/which tools the model may invoke | Widespread but divergent |
| `grammar` | Output syntax | BNF/GBNF grammar constraining token sequences | Rare (llama.cpp, vLLM `guided_grammar`) |

**Ontological distinction:** Sampling and behavioral parameters affect the probability
of content. Structural parameters affect the form that content can take. The difference
is between "what is likely to be said" and "what shape the saying must take."

**Facade treatment:** All are below the core seam (Tier 1 or Tier 3). Exposed through
capability discovery and Layer 2 extensions.

### 3.5 Meta-Parameters (Parameters About the Process)

These parameters do not affect the generation algorithm's behavior on any single token
decision. They govern the process of generation at a higher level -- controlling
determinism, reasoning depth, or computational budget.

| Parameter | Governs | Character | Universality |
|-----------|---------|-----------|-------------|
| `seed` | Reproducibility | Requests deterministic behavior (best-effort, not guaranteed) | Partial |
| `reasoning_effort` | Depth of internal computation | Controls how much "thinking" the model does (OpenAI o-series, xAI, Gemini 2.5 Flash `thinkingBudget`) | Partial |
| `thinking.budget_tokens` | Reasoning token allocation | Caps tokens spent on chain-of-thought (Anthropic, Gemini 2.5 Pro) | Partial |
| `n` / `candidateCount` | Parallelism of generation | Requests multiple independent completions | Partial |

**Ontological status:** These are second-order parameters -- parameters about the
process rather than within the process. `seed` is about reproducibility of the entire
generation. `reasoning_effort` is about how much computational work to invest.
`n` is about how many times to run the process.

**Facade treatment:** `seed` is capability-gated (Tier 2). Reasoning parameters are
capability-gated (Tier 2) with a categorical-vs-numeric bifurcation: some model
families accept categorical levels (`low`/`medium`/`high` -- OpenAI o-series, xAI,
Gemini 2.5 Flash) while others accept numeric token budgets (Anthropic, Gemini 2.5
Pro). These two interfaces are not interchangeable; the facade exposes both and
validates which form applies per model registration. `n` is not exposed (the facade
returns one completion; callers who want multiple can call multiple times).

### 3.6 Parameter Space Partitions (Mutual Exclusion by Model Type)

The parameter space is not a single continuum available to all models. It partitions
into **disjoint regions** based on model type. Certain model families reject parameters
that are valid for other families, not because the parameter is unrecognized, but
because it is categorically inapplicable.

**Known partitions:**

| Model Family | Rejected Parameters | Reason |
|-------------|-------------------|--------|
| OpenAI o-series (reasoning) | `temperature`, `top_p`, `frequency_penalty`, `presence_penalty` | Reasoning models control their own sampling; external distribution shaping conflicts with the reasoning process |
| xAI reasoning models | `frequency_penalty`, `presence_penalty` | Same conflict between penalty-based steering and internal reasoning |

**Ontological character:** These are not capability gaps (where a parameter is simply
absent). They are **categorical incompatibilities** -- the parameter exists in the
provider's vocabulary but is forbidden for specific model types. Sending `temperature`
to an o-series model is not "unsupported"; it is a type error.

**Facade implication:** Request validation (Section 1.3.3) must enforce parameter
partitions per model registration. The capability profile must declare not only which
parameters are supported, but which are **prohibited**. This is a stronger constraint
than absence: a prohibited parameter in a request is a validation error, not a
silent omission.

---

## 4. Error Ontology

Errors are classified by their **nature** -- the kind of failure they represent --
not by their HTTP status code, which is an accident of transport. The same nature
of failure may carry different HTTP codes across providers (e.g., context overflow
is HTTP 400 at OpenAI and Anthropic, but has no distinct code -- it is buried in the
error message).

### 4.1 Precondition Failures

The request cannot be attempted. The generation process cannot begin because its
prerequisites are not met. These are analogous to proof obligations that fail before
execution.

| Category | Nature | Retryable | Examples |
|----------|--------|-----------|---------|
| `validation_error` | The request is malformed or incomplete | No (fix the request) | Missing model, empty messages, wrong parameter type |
| `authentication` | The caller's identity cannot be verified | No (fix credentials) | Invalid API key, expired token |
| `permission` | The caller's identity is verified but insufficient | No (escalate access) | Valid key without access to requested model |
| `model_unavailable` | The target model does not exist in the current configuration | Maybe (model may come online) | Typo in model name, provider deregistered |

**Ontological character:** These failures belong to the request or to the caller's
relationship with the system. They say nothing about the system's capacity or the
generation process.

### 4.2 Capacity Failures

The system cannot accommodate the request at this time. The request is valid but the
resources required exceed current availability.

| Category | Nature | Retryable | Examples |
|----------|--------|-----------|---------|
| `context_overflow` | Input exceeds the model's structural capacity | No (reduce input) | Message sequence too long for context window |
| `rate_limited` | Infrastructure throttling | Yes (wait and retry) | Too many requests per time window |
| `overloaded` | Provider infrastructure at capacity | Yes (wait and retry) | Anthropic 529 overloaded; provider cannot accept new requests regardless of caller's rate allocation |
| `quota_exceeded` | Billing or allocation limit reached | No (increase allocation) | Monthly token budget consumed |

**Ontological character:** These failures belong to the relationship between the
request's resource demands and the system's current capacity. The request is
well-formed; the system simply cannot serve it now or in this configuration.

### 4.3 Process Failures

Generation began but could not complete. These are mid-process failures -- the system
accepted the request, began work, and then encountered a condition that prevented
completion.

| Category | Nature | Retryable | Examples |
|----------|--------|-----------|---------|
| `content_filtered` | Output (or input) violated a normative boundary during processing | No (change the prompt or accept the filter) | Safety filter triggered mid-generation |
| `timeout` | The process exceeded its time budget | Yes (retry; may succeed if load decreases) | Provider did not respond within deadline |
| `stream_interrupted` | A streaming generation was broken mid-delivery | Yes (retry from scratch; partial data is discarded) | Network interruption, provider crash during stream |

**Ontological character:** These failures belong to the generation process itself.
The request was valid, resources were available, but the process encountered an
obstacle. For streaming, partial results may have been delivered before the failure;
the facade must communicate that the stream is incomplete.

### 4.4 System Failures

Infrastructure failure unrelated to the specific request. Any request would have
failed in the same way at the same time.

| Category | Nature | Retryable | Examples |
|----------|--------|-----------|---------|
| `provider_error` | The provider returned an internal error (5xx) | Yes (transient failure) | Provider server crash, deployment in progress |
| `internal_error` | The facade itself failed | Yes (if transient) or No (if bug) | Unhandled exception in the facade, serialization failure |
| `unknown` | An error that cannot be classified | Unknown | Unmapped provider error code, unexpected response shape |

**Ontological character:** These failures belong to the infrastructure, not to the
request or the generation process. They indicate system-level dysfunction.

### 4.5 Error Hierarchy

```
Error
 +-- PreconditionFailure
 |    +-- ValidationError
 |    +-- AuthenticationError
 |    +-- PermissionError
 |    +-- ModelUnavailableError
 +-- CapacityFailure
 |    +-- ContextOverflowError
 |    +-- RateLimitedError
 |    +-- OverloadedError
 |    +-- QuotaExceededError
 +-- ProcessFailure
 |    +-- ContentFilteredError
 |    +-- TimeoutError
 |    +-- StreamInterruptedError
 +-- SystemFailure
      +-- ProviderError
      +-- InternalError
      +-- UnknownError
```

Each error carries: `category` (genus), `code` (species), `message` (human-readable),
`retryable` (boolean), `correlation_id` (links to request), `provider_code` (nullable,
opaque -- never interpreted by facade-layer code).

---

## 5. The Seam as Ontological Boundary

The seam is not merely an interface. It is the boundary between two ontological
regimes: the **universal domain** (where concepts are provider-agnostic and types are
normalized) and the **particular domain** (where concepts are provider-specific and
types are native).

### 5.1 What Crosses the Seam

Only normalized facade types cross the seam. Specifically:

**Outbound (facade to provider):**
- `NormalizedRequest` -- messages, parameters, model identity, all in facade vocabulary
- `ModelIdentity` -- provider + model_id composite

**Inbound (provider to facade):**
- `CompletionResponse` -- content, finish reason, usage, in facade vocabulary
- `CompletionChunk` -- delta content, optional finish reason, optional usage
- `FacadeError` -- classified error with category, message, retryable flag

Layer 2 (structured extensions) also crosses the seam in both directions -- as typed,
validated extension values on requests and as extension data on responses. Extensions
cross the seam without normalization; the seam organizes them (validates schemas, makes
them discoverable) without altering their semantics. The distinction is precise:
Layer 1 types are *translated* at the seam (provider vocabulary becomes facade
vocabulary). Layer 2 types are *transmitted* through the seam (provider-specific
semantics are preserved intact, but wrapped in a consistent organizational structure).

Nothing else crosses. No HTTP status codes. No provider-specific parameter names.
No raw JSON. No SDK types.

### 5.2 What Is Transformed at the Seam

The seam is where translation occurs. Translation is the central act of the
integration plane, and it operates on three dimensions.

Response normalization takes two distinct forms depending on provider structure:
**extraction** (unwrapping a completion from a wrapper array -- OpenAI `choices[0]`,
Gemini `candidates[0]`) and **synthesis** (constructing the normalized response from
a flat or differently-shaped structure -- Anthropic, Cohere, Ollama). The distinction
matters because extraction is a structural unwrapping with a clear path, while
synthesis requires the adapter to actively assemble the facade type from dispersed
fields. Both produce the same `CompletionResponse`, but the cognitive and
implementation complexity differ.

| Dimension | Transformation | Example |
|-----------|---------------|---------|
| **Names** | Canonical parameter names to provider-specific names | `max_tokens` --> `max_completion_tokens` (OpenAI), `options.num_predict` (Ollama) |
| **Shapes** | Canonical structures to provider-specific wire formats | Messages array --> Gemini `contents` with `parts`; system message extracted to top-level `system` param (Anthropic) |
| **Protocols** | Canonical streaming contract to provider-specific transport | Uniform chunk sequence --> Anthropic's typed event stream with `message_start`, `content_block_delta`, etc. |

### 5.3 What Is Lost at the Seam

Translation is lossy in the inbound direction. The following are lost when a provider
response crosses back into the facade domain:

| Lost Information | Why It Is Lost | Where It Lived |
|-----------------|---------------|----------------|
| Provider identity in response | Principle #1: Provider Opacity | Provider response headers, response body metadata |
| Raw error codes and shapes | Principle #6: Fail Explicitly (facade error taxonomy replaces native codes) | Provider error response body |
| Provider-specific finish reasons | Normalization to `{stop, length, content_filter, tool_use, error}` | `stop_reason`, `finishReason`, etc. |
| Sub-token timing data | Not part of facade types | Ollama timing fields, OpenAI detailed usage breakdowns |
| Cache hit/miss indicators | Provider-specific optimization detail | Anthropic `cache_read_input_tokens`, Gemini `cachedContentTokenCount` |
| Content block lifecycle events | Streaming is normalized to flat deltas | Anthropic's `content_block_start`/`content_block_stop` |
| Multiple completion choices | Facade returns one completion | OpenAI `choices[1..n]`, Gemini `candidates[1..n]` |

**Note on Layer 2 recovery.** Several items in this table -- cache hit/miss indicators,
detailed token breakdowns (sub-token timing, input/output/reasoning splits beyond the
facade's core `Usage` fields), and safety ratings -- are no longer unconditionally lost.
When a provider adapter registers these as Layer 2 extensions, and the consumer opts in
by querying `get_model_info` and including the relevant extension IDs, the information
is preserved as typed `extension_data` on the response. The loss described above applies
to Layer 1 normalization. Layer 2 organization provides a recovery path for consumers
who need the detail. The information remains provider-attributed; it is not promoted to
universal status merely by being preserved.

### 5.4 What Is Gained at the Seam

The seam is not purely subtractive. Crossing the seam adds:

| Gained Property | How It Is Gained |
|----------------|-----------------|
| **Uniformity** | Every completion has the same shape regardless of provider. Consumer code works without conditional branches per provider. |
| **Predictability** | Error categories are finite and documented. No surprise error shapes. |
| **Composability** | Because types are uniform, completions from different providers can be composed, compared, and interleaved without adaptation. |
| **Validated constraints** | The facade pre-validates context windows and parameter ranges. Providers that lack pre-validation gain it. |
| **Token awareness** | Providers that do not report token usage get approximate estimates. Every response includes usage data. (Principle #7) |
| **Discoverability of provider-specific features** | Layer 2 extensions are registered with schemas and surfaced through `get_model_info`. A consumer can programmatically learn what provider-specific features are available for a given model before using them, rather than consulting external documentation or guessing. |

### 5.5 The Seam as Funnel and Lens

The seam operates in two modes simultaneously, each serving a different ontological
layer.

**Layer 1: The Lossy Funnel.** Universal concepts converge. Many provider-native shapes
are mapped into one facade shape. Information that does not fit through the funnel is
either translated (name and shape differences) or dropped (provider-specific metadata
that has no facade equivalent). This is the normalization path. It is intentionally
lossy; the information loss is the cost of uniformity.

**Layer 2: The Lossless Lens.** Provider-specific features pass through intact. The
seam does not alter their semantics -- it organizes them. Each extension is validated
against its registered schema, keyed by a canonical identifier, and made discoverable.
The information is preserved; the structure is imposed. This is the organization path.
It is intentionally lossless; the structural imposition is the cost of discoverability.

```
                        THE SEAM

  Layer 1 Path (Funnel -- lossy, normalizing):

  OpenAI types ----\
  Anthropic types --+---> NormalizedRequest ---> ICompletionProvider
  Gemini types ----/           ^
  Cohere types ---/            |
  Ollama types --/        many shapes in,
                          one shape out

                          one shape in,
                          many shapes out
                               |
                               v
  CompletionResponse <--- ICompletionProvider
         |
         v
    (uniform for all callers)


  Layer 2 Path (Lens -- lossless, organizing):

  Anthropic cache_control ----\
  Gemini safety_settings ------+---> extensions: Map<ExtensionId, ExtensionValue>
  OpenAI predicted_output ----/           ^
  Ollama mirostat ------------/           |
                                   typed, validated,
                                   semantics preserved

                                   keyed, typed,
                                   provider-attributed
                                          |
                                          v
  extension_data: Map<ExtensionId, ExtensionValue> <--- adapter
         |
         v
    (discoverable per model, opt-in per request)
```

Both paths compose into a single request and response. A `NormalizedRequest` carries
Layer 1 types (messages, parameters, model identity) and optionally Layer 2 types
(extensions). A `CompletionResponse` carries Layer 1 types (content, finish reason,
usage) and optionally Layer 2 types (extension_data). The two layers are orthogonal;
a consumer may use either, both, or neither of the layers beyond the core.

---

## 6. Existential Classification Matrix

Every concept encountered across all 11 providers, classified by ontological status,
universality, and facade position.

### 6.1 Core Concepts

| Concept | Ontological Status | Universality | Facade Position | Notes |
|---------|-------------------|-------------|-----------------|-------|
| Message | Artifact (event-with-residue) | Universal | Core | Immutable value object; ordered in sequence |
| Role (system/user/assistant) | Functional role | Universal | Core | Gemini uses `model` for assistant; normalized |
| Completion (batch response) | Artifact (event-with-residue) | Universal | Core | Produced by generation process |
| Content | Substance (the payload) | Universal | Core | Ordered array of typed content blocks (see below) |
| Finish reason | Property (of completion) | Universal | Core | Normalized to `{stop, length, content_filter, tool_use, error}` |
| Token usage (input/output) | Measurement (of process) | Near-Universal | Core | Approximate when provider omits; Principle #7 |
| Temperature | Sampling parameter | Universal | Core | Range-normalized; behavioral equivalence not guaranteed |
| Max tokens | Constraint parameter | Universal | Core | Name varies; semantics diverge for reasoning models where the budget includes invisible reasoning tokens |
| Top-p | Sampling parameter | Universal | Core | Named `p` in Cohere |
| Stop sequences | Constraint parameter | Universal | Core | String vs. array normalized |
| Context window | Constraint (structural boundary) | Universal | Core (read-only) | Discoverable per model |
| Model identity | Entity (composite identifier) | Universal | Core | Provider + model_id |
| Streaming chunk | Artifact (event-with-residue) | Universal | Core | Ordered, carries delta content |
| Completion ID | Identifier (reference) | Near-Universal | Core | Facade-generated if provider omits |

**Content block model.** Content is not a string. It is an ordered array of typed
blocks. Anthropic always returns content block arrays. Gemini uses `parts` arrays
with seven or more distinct types. Tool calling requires non-text content in both
requests and responses. A string-only content model cannot represent these interactions.

The facade content type is therefore an ordered array of typed content blocks:

| Block Type | Tier | Direction | Description |
|-----------|------|-----------|-------------|
| `text` | Core | Both | Plain text content. Universal across all providers. |
| `tool_use` | Tier 1 (Extended) | Response | Model is requesting tool execution. Contains tool name, call ID, and arguments. |
| `tool_result` | Tier 1 (Extended) | Request | Caller supplies the result of a prior tool invocation. Contains call ID and output. |
| `thinking` | Tier 2 (Extended) | Response | Extended thinking / chain-of-thought trace. Passthrough from providers that expose reasoning. |
| `image` | Tier 2 (Extended) | Request | Image content for vision-capable models. |

**String shorthand:** When content is a single `text` block, a plain string is accepted
as input and may be returned as output for convenience. This is syntactic sugar; the
canonical form is always the block array. Facade internals operate on blocks, never on
raw strings.

**Finish reason semantics.** The expanded finish reason enumeration maps provider
signals as follows:

| Facade Reason | Meaning | Provider Mappings |
|--------------|---------|-------------------|
| `stop` | Natural completion or stop sequence | OpenAI `stop`, Anthropic `end_turn`, Gemini `STOP`, Cohere `COMPLETE`, Ollama `stop` |
| `length` | Output token limit reached | OpenAI `length`, Anthropic `max_tokens`, Gemini `MAX_TOKENS`, Ollama `length` |
| `content_filter` | Safety filter intervened | OpenAI `content_filter`, Gemini `SAFETY` / `BLOCKLIST` / `PROHIBITED_CONTENT` |
| `tool_use` | Model is requesting tool execution | OpenAI `tool_calls`, Anthropic `tool_use`, Gemini `TOOL_CALLS` (non-error) |
| `error` | Generation failed for non-content-filter reasons | Gemini `MALFORMED_FUNCTION_CALL`, `IMAGE_SAFETY`, other provider-specific generation failures |

### 6.2 Extended Concepts

| Concept | Ontological Status | Universality | Facade Position | Notes |
|---------|-------------------|-------------|-----------------|-------|
| Top-k | Sampling parameter | Partial | Extended (capability-gated) | Absent in OpenAI, Mistral, xAI |
| Frequency penalty | Behavioral parameter | Partial | Extended (capability-gated) | Absent in Anthropic; present in OpenAI, Gemini, Cohere |
| Presence penalty | Behavioral parameter | Partial | Extended (capability-gated) | Absent in Anthropic; present in OpenAI, Gemini, Cohere |
| Seed | Meta-parameter | Partial | Extended (capability-gated) | Best-effort; not guaranteed deterministic |
| Tool calling | Structural parameter + process | Widespread | Extended (Tier 1) | Schema divergence requires per-provider translation |
| Tool choice | Structural parameter | Widespread | Extended (Tier 1) | Vocabulary differs (`auto`/`any`/`required`/`none`) |
| Structured output / JSON mode | Structural parameter | Widespread | Extended (Tier 1) | Guarantee strength varies by provider |
| Vision / image input | Capability (relational property) | Widespread | Extended (Tier 2) | Model-dependent even within providers |
| Multiple completions (n) | Meta-parameter | Partial | Below-Seam | Facade returns one completion |
| Logprobs | Property (of generation process) | Rare | Below-Seam | Specialized use; not normalized |
| Stop sequence (distinguished from natural stop) | Property (of finish reason) | Partial | Extended | Anthropic/Cohere distinguish; OpenAI conflates |

### 6.3 Seam-Level Concepts

| Concept | Ontological Status | Universality | Facade Position | Notes |
|---------|-------------------|-------------|-----------------|-------|
| `ICompletionProvider` | Interface (contract) | N/A (facade-defined) | Seam | The delegation contract |
| `NormalizedRequest` | Artifact (translation input) | N/A (facade-defined) | Seam | Canonical request shape |
| Parameter name mapping | Relation (translation table) | Per-provider | Seam | Each adapter maintains its map |
| Capability profile | Entity (metadata) | Per-registration | Seam | Discovered or configured per model |
| `extensions` | Container (typed, validated) | N/A (facade-defined) | Seam | Structured namespace for provider-specific features. Each extension registered with schema, discoverable via `get_model_info`. |
| `ExtensionDescriptor` | Entity (metadata) | N/A (facade-defined) | Seam | Describes an available extension: id, name, description, input/response schemas. |
| `extension_data` | Container (typed response data) | N/A (facade-defined) | Seam | Provider-specific response information keyed by extension ID. Populated when the consumer opts into extensions and the adapter produces corresponding response data. |
| System prompt extraction | Process (structural translation) | Per-provider | Seam | Anthropic/Gemini require extraction from messages |

### 6.4 Below-Seam Concepts

| Concept | Ontological Status | Universality | Facade Position | Notes |
|---------|-------------------|-------------|-----------------|-------|
| HTTP transport | Infrastructure | Universal (among HTTP providers) | Below-Seam | REST for all; gRPC not observed |
| SSE vs. NDJSON streaming | Protocol variant | Near-Universal vs. Ollama | Below-Seam | Three protocol variants: standard SSE (OpenAI, Anthropic, Gemini, xAI, Mistral), NDJSON (Ollama native), and named SSE events (Cohere). All are below-seam; the facade normalizes to a uniform async chunk sequence. |
| Authentication mechanism | Infrastructure | Per-provider | Below-Seam | Bearer, API key, none |
| Wire format (JSON shape) | Protocol | Per-provider | Below-Seam | The raw request/response bodies |
| Rate limit headers | Infrastructure metadata | Partial | Below-Seam | Used for retry logic, not exposed to caller |
| Prompt caching | Provider optimization | Rare | Below-Seam (Tier 3) | Mechanisms completely different per provider |
| Extended thinking / reasoning config | Meta-parameter | Partial | Extended (Tier 2, capability-gated) | Three major providers now support reasoning (Anthropic, OpenAI o-series, Gemini). Categorical-vs-numeric bifurcation documented in Section 3.5. Thinking blocks appear in the content block model. |
| Developer role (OpenAI) | Functional role variant | Singular | Below-Seam (Distinctive) | OpenAI's `developer` role replaces `system` for newer model families. The facade's `system` role maps to `system` or `developer` depending on model family at the seam. |
| Batch API / async jobs | Process variant | Rare | Out-of-Scope | Separate operational model from real-time facade |
| Embeddings | Separate process | Widespread | Out-of-Scope | Different API surface entirely |
| Fine-tuning | Separate lifecycle | Partial | Out-of-Scope | Not an interaction concern |
| Cost / pricing | External fact | Per-provider | Out-of-Scope | Changes independently; not a domain concept |
| Content block lifecycle (Anthropic) | Protocol detail | Singular | Below-Seam | Normalized to flat delta stream |
| `choices` array (OpenAI pattern) | Structural wrapper | Partial | Below-Seam | Facade extracts `choices[0]`; array is an artifact of multi-completion support |
| `candidates` array (Gemini pattern) | Structural wrapper | Singular | Below-Seam | Same as above, Gemini's name for it |

### 6.5 Local Runtime Concepts

The preceding classifications carry a cloud-provider bias: they assume models are
always available, infrastructure is invisible, and the API surface is the only
interaction point. Local runtimes (Ollama, llama.cpp, vLLM, text-generation-webui)
introduce concepts absent from cloud APIs.

| Concept | Ontological Status | Universality | Facade Position | Notes |
|---------|-------------------|-------------|-----------------|-------|
| Model pull / download | Administrative process | Local runtimes only | Below-Seam (infrastructure) | Cloud APIs have no equivalent; models are always available. Model management is an administrative lifecycle concern outside the generation path. |
| Model load / unload | Administrative process | Local runtimes only | Below-Seam (infrastructure) | Loading a model into GPU/CPU memory is a prerequisite to generation in local runtimes. Cloud providers handle this transparently. |
| GPU layer allocation (`n_gpu_layers`) | Resource parameter | Local runtimes only | Below-Seam (provider extension) | Determines how much of the model runs on GPU vs. CPU. No cloud equivalent. |
| Quantization level | Model variant descriptor | Local runtimes only | Below-Seam (model metadata) | Q4_K_M, Q8_0, etc. Affects quality and resource consumption. Cloud providers abstract this away. |
| Mirostat sampling | Sampling parameter | Rare (local runtimes) | Below-Seam (provider extension) | Perplexity-targeting sampler with no cloud equivalent. Passed through Layer 2 `extensions`. |
| Grammar-constrained generation (GBNF) | Structural parameter | Rare (llama.cpp, vLLM) | Below-Seam (provider extension) | BNF grammar constraining output syntax. More powerful than JSON mode but not normalizable across providers. |
| Context memory management (`num_ctx`) | Resource parameter | Local runtimes only | Below-Seam (provider extension) | Explicit control of KV cache allocation. Cloud providers manage this internally. |

**Ontological character:** These concepts belong to the **infrastructure layer** --
the substrate on which the generation process runs. They are categorically below the
seam because they address questions of physical resource management that cloud APIs
render invisible. The facade acknowledges their existence through Layer 2 extensions
and through model metadata (quantization level is relevant to capability discovery),
but it does not normalize or translate them.

---

## 7. Ontological Commitments Summary

These are the irreducible commitments this taxonomy makes. If any of them change,
the facade's type system and boundary definitions change with them.

1. **Roles are functions, not identities.** The facade never represents who is
   speaking, only in what capacity content is offered to the inference engine.

2. **Artifacts are immutable, typed, and structured.** Messages, completions, and
   chunks are produced once and never modified. They are values, not mutable objects.
   Content within artifacts is an ordered array of typed blocks, not a plain string.
   This structure is load-bearing: it enables tool calling, reasoning traces, and
   multi-modal content to coexist within a single artifact.

3. **Capabilities are relational.** A capability exists between a model and a provider,
   not in either alone. The facade discovers capabilities; it does not assume them.

4. **Constraints are boundaries, not preferences.** Violating a constraint is an error.
   Setting an unsupported parameter is a warning. The two are ontologically different.

5. **Streaming is an observation mode, not a different process.** The same generation
   produces the same output whether observed as a batch or a stream.

6. **The seam is both funnel and lens.** Layer 1 translation from provider types to
   facade types is information-reducing (the lossy funnel). This is intentional, not
   a deficiency. Layer 2 organization of provider-specific features is information-
   preserving (the lossless lens). Information lost at Layer 1 may be recoverable at
   Layer 2 when the consumer opts in to the relevant extensions.

7. **Errors have natures, not just codes.** The error taxonomy classifies by what
   kind of thing went wrong (precondition, capacity, process, system), not by what
   number the HTTP layer happened to assign.

8. **Parameters occupy distinct topological regions.** Sampling, constraint, behavioral,
   structural, and meta-parameters serve different functions and have different
   ontological statuses. They must not be treated as a flat bag of key-value pairs.

9. **The facade organizes, not just normalizes.** The facade's purpose is to make the
   entire LLM interaction space navigable from a single surface. Universal concepts
   are normalized: one vocabulary for all providers. Provider-specific concepts are
   organized: typed, named, discoverable, and provider-attributed. Both layers are
   first-class ontological inhabitants of the facade. Neither is an escape hatch or
   an afterthought. The architecture serves consumers who want portability (Layer 1)
   and consumers who want capability (Layer 2) through the same coherent surface.

---

## Appendix A: Reading This Document

This taxonomy serves two audiences:

**For architectural reasoning:** Use the ontological categories (Section 1) and the
seam analysis (Section 5) to determine where a new concept belongs before writing
any code. If a concept is an artifact, it is a value object. If it is a process, it
is a method or pipeline. If it is a constraint, it is a validation rule. If it is a
capability, it is a discoverable flag.

**For implementation guidance:** Use the function taxonomy (Section 2) to determine
what tools and interfaces are needed. Use the parameter space topology (Section 3) to
determine how to group, validate, and transform parameters. Use the error ontology
(Section 4) to determine how to classify and handle failures. Use the classification
matrix (Section 6) to determine whether a specific concept belongs above, at, or below
the seam.

**For evaluating new providers:** When a new LLM provider appears, classify each of
its API concepts using this matrix. Concepts that map to existing universal/core
entries require only adapter implementation. Concepts that are genuinely novel require
a decision: extend the taxonomy or classify as below-seam. Concepts that are provider-
specific but valuable to consumers who target that provider should be classified as
Layer 2 extensions (Section 5.5, Section 6.3). The rationale for the dual-layer model
and the ontological status of structured extensions is developed fully in
`PositionPaper-FacadeAsInformationArchitecture.md`.
