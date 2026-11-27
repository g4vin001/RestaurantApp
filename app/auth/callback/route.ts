import { NextResponse, type NextRequest } from "next/server";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { setFlash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalRedirect(
    request.nextUrl.searchParams.get("next"),
    "/",
  );

  if (!code) {
    await setFlash(
      "error",
      "The email confirmation link is missing its authentication code. Please try signing in or request a new confirmation email.",
    );
    return callbackRedirect("/login");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // A failed password-reset link should lead straight to requesting a new one.
  if (error && next === "/reset-password") {
    return callbackRedirect("/forgot-password?expired=1");
  }

  if (error) {
    await setFlash(
      "error",
      "Halina could not finish confirming this email. The link may have expired; try signing in or register again.",
    );
    return callbackRedirect("/login");
  }

  return callbackRedirect(next);
}

function callbackRedirect(path: string) {
  // Keep the confirmation and the destination on the same browser origin,
  // even when Next.js resolves its internal request URL to a different host.
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
