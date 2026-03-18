import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ComputeManagementClient } from "@azure/arm-compute";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse, UnusedResource } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_unused_resources",
    "Detect unused Azure resources: unattached managed disks, deallocated VMs still incurring storage costs, and unassociated public IPs.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      resourceTypes: z
        .array(z.enum(["MANAGED_DISKS", "PUBLIC_IPS", "DEALLOCATED_VMS"]))
        .default(["MANAGED_DISKS", "PUBLIC_IPS", "DEALLOCATED_VMS"]),
      maxResults: z.number().min(1).max(200).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_unused_resources" });

      try {
        const credential = new DefaultAzureCredential();
        const computeClient = new ComputeManagementClient(credential, params.subscriptionId);
        const unused: UnusedResource[] = [];

        // Unattached Managed Disks
        if (params.resourceTypes.includes("MANAGED_DISKS")) {
          for await (const disk of computeClient.disks.list()) {
            if (unused.length >= params.maxResults) break;
            if (disk.diskState === "Unattached") {
              const sizeGB = disk.diskSizeGB ?? 0;
              const costPerGB = disk.sku?.name?.includes("Premium") ? 0.132 : 0.04;
              unused.push({
                id: uuid(),
                cloud: "azure",
                service: "Managed Disks",
                resourceType: `${disk.sku?.name ?? "Standard"} Disk`,
                resourceId: disk.id ?? "unknown",
                resourceName: disk.name ?? "unknown",
                region: disk.location,
                accountId: params.subscriptionId,
                monthlyCost: sizeGB * costPerGB,
                reason: `Unattached ${disk.sku?.name} disk (${sizeGB} GB) — not attached to any VM`,
                actionSteps: [
                  "Create a snapshot if data is needed",
                  "Delete the unattached disk",
                ],
                tags: (disk.tags ?? {}) as Record<string, string>,
                detectedAt: new Date(),
                rawData: disk,
              });
            }
          }
        }

        // Deallocated VMs
        if (params.resourceTypes.includes("DEALLOCATED_VMS")) {
          for await (const vm of computeClient.virtualMachines.listAll()) {
            if (unused.length >= params.maxResults) break;
            // Need instance view for power state
            try {
              const rgName = vm.id?.split("/resourceGroups/")[1]?.split("/")[0];
              if (!rgName || !vm.name) continue;
              const instanceView = await computeClient.virtualMachines.instanceView(rgName, vm.name);
              const powerState = instanceView.statuses?.find(
                (s) => s.code?.startsWith("PowerState/"),
              )?.code;

              if (powerState === "PowerState/deallocated") {
                unused.push({
                  id: uuid(),
                  cloud: "azure",
                  service: "Virtual Machines",
                  resourceType: "Deallocated VM",
                  resourceId: vm.id ?? "unknown",
                  resourceName: vm.name ?? "unknown",
                  region: vm.location,
                  accountId: params.subscriptionId,
                  monthlyCost: 5, // Still paying for disks, IPs
                  reason: "VM is deallocated — still incurring storage and IP costs",
                  actionSteps: [
                    "Delete the VM if no longer needed",
                    "Remove associated OS and data disks",
                    "Release associated public IP addresses",
                  ],
                  tags: (vm.tags ?? {}) as Record<string, string>,
                  detectedAt: new Date(),
                  rawData: vm,
                });
              }
            } catch { /* can't get instance view */ }
          }
        }

        const totalWaste = unused.reduce((s, r) => s + r.monthlyCost, 0);

        const result: ToolResponse<{
          unusedResources: UnusedResource[];
          totalMonthlyWaste: number;
          totalAnnualWaste: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            unusedResources: unused.slice(0, params.maxResults),
            totalMonthlyWaste: totalWaste,
            totalAnnualWaste: totalWaste * 12,
            count: unused.length,
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
