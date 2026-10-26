"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none transition-colors focus-visible:border-accent";
const labelClass = "block text-sm font-medium";

/** What went wrong with a Google sign-in, from the `error` code Better Auth puts in the address. */
function googleError(code: string) {
  if (code === "access_denied") return "Google sign-in was cancelled.";
  if (code === "account_not_linked")
    return "There's already a MarketLab account with that email. Sign in with your password; once your email is verified, Google will sign in to the same account.";
  return "Google sign-in didn't work. Try again, or use your email and password.";
}

/**
 * The sign-in and sign-up form. It calls Better Auth from the browser; on
 * success the session cookie is set and the user goes to the dashboard.
 * With `google`, it also offers "Continue with Google", which leaves for
 * Google's page and comes back signed in.
 */
export function AuthForm({ mode, google = false }: { mode: "sign-in" | "sign-up"; google?: boolean }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signUp = mode === "sign-up";

  async function continueWithGoogle() {
    setPending(true);
    setError(null);
    // Leaves for Google; the browser comes back to callbackURL signed in, or to this page with ?error=….
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: location.pathname });
    if (error) {
      setPending(false);
      setError(error.status === 429 ? "Too many attempts. Wait a minute, then try again." : googleError(""));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    const { error } = signUp
      ? // callbackURL: where the confirmation link in the verification email leads back to.
        await authClient.signUp.email({ name: String(form.get("name")), email, password, callbackURL: "/email-verified" })
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
      {google && (
        <>
          {/* The address (?error=…) isn't known while the page is pre-rendered. */}
          <Suspense>
            <GoogleError />
          </Suspense>
          <button
            type="button"
            onClick={continueWithGoogle}
            disabled={pending}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-surface-raised text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted" role="separator" aria-label="or">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
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
        className="h-11 w-full rounded-full bg-accent-fill text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
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

/** Why the last Google sign-in failed, when Better Auth sent the browser back here with ?error=…. */
function GoogleError() {
  const code = useSearchParams().get("error");
  if (!code) return null;
  return (
    <p role="alert" className="rounded-xl bg-loss/10 px-3.5 py-2.5 text-sm text-loss">
      {googleError(code)}
    </p>
  );
}

/** Google's "G", in its own colours: Google's brand rules don't allow recolouring it to match a theme. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
