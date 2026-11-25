import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { History, LayoutDashboard, Gift, Sparkle, Target, UserRound } from "lucide-react";
import { useBalance, useRewards } from "@/lib/data";
import { nextReward } from "@/lib/progress";
import { useSession } from "@/lib/session";
import { CountUp } from "./CountUp";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Today", icon: LayoutDashboard },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/rewards", label: "Rewards", icon: Gift },
  { to: "/history", label: "History", icon: History },
] as const;

export function BalancePill({ className }: { className?: string }) {
  const { data: balance } = useBalance();
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber-soft px-3 py-1.5 text-sm font-semibold text-amber-ink tabular", className)} aria-label={`${balance ?? 0} points`}>
      <Sparkle className="size-3.5 fill-current" aria-hidden="true" />
      {balance === undefined ? <span className="inline-block h-3 w-6 animate-pulse rounded bg-amber/20" /> : <CountUp value={balance} />}
      <span className="font-medium opacity-70">pts</span>
    </span>
  );
}

function RewardTeaser() {
  const { data: balance } = useBalance();
  const { data: rewards } = useRewards();
  if (balance === undefined || !rewards) return <div className="h-4" />;
  const next = nextReward(rewards, balance);
  if (!rewards.length) return <p className="text-xs text-muted-foreground">Add a reward to work toward</p>;
  if (!next) return <p className="text-xs font-medium text-success-ink">Every reward is within reach</p>;
  const pct = Math.min(100, Math.round((balance / next.cost) * 100));
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-amber transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="truncate"><span className="font-medium text-foreground tabular">{next.cost - balance}</span> to {next.title}</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useSession();
  return (
    <div className="min-h-dvh bg-background md:py-6">
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col bg-background md:min-h-[calc(100dvh-3rem)] md:rounded-[1.75rem] md:border md:bg-card md:shadow-soft">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 px-5 pb-3 pt-[max(env(safe-area-inset-top),0.875rem)] backdrop-blur md:rounded-t-[1.75rem] md:bg-card/85">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="font-display text-2xl leading-none tracking-tight">Steady</Link>
            <div className="flex items-center gap-2">
              <BalancePill />
              <Link to="/account" aria-label="Account" className={cn("grid size-9 place-items-center rounded-full border text-muted-foreground transition-colors hover:text-foreground", pathname === "/account" && "border-foreground/30 text-foreground")}>
                <UserRound className="size-4" />
                {user?.is_anonymous && <span className="sr-only">Guest</span>}
              </Link>
            </div>
          </div>
          <div className="mt-2 flex justify-end"><RewardTeaser /></div>
        </header>

        <main className="flex-1 px-5 pb-32 pt-5">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:bottom-6">
          <ul className="grid grid-cols-4 rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-soft backdrop-blur">
            {tabs.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <li key={to}>
                  <Link to={to} aria-current={active ? "page" : undefined}
                    className={cn("flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <Icon className="size-[18px]" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[2rem] leading-none tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</h2>
      {right}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>;
}
