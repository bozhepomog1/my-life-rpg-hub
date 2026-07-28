/**
 * Shared full-screen loading indicator, shown while auth/game-state is still
 * resolving. Replaces the old `return null` pattern used across every route
 * (see AuthGate and the six main route files) — that produced a blank white
 * flash instead of a legible "still working on it" state.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        role="status"
        aria-label="Загрузка"
      />
    </div>
  );
}
