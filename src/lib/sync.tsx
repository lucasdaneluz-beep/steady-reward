import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./session";
import {
  drainQueue,
  enqueueCommand,
  pendingCount,
  subscribeQueue,
  type QueueCommand,
  type QueueCommandKind,
} from "./offline-queue";
import { SyncContext, type SyncContextValue } from "./sync-context";

const useIdempotentMutations = import.meta.env.VITE_ENABLE_IDEMPOTENT_MUTATIONS === "true";

async function dispatchCommand(command: QueueCommand) {
  const suffix = useIdempotentMutations ? { p_operation_id: command.operationId } : {};
  if (command.kind === "check_in") {
    const { error } = await supabase.rpc("check_in", {
      p_goal_id: command.payload.goalId,
      p_date: command.payload.date,
      ...suffix,
    });
    if (error) throw error;
    return;
  }
  if (command.kind === "undo_check_in") {
    const { error } = await supabase.rpc("undo_check_in", {
      p_goal_id: command.payload.goalId,
      p_date: command.payload.date,
      ...suffix,
    });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.rpc("redeem_reward", {
    p_reward_id: command.payload.rewardId,
    ...suffix,
  });
  if (error) throw error;
}

function keysFor(command: QueueCommand) {
  if (command.kind === "check_in" || command.kind === "undo_check_in")
    return ["completions", "balance", "transactions"];
  return ["balance", "transactions"];
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const currentUserId = user?.id;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries();
    if (currentUserId) setPending(await pendingCount(currentUserId));
  }, [currentUserId, queryClient]);

  const drain = useCallback(async () => {
    if (!currentUserId || !ready || user?.is_anonymous === undefined) return;
    await drainQueue(
      currentUserId,
      dispatchCommand,
      async (command) => {
        await Promise.all(
          keysFor(command).map((key) =>
            queryClient.invalidateQueries({ queryKey: [key, currentUserId] }),
          ),
        );
        setPending(await pendingCount(currentUserId));
      },
      async (command, error) => {
        setPending(await pendingCount(currentUserId));
        toast.error(
          `${command.kind === "redeem_reward" ? "Reward redemption" : "Check-in"} could not be saved: ${error}`,
        );
      },
    );
    setPending(await pendingCount(currentUserId));
  }, [currentUserId, queryClient, ready, user?.is_anonymous]);

  useEffect(() => {
    if (!currentUserId || !ready) return;
    void refresh();
    void drain();
  }, [currentUserId, drain, ready, refresh]);

  useEffect(() => {
    const run = () => {
      void refresh();
      void drain();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    const unsubscribe = subscribeQueue((event) => {
      if (event.type === "enqueued" || event.type === "changed") {
        if (event.type === "enqueued" && event.command.userId === currentUserId)
          setPending((value) => value + 1);
        void drain();
      }
    });
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", run);
      unsubscribe();
    };
  }, [currentUserId, drain, ready, refresh]);

  const value = useMemo<SyncContextValue>(
    () => ({
      enqueue: (kind, payload) => {
        if (!currentUserId) return Promise.reject(new Error("No active account"));
        return enqueueCommand(currentUserId, kind, payload);
      },
      pending,
    }),
    [currentUserId, pending],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
