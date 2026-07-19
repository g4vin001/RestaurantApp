import { LayoutPreview } from "@/components/LayoutPreview";
import { PageCard } from "@/components/PageCard";
import { layoutItems } from "@/lib/mock-data";

export default function LayoutBuilderPage() { return <main className="mx-auto max-w-5xl px-5 py-10"><h1 className="text-3xl font-bold">Layout builder</h1><p className="mt-2 text-stone-600">Static preview only—drag-and-drop will be added later.</p><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_220px]"><LayoutPreview items={layoutItems} /><PageCard><h2 className="font-semibold">Add an item</h2><div className="mt-4 space-y-2">{["2-seater table", "4-seater table", "Bar seat", "Waiting area"].map((item) => <button key={item} className="w-full rounded-md border border-stone-300 px-3 py-2 text-left text-sm">+ {item}</button>)}</div></PageCard></div></main>; }
