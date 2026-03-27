/**
 * Token consumption measurement.
 * Present on every CompletionResponse and on the final CompletionChunk.
 * (TypeSpecification Section 1.5)
 */
export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly isApproximate: boolean;
}

export function createUsage(
  inputTokens: number,
  outputTokens: number,
  isApproximate: boolean,
): Usage {
  if (inputTokens < 0) throw new Error("Usage: inputTokens must be non-negative");
  if (outputTokens < 0) throw new Error("Usage: outputTokens must be non-negative");
  return Object.freeze({ inputTokens, outputTokens, isApproximate });
}
