# Vendor API Inventory: Mistral, Cohere, xAI (Grok)

> **Purpose:** Authoritative reference for the llm-api-facade project.
> **Last researched:** 2026-03-26
> **Confidence note:** Model lists and pricing shift frequently. Context windows and output limits
> are best-effort from official docs, OpenRouter, and Promptfoo cross-references. Verify against
> live `/models` endpoints before relying on specific numbers.

---

## Table of Contents

1. [Mistral](#mistral)
2. [Cohere](#cohere)
3. [xAI (Grok)](#xai-grok)
4. [Cross-Provider Boundary Classification](#cross-provider-boundary-classification)

---

# Mistral

## 1. Identity

| Attribute | Value |
|-----------|-------|
| API Name | Mistral AI Platform API |
| Base URL | `https://api.mistral.ai` |
| Versioning | Path-prefix: `/v1/` on all routes |
| Authentication | Bearer token: `Authorization: Bearer <API_KEY>` |
| Primary Endpoint | `POST /v1/chat/completions` |
| SDKs | Python (`mistralai`), TypeScript/JS (`@mistralai/mistralai`) |
| Additional Endpoints | `/v1/fim/completions`, `/v1/embeddings`, `/v1/moderations`, `/v1/chat/moderations`, `/v1/ocr`, `/v1/audio/speech`, `/v1/audio/transcriptions`, `/v1/batch/jobs`, `/v1/models`, agents (beta) |

## 2. Function Inventory (POST /v1/chat/completions)

| Parameter | Type | Required | Default | Range / Constraints | Semantic Purpose |
|-----------|------|----------|---------|---------------------|------------------|
| `model` | string | Yes | -- | Must match a valid model ID | Model selector |
| `messages` | array\<Message\> | Yes | -- | System, User, Assistant, Tool roles | Conversation history |
| `temperature` | number \| null | No | Model-dependent | 0.0 -- 1.0 (recommended 0.0 -- 0.7) | Sampling randomness |
| `top_p` | number | No | 1 | 0.0 -- 1.0 | Nucleus sampling threshold |
| `max_tokens` | integer \| null | No | Model max | prompt + max_tokens <= context window | Output length cap |
| `stream` | boolean | No | false | -- | Enable SSE streaming |
| `stop` | string \| array\<string\> | No | -- | -- | Stop sequence(s) |
| `n` | integer \| null | No | 1 | -- | Number of completions; input tokens billed once |
| `frequency_penalty` | number | No | 0 | Positive values penalize repetition | Penalize tokens by occurrence frequency |
| `presence_penalty` | number | No | 0 | Positive values penalize repetition | Penalize tokens by mere presence |
| `random_seed` | integer \| null | No | -- | -- | Deterministic sampling seed |
| `safe_prompt` | boolean | No | false | -- | Inject safety system prompt before conversation |
| `response_format` | object \| null | No | -- | `{"type":"text"}`, `{"type":"json_object"}`, `{"type":"json_schema", "json_schema":{...}}` | Force output format |
| `tools` | array\<Tool\> \| null | No | -- | Function definitions with name, description, parameters (JSON Schema) | Declare callable functions |
| `tool_choice` | string \| object | No | "auto" | `"auto"`, `"none"`, `"any"`, `"required"`, or `{"type":"function","function":{"name":"..."}}` | Control tool invocation |
| `parallel_tool_calls` | boolean | No | true | -- | Allow multiple simultaneous tool calls |
| `reasoning_effort` | string | No | -- | `"high"`, `"none"` | Reasoning depth for Magistral models |
| `prompt_mode` | string | No | -- | `"reasoning"` | High-level intent hint for system prompt |
| `guardrails` | array\<GuardrailConfig\> \| null | No | -- | -- | Safety filtering configuration |
| `metadata` | map\<any\> \| null | No | -- | -- | Custom metadata passthrough |

**Design notes:**
- `temperature` and `top_p` should not both be modified simultaneously (Mistral recommendation).
- `safe_prompt` prepends a safety-oriented system message: "Always assist with care, respect, and truth. Respond with utmost utility yet securely. Avoid harmful, unethical, prejudiced, or negative content. Ensure replies promote fairness and positivity."
- `random_seed` (not `seed`) is the Mistral-specific name. Different from OpenAI's `seed`.

## 3. Message and Response Ontology

### Message Roles

| Role | Content Types | Notes |
|------|---------------|-------|
| `system` | text | Sets behavioral context |
| `user` | text, image (multimodal models) | User input |
| `assistant` | text, tool_calls | Model output or prefill |
| `tool` | text | Tool execution result; requires `tool_call_id` |

### Response Shape

```json
{
  "id": "string",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "mistral-large-latest",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "string | null",
        "tool_calls": [
          {
            "id": "string",
            "type": "function",
            "function": { "name": "string", "arguments": "string (JSON)" }
          }
        ]
      },
      "finish_reason": "stop | length | tool_calls | content_filter"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

### Finish Reasons

| Value | Meaning |
|-------|---------|
| `stop` | Natural end or stop sequence hit |
| `length` | `max_tokens` reached |
| `tool_calls` | Model invoked one or more tools |
| `content_filter` | Safety filter triggered |

## 4. Streaming

| Aspect | Detail |
|--------|--------|
| Protocol | Server-Sent Events (SSE) |
| Content-Type | `text/event-stream` |
| Chunk object | `"object": "chat.completion.chunk"` |
| Delta path | `choices[n].delta.content` (text), `choices[n].delta.role` (first chunk) |
| Termination | `data: [DONE]` |
| Usage in stream | Final chunk may include `usage` object |

**Chunk shape:**
```
data: {"id":"...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"role":"assistant","content":" token"},"finish_reason":null}]}
```

## 5. Error Ontology

### Error Response Shape

```json
{
  "object": "error",
  "message": "string",
  "type": "invalid_request_error | authentication_error | rate_limit_error | server_error",
  "param": "string | null",
  "code": "string | null"
}
```

### HTTP Status Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 400 | Bad Request | Invalid parameters, malformed JSON |
| 401 | Unauthorized | Missing or invalid API key |
| 422 | Unprocessable Entity | Unsupported parameter for model |
| 429 | Too Many Requests | Rate limit exceeded; check `retry_after` |
| 500 | Internal Server Error | Transient backend failure |

## 6. Model Taxonomy

| Model ID | Context | Capabilities | Input $/M | Output $/M |
|----------|---------|-------------|-----------|------------|
| `mistral-large-latest` (mistral-large-3-25-12) | 262K | Multimodal, tools, JSON, reasoning | $0.50 | $1.50 |
| `mistral-medium-latest` (mistral-medium-3-1-25-08) | 128K | Multimodal, frontier-class | $0.40 | $2.00 |
| `mistral-small-latest` (mistral-small-4-0-26-03) | 128K | Reasoning, coding, instruct hybrid | $0.10 | $0.30 |
| `codestral-latest` (codestral-25-08) | 256K | Code in 80+ languages, FIM | $0.30 | $0.90 |
| `magistral-medium-latest` (magistral-medium-2509) | 40K | Extended reasoning with traces | $2.00 | $5.00 |
| `magistral-small-latest` (magistral-small-2509) | 40K | Budget reasoning | $0.50 | $1.50 |
| `open-mistral-nemo` | 128K | Multilingual, open-weight | $0.15 | $0.15 |
| `pixtral-12b` | 128K | Vision + text, open-weight | $0.15 | $0.15 |
| `ministral-3-14b-25-12` | TBD | Text + vision, efficient | TBD | TBD |
| `ministral-3-8b-25-12` | TBD | Text + vision, efficient | TBD | TBD |
| `ministral-3-3b-25-12` | TBD | Text + vision, tiny | TBD | TBD |
| `devstral-2-25-12` | 256K | Code agents, SWE tasks | TBD | TBD |

**Notes:**
- `-latest` suffixes alias to the most recent version of each model family.
- Magistral models have intentionally smaller context windows (40K) to focus compute on reasoning traces.
- Codestral supports Fill-in-the-Middle (FIM) via `/v1/fim/completions`.

## 7. Behavioral Peculiarities

| Peculiarity | Detail |
|-------------|--------|
| **`safe_prompt` flag** | Boolean that prepends a safety system message. Unique to Mistral -- no other provider uses this mechanism. Other providers use `safety_mode` (Cohere) or rely on system prompts. |
| **`random_seed`** | Named `random_seed`, not `seed` as in OpenAI/xAI. Must map in facade. |
| **`tool_choice: "any"`** | Mistral supports `"any"` as a tool_choice value (forces the model to call at least one tool), equivalent to `"required"` in other providers. Both `"any"` and `"required"` are accepted. |
| **Agents API** | Beta endpoint at `/v1/agents/completions` for persistent agent conversations with built-in tool orchestration. |
| **Guardrails API** | Dedicated `/v1/moderations` and `/v1/chat/moderations` endpoints plus inline `guardrails` parameter. |
| **OCR endpoint** | Unique `/v1/ocr` endpoint for document extraction. |
| **Reasoning effort** | Only applies to Magistral models; values are `"high"` and `"none"` (not `"low"`/`"medium"` like xAI). |
| **FIM (Fill-in-the-Middle)** | Codestral-specific capability at a separate endpoint. |

---

# Cohere

## 1. Identity

| Attribute | Value |
|-----------|-------|
| API Name | Cohere Platform API (v2) |
| Base URL | `https://api.cohere.com` |
| Versioning | Path-prefix: `/v2/` for current API (v1 deprecated) |
| Authentication | Bearer token: `Authorization: Bearer <API_KEY>`, or env var `CO_API_KEY` |
| Primary Endpoint | `POST /v2/chat` |
| SDKs | Python (`cohere`, `CohereClientV2`), TypeScript/JS (`cohere-ai`, `CohereClientV2`), Java, Go |
| Additional Endpoints | `/v2/embed`, `/v2/rerank`, `/v2/classify`, `/v1/connectors` |
| SDK Status | Beta -- may have breaking changes without major version bump |

## 2. Function Inventory (POST /v2/chat)

| Parameter | Type | Required | Default | Range / Constraints | Semantic Purpose |
|-----------|------|----------|---------|---------------------|------------------|
| `model` | string | Yes | -- | Must be a compatible Cohere model ID | Model selector |
| `messages` | array\<ChatMessageV2\> | Yes | -- | User, Assistant, System, Tool roles | Conversation history |
| `stream` | boolean | Yes | -- | Must be explicitly set to `true` or `false` | Enable SSE streaming |
| `tools` | array\<ToolV2\> | No | -- | Function definitions | Declare callable functions |
| `strict_tools` | boolean | No | false | Requires Command-r7b or newer | Force tool calls to match definitions exactly |
| `tool_choice` | enum | No | -- | `REQUIRED`, `NONE` | Force or forbid tool usage |
| `documents` | array\<Document\> | No | -- | Inline documents for RAG | Ground responses in provided sources |
| `citation_options` | CitationOptions | No | -- | `{"mode": "FAST"}`, `{"mode": "ACCURATE"}`, `{"mode": "OFF"}` | Control citation generation behavior |
| `response_format` | ResponseFormatV2 | No | -- | `{"type": "text"}`, `{"type": "json_object"}` | Force output structure |
| `safety_mode` | enum | No | CONTEXTUAL | `CONTEXTUAL`, `STRICT`, `OFF` | Safety instruction level |
| `max_tokens` | integer | No | Model max | Positive integer, capped at model maximum | Output token limit |
| `stop_sequences` | array\<string\> | No | -- | Max 5 entries | Stop generation on match |
| `temperature` | number | No | 0.3 | >= 0.0 (no explicit upper bound) | Sampling randomness |
| `seed` | integer | No | -- | -- | Deterministic sampling (best effort) |
| `frequency_penalty` | number | No | 0.0 | 0.0 -- 1.0 | Penalize by occurrence count |
| `presence_penalty` | number | No | 0.0 | 0.0 -- 1.0 | Uniform repeat penalty |
| `k` | integer | No | 0 | 0 -- 500; 0 disables | Top-k sampling |
| `p` | number | No | 0.75 | 0.01 -- 0.99 | Nucleus sampling (top-p) |
| `logprobs` | boolean | No | false | -- | Include token log probabilities |
| `thinking` | object | No | -- | `{"type": "enabled", "token_budget": N}` or `{"type": "disabled"}` | Enable/configure reasoning traces |
| `priority` | integer | No | 0 | Lower = higher priority | Request scheduling under load |

**Header parameters:**

| Header | Required | Purpose |
|--------|----------|---------|
| `Authorization` | Yes | Bearer token |
| `X-Client-Name` | No | Project identifier for analytics |

**Design notes:**
- `stream` is listed as required in Cohere's spec -- must be explicitly `false` for non-streaming.
- `frequency_penalty` and `presence_penalty` range is 0.0 -- 1.0 (narrower than OpenAI's -2.0 to 2.0).
- `k` (top-k) is a Cohere-specific sampling parameter; not present in OpenAI or Mistral APIs.
- `p` defaults to 0.75 (unlike OpenAI's 1.0 and Mistral's 1.0).
- `safety_mode` cannot be used simultaneously with `tools` or `documents`.
- `tool_choice` uses uppercase enums (`REQUIRED`, `NONE`) unlike other providers' lowercase strings.

## 3. Message and Response Ontology

### Message Roles

| Role | Content Types | Notes |
|------|---------------|-------|
| `system` | text (string or Content array) | Sets behavioral context |
| `user` | text, image_url (Content array) | User input, multimodal |
| `assistant` | text, thinking (Content array), tool_calls, tool_plan, citations | Model output |
| `tool` | text, document (ToolContent array) | Tool result; requires `tool_call_id` |

### Response Shape (Non-Streaming)

```json
{
  "id": "string",
  "finish_reason": "COMPLETE | STOP_SEQUENCE | MAX_TOKENS | TOOL_CALL | ERROR | TIMEOUT",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "string" },
      { "type": "thinking", "thinking": "string" }
    ],
    "tool_calls": [
      {
        "id": "string",
        "type": "function",
        "function": { "name": "string", "arguments": "string (JSON)" }
      }
    ],
    "tool_plan": "string",
    "citations": [
      {
        "start": 0,
        "end": 10,
        "text": "cited span",
        "sources": [],
        "content_index": 0,
        "type": "TEXT_CONTENT | THINKING_CONTENT | PLAN"
      }
    ]
  },
  "usage": {
    "billed_units": {
      "input_tokens": 0,
      "output_tokens": 0,
      "search_units": 0
    },
    "tokens": {
      "input_tokens": 0,
      "output_tokens": 0
    },
    "cached_tokens": 0
  },
  "logprobs": [
    { "text": "string", "token_ids": [0], "logprobs": [0.0] }
  ]
}
```

### Finish Reasons

| Value | Meaning |
|-------|---------|
| `COMPLETE` | Natural completion |
| `STOP_SEQUENCE` | Stop sequence matched |
| `MAX_TOKENS` | Output limit reached |
| `TOOL_CALL` | Model invoked tool(s) |
| `ERROR` | Processing error |
| `TIMEOUT` | Request timed out |

**Key structural differences from OpenAI shape:**
- No `choices` array -- single response object at top level.
- `finish_reason` at top level, not nested in choices.
- `message.content` is an array of typed objects, not a plain string.
- `citations` are a first-class field on the message.
- `usage.billed_units` separates billing from raw token counts.
- `tool_plan` is a separate field explaining the model's tool-use reasoning.

## 4. Streaming

| Aspect | Detail |
|--------|--------|
| Protocol | Server-Sent Events (SSE) |
| Content-Type | `text/event-stream` |
| Termination | `[DONE]` sentinel |

### Event Types

| Event | Payload | Purpose |
|-------|---------|---------|
| `message-start` | Request metadata, message ID | Stream initialization |
| `content-start` | -- | Content block begins |
| `content-delta` | `delta.message.content.text` | Incremental text token |
| `content-end` | -- | Content block ends |
| `tool-plan-delta` | Tool planning text | Incremental tool reasoning |
| `tool-call-start` | Tool name, call ID | Tool invocation begins |
| `tool-call-delta` | Function arguments (incremental) | Incremental tool args |
| `tool-call-end` | -- | Tool invocation ends |
| `citation-start` | Citation with start, end, text, sources | Citation detected |
| `citation-end` | -- | Citation ends |
| `message-end` | Final usage, finish_reason | Stream complete |

**Key structural difference:** Cohere uses named event types (not just `data:` chunks). This is richer than the OpenAI-style streaming used by Mistral and xAI.

## 5. Error Ontology

### Error Response Shape

```json
{
  "message": "human-readable error description"
}
```

The HTTP status code carries the error category; the JSON body provides a descriptive message string.

### HTTP Status Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 400 | Bad Request | Missing fields, invalid values, exceeding token limits, schema violations |
| 401 | Unauthorized | Missing, invalid, or expired API key |
| 402 | Payment Required | Billing limit reached |
| 403 | Forbidden | Operation not permitted |
| 404 | Not Found | Invalid model ID or resource |
| 422 | Unprocessable Entity | Malformed request structure |
| 429 | Too Many Requests | Rate limit exceeded |
| 498 | Token Denied | Deny-listed token detected |
| 499 | Request Cancelled | Client cancelled |
| 500 | Internal Server Error | Backend failure |
| 501 | Not Implemented | Feature unavailable |
| 503 | Service Unavailable | Overload |
| 504 | Gateway Timeout | Request timed out |

**Notable:** Cohere uses HTTP 498 (non-standard) for deny-listed tokens and 499 for client cancellation -- neither exists in the standard HTTP spec. The facade must handle these explicitly.

## 6. Model Taxonomy

### Chat/Generation Models

| Model ID | Context | Max Output | Capabilities |
|----------|---------|------------|--------------|
| `command-a-03-2025` | 256K | 8K | RAG, tool use, agents, multilingual |
| `command-a-reasoning-08-2025` | 256K | 32K | Extended reasoning |
| `command-a-vision-07-2025` | 128K | 8K | Image processing, charts, OCR, document QA |
| `command-a-translate-08-2025` | 8K | 8K | Translation across 23 languages |
| `command-r-08-2024` | 128K | 4K | Conversational, RAG |
| `command-r-plus-08-2024` | 128K | 4K | Complex RAG, multi-step tool use |
| `command-r7b-12-2024` | 128K | 4K | Small, fast RAG and tool use |
| `c4ai-aya-expanse-32b` | 128K | 4K | Multilingual text |
| `c4ai-aya-vision-32b` | 16K | 4K | Multilingual text + images |

### Embedding Models

| Model ID | Dimensions | Context | Capabilities |
|----------|-----------|---------|--------------|
| `embed-v4.0` | 256--1536 | 128K | Text, images, PDFs |
| `embed-english-v3.0` | 1024 | 512 | English text/images |
| `embed-multilingual-v3.0` | 1024 | 512 | 23+ languages |

### Rerank Models

| Model ID | Context | Purpose |
|----------|---------|---------|
| `rerank-v4.0-pro` | 32K | State-of-the-art multilingual reranking |
| `rerank-v4.0-fast` | 32K | Low-latency reranking |

## 7. Behavioral Peculiarities

| Peculiarity | Detail |
|-------------|--------|
| **RAG-native design** | `documents` parameter and `citation_options` are first-class. No other major provider embeds retrieval grounding directly in the chat endpoint. |
| **Citation modes** | `FAST` generates citations during streaming; `ACCURATE` waits until full response is generated then aligns citations to text spans. `OFF` disables. |
| **`safety_mode`** | Three levels: `CONTEXTUAL` (default, context-aware safety), `STRICT` (maximum safety), `OFF` (no safety injection). Cannot be combined with `tools` or `documents`. |
| **`tool_plan`** | Response includes a `tool_plan` field -- a natural-language explanation of why the model chose specific tools. Unique to Cohere. |
| **`strict_tools`** | Boolean to force tool calls to exactly match definitions. Requires Command-r7b+. |
| **Uppercase enums** | `tool_choice` uses `REQUIRED`/`NONE`, `finish_reason` uses `COMPLETE`/`TOOL_CALL`/etc. Must map case in facade. |
| **`stream` is required** | Unlike other providers where `stream` defaults to false, Cohere requires explicit declaration. |
| **`k` (top-k) sampling** | Unique sampling parameter (0--500). Not available in OpenAI, Mistral, or xAI APIs. |
| **`p` default is 0.75** | Lower than OpenAI/Mistral default of 1.0. Cohere is more conservative by default. |
| **`temperature` default is 0.3** | Lower than typical 0.7--1.0 defaults. Cohere defaults to more deterministic output. |
| **`priority` parameter** | Request-level scheduling priority under load. Unique to Cohere. |
| **`thinking` parameter** | Explicit reasoning toggle with token budget. Similar to Magistral's `reasoning_effort` but more granular. |
| **No `choices` array** | Response is a single object, not an array of choices. The `n` parameter is absent. |
| **`billed_units` vs `tokens`** | Usage separates billed units (which may differ from raw counts) from actual token counts. |
| **Non-standard HTTP codes** | 498 (deny-listed token) and 499 (client cancelled) are Cohere-specific. |

---

# xAI (Grok)

## 1. Identity

| Attribute | Value |
|-----------|-------|
| API Name | xAI API |
| Base URL | `https://api.x.ai` |
| Versioning | Path-prefix: `/v1/` |
| Authentication | Bearer token: `Authorization: Bearer <XAI_API_KEY>` |
| Primary Endpoint | `POST /v1/chat/completions` |
| Responses Endpoint | `POST /v1/responses` (stateful, stores conversation server-side) |
| SDKs | Python (`xai-sdk`, sync and async), plus OpenAI SDK compatible, Anthropic SDK compatible |
| Compatibility | Explicitly OpenAI-compatible for `/v1/chat/completions` |

## 2. Function Inventory (POST /v1/chat/completions)

| Parameter | Type | Required | Default | Range / Constraints | Semantic Purpose |
|-----------|------|----------|---------|---------------------|------------------|
| `model` | string | Yes | -- | Must match a valid Grok model ID | Model selector |
| `messages` | array\<Message\> | Yes | -- | System, User, Assistant, Tool roles; text + image content | Conversation history |
| `temperature` | number | No | -- | 0 -- 2 | Sampling randomness |
| `top_p` | number | No | -- | 0 -- 1 | Nucleus sampling |
| `max_completion_tokens` | integer | No | -- | Visible output tokens only | Output length cap (preferred) |
| `max_tokens` | integer | No | -- | **DEPRECATED** -- use `max_completion_tokens` | Legacy output cap |
| `stream` | boolean | No | false | -- | Enable SSE streaming |
| `stream_options` | object | No | -- | `{"include_usage": true}` | Request usage stats in final stream chunk |
| `stop` | array\<string\> | No | -- | Max 4 sequences | Stop generation on match |
| `n` | integer | No | 1 | -- | Number of completions; each billed separately |
| `frequency_penalty` | number | No | 0 | -2.0 -- 2.0 | Penalize by frequency (unsupported on reasoning models) |
| `presence_penalty` | number | No | 0 | -2.0 -- 2.0 | Penalize by presence (unsupported on grok-3 and reasoning models) |
| `seed` | integer | No | -- | -- | Deterministic sampling with fingerprint |
| `logprobs` | boolean | No | false | -- | Return token log probabilities |
| `top_logprobs` | integer | No | -- | 0 -- 8 | Most likely tokens per position |
| `tools` | array\<Tool\> | No | -- | Max 128 function definitions | Declare callable functions |
| `tool_choice` | string \| object | No | -- | `"auto"`, `"none"`, `"required"`, or function spec | Control tool invocation |
| `parallel_tool_calls` | boolean | No | -- | When false, max one tool call | Limit concurrent tool calls |
| `response_format` | object | No | -- | `{"type":"text"}`, `{"type":"json_object"}`, `{"type":"json_schema",...}` | Force output structure |
| `reasoning_effort` | string | No | -- | `"low"`, `"high"` | Reasoning depth for reasoning models |
| `search_parameters` | object | No | -- | See sub-table below | Configure live web/X search |
| `deferred` | boolean | No | false | -- | Return `request_id` for async retrieval |
| `user` | string | No | -- | -- | End-user ID for abuse monitoring |
| `logit_bias` | object | No | -- | -100 to 100 per token | **Currently unsupported** despite being in schema |

### `search_parameters` Sub-Object

| Field | Type | Default | Constraints | Purpose |
|-------|------|---------|-------------|---------|
| `mode` | string | `"on"` | `"off"`, `"on"`, `"auto"` | Enable/disable/auto live search |
| `max_search_results` | integer | -- | 1 -- 50 | Cap number of search results |
| `from_date` | string | -- | ISO-8601 `YYYY-MM-DD` | Search results after date |
| `to_date` | string | -- | ISO-8601 `YYYY-MM-DD` | Search results before date |
| `sources` | array\<string\> | Web + X | -- | Restrict to specific source types |
| `return_citations` | boolean | -- | -- | Include source citations in response |

**Design notes:**
- `max_tokens` is deprecated in favor of `max_completion_tokens`. The facade should prefer the latter.
- `frequency_penalty` and `presence_penalty` are **rejected** by reasoning models and grok-3. The facade must conditionally omit these.
- `reasoning_effort` causes errors on non-reasoning grok-4. Must only send to reasoning-variant models.
- `logit_bias` appears in the schema but is documented as unsupported.
- `search_parameters` is unique to xAI -- no other provider has built-in web search at the chat endpoint level.
- `deferred` enables asynchronous completion -- unique to xAI.

## 3. Message and Response Ontology

### Message Roles

| Role | Content Types | Notes |
|------|---------------|-------|
| `system` / `developer` | text | Must be first message; only one allowed |
| `user` | text, image | Multimodal input |
| `assistant` | text, tool_calls, reasoning_content | Model output |
| `tool` | text | Tool result; requires `tool_call_id` |

### Response Shape

```json
{
  "id": "string",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "grok-4.20-0309-reasoning",
  "system_fingerprint": "string | null",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "string | null",
        "reasoning_content": "string | null",
        "refusal": "string | null",
        "tool_calls": [
          {
            "id": "string",
            "type": "function",
            "function": { "name": "string", "arguments": "string (JSON)" }
          }
        ]
      },
      "finish_reason": "stop | length | end_turn | tool_calls",
      "logprobs": {
        "content": [
          { "token": "string", "logprob": -0.5, "top_logprobs": [] }
        ]
      }
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "cost_in_usd_ticks": 0,
    "num_sources_used": 0,
    "prompt_tokens_details": {
      "text_tokens": 0,
      "image_tokens": 0,
      "audio_tokens": 0,
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "citations": [ "array of source objects | null" ],
  "output_files": [ "array of generated files | null" ]
}
```

### Finish Reasons

| Value | Meaning |
|-------|---------|
| `stop` | Natural end or stop sequence hit |
| `length` | Token limit reached |
| `end_turn` | Used in streaming for non-final chunks |
| `tool_calls` | Model invoked tool(s) |

**Key structural additions over OpenAI:**
- `reasoning_content` on assistant message (reasoning trace).
- `refusal` field for content policy rejections.
- `system_fingerprint` for backend configuration tracking.
- `usage.cost_in_usd_ticks` and `num_sources_used` for cost/search tracking.
- `usage.prompt_tokens_details` and `completion_tokens_details` for granular breakdown.
- `citations` and `output_files` at top level.

## 4. Streaming

| Aspect | Detail |
|--------|--------|
| Protocol | Server-Sent Events (SSE) |
| Content-Type | `text/event-stream` |
| Chunk object | `"object": "chat.completion.chunk"` |
| Delta path | `choices[n].delta.content` |
| Termination | `data: [DONE]` |
| Usage in stream | Requires `stream_options: {"include_usage": true}` |
| Final chunk | Includes complete usage statistics |

Streaming format is structurally identical to OpenAI's.

## 5. Error Ontology

### Error Response Shape (OpenAI-compatible)

```json
{
  "error": {
    "message": "string",
    "type": "string",
    "code": "string | null"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 400 | Bad Request | Invalid parameters, unsupported param for model |
| 401 | Unauthorized | Invalid or missing API key |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Backend failure |

### Parameter Rejection Matrix

| Parameter | Rejected By |
|-----------|------------|
| `frequency_penalty` | Reasoning models |
| `presence_penalty` | grok-3, all reasoning models |
| `stop` | Reasoning models |
| `reasoning_effort` | Non-reasoning grok-4 variants |
| `logprobs` | grok-4.20 models |
| `logit_bias` | All models (unsupported) |

The facade must conditionally strip parameters based on the target model to avoid 400 errors.

## 6. Model Taxonomy

| Model ID | Context | Reasoning | Vision | Functions | Pricing (in/out $/M) |
|----------|---------|-----------|--------|-----------|----------------------|
| `grok-4.20-0309-reasoning` | 2M | Yes | Yes | Yes | $2.00 / $6.00 |
| `grok-4.20-0309-non-reasoning` | 2M | No | Yes | Yes | $2.00 / $6.00 |
| `grok-4-1-fast-reasoning` | 2M | Yes | Yes | Yes | $0.20 / $0.50 |
| `grok-4-1-fast-non-reasoning` | 2M | No | Yes | Yes | $0.20 / $0.50 |
| `grok-4.20-multi-agent-0309` | 2M | Yes | Yes | Yes | $2.00 / $6.00 |

**Notes:**
- Cached prompt tokens get discounted rates (e.g., $0.20 -> $0.05 for fast models).
- All current text models support 2M token context windows.
- Grok-3 family appears deprecated from the current model listing.
- Rate limits: 4M TPM, 600 RPM for text models.
- Batch API available at 50% discount.

### Deferred Completion Flow

1. `POST /v1/chat/completions` with `deferred: true` returns `{ "request_id": "..." }`.
2. `GET /v1/chat/deferred-completion/{request_id}` to poll.
3. HTTP 202 = still processing; HTTP 200 = complete with full response body.

### Responses API (`/v1/responses`)

A separate stateful endpoint that stores conversation history server-side for 30 days:
- Chain conversations with `previous_response_id`.
- Retrieve encrypted reasoning traces with `include: ["reasoning.encrypted_content"]`.
- `store: false` disables server-side storage.
- Timeout should be 3600+ seconds for reasoning models.

## 7. Behavioral Peculiarities

| Peculiarity | Detail |
|-------------|--------|
| **Live web/X search** | Built-in `search_parameters` with sources including X (Twitter) posts and web. No other provider offers this natively at the chat endpoint. |
| **Deferred completions** | Async execution via `deferred: true` + polling endpoint. Unique to xAI. |
| **`reasoning_content`** | Reasoning trace exposed directly on the assistant message. Similar to Cohere's `thinking` content type but at a different structural position. |
| **`refusal` field** | Explicit content-refusal field on the message. OpenAI has this; Mistral and Cohere do not. |
| **`system_fingerprint`** | Tracks backend configuration changes for reproducibility auditing. |
| **`max_completion_tokens`** | xAI prefers this over `max_tokens` (deprecated). Maps to visible output tokens only, excluding reasoning tokens. |
| **`cost_in_usd_ticks`** | Usage includes direct cost reporting. No other provider returns cost in the response. |
| **Model-conditional parameters** | Several parameters (frequency_penalty, presence_penalty, stop, reasoning_effort, logprobs) are rejected by specific model variants. The facade must maintain a model-capability matrix. |
| **OpenAI SDK compatibility** | Can use the official OpenAI Python/JS SDK by pointing base_url to `https://api.x.ai/v1`. |
| **Multi-agent model** | `grok-4.20-multi-agent-0309` is a dedicated multi-agent coordination model (4-agent system with specialized sub-agents). |
| **`developer` role** | Accepts `developer` as an alias for `system` role. |

---

# Cross-Provider Boundary Classification

## Universal Parameters (Present in All Three)

| Concept | Mistral | Cohere | xAI |
|---------|---------|--------|-----|
| Model selector | `model` | `model` | `model` |
| Messages | `messages` | `messages` | `messages` |
| Temperature | `temperature` | `temperature` | `temperature` |
| Max output tokens | `max_tokens` | `max_tokens` | `max_completion_tokens` (preferred) / `max_tokens` (deprecated) |
| Streaming | `stream` | `stream` (required) | `stream` |
| Stop sequences | `stop` | `stop_sequences` | `stop` |
| Tools / function calling | `tools` | `tools` | `tools` |
| Tool choice control | `tool_choice` | `tool_choice` | `tool_choice` |
| Response format | `response_format` | `response_format` | `response_format` |
| Seed | `random_seed` | `seed` | `seed` |
| Frequency penalty | `frequency_penalty` | `frequency_penalty` | `frequency_penalty` |
| Presence penalty | `presence_penalty` | `presence_penalty` | `presence_penalty` |

## Common Parameters (Two of Three)

| Concept | Mistral | Cohere | xAI | Notes |
|---------|---------|--------|-----|-------|
| Top-p | `top_p` (default 1.0) | `p` (default 0.75) | `top_p` | Cohere uses short name `p` |
| Parallel tool calls | `parallel_tool_calls` | -- | `parallel_tool_calls` | Cohere uses `strict_tools` instead |
| Logprobs | -- | `logprobs` | `logprobs` | Mistral lacks logprobs |
| N (choices) | `n` | -- | `n` | Cohere always returns single response |
| Reasoning control | `reasoning_effort` | `thinking` | `reasoning_effort` | Different shapes and values |
| User ID | -- | -- | `user` | Only xAI |

## Distinctive Parameters (One Provider Only)

| Parameter | Provider | Purpose |
|-----------|----------|---------|
| `safe_prompt` | Mistral | Inject safety system message |
| `guardrails` | Mistral | Inline safety filtering |
| `prompt_mode` | Mistral | System prompt intent hint |
| `metadata` | Mistral | Custom metadata passthrough |
| `documents` | Cohere | Inline RAG source documents |
| `citation_options` | Cohere | Control citation generation |
| `safety_mode` | Cohere | Safety level (CONTEXTUAL/STRICT/OFF) |
| `strict_tools` | Cohere | Force exact tool call matching |
| `k` | Cohere | Top-k sampling (0--500) |
| `priority` | Cohere | Request scheduling priority |
| `thinking` | Cohere | Reasoning with token budget |
| `search_parameters` | xAI | Live web/X search configuration |
| `deferred` | xAI | Async completion mode |
| `stream_options` | xAI | Control usage in streaming |
| `top_logprobs` | xAI | Top-N token probabilities |
| `logit_bias` | xAI | Token bias (unsupported) |

## Naming Divergences (Same Concept, Different Names)

| Concept | Mistral | Cohere | xAI |
|---------|---------|--------|-----|
| Seed | `random_seed` | `seed` | `seed` |
| Top-p | `top_p` | `p` | `top_p` |
| Stop | `stop` | `stop_sequences` | `stop` |
| Safety | `safe_prompt` (bool) | `safety_mode` (enum) | -- |
| Reasoning | `reasoning_effort` ("high"/"none") | `thinking` (object) | `reasoning_effort` ("low"/"high") |
| Tool force | `tool_choice: "any"` | `tool_choice: "REQUIRED"` | `tool_choice: "required"` |

## Response Shape Divergences

| Aspect | Mistral | Cohere | xAI |
|--------|---------|--------|-----|
| Top-level structure | `choices[]` array | Single object | `choices[]` array |
| Finish reason location | `choices[n].finish_reason` | Top-level `finish_reason` | `choices[n].finish_reason` |
| Finish reason values | lowercase (`stop`, `length`) | UPPERCASE (`COMPLETE`, `MAX_TOKENS`) | lowercase (`stop`, `length`) |
| Reasoning trace | -- | `message.content[].thinking` | `message.reasoning_content` |
| Citations | -- | `message.citations[]` | `citations[]` (top-level) |
| Usage shape | `prompt_tokens`, `completion_tokens`, `total_tokens` | `billed_units` + `tokens` (separate) | Detailed with `*_details` sub-objects |
| Tool plan narration | -- | `message.tool_plan` | -- |
| Content refusal | -- | -- | `message.refusal` |

## Streaming Divergences

| Aspect | Mistral | Cohere | xAI |
|--------|---------|--------|-----|
| Format | OpenAI-style data chunks | Named SSE event types | OpenAI-style data chunks |
| Event types | Single `data:` format | `message-start`, `content-delta`, `tool-call-start`, `citation-start`, etc. | Single `data:` format |
| Terminator | `data: [DONE]` | `[DONE]` | `data: [DONE]` |
| Usage delivery | In final chunk | In `message-end` event | Requires `stream_options.include_usage` |

## Penalty Range Divergences

| Parameter | Mistral | Cohere | xAI |
|-----------|---------|--------|-----|
| `frequency_penalty` | 0+ (positive only) | 0.0 -- 1.0 | -2.0 -- 2.0 |
| `presence_penalty` | 0+ (positive only) | 0.0 -- 1.0 | -2.0 -- 2.0 |
| `temperature` | 0.0 -- 1.0 (rec. 0.0 -- 0.7) | >= 0.0 | 0 -- 2 |

## Facade Implementation Notes

1. **Parameter name mapping** is required for `random_seed`/`seed`, `top_p`/`p`, `stop`/`stop_sequences`, and `max_tokens`/`max_completion_tokens`.

2. **Enum case mapping** is required for Cohere's uppercase `tool_choice` and `finish_reason` values.

3. **Conditional parameter stripping** is required for xAI reasoning models that reject penalty and stop parameters.

4. **Response normalization** must handle Cohere's single-object response vs. the `choices[]` array pattern used by Mistral and xAI.

5. **Penalty range clamping/validation** is needed since the three providers accept different ranges for the same penalty parameters.

6. **Stream event normalization** is needed to unify Cohere's named event types with the OpenAI-style chunk format used by Mistral and xAI.

7. **Provider-specific features** (`search_parameters`, `documents`, `citation_options`, `safe_prompt`, `deferred`) should be exposed as optional extensions, not forced into the universal interface.

---

> **Sources consulted:**
> - [Mistral API Specs](https://docs.mistral.ai/api)
> - [Mistral Chat Endpoint](https://docs.mistral.ai/api/endpoint/chat)
> - [Mistral Models](https://docs.mistral.ai/getting-started/models)
> - [Mistral SDKs](https://docs.mistral.ai/getting-started/clients)
> - [Cohere v2 Chat Reference](https://docs.cohere.com/reference/chat)
> - [Cohere Models](https://docs.cohere.com/docs/models)
> - [Cohere Errors](https://docs.cohere.com/v2/reference/errors)
> - [Cohere Streaming Guide](https://docs.cohere.com/v2/docs/streaming)
> - [Cohere RAG Citations](https://docs.cohere.com/docs/rag-citations)
> - [xAI API Reference](https://docs.x.ai/docs/api-reference)
> - [xAI Chat Guide](https://docs.x.ai/docs/guides/chat)
> - [xAI Models and Pricing](https://docs.x.ai/developers/models)
> - [xAI Live Search](https://docs.x.ai/docs/guides/live-search)
> - [Promptfoo Mistral Provider](https://www.promptfoo.dev/docs/providers/mistral/)
