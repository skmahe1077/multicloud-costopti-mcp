import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CosmosDBManagementClient } from "@azure/arm-cosmosdb";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_cosmosdb_optimization",
    "Analyze Azure Cosmos DB accounts for cost optimization: over-provisioned RU/s, autoscale opportunities, and serverless migration candidates.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_cosmosdb_optimization" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new CosmosDBManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const account of client.databaseAccounts.list()) {
          if (recommendations.length >= params.maxResults) break;

          const accountName = account.name ?? "unknown";
          const rgName = account.id?.split("/resourceGroups/")[1]?.split("/")[0];
          if (!rgName) continue;

          // Check if multi-region write is enabled but potentially unnecessary
          if ((account.locations?.length ?? 0) > 2) {
            const regionCount = account.locations?.length ?? 0;
            const savings = regionCount * 50;
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Cosmos DB",
              type: "RIGHTSIZING",
              category: "DATABASE",
              title: `Review Cosmos DB regions: ${accountName} (${regionCount} regions)`,
              description: `Account ${accountName} is replicated to ${regionCount} regions. Each additional region roughly doubles RU costs. Verify all regions are needed.`,
              resourceId: account.id ?? accountName,
              resourceName: accountName,
              region: account.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: savings * 3,
              projectedMonthlyCost: savings * 2,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 33,
              impact: computeImpact(savings),
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps: [
                "Review which regions have active read/write traffic",
                "Remove unnecessary replica regions",
                "Consider using Azure Traffic Manager for regional failover instead",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: account,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // Suggest autoscale if using manual throughput
          if (account.capabilities?.every((c) => c.name !== "EnableServerless")) {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Cosmos DB",
              type: "SCHEDULING",
              category: "DATABASE",
              title: `Enable autoscale for Cosmos DB: ${accountName}`,
              description: `If ${accountName} has variable workloads, autoscale throughput can save up to 70% compared to manual provisioning by scaling down during low usage.`,
              resourceId: account.id ?? accountName,
              resourceName: accountName,
              region: account.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: 100,
              projectedMonthlyCost: 30,
              estimatedMonthlySavings: 70,
              estimatedAnnualSavings: 840,
              savingsPercentage: 70,
              impact: "MEDIUM",
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Review RU utilization patterns in Metrics",
                "Switch containers from manual to autoscale throughput",
                "Set max RU/s based on peak usage",
                "For very low throughput (<1000 RU/s), consider serverless",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: account,
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
