import { addDays, toISODate } from "./dates";
import { activeCompletions, type Completion } from "./progress";

/** Consecutive days (ending today, or yesterday if today is still open) with at least one check-in. */
export function currentStreak(cs: Completion[], today: Date): number {
  const days = new Set(activeCompletions(cs).map((c) => c.completed_on));
  let d = days.has(toISODate(today)) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(toISODate(d))) { n++; d = addDays(d, -1); }
  return n;
}
