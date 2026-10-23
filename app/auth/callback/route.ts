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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // A failed password-reset link should lead straight to requesting a new one.
  if (error && next === "/reset-password") {
    return NextResponse.redirect(new URL("/forgot-password?expired=1", request.url));
  }

  if (error) {
    await setFlash(
      "error",
      "Halina could not finish confirming this email. The link may have expired; try signing in or register again.",
    );
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
