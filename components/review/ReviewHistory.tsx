import { PageCard } from "@/components/PageCard";
import type { RestaurantReviewAction, RestaurantApplicationStatus, RestaurantLifecycle } from "@/lib/generated/prisma/enums";
import { formatScheduledAt } from "@/lib/helpers";
import { applicationLabels, lifecycleLabels, reviewEventLabels } from "@/lib/restaurants/review";

export function ReviewHistory({ events }: { events: Array<{
  id: string; action: RestaurantReviewAction; createdAt: Date; message: string | null;
  actorEmail?: string | null; fromStatus?: RestaurantApplicationStatus | null; toStatus?: RestaurantApplicationStatus | null;
  fromLifecycle?: RestaurantLifecycle | null; toLifecycle?: RestaurantLifecycle | null; details?: unknown;
}> }) {
  return (
    <PageCard className="mt-5 min-w-0">
      <h2 className="text-lg font-semibold text-stone-950">Review history</h2>
      {events.length === 0 ? <p className="mt-2 text-sm text-stone-600">There are no review events for this restaurant yet.</p> : (
        <ol className="mt-3 divide-y divide-stone-200">
          {events.map((event) => (
            <li key={event.id} className="py-3">
              <p className="font-semibold text-stone-950">{reviewEventLabels[event.action]}</p>
              <p className="mt-1 break-words text-xs text-stone-600">{formatScheduledAt(event.createdAt.toISOString())}{event.actorEmail && ` · ${event.actorEmail}`}</p>
              {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus && <p className="mt-1 text-xs text-stone-700">{applicationLabels[event.fromStatus]} → {applicationLabels[event.toStatus]}</p>}
              {event.fromLifecycle && event.toLifecycle && event.fromLifecycle !== event.toLifecycle && <p className="mt-1 text-xs text-stone-700">{lifecycleLabels[event.fromLifecycle]} → {lifecycleLabels[event.toLifecycle]}</p>}
              {event.message && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{event.message}</p>}
              {Boolean(event.details) && <details className="mt-2 text-xs text-stone-700">
                <summary className="cursor-pointer font-semibold text-emerald-900">Recorded details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-stone-50 p-3">{JSON.stringify(event.details, null, 2)}</pre>
              </details>}
            </li>
          ))}
        </ol>
      )}
    </PageCard>
  );
}
