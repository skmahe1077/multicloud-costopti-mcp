import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SupportClient,
  DescribeTrustedAdvisorChecksCommand,
  DescribeTrustedAdvisorCheckResultCommand,
} from "@aws-sdk/client-support";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_trusted_advisor_cost_checks",
    "Retrieve AWS Trusted Advisor cost optimization checks. Requires Business or Enterprise Support plan. Shows idle resources, underutilized instances, and savings opportunities.",
    {
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_trusted_advisor_cost_checks" });

      try {
        const client = new SupportClient({
          region: "us-east-1",
          requestHandler: { requestTimeout: 30000 },
        });

        // Get all checks
        const checks = await client.send(
          new DescribeTrustedAdvisorChecksCommand({ language: "en" }),
        );

        // Filter cost optimization checks
        const costChecks = (checks.checks ?? []).filter(
          (c) => c.category === "cost_optimizing",
        );

        const recommendations: OptimizationRecommendation[] = [];

        for (const check of costChecks.slice(0, params.maxResults)) {
          try {
            const result = await client.send(
              new DescribeTrustedAdvisorCheckResultCommand({
                checkId: check.id!,
              }),
            );

            const flaggedResources = result.result?.flaggedResources ?? [];
            if (flaggedResources.length === 0) continue;

            const savings = parseFloat(
              result.result?.categorySpecificSummary?.costOptimizing
                ?.estimatedMonthlySavings?.toString() ?? "0",
            );

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "Trusted Advisor",
              type: "UNUSED_RESOURCE",
              category: "OTHER",
              title: `${check.name}: ${flaggedResources.length} resource(s) flagged`,
              description: check.description?.replace(/<[^>]*>/g, "").slice(0, 300) ?? "",
              resourceId: check.id ?? "unknown",
              resourceName: check.name ?? "unknown",
              currentMonthlyCost: savings,
              projectedMonthlyCost: 0,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 100,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                `Review ${flaggedResources.length} flagged resources`,
                "Take action on each resource per Trusted Advisor guidance",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: { check, flaggedCount: flaggedResources.length, savings },
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          } catch {
            // Individual check may fail
          }
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
          checksEvaluated: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            checksEvaluated: costChecks.length,
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
