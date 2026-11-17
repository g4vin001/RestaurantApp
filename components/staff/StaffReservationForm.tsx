"use client";

import { useActionState, useEffect, type ReactNode } from "react";

export function StaffReservationForm({ saveAction, className, children }: {
  saveAction: (previousDate: string | null, formData: FormData) => Promise<string | null>;
  className: string;
  children: ReactNode;
}) {
  const [savedDate, submit, pending] = useActionState(saveAction, null);

  useEffect(() => {
    if (!savedDate) return;
    // Load a fresh shift view for the saved date, including its reservation list.
    const query = "?reservationDate=" + savedDate;
    if (window.location.search === query) window.location.reload();
    else window.location.assign("/ops" + query + "#reservations");
  }, [savedDate]);

  return (
    <form action={submit} aria-busy={pending}>
      <fieldset className={"min-w-0 " + className} disabled={pending || savedDate !== null}>
        {children}
      </fieldset>
    </form>
  );
}
