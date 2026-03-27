/**
 * Categorical indicator of reasoning depth.
 * Facade-level abstraction over provider-specific reasoning controls.
 * (TypeSpecification Section 2.3)
 */
export const ReasoningEffort = {
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;

export type ReasoningEffort = (typeof ReasoningEffort)[keyof typeof ReasoningEffort];
