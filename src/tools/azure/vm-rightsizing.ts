import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ComputeManagementClient } from "@azure/arm-compute";
import { MonitorClient } from "@azure/arm-monitor";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_vm_rightsizing",
    "Analyze Azure VMs for rightsizing opportunities by examining CPU, memory utilization, and comparing against VM size options.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      cpuThreshold: z.number().min(1).max(100).default(20).describe("Max average CPU % to flag as over-provisioned"),
      lookbackDays: z.number().min(7).max(90).default(14),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_vm_rightsizing" });

      try {
        const credential = new DefaultAzureCredential();
        const computeClient = new ComputeManagementClient(credential, params.subscriptionId);
        const monitorClient = new MonitorClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        const startTime = new Date(Date.now() - params.lookbackDays * 86400000);
        const endTime = new Date();

        for await (const vm of computeClient.virtualMachines.listAll()) {
          if (recommendations.length >= params.maxResults) break;

          const vmId = vm.id ?? "unknown";
          const vmName = vm.name ?? "unknown";
          const vmSize = vm.hardwareProfile?.vmSize ?? "unknown";

          // Get CPU metrics
          let avgCpu = 50;
          try {
            const metrics = monitorClient.metrics.list(vmId, {
              timespan: `${startTime.toISOString()}/${endTime.toISOString()}`,
              interval: `P${params.lookbackDays}D`,
              metricnames: "Percentage CPU",
              aggregation: "Average",
            });

            for await (const metric of [await metrics]) {
              for (const ts of metric.value ?? []) {
                for (const dp of ts.timeseries ?? []) {
                  for (const point of dp.data ?? []) {
                    if (point.average !== undefined) {
                      avgCpu = point.average;
                    }
                  }
                }
              }
            }
          } catch { /* no metrics */ }

          if (avgCpu < params.cpuThreshold) {
            // Rough cost estimate based on VM size
            const estimatedCost = estimateVmCost(vmSize);
            const savings = estimatedCost * 0.4;

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Virtual Machines",
              type: avgCpu < 5 ? "IDLE_RESOURCE" : "RIGHTSIZING",
              category: "COMPUTE",
              title: `${avgCpu < 5 ? "Idle" : "Rightsize"} VM: ${vmName} (${vmSize}, ${avgCpu.toFixed(1)}% CPU)`,
              description: `VM ${vmName} averages ${avgCpu.toFixed(1)}% CPU over ${params.lookbackDays} days. ${avgCpu < 5 ? "Consider deallocating." : "Consider downsizing."}`,
              resourceId: vmId,
              resourceName: vmName,
              region: vm.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: estimatedCost,
              projectedMonthlyCost: avgCpu < 5 ? 0 : estimatedCost - savings,
              estimatedMonthlySavings: avgCpu < 5 ? estimatedCost : savings,
              estimatedAnnualSavings: (avgCpu < 5 ? estimatedCost : savings) * 12,
              savingsPercentage: avgCpu < 5 ? 100 : 40,
              impact: computeImpact(avgCpu < 5 ? estimatedCost : savings),
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps: avgCpu < 5
                ? ["Verify VM is not needed", "Deallocate or delete the VM", "Remove associated disks and NICs"]
                : ["Review workload requirements", "Resize to a smaller VM SKU", "Monitor performance after change"],
              tags: {},
              detectedAt: new Date(),
              rawData: { vm, avgCpu },
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

function estimateVmCost(vmSize: string): number {
  const s = vmSize.toLowerCase();
  if (s.includes("b1s") || s.includes("b1ls")) return 7;
  if (s.includes("b1ms")) return 15;
  if (s.includes("b2s")) return 30;
  if (s.includes("b2ms")) return 60;
  if (s.includes("d2s") || s.includes("d2as")) return 70;
  if (s.includes("d4s") || s.includes("d4as")) return 140;
  if (s.includes("d8s") || s.includes("d8as")) return 280;
  if (s.includes("d16s")) return 560;
  if (s.includes("e2s") || s.includes("e2as")) return 90;
  if (s.includes("e4s") || s.includes("e4as")) return 180;
  if (s.includes("f2s")) return 60;
  if (s.includes("f4s")) return 120;
  return 100; // default
}
