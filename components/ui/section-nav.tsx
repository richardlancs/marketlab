"use client";

import { useEffect, useState } from "react";

export interface SectionLink {
  /** The id of the section's heading (what its card's aria-labelledby names). */
  id: string;
  label: string;
}

/** Height of the phone header, plus breathing room: where a section's heading lands after a jump. */
const UNDER_HEADER = "calc(3.5rem + 3.25rem + env(safe-area-inset-top))";

/**
 * A row of chips that jump to the sections of a long page, for phones (on
 * wider screens the page is short enough, or side by side). It sticks under
 * the header, lists only the sections that are on the page (some stream in
 * later, some only exist for some stocks), and marks the one being read.
 */
export function SectionNav({ sections, label, className = "" }: { sections: SectionLink[]; label: string; className?: string }) {
  const [present, setPresent] = useState<SectionLink[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const find = () => setPresent((before) => {
      const now = sections.filter((s) => document.getElementById(s.id));
      return now.length === before.length && now.every((s, i) => s.id === before[i].id) ? before : now;
    });
    find();
    // Sections stream in after the page loads.
    const changes = new MutationObserver(find);
    changes.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
    return () => changes.disconnect();
  }, [sections]);

  useEffect(() => {
    // The current section: the last one whose heading has scrolled past the top third of the screen.
    const update = () => {
      let last: string | null = null;
      for (const s of present) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < innerHeight / 3) last = s.id;
      }
      setCurrent(last);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, [present]);

  if (present.length < 2) return null;
  return (
    <nav
      aria-label={label}
      // Sticky within its parent: place it directly in <main>, not in a wrapper.
      className={`sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-30 -mx-4 mb-2 flex gap-2 overflow-x-auto border-b border-border bg-background/85 px-4 py-2 backdrop-blur-xl [scrollbar-width:none] md:hidden ${className}`}
    >
      {present.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={current === s.id ? "location" : undefined}
          onClick={(e) => {
            const target = document.getElementById(s.id);
            if (!target) return;
            e.preventDefault();
            target.style.scrollMarginTop = UNDER_HEADER;
            target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
            history.replaceState(null, "", `#${s.id}`);
          }}
          className="flex min-h-9 shrink-0 items-center rounded-full bg-foreground/[0.06] px-3.5 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-[current=location]:bg-accent-fill aria-[current=location]:text-white"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
