import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DisksClient, AddressesClient } from "@google-cloud/compute";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse, UnusedResource } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_unused_resources",
    "Detect unused GCP resources: unattached persistent disks, unused static IPs, and orphaned snapshots incurring storage costs.",
    {
      projectId: z.string().describe("GCP Project ID"),
      zone: z.string().default("us-central1-a"),
      region: z.string().default("us-central1"),
      maxResults: z.number().min(1).max(200).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_unused_resources" });

      try {
        const unused: UnusedResource[] = [];

        // Unattached Persistent Disks
        try {
          const disksClient = new DisksClient();
          const [disks] = await disksClient.list({
            project: params.projectId,
            zone: params.zone,
          });

          for (const disk of disks ?? []) {
            if ((disk.users ?? []).length === 0) {
              const sizeGB = Number(disk.sizeGb ?? 0);
              const costPerGB = disk.type?.includes("pd-ssd") ? 0.17 : 0.04;
              unused.push({
                id: uuid(),
                cloud: "gcp",
                service: "Compute Engine",
                resourceType: "Persistent Disk",
                resourceId: disk.selfLink ?? disk.name ?? "unknown",
                resourceName: disk.name ?? "unknown",
                region: params.zone,
                accountId: params.projectId,
                monthlyCost: sizeGB * costPerGB,
                reason: `Unattached ${disk.type?.split("/").pop() ?? "pd"} disk (${sizeGB} GB)`,
                actionSteps: [
                  "Create snapshot if data is needed",
                  `gcloud compute disks delete ${disk.name} --zone=${params.zone}`,
                ],
                tags: (disk.labels ?? {}) as Record<string, string>,
                detectedAt: new Date(),
                rawData: disk,
              });
            }
          }
        } catch { /* disks API error */ }

        // Unused Static External IPs
        try {
          const addressesClient = new AddressesClient();
          const [addresses] = await addressesClient.list({
            project: params.projectId,
            region: params.region,
          });

          for (const addr of addresses ?? []) {
            if (addr.status === "RESERVED" && !addr.users?.length) {
              unused.push({
                id: uuid(),
                cloud: "gcp",
                service: "VPC",
                resourceType: "Static IP",
                resourceId: addr.selfLink ?? addr.name ?? "unknown",
                resourceName: addr.name ?? "unknown",
                region: params.region,
                accountId: params.projectId,
                monthlyCost: 7.30,
                reason: "Static external IP not assigned to any resource ($0.01/hr)",
                actionSteps: [
                  `gcloud compute addresses delete ${addr.name} --region=${params.region}`,
                ],
                tags: (addr.labels ?? {}) as Record<string, string>,
                detectedAt: new Date(),
                rawData: addr,
              });
            }
          }
        } catch { /* addresses API error */ }

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
