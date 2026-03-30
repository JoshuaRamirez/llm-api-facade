# llm-api-facade

An MCP server that provides a universal abstraction layer for interacting with any LLM backend -- local or cloud -- through a single, stable interface.

## What It Does

One MCP server surface. Any LLM behind it. The consumer sends a generation request using a normalized vocabulary. The facade routes it to whichever backend is configured, translating parameters and response shapes as needed.

The architecture has two layers:
- **Layer 1 (Universal):** Normalized types, provider-agnostic. Messages, content blocks, token usage, generation parameters, error taxonomy. Works without knowing which provider serves the request.
- **Layer 2 (Extensions):** Structured, typed, discoverable provider-specific features. Cache control, safety settings, reasoning configuration, structured output guarantees, token breakdowns.

## Quick Start

```bash
npm install
npm run build
```

The server communicates via stdio. Add it to your MCP client config:

```json
{
  "mcpServers": {
    "llm-facade": {
      "command": "node",
      "args": ["/path/to/llm-api-facade/dist/index.js"]
    }
  }
}
```

Requires [Ollama](https://ollama.com) running locally on the default port (11434).

## MCP Tools

| Tool | Description |
|------|-------------|
| `complete` | Send messages to any LLM, receive a completion. Supports tools, structured output, all sampling parameters. |
| `stream_complete` | Streaming variant. Returns accumulated chunks with usage. |
| `list_models` | List configured providers. |

## The Seam

The architecture enforces a clean boundary -- the **seam** -- between two zones:

```
  Consumer Side          |  THE SEAM  |          Provider Side

  Layer 1: Universal     | Normalizes |  Provider-specific SDKs
  Layer 2: Extensions    | Organizes  |  Native API formats
  Typed errors           |            |  Raw error responses
  Capability discovery   |            |  Feature negotiation
```

Layer 1 normalizes (many shapes into one). Layer 2 organizes (provider-specific features into typed, discoverable extensions). Infrastructure concerns (auth, retry, transport) never cross the seam.

## Current State

**Implemented and tested (32 scenarios against Ollama):**
- Text completion (batch and streaming)
- All sampling parameters (temperature, top_p, frequency/presence penalty, seed, stop sequences)
- Tool calling (single-turn, multi-turn with results, multiple tools, correct tool selection)
- Structured output (JSON mode, JSON Schema with constrained output)
- Content block model (TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ImageBlock)
- Error taxonomy (4 genera, 14 species)
- OpenAI-compatible adapter (Ollama, OpenAI, vLLM, LM Studio, llama.cpp, Mistral, xAI)

**Documented but not yet implemented:**
- Anthropic, Gemini, Cohere adapters
- Extension system (cache_control, safety_settings, reasoning_config, structured_output, token_details)
- MCP resources (models://catalog, config://state, session://{id})
- validate_request, estimate_tokens, get_model_info tools

## Documentation

```
Documentation/
  Architecture/
    Principles.md              # 8 governing principles (dual-layer)
    DomainModel.md              # Universal concepts, behavioral contracts, the seam
    McpServerSpec.md             # MCP tools, resources, schemas, error codes (v0.3.0)
    OntologicalTaxonomy.md       # Categorical framework, cross-validated
    TypeSpecification.md         # Formal types, 48+ invariants, state machine
    SoftSpots.md                 # 13 resolved weak points with positions taken
    ToolCallingChoreography.md   # Multi-turn tool flows, 7-dimension provider divergence
    PositionPaper-*.md           # Facade as information architecture
    ExtensionCatalog.md          # 5 extensions with schemas and adapter tables
  Decisions/
    ADR-001 through ADR-007      # Architecture decision records
  Vendors/
    OpenAI, Anthropic, Gemini, Mistral/Cohere/xAI, Local Runtimes
```

## License

MIT
