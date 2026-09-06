import { describe, expect, it } from "vitest";
import type { JwtPayload } from "@supabase/supabase-js";
import { identityFromClaims } from "@/lib/auth/current-identity";

function claims(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    iss: "https://example.supabase.co/auth/v1",
    sub: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    exp: 2_000_000_000,
    iat: 1_900_000_000,
    role: "authenticated",
    aal: "aal1",
    session_id: "00000000-0000-0000-0000-000000000002",
    ...overrides,
  };
}

describe("identityFromClaims", () => {
  it("maps only signed top-level identity claims", () => {
    expect(
      identityFromClaims(
        claims({
          email: "staff@example.com",
          user_metadata: {
            email: "spoofed@example.com",
            email_verified: true,
          },
        }),
      ),
    ).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      email: "staff@example.com",
    });
  });

  it("does not invent a missing email", () => {
    expect(identityFromClaims(claims())).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      email: undefined,
    });
  });
});
