import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_data_transfer_costs",
    "Analyze AWS data transfer costs by type (inter-region, internet, inter-AZ, VPC peering). Identifies high-cost transfer patterns with optimization recommendations.",
    {
      startDate: z
        .string()
        .default(new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]),
      endDate: z
        .string()
        .default(new Date().toISOString().split("T")[0]),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_data_transfer_costs" });

      try {
        const client = new CostExplorerClient({ requestHandler: { requestTimeout: 30000 } });

        const command = new GetCostAndUsageCommand({
          TimePeriod: { Start: params.startDate, End: params.endDate },
          Granularity: "MONTHLY",
          Metrics: ["BlendedCost", "UsageQuantity"],
          GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
          Filter: {
            Dimensions: {
              Key: "USAGE_TYPE",
              Values: [],
              MatchOptions: ["CONTAINS"],
            },
          },
        });

        // Fallback: get all usage and filter for data transfer
        const allUsageCommand = new GetCostAndUsageCommand({
          TimePeriod: { Start: params.startDate, End: params.endDate },
          Granularity: "MONTHLY",
          Metrics: ["BlendedCost", "UsageQuantity"],
          GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
        });

        const response = await client.send(allUsageCommand);
        const transferItems: Array<{ usageType: string; cost: number; usage: number }> = [];

        for (const result of response.ResultsByTime ?? []) {
          for (const group of result.Groups ?? []) {
            const usageType = group.Keys?.[0] ?? "";
            if (
              usageType.includes("DataTransfer") ||
              usageType.includes("Bytes") ||
              usageType.includes("In-Bytes") ||
              usageType.includes("Out-Bytes") ||
              usageType.includes("Regional-Bytes") ||
              usageType.includes("InterZone")
            ) {
              const cost = parseFloat(group.Metrics?.BlendedCost?.Amount ?? "0");
              const usage = parseFloat(group.Metrics?.UsageQuantity?.Amount ?? "0");
              if (cost > 0) {
                transferItems.push({ usageType, cost, usage });
              }
            }
          }
        }

        transferItems.sort((a, b) => b.cost - a.cost);
        const topItems = transferItems.slice(0, params.maxResults);
        const totalDataTransferCost = transferItems.reduce((s, i) => s + i.cost, 0);

        const recommendations: OptimizationRecommendation[] = [];

        for (const item of topItems) {
          if (item.cost < 10) continue;

          let actionSteps: string[];
          let description: string;

          if (item.usageType.includes("InterZone") || item.usageType.includes("Regional")) {
            description = `Inter-AZ data transfer: $${item.cost.toFixed(2)} — consider co-locating resources in the same AZ`;
            actionSteps = [
              "Identify services communicating across AZs",
              "Co-locate frequently communicating services in the same AZ",
              "Use VPC endpoints for AWS service calls",
              "Consider using S3 Transfer Acceleration for S3 uploads",
            ];
          } else if (item.usageType.includes("Out")) {
            description = `Internet egress: $${item.cost.toFixed(2)} — consider CloudFront or compression`;
            actionSteps = [
              "Use CloudFront for content delivery (reduces egress costs)",
              "Enable compression (gzip/brotli) for API responses",
              "Cache static assets at the edge",
              "Consider AWS Global Accelerator for latency-sensitive traffic",
            ];
          } else {
            description = `Data transfer cost: $${item.cost.toFixed(2)} for ${item.usageType}`;
            actionSteps = [
              "Review data transfer patterns",
              "Use VPC endpoints to keep traffic on AWS network",
              "Consider PrivateLink for cross-account communication",
            ];
          }

          const savings = item.cost * 0.3;
          const rec: OptimizationRecommendation = {
            id: uuid(),
            cloud: "aws",
            service: "Data Transfer",
            type: "NETWORK_OPTIMIZATION",
            category: "NETWORKING",
            title: `Optimize data transfer: ${item.usageType}`,
            description,
            resourceId: item.usageType,
            resourceName: item.usageType,
            currentMonthlyCost: item.cost,
            projectedMonthlyCost: item.cost - savings,
            estimatedMonthlySavings: savings,
            estimatedAnnualSavings: savings * 12,
            savingsPercentage: 30,
            impact: computeImpact(savings),
            effort: "MEDIUM",
            priorityScore: 0,
            actionSteps,
            tags: {},
            detectedAt: new Date(),
            rawData: item,
          };
          rec.priorityScore = computePriorityScore(rec);
          recommendations.push(rec);
        }

        recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
        const totalSavings = recommendations.reduce((s, r) => s + r.estimatedMonthlySavings, 0);

        const result: ToolResponse<{
          transferBreakdown: typeof topItems;
          recommendations: OptimizationRecommendation[];
          totalDataTransferCost: number;
          totalMonthlySavings: number;
          totalAnnualSavings: number;
        }> = {
          success: true,
          requestId,
          data: {
            transferBreakdown: topItems,
            recommendations,
            totalDataTransferCost,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
