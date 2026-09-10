import type { restaurantServiceStatus } from "@/lib/domain/restaurant-schedule";

export function OpeningHours({ service, timeZone }: {
  service: ReturnType<typeof restaurantServiceStatus>;
  timeZone: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <p className="font-semibold text-stone-900">{service.statusLabel}</p>
      {service.exceptionLabel && <p className="mt-1 text-sm font-medium text-amber-800">{service.exceptionLabel}</p>}
      <p className="mt-1 text-sm leading-6 text-stone-600">
        Service starting today: {service.todayHours.length ? service.todayHours.join(" · ") : "none"}
      </p>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">Weekly hours · {timeZone}</summary>
        <dl className="mt-1 space-y-2 text-sm">
          {service.weeklyHours.map(({ day, hours }) => (
            <div key={day} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
              <dt className="font-medium text-stone-700">{day}</dt>
              <dd className="text-stone-600">{hours.length ? hours.join(" · ") : "Closed"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-stone-500">Holiday hours may differ. Overnight service belongs to the day it starts.</p>
      </details>
    </div>
  );
}
