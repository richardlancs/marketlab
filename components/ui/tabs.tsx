"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Tab {
  /** Also the address's #fragment while the tab is open, so links and reloads keep it. */
  id: string;
  label: string;
  content: ReactNode;
  /** Shown when the content renders nothing (e.g. a card with no data for this stock). The content's cards are then stacked. */
  empty?: string;
}

/**
 * A page's sections as tabs, one shown at a time. Every panel is rendered
 * (server-rendered content streams in as usual, and a form keeps what was
 * typed when you switch away); the others are hidden.
 *
 * Follows the ARIA tabs pattern: the arrow keys, Home and End move between
 * tabs, and Tab moves into the open panel. With `sync` (the default) the open
 * tab is the address's #fragment; the first tab is open until the page has
 * loaded and read it.
 */
export function Tabs({ tabs, label, sync = true, sticky = true, className = "" }: { tabs: Tab[]; label: string; sync?: boolean; sticky?: boolean; className?: string }) {
  const base = useId();
  const [current, setCurrent] = useState(tabs[0].id);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // The ids as one string: a parent that re-renders passes a new array with the same tabs.
  const ids = tabs.map((t) => t.id).join(" ");
  useEffect(() => {
    if (!sync) return;
    const read = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (ids.split(" ").includes(id)) setCurrent(id);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, [sync, ids]);

  function open(id: string, focus = false) {
    setCurrent(id);
    if (focus) buttons.current.get(id)?.focus();
    // replaceState, not a new history entry: Back leaves the page rather than stepping through tabs.
    if (sync) history.replaceState(history.state, "", id === tabs[0].id ? location.pathname + location.search : `#${id}`);
  }

  function onKeyDown(event: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === current);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    open(tabs[(to + tabs.length) % tabs.length].id, true);
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        // On phones, sticky under the header, so the tabs stay at hand on a long panel, and edge to edge (the negative margins), so the row can scroll sideways. Wider screens have room to scroll back up.
        className={`-mx-4 flex overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:px-0 ${sticky ? "sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-30 bg-background/85 backdrop-blur-xl md:static md:bg-transparent md:backdrop-blur-none" : ""}`}
      >
        <div className="flex gap-1 rounded-full bg-foreground/[0.06] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                if (el) buttons.current.set(t.id, el);
                else buttons.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={t.id === current}
              aria-controls={`${base}-${t.id}-panel`}
              tabIndex={t.id === current ? 0 : -1}
              onClick={() => open(t.id)}
              className="flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-selected:bg-surface aria-selected:text-foreground aria-selected:shadow-sm"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-${t.id}-panel`}
          aria-labelledby={`${base}-${t.id}-tab`}
          hidden={t.id !== current}
          // Showing a hidden element restarts its animation, so each tab fades in as it opens.
          className="mt-4 animate-fade-up lg:mt-6"
        >
          {t.empty ? (
            <>
              <div className="peer flex flex-col gap-4 empty:hidden lg:gap-6">{t.content}</div>
              <p className="hidden rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-muted peer-empty:block">{t.empty}</p>
            </>
          ) : (
            t.content
          )}
        </div>
      ))}
    </div>
  );
}
