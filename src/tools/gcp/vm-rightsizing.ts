import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstancesClient } from "@google-cloud/compute";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_vm_rightsizing",
    "Analyze GCP Compute Engine VMs for rightsizing and idle instance detection using machine type specs and custom machine type opportunities.",
    {
      projectId: z.string().describe("GCP Project ID"),
      zone: z.string().default("us-central1-a"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_vm_rightsizing" });

      try {
        const client = new InstancesClient();
        const recommendations: OptimizationRecommendation[] = [];

        const [instances] = await client.list({
          project: params.projectId,
          zone: params.zone,
        });

        for (const instance of (instances ?? []).slice(0, params.maxResults)) {
          const name = instance.name ?? "unknown";
          const machineType = instance.machineType?.split("/").pop() ?? "unknown";
          const status = instance.status;

          // Stopped instances still incur disk costs
          if (status === "TERMINATED" || status === "STOPPED") {
            const diskCost = (instance.disks ?? []).reduce((sum, disk) => {
              const sizeGB = Number(disk.diskSizeGb ?? 10);
              return sum + sizeGB * 0.04;
            }, 0);

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "Compute Engine",
              type: "IDLE_RESOURCE",
              category: "COMPUTE",
              title: `Stopped VM still incurring costs: ${name}`,
              description: `VM ${name} is ${status} but associated disks cost $${diskCost.toFixed(2)}/mo. Delete if no longer needed.`,
              resourceId: instance.selfLink ?? name,
              resourceName: name,
              region: params.zone,
              accountId: params.projectId,
              currentMonthlyCost: diskCost,
              projectedMonthlyCost: 0,
              estimatedMonthlySavings: diskCost,
              estimatedAnnualSavings: diskCost * 12,
              savingsPercentage: 100,
              impact: computeImpact(diskCost),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Snapshot disks if data is needed",
                "Delete the stopped instance and associated disks",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: instance,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // Predefined machine types that could use custom
          if (
            status === "RUNNING" &&
            !machineType.startsWith("custom-") &&
            !machineType.startsWith("e2-micro") &&
            !machineType.startsWith("f1-") &&
            !machineType.startsWith("g1-")
          ) {
            const estimatedCost = estimateMachineTypeCost(machineType);
            const customSavings = estimatedCost * 0.15;

            if (customSavings > 5) {
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "gcp",
                service: "Compute Engine",
                type: "RIGHTSIZING",
                category: "COMPUTE",
                title: `Consider custom machine type for: ${name} (${machineType})`,
                description: `VM ${name} uses predefined ${machineType}. Custom machine types allow exact CPU/memory sizing and can save ~15%.`,
                resourceId: instance.selfLink ?? name,
                resourceName: name,
                region: params.zone,
                accountId: params.projectId,
                currentMonthlyCost: estimatedCost,
                projectedMonthlyCost: estimatedCost - customSavings,
                estimatedMonthlySavings: customSavings,
                estimatedAnnualSavings: customSavings * 12,
                savingsPercentage: 15,
                impact: computeImpact(customSavings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  "Monitor actual CPU and memory usage",
                  "Create a custom machine type matching actual needs",
                  "Stop instance, change machine type, restart",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: instance,
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
          instancesAnalyzed: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            instancesAnalyzed: instances?.length ?? 0,
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

function estimateMachineTypeCost(machineType: string): number {
  const costs: Record<string, number> = {
    "e2-micro": 6, "e2-small": 12, "e2-medium": 24,
    "e2-standard-2": 49, "e2-standard-4": 97, "e2-standard-8": 194,
    "n1-standard-1": 24, "n1-standard-2": 49, "n1-standard-4": 97, "n1-standard-8": 194,
    "n2-standard-2": 55, "n2-standard-4": 110, "n2-standard-8": 220,
    "n2d-standard-2": 45, "n2d-standard-4": 90, "n2d-standard-8": 180,
    "c2-standard-4": 125, "c2-standard-8": 250,
  };
  return costs[machineType] ?? 100;
}
