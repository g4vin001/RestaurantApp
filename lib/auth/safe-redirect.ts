const INTERNAL_PATH = /^\/(?!\/)(?!.*[\\\u0000-\u001f\u007f]).*/;

export function safeInternalRedirect(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string" || !INTERNAL_PATH.test(value)) return fallback;

  try {
    const decoded = decodeURIComponent(value);
    if (!INTERNAL_PATH.test(decoded)) return fallback;
    const url = new URL(value, "https://halina.local");
    if (url.origin !== "https://halina.local") return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return INTERNAL_PATH.test(path) && INTERNAL_PATH.test(decodeURIComponent(path)) ? path : fallback;
  } catch {
    return fallback;
  }
}
