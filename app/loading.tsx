export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8" aria-busy="true" aria-label="Loading page">
      <div className="mb-6 h-7 w-40 animate-pulse rounded-lg bg-stone-200" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-stone-200 bg-white"
          />
        ))}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-2xl border border-stone-200 bg-white" />
    </main>
  );
}
