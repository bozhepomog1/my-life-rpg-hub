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

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
