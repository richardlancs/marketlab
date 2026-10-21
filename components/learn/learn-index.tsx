"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GROUPS, type TermKey } from "@/lib/glossary";
import { lastUnfinished, passedTerms } from "@/lib/lessons/progress";
import { useLearnProgress } from "./learn-progress-provider";

export interface LessonCard {
  term: TermKey;
  href: string;
  title: string;
  short: string;
  group: (typeof GROUPS)[number];
  minutes: number;
  interactive: boolean;
}

type Filter = (typeof GROUPS)[number] | "All";

const matches = (card: LessonCard, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || card.title.toLowerCase().includes(q) || card.short.toLowerCase().includes(q);
};

/**
 * The lesson list: progress, a "continue" link, search and group filters.
 * The chosen group lives in the address (?group=…), so a lesson's breadcrumb
 * can link straight to its group.
 */
export function LearnIndex({ cards }: { cards: LessonCard[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("group");
  const filter: Filter = GROUPS.find((g) => g === requested) ?? "All";
  const [query, setQuery] = useState("");
  const { status, storage, progress } = useLearnProgress();
  const done = passedTerms(progress);

  const setFilter = (next: Filter) => {
    const search = next === "All" ? "" : `?group=${encodeURIComponent(next)}`;
    router.replace(`${pathname}${search}`, { scroll: false });
  };

  const visible = cards.filter((c) => (filter === "All" || c.group === filter) && matches(c, query));
  // The lesson you were last working on, or else the first one not yet passed.
  const unfinished = lastUnfinished(progress);
  const next = cards.find((c) => c.term === unfinished) ?? cards.find((c) => !done.includes(c.term)) ?? cards[0];
  const passed = cards.filter((c) => done.includes(c.term)).length;
  const resuming = next.term === unfinished;

  return (
    <>
      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
          <p className="text-xs font-medium tracking-wide text-accent uppercase">{resuming ? "Pick up where you left off" : passed === 0 ? "Start here" : "Next up"}</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{next.title}</p>
          <p className="mt-1 text-sm text-foreground/80">{next.short}</p>
          <Link
            href={next.href}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-fill px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {resuming ? "Continue the lesson" : passed === 0 ? "Start the first lesson" : "Next lesson"} <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Your progress</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {passed} <span className="text-base font-normal text-muted">of {cards.length} passed</span>
          </p>
          <div
            role="progressbar"
            aria-label="Lessons passed"
            aria-valuemin={0}
            aria-valuemax={cards.length}
            aria-valuenow={passed}
            className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/[0.06]"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(passed / cards.length) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Pass a lesson’s short test to tick it off.{" "}
            {status === "loading" ? "Loading your progress…" : storage === "account" ? "Saved to your account." : "Saved for this browser; sign in to keep it on every device."}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative sm:w-64">
          <span className="sr-only">Search lessons</span>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons"
            className="w-full rounded-full border border-border bg-surface py-2 pr-4 pl-9 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <div role="group" aria-label="Show group" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {(["All", ...GROUPS] as Filter[]).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={filter === g}
              onClick={() => setFilter(g)}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent-fill aria-pressed:text-white"
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {visible.length} {visible.length === 1 ? "lesson" : "lessons"} shown
      </p>

      <div className="mt-8 space-y-10">
        {GROUPS.map((group) => {
          const groupCards = visible.filter((c) => c.group === group);
          if (groupCards.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`} className="text-lg font-semibold tracking-tight">
                {group}
              </h2>
              {/* Phones: one card per group with a row per lesson. From sm: a grid of cards. */}
              <ol className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-3">
                {groupCards.map((card) => {
                  const isDone = done.includes(card.term);
                  const best = progress[card.term]?.bestScore;
                  return (
                    // The id keeps old /learn#sharpe links (from before lessons had pages) landing on the card.
                    <li key={card.term} id={card.term} className="scroll-mt-24">
                      <Link
                        href={card.href}
                        className="group flex h-full flex-col px-4 py-3 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:rounded-2xl sm:border sm:border-border sm:bg-linear-to-b sm:from-surface-raised sm:to-surface sm:p-4 sm:shadow-sm sm:shadow-black/[0.03] sm:hover:border-accent/40 sm:hover:bg-transparent"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold group-hover:text-accent">{card.title}</span>
                          {!isDone && best != null && (
                            <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-muted" title="Best score so far">
                              {best} of {progress[card.term]!.total}
                            </span>
                          )}
                          {isDone && (
                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gain/15 text-xs font-semibold text-gain" title="Passed">
                              ✓<span className="sr-only"> Passed</span>
                            </span>
                          )}
                        </span>
                        <span className="mt-1 line-clamp-2 flex-1 text-sm text-muted sm:line-clamp-none">{card.short}</span>
                        <span className="mt-2 flex items-center gap-2 text-xs text-muted sm:mt-3">
                          <span>{card.minutes} min</span>
                          {card.interactive && <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">Interactive</span>}
                          <span aria-hidden className="ml-auto transition-transform group-hover:translate-x-0.5">
                            →
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No lessons match “{query}”.{" "}
            <button type="button" onClick={() => setQuery("")} className="font-medium text-accent hover:underline">
              Clear the search
            </button>
          </p>
        )}
      </div>
    </>
  );
}
