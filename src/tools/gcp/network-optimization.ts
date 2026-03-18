import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BigQuery } from "@google-cloud/bigquery";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_network_cost_optimization",
    "Analyze GCP network and egress costs: inter-region transfer, internet egress, and Cloud CDN opportunities using billing export data.",
    {
      projectId: z.string().describe("GCP Project ID"),
      billingDataset: z.string().default("billing_export"),
      billingTable: z.string().default("gcp_billing_export_v1"),
      lookbackDays: z.number().min(1).max(90).default(30),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_network_cost_optimization" });

      try {
        const bigquery = new BigQuery({ projectId: params.projectId });
        const recommendations: OptimizationRecommendation[] = [];

        const query = `
          SELECT
            sku.description AS sku_description,
            SUM(cost) AS total_cost,
            SUM(usage.amount) AS total_usage,
            usage.unit AS usage_unit
          FROM \`${params.projectId}.${params.billingDataset}.${params.billingTable}\`
          WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${params.lookbackDays} DAY)
            AND service.description = 'Compute Engine'
            AND (sku.description LIKE '%Egress%' OR sku.description LIKE '%Network%' OR sku.description LIKE '%Data Transfer%')
            AND cost > 0
          GROUP BY sku_description, usage_unit
          ORDER BY total_cost DESC
          LIMIT ${params.maxResults}
        `;

        try {
          const [rows] = await bigquery.query({ query });

          for (const row of rows) {
            const cost = Number(row.total_cost ?? 0);
            if (cost < 5) continue;

            const sku = String(row.sku_description ?? "");
            const savings = cost * 0.3;

            let actionSteps: string[];
            if (sku.toLowerCase().includes("internet")) {
              actionSteps = [
                "Use Cloud CDN for cacheable content",
                "Enable compression for API responses",
                "Use Premium Tier only where latency matters; Standard Tier is cheaper",
              ];
            } else if (sku.toLowerCase().includes("inter-region")) {
              actionSteps = [
                "Co-locate communicating services in the same region",
                "Use Cloud Interconnect for high-volume inter-region traffic",
              ];
            } else {
              actionSteps = [
                "Review network architecture for optimization opportunities",
                "Use Private Google Access to avoid egress charges for GCP API calls",
              ];
            }

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "Networking",
              type: "NETWORK_OPTIMIZATION",
              category: "NETWORKING",
              title: `Optimize: ${sku} ($${cost.toFixed(2)})`,
              description: `Network cost: $${cost.toFixed(2)} for ${sku} over ${params.lookbackDays} days.`,
              resourceId: sku,
              resourceName: sku,
              accountId: params.projectId,
              currentMonthlyCost: cost,
              projectedMonthlyCost: cost - savings,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 30,
              impact: computeImpact(savings),
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps,
              tags: {},
              detectedAt: new Date(),
              rawData: row,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }
        } catch { /* BigQuery may not have billing export */ }

        recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
        const totalSavings = recommendations.reduce((s, r) => s + r.estimatedMonthlySavings, 0);

        const result: ToolResponse<{
          recommendations: OptimizationRecommendation[];
          totalMonthlySavings: number;
          totalAnnualSavings: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: { recommendations, totalMonthlySavings: totalSavings, totalAnnualSavings: totalSavings * 12, count: recommendations.length },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
