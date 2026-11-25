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

function AccountPage() {
  const { user } = useSession();
  const guest = !!user?.is_anonymous;
  const [mode, setMode] = useState<"save" | "signin">("save");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
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
