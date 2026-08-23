export const APPLICATION_ERROR_CODES = [
  "FETCH_FAILED",
  "UNSUPPORTED_MEDIA",
  "ITEM_TOO_LARGE",
  "DUPLICATE",
  "STORAGE_FAILED",
  "CLIPBOARD_UNSUPPORTED",
  "ARCHIVE_INVALID",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "UNKNOWN",
] as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export type ErrorDetailValue = string | number | boolean | null;

export interface SerializedApplicationError {
  code: ApplicationErrorCode;
  message: string;
  details?: Record<string, ErrorDetailValue>;
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details?: Record<string, ErrorDetailValue>;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    details?: Record<string, ErrorDetailValue>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApplicationError";
    this.code = code;
    this.details = details;
  }

  toJSON(): SerializedApplicationError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function isApplicationError(value: unknown): value is ApplicationError {
  return value instanceof ApplicationError;
}

export function serializeApplicationError(error: unknown): SerializedApplicationError {
  if (isApplicationError(error)) {
    return error.toJSON();
  }

  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
  };
}
