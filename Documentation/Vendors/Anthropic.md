# Anthropic Messages API -- Vendor Inventory

> Authoritative reference for the llm-api-facade abstraction layer.
> Last verified: 2026-03-26 against platform.claude.com documentation.

---

## 1. Identity

| Attribute | Value |
|-----------|-------|
| **API Name** | Claude API (Messages) |
| **Base URL** | `https://api.anthropic.com` |
| **Messages Endpoint** | `POST /v1/messages` |
| **Other Endpoints** | `POST /v1/messages/count_tokens`, `POST /v1/messages/batches`, `GET /v1/models`, `POST /v1/files` (beta), `POST /v1/skills` (beta) |
| **Auth Mechanism** | API key via `x-api-key` header |
| **API Key Source** | Anthropic Console (`platform.claude.com/settings/keys`) |
| **Versioning Scheme** | Date-based via `anthropic-version` header (e.g., `2023-06-01`) |
| **Current Stable Version** | `2023-06-01` |
| **Beta Features** | Opt-in via `anthropic-beta` header (comma-separated feature slugs) |
| **Content Type** | `application/json` |
| **Max Request Size** | 32 MB (standard), 256 MB (batch), 500 MB (files) |
| **Transport** | HTTPS/REST, Server-Sent Events for streaming |

### Required Headers (Every Request)

| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | API key string | Yes |
| `anthropic-version` | `2023-06-01` | Yes |
| `content-type` | `application/json` | Yes |
| `anthropic-beta` | Comma-separated beta slugs | No |

### Version History

| Version | Notes |
|---------|-------|
| `2023-06-01` | Current. Incremental streaming deltas, named SSE events, removed `data: [DONE]`. |
| `2023-01-01` | Initial release. Deprecated. |

Versioning guarantees: existing input/output parameters are preserved. New optional inputs, new output fields, new enum variants, and new event types may be added without a version bump.

### Known Beta Headers

| Beta Slug | Feature |
|-----------|---------|
| `message-batches-2024-09-24` | Message Batches API |
| `computer-use-2025-01-24` | Computer Use tools |
| `context-1m-2025-08-07` | 1M context on Sonnet 4.5 / Sonnet 4 (legacy models) |
| `skills-2025-10-02` | Skills API |
| `fast-mode-2026-02-01` | Fast mode |

### Official SDKs

| Language | Package | Status |
|----------|---------|--------|
| Python | `anthropic` (PyPI) | GA |
| TypeScript | `@anthropic-ai/sdk` (npm) | GA |
| Java | `com.anthropic` (Maven) | GA |
| Go | `github.com/anthropics/anthropic-sdk-go` | GA |
| C# | `Anthropic` (NuGet) | GA |
| Ruby | `anthropic` (RubyGems) | GA |
| PHP | `anthropic` (Packagist) | GA |

---

## 2. Function Inventory (Messages Endpoint)

`POST /v1/messages`

### Request Parameters

| Parameter | Type | Required | Default | Range / Constraints | Semantic Purpose |
|-----------|------|----------|---------|---------------------|------------------|
| `model` | `string` | Yes | -- | Valid model ID (see Section 6) | Selects the Claude model for completion. |
| `messages` | `array[MessageParam]` | Yes | -- | Max 100,000 messages. Must alternate `user`/`assistant` roles. First message must be `user`. | The conversation history. Each element has `role` and `content`. |
| `max_tokens` | `integer` | Yes | -- | >= 1 (>= 1024 when thinking enabled). Upper bound is model-specific (see Section 6). | Maximum tokens to generate before forced stop. Model may stop earlier. |
| `system` | `string \| array[TextBlockParam]` | No | -- | -- | System prompt. Top-level parameter, NOT a message role. Accepts plain string or array of text blocks with optional cache control. |
| `temperature` | `number` | No | `1.0` | `[0.0, 1.0]` | Controls randomness. 0.0 = deterministic/analytical, 1.0 = maximum creativity. |
| `top_p` | `number` | No | -- | `[0.0, 1.0]` | Nucleus sampling. Considers smallest set of tokens whose cumulative probability exceeds `top_p`. |
| `top_k` | `integer` | No | -- | >= 1 | Restricts sampling to the top K most probable tokens per step. |
| `stop_sequences` | `array[string]` | No | `[]` | -- | Custom strings that halt generation when encountered. Triggers `stop_reason: "stop_sequence"`. |
| `stream` | `boolean` | No | `false` | -- | When `true`, response is delivered as Server-Sent Events. |
| `metadata` | `object` | No | -- | -- | Request metadata. |
| `metadata.user_id` | `string` | No | -- | UUID or hash. Must not contain PII. | External identifier for the end-user, used for abuse detection. |
| `tools` | `array[ToolUnion]` | No | -- | -- | Tool definitions available to the model. Types: `custom`, `bash`, `text_editor`, `code_execution`, `web_search`, `web_fetch`, `tool_search`. |
| `tool_choice` | `object` | No | -- | `type`: `"auto" \| "any" \| "tool" \| "none"` | Controls whether and how the model uses tools. |
| `tool_choice.name` | `string` | No | -- | Required when `type` is `"tool"` | Forces the model to use a specific named tool. |
| `tool_choice.disable_parallel_tool_use` | `boolean` | No | `false` | -- | When `true`, model emits at most one `tool_use` block per response. |
| `thinking` | `object` | No | -- | See below | Extended/adaptive thinking configuration. |
| `thinking.type` | `string` | No | -- | `"enabled" \| "disabled" \| "adaptive"` | Thinking mode selection. `adaptive` available on Opus 4.6 and Sonnet 4.6. |
| `thinking.budget_tokens` | `integer` | Cond. | -- | >= 1024, < `max_tokens` (relaxed with interleaved thinking) | Token budget for internal reasoning. Required when `type` is `"enabled"`. Deprecated on Opus 4.6 in favor of adaptive thinking. |
| `thinking.display` | `string` | No | `"summarized"` | `"summarized" \| "omitted"` | Controls whether thinking content is returned to the caller. |
| `output_config` | `object` | No | -- | -- | Output formatting configuration. |
| `output_config.format` | `object` | No | -- | `type: "json_schema"`, `schema: {JSON Schema}` | Constrains output to match a JSON schema (structured outputs). |
| `output_config.effort` | `string` | No | -- | `"low" \| "medium" \| "high" \| "max"` | Controls reasoning effort level. |
| `service_tier` | `string` | No | `"auto"` | `"auto" \| "standard_only"` | `auto` uses priority capacity when available; `standard_only` opts out. |
| `inference_geo` | `string` | No | Workspace default | -- | Geographic region constraint for model inference (data residency). |
| `container` | `string` | No | -- | -- | Container ID for code execution state reuse across requests. |
| `cache_control` | `object` | No | -- | `type: "ephemeral"`, `ttl: "5m" \| "1h"` | Top-level cache control hint. |

### Custom Tool Definition Shape

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"custom"` | No | Defaults to `custom` if omitted. |
| `name` | `string` | Yes | Tool identifier. |
| `description` | `string` | Yes | Natural-language description of the tool's purpose. |
| `input_schema` | `JSON Schema object` | Yes | JSON Schema defining the tool's input parameters. |
| `cache_control` | `CacheControl` | No | Ephemeral cache hint. |
| `strict` | `boolean` | No | When `true`, enforces strict schema validation. |
| `defer_loading` | `boolean` | No | Defer tool schema loading. |
| `input_examples` | `array[object]` | No | Example inputs for the tool. |

---

## 3. Message Ontology

### System Prompt

The system prompt is a **top-level parameter**, not a message in the `messages` array. There is no `"role": "system"` in Anthropic's schema.

```json
{
  "system": "You are a helpful assistant.",
  "messages": [...]
}
```

The `system` parameter accepts either a plain string or an array of `TextBlockParam` objects (for cache control):

```json
{
  "system": [
    {
      "type": "text",
      "text": "You are a helpful assistant with access to a knowledge base.",
      "cache_control": { "type": "ephemeral", "ttl": "5m" }
    }
  ]
}
```

### Role Alternation Requirement

Messages **must** alternate between `user` and `assistant` roles. The first message must be `user`. Two consecutive messages with the same role are automatically merged by the API (not rejected), but the intended contract is strict alternation.

### Content Block Types (Input)

Content in a message is always representable as an **array of typed blocks**, even when a plain string shorthand is used (the API normalizes it internally).

#### TextBlockParam

```json
{
  "type": "text",
  "text": "string",
  "cache_control": { "type": "ephemeral", "ttl": "5m" },
  "citations": [ { /* TextCitationParam */ } ]
}
```

#### ImageBlockParam

```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg | image/png | image/gif | image/webp",
    "data": "<base64-encoded>"
  },
  "cache_control": { "type": "ephemeral" }
}
```

URL-sourced variant:

```json
{
  "type": "image",
  "source": {
    "type": "url",
    "url": "https://example.com/image.png"
  }
}
```

#### DocumentBlockParam

```json
{
  "type": "document",
  "source": {
    "type": "base64 | text | url | content",
    "data": "string",
    "media_type": "application/pdf | text/plain",
    "url": "string",
    "content": "string | array[ContentBlockSourceContent]"
  },
  "title": "string",
  "context": "string",
  "citations": { "enabled": true },
  "cache_control": { "type": "ephemeral" }
}
```

#### ToolUseBlockParam (in assistant messages, passed back in multi-turn)

```json
{
  "type": "tool_use",
  "id": "toolu_...",
  "name": "get_weather",
  "input": { "location": "San Francisco" },
  "caller": { "type": "direct | code_execution_20250825 | code_execution_20260120" },
  "cache_control": { "type": "ephemeral" }
}
```

#### ToolResultBlockParam (in user messages, following tool_use)

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_...",
  "content": "string | array[ContentBlock]",
  "is_error": false,
  "cache_control": { "type": "ephemeral" }
}
```

#### ThinkingBlockParam (in assistant messages, passed back in multi-turn)

```json
{
  "type": "thinking",
  "thinking": "string",
  "signature": "string"
}
```

The `signature` field is required when passing thinking blocks back in multi-turn conversations. It is used to verify integrity of the thinking content.

#### SearchResultBlockParam

```json
{
  "type": "search_result",
  "title": "string",
  "source": "string",
  "content": [ { "type": "text", "text": "..." } ],
  "citations": { "enabled": true },
  "cache_control": { "type": "ephemeral" }
}
```

### Cache Control (Prompt Caching)

Any content block (text, image, document, tool_use, tool_result, search_result) can include a `cache_control` field:

```json
{ "type": "ephemeral", "ttl": "5m" }
```

| TTL | Write Cost Multiplier | Read Cost Multiplier |
|-----|----------------------|---------------------|
| `"5m"` (default) | 1.25x base input price | 0.1x base input price |
| `"1h"` | 2.0x base input price | 0.1x base input price |

Cache isolation is per-workspace (as of 2026-02-05). Latency reduction can reach up to 85% for long prompts.

### Citations

Citations can be enabled on `document` and `search_result` blocks via `"citations": { "enabled": true }`. The model will then produce citation references in its text output that point back to specific source passages.

---

## 4. Response Ontology

### Message Response Object

```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Hello! How can I assist you today?" }
  ],
  "model": "claude-opus-4-6",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 12,
    "output_tokens": 8,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  },
  "container": {
    "id": "cntr_...",
    "expires_at": "2026-03-26T12:00:00Z"
  }
}
```

### Response Fields

| Field | Type | Always Present | Values / Notes |
|-------|------|----------------|----------------|
| `id` | `string` | Yes | Unique message ID. Prefix: `msg_`. |
| `type` | `string` | Yes | Always `"message"`. |
| `role` | `string` | Yes | Always `"assistant"`. |
| `content` | `array[ContentBlock]` | Yes | Array of response content blocks (never a bare string). |
| `model` | `string` | Yes | The model ID that served the request. |
| `stop_reason` | `string \| null` | Yes | `"end_turn"`, `"max_tokens"`, `"stop_sequence"`, `"tool_use"`, or `null` (streaming in progress). |
| `stop_sequence` | `string \| null` | Yes | The matched stop sequence string, or `null`. |
| `usage` | `object` | Yes | Token consumption breakdown. |
| `container` | `object \| null` | No | Present when code execution container is active. |

### Usage Object

| Field | Type | Notes |
|-------|------|-------|
| `input_tokens` | `integer` | Tokens consumed by the input (messages + system + tools). |
| `output_tokens` | `integer` | Tokens generated in the response. |
| `cache_creation_input_tokens` | `integer` | Tokens written to cache on this request. 0 if no caching occurred. |
| `cache_read_input_tokens` | `integer` | Tokens read from cache on this request. 0 if cache miss. |

### Response Content Block Types

#### TextBlock

```json
{ "type": "text", "text": "Response text here." }
```

#### ToolUseBlock

```json
{
  "type": "tool_use",
  "id": "toolu_01A09q90qw90lq917835lq9",
  "name": "get_weather",
  "input": { "location": "San Francisco" }
}
```

#### ThinkingBlock

```json
{
  "type": "thinking",
  "thinking": "Let me reason through this step by step...",
  "signature": "EqQBCgIYAhIM..."
}
```

Returned when extended or adaptive thinking is enabled. The `signature` field must be preserved when passing thinking blocks back in multi-turn conversations.

#### RedactedThinkingBlock

```json
{
  "type": "redacted_thinking",
  "data": "<opaque string>"
}
```

Appears when the model's internal reasoning is redacted for safety reasons. Must be preserved opaquely in multi-turn.

### Stop Reasons

| Value | Meaning |
|-------|---------|
| `end_turn` | Model naturally completed its response. |
| `max_tokens` | Generation halted because `max_tokens` was reached. |
| `stop_sequence` | A string from `stop_sequences` was encountered. |
| `tool_use` | Model is requesting tool execution. |

---

### Streaming Response

When `stream: true`, the response is delivered as Server-Sent Events (SSE).

#### Event Sequence

```
1. message_start        (contains Message object with empty content)
2. content_block_start  (one per content block)
3. content_block_delta  (one or more per block; carries incremental data)
4. content_block_stop   (closes the content block)
   ... repeat 2-4 for each content block ...
5. message_delta        (top-level message updates: stop_reason, usage)
6. message_stop         (stream complete)
```

`ping` events may appear anywhere in the stream. `error` events may appear at any point (including after HTTP 200).

#### Event Types

| Event | Data Shape | Purpose |
|-------|-----------|---------|
| `message_start` | `{ "type": "message_start", "message": { <Message with empty content> } }` | Opens the message. Contains model, id, role, usage (input). |
| `content_block_start` | `{ "type": "content_block_start", "index": N, "content_block": { "type": "text", "text": "" } }` | Opens a content block at index N. |
| `content_block_delta` | `{ "type": "content_block_delta", "index": N, "delta": { <DeltaType> } }` | Incremental content for block at index N. |
| `content_block_stop` | `{ "type": "content_block_stop", "index": N }` | Closes the content block at index N. |
| `message_delta` | `{ "type": "message_delta", "delta": { "stop_reason": "..." }, "usage": { "output_tokens": N } }` | Final message-level updates. Usage counts are **cumulative**. |
| `message_stop` | `{ "type": "message_stop" }` | Stream is complete. |
| `ping` | `{ "type": "ping" }` | Keep-alive. |
| `error` | `{ "type": "error", "error": { "type": "...", "message": "..." } }` | Mid-stream error. |

#### Delta Types

| Delta Type | Parent Block | Shape |
|------------|-------------|-------|
| `text_delta` | `text` | `{ "type": "text_delta", "text": "incremental text" }` |
| `input_json_delta` | `tool_use` | `{ "type": "input_json_delta", "partial_json": "{\"loc" }` |
| `thinking_delta` | `thinking` | `{ "type": "thinking_delta", "thinking": "reasoning text" }` |
| `signature_delta` | `thinking` | `{ "type": "signature_delta", "signature": "EqQB..." }` |

Note on `input_json_delta`: Deltas are partial JSON strings. Accumulate them and parse on `content_block_stop`. Current models emit one complete key-value pair at a time, so there may be pauses between deltas.

Note on `thinking_delta`: When `display: "omitted"`, no `thinking_delta` events are sent; only a `signature_delta` appears before `content_block_stop`.

---

## 5. Error Ontology

### Error Response Shape

```json
{
  "type": "error",
  "error": {
    "type": "not_found_error",
    "message": "The requested resource could not be found."
  },
  "request_id": "req_011CSHoEeqs5C35K2UUqR7Fy"
}
```

Every response includes a `request-id` header (also available as `_request_id` on SDK response objects).

### Error Types

| HTTP Status | Error Type | Semantic |
|-------------|-----------|----------|
| 400 | `invalid_request_error` | Malformed request, invalid parameters, unsupported configuration. Also used as catch-all for other 4xx not listed below. |
| 401 | `authentication_error` | Invalid, expired, or missing API key. |
| 402 | `billing_error` | Payment or billing issue on the account. |
| 403 | `permission_error` | API key lacks permission for the requested resource. |
| 404 | `not_found_error` | Requested resource does not exist. |
| 413 | `request_too_large` | Request exceeds maximum size (32 MB for Messages). Returned by Cloudflare before reaching API servers. |
| 429 | `rate_limit_error` | Rate limit or acceleration limit exceeded. |
| 500 | `api_error` | Unexpected internal server error. |
| 529 | `overloaded_error` | API is temporarily overloaded due to high traffic. |

### Notable Validation Errors

| Condition | Error Type | Notes |
|-----------|-----------|-------|
| Prefill on Opus 4.6 | `invalid_request_error` (400) | Claude Opus 4.6 does not support prefilling assistant messages. Use structured outputs or `output_config.format` instead. |
| Thinking budget < 1024 | `invalid_request_error` (400) | Minimum `budget_tokens` is 1024. |
| Thinking budget >= max_tokens | `invalid_request_error` (400) | `budget_tokens` must be less than `max_tokens` (exception: interleaved thinking). |

### Mid-Stream Errors

When streaming, errors can arrive after the HTTP 200 status has been sent. These appear as SSE `error` events. SDKs may report these with `status_code=200` rather than the actual error code (e.g., 529 for `overloaded_error`). This is a known SDK limitation.

---

## 6. Model Taxonomy

### Current Models (Recommended)

| Model | API ID | Alias | Context Window | Max Output | Thinking | Adaptive Thinking | Vision | Pricing (Input/Output per MTok) |
|-------|--------|-------|----------------|------------|----------|-------------------|--------|-------------------------------|
| Claude Opus 4.6 | `claude-opus-4-6` | `claude-opus-4-6` | 1M | 128K | Yes | Yes | Yes | $5 / $25 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | `claude-sonnet-4-6` | 1M | 64K | Yes | Yes | Yes | $3 / $15 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | 200K | 64K | Yes | No | Yes | $1 / $5 |

### Legacy Models (Still Available)

| Model | API ID | Alias | Context Window | Max Output | Thinking | Pricing (Input/Output per MTok) |
|-------|--------|-------|----------------|------------|----------|-----------------------------|
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5` | 200K (1M with beta) | 64K | Yes | $3 / $15 |
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | `claude-opus-4-5` | 200K | 64K | Yes | $5 / $25 |
| Claude Opus 4.1 | `claude-opus-4-1-20250805` | `claude-opus-4-1` | 200K | 32K | Yes | $15 / $75 |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | `claude-sonnet-4-0` | 200K (1M with beta) | 64K | Yes | $3 / $15 |
| Claude Opus 4 | `claude-opus-4-20250514` | `claude-opus-4-0` | 200K | 32K | Yes | $15 / $75 |
| Claude Haiku 3 | `claude-3-haiku-20240307` | -- | 200K | 4K | No | $0.25 / $1.25 |

Claude Haiku 3 is **deprecated** and will be retired on 2026-04-19.

### Model Naming Convention

- Latest: `claude-{tier}-{major}-{minor}` (e.g., `claude-opus-4-6`)
- Dated snapshot: `claude-{tier}-{major}-{minor}-{YYYYMMDD}` (e.g., `claude-sonnet-4-5-20250929`)
- Aliases resolve to the latest snapshot for that model line.
- Dated snapshots are immutable -- identical behavior across all platforms.

### Knowledge Cutoffs

| Model | Reliable Knowledge Cutoff | Training Data Cutoff |
|-------|---------------------------|---------------------|
| Opus 4.6 | May 2025 | Aug 2025 |
| Sonnet 4.6 | Aug 2025 | Jan 2026 |
| Haiku 4.5 | Feb 2025 | Jul 2025 |

---

## 7. Behavioral Peculiarities

These are architectural and behavioral characteristics of the Anthropic Messages API that differ from other LLM vendors or that require special handling in any abstraction layer.

### 7.1 System Prompt Is NOT a Message Role

Unlike OpenAI (where `"role": "system"` is a message in the array), Anthropic places the system prompt as a **separate top-level parameter**. Any facade must extract system messages from a unified message array and route them to this parameter.

### 7.2 Content Is Always an Array of Blocks

Even for simple text responses, `content` is always `array[ContentBlock]`, never a bare string. Input accepts string shorthand, but the API normalizes it. Responses always use the array form. A facade must handle this asymmetry.

### 7.3 Strict Role Alternation

The messages array must alternate `user` / `assistant` roles. The API merges consecutive same-role messages rather than rejecting them, but the design contract assumes alternation. Tool results (in user messages) following tool_use (in assistant messages) maintain this alternation naturally.

### 7.4 Extended and Adaptive Thinking

- **Extended thinking** (`thinking.type: "enabled"`) allocates a fixed `budget_tokens` for internal reasoning. The model produces `thinking` blocks in the response before the text/tool_use blocks.
- **Adaptive thinking** (`thinking.type: "adaptive"`) lets the model decide whether and how much to think based on problem complexity. Available on Opus 4.6 and Sonnet 4.6.
- `budget_tokens` is **deprecated on Opus 4.6** in favor of `output_config.effort` with adaptive thinking.
- Thinking blocks include a `signature` that must be preserved in multi-turn.
- `redacted_thinking` blocks may appear and must be passed through opaquely.
- Interleaved thinking (thinking blocks interspersed with text/tool_use) is automatic on Opus 4.6 with adaptive thinking.

### 7.5 Prompt Caching with Ephemeral Breakpoints

Cache control is specified inline on content blocks, not as a separate API. The `cache_control: { "type": "ephemeral" }` field can appear on text blocks, image blocks, tool definitions, and other content types. Cache is workspace-scoped.

### 7.6 No Frequency/Presence Penalty

Anthropic does not expose `frequency_penalty` or `presence_penalty` parameters. There is no equivalent. Repetition is managed through prompting and temperature.

### 7.7 No Seed Parameter

There is no `seed` parameter for reproducible generation. Even at `temperature: 0.0`, outputs are not guaranteed to be identical across requests.

### 7.8 No Logprobs

Anthropic does not expose log probabilities for generated tokens. There is no `logprobs` parameter.

### 7.9 Prefill Restrictions

Claude Opus 4.6 does **not** support prefilling assistant messages (a technique where you start the assistant's response with specific text). Earlier models do support it. A facade must be aware of model-specific prefill support.

### 7.10 Structured Output via output_config

Instead of OpenAI-style `response_format`, Anthropic uses `output_config.format` with `type: "json_schema"` and a `schema` object. This is the recommended approach over prefilling for structured output.

### 7.11 Citations

Citations are a first-class feature. When `citations: { enabled: true }` is set on document or search_result blocks, the model produces citation references in its text output. This has no equivalent in most other LLM APIs.

### 7.12 Container Persistence

The `container` parameter enables reuse of code execution environments across requests. The response includes `container.id` and `container.expires_at`. This is specific to Anthropic's code execution tools.

### 7.13 Service Tier Selection

The `service_tier` parameter (`"auto"` or `"standard_only"`) controls access to priority capacity. No direct equivalent in other vendor APIs.

### 7.14 Tool Type Diversity

Beyond custom tools, Anthropic provides built-in tool types: `bash`, `text_editor`, `code_execution`, `web_search`, `web_fetch`, `tool_search`. These are first-party server-side tools, not just function-calling definitions.

---

## 8. Boundary Classification

Classification of every concept by portability across LLM vendor APIs.

**Legend:**
- **Universal**: Present in essentially all major LLM chat APIs (OpenAI, Anthropic, Google, etc.) with near-identical semantics.
- **Common**: Present in most major APIs but with vendor-specific shape differences requiring normalization.
- **Distinctive**: Anthropic-specific or rare across vendors. Cannot be mapped without loss or vendor-specific handling.

### Request Parameters

| Concept | Classification | Notes |
|---------|---------------|-------|
| `model` | Universal | All vendors require model selection. IDs are vendor-specific. |
| `messages` (role + content) | Universal | Core conversational structure. All vendors support this. |
| `max_tokens` | Universal | All vendors. Some call it `max_completion_tokens`. Required vs optional varies. |
| `system` (as top-level param) | **Distinctive** | OpenAI uses `"role": "system"` in messages. Google uses `systemInstruction`. Anthropic uses a top-level parameter. |
| `temperature` | Universal | Range differs: Anthropic `[0, 1]`, OpenAI `[0, 2]`. |
| `top_p` | Universal | Same semantics across vendors. |
| `top_k` | Common | Anthropic and Google support it. OpenAI does not. |
| `stop_sequences` | Universal | OpenAI calls it `stop`. Same semantics. |
| `stream` | Universal | All major vendors support SSE streaming. |
| `metadata.user_id` | Common | OpenAI has `user` parameter. Same purpose. |
| `tools` (function calling) | Universal | All major vendors support tool/function definitions. Schema shape differs. |
| `tool_choice` | Common | All vendors with tools have this. Value shapes differ. |
| `thinking` (extended thinking) | **Distinctive** | Anthropic-specific. OpenAI has `reasoning_effort` on o-series but different mechanism. Google has thinking on Gemini 2.5. Not directly portable. |
| `thinking.budget_tokens` | **Distinctive** | No equivalent elsewhere. |
| `thinking.type: "adaptive"` | **Distinctive** | Anthropic-only. |
| `output_config.format` (JSON schema) | Common | OpenAI has `response_format`. Google has similar. Shape differs significantly. |
| `output_config.effort` | **Distinctive** | Maps loosely to OpenAI `reasoning_effort` but different mechanism. |
| `service_tier` | **Distinctive** | No equivalent in other vendors. |
| `inference_geo` | **Distinctive** | Data residency control. No standard equivalent. |
| `container` | **Distinctive** | Code execution environment persistence. Anthropic-only. |
| `cache_control` (prompt caching) | **Distinctive** | Inline cache breakpoints are Anthropic-specific. Google has context caching but with different API shape. OpenAI has automatic prompt caching (no explicit markers). |

### Content Block Types

| Concept | Classification | Notes |
|---------|---------------|-------|
| Text content | Universal | All vendors. |
| Image content (base64) | Universal | All multimodal vendors. Media type lists vary. |
| Image content (URL) | Common | Most vendors support URL images. |
| Document/PDF content | Common | Google and Anthropic support PDFs. OpenAI has file-based approach. |
| Tool use / function call | Universal | All vendors with tool support. |
| Tool result / function response | Universal | All vendors with tool support. |
| Thinking blocks | **Distinctive** | Anthropic-specific content block type. |
| Redacted thinking | **Distinctive** | Anthropic-only. |
| Search result blocks | **Distinctive** | Anthropic-specific input block type. |
| Citations | **Distinctive** | Anthropic first-class feature. Google has grounding. Not standardized. |

### Response Shape

| Concept | Classification | Notes |
|---------|---------------|-------|
| Response `id` | Universal | All vendors return a response identifier. |
| Response `role` | Universal | Always `assistant`. |
| Response `content` as block array | **Distinctive** | OpenAI returns `message.content` as a string (with tool_calls separate). Anthropic always uses block array. |
| `stop_reason` | Common | OpenAI uses `finish_reason` with different enum values (`stop` vs `end_turn`). Same concept. |
| `usage.input_tokens` | Universal | All vendors report token usage. Field names vary slightly. |
| `usage.output_tokens` | Universal | Same as above. |
| `usage.cache_creation_input_tokens` | **Distinctive** | Anthropic-specific. |
| `usage.cache_read_input_tokens` | **Distinctive** | Anthropic-specific. |

### Streaming Events

| Concept | Classification | Notes |
|---------|---------------|-------|
| SSE transport | Universal | All vendors use SSE for streaming. |
| `message_start` | **Distinctive** | Anthropic-specific event structure. OpenAI sends chunk objects. Google sends different events. |
| `content_block_start/delta/stop` | **Distinctive** | Anthropic's block-level streaming granularity. OpenAI streams at choice/delta level. |
| `message_delta` | **Distinctive** | Anthropic-specific. |
| `message_stop` | Common | All vendors signal stream end. OpenAI uses `data: [DONE]`. |
| `text_delta` | Common | All vendors stream text incrementally. Delta shape differs. |
| `input_json_delta` | **Distinctive** | Anthropic streams partial JSON for tool input. OpenAI streams `function.arguments` similarly but different structure. |
| `thinking_delta` | **Distinctive** | Anthropic-only. |
| `signature_delta` | **Distinctive** | Anthropic-only. Thinking block integrity verification. |
| `ping` | Common | Keep-alive events. Vendor-specific naming. |
| Mid-stream `error` events | Common | Most streaming APIs can error mid-stream. Handling varies. |

### Error Types

| Concept | Classification | Notes |
|---------|---------------|-------|
| 400 invalid request | Universal | All vendors. |
| 401 authentication | Universal | All vendors. |
| 403 permission | Universal | All vendors. |
| 404 not found | Universal | All vendors. |
| 429 rate limit | Universal | All vendors. |
| 500 internal error | Universal | All vendors. |
| 402 billing error | Common | Not all vendors surface this distinctly. |
| 413 request too large | Common | Anthropic-specific threshold (32 MB). |
| 529 overloaded | **Distinctive** | Anthropic-specific HTTP status code. OpenAI uses 503 or 429 for capacity issues. |

### Absent Features (Present in Other Vendors, Absent in Anthropic)

| Feature | Present In | Notes |
|---------|-----------|-------|
| `frequency_penalty` | OpenAI, Google | Not available in Anthropic. |
| `presence_penalty` | OpenAI, Google | Not available in Anthropic. |
| `seed` | OpenAI | Not available in Anthropic. |
| `logprobs` | OpenAI | Not available in Anthropic. |
| `n` (multiple completions) | OpenAI | Not available in Anthropic. Single completion only. |
| `logit_bias` | OpenAI | Not available in Anthropic. |
| System role in messages | OpenAI, Google | Anthropic uses top-level `system` parameter instead. |
| Assistant prefill (Opus 4.6) | OpenAI (all models) | Restricted on Opus 4.6. Available on earlier Anthropic models. |

---

## Appendix: Facade Design Implications

Key normalization points for any abstraction layer targeting both Anthropic and OpenAI-style APIs:

1. **System message routing**: Extract system messages from a unified array and map to `system` parameter.
2. **Content block normalization**: Anthropic always uses block arrays; OpenAI uses string + separate tool_calls. The facade must bidirectionally convert.
3. **Temperature range**: Anthropic `[0, 1]` vs OpenAI `[0, 2]`. Normalize or clamp.
4. **Stop reason mapping**: `end_turn` (Anthropic) vs `stop` (OpenAI). `tool_use` vs `tool_calls`.
5. **Token usage fields**: Anthropic includes cache-specific fields that have no OpenAI equivalent. Pass through or ignore.
6. **Streaming event translation**: Fundamentally different event structures. Anthropic is block-granular; OpenAI is choice-granular.
7. **Unsupported parameter passthrough**: Parameters like `frequency_penalty`, `seed`, `logprobs` have no Anthropic target. The facade should either ignore, warn, or reject them.
8. **Thinking blocks**: No universal equivalent. The facade must decide whether to expose, hide, or translate these.
9. **Cache control**: Anthropic-specific inline markers. No standard mapping. The facade should expose this as a vendor extension.
10. **Tool types**: Built-in tools (`bash`, `web_search`, etc.) are Anthropic-specific. Custom tool definitions are portable.
