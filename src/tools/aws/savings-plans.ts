import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CostExplorerClient,
  GetSavingsPlansPurchaseRecommendationCommand,
} from "@aws-sdk/client-cost-explorer";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import {
  computePriorityScore,
  computeImpact,
} from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_savings_plans_recommendations",
    "Get AWS Savings Plans purchase recommendations based on historical usage patterns. Shows commitment options with projected savings for Compute, EC2, and SageMaker.",
    {
      savingsPlansType: z
        .enum(["COMPUTE_SP", "EC2_INSTANCE_SP", "SAGEMAKER_SP"])
        .default("COMPUTE_SP"),
      termInYears: z.enum(["ONE_YEAR", "THREE_YEARS"]).default("ONE_YEAR"),
      paymentOption: z
        .enum(["NO_UPFRONT", "PARTIAL_UPFRONT", "ALL_UPFRONT"])
        .default("NO_UPFRONT"),
      lookbackPeriod: z
        .enum(["SEVEN_DAYS", "THIRTY_DAYS", "SIXTY_DAYS"])
        .default("THIRTY_DAYS"),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_savings_plans_recommendations" });

      try {
        const client = new CostExplorerClient({ requestHandler: { requestTimeout: 30000 } });

        const command = new GetSavingsPlansPurchaseRecommendationCommand({
          SavingsPlansType: params.savingsPlansType,
          TermInYears: params.termInYears,
          PaymentOption: params.paymentOption,
          LookbackPeriodInDays: params.lookbackPeriod,
        });

        const response = await client.send(command);
        const recommendations: OptimizationRecommendation[] = [];

        for (const detail of response.SavingsPlansPurchaseRecommendation
          ?.SavingsPlansPurchaseRecommendationDetails ?? []) {
          const currentCost = parseFloat(
            detail.CurrentAverageHourlyOnDemandSpend ?? "0",
          ) * 730;
          const commitment = parseFloat(detail.HourlyCommitmentToPurchase ?? "0") * 730;
          const savings = parseFloat(
            detail.EstimatedMonthlySavingsAmount ?? "0",
          );
          const savingsPct = currentCost > 0 ? (savings / currentCost) * 100 : 0;

          const rec: OptimizationRecommendation = {
            id: uuid(),
            cloud: "aws",
            service: params.savingsPlansType.replace("_SP", "").replace("_", " "),
            type: "SAVINGS_PLAN",
            category: "COMPUTE",
            title: `Purchase ${params.savingsPlansType} Savings Plan — $${commitment.toFixed(2)}/mo commitment`,
            description: `Based on ${params.lookbackPeriod.replace("_", " ").toLowerCase()} usage, a ${params.termInYears.replace("_", " ").toLowerCase()} ${params.paymentOption.replace(/_/g, " ").toLowerCase()} Savings Plan could save $${savings.toFixed(2)}/mo`,
            resourceId: "savings-plan-recommendation",
            resourceName: params.savingsPlansType,
            accountId: detail.AccountId,
            currentMonthlyCost: currentCost,
            projectedMonthlyCost: currentCost - savings,
            estimatedMonthlySavings: savings,
            estimatedAnnualSavings: savings * 12,
            savingsPercentage: savingsPct,
            impact: computeImpact(savings),
            effort: "LOW",
            priorityScore: 0,
            actionSteps: [
              `Review ${params.lookbackPeriod.replace("_", " ").toLowerCase()} usage patterns`,
              `Purchase ${params.savingsPlansType} with $${(parseFloat(detail.HourlyCommitmentToPurchase ?? "0")).toFixed(4)}/hr commitment`,
              `Select ${params.termInYears.replace("_", " ").toLowerCase()} term, ${params.paymentOption.replace(/_/g, " ").toLowerCase()}`,
              "Monitor utilization in Savings Plans dashboard",
            ],
            tags: {},
            detectedAt: new Date(),
            rawData: detail,
          };
          rec.priorityScore = computePriorityScore(rec);
          recommendations.push(rec);
        }

        const totalSavings = recommendations.reduce(
          (s, r) => s + r.estimatedMonthlySavings, 0,
        );

        const result: ToolResponse<{
          recommendations: OptimizationRecommendation[];
          totalMonthlySavings: number;
          totalAnnualSavings: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            count: recommendations.length,
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
