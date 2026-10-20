import { MapPin } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export function RestaurantHero({ name, location, cuisineType, coverImageUrl, openNow, statusLabel, walkInStatus }: {
  name: string;
  location: string;
  cuisineType?: string;
  coverImageUrl?: string;
  openNow: boolean;
  statusLabel: string;
  walkInStatus: string;
}) {
  return (
    <header className="relative mt-3 flex min-h-56 items-end overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 to-stone-900 sm:min-h-72">
      {coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- versioned route already serves a resized JPEG
        <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      )}
      {/* Darkens the lower half so the overlaid text stays readable on any photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/35 to-transparent" />
      <div className="relative w-full p-5 sm:p-7">
        {cuisineType && <p className="text-sm font-semibold uppercase tracking-wide text-emerald-200">{cuisineType}</p>}
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">{name}</h1>
        {location && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-200">
            <MapPin size={16} className="shrink-0" />
            {location}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${openNow ? "bg-emerald-400" : "bg-stone-400"}`} />
            {statusLabel}
          </span>
          {/* When closed, the service label above already says so. */}
          {openNow && <StatusBadge status={walkInStatus} label={`Walk-ins: ${walkInStatus}`} />}
        </div>
      </div>
    </header>
  );
}
