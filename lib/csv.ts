/**
 * Trades as a CSV file (RFC 4180), for spreadsheets. Pure, so the escaping
 * rules are unit-tested.
 */
import type { Trade } from "./trading";

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

const HEADER = ["Date", "Time (UTC)", "Symbol", "Side", "Shares", "Price", "Total", "Realized gain"];

/** Newest first, like the trade history. Dates are ISO (YYYY-MM-DD) so every spreadsheet reads them the same way. */
export function tradesToCsv(trades: readonly Trade[]): string {
  const rows = trades.map((t) => {
    const iso = new Date(t.time).toISOString();
    return [iso.slice(0, 10), iso.slice(11, 19), t.symbol, t.side, t.shares, t.price, Math.round(t.shares * t.price * 100) / 100, t.realizedGain ?? ""];
  });
  return [HEADER, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}
