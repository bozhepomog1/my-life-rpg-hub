import { useState, type ReactElement, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StreakBanner } from "@/components/StreakBanner";
import { computeStreak, type GameState } from "@/lib/game";
import {
  dailyCompletionSeries,
  dailyXpSeries,
  questsByStat,
  STATS_PERIOD_LABELS,
  type StatsPeriod,
} from "@/lib/stats";

const PERIOD_ORDER: StatsPeriod[] = ["week", "month", "all"];

interface Props {
  state: GameState;
}

// Plain recharts primitives styled with the app's own CSS variables, rather
// than the shadcn ChartContainer/ChartConfig wrapper sitting unused in
// components/ui/chart.tsx — every other data-viz-ish bit in this app
// (ProgressBar, StatSkillTree, StatBar) is a small hand-rolled component
// using the same --color-* variables directly, so this keeps that pattern
// instead of pulling in a second, more elaborate theming layer just for
// three charts.

const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 11 };
const CHART_HEIGHT = 220;

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as ReactElement}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ChartTooltipStyle() {
  return {
    contentStyle: {
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      borderRadius: 10,
      fontSize: 12,
      color: "var(--color-card-foreground)",
    },
    labelStyle: { color: "var(--color-card-foreground)" },
    cursor: { fill: "color-mix(in srgb, var(--color-primary) 8%, transparent)" },
  };
}

export function StatsPanel({ state }: Props) {
  const [period, setPeriod] = useState<StatsPeriod>("month");
  const xp = dailyXpSeries(state, period);
  const byStat = questsByStat(state, period);
  const completion = dailyCompletionSeries(state, period);

  return (
    <div className="space-y-4">
      <StreakBanner current={computeStreak(state)} longest={state.longestStreak} />

      <div className="flex justify-end">
        <div className="inline-flex gap-1 rounded-full border border-border p-0.5 text-xs">
          {PERIOD_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {STATS_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <ChartCard title="Общий XP по дням">
        <LineChart data={xp} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} allowDecimals={false} />
          <Tooltip {...ChartTooltipStyle()} formatter={(v: number) => [`${v} XP`, "XP"]} />
          <Line
            type="monotone"
            dataKey="xp"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartCard>

      <ChartCard title="Квесты по характеристикам">
        <BarChart data={byStat} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} allowDecimals={false} />
          <Tooltip {...ChartTooltipStyle()} formatter={(v: number) => [`${v}`, "Квестов"]} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {byStat.map((d) => (
              <Cell key={d.stat} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard title="Выполнение обязательных квестов по дням">
        <BarChart data={completion} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            {...ChartTooltipStyle()}
            formatter={(v: number, _n, item) => [
              `${v}% (${item.payload.done}/${item.payload.assigned})`,
              "Выполнено",
            ]}
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
            {completion.map((d) => (
              <Cell
                key={d.date}
                fill={d.pct >= 100 ? "var(--color-success)" : "var(--color-destructive)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
}
