import "server-only";
import { cache } from "react";
import { createClient } from "./server";

// Resolve a contestant photo for display:
//   null            -> null (UI shows initials)
//   http(s) URL     -> returned as-is (legacy full URLs)
//   storage path    -> short-lived signed URL (~1 hour), honoring RLS:
//                      only contest members can generate it.
export const resolvePhotoUrl = cache(
  async (photoUrl: string | null): Promise<string | null> => {
    if (!photoUrl) return null;
    if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("contestant-photos")
      .createSignedUrl(photoUrl, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
);
