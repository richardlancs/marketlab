import { describe, expect, it } from "vitest";
import { sliceTimeframe, timeframePoints, trendSeries } from "../chart";
import { formatTime } from "../format";
import { newYorkClose } from "./calendar";
import { INTRADAY_SESSIONS, intradayPrices, SESSION_STEPS, sessionPath } from "./intraday";
import { mockSeries } from "./mock";

const HOUR = 60 * 60 * 1000;

describe("the New York close", () => {
  it("is 20:00 UTC in summer and 21:00 UTC in winter", () => {
    expect(newYorkClose(Date.UTC(2026, 6, 15))).toBe(Date.UTC(2026, 6, 15, 20));
    expect(newYorkClose(Date.UTC(2026, 11, 15))).toBe(Date.UTC(2026, 11, 15, 21));
  });
});

describe("a day's path", () => {
  const bar = { open: 101, high: 104.5, low: 99.2, close: 103 };
  const path = sessionPath("TEST:1", bar);

  it("runs from the open to the close in 5-minute steps", () => {
    expect(path).toHaveLength(SESSION_STEPS + 1);
    expect(path[0]).toBe(101);
    expect(path.at(-1)).toBe(103);
  });

  it("reaches exactly the day's high and low, and never goes past them", () => {
    expect(Math.max(...path)).toBeCloseTo(104.5, 9);
    expect(Math.min(...path)).toBeCloseTo(99.2, 9);
  });

  it("is the same every time for the same day", () => {
    expect(sessionPath("TEST:1", bar)).toEqual(path);
    expect(sessionPath("TEST:2", bar)).not.toEqual(path);
  });

  it("still reaches the high and low when they're far from the open and close", () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = sessionPath(`S:${seed}`, { open: 50, high: 58, low: 42, close: 50.5 });
      expect(Math.max(...p)).toBeCloseTo(58, 9);
      expect(Math.min(...p)).toBeCloseTo(42, 9);
    }
  });

  it("is flat on a day the price never moved", () => {
    expect(new Set(sessionPath("FLAT", { open: 10, high: 10, low: 10, close: 10 }))).toEqual(new Set([10]));
  });
});

describe("mock intraday prices", () => {
  const series = mockSeries("AAPL", Date.UTC(2026, 9, 17, 12));
  const { bars, intraday } = series;

  it("cover the latest month of trading days, from 9:30 AM to 4 PM New York time", () => {
    expect(intraday).toHaveLength(INTRADAY_SESSIONS * (SESSION_STEPS + 1));
    expect(intraday.every((p, i) => i === 0 || p.time > intraday[i - 1].time)).toBe(true);
    expect(formatTime(intraday[0].time)).toBe("9:30 AM");
    expect(formatTime(intraday[SESSION_STEPS].time)).toBe("4:00 PM");
  });

  it("end each day at its adjusted close", () => {
    const last = bars.at(-1)!;
    expect(intraday.at(-1)!.price).toBe(last.adjClose);
    expect(intraday.at(-1)!.time).toBe(newYorkClose(last.time - 20 * HOUR));
  });

  it("aren't made for daily-only data", () => {
    expect(intradayPrices("AAPL", [])).toEqual([]);
  });
});

describe("chart ranges with intraday prices", () => {
  const quote = (() => {
    const { bars, intraday } = mockSeries("MSFT", Date.UTC(2026, 9, 17, 12));
    return { history: bars.map((b) => ({ time: b.time, price: b.adjClose })), intraday };
  })();

  it("draw today from yesterday's close through every 5 minutes to today's close", () => {
    const day = timeframePoints(quote, "1D");
    expect(day).toHaveLength(1 + SESSION_STEPS + 1);
    expect(day[0].price).toBe(quote.history.at(-2)!.price);
    expect(day.at(-1)!.price).toBe(quote.history.at(-1)!.price);
  });

  it("keep each range's change the same as with daily closes", () => {
    for (const tf of ["1D", "1W", "1M"] as const) {
      const detailed = timeframePoints(quote, tf);
      const daily = sliceTimeframe(quote.history, tf);
      expect(detailed[0].price).toBe(daily[0].price);
      expect(detailed.at(-1)!.price).toBe(daily.at(-1)!.price);
      expect(detailed).toHaveLength(1 + (daily.length - 1) * (SESSION_STEPS + 1));
    }
  });

  it("stay daily for 6M and longer, and without intraday prices", () => {
    expect(timeframePoints(quote, "6M")).toEqual(sliceTimeframe(quote.history, "6M"));
    expect(timeframePoints({ history: quote.history }, "1D")).toEqual(sliceTimeframe(quote.history, "1D"));
  });

  it("give small charts a detailed day, thinned but with the exact change", () => {
    const series = trendSeries(quote);
    expect(series["1D"]).toHaveLength(64);
    expect(series["1D"][0]).toBe(quote.history.at(-2)!.price);
    expect(series["1D"].at(-1)).toBe(quote.history.at(-1)!.price);
  });
});
