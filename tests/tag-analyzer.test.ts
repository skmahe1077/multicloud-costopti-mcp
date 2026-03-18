import { describe, it, expect } from "vitest";
import {
  analyzeTagCoverage,
  mergeTagCoverage,
  DEFAULT_REQUIRED_TAGS,
  type ResourceForTagAnalysis,
} from "../src/tools/shared/tag-analyzer.js";

describe("analyzeTagCoverage", () => {
  it("identifies fully tagged resources", () => {
    const resources: ResourceForTagAnalysis[] = [
      {
        resourceId: "r-1",
        resourceType: "instance",
        monthlyCost: 100,
        tags: { Environment: "prod", Owner: "team-a", Team: "eng", CostCenter: "CC1", Project: "P1" },
      },
    ];
    const coverage = analyzeTagCoverage("aws", resources);
    expect(coverage.coveragePercent).toBe(100);
    expect(coverage.taggedResources).toBe(1);
    expect(coverage.untaggedResources).toBe(0);
  });

  it("identifies untagged resources", () => {
    const resources: ResourceForTagAnalysis[] = [
      { resourceId: "r-1", resourceType: "instance", monthlyCost: 100, tags: {} },
      { resourceId: "r-2", resourceType: "disk", monthlyCost: 50, tags: { Environment: "dev" } },
    ];
    const coverage = analyzeTagCoverage("aws", resources);
    expect(coverage.untaggedResources).toBe(2);
    expect(coverage.coveragePercent).toBe(0);
  });

  it("uses custom required tags", () => {
    const resources: ResourceForTagAnalysis[] = [
      { resourceId: "r-1", resourceType: "instance", monthlyCost: 100, tags: { app: "web" } },
    ];
    const coverage = analyzeTagCoverage("gcp", resources, ["app"]);
    expect(coverage.coveragePercent).toBe(100);
  });

  it("returns 100% coverage for empty resource list", () => {
    const coverage = analyzeTagCoverage("azure", []);
    expect(coverage.coveragePercent).toBe(100);
  });

  it("sorts missing tag resources by cost descending", () => {
    const resources: ResourceForTagAnalysis[] = [
      { resourceId: "r-1", resourceType: "instance", monthlyCost: 50, tags: {} },
      { resourceId: "r-2", resourceType: "instance", monthlyCost: 200, tags: {} },
      { resourceId: "r-3", resourceType: "instance", monthlyCost: 100, tags: {} },
    ];
    const coverage = analyzeTagCoverage("aws", resources, ["Environment"]);
    expect(coverage.missingTagsByResource[0].monthlyCost).toBe(200);
    expect(coverage.missingTagsByResource[1].monthlyCost).toBe(100);
  });
});

describe("mergeTagCoverage", () => {
  it("merges coverage across clouds", () => {
    const aws = analyzeTagCoverage("aws", [
      { resourceId: "r-1", resourceType: "ec2", monthlyCost: 100, tags: { Environment: "prod", Owner: "a", Team: "b", CostCenter: "c", Project: "d" } },
    ]);
    const gcp = analyzeTagCoverage("gcp", [
      { resourceId: "r-2", resourceType: "vm", monthlyCost: 50, tags: {} },
    ]);

    const merged = mergeTagCoverage([aws, gcp]);
    expect(merged.totalResources).toBe(2);
    expect(merged.taggedResources).toBe(1);
    expect(merged.untaggedResources).toBe(1);
    expect(merged.overallCoveragePercent).toBe(50);
  });

  it("generates recommendations for low coverage", () => {
    const coverage = analyzeTagCoverage("aws", [
      { resourceId: "r-1", resourceType: "ec2", monthlyCost: 500, tags: {} },
    ]);
    const merged = mergeTagCoverage([coverage]);
    expect(merged.recommendations.length).toBeGreaterThan(0);
  });
});

describe("DEFAULT_REQUIRED_TAGS", () => {
  it("includes standard FinOps tags", () => {
    expect(DEFAULT_REQUIRED_TAGS).toContain("Environment");
    expect(DEFAULT_REQUIRED_TAGS).toContain("Owner");
    expect(DEFAULT_REQUIRED_TAGS).toContain("Team");
    expect(DEFAULT_REQUIRED_TAGS).toContain("CostCenter");
    expect(DEFAULT_REQUIRED_TAGS).toContain("Project");
  });
});
