import "server-only";

import { randomUUID } from "node:crypto";

type ErrorWithCode = Error & { code?: unknown };

export function reportDataError(context: string, error: unknown) {
  const reference = randomUUID();
  const details: Record<string, string> = { reference };

  if (error instanceof Error) {
    details.name = error.name;
    details.message = error.message;

    const code = (error as ErrorWithCode).code;
    if (typeof code === "string") details.code = code;
  } else {
    details.name = "UnknownError";
    details.message = "A non-Error value was thrown.";
  }

  console.error(`[halina:${context}] Shared-data operation failed.`, details);
  return reference;
}
