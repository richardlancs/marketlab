import { ImageResponse } from "next/og";
import { formatPercent } from "@/lib/format";
import { seasonLabel } from "@/lib/seasons";
import { findEntry } from "./entry";

export const alt = "A player's place in a MarketLab season";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture shown when a player's season page is shared: place, name,
 * return, season. (The image renderer needs every element with more than one
 * child to be a flexbox, so mixed text is built as one string.)
 */
export default async function Image(props: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await props.params;
  const found = await findEntry(id, name, { fresh: true });
  const r = found?.row.return ?? 0;
  const tone = r > 0.00005 ? "#4ade80" : r < -0.00005 ? "#f87171" : "#e5e7eb";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0b1220, #111827 60%, #1e1b4b)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, fontWeight: 600 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #38bdf8, #3b82f6, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </div>
          {`MarketLab · ${seasonLabel(id)} season`}
        </div>
        {found ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 48 }}>
            <div style={{ fontSize: 200, fontWeight: 700, lineHeight: 1 }}>{`#${found.row.rank}`}</div>
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 20 }}>
              <div style={{ fontSize: 60, fontWeight: 600 }}>{found.row.displayName}</div>
              <div style={{ fontSize: 44, color: tone }}>
                {`${formatPercent(found.row.return)} · of ${found.board.entrants} ${found.board.entrants === 1 ? "player" : "players"}`}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 64, fontWeight: 600 }}>Monthly stock-picking seasons</div>
        )}
        <div style={{ fontSize: 28, color: "#9ca3af" }}>Everyone starts with $100,000 · simulated prices · not investment advice</div>
      </div>
    ),
    size,
  );
}
