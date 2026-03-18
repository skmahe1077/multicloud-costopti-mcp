import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CostExplorerClient,
  GetRightsizingRecommendationCommand,
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
    "aws_get_rightsizing_recommendations",
    "Get EC2 rightsizing recommendations from AWS Cost Explorer. Identifies over-provisioned and idle instances with projected savings amounts.",
    {
      service: z
        .enum(["AmazonEC2"])
        .default("AmazonEC2")
        .describe("AWS service to get rightsizing for"),
      lookbackDays: z
        .enum(["SEVEN_DAYS", "THIRTY_DAYS", "SIXTY_DAYS"])
        .default("THIRTY_DAYS"),
      maxResults: z.number().min(1).max(200).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_rightsizing_recommendations" });

      try {
        const client = new CostExplorerClient({ requestHandler: { requestTimeout: 30000 } });

        const command = new GetRightsizingRecommendationCommand({
          Service: params.service,
          Configuration: {
            RecommendationTarget: "SAME_INSTANCE_FAMILY",
            BenefitsConsidered: true,
          },
        });

        const response = await client.send(command);
        const recommendations: OptimizationRecommendation[] = [];

        for (const rec of (response.RightsizingRecommendations ?? []).slice(0, params.maxResults)) {
          const currentCost = parseFloat(
            rec.CurrentInstance?.MonthlyCost ?? "0",
          );
          const targetCost = parseFloat(
            rec.ModifyRecommendationDetail?.TargetInstances?.[0]
              ?.EstimatedMonthlyCost ?? "0",
          );
          const savings = currentCost - targetCost;
          const savingsPct = currentCost > 0 ? (savings / currentCost) * 100 : 0;
          const effort = rec.RightsizingType === "TERMINATE" ? "LOW" as const : "MEDIUM" as const;
          const type = rec.RightsizingType === "TERMINATE" ? "IDLE_RESOURCE" as const : "RIGHTSIZING" as const;

          const targetInstance =
            rec.ModifyRecommendationDetail?.TargetInstances?.[0]
              ?.ResourceDetails?.EC2ResourceDetails;
          const currentInstance =
            rec.CurrentInstance?.ResourceDetails?.EC2ResourceDetails;

          const optimization: OptimizationRecommendation = {
            id: uuid(),
            cloud: "aws",
            service: "EC2",
            type,
            category: "COMPUTE",
            title:
              rec.RightsizingType === "TERMINATE"
                ? `Terminate idle EC2 instance ${rec.CurrentInstance?.ResourceId}`
                : `Rightsize EC2 ${currentInstance?.InstanceType} → ${targetInstance?.InstanceType}`,
            description: `Instance ${rec.CurrentInstance?.ResourceId} is ${rec.RightsizingType === "TERMINATE" ? "idle and should be terminated" : `over-provisioned — downsize from ${currentInstance?.InstanceType} to ${targetInstance?.InstanceType}`}`,
            resourceId: rec.CurrentInstance?.ResourceId ?? "unknown",
            resourceName: rec.CurrentInstance?.ResourceId ?? "unknown",
            region: currentInstance?.Region,
            accountId: rec.AccountId,
            currentMonthlyCost: currentCost,
            projectedMonthlyCost: targetCost,
            estimatedMonthlySavings: savings,
            estimatedAnnualSavings: savings * 12,
            savingsPercentage: savingsPct,
            impact: computeImpact(savings),
            effort,
            priorityScore: 0,
            actionSteps:
              rec.RightsizingType === "TERMINATE"
                ? [
                    "Verify instance is not in use",
                    "Create AMI backup if needed",
                    "Terminate the instance",
                    "Release associated Elastic IP if any",
                  ]
                : [
                    `Stop the instance`,
                    `Change instance type to ${targetInstance?.InstanceType}`,
                    `Start the instance`,
                    "Verify application performance",
                  ],
            tags: {},
            detectedAt: new Date(),
            rawData: rec,
          };
          optimization.priorityScore = computePriorityScore(optimization);
          recommendations.push(optimization);
        }

        recommendations.sort((a, b) => b.priorityScore - a.priorityScore);

        const totalSavings = recommendations.reduce(
          (s, r) => s + r.estimatedMonthlySavings,
          0,
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
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }],
        };
      }
    },
  );
}
