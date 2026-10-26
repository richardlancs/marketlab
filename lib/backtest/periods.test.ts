import { describe, expect, it } from "vitest";
import { divergingColor } from "./periods";

describe("divergingColor", () => {
  it("is the card color at zero, and strongest at the limit", () => {
    expect(divergingColor(0, 0.1)).toBe("var(--surface)");
    expect(divergingColor(0.1, 0.1)).toBe("color-mix(in oklab, var(--gain) 55%, var(--surface))");
    expect(divergingColor(-0.5, 0.1)).toBe("color-mix(in oklab, var(--loss) 55%, var(--surface))");
    expect(divergingColor(0.05, 0.1)).toContain("28%");
  });
});
