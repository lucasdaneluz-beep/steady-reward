import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./session";
import { addDays, toISODate, weekStart } from "./dates";
import type { Completion, Goal, Reward, Tx } from "./progress";

const HISTORY_WEEKS = 8;

export function useGoals() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["goals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("*").eq("archived", false).order("created_at");
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
      const { data, error } = await supabase.from("completion_records").select("*").gte("completed_on", from).order("created_at");
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
      const { data, error } = await supabase.from("rewards").select("*").eq("archived", false).order("cost");
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
      const { data, error } = await supabase.from("point_transactions").select("id,amount,kind,label,created_at").order("created_at", { ascending: false }).limit(300);
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
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

const fail = (e: Error) => toast.error(e.message || "Something went wrong. Please try again.");

export function useCheckIn() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ goal, undo }: { goal: Goal; undo?: boolean }) => {
      const args = { p_goal_id: goal.id, p_date: toISODate(new Date()) };
      const { error } = undo ? await supabase.rpc("undo_check_in", args) : await supabase.rpc("check_in", args);
      if (error) throw error;
    },
    onSuccess: (_d, { goal, undo }) => {
      if (!undo && goal.points > 0) toast.success(`+${goal.points} pts · ${goal.title}`);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(undo ? 5 : 12);
    },
    onError: fail,
    onSettled: () => inv("completions", "balance", "transactions"),
  });
}

export function useRedeem() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (reward: Reward) => {
      const { error } = await supabase.rpc("redeem_reward", { p_reward_id: reward.id });
      if (error) throw error;
    },
    onSuccess: (_d, r) => toast.success(`Redeemed · ${r.title}. Enjoy it.`),
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
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Goal, "paused" | "archived">> }) => {
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
    mutationFn: async ({ id, title, cost }: { id?: string | undefined; title: string; cost: number }) => {
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
