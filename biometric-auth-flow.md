# Biometric and passkey authentication flow

This design is tailored to the current repository: a browser-first React app using Supabase Auth, automatic anonymous sessions, email/password account linking, and persisted Supabase sessions. It distinguishes **web passkeys** from **native biometric unlock** because they solve different problems.

## 1. Recommended product decision

For the current web app, implement **passkey sign-in** as an optional account credential. Do not describe it as “Face ID login” only: a passkey may be unlocked by Face ID, Touch ID, an Android biometric, a device PIN, a password-manager approval, or a security key.

For a future native iOS/Android app, optionally add **local biometric unlock** for a previously authenticated Supabase session. That is a convenience layer around a stored session/key; it is not the same as a server-verifiable passkey login.

Keep email/password or magic-link recovery in both cases. A biometric prompt can fail, become unavailable, or be tied to a lost device. The user must never become permanently locked out because biometric authentication is unavailable.

## 2. Current account states

The existing `SessionProvider` creates an anonymous Supabase user when there is no stored session. The account page then has two paths:

- **Guest:** progress belongs to the current anonymous user and cannot be recovered after browser data is cleared or the user changes device.
- **Permanent account:** the guest can use `updateUser({ email, password })`, confirm the email, and retain the same Supabase user identity.
- **Existing-account sign-in:** the current UI explicitly warns that switching to an existing account does not carry over guest progress.

Passkey enrollment should only be available in the permanent-account state. Supabase’s current passkey documentation says registration requires a confirmed, non-anonymous user; the passkey API is also documented as experimental and requires explicit client opt-in [1].

## 3. Web passkey flow for this app

### A. Enroll a passkey after saving progress

The account page should expose a secondary action such as **“Create a passkey”** only when all of these are true:

1. There is a current Supabase session.
2. `user.is_anonymous` is false.
3. The user’s email is confirmed.
4. The browser reports WebAuthn support.
5. The production origin is HTTPS.

The flow is:

```text
User is signed in with confirmed email/password
        |
        v
User taps “Create a passkey”
        |
        v
App asks Supabase Auth for WebAuthn registration options
        |
        v
Browser/platform authenticator prompts for Face ID, Touch ID,
Android biometric, device PIN, password-manager approval, or key
        |
        v
Authenticator returns a signed public-key credential
        |
        v
Supabase verifies it and stores the public key for this account
        |
        v
App shows “Passkey added” and keeps email/password recovery
```

The private key remains with the authenticator. The app should store only the passkey identifier and friendly metadata needed to list or remove credentials. It should not receive or store biometric data.

Before enabling this in production, choose the WebAuthn relying-party ID carefully. For example, if the app is served from `https://steady.example.com`, the RP ID may be `steady.example.com`; it must remain stable because changing it makes existing passkeys unusable. Configure allowed origins for production and development separately, and never include a scheme, path, or port in the RP ID [1] [2].

### B. Sign in with a passkey

On the signed-out web login screen, show:

- **Sign in with a passkey**
- **Use email and password**
- **Email me a sign-in link** if magic-link recovery is enabled

The passkey path is:

```text
User taps “Sign in with a passkey”
        |
        v
App calls Supabase signInWithPasskey()
        |
        v
Browser asks the authenticator for a discoverable credential
        |
        v
User approves with biometric, device credential, or security key
        |
        v
Browser returns a signed assertion
        |
        v
Supabase verifies the assertion and issues a session
        |
        v
Supabase SIGNED_IN event updates SessionProvider
        |
        v
React Query clears any prior user cache and loads the new account
```

The app should not ask for an email first if using discoverable credentials. The authenticator can select the account. After `SIGNED_IN`, follow the same session path already used by `SessionProvider`: set the user, invalidate queries, and never retain data from a previous anonymous or permanent user in React Query.

### C. Guest-user behavior

A guest should not see a passkey-registration action. Show:

> Save your progress with an email and password first. You can add a passkey after your account is confirmed.

This avoids creating confusing credentials for an account that the user cannot recover across devices. It also preserves the current model in which the anonymous user is converted into a permanent account rather than silently merged into another account.

If a guest chooses **I have an account**, retain the current warning: signing in switches accounts and guest progress will not carry over automatically. If an offline outbox is later added, pause it during this transition and require an explicit discard, export, or merge decision before switching identities.

## 4. Web fallback state machine

Use explicit result categories rather than displaying every WebAuthn error as “wrong password.”

```text
PASSKEY_AVAILABLE
  -> prompt user

PASSKEY_SUCCESS
  -> establish Supabase session

USER_CANCELLED / NOT_ALLOWED
  -> remain signed out
  -> offer password or magic-link buttons

NO_CREDENTIAL / NOT_SUPPORTED / INVALID_STATE
  -> explain that no usable passkey is available here
  -> offer password or magic link

NETWORK_ERROR / SESSION_ERROR
  -> do not create a new account
  -> show retry plus normal sign-in fallback

SERVER_REJECTED
  -> log a safe diagnostic code
  -> show generic failure
  -> offer recovery method
```

Do not automatically create an anonymous session after a failed passkey login if the user is on an account-login screen. That could make a failed login look like a successful login into a blank account. The app may offer **Continue as guest** as a separate, clearly labeled action.

A passkey failure should not delete existing credentials or change the active account. A canceled prompt is a normal user choice, not a security incident.

## 5. Native iOS flow, if the app becomes native

There are two viable native designs.

### Option A: local biometric unlock of a Supabase session

This is the simplest convenience feature:

```text
First login on device with email/password, passkey, or magic link
        |
        v
Receive Supabase session and refresh token
        |
        v
Store the refresh token or an encryption key in Keychain
protected by an appropriate LocalAuthentication access policy
        |
        v
On later app launch, ask LAContext for device-owner authentication
        |
        +--> Face ID/Touch ID succeeds: unlock the stored session/key
        |
        +--> User chooses passcode fallback: unlock if policy allows
        |
        +--> Cancel/failure/lockout: show normal account sign-in
```

Apple’s LocalAuthentication framework does not expose fingerprint or face images to the app. The system and Secure Enclave perform the check, and the app receives success or failure. Apple documents both a biometric-only policy and a device-owner policy that allows passcode fallback; Face ID also requires `NSFaceIDUsageDescription` [3] [4].

Use Keychain access controls rather than storing a boolean such as `biometricUnlocked = true`. A boolean can be forged by a compromised local storage layer and does not protect the session. If the user changes the enrolled biometric set, the protected Keychain item may become inaccessible; treat that as a reason to require the account recovery login, not as a new account.

### Option B: native passkey authentication

Use this when the goal is actual account authentication across devices. The native passkey ceremony uses the platform credential provider and a server challenge. The server verifies the public-key assertion and issues a new Supabase session. It is stronger than merely unlocking a locally cached refresh token, but it requires stable relying-party configuration and native associated-domain/app-link setup.

For this app, the rollout order should be:

1. Email/password or magic-link account recovery.
2. Web passkeys for the browser product.
3. Native passkeys only when an actual native client and its platform association files exist.
4. Optional local biometric unlock for convenience between launches.

## 6. Native Android flow, if the app becomes native

Use AndroidX Biometric/BiometricPrompt, not the deprecated fingerprint-only API. Decide whether the app accepts:

- `BIOMETRIC_STRONG` only for higher assurance.
- `BIOMETRIC_STRONG | DEVICE_CREDENTIAL` for the best ordinary-app fallback.
- A weaker biometric class only if the risk model permits it.

Android’s documented flow checks availability first, then presents the system prompt. The result can distinguish biometric authentication from device-credential authentication. Older Android versions have limitations around combining device credentials with biometric authenticators, so the implementation must branch by API level [5].

For this app’s normal session unlock:

```text
App launch
  -> check canAuthenticate()
  -> if available, show BiometricPrompt
  -> on success, unlock KeyStore-protected session/key
  -> on device credential, continue if policy allows
  -> on no hardware/not enrolled, offer account sign-in
  -> on lockout/cancel, show retry and account sign-in
```

For especially sensitive operations, use an authentication-per-use Android Keystore key rather than treating a prior prompt as authorization for an unlimited period. For ordinary habit tracking, re-authenticating when opening the app or after a short inactivity period is likely sufficient; exact timing should be a product/security decision.

## 7. Fallback hierarchy

Use this order consistently:

1. Passkey or local biometric prompt.
2. Device PIN/passcode if the platform policy allows it.
3. Existing Supabase email/password login.
4. Magic link or email recovery.
5. “Continue as guest” only as an explicitly separate path.

Do not use SMS as the only recovery method for a valuable account unless the threat model accepts SIM-swap risk. Do not email or log biometric data, passkey private-key material, refresh tokens, or raw WebAuthn assertions beyond what is needed for short-lived diagnostics.

## 8. Security and account-switch rules

- Never interpret biometric success as permission to switch to an arbitrary account. It unlocks the credential selected by the OS/authenticator.
- On every `SIGNED_IN` or `SIGNED_OUT` event, clear or namespace React Query and IndexedDB data by Supabase user ID.
- After sign-out, remove the locally stored native session/key so a later biometric prompt cannot silently reopen the old account.
- Rate-limit password and magic-link attempts and avoid account-enumeration messages such as “this email has a passkey.”
- Require the normal account credential or a passkey recovery method when a biometric set changes, the device is reset, or the secure item is invalidated.
- Keep a visible “Use another method” action. Do not trap a user in a biometric prompt loop.
- Re-authenticate for destructive account actions, changing recovery credentials, or exporting/deleting data.
- Test browser private mode, multiple profiles, passkey-manager selection, a lost device, an unenrolled device, biometric lockout, biometric enrollment changes, offline launch, and switching from an anonymous session to an existing account.

## 9. Suggested UI copy

**Passkey setup:** “Use Face ID, Touch ID, your device PIN, or a security key to sign in faster. You can still use your email and password if needed.”

**Unsupported browser:** “Passkeys aren’t available in this browser. Use your email and password, or try a supported browser.”

**Canceled prompt:** “Passkey sign-in was canceled. You can try again or use another sign-in method.”

**No credential on this device:** “No passkey for this account was found here. Use your email and password, or use a device where you saved the passkey.”

**Native biometric fallback:** “Biometric unlock is unavailable. Use your device passcode or sign in with your account.”

## References

[1]: https://supabase.com/docs/guides/auth/passkeys "Supabase passkey authentication documentation"
[2]: https://www.w3.org/TR/webauthn-3/ "W3C Web Authentication Level 3 Recommendation"
[3]: https://developer.apple.com/documentation/localauthentication "Apple LocalAuthentication documentation"
[4]: https://developer.apple.com/documentation/localauthentication/logging-a-user-into-your-app-with-face-id-or-touch-id "Apple Face ID and Touch ID login guidance"
[5]: https://developer.android.com/identity/sign-in/biometric-auth "Android biometric authentication guidance"
