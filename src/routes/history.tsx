import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Gift, RotateCcw, Sparkle, X } from "lucide-react";
import { PageTitle, SectionLabel, EmptyState, ListSkeleton } from "@/components/app/AppShell";
import { useCompletions, useGoals, useTransactions } from "@/lib/data";
import { addDays, toISODate, weekStart } from "@/lib/dates";
import { activeCompletions, weeklyConsistency, weeklyCount, type Goal, type Completion } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — Steady" },
      { name: "description", content: "Your weekly review and a full record of points earned and spent." },
      { property: "og:title", content: "History — Steady" },
      { property: "og:description", content: "Your weekly review and a full record of points earned and spent." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [tab, setTab] = useState<"review" | "ledger">("review");
  return (
    <>
      <PageTitle title="History" sub="Look back to keep going." />
      <div role="tablist" className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([["review", "Weekly review"], ["ledger", "Points ledger"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-lg py-2 text-sm font-medium transition-colors", tab === k ? "bg-card shadow-soft" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "review" ? <Review /> : <Ledger />}
    </>
  );
}

function weekSummary(goals: Goal[], cs: Completion[], ws: Date, now: Date) {
  const wsISO = toISODate(ws), weISO = toISODate(addDays(ws, 7));
  const isCurrent = toISODate(weekStart(now)) === wsISO;
  const days = isCurrent ? Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - ws.getTime()) / 86400000) + 1 : 7;
  // Only goals that existed during that week count.
  const eligible = goals.filter((g) => !g.paused && toISODate(new Date(g.created_at)) < weISO);
  const rows = eligible.map((g) => {
    const n = g.kind === "daily"
      ? new Set(activeCompletions(cs).filter((c) => c.goal_id === g.id && c.completed_on >= wsISO && c.completed_on < weISO).map((c) => c.completed_on)).size
      : weeklyCount(g.id, wsISO, weISO, cs);
    const expected = g.kind === "daily" ? days : g.target;
    return { g, n, expected, met: n >= expected };
  });
  const earned = activeCompletions(cs).filter((c) => c.completed_on >= wsISO && c.completed_on < weISO).reduce((s, c) => s + c.points, 0);
  return { isCurrent, rows, earned, pct: weeklyConsistency(eligible, cs, wsISO, weISO, days) };
}

function Review() {
  const goals = useGoals(), comps = useCompletions();
  if (goals.isLoading || comps.isLoading) return <ListSkeleton rows={3} />;
  const now = new Date();
  const all = goals.data ?? [], cs = comps.data ?? [];
  if (!all.length) return <div className="mt-5"><EmptyState title="Nothing to review yet" body="Your weekly review appears once you have goals." /></div>;
  const current = weekSummary(all, cs, weekStart(now), now);
  const past = Array.from({ length: 7 }, (_, i) => addDays(weekStart(now), -7 * (i + 1)))
    .filter((ws) => all.some((g) => toISODate(new Date(g.created_at)) < toISODate(addDays(ws, 7))))
    .map((ws) => ({ ws, ...weekSummary(all, cs, ws, now) }));
  const met = current.rows.filter((r) => r.met), open = current.rows.filter((r) => !r.met);

  return (
    <>
      <section className="mt-5 rounded-3xl border bg-card p-5 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">This week so far</p>
        <div className="mt-2 flex items-end gap-6">
          <p className="font-display text-5xl leading-none tabular">{current.pct}%</p>
          <p className="pb-1 text-sm text-muted-foreground">consistency · <span className="font-medium text-foreground tabular">{current.earned}</span> pts earned</p>
        </div>
      </section>

      {met.length > 0 && (<><SectionLabel>Achieved</SectionLabel>
        <ul className="space-y-1.5">{met.map(({ g, n, expected }) => (
          <li key={g.id} className="flex items-center gap-3 rounded-xl bg-success-soft/70 px-3.5 py-2.5 text-sm">
            <Check className="size-4 text-success-ink" strokeWidth={3} /><span className="flex-1 font-medium">{g.title}</span><span className="text-xs text-success-ink tabular">{n}/{expected}</span>
          </li>))}</ul></>)}
      {open.length > 0 && (<><SectionLabel>{current.isCurrent ? "Still open or missed" : "Missed"}</SectionLabel>
        <ul className="space-y-1.5">{open.map(({ g, n, expected }) => (
          <li key={g.id} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-sm">
            <span className="grid size-4 place-items-center text-muted-foreground"><X className="size-3.5" /></span><span className="flex-1">{g.title}</span><span className="text-xs text-muted-foreground tabular">{n}/{expected}</span>
          </li>))}</ul></>)}

      {past.length > 0 && (<><SectionLabel>Previous weeks</SectionLabel>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{past.map((w) => (
          <li key={toISODate(w.ws)} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="w-28 text-muted-foreground">{w.ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {addDays(w.ws, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", w.pct >= 80 ? "bg-success" : "bg-amber")} style={{ width: `${w.pct}%` }} /></div>
            <span className="w-10 text-right font-semibold tabular">{w.pct}%</span>
          </li>))}</ul></>)}
    </>
  );
}

function Ledger() {
  const { data, isLoading } = useTransactions();
  if (isLoading) return <ListSkeleton />;
  const txs = data ?? [];
  if (!txs.length) return <div className="mt-5"><EmptyState title="No points yet" body="Check in a habit and your first points will show up here." /></div>;
  const byDay = new Map<string, typeof txs>();
  for (const t of txs) { const k = toISODate(new Date(t.created_at)); byDay.set(k, [...(byDay.get(k) ?? []), t]); }
  const today = toISODate(new Date()), yest = toISODate(addDays(new Date(), -1));
  return (
    <>{[...byDay.entries()].map(([day, items]) => (
      <div key={day}>
        <SectionLabel right={<span className="text-xs text-muted-foreground tabular">{items.reduce((s, t) => s + t.amount, 0) >= 0 ? "+" : ""}{items.reduce((s, t) => s + t.amount, 0)}</span>}>
          {day === today ? "Today" : day === yest ? "Yesterday" : new Date(items[0]!.created_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </SectionLabel>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{items.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className={cn("grid size-8 place-items-center rounded-full", t.kind === "earn" ? "bg-success-soft text-success-ink" : t.kind === "redeem" ? "bg-amber-soft text-amber-ink" : "bg-muted text-muted-foreground")}>
              {t.kind === "earn" ? <Sparkle className="size-3.5 fill-current" /> : t.kind === "redeem" ? <Gift className="size-3.5" /> : <RotateCcw className="size-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.kind === "earn" ? "Completed" : t.kind === "redeem" ? "Redeemed" : "Check-in undone"} · {new Date(t.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
            </div>
            <span className={cn("font-semibold tabular", t.amount > 0 ? "text-success-ink" : "text-muted-foreground")}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
          </li>))}</ul>
      </div>
    ))}</>
  );
}
