"use client";

import { useEffect } from "react";

// Flash cookies are read while the server renders the page, but a server render
// can't delete them. Once the message is on screen, delete the cookies here so a
// reload or a later visit doesn't show it again. The message itself stays
// visible until the user leaves the page.
//
// No dependency array on purpose: an action that redirects back to the same page
// with the same text re-renders this component without changing its props, and
// that new flash still needs clearing. Deleting a missing cookie is harmless.
export function ClearFlash() {
  useEffect(() => {
    for (const kind of ["error", "message", "notice"]) {
      document.cookie = `flash_${kind}=; Max-Age=0; path=/`;
    }
  });
  return null;
}
