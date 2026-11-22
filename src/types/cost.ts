// Core Types

export type CloudProvider = "aws" | "azure" | "gcp";

export type CostCategory =
  | "COMPUTE"
  | "STORAGE"
  | "DATABASE"
  | "NETWORKING"
  | "SERVERLESS"
  | "CONTAINER"
  | "AI_ML"
  | "DATA_ANALYTICS"
  | "SECURITY"
  | "MANAGEMENT"
  | "OTHER";

export type OptimizationType =
  | "RIGHTSIZING"
  | "UNUSED_RESOURCE"
  | "IDLE_RESOURCE"
  | "RESERVED_INSTANCE"
  | "SAVINGS_PLAN"
  | "COMMITTED_USE"
  | "STORAGE_TIERING"
  | "SPOT_INSTANCE"
  | "LICENSE_OPTIMIZATION"
  | "NETWORK_OPTIMIZATION"
  | "SCHEDULING"
  | "MODERNIZATION";

export type Effort = "LOW" | "MEDIUM" | "HIGH";
export type Impact = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Normalized Cost Item

export interface NormalizedCostItem {
  id: string;
  cloud: CloudProvider;
  service: string;
  category: CostCategory;
  resourceId: string;
  resourceName: string;
  region?: string;
  accountId?: string;
  currentMonthlyCost: number;
  previousMonthlyCost: number;
  costChange: number; // percentage change
  currency: string;
  tags: Record<string, string>;
  periodStart: Date;
  periodEnd: Date;
  rawData: unknown;
}

// Optimization Recommendation

export interface OptimizationRecommendation {
  id: string;
  cloud: CloudProvider;
  service: string;
  type: OptimizationType;
  category: CostCategory;
  title: string;
  description: string;
  resourceId: string;
  resourceName: string;
  region?: string;
  accountId?: string;
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
  estimatedMonthlySavings: number;
  estimatedAnnualSavings: number;
  savingsPercentage: number;
  impact: Impact;
  effort: Effort;
  priorityScore: number; // 0-100
  actionSteps: string[];
  tags: Record<string, string>;
  detectedAt: Date;
  rawData: unknown;
}

// Unused / Idle Resource

export interface UnusedResource {
  id: string;
  cloud: CloudProvider;
  service: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  region?: string;
  accountId?: string;
  monthlyCost: number;
  lastUsedDate?: Date;
  daysSinceLastUse?: number;
  reason: string;
  actionSteps: string[];
  tags: Record<string, string>;
  detectedAt: Date;
  rawData: unknown;
}

// Budget & Forecast

export interface BudgetStatus {
  cloud: CloudProvider;
  budgetName: string;
  budgetAmount: number;
  currentSpend: number;
  forecastedSpend: number;
  percentUsed: number;
  percentForecasted: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  isOverBudget: boolean;
  isForecastOverBudget: boolean;
  alerts: BudgetAlert[];
}

export interface BudgetAlert {
  threshold: number;
  currentAmount: number;
  alertType: "ACTUAL" | "FORECASTED";
  triggered: boolean;
}

// Cost Trend

export interface CostTrend {
  cloud: CloudProvider;
  service: string;
  category: CostCategory;
  dataPoints: CostDataPoint[];
  trend: "INCREASING" | "DECREASING" | "STABLE" | "ANOMALOUS";
  percentChange: number;
  averageDailyCost: number;
}

export interface CostDataPoint {
  date: Date;
  amount: number;
  currency: string;
}

// Tag Coverage

export interface TagCoverage {
  cloud: CloudProvider;
  totalResources: number;
  taggedResources: number;
  untaggedResources: number;
  coveragePercent: number;
  requiredTags: string[];
  missingTagsByResource: TagGap[];
}

export interface TagGap {
  resourceId: string;
  resourceType: string;
  monthlyCost: number;
  missingTags: string[];
}

// Cross-Cloud Summary

export interface CostDashboardSummary {
  clouds: CloudProvider[];
  totalMonthlyCost: number;
  totalPreviousMonthlyCost: number;
  costChange: number;
  currency: string;
  costByCloud: Record<CloudProvider, number>;
  costByCategory: Record<CostCategory, number>;
  topServices: ServiceCost[];
  totalPotentialSavings: number;
  optimizationCount: number;
  evaluatedAt: Date;
}

export interface ServiceCost {
  cloud: CloudProvider;
  service: string;
  category: CostCategory;
  monthlyCost: number;
  percentOfTotal: number;
}

// Tool Response Wrapper

export interface ToolResponse<T> {
  success: boolean;
  requestId: string;
  data?: T;
  warnings?: string[];
  error?: string;
}
