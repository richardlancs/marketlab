import { divergingColor } from "@/lib/backtest/periods";

export interface HeatRow {
  label: string;
  /** null: no value (a month outside the run, or settings that couldn't run). */
  cells: (number | null)[];
  /** Optional per-cell note for screen readers and the tooltip, e.g. "partial month". */
  notes?: (string | undefined)[];
}

/**
 * A heatmap as an HTML table: every cell shows its number, and its color
 * (green for gains, red for losses, stronger for bigger values) only adds a
 * quick visual read on top. Being a real table, it reads row by row in a
 * screen reader, copies into a spreadsheet, and scrolls sideways on a phone
 * with the row labels kept in view.
 */
export function HeatTable({
  caption,
  corner,
  columns,
  rows,
  format,
  colorScale = "diverging",
  onSelect,
}: {
  caption: string;
  corner: string;
  columns: string[];
  rows: HeatRow[];
  format: (value: number) => string;
  /** "diverging": signed values around 0. "loss": values where bigger is worse (drawdowns), all in red. */
  colorScale?: "diverging" | "loss";
  /** Makes cells buttons, e.g. to open the settings behind a cell. */
  onSelect?: (row: number, column: number) => void;
}) {
  const values = rows.flatMap((r) => r.cells).filter((v): v is number => v !== null && Number.isFinite(v));
  const maxAbs = Math.max(...values.map(Math.abs), 1e-9);
  const colorOf = (v: number) => (colorScale === "loss" ? divergingColor(-Math.abs(v), maxAbs) : divergingColor(v, maxAbs));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-medium text-muted">
              {corner}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-1 py-1 text-right font-medium whitespace-nowrap text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.label}>
              <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-medium whitespace-nowrap">
                {row.label}
              </th>
              {row.cells.map((v, c) => {
                const note = row.notes?.[c];
                const text = v === null || !Number.isFinite(v) ? "" : format(v);
                const title = text && `${row.label}, ${columns[c]}: ${text}${note ? ` (${note})` : ""}`;
                const style = text ? { background: colorOf(v as number) } : undefined;
                return (
                  <td key={c} title={title || undefined} className="rounded-[4px] px-1.5 py-1.5 text-right whitespace-nowrap" style={style}>
                    {text && onSelect ? (
                      <button type="button" onClick={() => onSelect(r, c)} aria-label={`Open ${title}`} className="w-full text-right hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                        {text}
                      </button>
                    ) : (
                      <>
                        {text || <span className="text-muted">·</span>}
                        {note && <span className="sr-only"> ({note})</span>}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
