import { Suspense } from "react";
import { LiveFloor } from "@/components/manager/LiveFloor";

export default function LiveFloorPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1500px] animate-pulse px-6 py-8 text-sm text-stone-500">Loading live floor…</div>}>
      <LiveFloor />
    </Suspense>
  );
}
