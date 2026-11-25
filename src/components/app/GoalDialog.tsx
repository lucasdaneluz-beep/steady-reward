import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveGoal } from "@/lib/data";
import type { Goal } from "@/lib/progress";
import { cn } from "@/lib/utils";

type GoalSuggestion = { title: string; target: number; points: number };

const suggestions: Record<"daily" | "weekly", GoalSuggestion[]> = {
  daily: [
    { title: "10-minute walk", target: 1, points: 10 },
    { title: "Stretch for 5 minutes", target: 1, points: 10 },
    { title: "Drink 6 glasses of water", target: 1, points: 10 },
    { title: "Read for 10 minutes", target: 1, points: 10 },
  ],
  weekly: [
    { title: "Strength training", target: 2, points: 10 },
    { title: "Cardio", target: 3, points: 10 },
    { title: "Mobility or yoga", target: 2, points: 10 },
    { title: "Meal prep", target: 1, points: 10 },
  ],
};

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  defaultKind = "daily",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal?: Goal | null;
  defaultKind?: "daily" | "weekly";
}) {
  const save = useSaveGoal();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"daily" | "weekly">("daily");
  const [target, setTarget] = useState(3);
  const [points, setPoints] = useState(10);
  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? "");
    setKind(goal?.kind ?? defaultKind);
    setTarget(goal?.kind === "weekly" ? goal.target : 3);
    setPoints(goal?.points ?? 10);
  }, [open, goal, defaultKind]);

  const valid =
    title.trim().length > 0 && points >= 0 && points <= 1000 && target >= 1 && target <= 7;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    save.mutate(
      { id: goal?.id, title: title.trim(), kind, target, points },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">
            {goal ? "Edit goal" : "New goal"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!goal && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Start with an example</Label>
                <span className="text-xs text-muted-foreground">You can edit it below</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {suggestions[kind].map((suggestion) => (
                  <button
                    key={suggestion.title}
                    type="button"
                    onClick={() => {
                      setTitle(suggestion.title);
                      setTarget(suggestion.target);
                      setPoints(suggestion.points);
                    }}
                    className={cn(
                      "min-h-11 rounded-xl border bg-card px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted",
                      title === suggestion.title && "border-foreground/40 bg-muted",
                    )}
                  >
                    {suggestion.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="g-title">Name</Label>
            <Input
              id="g-title"
              autoFocus
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning walk"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(["daily", "weekly"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  disabled={!!goal && goal.kind !== k}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium capitalize transition-colors disabled:opacity-40",
                    kind === k ? "bg-card shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {k === "daily" ? "Daily habit" : "Weekly target"}
                </button>
              ))}
            </div>
            {goal && (
              <p className="text-xs text-muted-foreground">
                Frequency can't change after creation, so your history stays accurate.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {kind === "weekly" && (
              <div className="space-y-1.5">
                <Label htmlFor="g-target">Times per week</Label>
                <Input
                  id="g-target"
                  type="number"
                  min={1}
                  max={7}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="g-points">
                Points {kind === "weekly" ? "per session" : "per day"}
              </Label>
              <Input
                id="g-points"
                type="number"
                min={0}
                max={1000}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
              />
            </div>
          </div>
          {goal && (
            <p className="text-xs text-muted-foreground">
              Point changes apply to future check-ins only.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!valid || save.isPending} className="w-full rounded-xl">
              {save.isPending ? "Saving…" : goal ? "Save changes" : "Add goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
