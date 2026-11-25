# Architecture assessment

_As of 25 November 2026. Based on the current repository: a browser-first React/TanStack app using `@supabase/supabase-js`, anonymous Supabase Auth sessions, React Query, and server RPCs for check-in, undo, and reward redemption._

## 1. Cloud persistence and Supabase

### Verdict

Supabase is a good fit for the current product, but not because it solves offline sync for you. The strongest reason to keep it is that the app’s data is relational and its important invariants already belong in Postgres: the points balance is derived from an append-only transaction ledger, and check-in/undo/redeem are server functions. Supabase Auth integrates directly with Postgres RLS and JWT claims, which is a natural match for per-user goals, completions, rewards, and transactions [1].

The main architectural gap is offline behavior. The current client uses direct reads and RPC/table mutations with React Query invalidation; it has no durable local database, mutation outbox, idempotency key, or replay/conflict protocol. Supabase Realtime can deliver Postgres changes to connected clients, but it is a change feed, not a complete offline-first database or automatic merge engine [3].

### Recommended data and sync shape

Keep the database authoritative. Do not calculate or upload a replacement balance. Continue deriving it from `point_transactions`, and keep check-in, undo, and redemption transactional. For offline support, cache the current user’s goals, rewards, completions, and recent ledger in IndexedDB. Queue user intentions such as `check_in`, `undo_check_in`, and `redeem_reward` in an outbox with a client-generated operation ID. Replay when online and make the server functions idempotent on that ID, so a timeout followed by a retry cannot award points twice.

For this app, conflicts are mostly business conflicts rather than document-edit conflicts. Two devices checking the same daily goal should converge to one completion; a redemption must succeed or fail against the server balance at transaction time; an undo should target a specific completion and be rejected if it is already undone. Use database uniqueness/constraints and explicit RPC errors for those cases. Treat ordinary goal/reward edits separately: for the simple case, last-write-wins with `updated_at` and a version/ETag is acceptable; if multi-device editing becomes important, show a conflict instead of silently overwriting. Realtime is useful for invalidating or patching caches while online, but reconnect should always perform a server delta/full refresh because a browser can miss events while suspended.

Anonymous sessions need special care. Supabase documents that an anonymous user cannot recover the account after sign-out, cleared browser data, or switching devices; linking an anonymous identity to an existing account can also require a product decision about merge versus overwrite [2]. For this app, make “save to account” an explicit migration flow: link the current anonymous user when possible, and otherwise show the user exactly what local progress will be merged or discarded.

### Latency, scale, and cost

For a habit tracker, normal request latency should be acceptable if the project is geographically close to users and the UI is optimistic. Do not promise an exact latency without measuring from target regions. Use a region near the largest user population, keep list queries bounded, paginate or summarize the ledger, and avoid fetching all history on every screen. The current 300-transaction client limit is a reasonable short-term guard, not a long-term history strategy.

Supabase’s current pricing page lists a free tier with 500 MB database size, 5 GB egress, and 50,000 MAU, but free projects can pause after inactivity; Pro starts at $25/month and usage beyond included quotas is metered [4]. These figures and plan rules can change, so recheck them before launch. For this app, storage is unlikely to be the first cost problem; database compute, egress, Realtime connections, Auth MAU, backups, and operational support become more relevant as usage grows.

### Fair alternatives

**Firebase/Firestore** is stronger if offline-first mobile/web behavior is the primary requirement. Firestore has client offline persistence and synchronizes local writes automatically; when multiple local changes target the same document, its documented rule is last-write-wins [5]. That reduces client sync work, but it is a weaker conceptual fit for this app’s relational ledger and transactional rules: you would model more denormalized documents and still need carefully designed server transactions/functions for points and redemption. Firebase Auth is mature and has anonymous-account upgrade flows [6]. Its pricing and quotas are also usage-sensitive, and Google vendor coupling is a real trade-off.

**A custom backend with Postgres** gives maximum control over the same relational model, idempotency, sync endpoints, regions, and authentication choices. It is not automatically cheaper or more reliable: you would own patching, backups, RLS-equivalent authorization, token/session security, observability, scaling, and incident response. It becomes attractive when you need unusual compliance, strict infrastructure placement, or a sync protocol that BaaS constraints make awkward.

**Recommendation:** stay with Supabase for this stage. Add an IndexedDB/outbox layer and idempotent RPC contracts before claiming robust offline support. Reconsider Firebase only if offline conflict-free behavior is the product’s defining feature and the team accepts a document-oriented data model.

## 2. Biometric credential authentication

### First distinguish two different features

On a native app, Face ID/Touch ID or Android biometrics can unlock a locally stored session or signing key. That local biometric result is not, by itself, proof sent to Supabase that the person authenticated. The stronger cross-device login feature is a **passkey**: WebAuthn creates a public/private key pair, the private key stays with the authenticator, and the server verifies a signed challenge. Passkeys can use biometrics, a device PIN, or a security key, and are designed to resist phishing [8].

The current repository is a web app, so it should not attempt to call iOS LocalAuthentication or Android BiometricPrompt directly. On the web, use WebAuthn/passkeys over HTTPS. The W3C WebAuthn Level 3 Recommendation describes platform authenticators and roaming authenticators and scopes credentials to the relying-party origin [8]. Browser, OS, password-manager, and cross-device behavior still varies, so test the exact supported browsers and account-recovery path.

### Native feasibility and fallbacks

On Apple platforms, LocalAuthentication does not expose fingerprint/face data to the app; the system and Secure Enclave handle it and the app receives success/failure. Apple explicitly supports a passcode/password fallback and requires an `NSFaceIDUsageDescription` for Face ID [9]. Store tokens or a key in Keychain protected by an appropriate access-control policy, not in ordinary app storage. If biometry is unavailable, not enrolled, locked out, canceled, or the biometric set changes, fall back to the account credential or a recovery flow. Do not silently treat a failed biometric prompt as a new account.

On Android, use the AndroidX Biometric library/BiometricPrompt rather than the deprecated fingerprint-only API. Android lets you choose strong biometrics, weak biometrics, device credential, or combinations; availability must be checked, and some biometric/device-credential combinations have older-API limitations [10]. For a simple app unlock, allowing the device credential is usually the best usability fallback. For higher assurance, require `BIOMETRIC_STRONG` and use an auth-per-use Keystore key for the sensitive operation rather than merely setting a boolean “unlocked” flag.

### Supabase-specific option and caution

Supabase now documents passkey APIs for JavaScript, Swift, and other SDKs, but labels the feature experimental and says the API may change. It requires explicit client opt-in, a stable WebAuthn relying-party ID/origins, and a confirmed non-anonymous user for registration [7]. That makes it feasible for the account-login feature, but I would not make it the only login or recovery method yet. Keep email/password or magic link, and preferably a second recovery method, until passkey support and your target native wrappers are proven in production.

### Recommendation

For the current web app: first ship normal account linking from anonymous users, then add passkeys as an optional passwordless sign-in, with email/password or magic link recovery. For future iOS/Android apps: use native secure storage plus system biometric unlock for convenience, or implement passkeys if the goal is real account authentication across devices. Always provide a clear fallback, rate-limit/re-authenticate sensitive actions, and test device reset, biometric enrollment changes, lockout, account deletion, lost device, offline launch, and a user who has changed phones.

## References

[1]: https://supabase.com/docs/guides/auth "Supabase Auth documentation"
[2]: https://supabase.com/docs/guides/auth/auth-anonymous "Supabase anonymous sign-ins documentation"
[3]: https://supabase.com/docs/guides/realtime/postgres-changes "Supabase Postgres Changes documentation"
[4]: https://supabase.com/pricing "Supabase pricing"
[5]: https://firebase.google.com/docs/firestore/manage-data/enable-offline "Firebase Firestore offline data documentation"
[6]: https://firebase.google.com/docs/auth "Firebase Authentication documentation"
[7]: https://supabase.com/docs/guides/auth/passkeys "Supabase passkey authentication documentation"
[8]: https://www.w3.org/TR/webauthn-3/ "W3C Web Authentication Level 3 Recommendation"
[9]: https://developer.apple.com/documentation/localauthentication/logging-a-user-into-your-app-with-face-id-or-touch-id "Apple LocalAuthentication Face ID and Touch ID guidance"
[10]: https://developer.android.com/identity/sign-in/biometric-auth "Android biometric authentication guidance"
