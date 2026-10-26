"use client";

import { useId, useState, type FormEvent } from "react";
import { useAccount } from "@/components/account/account-provider";
import { ServiceError, useServiceData } from "@/components/ui/service-data";
import { PLAN_LIMITS, type GoalPlan } from "@/lib/analytics/plan";
import { formatCompactCurrency, formatShare } from "@/lib/format";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border bg-transparent px-3 text-base outline-none focus-visible:border-accent sm:text-sm";
const labelClass = "block text-xs font-medium text-muted";

interface Settings {
  monthly: number;
  years: number;
  target: number | null;
  inflation: boolean;
}

/**
 * The goal planner, under the projection: the same simulated futures, with
 * money added or taken out each month, a target, and inflation
 * (app/api/portfolio/plan). Runs when asked, not on every keystroke.
 */
export function GoalPlanner() {
  const { account } = useAccount();
  const id = useId();
  const [direction, setDirection] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("200");
  const [years, setYears] = useState("20");
  const [target, setTarget] = useState("");
  const [inflation, setInflation] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Planned again after a trade, with the same settings.
  const version = account ? JSON.stringify([account.cash, account.holdings.map((h) => [h.symbol, h.shares])]) : "";
  const state = useServiceData<{ plan: GoalPlan }>(settings ? { url: `/api/portfolio/plan?v=${encodeURIComponent(version)}`, body: settings } : null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const monthly = Number(amount || 0);
    const span = Number(years);
    const goal = target.trim() ? Number(target) : null;
    if (!Number.isFinite(monthly) || monthly < 0 || monthly > PLAN_LIMITS.maxMonthly) return setProblem("Enter a monthly amount of zero or more.");
    if (!Number.isInteger(span) || span < 1 || span > PLAN_LIMITS.maxYears) return setProblem(`Plan between 1 and ${PLAN_LIMITS.maxYears} years.`);
    if (goal !== null && (!Number.isFinite(goal) || goal <= 0)) return setProblem("The target should be a positive amount, or left empty.");
    setProblem(null);
    setSettings({ monthly: direction === "withdraw" ? -monthly : monthly, years: span, target: goal, inflation });
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mt-6 border-t border-border pt-5">
      <h3 id={`${id}-title`} className="text-base font-semibold tracking-tight">
        Plan a goal
      </h3>
      <p className="mt-1 text-sm text-muted">Add money each month, or take it out, and see how the same range of futures plays out.</p>
      <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
        <div>
          <label htmlFor={`${id}-direction`} className={labelClass}>
            Each month
          </label>
          <select id={`${id}-direction`} value={direction} onChange={(e) => setDirection(e.target.value as "add" | "withdraw")} className={inputClass}>
            <option value="add">Add</option>
            <option value="withdraw">Withdraw</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-amount`} className={labelClass}>
            Amount ($)
          </label>
          <input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${id}-years`} className={labelClass}>
            Years
          </label>
          <input id={`${id}-years`} type="number" min={1} max={PLAN_LIMITS.maxYears} value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${id}-target`} className={labelClass}>
            Target ($, optional)
          </label>
          <input id={`${id}-target`} inputMode="decimal" placeholder="e.g. 250000" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-stretch">
          <label className="tap flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inflation} onChange={(e) => setInflation(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Allow for inflation
          </label>
          <button type="submit" className="h-10 rounded-full bg-accent-fill px-5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Plan
          </button>
        </div>
      </form>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-loss">
          {problem}
        </p>
      )}
      <div aria-live="polite">
        {settings && state.status === "loading" && <div aria-busy className="mt-4 h-56 animate-pulse rounded-lg bg-foreground/[0.06]" />}
        {settings && state.status === "error" && <ServiceError message={state.message} onRetry={state.retry} />}
        {settings && state.status === "ok" && <PlanResult plan={state.data.plan} />}
      </div>
    </section>
  );
}

function PlanResult({ plan }: { plan: GoalPlan }) {
  const b = plan.bands;
  const months = plan.months.length;
  const top = Math.max(...b.p90.map((v) => v ?? 0), plan.target ?? 0, 1) * 1.05;
  const x = (i: number) => (months > 1 ? (i / (months - 1)) * 100 : 0);
  const y = (v: number | null) => 48 - ((v ?? 0) / top) * 46;
  const pts = (values: (number | null)[]) => values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const area = (upper: (number | null)[], lower: (number | null)[]) => `M${pts(upper).join(" L")} L${pts(lower).reverse().join(" L")} Z`;
  const dollars = plan.inflation ? "in today's dollars" : "";
  const withdrawing = plan.monthly < 0;

  return (
    <div className="mt-5">
      <svg
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        className="h-56 w-full"
        role="img"
        aria-label={`Planned value after ${plan.years} years: median ${formatCompactCurrency(plan.final.median ?? 0)}, from ${formatCompactCurrency(plan.final.p10 ?? 0)} in a bad case to ${formatCompactCurrency(plan.final.p90 ?? 0)} in a good one`}
      >
        <path d={area(b.p90, b.p10)} className="fill-accent/15" />
        <path d={area(b.p75, b.p25)} className="fill-accent/30" />
        <path d={`M${pts(b.p50).join(" L")}`} fill="none" className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {plan.target !== null && <line x1="0" x2="100" y1={y(plan.target)} y2={y(plan.target)} className="stroke-foreground/50" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>Today</span>
        <span>{plan.target !== null ? "Dashed line: your target" : ""}</span>
        <span>{plan.years} years</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        {plan.targetProbability !== null && (
          <div>
            <dt className="text-xs text-muted">Chance of reaching {formatCompactCurrency(plan.target ?? 0)}</dt>
            <dd className="font-semibold tabular-nums">{formatShare(plan.targetProbability)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">Middle outcome {dollars}</dt>
          <dd className="font-semibold tabular-nums">{formatCompactCurrency(plan.final.median ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Bad case (1 in 10)</dt>
          <dd className="font-semibold tabular-nums">{formatCompactCurrency(plan.final.p10 ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{withdrawing ? "Taken out" : "Put in"} along the way</dt>
          <dd className="font-semibold tabular-nums">{formatCompactCurrency(Math.abs(plan.contributed))}</dd>
        </div>
        {withdrawing && (
          <div>
            <dt className="text-xs text-muted">Chance the money runs out</dt>
            <dd className="font-semibold tabular-nums">{formatShare(plan.runOutProbability)}</dd>
            {plan.runOutMedianMonths !== null && <dd className="text-xs text-muted">typically after {Math.round(plan.runOutMedianMonths / 12)} years</dd>}
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-muted">
        {plan.paths.toLocaleString()} futures from your portfolio&apos;s own past {Math.round(plan.historySessions / 252)} years of daily moves, starting from {formatCompactCurrency(plan.start)}
        {plan.inflation ? `, with prices rising ${formatShare(plan.inflation)} a year and the monthly amount rising with them` : ""}. Not a forecast: the future can be calmer or wilder.
      </p>
    </div>
  );
}
