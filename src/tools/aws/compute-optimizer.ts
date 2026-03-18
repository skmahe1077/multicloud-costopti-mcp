import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ComputeOptimizerClient,
  GetEC2InstanceRecommendationsCommand,
  GetAutoScalingGroupRecommendationsCommand,
  GetEBSVolumeRecommendationsCommand,
  GetLambdaFunctionRecommendationsCommand,
} from "@aws-sdk/client-compute-optimizer";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_compute_optimizer_recommendations",
    "Get AWS Compute Optimizer recommendations for EC2 instances, Auto Scaling groups, EBS volumes, and Lambda functions. Requires Compute Optimizer to be opted in.",
    {
      resourceType: z
        .enum(["EC2", "AUTO_SCALING", "EBS", "LAMBDA"])
        .default("EC2"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_compute_optimizer_recommendations" });

      try {
        const client = new ComputeOptimizerClient({ requestHandler: { requestTimeout: 30000 } });
        const recommendations: OptimizationRecommendation[] = [];

        if (params.resourceType === "EC2") {
          const resp = await client.send(new GetEC2InstanceRecommendationsCommand({
            maxResults: params.maxResults,
          }));

          for (const rec of resp.instanceRecommendations ?? []) {
            if (rec.finding === "Overprovisioned" || rec.finding === "Underprovisioned") {
              const current = rec.currentInstanceType ?? "unknown";
              const target = rec.recommendationOptions?.[0]?.instanceType ?? current;
              const currentCost = rec.recommendationOptions?.[0]?.projectedUtilizationMetrics?.[0]?.value ?? 0;
              const savings = rec.recommendationOptions?.[0]?.savingsOpportunity?.estimatedMonthlySavings?.value ?? 0;
              const savingsPct = rec.recommendationOptions?.[0]?.savingsOpportunity?.savingsOpportunityPercentage ?? 0;

              const opt: OptimizationRecommendation = {
                id: uuid(),
                cloud: "aws",
                service: "EC2",
                type: "RIGHTSIZING",
                category: "COMPUTE",
                title: `Compute Optimizer: ${rec.finding} — ${current} → ${target}`,
                description: `Instance ${rec.instanceArn} is ${rec.finding?.toLowerCase()}. Recommendation: change from ${current} to ${target}`,
                resourceId: rec.instanceArn ?? "unknown",
                resourceName: rec.instanceName ?? "unknown",
                currentMonthlyCost: savings / (savingsPct / 100 || 1),
                projectedMonthlyCost: (savings / (savingsPct / 100 || 1)) - savings,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: savingsPct,
                impact: computeImpact(savings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  `Stop instance`,
                  `Change instance type from ${current} to ${target}`,
                  `Start instance`,
                  "Verify performance metrics",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: rec,
              };
              opt.priorityScore = computePriorityScore(opt);
              recommendations.push(opt);
            }
          }
        } else if (params.resourceType === "LAMBDA") {
          const resp = await client.send(new GetLambdaFunctionRecommendationsCommand({
            maxResults: params.maxResults,
          }));

          for (const rec of resp.lambdaFunctionRecommendations ?? []) {
            if (rec.finding === "Optimized") continue;
            const savings = rec.memorySizeRecommendationOptions?.[0]?.savingsOpportunity?.estimatedMonthlySavings?.value ?? 0;
            const savingsPct = rec.memorySizeRecommendationOptions?.[0]?.savingsOpportunity?.savingsOpportunityPercentage ?? 0;
            const targetMemory = rec.memorySizeRecommendationOptions?.[0]?.memorySize ?? 0;

            const opt: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "Lambda",
              type: "RIGHTSIZING",
              category: "SERVERLESS",
              title: `Optimize Lambda ${rec.functionArn?.split(":").pop()}: memory → ${targetMemory}MB`,
              description: `Finding: ${rec.finding}. Current memory: ${rec.currentMemorySize}MB. Recommended: ${targetMemory}MB`,
              resourceId: rec.functionArn ?? "unknown",
              resourceName: rec.functionArn?.split(":").pop() ?? "unknown",
              currentMonthlyCost: savings / (savingsPct / 100 || 1),
              projectedMonthlyCost: (savings / (savingsPct / 100 || 1)) - savings,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: savingsPct,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                `Update Lambda memory to ${targetMemory}MB`,
                "Monitor duration and cost after change",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: rec,
            };
            opt.priorityScore = computePriorityScore(opt);
            recommendations.push(opt);
          }
        } else if (params.resourceType === "EBS") {
          const resp = await client.send(new GetEBSVolumeRecommendationsCommand({
            maxResults: params.maxResults,
          }));

          for (const rec of resp.volumeRecommendations ?? []) {
            if (rec.finding === "Optimized") continue;
            const savings = rec.volumeRecommendationOptions?.[0]?.savingsOpportunity?.estimatedMonthlySavings?.value ?? 0;
            const targetType = rec.volumeRecommendationOptions?.[0]?.configuration?.volumeType ?? "gp3";

            const opt: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "EBS",
              type: "RIGHTSIZING",
              category: "STORAGE",
              title: `Optimize EBS ${rec.volumeArn?.split("/").pop()}: → ${targetType}`,
              description: `Volume finding: ${rec.finding}. Recommended type: ${targetType}`,
              resourceId: rec.volumeArn ?? "unknown",
              resourceName: rec.volumeArn?.split("/").pop() ?? "unknown",
              currentMonthlyCost: savings * 2,
              projectedMonthlyCost: savings,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 50,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [`Modify volume type to ${targetType}`, "Monitor performance"],
              tags: {},
              detectedAt: new Date(),
              rawData: rec,
            };
            opt.priorityScore = computePriorityScore(opt);
            recommendations.push(opt);
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
