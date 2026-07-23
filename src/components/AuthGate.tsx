import { useState, type ReactNode } from "react";
import { useAuthContext } from "@/lib/auth-context";
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
      <div className="panel-glow corner-cut w-full max-w-sm p-6">
        <div className="mb-1 font-display text-xs tracking-[0.3em]" style={{ color: "#22d3ee" }}>
          LIFE RPG
        </div>
        <h1 className="mb-6 font-display text-lg tracking-wide neon-text" style={{ color: "#e6edf3" }}>
          Вход по email
        </h1>

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
              className="w-full rounded-md border border-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md border px-4 py-2 font-display text-xs tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: "#22d3ee",
                color: "#22d3ee",
                background: "rgba(34,211,238,0.08)",
                boxShadow: "0 0 14px rgba(34,211,238,0.25)",
              }}
            >
              {status === "sending" ? "ОТПРАВКА…" : "ПОЛУЧИТЬ ССЫЛКУ ДЛЯ ВХОДА"}
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
