"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { ChangeBadge } from "@/components/ui/change-badge";
import { formatCurrency } from "@/lib/format";
import { isSymbolFormat, normalizeSymbol } from "@/lib/market/symbols";
import { searchStocks } from "@/lib/search";
import type { StockQuote } from "@/lib/types";
import { StockLogo } from "@/components/stocks/stock-logo";

/** A search result: a stock with today's price, a catalog stock (priced on its page), or "open any ticker". */
type Result = { symbol: string; name: string; quote?: StockQuote; open?: true };

/** Opens the dialog (if it isn't already) and puts the cursor in the search box. */
function show(dialog: HTMLDialogElement | null, input: HTMLInputElement | null) {
  // showModal(), not show(): it blocks the page behind, traps Tab inside the
  // dialog, closes on Esc and draws the ::backdrop, all built into the browser.
  if (dialog && !dialog.open) dialog.showModal();
  input?.focus();
  input?.select();
}

// The shortcut hint depends on the platform: ⌘K on Apple devices, Ctrl K
// elsewhere. The server can't know which, so it renders no hint (null), and
// the browser fills it in right after hydration. useSyncExternalStore makes
// that switch without a hydration mismatch.
const noSubscribe = () => () => {};
function useShortcutLabel() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => null,
  );
}

/**
 * The header's search button and the search dialog it opens. ⌘K or Ctrl+K
 * opens it from anywhere.
 *
 * Accessibility follows the WAI-ARIA combobox pattern: focus stays in the text
 * box the whole time, and the arrow keys move a highlight through the results.
 * `aria-activedescendant` tells screen readers which result is highlighted.
 */
export function SearchDialog() {
  const router = useRouter();
  // The stock list comes from <AccountProvider>, which the root layout fills
  // from the server, so no API route is needed. Stocks with a price show it;
  // the rest of the catalog shows its sector, and gets its price on its page.
  const { quotes, listings, openTickers } = useAccount();
  const priced: Result[] = Object.values(quotes).map((quote) => ({ symbol: quote.symbol, name: quote.name, quote }));
  const searchable: Result[] = [...priced, ...listings.filter((l) => !quotes[l.symbol]).map((l) => ({ symbol: l.symbol, name: l.name }))];
  const sectors = Object.fromEntries(listings.map((l) => [l.symbol, l.sector]));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const shortcut = useShortcutLabel();
  const listboxId = useId();

  // No query yet: list the stocks with prices, so the dialog also works for browsing.
  const matches = query.trim() ? searchStocks(query, searchable) : priced;
  // With real data any ticker can be opened: offer one that isn't listed. Its page says if it doesn't exist.
  const typed = normalizeSymbol(query);
  const results: Result[] =
    openTickers && isSymbolFormat(typed) && !matches.some((r) => r.symbol === typed) ? [...matches, { symbol: typed, name: "Open this ticker", open: true }] : matches;
  const active = results[activeIndex];
  const optionId = (symbol: string) => `${listboxId}-${symbol}`;

  // ⌘K / Ctrl+K anywhere on the page. preventDefault stops the browser's own
  // use of the shortcut (Ctrl+K focuses the address bar in some browsers).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show(dialogRef.current, inputRef.current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep the highlighted result visible when the arrow keys move it past the
  // edge of the scrolling list.
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function open(symbol: string) {
    router.push(`/stocks/${symbol}`);
    dialogRef.current?.close();
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    // preventDefault: otherwise ↑/↓ also move the text cursor to the start or end.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length); // wraps around at the bottom
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      open(active.symbol);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => show(dialogRef.current, inputRef.current)}
        aria-label="Search stocks"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        // An icon button up to 1024px (lg), where the nav needs the room; a search-box-shaped button above.
        className="flex size-9 items-center justify-center gap-2 rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent active:scale-95 lg:w-56 lg:justify-start lg:border lg:border-border lg:bg-foreground/[0.03] lg:pr-2 lg:pl-3 lg:active:scale-100"
      >
        <SearchIcon />
        <span className="hidden flex-1 text-left text-sm lg:block">Search stocks</span>
        {shortcut && (
          <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-sans text-[11px] leading-none lg:block">{shortcut}</kbd>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Search stocks"
        // Closing by any route (Esc, a result, the backdrop) starts the next search fresh.
        onClose={() => {
          setQuery("");
          setActiveIndex(0);
        }}
        // A click on the dialog element itself (not on anything inside it) can
        // only be on the backdrop, because the panel fills the whole dialog.
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
        className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-lg animate-pop-in overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl shadow-black/20 backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:mt-[12vh]"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 text-muted">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search stocks"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={results.length > 0}
            aria-activedescendant={active ? optionId(active.symbol) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Symbol or company name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0); // the best match is always highlighted first
            }}
            onKeyDown={onInputKeyDown}
            // 16px text (text-base): smaller makes iPhones zoom in on focus.
            className="h-13 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-sans text-[11px] leading-none sm:block">esc</kbd>
        </div>

        {results.length > 0 ? (
          <ul ref={listRef} id={listboxId} role="listbox" aria-label="Stocks" className="max-h-[min(22rem,60vh)] overflow-y-auto p-2">
            {results.map((stock, i) => (
              <li
                key={stock.symbol}
                id={optionId(stock.symbol)}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => open(stock.symbol)}
                // mousemove, not mouseenter: scrolling the list under a still
                // pointer shouldn't steal the highlight from the keyboard.
                onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${i === activeIndex ? "bg-foreground/[0.06]" : ""}`}
              >
                <StockLogo symbol={stock.symbol} size={28} />
                <span className="w-14 shrink-0 text-sm font-semibold">{stock.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{stock.name}</span>
                {stock.quote ? (
                  <>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(stock.quote.price)}</span>
                    <ChangeBadge change={stock.quote.change} percent={stock.quote.changePercent} variant="pill" className="shrink-0" />
                  </>
                ) : (
                  !stock.open && <span className="hidden shrink-0 text-xs text-muted sm:block">{sectors[stock.symbol]}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">
            No stocks match &ldquo;<span className="text-foreground">{query.trim()}</span>&rdquo;.
          </p>
        )}

        {/* Announces the number of results to screen readers as the user types. */}
        <p aria-live="polite" className="sr-only">
          {query.trim() ? `${results.length} ${results.length === 1 ? "result" : "results"}` : ""}
        </p>

        <p className="hidden gap-4 border-t border-border px-4 py-2.5 text-xs text-muted sm:flex" aria-hidden>
          <span>↑↓ to move</span>
          <span>↵ to open</span>
        </p>
      </dialog>
    </>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4 shrink-0" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
