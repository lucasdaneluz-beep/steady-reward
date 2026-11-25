import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { PageTitle, SectionLabel, EmptyState, ListSkeleton } from "@/components/app/AppShell";
import { GoalDialog } from "@/components/app/GoalDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGoals, useUpdateGoal } from "@/lib/data";
import type { Goal } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Steady" },
      {
        name: "description",
        content: "Create, edit and pause your daily habits and weekly targets.",
      },
      { property: "og:title", content: "Goals — Steady" },
      {
        property: "og:description",
        content: "Create, edit and pause your daily habits and weekly targets.",
      },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const { data, isLoading } = useGoals();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [newKind, setNewKind] = useState<Goal["kind"]>("daily");
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<Goal | null>(null);
  const update = useUpdateGoal();
  const openNew = (kind: Goal["kind"] = "daily") => {
    setEditing(null);
    setNewKind(kind);
    setOpen(true);
  };

  const goals = data ?? [];
  const groups = [
    {
      label: "Daily habits",
      kind: "daily" as const,
      items: goals.filter((g) => g.kind === "daily"),
    },
    {
      label: "Weekly targets",
      kind: "weekly" as const,
      items: goals.filter((g) => g.kind === "weekly"),
    },
  ];

  return (
    <>
      <PageTitle title="Goals" sub="What you're building, day by day." />
      {isLoading ? (
        <ListSkeleton />
      ) : !goals.length ? (
        <EmptyState
          title="No goals yet"
          body="Start with one small daily habit. You can add weekly targets too."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openNew("daily")} className="rounded-xl">
                <Plus className="size-4" />
                Add habit
              </Button>
              <Button onClick={() => openNew("weekly")} className="rounded-xl">
                <Plus className="size-4" />
                Add target
              </Button>
            </div>
          }
        />
      ) : (
        groups.map(
          (grp) =>
            (grp.items.length > 0 || grp.kind === "weekly") && (
              <div key={grp.label}>
                <SectionLabel
                  right={
                    <Button
                      size="sm"
                      className="h-7 rounded-lg px-2 text-xs"
                      onClick={() => openNew(grp.kind)}
                    >
                      <Plus className="size-3.5" />
                      Add {grp.kind === "weekly" ? "target" : "habit"}
                    </Button>
                  }
                >
                  {grp.label}
                </SectionLabel>
                {grp.items.length > 0 ? (
                  <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                    {grp.items.map((g) => (
                      <li
                        key={g.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3.5",
                          g.paused && "opacity-60",
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setEditing(g);
                            setOpen(true);
                          }}
                        >
                          <p className="truncate font-medium">{g.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular">
                            {g.kind === "daily" ? "Every day" : `${g.target}× per week`} ·{" "}
                            {g.points} pts{g.kind === "weekly" ? " each" : ""}
                            {g.paused && (
                              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 font-medium">
                                Paused
                              </span>
                            )}
                          </p>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Options for ${g.title}`}
                              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(g);
                                setOpen(true);
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                update.mutate({ id: g.id, patch: { paused: !g.paused } })
                              }
                            >
                              {g.paused ? "Resume" : "Pause"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setRemoving(g)}
                            >
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                    No weekly targets yet. Add one to track sessions toward a weekly goal.
                  </div>
                )}
              </div>
            ),
        )
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Paused goals stay out of today's list and your weekly review.
      </p>

      <GoalDialog open={open} onOpenChange={setOpen} goal={editing} defaultKind={newKind} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from your goals. Points you've already earned and your history stay as
              they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) update.mutate({ id: removing.id, patch: { archived: true } });
                setRemoving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
