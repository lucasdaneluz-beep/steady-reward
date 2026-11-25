export type QueueCommandKind = "check_in" | "undo_check_in" | "redeem_reward";

export type QueueCommand = {
  operationId: string;
  userId: string;
  kind: QueueCommandKind;
  payload: Record<string, string>;
  createdAt: string;
  attemptCount: number;
  nextAttemptAt: string;
  state: "pending" | "running" | "rejected";
  lastError?: string;
};

export type QueueEvent =
  | { type: "enqueued"; command: QueueCommand }
  | { type: "succeeded"; command: QueueCommand }
  | { type: "rejected"; command: QueueCommand; error: string }
  | { type: "changed" };

type QueueListener = (event: QueueEvent) => void;

type QueueStore = {
  getAll(): Promise<QueueCommand[]>;
  put(command: QueueCommand): Promise<void>;
  delete(operationId: string): Promise<void>;
};

const DB_NAME = "steady-offline";
const DB_VERSION = 1;
const STORE_NAME = "commands";
const memoryCommands = new Map<string, QueueCommand>();
const listeners = new Set<QueueListener>();
let databasePromise: Promise<IDBDatabase | null> | undefined;
let draining = false;

function browserAvailable() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function operationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emit(event: QueueEvent) {
  listeners.forEach((listener) => listener(event));
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!browserAvailable()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "operationId" });
        store.createIndex("userAndReady", ["userId", "nextAttemptAt"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return databasePromise;
}

const store: QueueStore = {
  async getAll() {
    const db = await openDatabase();
    if (!db) return [...memoryCommands.values()];
    return new Promise((resolve) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as QueueCommand[]) ?? []);
      request.onerror = () => resolve([]);
    });
  },
  async put(command) {
    const db = await openDatabase();
    if (!db) {
      memoryCommands.set(command.operationId, command);
      return;
    }
    await new Promise<void>((resolve) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(command);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        memoryCommands.set(command.operationId, command);
        resolve();
      };
    });
  },
  async delete(id) {
    memoryCommands.delete(id);
    const db = await openDatabase();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  },
};

export function subscribeQueue(listener: QueueListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function enqueueCommand(
  userId: string,
  kind: QueueCommandKind,
  payload: Record<string, string>,
) {
  const command: QueueCommand = {
    operationId: operationId(),
    userId,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    nextAttemptAt: new Date().toISOString(),
    state: "pending",
  };
  await store.put(command);
  emit({ type: "enqueued", command });
  emit({ type: "changed" });
  return command;
}

export async function queuedCommands(userId: string) {
  const now = Date.now();
  return (await store.getAll())
    .filter(
      (command) =>
        command.userId === userId &&
        command.state !== "rejected" &&
        Date.parse(command.nextAttemptAt) <= now,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function pendingCount(userId?: string) {
  const commands = await store.getAll();
  return commands.filter(
    (command) => command.state !== "rejected" && (!userId || command.userId === userId),
  ).length;
}

export function isTransientError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /network|fetch|timeout|offline|temporar|503|502|504|429|refresh token/.test(message);
}

function retryAt(attemptCount: number) {
  const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attemptCount, 6));
  return new Date(Date.now() + delay + Math.round(Math.random() * 500)).toISOString();
}

export async function drainQueue(
  userId: string,
  dispatch: (command: QueueCommand) => Promise<void>,
  onSuccess?: (command: QueueCommand) => Promise<void> | void,
  onRejected?: (command: QueueCommand, error: string) => Promise<void> | void,
) {
  if (draining || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  draining = true;
  try {
    for (;;) {
      const [command] = await queuedCommands(userId);
      if (!command) return;
      const running: QueueCommand = {
        ...command,
        state: "running",
        attemptCount: command.attemptCount + 1,
      };
      await store.put(running);
      try {
        await dispatch(running);
        await store.delete(running.operationId);
        emit({ type: "succeeded", command: running });
        await onSuccess?.(running);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not sync this action";
        if (isTransientError(error)) {
          await store.put({
            ...running,
            state: "pending",
            nextAttemptAt: retryAt(running.attemptCount),
            lastError: message,
          });
          emit({ type: "changed" });
          return;
        }
        const rejected: QueueCommand = { ...running, state: "rejected", lastError: message };
        await store.put(rejected);
        emit({ type: "rejected", command: rejected, error: message });
        await onRejected?.(rejected, message);
      }
    }
  } finally {
    draining = false;
  }
}

export async function clearQueueForUser(userId: string) {
  const commands = await store.getAll();
  await Promise.all(
    commands
      .filter((command) => command.userId === userId)
      .map((command) => store.delete(command.operationId)),
  );
  emit({ type: "changed" });
}
