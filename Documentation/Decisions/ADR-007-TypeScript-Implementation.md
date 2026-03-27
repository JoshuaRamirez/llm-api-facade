# ADR-007: TypeScript as Implementation Language

| Field  | Value      |
|--------|------------|
| ID     | ADR-007    |
| Date   | 2026-03-27 |
| Status | Accepted   |

## Context

The conceptual model is complete and needs to be implemented. The primary delivery vehicle is an MCP server. Language candidates: TypeScript, Python, C#, Rust, Go.

## Decision

TypeScript. The `@modelcontextprotocol/sdk` is the canonical MCP server SDK, most mature, and most widely used. TypeScript's discriminated unions map directly to the ContentBlock and ContentBlockDelta type families. The Node.js ecosystem has the richest HTTP client libraries for the adapter layer.

## Consequences

- Direct access to the canonical MCP SDK without wrappers or ports.
- Discriminated unions via tagged types (`type ContentBlock = TextBlock | ToolUseBlock | ...`) with exhaustive switch checking.
- Runtime type validation needed (TypeScript types are compile-time only) — use Zod or similar for invariant enforcement at API boundaries.
- The TypeSpecification's snake_case field names will be mapped to camelCase per TypeScript convention. The MCP wire format uses the spec's snake_case.

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Python | Weaker static typing. Pydantic helps but discriminated unions are less ergonomic. MCP SDK exists but is less mature. |
| C# | Strongest type system but MCP SDK is newest and smallest community. Heavier runtime for a server that should be lightweight. |
| Rust | Excellent type system but MCP SDK is nascent. Development velocity matters more than runtime performance for a facade. |
| Go | No discriminated unions. The content block model would require interface{} or code generation. |
