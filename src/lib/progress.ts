export type Goal = {
  id: string; title: string; kind: "daily" | "weekly"; target: number;
  points: number; paused: boolean; archived: boolean; created_at: string;
};
export type Completion = { id: string; goal_id: string; completed_on: string; points: number; undone_at: string | null; created_at: string };
export type Reward = { id: string; title: string; cost: number; archived: boolean; created_at: string };
export type Tx = { id: string; amount: number; kind: "earn" | "reversal" | "redeem"; label: string; created_at: string };

/** Balance is always the sum of the ledger. */
export function ledgerBalance(txs: Pick<Tx, "amount">[]): number {
  return txs.reduce((s, t) => s + t.amount, 0);
}

export function activeCompletions(cs: Completion[]) {
  return cs.filter((c) => !c.undone_at);
}

export function dailyDone(goalId: string, date: string, cs: Completion[]) {
  return activeCompletions(cs).some((c) => c.goal_id === goalId && c.completed_on === date);
}

export function weeklyCount(goalId: string, weekStartISO: string, weekEndISO: string, cs: Completion[]) {
  return activeCompletions(cs).filter(
    (c) => c.goal_id === goalId && c.completed_on >= weekStartISO && c.completed_on < weekEndISO,
  ).length;
}

/** Cheapest reward the user cannot yet afford, or null when all are affordable. */
export function nextReward(rewards: Reward[], balance: number) {
  const sorted = rewards.filter((r) => !r.archived).sort((a, b) => a.cost - b.cost);
  return sorted.find((r) => r.cost > balance) ?? null;
}

/**
 * Weekly consistency: share of expected check-ins achieved.
 * Daily goal expects 1 per elapsed day; weekly goal expects its target.
 */
export function weeklyConsistency(
  goals: Goal[], cs: Completion[], weekStartISO: string, weekEndISO: string, daysElapsed: number,
) {
  let expected = 0, achieved = 0;
  for (const g of goals.filter((g) => !g.paused && !g.archived)) {
    if (g.kind === "daily") {
      expected += daysElapsed;
      achieved += Math.min(daysElapsed, new Set(activeCompletions(cs).filter((c) => c.goal_id === g.id && c.completed_on >= weekStartISO && c.completed_on < weekEndISO).map((c) => c.completed_on)).size);
    } else {
      expected += g.target;
      achieved += Math.min(g.target, weeklyCount(g.id, weekStartISO, weekEndISO, cs));
    }
  }
  return expected === 0 ? 0 : Math.round((achieved / expected) * 100);
}
