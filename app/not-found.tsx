import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-gold-100 ring-1 ring-gold-100">
        <h1 className="font-display text-3xl text-ink">Page not found</h1>
        <div className="mx-auto mt-4 h-px w-24 bg-gold-300" />
        <p className="mt-4 text-sm text-ink/70">
          That page doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-gold-600 px-5 py-2.5 font-medium text-white shadow-md transition hover:bg-gold-500"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
