// Basic production error monitoring via Sentry — catches unhandled
// exceptions/promise rejections and (via components/ErrorBoundary.tsx)
// component crashes, on top of the existing lovable-error-reporting.ts hook
// and the TanStack Router-level errorComponent (see routes/__root.tsx),
// neither of which sends anywhere outside this app's own dev tooling.
//
// Client-only, fully optional: initSentry() no-ops if VITE_SENTRY_DSN isn't
// set, so the app works identically with or without Sentry configured — the
// same "fail soft on missing config" convention used for every other
// optional integration here (push notifications, Open Food Facts, etc.).
//
// PRIVACY: this app handles nutrition entries, meal photos, and email
// addresses — none of that should ever reach Sentry, only technical error
// info (message, stack trace, component name, route pathname, environment).
// See scrubEvent/scrubBreadcrumb below for the specifics. Deliberately does
// NOT call Sentry.setUser() anywhere, so no email/username/id is attached
// to events even implicitly.
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENVIRONMENT =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE;

let initialized = false;

export function initSentry() {
  if (initialized || typeof window === "undefined" || !DSN) return;
  initialized = true;
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    // Basic error monitoring only — no session replay, no performance
    // tracing (both are separate opt-in Sentry products that would also
    // start recording things like page interactions). Leaving Sentry's
    // default integrations as-is only adds automatic capture of
    // window.onerror / unhandledrejection and console-breadcrumb-style
    // context, nothing that records user input.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

/** Strips anything that could carry app content or identifying info out of
 * an outgoing event before Sentry sends it. */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // The browser SDK attaches the current page URL by default — strip the
  // query string and hash, which can carry auth callback tokens (Supabase
  // magic-link/OAuth redirects) depending on the flow in use. Only the path
  // ("/nutrition", "/friends", etc.) is useful for debugging anyway.
  if (event.request?.url) {
    try {
      const u = new URL(event.request.url);
      event.request.url = u.origin + u.pathname;
    } catch {
      delete event.request.url;
    }
  }
  delete event.request?.cookies;
  delete event.request?.headers;
  // Belt and suspenders on top of sendDefaultPii:false — never let a `user`
  // block through even if some future code path sets one.
  delete event.user;
  return event;
}

/** Breadcrumbs are the "what happened right before this error" trail Sentry
 * attaches to every event — trimmed the same way as the event itself. */
function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  // console.warn/console.error calls throughout this app sometimes log
  // whole Supabase error objects or other structured data — rather than
  // trying to sanitize arbitrary logged content, drop console breadcrumbs
  // entirely. The actual exception being reported still comes through
  // fine; this only removes the "recent console output" trail.
  if (breadcrumb.category === "console") return null;
  if ((breadcrumb.category === "xhr" || breadcrumb.category === "fetch") && breadcrumb.data) {
    // Keep method/status/url for debugging network failures, never a
    // request/response body (Sentry's fetch/xhr breadcrumbs don't capture
    // bodies by default — this just makes that explicit and query-strips
    // the URL the same way scrubEvent does above).
    if (typeof breadcrumb.data.url === "string") {
      try {
        const u = new URL(breadcrumb.data.url, window.location.origin);
        breadcrumb.data.url = u.origin + u.pathname;
      } catch {
        // leave as-is if not a parseable URL
      }
    }
  }
  return breadcrumb;
}

/** Thin wrapper so callers (ErrorBoundary, the router-level ErrorComponent)
 * don't need to import Sentry directly, and so this stays a no-op when no
 * DSN is configured. `context` should only ever carry technical labels
 * (component name, route, boundary type) — never user content. */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!DSN) return;
  Sentry.captureException(error, context ? { contexts: { app: context } } : undefined);
}
