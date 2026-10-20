// Restaurant photos are resized in the manager's browser, so this cap only
// guards against a bypassed client. It stays under the server action body limit.
export const COVER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// The version query changes on every upload, so the image route can tell
// browsers and the CDN to cache each URL forever.
export function publicCoverImageUrl(slug: string, updatedAt: Date) {
  return `/restaurants/${encodeURIComponent(slug)}/cover?v=${updatedAt.getTime()}`;
}

// Checks the file signature instead of trusting the browser-supplied type.
export function sniffCoverImageType(bytes: Uint8Array): (typeof COVER_IMAGE_TYPES)[number] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
