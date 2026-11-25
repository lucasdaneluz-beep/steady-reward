# Offline account and authentication implementation plan

## Scope

Build the browser-side foundation in this repository for account recovery, queued check-in/redeem mutations, reconnect refresh, and optional web passkey UI.

## Design

- Preserve Supabase as the authority for account data and the points ledger.
- Use a dependency-free IndexedDB outbox for check-in, undo, and redemption commands.
- Use one dispatcher and one drain loop, with retry backoff and a visible pending state.
- Refresh React Query data after queue success and after reconnect/visibility regain.
- Keep current RPC signatures as the default until Lovable applies the `operation_id` RPC changes; enable idempotent arguments with `VITE_ENABLE_IDEMPOTENT_MUTATIONS=true` afterward.
- Do not edit `supabase/migrations/`, Drizzle schema, or generated Supabase files.
- Gate passkey registration/sign-in behind `VITE_ENABLE_PASSKEYS=true`, browser capability checks, and confirmed non-anonymous accounts.

## Project structure

- `src/lib/offline-queue.ts`: IndexedDB persistence, command records, retry scheduling, and drain coordination.
- `src/lib/sync.tsx`: authenticated queue dispatcher, reconnect refresh, and React Query invalidation.
- `src/lib/passkeys.ts`: WebAuthn capability and optional Supabase passkey calls.
- `src/lib/data.ts`: routes check-in and redemption mutations through the queue.
- `src/routes/account.tsx`: account-state-aware passkey controls and recovery wording.
- `src/routes/__root.tsx`: mounts the sync lifecycle provider.

## Backend follow-up

Lovable must add server-side idempotency receipts and operation-aware RPC signatures before `VITE_ENABLE_IDEMPOTENT_MUTATIONS` is enabled in production. The current frontend remains compatible with the existing functions while this follow-up is pending.
