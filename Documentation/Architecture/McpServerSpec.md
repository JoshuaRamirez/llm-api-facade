# MCP Server Surface Specification

**Project:** llm-api-facade
**Version:** 0.3.0-draft
**Date:** 2026-03-27
**Depends on:** `TypeSpecification.md` (authoritative type definitions), `OntologicalTaxonomy.md` (ontological framework)

---

## 1. Purpose

This document defines the Model Context Protocol (MCP) server surface for `llm-api-facade`. The server provides a provider-agnostic abstraction over heterogeneous LLM backends (cloud APIs, local inference engines, self-hosted models) through a single, stable tool and resource interface.

The MCP surface is the **only public API**. All backend adapters, routing logic, token estimation internals, and configuration management are internal implementation details invisible to MCP clients.

For formal type definitions, invariants, and construction rules, see `TypeSpecification.md`. This document specifies the MCP tool and resource surface that exposes those types to clients.

---

## 2. Design Constraints

1. **Backend opacity.** No tool input, output, error, or resource representation may contain provider-specific identifiers, parameter names, or behavioral quirks. The abstraction boundary is absolute.
2. **Uniform behavior.** A given tool call with identical parameters must produce structurally identical responses regardless of which backend resolves the request. Semantic differences (model quality, speed) are expected; structural differences are defects.
3. **Stateless by default.** Tools are stateless request-response operations unless the client explicitly opts into session-based conversation state via the `session_id` parameter.
4. **Fail-fast validation.** Malformed or unsatisfiable requests are rejected at the MCP boundary before reaching any backend.
5. **No ambient configuration.** Clients do not need to know which backends are configured. Model identifiers are facade-level identifiers, not provider identifiers.
6. **Content block model.** Content is an ordered array of typed blocks, not a plain string. A bare string is shorthand for a single TextBlock. See `TypeSpecification.md` Section 1.2 for the canonical definition.

---

## 3. MCP Tools

### 3.1 `complete`

Send a prompt (or message sequence) and receive a single completion response.

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | `string` | Yes | Facade model identifier (as returned by `list_models`). |
| `messages` | `Message[]` | Yes | Ordered message sequence. See [Message Schema](#61-message). |
| `max_tokens` | `integer` | No | Maximum tokens in the completion. Backend default if omitted. |
| `temperature` | `number` | No | Sampling temperature. Range: `0.0`--`2.0`. Default: `1.0`. |
| `top_p` | `number` | No | Nucleus sampling threshold. Range: `0.0`--`1.0`. |
| `stop_sequences` | `string[]` | No | Sequences that terminate generation. |
| `tools` | `ToolDefinition[]` | No | Array of tool definitions the model may invoke. Only valid when the model supports tool calling. See [ToolDefinition](#64-tooldefinition). |
| `tool_choice` | `string \| object` | No | Controls tool invocation behavior. One of: `"auto"`, `"none"`, `"required"`, or `{ "name": "<tool_name>" }`. Only valid when `tools` is present. See [ToolChoice](#65-toolchoice). |
| `reasoning_effort` | `string` | No | Controls reasoning depth for thinking-capable models. One of: `"low"`, `"medium"`, `"high"`. Silently ignored with a warning when the model does not support thinking. |
| `extensions` | `object` | No | Typed extension values keyed by extension ID. Each value must conform to the extension's registered schema (see `get_model_info` for available extensions and their schemas). Invalid extensions are rejected. |
| `session_id` | `string` | No | Opaque session identifier for conversation continuity. When provided, the server appends the exchange to the referenced session state. |
| `metadata` | `object` | No | Arbitrary key-value pairs passed through to logging and tracing. Never forwarded to backends. |

#### Output

```json
{
  "completion_id": "cpl_a1b2c3d4",
  "model": "claude-sonnet",
  "content": [
    { "type": "text", "text": "The response text..." }
  ],
  "finish_reason": "stop",
  "usage": {
    "input_tokens": 142,
    "output_tokens": 87,
    "is_approximate": false
  },
  "session_id": "ses_x9y8z7",
  "extension_data": {
    "cache_control": {
      "cache_creation_tokens": 1024,
      "cache_read_tokens": 0
    }
  }
}
```

When the model invokes tools, the response contains ToolUseBlocks:

```json
{
  "completion_id": "cpl_e5f6g7h8",
  "model": "claude-sonnet",
  "content": [
    { "type": "text", "text": "I'll look that up for you." },
    {
      "type": "tool_use",
      "tool_use_id": "tu_abc123",
      "name": "get_weather",
      "input": { "location": "Seattle" }
    }
  ],
  "finish_reason": "tool_use",
  "usage": {
    "input_tokens": 210,
    "output_tokens": 64,
    "is_approximate": false
  },
  "session_id": null
}
```

When the model produces thinking blocks (thinking-capable models only):

```json
{
  "completion_id": "cpl_j9k0l1m2",
  "model": "claude-sonnet",
  "content": [
    { "type": "thinking", "thinking": "Let me consider...", "signature": "sig_xyz..." },
    { "type": "text", "text": "After careful analysis..." }
  ],
  "finish_reason": "stop",
  "usage": {
    "input_tokens": 340,
    "output_tokens": 198,
    "is_approximate": false
  },
  "session_id": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `completion_id` | `string` | Unique identifier for this completion. Facade-generated if the provider does not supply one. |
| `model` | `string` | The facade model identifier that resolved the request. |
| `content` | `ContentBlock[]` | The generated content as an array of typed blocks. See [ContentBlock](#62-contentblock). |
| `finish_reason` | `string` | One of: `stop`, `length`, `content_filter`, `tool_use`, `error`. See [FinishReason](#63-finishreason). |
| `usage.input_tokens` | `integer` | Tokens consumed by the input. |
| `usage.output_tokens` | `integer` | Tokens generated. |
| `usage.is_approximate` | `boolean` | `true` when the provider did not report token counts and the facade estimated them. |
| `session_id` | `string \| null` | Echoed back when session state is active. |
| `extension_data` | `object \| undefined` | Provider-specific response data. Present when the model returns extension-specific information. Keys are extension IDs. |

---

### 3.2 `stream_complete`

Streaming variant of `complete`. Returns the completion as a sequence of incremental content chunks. Streaming is an observation mode over the same generation process -- it does not change what is generated, only when the caller can observe partial results.

#### Input Parameters

Identical to [`complete`](#31-complete).

#### Output (per chunk)

Text delta:

```json
{
  "completion_id": "cpl_a1b2c3d4",
  "chunk_index": 0,
  "delta": { "type": "text_delta", "text": "The " },
  "finish_reason": null
}
```

Tool use delta (streamed incrementally):

```json
{
  "completion_id": "cpl_a1b2c3d4",
  "chunk_index": 12,
  "delta": {
    "type": "tool_use_delta",
    "tool_use_id": "tu_abc123",
    "name": "get_weather",
    "input_json_delta": "{\"location\":"
  },
  "finish_reason": null
}
```

Thinking delta (thinking-capable models only):

```json
{
  "completion_id": "cpl_a1b2c3d4",
  "chunk_index": 3,
  "delta": { "type": "thinking_delta", "thinking": "Let me reason about..." },
  "finish_reason": null
}
```

The final chunk carries `finish_reason` set to a non-null value and includes the `usage` object:

```json
{
  "completion_id": "cpl_a1b2c3d4",
  "chunk_index": 47,
  "delta": { "type": "text_delta", "text": "" },
  "finish_reason": "stop",
  "usage": {
    "input_tokens": 142,
    "output_tokens": 87,
    "is_approximate": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `completion_id` | `string` | Stable across all chunks in a single stream. |
| `chunk_index` | `integer` | Zero-based, monotonically increasing, contiguous. |
| `delta` | `ContentBlockDelta` | Incremental content fragment. One of: `text_delta`, `tool_use_delta`, `thinking_delta`. See [ContentBlockDelta](#66-contentblockdelta). |
| `finish_reason` | `string \| null` | `null` on intermediate chunks. Set on the final chunk. |
| `usage` | `object \| undefined` | Present only on the final chunk. |

---

### 3.3 `list_models`

Return all models currently available through the facade.

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `capability` | `string` | No | Filter by capability tag (e.g. `"chat"`, `"code"`, `"embedding"`). |

#### Output

```json
{
  "models": [
    {
      "id": "claude-sonnet",
      "name": "Claude Sonnet",
      "capabilities": ["chat", "code"],
      "context_window": 200000,
      "max_output_tokens": 8192
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `models` | `ModelSummary[]` | Array of available models. Empty array if none configured. |
| `models[].id` | `string` | Facade model identifier. This is what clients pass to `complete`. |
| `models[].name` | `string` | Human-readable display name. |
| `models[].capabilities` | `string[]` | Capability tags. |
| `models[].context_window` | `integer` | Maximum input token capacity. |
| `models[].max_output_tokens` | `integer` | Maximum generation length. |

---

### 3.4 `get_model_info`

Return detailed metadata for a specific model, including capability flags and parameter support.

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | `string` | Yes | Facade model identifier. |

#### Output

```json
{
  "id": "claude-sonnet",
  "name": "Claude Sonnet",
  "capabilities": ["chat", "code"],
  "context_window": 200000,
  "max_output_tokens": 8192,
  "supported_parameters": {
    "temperature": { "supported": true, "min": 0.0, "max": 2.0, "default": 1.0 },
    "top_p": { "supported": true, "min": 0.0, "max": 1.0, "default": 1.0 },
    "top_k": { "supported": false },
    "frequency_penalty": { "supported": false },
    "presence_penalty": { "supported": false },
    "stop_sequences": { "supported": true, "max_count": 8 },
    "seed": { "supported": false }
  },
  "supports_streaming": true,
  "supports_sessions": true,
  "supports_tool_calling": true,
  "supports_thinking": true,
  "supports_vision": false,
  "parameter_notes": [
    "Sampling parameters (temperature, top_p) are unavailable on reasoning-mode models. See TypeSpecification Section 3.6."
  ],
  "token_encoding": "cl100k_base",
  "available_extensions": [
    {
      "id": "cache_control",
      "name": "Prompt Cache Control",
      "description": "Hint that specific content blocks are reusable across requests.",
      "input_schema": {
        "type": "object",
        "properties": {
          "breakpoints": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["ephemeral"] },
                "ttl": { "type": "string", "enum": ["5m", "1h"] }
              }
            }
          }
        }
      },
      "response_schema": {
        "type": "object",
        "properties": {
          "cache_creation_tokens": { "type": "integer" },
          "cache_read_tokens": { "type": "integer" }
        }
      }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Facade model identifier. |
| `name` | `string` | Human-readable name. |
| `capabilities` | `string[]` | Capability tags. |
| `context_window` | `integer` | Maximum input token capacity. |
| `max_output_tokens` | `integer` | Maximum generation length. |
| `supported_parameters` | `object` | Per-parameter descriptors: `supported` boolean, and when true, `min`, `max`, `default` where applicable. Follows the ParameterSupport type from `TypeSpecification.md` Section 3.3. |
| `supports_streaming` | `boolean` | Whether `stream_complete` is available for this model. |
| `supports_sessions` | `boolean` | Whether conversation state is supported. |
| `supports_tool_calling` | `boolean` | Whether this model accepts `tools` and `tool_choice` parameters and may produce ToolUseBlocks in responses. |
| `supports_thinking` | `boolean` | Whether this model supports extended thinking and the `reasoning_effort` parameter. ThinkingBlocks may appear in responses. |
| `supports_vision` | `boolean` | Whether this model accepts ImageBlocks in message content. |
| `parameter_notes` | `string[]` | Advisory notes about parameter partitions or model-specific constraints (e.g., reasoning models that reject sampling parameters). See `OntologicalTaxonomy.md` Section 3.6. |
| `token_encoding` | `string` | Tokenizer family used for estimation. |
| `available_extensions` | `ExtensionDescriptor[]` | Extensions available for this model. Each descriptor includes the extension's identifier, schemas, and documentation. See [ExtensionDescriptor](#68-extensiondescriptor). |

---

### 3.5 `validate_request`

Pre-flight validation. Checks whether a request is structurally valid and satisfiable before consuming backend resources.

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | `string` | Yes | Facade model identifier. |
| `messages` | `Message[]` | Yes | The message sequence to validate. |
| `max_tokens` | `integer` | No | Requested maximum output tokens. |

#### Output

```json
{
  "valid": true,
  "estimated_input_tokens": 1420,
  "remaining_capacity": 190388,
  "warnings": []
}
```

```json
{
  "valid": false,
  "estimated_input_tokens": 210000,
  "remaining_capacity": -10000,
  "warnings": [
    "Input exceeds context window by approximately 10000 tokens."
  ],
  "errors": [
    "CONTEXT_OVERFLOW"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `valid` | `boolean` | `true` if the request can be dispatched without structural issues. |
| `estimated_input_tokens` | `integer` | Estimated token count of the input message sequence. |
| `remaining_capacity` | `integer` | `context_window - estimated_input_tokens - max_tokens`. Negative means overflow. |
| `warnings` | `string[]` | Non-blocking advisories (e.g. "temperature out of recommended range"). |
| `errors` | `string[]` | Present only when `valid` is `false`. Error codes from Section 5. |

---

### 3.6 `estimate_tokens`

Estimate the token count for arbitrary text content using the tokenizer associated with a given model.

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | `string` | Yes | Facade model identifier (determines which tokenizer to use). |
| `content` | `string` | Yes | The text to tokenize and count. |

#### Output

```json
{
  "model": "claude-sonnet",
  "token_count": 347,
  "encoding": "cl100k_base",
  "is_exact": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | The model whose tokenizer was used. |
| `token_count` | `integer` | Estimated token count. |
| `encoding` | `string` | Tokenizer family used. |
| `is_exact` | `boolean` | `true` if the server has access to the model's native tokenizer. `false` if a compatible approximation was used. |

---

## 4. MCP Resources

Resources are read-only data endpoints that MCP clients can subscribe to or poll.

### 4.1 `models://catalog`

**URI:** `models://catalog`
**Description:** The full model catalog with capabilities and limits. Equivalent to the output of `list_models` with no filter, but available as a subscribable resource.
**MIME type:** `application/json`

Clients should prefer subscribing to this resource rather than polling `list_models` when they need to react to configuration changes (e.g. a backend going offline, a new model becoming available).

### 4.2 `config://state`

**URI:** `config://state`
**Description:** Current facade configuration state. Exposes which backends are active, health status, and routing policy -- without exposing credentials or internal connection details.
**MIME type:** `application/json`

```json
{
  "backends": [
    {
      "name": "anthropic",
      "status": "healthy",
      "models_registered": 3,
      "last_health_check": "2026-03-27T14:30:00Z"
    },
    {
      "name": "local-ollama",
      "status": "degraded",
      "models_registered": 1,
      "last_health_check": "2026-03-27T14:29:55Z"
    }
  ],
  "routing_policy": "explicit",
  "session_ttl_seconds": 3600
}
```

Backend names are facade-level identifiers. No URLs, API keys, or internal addressing is exposed.

### 4.3 `session://{session_id}`

**URI:** `session://{session_id}`
**Description:** The accumulated conversation state for a given session. Only exists when a client has established a session via the `session_id` parameter on `complete` or `stream_complete`.
**MIME type:** `application/json`

```json
{
  "session_id": "ses_x9y8z7",
  "model": "claude-sonnet",
  "created_at": "2026-03-27T14:00:00Z",
  "turn_count": 4,
  "total_input_tokens": 2840,
  "total_output_tokens": 1120,
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": [{ "type": "text", "text": "..." }] }
  ]
}
```

Sessions are ephemeral. They expire after `session_ttl_seconds` of inactivity (configurable, see `config://state`).

---

## 5. Error Responses

All tool errors conform to a single shape. MCP protocol-level errors (invalid tool name, malformed JSON) are handled by the MCP transport layer and are outside this specification.

Errors are classified by their **nature** -- the kind of failure they represent -- not by transport codes. The error hierarchy has four genera (Precondition, Capacity, Process, System) following the ontological classification in `OntologicalTaxonomy.md` Section 4 and `TypeSpecification.md` Section 5.

### 5.1 Error Shape

```json
{
  "error": {
    "code": "MODEL_NOT_FOUND",
    "category": "precondition",
    "message": "No model registered with identifier 'gpt-nonexistent'.",
    "retryable": false,
    "details": {}
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error.code` | `string` | Machine-readable error code from the table below. |
| `error.category` | `string` | Error genus: `precondition`, `capacity`, `process`, or `system`. |
| `error.message` | `string` | Human-readable explanation. |
| `error.retryable` | `boolean` | Whether the same request may succeed on retry. |
| `error.details` | `object` | Optional structured context (e.g. which parameter failed, what the limit was, `retry_after_seconds`). |

### 5.2 Error Codes

Organized by the 4-genus structure from the error ontology.

#### Precondition Failures

The request cannot be attempted. Its prerequisites are not met.

| Code | HTTP Analog | Retryable | Meaning |
|------|-------------|-----------|---------|
| `INVALID_PARAMS` | 400 | No | One or more parameters failed validation (wrong type, out of range, missing required field, prohibited parameter for model type). |
| `MODEL_NOT_FOUND` | 404 | No | The requested facade model identifier does not match any registered model. |
| `SESSION_NOT_FOUND` | 404 | No | The provided `session_id` does not reference an active session. |
| `SESSION_EXPIRED` | 410 | No | The session existed but has been reclaimed due to TTL expiration. |
| `INVALID_EXTENSION` | 400 | No | An extension ID is not available for the target model, or the extension value does not conform to the registered schema. |

#### Capacity Failures

The request is valid but the system cannot accommodate it now.

| Code | HTTP Analog | Retryable | Meaning |
|------|-------------|-----------|---------|
| `CONTEXT_OVERFLOW` | 422 | No | The input token count plus `max_tokens` exceeds the model's context window. Reduce input. |
| `RATE_LIMITED` | 429 | Yes | The backend or the facade has throttled this caller's request. `details.retry_after_seconds` indicates when to retry. |
| `OVERLOADED` | 503 | Yes | The backend is at system-wide capacity. Distinct from `RATE_LIMITED` which is per-caller; `OVERLOADED` means no caller can be served. |
| `QUOTA_EXCEEDED` | 402 | No | A billing or allocation limit has been reached. The caller must increase their allocation. |

#### Process Failures

Generation began but could not complete.

| Code | HTTP Analog | Retryable | Meaning |
|------|-------------|-----------|---------|
| `CONTENT_FILTERED` | 451 | No | The request or response was rejected by content filtering policy. The prompt must be changed or the filter accepted. |
| `TIMEOUT` | 504 | Yes | The generation process exceeded its time budget. Retrying may succeed if load decreases. |
| `STREAM_INTERRUPTED` | 502 | Yes | A streaming generation was broken mid-delivery. Partial data delivered before the interruption must be discarded. Retry from scratch. |

#### System Failures

Infrastructure failure unrelated to the specific request.

| Code | HTTP Analog | Retryable | Meaning |
|------|-------------|-----------|---------|
| `BACKEND_UNAVAILABLE` | 503 | Yes | The backend responsible for the requested model is not reachable. |
| `BACKEND_ERROR` | 502 | Yes | The backend returned an internal error. The original error is not forwarded; `details` may contain a sanitized summary. |
| `INTERNAL_ERROR` | 500 | Conditional | An unexpected failure within the facade. No internal stack traces are exposed. |
| `UNKNOWN_ERROR` | 500 | Unknown | An error that could not be classified. The raw provider error is preserved internally but not exposed to the caller. |

---

## 6. Shared Schemas

All schemas in this section are projections of the formal types defined in `TypeSpecification.md`. When in conflict, the TypeSpecification is authoritative.

### 6.1 Message

Used by `complete`, `stream_complete`, and `validate_request`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | `string` | Yes | One of: `system`, `user`, `assistant`, `tool`. |
| `content` | `string \| ContentBlock[]` | Yes | The message payload. A bare string is shorthand for `[{ "type": "text", "text": "<the string>" }]`. The canonical form is always `ContentBlock[]`. |
| `tool_call_id` | `string` | Conditional | Required when `role` is `"tool"`. Identifies which tool invocation this message responds to. Must reference a `tool_use_id` from a preceding ToolUseBlock. Must be null or absent when role is not `"tool"`. |

String shorthand (accepted at API boundary):

```json
{
  "role": "user",
  "content": "Explain the CAP theorem in two sentences."
}
```

Block array form (canonical):

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this image?" },
    { "type": "image", "media_type": "image/png", "data": "iVBORw0KGgo..." }
  ]
}
```

Tool result message:

```json
{
  "role": "tool",
  "tool_call_id": "tu_abc123",
  "content": [
    { "type": "text", "text": "72 degrees and sunny" }
  ]
}
```

The `tool` role is valid only when the target model's `supports_tool_calling` capability is true. Submitting a tool-role message to a non-tool-calling model is a validation error.

### 6.2 ContentBlock

A single block of typed content within a message or response. ContentBlock is a discriminated union. Every instance is exactly one of the following variants.

| Variant | Type Tag | Fields | Description |
|---------|----------|--------|-------------|
| TextBlock | `"text"` | `text: string` | Plain text content. Universal across all providers. |
| ToolUseBlock | `"tool_use"` | `tool_use_id: string`, `name: string`, `input: object` | Model is requesting tool execution. Appears in assistant responses. |
| ToolResultBlock | `"tool_result"` | `tool_use_id: string`, `content: ContentBlock[]` | Caller supplies the result of a prior tool invocation. Appears in tool-role messages. |
| ThinkingBlock | `"thinking"` | `thinking: string`, `signature: string` | Extended thinking trace. Opaque passthrough -- the facade must not interpret, transform, or strip the content or signature. |
| ImageBlock | `"image"` | `media_type: string`, `data?: string`, `source_url?: string` | Image content. Exactly one of `data` (base64) or `source_url` must be present. |

See `TypeSpecification.md` Section 1.2 for full invariants and construction rules.

### 6.3 FinishReason

Why generation stopped. Normalized from provider-specific vocabularies into this canonical set.

| Value | Meaning | Provider Mappings (representative) |
|-------|---------|-----------------------------------|
| `stop` | Natural completion: the model produced an end-of-sequence token, or a caller-specified stop sequence was encountered. | OpenAI `stop`, Anthropic `end_turn` + `stop_sequence`, Gemini `STOP`, Cohere `COMPLETE`, Ollama `stop` |
| `length` | Generation reached the `max_tokens` limit before natural completion. | OpenAI `length`, Anthropic `max_tokens`, Gemini `MAX_TOKENS`, Cohere `MAX_TOKENS` |
| `content_filter` | The request or response was blocked by a safety or moderation filter. | OpenAI `content_filter`, Gemini `SAFETY` + `RECITATION` |
| `tool_use` | The model is requesting execution of one or more tools before continuing generation. `content` will contain at least one ToolUseBlock. | OpenAI `tool_calls`, Anthropic `tool_use`, Gemini `function_call` |
| `error` | Generation failed for a non-safety reason (provider-side generation failure). | Facade-assigned when generation fails mid-process. |

See `TypeSpecification.md` Section 2.2 for formal invariants.

### 6.4 ToolDefinition

The specification of a tool the model may invoke during generation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique name of the tool within this request. Pattern: `[a-zA-Z0-9_-]+`. |
| `description` | `string` | Yes | Human-readable description of what the tool does, used by the model to decide when to invoke it. |
| `input_schema` | `object` | Yes | JSON Schema describing the expected input structure. |

```json
{
  "name": "get_weather",
  "description": "Get the current weather for a location.",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string", "description": "City name or coordinates" }
    },
    "required": ["location"]
  }
}
```

See `TypeSpecification.md` Section 4.3 for formal invariants.

### 6.5 ToolChoice

Constrains the model's tool invocation behavior.

| Value / Form | Meaning |
|-------------|---------|
| `"auto"` | The model decides whether to invoke a tool or generate text (default). |
| `"none"` | The model must not invoke any tool; generate text only. |
| `"required"` | The model must invoke at least one tool. |
| `{ "name": "<tool_name>" }` | The model must invoke the specific named tool. The named tool must exist in the request's `tools` array. |

`tool_choice` is only valid when `tools` is present. See `TypeSpecification.md` Section 4.4.

### 6.6 ContentBlockDelta

An incremental update to a content block within a streaming chunk. This is the streaming counterpart of ContentBlock.

| Variant | Type Tag | Fields | Description |
|---------|----------|--------|-------------|
| TextDelta | `"text_delta"` | `text: string` | Incremental text fragment. May be empty string (heartbeat). |
| ToolUseDelta | `"tool_use_delta"` | `tool_use_id?: string`, `name?: string`, `input_json_delta: string` | Incremental tool call data. `tool_use_id` and `name` present on the first delta for a call; null on subsequent deltas. Concatenating all `input_json_delta` fragments yields valid JSON. |
| ThinkingDelta | `"thinking_delta"` | `thinking: string` | Incremental reasoning fragment. Opaque passthrough. |

See `TypeSpecification.md` Section 1.5 for formal invariants.

### 6.7 Usage

| Field | Type | Description |
|-------|------|-------------|
| `input_tokens` | `integer` | Tokens consumed by the input. |
| `output_tokens` | `integer` | Tokens in the generated completion. |
| `is_approximate` | `boolean` | `true` when the provider did not report token counts and the facade estimated them. `false` when values are as reported by the provider. |

See `TypeSpecification.md` Section 1.6 for formal invariants.

### 6.8 ExtensionDescriptor

Describes a provider-specific extension available on a model. Returned by `get_model_info` in the `available_extensions` array.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Canonical extension identifier (e.g., `cache_control`, `safety_settings`). Unique within a model's extension set. |
| `name` | `string` | Human-readable display name. |
| `description` | `string` | What the extension does. |
| `input_schema` | `object \| null` | JSON Schema for request-side values. `null` when the extension produces response data only and accepts no input. |
| `response_schema` | `object \| null` | JSON Schema for response-side data. `null` when the extension is input-only and produces no response data. |

---

## 7. Tool Capability Matrix

Summary of which parameters and features each tool accepts.

| Feature | `complete` | `stream_complete` | `list_models` | `get_model_info` | `validate_request` | `estimate_tokens` |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| Requires `model` | Yes | Yes | No | Yes | Yes | Yes |
| Requires `messages` | Yes | Yes | No | No | Yes | No |
| Requires `content` | No | No | No | No | No | Yes |
| Accepts `session_id` | Yes | Yes | No | No | No | No |
| Accepts `tools` | Yes | Yes | No | No | No | No |
| Accepts `tool_choice` | Yes | Yes | No | No | No | No |
| Accepts `reasoning_effort` | Yes | Yes | No | No | No | No |
| Accepts `extensions` | Yes | Yes | No | No | No | No |
| Returns `usage` | Yes | Yes (final chunk) | No | No | No | No |
| Returns streaming chunks | No | Yes | No | No | No | No |
| Stateless | Default | Default | Always | Always | Always | Always |

---

## 8. Open Questions

Items deferred from this draft that require decision before v1.0.

### Resolved

1. **Multi-modal content blocks.** -- RESOLVED in v0.2.0. The content block model is adopted. Content is `ContentBlock[]` with five variants (TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ImageBlock). String shorthand is accepted at API boundaries. See Section 6.2.

2. **Tool use / function calling.** -- RESOLVED in v0.2.0. Exposed as `tools` and `tool_choice` parameters on `complete`/`stream_complete`. The `tool` message role completes the tool-calling cycle. See Sections 3.1, 6.4, 6.5.

### Open

3. **Batch completion.** Whether to add a `batch_complete` tool for submitting multiple independent completions in a single call.

4. **Cost estimation.** Whether `validate_request` or a separate tool should return estimated cost based on per-model pricing tables.

5. **Routing policy control.** Whether clients should be able to influence routing (e.g. prefer lowest latency, prefer lowest cost) or if this is strictly server-side configuration.

6. **Multi-turn tool calling choreography.** When a model returns `finish_reason: tool_use`, the client must execute the tools and resubmit with tool results. The facade currently treats each call as independent. Whether to support automated multi-turn tool resolution within a single `complete` call (facade executes tools and loops) or require the client to manage the choreography is undecided.

7. **Thinking block passthrough in sessions.** When session state is active, whether ThinkingBlocks (with their provider-signed content) should be stored in the session and replayed to the model on subsequent turns. This has implications for provider contract compliance and session storage costs.

8. **Extension registry management.** How are extensions registered and versioned? Should the MCP server expose a resource listing all known extensions across all providers?
