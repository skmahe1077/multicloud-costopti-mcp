import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AssetServiceClient } from "@google-cloud/asset";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { analyzeTagCoverage, type ResourceForTagAnalysis } from "../shared/tag-analyzer.js";
import type { ToolResponse, TagCoverage } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_label_coverage",
    "Audit GCP resource labeling coverage. Identifies resources missing required labels (environment, team, cost-center) which blocks cost allocation.",
    {
      projectId: z.string().describe("GCP Project ID"),
      requiredLabels: z
        .array(z.string())
        .default(["environment", "team", "cost-center", "owner", "project"]),
      maxResults: z.number().min(1).max(500).default(100),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_label_coverage" });

      try {
        const client = new AssetServiceClient();
        const resources: ResourceForTagAnalysis[] = [];

        const parent = `projects/${params.projectId}`;
        const [assets] = await client.listAssets({
          parent,
          assetTypes: [
            "compute.googleapis.com/Instance",
            "compute.googleapis.com/Disk",
            "storage.googleapis.com/Bucket",
            "sqladmin.googleapis.com/Instance",
            "container.googleapis.com/Cluster",
          ],
          pageSize: params.maxResults,
        });

        for (const asset of assets ?? []) {
          const resource = (asset as unknown as Record<string, unknown>).resource as Record<string, unknown> | undefined;
          const resourceData = resource?.data as Record<string, unknown> | undefined;
          const labels = (resourceData?.labels ?? {}) as Record<string, string>;
          const name = String((asset as unknown as Record<string, unknown>).name ?? "unknown");
          const resourceType = String((asset as unknown as Record<string, unknown>).assetType ?? "unknown");

          resources.push({
            resourceId: name,
            resourceType: resourceType.split("/").pop() ?? resourceType,
            monthlyCost: 0, // Can't determine without billing data
            tags: labels,
          });
        }

        const coverage = analyzeTagCoverage("gcp", resources, params.requiredLabels);

        const result: ToolResponse<TagCoverage> = {
          success: true,
          requestId,
          data: coverage,
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
