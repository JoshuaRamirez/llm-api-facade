# llm-api-facade

An MCP server that provides a universal abstraction layer for interacting with any LLM backend -- local or cloud -- through a single, stable interface.

## Core Idea

One MCP server surface. Any LLM behind it. The consumer sends a generation request using a normalized vocabulary. The facade routes it to whichever backend is configured, translating parameters and response shapes as needed. The consumer never encounters provider-specific concepts.

## What This Is Not

This project deliberately excludes:

- **Provider-specific features** -- If only one provider offers it, it does not belong on the facade surface.
- **Authentication management** -- Credential storage, rotation, and OAuth flows are integration-plane concerns.
- **Cost tracking and billing** -- Token costs vary by provider and pricing tier. The facade reports token counts; cost accounting happens elsewhere.
- **Conversation state ownership** -- The facade processes requests. It does not own or persist conversation history.
- **Model fine-tuning or training** -- Inference only.

These are real concerns. They belong in the integration plane, not the abstraction layer.

## The Seam

The architecture enforces a clean boundary -- the **seam** -- between two distinct zones:

```
  Consumer Side          |  THE SEAM  |          Provider Side
                         |            |
  Universal vocabulary   |            |   Provider-specific SDKs
  Normalized parameters  |            |   Native API formats
  Typed error categories |            |   Raw error responses
  Capability discovery   |            |   Feature negotiation
```

Nothing provider-specific crosses the seam into the consumer-facing surface. Nothing consumer-facing leaks into provider adapters. The seam is a load-bearing architectural boundary, not a convenience.

## Project Status

**Phase: Initial documentation and architectural design.**

No implementation code exists yet. The current focus is establishing principles, boundaries, and contracts before writing adapters.

## Directory Structure

```
llm-api-facade/
  README.md
  CLAUDE.md
  Documentation/
    Architecture/
      Principles.md            # 7 governing architectural principles
      DomainModel.md            # Universal concepts, behavioral contracts, the seam
      McpServerSpec.md           # MCP tools, resources, schemas, error codes
      ProviderAnalysis.md        # Cross-provider commonality analysis (11 providers)
      OntologicalTaxonomy.md     # Categorical framework, cross-validated (843 lines)
      TypeSpecification.md       # Formal types, invariants, state machine (1160 lines)
      SoftSpots.md               # 13 weak points, compound risks, revision waves
      ToolCallingChoreography.md # Multi-turn tool flows, provider divergence (1137 lines)
      PositionPaper-*.md         # Facade as information architecture (dual-layer ontology)
      ExtensionCatalog.md        # 5 concrete extensions with schemas and adapter tables
    Decisions/
      ADR-Template.md            # Lightweight ADR template
      ADR-001-*.md               # MCP as primary interface
      ADR-002-*.md               # Seam pattern for integration
      ADR-003-*.md               # Content blocks replace string
      ADR-004-*.md               # Thinking promoted to Extended Tier 2
      ADR-005-*.md               # Tool calling promoted to Extended Tier 1
      ADR-006-*.md               # Structured extensions replace opaque bag
    Vendors/
      OpenAI.md                  # Full API surface inventory (581 lines)
      Anthropic.md               # Full API surface inventory (702 lines)
      Google-Gemini.md           # Full API surface inventory (634 lines)
      Mistral-Cohere-xAI.md     # Three providers combined (811 lines)
      Local-Runtimes.md          # Ollama, llama.cpp, vLLM, LM Studio, TGW (1134 lines)
    Guides/
```

## License

TBD
