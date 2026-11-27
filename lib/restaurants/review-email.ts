import "server-only";

export async function notifyRestaurantReview(input: { eventId: string; applicantEmail: string | null }, path: string) {
  const key = process.env.HALINA_RESEND_API_KEY?.trim();
  const from = process.env.HALINA_REVIEW_FROM_EMAIL?.trim();
  const site = process.env.HALINA_REVIEW_SITE_URL?.trim();
  if (!input.applicantEmail) return "No active recipient for email.";
  if (!key && !from && !site) return "The update is available in Halina.";
  if (!key || !from || !site) return "Email was skipped because its configuration is incomplete.";

  try {
    const url = new URL(path, site);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid review site");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        "Idempotency-Key": `halina-review/${input.eventId}`,
      },
      signal: AbortSignal.timeout(3500),
      body: JSON.stringify({
        from, to: [input.applicantEmail],
        subject: "Your Halina restaurant has an update",
        text: `Sign in to Halina to read the latest update.\n\n${url.href}`,
      }),
    });
    if (!response.ok) return "The email provider rejected the request. The update is available in Halina.";
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "id" in body && typeof body.id === "string" && body.id) {
      return "The email provider accepted the request. Delivery is unconfirmed.";
    }
  } catch {
    // A timeout can occur after the provider accepts a request.
  }
  return "Email acceptance could not be confirmed. The update is available in Halina.";
}
