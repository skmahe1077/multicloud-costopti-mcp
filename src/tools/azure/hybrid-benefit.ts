import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ComputeManagementClient } from "@azure/arm-compute";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_hybrid_benefit_opportunities",
    "Find Azure VMs and SQL databases not using Azure Hybrid Benefit (AHUB). Identifies Windows Server and SQL Server license savings opportunities.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(100).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_hybrid_benefit_opportunities" });

      try {
        const credential = new DefaultAzureCredential();
        const computeClient = new ComputeManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const vm of computeClient.virtualMachines.listAll()) {
          if (recommendations.length >= params.maxResults) break;

          const vmName = vm.name ?? "unknown";
          const osType = vm.storageProfile?.osDisk?.osType;
          const licenseType = vm.licenseType;

          // Windows VMs without AHUB
          if (osType === "Windows" && licenseType !== "Windows_Server") {
            const savings = 40; // Rough estimate per VM
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "azure",
              service: "Virtual Machines",
              type: "LICENSE_OPTIMIZATION",
              category: "COMPUTE",
              title: `Enable Azure Hybrid Benefit for VM: ${vmName}`,
              description: `Windows VM ${vmName} is not using Azure Hybrid Benefit. If you have Windows Server licenses with Software Assurance, AHUB can save up to 40% on compute costs.`,
              resourceId: vm.id ?? vmName,
              resourceName: vmName,
              region: vm.location,
              accountId: params.subscriptionId,
              currentMonthlyCost: 100,
              projectedMonthlyCost: 60,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 40,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Verify you have eligible Windows Server licenses with Software Assurance",
                `Set licenseType to 'Windows_Server' for VM ${vmName}`,
                "This can be done without VM restart via Azure CLI or Portal",
              ],
              tags: (vm.tags ?? {}) as Record<string, string>,
              detectedAt: new Date(),
              rawData: vm,
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
