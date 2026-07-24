import { supabase } from "./supabase";
import { computeFitnessIndex, type GameState } from "./game";

/**
 * Public-safe profile fields. Deliberately contains NO email: RLS is
 * row-level, so any column readable here would be readable for every user's
 * row. Emails live in the private `user_emails` table and are only ever
 * matched through the find_user_by_email() SECURITY DEFINER function.
 */
export interface PublicProfile {
  user_id: string;
  username: string | null;
  avatar: string | null;
  total_xp: number;
  level: number;
  fitness_index: number | null;
}

const PUBLIC_COLUMNS = "user_id, username, avatar, total_xp, level, fitness_index";

/**
 * Mirrors the public-safe subset of a user's progress into `profiles`, and
 * their email into the private `user_emails` lookup table, so friends can
 * find them by address and see them on the leaderboard. Called (best-effort)
 * on every cloud save. Never throws — if the tables aren't set up yet, it
 * just logs, so it can't break the core save flow.
 */
export async function syncProfile(
  userId: string,
  email: string | null,
  state: GameState,
): Promise<void> {
  try {
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId,
      username: state.name,
      avatar: state.avatar,
      total_xp: state.totalXp,
      level: state.level,
      fitness_index: computeFitnessIndex(state.body),
    });
    if (error) console.warn("profile sync failed", error);

    if (email) {
      const { error: emailError } = await supabase
        .from("user_emails")
        .upsert({ user_id: userId, email });
      if (emailError) console.warn("email sync failed", emailError);
    }
  } catch (e) {
    console.warn("profile sync error", e);
  }
}

/**
 * Looks up a single user by exact email via the SECURITY DEFINER RPC. The
 * client never reads the email table directly, and the function returns only
 * public profile fields — no address is ever sent back.
 */
export async function findProfileByEmail(email: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("find_user_by_email", {
    p_email: email.trim(),
  });
  if (error) {
    console.warn("profile search failed", error);
    return null;
  }
  const rows = (data as PublicProfile[] | null) ?? [];
  return rows[0] ?? null;
}

export async function getProfiles(userIds: string[]): Promise<PublicProfile[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .in("user_id", userIds);
  if (error) {
    console.warn("get profiles failed", error);
    return [];
  }
  return (data as PublicProfile[]) ?? [];
}
