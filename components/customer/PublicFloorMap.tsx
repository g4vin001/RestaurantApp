import type {
  PublicFloorElement,
  PublicFloorView,
  PublicTableStatus,
} from "@/lib/customer/public-floor";

const statusMeta: Record<
  PublicTableStatus,
  { label: string; className: string }
> = {
  AVAILABLE: {
    label: "Available",
    className: "border-emerald-500 bg-emerald-50 text-emerald-900",
  },
  RESERVED: {
    label: "Reserved",
    className: "border-blue-500 bg-blue-50 text-blue-900",
  },
  IN_USE: {
    label: "In use",
    className: "border-stone-400 bg-stone-200 text-stone-800",
  },
  PREPARING: {
    label: "Being prepared",
    className: "border-amber-500 bg-amber-50 text-amber-900",
  },
  UNAVAILABLE: {
    label: "Unavailable",
    className: "border-stone-300 bg-stone-100 text-stone-500",
  },
};

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});

function formatBookingTime(iso: string) {
  return timeFormatter.format(new Date(iso));
}

function pct(value: number, total: number) {
  return `${(value / Math.max(1, total)) * 100}%`;
}

function tableRadius(shape: PublicFloorElement["shape"]) {
  if (shape === "ROUND") return "9999px";
  if (shape === "BOOTH") return "14px";
  return "8px";
}

function StructureElement({
  element,
  floor,
}: {
  element: PublicFloorElement;
  floor: PublicFloorView;
}) {
  const style = {
    left: pct(element.x, floor.logicalWidth),
    top: pct(element.y, floor.logicalHeight),
    width: pct(element.width, floor.logicalWidth),
    height: pct(element.height, floor.logicalHeight),
    transform: `rotate(${element.rotation}deg)`,
    zIndex: element.zIndex,
  };

  if (element.type === "WALL") {
    return <div aria-hidden="true" className="absolute bg-stone-500" style={style} />;
  }
  if (element.type === "COLUMN") {
    return <div aria-hidden="true" className="absolute rounded-sm bg-stone-400" style={style} />;
  }
  if (element.type === "ZONE") {
    return (
      <div
        aria-hidden="true"
        className="absolute border border-dashed border-stone-300 bg-stone-50/30 p-1 text-[8px] font-semibold uppercase tracking-wide text-stone-400"
        style={style}
      >
        {element.label}
      </div>
    );
  }

  const label =
    element.label ??
    (element.type === "RESTROOM"
      ? "Restroom"
      : element.type === "WAITING_AREA"
        ? "Waiting"
        : "Entrance");
  return (
    <div
      aria-label={label}
      className="absolute grid place-items-center overflow-hidden rounded-md border border-stone-300 bg-white/80 px-1 text-center text-[8px] font-medium text-stone-500"
      style={style}
    >
      {label}
    </div>
  );
}

export function PublicFloorMap({ floor }: { floor: PublicFloorView }) {
  const tables = floor.elements.filter(
    (element) => element.type === "TABLE" && element.status,
  );
  const structures = floor.elements.filter((element) => element.type !== "TABLE");

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">LIVE DINING FLOOR</p>
          <h2 className="mt-1 text-xl font-bold text-stone-950">{floor.name}</h2>
          <p className="mt-1 text-sm text-stone-500">
            Table colors show the restaurant&apos;s current public availability.
            Hover or tap a table to see its bookings for the rest of today.
          </p>
        </div>
        <p className="text-xs text-stone-400">Published layout v{floor.version}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600">
        {(Object.keys(statusMeta) as PublicTableStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              className={`h-3 w-3 rounded border ${statusMeta[status].className}`}
              aria-hidden="true"
            />
            {statusMeta[status].label}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-100 p-3 shadow-inner">
        <div
          className="relative w-full rounded-xl bg-white"
          style={{ aspectRatio: `${floor.logicalWidth} / ${floor.logicalHeight}` }}
          aria-label={`Published dining layout for ${floor.name}`}
        >
          {structures.map((element) => (
            <StructureElement key={element.id} element={element} floor={floor} />
          ))}
          {tables.map((table) => {
            const status = table.status as PublicTableStatus;
            const meta = statusMeta[status];
            const bookings = table.upcomingReservations ?? [];
            const times = bookings.map(formatBookingTime);
            const spokenBookings = times.length
              ? `Booked at ${times.join(", ")}.`
              : "No bookings for the rest of today.";
            // Flip the tooltip away from the nearest edge so it stays on screen.
            const alignRight = table.x / floor.logicalWidth > 0.6;
            const placeBelow = table.y / floor.logicalHeight < 0.35;
            return (
              <div
                key={table.id}
                className="group absolute"
                style={{
                  left: pct(table.x, floor.logicalWidth),
                  top: pct(table.y, floor.logicalHeight),
                  width: pct(table.width, floor.logicalWidth),
                  height: pct(table.height, floor.logicalHeight),
                  zIndex: table.zIndex,
                }}
              >
                <button
                  type="button"
                  className={`grid h-full w-full place-items-center overflow-hidden border-2 px-1 text-center shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${meta.className}`}
                  style={{
                    transform: `rotate(${table.rotation}deg)`,
                    borderRadius: tableRadius(table.shape),
                  }}
                  aria-label={`${table.label ?? "Table"}, ${table.capacity ?? 0} seats, ${meta.label}. ${spokenBookings}`}
                >
                  <span className="text-[9px] font-bold leading-tight sm:text-xs">
                    {table.label}
                  </span>
                  <span className="hidden text-[8px] leading-tight opacity-75 sm:block">
                    {table.capacity} seats
                  </span>
                </button>
                <div
                  aria-hidden="true"
                  className={`pointer-events-none invisible absolute z-50 w-44 rounded-lg border border-stone-200 bg-white p-2.5 text-left opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${alignRight ? "right-0" : "left-0"} ${placeBelow ? "top-full mt-2" : "bottom-full mb-2"}`}
                >
                  <p className="text-xs font-bold text-stone-900">
                    {table.label ?? "Table"}
                    <span className="font-normal text-stone-400">
                      {" "}
                      · {table.capacity ?? 0} seats
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-stone-600">
                    {meta.label}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Booked later today
                  </p>
                  {times.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {times.map((time, index) => (
                        <li
                          key={`${bookings[index]}-${time}`}
                          className="text-[11px] text-stone-700"
                        >
                          {time}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-stone-500">
                      No bookings yet
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-stone-500">
        Availability can change while you travel. A green table is an indication,
        not a guarantee or reservation; the restaurant still controls final seating.
      </p>
    </section>
  );
}
