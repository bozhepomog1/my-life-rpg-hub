// Supabase Edge Function: delete-account
//
// Permanently deletes the CALLING user's account and every trace of their
// data. Backs "Настройки → Аккаунт → Удалить аккаунт" in SettingsPanel.tsx.
//
// WHY AN EDGE FUNCTION (rather than doing this client-side):
// deleting an auth user requires auth.admin.deleteUser(), which needs the
// service_role key. That key bypasses RLS entirely and must never reach a
// browser bundle — so this is the only correct place for it. It's
// auto-injected as SUPABASE_SERVICE_ROLE_KEY (same as send-daily-reminders
// already uses); no new secret to configure.
//
// WHOSE ACCOUNT GETS DELETED: strictly the one identified by the caller's
// own JWT. The user id is read from the verified session, never from the
// request body — otherwise this would be a "delete any account by uuid"
// endpoint, which with a service_role key behind it is about as bad as it
// gets.
//
// ORDER OF OPERATIONS (and why):
//   1. Storage first. Files under `<user_id>/` in the quest-photos bucket
//      (quest proof photos AND uploaded avatars AND background photos —
//      they all share this one bucket, see avatar-photo.ts /
//      background-photo.ts) are NOT covered by any cascade: storage.objects
//      has no foreign key to auth.users. If the auth row went first, the
//      user id needed to find these files would be gone and they'd be
//      orphaned forever.
//   2. auth.admin.deleteUser() last. Every table holding user data
//      (game_states, profiles, user_emails, friend_profiles,
//      friend_requests, push_subscriptions, rate_limits) declares
//      `references auth.users(id) on delete cascade`, so this single call
//      removes all of them. Notably friend_requests cascades on BOTH
//      from_user AND to_user, so requests where this user was the sender
//      or the recipient both go — no rows left pointing at a user that no
//      longer exists.
//
// Deletion is immediate and irreversible by design: no soft-delete flag,
// no grace period, no tombstone row left behind in profiles. To the user's
// former friends they simply disappear from the friends list and
// leaderboard.
import { createClient } from "npm:@supabase/supabase-js@2";
import { initEdgeSentry, captureAndFlush } from "../_shared/sentry.ts";

initEdgeSentry("delete-account");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "quest-photos";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS_HEADERS, "content-type": "application/json" };

interface StorageEntry {
  name: string;
  id?: string | null;
}

/**
 * Every file belonging to this user in the quest-photos bucket.
 *
 * The app only ever writes flat `<user_id>/<filename>` paths (see
 * uploadQuestPhoto / avatar-photo.ts / background-photo.ts), but this walks
 * one level of subfolders anyway rather than assuming that stays true — a
 * missed file here is a file that outlives the account it belonged to.
 * Supabase's list() returns folders as entries with a null `id`, which is
 * how they're told apart from real objects.
 */
async function listUserFiles(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  const paths: string[] = [];

  const { data: top, error } = await admin.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error) throw error;

  for (const entry of (top ?? []) as StorageEntry[]) {
    if (entry.id) {
      paths.push(`${userId}/${entry.name}`);
      continue;
    }
    // Folder — descend one level.
    const { data: nested, error: nestedError } = await admin.storage
      .from(BUCKET)
      .list(`${userId}/${entry.name}`, { limit: 1000 });
    if (nestedError) throw nestedError;
    for (const child of (nested ?? []) as StorageEntry[]) {
      if (child.id) paths.push(`${userId}/${entry.name}/${child.name}`);
    }
  }

  return paths;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Identify the caller from their own session. Anon-key client + the
  // caller's Authorization header = "who is this token for", exactly as in
  // parse-meal-text/parse-meal-photo.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await asUser.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const userId = user.id;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let filesDeleted = 0;

  try {
    // ── 1. Storage (no cascade covers this — see header) ──────────────
    const paths = await listUserFiles(admin, userId);
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
      if (removeError) throw removeError;
      filesDeleted = paths.length;
    }
  } catch (e) {
    // A storage failure must NOT fall through to deleting the auth user:
    // that would strand these files permanently (no user id left to find
    // them by). Fail loudly instead and leave the account intact so the
    // user can retry.
    await captureAndFlush(e, { stage: "delete_storage_files" });
    return new Response(
      JSON.stringify({
        error: "storage_cleanup_failed",
        message: "Не удалось удалить загруженные файлы. Аккаунт НЕ удалён, попробуй ещё раз.",
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  // ── 2. The auth user itself — cascades every table (see header) ─────
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    await captureAndFlush(new Error(deleteError.message), { stage: "delete_auth_user" });
    return new Response(
      JSON.stringify({
        error: "account_deletion_failed",
        // Storage files are already gone at this point, but the account
        // still exists — say so plainly rather than reporting a clean
        // success or a total failure, neither of which would be true.
        message:
          "Файлы удалены, но сам аккаунт удалить не получилось. Попробуй ещё раз или напиши в поддержку.",
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  return new Response(JSON.stringify({ ok: true, filesDeleted }), { headers: JSON_HEADERS });
});
