import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebSiteManagementClient } from "@azure/arm-appservice";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_app_service_optimization",
    "Analyze Azure App Service plans for cost optimization: over-provisioned plans, empty plans, and plans that could use consumption/dynamic pricing.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_app_service_optimization" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new WebSiteManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const plan of client.appServicePlans.list()) {
          if (recommendations.length >= params.maxResults) break;

          const planName = plan.name ?? "unknown";
          const sku = plan.sku;
          const tier = sku?.tier ?? "Free";
          const numberOfSites = plan.numberOfSites ?? 0;
          const estimatedCost = estimatePlanCost(tier, sku?.size ?? "S1", plan.numberOfWorkers ?? 1);

          // Empty App Service Plan
          if (numberOfSites === 0 && tier !== "Free" && tier !== "Shared") {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "App Service",
              type: "UNUSED_RESOURCE",
              category: "COMPUTE",
              title: `Empty App Service Plan: ${planName} (${tier})`,
              description: `App Service Plan ${planName} (${tier} ${sku?.size}) has no apps deployed but costs $${estimatedCost.toFixed(2)}/mo.`,
              resourceId: plan.id ?? planName,
              resourceName: planName,
              region: plan.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: estimatedCost,
              projectedMonthlyCost: 0,
              estimatedMonthlySavings: estimatedCost,
              estimatedAnnualSavings: estimatedCost * 12,
              savingsPercentage: 100,
              impact: computeImpact(estimatedCost),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: ["Delete the empty App Service Plan"],
              tags: {},
              detectedAt: new Date(),
              rawData: plan,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // Premium plan with low site count — consider Standard
          if ((tier === "PremiumV2" || tier === "PremiumV3") && numberOfSites <= 2) {
            const standardCost = estimatedCost * 0.5;
            const savings = estimatedCost - standardCost;
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "App Service",
              type: "RIGHTSIZING",
              category: "COMPUTE",
              title: `Downgrade App Service Plan: ${planName} (${tier} → Standard)`,
              description: `Plan ${planName} uses ${tier} with only ${numberOfSites} app(s). Standard tier may be sufficient and saves ~50%.`,
              resourceId: plan.id ?? planName,
              resourceName: planName,
              region: plan.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: estimatedCost,
              projectedMonthlyCost: standardCost,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 50,
              impact: computeImpact(savings),
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps: [
                "Review if Premium features (VNet integration, slots, etc.) are needed",
                `Scale down from ${tier} to Standard`,
                "Monitor app performance after change",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: plan,
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

function estimatePlanCost(tier: string, size: string, workers: number): number {
  const baseCosts: Record<string, number> = {
    Free: 0, Shared: 10, Basic: 55, Standard: 73, PremiumV2: 146, PremiumV3: 180, Isolated: 320,
  };
  return (baseCosts[tier] ?? 73) * workers;
}
