import { supabase } from "./supabase";

/** Sends a magic-link sign-in email. Resolves once Supabase has queued the email. */
export async function sendMagicLink(email: string) {
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

/**
 * Starts the Google OAuth sign-in flow (Supabase Auth's built-in OAuth
 * support — no custom OAuth client code needed on our side, just the
 * provider enabled in the Supabase dashboard). This redirects the whole
 * page to Google and back, so a resolved promise only ever means "the
 * redirect was initiated without an immediate error" — the actual session
 * shows up via onAuthStateChange after the user lands back on redirectTo.
 */
export async function signInWithGoogle() {
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
