# Tool-Calling Choreography -- llm-api-facade

> How multi-turn tool calling flows through the facade, how the facade
> normalizes structural divergences across providers, and where information
> is lost or synthesized at the seam. This document is the reference that
> adapter implementors use to build correct tool-calling translation.

**Status:** Draft
**Last updated:** 2026-03-26
**Depends on:** `TypeSpecification.md`, `ProviderAnalysis.md`, `Principles.md`
**Audience:** Adapter implementors, facade maintainers, integration testers

---

## 1. The Facade-Level Flow

All examples in this section use facade types exclusively. No provider-specific
format appears. The JSON structures correspond directly to the types defined in
`TypeSpecification.md`: Message, ContentBlock (TextBlock, ToolUseBlock,
ToolResultBlock), CompletionResponse, CompletionChunk, ContentBlockDelta
(TextDelta, ToolUseDelta), FinishReason, and Usage.

---

### 1.1 Single-Turn Tool Call

The minimal tool-calling conversation: one tool invoked and resolved.

**Request 1 -- user asks a question with tools available:**

```json
{
  "model": { "provider": "openai", "model_id": "gpt-4o" },
  "messages": [
    {
      "role": "user",
      "content": [{ "type": "TextBlock", "text": "What's the weather in San Francisco?" }],
      "tool_call_id": null
    }
  ],
  "parameters": {
    "constraints": { "max_tokens": 1024 },
    "structural": {
      "tools": [
        {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "input_schema": {
            "type": "object",
            "properties": {
              "location": { "type": "string" }
            },
            "required": ["location"]
          }
        }
      ],
      "tool_choice": "auto"
    }
  },
  "stream": false
}
```

**Response 1 -- model requests tool execution:**

```json
{
  "completion_id": "cmpl_abc123",
  "model": "gpt-4o",
  "content": [
    { "type": "TextBlock", "text": "Let me check the weather for you." },
    {
      "type": "ToolUseBlock",
      "tool_use_id": "tu_001",
      "name": "get_weather",
      "input": { "location": "San Francisco" }
    }
  ],
  "finish_reason": "tool_use",
  "usage": { "input_tokens": 82, "output_tokens": 34, "is_approximate": false }
}
```

The caller executes the tool and submits the result.

**Request 2 -- tool result appended to conversation:**

```json
{
  "model": { "provider": "openai", "model_id": "gpt-4o" },
  "messages": [
    {
      "role": "user",
      "content": [{ "type": "TextBlock", "text": "What's the weather in San Francisco?" }],
      "tool_call_id": null
    },
    {
      "role": "assistant",
      "content": [
        { "type": "TextBlock", "text": "Let me check the weather for you." },
        {
          "type": "ToolUseBlock",
          "tool_use_id": "tu_001",
          "name": "get_weather",
          "input": { "location": "San Francisco" }
        }
      ],
      "tool_call_id": null
    },
    {
      "role": "tool",
      "content": [{ "type": "TextBlock", "text": "72F, sunny, wind 5mph NW" }],
      "tool_call_id": "tu_001"
    }
  ],
  "parameters": {
    "constraints": { "max_tokens": 1024 },
    "structural": {
      "tools": [
        {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "input_schema": {
            "type": "object",
            "properties": {
              "location": { "type": "string" }
            },
            "required": ["location"]
          }
        }
      ],
      "tool_choice": "auto"
    }
  },
  "stream": false
}
```

**Response 2 -- model synthesizes the answer:**

```json
{
  "completion_id": "cmpl_abc124",
  "model": "gpt-4o",
  "content": [
    { "type": "TextBlock", "text": "It's currently 72F and sunny in San Francisco, with light northwest winds at 5 mph." }
  ],
  "finish_reason": "stop",
  "usage": { "input_tokens": 148, "output_tokens": 28, "is_approximate": false }
}
```

**Key observations:**

- The assistant message in Request 2 is the exact `content` array from Response 1. The caller echoes it back without transformation.
- The tool-role message carries `tool_call_id: "tu_001"`, satisfying invariant MSG-2 (when role=tool, tool_call_id must be non-null).
- The assistant message carries `tool_call_id: null`, satisfying invariant MSG-3 (when role is not tool, tool_call_id must be null).
- The tool result content is `ContentBlock[]`, not a bare string. The bare-string convenience rule applies at API boundaries only.
- Response 1 has `finish_reason: "tool_use"` with at least one ToolUseBlock, satisfying invariant CR-3.

---

### 1.2 Parallel Tool Calls

The model invokes multiple tools simultaneously. All tool results must be
provided before the next turn.

**Response 1 -- model requests two tools at once:**

```json
{
  "completion_id": "cmpl_def456",
  "model": "gpt-4o",
  "content": [
    { "type": "TextBlock", "text": "I'll check both locations." },
    {
      "type": "ToolUseBlock",
      "tool_use_id": "tu_010",
      "name": "get_weather",
      "input": { "location": "San Francisco" }
    },
    {
      "type": "ToolUseBlock",
      "tool_use_id": "tu_011",
      "name": "get_weather",
      "input": { "location": "New York" }
    }
  ],
  "finish_reason": "tool_use",
  "usage": { "input_tokens": 95, "output_tokens": 51, "is_approximate": false }
}
```

**Request 2 -- both tool results provided:**

```json
{
  "messages": [
    { "role": "user", "content": [...], "tool_call_id": null },
    {
      "role": "assistant",
      "content": [
        { "type": "TextBlock", "text": "I'll check both locations." },
        { "type": "ToolUseBlock", "tool_use_id": "tu_010", "name": "get_weather", "input": { "location": "San Francisco" } },
        { "type": "ToolUseBlock", "tool_use_id": "tu_011", "name": "get_weather", "input": { "location": "New York" } }
      ],
      "tool_call_id": null
    },
    {
      "role": "tool",
      "content": [{ "type": "TextBlock", "text": "72F, sunny" }],
      "tool_call_id": "tu_010"
    },
    {
      "role": "tool",
      "content": [{ "type": "TextBlock", "text": "45F, overcast" }],
      "tool_call_id": "tu_011"
    }
  ]
}
```

**Key observations:**

- Each ToolUseBlock has a unique `tool_use_id`. Invariant TU-1 requires non-empty IDs.
- Each tool-role message references exactly one `tool_call_id`, matching a preceding ToolUseBlock's `tool_use_id`. Invariant TR-1 enforces this correspondence.
- Multiple consecutive tool-role messages are the one exception to the role alternation rule (TypeSpecification Section 7.3, ToolExchange grammar).
- The order of tool-role messages does not need to match the order of ToolUseBlocks, but every ToolUseBlock must have a corresponding tool-role response.

---

### 1.3 Multi-Round Chaining

Response 2 is itself another `tool_use`. The caller must execute the tool and
re-submit. This pattern can repeat indefinitely until the model emits
`finish_reason: "stop"` or another terminal reason.

```
Round 1:
  Request  -> user("Compare weather in SF and NYC and book the warmer city")
              + tools=[get_weather, book_hotel]
  Response -> [ToolUseBlock(tu_020, get_weather, {location:"SF"}),
               ToolUseBlock(tu_021, get_weather, {location:"NYC"})]
              finish_reason=tool_use

Round 2:
  Request  -> [...prior messages...,
               tool(tu_020, "72F sunny"),
               tool(tu_021, "45F overcast")]
              + tools=[get_weather, book_hotel]
  Response -> [TextBlock("SF is warmer. Let me book a hotel there."),
               ToolUseBlock(tu_022, book_hotel, {city:"SF", nights:2})]
              finish_reason=tool_use      <-- another tool_use, not stop

Round 3:
  Request  -> [...prior messages...,
               tool(tu_022, "Confirmed: Hotel Zephyr, 2 nights, $340")]
              + tools=[get_weather, book_hotel]
  Response -> [TextBlock("Done. I've booked Hotel Zephyr in San Francisco...")]
              finish_reason=stop          <-- terminal
```

**Key observations:**

- The message sequence grows with each round. The facade is stateless (Principle 5); the caller is responsible for accumulating the full conversation.
- Tools must be re-submitted on every request. The facade does not cache tool definitions across requests.
- The grammar (TypeSpecification Section 7.3) permits: `UserTurn (AssistantTurn ToolExchange* UserTurn)*`. Multi-round chaining produces `UserTurn AssistantTurn ToolExchange AssistantTurn ToolExchange ... AssistantTurn`.
- The `finish_reason` is the sole signal for whether the conversation requires further tool execution. The caller's loop is: if `finish_reason == "tool_use"`, execute tools and re-submit; otherwise, the conversation is complete.

---

### 1.4 Streaming Tool Calls

When `stream: true`, the response arrives as an ordered sequence of
`CompletionChunk` objects, each carrying a `ContentBlockDelta`.

**Stream for a response containing TextBlock then ToolUseBlock:**

```
Chunk 0: { completion_id: "cmpl_str789", chunk_index: 0,
           delta: { type: "TextDelta", text: "Let me " },
           finish_reason: null, usage: null }

Chunk 1: { completion_id: "cmpl_str789", chunk_index: 1,
           delta: { type: "TextDelta", text: "check that." },
           finish_reason: null, usage: null }

Chunk 2: { completion_id: "cmpl_str789", chunk_index: 2,
           delta: { type: "ToolUseDelta",
                    tool_use_id: "tu_030",
                    name: "get_weather",
                    input_json_delta: "{\"loc" },
           finish_reason: null, usage: null }

Chunk 3: { completion_id: "cmpl_str789", chunk_index: 3,
           delta: { type: "ToolUseDelta",
                    tool_use_id: null,
                    name: null,
                    input_json_delta: "ation\":\"SF\"}" },
           finish_reason: null, usage: null }

Chunk 4: { completion_id: "cmpl_str789", chunk_index: 4,
           delta: { type: "TextDelta", text: "" },
           finish_reason: "tool_use",
           usage: { input_tokens: 82, output_tokens: 38, is_approximate: false } }
```

**Accumulation rules for the caller:**

1. **TextDelta:** Concatenate `text` fields in order. The accumulated string becomes a TextBlock.
2. **ToolUseDelta:** The first delta for a given tool call carries `tool_use_id` and `name` (both non-null). Subsequent deltas for the same call have both fields null. Concatenate all `input_json_delta` fragments in order. The result must be a valid JSON object, which becomes the ToolUseBlock's `input`.
3. **Boundary detection:** When `tool_use_id` transitions from null to non-null, a new tool call has started. The prior tool call's accumulated fragments are complete.
4. **Terminal chunk:** Exactly one chunk carries non-null `finish_reason` and `usage`. This chunk may also carry a delta (commonly an empty TextDelta, but the spec does not require it to be empty).
5. **Invariant preservation:** After accumulation, the caller must be able to reconstruct the same `ContentBlock[]` array that a non-streaming response would have produced.

---

### 1.5 Streaming Parallel Tool Calls

When the model streams multiple tool calls, ToolUseDelta chunks interleave.
The caller tracks each tool call by its initial `tool_use_id` announcement.

```
Chunk 0: TextDelta("I'll check both.")
Chunk 1: ToolUseDelta(tool_use_id="tu_040", name="get_weather", input_json_delta="{\"location\":")
Chunk 2: ToolUseDelta(tool_use_id=null,     name=null,          input_json_delta="\"SF\"}")
Chunk 3: ToolUseDelta(tool_use_id="tu_041", name="get_weather", input_json_delta="{\"location\":")
Chunk 4: ToolUseDelta(tool_use_id=null,     name=null,          input_json_delta="\"NYC\"}")
Chunk 5: TextDelta(""), finish_reason="tool_use", usage={...}
```

The appearance of `tool_use_id="tu_041"` on Chunk 3 signals that `tu_040` is
complete and a new tool call has begun. The caller splits accumulation at this
boundary.

---

## 2. Provider Divergence Map

This section documents the structural differences that adapters must reconcile.
Each subsection covers one aspect of the tool-calling protocol where providers
diverge.

---

### 2.1 Where Tool Calls Live in the Response

| Provider | Location in Native Response | Adapter Translation to Facade |
|----------|---------------------------|-------------------------------|
| **OpenAI** | `choices[0].message.tool_calls[]` -- a separate field from `content` | Extract each `tool_calls[]` entry, construct a ToolUseBlock from `id`, `function.name`, and `function.arguments` (parsed from JSON string). Merge these ToolUseBlocks with any TextBlock produced from `content` into a single `ContentBlock[]` array. Text comes first, tool calls follow. |
| **Anthropic** | `content[]` as blocks with `type: "tool_use"`, inline alongside `type: "text"` blocks | Direct structural fit. Map each `tool_use` block to ToolUseBlock, each `text` block to TextBlock. Preserve the ordering from the response. |
| **Gemini** | `candidates[0].content.parts[]` as `functionCall` Part objects, inline alongside `text` parts | Extract each `functionCall` part and construct a ToolUseBlock from `name` and `args`. Map `text` parts to TextBlock. Preserve ordering. |
| **Ollama native** | `message.tool_calls[]` (separate field, like OpenAI) | Same strategy as OpenAI: extract, construct ToolUseBlock, merge with content text. |
| **Ollama OAI-compat** | `choices[0].message.tool_calls[]` | Same as OpenAI. |
| **llama.cpp** | `choices[0].message.tool_calls[]` (OAI-compat) | Same as OpenAI. Verify `tool_calls` field exists; some model configurations may omit it. |
| **vLLM** | `choices[0].message.tool_calls[]` | Same as OpenAI. |
| **LM Studio** | `choices[0].message.tool_calls[]` | Same as OpenAI. |

**Structural summary:** OpenAI and its compatibility layer place tool calls in a
separate `tool_calls` field, requiring the adapter to merge two sources
(content text + tool_calls) into the facade's single `ContentBlock[]` array.
Anthropic and Gemini inline them alongside text, making the mapping more
natural.

---

### 2.2 Where Tool Results Go in Requests

| Provider | Native Mechanism | Adapter Translation from Facade |
|----------|-----------------|-------------------------------|
| **OpenAI** | A separate message with `role: "tool"` and `tool_call_id` field at the message level. `content` is a string. | Facade tool-role messages map directly. Extract `tool_call_id` from the facade message. Serialize `content` ContentBlock[] as a string (typically the text of the first TextBlock). |
| **Anthropic** | A `user`-role message containing one or more `tool_result` content blocks. Each block has `tool_use_id` and `content`. | Convert each facade tool-role message into a `tool_result` block: map `tool_call_id` to `tool_use_id`, serialize content. Multiple consecutive facade tool-role messages must be merged into a single Anthropic user message containing multiple `tool_result` blocks. |
| **Gemini** | A `user`-role content containing `functionResponse` parts. Each part has `name` and `response`. | Convert each facade tool-role message into a `functionResponse` part. The adapter must look up the tool name from the preceding ToolUseBlock (Gemini uses name, not ID, for correlation). Multiple tool results become multiple `functionResponse` parts in a single user content. |
| **Ollama native** | `role: "tool"` message. `content` is a string. | Similar to OpenAI. `tool_call_id` may not be required by the runtime. |
| **OAI-compat runtimes** | `role: "tool"` message with `tool_call_id`. | Same as OpenAI. |

**Critical adapter concern (Anthropic/Gemini):** The facade's `tool` role
*disappears* during translation. The adapter must detect consecutive
tool-role messages in the facade message sequence and compress them into a
single provider-native user message. This is a lossy transformation: the
facade's explicit role distinction is not preserved in the wire format.

---

### 2.3 Tool Call ID Linkage

| Provider | ID Format | ID Field in Response | ID Field in Result | Adapter Concern |
|----------|-----------|---------------------|-------------------|-----------------|
| **OpenAI** | `call_xxx...` (opaque string) | `tool_calls[].id` | `tool_call_id` on tool message | Direct passthrough. Use provider ID as facade `tool_use_id`. |
| **Anthropic** | `toolu_xxx...` (opaque string) | `content[].id` on `tool_use` blocks | `tool_use_id` on `tool_result` blocks | Direct passthrough. Natural fit with facade `tool_use_id`. |
| **Gemini** | None on older models; `fc_xxx` on newer models | `functionCall.id` (when present) | `functionResponse.id` (when present) | When the provider omits the ID, the adapter must generate a synthetic ID (e.g., `synth_<uuid>`) and track the mapping by function name + position. |
| **Ollama native** | Absent | Not present in most responses | Not required by runtime | Adapter must always generate synthetic IDs. Track by tool name + call index. |
| **llama.cpp** | Inconsistent | `tool_calls[].id` (may be absent or empty) | `tool_call_id` (may be ignored) | Adapter must validate presence. Generate synthetic ID when absent. |
| **vLLM** | Present in non-streaming; absent in streaming | `tool_calls[].id` | `tool_call_id` | In streaming mode, adapter must generate synthetic IDs and track by `index` field. |
| **LM Studio** | Usually present | `tool_calls[].id` | `tool_call_id` | Validate presence; generate synthetic if absent. |

**Synthetic ID generation rule:** When the backend does not provide an ID, the
adapter generates one in the format `synth_{provider}_{sequential_counter}`
(e.g., `synth_ollama_0`, `synth_ollama_1`). The adapter must maintain a
mapping from synthetic IDs to position indices for the duration of the
single request-response cycle. This mapping is not persisted (Principle 5:
Stateless by Default).

**Invariant enforcement:** The facade's invariant TU-1 (`tool_use_id` must
be non-empty) holds regardless of whether the backend provided an ID. The
adapter is the enforcement point.

---

### 2.4 finish_reason for Tool Calls

| Provider | Native Value When Tools Are Requested | Adapter Translation |
|----------|--------------------------------------|-------------------|
| **OpenAI** | `tool_calls` | Map to facade `tool_use`. |
| **Anthropic** | `tool_use` | Direct mapping. No transformation needed. |
| **Gemini** | `STOP` (even when functionCall parts are present) | Adapter must inspect `candidates[0].content.parts[]` for `functionCall` entries. If any are present, override the finish reason to facade `tool_use`. This is a content-based detection, not a finish-reason-based detection. |
| **Ollama native** | `stop` | Same as Gemini: adapter must inspect `message.tool_calls` for presence. If non-empty, override to facade `tool_use`. |
| **llama.cpp** | `tool` | Map to facade `tool_use`. |
| **vLLM** | `tool_calls` | Map to facade `tool_use`. |
| **LM Studio** | `tool_calls` | Map to facade `tool_use`. |

**Gemini and Ollama require content inspection.** The finish reason alone is
insufficient. Adapters for these providers must always check the response
content for tool call structures before reporting the finish reason. Failing to
do this means the caller never learns that tools were invoked.

**Invariant enforcement:** The facade's invariant FR-2 states that `tool_use`
is valid only when tools were in the request. The adapter must verify that
`tools` were present in the NormalizedRequest before emitting `finish_reason:
"tool_use"`. If the backend reports tool calls but no tools were in the
request, this is an error condition (`provider_error`).

---

### 2.5 tool_choice Vocabulary Mapping

| Facade Value | OpenAI | Anthropic | Gemini | Ollama | vLLM | llama.cpp | LM Studio |
|-------------|--------|-----------|--------|--------|------|-----------|-----------|
| `"auto"` | `"auto"` | `{"type": "auto"}` | `"AUTO"` | N/A (implicit) | `"auto"` | `"auto"` | `"auto"` |
| `"required"` | `"required"` | `{"type": "any"}` | `"ANY"` | N/A | `"required"` | `"required"` | `"required"` |
| `"none"` | `"none"` | `{"type": "none"}` | `"NONE"` | N/A | `"none"` | `"none"` | `"none"` |
| `{ name: "X" }` | `{"type": "function", "function": {"name": "X"}}` | `{"type": "tool", "name": "X"}` | `{"mode": "ANY", "allowedFunctionNames": ["X"]}` | N/A | `{"type": "function", "function": {"name": "X"}}` | N/A | `{"type": "function", "function": {"name": "X"}}` |

**Notes:**

- Anthropic uses `"any"` where OpenAI uses `"required"`. Both mean "the model
  must invoke at least one tool." The facade canonicalizes this as `"required"`.
- Ollama's native API does not support `tool_choice`; tools are implicitly
  `auto` when present. Ollama's OAI-compat layer supports the OpenAI
  vocabulary.
- llama.cpp supports string-level `tool_choice` but not named tool forcing
  on most builds.
- Gemini's named tool forcing uses an `allowedFunctionNames` array, which
  also supports forcing a subset of tools (a capability the facade's
  `{ name: string }` form does not expose).

---

### 2.6 Tool Arguments: Object vs. String

| Provider | Format of Tool Arguments in Response | Adapter Action |
|----------|-------------------------------------|----------------|
| **OpenAI** | JSON string: `"arguments": "{\"location\":\"SF\"}"` | Parse the string into an object. Assign to `ToolUseBlock.input`. Handle malformed JSON: if parsing fails, surface as `provider_error`. |
| **Anthropic** | Object: `"input": {"location": "SF"}` | Pass through directly to `ToolUseBlock.input`. |
| **Gemini** | Object: `"args": {"location": "SF"}` | Pass through directly to `ToolUseBlock.input`. |
| **Ollama native** | Object: `"arguments": {"location": "SF"}` | Pass through directly. |
| **Ollama OAI-compat** | JSON string (like OpenAI) | Parse string to object. |
| **llama.cpp** | JSON string (often requires post-processing) | Parse string to object. May need to strip leading/trailing whitespace or fix common formatting issues from local models. |
| **vLLM** | JSON string (like OpenAI) | Parse string to object. |
| **LM Studio** | JSON string (like OpenAI) | Parse string to object. |

**The facade's `ToolUseBlock.input` is always an object.** Adapters that
receive string-encoded arguments must parse them before constructing the
ToolUseBlock. This is not optional -- the TypeSpecification defines `input`
as `object`, not `string | object`.

**Malformed arguments from local runtimes:** Local models sometimes produce
invalid JSON in tool arguments (unquoted keys, trailing commas, truncated
output). The adapter should attempt best-effort repair (e.g., relaxed JSON
parsing) but must surface a `provider_error` if the arguments cannot be
parsed into a valid object. The adapter must not silently substitute empty
`{}` or guess at the intended structure.

---

### 2.7 Streaming Tool Call Accumulation

Each provider streams tool calls differently. The adapter must translate the
provider's streaming format into the facade's `ToolUseDelta` model.

#### OpenAI Streaming

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"lo"}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"cation"}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\":\"SF\"}"}}]}}]}
```

**Adapter translation:**

- First chunk with `id` and `name` present: emit `ToolUseDelta(tool_use_id="call_abc", name="get_weather", input_json_delta="")`.
- Subsequent chunks: emit `ToolUseDelta(tool_use_id=null, name=null, input_json_delta=<fragment>)`.
- The `index` field in OpenAI's format tracks which tool call is being streamed when parallel calls interleave. The adapter uses `index` to route fragments to the correct ToolUseDelta sequence.
- For parallel tool calls, the adapter must track multiple `index` values simultaneously and emit separate ToolUseDelta sequences, each starting with a non-null `tool_use_id`.

#### Anthropic Streaming

```
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_xyz","name":"get_weather","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"location\":"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"SF\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}
```

**Adapter translation:**

- `content_block_start` with `type: "tool_use"`: emit `ToolUseDelta(tool_use_id="toolu_xyz", name="get_weather", input_json_delta="")`.
- `content_block_delta` with `input_json_delta`: emit `ToolUseDelta(tool_use_id=null, name=null, input_json_delta=<fragment>)`.
- `content_block_stop`: no facade emission needed (the facade does not model block lifecycle boundaries).
- Anthropic's `index` field serves the same purpose as OpenAI's: it distinguishes parallel content blocks in the stream.

#### Gemini Streaming

```
data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"location":"SF"}}}]}}]}
```

**Adapter translation:**

- Gemini delivers `functionCall` parts as complete objects in a single SSE frame. There is no partial accumulation.
- The adapter emits a single `ToolUseDelta(tool_use_id=<synthetic_or_native>, name="get_weather", input_json_delta="{\"location\":\"SF\"}")`.
- Because the entire argument object arrives at once, `input_json_delta` contains the full JSON string. The caller's concatenation logic still works correctly (concatenating one complete fragment yields the complete JSON).

#### Local Runtimes (OAI-Compat) Streaming

- Follow the OpenAI streaming pattern via their `/v1/chat/completions` compatibility endpoints.
- **vLLM:** Streams `tool_calls` like OpenAI, but the `id` field may be absent on streaming chunks. The adapter generates synthetic IDs on the first chunk for each `index`.
- **llama.cpp:** Streaming tool call support varies by build and model. Some builds emit tool calls only in the final chunk (no incremental streaming). The adapter must handle both incremental and single-shot delivery.
- **LM Studio:** Generally reliable OpenAI-compatible streaming. Treat as OpenAI.
- **Ollama native (NDJSON):** Tool calls appear in the final `done: true` message as complete objects, not streamed incrementally. The adapter emits one ToolUseDelta per tool call with the complete `input_json_delta`.

---

## 3. The Role Translation Problem

The facade uses a 4-role model: `{system, user, assistant, tool}`. Providers
use between 2 and 4 roles, with different structural conventions for system
instructions and tool results. This section shows the exact mapping for each
provider.

---

### 3.1 OpenAI: Direct Mapping

The closest structural match. All four facade roles have direct OpenAI
equivalents.

| Facade Role | OpenAI Role | Structural Notes |
|-------------|-------------|-----------------|
| `system` | `system` (or `developer` for reasoning models) | The adapter must check if the target model is a reasoning model (o-series) and use `developer` instead of `system` when appropriate. |
| `user` | `user` | Direct mapping. |
| `assistant` | `assistant` | Direct mapping for content. However, if the facade assistant message contains ToolUseBlocks, the adapter must extract them into a separate `tool_calls` field on the OpenAI message, since OpenAI places tool calls outside `content`. |
| `tool` | `tool` | Direct mapping. `tool_call_id` maps to OpenAI's `tool_call_id`. Content is serialized as a string (OpenAI tool messages accept string content, not typed blocks). |

**Outbound (facade to OpenAI) assistant message reconstruction:**

```
Facade:
  role: "assistant"
  content: [TextBlock("Let me check"), ToolUseBlock(tu_001, get_weather, {location:"SF"})]

OpenAI:
  role: "assistant"
  content: "Let me check"
  tool_calls: [{ id: "tu_001", type: "function",
                 function: { name: "get_weather", arguments: "{\"location\":\"SF\"}" } }]
```

The adapter splits the facade's unified `ContentBlock[]` into two separate
fields: `content` (text only) and `tool_calls` (tool invocations only). The
ToolUseBlock's `input` object is serialized back to a JSON string for the
`arguments` field.

---

### 3.2 Anthropic: Role Compression

Anthropic uses three roles (`user`, `assistant`, system as a top-level
parameter), and the `tool` role does not exist. Tool results are embedded
inside user messages.

| Facade Role | Anthropic Equivalent | Structural Notes |
|-------------|---------------------|-----------------|
| `system` | `system` parameter (top-level, outside `messages` array) | The adapter must extract the system message from the facade messages array and place it as the `system` parameter on the Anthropic request body. It is not a message. |
| `user` | `user` role | Direct mapping. Content blocks map naturally (both use typed block arrays). |
| `assistant` | `assistant` role | Direct mapping. ToolUseBlocks map to Anthropic's `tool_use` blocks inline in the content array. This is the most natural fit of any provider. |
| `tool` | **Merged into `user` role** as `tool_result` content blocks | Each facade tool-role message becomes a `tool_result` block: `{type: "tool_result", tool_use_id: <tool_call_id>, content: <serialized_content>}`. Multiple consecutive facade tool messages become multiple `tool_result` blocks inside a single Anthropic user message. |

**Outbound (facade to Anthropic) tool result merging:**

```
Facade messages (after assistant with parallel tool calls):
  [
    { role: "tool", content: [TextBlock("72F")], tool_call_id: "toolu_abc" },
    { role: "tool", content: [TextBlock("45F")], tool_call_id: "toolu_def" }
  ]

Anthropic message (single user message):
  {
    "role": "user",
    "content": [
      { "type": "tool_result", "tool_use_id": "toolu_abc", "content": "72F" },
      { "type": "tool_result", "tool_use_id": "toolu_def", "content": "45F" }
    ]
  }
```

**If a facade user message follows the tool messages,** the adapter must merge
the tool_result blocks and the user content blocks into a single Anthropic
user message. Anthropic does not permit two consecutive user messages.

---

### 3.3 Gemini: Role Renaming + Compression

Gemini uses `user`, `model` (not `assistant`), and `systemInstruction` (not
`system`). Tool results are embedded in user content as `functionResponse`
parts.

| Facade Role | Gemini Equivalent | Structural Notes |
|-------------|------------------|-----------------|
| `system` | `systemInstruction` field (top-level, outside `contents` array) | Extracted from facade messages, placed as top-level field. Similar to Anthropic's treatment. |
| `user` | `user` role | Direct mapping. Content goes into `parts[]` instead of `content[]`. |
| `assistant` | `model` role | Role renamed. ToolUseBlocks become `functionCall` parts: `{functionCall: {name: <name>, args: <input>}}`. |
| `tool` | **Merged into `user` role** as `functionResponse` parts | Each facade tool-role message becomes a `functionResponse` part: `{functionResponse: {name: <tool_name>, response: <content_as_object>}}`. The adapter must look up the tool name from the corresponding ToolUseBlock (Gemini correlates by name, not by ID on older models). |

**Outbound (facade to Gemini) tool result translation:**

```
Facade:
  { role: "tool", content: [TextBlock("72F, sunny")], tool_call_id: "tu_001" }

Gemini:
  { role: "user",
    parts: [
      { functionResponse: {
          name: "get_weather",
          response: { result: "72F, sunny" }
        }
      }
    ]
  }
```

**Gemini's `functionResponse.response` must be an object, not a string.** The
adapter wraps string content in `{result: <string>}` or an equivalent
structure. The facade's `ContentBlock[]` must be serialized into this object
form.

---

### 3.4 Local Runtimes: OpenAI-Like with Gaps

Local runtimes that expose an OpenAI-compatible `/v1/chat/completions`
endpoint follow the OpenAI role mapping (Section 3.1) with these caveats:

| Runtime | `tool_call_id` Required? | System Role Support | Notes |
|---------|-------------------------|--------------------|----|
| **Ollama OAI-compat** | Accepted but often ignored | Yes | Some models may not reliably produce or consume tool_call_ids. |
| **Ollama native** | Not a concept | Yes | Tool results are matched by position, not ID. |
| **llama.cpp** | Accepted | Yes | Behavior depends on the loaded model's training. |
| **vLLM** | Required in non-streaming, may be absent in streaming | Yes | The adapter must handle the streaming gap. |
| **LM Studio** | Accepted | Yes | Generally reliable for OpenAI-pattern tool calling. |

---

## 4. Thinking Block Interaction with Tool Calling

Extended thinking (chain-of-thought reasoning visible to the caller) interacts
with tool calling in provider-specific ways. The facade's `ThinkingBlock`
passthrough mechanism must preserve thinking content across multi-turn tool
exchanges.

---

### 4.1 Anthropic: Thinking Blocks Inline with Tool Use

Anthropic places `thinking` blocks in the `content` array alongside `tool_use`
blocks. A response may contain:

```json
[
  { "type": "thinking", "thinking": "The user wants weather data. I should call get_weather...", "signature": "sig_abc..." },
  { "type": "text", "text": "Let me check." },
  { "type": "tool_use", "id": "toolu_123", "name": "get_weather", "input": {"location": "SF"} }
]
```

The facade maps this to:

```json
[
  { "type": "ThinkingBlock", "thinking": "The user wants weather data...", "signature": "sig_abc..." },
  { "type": "TextBlock", "text": "Let me check." },
  { "type": "ToolUseBlock", "tool_use_id": "toolu_123", "name": "get_weather", "input": {"location": "SF"} }
]
```

**Multi-turn preservation:** When the caller sends this assistant message
back in Request 2, the ThinkingBlock must be preserved exactly as received.
Anthropic requires thinking blocks from prior turns to be present with valid
signatures. The facade enforces invariant THK-2: the thinking content and
signature are opaque passthrough. The adapter re-serializes them without
modification.

---

### 4.2 Gemini: Thought Signatures on Parts

Gemini attaches `thoughtSignature` as a field on Part objects. A `functionCall`
part may carry a thought signature from the model's reasoning:

```json
{
  "functionCall": { "name": "get_weather", "args": {"location": "SF"} },
  "thoughtSignature": "base64_encoded_signature..."
}
```

The adapter maps the reasoning trace to a ThinkingBlock and the function call
to a ToolUseBlock. The `thoughtSignature` on the Part is preserved in the
ThinkingBlock's `signature` field.

**Multi-turn preservation:** Like Anthropic, Gemini requires thought
signatures to be passed back on subsequent turns. The facade's ThinkingBlock
passthrough serves this purpose.

---

### 4.3 OpenAI: Invisible Reasoning

OpenAI's reasoning models (o-series) consume "reasoning tokens" internally.
These tokens are not exposed in the response content. There are no thinking
blocks to map or preserve.

**Consequence for the facade:** No ThinkingBlock is produced for OpenAI
responses. The reasoning cost is visible only in the `usage` field, where
`output_tokens` includes both visible output tokens and invisible reasoning
tokens. The facade cannot distinguish between the two using facade types
alone.

---

### 4.4 Multi-Turn Tool Calling with Thinking: Complete Example

```
Request 1:
  messages=[user("Compare weather and book the warmer")]
  tools=[get_weather, book_hotel]
  reasoning_effort="high"

Response 1:
  content=[
    ThinkingBlock(thinking="I need to check two cities...", signature="sig_1"),
    TextBlock("Checking both cities."),
    ToolUseBlock(tu_050, get_weather, {location:"SF"}),
    ToolUseBlock(tu_051, get_weather, {location:"NYC"})
  ]
  finish_reason=tool_use

Request 2:
  messages=[
    user("Compare weather and book the warmer"),
    assistant([ThinkingBlock(sig_1), TextBlock, ToolUseBlock(tu_050), ToolUseBlock(tu_051)]),
    tool(tu_050, "72F"),
    tool(tu_051, "45F")
  ]
  ^^^ ThinkingBlock preserved exactly, including signature

Response 2:
  content=[
    ThinkingBlock(thinking="SF is warmer at 72F vs 45F...", signature="sig_2"),
    TextBlock("SF is warmer. Booking now."),
    ToolUseBlock(tu_052, book_hotel, {city:"SF", nights:2})
  ]
  finish_reason=tool_use

Request 3:
  messages=[
    ...all prior messages...,
    assistant([ThinkingBlock(sig_2), TextBlock, ToolUseBlock(tu_052)]),
    tool(tu_052, "Confirmed: Hotel Zephyr")
  ]
  ^^^ Both ThinkingBlocks (sig_1 in turn 1, sig_2 in turn 3) preserved

Response 3:
  content=[
    ThinkingBlock(thinking="Booking confirmed...", signature="sig_3"),
    TextBlock("Done. Hotel Zephyr booked in SF for 2 nights.")
  ]
  finish_reason=stop
```

---

## 5. Invariants the Facade Enforces

These invariants from `TypeSpecification.md` specifically govern tool-calling
correctness. They are validated during the Created-to-Validated state
transition (TypeSpecification Section 7.2) for requests, and enforced by the
adapter during response translation.

---

### 5.1 Request-Side Invariants

| ID | Invariant | Enforcement Point | Consequence of Violation |
|----|-----------|-------------------|------------------------|
| **MSG-2** | When `role` is `tool`, `tool_call_id` must be non-null and non-empty. | Request validation (Created -> Validated) | `validation_error`: "Tool-role message missing tool_call_id" |
| **MSG-3** | When `role` is not `tool`, `tool_call_id` must be null. | Request validation | `validation_error`: "Non-tool message carries tool_call_id" |
| **TR-1** | `tool_call_id` on a tool-role message must correspond to a `tool_use_id` from a ToolUseBlock in a preceding assistant message. | Request validation | `validation_error`: "tool_call_id does not match any preceding ToolUseBlock" |
| **NR-5** | All tool-role messages must have `tool_call_id` values that reference `tool_use_id` values from ToolUseBlocks in preceding assistant messages within the same sequence. | Request validation | `validation_error`: "Orphaned tool result" |
| **GP-1** | `tools` may only be present when `supports_tool_calling` is true for the target model. | Request validation (after model resolution) | `validation_error`: "Model does not support tool calling" |
| **GP-2** | When `tools` is present, it must contain at least one element. | Request validation | `validation_error`: "Empty tools array" |
| **GP-3** | `tool_choice` may only be present when `tools` is present. | Request validation | `validation_error`: "tool_choice without tools" |
| **TC-1** | When `tool_choice` is `{ name: string }`, the named tool must exist in the request's `tools` array. | Request validation | `validation_error`: "Forced tool not found in tools array" |
| **SEQ** | Message sequence must conform to the grammar: `SystemPrefix? ConversationBody` where `ToolExchange ::= Message[role=assistant, content contains ToolUseBlock] Message[role=tool]+`. | Request validation | `validation_error`: "Invalid message sequence" |

---

### 5.2 Response-Side Invariants

| ID | Invariant | Enforcement Point | Consequence of Violation |
|----|-----------|-------------------|------------------------|
| **CR-3** | When `finish_reason` is `tool_use`, `content` must contain at least one ToolUseBlock. | Adapter response translation | Adapter must not emit `finish_reason: "tool_use"` without ToolUseBlocks. If the provider signals tool use but the content is empty, this is a `provider_error`. |
| **FR-2** | `tool_use` finish reason is valid only when the request included tool definitions and `supports_tool_calling` is true. | Adapter response translation | If the provider returns tool calls when tools were not requested, this is a `provider_error`. |
| **TU-1** | `tool_use_id` must be non-empty on every ToolUseBlock. | Adapter response translation | Adapter generates synthetic IDs when the provider omits them. |
| **TU-2** | `name` must be non-empty and must match a tool name from the request's tool definitions. | Adapter response translation | If the model hallucinates a tool name not in the definitions, this is surfaced as a `provider_error`. The facade does not silently accept unknown tool names. |
| **TU-3** | `input` must be a valid object. | Adapter response translation | Adapter parses string arguments into objects; parse failure is a `provider_error`. |

---

### 5.3 Streaming-Side Invariants

| ID | Invariant | Enforcement Point |
|----|-----------|-------------------|
| **SD-1** | `tool_use_id` and `name` are present together on the first ToolUseDelta of a tool call and null together on subsequent deltas. | Adapter streaming translation |
| **SD-2** | When all `input_json_delta` fragments for a single tool call are concatenated in order, the result must be a valid JSON object. | Caller-side accumulation (the facade cannot validate this until the stream completes) |
| **CC-1** | `chunk_index` values form a contiguous, monotonically increasing sequence starting at 0. | Adapter streaming translation |
| **CC-5** | Exactly one chunk carries non-null `finish_reason`. This is the terminal chunk. | Adapter streaming translation |

---

## 6. What Is Lost at the Seam

Tool-calling features that exist in provider-specific APIs but have no
representation in the facade's type system. Adapter implementors should be
aware of these losses; callers who need these features must use
`provider_extensions`.

| Information Lost | Source Provider(s) | Why It Is Lost |
|-----------------|-------------------|----------------|
| **Provider-native ID format** | All | The facade may assign synthetic IDs (Section 2.3). Callers cannot assume ID format or infer the provider from the ID. |
| **Parallel tool call control** | OpenAI (`parallel_tool_calls: bool`) | Provider-specific parameter with no facade equivalent. OpenAI allows the caller to disable parallel tool invocation; the facade has no such parameter. Passable via `provider_extensions`. |
| **Tool schema enforcement strength** | OpenAI (`strict: true`), vLLM (guided decoding) | OpenAI's strict mode guarantees JSON schema conformance; others provide best-effort. The facade's `ToolDefinition.input_schema` does not carry an enforcement-strength indicator. |
| **Cache control on tool definitions** | Anthropic (`cache_control` on tool blocks) | Anthropic allows callers to mark tool definitions for prompt caching with TTL hints. This is an optimization directive, not a structural feature. No facade representation. |
| **Built-in tools** | Gemini (`google_search`, `code_execution`), Anthropic (`computer_use`, `web_search`, `code_execution`) | Vendor-provided server-side tools that the model can invoke without caller participation. These are below-seam capabilities with no facade ToolDefinition equivalent. They are invoked through `provider_extensions`. |
| **Argument streaming granularity** | Anthropic (`input_json_delta` with fine-grained increments), Gemini (`partialArgs`) | Normalized to `ToolUseDelta.input_json_delta` at the facade level. The granularity of increments may differ from the provider's native chunking, but the accumulated result is identical. |
| **Tool result `is_error` flag** | Anthropic (`is_error: true` on `tool_result`) | Anthropic allows tool results to be explicitly marked as errors, which influences the model's behavior (it may retry or adjust). The facade's tool-role message has no error flag; the caller must encode error status in the content text. |
| **Tool result content types** | Anthropic (images in tool results), Gemini (structured objects in functionResponse) | The facade's tool-role message content is `ContentBlock[]`, which supports TextBlock and ImageBlock. However, Gemini requires tool results to be objects (`functionResponse.response`), which the adapter must synthesize from the facade's block-based content. |
| **Function declaration metadata** | Gemini (`description` on individual parameters within the schema) | The facade's `ToolDefinition.input_schema` is an opaque JSON Schema object. Parameter-level descriptions are preserved within the schema, but Gemini-specific metadata fields outside the schema are lost. |
| **Tool call grouping / ordering hints** | OpenAI (tool_calls array ordering), Anthropic (content block ordering) | The facade preserves ordering of ToolUseBlocks in the `ContentBlock[]` array, but does not expose metadata about whether the model considers the calls to be ordered or unordered. |

---

## 7. ToolDefinition Translation

The facade's `ToolDefinition` is the canonical tool schema. Each adapter must
translate it into the provider's native tool specification format.

### 7.1 Facade ToolDefinition

```json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string", "description": "City name or coordinates" }
    },
    "required": ["location"]
  }
}
```

### 7.2 Provider-Specific Translations

**OpenAI:**

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get current weather for a location",
    "parameters": {
      "type": "object",
      "properties": {
        "location": { "type": "string", "description": "City name or coordinates" }
      },
      "required": ["location"]
    }
  }
}
```

Adapter wraps the facade ToolDefinition in `{type: "function", function: {...}}`.
The `input_schema` maps to `parameters`.

**Anthropic:**

```json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string", "description": "City name or coordinates" }
    },
    "required": ["location"]
  }
}
```

Anthropic's format matches the facade's format directly. The field name
`input_schema` is identical. No structural transformation needed.

**Gemini:**

```json
{
  "functionDeclarations": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": { "type": "string", "description": "City name or coordinates" }
        },
        "required": ["location"]
      }
    }
  ]
}
```

Gemini wraps all tool definitions in a single `tools` object containing a
`functionDeclarations` array. The `input_schema` maps to `parameters`. Note
that Gemini's schema format uses a subset of JSON Schema (OpenAPI 3.0 style);
complex JSON Schema features (e.g., `$ref`, `allOf`, `oneOf`) may not be
supported and the adapter should warn when they are present in the facade's
`input_schema`.

**OAI-Compatible Runtimes (vLLM, LM Studio, llama.cpp, Ollama OAI-compat):**

Same as OpenAI. The `{type: "function", function: {...}}` wrapper applies.

---

## 8. Adapter Implementor Checklist

A summary of obligations specific to tool-calling support. This complements
the general `ICompletionProvider` implementor contract in TypeSpecification
Section 6.2.

### Outbound (Facade to Provider)

- [ ] Extract system messages from the facade message array and place them according to provider convention (in-array for OpenAI/OAI-compat, top-level parameter for Anthropic/Gemini).
- [ ] Translate `ToolDefinition[]` into the provider's tool schema format (Section 7.2).
- [ ] Translate `ToolChoice` values into the provider's vocabulary (Section 2.5).
- [ ] Detect consecutive tool-role messages and merge them into a single provider message where required (Anthropic, Gemini).
- [ ] Serialize ToolUseBlock contents back into the provider's format when echoing assistant messages (e.g., `input` object to `arguments` JSON string for OpenAI).
- [ ] Map facade `tool_call_id` to provider-specific field names (`tool_call_id` for OpenAI, `tool_use_id` for Anthropic, function name for Gemini).
- [ ] Preserve ThinkingBlocks in multi-turn assistant messages without modification.

### Inbound (Provider to Facade)

- [ ] Extract tool calls from wherever they live in the provider response (Section 2.1) and construct ToolUseBlocks.
- [ ] Parse string-encoded arguments into objects (Section 2.6).
- [ ] Generate synthetic `tool_use_id` values when the provider omits them (Section 2.3).
- [ ] Detect tool-calling intent from response content when `finish_reason` is ambiguous (Section 2.4, Gemini and Ollama).
- [ ] Set `finish_reason` to `tool_use` when tool calls are present, regardless of the provider's native finish reason.
- [ ] Validate that tool names match the request's tool definitions (invariant TU-2).
- [ ] Validate that at least one ToolUseBlock exists when emitting `finish_reason: "tool_use"` (invariant CR-3).

### Streaming

- [ ] Translate provider-specific streaming events into `ToolUseDelta` chunks (Section 2.7).
- [ ] Announce each new tool call with a `ToolUseDelta` carrying non-null `tool_use_id` and `name` (invariant SD-1).
- [ ] Track parallel tool calls by index and emit separate ToolUseDelta sequences per tool call.
- [ ] Handle providers that deliver complete tool calls in a single frame (Gemini, Ollama native) by emitting one ToolUseDelta with the full `input_json_delta`.
- [ ] Ensure `chunk_index` values are contiguous and monotonically increasing (invariant CC-1).
- [ ] Emit `finish_reason` and `usage` on exactly one terminal chunk (invariant CC-5).

---

## Appendix A: Message Sequence Examples Across Providers

This appendix shows the same facade conversation rendered in each provider's
native format, illustrating the full scope of translation work.

### Facade Conversation (canonical)

```
Message 1: { role: "system",    content: [TextBlock("You are a helpful assistant.")],    tool_call_id: null }
Message 2: { role: "user",      content: [TextBlock("What's the weather in SF?")],      tool_call_id: null }
Message 3: { role: "assistant", content: [TextBlock("Let me check."),
                                          ToolUseBlock("tu_1", "get_weather", {location:"SF"})],
                                                                                         tool_call_id: null }
Message 4: { role: "tool",      content: [TextBlock("72F, sunny")],                     tool_call_id: "tu_1" }
```

### OpenAI Wire Format

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What's the weather in SF?" },
    {
      "role": "assistant",
      "content": "Let me check.",
      "tool_calls": [
        { "id": "tu_1", "type": "function",
          "function": { "name": "get_weather", "arguments": "{\"location\":\"SF\"}" } }
      ]
    },
    { "role": "tool", "tool_call_id": "tu_1", "content": "72F, sunny" }
  ],
  "tools": [
    { "type": "function",
      "function": { "name": "get_weather", "description": "Get current weather for a location",
                    "parameters": { "type": "object", "properties": { "location": {"type":"string"} }, "required": ["location"] } } }
  ]
}
```

### Anthropic Wire Format

```json
{
  "model": "claude-sonnet-4-20250514",
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "What's the weather in SF?" }] },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "Let me check." },
        { "type": "tool_use", "id": "tu_1", "name": "get_weather", "input": { "location": "SF" } }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "tool_result", "tool_use_id": "tu_1", "content": "72F, sunny" }
      ]
    }
  ],
  "tools": [
    { "name": "get_weather", "description": "Get current weather for a location",
      "input_schema": { "type": "object", "properties": { "location": {"type":"string"} }, "required": ["location"] } }
  ]
}
```

Note: system extracted to top-level; tool result merged into a user message;
no separate tool role.

### Gemini Wire Format

```json
{
  "systemInstruction": { "parts": [{ "text": "You are a helpful assistant." }] },
  "contents": [
    { "role": "user", "parts": [{ "text": "What's the weather in SF?" }] },
    {
      "role": "model",
      "parts": [
        { "text": "Let me check." },
        { "functionCall": { "name": "get_weather", "args": { "location": "SF" } } }
      ]
    },
    {
      "role": "user",
      "parts": [
        { "functionResponse": { "name": "get_weather", "response": { "result": "72F, sunny" } } }
      ]
    }
  ],
  "tools": [
    { "functionDeclarations": [
        { "name": "get_weather", "description": "Get current weather for a location",
          "parameters": { "type": "object", "properties": { "location": {"type":"string"} }, "required": ["location"] } }
      ] }
  ]
}
```

Note: system extracted to `systemInstruction`; assistant role renamed to
`model`; tool result merged into user content as `functionResponse`; content
field renamed to `parts`; correlation by function name (not ID).

---

## Appendix B: Decision Log

| Decision | Rationale | Alternative Considered |
|----------|-----------|----------------------|
| Facade uses `tool_use_id` (not `tool_call_id` or `id`) | Aligns with Anthropic's naming, which is the most semantically precise: the ID identifies a *tool use* event, not a generic "call". OpenAI's `tool_call_id` conflates with other uses of "call". | `tool_call_id` (OpenAI convention). Rejected for semantic precision. |
| `ToolUseBlock.input` is always `object`, never `string` | The arguments to a tool are structurally a key-value map. String encoding is a serialization artifact of some providers, not a semantic property. Forcing object at the facade level eliminates a class of parsing errors in consumer code. | Accept `string \| object` (union type). Rejected because it pushes parsing responsibility onto every consumer. |
| Synthetic IDs use `synth_` prefix | Makes it visually obvious when a tool call ID was generated by the facade rather than the provider. Aids debugging. The prefix is not load-bearing (callers must not parse IDs). | UUIDs without prefix. Rejected because it obscures origin during debugging. |
| `finish_reason` is always `tool_use` (never `tool_calls`, `function_call`, etc.) | Single canonical name. Chosen for semantic clarity: the model *used* a tool (or is requesting to). OpenAI's `tool_calls` is a plural noun describing the mechanism, not the semantic event. | `tool_calls` (OpenAI convention). Rejected for consistency with Anthropic and for semantic precision. |
| Facade does not expose `parallel_tool_calls` parameter | The decision of whether to invoke tools in parallel is the model's to make; the *caller's* decision is whether to execute the results in parallel. Exposing the provider parameter would create a false guarantee for providers that do not support it. | Expose as optional parameter. Rejected because it is provider-specific behavior control, not a universal generation parameter. |
| Facade does not model `is_error` on tool results | Adding an error flag to the facade's tool message type was considered. However, the semantics vary by provider (some use it to trigger retries, others just for logging). Callers who need error signaling can encode it in the content text (e.g., "ERROR: connection refused"). | Add `is_error: bool` to the tool-role Message type. Deferred pending evidence that multiple providers standardize on error semantics. |
