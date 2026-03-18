import {
  type OptimizationRecommendation,
  type Impact,
  type Effort,
  type OptimizationType,
  type CostCategory,
  type CloudProvider,
} from "../../types/cost.js";

// ─── Priority Score Computation ─────────────────────────────────────
// Produces a 0–100 score factoring in savings amount, percentage,
// effort, and optimization type.

export function computePriorityScore(rec: {
  estimatedMonthlySavings: number;
  savingsPercentage: number;
  effort: Effort;
  type: OptimizationType;
}): number {
  let score = 0;

  // Savings amount weight (0-35)
  if (rec.estimatedMonthlySavings >= 10000) score += 35;
  else if (rec.estimatedMonthlySavings >= 5000) score += 30;
  else if (rec.estimatedMonthlySavings >= 1000) score += 25;
  else if (rec.estimatedMonthlySavings >= 500) score += 20;
  else if (rec.estimatedMonthlySavings >= 100) score += 15;
  else if (rec.estimatedMonthlySavings >= 50) score += 10;
  else score += 5;

  // Savings percentage weight (0-25)
  if (rec.savingsPercentage >= 80) score += 25;
  else if (rec.savingsPercentage >= 60) score += 20;
  else if (rec.savingsPercentage >= 40) score += 15;
  else if (rec.savingsPercentage >= 20) score += 10;
  else score += 5;

  // Effort weight — less effort = higher score (0-20)
  const effortScores: Record<Effort, number> = {
    LOW: 20,
    MEDIUM: 12,
    HIGH: 5,
  };
  score += effortScores[rec.effort];

  // Optimization type weight (0-20)
  const typeScores: Record<OptimizationType, number> = {
    UNUSED_RESOURCE: 20,
    IDLE_RESOURCE: 18,
    RIGHTSIZING: 16,
    STORAGE_TIERING: 15,
    RESERVED_INSTANCE: 14,
    SAVINGS_PLAN: 14,
    COMMITTED_USE: 14,
    SPOT_INSTANCE: 12,
    SCHEDULING: 12,
    LICENSE_OPTIMIZATION: 10,
    NETWORK_OPTIMIZATION: 10,
    MODERNIZATION: 8,
  };
  score += typeScores[rec.type] ?? 10;

  return Math.min(100, Math.max(0, score));
}

// ─── Impact from savings ────────────────────────────────────────────

export function computeImpact(estimatedMonthlySavings: number): Impact {
  if (estimatedMonthlySavings >= 5000) return "CRITICAL";
  if (estimatedMonthlySavings >= 1000) return "HIGH";
  if (estimatedMonthlySavings >= 200) return "MEDIUM";
  return "LOW";
}

// ─── Aggregate Savings ──────────────────────────────────────────────

export interface SavingsSummary {
  totalMonthlySavings: number;
  totalAnnualSavings: number;
  byCloud: Record<CloudProvider, number>;
  byCategory: Record<CostCategory, number>;
  byType: Record<OptimizationType, number>;
  byEffort: Record<Effort, number>;
  topRecommendations: OptimizationRecommendation[];
  count: number;
}

export function aggregateSavings(
  recommendations: OptimizationRecommendation[],
  topN = 10,
): SavingsSummary {
  const byCloud: Record<string, number> = { aws: 0, azure: 0, gcp: 0 };
  const byCategory: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byEffort: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  let totalMonthly = 0;
  for (const rec of recommendations) {
    totalMonthly += rec.estimatedMonthlySavings;
    byCloud[rec.cloud] = (byCloud[rec.cloud] ?? 0) + rec.estimatedMonthlySavings;
    byCategory[rec.category] =
      (byCategory[rec.category] ?? 0) + rec.estimatedMonthlySavings;
    byType[rec.type] = (byType[rec.type] ?? 0) + rec.estimatedMonthlySavings;
    byEffort[rec.effort] =
      (byEffort[rec.effort] ?? 0) + rec.estimatedMonthlySavings;
  }

  const sorted = [...recommendations].sort(
    (a, b) => b.priorityScore - a.priorityScore,
  );

  return {
    totalMonthlySavings: totalMonthly,
    totalAnnualSavings: totalMonthly * 12,
    byCloud: byCloud as Record<CloudProvider, number>,
    byCategory: byCategory as Record<CostCategory, number>,
    byType: byType as Record<OptimizationType, number>,
    byEffort: byEffort as Record<Effort, number>,
    topRecommendations: sorted.slice(0, topN),
    count: recommendations.length,
  };
}

export function sortByPriority(
  recs: OptimizationRecommendation[],
): OptimizationRecommendation[] {
  return [...recs].sort((a, b) => b.priorityScore - a.priorityScore);
}
