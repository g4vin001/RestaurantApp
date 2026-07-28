import type { Role } from "@/lib/generated/prisma/client";

export const ROLES = ["CUSTOMER", "MANAGER", "EMPLOYEE"] as const satisfies readonly Role[];

export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: "/",
  MANAGER: "/manager",
  EMPLOYEE: "/employee",
};

export function parseRole(value: FormDataEntryValue | null): Role {
  return (ROLES as readonly string[]).includes(value as string) ? (value as Role) : "CUSTOMER";
}
