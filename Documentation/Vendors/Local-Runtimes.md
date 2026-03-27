# Local LLM Runtime Vendor Inventory

> Authoritative reference for the llm-api-facade project.
> Covers: Ollama, llama.cpp (server mode), vLLM, LM Studio, text-generation-webui.
> Last updated: 2026-03-26

---

## Table of Contents

1. [Ollama](#1-ollama)
2. [llama.cpp Server](#2-llamacpp-server)
3. [vLLM](#3-vllm)
4. [LM Studio](#4-lm-studio)
5. [text-generation-webui](#5-text-generation-webui)
6. [Cross-Runtime Comparison](#6-cross-runtime-comparison)

---

## 1. Ollama

### 1.1 Identity

| Field | Value |
|-------|-------|
| Project | [Ollama](https://github.com/ollama/ollama) |
| Default URL | `http://localhost:11434` |
| API Compatibility | Native REST + OpenAI-compatible `/v1/*` |
| License | MIT |
| Typical Deployment | Single-machine daemon; macOS/Linux/Windows; auto-detects GPU |

### 1.2 Endpoint Inventory

#### Native Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/generate` | Text completion (prompt-in, text-out) |
| POST | `/api/chat` | Multi-turn chat completion |
| POST | `/api/embed` | Generate embeddings (single or batch) |
| POST | `/api/embeddings` | Legacy embedding endpoint |
| GET | `/api/tags` | List locally available models |
| POST | `/api/show` | Inspect model metadata and Modelfile |
| POST | `/api/copy` | Duplicate a model under a new name |
| DELETE | `/api/delete` | Remove a model from local storage |
| POST | `/api/pull` | Download model from registry |
| POST | `/api/push` | Upload model to registry |
| POST | `/api/create` | Create model from Modelfile specification |
| GET | `/api/ps` | List currently loaded/running models |
| GET | `/api/version` | Server version string |

#### OpenAI-Compatible Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | Chat completions (OAI-compat) |
| POST | `/v1/completions` | Text completions (OAI-compat) |
| POST | `/v1/embeddings` | Embeddings (OAI-compat) |
| GET | `/v1/models` | Model listing (OAI-compat) |
| GET | `/v1/models/{model}` | Single model info (OAI-compat) |
| POST | `/v1/images/generations` | Image generation (experimental) |
| POST | `/v1/responses` | Responses API (non-stateful only, v0.13.3+) |

#### Native `/api/chat` Parameters

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `model` | string | Yes | -- | Must be pulled locally | Model identifier in `name:tag` format |
| `messages` | array | Yes | -- | Objects with `role`, `content` | Conversation history |
| `stream` | bool | No | `true` | -- | Enable NDJSON streaming |
| `format` | string or object | No | -- | `"json"` or JSON schema object | Constrain output format |
| `keep_alive` | string | No | `"5m"` | Duration string (e.g., `"10m"`, `"0"`, `"-1"`) | How long to keep model loaded; `"0"` = unload immediately; `"-1"` = keep forever |
| `tools` | array | No | -- | Function definitions with name, description, parameters | Tool/function calling |
| `think` | bool | No | `false` | -- | Enable extended thinking for thinking-capable models |
| `options` | object | No | -- | See options table below | Sampling and runtime parameters |

#### Native `/api/generate` Parameters

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `model` | string | Yes | -- | Must be pulled locally | Model identifier |
| `prompt` | string | No | -- | -- | Input text |
| `suffix` | string | No | -- | -- | Text to append after generation (fill-in-middle) |
| `images` | array | No | -- | Base64-encoded strings | Multimodal image inputs |
| `system` | string | No | -- | -- | System prompt override |
| `template` | string | No | -- | Go template syntax | Prompt template override |
| `context` | array | No | -- | (deprecated) | Previous conversation context tokens |
| `stream` | bool | No | `true` | -- | Enable NDJSON streaming |
| `raw` | bool | No | `false` | -- | Skip prompt template formatting |
| `format` | string or object | No | -- | `"json"` or JSON schema | Constrain output format |
| `keep_alive` | string | No | `"5m"` | Duration string | Model persistence duration |
| `think` | bool | No | `false` | -- | Enable extended thinking |
| `options` | object | No | -- | See options table below | Sampling and runtime parameters |

#### Options (Sampling & Runtime) -- Used in Both `/api/chat` and `/api/generate`

| Parameter | Type | Default | Range/Constraints | Semantic Purpose |
|-----------|------|---------|-------------------|------------------|
| `temperature` | float | 0.8 | >= 0.0 | Sampling randomness; 0 = deterministic |
| `top_k` | int | 40 | >= 0; 0 = disabled | Limit vocabulary to top-K tokens |
| `top_p` | float | 0.9 | [0.0, 1.0] | Nucleus sampling cutoff |
| `min_p` | float | 0.0 | [0.0, 1.0] | Minimum probability relative to top token |
| `num_predict` | int | 128 | -1 = infinite; -2 = fill context | Maximum tokens to generate |
| `num_ctx` | int | 2048 | Model-dependent upper bound | Context window size in tokens |
| `seed` | int | 0 | -- | RNG seed; fixed value = reproducible output |
| `stop` | array | -- | String sequences | Generation stop sequences |
| `repeat_last_n` | int | 64 | 0 = disabled; -1 = num_ctx | Lookback window for repetition penalty |
| `repeat_penalty` | float | 1.1 | 1.0 = disabled | Repetition penalty multiplier |
| `mirostat` | int | 0 | 0, 1, 2 | Mirostat mode: 0=off, 1=v1, 2=v2 |
| `mirostat_tau` | float | 5.0 | > 0.0 | Target entropy (perplexity) |
| `mirostat_eta` | float | 0.1 | > 0.0 | Learning rate for Mirostat adaptation |
| `tfs_z` | float | 1.0 | 1.0 = disabled | Tail-free sampling parameter |
| `num_gpu` | int | auto | >= 0 | Number of layers offloaded to GPU |
| `num_thread` | int | auto | >= 1 | CPU thread count |
| `num_keep` | int | -- | -- | Tokens to retain from initial prompt |
| `num_batch` | int | -- | -- | Batch size for prompt evaluation |
| `main_gpu` | int | 0 | -- | Primary GPU index |
| `low_vram` | bool | false | -- | Reduce VRAM usage at cost of speed |
| `use_mmap` | bool | true | -- | Memory-map model files |
| `use_mlock` | bool | false | -- | Lock model in RAM (prevent swap) |
| `numa` | bool | false | -- | NUMA-aware memory allocation |

#### `/v1/chat/completions` (OpenAI-Compatible) Parameters

| Parameter | Type | Required | Default | Supported | Notes |
|-----------|------|----------|---------|-----------|-------|
| `model` | string | Yes | -- | Yes | Ollama model name |
| `messages` | array | Yes | -- | Yes | Text + base64 image content |
| `temperature` | float | No | 0.8 | Yes | -- |
| `top_p` | float | No | 0.9 | Yes | -- |
| `max_tokens` | int | No | -- | Yes | Maps to `num_predict` |
| `stream` | bool | No | false | Yes | SSE streaming |
| `stream_options` | object | No | -- | Yes | `include_usage` supported |
| `stop` | array | No | -- | Yes | -- |
| `seed` | int | No | -- | Yes | -- |
| `frequency_penalty` | float | No | -- | Yes | -- |
| `presence_penalty` | float | No | -- | Yes | -- |
| `response_format` | object | No | -- | Yes | JSON mode |
| `tools` | array | No | -- | Yes | Function calling |
| `reasoning_effort` | string | No | -- | Yes | For thinking models |
| `n` | int | No | -- | **No** | Single completion only |
| `tool_choice` | string | No | -- | **No** | -- |
| `logit_bias` | object | No | -- | **No** | -- |
| `logprobs` | bool | No | -- | **No** | -- |
| `user` | string | No | -- | **No** | Ignored |

### 1.3 Model Management

| Operation | Mechanism |
|-----------|-----------|
| Download | `POST /api/pull` with model name; streams progress |
| List available | `GET /api/tags` returns name, size, digest, modified date |
| List running | `GET /api/ps` returns loaded models with memory usage |
| Inspect | `POST /api/show` returns Modelfile, license, template, parameters |
| Create custom | `POST /api/create` from Modelfile specification (FROM, PARAMETER, SYSTEM, TEMPLATE) |
| Duplicate | `POST /api/copy` from source to destination name |
| Remove | `DELETE /api/delete` by model name |
| Auto-unload | Controlled by `keep_alive` parameter (default 5 minutes) |

Ollama uses a Docker Hub-style registry model. Models are identified as `name:tag` (e.g., `llama3.2:7b`). Custom models are created via Modelfiles that specify a base model, parameter overrides, system prompts, and templates.

### 1.4 Response Shape and Streaming

**Native `/api/chat` response (non-streaming):**
```json
{
  "model": "llama3.2",
  "created_at": "2024-01-01T00:00:00.000Z",
  "message": { "role": "assistant", "content": "Hello!" },
  "done": true,
  "done_reason": "stop",
  "total_duration": 1234567890,
  "load_duration": 123456789,
  "prompt_eval_count": 10,
  "prompt_eval_duration": 100000000,
  "eval_count": 25,
  "eval_duration": 500000000
}
```

**Native streaming:** NDJSON (newline-delimited JSON). Each line is a complete JSON object. The final object has `"done": true` with timing and token count fields.

**OpenAI-compatible streaming:** Server-Sent Events (SSE) with `data: {json}\n\n` format, terminated by `data: [DONE]`.

**Token reporting:** Native endpoints report `prompt_eval_count`, `eval_count`, and duration in nanoseconds. OpenAI-compatible endpoints report `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens`.

### 1.5 Performance and Resource Parameters

| Parameter | Scope | Purpose |
|-----------|-------|---------|
| `num_gpu` | Options | GPU layer offload count; 0 = CPU-only |
| `num_thread` | Options | CPU parallelism for non-GPU layers |
| `num_ctx` | Options | Context window; directly affects memory usage |
| `num_batch` | Options | Prompt evaluation batch size |
| `num_keep` | Options | Tokens retained in context pruning |
| `main_gpu` | Options | Primary GPU selection for multi-GPU |
| `low_vram` | Options | Trade speed for lower VRAM consumption |
| `use_mmap` | Options | Memory-mapped model loading |
| `use_mlock` | Options | Prevent OS from swapping model memory |
| `numa` | Options | NUMA-optimized allocation |

Quantization is determined by the model variant pulled (e.g., `q4_0`, `q5_K_M`). Ollama does not perform quantization at runtime; it is baked into the model file (GGUF format).

### 1.6 Behavioral Peculiarities

- **keep_alive**: Models remain loaded in memory for `keep_alive` duration after last request. Default 5 minutes. `"0"` unloads immediately. `"-1"` keeps loaded indefinitely. First request to a cold model incurs loading latency (seconds to tens of seconds depending on model size).
- **Modelfile system**: Declarative model customization via FROM (base model), PARAMETER (defaults), SYSTEM (system prompt), TEMPLATE (Go template for prompt formatting), ADAPTER (LoRA), LICENSE, MESSAGE (pre-seeded conversation).
- **Automatic model loading**: Ollama loads the requested model on first request if not already loaded. No explicit load API required (though `/api/pull` must have been run first).
- **Single concurrent model (default)**: By default, Ollama loads one model at a time. Setting `OLLAMA_NUM_PARALLEL` and `OLLAMA_MAX_LOADED_MODELS` environment variables enables concurrent model serving.
- **Duration reporting in nanoseconds**: Native API reports all durations in nanoseconds, not milliseconds.
- **API key ignored**: OpenAI-compatible endpoints accept but ignore the API key header.

### 1.7 Boundary Classification

| Concept | Classification |
|---------|---------------|
| Chat completions | Universal |
| Text completions | Universal |
| Embeddings | Universal |
| Streaming | Universal (but NDJSON native vs SSE for OAI-compat) |
| Temperature, top_p, top_k | Common |
| Mirostat sampling | Distinctive (shared with llama.cpp) |
| Model pull/push registry | Distinctive (Ollama-specific) |
| keep_alive auto-unload | Local-Only |
| Modelfile system | Local-Only |
| num_gpu layer offloading | Local-Only |
| Duration in nanoseconds | Local-Only |
| NUMA/mmap/mlock | Local-Only |

### 1.8 OpenAI Compatibility Gaps

| Area | Gap Description |
|------|-----------------|
| `n` parameter | Not supported; always generates exactly 1 completion |
| `tool_choice` | Not supported; tools are always auto |
| `logit_bias` | Not supported |
| `logprobs` / `top_logprobs` | Not supported |
| `user` | Accepted but ignored |
| Image URLs | Not supported in multimodal; base64 only |
| `best_of` | Not supported |
| `echo` | Not supported on completions endpoint |
| Context size | Cannot be set via OpenAI API; requires Modelfile |
| Streaming default | Native defaults to `true`; OAI-compat defaults to `false` |
| `previous_response_id` | Responses API is non-stateful only |
| Function calling nuances | No `tool_choice: "required"` or named function forcing |

---

## 2. llama.cpp Server

### 2.1 Identity

| Field | Value |
|-------|-------|
| Project | [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server` binary) |
| Default URL | `http://localhost:8080` |
| API Compatibility | Native REST + OpenAI-compatible `/v1/*` + Anthropic-compatible `/v1/messages` |
| License | MIT |
| Typical Deployment | Single-machine server process; model specified at startup; multi-platform C/C++ |

### 2.2 Endpoint Inventory

#### Native Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/completion` | Text completion with full parameter control |
| POST | `/infill` | Code infilling (fill-in-middle) |
| POST | `/tokenize` | Text to token IDs |
| POST | `/detokenize` | Token IDs to text |
| POST | `/embedding` | Single text embedding |
| POST | `/embeddings` | Batch embeddings (non-OAI format) |
| POST | `/reranking` | Document relevance reranking |
| POST | `/apply-template` | Apply chat template to messages |
| GET | `/health` | Server health check |
| GET | `/slots` | Slot status (requires `--slots` flag) |
| GET | `/metrics` | Prometheus metrics (requires `--metrics` flag) |
| GET | `/props` | Server properties |
| POST | `/props` | Modify server properties |
| GET | `/lora-adapters` | List loaded LoRA adapters |
| POST | `/lora-adapters` | Set LoRA adapter scales |
| POST | `/slots/{id}?action=save` | Save slot prompt cache to file |
| POST | `/slots/{id}?action=restore` | Restore slot prompt cache from file |
| POST | `/slots/{id}?action=erase` | Erase slot cache |

#### OpenAI-Compatible Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | Chat completions |
| POST | `/v1/completions` | Text completions |
| POST | `/v1/embeddings` | Embeddings |
| GET | `/v1/models` | Model listing |

#### Anthropic-Compatible Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/messages` | Anthropic Messages API |
| POST | `/v1/messages/count_tokens` | Token counting |

#### Router-Mode Endpoints (multi-model)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/models` | List available models |
| POST | `/models/load` | Load a model into a slot |
| POST | `/models/unload` | Unload a model |

#### Native `/completion` Parameters

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `prompt` | string | Yes | -- | -- | Input text |
| `n_predict` | int | No | -1 | -1 = infinite; -2 = fill context | Max tokens to generate |
| `temperature` | float | No | 0.8 | >= 0.0 | Sampling temperature |
| `top_k` | int | No | 40 | 0 = disabled | Top-K vocabulary limit |
| `top_p` | float | No | 0.95 | [0.0, 1.0]; 1.0 = disabled | Nucleus sampling |
| `min_p` | float | No | 0.05 | [0.0, 1.0]; 0.0 = disabled | Minimum probability filter |
| `top_n_sigma` | float | No | -1.0 | -1.0 = disabled | Top-N-sigma sampling |
| `typical_p` | float | No | 1.0 | 1.0 = disabled | Locally typical sampling |
| `repeat_last_n` | int | No | 64 | -1 = context size; 0 = disabled | Penalty lookback window |
| `repeat_penalty` | float | No | 1.0 | 1.0 = disabled | Repetition penalty multiplier |
| `presence_penalty` | float | No | 0.0 | -- | Token presence penalty |
| `frequency_penalty` | float | No | 0.0 | -- | Token frequency penalty |
| `mirostat` | int | No | 0 | 0, 1, 2 | Mirostat mode |
| `mirostat_lr` | float | No | 0.1 | -- | Mirostat learning rate (eta) |
| `mirostat_ent` | float | No | 5.0 | -- | Mirostat target entropy (tau) |
| `dynatemp_range` | float | No | 0.0 | 0.0 = disabled | Dynamic temperature range |
| `dynatemp_exp` | float | No | 1.0 | -- | Dynamic temperature exponent |
| `seed` | int | No | -1 | -1 = random | RNG seed |
| `stop` | array | No | -- | String sequences | Stop sequences |
| `stream` | bool | No | false | -- | Enable SSE streaming |
| `grammar` | string | No | -- | GBNF syntax | Grammar constraint |
| `grammar_file` | string | No | -- | File path | Grammar from file |
| `json_schema` | object | No | -- | Valid JSON Schema | JSON schema constraint |
| `json_schema_file` | string | No | -- | File path | JSON schema from file |
| `image_data` | array | No | -- | Base64 objects | Multimodal image input |
| `id_slot` | int | No | -1 | -1 = auto | Target specific slot |
| `cache_prompt` | bool | No | true | -- | Reuse KV cache from matching prefix |
| `n_probs` | int | No | 0 | -- | Return top-N token probabilities |
| `samplers` | array | No | default chain | Ordered list | Sampling chain order |
| `xtc_probability` | float | No | 0.0 | 0.0 = disabled | XTC sampling probability |
| `xtc_threshold` | float | No | 0.1 | -- | XTC threshold |
| `dry_multiplier` | float | No | 0.0 | 0.0 = disabled | DRY sampling multiplier |
| `dry_base` | float | No | 1.75 | -- | DRY base value |
| `dry_allowed_length` | int | No | 2 | -- | DRY allowed length |
| `dry_penalty_last_n` | int | No | -1 | -1 = context size | DRY penalty window |
| `adaptive_target` | float | No | -1.0 | negative = disabled | Adaptive-p target |
| `adaptive_decay` | float | No | 0.9 | -- | Adaptive-p decay rate |

### 2.3 Model Management

| Operation | Mechanism |
|-----------|-----------|
| Load at startup | `-m model.gguf` or `--hf-repo user/model` CLI flag |
| Model format | GGUF exclusively |
| Multi-model | Router mode with `--models` flag; load/unload via `/models/load` and `/models/unload` |
| Slot system | `-np N` configures N parallel slots for concurrent inference |
| LoRA | `--lora path` at startup; dynamic scale via `/lora-adapters` |
| Speculative decoding | `--model-draft` for draft model acceleration |
| Multimodal | `--mmproj` for vision projector; `--model-vocoder` for audio |

The default deployment is a single model loaded at server startup. The model cannot be changed without restarting the server in standard mode. Router mode (newer feature) enables multi-model management via the `/models/*` endpoints.

### 2.4 Response Shape and Streaming

**Native `/completion` response (non-streaming):**
```json
{
  "content": "generated text here",
  "stop": true,
  "generation_settings": {
    "temperature": 0.7,
    "top_k": 40,
    "top_p": 0.9
  },
  "model": "model-name",
  "prompt": "original prompt",
  "id_slot": 0,
  "tokens_predicted": 25,
  "tokens_evaluated": 10,
  "tokens_cached": 10,
  "timings": {
    "prompt_n": 10,
    "prompt_ms": 50.0,
    "predicted_n": 25,
    "predicted_ms": 200.0,
    "predicted_per_token_ms": 8.0,
    "predicted_per_second": 125.0
  }
}
```

**Streaming format:** Server-Sent Events (SSE) with `data: {json}\n\n` per chunk. Final chunk: `data: [DONE]`.

**Token reporting:** Native reports `tokens_predicted`, `tokens_evaluated`, `tokens_cached` with millisecond timing. OpenAI-compat reports standard `usage` object.

### 2.5 Performance and Resource Parameters

#### Server Startup Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `-ngl`, `--gpu-layers N` | 0 | Layers offloaded to GPU VRAM |
| `-c`, `--ctx-size N` | 0 (model default) | Context window size |
| `-t`, `--threads N` | auto | CPU threads for generation |
| `-tb`, `--threads-batch N` | auto | CPU threads for batch processing |
| `-b`, `--batch-size N` | 2048 | Logical batch size for prompt eval |
| `-ub`, `--ubatch-size N` | 512 | Physical batch size |
| `-np`, `--parallel N` | auto | Number of concurrent slots |
| `-cb`, `--cont-batching` | on | Continuous batching |
| `-ts`, `--tensor-split` | -- | Split model across GPUs by fraction |
| `-sm`, `--split-mode` | layer | `none`, `layer`, `row` |
| `--cache-prompt` | on | Enable prompt KV cache reuse |
| `--cache-reuse N` | 0 | Chunk size for cache reuse |
| `-cram`, `--cache-ram N` | 8192 MiB | Max KV cache size |
| `-kvu`, `--kv-unified` | auto | Unified KV buffer |
| `--keep N` | 0 | Tokens to keep from initial prompt |
| `--poll LEVEL` | 50 | Thread polling level (0-100) |

### 2.6 Behavioral Peculiarities

- **Slot-based concurrency**: Requests are assigned to slots. The `-np` flag determines how many requests can be processed concurrently. Each slot maintains its own KV cache. Slots can be saved/restored/erased via the slots API.
- **Grammar-constrained output (GBNF)**: llama.cpp supports GBNF (Generalized Backus-Naur Form) grammars for constraining output structure. This is more powerful than JSON mode -- it can enforce arbitrary syntactic structures.
- **JSON Schema constraints**: Can accept JSON Schema directly (converted to grammar internally). Available via `json_schema` parameter or `response_format` in OAI-compat mode.
- **Sampler chain ordering**: The `samplers` parameter accepts an ordered array defining the sequence of sampling operations (e.g., `["top_k", "tfs_z", "typical_p", "top_p", "min_p", "temperature"]`).
- **DRY sampling**: Advanced repetition penalty that detects repeated n-gram patterns (unique to llama.cpp ecosystem).
- **XTC sampling**: Cross-token consistency sampling (unique to llama.cpp ecosystem).
- **Dynamic temperature**: Temperature varies based on token entropy via `dynatemp_range`.
- **Prompt caching**: KV cache is reused when a new prompt shares a prefix with a previous prompt in the same slot.
- **No built-in model registry**: Unlike Ollama, there is no pull/push mechanism. Models must be obtained separately as GGUF files.

### 2.7 Boundary Classification

| Concept | Classification |
|---------|---------------|
| Chat completions | Universal |
| Text completions | Universal |
| Embeddings | Universal |
| Streaming (SSE) | Universal |
| Temperature, top_p, top_k | Common |
| min_p | Common (shared with Ollama, vLLM) |
| Mirostat | Distinctive (shared with Ollama) |
| GBNF grammar | Distinctive |
| Slot management | Local-Only |
| DRY/XTC sampling | Local-Only |
| Dynamic temperature | Local-Only |
| Sampler chain ordering | Local-Only |
| Reranking endpoint | Local-Only |
| Prompt cache save/restore | Local-Only |
| LoRA dynamic scaling | Distinctive |
| Tokenize/detokenize endpoints | Distinctive |

### 2.8 OpenAI Compatibility Gaps

| Area | Gap Description |
|------|-----------------|
| `n` parameter | Limited support; multi-completion generation not parallel |
| `logit_bias` | Partial or absent depending on build |
| `user` | Ignored |
| `best_of` | Not supported |
| Model switching | Not supported in standard mode; requires router mode |
| `tool_choice` options | Limited compared to OpenAI |
| Streaming format | Uses `data: [DONE]` but timing/content chunking may differ |
| Extra params accepted | `min_p`, `mirostat`, `grammar`, `json_schema` pass through to native engine; not standard OpenAI |
| Response IDs | Generated locally; not globally unique in OpenAI style |
| Rate limiting | No built-in rate limiting; relies on slot availability |

---

## 3. vLLM

### 3.1 Identity

| Field | Value |
|-------|-------|
| Project | [vLLM](https://github.com/vllm-project/vllm) |
| Default URL | `http://localhost:8000` |
| API Compatibility | OpenAI-compatible (primary interface); no separate native API |
| License | Apache 2.0 |
| Typical Deployment | GPU server (NVIDIA/AMD); production inference; single or multi-GPU; container or bare-metal |

### 3.2 Endpoint Inventory

#### OpenAI-Compatible Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | Chat completions |
| POST | `/v1/completions` | Text completions |
| POST | `/v1/embeddings` | Text embeddings |
| GET | `/v1/models` | List served models |
| POST | `/v1/responses` | Responses API (stateful) |
| POST | `/v1/audio/transcriptions` | Whisper-compatible transcription |
| POST | `/v1/audio/translations` | Audio translation |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |
| POST | `/tokenize` | Tokenize text |
| POST | `/detokenize` | Detokenize tokens |

#### `/v1/chat/completions` Parameters (Standard + vLLM Extensions)

**Standard OpenAI Parameters:**

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `model` | string | Yes | -- | Must match served model | Model identifier |
| `messages` | array | Yes | -- | role/content objects | Conversation messages |
| `temperature` | float | No | 1.0 | >= 0.0 | Sampling temperature |
| `top_p` | float | No | 1.0 | (0.0, 1.0] | Nucleus sampling |
| `max_tokens` | int | No | 16 | > 0 | Maximum output tokens |
| `max_completion_tokens` | int | No | -- | > 0 | Alias for max_tokens |
| `stream` | bool | No | false | -- | Enable SSE streaming |
| `stop` | string or array | No | -- | Up to 4 sequences | Stop sequences |
| `n` | int | No | 1 | >= 1 | Number of completions to return |
| `presence_penalty` | float | No | 0.0 | [-2.0, 2.0] | Presence penalty |
| `frequency_penalty` | float | No | 0.0 | [-2.0, 2.0] | Frequency penalty |
| `logprobs` | bool | No | false | -- | Return log probabilities |
| `top_logprobs` | int | No | -- | [0, 20] | Number of top logprobs per token |
| `logit_bias` | object | No | -- | Token ID to bias mapping | Logit bias |
| `seed` | int | No | -- | -- | Deterministic generation |
| `response_format` | object | No | -- | `type: "json_object"` or `json_schema` | Structured output |
| `tools` | array | No | -- | Function definitions | Tool/function calling |
| `tool_choice` | string or object | No | -- | `"auto"`, `"none"`, `"required"`, or named | Tool selection strategy |
| `stream_options` | object | No | -- | `include_usage` | Streaming usage reporting |
| `user` | string | No | -- | -- | User identifier |

**vLLM-Specific Extension Parameters (via `extra_body` or direct merge):**

| Parameter | Type | Default | Range/Constraints | Semantic Purpose |
|-----------|------|---------|-------------------|------------------|
| `best_of` | int | -- | >= `n` | Generate N candidates, return best `n` |
| `top_k` | int | 0 | -1 = all; 0 = disabled | Top-K sampling (not in OpenAI standard) |
| `min_p` | float | 0.0 | [0.0, 1.0] | Minimum probability filter |
| `repetition_penalty` | float | 1.0 | > 0.0; 1.0 = disabled | Multiplicative repetition penalty |
| `min_tokens` | int | 0 | >= 0 | Minimum tokens before stop/EOS |
| `stop_token_ids` | array | -- | Token ID integers | Stop on specific token IDs |
| `ignore_eos` | bool | false | -- | Continue past EOS token |
| `skip_special_tokens` | bool | true | -- | Omit special tokens from output |
| `spaces_between_special_tokens` | bool | true | -- | Insert spaces between special tokens |
| `include_stop_str_in_output` | bool | false | -- | Include stop string in output text |
| `logit_bias` | object | -- | `{token_id: bias}` | Per-token logit bias |
| `allowed_token_ids` | array | -- | Token ID integers | Restrict generation to listed tokens |
| `bad_words` | array | -- | String list | Disallowed output words |
| `thinking_token_budget` | int | -- | -- | Max tokens for reasoning/thinking |
| `prompt_logprobs` | int | -- | -- | Logprobs for prompt tokens |
| `truncate_prompt_tokens` | int | -- | -- | Truncate prompt if too long |

**Guided Decoding Parameters (via `extra_body`):**

| Parameter | Type | Purpose |
|-----------|------|---------|
| `guided_json` | object or string | Constrain output to JSON schema |
| `guided_regex` | string | Constrain output to regex pattern |
| `guided_choice` | array | Force output to be one of listed choices |
| `guided_grammar` | string | Constrain output via context-free grammar |
| `guided_decoding_backend` | string | Override backend: `"outlines"` or `"lm-format-enforcer"` |

Note: `guided_*` parameters are being deprecated in favor of the unified `structured_outputs` parameter in newer vLLM versions.

### 3.3 Model Management

| Operation | Mechanism |
|-----------|-----------|
| Load at launch | `--model` flag specifies HuggingFace model ID or local path |
| Model format | HuggingFace Transformers, GGUF, AWQ, GPTQ, and other quantized formats |
| Multi-model | Not natively supported within single process; use multiple vLLM instances or vLLM production stack |
| Model listing | `GET /v1/models` returns the served model(s) |
| LoRA | `--enable-lora` flag; specify adapters at launch |
| No runtime model switching | Model is fixed at server startup; restart required to change |

### 3.4 Response Shape and Streaming

Response format is standard OpenAI shape:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "meta-llama/Llama-3-8B-Instruct",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "..." },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  }
}
```

**Streaming:** Standard SSE format with `data: {json}\n\n` chunks and `data: [DONE]` terminator. Fully compatible with OpenAI streaming clients.

### 3.5 Performance and Resource Parameters

#### Engine Launch Arguments

| Argument | Type | Default | Purpose |
|----------|------|---------|---------|
| `--model` | string | required | HuggingFace model ID or path |
| `--tokenizer` | string | model default | Custom tokenizer path |
| `--gpu-memory-utilization` | float | 0.9 | Fraction of GPU memory to use for KV cache |
| `--max-model-len` | int | model config | Maximum sequence length |
| `--tensor-parallel-size` | int | 1 | Number of GPUs for tensor parallelism |
| `--pipeline-parallel-size` | int | 1 | Pipeline parallelism stages |
| `--dtype` | string | `"auto"` | Weight data type: `bfloat16`, `float16`, `auto` |
| `--quantization` | string | None | Quantization method (awq, gptq, fp8, bitsandbytes, etc.) |
| `--kv-cache-dtype` | string | auto | KV cache data type; `fp8` halves cache memory |
| `--max-num-seqs` | int | 256 | Maximum concurrent sequences |
| `--max-num-batched-tokens` | int | auto | Maximum tokens per iteration |
| `--block-size` | int | 16 | KV cache block size for PagedAttention |
| `--swap-space` | int | 4 GB | CPU swap space for KV cache offload |
| `--seed` | int | 0 | Random seed |
| `--enforce-eager` | bool | false | Disable CUDA graph optimization |
| `--trust-remote-code` | bool | false | Allow model code execution |
| `--enable-lora` | bool | false | Enable LoRA adapter serving |
| `--max-loras` | int | -- | Maximum concurrent LoRA adapters |
| `--max-lora-rank` | int | -- | Maximum LoRA rank |
| `--host` | string | `0.0.0.0` | Listen address |
| `--port` | int | 8000 | Listen port |
| `--api-key` | string | -- | API authentication key |
| `--served-model-name` | string | model name | Override model name in API responses |
| `--disable-log-stats` | bool | false | Suppress throughput logging |
| `--load-format` | string | auto | Model loading format |

### 3.6 Behavioral Peculiarities

- **PagedAttention**: vLLM's core innovation. KV cache is managed in non-contiguous memory blocks (like OS virtual memory paging). This eliminates memory fragmentation and enables near-optimal GPU memory utilization for concurrent requests.
- **Continuous batching**: New requests are dynamically added to the current batch without waiting for all in-flight requests to complete. This maximizes GPU utilization.
- **Guided decoding backends**: Supports `outlines` and `lm-format-enforcer` for structured output. Backend can be selected per-request.
- **Pre-allocated GPU memory**: At startup, vLLM allocates `gpu-memory-utilization` fraction of GPU memory for KV cache. This is NOT dynamically adjusted.
- **No built-in model download**: Unlike Ollama, vLLM expects models to be available locally or accessible via HuggingFace Hub (downloaded on first use with caching).
- **Production-oriented**: Designed for high-throughput serving. Includes Prometheus metrics, health checks, and request queuing out of the box.
- **Speculative decoding**: Supports draft model acceleration for faster inference.

### 3.7 Boundary Classification

| Concept | Classification |
|---------|---------------|
| Chat completions | Universal |
| Text completions | Universal |
| Embeddings | Universal |
| Streaming (SSE) | Universal |
| Temperature, top_p, frequency_penalty, presence_penalty | Universal |
| `n` parameter (multiple completions) | Common |
| `logprobs` | Common |
| `tool_choice` | Common |
| `top_k` | Common (not in OpenAI standard) |
| `min_p` | Common (not in OpenAI standard) |
| `best_of` | Distinctive |
| `guided_json` / `guided_regex` / `guided_choice` / `guided_grammar` | Distinctive |
| `repetition_penalty` | Distinctive |
| `min_tokens` | Distinctive |
| `stop_token_ids` | Distinctive |
| PagedAttention configuration | Local-Only |
| `gpu-memory-utilization` | Local-Only |
| Tensor/pipeline parallelism | Local-Only |
| Continuous batching configuration | Local-Only |

### 3.8 OpenAI Compatibility Gaps

| Area | Gap Description |
|------|-----------------|
| `image_url.detail` | Not supported for vision models |
| Fine-tuning API | Not supported |
| Assistants API | Not supported |
| Files API | Batch processing has limited file support |
| Audio TTS | Model-dependent |
| `best_of` | Extra parameter not in OpenAI spec |
| `top_k` | Extra parameter not in OpenAI spec |
| `min_p` | Extra parameter not in OpenAI spec |
| `repetition_penalty` | Extra parameter not in OpenAI spec; conflicts semantically with `frequency_penalty` and `presence_penalty` |
| `guided_*` params | Extra parameters not in OpenAI spec (deprecated, migrating to `structured_outputs`) |
| Response IDs | Locally generated; not globally unique |
| Model names | Typically HuggingFace IDs (e.g., `meta-llama/Llama-3-8B-Instruct`) unless overridden |
| Billing/usage fields | No billing-related fields |
| Rate limits | No built-in rate limiting headers |
| Content filtering | No built-in moderation |

---

## 4. LM Studio

### 4.1 Identity

| Field | Value |
|-------|-------|
| Project | [LM Studio](https://lmstudio.ai/) |
| Default URL | `http://localhost:1234` |
| API Compatibility | Native REST v1 + OpenAI-compatible `/v1/*` + Anthropic-compatible `/v1/messages` |
| License | Proprietary (free for personal use) |
| Typical Deployment | Desktop application (macOS/Windows/Linux); GUI-first with embedded server |

### 4.2 Endpoint Inventory

#### Native REST API v1

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/chat` | Native chat with enhanced stats |
| GET | `/api/v1/models` | List all models with metadata (loaded state, quantization, context) |
| POST | `/api/v1/models/load` | Load model into memory |
| POST | `/api/v1/models/unload` | Unload model from memory |
| POST | `/api/v1/models/download` | Download model from HuggingFace |
| GET | `/api/v1/models/download-status` | Download progress |

#### OpenAI-Compatible Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | Chat completions |
| POST | `/v1/completions` | Text completions |
| POST | `/v1/embeddings` | Embeddings |
| GET | `/v1/models` | Model listing |
| POST | `/v1/responses` | Stateful responses (with `previous_response_id`) |

#### Anthropic-Compatible Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/messages` | Claude-compatible Messages API |

#### `/v1/chat/completions` Parameters

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `model` | string | Yes | -- | Must be loaded or available | Model identifier |
| `messages` | array | Yes | -- | role/content objects | Conversation messages |
| `temperature` | float | No | model default | >= 0.0 | Sampling temperature |
| `top_p` | float | No | model default | (0.0, 1.0] | Nucleus sampling |
| `max_tokens` | int | No | -- | > 0 | Max output tokens |
| `stream` | bool | No | false | -- | SSE streaming |
| `stop` | string or array | No | -- | -- | Stop sequences |
| `tools` | array | No | -- | Function definitions | Tool/function calling |
| `tool_choice` | string | No | `"auto"` | `"auto"`, `"none"`, `"required"` | Tool selection mode |
| `response_format` | object | No | -- | JSON schema | Structured output |
| `stream_options` | object | No | -- | `include_usage` | Usage in streaming |

**LM Studio Extension Parameters:**

| Parameter | Type | Default | Semantic Purpose |
|-----------|------|---------|------------------|
| `draft_model` | string | -- | Speculative decoding draft model |
| `ttl` | int | -- | Auto-unload after N seconds of inactivity |

### 4.3 Model Management

| Operation | Mechanism |
|-----------|-----------|
| Browse/discover | GUI model browser with HuggingFace integration |
| Download | GUI or `POST /api/v1/models/download` |
| Load | GUI or `POST /api/v1/models/load` with `context_length`, `gpu_offload` |
| Unload | GUI or `POST /api/v1/models/unload` |
| List | `GET /api/v1/models` returns loaded state, architecture, quantization, max context |
| Auto-unload | `ttl` parameter for idle timeout |
| Model format | GGUF primarily; some HuggingFace format support |
| Multi-model | Can load multiple models simultaneously via API |

LM Studio provides a GUI-first experience. The model browser shows compatibility ratings, parameter counts, quantization variants, and estimated RAM requirements. API-based model management was added in v0.4.0+.

### 4.4 Response Shape and Streaming

Response format follows OpenAI standard:
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "model-identifier",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "..." },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  }
}
```

**Native API enhanced stats:** The native `/api/v1/chat` endpoint returns additional performance metrics including tokens/second and time-to-first-token (TTFT).

**Streaming:** Standard SSE format, compatible with OpenAI clients.

**Reasoning models:** For models like DeepSeek R1, the response includes a separate `reasoning_content` field alongside `content`.

### 4.5 Performance and Resource Parameters

LM Studio's performance configuration is primarily GUI-driven:

| Setting | Control | Purpose |
|---------|---------|---------|
| GPU offload | GUI slider or API `gpu_offload` | Layers offloaded to GPU |
| Context length | GUI or API `context_length` | Context window size |
| Speculative decoding | `draft_model` parameter | Faster inference with draft model |
| Model quantization | Selected at download time | GGUF quantization variant |
| Auto-eviction | `ttl` parameter | Memory management via idle timeout |

### 4.6 Behavioral Peculiarities

- **Desktop-first**: LM Studio is a GUI application. The API server is a feature of the desktop app, not a standalone server. The app must be running for the API to be available.
- **Model compatibility matrix**: The GUI provides compatibility ratings for models with the user's hardware. Not all GGUF models work equally well.
- **Multi-protocol**: Uniquely supports OpenAI, Anthropic, and native REST APIs simultaneously from the same server.
- **MCP integration**: Built-in support for Model Context Protocol (MCP) server plugins for tool access.
- **Speculative decoding**: Native support for draft model acceleration via `draft_model` parameter.
- **Reasoning content separation**: Automatically separates thinking/reasoning from final output for R1-style models.
- **Preset system**: Configuration presets can be applied to requests.
- **No CLI-only mode**: Cannot run headless without the desktop application (as of current version).

### 4.7 Boundary Classification

| Concept | Classification |
|---------|---------------|
| Chat completions | Universal |
| Text completions | Universal |
| Embeddings | Universal |
| Streaming (SSE) | Universal |
| Temperature, top_p | Common |
| Tool calling with tool_choice | Common |
| Structured output (JSON schema) | Common |
| Responses API | Distinctive |
| Anthropic Messages compatibility | Distinctive |
| `draft_model` speculative decoding | Local-Only |
| `ttl` auto-unload | Local-Only |
| GUI model management | Local-Only |
| Native REST v1 enhanced stats | Local-Only |
| MCP integration | Distinctive |

### 4.8 OpenAI Compatibility Gaps

| Area | Gap Description |
|------|-----------------|
| `logit_bias` | Support status unclear |
| `logprobs` | Model-dependent; not universally supported |
| `best_of` | Not supported |
| `user` | Accepted but likely ignored |
| Fine-tuning API | Not supported |
| Assistants API | Not supported |
| Files/Batch API | Not supported |
| Moderation API | Not supported |
| Audio API | Not supported |
| Model names | Uses local model identifiers, not OpenAI model names |
| Rate limits | No built-in rate limiting |
| Content filtering | No built-in moderation |
| Intel Mac | Not currently supported |
| Prompt template control | Some models require manual template configuration |

---

## 5. text-generation-webui

### 5.1 Identity

| Field | Value |
|-------|-------|
| Project | [text-generation-webui](https://github.com/oobabooga/text-generation-webui) (aka "oobabooga") |
| Default URL | `http://localhost:5000` (API); `http://localhost:7860` (WebUI) |
| API Compatibility | OpenAI-compatible + Anthropic-compatible + internal endpoints |
| License | AGPL-3.0 |
| Typical Deployment | Single-machine; Python/Gradio web application; multiple backend engines |

### 5.2 Endpoint Inventory

#### OpenAI-Compatible Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | Chat completions |
| POST | `/v1/completions` | Text completions |
| POST | `/v1/embeddings` | Embeddings (via SentenceTransformer) |
| GET | `/v1/models` | List loaded models |
| GET | `/v1/models/{id}` | Single model info |
| POST | `/v1/images/generations` | Image generation (base64 JSON) |
| POST | `/v1/moderations` | Basic content moderation |
| POST | `/v1/audio/*` | Audio operations |

#### Internal Extension Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/internal/logits` | Raw token probabilities |
| GET | `/v1/internal/model/list` | Enumerate available models |
| POST | `/v1/internal/model/load` | Dynamic model loading |

#### `/v1/chat/completions` Parameters

| Parameter | Type | Required | Default | Range/Constraints | Semantic Purpose |
|-----------|------|----------|---------|-------------------|------------------|
| `model` | string | No | loaded model | -- | Model selection (if multiple) |
| `messages` | array | Yes | -- | role/content objects | Conversation messages |
| `temperature` | float | No | backend default | >= 0.0 | Sampling temperature |
| `top_p` | float | No | backend default | (0.0, 1.0] | Nucleus sampling |
| `top_k` | int | No | backend default | -- | Top-K sampling |
| `min_p` | float | No | backend default | [0.0, 1.0] | Minimum probability filter |
| `max_tokens` | int | No | -- | > 0 | Max output tokens |
| `stream` | bool | No | false | -- | SSE streaming |
| `stop` | string or array | No | -- | -- | Stop sequences |
| `tools` | array | No | -- | Function definitions | Tool/function calling |
| `seed` | int | No | -- | -- | RNG seed |
| `logprobs` | bool | No | false | -- | Return log probabilities |

**text-generation-webui Extension Parameters:**

| Parameter | Type | Purpose |
|-----------|------|---------|
| `mode` | string | Chat mode: `"chat"`, `"chat-instruct"`, `"instruct"` |
| `character` | string | Character name for roleplay mode |
| `instruction_template` | string | Override prompt template (auto-detected by default) |
| `use_samplers` | bool | Apply sampling to logits endpoint |

### 5.3 Model Management

| Operation | Mechanism |
|-----------|-----------|
| List available | `GET /v1/internal/model/list` or GUI model dropdown |
| Load model | `POST /v1/internal/model/load` with backend args, or GUI |
| Switch models | Load new model via API or GUI; supports hot-swapping |
| Model formats | GGUF, HuggingFace Transformers, GPTQ, EXL2, AWQ, TensorRT-LLM |
| Backend selection | llama.cpp, Transformers, ExLlamaV3, TensorRT-LLM |
| LoRA | Dynamic LoRA attachment via GUI or API args |

Key differentiator: text-generation-webui supports multiple inference backends. The same model might be loaded via llama.cpp (GGUF), ExLlamaV3 (EXL2), or HuggingFace Transformers, each with different performance characteristics.

### 5.4 Response Shape and Streaming

Response format follows OpenAI standard:
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "loaded-model-name",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "...",
      "reasoning_content": "..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  }
}
```

**Streaming:** SSE format: `data: {json}\n\n`. Uses `sse-starlette` library. `data: [DONE]` terminator.

**Logprobs:** Full spec-compliant logprobs across llama.cpp, ExLlamaV3, and Transformers backends (both streaming and non-streaming).

**Reasoning content:** `reasoning_content` field for thinking blocks in both streaming and non-streaming chat completions.

### 5.5 Performance and Resource Parameters

Performance is backend-dependent. Configuration via API model load args or GUI:

| Parameter | Scope | Purpose |
|-----------|-------|---------|
| `ctx_size` | Model load | Context window size |
| `flash_attn` | Model load | Enable flash attention |
| `cache_type` | Model load | KV cache format |
| `n_gpu_layers` | Model load (llama.cpp) | GPU offload layers |
| `threads` | Model load (llama.cpp) | CPU threads |
| `batch_size` | Model load | Batch processing size |

### 5.6 Behavioral Peculiarities

- **Multi-backend architecture**: Unlike single-engine runtimes, text-generation-webui wraps multiple inference backends (llama.cpp, Transformers, ExLlamaV3, TensorRT-LLM). Backend selection affects available parameters, performance characteristics, and model format compatibility.
- **Extension system**: Modular extension architecture. The OpenAI-compatible API itself is an extension (`extensions/openai/`). Other extensions: TTS, web search, web RAG, image generation (ComfyUI), character/roleplay, training.
- **Character/roleplay mode**: Unique `mode` and `character` parameters enable persona-based conversation. Not present in other runtimes.
- **Gradio web interface**: Primary interface is a Gradio-based web UI. API mode is secondary (enabled with `--api` flag).
- **`--nowebui` flag**: Can run API-only without the Gradio interface.
- **Multimodal support**: Vision models via `image_url` in messages. Multiple images per request. Base64 encoding.
- **Jinja2 templates**: Automatic prompt template detection and application using model-provided Jinja2 templates.
- **AGPL license**: Copyleft license; derivative works must be open-sourced. This has implications for commercial integration.

### 5.7 Boundary Classification

| Concept | Classification |
|---------|---------------|
| Chat completions | Universal |
| Text completions | Universal |
| Embeddings | Universal |
| Streaming (SSE) | Universal |
| Temperature, top_p, top_k | Common |
| Logprobs | Common |
| Tool calling | Common |
| Image generation | Distinctive |
| Audio endpoints | Distinctive |
| Moderation endpoint | Distinctive |
| Internal logits endpoint | Local-Only |
| Internal model management | Local-Only |
| `mode` / `character` parameters | Local-Only |
| Multi-backend selection | Local-Only |
| Extension system | Local-Only |

### 5.8 OpenAI Compatibility Gaps

| Area | Gap Description |
|------|-----------------|
| `n` parameter | Not supported; single completion only |
| `best_of` | Not supported |
| `logit_bias` | Not supported |
| `tool_choice` | Limited support; model-dependent |
| `user` | Ignored |
| Image generation | Returns base64 JSON only; no URL-based responses |
| Moderation | Basic implementation via embeddings; not equivalent to OpenAI moderation |
| Embedding dimensions | Fixed 768 or 384; not all embedding models supported |
| Model names | Local model names; no mapping to OpenAI model IDs |
| Streaming chunk boundaries | May differ from OpenAI token-by-token granularity |
| Fine-tuning API | Has training capability, but not via OpenAI API format |
| Assistants/Files/Batch | Not supported |
| Rate limits | No built-in rate limiting |

---

## 6. Cross-Runtime Comparison

### 6.1 Endpoint Coverage Matrix

| Endpoint | Ollama | llama.cpp | vLLM | LM Studio | text-gen-webui |
|----------|--------|-----------|------|-----------|----------------|
| `/v1/chat/completions` | Yes | Yes | Yes | Yes | Yes |
| `/v1/completions` | Yes | Yes | Yes | Yes | Yes |
| `/v1/embeddings` | Yes | Yes | Yes | Yes | Yes |
| `/v1/models` | Yes | Yes | Yes | Yes | Yes |
| `/v1/responses` | Partial | No | Yes | Yes | No |
| `/v1/messages` (Anthropic) | No | Yes | No | Yes | No |
| `/v1/images/generations` | Experimental | No | No | No | Yes |
| `/v1/audio/*` | No | No | Yes | No | Yes |
| Tokenize/detokenize | No | Yes | Yes | No | No |
| Health/metrics | No | Yes | Yes | No | No |
| Native chat/generate | Yes | Yes | No | Yes | No |
| Model pull/download | Yes | No | No | Yes | No |
| Model load/unload | Implicit | Router mode | No | Yes | Yes |
| Reranking | No | Yes | No | No | No |

### 6.2 Parameter Support Matrix

| Parameter | Ollama | llama.cpp | vLLM | LM Studio | text-gen-webui |
|-----------|--------|-----------|------|-----------|----------------|
| `temperature` | Yes | Yes | Yes | Yes | Yes |
| `top_p` | Yes | Yes | Yes | Yes | Yes |
| `top_k` | Yes (options) | Yes | Yes (extra) | Backend | Yes |
| `min_p` | Yes (options) | Yes | Yes (extra) | Backend | Yes |
| `max_tokens` | Yes | Yes | Yes | Yes | Yes |
| `n` (multi-completion) | No | Limited | Yes | No | No |
| `stop` | Yes | Yes | Yes | Yes | Yes |
| `seed` | Yes | Yes | Yes | Yes | Yes |
| `stream` | Yes | Yes | Yes | Yes | Yes |
| `frequency_penalty` | Yes | Yes | Yes | Yes | Backend |
| `presence_penalty` | Yes | Yes | Yes | Yes | Backend |
| `logprobs` | No | Yes | Yes | Limited | Yes |
| `logit_bias` | No | Partial | Yes | Unknown | No |
| `tool_choice` | No | Limited | Yes | Yes | Limited |
| `response_format` | Yes | Yes | Yes | Yes | Backend |
| `mirostat` | Yes | Yes | No | No | Backend |
| `repeat_penalty` | Yes | Yes | Yes (as `repetition_penalty`) | Backend | Backend |
| `grammar` (GBNF) | No | Yes | No | No | Backend |
| `guided_json` | No | No | Yes | No | No |
| `guided_regex` | No | No | Yes | No | No |
| `best_of` | No | No | Yes | No | No |
| `min_tokens` | No | No | Yes | No | No |

### 6.3 Streaming Protocol Comparison

| Runtime | Native Streaming | OAI-Compat Streaming | Terminator |
|---------|-----------------|---------------------|------------|
| Ollama | NDJSON (newline-delimited JSON) | SSE (`data: {json}\n\n`) | `"done": true` (native) / `data: [DONE]` (OAI) |
| llama.cpp | SSE | SSE | `data: [DONE]` |
| vLLM | N/A (OAI only) | SSE | `data: [DONE]` |
| LM Studio | SSE | SSE | `data: [DONE]` |
| text-gen-webui | N/A (OAI only) | SSE | `data: [DONE]` |

### 6.4 Model Format Support

| Format | Ollama | llama.cpp | vLLM | LM Studio | text-gen-webui |
|--------|--------|-----------|------|-----------|----------------|
| GGUF | Yes | Yes | Yes | Yes | Yes |
| HuggingFace (safetensors) | Via conversion | No | Yes | Limited | Yes |
| GPTQ | No | No | Yes | No | Yes |
| AWQ | No | No | Yes | No | Yes |
| EXL2 | No | No | No | No | Yes |
| TensorRT-LLM | No | No | No | No | Yes |
| FP8 | No | No | Yes | No | No |

### 6.5 Default Configuration Summary

| Setting | Ollama | llama.cpp | vLLM | LM Studio | text-gen-webui |
|---------|--------|-----------|------|-----------|----------------|
| Default port | 11434 | 8080 | 8000 | 1234 | 5000 |
| Default temperature | 0.8 | 0.8 | 1.0 | Model default | Backend default |
| Default top_p | 0.9 | 0.95 | 1.0 | Model default | Backend default |
| Default top_k | 40 | 40 | 0 (disabled) | Backend default | Backend default |
| Default context | 2048 | Model default | Model config | GUI setting | Model default |
| Default stream (native) | true | false | false | false | false |
| Auth required | No (ignored) | Optional | Optional | Optional | Optional |

### 6.6 Architectural Characteristics

| Characteristic | Ollama | llama.cpp | vLLM | LM Studio | text-gen-webui |
|----------------|--------|-----------|------|-----------|----------------|
| Primary language | Go | C/C++ | Python | Electron/C++ | Python |
| Inference engine | llama.cpp (embedded) | Native | Custom CUDA/ROCm | llama.cpp (embedded) | Multiple backends |
| Concurrency model | Single model (default) | Slot-based | Continuous batching | Multi-model | Single model |
| GPU optimization | Automatic | Manual flags | PagedAttention | GUI-controlled | Backend-dependent |
| Production readiness | Medium | Medium | High | Low | Low |
| Model registry | Built-in | None | None | GUI browser | None |
| Memory management | keep_alive auto-unload | Static (slot-based) | Pre-allocated paging | TTL auto-unload | Manual |

---

## Sources

- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama OpenAI Compatibility](https://docs.ollama.com/api/openai-compatibility)
- [llama.cpp Server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [vLLM OpenAI-Compatible Server](https://docs.vllm.ai/en/stable/serving/openai_compatible_server/)
- [vLLM Sampling Parameters](https://docs.vllm.ai/en/v0.6.4/dev/sampling_params.html)
- [vLLM Engine Arguments](https://docs.vllm.ai/en/v0.10.2/configuration/engine_args.html)
- [LM Studio Developer Docs](https://lmstudio.ai/docs/developer/)
- [LM Studio REST API Endpoints](https://lmstudio.ai/docs/developer/rest/endpoints)
- [LM Studio OpenAI Compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [text-generation-webui GitHub](https://github.com/oobabooga/text-generation-webui)
- [text-generation-webui OpenAI API Wiki](https://github.com/oobabooga/text-generation-webui/wiki/12-%E2%80%90-OpenAI-API)
