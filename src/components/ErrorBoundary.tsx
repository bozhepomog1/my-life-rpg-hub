import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Short, human-readable label for the wrapped section (shown in the
   * fallback message and attached to the Sentry event) — e.g. "Испытание
   * недели". Not user content, just a static label per call site. */
  sectionName: string;
}

/**
 * Isolates a crash to just this section instead of taking the whole page
 * down — before this, a component throwing (e.g. bad/unexpected shape in a
 * stored GameState field) was only ever caught by the router-level
 * errorComponent (routes/__root.tsx), which replaces the ENTIRE page with
 * "This page didn't load". Most components here already guard defensively
 * against malformed data (see BossQuestCard's own `if (!bossQuest) return
 * null`), but this is the generic backstop for whatever that defensive
 * coding misses, wired to Sentry the same way the page-level boundary is.
 *
 * Thin wrapper around Sentry's own ErrorBoundary (captures + reports
 * automatically) — apply it to any other section the same way by copying
 * the pattern where BossQuestCard is wrapped in routes/index.tsx.
 */
export function ErrorBoundary({ children, sectionName }: Props) {
  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope: Sentry.Scope) => {
        scope.setContext("app", { boundary: "component", section: sectionName });
      }}
      fallback={() => (
        <div className="panel p-4 text-xs text-muted-foreground">
          Не получилось отобразить раздел «{sectionName}». Остальная часть страницы должна работать
          как обычно — попробуй обновить страницу.
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
