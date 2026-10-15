export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-md animate-pulse">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gold-200" />
        <div className="mx-auto h-10 w-56 rounded bg-gold-200" />
        <div className="mt-6 rounded-2xl bg-white p-8 ring-1 ring-gold-100">
          <div className="h-12 rounded-xl bg-gold-100" />
          <div className="mt-4 h-12 rounded-xl bg-gold-100" />
        </div>
      </div>
    </main>
  );
}
