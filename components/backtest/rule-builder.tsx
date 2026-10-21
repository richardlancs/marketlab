"use client";

import { useId } from "react";
import { OPERATOR_NAMES, RULE_LIMITS, unitOf, type Condition, type Indicator, type Operator, type RuleSet, type Unit } from "@/lib/backtest/rules";

/**
 * The rule builder's own form of a rule set: like RuleSet, but numbers are
 * kept as typed (strings), so a half-typed "2" on its way to "20" isn't
 * rejected mid-keystroke. Turned into a real RuleSet when the backtest runs.
 */
export type IndicatorDraft = { kind: Indicator["kind"]; n: string };
export type ConditionDraft = { left: IndicatorDraft; op: Operator; right: IndicatorDraft };
export type RuleSetDraft = { combine: RuleSet["combine"]; conditions: ConditionDraft[] };

const numberOf = (i: Indicator) => (i.kind === "value" ? String(i.value) : "days" in i ? String(i.days) : "");
const toIndicatorDraft = (i: Indicator): IndicatorDraft => ({ kind: i.kind, n: numberOf(i) });

export const toDraft = (rules: RuleSet): RuleSetDraft => ({
  combine: rules.combine,
  conditions: rules.conditions.map((c) => ({ left: toIndicatorDraft(c.left), op: c.op, right: toIndicatorDraft(c.right) })),
});

/** Not validated here: the config's parser checks the result (see lib/backtest/rules.ts). */
function fromIndicatorDraft(d: IndicatorDraft): Indicator {
  if (d.kind === "price" || d.kind === "macd" || d.kind === "macd-signal") return { kind: d.kind };
  if (d.kind === "value") return { kind: "value", value: Number(d.n) };
  return { kind: d.kind, days: Number(d.n) };
}
export const fromDraft = (draft: RuleSetDraft): RuleSet => ({
  combine: draft.combine,
  conditions: draft.conditions.map((c): Condition => ({ left: fromIndicatorDraft(c.left), op: c.op, right: fromIndicatorDraft(c.right) })),
});

const KIND_NAMES: Record<Indicator["kind"], string> = {
  price: "Price",
  sma: "Moving average",
  ema: "Exponential average",
  "bollinger-upper": "Upper Bollinger band",
  "bollinger-lower": "Lower Bollinger band",
  rsi: "RSI",
  macd: "MACD",
  "macd-signal": "MACD signal line",
  value: "Number",
};
const unit = (kind: Indicator["kind"]) => unitOf({ kind });
const DEFAULT_N: Record<Indicator["kind"], string> = { price: "", sma: "200", ema: "50", "bollinger-upper": "20", "bollinger-lower": "20", rsi: "14", macd: "", "macd-signal": "", value: "30" };
/** A sensible partner for the left side, when switching it to another unit. */
const PARTNER: Record<Unit, IndicatorDraft> = { dollars: { kind: "sma", n: "200" }, score: { kind: "value", n: "30" }, macd: { kind: "macd-signal", n: "" } };
const HAS_NUMBER = (kind: Indicator["kind"]) => DEFAULT_N[kind] !== "";

const input =
  "h-9 rounded-lg border border-border bg-transparent px-2 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";

/** One group of conditions: "Buy when all of these are true". */
export function RuleSetEditor({ title, value, onChange }: { title: string; value: RuleSetDraft; onChange: (next: RuleSetDraft) => void }) {
  const id = useId();
  const setCondition = (i: number, next: ConditionDraft) => onChange({ ...value, conditions: value.conditions.map((c, j) => (j === i ? next : c)) });

  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <label className="flex items-center gap-2 text-xs text-muted">
        when
        <select value={value.combine} onChange={(e) => onChange({ ...value, combine: e.target.value as RuleSet["combine"] })} className={input}>
          <option value="all">all of these are true</option>
          <option value="any">any of these is true</option>
        </select>
      </label>
      <ol className="space-y-2">
        {value.conditions.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5" aria-label={`Condition ${i + 1}`}>
            <IndicatorPicker
              id={`${id}-${i}-left`}
              label="Compare"
              value={c.left}
              onChange={(left) =>
                // Switching to another kind of value (prices, a 0–100 score, MACD): pick a partner that makes sense with it.
                setCondition(i, { ...c, left, right: unit(left.kind) === unit(c.right.kind) ? c.right : PARTNER[unit(left.kind)] })
              }
              allowValue={false}
            />
            <select aria-label="Comparison" value={c.op} onChange={(e) => setCondition(i, { ...c, op: e.target.value as Operator })} className={input}>
              {(Object.keys(OPERATOR_NAMES) as Operator[]).map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_NAMES[op]}
                </option>
              ))}
            </select>
            <IndicatorPicker id={`${id}-${i}-right`} label="With" value={c.right} onChange={(right) => setCondition(i, { ...c, right })} allowValue only={unit(c.left.kind)} />
            {value.conditions.length > 1 && (
              <button
                type="button"
                onClick={() => onChange({ ...value, conditions: value.conditions.filter((_, j) => j !== i) })}
                aria-label={`Remove condition ${i + 1}`}
                className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      {value.conditions.length < RULE_LIMITS.maxConditions && (
        <button
          type="button"
          onClick={() => onChange({ ...value, conditions: [...value.conditions, { left: { kind: "price", n: "" }, op: "above", right: { kind: "sma", n: "50" } }] })}
          className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          + Add a condition
        </button>
      )}
    </fieldset>
  );
}

/**
 * A kind of value and, where it has one, its number of days (or the number
 * itself). Options that can't be compared with the other side are disabled,
 * so the builder can't make a rule like "RSI is above the 200-day average".
 */
function IndicatorPicker({
  id,
  label,
  value,
  onChange,
  allowValue,
  only,
}: {
  id: string;
  label: string;
  value: IndicatorDraft;
  onChange: (next: IndicatorDraft) => void;
  allowValue: boolean;
  /** For the right side: the left side's unit, so only values in the same unit can be picked. */
  only?: Unit;
}) {
  const kinds = (Object.keys(KIND_NAMES) as Indicator["kind"][]).filter((k) => allowValue || k !== "value");
  const fits = (k: Indicator["kind"]) => only === undefined || unit(k) === only;
  const hasNumber = HAS_NUMBER(value.kind);
  return (
    <span className="flex items-center gap-1.5">
      <select
        id={id}
        aria-label={label}
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as Indicator["kind"];
          onChange({ kind, n: DEFAULT_N[kind] });
        }}
        className={input}
      >
        {kinds.map((k) => (
          <option key={k} value={k} disabled={!fits(k)}>
            {KIND_NAMES[k]}
          </option>
        ))}
      </select>
      {hasNumber && (
        <input
          aria-label={value.kind === "value" ? `${label}: number (0 to 100)` : `${label}: days`}
          type="number"
          inputMode="numeric"
          value={value.n}
          onChange={(e) => onChange({ ...value, n: e.target.value })}
          className={`${input} w-16`}
        />
      )}
      {hasNumber && value.kind !== "value" && <span className="text-xs text-muted">days</span>}
    </span>
  );
}
