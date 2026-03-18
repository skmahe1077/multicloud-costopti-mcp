import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BigQuery } from "@google-cloud/bigquery";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { normalizeGcpCostItem } from "../shared/cost-normalizer.js";
import type { ToolResponse, NormalizedCostItem } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_billing_analysis",
    "Analyze GCP billing data via BigQuery billing export. Returns cost breakdown by service, project, and SKU for the specified period.",
    {
      projectId: z.string().describe("GCP Project ID with BigQuery billing export"),
      billingDataset: z.string().default("billing_export").describe("BigQuery dataset containing billing export"),
      billingTable: z.string().default("gcp_billing_export_v1").describe("BigQuery billing export table"),
      lookbackDays: z.number().min(1).max(90).default(30),
      maxResults: z.number().min(1).max(500).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_billing_analysis" });

      try {
        const bigquery = new BigQuery({ projectId: params.projectId });

        const query = `
          SELECT
            service.description AS service_description,
            SUM(cost) AS total_cost,
            currency,
            project.id AS project_id,
            location.region AS region
          FROM \`${params.projectId}.${params.billingDataset}.${params.billingTable}\`
          WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${params.lookbackDays} DAY)
            AND cost > 0
          GROUP BY service_description, currency, project_id, region
          ORDER BY total_cost DESC
          LIMIT ${params.maxResults}
        `;

        const [rows] = await bigquery.query({ query });
        const items: NormalizedCostItem[] = rows.map((row: Record<string, unknown>) => {
          const item = normalizeGcpCostItem(row);
          item.currentMonthlyCost = Number(row.total_cost ?? 0);
          item.service = String(row.service_description ?? "Unknown");
          item.region = String(row.region ?? "");
          item.accountId = String(row.project_id ?? params.projectId);
          return item;
        });

        const totalCost = items.reduce((s, i) => s + i.currentMonthlyCost, 0);

        const result: ToolResponse<{
          items: NormalizedCostItem[];
          totalCost: number;
          currency: string;
          period: { lookbackDays: number };
          serviceBreakdown: Array<{ service: string; cost: number; percent: number }>;
        }> = {
          success: true,
          requestId,
          data: {
            items,
            totalCost,
            currency: "USD",
            period: { lookbackDays: params.lookbackDays },
            serviceBreakdown: items.map((i) => ({
              service: i.service,
              cost: i.currentMonthlyCost,
              percent: totalCost > 0 ? (i.currentMonthlyCost / totalCost) * 100 : 0,
            })),
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
