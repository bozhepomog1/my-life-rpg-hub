import { useEffect, useState } from "react";
import { useAuthContext } from "@/lib/use-auth-context";
import { supabase } from "@/lib/supabase";

/**
 * Fetches the signed-in user's own immutable friend short_code from
 * `profiles`, for display in ProfileHeader/SettingsPanel with a copy
 * button. The row (and its short_code, generated server-side on insert)
 * may not exist yet in the first moments after sign-in, before the first
 * debounced cloud save runs — callers should treat `code === null` while
 * `loading` as "not ready yet", not as an error.
 */
export function useMyShortCode() {
  const { user } = useAuthContext();
  const userId = user?.id ?? null;

  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setCode(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("profiles")
      .select("short_code")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("short_code fetch failed", error);
          setCode(null);
        } else {
          setCode((data as { short_code: string | null } | null)?.short_code ?? null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { code, loading };
}
