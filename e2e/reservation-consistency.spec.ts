import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashStaffPin } from "../lib/staff/pin";
import { restaurantDateKey, restaurantDateTimeInput, restaurantWallTimeToUtc } from "../lib/time/restaurant-time";

function loopbackSetting(name: string) {
  const value = process.env[name];
  if (!value || !["127.0.0.1", "localhost"].includes(new URL(value).hostname)) {
    throw new Error("Reservation consistency tests require disposable loopback services.");
  }
  return value;
}

test("employee clearing and future bookings agree with manager and customer views", async ({ browser, page: manager }) => {
  test.setTimeout(180_000);
  const apiUrl = loopbackSetting("NEXT_PUBLIC_SUPABASE_URL");
  const pool = new Pool({ connectionString: loopbackSetting("DATABASE_URL") });
  const admin = createClient(apiUrl, process.env.HALINA_E2E_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const restaurantId = randomUUID();
  const slug = "reservations-ci-" + restaurantId;
  const password = "Fixture-only-" + randomUUID() + "!";
  const timeZone = "Asia/Manila";
  const now = Date.now();
  const scheduledAt = new Date(now + 40 * 60_000);
  const bookingDate = restaurantDateKey(scheduledAt, timeZone);
  const futureDate = restaurantDateKey(new Date(now + 7 * 24 * 3_600_000), timeZone);
  const rescheduledDate = restaurantDateKey(new Date(now + 8 * 24 * 3_600_000), timeZone);
  const future = restaurantWallTimeToUtc(futureDate + "T12:00", timeZone)!;
  const userIds: string[] = [];
  const staff = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const customer = await browser.newPage();
  const publicPage = await browser.newPage();

  async function account(role: string) {
    const email = role + "-" + restaurantId + "@example.com";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("Fixture account could not be created");
    userIds.push(data.user.id);
    await pool.query('INSERT INTO "Profile" (id, email, "displayName", "updatedAt") VALUES ($1,$2,$3,now())', [data.user.id, email, role]);
    return { email, id: data.user.id };
  }

  async function login(page: Page, email: string, path: string) {
    await page.goto("/login?redirectTo=" + encodeURIComponent(path));
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).last().click();
    await expect(page).toHaveURL((url) => url.pathname === path, { timeout: 20_000 });
  }

  async function publishedTable(floorName: string, label: string) {
    const plan = randomUUID();
    const version = randomUUID();
    const table = randomUUID();
    await pool.query('INSERT INTO "DiningTable" (id, "restaurantId", label, capacity, "maxPartySize", zone, shape, "updatedAt") VALUES ($1,$2,$3,4,4,$4,$5,now())', [table, restaurantId, label, "Main", "SQUARE"]);
    await pool.query('INSERT INTO "FloorPlan" (id,"restaurantId",name,"updatedAt") VALUES ($1,$2,$3,now())', [plan, restaurantId, floorName]);
    await pool.query('INSERT INTO "FloorPlanVersion" (id,"floorPlanId",version,name,"logicalWidth","logicalHeight","publishedAt") VALUES ($1,$2,1,$3,1600,1000,now())', [version, plan, floorName]);
    await pool.query('INSERT INTO "FloorElement" (id,"floorPlanVersionId","stableElementId","diningTableId",type,x,y,width,height) VALUES ($1,$2,$3,$4,$5,180,140,150,120)', [randomUUID(), version, randomUUID(), table, "TABLE"]);
    await pool.query('UPDATE "FloorPlan" SET "activeVersionId"=$1 WHERE id=$2', [version, plan]);
    return table;
  }

  try {
    const owner = await account("manager");
    const employee = await account("employee");
    const diner = await account("customer");
    await pool.query('INSERT INTO "Restaurant" (id,slug,name,"operatingSettings","staffPinHash","updatedAt") VALUES ($1,$2,$3,$4::jsonb,$5,now())', [restaurantId, slug, "Reservation Test Kitchen", JSON.stringify({ opensAtHour: 0, closesAtHour: 24 }), hashStaffPin("4817")]);
    await pool.query('INSERT INTO "RestaurantMembership" (id,"restaurantId","profileId",role,"updatedAt") VALUES ($1,$2,$3,$4,now())', [randomUUID(), restaurantId, owner.id, "OWNER"]);
    await pool.query('INSERT INTO "StaffMember" (id,"restaurantId",name,"jobTitle",email,"emailNormalized","permissionPreset","workAccessEnabled","updatedAt") VALUES ($1,$2,$3,$4,$5,$5,$6,true,now())', [randomUUID(), restaurantId, "Test employee", "Shift lead", employee.email, "MANAGER"]);
    const groundTable = await publishedTable("Ground floor", "G1");
    await publishedTable("Upper floor", "U1");
    await pool.query('INSERT INTO "Reservation" (id,"restaurantId","partyName","partySize","scheduledAt","assignedTableId","customerProfileId","customerNote",notes,"updatedAt") VALUES ($1,$2,$3,2,$4::timestamptz AT TIME ZONE \'UTC\',$5,$6,$7,$8,now())', [
      randomUUID(), restaurantId, "Booked diner", scheduledAt, groundTable, diner.id, "Ask for the window seat.", "Private host note.",
    ]);

    await login(manager, owner.email, "/manager/floor");
    await login(staff, employee.email, "/work");
    await staff.getByRole("button", { name: "Clock in", exact: true }).click();
    await staff.getByLabel("Restaurant PIN").fill("4817");
    await staff.getByRole("button", { name: "Enter work mode" }).click();
    await expect(staff).toHaveURL(/\/ops$/);
    await login(customer, diner.email, "/reservations");
    await expect(customer.getByText("Ask for the window seat.")).toBeVisible();
    await expect(customer.getByText("Private host note.")).toHaveCount(0);
    await expect(customer.getByRole("link", { name: "Manager", exact: true })).toHaveCount(0);

    await publicPage.goto("/restaurants/" + slug);
    await expect(publicPage.getByRole("button", { name: /G1, 4 seats, Reserved/ })).toBeVisible();
    await expect(publicPage.getByText("1 of 2", { exact: true })).toBeVisible();
    await expect(manager.getByRole("button", { name: /G1, 4 seats, Reserved/ })).toBeVisible();
    const staffFloor = staff.locator("#floor");
    await expect(staffFloor.getByRole("button", { name: "Reserve", exact: true })).toHaveCount(0);
    await staffFloor.getByRole("button", { name: "Upper floor" }).click();
    await expect(staffFloor.getByRole("heading", { name: "U1" })).toBeVisible();
    await expect(staffFloor.getByRole("heading", { name: "G1" })).toHaveCount(0);
    await staffFloor.getByRole("button", { name: "Ground floor" }).click();

    const reservations = staff.locator("#reservations");
    await reservations.getByText("Create a reservation", { exact: true }).click();
    const newBooking = reservations.locator("form").filter({ has: staff.getByRole("button", { name: "Create reservation", exact: true }) });
    await newBooking.getByLabel("Party name").fill("Next week party");
    await newBooking.getByLabel("Date and time").fill(restaurantDateTimeInput(future, timeZone));
    await newBooking.getByRole("button", { name: "Create reservation", exact: true }).click();
    await expect(staff).toHaveURL((url) => url.searchParams.get("reservationDate") === futureDate);
    await expect(reservations.getByRole("heading", { name: "Next week party" })).toBeVisible();
    const nextWeek = reservations.locator("article").filter({ has: staff.getByRole("heading", { name: "Next week party" }) });
    await nextWeek.getByText("Edit or resolve", { exact: true }).click();
    await nextWeek.getByLabel("Reservation date and time").fill(rescheduledDate + "T12:00");
    await nextWeek.getByRole("button", { name: "Save reservation", exact: true }).click();
    await expect(staff).toHaveURL((url) => url.searchParams.get("reservationDate") === rescheduledDate);
    await expect(nextWeek).toBeVisible();

    await reservations.getByLabel("Reservation date", { exact: true }).fill(bookingDate);
    await reservations.getByRole("button", { name: "Show date" }).click();
    await expect(staff).toHaveURL((url) => url.searchParams.get("reservationDate") === bookingDate);
    const booking = reservations.locator("article").filter({ has: staff.getByRole("heading", { name: "Booked diner" }) });
    await booking.getByText("Seat party", { exact: true }).click();
    await booking.getByLabel("Tables for Booked diner").selectOption(JSON.stringify([groundTable]));
    await booking.getByRole("button", { name: "Confirm seating" }).click();
    await expect(booking.getByText("Seated", { exact: true })).toBeVisible();

    const ground = staffFloor.locator("article").filter({ has: staff.getByRole("heading", { name: "G1" }) });
    await ground.getByRole("button", { name: "Clear table" }).click();
    await expect(reservations.getByRole("region", { name: "Reservation history" }).getByText("Completed", { exact: true })).toBeVisible();
    await expect(publicPage.getByRole("button", { name: /G1, 4 seats, Being prepared/ })).toBeVisible({ timeout: 25_000 });
    await expect(customer.getByText("Completed", { exact: true })).toBeVisible({ timeout: 25_000 });
    await manager.bringToFront();
    await expect(manager.getByRole("button", { name: /G1, 4 seats, Cleaning/ })).toBeVisible({ timeout: 25_000 });

    await ground.getByRole("button", { name: "Mark ready" }).click();
    await expect(publicPage.getByRole("button", { name: /G1, 4 seats, Available/ })).toBeVisible({ timeout: 25_000 });
    await expect(publicPage.getByText("2 of 2", { exact: true })).toBeVisible();
  } finally {
    await pool.query('DELETE FROM "SeatingAssignment" WHERE "restaurantId"=$1', [restaurantId]);
    await pool.query('DELETE FROM "Restaurant" WHERE id=$1', [restaurantId]);
    await pool.query('DELETE FROM "Profile" WHERE id=ANY($1::uuid[])', [userIds]);
    await pool.end();
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }
});
