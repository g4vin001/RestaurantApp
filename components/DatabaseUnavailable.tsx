export function DatabaseUnavailable({
  reference,
}: {
  reference: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">SHARED DATA ERROR</p>
        <h1 className="mt-2 text-2xl font-bold text-stone-950">
          Restaurant data could not be loaded
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Halina could not read the restaurant database. No browser demo data
          was substituted. Please retry shortly or ask the project owner to
          check the database connection and migration status.
        </p>
        <p className="mt-4 text-xs text-stone-500">
          Support reference: <span className="font-mono">{reference}</span>
        </p>
      </section>
    </main>
  );
}
