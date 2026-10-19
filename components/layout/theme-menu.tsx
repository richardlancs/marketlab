"use client";

import { useId, useState } from "react";

const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "pastel", label: "Pastel" },
] as const;

/**
 * The pastel theme's tints. `swatch` is that undertone's page color, and
 * `accent` its accent, for the little preview circles (the real values are
 * in globals.css).
 */
const UNDERTONES = [
  { id: "sand", label: "Sand", swatch: "#f3eee6", accent: "#8a6748" },
  { id: "sage", label: "Sage", swatch: "#ecf1ea", accent: "#357550" },
  { id: "mist", label: "Mist", swatch: "#ebf0f5", accent: "#3f6596" },
  { id: "rose", label: "Rose", swatch: "#f5ecec", accent: "#94596a" },
  { id: "lavender", label: "Lavender", swatch: "#efedf6", accent: "#5f4fa0" },
] as const;

type Theme = (typeof THEMES)[number]["id"];
type Undertone = (typeof UNDERTONES)[number]["id"];

/** Switches the page's colors and remembers the choice for the next visit. */
function setTheme(theme: Theme, undertone: Undertone) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.undertone = undertone;
  try {
    localStorage.setItem("theme", theme);
    localStorage.setItem("undertone", undertone);
  } catch {
    // Storage can be unavailable (private mode); the switch still works for this visit.
  }
}

/**
 * Light, dark or pastel, and for pastel an undertone. Like the account menu,
 * it uses the browser's `popover` attribute, so clicking outside or pressing
 * Esc closes it.
 *
 * The current theme lives in the DOM (<html data-theme data-undertone>), set
 * by the inline script in layout.tsx before hydration. The menu copies it into
 * state each time it opens, so the server never has to know it.
 */
export function ThemeMenu() {
  const menuId = useId();
  const [current, setCurrent] = useState<{ theme: Theme; undertone: Undertone }>({ theme: "dark", undertone: "sand" });

  function readCurrent() {
    const { theme, undertone } = document.documentElement.dataset;
    setCurrent({
      theme: THEMES.some((t) => t.id === theme) ? (theme as Theme) : "dark",
      undertone: UNDERTONES.some((u) => u.id === undertone) ? (undertone as Undertone) : "sand",
    });
  }

  function apply(theme: Theme, undertone: Undertone) {
    setTheme(theme, undertone);
    setCurrent({ theme, undertone });
  }

  const optionClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={readCurrent}
        aria-label="Theme"
        className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
      >
        {/* A painter's palette */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" />
          <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
          <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
          <circle cx="15.5" cy="8" r="1" fill="currentColor" />
        </svg>
      </button>
      <div
        id={menuId}
        popover="auto"
        // A popover is centered by default; this pins it under the header's right edge.
        className="fixed inset-auto top-16 right-4 m-0 w-60 rounded-2xl border border-border bg-surface p-2 text-foreground shadow-2xl shadow-black/20"
      >
        <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted">Theme</p>
        {THEMES.map((t) => (
          <button key={t.id} type="button" aria-pressed={current.theme === t.id} onClick={() => apply(t.id, current.undertone)} className={optionClass}>
            <Check visible={current.theme === t.id} />
            {t.label}
          </button>
        ))}

        <div className="my-1 border-t border-border" />
        <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted">Pastel undertone</p>
        {UNDERTONES.map((u) => {
          const selected = current.theme === "pastel" && current.undertone === u.id;
          return (
            // Picking an undertone also switches to the pastel theme.
            <button key={u.id} type="button" aria-pressed={selected} onClick={() => apply("pastel", u.id)} className={optionClass}>
              <Check visible={selected} />
              <span
                aria-hidden
                className="size-4 rounded-full border border-border"
                style={{ background: `linear-gradient(135deg, ${u.swatch} 50%, ${u.accent} 50%)` }}
              />
              {u.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Check({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-4 shrink-0 text-accent ${visible ? "" : "invisible"}`}
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
