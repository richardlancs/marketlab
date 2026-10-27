/**
 * Trades as a CSV file (RFC 4180), for spreadsheets. Pure, so the escaping
 * rules are unit-tested.
 */
import type { AccountEvent, Trade } from "./trading";

/**
 * Quotes a text field when it needs it (commas, quotes, line breaks), doubling
 * any quotes inside. Text starting with = + - @ gets a leading ' so a
 * spreadsheet shows it rather than running it as a formula ("CSV injection").
 * Numbers are written as they are: a negative gain must stay a number.
 */
function field(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const HEADER = ["Date", "Time (UTC)", "Symbol", "Side", "Shares", "Price", "Total", "Realized gain", "Reason", "Note"];

/**
 * Trades, dividends and splits, newest first, like the activity list. Dates
 * are ISO (YYYY-MM-DD) so every spreadsheet reads them the same way. For a
 * dividend, Price is per share and Total is the cash paid; for a split, Price
 * is the ratio and Total is any cash paid for a fraction of a share.
 */
export function tradesToCsv(trades: readonly Trade[], events: readonly AccountEvent[] = []): string {
  const at = (time: number) => {
    const iso = new Date(time).toISOString();
    return [iso.slice(0, 10), iso.slice(11, 19)];
  };
  const rows = [
    ...trades.map((t) => ({ time: t.time, row: [...at(t.time), t.symbol, t.side, t.shares, t.price, Math.round(t.shares * t.price * 100) / 100, t.realizedGain ?? "", t.reason ?? "", t.note ?? ""] })),
    ...events.map((e) => ({ time: e.time, row: [...at(e.time), e.symbol, e.kind, e.shares, e.value, e.cash, "", "", ""] })),
  ]
    .sort((a, b) => b.time - a.time)
    .map((r) => r.row);
  return [HEADER, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}
