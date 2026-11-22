import type {
  CostTrend,
  CostDataPoint,
  CloudProvider,
  CostCategory,
} from "../../types/cost.js";

// Trend Detection

export function analyzeTrend(
  dataPoints: CostDataPoint[],
): "INCREASING" | "DECREASING" | "STABLE" | "ANOMALOUS" {
  if (dataPoints.length < 2) return "STABLE";

  const sorted = [...dataPoints].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const amounts = sorted.map((d) => d.amount);
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  const stdDev = Math.sqrt(
    amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length,
  );

  // Check for anomalies (any point > 2 std deviations from mean)
  const hasAnomaly = amounts.some((v) => Math.abs(v - mean) > 2 * stdDev);
  if (hasAnomaly && stdDev > mean * 0.3) return "ANOMALOUS";

  // Linear regression slope
  const n = amounts.length;
  const xMean = (n - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (amounts[i] - mean);
    denominator += (i - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const relativeSlope = mean === 0 ? 0 : slope / mean;

  if (relativeSlope > 0.05) return "INCREASING";
  if (relativeSlope < -0.05) return "DECREASING";
  return "STABLE";
}

// Percent Change

export function computePercentChange(
  dataPoints: CostDataPoint[],
): number {
  if (dataPoints.length < 2) return 0;
  const sorted = [...dataPoints].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const first = sorted[0].amount;
  const last = sorted[sorted.length - 1].amount;
  if (first === 0) return last > 0 ? 100 : 0;
  return ((last - first) / first) * 100;
}

// Average Daily Cost

export function computeAverageDailyCost(dataPoints: CostDataPoint[]): number {
  if (dataPoints.length === 0) return 0;
  const total = dataPoints.reduce((s, d) => s + d.amount, 0);
  return total / dataPoints.length;
}

// Build Cost Trend

export function buildCostTrend(
  cloud: CloudProvider,
  service: string,
  category: CostCategory,
  dataPoints: CostDataPoint[],
): CostTrend {
  return {
    cloud,
    service,
    category,
    dataPoints,
    trend: analyzeTrend(dataPoints),
    percentChange: computePercentChange(dataPoints),
    averageDailyCost: computeAverageDailyCost(dataPoints),
  };
}

// Detect Cost Anomalies

export interface CostAnomaly {
  date: Date;
  amount: number;
  expectedAmount: number;
  deviationPercent: number;
  service: string;
  cloud: CloudProvider;
}

export function detectAnomalies(
  dataPoints: CostDataPoint[],
  cloud: CloudProvider,
  service: string,
  thresholdMultiplier = 2.0,
): CostAnomaly[] {
  if (dataPoints.length < 7) return [];

  const amounts = dataPoints.map((d) => d.amount);
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  const stdDev = Math.sqrt(
    amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length,
  );

  const anomalies: CostAnomaly[] = [];
  for (const dp of dataPoints) {
    const deviation = Math.abs(dp.amount - mean);
    if (deviation > stdDev * thresholdMultiplier) {
      anomalies.push({
        date: new Date(dp.date),
        amount: dp.amount,
        expectedAmount: mean,
        deviationPercent: mean === 0 ? 100 : (deviation / mean) * 100,
        service,
        cloud,
      });
    }
  }
  return anomalies;
}
