import type { OperationsState } from "@/lib/domain/types";

export type OperationsRepositoryMode = "demo" | "database";

export type OperationsRepositoryErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "PERSISTENCE";

export class OperationsRepositoryError extends Error {
  constructor(
    readonly code: OperationsRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OperationsRepositoryError";
  }
}

export interface OperationsRepository {
  readonly mode: OperationsRepositoryMode;
  loadSnapshot(): Promise<OperationsState>;
}

export function resolveOperationsRepositoryMode(
  demoModeValue: string | undefined,
): OperationsRepositoryMode {
  return demoModeValue === "true" ? "demo" : "database";
}

export function databaseWritePending(): {
  ok: false;
  error: string;
} {
  return {
    ok: false,
    error:
      "This screen is reading shared restaurant data, but database writes are not enabled for this action yet.",
  };
}
