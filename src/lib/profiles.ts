import { supabase } from "./supabase";
import { computeFitnessIndex, type GameState } from "./game";

export interface PublicProfile {
  user_id: string;
  email: string | null;
  username: string | null;
  avatar: string | null;
  total_xp: number;
  level: number;
  fitness_index: number | null;
}

/**
 * Mirrors the public-safe subset of a user's progress into the `profiles`
 * table so friends can see them on the leaderboard. Called (best-effort) on
 * every cloud save. Never throws — if the profiles table isn't set up yet,
 * it just logs and returns, so it can't break the core save flow.
 */
export async function syncProfile(
  userId: string,
  email: string | null,
  state: GameState,
): Promise<void> {
  try {
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId,
      email,
      username: state.name,
      avatar: state.avatar,
      total_xp: state.totalXp,
      level: state.level,
      fitness_index: computeFitnessIndex(state.body),
    });
    if (error) console.warn("profile sync failed", error);
  } catch (e) {
    console.warn("profile sync error", e);
  }
}

export async function findProfileByEmail(
  email: string,
  selfId: string,
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, username, avatar, total_xp, level, fitness_index")
    .ilike("email", email.trim())
    .neq("user_id", selfId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("profile search failed", error);
    return null;
  }
  return (data as PublicProfile) ?? null;
}

export async function getProfiles(userIds: string[]): Promise<PublicProfile[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, username, avatar, total_xp, level, fitness_index")
    .in("user_id", userIds);
  if (error) {
    console.warn("get profiles failed", error);
    return [];
  }
  return (data as PublicProfile[]) ?? [];
}
