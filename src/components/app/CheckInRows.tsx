import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { Goal } from "@/lib/progress";
import { useCheckIn } from "@/lib/data";
import { cn } from "@/lib/utils";

export function DailyRow({ goal, done }: { goal: Goal; done: boolean }) {
  const m = useCheckIn();
  const [pop, setPop] = useState(0);
  const pending = m.isPending;
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={done}
      onClick={() => { if (!done) setPop((p) => p + 1); m.mutate({ goal, undo: done }); }}
      className={cn("flex w-full items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 text-left transition-colors active:scale-[0.99] disabled:opacity-70",
        done && "border-success/25 bg-success-soft/60")}
    >
      <span key={pop} className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
        done ? "animate-pop border-success bg-success text-primary-foreground" : "border-input")}>
        {done && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className={cn("flex-1 font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/40")}>{goal.title}</span>
      {goal.points > 0 && <span className={cn("text-xs font-semibold tabular", done ? "text-success-ink" : "text-muted-foreground")}>+{goal.points}</span>}
    </button>
  );
}

export function WeeklyRow({ goal, count }: { goal: Goal; count: number }) {
  const m = useCheckIn();
  const done = count >= goal.target;
  return (
    <div className={cn("rounded-2xl border bg-card px-4 py-3.5", done && "border-success/25 bg-success-soft/60")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{goal.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular">
            <span className={cn("font-semibold", done ? "text-success-ink" : "text-foreground")}>{count}/{goal.target}</span> this week
            {goal.points > 0 && <> · +{goal.points} each</>}
          </p>
        </div>
        <button type="button" aria-label={`Remove a session from ${goal.title}`} disabled={count === 0 || m.isPending}
          onClick={() => m.mutate({ goal, undo: true })}
          className="grid size-9 place-items-center rounded-full border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
          <Minus className="size-4" />
        </button>
        <button type="button" aria-label={`Log a session for ${goal.title}`} disabled={done || m.isPending}
          onClick={() => m.mutate({ goal })}
          className={cn("grid size-9 place-items-center rounded-full transition-colors disabled:opacity-100",
            done ? "bg-success text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
          {done ? <Check className="size-4" strokeWidth={3} /> : <Plus className="size-4" />}
        </button>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {Array.from({ length: goal.target }).map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i < count ? (done ? "bg-success" : "bg-amber") : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}
