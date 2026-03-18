import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CostExplorerClient,
  GetReservationPurchaseRecommendationCommand,
} from "@aws-sdk/client-cost-explorer";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_reserved_instance_recommendations",
    "Get Reserved Instance purchase recommendations from AWS Cost Explorer for EC2, RDS, ElastiCache, OpenSearch, and Redshift.",
    {
      service: z
        .enum([
          "Amazon Elastic Compute Cloud - Compute",
          "Amazon Relational Database Service",
          "Amazon ElastiCache",
          "Amazon OpenSearch Service",
          "Amazon Redshift",
        ])
        .default("Amazon Elastic Compute Cloud - Compute"),
      termInYears: z.enum(["ONE_YEAR", "THREE_YEARS"]).default("ONE_YEAR"),
      paymentOption: z
        .enum(["NO_UPFRONT", "PARTIAL_UPFRONT", "ALL_UPFRONT"])
        .default("PARTIAL_UPFRONT"),
      lookbackPeriod: z
        .enum(["SEVEN_DAYS", "THIRTY_DAYS", "SIXTY_DAYS"])
        .default("THIRTY_DAYS"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_reserved_instance_recommendations" });

      try {
        const client = new CostExplorerClient({ requestHandler: { requestTimeout: 30000 } });

        const command = new GetReservationPurchaseRecommendationCommand({
          Service: params.service,
          TermInYears: params.termInYears,
          PaymentOption: params.paymentOption,
          LookbackPeriodInDays: params.lookbackPeriod,
        });

        const response = await client.send(command);
        const recommendations: OptimizationRecommendation[] = [];

        for (const recGroup of response.Recommendations ?? []) {
          for (const detail of (recGroup.RecommendationDetails ?? []).slice(0, params.maxResults)) {
            const currentCost = parseFloat(detail.AverageNormalizedUnitsUsedPerHour ?? "0") * 730 * 0.05;
            const savings = parseFloat(detail.EstimatedMonthlySavingsAmount ?? "0");
            const savingsPct = parseFloat(detail.EstimatedMonthlySavingsPercentage ?? "0");

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: params.service.split(" - ")[0].replace("Amazon ", ""),
              type: "RESERVED_INSTANCE",
              category: "COMPUTE",
              title: `Purchase RI for ${detail.InstanceDetails?.EC2InstanceDetails?.InstanceType ?? params.service} — save $${savings.toFixed(2)}/mo`,
              description: `Reserved Instance recommendation: ${detail.RecommendedNumberOfInstancesToPurchase ?? "N/A"} instance(s), ${params.termInYears.replace("_", " ").toLowerCase()}, ${params.paymentOption.replace(/_/g, " ").toLowerCase()}`,
              resourceId: "ri-recommendation",
              resourceName: detail.InstanceDetails?.EC2InstanceDetails?.InstanceType ?? params.service,
              region: detail.InstanceDetails?.EC2InstanceDetails?.Region,
              currentMonthlyCost: currentCost,
              projectedMonthlyCost: currentCost - savings,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: savingsPct,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                `Purchase ${detail.RecommendedNumberOfInstancesToPurchase} Reserved Instance(s)`,
                `Term: ${params.termInYears.replace("_", " ").toLowerCase()}`,
                `Payment: ${params.paymentOption.replace(/_/g, " ").toLowerCase()}`,
                "Monitor RI utilization in Cost Explorer",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: detail,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }
        }

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
