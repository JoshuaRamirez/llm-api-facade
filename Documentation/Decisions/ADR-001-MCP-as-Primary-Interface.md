# ADR-001: MCP as Primary Interface

| Field  | Value      |
|--------|------------|
| ID     | ADR-001    |
| Date   | 2026-03-26 |
| Status | Accepted   |

## Context

The facade needs a protocol for exposing LLM abstraction capabilities to consumers. Candidates include REST API, gRPC, MCP (Model Context Protocol), and a custom protocol. The primary consumers are developer tools and AI agents that already operate within MCP ecosystems (Claude Code, other MCP clients).

## Decision

Use MCP as the sole public interface. All facade capabilities are exposed as MCP tools and resources. No HTTP or RPC server is maintained alongside it.

## Consequences

- Consumers must be MCP-aware. Non-MCP clients cannot interact with the facade directly.
- Tool and resource semantics come for free from the protocol. No custom request/response design needed.
- Natural integration with Claude Code and the growing MCP client ecosystem.
- No HTTP server to build, secure, or maintain. The transport layer is the MCP runtime's concern.
- If MCP adoption stalls, migrating to REST later is straightforward since internal abstractions are protocol-agnostic.

## Alternatives Considered

| Alternative      | Why Not |
|------------------|---------|
| REST API         | More universally accessible, but requires designing custom endpoints, authentication, and client SDKs. Overhead not justified when primary consumers are MCP-native. |
| gRPC             | Strong streaming support, but heavyweight tooling (protobuf compilation, code generation). Adds build complexity with no clear consumer demand. |
| Custom protocol  | Maximum flexibility, but maximum maintenance. Would duplicate work that MCP already standardizes. |
