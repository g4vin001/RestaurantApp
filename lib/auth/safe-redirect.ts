const INTERNAL_PATH = /^\/(?!\/)(?!.*[\\\u0000-\u001f\u007f]).*/;

export function safeInternalRedirect(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string" || !INTERNAL_PATH.test(value)) return fallback;

  try {
    const decoded = decodeURIComponent(value);
    if (!INTERNAL_PATH.test(decoded)) return fallback;
    const url = new URL(value, "https://halina.local");
    if (url.origin !== "https://halina.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
