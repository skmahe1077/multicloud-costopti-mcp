import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StorageManagementClient } from "@azure/arm-storage";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_storage_optimization",
    "Analyze Azure Storage accounts for cost optimization: access tier recommendations, lifecycle management gaps, and redundancy downgrades.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_storage_optimization" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new StorageManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const account of client.storageAccounts.list()) {
          if (recommendations.length >= params.maxResults) break;

          const name = account.name ?? "unknown";
          const kind = account.kind ?? "StorageV2";
          const accessTier = account.accessTier ?? "Hot";
          const replication = account.sku?.name ?? "Standard_LRS";

          // GRS → LRS downgrade opportunity
          if (replication.includes("GRS") || replication.includes("RAGRS")) {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Storage",
              type: "STORAGE_TIERING",
              category: "STORAGE",
              title: `Evaluate redundancy: ${name} uses ${replication}`,
              description: `Storage account ${name} uses geo-redundant storage (${replication}). If cross-region redundancy isn't required, switching to LRS/ZRS could save ~50%.`,
              resourceId: account.id ?? name,
              resourceName: name,
              region: account.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: 50, // Placeholder
              projectedMonthlyCost: 25,
              estimatedMonthlySavings: 25,
              estimatedAnnualSavings: 300,
              savingsPercentage: 50,
              impact: "MEDIUM",
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps: [
                "Review data protection requirements",
                `Change replication from ${replication} to Standard_LRS or Standard_ZRS`,
                "Ensure backup strategy covers the reduced redundancy",
              ],
              tags: (account.tags ?? {}) as Record<string, string>,
              detectedAt: new Date(),
              rawData: account,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // Hot → Cool tier opportunity
          if (accessTier === "Hot") {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Storage",
              type: "STORAGE_TIERING",
              category: "STORAGE",
              title: `Evaluate access tier: ${name} uses Hot tier`,
              description: `Storage account ${name} is on Hot tier. If data is infrequently accessed, switching to Cool tier saves ~40% on storage costs.`,
              resourceId: account.id ?? name,
              resourceName: name,
              region: account.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: 30,
              projectedMonthlyCost: 18,
              estimatedMonthlySavings: 12,
              estimatedAnnualSavings: 144,
              savingsPercentage: 40,
              impact: "MEDIUM",
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Analyze blob access patterns using Storage Analytics",
                "Enable lifecycle management policies",
                "Move infrequently accessed data to Cool or Archive tier",
              ],
              tags: (account.tags ?? {}) as Record<string, string>,
              detectedAt: new Date(),
              rawData: account,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // V1 → V2 upgrade
          if (kind === "Storage" || kind === "BlobStorage") {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Storage",
              type: "MODERNIZATION",
              category: "STORAGE",
              title: `Upgrade storage account: ${name} (${kind} → StorageV2)`,
              description: `Storage account ${name} is ${kind}. Upgrading to StorageV2 enables access tiers, lifecycle policies, and better pricing.`,
              resourceId: account.id ?? name,
              resourceName: name,
              region: account.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: 0,
              projectedMonthlyCost: 0,
              estimatedMonthlySavings: 0,
              estimatedAnnualSavings: 0,
              savingsPercentage: 0,
              impact: "LOW",
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                `Upgrade ${name} from ${kind} to StorageV2`,
                "Enable lifecycle management",
                "Review and set appropriate access tiers",
              ],
              tags: (account.tags ?? {}) as Record<string, string>,
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
