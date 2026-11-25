import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle, SectionLabel } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  passkeysEnabled,
  passkeysSupported,
  registerPasskey,
  signInWithPasskey,
} from "@/lib/passkeys";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Steady" },
      {
        name: "description",
        content: "Save your progress with an email and password, or sign in on another device.",
      },
      { property: "og:title", content: "Account — Steady" },
      {
        property: "og:description",
        content: "Save your progress with an email and password, or sign in on another device.",
      },
    ],
  }),
  component: AccountPage,
});

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.95h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.25Z"
      />
      <path
        fill="#34A853"
        d="M12 21.5c2.63 0 4.84-.87 6.45-2.37l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.29v2.53A9.74 9.74 0 0 0 12 21.5Z"
      />
      <path
        fill="#FBBC05"
        d="M6.53 13.57a5.85 5.85 0 0 1 0-3.14V7.9H3.29a9.5 9.5 0 0 0 0 8.2l3.24-2.53Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.4c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.47 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.71 5.4l3.24 2.53C7.3 8.12 9.46 6.4 12 6.4Z"
      />
    </svg>
  );
}

function AccountPage() {
  const { user } = useSession();
  const guest = !!user?.is_anonymous;
  const [mode, setMode] = useState<"save" | "signin">("save");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const canUsePasskeys = passkeysEnabled && passkeysSupported();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (password.length < 8) {
      toast.error("Use at least 8 characters for your password");
      return;
    }
    setBusy(true);
    if (mode === "save") {
      const { error } = await supabase.auth.updateUser(
        { email, password },
        { emailRedirectTo: `${window.location.origin}/account` },
      );
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Signed in");
    }
  };

  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    const redirectTo = `${window.location.origin}/account`;
    const result = guest
      ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    setGoogleBusy(false);
    if (result.error) {
      const message = result.error.message.toLowerCase().includes("manual linking")
        ? "Enable Manual Linking in Supabase Auth settings to save guest progress with Google."
        : result.error.message;
      toast.error(message);
    }
  };

  const createPasskey = async () => {
    setPasskeyBusy(true);
    const { error } = await registerPasskey();
    setPasskeyBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Passkey added");
  };

  const loginWithPasskey = async () => {
    setPasskeyBusy(true);
    const { error } = await signInWithPasskey();
    setPasskeyBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed in with passkey");
  };

  if (!guest)
    return (
      <>
        <PageTitle title="Account" sub="Your progress is saved to your account." />
        <div className="rounded-2xl border bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 font-medium">{user?.email}</p>
        </div>
        {canUsePasskeys && (
          <Button
            variant="outline"
            className="mt-4 w-full rounded-xl"
            onClick={createPasskey}
            disabled={passkeyBusy}
          >
            {passkeyBusy ? "Waiting for passkey…" : "Create a passkey"}
          </Button>
        )}
        <Button
          variant="outline"
          className="mt-4 w-full rounded-xl"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </Button>
      </>
    );

  return (
    <>
      <PageTitle title="Account" sub="You're using Steady as a guest." />
      <p className="text-sm text-muted-foreground">
        Your goals and points are saved on this device's guest session. Add an email and password to
        keep them safe and use them anywhere.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <button
          onClick={() => {
            setMode("save");
            setSent(false);
          }}
          className={`rounded-lg py-2 text-sm font-medium ${mode === "save" ? "bg-card shadow-soft" : "text-muted-foreground"}`}
        >
          Save my progress
        </button>
        <button
          onClick={() => {
            setMode("signin");
            setSent(false);
          }}
          className={`rounded-lg py-2 text-sm font-medium ${mode === "signin" ? "bg-card shadow-soft" : "text-muted-foreground"}`}
        >
          I have an account
        </button>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={googleBusy || busy}
        onClick={continueWithGoogle}
        className="mt-5 w-full rounded-xl"
      >
        <GoogleIcon />
        {googleBusy ? "Connecting to Google…" : mode === "save" ? "Save with Google" : "Sign in with Google"}
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {sent ? (
        <div className="mt-5 rounded-2xl border border-success/25 bg-success-soft/60 px-4 py-4 text-sm">
          <p className="font-medium text-success-ink">Check your inbox</p>
          <p className="mt-1 text-muted-foreground">
            We sent a confirmation link to {email}. Once you confirm, your progress is tied to that
            account. Keep using the app in the meantime.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-email">Email</Label>
            <Input
              id="a-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-pw">Password</Label>
            <Input
              id="a-pw"
              type="password"
              autoComplete={mode === "save" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === "signin" && (
            <p className="text-xs text-muted-foreground">
              Signing in switches to that account. Progress made as a guest on this device won't
              carry over.
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full rounded-xl">
            {busy ? "Please wait…" : mode === "save" ? "Save my progress" : "Sign in"}
          </Button>
          {mode === "signin" && canUsePasskeys && (
            <Button
              type="button"
              variant="outline"
              disabled={passkeyBusy}
              onClick={loginWithPasskey}
              className="w-full rounded-xl"
            >
              {passkeyBusy ? "Waiting for passkey…" : "Sign in with a passkey"}
            </Button>
          )}
        </form>
      )}
      <SectionLabel>Why an account?</SectionLabel>
      <p className="text-sm text-muted-foreground">
        Guest progress lives in this browser. Clearing it, or switching devices, would start you
        fresh.
      </p>
    </>
  );
}
