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
import { findProfileByCode, getProfiles, type PublicProfile } from "@/lib/profiles";
import { FriendProfileModal } from "@/components/FriendProfileModal";

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
  // getFriendRequests/getProfiles already swallow their own Supabase errors
  // and return [] (so a genuine outage otherwise looks identical to "you
  // have no friends yet"). This flag is set only if load() itself throws
  // (e.g. the network request never completes), so we can show a distinct
  // "couldn't load" message instead of a false empty state.
  const [loadError, setLoadError] = useState(false);

  const [code, setCode] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  // Whose extended profile is open — an accepted friend, or yourself. The
  // modal's data is RLS-gated to your own row or accepted friends anyway
  // (see friend-profile.ts), so this never needs to guess who's allowed.
  const [viewing, setViewing] = useState<PublicProfile | null>(null);

  const load = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const reqs = await getFriendRequests(myId);
      const otherIds = Array.from(
        new Set(reqs.map((r) => (r.from_user === myId ? r.to_user : r.from_user))),
      );
      const profs = await getProfiles(otherIds);
      setRequests(reqs);
      setProfiles(Object.fromEntries(profs.map((p) => [p.user_id, p])));
    } catch (err) {
      // A thrown error here (as opposed to one swallowed inside
      // getFriendRequests/getProfiles) means the request never came back at
      // all — without this catch, `loading` would stay true forever
      // ("зависшая загрузка навсегда").
      console.warn("failed to load friends", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
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
    short_code: null,
    // Never redacted to yourself, whatever your own privacy setting is.
    isPrivate: false,
  };
  // total_xp can come back null when a profile's progress is redacted (see
  // PublicProfile) — that never happens for the leaderboard, which only
  // contains accepted friends, but sort defensively rather than relying on
  // that staying true.
  const leaderboard = [myEntry, ...friendIds.map((id) => profiles[id]).filter(Boolean)].sort(
    (a, b) => (b.total_xp ?? 0) - (a.total_xp ?? 0),
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
    const q = code.trim();
    if (!q) return;
    setSearch({ kind: "searching" });
    const found = await findProfileByCode(q);
    // Unlike the old email RPC, a direct table lookup has no built-in
    // "never find yourself" guard — add it here on the client.
    if (!found || found.user_id === myId) {
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
    setCode("");
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
      {/* Add friend by short code */}
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Добавить друга</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Найди пользователя по его короткому коду — попроси прислать код текстом (свой код смотри в
          профиле или настройках).
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="K7X9QP"
            maxLength={8}
            className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!code.trim() || search.kind === "searching"}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {search.kind === "searching" ? "Ищем…" : "Найти"}
          </button>
        </div>

        {search.kind === "none" && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Пользователь с таким кодом не найден. Проверь код — он должен совпадать точно.
          </p>
        )}
        {search.kind === "error" && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-destructive">
            {search.message}
          </p>
        )}
        {search.kind === "found" && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-secondary px-3 py-2">
            <span className="emoji text-2xl">{search.profile.avatar ?? "🙂"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {search.profile.username ?? "Без имени"}
              </div>
              <div className="text-xs text-muted-foreground">
                {search.profile.isPrivate
                  ? "Закрытый профиль — прогресс будет виден после добавления в друзья"
                  : `Уровень ${search.profile.level} · ${search.profile.total_xp} XP`}
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
                  <span className="emoji text-2xl">{p?.avatar ?? "🙂"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p?.username ?? "Пользователь"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p ? `Уровень ${p.level} · ${p.total_xp} XP` : ""}
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
                  <span className="emoji text-2xl">{p?.avatar ?? "🙂"}</span>
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
          <div className="mt-4 flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : loadError ? (
          <div className="mt-4 rounded-lg bg-secondary px-4 py-6 text-center">
            <div className="text-3xl">⚠️</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Не удалось загрузить друзей — проверь соединение с интернетом.
            </p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
            >
              Повторить
            </button>
          </div>
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
              <LeaderboardRow
                key={p.user_id}
                rank={i + 1}
                profile={p}
                isMe={p.user_id === myId}
                onOpen={() => setViewing(p)}
              />
            ))}
          </ul>
        )}
      </section>

      {viewing && <FriendProfileModal profile={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];

function LeaderboardRow({
  rank,
  profile,
  isMe,
  onOpen,
}: {
  rank: number;
  profile: PublicProfile;
  isMe: boolean;
  /**
   * Own row used to be un-openable ("nothing to visit on yourself"), but
   * `friend_profiles`' RLS explicitly allows reading your own row too (see
   * friend-profile.ts) and syncFriendProfile keeps it up to date on every
   * save — so clicking your own avatar/name now opens the exact same
   * FriendProfileModal a friend's row opens, just with your own data.
   */
  onOpen: () => void;
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
      <button
        type="button"
        onClick={onOpen}
        title="Открыть профиль"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="emoji text-2xl transition-transform hover:scale-110">
          {profile.avatar ?? "🙂"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium underline-offset-2 hover:text-primary hover:underline">
              {profile.username ?? "Без имени"}
            </span>
            {isMe && <span className="shrink-0 text-xs text-primary">(ты)</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            Уровень {profile.level}
            {profile.fitness_index != null && <> · Форма {profile.fitness_index}</>}
          </div>
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-primary">{profile.total_xp}</div>
        <div className="text-[10px] text-muted-foreground">XP</div>
      </div>
    </li>
  );
}
