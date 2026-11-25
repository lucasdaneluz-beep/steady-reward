import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MoreHorizontal, Plus, Sparkle } from "lucide-react";
import { PageTitle, EmptyState, ListSkeleton, SectionLabel } from "@/components/app/AppShell";
import { RewardDialog } from "@/components/app/RewardDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useArchiveReward, useBalance, useRedeem, useRewards } from "@/lib/data";
import type { Reward } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — Steady" },
      { name: "description", content: "Your own rewards catalog: see what you can afford and redeem points." },
      { property: "og:title", content: "Rewards — Steady" },
      { property: "og:description", content: "Your own rewards catalog: see what you can afford and redeem points." },
    ],
  }),
  component: RewardsPage,
});

function RewardsPage() {
  const { data, isLoading } = useRewards();
  const { data: balance = 0 } = useBalance();
  const redeem = useRedeem(), archive = useArchiveReward();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [confirm, setConfirm] = useState<Reward | null>(null);
  const rewards = data ?? [];
  const ready = rewards.filter((r) => r.cost <= balance), later = rewards.filter((r) => r.cost > balance);
  const openNew = () => { setEditing(null); setOpen(true); };

  const card = (r: Reward) => {
    const can = r.cost <= balance;
    return (
      <li key={r.id} className={cn("rounded-2xl border bg-card px-4 py-3.5", can && "border-amber/30")}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.title}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-ink tabular"><Sparkle className="size-3 fill-current" />{r.cost} pts</p>
          </div>
          {can ? (
            <Button size="sm" className="rounded-xl" onClick={() => setConfirm(r)} disabled={redeem.isPending}>Redeem</Button>
          ) : (
            <span className="text-xs text-muted-foreground tabular">{r.cost - balance} to go</span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label={`Options for ${r.title}`} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditing(r); setOpen(true); }}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => archive.mutate(r.id)}>Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!can && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber/70 transition-[width] duration-500" style={{ width: `${Math.min(100, (balance / r.cost) * 100)}%` }} /></div>}
      </li>
    );
  };

  return (
    <>
      <PageTitle title="Rewards" sub="Treats you've decided you've earned." action={<Button onClick={openNew} size="sm" className="rounded-xl"><Plus className="size-4" />New</Button>} />
      {isLoading ? <ListSkeleton /> : !rewards.length ? (
        <EmptyState title="No rewards yet" body="Pick something you genuinely look forward to, and give it a point cost." action={<Button onClick={openNew} className="rounded-xl">Add a reward</Button>} />
      ) : (<>
        {ready.length > 0 && (<><SectionLabel>Ready to redeem</SectionLabel><ul className="space-y-2">{ready.map(card)}</ul></>)}
        {later.length > 0 && (<><SectionLabel>Keep going</SectionLabel><ul className="space-y-2">{later.map(card)}</ul></>)}
      </>)}

      <RewardDialog open={open} onOpenChange={setOpen} reward={editing} />
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem {confirm?.title}?</AlertDialogTitle>
            <AlertDialogDescription>This spends {confirm?.cost} points. You'll have {balance - (confirm?.cost ?? 0)} left.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && redeem.mutate(confirm)}>Redeem</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
