import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClusterManagerClient } from "@google-cloud/container";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_gke_optimization",
    "Analyze GKE clusters for cost optimization: node pool sizing, autoscaling configuration, spot/preemptible node opportunities, and autopilot migration.",
    {
      projectId: z.string().describe("GCP Project ID"),
      location: z.string().default("-").describe("GCP zone/region or '-' for all"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_gke_optimization" });

      try {
        const client = new ClusterManagerClient();
        const recommendations: OptimizationRecommendation[] = [];

        const parent = `projects/${params.projectId}/locations/${params.location}`;
        const [response] = await client.listClusters({ parent });

        for (const cluster of response.clusters ?? []) {
          const clusterName = cluster.name ?? "unknown";

          // Check if Autopilot is not enabled
          if (!cluster.autopilot?.enabled) {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "GKE",
              type: "MODERNIZATION",
              category: "CONTAINER",
              title: `Consider GKE Autopilot for cluster: ${clusterName}`,
              description: `Cluster ${clusterName} is in Standard mode. Autopilot eliminates node management overhead and only charges for pod resources used.`,
              resourceId: cluster.selfLink ?? clusterName,
              resourceName: clusterName,
              region: cluster.location ?? undefined,
              accountId: params.projectId,
              currentMonthlyCost: 200,
              projectedMonthlyCost: 120,
              estimatedMonthlySavings: 80,
              estimatedAnnualSavings: 960,
              savingsPercentage: 40,
              impact: "MEDIUM",
              effort: "HIGH",
              priorityScore: 0,
              actionSteps: [
                "Review workload compatibility with Autopilot",
                "Create new Autopilot cluster",
                "Migrate workloads",
                "Delete Standard cluster",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: { cluster: clusterName, autopilot: false },
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          for (const pool of cluster.nodePools ?? []) {
            if (recommendations.length >= params.maxResults) break;
            const poolName = pool.name ?? "unknown";
            const nodeCount = pool.initialNodeCount ?? 0;
            const machineType = pool.config?.machineType ?? "e2-medium";
            const autoscaling = pool.autoscaling;

            // No autoscaling
            if (!autoscaling?.enabled && nodeCount > 1) {
              const estimatedCost = nodeCount * estimateNodeCost(machineType);
              const savings = estimatedCost * 0.3;

              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "gcp",
                service: "GKE",
                type: "SCHEDULING",
                category: "CONTAINER",
                title: `Enable autoscaling on GKE pool: ${clusterName}/${poolName}`,
                description: `Node pool ${poolName} has ${nodeCount} fixed nodes (${machineType}). Cluster autoscaler could reduce costs during low utilization.`,
                resourceId: `${clusterName}/${poolName}`,
                resourceName: `${clusterName}/${poolName}`,
                region: cluster.location ?? undefined,
                accountId: params.projectId,
                currentMonthlyCost: estimatedCost,
                projectedMonthlyCost: estimatedCost - savings,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: 30,
                impact: computeImpact(savings),
                effort: "LOW",
                priorityScore: 0,
                actionSteps: [
                  `Enable cluster autoscaler on pool ${poolName}`,
                  `Set min nodes to 1, max to ${nodeCount}`,
                  "Configure Horizontal Pod Autoscaler for workloads",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { cluster: clusterName, pool },
              };
              rec.priorityScore = computePriorityScore(rec);
              recommendations.push(rec);
            }

            // No spot/preemptible VMs
            if (!pool.config?.spot && !pool.config?.preemptible) {
              const estimatedCost = nodeCount * estimateNodeCost(machineType);
              const spotSavings = estimatedCost * 0.6;

              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "gcp",
                service: "GKE",
                type: "SPOT_INSTANCE",
                category: "CONTAINER",
                title: `Add Spot VM pool for ${clusterName} workloads`,
                description: `Pool ${poolName} uses on-demand ${machineType}. Spot VMs cost up to 60-91% less for fault-tolerant workloads.`,
                resourceId: `${clusterName}/${poolName}`,
                resourceName: `${clusterName}/${poolName}`,
                region: cluster.location ?? undefined,
                accountId: params.projectId,
                currentMonthlyCost: estimatedCost,
                projectedMonthlyCost: estimatedCost - spotSavings,
                estimatedMonthlySavings: spotSavings,
                estimatedAnnualSavings: spotSavings * 12,
                savingsPercentage: 60,
                impact: computeImpact(spotSavings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  "Create new node pool with spot VMs enabled",
                  "Use node affinity and tolerations for spot-friendly workloads",
                  "Keep system workloads on on-demand nodes",
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
          clustersAnalyzed: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            clustersAnalyzed: response.clusters?.length ?? 0,
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

function estimateNodeCost(machineType: string): number {
  const costs: Record<string, number> = {
    "e2-micro": 6, "e2-small": 12, "e2-medium": 24,
    "e2-standard-2": 49, "e2-standard-4": 97, "e2-standard-8": 194,
    "n2-standard-2": 55, "n2-standard-4": 110, "n2-standard-8": 220,
  };
  return costs[machineType] ?? 100;
}
