import { redirect } from "next/navigation";
import {
  archiveStaffMember,
  endAllStaffWorkSessions,
  forceClockOutStaff,
  saveStaffMember,
  setRestaurantStaffPin,
  setStaffActive,
} from "@/app/manager/team/actions";
import { getActiveManagerMembership } from "@/lib/auth/manager-membership";
import { readFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";

type StaffRoleOption = {
  id: string;
  name: string;
  presetKey: string | null;
};

function StaffFields({
  member,
  roles,
}: {
  roles: StaffRoleOption[];
  member?: {
    id: string;
    name: string;
    jobTitle: string;
    contact: string | null;
    email: string | null;
    staffRoleId: string | null;
    workAccessEnabled: boolean;
  };
}) {
  const defaultRoleId =
    member?.staffRoleId ??
    roles.find((role) => role.presetKey === "FLOOR_STAFF")?.id ??
    roles[0]?.id ??
    "";

  return (
    <>
      {member && <input type="hidden" name="staffId" value={member.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-stone-700">
          Name
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={member?.name}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-semibold text-stone-700">
          Job title
          <input
            name="jobTitle"
            required
            maxLength={80}
            defaultValue={member?.jobTitle}
            className={inputClass}
            placeholder="Waiter, host, floor lead..."
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-stone-700">
          Halina account email
          <input
            name="email"
            type="email"
            maxLength={320}
            defaultValue={member?.email ?? ""}
            className={inputClass}
            placeholder="employee@example.com"
          />
          <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">
            Must exactly match the employee&apos;s verified personal Halina account.
          </span>
        </label>
        <label className="block text-sm font-semibold text-stone-700">
          Staff role
          <select
            name="staffRoleId"
            defaultValue={defaultRoleId}
            required
            className={inputClass}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">
            The role&apos;s current permissions are enforced on every restricted operations request.
          </span>
        </label>
      </div>
      <label className="block text-sm font-semibold text-stone-700">
        Contact (optional)
        <input
          name="contact"
          maxLength={160}
          defaultValue={member?.contact ?? ""}
          className={inputClass}
          placeholder="Phone or other internal contact"
        />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-stone-700">
        <input
          name="workAccessEnabled"
          type="checkbox"
          defaultChecked={member ? member.workAccessEnabled : true}
          className="mt-1 h-4 w-4 accent-emerald-700"
        />
        <span>
          <strong className="block text-stone-900">Whitelist this email for work access</strong>
          The employee still signs in with their own normal Halina account. This does not create a separate employee account.
        </span>
      </label>
    </>
  );
}

export async function DatabaseTeamManager({ roles }: { roles: StaffRoleOption[] }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/manager/team");

  const membership = await getActiveManagerMembership(user.id);
  if (!membership) redirect("/onboarding/restaurant");

  const now = new Date();
  const [restaurant, message, error] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: membership.restaurantId },
      select: {
        id: true,
        name: true,
        timezone: true,
        staffPinHash: true,
        staffPinChangedAt: true,
        staffMembers: {
          where: { archivedAt: null },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            jobTitle: true,
            contact: true,
            email: true,
            permissionPreset: true,
            staffRoleId: true,
            staffRole: { select: { name: true } },
            workAccessEnabled: true,
            accessStatus: true,
            active: true,
            lastClockedInAt: true,
            workSessions: {
              where: { endedAt: null, expiresAt: { gt: now } },
              orderBy: { startedAt: "desc" },
              select: { id: true, startedAt: true, expiresAt: true },
            },
          },
        },
      },
    }),
    readFlash("message"),
    readFlash("error"),
  ]);
  if (!restaurant) redirect("/onboarding/restaurant");

  const activeCount = restaurant.staffMembers.filter((member) => member.active).length;
  const whitelistedCount = restaurant.staffMembers.filter(
    (member) => member.active && member.workAccessEnabled && member.email,
  ).length;
  const clockedInCount = restaurant.staffMembers.filter(
    (member) => member.workSessions.length > 0,
  ).length;
  const timeFormatter = new Intl.DateTimeFormat("en-PH", {
    timeZone: restaurant.timezone || "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">PEOPLE</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
            Team
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
            Staff use their personal Halina accounts. Whitelist the account email here, assign a staff role, then give staff the restaurant&apos;s internally agreed 4-digit clock-in PIN.
          </p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-4">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Team records</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{restaurant.staffMembers.length}</p>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Active staff</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{activeCount}</p>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Whitelisted</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{whitelistedCount}</p>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Clocked in</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{clockedInCount}</p>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <h2 className="font-semibold text-stone-900">Restaurant staff PIN</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              The PIN is a second gate after Halina verifies that the signed-in account email is whitelisted. It is stored only as a salted hash and cannot be displayed later.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  restaurant.staffPinHash
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {restaurant.staffPinHash ? "PIN configured" : "PIN not configured"}
              </span>
              {restaurant.staffPinChangedAt && (
                <span className="text-stone-500">
                  Changed {timeFormatter.format(restaurant.staffPinChangedAt)}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <form action={setRestaurantStaffPin} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm font-semibold text-stone-700">
                {restaurant.staffPinHash ? "Set a new 4-digit PIN" : "Set 4-digit PIN"}
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  autoComplete="off"
                  required
                  className={inputClass}
                  placeholder="••••"
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
              >
                {restaurant.staffPinHash ? "Rotate PIN" : "Save PIN"}
              </button>
            </form>
            {clockedInCount > 0 && (
              <form action={endAllStaffWorkSessions}>
                <button
                  type="submit"
                  className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Force clock out all staff
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <details>
          <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-800">
            + Add staff member
          </summary>
          <form action={saveStaffMember} className="mt-5 space-y-4 border-t border-stone-100 pt-5">
            <StaffFields roles={roles} />
            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
              >
                Add staff member
              </button>
            </div>
          </form>
        </details>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="font-semibold text-stone-900">Staff directory</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Whitelisting does not create another account. The user remains a normal Halina user until they deliberately clock in to this restaurant.
          </p>
        </div>
        {restaurant.staffMembers.length ? (
          <div className="divide-y divide-stone-100">
            {restaurant.staffMembers.map((member) => {
              const clockedIn = member.workSessions.length > 0;
              return (
                <article
                  key={member.id}
                  className={`p-5 ${member.active ? "" : "bg-stone-50 opacity-80"}`}
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-stone-900">{member.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${member.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
                          {member.active ? "Active" : "Inactive"}
                        </span>
                        {clockedIn && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            Clocked in
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${member.workAccessEnabled && member.email ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                          {member.workAccessEnabled && member.email ? "Email whitelisted" : "No work access"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-stone-600">
                        {member.jobTitle} · {member.staffRole?.name ?? "Staff"}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {member.email ?? "No Halina email assigned"}
                        {member.contact ? ` · ${member.contact}` : ""}
                      </p>
                      {clockedIn && (
                        <p className="mt-1 text-xs text-sky-700">
                          Current shift started {timeFormatter.format(member.workSessions[0].startedAt)}
                        </p>
                      )}
                      {!clockedIn && member.lastClockedInAt && (
                        <p className="mt-1 text-xs text-stone-400">
                          Last clock-in {timeFormatter.format(member.lastClockedInAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {clockedIn && (
                        <form action={forceClockOutStaff}>
                          <input type="hidden" name="staffId" value={member.id} />
                          <button className="min-h-10 rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                            Force clock out
                          </button>
                        </form>
                      )}
                      <form action={setStaffActive}>
                        <input type="hidden" name="staffId" value={member.id} />
                        <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                        <button className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${member.active ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"}`}>
                          {member.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                      <form action={archiveStaffMember}>
                        <input type="hidden" name="staffId" value={member.id} />
                        <button className="min-h-10 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                          Archive
                        </button>
                      </form>
                    </div>
                  </div>
                  <details className="mt-4 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                    <summary className="cursor-pointer select-none text-xs font-semibold text-stone-700">
                      Edit staff record and access
                    </summary>
                    <form action={saveStaffMember} className="mt-4 space-y-4 border-t border-stone-200 pt-4">
                      <StaffFields member={member} roles={roles} />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
                        >
                          Save changes
                        </button>
                      </div>
                    </form>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center p-8 text-center">
            <div>
              <h3 className="font-semibold text-stone-800">No staff records</h3>
              <p className="mt-2 text-sm text-stone-500">
                Add a staff member, whitelist their personal Halina email, and configure the restaurant PIN.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
