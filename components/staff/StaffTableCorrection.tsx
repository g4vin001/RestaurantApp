"use client";

import { useFormStatus } from "react-dom";
import { correctStaffTable } from "@/app/ops/actions";
import type { CorrectionEvent } from "@/lib/domain/table-correction";
import type { TableStatus } from "@/lib/domain/types";
import { useTableCorrection } from "@/lib/hooks/use-table-correction";
import { useStaffConnection } from "./StaffOperationsProvider";

function CorrectionFields() {
  const { pending } = useFormStatus();
  const { state } = useStaffConnection();
  return <fieldset disabled={pending || !state.online} className="space-y-2">
    <label className="block text-xs font-bold text-amber-950">Correction reason<input name="reason" required minLength={4} maxLength={500} placeholder="What needs correcting?" className="mt-1 min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm" /></label>
    <button className="min-h-11 w-full rounded-lg bg-amber-800 px-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "Correcting…" : "Undo linked action"}</button>
    <p className="text-xs leading-5 text-amber-900">A linked seating group is corrected together. Your reason is saved in the action history.</p>
  </fieldset>;
}

export function StaffTableCorrection({ tableId, status, revision, event, now }: {
  tableId: string; status: TableStatus; revision: number; event: CorrectionEvent | null; now: number;
}) {
  const eligibility = useTableCorrection(status, event, now);
  if (!eligibility.eligible) return <p className="mt-3 text-xs leading-5 text-stone-500">{eligibility.reason}</p>;
  return <details key={event?.occurredAt} className="group mt-3 rounded-xl border border-amber-200 bg-amber-50/50">
    <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-bold text-amber-900">Correct latest action</summary>
    <form action={correctStaffTable} className="border-t border-amber-200 p-3">
      <input type="hidden" name="tableId" value={tableId} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <CorrectionFields />
    </form>
  </details>;
}
