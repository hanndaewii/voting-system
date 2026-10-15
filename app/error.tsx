"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-gold-100 ring-1 ring-gold-100">
        <h1 className="font-display text-3xl text-ink">Something went wrong</h1>
        <div className="mx-auto mt-4 h-px w-24 bg-gold-300" />
        <p className="mt-4 text-sm text-ink/70">
          Please try again. If it keeps happening, contact the administrator.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-xl bg-gold-600 px-5 py-2.5 font-medium text-white shadow-md transition hover:bg-gold-500"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
