import { describe, expect, it } from "vitest";
import { areaPath, extent, linePath, nearestIndex, niceTicks, scaleY, toPoints } from "./chart";

describe("chart", () => {
  it("finds the min and max", () => {
    expect(extent([3, 1, 4, 1, 5])).toEqual([1, 5]);
  });

  it("maps the lowest value to the bottom and the highest to the top", () => {
    // Width 10 over 3 values: x = 0, 5, 10. Height 10: price 0 → y 10, price 2 → y 0.
    expect(toPoints([0, 1, 2], 10, 10)).toEqual([
      [0, 10],
      [5, 5],
      [10, 0],
    ]);
  });

  it("keeps padding clear at the top and bottom", () => {
    expect(toPoints([0, 2], 10, 10, { padding: 1 })).toEqual([
      [0, 9],
      [10, 1],
    ]);
  });

  it("uses a custom domain when given one", () => {
    // Domain 0–4 means a value of 2 sits halfway up.
    expect(toPoints([2], 10, 10, { domain: [0, 4] })).toEqual([[0, 5]]);
  });

  it("draws a flat series across the middle instead of dividing by zero", () => {
    expect(toPoints([7, 7], 10, 10)).toEqual([
      [0, 5],
      [10, 5],
    ]);
  });

  it("scales a single value", () => {
    expect(scaleY(0, 10, [0, 2])).toBe(10);
    expect(scaleY(2, 10, [0, 2])).toBe(0);
    expect(scaleY(3, 10, [0, 4], 1)).toBe(3); // 3/4 of the way up the 9→1 band: 9 - 0.75 × 8
  });

  it("builds line and area paths", () => {
    const points = toPoints([0, 1, 2], 10, 10);
    expect(linePath(points)).toBe("M0,10L5,5L10,0");
    expect(areaPath(points, 10)).toBe("M0,10L5,5L10,0L10,10L0,10Z");
    expect(areaPath([], 10)).toBe("");
  });

  it("picks round gridline values", () => {
    // Range 100 / 4 = 25 per step, which is already a "nice" number.
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    // Range 8.6 / 4 = 2.15, rounded up to the next nice step: 2.5.
    expect(niceTicks(243.1, 251.7, 4)).toEqual([245, 247.5, 250]);
    expect(niceTicks(0.1, 0.4, 3)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it("snaps a pointer position to the nearest point", () => {
    expect(nearestIndex(0, 5)).toBe(0);
    expect(nearestIndex(0.49, 5)).toBe(2); // 0.49 × 4 = 1.96 → 2
    expect(nearestIndex(1, 5)).toBe(4);
    expect(nearestIndex(-0.3, 5)).toBe(0); // the pointer can be outside the chart
    expect(nearestIndex(1.7, 5)).toBe(4);
  });
});
