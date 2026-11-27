import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyRestaurantReview } from "./review-email";

const notice = { applicantEmail: "applicant@example.com", eventId: "test-event" };

function configure() {
  vi.stubEnv("HALINA_RESEND_API_KEY", "local-fixture");
  vi.stubEnv("HALINA_REVIEW_FROM_EMAIL", "Halina <review@example.com>");
  vi.stubEnv("HALINA_REVIEW_SITE_URL", "https://halina.example.com");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("restaurant review email", () => {
  it("uses the in-app update when email is disabled", async () => {
    for (const key of ["HALINA_RESEND_API_KEY", "HALINA_REVIEW_FROM_EMAIL", "HALINA_REVIEW_SITE_URL"]) vi.stubEnv(key, "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await notifyRestaurantReview(notice, "/onboarding/restaurant")).toBe("The update is available in Halina.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports provider acceptance and includes an event-specific idempotency key", async () => {
    configure();
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "provider-id" }));
    vi.stubGlobal("fetch", fetch);
    expect(await notifyRestaurantReview(notice, "/onboarding/restaurant")).toBe("The email provider accepted the request. Delivery is unconfirmed.");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers["Idempotency-Key"]).toBe("halina-review/test-event");
    expect(JSON.parse(options.body)).toMatchObject({ to: [notice.applicantEmail], text: expect.stringContaining("https://halina.example.com/onboarding/restaurant") });
  });

  it("reports provider rejection or an unconfirmed request", async () => {
    configure();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 })).mockRejectedValueOnce(new Error("Timed out"));
    vi.stubGlobal("fetch", fetch);
    expect(await notifyRestaurantReview(notice, "/manager/setup")).toContain("provider rejected");
    expect(await notifyRestaurantReview(notice, "/manager/setup")).toContain("acceptance could not be confirmed");
  });
});
