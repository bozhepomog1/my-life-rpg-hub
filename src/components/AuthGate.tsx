import { useState, type ReactNode } from "react";
import { useAuthContext } from "@/lib/use-auth-context";
import { sendMagicLink, signInWithGoogle } from "@/lib/auth";
import { LoadingScreen } from "@/components/LoadingScreen";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuthContext();

  if (loading) return <LoadingScreen />;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

/** Google's official four-color "G" mark, inline so no extra asset/CDN is needed. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5Z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 15.3 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4c-7.5 0-14 4.2-17.3 10.4Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.9 39.7 16.4 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.5 36 44 30.5 44 24c0-1.2-.1-2.4-.4-3.5Z"
      />
    </svg>
  );
}

function LoginScreen() {
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function handleGoogle() {
    setGoogleStatus("redirecting");
    setGoogleError(null);
    try {
      await signInWithGoogle();
      // On success the browser navigates away to Google before this resolves
      // further — nothing else to do here.
    } catch (err) {
      setGoogleStatus("error");
      setGoogleError(err instanceof Error ? err.message : "Не удалось начать вход через Google");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Не удалось отправить письмо");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel-glow w-full max-w-sm p-8">
        <div className="mb-1 text-xs font-medium text-primary">Life RPG</div>
        <h1 className="mb-6 text-lg font-semibold">Вход</h1>

        {/* Google is the primary, most visible way in — email/magic-link
            below stays as the alternative/fallback, never removed. */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleStatus === "redirecting"}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <GoogleIcon />
          {googleStatus === "redirecting" ? "Переходим в Google…" : "Войти через Google"}
        </button>
        {googleStatus === "error" && <p className="mt-2 text-xs text-destructive">{googleError}</p>}

        {!showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            или войти по email
          </button>
        ) : (
          <div className="mt-5 border-t border-border pt-5">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Вход по email</h2>
            {status === "sent" ? (
              <p className="text-sm text-muted-foreground">
                Письмо со ссылкой для входа отправлено на{" "}
                <span className="text-foreground">{email}</span>. Открой его на этом устройстве,
                чтобы войти.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {status === "sending" ? "Отправка…" : "Получить ссылку для входа"}
                </button>
                {status === "error" && <p className="text-xs text-destructive">{error}</p>}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
