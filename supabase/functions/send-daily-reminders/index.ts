// Supabase Edge Function: send-daily-reminders
//
// Invoked once a day by pg_cron (see push-notifications-migration.sql,
// section 3 — 20:00 UTC as a v1 starting point, no per-user timezones yet).
// Replaces the old purely-client-side setInterval+Notification approach
// (DailyReminderService.tsx, lib/reminders.ts — both removed in this same
// change) with real Web Push: this runs server-side regardless of whether
// anyone has the app open in a tab.
//
// For every user with `remindersEnabled: true` in their saved GameState AND
// at least one still-undone daily quest right now, sends a push to every
// device (push_subscriptions row) they've subscribed from. Expired/revoked
// subscriptions (410 Gone / 404 Not Found from the push service) are
// deleted so they stop being retried forever.
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
