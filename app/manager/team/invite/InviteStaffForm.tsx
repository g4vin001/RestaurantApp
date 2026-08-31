"use client";

import { useActionState, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createStaffInvite, type InviteStaffState } from "./actions";

const initialState: InviteStaffState = {};
const inputClass = "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5";

type StaffCandidate = {
  id: string;
  name: string;
  jobTitle: string;
  email: string | null;
  staffRoleId: string | null;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      className="mt-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
    >
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export function InviteStaffForm({
  roles,
  staff,
}: {
  roles: Array<{ id: string; name: string }>;
  staff: StaffCandidate[];
}) {
  const [state, action, pending] = useActionState(createStaffInvite, initialState);
  const [staffMemberId, setStaffMemberId] = useState("");
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [staffRoleId, setStaffRoleId] = useState(roles[0]?.id ?? "");
  if (state.inviteUrl && state.shortCode) {
    const inviteUrl = typeof window === "undefined"
      ? state.inviteUrl
      : new URL(state.inviteUrl, window.location.origin).toString();
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-emerald-800">Invite created for {state.staffName}.</p>
        <div className="rounded-xl bg-stone-50 p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Invite link</p>
          <code className="mt-1 block break-all text-sm">{inviteUrl}</code>
          <CopyButton value={inviteUrl} label="link" />
          <div className="mt-4 inline-block rounded-xl bg-white p-3" aria-label="Staff invitation QR code">
            <QRCodeSVG value={inviteUrl} size={184} level="M" />
          </div>
          <p className="mt-4 text-xs uppercase tracking-wide text-stone-500">Manual code</p>
          <code className="mt-1 block text-xl font-bold tracking-widest">{state.shortCode}</code>
          <CopyButton value={state.shortCode} label="code" />
        </div>
        <p className="text-xs leading-5 text-stone-500">Single-use and expires after 24 hours. Share the link, QR code, or manual code yourself. Halina does not send email or SMS in this release.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {staff.length > 0 && (
        <label className="block text-sm font-medium">
          Staff directory record
          <select
            name="staffMemberId"
            value={staffMemberId}
            onChange={(event) => {
              const nextId = event.target.value;
              const member = staff.find((candidate) => candidate.id === nextId);
              setStaffMemberId(nextId);
              setName(member?.name ?? "");
              setJobTitle(member?.jobTitle ?? "");
              setEmail(member?.email ?? "");
              setStaffRoleId(member?.staffRoleId ?? roles[0]?.id ?? "");
            }}
            className={inputClass}
          >
            <option value="">Create a new staff record</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} · {member.jobTitle}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-stone-500">
            Selecting an existing record links access to it instead of creating a duplicate.
          </span>
        </label>
      )}
      <label className="block text-sm font-medium">Name<input name="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-medium">Job title<input name="jobTitle" required maxLength={80} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-medium">Verified Halina email<input name="email" type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /><span className="mt-1 block text-xs font-normal text-stone-500">The accepting account must have this exact verified email.</span></label>
      <label className="block text-sm font-medium">Staff role<select name="staffRoleId" required value={staffRoleId} onChange={(event) => setStaffRoleId(event.target.value)} className={inputClass}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 font-semibold text-white disabled:opacity-60">{pending ? "Creating…" : "Create staff invite"}</button>
    </form>
  );
}
