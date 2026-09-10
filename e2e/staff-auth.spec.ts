import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { hashStaffPin } from "../lib/staff/pin";

// Only the dedicated CI job selects this spec. Never seed a shared project.
function localSetting(name: string) {
  const value = process.env[name];
  if (!value || !["127.0.0.1", "localhost"].includes(new URL(value).hostname)) {
    throw new Error("Authenticated browser fixtures require local Supabase and PostgreSQL.");
  }
  return value;
}

test("staff clock-in, paired seating, corrections, reconnect and tenant boundaries work with a separate manager device", async ({ browser, page: manager }) => {
  test.setTimeout(180_000);
  const apiUrl = localSetting("NEXT_PUBLIC_SUPABASE_URL");
  const pool = new Pool({ connectionString: localSetting("DATABASE_URL") });
  const admin = createClient(apiUrl, process.env.HALINA_E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID();
  const password = `Local-CI-only-${randomUUID()}!`;
  const restaurantId = randomUUID();
  const otherRestaurantId = randomUUID();
  const userIds: string[] = [];
  const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const staff = await staffContext.newPage();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();

  async function account(kind: string) {
    const email = `${kind}-${suffix}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("Local test account creation failed");
    userIds.push(data.user.id);
    await pool.query('INSERT INTO "Profile" (id, email, "displayName", "updatedAt") VALUES ($1, $2, $3, now())', [data.user.id, email, kind]);
    return { id: data.user.id, email };
  }
  async function sessionCount(status: string | null = null) {
    const result = await pool.query('SELECT count(*)::int AS count FROM "DiningSession" WHERE "restaurantId"=$1 AND ($2::text IS NULL OR status::text=$2)', [restaurantId, status]);
    return result.rows[0].count as number;
  }
  async function login(page: Page, email: string, redirectTo: string) {
    await page.goto(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.locator('button[type="submit"]').filter({ hasText: "Log in" }).click();
    await expect(page).toHaveURL(new RegExp(`${redirectTo}$`));
  }
  const staffTable = (label: string) => staff.locator("#floor article").filter({ has: staff.getByRole("heading", { name: label, exact: true }) });

  try {
    const owner = await account("manager");
    const worker = await account("staff");
    const otherOwner = await account("other-manager");
    // Fixture SQL only. Every tested workflow below goes through the real UI,
    // Supabase authentication and the app's Prisma transaction commands.
    for (const [id, slug, name, profileId] of [
      [restaurantId, `auth-ci-${suffix}`, "CI Test Kitchen", owner.id],
      [otherRestaurantId, `auth-other-${suffix}`, "Other Tenant Kitchen", otherOwner.id],
    ]) {
      await pool.query('INSERT INTO "Restaurant" (id, slug, name, environment, "operatingSettings", "staffPinHash", "updatedAt") VALUES ($1,$2,$3,\'TEST\',$4::jsonb,$5,now())', [id, slug, name, JSON.stringify({ opensAtHour: 0, closesAtHour: 24 }), hashStaffPin("4817")]);
      await pool.query('INSERT INTO "RestaurantMembership" (id, "restaurantId", "profileId", role, "updatedAt") VALUES ($1,$2,$3,\'OWNER\',now())', [randomUUID(), id, profileId]);
      await pool.query('INSERT INTO "FloorPlan" (id, "restaurantId", name, "draftSnapshot", "updatedAt") VALUES ($1,$2,\'Main\',\'{"elements":[]}\'::jsonb,now())', [randomUUID(), id]);
    }
    await pool.query('INSERT INTO "StaffMember" (id, "restaurantId", name, "jobTitle", email, "emailNormalized", "permissionPreset", "workAccessEnabled", "updatedAt") VALUES ($1,$2,\'CI Staff\',\'Shift lead\',$3,$3,\'MANAGER\',true,now())', [randomUUID(), restaurantId, worker.email]);
    for (const [label, capacity] of [["CI T1", 4], ["CI T2", 2]] as const) {
      await pool.query('INSERT INTO "DiningTable" (id, "restaurantId", label, zone, capacity, "maxPartySize", shape, "updatedAt") VALUES ($1,$2,$3,\'Main\',$4,$4,\'SQUARE\',now())', [randomUUID(), restaurantId, label, capacity]);
    }
    await pool.query('INSERT INTO "QueueEntry" (id, "restaurantId", "partyName", "partySize", "promisedWaitMinutes", "updatedAt") VALUES ($1,$2,\'Other tenant private party\',2,10,now())', [randomUUID(), otherRestaurantId]);
    await login(manager, owner.email, "/manager/queue");
    await expect(manager.getByText("Shared database", { exact: true })).toBeVisible();
    await login(staff, worker.email, "/work");
    await expect(staff.getByText("CI Test Kitchen", { exact: true })).toBeVisible();
    await expect(staff.getByText("Other Tenant Kitchen", { exact: true })).toHaveCount(0);
    await staff.getByLabel("Restaurant PIN", { exact: true }).fill("9999");
    await staff.getByRole("button", { name: "Enter work mode", exact: true }).click();
    await expect(staff.getByText("Incorrect restaurant PIN.", { exact: true })).toBeVisible();
    await staff.getByLabel("Restaurant PIN", { exact: true }).fill("4817");
    await staff.getByRole("button", { name: "Enter work mode", exact: true }).click();
    await expect(staff).toHaveURL(/\/ops$/);
    await expect(staff.getByText("Live across devices", { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
    await expect(staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).resolves.toBe(true);

    await login(other, otherOwner.email, "/manager/queue");
    await expect(other.getByRole("heading", { name: "Other tenant private party", exact: true })).toBeVisible();
    await expect(manager.getByText("Other tenant private party", { exact: true })).toHaveCount(0);
    await expect(staff.getByText("Other tenant private party", { exact: true })).toHaveCount(0);

    await manager.getByRole("button", { name: "Add walk-in", exact: true }).click();
    const dialog = manager.getByRole("dialog", { name: "Add a walk-in" });
    await dialog.getByLabel("Party name").fill("CI combined party");
    await dialog.getByLabel("Party size").fill("5");
    await dialog.getByRole("button", { name: "Add to queue", exact: true }).click();
    // No reload: receiving this card proves manager -> staff Realtime delivery.
    await expect(staff.getByRole("heading", { name: "CI combined party", exact: true })).toBeVisible({ timeout: 20_000 });
    const party = staff.locator("#queue article").filter({ hasText: "CI combined party" });
    await party.getByText("Seat party", { exact: true }).click();
    await party.getByLabel("Tables for CI combined party", { exact: true }).selectOption({ index: 1 });
    await expect(party.getByText("Both tables will be occupied together. Confirm they can be joined on the floor.")).toBeVisible();
    await party.getByRole("button", { name: "Confirm seating", exact: true }).click();
    await expect(staffTable("CI T1").getByText("Occupied", { exact: true })).toBeVisible();
    await expect(staffTable("CI T2").getByText("Occupied", { exact: true })).toBeVisible();
    // No reload on the manager device: staff -> manager delivery is required.
    await expect(manager.getByText("No parties waiting", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(await sessionCount("ACTIVE")).toBe(2);

    await staffTable("CI T1").getByText("Correct latest action", { exact: true }).click();
    await staffTable("CI T1").getByLabel("Correction reason", { exact: true }).fill("Selected the wrong waiting party");
    await staffTable("CI T1").getByRole("button", { name: "Undo linked action", exact: true }).click();
    await expect(staffTable("CI T2").getByText("Available", { exact: true })).toBeVisible();
    await expect(manager.getByRole("heading", { name: "CI combined party", exact: true })).toBeVisible({ timeout: 20_000 });
    expect(await sessionCount()).toBe(0);

    await staffContext.setOffline(true);
    await expect(staff.getByText("Offline — reconnect before saving", { exact: true }).filter({ visible: true })).toBeVisible();
    await staffContext.setOffline(false);
    await expect(staff.getByText(/^(Live across devices|Updated from another device)$/).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
    await party.getByText("Seat party", { exact: true }).click();
    await party.getByLabel("Tables for CI combined party", { exact: true }).selectOption({ index: 1 });
    await party.getByRole("button", { name: "Confirm seating", exact: true }).click();
    await expect(staffTable("CI T1").getByText("Occupied", { exact: true })).toBeVisible();
    await staffTable("CI T1").getByRole("button", { name: "Clear table", exact: true }).click();
    await expect(staffTable("CI T2").getByText("Cleaning", { exact: true })).toBeVisible();
    await staffTable("CI T1").getByRole("button", { name: "Mark ready", exact: true }).click();
    await expect(staffTable("CI T2").getByText("Available", { exact: true })).toBeVisible();
    expect(await sessionCount("COMPLETED")).toBe(2);

    const staffApi = createClient(apiUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await staffApi.auth.signInWithPassword({ email: worker.email, password })).error).toBeNull();
    expect((await staffApi.from("QueueEntry").select("id")).error).not.toBeNull();
    await staffApi.auth.signOut();
    await staff.goto("/manager/queue");
    await expect(staff).toHaveURL(/\/onboarding\/restaurant$/);
    await expect(staff.getByText("Other tenant private party", { exact: true })).toHaveCount(0);
    await staff.goto("/ops");
    await staff.getByRole("button", { name: "Clock out", exact: true }).filter({ visible: true }).click();
    await expect(staff).toHaveURL("http://127.0.0.1:3100/");
    await staff.goto("/ops");
    await expect(staff).toHaveURL(/\/work$/);
    await expect(staff.getByRole("button", { name: "Enter work mode", exact: true })).toBeVisible();
    const sessions = await pool.query('SELECT id FROM "StaffWorkSession" WHERE "restaurantId"=$1 AND "endedAt" IS NULL', [restaurantId]);
    expect(sessions.rowCount).toBe(0);
    await expect(other.getByRole("heading", { name: "Other tenant private party", exact: true })).toBeVisible();
    await expect(other.getByText("CI combined party", { exact: true })).toHaveCount(0);
  } finally {
    await staffContext.close();
    await otherContext.close();
    await pool.query('DELETE FROM "SeatingAssignment" WHERE "restaurantId"=$1', [restaurantId]);
    await pool.query('DELETE FROM "Restaurant" WHERE id=ANY($1::uuid[])', [[restaurantId, otherRestaurantId]]);
    await pool.query('DELETE FROM "Profile" WHERE id=ANY($1::uuid[])', [userIds]);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    await pool.end();
  }
});
