"use client";

import { useState } from "react";
import { FACTORS, factorContributions, type Factor } from "@/lib/lessons/demos";
import { Choice, DemoFrame, signedPercent, Slider, Stat, StatRow } from "./parts";

type Exposures = Record<Factor, number>;

const STOCKS = [
  { value: "tech", label: "Big tech stock", exposures: { Market: 1.2, Size: -0.4, Value: -0.6, Momentum: 0.3, "Low volatility": -0.4 } },
  { value: "bank", label: "Smaller bank", exposures: { Market: 1.1, Size: 0.6, Value: 0.7, Momentum: -0.1, "Low volatility": 0 } },
  { value: "utility", label: "Utility", exposures: { Market: 0.5, Size: 0.1, Value: 0.3, Momentum: 0, "Low volatility": 0.6 } },
] as const satisfies readonly { value: string; label: string; exposures: Exposures }[];

/** Made-up but plausible years for each factor. */
const YEARS = [
  { value: "rally", label: "Tech-led rally", returns: { Market: 0.2, Size: -0.04, Value: -0.08, Momentum: 0.06, "Low volatility": -0.05 } },
  { value: "value", label: "Value comeback", returns: { Market: 0.05, Size: 0.03, Value: 0.1, Momentum: -0.06, "Low volatility": 0.02 } },
  { value: "crash", label: "Crash year", returns: { Market: -0.2, Size: -0.03, Value: 0.02, Momentum: -0.08, "Low volatility": 0.09 } },
] as const satisfies readonly { value: string; label: string; returns: Exposures }[];

/** Factor investing and alpha: a year's return split into what each factor exposure earned, plus what's left. */
export function FactorDemo() {
  const [stock, setStock] = useState<(typeof STOCKS)[number]["value"]>("tech");
  const [year, setYear] = useState<(typeof YEARS)[number]["value"]>("rally");
  const [exposures, setExposures] = useState<Exposures>(STOCKS[0].exposures);
  const [alpha, setAlpha] = useState(0);
  const returns = YEARS.find((y) => y.value === year)!.returns;
  const { parts, total } = factorContributions(exposures, returns, alpha);
  const rows = [...parts.map((p) => ({ label: p.factor, value: p.contribution })), { label: "Alpha", value: alpha }];
  const max = Math.max(0.01, ...rows.map((r) => Math.abs(r.value)));
  const pickStock = (value: (typeof STOCKS)[number]["value"]) => {
    setStock(value);
    setExposures(STOCKS.find((s) => s.value === value)!.exposures);
  };
  return (
    <DemoFrame title="Where did the return come from?" note="Made-up factor returns. Adding the parts is a simplification: real returns compound day by day.">
      <div className="flex flex-wrap gap-2">
        <Choice label="Example stock" options={STOCKS} value={stock} onChange={pickStock} />
        <Choice label="The year" options={YEARS} value={year} onChange={setYear} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FACTORS.map((factor) => (
          <Slider
            key={factor}
            label={`${factor} beta (factor ${signedPercent(returns[factor])})`}
            value={exposures[factor]}
            min={factor === "Market" ? 0 : -1}
            max={factor === "Market" ? 2 : 1}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setExposures((e) => ({ ...e, [factor]: v }))}
          />
        ))}
        <Slider label="Alpha (what's left over)" value={alpha} min={-0.05} max={0.05} step={0.005} format={signedPercent} onChange={setAlpha} />
      </div>
      <ul className="space-y-1.5" aria-label="The year's return, by source">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-2 text-sm">
            <span className="text-muted">{r.label}</span>
            <span aria-hidden className="relative h-3 rounded-sm bg-foreground/[0.04]">
              <span
                className={`absolute inset-y-0 left-1/2 rounded-sm ${r.value >= 0 ? "bg-gain/70" : "bg-loss/70"}`}
                style={r.value >= 0 ? { width: `${(r.value / max) * 50}%` } : { width: `${(-r.value / max) * 50}%`, transform: "translateX(-100%)" }}
              />
            </span>
            <span className="text-right tabular-nums">{signedPercent(r.value)}</span>
          </li>
        ))}
      </ul>
      <StatRow>
        <Stat label="The stock's return" value={signedPercent(total)} tone={total >= 0 ? "gain" : "loss"} />
        <Stat label="Explained by factors" value={signedPercent(total - alpha)} />
        <Stat label="From the market alone" value={signedPercent(parts[0].contribution)} hint={`Beta ${exposures.Market.toFixed(1)} × ${signedPercent(returns.Market)}`} />
      </StatRow>
    </DemoFrame>
  );
}
