// Supabase Edge Function: send-daily-reminders
//
// Invoked HOURLY by pg_cron (see push-notifications-migration.sql, section 3
// — changed from a single daily 20:00 UTC run to '0 * * * *' so this can
// check each user's own chosen local hour instead of firing everyone at the
// same UTC instant). Replaces the old purely-client-side
// setInterval+Notification approach (DailyReminderService.tsx,
// lib/reminders.ts — both removed in an earlier change) with real Web Push:
// this runs server-side regardless of whether anyone has the app open in a
// tab.
//
// For every user with `remindersEnabled: true` in their saved GameState,
// whose `reminderHour` (local hour, 0-23) matches the current hour in their
// own `reminderTimezone` (both fields live in the same GameState JSONB blob
// — see game.ts — NOT in the public.profiles table, since that table is
// friend-readable and a notification-time preference has no reason to leak
// there), AND who still has at least one undone daily quest right now,
// sends a push to every device (push_subscriptions row) they've subscribed
// from. Expired/revoked subscriptions (410 Gone / 404 Not Found from the
// push service) are deleted so they stop being retried forever.
//
// Running hourly instead of daily means each user gets checked (and, if
// eligible, pushed) up to 24x more often than before, but only ever
// actually SENDS a notification on the one pass where their local hour
// matches reminderHour — the other 23 passes are a cheap no-op for them.
//
// Uses `npm:web-push` rather than hand-rolling the RFC 8291/8292 message
// encryption + VAPID JWT signing — Supabase Edge Functions run on Deno,
// which supports `npm:` specifiers natively, so this is a normal dependency
// here rather than something that needs bundling/vendoring.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
// Contact info required by the VAPID spec (RFC 8292) — informational only,
// doesn't need to be a real monitored inbox for push delivery to work.
const VAPID_SUBJECT = "mailto:admin@life-rpg.local";

interface Quest {
  category: string;
  done: boolean;
}

interface GameStateShape {
  remindersEnabled?: boolean;
  quests?: Quest[];
  reminderHour?: number;
  reminderTimezone?: string;
}

/** Current hour (0-23) in the given IANA timezone, per Intl — this is what
 * lets "reminderHour: 20" mean 20:00 in the USER's zone rather than UTC.
 * Falls back to the current UTC hour for a missing/invalid/unrecognized
 * timezone string (old rows saved before this field existed, or a garbage
 * value) rather than throwing and skipping that user's reminder entirely. */
function currentHourInTimezone(timeZone: string | undefined): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    // hour12: false can still format midnight as "24" in some ICU versions
    // instead of "00" — normalize so the 0-23 comparison below is reliable.
    const h = Number(formatted) % 24;
    return Number.isFinite(h) ? h : new Date().getUTCHours();
  } catch {
    return new Date().getUTCHours();
  }
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function dailyQuestsRemaining(state: GameStateShape): { total: number; remaining: number } {
  const dailies = (state.quests ?? []).filter((q) => q.category === "daily");
  return { total: dailies.length, remaining: dailies.filter((q) => !q.done).length };
}

Deno.serve(async (_req) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets are not set (Edge Functions → Secrets).",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error: gameStatesError } = await supabase
    .from("game_states")
    .select("user_id, state");

  if (gameStatesError) {
    return new Response(JSON.stringify({ error: gameStatesError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const eligibleUserIds: string[] = [];
  let usersChecked = 0;

  for (const row of rows ?? []) {
    usersChecked++;
    const state = row.state as GameStateShape;
    if (!state?.remindersEnabled) continue;
    // reminderHour defaults to 20 client-side (see defaultState() in
    // game.ts) for every row saved after this feature shipped, but a row
    // written before that still won't have it — same 20 fallback here so
    // those users keep getting the old fixed-hour behavior instead of
    // silently going quiet.
    const wantedHour = typeof state.reminderHour === "number" ? state.reminderHour : 20;
    if (currentHourInTimezone(state.reminderTimezone) !== wantedHour) continue;
    const { remaining } = dailyQuestsRemaining(state);
    if (remaining > 0) eligibleUserIds.push(row.user_id);
  }

  let pushesSent = 0;
  let pushesFailed = 0;
  let subscriptionsRemoved = 0;

  for (const userId of eligibleUserIds) {
    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (subsError || !subs) continue;

    // Re-derive this user's exact remaining/total for the message body —
    // fetched once above per row, kept alongside eligibleUserIds would need
    // a map; simplest to just look it up again from `rows`.
    const stateRow = rows!.find((r) => r.user_id === userId);
    const { total, remaining } = dailyQuestsRemaining((stateRow?.state ?? {}) as GameStateShape);

    const payload = JSON.stringify({
      title: "Не забудь про ежедневные квесты!",
      body: `Осталось ${remaining} из ${total}`,
      url: "/",
    });

    for (const sub of subs as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        pushesSent++;
      } catch (e) {
        pushesFailed++;
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          subscriptionsRemoved++;
        } else {
          console.warn("push send failed", sub.endpoint, e);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      usersChecked,
      usersNotified: eligibleUserIds.length,
      pushesSent,
      pushesFailed,
      subscriptionsRemoved,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
