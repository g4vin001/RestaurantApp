import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const onboarding = "/onboarding/restaurant";
const pdf = Buffer.from("%PDF-1.7\n%%EOF");

function localUrl(key: string) {
  const url = process.env[key];
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error(`Restaurant review fixtures require a local service for ${key}.`);
  }
  return url;
}

async function logIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?redirectTo=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator('button[type="submit"]').filter({ hasText: "Log in" }).click();
}

async function confirmAction(page: Page, action: string) {
  await page.getByRole("button", { name: action, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: action });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
}

test("verified applicant, administrator and customer complete the publication and suspension workflow", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const api = localUrl("NEXT_PUBLIC_SUPABASE_URL");
  const mail = localUrl("HALINA_E2E_MAILPIT_URL");
  const pool = new Pool({ connectionString: localUrl("DATABASE_URL") });
  const suffix = randomUUID().slice(0, 8);
  const restaurantName = `CI Review Kitchen ${suffix}`;
  const email = `review-applicant-${suffix}@example.com`;
  const password = `Local-CI-only-${randomUUID()}!`;
  const ownerContext = await browser.newContext();
  const reviewerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();
  const reviewer = await reviewerContext.newPage();

  try {
    await owner.goto(`/login?redirectTo=${encodeURIComponent(onboarding)}`);
    await owner.getByRole("button", { name: "Register", exact: true }).click();
    await owner.getByLabel("Display name").fill("CI Applicant");
    await owner.getByLabel("Email", { exact: true }).fill(email);
    await owner.getByLabel("Password", { exact: true }).fill(password);
    await owner.getByLabel("Confirm password").fill(password);
    await owner.getByRole("button", { name: "Create account" }).click();
    await expect(owner.getByText("Check your email to confirm your account.")).toBeVisible();
    await logIn(owner, email, password, onboarding);
    await expect(owner.getByText(/confirm your email before logging in/i)).toBeVisible();

    let confirmationUrl = "";
    await expect.poll(async () => {
      const response = await request.get(`${mail}/api/v1/search`, { params: { query: `to:${email}` } });
      if (!response.ok()) return false;
      const { messages } = await response.json() as { messages: { ID: string }[] };
      if (!messages?.length) return false;
      const message = await request.get(`${mail}/api/v1/message/${messages[0].ID}`);
      const envelope = await message.json() as { HTML: string };
      const link = envelope.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1];
      if (!link) return false;
      confirmationUrl = link.replaceAll("&amp;", "&");
      return new URL(confirmationUrl).origin === new URL(api).origin;
    }, { timeout: 20_000 }).toBe(true);
    await owner.goto(confirmationUrl);
    await expect(owner).toHaveURL(new RegExp(`${onboarding}$`), { timeout: 20_000 });
    await expect(owner.getByText("Verified account email", { exact: false })).toBeVisible();

    await owner.getByLabel("Restaurant name").fill(restaurantName);
    await owner.getByLabel("Complete business address").fill("31 Tomas Morato Avenue, Quezon City");
    await owner.getByLabel("Restaurant contact number").fill("+63 912 345 6789");
    await owner.getByLabel("Google Maps location link").fill("https://www.google.com/maps/place/Cubao");
    await owner.getByLabel("Business email address").fill(email);
    await owner.getByLabel("Your full name").fill("Maria Santos");
    await owner.getByLabel("Relationship to restaurant").selectOption("OWNER");
    const evidence = owner.getByLabel("Proof of ownership or authorization");
    await evidence.setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("Invalid document") });
    await owner.getByRole("button", { name: "Submit application" }).click();
    await expect(owner.getByRole("alert").filter({ hasText: "file contents must match" })).toBeVisible();
    await expect(owner.getByLabel("Restaurant name")).toHaveValue(restaurantName);
    await evidence.setInputFiles({ name: "authorization.pdf", mimeType: "application/pdf", buffer: pdf });
    await owner.getByRole("button", { name: "Submit application" }).click();
    await expect(owner.getByText("Your application is awaiting review.")).toBeVisible();
    await owner.goto("/manager");
    await expect(owner).toHaveURL(new RegExp(`${onboarding}$`));
    await owner.goto("/admin/restaurants");
    await expect(owner.getByRole("heading", { name: "Restaurant applications" })).toHaveCount(0);

    const application = (await pool.query('SELECT id FROM "RestaurantApplication" WHERE "applicantEmail" = $1', [email])).rows[0];
    const storedEvidence = (await pool.query('SELECT id FROM "RestaurantApplicationEvidence" WHERE "applicationId" = $1', [application.id])).rows[0];
    const docPath = `/admin/restaurants/applications/${application.id}/evidence/${storedEvidence.id}`;
    expect((await ownerContext.request.get(docPath)).status()).toBe(404);

    await logIn(reviewer, process.env.ADMIN_EMAIL!, process.env.HALINA_E2E_ADMIN_PASSWORD!, "/admin");
    await reviewer.getByLabel("Admin password").fill(process.env.ADMIN_PANEL_PASSWORD!);
    await reviewer.getByRole("button", { name: "Unlock", exact: true }).click();
    await reviewer.getByRole("link", { name: "Restaurant applications and publication" }).click();
    await reviewer.getByLabel("Search").fill(suffix);
    await reviewer.getByLabel("Status").selectOption("PENDING");
    await reviewer.getByRole("button", { name: "Apply filters" }).click();
    await reviewer.getByRole("link", { name: restaurantName }).click();
    await expect(reviewer.getByText("Supabase confirmed the account email", { exact: false })).toBeVisible();
    expect(await reviewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const download = await reviewerContext.request.get(docPath);
    expect(download.ok()).toBe(true);
    expect(download.headers()["cache-control"]).toContain("no-store");
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(await download.body()).toEqual(pdf);
    expect((await reviewerContext.request.get(docPath.replace(application.id, randomUUID()))).status()).toBe(404);

    await reviewer.getByLabel("Note", { exact: true }).fill("Internal review only");
    await reviewer.getByRole("button", { name: "Save internal note" }).click();
    await expect(reviewer.getByText("Internal review only", { exact: true })).toBeVisible();
    await reviewer.getByLabel("What should the applicant provide?").fill("Please confirm the address on the authorization letter.");
    await reviewer.getByRole("button", { name: "Send information request" }).click();
    await expect(reviewer.getByText("Needs information", { exact: true }).first()).toBeVisible();
    await owner.goto(onboarding);
    await expect(owner.getByText("Please confirm the address on the authorization letter.")).toBeVisible();
    await expect(owner.getByText("Internal review only")).toHaveCount(0);
    await owner.getByLabel("Response to reviewer").fill("The letter and application show the same complete address.");
    await owner.getByRole("button", { name: "Resubmit application" }).click();
    await expect(owner.getByText("Your application is awaiting review.")).toBeVisible();

    await reviewer.reload();
    for (const check of await reviewer.getByRole("checkbox").all()) await check.check();
    await confirmAction(reviewer, "Approve application");
    await expect(reviewer.getByRole("link", { name: "Restaurant listing · In setup" })).toBeVisible();
    await reviewer.getByRole("link", { name: "Restaurant listing · In setup" }).click();
    const { slug } = (await pool.query('SELECT r.slug FROM "Restaurant" r JOIN "RestaurantApplication" a ON r.id = a."restaurantId" WHERE a.id = $1', [application.id])).rows[0];
    const listing = `/restaurants/${slug}`;
    for (const path of [listing, `${listing}/book`, `${listing}/waitlist`]) {
      await owner.goto(path);
      await expect(owner.getByRole("heading", { name: restaurantName, exact: true })).toHaveCount(0);
    }

    await owner.goto(onboarding);
    await owner.getByRole("link", { name: "Open manager dashboard" }).click();
    await expect(owner.getByText("Your restaurant is in private setup.")).toBeVisible();
    await owner.goto("/manager/settings");
    await expect(owner.getByLabel("Restaurant name")).toHaveAttribute("readonly", "");
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      await owner.getByLabel(`${day}, period 1, opens`).fill("00:00");
      await owner.getByLabel(`${day}, period 1, closes`).fill("00:00");
    }
    await owner.getByRole("button", { name: "Save settings" }).click();
    await expect(owner.getByText("Restaurant settings saved.")).toBeVisible();
    await owner.goto("/manager/layout");
    await owner.getByRole("button", { name: "Round table", exact: true }).click();
    await owner.getByRole("button", { name: "Publish", exact: true }).click();
    await owner.getByRole("button", { name: "Publish version" }).click();
    await expect(owner.getByText("Floor published. Live floor now uses this version.")).toBeVisible();
    await owner.goto("/manager/setup");
    await owner.getByRole("button", { name: "Save customer preferences" }).click();
    await confirmAction(owner, "Request publication");
    await expect(owner.getByText("Your request is awaiting administrator review.")).toBeVisible();

    await reviewer.reload();
    await confirmAction(reviewer, "Publish restaurant");
    await expect(reviewer.getByRole("button", { name: "Suspend restaurant", exact: true })).toBeVisible();
    await owner.goto("/");
    await expect(owner.getByText(restaurantName, { exact: true })).toBeVisible();
    const staleBooking = await ownerContext.newPage();
    const staleWaitlist = await ownerContext.newPage();
    await staleBooking.goto(`${listing}/book`);
    await staleWaitlist.goto(`${listing}/waitlist`);
    const nextDay = new Date(Date.now() + 86_400_000);
    const manilaDay = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Manila" }).format(nextDay);
    await owner.goto(`${listing}/book`);
    await owner.getByLabel("Date and time").fill(`${manilaDay}T18:00`);
    await owner.getByRole("button", { name: "Request reservation", exact: true }).click();
    await expect(owner.getByText("Reservation request sent.", { exact: false })).toBeVisible();
    await owner.goto(`${listing}/waitlist`);
    await owner.getByRole("button", { name: "Join waitlist", exact: true }).click();
    await expect(owner).toHaveURL(/\/my\/waitlist$/);

    await reviewer.getByLabel("Reason", { exact: true }).fill("Temporarily suspended while Halina reviews the listing.");
    await confirmAction(reviewer, "Suspend restaurant");
    await expect(reviewer.getByRole("button", { name: "Restore restaurant", exact: true })).toBeVisible();
    await staleBooking.getByLabel("Date and time").fill(`${manilaDay}T19:00`);
    await staleBooking.getByRole("button", { name: "Request reservation", exact: true }).click();
    await expect(staleBooking.getByRole("alert").filter({ hasText: "no longer available" })).toBeVisible();
    await staleWaitlist.getByRole("button", { name: "Join waitlist", exact: true }).click();
    await expect(staleWaitlist.getByRole("alert").filter({ hasText: "no longer available" })).toBeVisible();
    await owner.goto("/reservations");
    await expect(owner.getByText(restaurantName, { exact: true })).toBeVisible();
    await owner.goto("/manager/queue");
    await expect(owner.getByText("Your public listing is suspended.")).toBeVisible();
    const durableCounts = await pool.query(`
      SELECT (SELECT count(*)::int FROM "Reservation" WHERE "restaurantId" = r.id) AS bookings,
             (SELECT count(*)::int FROM "QueueEntry" WHERE "restaurantId" = r.id) AS waiting
      FROM "Restaurant" r WHERE slug = $1
    `, [slug]);
    expect(durableCounts.rows).toEqual([{ bookings: 1, waiting: 1 }]);
    await reviewer.getByLabel("Reason", { exact: true }).fill("Review completed and access restored.");
    await confirmAction(reviewer, "Restore restaurant");
    await expect(reviewer.getByRole("button", { name: "Suspend restaurant", exact: true })).toBeVisible();
    await owner.goto(listing);
    await expect(owner.getByRole("heading", { name: restaurantName, exact: true })).toBeVisible();
  } finally {
    await pool.end();
    await ownerContext.close();
    await reviewerContext.close();
  }
});
