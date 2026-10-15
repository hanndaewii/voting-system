"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateContestant } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;
const LONG_SIDE = 1200;

type Status = "idle" | "working" | "error";

// Photo upload runs entirely on the admin's own session (no service key):
// validate -> resize client-side -> upload with a random name (no
// overwrite) -> store the path -> remove the replaced file best-effort.
export default function PhotoUpload({
  contestId,
  contestantId,
  currentPath,
  disabled,
}: {
  contestId: string;
  contestantId: string;
  currentPath: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("not an image"));
      };
      img.src = url;
    });
  }

  async function onFile(file: File) {
    setMessage("");
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Only image files (jpeg, png, webp).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setMessage("File is over 5 MB.");
      return;
    }
    setStatus("working");
    try {
      const img = await loadImage(file).catch(() => {
        throw new Error("Could not read that image.");
      });
      const scale = Math.min(1, LONG_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85)
      );
      if (!blob) throw new Error("Resize failed.");

      const path = `${contestId}/${contestantId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error: up } = await supabase.storage
        .from("contestant-photos")
        .upload(path, blob, { upsert: false, contentType: "image/jpeg" });
      if (up) throw new Error(up.message);

      const saved = await updateContestant(contestantId, { photo_url: path });
      if (!saved.ok) {
        await supabase.storage.from("contestant-photos").remove([path]);
        throw new Error(saved.message);
      }
      if (currentPath && !/^https?:\/\//i.test(currentPath)) {
        await supabase.storage.from("contestant-photos").remove([currentPath]);
      }
      setStatus("idle");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || status === "working"}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        disabled={disabled || status === "working"}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-gold-100 px-3 py-2 text-xs font-medium text-gold-800 transition hover:bg-gold-200 disabled:opacity-40"
      >
        {status === "working" ? "Uploading…" : currentPath ? "Replace photo" : "Upload photo"}
      </button>
      {status === "error" && <span className="text-xs text-red-700">{message}</span>}
    </div>
  );
}
