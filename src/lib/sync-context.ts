import { createContext, useContext } from "react";
import type { QueueCommand, QueueCommandKind } from "./offline-queue";

export type SyncContextValue = {
  enqueue: (kind: QueueCommandKind, payload: Record<string, string>) => Promise<QueueCommand>;
  pending: number;
};

export const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used inside SyncProvider");
  return context;
}
