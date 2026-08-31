import { expect, test, type Page } from "@playwright/test";

async function resetDemo(page: Page) {
  await page.goto("/manager");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByText("Demo data", { exact: true })).toBeVisible();
}

test("manager demo loads the complete workspace without an error overlay", async ({
  page,
}) => {
  await resetDemo(page);

  await expect(page.getByRole("navigation", { name: "Manager navigation" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Live floor", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Queue & reservations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team" })).toBeVisible();
  await expect(page.getByText("Demo data", { exact: true })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  await expect(page.locator("body")).not.toBeEmpty();

  await page.goto("/manager/team");
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(
    page.getByText("Demo mode keeps staff directory changes in this browser."),
  ).toBeVisible();
});

test("queue writes persist and synchronize across two demo tabs", async ({
  context,
  page,
}) => {
  await resetDemo(page);
  await page.goto("/manager/queue");

  const secondPage = await context.newPage();
  await secondPage.goto("/manager/queue");
  await expect(
    secondPage.getByRole("heading", { name: "Queue and reservations" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add walk-in" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a walk-in" });
  await dialog.getByLabel("Party name").fill("Playwright walk-in");
  await dialog.getByLabel("Party size").fill("2");
  await dialog.getByRole("button", { name: "Add to queue" }).click();

  await expect(page.getByText("Party added to the queue.")).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "Playwright walk-in" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Playwright walk-in" }),
  ).toBeVisible();

  const party = page.locator("article").filter({ hasText: "Playwright walk-in" });
  await party.getByRole("button", { name: "Seat", exact: true }).click();
  const seatDialog = page.getByRole("dialog", { name: "Seat Playwright walk-in" });
  await seatDialog.locator("button").filter({ hasText: "Best match" }).click();
  await expect(
    page.getByText("Party seated and table session started."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("dialog", { name: "Reset demo data?" }).getByRole("button", { name: "Reset data" }).click();
  await expect(
    page.getByRole("heading", { name: "Playwright walk-in" }),
  ).toHaveCount(0);
});

test("mobile manager keeps primary queue actions usable and explains the floor editor limit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await resetDemo(page);

  await page.goto("/manager/queue");
  await expect(page.getByRole("button", { name: "Add walk-in" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rush mode off/ })).toBeVisible();
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).resolves.toBe(true);

  await page.goto("/manager/layout");
  await expect(
    page.getByRole("heading", { name: "Floor editor needs a larger screen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Live floor", exact: true }),
  ).toBeVisible();
});
