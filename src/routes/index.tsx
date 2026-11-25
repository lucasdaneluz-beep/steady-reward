import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Sparkle } from "lucide-react";
import { PageTitle, SectionLabel, EmptyState, ListSkeleton } from "@/components/app/AppShell";
import { ProgressRing } from "@/components/app/ProgressRing";
import { DailyRow, WeeklyRow } from "@/components/app/CheckInRows";
import { Button } from "@/components/ui/button";
import { useBalance, useCompletions, useGoals, useRewards } from "@/lib/data";
import { addDays, toISODate, weekStart } from "@/lib/dates";
import { dailyDone, nextReward, weeklyConsistency, weeklyCount } from "@/lib/progress";
import { currentStreak } from "@/lib/streak";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Steady" },
      {
        name: "description",
        content: "Check in today's habits, log weekly sessions and see your progress at a glance.",
      },
      { property: "og:title", content: "Today — Steady" },
      {
        property: "og:description",
        content: "Check in today's habits, log weekly sessions and see your progress at a glance.",
      },
    ],
  }),
  component: Dashboard,
});

function greeting(h: number) {
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const goals = useGoals(),
    comps = useCompletions(),
    rewards = useRewards(),
    bal = useBalance();
  const now = new Date();
  const today = toISODate(now);
  const ws = weekStart(now),
    wsISO = toISODate(ws),
    weISO = toISODate(addDays(ws, 7));
  const daysElapsed =
    Math.round(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - ws.getTime()) /
        86400000,
    ) + 1;
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (goals.isLoading || comps.isLoading)
    return (
      <>
        <PageTitle title={greeting(now.getHours())} sub={dateLabel} />
        <div className="mb-6 h-40 animate-pulse rounded-3xl bg-muted" />
        <ListSkeleton />
      </>
    );

  const active = (goals.data ?? []).filter((g) => !g.paused);
  const daily = active.filter((g) => g.kind === "daily");
  const weekly = active.filter((g) => g.kind === "weekly");
  const cs = comps.data ?? [];
  const doneCount = daily.filter((g) => dailyDone(g.id, today, cs)).length;
  const streak = currentStreak(cs, now);
  const consistency = weeklyConsistency(active, cs, wsISO, weISO, daysElapsed);
  const next = bal.data !== undefined && rewards.data ? nextReward(rewards.data, bal.data) : null;
  const affordable = (rewards.data ?? []).filter((r) => r.cost <= (bal.data ?? 0)).length;

  if (!active.length)
    return (
      <>
        <PageTitle title={greeting(now.getHours())} sub={dateLabel} />
        <EmptyState
          title="Nothing to check in yet"
          body="Add a daily habit or a weekly target to start earning points."
          action={
            <Button asChild className="rounded-xl">
              <Link to="/goals">Add a goal</Link>
            </Button>
          }
        />
      </>
    );

  const allDone = daily.length > 0 && doneCount === daily.length;
  return (
    <>
      <PageTitle title={greeting(now.getHours())} sub={dateLabel} />

      <section className="flex items-center gap-5 rounded-3xl border bg-card p-5 shadow-soft">
        <ProgressRing value={daily.length ? doneCount / daily.length : 0}>
          <span className="font-display text-4xl leading-none tabular">
            {doneCount}
            <span className="text-xl text-muted-foreground">/{daily.length}</span>
          </span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            today
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-medium leading-snug">
            {allDone
              ? "Every habit done today. Well kept."
              : daily.length
                ? `${daily.length - doneCount} habit${daily.length - doneCount === 1 ? "" : "s"} left today`
                : "No daily habits — focus on your weekly targets"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              icon={<Flame className="size-3.5" />}
              label="Streak"
              value={`${streak} day${streak === 1 ? "" : "s"}`}
            />
            <Stat label="This week" value={`${consistency}%`} />
          </div>
        </div>
      </section>

      {daily.length > 0 && (
        <>
          <SectionLabel
            right={
              <span className="text-xs text-muted-foreground tabular">
                {doneCount} of {daily.length}
              </span>
            }
          >
            Today's habits
          </SectionLabel>
          <div className="space-y-2">
            {daily.map((g) => (
              <DailyRow key={g.id} goal={g} done={dailyDone(g.id, today, cs)} />
            ))}
          </div>
        </>
      )}

      {weekly.length > 0 && (
        <>
          <SectionLabel
            right={
              <Link
                to="/goals"
                className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
              >
                Manage
              </Link>
            }
          >
            Weekly targets
          </SectionLabel>
          <div className="space-y-2">
            {weekly.map((g) => (
              <WeeklyRow key={g.id} goal={g} count={weeklyCount(g.id, wsISO, weISO, cs)} />
            ))}
          </div>
        </>
      )}

      <SectionLabel>Next reward</SectionLabel>
      <Link
        to="/rewards"
        className="block rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/40"
      >
        {next && bal.data !== undefined ? (
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-amber-soft text-amber-ink">
              <Sparkle className="size-4 fill-current" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{next.title}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber transition-[width] duration-500"
                  style={{ width: `${Math.min(100, (bal.data / next.cost) * 100)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground tabular">
              {bal.data}/{next.cost}
            </span>
          </div>
        ) : (
          <p className="text-sm">
            <span className="font-medium text-success-ink">
              {affordable
                ? `${affordable} reward${affordable === 1 ? "" : "s"} ready to redeem`
                : "Set a reward to work toward"}
            </span>{" "}
            <span className="text-muted-foreground">→</span>
          </p>
        )}
      </Link>
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/70 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-semibold tabular">{value}</p>
    </div>
  );
}
