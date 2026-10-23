"use client";

import { useEffect, useState } from "react";
import { formatPercent } from "@/lib/format";
import { myRaceAction } from "@/lib/season-actions";
import { STARTING_CASH } from "@/lib/seasons";

type Series = { displayName: string; points: { time: number; value: number }[] };

const WIDTH = 600;
const HEIGHT = 220;
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
const colorOf = (i: number, me: boolean) => (me ? "var(--accent)" : i < 3 ? COLORS[i] : "var(--muted)");

/**
 * The season so far: each of the top ten's return at every close, with your
 * own line added (in the accent colour) if you're playing. The top three
 * get colours; the rest stay grey, so the leaders stand out.
 */
export function RaceChart({ seasonId, top }: { seasonId: string; top: Series[] }) {
  const [mine, setMine] = useState<Series | null>(null);
  useEffect(() => {
    let cancelled = false;
    myRaceAction(seasonId).then((m) => !cancelled && setMine(m), () => {});
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  const series = [...top, ...(mine && !top.some((t) => t.displayName === mine.displayName) ? [mine] : [])].filter((s) => s.points.length > 0);
  if (series.length === 0) return <p className="py-8 text-center text-sm text-muted">The race starts at the season&apos;s first close.</p>;

  const times = series.flatMap((s) => s.points.map((p) => p.time));
  const returns = series.flatMap((s) => s.points.map((p) => p.value / STARTING_CASH - 1));
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const lo = Math.min(0, ...returns);
  const hi = Math.max(0, ...returns);
  const pad = (hi - lo) * 0.1 || 0.01;
  const x = (t: number) => (t1 === t0 ? WIDTH / 2 : ((t - t0) / (t1 - t0)) * WIDTH);
  const y = (r: number) => HEIGHT - ((r - (lo - pad)) / (hi - lo + 2 * pad)) * HEIGHT;
  const path = (s: Series) => s.points.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.value / STARTING_CASH - 1).toFixed(1)}`).join("");
  const leader = top[0];
  const lastReturn = (s: Series) => s.points.at(-1)!.value / STARTING_CASH - 1;

  return (
    <figure>
      <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-48 w-full overflow-visible sm:h-56" role="img" aria-label={`Returns at each close. ${leader?.points.length ? `Leading: ${leader.displayName}, ${formatPercent(lastReturn(leader))}.` : ""}${mine?.points.length ? ` You: ${formatPercent(lastReturn(mine))}.` : ""}`}>
        <line x1={0} x2={WIDTH} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity={0.6} />
        {/* Grey lines first, so the coloured ones and yours sit on top. */}
        {[...series]
          .map((s, i) => ({ s, i, me: mine?.displayName === s.displayName }))
          .sort((a, b) => Number(a.i < 3 || a.me) - Number(b.i < 3 || b.me))
          .map(({ s, i, me }) => (
            <path
              key={s.displayName}
              d={path(s)}
              fill="none"
              stroke={colorOf(i, me)}
              strokeWidth={me ? 3 : i < 3 ? 2 : 1}
              opacity={me || i < 3 ? 1 : 0.45}
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>
      {/*
       * Where each line is now (and all there is to see after the first
       * close). HTML dots over the SVG, because the SVG stretches to fit and
       * would squash circles into ovals.
       */}
      {series.map((s, i) => {
        const me = mine?.displayName === s.displayName;
        return (
          <span
            key={s.displayName}
            aria-hidden
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${me ? "size-3" : "size-2"}`}
            style={{ left: `${(x(s.points.at(-1)!.time) / WIDTH) * 100}%`, top: `${(y(lastReturn(s)) / HEIGHT) * 100}%`, background: colorOf(i, me), opacity: me || i < 3 ? 1 : 0.45 }}
          />
        );
      })}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {series.slice(0, 3).map((s, i) => (
          <span key={s.displayName} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: COLORS[i] }} />
            {s.displayName}
          </span>
        ))}
        {mine && mine.points.length > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span aria-hidden className="h-1 w-4 rounded bg-accent" />
            You
          </span>
        )}
        <span>Dashed: break-even</span>
      </figcaption>
    </figure>
  );
}
