import { cookies } from "next/headers";

type FlashKind = "error" | "message" | "notice";

// Short-lived so a flash message shown once won't reappear if the user
// revisits /login a while later, without needing to explicitly clear it
// (cookies can only be cleared from a Server Action/Route Handler, not
// from the page that reads and displays them).
const FLASH_MAX_AGE_SECONDS = 15;

export async function setFlash(kind: FlashKind, text: string) {
  const store = await cookies();
  store.set(`flash_${kind}`, text, { path: "/", maxAge: FLASH_MAX_AGE_SECONDS });
}

export async function readFlash(kind: FlashKind) {
  const store = await cookies();
  return store.get(`flash_${kind}`)?.value;
}
