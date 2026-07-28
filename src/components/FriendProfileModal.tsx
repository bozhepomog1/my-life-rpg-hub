import { useEffect, useState } from "react";
import { fitnessLevelLabel, STAT_META, STAT_ORDER } from "@/lib/game";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { getFriendProfile, statLevels, type FriendProfile } from "@/lib/friend-profile";
import type { PublicProfile } from "@/lib/profiles";

interface Props {
  /** Public row (name/avatar/level/XP) — already loaded by the friends list. */
  profile: PublicProfile;
  onClose: () => void;
}

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * A friend's public profile: nickname, avatar, level, stat levels, fitness
 * index, current streak and unlocked achievements.
 *
 * Everything below the public header comes from `friend_profiles`, whose
 * RLS policy only returns a row to an ACCEPTED friend — so if the
 * friendship isn't accepted (or was removed), this simply renders the
 * "nothing to show" state rather than leaking anything. Quests, proof
 * photos, nutrition logs and raw body measurements are never fetched here
 * at all; they live in game_states, readable only by their owner.
 */
export function FriendProfileModal({ profile, onClose }: Props) {
  const [details, setDetails] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFriendProfile(profile.user_id).then((d) => {
      if (cancelled) return;
      setDetails(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile.user_id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unlocked = Object.entries(details?.achievements ?? {})
    .map(([id, at]) => ({ def: ACHIEVEMENT_BY_ID.get(id), at }))
    .filter((x): x is { def: NonNullable<typeof x.def>; at: number } => Boolean(x.def))
    .sort((a, b) => b.at - a.at);

  const levels = details ? statLevels(details) : null;

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel-glow max-h-[85vh] w-full max-w-sm overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Профиль: ${profile.username ?? "Без имени"}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-4xl">{profile.avatar ?? "🙂"}</span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold">{profile.username ?? "Без имени"}</h3>
            <p className="text-xs text-muted-foreground">
              Уровень {profile.level} · {profile.total_xp} XP
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : !details ? (
          <p className="mt-5 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Расширенный профиль доступен только принятым друзьям — данные пока недоступны.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                Характеристики
              </h4>
              <ul className="space-y-1.5">
                {STAT_ORDER.map((k) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <span style={{ color: STAT_META[k].color }}>
                      {STAT_META[k].icon} {STAT_META[k].label}
                    </span>
                    <span className="text-muted-foreground">ур. {levels?.[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-secondary px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Форма</div>
                <div className="text-sm font-semibold">
                  {details.fitness_index != null ? (
                    <>
                      {details.fitness_index}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {fitnessLevelLabel(details.fitness_index)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">не заполнено</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-secondary px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Серия</div>
                <div className="text-sm font-semibold">
                  🔥 {details.current_streak}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · рекорд {details.longest_streak}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                Достижения ({unlocked.length})
              </h4>
              {unlocked.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Пока нет разблокированных достижений.
                </p>
              ) : (
                <ul className="space-y-2">
                  {unlocked.map(({ def, at }) => (
                    <li key={def.id} className="flex items-center gap-2.5">
                      <span className="text-xl">{def.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{def.title}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDate(at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
