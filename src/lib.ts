// ─── Server Factory ─────────────────────────────────────────────────
export { createServer, type CreateServerOptions, retry } from "./server.js";

// ─── Core Types ─────────────────────────────────────────────────────
export type {
  CloudProvider,
  CostCategory,
  OptimizationType,
  Effort,
  Impact,
  NormalizedCostItem,
  OptimizationRecommendation,
  UnusedResource,
  BudgetStatus,
  BudgetAlert,
  CostTrend,
  CostDataPoint,
  TagCoverage,
  TagGap,
  CostDashboardSummary,
  ServiceCost,
  ToolResponse,
} from "./types/cost.js";

// ─── Normalizers ────────────────────────────────────────────────────
export {
  normalizeAwsCostItem,
  normalizeAzureCostItem,
  normalizeGcpCostItem,
  mapAwsServiceToCategory,
  mapAzureServiceToCategory,
  mapGcpServiceToCategory,
  groupCostsByCloud,
} from "./tools/shared/cost-normalizer.js";

// ─── Savings Calculator ─────────────────────────────────────────────
export {
  computePriorityScore,
  computeImpact,
  aggregateSavings,
  sortByPriority,
  type SavingsSummary,
} from "./tools/shared/savings-calculator.js";

// ─── Cost Trend Analyzer ────────────────────────────────────────────
export {
  analyzeTrend,
  computePercentChange,
  computeAverageDailyCost,
  buildCostTrend,
  detectAnomalies,
  type CostAnomaly,
} from "./tools/shared/cost-trend-analyzer.js";

// ─── Tag Analyzer ───────────────────────────────────────────────────
export {
  analyzeTagCoverage,
  mergeTagCoverage,
  DEFAULT_REQUIRED_TAGS,
  type ResourceForTagAnalysis,
  type MergedTagCoverage,
} from "./tools/shared/tag-analyzer.js";
