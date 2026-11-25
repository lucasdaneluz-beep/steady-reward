import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveReward } from "@/lib/data";
import type { Reward } from "@/lib/progress";

export function RewardDialog({ open, onOpenChange, reward }: { open: boolean; onOpenChange: (o: boolean) => void; reward?: Reward | null }) {
  const save = useSaveReward();
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState(100);
  useEffect(() => { if (open) { setTitle(reward?.title ?? ""); setCost(reward?.cost ?? 100); } }, [open, reward]);
  const valid = title.trim().length > 0 && cost >= 1 && cost <= 100000;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader><DialogTitle className="font-display text-2xl font-normal">{reward ? "Edit reward" : "New reward"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate({ id: reward?.id, title: title.trim(), cost }, { onSuccess: () => onOpenChange(false) }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="r-title">Reward</Label>
            <Input id="r-title" autoFocus maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend brunch" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-cost">Cost in points</Label>
            <Input id="r-cost" type="number" min={1} max={100000} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!valid || save.isPending} className="w-full rounded-xl">{save.isPending ? "Saving…" : reward ? "Save changes" : "Add reward"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
