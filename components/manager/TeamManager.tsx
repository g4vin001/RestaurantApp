"use client";

import {
  Edit3,
  Plus,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useDemo } from "@/components/demo/DemoProvider";
import { Modal } from "@/components/ui/Modal";
import type { StaffMember, StaffPermissionPreset } from "@/lib/domain/types";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const presetLabels: Record<StaffPermissionPreset, string> = {
  MANAGER: "Manager",
  HOST: "Host",
  FLOOR_STAFF: "Floor staff",
};

function StaffForm({
  member,
  onSubmit,
  onCancel,
}: {
  member?: StaffMember;
  onSubmit: (form: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <label className="block text-sm font-semibold text-stone-700">
        Name
        <input
          autoFocus
          name="name"
          required
          defaultValue={member?.name}
          className={inputClass}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-stone-700">
          Job title
          <input
            name="jobTitle"
            required
            defaultValue={member?.jobTitle}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-semibold text-stone-700">
          Permission preset
          <select
            name="permissionPreset"
            defaultValue={member?.permissionPreset ?? "FLOOR_STAFF"}
            className={inputClass}
          >
            <option value="MANAGER">Manager</option>
            <option value="HOST">Host</option>
            <option value="FLOOR_STAFF">Floor staff</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold text-stone-700">
        Contact (optional)
        <input
          name="contact"
          defaultValue={member?.contact}
          className={inputClass}
          placeholder="Phone or email for internal records"
        />
      </label>
      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        Login access is disabled in this prototype. This record does not send an
        invitation or create an employee account.
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
        >
          {member ? "Save changes" : "Add staff member"}
        </button>
      </div>
    </form>
  );
}

export function TeamManager() {
  const { state, addStaff, updateStaff, setStaffStatus, removeStaff } =
    useDemo();
  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const [confirming, setConfirming] = useState<{
    member: StaffMember;
    action: "deactivate" | "remove";
  } | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const notify = useCallback((tone: "success" | "error", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const submit = (form: FormData) => {
    const input = {
      name: String(form.get("name") ?? ""),
      jobTitle: String(form.get("jobTitle") ?? ""),
      contact: String(form.get("contact") ?? ""),
      permissionPreset: String(
        form.get("permissionPreset"),
      ) as StaffPermissionPreset,
    };
    const result =
      editing && editing !== "new"
        ? updateStaff(editing.id, input)
        : addStaff(input);
    if (!result.ok) {
      notify("error", result.error);
      return;
    }
    notify(
      "success",
      editing === "new" ? "Staff member added." : "Staff record updated.",
    );
    setEditing(null);
  };

  const confirmAction = () => {
    if (!confirming) return;
    const result =
      confirming.action === "remove"
        ? removeStaff(confirming.member.id)
        : setStaffStatus(confirming.member.id, false);
    if (!result.ok) {
      notify("error", result.error);
      return;
    }
    notify(
      "success",
      confirming.action === "remove"
        ? "Staff record removed."
        : "Staff member deactivated.",
    );
    setConfirming(null);
  };

  const active = state.staff.filter((member) => member.active).length;
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">PEOPLE</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">
            Team
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Maintain staff records and future permission presets inside the
            manager workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white"
        >
          <Plus size={17} /> Add staff member
        </button>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Team records</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">
            {state.staff.length}
          </p>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Active staff</p>
          <p className="mt-2 text-3xl font-bold text-stone-950">{active}</p>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Login access</p>
          <p className="mt-2 text-lg font-bold text-amber-800">
            Disabled in prototype
          </p>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="font-semibold text-stone-900">Staff directory</h2>
          <p className="mt-1 text-xs text-stone-500">
            Permission presets are informational until invitation-based access
            is implemented.
          </p>
        </div>
        {state.staff.length ? (
          <div className="divide-y divide-stone-100">
            {state.staff.map((member) => (
              <article
                key={member.id}
                className={`flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center ${member.active ? "" : "bg-stone-50 opacity-75"}`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-xl ${member.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-500"}`}
                  >
                    {member.active ? (
                      <UserCheck size={20} />
                    ) : (
                      <UserMinus size={20} />
                    )}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-stone-900">
                        {member.name}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${member.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-600"}`}
                      >
                        {member.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {member.jobTitle}
                      {member.contact ? ` · ${member.contact}` : ""}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-400">
                      <ShieldCheck size={13} />{" "}
                      {presetLabels[member.permissionPreset]} ·{" "}
                      {member.accessStatus === "NOT_INVITED"
                        ? "Not invited"
                        : "Access disabled"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(member)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-600"
                  >
                    <Edit3 size={15} /> Edit
                  </button>
                  {member.active ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirming({ member, action: "deactivate" })
                      }
                      className="min-h-10 rounded-lg px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const result = setStaffStatus(member.id, true);
                        if (result.ok)
                          notify("success", "Staff member reactivated.");
                      }}
                      className="min-h-10 rounded-lg px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirming({ member, action: "remove" })}
                    className="grid h-10 w-10 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Remove ${member.name}`}
                  >
                    <UserRoundX size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <UsersRound className="mx-auto text-stone-300" size={36} />
              <h3 className="mt-4 font-semibold text-stone-800">
                No staff records
              </h3>
              <p className="mt-2 text-sm text-stone-500">
                Add the first manager, host, or floor staff record.
              </p>
            </div>
          </div>
        )}
      </section>

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add staff member" : "Edit staff record"}
        description="This stores an internal demo record only; no account or invitation is created."
        onClose={() => setEditing(null)}
      >
        {editing && (
          <StaffForm
            member={editing === "new" ? undefined : editing}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        open={confirming !== null}
        title={
          confirming?.action === "remove"
            ? "Remove staff record?"
            : "Deactivate staff member?"
        }
        description={
          confirming?.action === "remove"
            ? "This removes the demo record. Use deactivate when you want to preserve it."
            : "The record stays in the directory, but is marked inactive and access-disabled."
        }
        onClose={() => setConfirming(null)}
      >
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmAction}
            className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white"
          >
            Confirm
          </button>
        </div>
      </Modal>
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-[80]"
      >
        {toast && (
          <div
            className={`max-w-sm rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.tone === "success" ? "bg-emerald-800" : "bg-rose-700"}`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
