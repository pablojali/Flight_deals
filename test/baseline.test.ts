import { describe, expect, it } from "vitest";
import { computeBaseline, mad, median, robustZ } from "../src/core/baseline";

describe("baseline", () => {
  it("mediana y MAD", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it("ignora valores no válidos", () => {
    expect(computeBaseline([100, NaN, -5, 0, 120])).toEqual({ median: 110, mad: 10, samples: 2 });
    expect(computeBaseline([])).toBeNull();
  });

  it("z robusto es null si no hay dispersión", () => {
    expect(robustZ(50, { median: 100, mad: 0, samples: 10 })).toBeNull();
    expect(robustZ(70, { median: 100, mad: 10, samples: 10 })).toBeCloseTo(2.02, 2);
  });
});
