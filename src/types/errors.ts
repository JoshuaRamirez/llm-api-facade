/**
 * Facade error hierarchy. 4 genera, 15 species.
 * (TypeSpecification Section 5)
 */

export type ErrorCategory =
  | "precondition.validation_error"
  | "precondition.authentication"
  | "precondition.permission"
  | "precondition.model_not_found"
  | "precondition.model_not_ready"
  | "capacity.context_overflow"
  | "capacity.rate_limited"
  | "capacity.overloaded"
  | "capacity.quota_exceeded"
  | "process.content_filtered"
  | "process.timeout"
  | "process.stream_interrupted"
  | "system.provider_error"
  | "system.internal_error"
  | "system.unknown";

export class FacadeError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly providerCode: string | undefined;

  constructor(
    category: ErrorCategory,
    code: string,
    message: string,
    correlationId: string,
    retryable: boolean,
    providerCode?: string,
  ) {
    super(message);
    this.name = "FacadeError";
    this.category = category;
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
    this.providerCode = providerCode;
  }
}
