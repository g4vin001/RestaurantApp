import "server-only";

import { cache } from "react";
import type { JwtPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type HalinaAuthIdentity = {
  id: string;
  email?: string;
  emailVerified: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function identityFromClaims(
  claims: JwtPayload,
): HalinaAuthIdentity {
  const metadata = isRecord(claims.user_metadata)
    ? claims.user_metadata
    : undefined;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    emailVerified:
      claims.email_verified === true ||
      typeof claims.email_confirmed_at === "string" ||
      metadata?.email_verified === true,
  };
}

// React cache deduplicates identity validation when the navbar, a layout, and
// a page all need the same signed-in user during one server render. getClaims
// verifies the JWT locally for Supabase projects using asymmetric signing keys,
// avoiding a separate Auth-server round trip on every page.
export const getCurrentAuthIdentity = cache(
  async (): Promise<HalinaAuthIdentity | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return identityFromClaims(data.claims);
  },
);
