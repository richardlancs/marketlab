"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { NAME_LIMITS } from "@/lib/leaderboard";
import { joinSeasonAction, seasonStatusAction, type SeasonStatus } from "@/lib/season-actions";
import { JOIN_DAYS, seasonLabel } from "@/lib/seasons";

/**
 * Your part in a season, at the top of its page: sign in or join (with a
 * display name), or, once in, your place, a switch to your season
 * portfolio, and a link to share your result.
 */
export function SeasonPanel({ seasonId, ranks, entrants }: { seasonId: string; ranks: Record<string, number>; entrants: number }) {
  const { mode, book, books, chooseBook } = useAccount();
  const router = useRouter();
  const [status, setStatus] = useState<SeasonStatus | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (mode === "loading") return;
    let cancelled = false;
    seasonStatusAction(seasonId).then((s) => {
      if (cancelled) return;
      setStatus(s);
      if (s?.suggestedName) setName((n) => n || s.suggestedName);
    }, () => {});
    return () => {
      cancelled = true;
    };
  }, [seasonId, mode]);

  if (!status) return <div className="h-24" aria-hidden />;
  const label = seasonLabel(seasonId, { short: true });

  function join(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    start(async () => {
      const result = await joinSeasonAction(seasonId, name);
      if (!result.ok) return setMessage(result.message);
      await chooseBook(result.book);
      setStatus(await seasonStatusAction(seasonId));
    });
  }

  async function share(nameKey: string) {
    const url = `${location.origin}/leaderboard/season/${seasonId}/${encodeURIComponent(nameKey)}`;
    try {
      if (navigator.share) await navigator.share({ title: `My ${label} season on MarketLab`, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared("Link copied.");
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  if (!status.signedIn) {
    return (
      <p className="text-sm">
        <Link href="/sign-in" className="tap font-medium text-accent hover:underline">
          Sign in
        </Link>{" "}
        {status.canJoin ? `to join the ${label} season with a fresh $100,000.` : "to join the next season."}
      </p>
    );
  }

  if (status.entry) {
    const place = ranks[status.entry.nameKey];
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="text-sm">
          You&apos;re playing as <strong className="font-semibold">{status.entry.displayName}</strong>
          {place ? (
            <>
              {" "}
              — <strong className="font-semibold">#{place}</strong> of {entrants}
            </>
          ) : null}
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const mine = books.find((b) => b.seasonId === seasonId);
                if (mine && book.id !== mine.id) await chooseBook(mine.id);
                router.push("/portfolio");
              })
            }
            className="inline-flex min-h-10 items-center rounded-full bg-accent-fill px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Your season portfolio
          </button>
          <button type="button" onClick={() => share(status.entry!.nameKey)} className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent">
            Share
          </button>
        </div>
        {shared && (
          <p role="status" className="w-full text-xs text-muted">
            {shared}
          </p>
        )}
      </div>
    );
  }

  if (!status.canJoin) return <p className="text-sm text-muted">Joining closes after a season&apos;s first {JOIN_DAYS} days. The next season opens on the 1st.</p>;

  return (
    <form onSubmit={join} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-full text-sm sm:basis-auto">
        <span className="mb-1 block font-medium">Your display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={NAME_LIMITS.min}
          maxLength={NAME_LIMITS.max}
          autoComplete="nickname"
          className="h-11 w-full rounded-xl border border-border bg-surface-raised px-3 focus-visible:outline-2 focus-visible:outline-accent"
        />
      </label>
      <button type="submit" disabled={pending} className="h-11 w-full rounded-full bg-accent-fill px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:w-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {pending ? "Joining…" : `Join the ${label} season`}
      </button>
      <p className="w-full text-xs text-muted">Shown on the standings instead of your name. You start with $100,000 in a separate portfolio; your practice portfolio stays as it is.</p>
      {message && (
        <p role="alert" className="w-full text-sm text-loss">
          {message}
        </p>
      )}
    </form>
  );
}
