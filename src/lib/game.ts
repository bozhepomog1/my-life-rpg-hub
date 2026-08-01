import {
  DEFAULT_ACCENT_COLORS,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD_COLOR,
  type AccentColors,
  type BackgroundSettings,
  type CardColorSettings,
} from "@/lib/personalization";
import { generateNickname } from "@/lib/nickname";

export type StatKey = "strength" | "intellect" | "will" | "appearance";
export type QuestCategory = "daily" | "story" | "purchase";

export interface BossQuestTarget {
  stat: StatKey;
  count: number;
}

/** The 6 challenge shapes generateBossQuest() picks between each Monday —
 * see generateBossQuest for the exact rules/ranges of each. */
export type BossQuestKind =
  | "stat_pair" // N quests in each of 2 stats
  | "quest_count" // N quests total, any stat/category
  | "streak_hold" // hold a fully-completed-day streak of N days
  | "combo" // N quests total AND a streak of M days
  | "category_focus" // N quests within a single category (daily/story/purchase)
  | "perfect_week"; // every day this week fully completed, no gaps

/** Incremental counters for the current boss quest, kept in sync via
 * registerQuestActivity() on every quest completion/undo (see index.tsx).
 * Reset to all-zero whenever a fresh BossQuest is generated. Streak-based
 * kinds (streak_hold/combo/perfect_week) don't use this — they read
 * computeStreak()/isDayFullyDone() live instead, since "current streak" is
 * already a live concept and doesn't need its own counter. */
export interface BossQuestProgress {
  byStat: Record<StatKey, number>;
  byCategory: Record<QuestCategory, number>;
  total: number;
  /** Date keys (YYYY-MM-DD) on which at least one quest completion counted
   * toward this boss quest — used to require the numeric-target kinds
   * (stat_pair/quest_count/category_focus) to be spread across several days
   * instead of clearable in one very active sitting. May be missing on boss
   * quests saved before this field existed — always read via `?? []`. */
  activeDays?: string[];
}

/** Weekly composite challenge — one of 6 templates (BossQuestKind), chosen
 * randomly each Monday for variety. Counts ANY completed quest
 * (daily/story/purchase/bonus) matching the relevant dimension. Expires
 * without penalty at the next Monday reset — see ensureWeekRollover. */
export interface BossQuest {
  weekKey: string; // Monday's date key — identifies which week this belongs to
  weekStartMs: number; // that Monday at local midnight, as a timestamp
  kind: BossQuestKind;
  title: string;
  description: string;
  // Only the fields relevant to `kind` are populated — see generateBossQuest.
  targets?: BossQuestTarget[]; // stat_pair
  questCount?: number; // quest_count, combo
  streakDays?: number; // streak_hold, combo
  category?: QuestCategory; // category_focus
  categoryCount?: number; // category_focus
  progress: BossQuestProgress;
  goldReward: number;
  xpReward: number;
  claimed: boolean;
}

export interface BossQuestProgressBar {
  label: string;
  current: number;
  target: number;
}

export interface BossQuestStatus {
  complete: boolean;
  bars: BossQuestProgressBar[];
}

/** One permanent Hall-of-Fame entry for a won boss quest — see
 * checkBossQuestCompletion(). Logged on EVERY win, not just the first. */
export interface BossWinRecord {
  weekKey: string;
  weekNumber: number; // ISO week-of-year, for a human "Босс недели №N" label
  title: string;
  wonAt: number;
}

// Cosmetic ids granted the first time a boss quest is ever won — see
// checkBossQuestCompletion() below and the matching catalog entries in
// shop.ts (AVATAR_FRAMES/TITLES), which mark these `exclusive: true` so they
// can never be bought with gold, only earned here.
export const BOSS_EXCLUSIVE_FRAME_ID = "boss_victor";
export const BOSS_EXCLUSIVE_TITLE_ID = "boss_slayer";

// ── Weekly report ("Итоги недели") ──

/** Live accumulator for the CURRENT week, reset on rollover — see
 * ensureWeekRollover/registerQuestActivity below. Tracked independently of
 * the boss quest (which may not even cover all categories) so "Итоги
 * недели" always has real numbers regardless of which boss template is
 * active. `perDay` powers the "best day of the week" stat. */
export interface WeekStats {
  weekKey: string;
  byCategory: Record<QuestCategory, number>;
  totalQuests: number;
  goldEarned: number;
  xpEarned: number;
  perDay: Record<string, number>;
}

/** One permanent snapshot of a completed week, shown by the "Итоги недели"
 * screen and browsable from Достижения. Generated once, at the moment the
 * NEXT week's rollover is detected (see ensureWeekRollover) — from that
 * point on it never changes. */
export interface WeeklyReport {
  weekKey: string;
  weekNumber: number;
  generatedAt: number;
  byCategory: Record<QuestCategory, number>;
  totalQuests: number;
  goldEarned: number;
  xpEarned: number;
  bossQuestWon: boolean;
  bossQuestTitle: string | null;
  bestDay: { dateKey: string; count: number } | null;
}

// ── Marathons ──
//
// Data model lives here (alongside the rest of GameState); the actual
// templates + day-crediting/rollover logic live in src/lib/marathons.ts,
// since checking a "nutrition_goal" day needs computeNutritionGoals() from
// this file AND the NUTRITION_GOALS fallback from nutrition.ts — putting the
// logic in its own leaf module avoids a circular import either direction.

/** Which kind of daily condition a marathon template checks — see
 * marathons.ts's marathonDayMet() for exactly how each is evaluated. */
export type MarathonKind = "category" | "stat" | "nutrition_goal";

/** The one marathon a user can have running at a time. `progressDays` resets
 * to 0 the moment a day is missed (see ensureMarathonRollover in
 * marathons.ts) — that's a deliberately separate mechanic from the
 * discipline calendar/deposit, with no penalty beyond the reset itself.
 * `lastCreditedDateKey` is the last calendar day already evaluated, so the
 * rollover only ever walks forward from there instead of re-checking days
 * it's already accounted for. */
export interface ActiveMarathon {
  templateId: string;
  startedDateKey: string;
  progressDays: number;
  lastCreditedDateKey: string | null;
  completed: boolean;
}

/** One permanent record of a fully-completed marathon — kept even after the
 * user starts (and overwrites) a new one in `activeMarathon`. */
export interface MarathonHistoryEntry {
  templateId: string;
  title: string;
  completedAt: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  stat: StatKey;
  reward: number;
  category: QuestCategory;
  requiresPhoto?: boolean;
  photoHint?: string;
  photoPath?: string; // path within the "quest-photos" Storage bucket (private; resolve via signed URL)
  requiresText?: boolean; // needs a short written note before it can be completed
  proofNote?: string;
  done: boolean;
  mandatory?: boolean; // for daily → discipline calendar
  checklist?: ChecklistItem[];
  createdAt: number;
  completedAt?: number;
  lastResetDate?: string; // for daily quests, ISO date
  deadline?: number;
  // Bodyweight training quests: when set, the quest's hint is personalized
  // with a target rep count based on the matching personal record (once
  // one's been entered in "Тело"); otherwise it falls back to
  // trainingDefaultHint.
  linkedRecord?: RecordKey;
  recordPercent?: number; // e.g. 0.7 for "70% of your max"
  trainingDefaultHint?: string;
  // Work/Day-off mode (see WORK_MODE below): when workMode is on, a daily
  // quest with these set shows the lightened title/reward instead of the
  // full one. dayOffOnly quests are hidden entirely while at work — reserved
  // for genuinely heavy tasks (full workouts, extensive learning sessions).
  workModeTitle?: string;
  workModeReward?: number;
  dayOffOnly?: boolean;
  // Bonus quests: drawn from BONUS_QUEST_POOL when no daily quests remain
  // today, rewarded at 1.5x. Purely a display flag (badge).
  bonus?: boolean;
  // User-pinned "important" quest (story/purchase — the user's own
  // one-off goals). Pinned quests float to the top of their category's
  // list — see sortQuestsForDisplay() — and get a visual highlight in
  // QuestCard. Not offered for daily quests — those are a flat personal
  // checklist rather than a mixed list of one-off goals, so there's less
  // need to single one out above the rest.
  pinned?: boolean;
  // Shop "postpone" (daily quests only, see shop.ts): a date key. While set
  // to a date strictly after today, the quest is hidden from today's list
  // and excluded from today's mandatory discipline count — it isn't "done",
  // it just doesn't count against today. Cleared automatically once that
  // date arrives (see ensureDailyQuestsReset).
  postponedUntil?: string;
}

export interface StatState {
  level: number;
  xp: number;
}

export interface Macro {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface NutritionEntry extends Macro {
  text: string;
  at: number;
  // Individual products that made up this entry, frozen at their scaled
  // macros as of save time (see addNutritionEntry in nutrition.ts) — added
  // for the stepped search→quantify flow's multi-product meals. Optional
  // since entries saved before that flow existed only ever have `text`.
  items?: (Macro & { label: string })[];
}

export interface NutritionDay extends Macro {
  entries: NutritionEntry[];
  // Set for a day when a monthly "cheat meal" reward was used — temporarily
  // lowers the remaining carb/fat goals, but the day still counts as green.
  cheatMealUsed?: boolean;
}

export type RecordKey = "maxPushups" | "maxPullups" | "maxDips" | "maxLegRaises";

export const RECORD_META: Record<RecordKey, { label: string; unit: string }> = {
  maxPushups: { label: "Отжимания от пола (макс. за подход)", unit: "раз" },
  maxPullups: { label: "Подтягивания (макс. за подход)", unit: "раз" },
  maxDips: { label: "Отжимания на брусьях (макс. за подход)", unit: "раз" },
  maxLegRaises: { label: "Подъёмы ног на пресс (макс. за подход)", unit: "раз" },
};

export type Sex = "male" | "female";
export type NutritionGoal = "lose" | "maintain" | "gain";

export interface BodyStats {
  heightCm?: number;
  weightKg?: number;
  maxPushups?: number;
  maxPullups?: number;
  maxDips?: number;
  maxLegRaises?: number;
  // Used only for the Mifflin-St Jeor nutrition goal calculation below.
  age?: number;
  sex?: Sex;
  goal?: NutritionGoal;
  // When set, these values are used as the nutrition goals instead of the
  // calculated ones — an explicit manual override for anyone who disagrees
  // with the formula's numbers. Clearing it (setting back to undefined)
  // reverts to auto-calculation.
  nutritionOverride?: Macro;
}

export const NUTRITION_GOAL_LABELS: Record<NutritionGoal, string> = {
  lose: "Похудение",
  maintain: "Поддержание веса",
  gain: "Набор массы",
};

/**
 * Fixed activity multiplier used for the Mifflin-St Jeor calculation below.
 * The request only asked for height/weight/age/sex/goal as inputs — no
 * separate "activity level" field — so this uses "lightly active" (light
 * exercise 1-3 days/week), a reasonable middle-of-the-road default given
 * the app already tracks some exercise via quests. Documented here rather
 * than silently baked in, since it's the one part of the standard formula
 * this app doesn't collect a dedicated input for.
 */
export const NUTRITION_ACTIVITY_FACTOR = 1.375;

/** kcal deficit/surplus applied on top of maintenance TDEE, per goal. */
const GOAL_KCAL_ADJUSTMENT: Record<NutritionGoal, number> = {
  lose: -500,
  maintain: 0,
  gain: 400,
};

/** Grams of protein per kg of bodyweight, per goal (higher to preserve muscle in a deficit). */
const GOAL_PROTEIN_PER_KG: Record<NutritionGoal, number> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
};

const MIN_DAILY_KCAL = 1200;

/**
 * Mifflin-St Jeor BMR × activity factor, adjusted for the stated goal, then
 * split into macros: protein by bodyweight (goal-dependent), fat at 25% of
 * total calories, carbs filling the remainder. Returns null until height,
 * weight, age, sex, and goal are all filled in — this is a standard
 * fitness-app formula, computed entirely client-side (no external calls).
 */
export function computeNutritionGoals(body: BodyStats): Macro | null {
  const { heightCm, weightKg, age, sex, goal } = body;
  if (!heightCm || !weightKg || !age || !sex || !goal) return null;

  const bmr =
    sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const tdee = bmr * NUTRITION_ACTIVITY_FACTOR;
  const kcal = Math.max(MIN_DAILY_KCAL, Math.round(tdee + GOAL_KCAL_ADJUSTMENT[goal]));

  const protein = Math.round(weightKg * GOAL_PROTEIN_PER_KG[goal]);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { kcal, protein, fat, carbs };
}

/** Rep count treated as a "100%, advanced-level" reference for each record. */
export const FITNESS_BENCHMARKS: Record<RecordKey, number> = {
  maxPushups: 40,
  maxPullups: 15,
  maxDips: 20,
  maxLegRaises: 30,
};

export interface FitnessLevel {
  label: string;
  min: number;
}

export const FITNESS_LEVELS: FitnessLevel[] = [
  { label: "Новичок", min: 0 },
  { label: "Любитель", min: 25 },
  { label: "Продвинутый", min: 50 },
  { label: "Атлет", min: 75 },
  // Above 100 used to be unreachable (each stat was capped at its
  // benchmark), so "Атлет" was a hard ceiling with nothing beyond it.
  // These two extend the ladder for anyone who keeps improving past the
  // benchmark reps — a real progression, not just a label change, since
  // the index itself is no longer capped at 100 either (see below).
  { label: "Элита", min: 100 },
  { label: "Легенда", min: 150 },
];

/**
 * Index averaging all 4 records, each normalized against its benchmark
 * (100 = benchmark reps). Requires all 4 records to be set — averaging
 * over only the ones that are filled in would show a misleadingly high
 * index from partial data (e.g. only pushups entered, at "Атлет" level).
 *
 * Each stat's percentage is no longer capped at 100 — the benchmarks are
 * an "advanced" reference point, not a maximum, so someone who trains
 * well past it (e.g. 60 pushups vs. the 40 benchmark = 150%) should keep
 * seeing their index climb instead of hitting an invisible wall the
 * moment they match the benchmark on every exercise. FITNESS_LEVELS goes
 * up to 150+ ("Легенда") so there's always a next tier to reach for.
 */
export function computeFitnessIndex(body: BodyStats): number | null {
  const keys = Object.keys(FITNESS_BENCHMARKS) as RecordKey[];
  if (!keys.every((k) => body[k] != null)) return null;
  const pct =
    keys.reduce((sum, k) => {
      const value = body[k] as number;
      return sum + (value / FITNESS_BENCHMARKS[k]) * 100;
    }, 0) / keys.length;
  return Math.round(pct);
}

export function fitnessLevelLabel(index: number): string {
  const level = [...FITNESS_LEVELS].reverse().find((l) => index >= l.min);
  return level?.label ?? FITNESS_LEVELS[0].label;
}

export interface GameState {
  avatar: string;
  // Storage path of an uploaded profile-photo avatar (quest-photos bucket,
  // see avatar-photo.ts) — when set, ProfileHeader shows this photo in a
  // round frame instead of the `avatar` emoji. Removing the photo (or never
  // uploading one) falls back to the emoji picker as before.
  avatarPhotoPath?: string;
  name: string;
  totalXp: number;
  level: number;
  stats: Record<StatKey, StatState>;
  quests: Quest[];
  completedCount: number;
  // deposit — an OPTIONAL "skin in the game" challenge, off by default.
  // Only becomes active once the user explicitly configures an amount and
  // duration and confirms via the setup modal (see DepositSetupModal).
  // depositStartAt doubles as the anchor date for the always-on 30-day
  // discipline calendar (see computeDiscipline) regardless of whether a
  // deposit is actually enabled — that part isn't gated.
  depositEnabled: boolean;
  depositStartAt: number; // timestamp; countdown start (calendar anchor + deposit clock)
  depositAmount: number; // user-chosen; not necessarily real money — can be symbolic
  depositDurationDays: number; // user-chosen length of the deposit challenge
  depositLost: boolean;
  // discipline: dates → list of completed daily quest ids that day
  dailyCompletions: Record<string, string[]>;
  // nutrition: date → that day's logged calories/macros
  nutrition: Record<string, NutritionDay>;
  // body: height/weight + personal training records
  body: BodyStats;
  // longest streak of consecutive fully-completed days ever reached
  longestStreak: number;
  // Work schedule: replaces the old binary work/day-off toggle. Whether
  // "today" counts as a work day is derived from this via isWorkDayToday()
  // rather than stored directly, so it stays correct automatically as days
  // pass — see WorkSchedule below.
  schedule: WorkSchedule;
  // Monthly cheat-meal reward counter, keyed by "YYYY-MM".
  cheatMealsUsed: Record<string, number>;
  // Today's randomly-drawn bonus quests (shown once no daily quests remain).
  bonusQuests: Quest[];
  bonusQuestsDate?: string;
  // How many mandatory daily quests were assigned on a given PAST date —
  // needed because a user can freely add/remove their own daily quests over
  // time, so a past day's dailyCompletions can no longer be matched against
  // "today's" current daily list. Comparing counts instead of ids keeps the
  // discipline calendar/streak correct even after the user's list changes.
  // Recorded once per day by ensureDailyMandatoryCount(); today itself always
  // uses the live count instead (see mandatoryCountFor) so adding/removing a
  // daily quest mid-day is reflected immediately rather than frozen at
  // whatever it was that morning. Dates from before this existed simply
  // won't have an entry — callers fall back to the current mandatory count.
  dailyMandatoryCounts: Record<string, number>;
  // Unlocked achievement ids → the timestamp they were unlocked at. Once set,
  // an id is never removed (achievements don't "re-lock").
  unlockedAchievements: Record<string, number>;
  // Profile privacy ("мягкий" режим — see supabase/privacy-migration.sql).
  // Being findable by short code and receiving friend requests works the
  // same either way; what this changes is that someone who is NOT an
  // accepted friend sees only name + avatar, never progress. Accepted
  // friends always see everything. Mirrored into profiles.is_private by
  // syncProfile — the actual enforcement is RLS + SECURITY DEFINER
  // functions in the database, this flag is only the user's stored choice.
  isPrivate: boolean;
  // Opt-in browser Notification reminders for unfinished daily quests.
  // Only ever set to true after the user explicitly grants permission.
  remindersEnabled: boolean;
  // Local hour (0-23) the user wants their reminder push at — read by
  // send-daily-reminders (now cron'd hourly instead of once at a fixed UTC
  // time) alongside reminderTimezone below to decide "is it this user's
  // chosen hour right now". Defaults to 20 (matches the old fixed-UTC-20:00
  // behavior for anyone who never touches the new picker in Settings →
  // Уведомления).
  reminderHour: number;
  // IANA timezone name (e.g. "Europe/Moscow"), captured once from
  // Intl.DateTimeFormat().resolvedOptions().timeZone — this is what makes
  // reminderHour a genuinely LOCAL hour rather than another UTC hour in
  // disguise. Deliberately NOT stored in the public.profiles table (that
  // table is readable by any authenticated user for the friends/leaderboard
  // feature — a notification-time/timezone preference has no reason to leak
  // to friends), so it lives here in the same per-user, RLS-private
  // game_states blob as remindersEnabled itself.
  reminderTimezone: string;
  // Current 30-day season — a rolling XP/quest counter that resets every
  // season without touching overall hero level/XP. See SeasonState below.
  season: SeasonState;
  // Set once a season rolls over, so a results screen can be shown; cleared
  // (marked seen) once the player dismisses it, but the record itself is
  // kept around as the last completed season's summary.
  lastSeasonSummary?: SeasonSummary;
  seasonSummarySeen: boolean;
  // User's chosen accent colors (Settings → Персонализация). Optional so
  // states saved before this feature existed simply fall back to the
  // default (amethyst, matching the app icon) wherever this is read — see
  // DEFAULT_ACCENT_COLORS.
  accentColors: AccentColors;
  // User's chosen app background (Settings → Персонализация → Фон): a
  // neutral default, a solid tint, or an uploaded photo with a dimming
  // scrim. See BackgroundSettings for the shape.
  background: BackgroundSettings;
  // User's chosen card/panel surface color (Settings → Персонализация — фон
  // → Цвет карточек). See CardColorSettings for the shape.
  cardColor: CardColorSettings;
  // Manual fix-ups for PAST discipline-calendar days (e.g. forgot to log a
  // day but actually completed everything). Keyed by date (YYYY-MM-DD) →
  // forced status. Only ever consulted for days strictly before today — see
  // resolveDayStatus()/isDayFullyDone() — so this can never touch today's
  // live automatic tracking or be used to get ahead of the real rules.
  manualDayOverrides: Record<string, "green" | "red">;
  // Whether the one-time "here are some starter daily quests" suggestion
  // (shown to a brand-new account with an empty "Ежедневные" list — see
  // STARTER_QUEST_IDEAS and index.tsx) has already been shown and dismissed
  // (either by adding some suggestions or explicitly skipping). Once true,
  // it never shows again — even if the user later deletes every daily quest
  // and the list is empty again, since daily quests are no longer an
  // auto-rotated pool the app can "refill" behind the user's back.
  dailyOnboardingDismissed: boolean;
  // Gold: a separate currency from XP, earned 1:1 alongside a quest's XP
  // reward, spent in the Shop (see shop.ts). Purely a spending currency —
  // doesn't affect level/stats itself.
  gold: number;
  // Shop cosmetics: purely visual, never affect progress. "equipped*" is
  // null/"classic" until the user actively picks something they own.
  unlockedFrames: string[];
  equippedFrame: string | null;
  unlockedCardThemes: string[];
  equippedCardTheme: string;
  unlockedTitles: string[];
  equippedTitle: string | null;
  // Shop "postpone quest" daily limit tracker, keyed by date (YYYY-MM-DD).
  postponesUsed: Record<string, number>;
  // Shop "extra cheat meal" purchases, keyed by month (YYYY-MM) — adds to
  // the free monthly limit in nutrition.ts.
  cheatMealBonus: Record<string, number>;
  // Most-recently-shown BIG_GOAL_IDEAS titles (see randomBigGoalIdea/
  // recordBigGoalShown) — persisted so the roller can't immediately
  // resurface something the user just saw, even across closing the roller
  // or reloading the page.
  recentBigGoalTitles: string[];
  // Weekly boss quest (see generateBossQuest/ensureWeekRollover below). Null
  // only very briefly before the periodic effect first runs.
  bossQuest: BossQuest | null;
  // Permanent history of won boss quests, newest first — see
  // checkBossQuestCompletion(). Surfaced in achievements.tsx's Hall of Fame.
  bossWins: BossWinRecord[];
  // Live accumulator for the current week — see WeekStats/ensureWeekRollover.
  weekStats: WeekStats;
  // Permanent history of past weeks' reports, newest first — see
  // WeeklyReport/ensureWeekRollover. Browsable from Достижения.
  weeklyReports: WeeklyReport[];
  // False right after a new WeeklyReport is generated (triggers the
  // full-screen "Итоги недели" summary, same pattern as
  // lastSeasonSummary/seasonSummarySeen), true once dismissed.
  weeklyReportSeen: boolean;
  // The one currently-running marathon (see ActiveMarathon above), or null
  // if none has been started / the last one was abandoned. See marathons.ts.
  activeMarathon: ActiveMarathon | null;
  // Permanent history of completed marathons, newest first.
  marathonHistory: MarathonHistoryEntry[];
  // Small durable flags for hidden-achievement conditions that leave no
  // other trace in state — see achievements.ts's "secret" category. Neither
  // one ever un-sets once true.
  midnightQuestDone: boolean; // a quest was completed between 00:00 and 00:04
  everUsedUndo: boolean; // the "Отменить" undo toast was ever used
  // Short generated sound effects (see sound.ts) — on by default, toggled
  // off in Settings → "Звуки".
  soundEnabled: boolean;
  // Starter stat quiz (StatQuiz.tsx) — true once taken OR explicitly
  // skipped. Only ever false for a genuinely brand-new account: see the
  // explicit `?? true` patches in loadState() and use-game-state.ts, which
  // stop this from retroactively popping up for existing users whose saved
  // data simply predates the field.
  statQuizDone: boolean;
}

const KEY = "rpg-life-state-v2";

/** Per-user local cache key, so multiple accounts on one browser don't collide. */
export function localCacheKey(userId: string) {
  return `${KEY}:${userId}`;
}

export const STAT_META: Record<StatKey, { label: string; color: string; icon: string }> = {
  strength: { label: "Сила", color: "#b8925a", icon: "⚔️" },
  intellect: { label: "Интеллект", color: "#5c8b99", icon: "🧠" },
  will: { label: "Воля", color: "#7a9471", icon: "🔥" },
  // Display label only — the StatKey stays "appearance" so existing saved
  // states (which key stats by this string) keep working after the rename.
  appearance: { label: "Харизма", color: "#9b7a96", icon: "💎" },
};

/**
 * The one fixed display order for characteristics across the whole app:
 * stat cards, quest lists/tags, anywhere stats are enumerated for a person
 * to read (as opposed to sorted by value, like the achievements leaderboard).
 * Defined once here instead of relying on object key insertion order, so it
 * can't silently drift if STAT_META/defaultState() are ever reordered later.
 */
export const STAT_ORDER: StatKey[] = ["strength", "intellect", "will", "appearance"];

export interface Archetype {
  label: string;
  icon: string;
}

const ARCHETYPE_BY_STAT: Record<StatKey, Archetype> = {
  strength: { label: "Воин", icon: "⚔️" },
  intellect: { label: "Мудрец", icon: "📖" },
  will: { label: "Стратег", icon: "🧭" },
  appearance: { label: "Дипломат", icon: "🎭" },
};

const ARCHETYPE_UNIVERSAL: Archetype = { label: "Универсал", icon: "🌀" };

/**
 * Class/archetype badge shown next to the name in ProfileHeader — purely
 * derived from whichever stat currently has the most total XP (level*100 +
 * xp), so it updates automatically as the leading stat changes; nothing is
 * stored in GameState for this. A tie across ALL FOUR stats (only really
 * possible right at the very start, all at 0) falls back to a neutral
 * "Универсал" rather than arbitrarily picking one.
 */
// ── Starter stat quiz (StatQuiz.tsx) ──

export interface QuizOption {
  text: string;
  points: number;
}

export interface QuizQuestion {
  stat: StatKey;
  text: string;
  options: QuizOption[];
}

/** 5 questions per stat (20 total), each option worth 0-3 points reflecting
 * real habits/preferences rather than an abstract "pick a number" — see the
 * task description in the commit this landed in. */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // Сила
  {
    stat: "strength",
    text: "Как часто ты занимаешься физической активностью (спорт, тренировки, активные прогулки)?",
    options: [
      { text: "Почти каждый день", points: 3 },
      { text: "Несколько раз в неделю", points: 2 },
      { text: "Иногда, редко", points: 1 },
      { text: "Почти никогда", points: 0 },
    ],
  },
  {
    stat: "strength",
    text: "Сколько времени в день ты обычно проводишь сидя, почти без движения?",
    options: [
      { text: "Меньше 4 часов", points: 3 },
      { text: "4-8 часов", points: 2 },
      { text: "8-12 часов", points: 1 },
      { text: "Больше 12 часов", points: 0 },
    ],
  },
  {
    stat: "strength",
    text: "Сможешь ли ты пробежать 3 км без остановки прямо сейчас?",
    options: [
      { text: "Легко", points: 3 },
      { text: "С трудом, но смогу", points: 2 },
      { text: "Вряд ли", points: 1 },
      { text: "Точно нет", points: 0 },
    ],
  },
  {
    stat: "strength",
    text: "Как ты обычно добираешься на короткие расстояния (до 2 км)?",
    options: [
      { text: "Пешком или на велосипеде", points: 3 },
      { text: "Иногда пешком", points: 2 },
      { text: "Почти всегда на транспорте", points: 1 },
      { text: "Только на транспорте", points: 0 },
    ],
  },
  {
    stat: "strength",
    text: "Делаешь ли ты зарядку, растяжку или разминку по утрам?",
    options: [
      { text: "Каждый день", points: 3 },
      { text: "Несколько раз в неделю", points: 2 },
      { text: "Редко", points: 1 },
      { text: "Никогда", points: 0 },
    ],
  },
  // Интеллект
  {
    stat: "intellect",
    text: "Сколько книг ты прочитал(а) за последний год?",
    options: [
      { text: "Больше 10", points: 3 },
      { text: "3-10", points: 2 },
      { text: "1-2", points: 1 },
      { text: "Ни одной", points: 0 },
    ],
  },
  {
    stat: "intellect",
    text: "Как часто ты изучаешь что-то новое (курсы, статьи, языки, навыки)?",
    options: [
      { text: "Постоянно", points: 3 },
      { text: "Периодически", points: 2 },
      { text: "Изредка", points: 1 },
      { text: "Практически никогда", points: 0 },
    ],
  },
  {
    stat: "intellect",
    text: "Любишь ли решать логические задачи, головоломки, кроссворды?",
    options: [
      { text: "Регулярно", points: 3 },
      { text: "Иногда", points: 2 },
      { text: "Редко", points: 1 },
      { text: "Не люблю", points: 0 },
    ],
  },
  {
    stat: "intellect",
    text: "Что ты выбираешь чаще — обучающий контент (лекции, документалки, подкасты) или чисто развлекательный?",
    options: [
      { text: "В основном обучающий", points: 3 },
      { text: "Примерно поровну", points: 2 },
      { text: "В основном развлекательный", points: 1 },
      { text: "Только развлекательный", points: 0 },
    ],
  },
  {
    stat: "intellect",
    text: "Ведёшь ли записи или заметки, чтобы структурировать мысли и знания?",
    options: [
      { text: "Постоянно", points: 3 },
      { text: "Иногда", points: 2 },
      { text: "Редко", points: 1 },
      { text: "Никогда", points: 0 },
    ],
  },
  // Воля
  {
    stat: "will",
    text: "Доводишь ли ты начатые дела до конца?",
    options: [
      { text: "Почти всегда", points: 3 },
      { text: "Чаще да", points: 2 },
      { text: "Через раз", points: 1 },
      { text: "Редко", points: 0 },
    ],
  },
  {
    stat: "will",
    text: "Как ты справляешься с искушением отложить важное дело на потом?",
    options: [
      { text: "Обычно не откладываю", points: 3 },
      { text: "Иногда откладываю", points: 2 },
      { text: "Часто откладываю", points: 1 },
      { text: "Почти всегда откладываю", points: 0 },
    ],
  },
  {
    stat: "will",
    text: "Придерживаешься ли ты стабильного режима сна?",
    options: [
      { text: "Да, стабильный режим", points: 3 },
      { text: "Примерно стабильный", points: 2 },
      { text: "Сильно скачет", points: 1 },
      { text: "Никакой системы", points: 0 },
    ],
  },
  {
    stat: "will",
    text: "Как часто ты выполняешь то, что запланировал(а) на день?",
    options: [
      { text: "Почти всегда", points: 3 },
      { text: "Обычно да", points: 2 },
      { text: "Иногда", points: 1 },
      { text: "Редко", points: 0 },
    ],
  },
  {
    stat: "will",
    text: "Как ты реагируешь на неудачу в достижении цели?",
    options: [
      { text: "Пробую снова почти сразу", points: 3 },
      { text: "Пробую через время", points: 2 },
      { text: "Долго не возвращаюсь к этому", points: 1 },
      { text: "Обычно бросаю совсем", points: 0 },
    ],
  },
  // Харизма
  {
    stat: "appearance",
    text: "Насколько комфортно тебе заговорить первым(ой) с незнакомым человеком?",
    options: [
      { text: "Легко и естественно", points: 3 },
      { text: "Могу, если нужно", points: 2 },
      { text: "Немного напрягает", points: 1 },
      { text: "Стараюсь избегать", points: 0 },
    ],
  },
  {
    stat: "appearance",
    text: "Как часто ты сам(а) инициируешь общение с друзьями или знакомыми?",
    options: [
      { text: "Часто пишу первым(ой)", points: 3 },
      { text: "Примерно поровну", points: 2 },
      { text: "Чаще жду, когда напишут", points: 1 },
      { text: "Почти никогда не пишу первым(ой)", points: 0 },
    ],
  },
  {
    stat: "appearance",
    text: "Уделяешь ли внимание тому, как выглядишь перед выходом из дома?",
    options: [
      { text: "Всегда", points: 3 },
      { text: "Обычно да", points: 2 },
      { text: "Иногда", points: 1 },
      { text: "Редко задумываюсь", points: 0 },
    ],
  },
  {
    stat: "appearance",
    text: "Как ты себя чувствуешь, выступая перед группой людей?",
    options: [
      { text: "Уверенно", points: 3 },
      { text: "Немного волнуюсь, но справляюсь", points: 2 },
      { text: "Сильно волнуюсь", points: 1 },
      { text: "Стараюсь избегать", points: 0 },
    ],
  },
  {
    stat: "appearance",
    text: "Легко ли тебе заводить новые знакомства?",
    options: [
      { text: "Очень легко", points: 3 },
      { text: "Легко", points: 2 },
      { text: "Скорее сложно", points: 1 },
      { text: "Очень сложно", points: 0 },
    ],
  },
];

/** Each raw point (0-3 per question, up to 15 per stat across 5 questions)
 * converts to this much starting XP — up to 300 XP (~3 levels) for maxing
 * every question on a stat. Proportional to actual answers, not a flat
 * amount for everyone. */
export const QUIZ_XP_PER_POINT = 20;

/** Applies the quiz's per-stat point totals as genuine starting XP/levels —
 * these count as the character's first real progress, not a separate bonus,
 * so they feed totalXp/level exactly like applyReward() would. */
export function applyQuizResults(
  state: GameState,
  pointsByStat: Record<StatKey, number>,
): GameState {
  const next = structuredClone(state);
  for (const k of STAT_ORDER) {
    const xpGain = (pointsByStat[k] ?? 0) * QUIZ_XP_PER_POINT;
    if (xpGain <= 0) continue;
    const s = next.stats[k];
    const combined = s.level * 100 + s.xp + xpGain;
    s.level = Math.floor(combined / 100);
    s.xp = combined % 100;
    next.totalXp += xpGain;
  }
  while (next.totalXp >= xpForNextLevel(next.level)) {
    next.level += 1;
  }
  next.statQuizDone = true;
  return next;
}

export function skipQuiz(state: GameState): GameState {
  return { ...state, statQuizDone: true };
}

export function computeArchetype(state: GameState): Archetype {
  const totals = STAT_ORDER.map((k) => state.stats[k].level * 100 + state.stats[k].xp);
  const max = Math.max(...totals);
  const leaders = STAT_ORDER.filter((_, i) => totals[i] === max);
  if (leaders.length > 1) return ARCHETYPE_UNIVERSAL;
  return ARCHETYPE_BY_STAT[leaders[0]];
}

/**
 * Sorts any list of stat-tagged items (quests, etc.) into STAT_ORDER groups,
 * preserving each item's relative order within its own stat group (stable
 * sort) — so daily quests no longer render in a random per-stat jumble.
 */
export function sortByStatOrder<T extends { stat: StatKey }>(items: T[]): T[] {
  return [...items].sort((a, b) => STAT_ORDER.indexOf(a.stat) - STAT_ORDER.indexOf(b.stat));
}

/**
 * Same STAT_ORDER grouping as sortByStatOrder(), but pinned quests (see
 * Quest.pinned) float to the very top of the list first — pinned items
 * sorted among themselves by stat order, then everything else sorted by
 * stat order. Used for the main quest list so a user's pinned goals stay
 * visible at a glance instead of scattered across stat groups.
 */
export function sortQuestsForDisplay<T extends { stat: StatKey; pinned?: boolean }>(
  items: T[],
): T[] {
  const pinned = sortByStatOrder(items.filter((i) => i.pinned));
  const rest = sortByStatOrder(items.filter((i) => !i.pinned));
  return [...pinned, ...rest];
}

export const CATEGORY_META: Record<
  QuestCategory,
  { label: string; icon: string; description: string }
> = {
  daily: {
    label: "Ежедневные квесты",
    icon: "🌅",
    description: "Сброс в полночь. Требуют подтверждения.",
  },
  story: {
    label: "Сюжетные квесты",
    icon: "📜",
    description: "Выбери дополнительные задачи по желанию.",
  },
  // Renamed from "Квесты-закупки" — that name only fit shopping-related
  // goals, but this tab is really any big one-off personal goal a user
  // adds via AddQuestModal (the QuestCategory value itself stays "purchase"
  // internally — only the user-facing label/description/copy changed, to
  // keep this a display-only rename rather than a wider refactor).
  purchase: {
    label: "Крупные цели",
    icon: "🎯",
    description: "Большие разовые личные задачи с дедлайном — не только покупки.",
  },
};

export const DEFAULT_DEPOSIT_DURATION_DAYS = 30;

/** Deposit challenge length in ms, based on the user's chosen duration
 * (falls back to the default for any legacy/unset state). */
export function depositDurationMs(state: Pick<GameState, "depositDurationDays">): number {
  const days =
    state.depositDurationDays > 0 ? state.depositDurationDays : DEFAULT_DEPOSIT_DURATION_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/** Minimum length of the written proof note for requiresText quests. */
export const MIN_NOTE_LENGTH = 25;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seedQuests(): Quest[] {
  const now = Date.now();
  const q = (partial: Omit<Quest, "id" | "createdAt" | "done"> & { done?: boolean }): Quest => ({
    id: uid(),
    createdAt: now,
    done: false,
    ...partial,
  });

  return [
    // Daily quests are no longer seeded here — "Ежедневные" starts
    // completely empty for a new account, same as story/purchase (see
    // QUEST_IDEA_POOL/STARTER_QUEST_IDEAS and index.tsx's one-time
    // suggestion prompt, and createQuest for how the user adds their own).
    // This function only seeds the one-off story/purchase quests below.
    //
    // PRIVACY: everything in this function ships inside the public JS
    // bundle and is handed to EVERY new account. It must therefore stay
    // strictly generic — never put personal goals, purchases, order/SKU
    // numbers, place names or anything else identifying in here. Personal
    // quests belong in a user's own saved state (added from the UI), not
    // in the seed. See commit history: an earlier version of this seed
    // leaked the author's private quest list to every new signup.
    //
    // STORY/PURCHASE (beyond the bodyweight-training set below) are
    // deliberately NOT pre-seeded with generic filler goals either — those
    // are "big one-off personal goals," which only mean something coming
    // from the person themselves. A brand-new account sees an empty list
    // with a prompt to add their own via AddQuestModal (see index.tsx)
    // instead of a designer-picked placeholder ("Выйти на пробежку" etc.)
    // that isn't actually the user's goal.

    // STORY — bodyweight training, personalized once a record is set in "Тело".
    // Kept (unlike the removed filler goals above): this is a generic,
    // feature-integral quest set tied to the user's OWN "Тело" records, not
    // a personal-goal placeholder.
    q({
      title: "Сделать подход отжиманий от пола",
      stat: "strength",
      reward: 10,
      category: "story",
      linkedRecord: "maxPushups",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),
    q({
      title: "Сделать подход подтягиваний",
      stat: "strength",
      reward: 15,
      category: "story",
      linkedRecord: "maxPullups",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),
    q({
      title: "Сделать подход отжиманий на брусьях",
      stat: "strength",
      reward: 15,
      category: "story",
      linkedRecord: "maxDips",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),
    q({
      title: "Сделать подход подъёмов ног на пресс",
      stat: "strength",
      reward: 10,
      category: "story",
      linkedRecord: "maxLegRaises",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),

    // PURCHASE has no seeded quests at all — see the comment above. A new
    // account's "Крупные цели" tab starts empty; index.tsx shows an
    // "add your first goal" prompt (AddQuestModal) instead.
  ];
}

/**
 * Builds a user-created one-off quest (AddQuestModal, now used for all three
 * categories — daily quests are no longer an auto-rotated pool, see
 * ensureDailyMandatoryCount below, so "Ежедневные" is populated exactly the
 * same hand-created way "Сюжетные"/"Крупные цели" always were). Fills in the
 * same id/createdAt/done bookkeeping seedQuests()'s internal `q()` helper
 * does, so hand-created and seeded quests behave identically. Daily quests
 * are always marked mandatory — with no more pool to draw a separate
 * "optional daily" from, every quest a user puts in their own daily
 * checklist is meant to count toward the discipline calendar.
 */
export function createQuest(input: {
  title: string;
  stat: StatKey;
  reward: number;
  category: QuestCategory;
  requiresPhoto?: boolean;
  requiresText?: boolean;
}): Quest {
  return {
    id: uid(),
    createdAt: Date.now(),
    done: false,
    title: input.title,
    stat: input.stat,
    reward: input.reward,
    category: input.category,
    mandatory: input.category === "daily" ? true : undefined,
    requiresPhoto: input.requiresPhoto,
    requiresText: input.requiresText,
  };
}

/** Best-effort IANA timezone read, e.g. "Europe/Moscow" — falls back to UTC
 * if Intl is unavailable for some reason (shouldn't happen in any real
 * browser/Node, but this runs during SSR too where being defensive is
 * cheap). Only ever called once, when a fresh GameState is created — after
 * that the user's stored reminderTimezone is what send-daily-reminders
 * trusts, so it explicitly does NOT re-detect on every load (a user
 * traveling shouldn't have their reminder time silently shift). */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function defaultState(): GameState {
  const base: GameState = {
    avatar: "🥷",
    // Friendly, gender-neutral random starting nickname (e.g. "Тихое
    // Облако") instead of a fixed "Герой" — this is the freely-renamable
    // display name (Settings → "Как тебя зовут в игре?"), separate from the
    // immutable short friend-code generated server-side (profiles.short_code).
    name: generateNickname(),
    totalXp: 0,
    level: 1,
    stats: {
      strength: { level: 0, xp: 0 },
      intellect: { level: 0, xp: 0 },
      will: { level: 0, xp: 0 },
      appearance: { level: 0, xp: 0 },
    },
    quests: seedQuests(),
    completedCount: 0,
    depositEnabled: false,
    depositStartAt: Date.now(),
    depositAmount: 1000,
    depositDurationDays: DEFAULT_DEPOSIT_DURATION_DAYS,
    depositLost: false,
    dailyCompletions: {},
    nutrition: {},
    body: {},
    longestStreak: 0,
    schedule: defaultSchedule(),
    cheatMealsUsed: {},
    bonusQuests: [],
    dailyMandatoryCounts: {},
    unlockedAchievements: {},
    isPrivate: false,
    remindersEnabled: false,
    reminderHour: 20,
    reminderTimezone: detectTimezone(),
    season: defaultSeason(),
    seasonSummarySeen: true,
    accentColors: { ...DEFAULT_ACCENT_COLORS },
    background: { ...DEFAULT_BACKGROUND },
    cardColor: { ...DEFAULT_CARD_COLOR },
    manualDayOverrides: {},
    dailyOnboardingDismissed: false,
    gold: 0,
    unlockedFrames: [],
    equippedFrame: null,
    unlockedCardThemes: ["classic"],
    equippedCardTheme: "classic",
    unlockedTitles: [],
    equippedTitle: null,
    postponesUsed: {},
    cheatMealBonus: {},
    recentBigGoalTitles: [],
    bossQuest: null,
    bossWins: [],
    weekStats: emptyWeekStats(currentBossWeekKey()),
    weeklyReports: [],
    weeklyReportSeen: true,
    activeMarathon: null,
    marathonHistory: [],
    midnightQuestDone: false,
    everUsedUndo: false,
    soundEnabled: true,
    statQuizDone: false,
  };
  return base;
}

/**
 * Reads cached game state from localStorage.
 * Pass a userId to read that user's cache; omit it to read the legacy
 * pre-auth anonymous cache (used only for one-time migration on first login).
 */
export function loadState(userId?: string): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const key = userId ? localCacheKey(userId) : KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      stats: { ...base.stats, ...(parsed.stats || {}) },
      dailyCompletions: parsed.dailyCompletions || {},
      nutrition: parsed.nutrition || {},
      body: parsed.body || {},
      longestStreak: parsed.longestStreak ?? 0,
      // Migrates from the old binary workMode toggle: that boolean can't map
      // meaningfully onto a recurring schedule, so existing users just get a
      // fresh default (classic 5/2) schedule to configure in Settings.
      schedule: parsed.schedule || defaultSchedule(),
      cheatMealsUsed: parsed.cheatMealsUsed || {},
      recentBigGoalTitles: parsed.recentBigGoalTitles || [],
      bonusQuests: parsed.bonusQuests || [],
      bonusQuestsDate: parsed.bonusQuestsDate,
      dailyMandatoryCounts: parsed.dailyMandatoryCounts || {},
      unlockedAchievements: parsed.unlockedAchievements || {},
      isPrivate: parsed.isPrivate ?? false,
      remindersEnabled: parsed.remindersEnabled ?? false,
      reminderHour:
        typeof parsed.reminderHour === "number" &&
        Number.isInteger(parsed.reminderHour) &&
        parsed.reminderHour >= 0 &&
        parsed.reminderHour <= 23
          ? parsed.reminderHour
          : base.reminderHour,
      reminderTimezone: parsed.reminderTimezone || base.reminderTimezone,
      season: parsed.season || defaultSeason(),
      lastSeasonSummary: parsed.lastSeasonSummary,
      seasonSummarySeen: parsed.seasonSummarySeen ?? true,
      accentColors: parsed.accentColors || { ...DEFAULT_ACCENT_COLORS },
      background: parsed.background || { ...DEFAULT_BACKGROUND },
      cardColor: parsed.cardColor || { ...DEFAULT_CARD_COLOR },
      manualDayOverrides: parsed.manualDayOverrides || {},
      dailyOnboardingDismissed: parsed.dailyOnboardingDismissed ?? false,
      bossWins: parsed.bossWins || [],
      // A weekStats missing its own weekKey (or missing entirely, on a save
      // that predates this feature) just starts fresh on the current week —
      // there's no way to retroactively reconstruct a week already in
      // progress, and starting fresh loses at most the numbers for however
      // much of the current week already happened, not any past report.
      weekStats:
        parsed.weekStats && parsed.weekStats.weekKey
          ? parsed.weekStats
          : emptyWeekStats(currentBossWeekKey()),
      weeklyReports: parsed.weeklyReports || [],
      weeklyReportSeen: parsed.weeklyReportSeen ?? true,
      activeMarathon: parsed.activeMarathon ?? null,
      marathonHistory: parsed.marathonHistory || [],
      midnightQuestDone: parsed.midnightQuestDone ?? false,
      everUsedUndo: parsed.everUsedUndo ?? false,
      soundEnabled: parsed.soundEnabled ?? true,
      // Any save that already exists locally predates or postdates the quiz
      // feature either way — if the field's simply missing, this is an
      // established local cache, not a fresh account, so treat it as done
      // rather than showing the onboarding quiz retroactively.
      statQuizDone: parsed.statQuizDone ?? true,
    };
  } catch {
    return null;
  }
}

export function saveState(s: GameState, userId?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = userId ? localCacheKey(userId) : KEY;
    window.localStorage.setItem(key, JSON.stringify(s));
  } catch (e) {
    console.warn("save failed", e);
  }
}

export function clearLegacyLocalState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Cumulative total-XP threshold needed to have reached level+1 — used as
 * `totalXp >= xpForNextLevel(currentLevel)` in the level-up loops below.
 * Each level now costs progressively more than the last (100 XP for
 * level 1→2, growing by 40 XP per level after that: 140 for 2→3, 180 for
 * 3→4, …) instead of a flat 100 XP/level. The flat curve let one very
 * active day (~150-250 XP from a full daily set + a bonus/story quest)
 * blow through 2-3 levels at once; the escalating cost keeps early levels
 * quick wins while later ones realistically take many days of sustained
 * play, matching a months-long RPG progression instead of a single sitting.
 * Closed form of sum_{i=1}^{level} (100 + 40*(i-1)) = 20*level^2 + 80*level.
 */
export function xpForNextLevel(level: number) {
  if (level <= 0) return 0;
  return 20 * level * level + 80 * level;
}

export type ScheduleMode = "weekly" | "cycle";

/**
 * Configurable work schedule, replacing the old binary "at work / day off"
 * toggle. Two modes cover any pattern the request asked for:
 * - "weekly": a fixed weekly pattern (7 booleans, Monday-first) — covers a
 *   classic 5/2 week and any other weekly-repeating ("free-form") pattern.
 * - "cycle": a repeating N-work/M-rest cycle anchored to a date — covers
 *   shift patterns that drift across weekdays (2/2, 4/3, etc.), which a
 *   weekly pattern can't express since they don't repeat every 7 days.
 */
export interface WorkSchedule {
  mode: ScheduleMode;
  /** Monday-first: index 0 = Monday, 6 = Sunday. */
  weeklyWorkDays: boolean[];
  cycleWorkDays: number;
  cycleRestDays: number;
  /** ISO date (todayKey format) of the first day of a work block in the cycle. */
  cycleAnchor: string;
}

/** Fresh default schedule (classic 5/2 week) — a function, not a frozen
 * constant, so cycleAnchor is always "today" at the moment it's needed
 * rather than whenever this module first happened to load. */
export function defaultSchedule(): WorkSchedule {
  return {
    mode: "weekly",
    weeklyWorkDays: [true, true, true, true, true, false, false], // classic 5/2
    cycleWorkDays: 2,
    cycleRestDays: 2,
    cycleAnchor: todayKey(),
  };
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Whether the given date counts as a work day under the schedule. */
export function isWorkDay(schedule: WorkSchedule, date = new Date()): boolean {
  if (schedule.mode === "weekly") {
    const dow = (date.getDay() + 6) % 7; // JS getDay is Sunday-first; convert to Monday-first
    return schedule.weeklyWorkDays[dow] ?? false;
  }
  const cycleLen = schedule.cycleWorkDays + schedule.cycleRestDays;
  if (cycleLen <= 0) return false;
  const anchor = new Date(`${schedule.cycleAnchor}T00:00:00`);
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(anchor).getTime()) / 86_400_000,
  );
  const mod = ((diffDays % cycleLen) + cycleLen) % cycleLen;
  return mod < schedule.cycleWorkDays;
}

/**
 * Personalized hint for bodyweight-training quests: once the linked
 * personal record is set in "Тело", shows a real target rep count based on
 * recordPercent; otherwise falls back to the quest's default hint (no
 * personalization). Returns null for quests that aren't linked to a record.
 */
export function trainingHint(quest: Quest, body: BodyStats): string | null {
  if (!quest.linkedRecord || !quest.recordPercent) return null;
  const max = body[quest.linkedRecord];
  if (!max) return quest.trainingDefaultHint ?? "Сделай 3 подхода в комфортном темпе";
  const target = Math.max(1, Math.round(max * quest.recordPercent));
  const pct = Math.round(quest.recordPercent * 100);
  return `Сделай 3 подхода по ${pct}% от твоего максимума — это ${target} повторений за подход`;
}

/**
 * Applies the Work/Day-off lightening to a single quest for display: while
 * workMode is on, a quest with workModeTitle set shows the lightened
 * title/reward instead of the full one. Purely presentational — the
 * underlying quest record (and its reward on completion) uses whatever was
 * effective at the moment of completion.
 */
export function effectiveQuest(quest: Quest, workMode: boolean): Quest {
  if (!workMode || !quest.workModeTitle) return quest;
  return {
    ...quest,
    title: quest.workModeTitle,
    reward: quest.workModeReward ?? quest.reward,
  };
}

/**
 * Large pool of ready-made quest ideas, spread across all 4 stats and 3
 * rough difficulty bands (light 5-10 XP, medium 15-20, hard 25-30). This
 * used to be auto-rotated into "Ежедневные" every day; that auto-rotation
 * is gone (daily quests are now a purely user-curated list, same as
 * story/purchase — see createQuest and the removal of ensureDailyRotation)
 * so this pool now lives on as an OPTIONAL browsable catalog on the
 * "Сюжетные" tab (see index.tsx) — the user looks through it and taps
 * "Добавить в мои квесты" on whatever appeals, nothing is added on their
 * behalf automatically. A handful of entries are also flagged `starter:
 * true` — those double as the one-time new-account suggestion list for the
 * now-empty "Ежедневные" tab (see STARTER_QUEST_IDEAS/dailyOnboardingDismissed).
 */
export interface QuestIdeaTemplate {
  title: string;
  stat: StatKey;
  reward: number;
  requiresPhoto?: boolean;
  photoHint?: string;
  requiresText?: boolean;
  workModeTitle?: string;
  workModeReward?: number;
  // Marks a friction-free (no photo/text proof required) entry as one of the
  // ~8 suggestions offered to a brand-new account's empty "Ежедневные" tab.
  starter?: boolean;
}

export const QUEST_IDEA_POOL: QuestIdeaTemplate[] = [
  // ── Сила ──
  // NOTE: only one generic "stretch" quest lives in this pool — see
  // "Растяжка, йога или пилатес 15 минут" below — so it doesn't get
  // drawn twice in the same day's rotation under near-identical wording.
  // A standalone "Сделать разминку или растяжку 10 минут" quest used to
  // exist here too, and this entry's own work-day title used to be
  // "Короткая разминка/растяжка 5-10 минут" — i.e. two different pool
  // entries that could both surface as "do a stretch" on the same day.
  {
    title: "Мини-тренировка: отжимания, приседания или планка",
    stat: "strength",
    reward: 12,
    requiresPhoto: true,
    photoHint: "Фото после тренировки",
    workModeTitle: "Короткая мини-тренировка 5 минут: пара подходов",
    workModeReward: 8,
  },
  { title: "Сделать 30 приседаний", stat: "strength", reward: 8, starter: true },
  { title: "Планка 2 минуты — можно в несколько подходов", stat: "strength", reward: 10 },
  {
    title: "Прогулка быстрым шагом 20 минут",
    stat: "strength",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Фото с прогулки",
  },
  {
    title: "Полноценная силовая тренировка 40-60 минут",
    stat: "strength",
    reward: 28,
    requiresPhoto: true,
    photoHint: "Фото после тренировки",
    workModeTitle: "Короткая тренировка 15 минут",
    workModeReward: 15,
  },
  { title: "100 приседаний за день суммарно, в любое время", stat: "strength", reward: 20 },
  // Broadened beyond a gym-specific "тренировка" — yoga/pilates/dance are
  // just as legitimate a route to the same Сила stat, and the pool leaned
  // heavily on gym/sport-style examples before this.
  { title: "Растяжка, йога или пилатес 15 минут", stat: "strength", reward: 10 },
  { title: "Потанцевать под любимую музыку 15 минут", stat: "strength", reward: 8 },
  {
    title: "Подниматься по лестнице вместо лифта весь день",
    stat: "strength",
    reward: 6,
    starter: true,
  },
  { title: "Пройти 10000 шагов за день (по трекеру)", stat: "strength", reward: 20 },

  // ── Интеллект ──
  {
    title: "Почитать книгу 30 минут",
    stat: "intellect",
    reward: 10,
    requiresPhoto: true,
    photoHint: "Фото раскрытой книги",
    workModeTitle: "Почитать книгу 10-15 минут",
    workModeReward: 6,
  },
  {
    title: "Изучить один новый факт или урок по теме, которая интересна",
    stat: "intellect",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Скриншот статьи/видео/заметки",
  },
  {
    title: "Пройти урок на образовательной платформе",
    stat: "intellect",
    reward: 18,
    starter: true,
  },
  { title: "Написать план на неделю по одной из своих целей", stat: "intellect", reward: 15 },
  {
    title: "Посмотреть обучающее видео 20 минут и законспектировать",
    stat: "intellect",
    reward: 15,
  },
  {
    title: "Решить 5 логических задач или головоломок",
    stat: "intellect",
    reward: 10,
    starter: true,
  },
  {
    title: "Выучить новое слово на иностранном языке и повторить 10 раз",
    stat: "intellect",
    reward: 8,
  },
  {
    title: "Прочитать статью по теме саморазвития и выписать 3 идеи",
    stat: "intellect",
    reward: 12,
    requiresText: true,
  },
  {
    title: "Провести час глубокой работы без соцсетей (deep work)",
    stat: "intellect",
    reward: 25,
    workModeTitle: "Провести 25 минут глубокой работы без соцсетей",
    workModeReward: 15,
  },
  {
    title: "Разобрать и систематизировать заметки/файлы на компьютере",
    stat: "intellect",
    reward: 15,
  },

  // ── Воля ──
  {
    title: "Привести в порядок своё пространство (стол, комната)",
    stat: "will",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Фото убранного пространства",
  },
  {
    title: "Гигиена: душ, чистка зубов, уход за собой",
    stat: "will",
    reward: 6,
    requiresPhoto: true,
    photoHint: "Селфи-подтверждение",
  },
  {
    title: "Встать без повторного будильника («ещё 5 минут»)",
    stat: "will",
    reward: 8,
    starter: true,
  },
  { title: "Провести время после 21:00 без соцсетей", stat: "will", reward: 15 },
  {
    title: "Сделать то дело, которое откладываешь уже неделю",
    stat: "will",
    reward: 28,
    requiresText: true,
  },
  { title: "Помедитировать 10 минут", stat: "will", reward: 10, starter: true },
  { title: "Заполнить дневник или трекер привычек", stat: "will", reward: 6 },
  {
    title: "Приготовить еду самостоятельно, а не заказать",
    stat: "will",
    reward: 15,
    requiresPhoto: true,
    photoHint: "Фото готового блюда",
  },
  { title: "Лечь спать до полуночи", stat: "will", reward: 10 },
  {
    title: "Генеральная уборка одной зоны — шкаф, ящик или кухня",
    stat: "will",
    reward: 20,
    requiresPhoto: true,
    photoHint: "Фото результата",
  },

  // ── Харизма ──
  {
    title: "Выпить 2 литра воды за день",
    stat: "appearance",
    reward: 5,
    requiresPhoto: true,
    photoHint: "Фото бутылки воды или трекера",
  },
  {
    title: "Уход за кожей лица (умыться, увлажнить)",
    stat: "appearance",
    reward: 6,
    requiresPhoto: true,
    photoHint: "Селфи-подтверждение",
  },
  {
    title: "Сделать причёску/укладку, даже если никуда не идёшь",
    stat: "appearance",
    reward: 8,
    starter: true,
  },
  {
    title: "Погладить или подготовить одежду на завтра",
    stat: "appearance",
    reward: 6,
    starter: true,
  },
  {
    title: "Подобрать образ, в котором чувствуешь себя уверенно",
    stat: "appearance",
    reward: 10,
    requiresPhoto: true,
    photoHint: "Селфи в образе",
  },
  {
    title: "Полноценный уход: маска для лица или волос",
    stat: "appearance",
    reward: 15,
    requiresPhoto: true,
    photoHint: "Фото во время ухода",
  },
  { title: "Почистить обувь или привести в порядок гардероб", stat: "appearance", reward: 12 },
];

/**
 * The ~8 friction-free QUEST_IDEA_POOL entries (no photo/text proof
 * required) offered as one-click suggestions to a brand-new account's empty
 * "Ежедневные" tab — see index.tsx's DailyOnboardingPrompt and
 * dailyOnboardingDismissed. Two per stat, so the suggestion list isn't
 * lopsided toward any one characteristic.
 */
export const STARTER_QUEST_IDEAS: QuestIdeaTemplate[] = QUEST_IDEA_POOL.filter((t) => t.starter);

/**
 * Turns a QUEST_IDEA_POOL entry into a real quest the user now owns —
 * used both by the one-time daily-suggestion prompt (category "daily") and
 * the "Сюжетные" idea catalog's "Добавить в мои квесты" button (category
 * "story"). Daily quests are always mandatory (see createQuest); work-mode
 * lightening only carries over for daily quests — a one-off story goal
 * shouldn't change based on today's work schedule.
 */
export function createQuestFromIdea(
  template: QuestIdeaTemplate,
  category: "daily" | "story",
): Quest {
  return {
    id: uid(),
    createdAt: Date.now(),
    done: false,
    title: template.title,
    stat: template.stat,
    reward: template.reward,
    category,
    mandatory: category === "daily" ? true : undefined,
    requiresPhoto: template.requiresPhoto,
    photoHint: template.photoHint,
    requiresText: template.requiresText,
    ...(category === "daily"
      ? { workModeTitle: template.workModeTitle, workModeReward: template.workModeReward }
      : {}),
  };
}

/**
 * Resets any daily quest completed on a PREVIOUS day back to not-done, for
 * today. Daily quests are a static, user-curated list now (see createQuest)
 * rather than getting fresh ids drawn every day the old auto-rotation used
 * to hand out — that rotation was actually what made a completed daily
 * quest "disappear" at midnight, so removing it without this function would
 * leave every daily quest permanently stuck at "done" forever after its
 * first completion. Uses Quest.lastResetDate (set by completeQuest in
 * index.tsx) to tell "done today" apart from "done on some earlier day".
 * A no-op (returns the same state) when nothing needs resetting, so this is
 * cheap to call on every tick of the periodic effect in index.tsx.
 */
export function ensureDailyQuestsReset(state: GameState): GameState {
  const today = todayKey();
  const needsReset = state.quests.some(
    (q) => q.category === "daily" && q.done && q.lastResetDate !== today,
  );
  // Shop-postponed quests whose target date has arrived (or passed) go back
  // to being a normal, visible, mandatory quest again.
  const needsUnpostpone = state.quests.some((q) => q.postponedUntil && q.postponedUntil <= today);
  if (!needsReset && !needsUnpostpone) return state;
  return {
    ...state,
    quests: state.quests.map((q) => {
      let next = q;
      if (q.category === "daily" && q.done && q.lastResetDate !== today) {
        next = {
          ...next,
          done: false,
          completedAt: undefined,
          proofNote: undefined,
          photoPath: undefined,
          lastResetDate: today,
        };
      }
      if (next.postponedUntil && next.postponedUntil <= today) {
        next = { ...next, postponedUntil: undefined };
      }
      return next;
    }),
  };
}

export const POSTPONE_PRICE_GOLD = 15;
export const POSTPONE_DAILY_LIMIT = 2;

export function postponesUsedToday(state: GameState): number {
  return state.postponesUsed[todayKey()] ?? 0;
}

export function canPostponeQuest(state: GameState, questId: string): boolean {
  const q = state.quests.find((qq) => qq.id === questId);
  if (!q || q.category !== "daily" || q.done) return false;
  if (isQuestPostponedOn(q, todayKey())) return false;
  if (state.gold < POSTPONE_PRICE_GOLD) return false;
  if (postponesUsedToday(state) >= POSTPONE_DAILY_LIMIT) return false;
  return true;
}

/**
 * "Отложить квест на завтра" (Shop): removes a specific daily quest from
 * today's list at the cost of gold, WITHOUT counting against today's
 * discipline requirement and WITHOUT granting any XP/gold for it — it just
 * reappears tomorrow like normal. Capped per day (POSTPONE_DAILY_LIMIT) so
 * it stays an occasional escape valve, not a way to skip quests entirely.
 */
export function postponeQuest(state: GameState, questId: string): GameState {
  if (!canPostponeQuest(state, questId)) return state;
  const today = todayKey();
  const tomorrow = todayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  return {
    ...state,
    gold: state.gold - POSTPONE_PRICE_GOLD,
    postponesUsed: { ...state.postponesUsed, [today]: postponesUsedToday(state) + 1 },
    quests: state.quests.map((q) => (q.id === questId ? { ...q, postponedUntil: tomorrow } : q)),
  };
}

/**
 * Records today's mandatory daily-quest count once per day (if not already
 * recorded), purely so FUTURE days can look back at what "today" required
 * even after the user goes on to add/remove daily quests. Today's own
 * requirement is always read live instead (see mandatoryCountFor) — this
 * function never touches state.quests itself, unlike the old auto-rotation
 * it replaces.
 */
export function ensureDailyMandatoryCount(state: GameState): GameState {
  const today = todayKey();
  if (state.dailyMandatoryCounts[today] != null) return state;
  const count = state.quests.filter((q) => q.category === "daily" && q.mandatory).length;
  return { ...state, dailyMandatoryCounts: { ...state.dailyMandatoryCounts, [today]: count } };
}

/**
 * A rolling 30-day "season" — a fresh XP/quest counter layered on top of
 * overall progress, purely to give short-term goals against the fatigue of
 * an otherwise-unchanging quest list. Overall hero level/totalXp/stats are
 * never touched by a season rolling over — see ensureSeason() below.
 */
export interface SeasonState {
  seasonNumber: number;
  startedAt: number;
  xp: number;
  questsCompleted: number;
}

export interface SeasonSummary {
  seasonNumber: number;
  xp: number;
  questsCompleted: number;
  badgeUnlocked: boolean;
  endedAt: number;
}

export const SEASON_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Season XP needed to unlock the season's cosmetic badge. A fully engaged
 * day (all dailies + a bonus/story quest) earns roughly 70-120 season XP,
 * so 800 meant the badge — meant to reward sustained effort across the
 * whole 30-day season — could fall in a single very active day (~1/3 of it
 * in one sitting, per report). Raised so it takes on the order of 20+ days
 * of typical activity at that pace, i.e. most of the season played
 * consistently rather than one binge day, while staying reachable without
 * requiring literally every single day.
 */
export const SEASON_BADGE_XP_TARGET = 1800;

/** Cosmetic badge icons, one per season, cycling if a player outlasts the list. */
const SEASON_BADGE_ICONS = ["🏵️", "🎖️", "🏆", "🥇", "💠", "🔶", "🌟"];

export function seasonBadgeIcon(seasonNumber: number): string {
  return SEASON_BADGE_ICONS[(seasonNumber - 1) % SEASON_BADGE_ICONS.length];
}

export function defaultSeason(): SeasonState {
  return { seasonNumber: 1, startedAt: Date.now(), xp: 0, questsCompleted: 0 };
}

/**
 * Rolls the season over once SEASON_DURATION_MS has elapsed since it
 * started: records a one-time summary (xp earned, quests completed,
 * whether the cosmetic badge was reached) for the results screen, then
 * starts a fresh season with a clean counter. Only ever touches
 * state.season/lastSeasonSummary/seasonSummarySeen — nothing else.
 */
export function ensureSeason(state: GameState): GameState {
  const elapsed = Date.now() - state.season.startedAt;
  if (elapsed < SEASON_DURATION_MS) return state;

  const summary: SeasonSummary = {
    seasonNumber: state.season.seasonNumber,
    xp: state.season.xp,
    questsCompleted: state.season.questsCompleted,
    badgeUnlocked: state.season.xp >= SEASON_BADGE_XP_TARGET,
    endedAt: state.season.startedAt + SEASON_DURATION_MS,
  };

  return {
    ...state,
    season: {
      seasonNumber: state.season.seasonNumber + 1,
      startedAt: Date.now(),
      xp: 0,
      questsCompleted: 0,
    },
    lastSeasonSummary: summary,
    seasonSummarySeen: false,
  };
}

/** Local pool of light bonus quests, drawn from when no daily quests remain today. */
export interface BonusQuestTemplate {
  title: string;
  stat: StatKey;
  reward: number;
}

export const BONUS_QUEST_POOL: BonusQuestTemplate[] = [
  { title: "Сделай 5-минутную растяжку глаз", stat: "will", reward: 5 },
  { title: "Позвони близкому человеку", stat: "will", reward: 8 },
  { title: "Приберись на рабочем столе 10 минут", stat: "will", reward: 6 },
  { title: "Сделай 20 приседаний прямо сейчас", stat: "strength", reward: 6 },
  { title: "Выпиши 3 вещи, за которые благодарен сегодня", stat: "intellect", reward: 6 },
  { title: "Послушай подкаст или лекцию 10 минут", stat: "intellect", reward: 8 },
  { title: "Завари чай осознанно, без телефона в руках", stat: "appearance", reward: 5 },
  { title: "Прогуляйся на свежем воздухе 10 минут", stat: "strength", reward: 8 },
  { title: "Разбери 10 старых фото в галерее телефона", stat: "will", reward: 5 },
  { title: "Напиши список дел на завтра", stat: "intellect", reward: 6 },
  // Replaced "Сделай себе комплимент перед зеркалом" — a vague affirmation
  // with nothing to actually do or check — with a genuine short grooming
  // habit, matching the concrete, actionable pattern of the other
  // appearance-stat entries here (Завари чай осознанно, Полей цветы).
  {
    title: "Сделай короткий уходовый ритуал: умойся и нанеси крем осознанно",
    stat: "appearance",
    reward: 5,
  },
  { title: "Проветри комнату 10 минут", stat: "will", reward: 5 },
  { title: "Сделай 10 глубоких осознанных вдохов-выдохов", stat: "will", reward: 5 },
  { title: "Полей цветы или приберись у растений", stat: "appearance", reward: 5 },
  { title: "Наведи порядок в закладках браузера 10 минут", stat: "intellect", reward: 6 },
];

const BONUS_REWARD_MULTIPLIER = 1.5;

/**
 * Ensures today's bonus-quest set is up to date: draws 2-3 random quests
 * from BONUS_QUEST_POOL (rewarded at 1.5x) once every daily quest is done,
 * and clears them out for a new day otherwise. Regenerating only once per
 * day (tracked via bonusQuestsDate) means completing/reopening quests during
 * the same day doesn't reshuffle the bonus set under the user.
 */
export function ensureBonusQuests(state: GameState): GameState {
  const today = todayKey();
  const dailyQuests = state.quests.filter((q) => q.category === "daily");
  const allDailyDone = dailyQuests.length > 0 && dailyQuests.every((q) => q.done);

  if (!allDailyDone) {
    if (state.bonusQuestsDate === today && state.bonusQuests.length === 0) return state;
    return { ...state, bonusQuests: [], bonusQuestsDate: today };
  }

  if (state.bonusQuestsDate === today && state.bonusQuests.length > 0) return state;

  const shuffled = [...BONUS_QUEST_POOL].sort(() => Math.random() - 0.5);
  const count = 2 + Math.round(Math.random()); // 2 or 3
  const now = Date.now();
  const bonusQuests: Quest[] = shuffled.slice(0, count).map((t) => ({
    id: uid(),
    title: t.title,
    stat: t.stat,
    reward: Math.round(t.reward * BONUS_REWARD_MULTIPLIER),
    category: "daily",
    done: false,
    createdAt: now,
    bonus: true,
  }));
  return { ...state, bonusQuests, bonusQuestsDate: today };
}

/** One suggested idea for the "🎲 Случайная цель" roller on "Крупные цели". */
export interface BigGoalIdea {
  title: string;
  stat: StatKey;
  reward: number;
}

/**
 * Diverse pool of big-goal suggestions for the "🎲 Случайная цель" button
 * on "Крупные цели" (see RandomGoalRoller/index.tsx and randomBigGoalIdea
 * below). Deliberately spans several kinds of goal — purchases, financial
 * targets, personal projects, learning — not just shopping, since the tab
 * itself covers any big one-off personal goal (see CATEGORY_META.purchase).
 * Same privacy rule as seedQuests(): generic only, nothing personal/specific
 * to any one account, since this ships in the public bundle for every user.
 */
export const BIG_GOAL_IDEAS: BigGoalIdea[] = [
  // ── Финансы ──
  { title: "Накопить $500 на отдельный сберегательный счёт", stat: "will", reward: 40 },
  {
    title: "Составить подробный бюджет на месяц и придерживаться его",
    stat: "intellect",
    reward: 25,
  },
  { title: "Полностью погасить один мелкий долг или рассрочку", stat: "will", reward: 40 },
  {
    title: "Настроить автоматический перевод 10% дохода в сбережения",
    stat: "intellect",
    reward: 20,
  },
  { title: "Разобрать и оптимизировать все текущие подписки", stat: "intellect", reward: 15 },
  {
    title: "Провести полную ревизию расходов за 3 месяца и найти точки экономии",
    stat: "intellect",
    reward: 25,
  },
  { title: "Оформить страхование здоровья или жизни", stat: "intellect", reward: 20 },
  {
    title: "Сделать первый шаг в инвестициях — открыть счёт и вложить небольшую сумму осознанно",
    stat: "intellect",
    reward: 40,
  },
  { title: "Создать подушку безопасности на 3 месяца расходов", stat: "will", reward: 45 },

  // ── Покупки ──
  { title: "Купить качественную куртку взамен старой", stat: "appearance", reward: 20 },
  { title: "Обновить рабочее кресло на более эргономичное", stat: "will", reward: 25 },
  { title: "Купить надёжный рюкзак для путешествий", stat: "appearance", reward: 15 },
  { title: "Заменить старый матрас на новый", stat: "will", reward: 30 },
  { title: "Собрать капсульный гардероб на сезон", stat: "appearance", reward: 25 },
  { title: "Обновить домашнюю рабочую зону под продуктивность", stat: "will", reward: 20 },
  { title: "Купить качественную обувь для спорта или ходьбы", stat: "strength", reward: 15 },

  // ── Обучение ──
  { title: "Пройти полный онлайн-курс по новой для себя теме", stat: "intellect", reward: 35 },
  { title: "Сдать экзамен на сертификат в своей области", stat: "intellect", reward: 40 },
  { title: "Освоить базовый уровень нового языка программирования", stat: "intellect", reward: 35 },
  { title: "Прочитать 5 книг по выбранной теме за квартал", stat: "intellect", reward: 30 },
  { title: "Начать изучать новый иностранный язык", stat: "intellect", reward: 25 },
  {
    title: "Сдать международный языковой экзамен (например IELTS/TOEFL)",
    stat: "intellect",
    reward: 45,
  },
  { title: "Освоить слепую печать на клавиатуре", stat: "intellect", reward: 20 },
  { title: "Пройти курс или тренинг по публичным выступлениям", stat: "will", reward: 30 },

  // ── Личные проекты ──
  { title: "Вести личный блог или канал 3 месяца подряд", stat: "will", reward: 35 },
  {
    title: "Написать и опубликовать одну статью на важную тебе тему",
    stat: "intellect",
    reward: 25,
  },
  {
    title: "Сделать генеральную уборку и разобрать вещи во всей квартире",
    stat: "will",
    reward: 30,
  },
  { title: "Организовать домашний архив документов", stat: "intellect", reward: 15 },
  { title: "Собрать личный сайт-портфолио", stat: "intellect", reward: 40 },
  { title: "Запустить небольшой побочный проект или подработку", stat: "will", reward: 40 },
  { title: "Разобрать и оцифровать старые фотографии и документы", stat: "intellect", reward: 20 },
  { title: "Научиться готовить 5 новых полноценных блюд с нуля", stat: "appearance", reward: 25 },

  // ── Карьера ──
  { title: "Обновить резюме и портфолио под свой текущий уровень", stat: "intellect", reward: 25 },
  {
    title: "Пройти собеседование на позицию мечты, даже тренировочное",
    stat: "will",
    reward: 30,
  },
  { title: "Найти наставника или ментора в своей области", stat: "intellect", reward: 30 },
  {
    title: "Подготовить и провести доклад или встречу внутри команды",
    stat: "will",
    reward: 35,
  },
  {
    title: "Освоить один новый рабочий инструмент или навык до уверенного уровня",
    stat: "intellect",
    reward: 30,
  },

  // ── Здоровье и активность ──
  { title: "Пробежать первые 5 км без остановки", stat: "strength", reward: 35 },
  { title: "Пробежать первые 10 км", stat: "strength", reward: 45 },
  { title: "Пройти полный медицинский чек-ап", stat: "will", reward: 25 },
  { title: "Записаться и начать заниматься в секции или зале", stat: "strength", reward: 20 },
  {
    title: "Закрыть давно отложенный визит к врачу (стоматолог, терапевт и т.д.)",
    stat: "will",
    reward: 30,
  },
  {
    title: "Освоить с нуля одно сложное силовое упражнение (подтягивание, отжимание на одной руке)",
    stat: "strength",
    reward: 35,
  },

  // ── Отношения и социальное ──
  {
    title: "Организовать встречу с друзьями, с которыми давно не виделись",
    stat: "appearance",
    reward: 20,
  },
  { title: "Написать благодарственное письмо важному для тебя человеку", stat: "will", reward: 15 },
  {
    title: "Помочь кому-то безвозмездно — волонтёрство или разовая помощь",
    stat: "will",
    reward: 25,
  },
  { title: "Провести целый день без телефона с близкими", stat: "will", reward: 20 },

  // ── Разное ──
  { title: "Провести неделю цифрового детокса по вечерам", stat: "will", reward: 30 },
  { title: "Довести до конца давно отложенное дело или проект", stat: "will", reward: 40 },
  { title: "Спланировать и забронировать поездку мечты", stat: "appearance", reward: 30 },
  { title: "Съездить в город или страну, где ещё не был", stat: "appearance", reward: 35 },
];

/** How many recently-shown BIG_GOAL_IDEAS titles to remember — see
 * randomBigGoalIdea/recordBigGoalShown. Persisted in GameState (not just
 * component state) so closing the roller and reopening it, or even
 * reloading the page, still won't immediately resurface something just
 * seen. Well under half the pool size, so there's always plenty left to
 * pick from. */
export const RECENT_BIG_GOALS_REMEMBERED = 8;

/**
 * Picks a random BIG_GOAL_IDEAS entry, excluding any titles in
 * excludeTitles (falls back to the full pool if that would exclude
 * everything, which can't actually happen at the current pool size but is
 * a cheap safety net either way).
 */
export function randomBigGoalIdea(excludeTitles: string[] = []): BigGoalIdea {
  const pool = BIG_GOAL_IDEAS.filter((i) => !excludeTitles.includes(i.title));
  const source = pool.length > 0 ? pool : BIG_GOAL_IDEAS;
  return source[Math.floor(Math.random() * source.length)];
}

/** Records that `title` was just shown by the roller, for randomBigGoalIdea's
 * exclusion list — most-recent-first, capped at RECENT_BIG_GOALS_REMEMBERED. */
export function recordBigGoalShown(state: GameState, title: string): GameState {
  const recent = [title, ...state.recentBigGoalTitles.filter((t) => t !== title)].slice(
    0,
    RECENT_BIG_GOALS_REMEMBERED,
  );
  return { ...state, recentBigGoalTitles: recent };
}

/**
 * Gold used to be granted 1:1 with a quest's XP reward, which meant a single
 * fully-completed day (~120+ XP across daily quests) bought the cheapest
 * Shop cosmetic (50-60 gold) same-day. Scaled down so gold accumulates
 * separately from XP/levels (which this deliberately leaves untouched):
 * at ~15 gold for a typical full day, the cheapest item takes ~3-5 days,
 * mid-rarity ~1-2 weeks, and epic items about a month — see shop.ts prices,
 * which were rebalanced to match this rate rather than the other way
 * around (changing one constant here beats re-tuning every price twice).
 */
export const GOLD_PER_XP = 0.15;

export function goldForReward(reward: number): number {
  return Math.max(1, Math.round(reward * GOLD_PER_XP));
}

export function applyReward(state: GameState, stat: StatKey, reward: number): GameState {
  const next = structuredClone(state);
  const s = next.stats[stat];
  s.xp += reward;
  while (s.xp >= 100) {
    s.xp -= 100;
    s.level += 1;
  }
  next.totalXp += reward;
  while (next.totalXp >= xpForNextLevel(next.level)) {
    next.level += 1;
  }
  next.completedCount += 1;
  next.gold += goldForReward(reward);
  next.season = {
    ...next.season,
    xp: next.season.xp + reward,
    questsCompleted: next.season.questsCompleted + 1,
  };
  return next;
}

/**
 * Exact inverse of applyReward() — used by the "Отменить" undo toast after
 * completing a quest. Both counters it touches are simple base-100
 * odometers (stat level+xp) or a pure function of one running total
 * (hero level from totalXp), so both can be recomputed precisely from the
 * reward amount alone — no snapshot of prior state needed.
 */
export function undoReward(state: GameState, stat: StatKey, reward: number): GameState {
  const next = structuredClone(state);
  const s = next.stats[stat];
  const combined = Math.max(0, s.level * 100 + s.xp - reward);
  s.level = Math.floor(combined / 100);
  s.xp = combined % 100;

  next.totalXp = Math.max(0, next.totalXp - reward);
  let level = 1;
  while (next.totalXp >= xpForNextLevel(level)) level += 1;
  next.level = level;

  next.completedCount = Math.max(0, next.completedCount - 1);
  next.gold = Math.max(0, next.gold - goldForReward(reward));
  next.season = {
    ...next.season,
    xp: Math.max(0, next.season.xp - reward),
    questsCompleted: Math.max(0, next.season.questsCompleted - 1),
  };
  return next;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Number of mandatory daily quests "assigned" on a given date. For today,
 * always reads the LIVE current count — daily quests are the user's own
 * static, hand-curated list now (see createQuest/QUEST_IDEA_POOL), so if
 * they add or remove one partway through the day, today's discipline
 * requirement should reflect that immediately rather than staying frozen at
 * whatever it was that morning. For any earlier date, reads the recorded
 * snapshot instead (dailyMandatoryCounts, filled in once per day by
 * ensureDailyMandatoryCount) since the user's current list may no longer
 * resemble what it was back then; dates from before this existed simply
 * won't have an entry, so those fall back to today's current count too,
 * matching the old fixed-list behavior for historical data.
 */
export function mandatoryCountFor(state: GameState, dateKey: string): number {
  if (dateKey === todayKey()) {
    // Quests postponed to a later date (Shop → "Отложить квест") don't count
    // toward today's requirement — that's the whole point of postponing:
    // no discipline-calendar penalty for skipping them today.
    return state.quests.filter(
      (q) => q.category === "daily" && q.mandatory && !isQuestPostponedOn(q, dateKey),
    ).length;
  }
  const recorded = state.dailyMandatoryCounts[dateKey];
  if (recorded != null) return recorded;
  return state.quests.filter((q) => q.category === "daily" && q.mandatory).length;
}

/** True if a quest is currently postponed away from the given date (i.e. its
 * postponedUntil is still in the future relative to that date). */
export function isQuestPostponedOn(q: Quest, dateKey: string): boolean {
  return !!q.postponedUntil && q.postponedUntil > dateKey;
}

export interface DayStatus {
  date: string;
  status: "green" | "red" | "pending" | "future";
  dayNum: number;
}

/**
 * Resolves a single day's discipline status. Manual overrides (Settings →
 * calendar edit) are only ever consulted for days strictly before today —
 * today and future days always take the live automatic path, so editing the
 * past can never affect (or be used to game) the current day's real-time
 * tracking.
 */
function resolveDayStatus(
  state: GameState,
  dateKey: string,
  todayK: string,
  isFuture: boolean,
): DayStatus["status"] {
  if (isFuture) return "future";
  if (dateKey === todayK) return "pending";
  const override = state.manualDayOverrides[dateKey];
  if (override) return override;
  const assigned = mandatoryCountFor(state, dateKey);
  const done = state.dailyCompletions[dateKey] || [];
  return assigned > 0 && done.length >= assigned ? "green" : "red";
}

export function computeDiscipline(state: GameState) {
  const start = new Date(state.depositStartAt);
  start.setHours(0, 0, 0, 0);
  const days: DayStatus[] = [];
  const now = new Date();
  const todayK = todayKey();

  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = todayKey(d);
    const isFuture = d > now && k !== todayK;
    const status = resolveDayStatus(state, k, todayK, isFuture);
    days.push({ date: k, status, dayNum: d.getDate() });
  }
  const redCount = days.filter((d) => d.status === "red").length;
  const greenCount = days.filter((d) => d.status === "green").length;
  const progress = Math.max(0, 100 - redCount * 5);
  // "finished"/"lost" only mean anything for an actually-active deposit —
  // the 30-day calendar above still renders either way, it's just a general
  // discipline tracker independent of whether money is on the line.
  const finished =
    state.depositEnabled && Date.now() >= state.depositStartAt + depositDurationMs(state);
  const lost = finished && progress < 100;
  return { days, redCount, greenCount, progress, finished, lost };
}

/** Streak milestones that trigger a celebration when first reached. */
export const STREAK_MILESTONES = [7, 30, 100];

// ── Instant feedback ──
//
// Shown right after completing a physical (strength) quest or logging a
// nutrition entry that keeps the day within goal — deliberately QUALITATIVE
// only. No invented weight/muscle numbers: those would just be fiction (a
// single workout or meal doesn't measurably move body composition), and
// presenting a made-up figure as if it were real feedback would be
// misleading. Where a genuinely real number is available (an actual streak
// of days within the calorie goal — see computeNutritionStreak in
// nutrition.ts), that's shown as a plain factual detail line instead.

/** Randomly picked after completing a strength-stat quest (see completeQuest
 * in routes/index.tsx). Deliberately vague/qualitative — no specific
 * kg/reps/muscle-growth numbers, since a single quest can't actually
 * demonstrate a measurable physical change. */
export const TRAINING_FEEDBACK_MESSAGES: string[] = [
  "Отличная работа! Твои мышцы получили сигнал к росту 💪",
  "Ты на шаг ближе к своей цели",
  "Тело благодарит тебя за эту тренировку",
  "Дисциплина сегодня — результат завтра",
  "Каждое повторение считается",
  "Ты инвестируешь в свою лучшую версию",
  "Сила строится именно в такие моменты",
  "Прогресс не всегда виден сразу, но он копится",
  "Уверенно двигаешься к цели, так держать!",
];

/** Randomly picked after logging a nutrition entry that keeps today within
 * the calorie goal (see NutritionCalculator.tsx). Same rule as
 * TRAINING_FEEDBACK_MESSAGES — no predicted weight change, just qualitative
 * encouragement. */
export const NUTRITION_FEEDBACK_MESSAGES: string[] = [
  "Ты держишь курс на свою цель!",
  "Отличный выбор питания сегодня",
  "Питание в рамках цели — это уже победа",
  "Осознанный выбор — лучшая привычка",
  "Ты заботишься о себе, и это видно",
  "Ещё один день в правильном направлении",
  "Питание под контролем — отличная работа",
  "Стабильность — ключ к результату, и ты её держишь",
  "Так и продолжай — курс верный",
];

export function pickFeedbackMessage(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Weekly boss quest ──

function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function currentBossWeekKey(d = new Date()): string {
  return todayKey(mondayOf(d));
}

function emptyBossProgress(): BossQuestProgress {
  return {
    byStat: { strength: 0, intellect: 0, will: 0, appearance: 0 },
    byCategory: { daily: 0, story: 0, purchase: 0 },
    total: 0,
    activeDays: [],
  };
}

/**
 * Minimum number of distinct days a boss quest's completions must be spread
 * across before it can be claimed — stat_pair/quest_count/category_focus
 * only ever counted a raw total, so a single very productive day (all
 * dailies + several custom/story quests) could clear the whole week's
 * exclusive challenge in one sitting. streak_hold/combo/perfect_week don't
 * need this: a multi-day streak is already impossible to build in one day.
 */
function minActiveDaysForBoss(bq: BossQuest): number {
  switch (bq.kind) {
    case "stat_pair":
    case "quest_count":
      return 3;
    case "category_focus":
      return bq.category === "daily" ? 3 : 2;
    default:
      return 0;
  }
}

/** ISO-8601 week-of-year number (1-53) — used purely for the human-readable
 * "Босс недели №N" label in Hall of Fame, not for any date math. */
function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function rewardGold(difficulty: number): number {
  // Same scaling as before (see GOLD_PER_XP) — just generalized to a
  // difficulty scalar instead of a fixed sum-of-target-counts.
  return Math.max(1, Math.round(difficulty * 10 * GOLD_PER_XP));
}
function rewardXp(difficulty: number): number {
  return difficulty * 8;
}

const BOSS_QUEST_KINDS: BossQuestKind[] = [
  "stat_pair",
  "quest_count",
  "streak_hold",
  "combo",
  "category_focus",
  "perfect_week",
];

/** Picks one of 6 challenge templates at random each Monday for variety —
 * ranges are kept modest on purpose so the weekly challenge stays reachable
 * through normal quest completion rather than requiring a grind. */
export function generateBossQuest(weekKey: string, weekStartMs: number): BossQuest {
  const kind = BOSS_QUEST_KINDS[Math.floor(Math.random() * BOSS_QUEST_KINDS.length)];
  const base = {
    weekKey,
    weekStartMs,
    progress: emptyBossProgress(),
    claimed: false,
  };

  switch (kind) {
    case "stat_pair": {
      const shuffled = [...STAT_ORDER].sort(() => Math.random() - 0.5);
      const targets: BossQuestTarget[] = shuffled.slice(0, 2).map((stat) => ({
        stat,
        count: 4 + Math.floor(Math.random() * 4), // 4-7
      }));
      const difficulty = targets.reduce((sum, t) => sum + t.count, 0);
      return {
        ...base,
        kind,
        targets,
        title: `Испытание недели: ${targets.map((t) => `${t.count}× ${STAT_META[t.stat].label}`).join(" + ")}`,
        description: "Заверши указанное число квестов по каждой характеристике за неделю.",
        goldReward: rewardGold(difficulty),
        xpReward: rewardXp(difficulty),
      };
    }
    case "quest_count": {
      const questCount = 10 + Math.floor(Math.random() * 6); // 10-15
      return {
        ...base,
        kind,
        questCount,
        title: `Испытание недели: ${questCount} квестов`,
        description: `Заверши ${questCount} любых квестов за неделю.`,
        goldReward: rewardGold(questCount),
        xpReward: rewardXp(questCount),
      };
    }
    case "streak_hold": {
      const streakDays = 4 + Math.floor(Math.random() * 3); // 4-6
      return {
        ...base,
        kind,
        streakDays,
        title: `Испытание недели: серия ${streakDays} дней`,
        description: `Удержи серию полностью закрытых дней не короче ${streakDays} дней подряд.`,
        goldReward: rewardGold(streakDays * 3),
        xpReward: rewardXp(streakDays * 3),
      };
    }
    case "combo": {
      const questCount = 6 + Math.floor(Math.random() * 5); // 6-10
      const streakDays = 3 + Math.floor(Math.random() * 3); // 3-5
      return {
        ...base,
        kind,
        questCount,
        streakDays,
        title: `Испытание недели: ${questCount} квестов + серия ${streakDays} дней`,
        description: `Заверши ${questCount} квестов за неделю И удержи серию не короче ${streakDays} дней подряд.`,
        goldReward: rewardGold(questCount + streakDays * 3),
        xpReward: rewardXp(questCount + streakDays * 3),
      };
    }
    case "category_focus": {
      const categories: QuestCategory[] = ["daily", "story", "purchase"];
      const category = categories[Math.floor(Math.random() * categories.length)];
      // Daily quests get completed far more often than story/purchase ones,
      // so the target count is scaled per category to stay equally reachable.
      const categoryCount =
        category === "daily"
          ? 12 + Math.floor(Math.random() * 8)
          : 2 + Math.floor(Math.random() * 3);
      return {
        ...base,
        kind,
        category,
        categoryCount,
        title: `Испытание недели: ${categoryCount}× ${CATEGORY_META[category].label}`,
        description: `Заверши ${categoryCount} квестов категории «${CATEGORY_META[category].label}» за неделю.`,
        goldReward: rewardGold(categoryCount * (category === "daily" ? 1 : 4)),
        xpReward: rewardXp(categoryCount * (category === "daily" ? 1 : 4)),
      };
    }
    case "perfect_week":
      return {
        ...base,
        kind,
        title: "Испытание недели: идеальная неделя",
        description: "Заверши ВСЕ ежедневные квесты каждый день этой недели без единого пропуска.",
        goldReward: rewardGold(25),
        xpReward: rewardXp(25),
      };
  }
}

function dateKeyToLocalMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function emptyWeekStats(weekKey: string): WeekStats {
  return {
    weekKey,
    byCategory: { daily: 0, story: 0, purchase: 0 },
    totalQuests: 0,
    goldEarned: 0,
    xpEarned: 0,
    perDay: {},
  };
}

function snapshotWeeklyReport(
  stats: WeekStats,
  weekStartMs: number,
  bossQuest: BossQuest | null,
): WeeklyReport {
  let bestDay: { dateKey: string; count: number } | null = null;
  for (const [dateKey, count] of Object.entries(stats.perDay)) {
    if (count > 0 && (!bestDay || count > bestDay.count)) bestDay = { dateKey, count };
  }
  // Only credit the boss quest to this report if it actually belonged to the
  // week being snapshotted — ensureWeekRollover always calls this BEFORE
  // replacing bossQuest, so this is the outgoing week's boss quest.
  const bossForWeek = bossQuest && bossQuest.weekKey === stats.weekKey ? bossQuest : null;
  return {
    weekKey: stats.weekKey,
    weekNumber: isoWeekNumber(new Date(weekStartMs)),
    generatedAt: Date.now(),
    byCategory: stats.byCategory,
    totalQuests: stats.totalQuests,
    goldEarned: stats.goldEarned,
    xpEarned: stats.xpEarned,
    bossQuestWon: !!bossForWeek?.claimed,
    bossQuestTitle: bossForWeek?.title ?? null,
    bestDay,
  };
}

/** Cap on stored WeeklyReports — plenty for browsing history without the
 * save growing unbounded forever. */
const MAX_WEEKLY_REPORTS = 52;

/**
 * Advances both the weekly boss quest AND the weekly report system together
 * — they roll over on the exact same boundary, so one function keeps that in
 * sync in one place. On a genuine week change: snapshots the just-ended
 * week's WeekStats (+ its boss quest's outcome) into a permanent
 * WeeklyReport, flips weeklyReportSeen so the "Итоги недели" screen shows
 * once, resets WeekStats for the new week, and generates a fresh boss quest
 * (also regenerating if the stored one predates the kind-based redesign —
 * see generateBossQuest). No penalty either way, per spec. Cheap no-op
 * otherwise — safe to call on every tick of the periodic effect in
 * index.tsx.
 */
export function ensureWeekRollover(state: GameState): GameState {
  const weekKey = currentBossWeekKey();
  const bossOk = !!(state.bossQuest && state.bossQuest.weekKey === weekKey && state.bossQuest.kind);
  const statsOk = state.weekStats.weekKey === weekKey;
  if (bossOk && statsOk) return state;

  const weekStartMs = mondayOf(new Date()).getTime();
  let next = state;

  if (!statsOk) {
    const prevWeekStartMs = dateKeyToLocalMs(state.weekStats.weekKey);
    const report = snapshotWeeklyReport(state.weekStats, prevWeekStartMs, state.bossQuest);
    next = {
      ...next,
      weeklyReports: [report, ...next.weeklyReports].slice(0, MAX_WEEKLY_REPORTS),
      weeklyReportSeen: false,
      weekStats: emptyWeekStats(weekKey),
    };
  }
  if (!bossOk) {
    next = { ...next, bossQuest: generateBossQuest(weekKey, weekStartMs) };
  }
  return next;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Every date key (YYYY-MM-DD) from this boss quest's Monday up to and
 * including today — used by the perfect_week template, which can only ever
 * become "complete" once the full week (7 entries) has been evaluated. */
function daysThisWeekSoFar(weekStartMs: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: string[] = [];
  for (let d = new Date(weekStartMs); d <= today; d = new Date(d.getTime() + MS_PER_DAY)) {
    days.push(todayKey(d));
  }
  return days;
}

/** Live-computed progress bars + completion status for the current boss
 * quest — computed fresh from durable state each time rather than requiring
 * incremental tracking for every dimension. stat_pair/quest_count/
 * category_focus read the incremental `progress` bucket (kept in sync by
 * registerQuestActivity, since a quest's stat/category can't always be
 * recovered after the fact); streak_hold/combo/perfect_week read
 * computeStreak()/isDayFullyDone() directly, since "current streak" is
 * already a live concept. */
export function computeBossQuestStatus(state: GameState, bq: BossQuest): BossQuestStatus {
  switch (bq.kind) {
    case "stat_pair": {
      const statBars = (bq.targets ?? []).map((t) => ({
        label: STAT_META[t.stat].label,
        current: Math.min(bq.progress.byStat[t.stat] ?? 0, t.count),
        target: t.count,
      }));
      const minDays = minActiveDaysForBoss(bq);
      const daysCurrent = Math.min((bq.progress.activeDays ?? []).length, minDays);
      const statsComplete = statBars.length > 0 && statBars.every((b) => b.current >= b.target);
      return {
        complete: statsComplete && daysCurrent >= minDays,
        bars: [
          ...statBars,
          { label: "Разных дней с прогрессом", current: daysCurrent, target: minDays },
        ],
      };
    }
    case "quest_count": {
      const target = bq.questCount ?? 0;
      const current = Math.min(bq.progress.total, target);
      const minDays = minActiveDaysForBoss(bq);
      const daysCurrent = Math.min((bq.progress.activeDays ?? []).length, minDays);
      return {
        complete: current >= target && daysCurrent >= minDays,
        bars: [
          { label: "Квестов выполнено", current, target },
          { label: "Разных дней с прогрессом", current: daysCurrent, target: minDays },
        ],
      };
    }
    case "streak_hold": {
      const target = bq.streakDays ?? 0;
      const current = Math.min(computeStreak(state), target);
      return {
        complete: current >= target,
        bars: [{ label: "Серия дней подряд", current, target }],
      };
    }
    case "combo": {
      const qTarget = bq.questCount ?? 0;
      const sTarget = bq.streakDays ?? 0;
      const qCurrent = Math.min(bq.progress.total, qTarget);
      const sCurrent = Math.min(computeStreak(state), sTarget);
      return {
        complete: qCurrent >= qTarget && sCurrent >= sTarget,
        bars: [
          { label: "Квестов выполнено", current: qCurrent, target: qTarget },
          { label: "Серия дней подряд", current: sCurrent, target: sTarget },
        ],
      };
    }
    case "category_focus": {
      const target = bq.categoryCount ?? 0;
      const current = Math.min(
        bq.category ? (bq.progress.byCategory[bq.category] ?? 0) : 0,
        target,
      );
      const minDays = minActiveDaysForBoss(bq);
      const daysCurrent = Math.min((bq.progress.activeDays ?? []).length, minDays);
      return {
        complete: current >= target && daysCurrent >= minDays,
        bars: [
          {
            label: bq.category ? `${CATEGORY_META[bq.category].label}: завершено` : "Завершено",
            current,
            target,
          },
          { label: "Разных дней с прогрессом", current: daysCurrent, target: minDays },
        ],
      };
    }
    case "perfect_week": {
      const days = daysThisWeekSoFar(bq.weekStartMs);
      const doneDays = days.filter((k) => isDayFullyDone(state, k)).length;
      return {
        complete: days.length >= 7 && doneDays === 7,
        bars: [{ label: "Идеальных дней", current: doneDays, target: 7 }],
      };
    }
  }
}

/**
 * Keeps BOTH the current boss quest's incremental progress bucket AND the
 * current week's WeekStats accumulator in sync with quest completions
 * (delta +1) and undos (delta -1). The two are tracked independently since
 * WeekStats needs real numbers even in weeks whose boss template doesn't
 * touch every category (e.g. a streak_hold week shouldn't leave "Итоги
 * недели" showing 0 quests completed). Doesn't grant the boss reward itself
 * — completion is checked separately by checkBossQuestCompletion, since
 * streak-based kinds can become complete without any quest-completion event
 * at all (a day just ticking over).
 */
export function registerQuestActivity(
  state: GameState,
  stat: StatKey,
  category: QuestCategory,
  reward: number,
  delta: number,
): GameState {
  let next = state;
  const today = todayKey();
  if (next.bossQuest && !next.bossQuest.claimed) {
    const bq = next.bossQuest;
    const prevActiveDays = bq.progress.activeDays ?? [];
    // Only ADD today on a real completion (delta > 0) — an undo (delta < 0)
    // doesn't retroactively un-spread the challenge across days, since that
    // would let someone game the day-count back down and re-farm it.
    const activeDays =
      delta > 0 && !prevActiveDays.includes(today) ? [...prevActiveDays, today] : prevActiveDays;
    const progress: BossQuestProgress = {
      byStat: {
        ...bq.progress.byStat,
        [stat]: Math.max(0, (bq.progress.byStat[stat] ?? 0) + delta),
      },
      byCategory: {
        ...bq.progress.byCategory,
        [category]: Math.max(0, (bq.progress.byCategory[category] ?? 0) + delta),
      },
      total: Math.max(0, bq.progress.total + delta),
      activeDays,
    };
    next = { ...next, bossQuest: { ...bq, progress } };
  }

  const ws = next.weekStats;
  const weekStats: WeekStats = {
    ...ws,
    byCategory: {
      ...ws.byCategory,
      [category]: Math.max(0, (ws.byCategory[category] ?? 0) + delta),
    },
    totalQuests: Math.max(0, ws.totalQuests + delta),
    goldEarned: Math.max(0, ws.goldEarned + delta * goldForReward(reward)),
    xpEarned: Math.max(0, ws.xpEarned + delta * reward),
    perDay: { ...ws.perDay, [today]: Math.max(0, (ws.perDay[today] ?? 0) + delta) },
  };
  return { ...next, weekStats };
}

/**
 * Checks the current boss quest against its live-computed status and, the
 * instant it's complete, grants the XP/gold reward, unlocks the exclusive
 * frame + title (only the very first time ANY boss quest is ever won — see
 * BOSS_EXCLUSIVE_FRAME_ID/BOSS_EXCLUSIVE_TITLE_ID), and logs a permanent
 * Hall of Fame entry (every win, not just the first). Marks `claimed` so it
 * can never grant twice. Safe to call on every tick of the periodic effect
 * in index.tsx, same as ensureWeekRollover.
 */
export function checkBossQuestCompletion(state: GameState): GameState {
  const bq = state.bossQuest;
  if (!bq || bq.claimed) return state;
  const status = computeBossQuestStatus(state, bq);
  if (!status.complete) return state;

  const next: GameState = { ...state, bossQuest: { ...bq, claimed: true } };
  next.totalXp += bq.xpReward;
  while (next.totalXp >= xpForNextLevel(next.level)) next.level += 1;
  next.gold += bq.goldReward;

  const weekNumber = isoWeekNumber(new Date(bq.weekStartMs));
  next.bossWins = [
    { weekKey: bq.weekKey, weekNumber, title: bq.title, wonAt: Date.now() },
    ...next.bossWins,
  ];

  if (!next.unlockedFrames.includes(BOSS_EXCLUSIVE_FRAME_ID)) {
    next.unlockedFrames = [...next.unlockedFrames, BOSS_EXCLUSIVE_FRAME_ID];
  }
  if (!next.unlockedTitles.includes(BOSS_EXCLUSIVE_TITLE_ID)) {
    next.unlockedTitles = [...next.unlockedTitles, BOSS_EXCLUSIVE_TITLE_ID];
  }
  return next;
}

/**
 * True if every mandatory daily quest was completed on the given date.
 * Compares the count of completed daily quest ids against the number
 * assigned that day (see mandatoryCountFor) rather than matching exact ids,
 * since rotated daily quests get fresh ids every day.
 */
export function isDayFullyDone(state: GameState, dateKey: string): boolean {
  // A manual override for a past day (backfilling a forgotten log entry)
  // counts exactly like the real thing here too, so the streak stays
  // consistent with what the calendar shows. Never consulted for today —
  // callers pass today's key while it's still "pending", which isn't in
  // manualDayOverrides anyway since edits are blocked for today/future.
  const override = state.manualDayOverrides[dateKey];
  if (override) return override === "green";
  const assigned = mandatoryCountFor(state, dateKey);
  if (assigned === 0) return false;
  const done = state.dailyCompletions[dateKey] || [];
  return done.length >= assigned;
}

/**
 * Applies (or clears, with status=null) a manual discipline-day override.
 * Hard-guarded to strictly-past dates — attempting to edit today or a future
 * date is a no-op, so this can't be used to shortcut the live automatic
 * tracking no matter what the UI does.
 */
export function setManualDayOverride(
  state: GameState,
  dateKey: string,
  status: "green" | "red" | null,
): GameState {
  if (dateKey >= todayKey()) return state;
  const next = { ...state.manualDayOverrides };
  if (status === null) delete next[dateKey];
  else next[dateKey] = status;
  return { ...state, manualDayOverrides: next };
}

/**
 * Current streak of consecutive fully-completed days, counting backwards from
 * today over the full completion history (not capped to the deposit window).
 * Today counts once it's fully done; while today is still in progress it
 * neither adds to nor breaks the streak, so the run from yesterday is shown
 * until midnight.
 */
export function computeStreak(state: GameState): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = 0;
  let startOffset = 1; // default: begin at yesterday
  if (isDayFullyDone(state, todayKey(today))) {
    current = 1;
    startOffset = 1;
  }
  for (let i = startOffset; i <= 3660; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (isDayFullyDone(state, todayKey(d))) current += 1;
    else break;
  }
  return current;
}
