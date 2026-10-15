"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Conn = "connecting" | "live" | "polling";

// Live admin updates: subscribes to this contest's score + contest rows.
// Rankings are NEVER computed here — on any event we just re-fetch the
// server-rendered data (debounced ~1s). A 30s poll covers Realtime gaps.
export default function AdminLive({ contestId }: { contestId: string }) {
  const router = useRouter();
  const [conn, setConn] = useState<Conn>("connecting");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [events, setEvents] = useState(0);
  const connRef = useRef<Conn>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = (payload?: object) => {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[admin-live] db event, refreshing soon", payload);
      }
      setEvents((n) => n + 1);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        setUpdatedAt(new Date());
        router.refresh();
      }, 1000);
    };

    const channel = supabase
      .channel(`admin-${contestId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores", filter: `contest_id=eq.${contestId}` },
        refreshSoon
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contests", filter: `id=eq.${contestId}` },
        refreshSoon
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          connRef.current = "live";
          setConn("live");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          connRef.current = "polling";
          setConn("polling");
        }
      });

    // Fallback poll: only fires while Realtime is not live.
    const poll = setInterval(() => {
      if (connRef.current !== "live") router.refresh();
    }, 30000);

    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [contestId, router]);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          setUpdatedAt(new Date());
          router.refresh();
        }}
        title="Re-fetch now"
        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gold-700 ring-1 ring-gold-200 transition hover:bg-gold-50"
      >
        Refresh
      </button>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          conn === "live"
            ? "bg-green-100 text-green-800"
            : conn === "polling"
              ? "bg-amber-100 text-amber-800"
              : "bg-gray-100 text-gray-600"
        }`}
        title={
          conn === "live"
            ? "Realtime connected — updates arrive automatically"
            : conn === "polling"
              ? "Realtime down — polling every 30s"
              : "Connecting to live updates…"
        }
      >
        <span
          className={`h-2 w-2 rounded-full ${
            conn === "live" ? "bg-green-600" : conn === "polling" ? "bg-amber-500" : "bg-gray-400"
          }`}
        />
        {conn === "live" ? "Live" : conn === "polling" ? "Polling" : "Connecting"}
      </span>
      <span className="text-xs text-ink/50" title={`${events} database events seen`}>
        {updatedAt
          ? `Updated ${updatedAt.toLocaleTimeString()}`
          : "Waiting for first update…"}
      </span>
    </span>
  );
}
