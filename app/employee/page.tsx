import { QueueList } from "@/components/QueueList";
import { TableCard } from "@/components/TableCard";
import { layoutItems, queueEntries } from "@/lib/mock-data";

export default function EmployeePage() { return <main className="mx-auto max-w-5xl px-5 py-10"><h1 className="text-3xl font-bold">Employee dashboard</h1><p className="mt-2 text-stone-600">Use these placeholder controls to see where live updates will belong.</p><h2 className="mt-8 text-xl font-semibold">Table status</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{layoutItems.filter((item) => item.type !== "waiting-area").map((item) => <TableCard key={item.id} item={item} />)}</div><h2 className="mt-8 text-xl font-semibold">Queue</h2><div className="mt-4 max-w-2xl"><QueueList entries={queueEntries} showActions /></div></main>; }
