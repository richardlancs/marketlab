"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none transition-colors focus-visible:border-accent";
const labelClass = "block text-sm font-medium";

/**
 * The sign-in and sign-up form. It calls Better Auth from the browser; on
 * success the session cookie is set and the user goes to the dashboard.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    const { error } = signUp
      ? await authClient.signUp.email({ name: String(form.get("name")), email, password })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      // Better Auth's messages are written for users ("Invalid email or
      // password"); 429 means the rate limit kicked in.
      setError(error.status === 429 ? "Too many attempts. Wait a minute, then try again." : (error.message ?? "Something went wrong. Try again."));
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (session) {
    return (
      <p className="text-sm">
        You&apos;re signed in as <span className="font-medium">{session.user.email}</span>.{" "}
        <Link href="/" className="text-accent hover:underline">
          Go to the dashboard
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {signUp && (
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input id="name" name="name" required autoComplete="name" className={inputClass} />
        </div>
      )}
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={signUp ? 8 : undefined}
          // Tells password managers whether to fill a saved password or offer to save a new one.
          autoComplete={signUp ? "new-password" : "current-password"}
          aria-describedby={signUp ? "password-hint" : undefined}
          className={inputClass}
        />
        {signUp && (
          <p id="password-hint" className="mt-1 text-xs text-muted">
            At least 8 characters.
          </p>
        )}
      </div>

      {/* role="alert" announces the error to screen readers as soon as it appears. */}
      <p role="alert" className="min-h-5 text-sm text-loss">
        {error}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-accent text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
      >
        {pending ? (signUp ? "Creating account…" : "Signing in…") : signUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-muted">
        {signUp ? "Already have an account? " : "New to MarketLab? "}
        <Link href={signUp ? "/sign-in" : "/sign-up"} className="text-accent hover:underline">
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
