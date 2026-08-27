"use client";

import { useState } from "react";
import {
  archiveCustomStaffRole,
  createCustomStaffRole,
  updateCustomStaffRole,
} from "./actions";
import {
  STAFF_PERMISSION_CEILING,
  STAFF_PERMISSION_LABELS,
  STAFF_ROLE_PRESETS,
} from "@/lib/staff/permissions";
import type { StaffPermission } from "@/lib/domain/types";

type PresetKey = keyof typeof STAFF_ROLE_PRESETS;

export function StaffRoleManager({
  roles,
}: {
  roles: Array<{ id: string; name: string; presetKey: string | null; permissions: StaffPermission[]; revision: number; staffCount: number }>;
}) {
  const [basePreset, setBasePreset] = useState<PresetKey>("FLOOR_STAFF");
  const [permissions, setPermissions] = useState<StaffPermission[]>([
    ...STAFF_ROLE_PRESETS.FLOOR_STAFF,
  ]);

  return (
    <section className="mx-auto mt-6 max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Staff roles and permission ceiling</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">Custom roles can only grant Live Floor and Queue operations. Analytics, Floor Editor, Team, Settings, Admin, onboarding, and tenant switching are never staff permissions.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {roles.map((role) => (
            <article key={role.id} className="rounded-xl border border-stone-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{role.name}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {role.presetKey ? "Protected preset" : "Custom role"} · {role.staffCount} staff
                  </p>
                </div>
                {!role.presetKey && (
                  <form action={archiveCustomStaffRole}>
                    <input type="hidden" name="roleId" value={role.id} />
                    <button disabled={role.staffCount > 0} className="text-xs font-semibold text-rose-700 disabled:opacity-30">Archive</button>
                  </form>
                )}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-stone-600">
                {role.permissions.map((permission) => <li key={permission}>✓ {STAFF_PERMISSION_LABELS[permission]}</li>)}
              </ul>
              {!role.presetKey && (
                <details className="mt-3 border-t border-stone-100 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-emerald-800">Edit role</summary>
                  <form action={updateCustomStaffRole} className="mt-3 space-y-3">
                    <input type="hidden" name="roleId" value={role.id} />
                    <input type="hidden" name="expectedRevision" value={role.revision} />
                    <label className="block text-xs font-medium text-stone-700">
                      Role name
                      <input name="name" defaultValue={role.name} required minLength={2} maxLength={60} className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 px-3" />
                    </label>
                    <fieldset className="grid gap-2">
                      <legend className="mb-1 text-xs font-semibold text-stone-700">Allowed operations</legend>
                      {STAFF_PERMISSION_CEILING.map((permission) => (
                        <label key={permission} className="flex items-center gap-2 text-xs text-stone-700">
                          <input type="checkbox" name="permissions" value={permission} defaultChecked={role.permissions.includes(permission)} />
                          {STAFF_PERMISSION_LABELS[permission]}
                        </label>
                      ))}
                    </fieldset>
                    <button className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white">Save role</button>
                  </form>
                </details>
              )}
            </article>
          ))}
        </div>
        <details className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-emerald-900">Clone a preset into a custom role</summary>
          <form action={createCustomStaffRole} className="border-t border-emerald-200 p-4">
            <label className="text-sm font-medium text-stone-700">Role name<input name="name" required minLength={2} maxLength={60} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3" /></label>
            <label className="mt-4 block text-sm font-medium text-stone-700">Start from preset<select name="basePreset" value={basePreset} onChange={(event) => { const preset = event.target.value as PresetKey; setBasePreset(preset); setPermissions([...STAFF_ROLE_PRESETS[preset]]); }} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"><option value="FLOOR_STAFF">Floor Staff</option><option value="HOST">Host</option><option value="SHIFT_LEAD">Shift Lead</option></select></label>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold text-stone-700">Allowed operations</legend>{STAFF_PERMISSION_CEILING.map((permission) => <label key={permission} className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs text-stone-700"><input type="checkbox" name="permissions" value={permission} checked={permissions.includes(permission)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />{STAFF_PERMISSION_LABELS[permission]}</label>)}</fieldset>
            <button className="mt-4 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Create custom role</button>
          </form>
        </details>
      </div>
    </section>
  );
}
