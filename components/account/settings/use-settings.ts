"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { accountSettingsAction, type AccountSettings } from "@/lib/profile-actions";

/**
 * The session (from the browser, like the account menu) and what the account
 * pages need to know about it from the server: how this person signs in, and
 * whether this site can send email. `settings` is null while loading.
 */
export function useAccountSettings() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<{ for: string | null; settings: AccountSettings } | null>(null);

  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    accountSettingsAction()
      .then((settings) => !cancelled && setLoaded({ for: userId, settings }))
      .catch(() => !cancelled && setLoaded({ for: userId, settings: { kind: "none" } }));
    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);

  // Settings fetched for someone else (before signing in or out) don't count.
  const settings = !isPending && loaded?.for === userId ? loaded.settings : null;
  return { session, settings, refetchSession: () => refetch() };
}

/** Starts a Google sign-in that comes back to `path` with a fresh session (for changes that need a recent sign-in). */
export async function signInWithGoogleAgain(path: string) {
  await authClient.signIn.social({ provider: "google", callbackURL: path, errorCallbackURL: path });
}
