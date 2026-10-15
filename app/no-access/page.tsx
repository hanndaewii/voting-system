import Link from "next/link";
import LogoutButton from "@/components/logout-button";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-gold-100 ring-1 ring-gold-100">
        <h1 className="font-display text-3xl text-ink">Access revoked or not invited</h1>
        <div className="mx-auto mt-4 h-px w-24 bg-gold-300" />
        <p className="mt-4 text-sm text-ink/70">
          This account is not an active judge or admin. If you believe this is
          a mistake, contact the contest administrator.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-gold-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-gold-500"
          >
            Back to login
          </Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
