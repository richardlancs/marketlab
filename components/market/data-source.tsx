import { getMarket } from "@/lib/market";

/** The small line above page titles naming where prices come from, or why real ones are missing. */
export async function DataSource() {
  const { source, notice } = await getMarket();
  if (notice) return <p className="text-sm font-medium text-loss">{notice}</p>;
  return <p className="text-sm font-medium text-accent">{source === "tiingo" ? "End-of-day prices from Tiingo" : "Mock data"}</p>;
}
