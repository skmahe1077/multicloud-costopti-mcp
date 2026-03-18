import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ContainerServiceClient } from "@azure/arm-containerservice";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_aks_optimization",
    "Analyze AKS clusters for cost optimization: node pool sizing, autoscaler configuration, spot node opportunities, and cluster right-sizing.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_aks_optimization" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new ContainerServiceClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const cluster of client.managedClusters.list()) {
          const clusterName = cluster.name ?? "unknown";
          const rgName = cluster.id?.split("/resourceGroups/")[1]?.split("/")[0];

          for (const pool of cluster.agentPoolProfiles ?? []) {
            if (recommendations.length >= params.maxResults) break;

            const nodeCount = pool.count ?? 0;
            const vmSize = pool.vmSize ?? "Standard_DS2_v2";
            const estimatedNodeCost = estimateNodeCost(vmSize);
            const poolCost = nodeCount * estimatedNodeCost;

            // No autoscaler enabled
            if (!pool.enableAutoScaling && nodeCount > 1) {
              const savings = poolCost * 0.3;
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "azure",
                service: "AKS",
                type: "SCHEDULING",
                category: "CONTAINER",
                title: `Enable autoscaler on AKS pool ${pool.name} (${clusterName})`,
                description: `Node pool ${pool.name} has ${nodeCount} fixed nodes (${vmSize}). Enabling cluster autoscaler could reduce costs by scaling down during low usage.`,
                resourceId: cluster.id ?? clusterName,
                resourceName: `${clusterName}/${pool.name}`,
                region: cluster.location,
                accountId: params.subscriptionId,
                currentMonthlyCost: poolCost,
                projectedMonthlyCost: poolCost - savings,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: 30,
                impact: computeImpact(savings),
                effort: "LOW",
                priorityScore: 0,
                actionSteps: [
                  `Enable cluster autoscaler on pool ${pool.name}`,
                  `Set min nodes to 1, max nodes to ${nodeCount}`,
                  "Configure pod disruption budgets",
                  "Monitor scaling behavior",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { cluster: clusterName, pool },
              };
              rec.priorityScore = computePriorityScore(rec);
              recommendations.push(rec);
            }

            // No spot nodes for non-system pools
            if (pool.mode !== "System" && pool.scaleSetEvictionPolicy !== "Delete") {
              const spotSavings = poolCost * 0.6;
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "azure",
                service: "AKS",
                type: "SPOT_INSTANCE",
                category: "CONTAINER",
                title: `Add spot node pool for ${clusterName} workloads`,
                description: `Pool ${pool.name} uses regular VMs (${vmSize}). Adding a spot node pool for fault-tolerant workloads could save ~60%.`,
                resourceId: cluster.id ?? clusterName,
                resourceName: `${clusterName}/${pool.name}`,
                region: cluster.location,
                accountId: params.subscriptionId,
                currentMonthlyCost: poolCost,
                projectedMonthlyCost: poolCost - spotSavings,
                estimatedMonthlySavings: spotSavings,
                estimatedAnnualSavings: spotSavings * 12,
                savingsPercentage: 60,
                impact: computeImpact(spotSavings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  "Create a new spot node pool",
                  "Add node affinity/tolerations for spot-friendly workloads",
                  "Move batch/stateless workloads to spot pool",
                  "Keep system pool on regular VMs",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { cluster: clusterName, pool },
              };
              rec.priorityScore = computePriorityScore(rec);
              recommendations.push(rec);
            }
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

function estimateNodeCost(vmSize: string): number {
  const s = vmSize.toLowerCase();
  if (s.includes("ds2") || s.includes("d2s")) return 70;
  if (s.includes("ds3") || s.includes("d4s")) return 140;
  if (s.includes("ds4") || s.includes("d8s")) return 280;
  if (s.includes("ds5") || s.includes("d16s")) return 560;
  if (s.includes("f2s")) return 60;
  if (s.includes("f4s")) return 120;
  if (s.includes("f8s")) return 240;
  return 100;
}
