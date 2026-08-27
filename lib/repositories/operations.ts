import type { OperationsState } from "@/lib/domain/types";
import type {
  DatabaseOperationsCommand,
  OperationsCommandResult,
} from "@/lib/repositories/commands";

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

export interface WritableOperationsRepository extends OperationsRepository {
  execute(command: DatabaseOperationsCommand): Promise<OperationsState>;
}

export function resolveOperationsRepositoryMode(
  demoModeValue: string | undefined,
): OperationsRepositoryMode {
  return demoModeValue === "true" ? "demo" : "database";
}

export type { DatabaseOperationsCommand, OperationsCommandResult };
