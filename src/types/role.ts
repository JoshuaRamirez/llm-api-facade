/**
 * Functional roles in the conversational protocol.
 * Roles are positions in a protocol, not identities.
 * (OntologicalTaxonomy Section 1.1.1)
 */
export const Role = {
  System: "system",
  User: "user",
  Assistant: "assistant",
  Tool: "tool",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Core roles available on all providers. */
export const CORE_ROLES: readonly Role[] = [Role.System, Role.User, Role.Assistant];

/** Tool role is Extended (Tier 1) — valid only when tool calling is active. */
export const EXTENDED_ROLES: readonly Role[] = [Role.Tool];
