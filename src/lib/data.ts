import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./session";
import { addDays, toISODate, weekStart } from "./dates";
import type { Completion, Goal, Reward, Tx } from "./progress";
import { useSync } from "./sync-context";

const HISTORY_WEEKS = 8;

export function useGoals() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["goals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("archived", false)
        .order("created_at");
      if (error) throw error;
      return data as Goal[];
    },
  });
}

export function useCompletions() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["completions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const from = toISODate(addDays(weekStart(new Date()), -7 * (HISTORY_WEEKS - 1)));
      const { data, error } = await supabase
        .from("completion_records")
        .select("*")
        .gte("completed_on", from)
        .order("created_at");
      if (error) throw error;
      return data as Completion[];
    },
  });
}

export function useRewards() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["rewards", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rewards")
        .select("*")
        .eq("archived", false)
        .order("cost");
      if (error) throw error;
      return data as Reward[];
    },
  });
}

export function useTransactions() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("point_transactions")
        .select("id,amount,kind,label,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Tx[];
    },
  });
}

export function useBalance() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["balance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_balance");
      if (error) throw error;
      return data as number;
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

const fail = (e: Error) => toast.error(e.message || "Something went wrong. Please try again.");

export function useCheckIn() {
  const qc = useQueryClient();
  const inv = useInvalidate();
  const { enqueue } = useSync();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({ goal, undo }: { goal: Goal; undo?: boolean }) => {
      return enqueue(undo ? "undo_check_in" : "check_in", {
        goalId: goal.id,
        date: toISODate(new Date()),
      });
    },
    onMutate: async ({ goal, undo }) => {
      if (!user) return undefined;

      const queryKey = ["completions", user.id] as const;
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Completion[]>(queryKey);
      const date = toISODate(new Date());

      if (undo) {
        const index =
          previous?.findIndex(
            (completion) =>
              completion.goal_id === goal.id &&
              completion.completed_on === date &&
              !completion.undone_at,
          ) ?? -1;
        if (index >= 0 && previous) {
          const next = [...previous];
          next[index] = { ...next[index], undone_at: new Date().toISOString() };
          qc.setQueryData(queryKey, next);
        }
      } else {
        qc.setQueryData<Completion[]>(queryKey, [
          ...(previous ?? []),
          {
            id: `optimistic-${Date.now()}-${goal.id}`,
            goal_id: goal.id,
            completed_on: date,
            points: goal.points,
            undone_at: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }

      return { previous, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context) qc.setQueryData(context.queryKey, context.previous);
      fail(error);
    },
    onSuccess: (_command, { goal, undo }) => {
      if (!undo && goal.points > 0)
        toast.success(
          `${typeof navigator !== "undefined" && !navigator.onLine ? "Saved on this device" : "Check-in queued"} · ${goal.title}`,
        );
      if (typeof navigator !== "undefined" && "vibrate" in navigator)
        navigator.vibrate?.(undo ? 5 : 12);
    },
    onSettled: (_data, error) => {
      if (error) void inv("completions", "balance", "transactions");
    },
  });
}

export function useRedeem() {
  const inv = useInvalidate();
  const { enqueue } = useSync();
  return useMutation({
    mutationFn: async (reward: Reward) => {
      return enqueue("redeem_reward", { rewardId: reward.id });
    },
    onSuccess: (_command, r) =>
      toast.success(
        `${typeof navigator !== "undefined" && !navigator.onLine ? "Saved on this device" : "Redemption queued"} · ${r.title}`,
      ),
    onError: fail,
    onSettled: () => inv("balance", "transactions"),
  });
}

export type GoalInput = { title: string; kind: "daily" | "weekly"; target: number; points: number };

export function useSaveGoal() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...v }: GoalInput & { id?: string | undefined }) => {
      const payload = { ...v, target: v.kind === "daily" ? 1 : v.target };
      const { error } = id
        ? await supabase.from("goals").update(payload).eq("id", id)
        : await supabase.from("goals").insert(payload);
      if (error) throw error;
    },
    onError: fail,
    onSettled: () => inv("goals"),
  });
}

export function useUpdateGoal() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Goal, "paused" | "archived">>;
    }) => {
      const { error } = await supabase.from("goals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: fail,
    onSettled: () => inv("goals"),
  });
}

export function useSaveReward() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      cost,
    }: {
      id?: string | undefined;
      title: string;
      cost: number;
    }) => {
      const { error } = id
        ? await supabase.from("rewards").update({ title, cost }).eq("id", id)
        : await supabase.from("rewards").insert({ title, cost });
      if (error) throw error;
    },
    onError: fail,
    onSettled: () => inv("rewards"),
  });
}

export function useArchiveReward() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rewards").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onError: fail,
    onSettled: () => inv("rewards"),
  });
}
