import { useCallback, useEffect, useMemo, useState } from "react";
import { computeFitnessIndex, type GameState } from "@/lib/game";
import { applyAchievementUnlocks } from "@/lib/achievements";
import { useAuthContext } from "@/lib/use-auth-context";
import {
  acceptedFriendIds,
  getFriendRequests,
  removeRequest,
  respondToRequest,
  sendFriendRequest,
  type FriendRequest,
} from "@/lib/friends";
import { findProfileByEmail, getProfiles, type PublicProfile } from "@/lib/profiles";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; profile: PublicProfile }
  | { kind: "none" }
  | { kind: "error"; message: string };

export function FriendsPanel({ state, update }: Props) {
  const { user } = useAuthContext();
  const myId = user?.id ?? "";

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });

  const load = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    const reqs = await getFriendRequests(myId);
    const otherIds = Array.from(
      new Set(reqs.map((r) => (r.from_user === myId ? r.to_user : r.from_user))),
    );
    const profs = await getProfiles(otherIds);
    setRequests(reqs);
    setProfiles(Object.fromEntries(profs.map((p) => [p.user_id, p])));
    setLoading(false);
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  const incoming = requests.filter((r) => r.to_user === myId && r.status === "pending");
  const outgoing = requests.filter((r) => r.from_user === myId && r.status === "pending");
  const friendIds = useMemo(() => acceptedFriendIds(requests, myId), [requests, myId]);

  // Leaderboard: me (from live game state) + accepted friends, by total XP.
  const myEntry: PublicProfile = {
    user_id: myId,
    username: state.name,
    avatar: state.avatar,
    total_xp: state.totalXp,
    level: state.level,
    fitness_index: computeFitnessIndex(state.body),
  };
  const leaderboard = [myEntry, ...friendIds.map((id) => profiles[id]).filter(Boolean)].sort(
    (a, b) => b.total_xp - a.total_xp,
  );
  const myRank = leaderboard.findIndex((p) => p.user_id === myId) + 1;

  // Social achievements need friends/leaderboard data that only lives here
  // (fetched from Supabase) — the global AchievementWatcher can't see it.
  useEffect(() => {
    if (loading) return;
    update((s) =>
      applyAchievementUnlocks(s, {
        friendsCount: friendIds.length,
        leaderboardTop3: myRank > 0 && myRank <= 3,
      }),
    );
  }, [loading, friendIds.length, myRank, update]);

  async function handleSearch() {
    const q = email.trim();
    if (!q) return;
    setSearch({ kind: "searching" });
    const found = await findProfileByEmail(q);
    if (!found) {
      setSearch({ kind: "none" });
      return;
    }
    setSearch({ kind: "found", profile: found });
  }

  async function handleSend(toUser: string) {
    const res = await sendFriendRequest(myId, toUser);
    if (!res.ok) {
      setSearch({ kind: "error", message: res.error ?? "Ошибка" });
      return;
    }
    setSearch({ kind: "idle" });
    setEmail("");
    await load();
  }

  async function handleRespond(id: string, accept: boolean) {
    await respondToRequest(id, accept);
    await load();
  }

  async function handleRemove(id: string) {
    await removeRequest(id);
    await load();
  }

  return (
    <div className="space-y-5">
      {/* Add friend by email */}
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Добавить друга</h2>
        <p className="mt-1 text-xs text-muted-foreground">Найди пользователя по email.</p>
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="friend@example.com"
            className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!email.trim() || search.kind === "searching"}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {search.kind === "searching" ? "Ищем…" : "Найти"}
          </button>
        </div>

        {search.kind === "none" && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Пользователь с таким email не найден. Он должен хотя бы раз войти в приложение.
          </p>
        )}
        {search.kind === "error" && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-destructive">
            {search.message}
          </p>
        )}
        {search.kind === "found" && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-secondary px-3 py-2">
            <span className="text-2xl">{search.profile.avatar ?? "🙂"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {search.profile.username ?? "Без имени"}
              </div>
              <div className="text-xs text-muted-foreground">
                Ур. {search.profile.level} · {search.profile.total_xp} XP
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSend(search.profile.user_id)}
              className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
            >
              Добавить
            </button>
          </div>
        )}
      </section>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Входящие заявки</h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((r) => {
              const p = profiles[r.from_user];
              return (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="text-2xl">{p?.avatar ?? "🙂"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p?.username ?? "Пользователь"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p ? `Ур. ${p.level} · ${p.total_xp} XP` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRespond(r.id, true)}
                    className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(r.id, false)}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Отклонить
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Outgoing (pending) */}
      {outgoing.length > 0 && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Отправленные заявки</h2>
          <ul className="mt-3 space-y-2">
            {outgoing.map((r) => {
              const p = profiles[r.to_user];
              return (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="text-2xl">{p?.avatar ?? "🙂"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p?.username ?? "Пользователь"}
                    </div>
                    <div className="text-xs text-muted-foreground">Ожидает ответа…</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(r.id)}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Отменить
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Leaderboard */}
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Таблица рейтингов</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Загрузка…</p>
        ) : friendIds.length === 0 ? (
          <div className="mt-4 rounded-lg bg-secondary px-4 py-6 text-center">
            <div className="text-3xl">🏅</div>
            <p className="mt-2 text-sm text-muted-foreground">
              У тебя пока нет друзей — добавь первого!
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {leaderboard.map((p, i) => (
              <LeaderboardRow key={p.user_id} rank={i + 1} profile={p} isMe={p.user_id === myId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];

function LeaderboardRow({
  rank,
  profile,
  isMe,
}: {
  rank: number;
  profile: PublicProfile;
  isMe: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        isMe ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <span className="w-7 shrink-0 text-center text-sm font-semibold text-muted-foreground">
        {rank <= 3 ? MEDAL[rank - 1] : rank}
      </span>
      <span className="text-2xl">{profile.avatar ?? "🙂"}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {profile.username ?? "Без имени"}
          {isMe && <span className="ml-1 text-xs text-primary">(ты)</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          Ур. {profile.level}
          {profile.fitness_index != null && <> · Форма {profile.fitness_index}</>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-primary">{profile.total_xp}</div>
        <div className="text-[10px] text-muted-foreground">XP</div>
      </div>
    </li>
  );
}
