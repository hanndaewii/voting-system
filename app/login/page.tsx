import LoginForm from "./form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-500 font-display text-2xl text-white shadow-lg">
            C
          </div>
          <h1 className="font-display text-4xl text-ink">CWPC Judging</h1>
          <p className="mt-2 text-sm tracking-wide text-gold-700 uppercase">
            Official Scoring Portal
          </p>
          <div className="mx-auto mt-4 h-px w-24 bg-gold-300" />
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl shadow-gold-100 ring-1 ring-gold-100">
          {error === "auth" && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              That login link is invalid or expired. Request a new one below.
            </p>
          )}
          {returnTo && (
            <p className="mb-4 rounded-lg bg-gold-50 px-4 py-3 text-sm text-gold-800 ring-1 ring-gold-200">
              Your session expired. Sign in again — your entered scores are kept.
            </p>
          )}
          <LoginForm returnTo={returnTo ?? null} />
        </div>

        <p className="mt-6 text-center text-xs text-ink/50">
          Invited judges only. Enter your email to receive a login link.
        </p>
      </div>
    </main>
  );
}
