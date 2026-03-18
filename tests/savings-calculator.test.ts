import { describe, it, expect } from "vitest";
import {
  computePriorityScore,
  computeImpact,
  aggregateSavings,
  sortByPriority,
} from "../src/tools/shared/savings-calculator.js";
import type { OptimizationRecommendation } from "../src/types/cost.js";

function mockRecommendation(
  overrides: Partial<OptimizationRecommendation> = {},
): OptimizationRecommendation {
  return {
    id: "test-id",
    cloud: "aws",
    service: "EC2",
    type: "RIGHTSIZING",
    category: "COMPUTE",
    title: "Test recommendation",
    description: "Test description",
    resourceId: "i-12345",
    resourceName: "test-instance",
    currentMonthlyCost: 200,
    projectedMonthlyCost: 100,
    estimatedMonthlySavings: 100,
    estimatedAnnualSavings: 1200,
    savingsPercentage: 50,
    impact: "HIGH",
    effort: "MEDIUM",
    priorityScore: 50,
    actionSteps: ["Step 1"],
    tags: {},
    detectedAt: new Date(),
    rawData: {},
    ...overrides,
  };
}

describe("computePriorityScore", () => {
  it("returns a score between 0 and 100", () => {
    const score = computePriorityScore({
      estimatedMonthlySavings: 500,
      savingsPercentage: 50,
      effort: "LOW",
      type: "UNUSED_RESOURCE",
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores high savings higher than low savings", () => {
    const highSavings = computePriorityScore({
      estimatedMonthlySavings: 10000,
      savingsPercentage: 80,
      effort: "LOW",
      type: "UNUSED_RESOURCE",
    });
    const lowSavings = computePriorityScore({
      estimatedMonthlySavings: 10,
      savingsPercentage: 10,
      effort: "HIGH",
      type: "MODERNIZATION",
    });
    expect(highSavings).toBeGreaterThan(lowSavings);
  });

  it("prefers low effort over high effort", () => {
    const base = {
      estimatedMonthlySavings: 500,
      savingsPercentage: 50,
      type: "RIGHTSIZING" as const,
    };
    const low = computePriorityScore({ ...base, effort: "LOW" });
    const high = computePriorityScore({ ...base, effort: "HIGH" });
    expect(low).toBeGreaterThan(high);
  });

  it("prefers unused resource type over modernization", () => {
    const base = {
      estimatedMonthlySavings: 500,
      savingsPercentage: 50,
      effort: "MEDIUM" as const,
    };
    const unused = computePriorityScore({ ...base, type: "UNUSED_RESOURCE" });
    const modern = computePriorityScore({ ...base, type: "MODERNIZATION" });
    expect(unused).toBeGreaterThan(modern);
  });
});

describe("computeImpact", () => {
  it("returns CRITICAL for savings >= 5000", () => {
    expect(computeImpact(5000)).toBe("CRITICAL");
    expect(computeImpact(10000)).toBe("CRITICAL");
  });

  it("returns HIGH for savings >= 1000", () => {
    expect(computeImpact(1000)).toBe("HIGH");
    expect(computeImpact(4999)).toBe("HIGH");
  });

  it("returns MEDIUM for savings >= 200", () => {
    expect(computeImpact(200)).toBe("MEDIUM");
    expect(computeImpact(999)).toBe("MEDIUM");
  });

  it("returns LOW for savings < 200", () => {
    expect(computeImpact(100)).toBe("LOW");
    expect(computeImpact(0)).toBe("LOW");
  });
});

describe("aggregateSavings", () => {
  it("aggregates savings across recommendations", () => {
    const recs = [
      mockRecommendation({ cloud: "aws", estimatedMonthlySavings: 100, priorityScore: 80 }),
      mockRecommendation({ cloud: "azure", estimatedMonthlySavings: 200, priorityScore: 90 }),
      mockRecommendation({ cloud: "gcp", estimatedMonthlySavings: 300, priorityScore: 70 }),
    ];

    const summary = aggregateSavings(recs);
    expect(summary.totalMonthlySavings).toBe(600);
    expect(summary.totalAnnualSavings).toBe(7200);
    expect(summary.count).toBe(3);
    expect(summary.topRecommendations[0].priorityScore).toBe(90);
  });

  it("limits top recommendations to topN", () => {
    const recs = Array.from({ length: 20 }, (_, i) =>
      mockRecommendation({ estimatedMonthlySavings: i * 10, priorityScore: i }),
    );
    const summary = aggregateSavings(recs, 5);
    expect(summary.topRecommendations).toHaveLength(5);
  });
});

describe("sortByPriority", () => {
  it("sorts by priority score descending", () => {
    const recs = [
      mockRecommendation({ priorityScore: 30 }),
      mockRecommendation({ priorityScore: 90 }),
      mockRecommendation({ priorityScore: 60 }),
    ];
    const sorted = sortByPriority(recs);
    expect(sorted[0].priorityScore).toBe(90);
    expect(sorted[1].priorityScore).toBe(60);
    expect(sorted[2].priorityScore).toBe(30);
  });

  it("does not mutate the original array", () => {
    const recs = [
      mockRecommendation({ priorityScore: 30 }),
      mockRecommendation({ priorityScore: 90 }),
    ];
    sortByPriority(recs);
    expect(recs[0].priorityScore).toBe(30);
  });
});
