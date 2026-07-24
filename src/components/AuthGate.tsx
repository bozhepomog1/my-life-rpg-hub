import { useState, type ReactNode } from "react";
import { useAuthContext } from "@/lib/use-auth-context";
import { sendMagicLink } from "@/lib/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuthContext();

  if (loading) return null;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="mb-6 text-lg font-semibold">Вход по email</h1>

        {status === "sent" ? (
          <p className="text-sm text-muted-foreground">
            Письмо со ссылкой для входа отправлено на <span className="text-foreground">{email}</span>.
            Открой его на этом устройстве, чтобы войти.
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
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "sending" ? "Отправка…" : "Получить ссылку для входа"}
            </button>
            {status === "error" && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
