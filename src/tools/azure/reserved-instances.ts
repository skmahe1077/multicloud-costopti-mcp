import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConsumptionManagementClient } from "@azure/arm-consumption";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_reserved_instance_recommendations",
    "Get Azure Reserved Instance purchase recommendations from Consumption API. Identifies VM, SQL, and Cosmos DB reservation opportunities.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      lookbackPeriod: z.enum(["Last7Days", "Last30Days", "Last60Days"]).default("Last30Days"),
      term: z.enum(["P1Y", "P3Y"]).default("P1Y").describe("Reservation term"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_reserved_instance_recommendations" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new ConsumptionManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        const scope = `/subscriptions/${params.subscriptionId}`;

        for await (const rec of client.reservationRecommendations.list(scope)) {
          if (recommendations.length >= params.maxResults) break;

          const asModern = rec as unknown as Record<string, unknown>;
          const savings = Number(asModern.netSavings ?? asModern.totalCostWithReservedInstances ?? 0);
          const costWithoutRI = Number(asModern.costWithNoReservedInstances ?? 0);
          const savingsPct = costWithoutRI > 0 ? (savings / costWithoutRI) * 100 : 0;
          const sku = String(asModern.recommendedResourceType ?? asModern.sku ?? "Unknown");

          const opt: OptimizationRecommendation = {
            id: uuid(),
            cloud: "azure",
            service: "Reserved Instances",
            type: "RESERVED_INSTANCE",
            category: "COMPUTE",
            title: `Purchase Azure RI for ${sku} — save $${savings.toFixed(2)}/mo`,
            description: `Reservation recommendation based on ${params.lookbackPeriod} usage. ${params.term === "P1Y" ? "1-year" : "3-year"} term.`,
            resourceId: String(asModern.id ?? "ri-recommendation"),
            resourceName: sku,
            accountId: params.subscriptionId,
            currentMonthlyCost: costWithoutRI / 12,
            projectedMonthlyCost: (costWithoutRI - savings) / 12,
            estimatedMonthlySavings: savings / 12,
            estimatedAnnualSavings: savings,
            savingsPercentage: savingsPct,
            impact: computeImpact(savings / 12),
            effort: "LOW",
            priorityScore: 0,
            actionSteps: [
              `Review ${params.lookbackPeriod} usage patterns`,
              `Purchase ${params.term === "P1Y" ? "1-year" : "3-year"} reservation for ${sku}`,
              "Monitor reservation utilization in Cost Management",
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
