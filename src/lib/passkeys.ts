import { supabase } from "@/integrations/supabase/client";

export const passkeysEnabled = import.meta.env.VITE_ENABLE_PASSKEYS === "true";

export function passkeysSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "PublicKeyCredential" in window &&
    typeof PublicKeyCredential !== "undefined"
  );
}

function authWithPasskeys() {
  return supabase.auth as typeof supabase.auth & {
    registerPasskey?: () => Promise<{ data: unknown; error: Error | null }>;
    signInWithPasskey?: () => Promise<{ data: unknown; error: Error | null }>;
  };
}

export async function registerPasskey() {
  if (!passkeysEnabled) throw new Error("Passkeys are not enabled for this build.");
  if (!passkeysSupported()) throw new Error("This browser cannot use passkeys here.");
  const method = authWithPasskeys().registerPasskey;
  if (!method) throw new Error("Passkey support is not enabled in the Supabase client yet.");
  return method.call(authWithPasskeys());
}

export async function signInWithPasskey() {
  if (!passkeysEnabled) throw new Error("Passkeys are not enabled for this build.");
  if (!passkeysSupported()) throw new Error("This browser cannot use passkeys here.");
  const method = authWithPasskeys().signInWithPasskey;
  if (!method) throw new Error("Passkey support is not enabled in the Supabase client yet.");
  return method.call(authWithPasskeys());
}
