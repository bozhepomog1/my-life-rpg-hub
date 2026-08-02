import { supabase } from "./supabase";

// Full personal-data export + account deletion — the two halves of
// "Настройки → Аккаунт": everything this app stores about you, and the
// button that removes all of it.
//
// The export deliberately covers MORE than the existing "Резервная копия"
// button in SettingsPanel, which only dumps the local GameState (enough to
// restore your progress, not enough to answer "what do you actually have on
// me"). This one reads every table that holds a row keyed to this user,
// straight from the database.
//
// No admin privileges needed here: RLS already lets every user read their
// own rows in all of these tables, so this runs as a normal client-side
// query with the user's own session. Deletion is the opposite case — it
// needs the service_role key and therefore lives in the delete-account Edge
// Function (see supabase/functions/delete-account/index.ts).

const BUCKET = "quest-photos";

export interface AccountExport {
  exportedAt: string;
  account: {
    userId: string;
    email: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
  };
  gameState: unknown;
  profile: unknown;
  extendedProfile: unknown;
  email: unknown;
  friendRequests: unknown[];
  pushSubscriptions: unknown[];
  /** Paths + sizes of uploaded files (quest photos, avatar, background).
   * The images themselves aren't inlined — a JSON with base64 photos would
   * be enormous and unreadable; this lists what exists so nothing is a
   * surprise, and the app can still show them while the account lives. */
  storageFiles: { path: string; sizeBytes: number | null; updatedAt: string | null }[];
  /** Anything that couldn't be read, rather than silently omitting it — an
   * export that quietly skipped a table would be worse than one that says
   * so. */
  errors: string[];
}

interface StorageEntry {
  name: string;
  id?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number } | null;
}

/**
 * Collects everything this app stores about the current user into one
 * object. Never throws: a table that fails to read contributes an entry to
 * `errors` instead of aborting the whole export, so the user still gets
 * the parts that did work.
 */
export async function collectAccountData(): Promise<AccountExport | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const userId = user.id;
  const errors: string[] = [];

  /** Runs one table read, funnelling any failure into `errors`. */
  async function read<T>(label: string, run: () => Promise<{ data: T; error: unknown }>) {
    try {
      const { data, error } = await run();
      if (error) {
        errors.push(`${label}: ${(error as { message?: string }).message ?? String(error)}`);
        return null;
      }
      return data;
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  const gameState = await read("game_states", async () =>
    supabase.from("game_states").select("*").eq("user_id", userId).maybeSingle(),
  );
  const profile = await read("profiles", async () =>
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
  );
  const extendedProfile = await read("friend_profiles", async () =>
    supabase.from("friend_profiles").select("*").eq("user_id", userId).maybeSingle(),
  );
  const email = await read("user_emails", async () =>
    supabase.from("user_emails").select("*").eq("user_id", userId).maybeSingle(),
  );
  // Both directions — a request this user sent AND requests they received
  // are equally "their" data.
  const friendRequests = await read("friend_requests", async () =>
    supabase.from("friend_requests").select("*").or(`from_user.eq.${userId},to_user.eq.${userId}`),
  );
  const pushSubscriptions = await read("push_subscriptions", async () =>
    supabase.from("push_subscriptions").select("*").eq("user_id", userId),
  );

  const storageFiles: AccountExport["storageFiles"] = [];
  try {
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(userId, { limit: 1000 });
    if (error) {
      errors.push(`storage: ${error.message}`);
    } else {
      for (const entry of (files ?? []) as StorageEntry[]) {
        if (!entry.id) continue; // folder placeholder, not a real object
        storageFiles.push({
          path: `${userId}/${entry.name}`,
          sizeBytes: entry.metadata?.size ?? null,
          updatedAt: entry.updated_at ?? null,
        });
      }
    }
  } catch (e) {
    errors.push(`storage: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    exportedAt: new Date().toISOString(),
    account: {
      userId,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    gameState,
    profile,
    extendedProfile,
    email,
    friendRequests: Array.isArray(friendRequests) ? friendRequests : [],
    pushSubscriptions: Array.isArray(pushSubscriptions) ? pushSubscriptions : [],
    storageFiles,
    errors,
  };
}

/** Collects the export and hands it to the browser as a download. Returns
 * an error message on failure, or null on success. */
export async function downloadAccountData(): Promise<string | null> {
  let payload: AccountExport | null;
  try {
    payload = await collectAccountData();
  } catch (e) {
    console.warn("downloadAccountData failed", e);
    return "Не получилось собрать данные. Проверь соединение и попробуй ещё раз.";
  }
  if (!payload) return "Нужно войти в аккаунт, чтобы выгрузить свои данные.";

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `life-rpg-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return null;
}

export interface DeleteAccountResult {
  ok: boolean;
  /** User-facing message when ok is false. */
  message?: string;
}

/**
 * Permanently deletes this account via the delete-account Edge Function
 * (which holds the service_role key — see that function for the full
 * order-of-operations rationale). Irreversible: no grace period, nothing
 * recoverable afterwards.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      error?: string;
      message?: string;
    }>("delete-account", { body: {} });

    if (error) {
      console.warn("deleteAccount: invoke failed", error);
      return {
        ok: false,
        message: "Не получилось связаться с сервером. Аккаунт не удалён, попробуй ещё раз.",
      };
    }
    if (!data?.ok) {
      // The function distinguishes "storage failed, account intact" from
      // "files gone, account still there" — pass its own wording through
      // rather than flattening both into a generic failure.
      return {
        ok: false,
        message: data?.message ?? "Не получилось удалить аккаунт. Попробуй ещё раз.",
      };
    }
    return { ok: true };
  } catch (e) {
    console.warn("deleteAccount: unexpected exception", e);
    return {
      ok: false,
      message: "Не получилось удалить аккаунт. Аккаунт не удалён, попробуй ещё раз.",
    };
  }
}
