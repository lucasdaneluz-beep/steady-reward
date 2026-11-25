import { describe, expect, it } from "vitest";
import { ledgerBalance, nextReward, weeklyCount, weeklyConsistency, type Completion, type Goal } from "./progress";
import { toISODate, weekStart } from "./dates";

const c = (goal_id: string, completed_on: string, undone = false): Completion => ({
  id: Math.random().toString(), goal_id, completed_on, points: 10, undone_at: undone ? "x" : null, created_at: "",
});

describe("rules", () => {
  it("balance is the ledger sum, including reversals and redemptions", () => {
    expect(ledgerBalance([{ amount: 10 }, { amount: 25 }, { amount: -10 }, { amount: -15 }])).toBe(10);
  });
  it("weeks start on Monday", () => {
    expect(toISODate(weekStart(new Date(2026, 10, 29)))).toBe("2026-11-23"); // Sunday -> Monday
    expect(toISODate(weekStart(new Date(2026, 10, 23)))).toBe("2026-11-23");
  });
  it("weekly counter ignores undone sessions and other weeks", () => {
    const cs = [c("g", "2026-11-23"), c("g", "2026-11-24", true), c("g", "2026-11-30"), c("g", "2026-11-25")];
    expect(weeklyCount("g", "2026-11-23", "2026-11-30", cs)).toBe(2);
  });
  it("next reward is the cheapest one not yet affordable", () => {
    const r = (id: string, cost: number) => ({ id, title: id, cost, archived: false, created_at: "" });
    expect(nextReward([r("a", 60), r("b", 150), r("c", 300)], 120)?.id).toBe("b");
    expect(nextReward([r("a", 60)], 60)).toBeNull();
  });
  it("consistency counts daily days elapsed and weekly targets", () => {
    const goals: Goal[] = [
      { id: "d", title: "", kind: "daily", target: 1, points: 5, paused: false, archived: false, created_at: "" },
      { id: "w", title: "", kind: "weekly", target: 3, points: 5, paused: false, archived: false, created_at: "" },
    ];
    const cs = [c("d", "2026-11-23"), c("d", "2026-11-24"), c("w", "2026-11-23")];
    expect(weeklyConsistency(goals, cs, "2026-11-23", "2026-11-30", 3)).toBe(50); // 3 of 6
  });
});

import { currentStreak } from "./streak";
describe("streak", () => {
  it("counts back from yesterday when today has no check-in yet", () => {
    const cs = [c("g", "2026-11-23"), c("g", "2026-11-24"), c("g", "2026-11-22", true)];
    expect(currentStreak(cs, new Date(2026, 10, 25))).toBe(2);
    expect(currentStreak([...cs, c("g", "2026-11-25")], new Date(2026, 10, 25))).toBe(3);
  });
});
