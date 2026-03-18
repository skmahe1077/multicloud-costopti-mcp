import { describe, it, expect } from "vitest";
import {
  analyzeTrend,
  computePercentChange,
  computeAverageDailyCost,
  detectAnomalies,
  buildCostTrend,
} from "../src/tools/shared/cost-trend-analyzer.js";
import type { CostDataPoint } from "../src/types/cost.js";

function makeDataPoints(amounts: number[]): CostDataPoint[] {
  return amounts.map((amount, i) => ({
    date: new Date(2024, 0, i + 1),
    amount,
    currency: "USD",
  }));
}

describe("analyzeTrend", () => {
  it("detects increasing trend", () => {
    const points = makeDataPoints([10, 15, 20, 25, 30, 35, 40]);
    expect(analyzeTrend(points)).toBe("INCREASING");
  });

  it("detects decreasing trend", () => {
    const points = makeDataPoints([40, 35, 30, 25, 20, 15, 10]);
    expect(analyzeTrend(points)).toBe("DECREASING");
  });

  it("detects stable trend", () => {
    const points = makeDataPoints([100, 101, 99, 100, 101, 100, 99]);
    expect(analyzeTrend(points)).toBe("STABLE");
  });

  it("returns STABLE for single data point", () => {
    expect(analyzeTrend(makeDataPoints([100]))).toBe("STABLE");
  });

  it("returns STABLE for empty array", () => {
    expect(analyzeTrend([])).toBe("STABLE");
  });
});

describe("computePercentChange", () => {
  it("computes positive change", () => {
    const points = makeDataPoints([100, 150]);
    expect(computePercentChange(points)).toBe(50);
  });

  it("computes negative change", () => {
    const points = makeDataPoints([200, 100]);
    expect(computePercentChange(points)).toBe(-50);
  });

  it("returns 0 for single point", () => {
    expect(computePercentChange(makeDataPoints([100]))).toBe(0);
  });

  it("handles zero starting value", () => {
    const points = makeDataPoints([0, 100]);
    expect(computePercentChange(points)).toBe(100);
  });
});

describe("computeAverageDailyCost", () => {
  it("computes average", () => {
    expect(computeAverageDailyCost(makeDataPoints([10, 20, 30]))).toBe(20);
  });

  it("returns 0 for empty array", () => {
    expect(computeAverageDailyCost([])).toBe(0);
  });
});

describe("detectAnomalies", () => {
  it("detects cost spike anomalies", () => {
    const amounts = [10, 11, 9, 10, 12, 10, 11, 100, 10, 11]; // 100 is anomalous
    const points = makeDataPoints(amounts);
    const anomalies = detectAnomalies(points, "aws", "EC2");
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].amount).toBe(100);
  });

  it("returns empty for normal data", () => {
    const points = makeDataPoints([10, 10, 10, 10, 10, 10, 10]);
    expect(detectAnomalies(points, "aws", "EC2")).toHaveLength(0);
  });

  it("returns empty for fewer than 7 data points", () => {
    const points = makeDataPoints([10, 20, 100]);
    expect(detectAnomalies(points, "aws", "EC2")).toHaveLength(0);
  });
});

describe("buildCostTrend", () => {
  it("builds a complete CostTrend object", () => {
    const points = makeDataPoints([10, 15, 20, 25, 30]);
    const trend = buildCostTrend("aws", "EC2", "COMPUTE", points);
    expect(trend.cloud).toBe("aws");
    expect(trend.service).toBe("EC2");
    expect(trend.category).toBe("COMPUTE");
    expect(trend.trend).toBe("INCREASING");
    expect(trend.percentChange).toBeGreaterThan(0);
    expect(trend.averageDailyCost).toBe(20);
  });
});
