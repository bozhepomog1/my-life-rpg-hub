import { supabase } from "./supabase";
import { computeFitnessIndex, type GameState } from "./game";

/**
 * Public-safe profile fields. Deliberately contains NO email: RLS is
 * row-level, so any column readable here would be readable for every user's
 * row. `short_code` is the immutable friend-search ID (see
 * profiles.short_code in schema.sql) — unlike email it's meant to be shared,
 * so no SECURITY DEFINER lookup function is needed for it.
 */
export interface PublicProfile {
  user_id: string;
  username: string | null;
  avatar: string | null;
  total_xp: number;
  level: number;
  fitness_index: number | null;
  short_code: string | null;
}

const PUBLIC_COLUMNS = "user_id, username, avatar, total_xp, level, fitness_index, short_code";

/**
 * Mirrors the public-safe subset of a user's progress into `profiles`, so
 * friends can see them on the leaderboard. Called (best-effort) on every
 * cloud save. Never throws — if the table isn't set up yet, it just logs, so
 * it can't break the core save flow.
 *
 * Note: no longer touches `user_emails` — friend search is by short_code
 * now, not email (see findProfileByCode below).
 */
export async function syncProfile(userId: string, state: GameState): Promise<void> {
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
  } catch (e) {
    console.warn("profile sync error", e);
  }
}

/**
 * Looks up a single user by their exact short_code. profiles is already
 * readable by every authenticated user (see the RLS policy in schema.sql),
 * so this is a plain SELECT — short codes are meant to be shared/discovered,
 * unlike an email address.
 */
export async function findProfileByCode(code: string): Promise<PublicProfile | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("short_code", normalized)
    .maybeSingle();
  if (error) {
    console.warn("profile search failed", error);
    return null;
  }
  return (data as PublicProfile | null) ?? null;
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
