# TODO

## Browser sync foundation

- [ ] Apply Lovable-managed idempotent RPC changes for `check_in`, `undo_check_in`, and `redeem_reward`, including `operation_id` receipts and conflict-safe transactions.
- [x] Add a durable IndexedDB outbox for check-in, undo, and redemption commands.
- [x] Add retry/backoff and reconnect/visibility draining.
- [x] Refresh authoritative React Query data after successful queue commands and reconnect.
- [x] Keep the current RPC contract as the default compatibility mode.

## Account recovery and passkeys

- [x] Preserve anonymous-to-email/password account linking and clarify account-switch behavior.
- [x] Add optional, capability-gated passkey registration/sign-in controls.
- [ ] Enable Supabase passkeys and configure stable WebAuthn RP ID/origins through the managed backend/client configuration.
- [ ] Add a signed-out account-login route if passkey sign-in should be available without first entering the Account page as a guest.
