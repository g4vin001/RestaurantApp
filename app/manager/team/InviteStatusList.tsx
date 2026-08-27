"use client";

import { useActionState, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  regenerateStaffInvite,
  revokeStaffInvite,
  type RegenerateInviteState,
} from "./actions";

type InviteSummary = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  status: string;
  expiresAt: string;
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
      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
    >
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

function InviteRow({ invite }: { invite: InviteSummary }) {
  const [state, action, pending] = useActionState(
    regenerateStaffInvite,
    {} as RegenerateInviteState,
  );
  const inviteUrl = state.inviteUrl && typeof window !== "undefined"
    ? new URL(state.inviteUrl, window.location.origin).toString()
    : state.inviteUrl;

  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-stone-900">{invite.name}</h3>
          <p className="mt-1 text-xs text-stone-500">
            {invite.email} · {invite.roleName} · expires{" "}
            {new Intl.DateTimeFormat("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Manila",
            }).format(new Date(invite.expiresAt))}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold">
          {invite.status}
        </span>
      </div>
      {state.error && (
        <p role="alert" className="mt-3 text-xs text-rose-700">{state.error}</p>
      )}
      {inviteUrl && state.shortCode && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-emerald-50 p-3">
          <QRCodeSVG value={inviteUrl} size={112} />
          <div className="min-w-0 flex-1">
            <code className="block break-all text-xs">{inviteUrl}</code>
            <code className="mt-2 block text-lg font-bold tracking-widest">
              {state.shortCode}
            </code>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton value={inviteUrl} label="link" />
              <CopyButton value={state.shortCode} label="code" />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Share manually; no email or SMS was sent.
            </p>
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {invite.status !== "ACCEPTED" && (
          <form action={action}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <button
              disabled={pending}
              className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800"
            >
              {pending ? "Regenerating…" : "Regenerate"}
            </button>
          </form>
        )}
        {invite.status === "ACTIVE" && (
          <form action={revokeStaffInvite}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <button className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700">
              Revoke
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

export function InviteStatusList({ invites }: { invites: InviteSummary[] }) {
  return (
    <section className="mx-auto mt-6 max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-stone-900">Invitation status</h2>
        <p className="mt-1 text-xs text-stone-500">
          Tokens and codes are stored only as hashes. Regeneration invalidates
          the old secrets.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {invites.map((invite) => <InviteRow key={invite.id} invite={invite} />)}
          {!invites.length && (
            <p className="text-sm text-stone-500">No staff invitations yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
