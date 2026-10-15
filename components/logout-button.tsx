"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-xl border border-gold-300 px-4 py-2 text-sm font-medium text-gold-700 transition hover:bg-gold-50"
    >
      Sign out
    </button>
  );
}
