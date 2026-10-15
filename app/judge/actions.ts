"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SaveResult {
  ok: boolean;
  message?: string;
}

export interface SubmitResult {
  ok: boolean;
  message: string;
  missing?: { contestant_name: string; criterion_name: string }[];
}

// Caller's own active, non-admin judge row for this contest —
// derived server-side from the session, never trusted from the client.
async function myJudgeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  contestId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("judges")
    .select("id")
    .eq("user_id", userId)
    .eq("contest_id", contestId)
    .eq("is_active", true)
    .eq("is_admin", false)
    .limit(1)
    .maybeSingle();
  return ((data as { id: string } | null)?.id ?? null) as string | null;
}

// Autosave a draft score. Runs as the judge, so RLS decides:
// open contest + own score + not final, or the write is refused.
export async function saveScore(input: {
  contestId: string;
  contestantId: string;
  criterionId: string;
  value: number;
}): Promise<SaveResult> {
  const v = Math.round(Number(input.value) * 10) / 10;
  if (!Number.isFinite(v) || v < 1 || v > 10) {
    return { ok: false, message: "Score must be between 1 and 10." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const judgeId = await myJudgeId(supabase, user.id, input.contestId);
  if (!judgeId) return { ok: false, message: "Not an active judge of this contest." };

  const { data: saved, error } = await supabase
    .from("scores")
    .upsert(
      {
        contest_id: input.contestId,
        contestant_id: input.contestantId,
        judge_id: judgeId,
        criterion_id: input.criterionId,
        value: v,
        is_final: false,
      },
      { onConflict: "contestant_id,judge_id,criterion_id" }
    )
    .select("id");

  if (error) {
    const blocked = /row-level security|policy/i.test(error.message);
    return {
      ok: false,
      message: blocked
        ? "Save blocked — scores are submitted or the contest is closed."
        : `Save failed: ${error.message}`,
    };
  }
  // An RLS-denied UPDATE inside the upsert returns zero rows, not an error.
  // Treat that as a failure so saves never fail silently.
  if (!saved || saved.length === 0) {
    return {
      ok: false,
      message: "Save blocked — scores are submitted or the contest is closed.",
    };
  }
  return { ok: true };
}

// Final submit: one atomic server-side check + finalize via the
// submit_final_scores() Postgres function (invoker rights: RLS applies).
export async function submitScores(contestId: string): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data, error } = await supabase.rpc("submit_final_scores", {
    p_contest: contestId,
  });
  if (error) {
    if (/not open/i.test(error.message))
      return { ok: false, message: "The contest is not open." };
    if (/not an active judge/i.test(error.message))
      return { ok: false, message: "Not an active judge of this contest." };
    return { ok: false, message: `Submit failed: ${error.message}` };
  }

  const res = data as {
    ok: boolean;
    missing?: { contestant_name: string; criterion_name: string }[];
    finalized?: number;
  };
  if (!res.ok) {
    return {
      ok: false,
      message: `Incomplete — ${(res.missing ?? []).length} score(s) still missing.`,
      missing: res.missing ?? [],
    };
  }
  revalidatePath("/judge");
  return {
    ok: true,
    message: `Submitted ${res.finalized ?? 0} scores. They are now final.`,
  };
}
