import type {
  TagCoverage,
  TagGap,
  CloudProvider,
} from "../../types/cost.js";

// Default Required Tags (FinOps best practices)

export const DEFAULT_REQUIRED_TAGS = [
  "Environment",
  "Owner",
  "Team",
  "CostCenter",
  "Project",
];

// Analyze Tag Coverage

export interface ResourceForTagAnalysis {
  resourceId: string;
  resourceType: string;
  monthlyCost: number;
  tags: Record<string, string>;
}

export function analyzeTagCoverage(
  cloud: CloudProvider,
  resources: ResourceForTagAnalysis[],
  requiredTags: string[] = DEFAULT_REQUIRED_TAGS,
): TagCoverage {
  const gaps: TagGap[] = [];
  let tagged = 0;
  let untagged = 0;

  for (const resource of resources) {
    const resourceTags = Object.keys(resource.tags).map((t) => t.toLowerCase());
    const missing = requiredTags.filter(
      (req) => !resourceTags.includes(req.toLowerCase()),
    );

    if (missing.length > 0) {
      untagged++;
      gaps.push({
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
        monthlyCost: resource.monthlyCost,
        missingTags: missing,
      });
    } else {
      tagged++;
    }
  }

  return {
    cloud,
    totalResources: resources.length,
    taggedResources: tagged,
    untaggedResources: untagged,
    coveragePercent:
      resources.length === 0 ? 100 : (tagged / resources.length) * 100,
    requiredTags,
    missingTagsByResource: gaps.sort((a, b) => b.monthlyCost - a.monthlyCost),
  };
}

// Merge Tag Coverage Across Clouds

export interface MergedTagCoverage {
  totalResources: number;
  taggedResources: number;
  untaggedResources: number;
  overallCoveragePercent: number;
  coverageByCloud: Record<CloudProvider, number>;
  untaggedCostByCloud: Record<CloudProvider, number>;
  totalUntaggedCost: number;
  recommendations: string[];
}

export function mergeTagCoverage(
  coverages: TagCoverage[],
): MergedTagCoverage {
  let totalResources = 0;
  let taggedResources = 0;
  let untaggedResources = 0;
  const coverageByCloud: Record<string, number> = {};
  const untaggedCostByCloud: Record<string, number> = {};
  let totalUntaggedCost = 0;

  for (const cov of coverages) {
    totalResources += cov.totalResources;
    taggedResources += cov.taggedResources;
    untaggedResources += cov.untaggedResources;
    coverageByCloud[cov.cloud] = cov.coveragePercent;

    const cloudUntaggedCost = cov.missingTagsByResource.reduce(
      (s, g) => s + g.monthlyCost,
      0,
    );
    untaggedCostByCloud[cov.cloud] = cloudUntaggedCost;
    totalUntaggedCost += cloudUntaggedCost;
  }

  const recommendations: string[] = [];
  for (const cov of coverages) {
    if (cov.coveragePercent < 80) {
      recommendations.push(
        `${cov.cloud.toUpperCase()}: Tag coverage is ${cov.coveragePercent.toFixed(1)}% — enforce tagging policies to reach 80%+`,
      );
    }
    if (cov.missingTagsByResource.length > 0) {
      const topUntagged = cov.missingTagsByResource[0];
      recommendations.push(
        `${cov.cloud.toUpperCase()}: Highest-cost untagged resource is ${topUntagged.resourceId} ($${topUntagged.monthlyCost.toFixed(2)}/mo)`,
      );
    }
  }

  if (totalUntaggedCost > 1000) {
    recommendations.push(
      `$${totalUntaggedCost.toFixed(2)}/mo in untagged resources — implement automated tag enforcement`,
    );
  }

  return {
    totalResources,
    taggedResources,
    untaggedResources,
    overallCoveragePercent:
      totalResources === 0 ? 100 : (taggedResources / totalResources) * 100,
    coverageByCloud: coverageByCloud as Record<CloudProvider, number>,
    untaggedCostByCloud: untaggedCostByCloud as Record<CloudProvider, number>,
    totalUntaggedCost,
    recommendations,
  };
}
