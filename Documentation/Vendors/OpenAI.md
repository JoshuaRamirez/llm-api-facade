# OpenAI Vendor Inventory

> Authoritative reference for the OpenAI Chat Completions API surface.
> Scope: Chat Completions endpoint only. Does not cover Responses API, Assistants API, Embeddings, Images, Audio, or Batch.
> Last researched: 2026-03-26

---

## 1. Identity

| Attribute | Value |
|-----------|-------|
| Official Name | OpenAI API |
| Base URL | `https://api.openai.com/v1` |
| Chat Completions Endpoint | `POST /v1/chat/completions` |
| Versioning Scheme | URL path prefix (`/v1/`). No date-based API versions on OpenAI-hosted API. Model versions are date-stamped snapshots (e.g., `gpt-4o-2024-08-06`). |
| Authentication | Bearer token in `Authorization` header: `Authorization: Bearer sk-...` |
| Optional Headers | `OpenAI-Organization: org-...` (multi-org accounts), `OpenAI-Project: proj-...` (project scoping) |
| Content Type | `application/json` (request and response) |

### SDK Availability

| Language | Package | Status |
|----------|---------|--------|
| Python | `openai` (PyPI) | GA |
| TypeScript/JavaScript | `openai` (npm) | GA |
| C# / .NET | `OpenAI` (NuGet, co-developed with Microsoft) | GA |
| Go | `openai-go` | Beta |
| Java | `openai-java` | Beta |

### Rate Limiting Model

**Metrics**: RPM (requests/min), RPD (requests/day), TPM (tokens/min), TPD (tokens/day), IPM (images/min). Any metric can trigger a limit independently.

**Tier Structure** (based on cumulative spend):

| Tier | Qualification | Monthly Usage Cap |
|------|---------------|-------------------|
| Free | Allowed geography | $100 |
| Tier 1 | $5 paid | $100 |
| Tier 2 | $50 paid + 7 days | $500 |
| Tier 3 | $100 paid + 7 days | $1,000 |
| Tier 4 | $250 paid + 14 days | $5,000 |
| Tier 5 | $1,000 paid + 30 days | $200,000 |

Rate limits are scoped to organization and project, not individual user.

**Response Headers**:

| Header | Purpose |
|--------|---------|
| `x-ratelimit-limit-requests` | RPM ceiling |
| `x-ratelimit-limit-tokens` | TPM ceiling |
| `x-ratelimit-remaining-requests` | RPM remaining |
| `x-ratelimit-remaining-tokens` | TPM remaining |
| `x-ratelimit-reset-requests` | Time until RPM reset |
| `x-ratelimit-reset-tokens` | Time until TPM reset |

---

## 2. Function Inventory (Chat Completions Request Parameters)

### Core Parameters

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `model` | string | Yes | -- | Valid model ID | Specifies which model generates the response. |
| `messages` | array | Yes | -- | Non-empty array of message objects | The conversation history. See Message Ontology (Section 3). |
| `max_completion_tokens` | integer | No | Model-dependent | >= 1 | Upper bound on generated tokens including reasoning tokens. Preferred over `max_tokens`. |
| `max_tokens` | integer | No | Model-dependent | >= 1 | Legacy alias for `max_completion_tokens`. Does not account for reasoning tokens on o-series models. |

### Sampling Parameters (Non-Reasoning Models Only)

Reasoning models (o-series) reject these parameters.

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `temperature` | number | No | 1.0 | 0.0 to 2.0 | Controls randomness. Lower = more deterministic. |
| `top_p` | number | No | 1.0 | 0.0 to 1.0 | Nucleus sampling threshold. Filters tokens by cumulative probability. |
| `frequency_penalty` | number | No | 0.0 | -2.0 to 2.0 | Penalizes tokens proportional to their frequency in the output so far. |
| `presence_penalty` | number | No | 0.0 | -2.0 to 2.0 | Penalizes tokens that have appeared at all in the output so far. |
| `logit_bias` | object | No | null | Map of token ID (string) to bias value (-100 to 100) | Modifies likelihood of specific tokens. -100 effectively bans; 100 forces. |
| `seed` | integer | No | null | Any integer | Enables deterministic sampling (best-effort). Use with `system_fingerprint` to detect backend changes. |

### Reasoning Parameters (o-Series Models Only)

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `reasoning_effort` | string | No | "medium" | `"low"`, `"medium"`, `"high"` | Controls how many reasoning tokens the model spends before answering. Lower = faster and cheaper, less thorough. |

### Output Control

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `n` | integer | No | 1 | >= 1 | Number of completions to generate per request. |
| `stop` | string or array | No | null | Up to 4 sequences | Stop sequences. Generation halts when any sequence is emitted. The sequence itself is excluded from output. |
| `response_format` | object | No | `{"type": "text"}` | See below | Controls output format: plain text, JSON mode, or structured JSON schema. |
| `logprobs` | boolean | No | false | -- | Whether to return log probabilities of output tokens. |
| `top_logprobs` | integer | No | null | 0 to 20 | Number of most-likely alternative tokens to return per position. Requires `logprobs: true`. |

#### `response_format` Variants

| Type Value | Shape | Behavior |
|------------|-------|----------|
| `"text"` | `{"type": "text"}` | Default. Unstructured text output. |
| `"json_object"` | `{"type": "json_object"}` | JSON mode. Guarantees valid JSON. No schema enforcement. Requires the word "JSON" in the prompt. |
| `"json_schema"` | `{"type": "json_schema", "json_schema": {"name": "...", "strict": true, "schema": {...}}}` | Structured Outputs. Guarantees JSON conforming to the provided schema. `strict: true` recommended. |

### Tool / Function Calling

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `tools` | array | No | null | Array of tool objects | Defines functions the model may call. Each tool has `type: "function"` and a `function` object with `name`, `description`, `parameters` (JSON Schema), and optional `strict: true`. |
| `tool_choice` | string or object | No | `"auto"` | `"auto"`, `"none"`, `"required"`, or `{"type": "function", "function": {"name": "..."}}` | Controls whether/which tools the model calls. `"required"` forces at least one tool call. |
| `parallel_tool_calls` | boolean | No | true | -- | Whether the model may emit multiple tool calls in a single turn. Incompatible with `strict: true` on tool definitions. |
| `functions` | array | No | -- | Deprecated | Legacy function calling. Replaced by `tools`. |
| `function_call` | string or object | No | -- | Deprecated | Legacy. Replaced by `tool_choice`. |

### Streaming

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `stream` | boolean | No | false | -- | Enables Server-Sent Events (SSE) streaming of response chunks. |
| `stream_options` | object | No | null | `{"include_usage": true}` | Controls streaming behavior. `include_usage: true` appends a final chunk with token usage statistics. |

### Multimodality

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `modalities` | array | No | `["text"]` | `["text"]`, `["text", "audio"]` | Declares which output modalities are requested. |
| `audio` | object | No | null | Required when `modalities` includes `"audio"`. `{"voice": "...", "format": "..."}` | Audio output config. Formats: `wav`, `mp3`, `flac`, `opus`, `pcm16`. |

### Predicted Output

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `prediction` | object | No | null | `{"type": "content", "content": "..."}` | Static predicted output content. When the model's output matches this content, the response is returned faster. Unmatched prediction tokens are still billed at completion token rates. |

### Storage and Metadata

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `store` | boolean | No | false | -- | Whether to persist the completion for model distillation or evals. Text and image inputs supported; images > 8MB are dropped. |
| `metadata` | object | No | null | Key-value pairs (strings) | Arbitrary metadata attached to the stored completion. Only meaningful when `store: true`. |

### Web Search

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `web_search_options` | object | No | null | `{"search_context_size": "low"|"medium"|"high", "user_location": {...}}` | Enables web search for search-capable models (e.g., `gpt-4o-search-preview`). Location object: `{"type": "approximate", "country": "...", "city": "...", "region": "..."}`. |

### Service and Routing

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `service_tier` | string | No | `"auto"` | `"auto"`, `"default"`, `"flex"`, `"priority"` | Selects processing tier. `"flex"` trades latency for cost savings. `"priority"` ensures fastest processing. |
| `user` | string | No | null | -- | End-user identifier for abuse monitoring. Passed through to OpenAI's safety systems. |

---

## 3. Message Ontology

### Roles

| Role | Purpose | Ordering Constraints |
|------|---------|---------------------|
| `system` | Legacy behavioral instructions. Treated as `developer` on o-series and newer models. | Must be first if present. Do not mix with `developer` in the same request. |
| `developer` | Application-level instructions. Takes priority over `user` messages. Functions like a "program definition." | Should precede `user` messages. Replaces `system` for o1+ models. On GPT-4o, auto-converts to `system`. |
| `user` | End-user input. Supports multimodal content (text, images, audio, files). | Follows `developer`/`system`. |
| `assistant` | Model-generated responses (or injected context). May contain text, tool calls, refusals, or audio. | Follows `user` or `tool` messages. |
| `tool` | Results of tool invocations. | Must immediately follow an `assistant` message containing `tool_calls`. Must reference a `tool_call_id`. |

### Content Block Types (User Messages)

User message `content` can be a plain string or an array of content parts:

| Type | Structure | Purpose |
|------|-----------|---------|
| `text` | `{"type": "text", "text": "..."}` | Plain text content. |
| `image_url` | `{"type": "image_url", "image_url": {"url": "...", "detail": "auto"|"low"|"high"}}` | Image input via URL or base64 data URI. `detail` controls fidelity/token cost. |
| `input_audio` | `{"type": "input_audio", "input_audio": {"data": "...", "format": "wav"|"mp3"}}` | Base64-encoded audio input. |

### Assistant Message Fields

| Field | Type | Present When | Purpose |
|-------|------|--------------|---------|
| `role` | string | Always | Always `"assistant"`. |
| `content` | string or null | Text response generated | The text content of the response. Null when only tool calls are made. |
| `refusal` | string or null | Safety refusal | Explanation of why the model refused. Present in Structured Outputs responses. |
| `tool_calls` | array | Model invokes tools | Array of tool call objects, each with `id`, `type: "function"`, and `function: {name, arguments}`. |
| `audio` | object | Audio output requested | Contains `id`, `data` (base64), `expires_at`, `transcript`. |
| `function_call` | object | Deprecated | Legacy function calling. |

### Tool Message Structure

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "..."
}
```

Each tool message must correspond to exactly one `tool_call_id` from the preceding assistant message. If the assistant emitted N tool calls, N tool messages must follow.

### Implicit Rules

1. A conversation must contain at least one `user` or `developer`/`system` message.
2. `system` and `developer` messages must not both appear in the same request.
3. `tool` messages must immediately follow the `assistant` message whose `tool_calls` they answer.
4. For every `tool_call` in an assistant message, a corresponding `tool` message is expected.
5. `assistant` messages with `content: null` are valid when `tool_calls` is populated.
6. Image content parts are only processed by vision-capable models.
7. The `name` field on messages (optional, any role) provides a participant identifier for multi-participant conversations.

---

## 4. Response Ontology

### Non-Streaming Response Object

```
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o-2024-08-06",
  "system_fingerprint": "fp_...",
  "service_tier": "default",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "...",
        "refusal": null,
        "tool_calls": null,
        "audio": null
      },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 128,
    "total_tokens": 170,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique completion identifier. Format: `chatcmpl-{alphanumeric}`. |
| `object` | string | Always `"chat.completion"`. |
| `created` | integer | Unix timestamp (seconds) of creation. |
| `model` | string | Actual model used (may differ from requested alias). |
| `system_fingerprint` | string or null | Backend configuration fingerprint. Combined with `seed`, indicates determinism changes. |
| `service_tier` | string or null | Actual processing tier used (may differ from requested). |
| `choices` | array | Array of `n` completion objects. |
| `choices[].index` | integer | Zero-based index in the choices array. |
| `choices[].message` | object | The assistant message object (see Section 3). |
| `choices[].finish_reason` | string | Why generation stopped. See values below. |
| `choices[].logprobs` | object or null | Token log probabilities if requested. Contains `content` array of `{token, logprob, bytes, top_logprobs}`. |
| `usage` | object | Token consumption breakdown. |
| `usage.prompt_tokens` | integer | Total input tokens. |
| `usage.completion_tokens` | integer | Total output tokens (includes reasoning tokens). |
| `usage.total_tokens` | integer | Sum of prompt + completion tokens. |
| `usage.prompt_tokens_details.cached_tokens` | integer | Tokens served from prompt cache (cost-reduced). |
| `usage.prompt_tokens_details.audio_tokens` | integer | Audio input tokens. |
| `usage.completion_tokens_details.reasoning_tokens` | integer | Tokens spent on internal reasoning (o-series). Not visible in output. |
| `usage.completion_tokens_details.audio_tokens` | integer | Audio output tokens. |
| `usage.completion_tokens_details.accepted_prediction_tokens` | integer | Predicted tokens that matched actual output. |
| `usage.completion_tokens_details.rejected_prediction_tokens` | integer | Predicted tokens that did not match (still billed). |

### `finish_reason` Values

| Value | Meaning |
|-------|---------|
| `"stop"` | Natural end or stop sequence reached. |
| `"length"` | Hit `max_tokens` / `max_completion_tokens`. |
| `"tool_calls"` | Model emitted one or more tool calls. |
| `"content_filter"` | Content omitted due to safety filter. |
| `"function_call"` | Deprecated. Legacy function calling. |

### Streaming Chunk Object

When `stream: true`, the response is delivered as Server-Sent Events. Each event carries a chunk:

```
{
  "id": "chatcmpl-...",
  "object": "chat.completion.chunk",
  "created": 1234567890,
  "model": "gpt-4o-2024-08-06",
  "system_fingerprint": "fp_...",
  "service_tier": "default",
  "choices": [
    {
      "index": 0,
      "delta": {
        "role": "assistant",
        "content": "token"
      },
      "finish_reason": null,
      "logprobs": null
    }
  ],
  "usage": null
}
```

**Key differences from non-streaming**:

| Aspect | Non-Streaming | Streaming |
|--------|---------------|-----------|
| `object` | `"chat.completion"` | `"chat.completion.chunk"` |
| Message field | `message` (complete) | `delta` (incremental) |
| `usage` | Always present | `null` on all chunks except the final usage chunk (if `stream_options.include_usage: true`) |
| Final signal | HTTP response ends | `data: [DONE]` SSE event |

**Delta behavior**:
- First chunk: `delta` contains `role` (and optionally the start of `content`).
- Middle chunks: `delta` contains `content` fragments.
- Final chunk: `delta` is empty `{}`, `finish_reason` is set.
- Usage chunk (optional): `choices` is empty `[]`, `usage` object is populated.

---

## 5. Error Ontology

### Error Object Shape

```json
{
  "error": {
    "message": "Human-readable description",
    "type": "error_type",
    "param": "offending_parameter_or_null",
    "code": "machine_readable_code_or_null"
  }
}
```

### HTTP Status Codes

| Status | Error Type | Cause | Retry Strategy |
|--------|-----------|-------|----------------|
| 400 | `invalid_request_error` | Malformed request, invalid parameters, schema violation | Do not retry. Fix the request. |
| 401 | `authentication_error` | Invalid, expired, or revoked API key | Do not retry. Fix credentials. |
| 403 | `permission_error` | Unsupported region, insufficient permissions | Do not retry. Check account/region. |
| 404 | `not_found_error` | Resource (model, fine-tune, etc.) does not exist | Do not retry. Verify resource ID. |
| 409 | `conflict_error` | Resource updated by another concurrent request | Retry with backoff. |
| 422 | `unprocessable_entity` | Request is well-formed but semantically invalid | Do not retry without modification. |
| 429 | `rate_limit_error` | Rate limit (RPM/TPM) or quota exceeded | Retry with exponential backoff. Respect `Retry-After` header. |
| 500 | `server_error` | Internal server error | Retry with exponential backoff. |
| 503 | `server_error` | Engine overloaded or service unavailable | Retry with exponential backoff. For "Slow Down" variant: reduce rate, hold steady 15 min, then ramp gradually. |

### Python SDK Exception Types

| Exception | Mapped From |
|-----------|-------------|
| `APIConnectionError` | Network/DNS/proxy/SSL failure |
| `APITimeoutError` | Request timeout |
| `AuthenticationError` | 401 |
| `BadRequestError` | 400 |
| `ConflictError` | 409 |
| `InternalServerError` | 500, 503 |
| `NotFoundError` | 404 |
| `PermissionDeniedError` | 403 |
| `RateLimitError` | 429 |
| `UnprocessableEntityError` | 422 |

---

## 6. Model Taxonomy

### Flagship / General Purpose Models

| Model | Context Window | Max Output | Vision | Function Calling | Structured Output | Reasoning | Knowledge Cutoff |
|-------|---------------|------------|--------|-----------------|-------------------|-----------|-------------------|
| `gpt-4o` | 128,000 | 16,384 | Yes | Yes | Yes | No | Oct 2023 |
| `gpt-4o-mini` | 128,000 | 16,384 | Yes | Yes | Yes | No | Oct 2023 |
| `gpt-4.1` | 1,047,576 | 32,768 | Yes | Yes | Yes | No | Jun 2024 |
| `gpt-4.1-mini` | 1,047,576 | 32,768 | Yes | Yes | Yes | No | Jun 2024 |
| `gpt-4.1-nano` | 1,047,576 | 32,768 | Yes | Yes | Yes | No | Jun 2024 |

### Reasoning Models (o-Series)

| Model | Context Window | Max Output | Vision | Function Calling | Structured Output | Reasoning | Notes |
|-------|---------------|------------|--------|-----------------|-------------------|-----------|-------|
| `o1` | 200,000 | 100,000 | Yes | Yes | Yes | Yes | First-gen reasoning. |
| `o1-mini` | 128,000 | 65,536 | No | Yes | Yes | Yes | Cost-optimized reasoning. |
| `o3` | 200,000 | 100,000 | Yes | Yes | Yes | Yes | State-of-the-art reasoning. Excels at coding, math, science. |
| `o3-mini` | 200,000 | 100,000 | No | Yes | Yes | Yes | Fast, cost-efficient reasoning. |
| `o3-pro` | 200,000 | 100,000 | Yes | Yes | Yes | Yes | Extended thinking variant of o3. Highest reliability. |
| `o4-mini` | 200,000 | 100,000 | Yes | Yes | Yes | Yes | Best cost/performance ratio for reasoning. |

### Next-Generation Models

| Model | Context Window | Max Output | Vision | Function Calling | Structured Output | Reasoning | Notes |
|-------|---------------|------------|--------|-----------------|-------------------|-----------|-------|
| `gpt-5` | 400,000 | 128,000 | Yes | Yes | Yes | Optional | Knowledge cutoff ~2025. |
| `gpt-5-mini` | 400,000 | 128,000 | Yes | Yes | Yes | Optional | Smaller, faster variant. |
| `gpt-5-nano` | 400,000 | 128,000 | Yes | Yes | Yes | Optional | Smallest variant. |
| `gpt-5.2` | 400,000 | 128,000 | Yes | Yes | Yes | Optional | Aug 2025 cutoff. |

### Search-Capable Models

| Model | Purpose |
|-------|---------|
| `gpt-4o-search-preview` | GPT-4o with web search via `web_search_options`. |
| `gpt-4o-mini-search-preview` | GPT-4o-mini with web search. |

### Capability Matrix Summary

| Capability | GPT-4o family | GPT-4.1 family | o-series | GPT-5 family |
|------------|---------------|----------------|----------|--------------|
| Text generation | Yes | Yes | Yes | Yes |
| Vision (image input) | Yes | Yes | o1, o3, o3-pro, o4-mini | Yes |
| Audio input/output | Yes (4o) | No | No | TBD |
| Function calling | Yes | Yes | Yes | Yes |
| Structured Output | Yes (Aug 2024+) | Yes | Yes | Yes |
| Predicted Output | Yes | Yes | No | TBD |
| Reasoning tokens | No | No | Yes | Optional |
| Web search | Search variants only | No | No | Search variants |
| 1M+ context | No | Yes | No | No |

---

## 7. Behavioral Peculiarities

### 7.1 Developer Messages vs System Messages

OpenAI introduced the `developer` role as a replacement for `system` on newer models. The semantic difference: `developer` messages have explicit instruction-hierarchy priority (developer > user). On o-series models, `system` is silently treated as `developer`. On GPT-4o, `developer` is silently treated as `system`. Sending both in one request is unsupported.

### 7.2 Parallel Function Calling

By default, `parallel_tool_calls: true`. The model may emit multiple `tool_calls` in a single assistant message. Each must be answered with a corresponding `tool` message before the next turn. This is incompatible with `strict: true` on tool definitions because parallel calls may not individually conform to the schema. Disable with `parallel_tool_calls: false` when using strict mode.

### 7.3 Structured Output with Strict Mode

When `response_format.json_schema.strict` is `true`, the model is constrained to produce output that exactly matches the provided JSON Schema. This works via constrained decoding, not post-validation. Limitations: all object properties must have `additionalProperties: false`; all properties must be listed in `required`; recursive schemas are supported but with limits. The `refusal` field on the assistant message indicates safety-based refusals in a machine-readable way.

### 7.4 Predicted Output

The `prediction` parameter lets you supply expected output text. When the model's generation matches, tokens are served from a speculative decoding cache, dramatically reducing latency. Non-matching predicted tokens are still billed at output token rates. Available on GPT-4o and GPT-4.1 families. Not available on reasoning models.

### 7.5 Reasoning Effort Parameter

The `reasoning_effort` parameter (`"low"`, `"medium"`, `"high"`) controls how many reasoning tokens o-series models consume. Lower effort = faster, cheaper, less thorough reasoning. This parameter is rejected by non-reasoning models.

### 7.6 The Store Parameter

Setting `store: true` persists the completion for use in OpenAI's distillation and evals products. This is an opt-in data pipeline feature. Stored completions retain text and image inputs; images over 8MB are dropped.

### 7.7 Reasoning Tokens Are Invisible but Billed

O-series models produce "reasoning tokens" that are not included in the response `content` but are counted in `completion_tokens` and detailed in `completion_tokens_details.reasoning_tokens`. The visible output tokens are a subset of what you pay for.

### 7.8 Prompt Caching

OpenAI automatically caches prompt prefixes. The `usage.prompt_tokens_details.cached_tokens` field reports how many input tokens were served from cache (at reduced cost). This is not user-configurable beyond structuring prompts to maximize prefix reuse.

### 7.9 Service Tiers

The `service_tier` parameter offers processing options: `"default"` (standard), `"flex"` (cheaper, higher latency, may queue), `"priority"` (fastest). The response reports which tier was actually used, which may differ from what was requested.

### 7.10 Seed and System Fingerprint

The `seed` parameter enables best-effort deterministic generation. The `system_fingerprint` in the response identifies the backend configuration. If the fingerprint changes between requests with the same seed, the backend has changed and outputs may differ. Determinism is not guaranteed even with a fixed seed.

### 7.11 Sampling Parameter Mutual Exclusion with Reasoning

Reasoning models reject `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, `logit_bias`, and `seed`. Non-reasoning models reject `reasoning_effort`. This is a hard constraint, not a soft default.

### 7.12 Token Counting for Special Content

- Images: token cost depends on `detail` level. `"low"` = 85 tokens. `"high"` = variable based on image dimensions (tiles of 512x512, each ~170 tokens, plus base 85).
- Audio: billed per audio token (separate rate from text tokens).
- Tool definitions: serialized into the prompt and consume input tokens. Large tool schemas significantly increase prompt token count.
- The `name` field on messages adds a small number of tokens.

---

## 8. Boundary Classification

### Request Parameters

| Parameter | Classification | Notes |
|-----------|---------------|-------|
| `model` | **Universal** | Every LLM API requires model selection. |
| `messages` | **Universal** | Standard chat completion input across all providers. |
| `temperature` | **Universal** | Supported by all major providers. |
| `top_p` | **Universal** | Supported by all major providers. |
| `max_tokens` / `max_completion_tokens` | **Universal** | Universal concept, name varies (`max_tokens`, `max_output_tokens`). |
| `stop` | **Universal** | Broadly supported. |
| `stream` | **Universal** | SSE streaming is standard across providers. |
| `n` | **Common** | Supported by OpenAI, some others. Not universal. |
| `frequency_penalty` | **Common** | OpenAI, Cohere. Not all providers expose this. |
| `presence_penalty` | **Common** | OpenAI, Cohere. Not all providers expose this. |
| `logit_bias` | **Common** | OpenAI-specific parameter name but concept exists elsewhere. |
| `logprobs` / `top_logprobs` | **Common** | OpenAI, Anthropic (limited). Not universal. |
| `seed` | **Common** | OpenAI, Anthropic. Best-effort determinism. |
| `tools` / `tool_choice` | **Common** | Supported by OpenAI, Anthropic, Google, Mistral. Schemas differ. |
| `response_format` (json_object) | **Common** | JSON mode exists across providers but implementation varies. |
| `user` | **Common** | Safety/tracking identifier. Present in OpenAI, some others. |
| `response_format` (json_schema) | **Distinctive** | Constrained decoding to a schema. OpenAI-specific under this name. Google has similar but different API. |
| `parallel_tool_calls` | **Distinctive** | OpenAI-specific. Other providers either always parallelize or never do. |
| `reasoning_effort` | **Distinctive** | OpenAI o-series specific. Anthropic has `thinking` budget but different API shape. |
| `prediction` | **Distinctive** | OpenAI-specific speculative decoding feature. |
| `store` / `metadata` | **Distinctive** | OpenAI-specific distillation/eval pipeline integration. |
| `service_tier` | **Distinctive** | OpenAI-specific processing tier selection. |
| `modalities` / `audio` | **Distinctive** | OpenAI-specific multimodal output declaration in chat completions. |
| `stream_options` | **Distinctive** | OpenAI-specific. Other providers include usage by default or use different mechanisms. |
| `web_search_options` | **Distinctive** | OpenAI-specific web search integration in chat completions. |
| `logit_bias` | **Distinctive** | Token-level bias by ID is OpenAI-specific (others use different granularity). |

### Response Fields

| Field | Classification | Notes |
|-------|---------------|-------|
| `id` | **Universal** | All providers return a request/completion ID. |
| `model` | **Universal** | All providers echo the model used. |
| `choices` | **Common** | OpenAI/Azure pattern. Anthropic uses flat `content`. Google uses `candidates`. |
| `finish_reason` | **Common** | Concept is universal, values differ (`stop`, `end_turn`, `STOP`). |
| `usage` (basic) | **Universal** | All providers report token usage. |
| `usage.prompt_tokens_details` | **Distinctive** | OpenAI-specific cached/audio token breakdown. |
| `usage.completion_tokens_details` | **Distinctive** | OpenAI-specific reasoning/prediction/audio token breakdown. |
| `system_fingerprint` | **Distinctive** | OpenAI-specific backend configuration tracking. |
| `service_tier` | **Distinctive** | OpenAI-specific. |
| `refusal` | **Distinctive** | Programmatic safety refusal field. Anthropic has `stop_reason: "end_turn"` with refusal in content. |

### Concepts

| Concept | Classification | Notes |
|---------|---------------|-------|
| Chat completion (multi-turn) | **Universal** | Standard paradigm. |
| System/instruction message | **Universal** | All providers support behavioral instructions. |
| Developer vs system role split | **Distinctive** | OpenAI-specific role hierarchy. |
| Tool/function calling | **Common** | Broadly adopted but schemas differ per provider. |
| Structured output (constrained decoding) | **Distinctive** | OpenAI's `json_schema` strict mode is unique. Others validate post-generation. |
| Reasoning tokens (hidden) | **Distinctive** | OpenAI o-series. Anthropic exposes thinking content. DeepSeek has similar. |
| Predicted output (speculative decoding) | **Distinctive** | OpenAI-only feature. |
| Prompt caching (automatic) | **Common** | OpenAI (automatic), Anthropic (automatic), Google (explicit). |
| Image/vision input | **Common** | OpenAI, Anthropic, Google all support this. |
| Audio input/output in chat | **Distinctive** | OpenAI-specific in chat completions. |
| SSE streaming | **Universal** | All major providers use SSE for streaming. |
| Rate limit headers | **Common** | OpenAI, Anthropic both return rate limit headers. Formats differ. |

---

## Appendix: Facade Design Implications

The following observations are relevant when designing an abstraction layer over this API:

1. **Parameter bifurcation**: Reasoning vs non-reasoning models reject each other's parameters. A facade must know which parameters are valid for a given model family, or face 400 errors.

2. **Response shape stability**: The `choices` array, `usage` object, and `finish_reason` values are stable. The details sub-objects (`prompt_tokens_details`, `completion_tokens_details`) are additive -- new fields appear without warning.

3. **Tool call ID tracking**: The `tool_call_id` linkage between assistant and tool messages is a hard requirement. A facade managing conversation state must preserve this linkage.

4. **Streaming requires SSE parsing**: The `data: [DONE]` termination signal and the optional usage chunk are OpenAI-specific streaming behaviors that a facade must handle.

5. **Model-dependent feature availability**: Not all models support all parameters. Vision, audio, structured output, predicted output, and reasoning each have model-specific availability. The facade must either validate upfront or handle errors gracefully.

6. **Automatic prompt caching**: Unlike Anthropic (where caching is explicit with cache control blocks), OpenAI caches automatically. A facade cannot control this but should surface the cached token counts from the response.

7. **The `developer` / `system` role split**: A facade normalizing across providers must map between OpenAI's dual-role system and other providers' single instruction role.
