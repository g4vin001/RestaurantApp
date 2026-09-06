import "server-only";

import { cache } from "react";
import type { JwtPayload, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type HalinaAuthIdentity = {
  id: string;
  email?: string;
};

export function identityFromClaims(
  claims: JwtPayload,
): HalinaAuthIdentity {
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
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

// Sensitive staff authorization needs Supabase's authoritative user record so
// email confirmation is never inferred from user-editable JWT metadata. This
// remote check is cached within the request and limited to staff-only routes.
export const getCurrentAuthUser = cache(
  async (): Promise<User | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  },
);
