import { supabase } from "./supabase";
import { computeFitnessIndex, computeStreak, type GameState, type StatKey } from "./game";

/**
 * The extended profile shown on a friend's profile screen. Backed by the
 * `friend_profiles` table, whose RLS policy allows a SELECT only for your
 * own row or for a user you have an ACCEPTED friend_request with (see
 * supabase/friend-profile-migration.sql) — unlike `profiles`, which is
 * readable by every authenticated user so short-code search can work.
 *
 * Deliberately contains no quests, no proof photos, no nutrition entries
 * and no raw body measurements — those never leave game_states, which
 * only its owner can read. Only the derived fitness_index is shared.
 */
export interface FriendProfile {
  user_id: string;
  stat_strength: number;
  stat_intellect: number;
  stat_will: number;
  stat_appearance: number;
  fitness_index: number | null;
  current_streak: number;
  longest_streak: number;
  /** { achievementId: unlockedAtEpochMs } — mirrors GameState.unlockedAchievements. */
  achievements: Record<string, number>;
}

const COLUMNS =
  "user_id, stat_strength, stat_intellect, stat_will, stat_appearance, fitness_index, current_streak, longest_streak, achievements";

/** Maps the flat stat_* columns back onto the app's StatKey shape. */
export function statLevels(p: FriendProfile): Record<StatKey, number> {
  return {
    strength: p.stat_strength,
    intellect: p.stat_intellect,
    will: p.stat_will,
    appearance: p.stat_appearance,
  };
}

/**
 * Mirrors the friend-visible subset of the local game state into
 * `friend_profiles`. Called (best-effort) alongside syncProfile on every
 * cloud save. Never throws — if the table isn't set up yet it just logs,
 * so it can't break the core save flow.
 */
export async function syncFriendProfile(userId: string, state: GameState): Promise<void> {
  try {
    const { error } = await supabase.from("friend_profiles").upsert({
      user_id: userId,
      stat_strength: state.stats.strength.level,
      stat_intellect: state.stats.intellect.level,
      stat_will: state.stats.will.level,
      stat_appearance: state.stats.appearance.level,
      fitness_index: computeFitnessIndex(state.body),
      current_streak: computeStreak(state),
      longest_streak: state.longestStreak,
      achievements: state.unlockedAchievements,
    });
    if (error) console.warn("friend profile sync failed", error);
  } catch (e) {
    console.warn("friend profile sync error", e);
  }
}

/**
 * Fetches one user's extended profile. Returns null when the row doesn't
 * exist yet OR when RLS denies the read because the two users aren't
 * accepted friends — the client can't tell those apart, which is exactly
 * the intent: a non-friend learns nothing beyond "no data for you".
 */
export async function getFriendProfile(userId: string): Promise<FriendProfile | null> {
  const { data, error } = await supabase
    .from("friend_profiles")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("get friend profile failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as FriendProfile;
  return { ...row, achievements: row.achievements ?? {} };
}
