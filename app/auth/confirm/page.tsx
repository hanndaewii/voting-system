import { redirect } from "next/navigation";
import ConfirmForm from "./form";

export const dynamic = "force-dynamic";

// Human gate in front of token exchange: scanners may fetch this page,
// but nothing is exchanged until the judge clicks Continue.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}) {
  const { code, token_hash, type, next } = await searchParams;
  if (!code && !(token_hash && type)) redirect("/login?error=auth");

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-gold-100 ring-1 ring-gold-100">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-500 font-display text-2xl text-white shadow-lg">
          C
        </div>
        <h1 className="font-display text-3xl text-ink">Continue to CWPC</h1>
        <div className="mx-auto mt-4 h-px w-24 bg-gold-300" />
        <p className="mt-4 text-sm text-ink/70">
          Click below to finish signing in. Nothing happens until you click —
          email scanners that open links early can&apos;t use up your login.
        </p>
        <div className="mt-6">
          <ConfirmForm
            code={code ?? null}
            tokenHash={token_hash ?? null}
            type={type ?? null}
            next={next ?? null}
          />
        </div>
      </div>
    </main>
  );
}
