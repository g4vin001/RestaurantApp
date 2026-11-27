"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_EVIDENCE_BYTES } from "@/lib/auth/restaurant-onboarding";

export type ReviewFormState = { error?: string; message?: string; refresh?: boolean };
type ReviewAction = (state: ReviewFormState, data: FormData) => Promise<ReviewFormState>;

function noticeKey() {
  return `halina:review-notice:${window.location.pathname}`;
}

export function ReviewNotice() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(noticeKey());
      if (stored) {
        window.sessionStorage.removeItem(noticeKey());
        setMessage(stored);
      }
    } catch {
      // The saved decision is still visible in the review history.
    }
  }, []);
  return message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>;
}

export function EvidenceInput({ required }: { required: boolean }) {
  return <input name="evidence" type="file" accept=".pdf,.png,.jpg,.jpeg" required={required} aria-describedby="evidence-help"
    className="review-field" onChange={(event) => {
      const input = event.currentTarget;
      input.setCustomValidity((input.files?.[0]?.size ?? 0) > MAX_EVIDENCE_BYTES ? "Upload a file of 2 MB or less." : "");
      if (!input.validity.valid && input.files?.length) input.reportValidity();
    }} />;
}

export function ReviewForm({ action, children, submit, confirmation }: {
  action: ReviewAction;
  children?: ReactNode;
  submit: string;
  confirmation?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!state.refresh || pending) return;
    if (state.message) {
      try {
        window.sessionStorage.setItem(noticeKey(), state.message);
      } catch {
        // The page still reloads to show the saved result.
      }
    }
    window.location.reload();
  }, [pending, state]);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  function submitReview(element: HTMLFormElement) {
    // Dispatch explicitly so React preserves entered fields after a rejected upload.
    const data = new FormData(element);
    for (const [name, value] of data) {
      if (value instanceof File && !value.name && value.size === 0) data.delete(name);
    }
    startTransition(() => formAction(data));
  }

  return (
    <form ref={form} action={formAction} aria-busy={!ready || pending} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      if (confirmation) dialog.current?.showModal();
      else submitReview(event.currentTarget);
    }}>
      <fieldset disabled={!ready || pending} className="min-w-0 space-y-4">
        {children}
        {state.error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{state.error}</p>}
        {state.message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{state.message}</p>}
        <button type="submit" className="review-primary">{pending ? "Saving…" : submit}</button>
      </fieldset>
      {confirmation && (
        <dialog ref={dialog} aria-label={submit} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl backdrop:bg-stone-950/50">
          <h3 className="text-lg font-semibold text-stone-950">{submit}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-700">{confirmation}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" autoFocus className="review-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" className="review-primary" onClick={() => {
              dialog.current?.close();
              if (form.current?.reportValidity()) submitReview(form.current);
            }}>Confirm</button>
          </div>
        </dialog>
      )}
    </form>
  );
}
