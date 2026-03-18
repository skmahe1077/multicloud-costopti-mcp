import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AdvisorManagementClient } from "@azure/arm-advisor";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";
import { mapAzureServiceToCategory } from "../shared/cost-normalizer.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_advisor_cost_recommendations",
    "Retrieve Azure Advisor cost optimization recommendations including VM rightsizing, reserved instances, and unused resource detection.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(100).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_advisor_cost_recommendations" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new AdvisorManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const rec of client.recommendations.list({ filter: "Category eq 'Cost'" })) {
          if (recommendations.length >= params.maxResults) break;

          const savings = parseFloat(
            rec.extendedProperties?.annualSavingsAmount ?? "0",
          ) / 12;
          const savingsCurrency = rec.extendedProperties?.savingsCurrency ?? "USD";
          const resourceId = rec.resourceMetadata?.resourceId ?? "unknown";
          const service = rec.impactedField ?? "Unknown";

          const opt: OptimizationRecommendation = {
            id: uuid(),
            cloud: "azure",
            service,
            type: rec.shortDescription?.problem?.toLowerCase().includes("reserved")
              ? "RESERVED_INSTANCE"
              : rec.shortDescription?.problem?.toLowerCase().includes("right-size")
                ? "RIGHTSIZING"
                : "UNUSED_RESOURCE",
            category: mapAzureServiceToCategory(service),
            title: rec.shortDescription?.problem ?? "Azure Advisor cost recommendation",
            description: rec.shortDescription?.solution ?? "",
            resourceId,
            resourceName: rec.impactedValue ?? resourceId,
            accountId: params.subscriptionId,
            currentMonthlyCost: savings * 2,
            projectedMonthlyCost: savings,
            estimatedMonthlySavings: savings,
            estimatedAnnualSavings: savings * 12,
            savingsPercentage: 50,
            impact: computeImpact(savings),
            effort: rec.impact === "High" ? "LOW" as const : "MEDIUM" as const,
            priorityScore: 0,
            actionSteps: [
              rec.shortDescription?.solution ?? "Follow Azure Advisor guidance",
              `Review resource: ${resourceId}`,
            ],
            tags: {},
            detectedAt: new Date(),
            rawData: rec,
          };
          opt.priorityScore = computePriorityScore(opt);
          recommendations.push(opt);
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
