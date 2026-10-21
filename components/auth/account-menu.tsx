"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { forgetDevice } from "@/components/alerts/push-device";
import { authClient } from "@/lib/auth-client";

/**
 * "Sign in" when signed out; when signed in, a round button with the user's
 * initial that opens a small menu. The menu uses the browser's built-in
 * `popover` attribute: clicking outside or pressing Esc closes it with no
 * extra code.
 *
 * The session is read in the browser, so every page can stay pre-rendered.
 */
export function AccountMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const menuId = useId();

  // Same size as the avatar, so nothing shifts while the session loads.
  if (isPending) return <div aria-hidden className="size-9" />;

  if (!session) {
    return (
      <Link
        href="/sign-in"
        className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
      >
        Sign in
      </Link>
    );
  }

  const { name, email } = session.user;
  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        aria-label={`Account: ${name}`}
        className="grid size-9 place-items-center rounded-full bg-linear-to-br from-brand-start to-brand-end text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </button>
      <div
        id={menuId}
        popover="auto"
        // A popover is centered by default; this pins it under the header's right edge.
        className="fixed inset-auto top-16 right-4 m-0 w-64 rounded-2xl border border-border bg-surface p-2 text-foreground shadow-2xl shadow-black/20"
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          {session.user.emailVerified && <p className="mt-1 text-xs font-medium text-gain">Email confirmed ✓</p>}
        </div>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          onClick={async () => {
            // This browser stops getting the account's alerts first, while it's still signed in to say so.
            await forgetDevice();
            await authClient.signOut();
            router.refresh();
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Sign out
        </button>
      </div>
    </>
  );
}
