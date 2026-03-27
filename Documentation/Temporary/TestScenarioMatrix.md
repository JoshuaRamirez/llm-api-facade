# Test Scenario Matrix

> Exhaustive enumeration of all scenarios derivable from project documentation.
> Generated 2026-03-27. Use as implementation and test planning reference.
> **Status: ~400 scenarios total. 1 tested. ~30 wired. ~370 documented only.**

---

## Layer 1 Core (18 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 1 | Text completion (batch) | Yes | **Yes** |
| 2 | Text completion with temperature | Yes | No |
| 3 | Text completion with top_p | Yes | No |
| 4 | Text completion with max_tokens | Yes | No |
| 5 | Text completion with stop_sequences | Yes | No |
| 6 | Text completion with frequency_penalty | Yes | No |
| 7 | Text completion with presence_penalty | Yes | No |
| 8 | Text completion with seed | Yes | No |
| 9 | Streaming text completion | Facade only | No |
| 10 | Model resolution via /v1/models | Yes | No |
| 11 | Model resolution — provider unreachable | Yes | No |
| 12 | Usage reporting (exact) | Yes | **Yes** |
| 13 | Usage reporting (approximate) | Streaming only | No |
| 14 | Finish reason: stop | Yes | **Yes** |
| 15 | Finish reason: length (hit max_tokens) | Yes | No |
| 16 | Finish reason: content_filter | Yes | No |
| 17 | String shorthand → ContentBlock[] | Yes | **Yes** |
| 18 | Multi-message conversation (system + user) | Yes | No |

## Layer 1 Extended: Tool Calling (58 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 19 | Single-turn tool call | Yes | No |
| 20 | Parallel tool calls (multiple ToolUseBlocks) | Yes | No |
| 21 | Multi-round tool chaining | Yes | No |
| 22 | Streaming tool call deltas | Yes | No |
| 23 | Tool role → OpenAI wire format | Yes | No |
| 24 | Assistant + ToolUseBlocks → split content/tool_calls | Yes | No |
| 25 | Malformed tool arguments → {_raw} fallback | Yes | No |
| 26 | finish_reason: tool_use from "tool_calls" | Yes | No |
| 27 | finish_reason: tool_use from "tool" (llama.cpp) | Yes | No |
| 28-58 | Provider-specific choreography (Anthropic role compression, Gemini functionCall, etc.) | No | No |

## Layer 1 Extended: Thinking (24 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 59 | ThinkingBlock passthrough in multi-turn | Types only | No |
| 60 | reasoning_effort parameter | Types only | No |
| 61 | Parameter mutual exclusion (reasoning models) | No | No |
| 62 | Invisible reasoning tokens in usage | No | No |
| 63-82 | Thinking + tools, interleaved, display modes | No | No |

## Layer 2 Extensions (68 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 83-96 | cache_control (14 scenarios) | Schema only | No |
| 97-108 | safety_settings (12 scenarios) | Schema only | No |
| 109-122 | reasoning_config (14 scenarios) | Schema only | No |
| 123-140 | structured_output (18 scenarios) | Schema only | No |
| 141-150 | token_details (10 scenarios) | Schema only | No |

## Error Taxonomy (28 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 151 | Empty messages → validation_error | Yes | No |
| 152 | Unknown model → model_not_found | Yes | No |
| 153 | Model not ready → model_not_ready | Yes | No |
| 154 | Invalid credentials (401) → authentication | Yes | No |
| 155 | Insufficient access (403) → permission | Yes | No |
| 156 | Rate limited (429) → rate_limited | Yes | No |
| 157 | Overloaded (503) → overloaded | Yes | No |
| 158 | Context overflow → context_overflow | No | No |
| 159 | Quota exceeded → quota_exceeded | No | No |
| 160 | Content filtered → content_filter | Yes (finish_reason) | No |
| 161 | Stream interrupted (malformed JSON) → stream_interrupted | Yes | No |
| 162 | Timeout → timeout | No | No |
| 163 | Provider error (5xx) → provider_error | Yes | No |
| 164 | Streaming ends without [DONE] → usage guaranteed | Yes | No |
| 165 | Streaming buffer residual flushed | Yes | No |
| 166-178 | Extension-specific errors, unknown finish reasons | Partial | No |

## MCP Surface (9 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 179 | complete tool | Yes | **Yes** |
| 180 | stream_complete tool | No (not exposed) | No |
| 181 | list_models tool | Yes (stub) | No |
| 182 | get_model_info tool | No | No |
| 183 | validate_request tool | No | No |
| 184 | estimate_tokens tool | No | No |
| 185 | models://catalog resource | No | No |
| 186 | config://state resource | No | No |
| 187 | session://{id} resource | No | No |

## Provider Adapters (82 scenarios)

| # | Scenario | Wired | Tested |
|---|----------|-------|--------|
| 188 | OpenAI-compat → Ollama | Yes | **Yes** |
| 189 | OpenAI-compat → OpenAI (cloud) | Yes | No |
| 190 | OpenAI-compat → vLLM | Yes | No |
| 191 | OpenAI-compat → LM Studio | Yes | No |
| 192 | OpenAI-compat → llama.cpp | Yes | No |
| 193 | OpenAI-compat → Mistral | Yes | No |
| 194 | OpenAI-compat → xAI | Yes | No |
| 195 | Anthropic adapter (role compression, blocks, system param) | No | No |
| 196 | Gemini adapter (parts, "model" role, functionCall) | No | No |
| 197 | Cohere adapter (flat response, uppercase finish reasons) | No | No |
| 198-270 | Provider-specific edge cases per vendor inventory | No | No |

---

## What Can Be Tested Now (Ollama + llama3.1:8b)

All Layer 1 Core scenarios (#1-18) that are wired can be tested against Ollama.
Error scenarios that the facade generates (#151-153) can be tested without a provider.
Streaming (#9) needs the MCP tool exposed first.
Tool calling (#19-27) needs a model that supports it (llama3.1:8b does support tools).
