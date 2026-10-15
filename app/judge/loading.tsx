export default function Loading() {
  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl animate-pulse">
        <div className="h-4 w-32 rounded bg-gold-200" />
        <div className="mt-2 h-10 w-64 rounded bg-gold-200" />
        <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-gold-100">
          <div className="h-6 w-40 rounded bg-gold-100" />
          <div className="mt-3 h-3 rounded-full bg-gold-100" />
        </div>
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 ring-1 ring-gold-100">
              <div className="h-14 w-14 shrink-0 rounded-full bg-gold-100" />
              <div className="h-5 flex-1 rounded bg-gold-100" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
