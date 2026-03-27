# Google Gemini API -- Vendor Inventory

> Authoritative reference for the llm-api-facade project.
> Last verified: 2026-03-26.

---

## 1. Identity

| Attribute | Value |
|-----------|-------|
| **API Name** | Gemini API (Google AI for Developers) / Vertex AI Gemini API |
| **Provider** | Google |
| **AI Studio Base URL** | `https://generativelanguage.googleapis.com/{version}/models/{model}:{method}` |
| **Vertex AI Base URL** | `https://{location}-aiplatform.googleapis.com/{version}/projects/{project}/locations/{location}/publishers/google/models/{model}:{method}` |
| **API Versions** | `v1` (stable), `v1beta` (preview features: thinking, grounding, code execution) |
| **Streaming Variant** | `streamGenerateContent` with query param `alt=sse` |

### Authentication

| Surface | Mechanism | Header |
|---------|-----------|--------|
| AI Studio | API key | `x-goog-api-key: {key}` (or query param `?key=`) |
| AI Studio (OAuth) | OAuth 2.0 bearer token | `Authorization: Bearer {token}` |
| Vertex AI | Google Cloud IAM / OAuth 2.0 | `Authorization: Bearer {token}` |

### SDKs

| Language | Package | Status |
|----------|---------|--------|
| Python | `google-genai` | GA (unified SDK) |
| JavaScript/TypeScript | `@google/genai` | GA |
| Go | `google.golang.org/genai` | GA |
| Java | `com.google.genai` | GA |
| Python (legacy) | `google-generativeai` | **Deprecated** (Nov 2025) |

The unified Google GenAI SDK replaced the separate AI Studio (`google-generativeai`) and Vertex AI (`google-cloud-aiplatform`) libraries. A single SDK now targets both surfaces; the backend is selected by setting an API key (AI Studio) or a project/location (Vertex AI).

---

## 2. Function Inventory -- `generateContent`

**Endpoint:** `POST .../models/{model}:generateContent`

### 2.1 Top-Level Request Parameters

| Parameter | Type | Required | Default | Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------|------------------|
| `contents` | `Content[]` | **Yes** | -- | At least one element | Conversation turns (user/model alternation) |
| `systemInstruction` | `Content` | No | none | Text-only; no role field needed | Developer-set behavioral guidance for the model |
| `generationConfig` | `GenerationConfig` | No | model defaults | See section 2.2 | Controls decoding, sampling, and output format |
| `tools` | `Tool[]` | No | none | See section 2.3 | Declares callable functions and built-in tools |
| `toolConfig` | `ToolConfig` | No | `AUTO` | See section 2.4 | Controls how/when the model invokes tools |
| `safetySettings` | `SafetySetting[]` | No | model defaults | Max one per `HarmCategory` | Per-request content safety thresholds |
| `cachedContent` | `string` | No | none | Format: `cachedContents/{id}` | Reference to a pre-cached context object |
| `store` | `boolean` | No | project config | -- | Controls server-side logging of this request |
| `labels` | `map<string,string>` | No | none | Vertex AI only | Key-value metadata for billing/tracking |

### 2.2 GenerationConfig Sub-Fields

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `temperature` | `float` | No | 1.0 (model-dependent) | 0.0 -- 2.0 | Sampling randomness. 0 = near-deterministic, 2 = maximum variance |
| `topP` | `float` | No | 0.95 | 0.0 -- 1.0 | Nucleus sampling cutoff probability mass |
| `topK` | `integer` | No | model-dependent | >= 1 | Limits token candidates to top-K by probability |
| `candidateCount` | `integer` | No | 1 | 1 -- 8 | Number of independent response alternatives |
| `maxOutputTokens` | `integer` | No | model-dependent | 1 -- model max | Hard ceiling on generated token count |
| `stopSequences` | `string[]` | No | none | Max 5 entries | Token sequences that halt generation |
| `presencePenalty` | `float` | No | 0.0 | -2.0 to 2.0 (exclusive upper) | Penalizes tokens already present in context |
| `frequencyPenalty` | `float` | No | 0.0 | -2.0 to 2.0 (exclusive upper) | Penalizes tokens proportional to their frequency |
| `seed` | `integer` | No | none | Any int | Determinism hint; same seed + same input = same output (best effort) |
| `responseMimeType` | `string` | No | `text/plain` | `text/plain`, `application/json`, `text/x.enum` | Constrains response format |
| `responseSchema` | `Schema` | No | none | OpenAPI 3.0 subset; requires `responseMimeType: application/json` | Structured output schema enforcement |
| `responseLogprobs` | `boolean` | No | false | -- | Whether to return per-token log probabilities |
| `logprobs` | `integer` | No | none | 1 -- 20 | Number of top candidate tokens to return log-probs for |
| `thinkingConfig` | `ThinkingConfig` | No | model-dependent | See section 2.5 | Controls extended reasoning (thinking) behavior |
| `mediaResolution` | `enum` | No | model-dependent | `LOW`, `MEDIUM`, `HIGH` | Resolution for processing media inputs |
| `audioTimestamp` | `boolean` | No | false | -- | Enables timestamp understanding for audio inputs |

### 2.3 Tool Object

```
Tool {
  functionDeclarations?: FunctionDeclaration[]   // Custom functions
  googleSearch?: {}                              // Grounding with Google Search
  codeExecution?: {}                             // Server-side Python sandbox
  // Gemini 3+: urlContext, fileSearch, computerUse also available
}
```

**FunctionDeclaration:**

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `name` | `string` | Yes | Function identifier (camelCase or snake_case, no spaces) |
| `description` | `string` | Yes | Natural-language explanation of the function |
| `parameters` | `Schema` | Yes | OpenAPI-subset schema for input parameters |
| `parameters.type` | `string` | Yes | Typically `"object"` |
| `parameters.properties` | `map` | Yes | Per-parameter type, description, enum constraints |
| `parameters.required` | `string[]` | Yes | Mandatory parameter names |

### 2.4 ToolConfig

```
ToolConfig {
  functionCallingConfig: FunctionCallingConfig {
    mode: "AUTO" | "ANY" | "NONE" | "VALIDATED"
    allowedFunctionNames?: string[]
  }
}
```

| Mode | Behavior |
|------|----------|
| `AUTO` | Model decides: text response or function call (default) |
| `ANY` | Model must emit a function call; constrained to schema |
| `NONE` | Model prohibited from making function calls |
| `VALIDATED` | Model may call or respond textually; schema adherence guaranteed (preview) |

### 2.5 ThinkingConfig

Thinking config varies by model generation. Setting both `thinkingLevel` and `thinkingBudget` simultaneously produces an error.

**Gemini 3.x models -- use `thinkingLevel`:**

| Value | Behavior |
|-------|----------|
| `minimal` | Near-zero thinking; minimizes latency |
| `low` | Minimizes latency/cost; simple tasks |
| `medium` | Balanced reasoning |
| `high` | Maximum reasoning depth (default for Gemini 3) |

Note: Gemini 3.1 Pro cannot fully disable thinking.

**Gemini 2.5 models -- use `thinkingBudget`:**

| Model | Range (tokens) | Default | Can Disable? |
|-------|---------------|---------|--------------|
| 2.5 Pro | 128 -- 32,768 | -1 (dynamic) | No |
| 2.5 Flash | 0 -- 24,576 | -1 (dynamic) | Yes (set to 0) |
| 2.5 Flash-Lite | 512 -- 24,576 | disabled | N/A (off by default) |

Special value `-1` enables dynamic thinking: the model adjusts token budget per-query based on complexity.

### 2.6 SafetySetting

```
SafetySetting {
  category: HarmCategory
  threshold: HarmBlockThreshold
}
```

**HarmCategory enum:**

| Value | Scope |
|-------|-------|
| `HARM_CATEGORY_HARASSMENT` | Harassment content |
| `HARM_CATEGORY_HATE_SPEECH` | Hate speech |
| `HARM_CATEGORY_SEXUALLY_EXPLICIT` | Sexually explicit content |
| `HARM_CATEGORY_DANGEROUS_CONTENT` | Dangerous or harmful content |
| `HARM_CATEGORY_CIVIC_INTEGRITY` | Civic/election integrity (model-dependent) |

**HarmBlockThreshold enum (most permissive to most restrictive):**

| Value | Behavior |
|-------|----------|
| `HARM_BLOCK_THRESHOLD_UNSPECIFIED` | Use model default |
| `OFF` | No automated blocking |
| `BLOCK_NONE` | No automated blocking (alias) |
| `BLOCK_ONLY_HIGH` | Block only high-probability harm |
| `BLOCK_MEDIUM_AND_ABOVE` | Block medium and above |
| `BLOCK_LOW_AND_ABOVE` | Block low and above |

---

## 3. Message Ontology

### 3.1 Content Object

```
Content {
  role: "user" | "model"       // NOT "assistant" -- this is a key Gemini distinction
  parts: Part[]
}
```

System instructions are NOT a Content role. They occupy the separate `systemInstruction` field at the request top level.

### 3.2 Part Types

Each `Part` is a union type; exactly one field is set per part.

| Part Field | Type | Direction | Purpose |
|------------|------|-----------|---------|
| `text` | `string` | Input / Output | Plain text content |
| `inlineData` | `Blob` | Input | Base64-encoded media (`mimeType` + `data`) |
| `fileData` | `FileData` | Input | Reference to uploaded file (`fileUri` + `mimeType`) |
| `functionCall` | `FunctionCall` | Output (model) | Tool invocation: `{ id, name, args }` |
| `functionResponse` | `FunctionResponse` | Input (user) | Tool result: `{ id, name, response }` |
| `executableCode` | `ExecutableCode` | Output (model) | Server-side code to execute: `{ language, code }` |
| `codeExecutionResult` | `CodeExecutionResult` | Output (model) | Execution output: `{ outcome, output }` |
| `thought` | -- | Output (model) | Thinking summary (boolean flag on text part, indicates reasoning trace) |

### 3.3 Multi-Turn Structure

```json
{
  "systemInstruction": { "parts": [{ "text": "You are a helpful assistant." }] },
  "contents": [
    { "role": "user",  "parts": [{ "text": "Hello" }] },
    { "role": "model", "parts": [{ "text": "Hi there!" }] },
    { "role": "user",  "parts": [{ "text": "What is 2+2?" }] }
  ]
}
```

Key structural rules:
- Roles must alternate: user, model, user, model, ...
- First content must be `user` role
- System instruction is a separate top-level field (no role required)
- Parts are arrays: a single turn can contain multiple parts (text + image, etc.)
- Function call/response cycles interrupt the alternation: model emits `functionCall`, user responds with `functionResponse`

---

## 4. Response Ontology

### 4.1 GenerateContentResponse (non-streaming)

```
GenerateContentResponse {
  candidates: Candidate[]
  promptFeedback?: PromptFeedback
  usageMetadata: UsageMetadata
  modelVersion: string                // e.g. "gemini-2.5-flash-001"
  responseId: string                  // Unique response identifier
}
```

### 4.2 Candidate

```
Candidate {
  content: Content                    // role: "model", parts: [...]
  finishReason: FinishReason
  safetyRatings: SafetyRating[]
  citationMetadata?: CitationMetadata
  avgLogprobs?: double
  logprobsResult?: LogprobsResult
  index: integer
}
```

### 4.3 FinishReason Enum

| Value | Meaning |
|-------|---------|
| `FINISH_REASON_UNSPECIFIED` | Default / not set |
| `FINISH_REASON_STOP` | Natural stop or stop sequence hit |
| `FINISH_REASON_MAX_TOKENS` | `maxOutputTokens` limit reached |
| `FINISH_REASON_SAFETY` | Content blocked by safety filters |
| `FINISH_REASON_RECITATION` | Content blocked due to recitation/copyright |
| `FINISH_REASON_BLOCKLIST` | Content blocked by term blocklist |
| `FINISH_REASON_PROHIBITED_CONTENT` | Prohibited content detected |
| `FINISH_REASON_IMAGE_PROHIBITED_CONTENT` | Image-specific prohibited content |
| `FINISH_REASON_NO_IMAGE` | Image generation failed |
| `FINISH_REASON_SPII` | Sensitive personally identifiable information |
| `FINISH_REASON_MALFORMED_FUNCTION_CALL` | Invalid function call structure |
| `FINISH_REASON_OTHER` | Unclassified reason |

Note: AI Studio uses shorter names without the `FINISH_REASON_` prefix (e.g., `STOP`, `MAX_TOKENS`). Vertex AI uses the fully qualified form.

### 4.4 SafetyRating

```
SafetyRating {
  category: HarmCategory
  probability: HarmProbability         // NEGLIGIBLE | LOW | MEDIUM | HIGH
  blocked: boolean
}
```

### 4.5 UsageMetadata

| Field | Type | Always Present | Purpose |
|-------|------|---------------|---------|
| `promptTokenCount` | `integer` | Yes | Input tokens consumed |
| `candidatesTokenCount` | `integer` | Yes | Output tokens generated |
| `totalTokenCount` | `integer` | Yes | Sum of prompt + candidates + thoughts |
| `cachedContentTokenCount` | `integer` | When cached content used | Tokens served from cache |
| `thoughtsTokenCount` | `integer` | When thinking enabled | Tokens consumed by reasoning (billed separately) |

### 4.6 PromptFeedback

```
PromptFeedback {
  blockReason?: BlockReason           // SAFETY, OTHER, BLOCKLIST, PROHIBITED_CONTENT
  safetyRatings: SafetyRating[]
}
```

Present when the prompt itself was filtered before generation.

### 4.7 Streaming Response

**Endpoint:** `POST .../models/{model}:streamGenerateContent?alt=sse`

- Transport: Server-Sent Events (SSE)
- Content-Type: `text/event-stream`
- Each SSE `data:` frame contains a complete `GenerateContentResponse` JSON object
- Each chunk contains partial `candidates[].content.parts[].text`
- `usageMetadata` appears on the final chunk
- All chunks share the same `responseId`
- Chunks are not deltas; each `text` field is the incremental text for that chunk (not cumulative)

---

## 5. Error Ontology

### 5.1 Error Response Structure

```json
{
  "error": {
    "code": 400,
    "message": "Human-readable description of the failure",
    "status": "INVALID_ARGUMENT",
    "details": []
  }
}
```

### 5.2 Error Code Map

| HTTP | gRPC Status | Common Cause | Retryable |
|------|-------------|--------------|-----------|
| 400 | `INVALID_ARGUMENT` | Malformed request, bad parameter values, invalid model ID | No |
| 400 | `FAILED_PRECONDITION` | Free-tier geographic restriction; billing not enabled | No |
| 403 | `PERMISSION_DENIED` | Invalid API key, insufficient IAM permissions | No |
| 404 | `NOT_FOUND` | Model does not exist, referenced file missing | No |
| 429 | `RESOURCE_EXHAUSTED` | Rate limit exceeded (RPM, TPM, or daily quota) | Yes (with backoff) |
| 500 | `INTERNAL` | Server error; sometimes context too large | Yes (with backoff) |
| 503 | `UNAVAILABLE` | Service temporarily overloaded or down | Yes (with backoff) |
| 504 | `DEADLINE_EXCEEDED` | Request timed out; prompt too large or generation too slow | Yes (reduce input) |

### 5.3 Rate Limiting

Rate limits are per-model and per-project. Headers `x-ratelimit-limit-*` and `x-ratelimit-remaining-*` are returned. Limits expressed as RPM (requests per minute) and TPM (tokens per minute). Free tier has significantly lower limits than paid.

---

## 6. Model Taxonomy

### 6.1 Current Generation Models (March 2026)

| Model ID | Generation | Input Tokens | Output Tokens | Thinking | Key Capabilities |
|----------|-----------|-------------|---------------|----------|-----------------|
| `gemini-3.1-pro-preview` | 3.1 | 1,048,576 | 65,536 | Yes (`thinkingLevel`) | Flagship reasoning, agentic, multimodal |
| `gemini-3-flash-preview` | 3.0 | 1,048,576 | 65,536 | Yes (`thinkingLevel`) | Frontier performance at lower cost |
| `gemini-3.1-flash-lite-preview` | 3.1 | 1,048,576 | 65,536 | Yes (`thinkingLevel`) | High-volume cost-efficient workhorse |
| `gemini-2.5-pro` | 2.5 | 1,048,576 | 65,536 | Yes (`thinkingBudget`) | Complex reasoning, coding, multimodal |
| `gemini-2.5-flash` | 2.5 | 1,048,576 | 65,536 | Yes (`thinkingBudget`) | Best price-performance with reasoning |
| `gemini-2.5-flash-lite` | 2.5 | 1,048,576 | 65,536 | Yes (`thinkingBudget`, off by default) | Fastest/cheapest multimodal in 2.5 family |
| `gemini-2.0-flash` | 2.0 | 1,048,576 | 8,192 | No | Fast multimodal, native tool use |
| `gemini-2.0-flash-lite` | 2.0 | 1,048,576 | 8,192 | No | Budget variant of 2.0 Flash |

### 6.2 Specialized / Image Generation Models

| Model ID | Purpose | Input Tokens | Output Tokens |
|----------|---------|-------------|---------------|
| `gemini-3-pro-image-preview` | Image generation + editing (4K) | 65,536 | 32,768 |
| `gemini-3.1-flash-image-preview` | Image generation + editing (fast) | 65,536 | 32,768 |
| `gemini-2.5-flash-image` | Image generation + editing | 32,768 | 8,192 |

### 6.3 Capabilities Matrix

| Capability | 3.1 Pro | 3 Flash | 2.5 Pro | 2.5 Flash | 2.0 Flash |
|------------|---------|---------|---------|-----------|-----------|
| Text input | Yes | Yes | Yes | Yes | Yes |
| Image input | Yes | Yes | Yes | Yes | Yes |
| Audio input | Yes | Yes | Yes | Yes | Yes |
| Video input | Yes | Yes | Yes | Yes | Yes |
| PDF input | Yes | Yes | Yes | Yes | Yes |
| Text output | Yes | Yes | Yes | Yes | Yes |
| Structured output (JSON) | Yes | Yes | Yes | Yes | Yes |
| Function calling | Yes | Yes | Yes | Yes | Yes |
| Code execution | Yes | Yes | Yes | Yes | Yes |
| Grounding (Google Search) | Yes | Yes | Yes | Yes | Yes |
| Thinking/Reasoning | Yes | Yes | Yes | Yes | No |
| Image output | Via image models | Via image models | No | Via flash-image | No |
| Cached content | Yes | Yes | Yes | Yes | Yes |

### 6.4 Versioning Conventions

Model IDs follow the pattern: `gemini-{generation}-{variant}[-{suffix}]`

| Suffix | Meaning |
|--------|---------|
| (none) | Latest stable (auto-updated) |
| `-preview` | Preview release; may change without notice |
| `-001`, `-002` | Pinned stable version |
| `-latest` | Explicit alias for latest stable |
| `-exp-{date}` | Experimental snapshot |

---

## 7. Behavioral Peculiarities

These are the non-obvious design decisions that affect facade implementation.

### 7.1 Role Naming: "model" not "assistant"

Gemini uses `"model"` as the assistant role name. All other major LLM APIs (OpenAI, Anthropic) use `"assistant"`. The facade must map between them.

### 7.2 Parts-Based Content (Not Simple Strings)

Content is always `{ role, parts: [{ text }] }`, never `{ role, content: "string" }`. Even a plain text message requires wrapping in the parts array. This is structurally different from OpenAI's `content` string field.

### 7.3 System Instruction as Separate Field

System instructions are NOT a role in the `contents` array. They occupy `systemInstruction` at the request root. OpenAI/Anthropic use a `system` role message in the messages array.

### 7.4 Safety Settings Per-Request

Unlike OpenAI (which handles safety server-side with no per-request control), Gemini exposes safety thresholds as a per-request parameter. Each `HarmCategory` can be independently tuned. This is distinctive.

### 7.5 Grounding with Google Search

Built-in tool `googleSearch` causes the model to issue live web searches during generation. Results appear as grounding metadata with source attributions. No equivalent exists as a built-in in OpenAI/Anthropic.

### 7.6 Server-Side Code Execution

Built-in tool `codeExecution` provides a sandboxed Python environment. The model writes code, executes it server-side, and returns results -- all within a single API call. Distinct from OpenAI's Code Interpreter (which requires Assistants API).

### 7.7 Cached Content (Explicit Caching API)

Context caching is a first-class API concept: you create a `cachedContents` resource, then reference it by ID in `generateContent`. Cached tokens are billed at reduced rates. OpenAI has "prompt caching" but it is implicit/automatic, not an explicit resource.

### 7.8 Thinking Config with Token Budget

Extended reasoning is controlled via `thinkingConfig` in `generationConfig`. The 2.5 family uses numeric `thinkingBudget`; the 3.x family uses categorical `thinkingLevel`. These are mutually exclusive. Thinking tokens are billed but not surfaced in output (only summaries appear). The `thoughtsTokenCount` in `usageMetadata` reports actual consumption.

### 7.9 Response MIME Type for Structured Output

Setting `responseMimeType: "application/json"` with a `responseSchema` forces the model to produce valid JSON conforming to the schema. `text/x.enum` constrains output to one of the schema's enum values. This is Gemini's equivalent of OpenAI's response_format/structured outputs.

### 7.10 Multiple Completions via candidateCount

`candidateCount` (1--8) generates multiple independent responses. OpenAI's equivalent is `n`. Each candidate has its own `finishReason`, `safetyRatings`, and `content`.

### 7.11 Penalty Range Asymmetry

`presencePenalty` and `frequencyPenalty` range from -2.0 to 2.0 (exclusive upper bound). Negative values encourage repetition. OpenAI uses the same range but inclusive.

### 7.12 API Version Split

Some features (thinking, grounding, code execution, newer models) require `v1beta`. The stable `v1` endpoint lags behind. The facade must track which features require which API version.

---

## 8. Boundary Classification

Classification of every concept relative to the broader LLM API landscape.

### Universal (present in all major LLM APIs with equivalent semantics)

| Concept | Gemini Name | OpenAI Equivalent | Anthropic Equivalent |
|---------|------------|-------------------|---------------------|
| Conversation messages | `contents` | `messages` | `messages` |
| System prompt | `systemInstruction` | `messages[role=system]` | `system` |
| Temperature | `temperature` | `temperature` | `temperature` |
| Top-P sampling | `topP` | `top_p` | `top_p` |
| Max output length | `maxOutputTokens` | `max_tokens` | `max_tokens` |
| Stop sequences | `stopSequences` | `stop` | `stop_sequences` |
| Streaming | `streamGenerateContent` | `stream: true` | `stream: true` |
| Token usage reporting | `usageMetadata` | `usage` | `usage` |
| Function/tool calling | `tools` + `functionDeclarations` | `tools` + `functions` | `tools` |
| Structured output | `responseSchema` | `response_format.json_schema` | N/A (tool-based) |

### Common (present in most but not all APIs, or with semantic differences)

| Concept | Gemini Name | Notes |
|---------|------------|-------|
| Top-K sampling | `topK` | Not in OpenAI; present in Anthropic (`top_k`) |
| Presence penalty | `presencePenalty` | Same concept as OpenAI; not in Anthropic |
| Frequency penalty | `frequencyPenalty` | Same concept as OpenAI; not in Anthropic |
| Seed for determinism | `seed` | Same concept as OpenAI; not in Anthropic |
| Multiple completions | `candidateCount` | OpenAI `n`; not in Anthropic |
| Log probabilities | `responseLogprobs` / `logprobs` | Same concept as OpenAI; not in Anthropic |
| Extended reasoning | `thinkingConfig` | Anthropic `thinking`; OpenAI `reasoning_effort` |

### Distinctive (unique to Gemini or significantly different implementation)

| Concept | Gemini Implementation | Why Distinctive |
|---------|----------------------|-----------------|
| Role naming | `"model"` (not `"assistant"`) | Unique string; requires mapping |
| Parts-based content | `parts: [{ text }, { inlineData }]` | Not a simple string; structural difference |
| System instruction placement | Separate `systemInstruction` field | Not inside messages array |
| Per-request safety settings | `safetySettings` with category/threshold | No equivalent in OpenAI/Anthropic |
| Google Search grounding | Built-in `googleSearch` tool | No built-in equivalent elsewhere |
| Server-side code execution | Built-in `codeExecution` tool | Different from OpenAI Code Interpreter (Assistants-only) |
| Explicit cached content | `cachedContent` resource reference | OpenAI caching is implicit; Anthropic has explicit cache but different API |
| Thinking budget (numeric) | `thinkingBudget` token count | More granular than Anthropic's budget; different from OpenAI's effort level |
| Response MIME type | `responseMimeType`: `text/plain`, `application/json`, `text/x.enum` | Enum-constrained output is unique |
| API version bifurcation | `v1` vs `v1beta` for feature access | Other APIs use single versioned endpoint |
| Prompt feedback | `promptFeedback` with `blockReason` | Input-side filtering reported separately from output |
| Media resolution control | `mediaResolution` enum | Per-request image processing quality control |
| Audio timestamp mode | `audioTimestamp` boolean | Explicit temporal understanding toggle |
| Finish reason granularity | 11+ distinct finish reasons | More granular than OpenAI (4) or Anthropic (3) |

---

## Appendix A: Request/Response JSON Skeleton

### Minimal Request
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Explain quantum entanglement." }]
    }
  ]
}
```

### Full-Featured Request
```json
{
  "systemInstruction": {
    "parts": [{ "text": "You are a physics professor." }]
  },
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Explain quantum entanglement." }]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "topP": 0.9,
    "topK": 40,
    "maxOutputTokens": 2048,
    "candidateCount": 1,
    "stopSequences": ["---"],
    "presencePenalty": 0.0,
    "frequencyPenalty": 0.0,
    "responseMimeType": "text/plain",
    "seed": 42,
    "thinkingConfig": {
      "thinkingBudget": 4096
    }
  },
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "lookup_constant",
          "description": "Look up a physics constant by name",
          "parameters": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "Constant name" }
            },
            "required": ["name"]
          }
        }
      ]
    },
    { "googleSearch": {} },
    { "codeExecution": {} }
  ],
  "toolConfig": {
    "functionCallingConfig": {
      "mode": "AUTO"
    }
  },
  "safetySettings": [
    {
      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
      "threshold": "BLOCK_ONLY_HIGH"
    }
  ]
}
```

### Response
```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "Quantum entanglement is..." }]
      },
      "finishReason": "STOP",
      "safetyRatings": [
        {
          "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
          "probability": "NEGLIGIBLE",
          "blocked": false
        }
      ],
      "citationMetadata": { "citations": [] },
      "avgLogprobs": -0.123,
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 25,
    "candidatesTokenCount": 150,
    "totalTokenCount": 175,
    "thoughtsTokenCount": 0
  },
  "modelVersion": "gemini-2.5-flash-001",
  "responseId": "abc123"
}
```

---

## Appendix B: Facade Implementation Notes

1. **Role mapping**: `"assistant"` in facade <-> `"model"` in Gemini wire format.
2. **Content restructuring**: Facade's flat `content: string` must be wrapped into `parts: [{ text }]`. Multimodal content requires assembling the correct part types.
3. **System instruction extraction**: If the facade uses a messages-array system message, extract it into `systemInstruction` for Gemini.
4. **Safety settings passthrough**: Decide whether to expose Gemini's safety settings as a facade concept or apply sensible defaults.
5. **API version routing**: Track which features require `v1beta` and route accordingly.
6. **Thinking normalization**: Map between Gemini's `thinkingConfig` (budget/level), Anthropic's `thinking` (budget_tokens), and OpenAI's `reasoning_effort` (low/medium/high).
7. **Finish reason normalization**: Map Gemini's 11+ finish reasons to the facade's canonical set.
8. **Token usage normalization**: Map `promptTokenCount`/`candidatesTokenCount`/`thoughtsTokenCount` to facade's unified usage model.
9. **Streaming delta model**: Gemini SSE chunks are incremental text fragments (not cumulative). Each chunk is a complete `GenerateContentResponse` with partial content.
10. **Cached content**: If the facade supports caching, it must manage the `cachedContents` lifecycle (create, reference, delete) as a separate API surface.
