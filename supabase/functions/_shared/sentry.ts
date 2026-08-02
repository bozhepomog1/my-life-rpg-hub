// Shared Sentry wiring for Supabase Edge Functions (Deno).
//
// Sentry publishes an official Deno SDK (`@sentry/deno`, available via the
// `npm:` specifier Deno/Supabase Edge Functions support natively — same
// mechanism already used for `npm:@supabase/supabase-js` and `npm:web-push`
// elsewhere in this project). This gives Edge Functions the same basic
// "catch unhandled errors and report them" coverage as the frontend, without
// a separate bespoke logging pipeline.
//
// IMPORTANT — Edge Function runtime lifecycle: unlike a long-lived Node
// server, a Deno Edge Function's isolate can be torn down immediately after
// the Response is returned. Sentry's SDK sends events over HTTP
// asynchronously, so without an explicit flush the event can be dropped
// before it ever leaves the isolate. Every capture call here is paired with
// `Sentry.flush()` for exactly this reason — see captureAndFlush() below.
//
// Everything in this file is deliberately fail-soft: if the DSN isn't
// configured, or the Sentry SDK itself throws for any environment-specific
// reason, functions fall back to their existing `console.error` (already
// visible in Supabase Dashboard → Edge Functions → Logs) instead of that
// failure taking down the actual request.
import * as Sentry from "npm:@sentry/deno@8";

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
const SENTRY_ENVIRONMENT = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";

let initialized = false;

/** Call once per function, at module scope (so it runs once per cold start,
 * not per request) — see the three functions in this directory for the
 * pattern. No-ops entirely if SENTRY_DSN isn't set, so Sentry stays fully
 * optional and never required for the functions to work. */
export function initEdgeSentry(functionName: string) {
  if (initialized || !SENTRY_DSN) return;
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      // Basic error monitoring only — no tracing/performance data, keeps
      // this well inside Sentry's free tier and avoids capturing anything
      // about what a request actually contained.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event: Sentry.ErrorEvent) {
        // Defense in depth on top of sendDefaultPii:false — never forward
        // request bodies (meal text, base64 photos), cookies, or auth
        // headers, even if some future Sentry integration starts attaching
        // them by default. Only the technical error info should leave this
        // function.
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;
        }
        delete event.user;
        return event;
      },
    });
    Sentry.setTag("function", functionName);
    initialized = true;
  } catch (e) {
    // Sentry itself failing to initialize must never break the function —
    // log it once and continue with plain console.error reporting.
    console.warn(`initEdgeSentry(${functionName}): Sentry init failed`, e);
  }
}

/**
 * Reports an error to Sentry (if configured) with optional non-sensitive
 * context (e.g. `{ stage: "claude_api_call", status: 502 }` — never raw
 * request/response bodies or user identifiers), then flushes so the event
 * actually leaves the isolate before the request finishes. Always also logs
 * to the console, so Supabase's own Edge Function Logs remain a complete
 * record regardless of whether Sentry is configured or reachable.
 */
export async function captureAndFlush(error: unknown, context?: Record<string, unknown>) {
  console.error(context ? { context, error } : error);
  if (!SENTRY_DSN) return;
  try {
    Sentry.captureException(error, context ? { contexts: { app: context } } : undefined);
    await Sentry.flush(2000);
  } catch (e) {
    console.warn("captureAndFlush: Sentry reporting failed", e);
  }
}
