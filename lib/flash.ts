import { cookies } from "next/headers";

type FlashKind = "error" | "message" | "notice";

// Pages that display a flash also render <ClearFlash />, which deletes the
// cookie in the browser once the message is on screen. The short expiry is a
// backstop for when that never runs (e.g. JavaScript fails to load).
const FLASH_MAX_AGE_SECONDS = 15;

const FLASH_KINDS: FlashKind[] = ["error", "message", "notice"];

export async function setFlash(kind: FlashKind, text: string) {
  const store = await cookies();
  // An earlier flash may still be alive (e.g. it was never displayed). Only the
  // newest outcome should show: a failed attempt's error must not sit beside
  // the success message that followed it.
  for (const other of FLASH_KINDS) {
    if (other !== kind) store.delete({ name: `flash_${other}`, path: "/" });
  }
  store.set(`flash_${kind}`, text, { path: "/", maxAge: FLASH_MAX_AGE_SECONDS });
}

export async function readFlash(kind: FlashKind) {
  const store = await cookies();
  return store.get(`flash_${kind}`)?.value;
}
