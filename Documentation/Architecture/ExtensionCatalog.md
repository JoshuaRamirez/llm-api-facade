# Extension Catalog

These are the initial Layer 2 extensions for the llm-api-facade system. Each entry is an `ExtensionDescriptor` (see TypeSpecification Section 3.4) -- the structured, discoverable mechanism through which the facade organizes provider-specific features. Adapters register their supported extensions at startup during model registration. Consumers discover available extensions for a given model via `get_model_info`, which returns the `ModelCapabilities.available_extensions` array.

---

## Registry Summary

| ID | Name | Direction | Key Providers |
|----|------|-----------|---------------|
| `cache_control` | Prompt Cache Control | Bidirectional | Anthropic, OpenAI (response-only), Gemini (response-only) |
| `safety_settings` | Safety Settings | Bidirectional | Gemini (full), Cohere (input-only) |
| `reasoning_config` | Reasoning Configuration | Bidirectional | Anthropic, OpenAI, Gemini, xAI |
| `structured_output` | Structured Output | Bidirectional | All (varying guarantee levels) |
| `token_details` | Token Details | Response-only | OpenAI, Anthropic, Gemini |

---

### 1. cache_control

**Description:** Request-side cache hints and response-side cache utilization metrics.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "cache_hints": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target": { "type": "string", "enum": ["system", "message", "tool_definition"] },
          "target_index": { "type": "integer", "minimum": 0 },
          "type": { "type": "string", "enum": ["ephemeral"], "default": "ephemeral" },
          "ttl": { "type": "string", "enum": ["5m", "1h"], "default": "5m" }
        },
        "required": ["target", "target_index"]
      }
    }
  },
  "required": ["cache_hints"]
}
```

**Response Schema:**
```json
{
  "type": "object",
  "properties": {
    "cache_creation_tokens": { "type": "integer", "minimum": 0 },
    "cache_read_tokens": { "type": "integer", "minimum": 0 },
    "is_cached": { "type": "boolean" }
  },
  "required": ["cache_creation_tokens", "cache_read_tokens", "is_cached"]
}
```

**Adapter Translation:**

| Provider | Input | Response |
|----------|-------|----------|
| Anthropic | `cache_hints` mapped to ephemeral breakpoints on content blocks | `cache_creation_input_tokens`, `cache_read_input_tokens` |
| OpenAI | Ignored (automatic caching) | `prompt_tokens_details.cached_tokens` mapped to `cache_read_tokens` |
| Gemini | Ignored (lifecycle-based caching) | `cachedContentTokenCount` mapped to `cache_read_tokens` |
| Local | Ignored | All zeros |

---

### 2. safety_settings

**Description:** Per-request safety thresholds and response safety ratings.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "categories": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": {
            "type": "string",
            "enum": ["harassment", "hate_speech", "sexually_explicit", "dangerous_content", "civic_integrity"]
          },
          "threshold": {
            "type": "string",
            "enum": ["default", "off", "block_high_only", "block_medium_and_above", "block_low_and_above"]
          }
        },
        "required": ["category", "threshold"]
      },
      "maxItems": 5
    },
    "mode": { "type": "string", "enum": ["contextual", "strict", "none"] }
  },
  "minProperties": 1
}
```

**Response Schema:**
```json
{
  "type": "object",
  "properties": {
    "ratings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": { "type": "string" },
          "probability": { "type": "string", "enum": ["negligible", "low", "medium", "high"] },
          "blocked": { "type": "boolean" }
        },
        "required": ["category", "probability", "blocked"]
      }
    },
    "prompt_blocked": { "type": "boolean" },
    "prompt_block_reason": {
      "type": "string",
      "enum": ["safety", "blocklist", "prohibited_content", "other"]
    }
  },
  "required": ["ratings"]
}
```

**Adapter Translation:**

| Provider | Input | Response |
|----------|-------|----------|
| Gemini | `categories` mapped to `safetySettings` array; `threshold` enum translated to Gemini equivalents | `safetyRatings` + `PromptFeedback` |
| Cohere | `mode` mapped to `safety_mode` | Not populated (no ratings returned) |
| OpenAI | Not registered | Not registered |
| Anthropic | Not registered | Not registered |

---

### 3. reasoning_config

**Description:** Fine-grained reasoning control beyond Layer 1's categorical `reasoning_effort`. Separates reasoning tokens from visible output tokens.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "budget_tokens": {
      "type": "integer",
      "minimum": 0,
      "description": "Explicit reasoning token budget. Overrides categorical reasoning_effort."
    },
    "interleaved": {
      "type": "boolean",
      "description": "Enable per-tool-turn thinking in agentic loops."
    },
    "display": {
      "type": "string",
      "enum": ["full", "omitted", "summarized"],
      "description": "How thinking content appears in response."
    }
  }
}
```

**Response Schema:**
```json
{
  "type": "object",
  "properties": {
    "reasoning_tokens": { "type": "integer", "minimum": 0 },
    "visible_output_tokens": { "type": "integer", "minimum": 0 },
    "budget_tokens_allocated": { "type": ["integer", "null"], "minimum": 0 },
    "is_estimated": { "type": "boolean" }
  },
  "required": ["reasoning_tokens", "visible_output_tokens", "is_estimated"]
}
```

**Adapter Translation:**

| Provider | Input | Response |
|----------|-------|----------|
| Anthropic | `budget_tokens` mapped to `thinking.budget_tokens`; `display` mapped to `thinking.display` | Estimated from thinking block content (`is_estimated=true`) |
| OpenAI | `budget_tokens` ignored (no numeric control); `display` ignored | `completion_tokens_details.reasoning_tokens` (`is_estimated=false`) |
| Gemini | `budget_tokens` mapped to `thinkingConfig.thinkingBudget` (2.5 models only) | `thoughtsTokenCount` (`is_estimated=false`) |
| xAI | Same as OpenAI | Same as OpenAI |

---

### 4. structured_output

**Description:** Output format constraints with guarantee-level reporting. Covers JSON mode, schema validation, constrained decoding, and grammar constraints.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "format": { "type": "string", "enum": ["json", "json_schema", "grammar"] },
    "schema": {
      "type": "object",
      "description": "JSON Schema. Required when format=json_schema."
    },
    "grammar": {
      "type": "string",
      "description": "GBNF or regex. Required when format=grammar."
    },
    "grammar_type": { "type": "string", "enum": ["gbnf", "regex"], "default": "gbnf" },
    "strict": {
      "type": "boolean",
      "default": false,
      "description": "Request constrained decoding when available."
    },
    "schema_name": { "type": "string" }
  },
  "required": ["format"]
}
```

**Response Schema:**
```json
{
  "type": "object",
  "properties": {
    "guarantee_level": {
      "type": "string",
      "enum": ["none", "json_mode", "schema_validated", "constrained_decoding", "grammar_enforced"]
    },
    "refusal": {
      "type": "string",
      "description": "Model refused to produce conforming output (safety)."
    },
    "downgraded_from": {
      "type": "string",
      "description": "What was requested, when guarantee_level is weaker."
    }
  },
  "required": ["guarantee_level"]
}
```

**Guarantee Levels by Provider:**

| Provider | `json` | `json_schema` (`strict=false`) | `json_schema` (`strict=true`) | `grammar` |
|----------|--------|--------------------------------|-------------------------------|-----------|
| OpenAI | `json_mode` | `schema_validated` | `constrained_decoding` | Error |
| Anthropic | `none` (prompt-based) | `schema_validated` | `schema_validated` (downgraded) | Error |
| Gemini | `json_mode` | `schema_validated` | `schema_validated` (downgraded) | Error |
| Ollama | `json_mode` | `constrained_decoding` | `constrained_decoding` | Error |
| llama.cpp | `json_mode` | `constrained_decoding` | `constrained_decoding` | `grammar_enforced` |
| vLLM | `json_mode` | `constrained_decoding` | `constrained_decoding` | `grammar_enforced` |
| LM Studio | `json_mode` | `constrained_decoding` | `constrained_decoding` | Error |

---

### 5. token_details

**Description:** Detailed token breakdown by category. Response-only. Decomposes Layer 1 `Usage` totals.

**Input Schema:** None (response-only). Populated automatically when the provider reports detail data.

**Response Schema:**
```json
{
  "type": "object",
  "properties": {
    "input_details": {
      "type": "object",
      "properties": {
        "cached_tokens": { "type": ["integer", "null"], "minimum": 0 },
        "cache_creation_tokens": { "type": ["integer", "null"], "minimum": 0 },
        "audio_tokens": { "type": ["integer", "null"], "minimum": 0 }
      },
      "required": ["cached_tokens", "cache_creation_tokens", "audio_tokens"]
    },
    "output_details": {
      "type": "object",
      "properties": {
        "reasoning_tokens": { "type": ["integer", "null"], "minimum": 0 },
        "audio_tokens": { "type": ["integer", "null"], "minimum": 0 },
        "prediction_accepted_tokens": { "type": ["integer", "null"], "minimum": 0 },
        "prediction_rejected_tokens": { "type": ["integer", "null"], "minimum": 0 }
      },
      "required": ["reasoning_tokens", "audio_tokens", "prediction_accepted_tokens", "prediction_rejected_tokens"]
    }
  },
  "required": ["input_details", "output_details"]
}
```

**Null vs Zero:** `null` = provider does not report this metric. `0` = provider reported zero.

**Adapter Translation:**

| Field | OpenAI | Anthropic | Gemini |
|-------|--------|-----------|--------|
| `cached_tokens` | `prompt_tokens_details.cached_tokens` | `cache_read_input_tokens` | `cachedContentTokenCount` |
| `cache_creation_tokens` | `null` | `cache_creation_input_tokens` | `null` |
| `audio_tokens` (input) | `prompt_tokens_details.audio_tokens` | `null` | `null` |
| `reasoning_tokens` | `completion_tokens_details.reasoning_tokens` | `null` (not reported separately) | `thoughtsTokenCount` |
| `audio_tokens` (output) | `completion_tokens_details.audio_tokens` | `null` | `null` |
| `prediction_accepted` | `accepted_prediction_tokens` | `null` | `null` |
| `prediction_rejected` | `rejected_prediction_tokens` | `null` | `null` |

---

## Graduation Likelihood

| Extension | Likelihood | Timeframe | Rationale |
|-----------|------------|-----------|-----------|
| `cache_control` | Low | >24 months | Mechanisms fundamentally different. Anthropic breakpoints vs Gemini lifecycle vs OpenAI automatic. |
| `safety_settings` | Low | >24 months | No convergence on per-request safety across major providers. |
| `reasoning_config` | Medium-High | 6-12 months | `reasoning_tokens` response field is converging. `budget_tokens` input less likely. |
| `structured_output` | Medium | 12-18 months | JSON Schema format converging. Guarantee levels remain provider-specific. |
| `token_details` | High (partial) | 6-12 months | `reasoning_tokens` likely graduates to Layer 1 Usage. Other fields remain Layer 2. |

---

## Extension Interaction Notes

- `reasoning_config` and `token_details` have overlapping response data (`reasoning_tokens`). Use `reasoning_config` when you need input control plus response accounting. Use `token_details` when you only need the full breakdown.
- `cache_control` response data overlaps with `token_details.input_details.cached_tokens`. Both report the same underlying metric. The consumer can use either.
- `structured_output` and tool calling (Layer 1) interact: using tools with `strict: true` structured output on OpenAI disables `parallel_tool_calls`.
