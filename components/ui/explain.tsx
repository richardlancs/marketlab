"use client";

import Link from "next/link";
import { useId } from "react";
import { GLOSSARY, type TermKey } from "@/lib/glossary";

/**
 * An ⓘ button that explains a term in plain English (lib/glossary.ts). It
 * uses the browser's built-in popover: it opens on click or Enter, closes on
 * Esc or a click elsewhere, and screen readers announce it, with no library.
 */
export function Explain({ term, className = "" }: { term: TermKey; className?: string }) {
  const id = useId();
  const entry = GLOSSARY[term];
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={`What is ${entry.title}?`}
        className={`inline-grid size-4 shrink-0 place-items-center rounded-full align-middle text-[10px] font-semibold text-muted ring-1 ring-current transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      >
        i
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={entry.title}
        className="m-auto w-[min(22rem,calc(100%-2rem))] rounded-2xl border border-border bg-surface p-4 text-left text-sm text-foreground shadow-2xl shadow-black/20 backdrop:bg-black/20"
      >
        <p className="font-semibold">{entry.title}</p>
        <p className="mt-1">{entry.short}</p>
        <p className="mt-2 text-muted">{entry.more}</p>
        <Link href={`/learn#${term}`} className="mt-3 inline-block text-xs font-medium text-accent hover:underline">
          All terms →
        </Link>
      </div>
    </>
  );
}
