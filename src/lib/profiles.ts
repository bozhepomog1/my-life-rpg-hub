import { supabase } from "./supabase";
import { computeFitnessIndex, type GameState } from "./game";

/**
 * Public-safe profile fields. Deliberately contains NO email: RLS is
 * row-level, so any column readable here would be readable for every user's
 * row. `short_code` is the immutable friend-search ID (see
 * profiles.short_code in schema.sql) — unlike email it's meant to be shared.
 *
 * PRIVACY (see supabase/privacy-migration.sql): the `profiles` table itself
 * is no longer readable by every authenticated user — a direct SELECT now
 * returns only your own row and rows of ACCEPTED friends. Everything else
 * goes through the two SECURITY DEFINER functions used below, which redact
 * the progress fields (total_xp / level / fitness_index → null) when the
 * target has privacy on and you're not their accepted friend. That's why
 * those three are nullable here: a non-friend legitimately gets nothing for
 * them, and `isPrivate` says whether that's why.
 */
export interface PublicProfile {
  user_id: string;
  username: string | null;
  avatar: string | null;
  total_xp: number | null;
  level: number | null;
  fitness_index: number | null;
  short_code: string | null;
  /** True when the target keeps their profile private AND isn't your friend
   * — i.e. the progress fields above are redacted rather than genuinely
   * empty. Adding them as a friend reveals the real numbers. */
  isPrivate: boolean;
}

/** Row shape returned by both RPCs (snake_case, straight from Postgres). */
interface ProfileRow {
  user_id: string;
  username: string | null;
  avatar: string | null;
  total_xp: number | null;
  level: number | null;
  fitness_index: number | null;
  short_code: string | null;
  is_private: boolean | null;
}

function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    user_id: row.user_id,
    username: row.username,
    avatar: row.avatar,
    total_xp: row.total_xp,
    level: row.level,
    fitness_index: row.fitness_index,
    short_code: row.short_code,
    // The server nulls the progress columns for a private non-friend. Treat
    // "flagged private AND progress withheld" as the redacted case, so a
    // private user who IS your friend (full numbers returned) doesn't get a
    // misleading "hidden" badge in the UI.
    isPrivate: !!row.is_private && row.total_xp === null,
  };
}

/**
 * Mirrors the public-safe subset of a user's progress into `profiles`, so
 * friends can see them on the leaderboard. Called (best-effort) on every
 * cloud save. Never throws — if the table isn't set up yet, it just logs, so
 * it can't break the core save flow.
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
      is_private: state.isPrivate,
    });
    if (error) console.warn("profile sync failed", error);
  } catch (e) {
    console.warn("profile sync error", e);
  }
}

/**
 * Looks up a single user by their exact short_code, via the
 * find_profile_by_code SECURITY DEFINER function.
 *
 * Was a plain `select ... eq("short_code", ...)` before privacy landed —
 * that only worked because `profiles` was readable by everyone, which also
 * meant the whole table could be dumped in one request. The function takes
 * one exact code, returns at most one row and never matches yourself, so it
 * can't be used to enumerate users.
 *
 * Privacy is deliberately "soft" here: a private user IS still findable and
 * addable — only their progress comes back redacted until you're friends.
 *
 * Rate limited server-side (20/hour — see rate-limiting-migration.sql) to
 * make brute-forcing the short_code space pointless. Unlike other failures
 * here (network error, RLS denial), a rate-limit hit gets thrown as a
 * distinct Error instead of quietly resolving to null — silently returning
 * "not found" would look exactly like a wrong code instead of the
 * deliberate throttle it actually is. Callers should catch it and show the
 * message, same as any other user-facing action error in this app.
 */
export async function findProfileByCode(code: string): Promise<PublicProfile | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await supabase.rpc("find_profile_by_code", { p_code: normalized });
  if (error) {
    if (error.message?.includes("RATE_LIMITED")) {
      throw new Error("Слишком много попыток поиска по коду — подожди немного и попробуй снова.");
    }
    console.warn("profile search failed", error);
    return null;
  }
  const rows = (data as ProfileRow[] | null) ?? [];
  return rows.length > 0 ? toPublicProfile(rows[0]) : null;
}

/**
 * Batch-fetches the profile cards for the leaderboard and for pending
 * friend-request rows, via get_visible_profiles.
 *
 * The function only returns a row when the caller actually has a link to
 * that user (self / accepted friend / pending request in either direction),
 * so passing in arbitrary ids can't be used to read strangers — the ids
 * being client-supplied is safe by construction, not by trust.
 */
export async function getProfiles(userIds: string[]): Promise<PublicProfile[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.rpc("get_visible_profiles", { p_user_ids: userIds });
  if (error) {
    console.warn("get profiles failed", error);
    return [];
  }
  return ((data as ProfileRow[] | null) ?? []).map(toPublicProfile);
}
