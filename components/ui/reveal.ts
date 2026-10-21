/**
 * Brings a section that just got new content into view on narrow screens,
 * where it sits below the form that produced it (a backtest's results under
 * its settings). The heading gets focus too, so screen readers announce it;
 * it needs tabIndex={-1}. Nothing happens where the layout is side by side,
 * or when the heading is already in the top half of the screen.
 */
export function revealOnPhone(heading: HTMLElement | null, query = "(max-width: 1023px)") {
  if (!heading || !matchMedia(query).matches) return;
  // The section it heads (a visually hidden heading has no useful position of its own).
  const section = heading.closest<HTMLElement>("[aria-labelledby]") ?? heading;
  const top = section.getBoundingClientRect().top;
  if (top >= 0 && top < innerHeight / 2) return;
  const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.style.scrollMarginTop = "5rem"; // clear of the sticky header
  section.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
  heading.focus({ preventScroll: true });
}
