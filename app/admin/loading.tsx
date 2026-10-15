export default function Loading() {
  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="h-4 w-32 rounded bg-gold-200" />
        <div className="mt-2 h-10 w-72 rounded bg-gold-200" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl bg-white p-4 ring-1 ring-gold-100">
              <div className="mx-auto h-8 w-16 rounded bg-gold-100" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-white p-6 ring-1 ring-gold-100">
          <div className="h-6 w-40 rounded bg-gold-100" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-gold-100/60" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
