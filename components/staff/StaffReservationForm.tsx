"use client";

import { useActionState, type ReactNode } from "react";

export function StaffReservationForm({ saveAction, className, children }: {
  saveAction: (formData: FormData) => Promise<string | null>;
  className: string;
  children: ReactNode;
}) {
  const [savedDate, submit, pending] = useActionState(async (_previousDate: string | null, formData: FormData) => {
    const date = await saveAction(formData);
    if (!date) return null;
    // Load a fresh shift view for the saved date, including its reservation list.
    const query = "?reservationDate=" + date;
    if (window.location.search === query) window.location.reload();
    else window.location.assign("/ops" + query + "#reservations");
    return date;
  }, null);

  return (
    <form action={submit} aria-busy={pending}>
      <fieldset className={"min-w-0 " + className} disabled={pending || savedDate !== null}>
        {children}
      </fieldset>
    </form>
  );
}
