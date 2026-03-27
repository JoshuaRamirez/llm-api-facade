# LLM Provider API Surface Analysis

> Reference document for designing a universal LLM facade. Covers 11 providers across cloud and local deployment models.
> Supports architectural principles defined in `Principles.md`, particularly Parameter Normalization (#3) and Token Awareness (#7).

**Last updated:** 2026-03-26
**Scope:** Chat/completion endpoints only. Excludes embeddings, fine-tuning, batch, and audio APIs.

---

## Table of Contents

1. [Provider Inventory](#1-provider-inventory)
2. [Message Format Comparison](#2-message-format-comparison)
3. [Generation Parameters](#3-generation-parameters)
4. [Response Shape](#4-response-shape)
5. [Streaming Mechanisms](#5-streaming-mechanisms)
6. [Token Reporting](#6-token-reporting)
7. [Model Discovery](#7-model-discovery)
8. [Error Patterns](#8-error-patterns)
9. [Commonality Matrix](#9-commonality-matrix)
10. [Parameter Mapping Table](#10-parameter-mapping-table)
11. [Normalization Risk Analysis](#11-normalization-risk-analysis)

---

## 1. Provider Inventory

| Provider | Type | Base URL Pattern | Auth Mechanism | OpenAI-Compatible |
|----------|------|-----------------|----------------|-------------------|
| OpenAI | Cloud | `api.openai.com/v1/` | Bearer token | Yes (canonical) |
| Anthropic | Cloud | `api.anthropic.com/v1/` | `x-api-key` header + `anthropic-version` | No |
| Google Gemini | Cloud | `generativelanguage.googleapis.com/v1beta/` | API key (query param) or OAuth | No |
| Mistral | Cloud | `api.mistral.ai/v1/` | Bearer token | Yes (close clone) |
| Cohere | Cloud | `api.cohere.com/v2/` | Bearer token | No |
| xAI (Grok) | Cloud | `api.x.ai/v1/` | Bearer token | Yes (close clone) |
| Ollama | Local | `localhost:11434/api/` | None (local) | Partial (`/v1/` compat layer) |
| llama.cpp | Local | `localhost:8080/` | None (local) | Yes (`/v1/` compat layer) |
| vLLM | Local | `localhost:8000/v1/` | None or Bearer | Yes (close clone) |
| LM Studio | Local | `localhost:1234/v1/` | None (local) | Yes (close clone) |
| text-generation-webui | Local | `localhost:5000/v1/` | None (local) | Yes (`/v1/` compat layer) |

**Key observation:** 8 of 11 providers expose an OpenAI-compatible `/v1/chat/completions` endpoint. Anthropic, Gemini, and Cohere are the three that require dedicated adapters.

---

## 2. Message Format Comparison

### 2.1 Role Vocabulary

| Role | OpenAI | Anthropic | Gemini | Cohere | Mistral | xAI | Ollama | Local (OAI-compat) |
|------|--------|-----------|--------|--------|---------|-----|--------|---------------------|
| System | `system` role | `system` param (top-level) | `systemInstruction` field or `system` role | `system` role | `system` role | `system` role | `system` role | `system` role |
| User | `user` | `user` | `user` | `user` | `user` | `user` | `user` | `user` |
| Assistant | `assistant` | `assistant` | `model` | `assistant` | `assistant` | `assistant` | `assistant` | `assistant` |
| Tool result | `tool` | `user` (with `tool_result` block) | `user` (with `function_response` part) | `tool` | `tool` | `tool` | N/A or `tool` | `tool` |

**Normalization concerns:**
- Anthropic places system prompt at the top level, not in the messages array.
- Gemini uses `model` instead of `assistant` for the assistant role.
- Gemini uses `systemInstruction` as a separate field (similar to Anthropic's approach).
- Tool results differ significantly in structure (see section 2.3).

### 2.2 Content Types

| Content Type | OpenAI | Anthropic | Gemini | Cohere | Mistral | xAI |
|-------------|--------|-----------|--------|--------|---------|-----|
| Plain text | String or `{type: "text"}` | String or `{type: "text"}` | `{text: "..."}` | String or `{type: "text"}` | String or `{type: "text"}` | String or `{type: "text"}` |
| Image (base64) | `{type: "image_url", image_url: {url: "data:..."}}` | `{type: "image", source: {type: "base64", data: "..."}}` | `{inlineData: {mimeType: "...", data: "..."}}` | `{type: "image_url", image_url: {url: "..."}}` | `{type: "image_url", image_url: {url: "data:..."}}` | `{type: "image_url", image_url: {url: "data:..."}}` |
| Image (URL) | `{type: "image_url", image_url: {url: "https://..."}}` | `{type: "image", source: {type: "url", url: "..."}}` | `{fileData: {fileUri: "...", mimeType: "..."}}` | `{type: "image_url", image_url: {url: "..."}}` | `{type: "image_url", image_url: {url: "..."}}` | `{type: "image_url", image_url: {url: "..."}}` |
| Document/PDF | Not natively supported | `{type: "document", source: {...}}` | `{fileData: {fileUri: "...", mimeType: "application/pdf"}}` | Via `documents` param | Not natively supported | Not supported |
| Tool call | `{type: "function", function: {...}}` | `{type: "tool_use", id: "...", name: "...", input: {...}}` | `{functionCall: {name: "...", args: {...}}}` | `tool_calls` array | `{type: "function", function: {...}}` | `{type: "function", function: {...}}` |
| Tool result | `{role: "tool", tool_call_id: "...", content: "..."}` | `{type: "tool_result", tool_use_id: "...", content: "..."}` | `{functionResponse: {name: "...", response: {...}}}` | `{role: "tool", tool_call_id: "...", content: "..."}` | `{role: "tool", tool_call_id: "...", content: "..."}` | `{role: "tool", tool_call_id: "...", content: "..."}` |

### 2.3 Structural Divergences

| Aspect | OpenAI Pattern | Anthropic Pattern | Gemini Pattern |
|--------|---------------|-------------------|----------------|
| System message | In messages array as `role: "system"` | Top-level `system` param (string or content block array) | Top-level `systemInstruction` field |
| Multi-modal content | Array of typed parts in `content` | Array of typed content blocks in `content` | Array of `Part` objects in `parts` |
| Tool call ID | `tool_call_id` (in tool message) | `tool_use_id` (in tool_result block) | No explicit ID; matched by function name |
| Content field name | `content` | `content` | `parts` |

---

## 3. Generation Parameters

### 3.1 Parameter Mapping Table (Primary)

| Canonical Name | OpenAI | Anthropic | Gemini | Mistral | Cohere | xAI | Ollama |
|---------------|--------|-----------|--------|---------|--------|-----|--------|
| `model` | `model` | `model` | Path param `models/{id}` | `model` | `model` | `model` | `model` |
| `max_output_tokens` | `max_completion_tokens` (or deprecated `max_tokens`) | `max_tokens` (required) | `generationConfig.maxOutputTokens` | `max_tokens` | `max_tokens` | `max_completion_tokens` | `options.num_predict` |
| `temperature` | `temperature` (0-2) | `temperature` (0-1) | `generationConfig.temperature` (0-2) | `temperature` (0-0.7 recommended) | `temperature` (default 0.3) | `temperature` (0-2) | `options.temperature` |
| `top_p` | `top_p` | `top_p` | `generationConfig.topP` | `top_p` | `p` | `top_p` | `options.top_p` |
| `top_k` | Not supported | `top_k` | `generationConfig.topK` | Not supported | `k` | Not supported | `options.top_k` |
| `stop_sequences` | `stop` (string or array) | `stop_sequences` (array) | `generationConfig.stopSequences` (array) | `stop` (string or array) | `stop_sequences` (array, max 5) | `stop` (string or array) | `options.stop` |
| `frequency_penalty` | `frequency_penalty` (-2 to 2) | Not supported | Not supported | `frequency_penalty` (default 0) | `frequency_penalty` (0-1) | `frequency_penalty` (-2 to 2) | `options.frequency_penalty` |
| `presence_penalty` | `presence_penalty` (-2 to 2) | Not supported | Not supported | `presence_penalty` (default 0) | `presence_penalty` (0-1) | `presence_penalty` (-2 to 2) | `options.presence_penalty` |
| `seed` | `seed` | Not supported | Not supported | `random_seed` | `seed` | `seed` | `options.seed` |
| `n` (num completions) | `n` | Not supported | `generationConfig.candidateCount` | `n` | Not supported | `n` | Not supported |
| `stream` | `stream` (bool) | `stream` (bool) | `alt=sse` (query param) | `stream` (bool) | `stream` (bool) | `stream` (bool) | `stream` (bool, default true) |
| `response_format` | `response_format` (json_object, json_schema) | `output_config.format` (json_schema) | `generationConfig.responseMimeType` + `responseSchema` | `response_format` (text, json_object, json_schema) | `response_format` (text, json_object, json_schema) | `response_format` | `format` ("json" or JSON schema) |
| `tools` | `tools` | `tools` | `tools` | `tools` | `tools` | `tools` | `tools` |
| `tool_choice` | `tool_choice` (auto/none/required/specific) | `tool_choice` (auto/any/tool/none) | `toolConfig.functionCallingConfig` | `tool_choice` (auto/none/required/specific) | `tool_choice` (REQUIRED/NONE) | `tool_choice` | Not supported |
| `logprobs` | `logprobs` (bool) + `top_logprobs` | Not supported | Not supported | Not supported | `logprobs` (bool) | `logprobs` (bool) | Not supported |

### 3.2 Temperature Range Differences

| Provider | Range | Default | Notes |
|----------|-------|---------|-------|
| OpenAI | 0.0 - 2.0 | 1.0 | Values above 1.0 increase randomness substantially |
| Anthropic | 0.0 - 1.0 | 1.0 | Narrower range; 1.0 is the maximum |
| Gemini | 0.0 - 2.0 | Model-dependent | Aligns with OpenAI range |
| Mistral | 0.0 - 1.5 | 0.7 | Recommended range 0.0-0.7 |
| Cohere | 0.0 - 1.0 | 0.3 | Lower default than others |
| xAI | 0.0 - 2.0 | 1.0 | Matches OpenAI |
| Ollama | 0.0 - 2.0 | Model-dependent | Passes through to underlying model |

**Facade implication:** The facade must define a canonical range (recommend 0.0-1.0) and linearly map to each provider's native range. Document that values near the extremes may produce different behavior across providers.

### 3.3 Provider-Specific Parameters (No Universal Equivalent)

| Parameter | Provider | Purpose | Facade Treatment |
|-----------|----------|---------|-----------------|
| `thinking` / extended thinking | Anthropic, Cohere | Expose model's chain-of-thought reasoning | Capability-gated; expose via discovery |
| `reasoning_effort` | OpenAI (o-series), xAI | Control reasoning depth | Capability-gated; expose via discovery |
| `safe_prompt` / `safety_mode` | Mistral, Cohere | Inject safety guidelines | Provider-specific adapter config |
| `cache_control` | Anthropic | Prompt caching with TTL | Provider-specific adapter config |
| `cachedContent` | Gemini | Prompt caching | Provider-specific adapter config |
| `documents` / `citation_options` | Cohere | Grounded generation with citations | Capability-gated; expose via discovery |
| `keep_alive` | Ollama | Model memory retention | Local provider config only |
| `service_tier` | Anthropic | Capacity selection | Provider-specific adapter config |
| `parallel_tool_calls` | OpenAI, Mistral | Allow concurrent tool invocations | Capability-gated |

---

## 4. Response Shape

### 4.1 Response Structure Comparison

| Field | OpenAI | Anthropic | Gemini | Cohere | Mistral | xAI |
|-------|--------|-----------|--------|--------|---------|-----|
| **Response ID** | `id` (chatcmpl-...) | `id` (msg_...) | `responseId` | `id` | `id` | `id` |
| **Object type** | `object: "chat.completion"` | `type: "message"` | None (inferred) | None | `object: "chat.completion"` | `object: "chat.completion"` |
| **Model** | `model` | `model` | `modelVersion` | Not in top-level | `model` | `model` |
| **Timestamp** | `created` (unix epoch) | Not included | Not included | Not included | `created` (unix epoch) | `created` (unix epoch) |
| **Content location** | `choices[0].message.content` | `content[0].text` | `candidates[0].content.parts[0].text` | `message.content[0].text` | `choices[0].message.content` | `choices[0].message.content` |
| **Finish reason** | `choices[0].finish_reason` | `stop_reason` | `candidates[0].finishReason` | `finish_reason` | `choices[0].finish_reason` | `choices[0].finish_reason` |
| **Token usage** | `usage` object | `usage` object | `usageMetadata` object | `usage` object | `usage` object | `usage` object |

### 4.2 Finish Reason Vocabulary

| Canonical Meaning | OpenAI | Anthropic | Gemini | Cohere | Mistral | xAI |
|------------------|--------|-----------|--------|--------|---------|-----|
| Natural stop | `stop` | `end_turn` | `STOP` | `COMPLETE` | `stop` | `stop` |
| Token limit hit | `length` | `max_tokens` | `MAX_TOKENS` | `MAX_TOKENS` | `length` | `length` |
| Stop sequence matched | `stop` | `stop_sequence` | `STOP` | `STOP_SEQUENCE` | `stop` | `stop` |
| Tool use requested | `tool_calls` | `tool_use` | `STOP` (with function_call in content) | `TOOL_CALL` | `tool_calls` | `tool_calls` |
| Content filtered | `content_filter` | Not used (error instead) | `SAFETY` | `ERROR` | `content_filter` | Not documented |
| Error during generation | Not used | Not used | `OTHER` | `ERROR` / `TIMEOUT` | Not used | Not used |

**Facade implication:** Anthropic and Cohere distinguish stop-sequence from natural-end; OpenAI conflates them. The facade should preserve the distinction (Principle #6: Fail Explicitly).

### 4.3 Content Wrapping Depth

| Provider | Path to Text Content | Array Level |
|----------|---------------------|-------------|
| OpenAI | `choices[i].message.content` | Single choice, single string (or null + tool_calls) |
| Anthropic | `content[i].text` | No choices array; content is array of typed blocks |
| Gemini | `candidates[i].content.parts[j].text` | Candidates array, parts array |
| Cohere | `message.content[i].text` | Single message, content is array of typed blocks |
| Mistral | `choices[i].message.content` | Same as OpenAI |
| xAI | `choices[i].message.content` | Same as OpenAI |

---

## 5. Streaming Mechanisms

### 5.1 Transport Comparison

| Provider | Protocol | Content-Type | Chunk Format | Termination Signal |
|----------|----------|-------------|--------------|-------------------|
| OpenAI | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |
| Anthropic | SSE | `text/event-stream` | `event: {type}\ndata: {json}\n\n` | `event: message_stop` |
| Gemini | SSE | `text/event-stream` (with `alt=sse`) | `data: {json}\n\n` | End of stream |
| Mistral | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |
| Cohere | SSE | `text/event-stream` | `data: {json}\n\n` | Final event with `finish_reason` |
| xAI | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |
| Ollama | NDJSON | `application/x-ndjson` | `{json}\n` | `{"done": true}` |
| llama.cpp | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |
| vLLM | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |
| LM Studio | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |
| text-gen-webui | SSE | `text/event-stream` | `data: {json}\n\n` | `data: [DONE]\n\n` |

### 5.2 Streaming Event Granularity

| Provider | Event Types | Delta Path |
|----------|------------|------------|
| OpenAI | Single `data` event type | `choices[0].delta.content` |
| Anthropic | `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop` | `delta.text` (in `content_block_delta`) |
| Gemini | Single `data` event type | `candidates[0].content.parts[0].text` |
| Cohere | `message-start`, `content-start`, `content-delta`, `content-end`, `message-end` | `delta.message.content.text` |
| Mistral | Single `data` event type | `choices[0].delta.content` |
| xAI | Single `data` event type | `choices[0].delta.content` |
| Ollama | Single JSON per line | `message.content` |

**Facade implication:** Anthropic's streaming protocol is the most granular, with distinct lifecycle events for each content block. The facade must normalize these into a uniform delta stream. Two approaches: (a) emit only content deltas (simplest), or (b) define a richer lifecycle event model that can accommodate Anthropic's block-level events and OpenAI's simpler model. Recommend (a) for the base contract, (b) as an opt-in capability.

---

## 6. Token Reporting

### 6.1 Token Fields by Provider

| Field | OpenAI | Anthropic | Gemini | Cohere | Mistral | xAI | Ollama |
|-------|--------|-----------|--------|--------|---------|-----|--------|
| Input tokens | `prompt_tokens` | `input_tokens` | `promptTokenCount` | `tokens.input_tokens` | `prompt_tokens` | `prompt_tokens` | `prompt_eval_count` |
| Output tokens | `completion_tokens` | `output_tokens` | `candidatesTokenCount` | `tokens.output_tokens` | `completion_tokens` | `completion_tokens` | `eval_count` |
| Total tokens | `total_tokens` | (computed) | `totalTokenCount` | (computed) | `total_tokens` | `total_tokens` | (computed) |
| Cached input | `cached_tokens` (in detail) | `cache_read_input_tokens` | `cachedContentTokenCount` | `cached_tokens` | Not reported | `cached_tokens` | Not applicable |
| Cache write | Not reported | `cache_creation_input_tokens` | Not reported | Not reported | Not reported | Not reported | Not applicable |
| Reasoning tokens | `completion_tokens_details.reasoning_tokens` | Not separated (in output) | Not reported | Not reported | Not reported | `reasoning_tokens` | Not applicable |

### 6.2 Token Reporting in Streaming

| Provider | When Reported | Location |
|----------|--------------|----------|
| OpenAI | Final chunk (or with `stream_options: {include_usage: true}`) | `usage` in final chunk |
| Anthropic | `message_start` (input) + `message_delta` (output) | Split across events |
| Gemini | Each chunk includes `usageMetadata` | `usageMetadata` in every chunk |
| Cohere | Final `message-end` event | `delta.usage` |
| Mistral | Final chunk | `usage` |
| xAI | Final chunk | `usage` |
| Ollama | Final chunk (`done: true`) | Top-level fields |

**Facade implication:** Token usage must be accumulated during streaming and emitted as a complete summary after the stream closes. The facade should define a `TokenUsage` type with `input_tokens`, `output_tokens`, `total_tokens`, and optional `cached_tokens`. Mark fields as approximate when derived from estimation rather than provider reporting.

---

## 7. Model Discovery

### 7.1 List Models Endpoint

| Provider | Endpoint | Response Shape | Notes |
|----------|----------|---------------|-------|
| OpenAI | `GET /v1/models` | `{data: [{id, object, created, owned_by}]}` | Lists all accessible models |
| Anthropic | None (API) | N/A | Models documented statically; no list endpoint |
| Gemini | `GET /v1beta/models` | `{models: [{name, displayName, description, ...}]}` | Rich metadata including token limits |
| Mistral | `GET /v1/models` | `{data: [{id, object, created, owned_by}]}` | OpenAI-compatible format |
| Cohere | `GET /v1/models` | `{models: [{name, endpoints, ...}]}` | Includes supported endpoint types |
| xAI | `GET /v1/models` | `{data: [{id, object, created, owned_by}]}` | OpenAI-compatible format |
| Ollama | `GET /api/tags` | `{models: [{name, model, modified_at, size, ...}]}` | Includes model size and quantization |
| llama.cpp | `GET /v1/models` | `{data: [{id}]}` | Typically single model |
| vLLM | `GET /v1/models` | `{data: [{id, object, created, owned_by}]}` | OpenAI-compatible |
| LM Studio | `GET /v1/models` | `{data: [{id, object, created, owned_by}]}` | OpenAI-compatible |
| text-gen-webui | `GET /v1/models` | `{data: [{id, object}]}` | OpenAI-compatible |

**Facade implication:** Anthropic lacks a model list endpoint entirely. The facade must support a hybrid approach: dynamic discovery from providers that support it, supplemented by static configuration for providers that do not. Each model entry should include: `id`, `provider`, `context_window`, `capabilities` (vision, tool_use, streaming, structured_output).

---

## 8. Error Patterns

### 8.1 Error Response Formats

| Provider | HTTP Codes | Error Shape | Rate Limit Header |
|----------|-----------|-------------|-------------------|
| OpenAI | 400, 401, 403, 404, 429, 500, 503 | `{error: {message, type, param, code}}` | `x-ratelimit-*`, `retry-after` |
| Anthropic | 400, 401, 403, 404, 408, 429, 500, 529 | `{type: "error", error: {type, message}}` | `retry-after` |
| Gemini | 400, 401, 403, 404, 429, 500, 503 | `{error: {code, message, status, details[]}}` | Standard Google API headers |
| Mistral | 400, 401, 403, 422, 429, 500 | `{message, request_id, object: "error"}` | `retry-after` |
| Cohere | 400, 401, 403, 404, 429, 500 | `{message}` | Rate limit headers |
| xAI | 400, 401, 403, 429, 500 | `{error: {message, type, code}}` | OpenAI-compatible headers |

### 8.2 Error Category Mapping

| Facade Category | HTTP Code(s) | OpenAI `type` | Anthropic `type` | Gemini `status` |
|----------------|-------------|---------------|-----------------|-----------------|
| `invalid_request` | 400, 422 | `invalid_request_error` | `invalid_request_error` | `INVALID_ARGUMENT` |
| `authentication_failed` | 401 | `authentication_error` | `authentication_error` | `UNAUTHENTICATED` |
| `permission_denied` | 403 | `permission_error` | `permission_error` | `PERMISSION_DENIED` |
| `model_not_found` | 404 | `not_found_error` | `not_found_error` | `NOT_FOUND` |
| `rate_limited` | 429 | `rate_limit_error` | `rate_limit_error` | `RESOURCE_EXHAUSTED` |
| `context_exceeded` | 400 | `invalid_request_error` (with context length message) | `invalid_request_error` | `INVALID_ARGUMENT` |
| `content_filtered` | 400 | `invalid_request_error` | `invalid_request_error` | `FAILED_PRECONDITION` (SAFETY) |
| `provider_error` | 500, 503, 529 | `server_error` | `api_error` / `overloaded_error` | `INTERNAL` / `UNAVAILABLE` |

**Facade implication:** Context-exceeded and content-filtered errors are not consistently distinguished from generic invalid-request errors at the HTTP level. The facade adapter must inspect error messages or nested details to classify these correctly (Principle #6).

---

## 9. Commonality Matrix

Frequency key: **U** = Universal (all 11), **W** = Widespread (8-10), **P** = Partial (4-7), **R** = Rare (1-3)

| Concept | Frequency | Cloud Support | Local Support | Notes |
|---------|-----------|--------------|---------------|-------|
| Text chat completion | **U** | All 6 | All 5 | Core operation |
| Role-based messages (user/assistant) | **U** | All 6 | All 5 | Gemini uses `model` for assistant |
| System message/instruction | **U** | All 6 | All 5 | Placement varies (in-array vs. top-level) |
| Temperature | **U** | All 6 | All 5 | Range differs (0-1 vs. 0-2) |
| Max output tokens | **U** | All 6 | All 5 | Name varies significantly |
| Stop sequences | **U** | All 6 | All 5 | String vs. array varies |
| Streaming (SSE) | **W** | All 6 | 4 of 5 | Ollama uses NDJSON natively |
| Top-p (nucleus sampling) | **U** | All 6 | All 5 | Named `p` in Cohere |
| Top-k sampling | **P** | Anthropic, Gemini, Cohere | Most local | Not in OpenAI, Mistral, xAI |
| Tool/function calling | **W** | All 6 | 3 of 5 | Ollama, vLLM support it; varies in local |
| Structured output (JSON mode) | **W** | All 6 | 4 of 5 | Schema enforcement varies |
| Frequency penalty | **P** | OpenAI, Mistral, Cohere, xAI | Some local | Absent in Anthropic, Gemini |
| Presence penalty | **P** | OpenAI, Mistral, Cohere, xAI | Some local | Absent in Anthropic, Gemini |
| Seed (deterministic) | **P** | OpenAI, Mistral, Cohere, xAI | Some local | Absent in Anthropic, Gemini |
| Multiple completions (`n`) | **P** | OpenAI, Gemini, Mistral, xAI | Rarely | Absent in Anthropic, Cohere |
| Logprobs | **R** | OpenAI, Cohere, xAI | vLLM | Not in Anthropic, Gemini, Mistral |
| Token usage reporting | **W** | All 6 | Ollama (timing-based) | Local providers often omit or approximate |
| Model listing endpoint | **W** | 5 of 6 (not Anthropic) | All 5 | Anthropic requires static config |
| Vision/image input | **W** | All 6 | 3 of 5 | Model-dependent even within providers |
| Document/PDF input | **R** | Anthropic, Gemini, Cohere | None | Nascent capability |
| Extended thinking / reasoning | **R** | Anthropic, OpenAI (o-series), Cohere | None | Emerging; APIs not standardized |
| Prompt caching | **R** | Anthropic, Gemini, OpenAI | None | Mechanisms completely different |
| Batch API | **R** | OpenAI, Anthropic, Gemini | None | Not relevant to real-time facade |

---

## 10. Parameter Mapping Table

This table maps every parameter to its canonical facade name and each provider's native name. Empty cells indicate the parameter is not supported.

| Canonical Facade Name | OpenAI | Anthropic | Gemini | Mistral | Cohere | xAI | Ollama |
|----------------------|--------|-----------|--------|---------|--------|-----|--------|
| `model` | `model` | `model` | path: `models/{id}` | `model` | `model` | `model` | `model` |
| `messages` | `messages` | `messages` | `contents` | `messages` | `messages` | `messages` | `messages` |
| `system_prompt` | In `messages` (role: system) | `system` (top-level) | `systemInstruction` | In `messages` (role: system) | In `messages` (role: system) | In `messages` (role: system) | In `messages` (role: system) |
| `max_tokens` | `max_completion_tokens` | `max_tokens` | `generationConfig.maxOutputTokens` | `max_tokens` | `max_tokens` | `max_completion_tokens` | `options.num_predict` |
| `temperature` | `temperature` | `temperature` | `generationConfig.temperature` | `temperature` | `temperature` | `temperature` | `options.temperature` |
| `top_p` | `top_p` | `top_p` | `generationConfig.topP` | `top_p` | `p` | `top_p` | `options.top_p` |
| `top_k` | -- | `top_k` | `generationConfig.topK` | -- | `k` | -- | `options.top_k` |
| `stop_sequences` | `stop` | `stop_sequences` | `generationConfig.stopSequences` | `stop` | `stop_sequences` | `stop` | `options.stop` |
| `frequency_penalty` | `frequency_penalty` | -- | -- | `frequency_penalty` | `frequency_penalty` | `frequency_penalty` | `options.frequency_penalty` |
| `presence_penalty` | `presence_penalty` | -- | -- | `presence_penalty` | `presence_penalty` | `presence_penalty` | `options.presence_penalty` |
| `seed` | `seed` | -- | -- | `random_seed` | `seed` | `seed` | `options.seed` |
| `num_completions` | `n` | -- | `generationConfig.candidateCount` | `n` | -- | `n` | -- |
| `stream` | `stream` | `stream` | `alt=sse` (query) | `stream` | `stream` | `stream` | `stream` |
| `response_format` | `response_format` | `output_config.format` | `generationConfig.responseMimeType` + `responseSchema` | `response_format` | `response_format` | `response_format` | `format` |
| `tools` | `tools` | `tools` | `tools` | `tools` | `tools` | `tools` | `tools` |
| `tool_choice` | `tool_choice` | `tool_choice` | `toolConfig.functionCallingConfig` | `tool_choice` | `tool_choice` | `tool_choice` | -- |
| `logprobs` | `logprobs` | -- | -- | -- | `logprobs` | `logprobs` | -- |

---

## 11. Normalization Risk Analysis

### 11.1 Risk Matrix

| Normalization Area | Difficulty | Risk Level | Rationale |
|-------------------|------------|------------|-----------|
| **Message role mapping** | Low | Low | Well-defined mapping; Gemini's `model` role is the only outlier. |
| **Basic text completion** | Low | Low | Universal support; minimal structural differences. |
| **System prompt placement** | Medium | Low | Two patterns (in-messages vs. top-level) are well understood and mechanically translatable. |
| **Temperature normalization** | Medium | Medium | Range differences (0-1 vs. 0-2) require scaling. Behavioral equivalence across providers at the same normalized value is not guaranteed. |
| **Max tokens semantics** | Low | Low | Name varies but semantics are identical. Anthropic requires it; others default. |
| **Stop sequence format** | Low | Low | String-vs-array difference is trivial to normalize. |
| **Streaming normalization** | High | High | Anthropic's event-driven protocol with content block lifecycle is fundamentally different from OpenAI's simple delta stream. Ollama uses NDJSON instead of SSE. Cohere uses its own event types. |
| **Tool calling normalization** | High | High | Three distinct patterns: OpenAI (function in choices), Anthropic (tool_use content block), Gemini (functionCall part). Tool result routing differs (ID-based vs. name-based). |
| **Token usage normalization** | Medium | Medium | Field names differ but semantics align. Problem: some local providers do not report tokens at all, requiring estimation. Streaming token reporting varies in timing and completeness. |
| **Finish reason mapping** | Medium | Medium | Vocabulary differs. OpenAI conflates natural-stop with stop-sequence. Some providers surface content-filtering as a finish reason; others use errors. |
| **Structured output** | Medium | High | JSON schema support varies: some validate output, some only guide it. Schema specification format differs. Reliability of schema adherence differs. |
| **Multi-modal content** | High | High | Image encoding (data URI vs. base64 object vs. inline data), URL handling, supported formats, and size limits all differ. Document/PDF support is rare and inconsistent. |
| **Error normalization** | Medium | Medium | HTTP codes align reasonably. Error body shapes differ. Context-exceeded and content-filtered errors are inconsistently categorized. |
| **Model discovery** | Medium | Medium | Anthropic has no endpoint. Response shapes vary. Capability metadata (context window, vision support) is inconsistently available. |
| **Prompt caching** | High | High | Completely different mechanisms (Anthropic's block-level TTL, Gemini's pre-cached content, OpenAI's automatic caching). Not normalizable into a single interface without significant abstraction loss. |
| **Extended thinking** | High | High | API shape, budget controls, and output format differ across the few providers that support it. Rapidly evolving. |

### 11.2 Recommended Facade Tiers

Based on the risk analysis, the facade should be layered into capability tiers:

| Tier | Scope | Includes | Risk |
|------|-------|----------|------|
| **Tier 0: Core** | What every provider does identically | Text completion, roles, temperature, max_tokens, top_p, stop_sequences, basic streaming (content deltas only) | Low |
| **Tier 1: Common** | Widely supported, normalizable with known trade-offs | Tool calling, structured output, token reporting, finish reason classification, model listing | Medium |
| **Tier 2: Capability-Gated** | Requires capability discovery | Vision input, frequency/presence penalties, top_k, seed, logprobs, num_completions | Medium |
| **Tier 3: Provider-Specific** | Exposed only through extension points | Prompt caching, extended thinking, document input, safety modes, batch processing | High |

### 11.3 Highest-Risk Normalization Decisions

These are the areas where the facade design will face the hardest trade-offs:

1. **Streaming protocol abstraction.** Anthropic's block-level lifecycle events carry semantic information (e.g., "a new tool_use block is starting") that OpenAI's flat delta stream does not. Flattening Anthropic's model loses information; enriching the facade to match it forces complexity onto consumers using simpler providers.

2. **Tool calling round-trip.** The three-way divergence (OpenAI function pattern, Anthropic content-block pattern, Gemini part-based pattern) means tool call serialization and result routing must be completely rewritten per provider. The facade must own the tool call ID lifecycle since Gemini does not use explicit IDs.

3. **Structured output guarantees.** Some providers (OpenAI with strict mode, Anthropic) guarantee schema conformance; others (Gemini, local providers) only guide toward it. The facade must communicate the strength of the guarantee, not just whether the feature exists.

4. **Token estimation for local providers.** Local inference servers (Ollama, llama.cpp, text-gen-webui) inconsistently report token counts. The facade must decide whether to: (a) omit token data when unavailable, (b) estimate using a tokenizer, or (c) mark data as approximate. Per Principle #7, option (c) is required.

5. **Temperature behavioral equivalence.** Even after range normalization, `temperature=0.5` on Anthropic does not produce the same distribution as `temperature=0.5` on OpenAI. The facade can normalize the numeric range but cannot guarantee behavioral equivalence. This must be documented as a known limitation.

---

## Appendix A: OpenAI-Compatible Providers Quick Reference

These providers can share a single adapter with minor variations:

| Provider | Deviations from OpenAI Spec |
|----------|---------------------------|
| Mistral | `random_seed` instead of `seed`; `safe_prompt` param; narrower temperature range |
| xAI | `max_completion_tokens` (matches newer OpenAI); adds `reasoning_content`, `reasoning_tokens`, `cost_in_usd_ticks`; `deferred` mode |
| Ollama `/v1/` | Subset of parameters; may not support `tool_choice`, `logprobs`, `n`; adds `keep_alive` |
| llama.cpp | Subset of parameters; single model per server instance; limited tool calling |
| vLLM | Adds `best_of`, `use_beam_search`, `guided_*` params for constrained decoding; otherwise close |
| LM Studio | Close to OpenAI; limited tool calling support; single model typically |
| text-gen-webui | Adds many sampler params (`typical_p`, `repetition_penalty`, `mirostat_*`); OpenAI compat is a compatibility layer over its native API |

## Appendix B: Authentication Summary

| Provider | Mechanism | Header/Param |
|----------|-----------|-------------|
| OpenAI | Bearer token | `Authorization: Bearer sk-...` |
| Anthropic | API key + version | `x-api-key: sk-ant-...` + `anthropic-version: 2023-06-01` |
| Gemini | API key or OAuth | `?key=...` or `Authorization: Bearer ...` |
| Mistral | Bearer token | `Authorization: Bearer ...` |
| Cohere | Bearer token | `Authorization: Bearer ...` |
| xAI | Bearer token | `Authorization: Bearer ...` |
| Local providers | None or optional Bearer | Typically no auth required |

## Appendix C: Context Window Reference

| Provider | Model | Context Window | Max Output |
|----------|-------|---------------|------------|
| OpenAI | GPT-4o | 128K | 16K |
| OpenAI | o3 | 200K | 100K |
| Anthropic | Claude Opus/Sonnet 4 | 200K | 128K |
| Gemini | Gemini 2.0 Flash | 1M | 8K |
| Mistral | Mistral Large | 128K | ~32K |
| Cohere | Command R+ | 128K | 4K |
| xAI | Grok-3 | 131K | ~32K |
| Local | Varies | Model-dependent | Model-dependent |

> Context windows and max output values change frequently. These are approximate as of early 2026 and should be treated as configuration, not constants.
