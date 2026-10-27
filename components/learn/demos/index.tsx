import type { DemoKey } from "@/lib/lessons";
import { CompanySizeDemo, DiversificationDemo } from "./company";
import { FactorDemo } from "./factors";
import { BenchmarkDemo, BetaDemo, DrawdownDemo, GrowthDemo, SharpeDemo, VolatilityClusteringDemo, VolatilityDemo } from "./measuring";
import { ImpliedVolatilityDemo, OptionGreeksDemo, OptionPayoffDemo, OptionStrategiesDemo } from "./options";
import { DollarCostAveragingDemo, MovingAverageDemo, OverfittingDemo, RebalancingDemo, RsiDemo } from "./strategies";
import { DividendDemo, OrdersDemo, SplitDemo, TradingCostsDemo } from "./trading";

/** Which component each lesson's `demo` names. */
const DEMOS: Record<DemoKey, () => React.ReactNode> = {
  growth: GrowthDemo,
  diversification: DiversificationDemo,
  volatility: VolatilityDemo,
  drawdown: DrawdownDemo,
  sharpe: SharpeDemo,
  beta: BetaDemo,
  benchmark: BenchmarkDemo,
  volatilityClustering: VolatilityClusteringDemo,
  orders: OrdersDemo,
  tradingCosts: TradingCostsDemo,
  dividend: DividendDemo,
  split: SplitDemo,
  companySize: CompanySizeDemo,
  movingAverage: MovingAverageDemo,
  rsi: RsiDemo,
  dollarCostAveraging: DollarCostAveragingDemo,
  rebalancing: RebalancingDemo,
  overfitting: OverfittingDemo,
  factors: FactorDemo,
  optionPayoff: OptionPayoffDemo,
  optionGreeks: OptionGreeksDemo,
  impliedVolatility: ImpliedVolatilityDemo,
  optionStrategies: OptionStrategiesDemo,
};

/** A lesson's interactive demo. */
export function LessonDemo({ demo }: { demo: DemoKey }) {
  const Demo = DEMOS[demo];
  return <Demo />;
}
