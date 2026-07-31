import { supabase } from "./supabase";

/**
 * Client side of Web Push subscribe/unsubscribe — the actual sending happens
 * server-side (Supabase Edge Function `send-daily-reminders`, invoked by
 * pg_cron; see supabase/push-notifications-migration.sql). This module only
 * ever talks to the browser's Push API and the `push_subscriptions` table.
 *
 * `state.remindersEnabled` (game.ts) stays the single account-wide on/off
 * flag the edge function checks before sending anything at all — exactly
 * what it already meant before this feature existed. A `push_subscriptions`
 * row is created per DEVICE/browser though (each one has its own encryption
 * keys), so a single account can have several. Turning reminders off from
 * any one device flips that shared flag off (stopping sends to every
 * device) and additionally unsubscribes just that device's own
 * subscription — simplest option that still leaves other signed-in devices'
 * subscription rows in place for if reminders get turned back on later.
 */

const SW_PATH = "/sw.js";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getVapidPublicKey(): string | undefined {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
}

/** Web Push wants the VAPID key as a raw Uint8Array, browsers hand it to us
 * (and expect it back) as a URL-safe base64 string — standard conversion,
 * copied near-verbatim from the MDN Push API docs. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "no-vapid-key" | "permission-denied" | "error" };

/**
 * Registers the service worker (idempotent — re-registering the same URL is
 * a no-op if unchanged), requests Notification permission if needed, and
 * subscribes this device to Web Push, saving the subscription for the given
 * user in `push_subscriptions`. Safe to call again later (e.g. the
 * subscription silently expired) — reuses the existing browser subscription
 * if there is one instead of creating a duplicate.
 */
export async function subscribeToPush(userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) return { ok: false, reason: "no-vapid-key" };

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "permission-denied" };

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's DOM lib types applicationServerKey as BufferSource backed by a
        // concrete ArrayBuffer, but a freshly-constructed Uint8Array is only
        // typed as ArrayBufferLike (could theoretically be a
        // SharedArrayBuffer) — it never actually is one here, so this cast is
        // safe.
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!p256dh || !auth) return { ok: false, reason: "error" };

    // Replace any stale row for this exact device (endpoint is unique per
    // browser subscription) before inserting the current one.
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    });
    if (error) {
      console.warn("saving push subscription failed", error);
      return { ok: false, reason: "error" };
    }
    return { ok: true };
  } catch (e) {
    console.warn("push subscribe failed", e);
    return { ok: false, reason: "error" };
  }
}

/** Unsubscribes THIS device from push and removes its row. Doesn't touch
 * `state.remindersEnabled` itself — that's the caller's job (SettingsPanel),
 * same as before this feature existed. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch (e) {
    console.warn("push unsubscribe failed", e);
  }
}
