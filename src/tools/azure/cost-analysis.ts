import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CostManagementClient } from "@azure/arm-costmanagement";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { normalizeAzureCostItem } from "../shared/cost-normalizer.js";
import type { ToolResponse, NormalizedCostItem } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_cost_analysis",
    "Retrieve Azure cost breakdown by service, resource group, or location using Cost Management API. Returns normalized cost data with categorization.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      startDate: z
        .string()
        .default(new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]),
      endDate: z
        .string()
        .default(new Date().toISOString().split("T")[0]),
      groupBy: z
        .enum(["ServiceName", "ResourceGroupName", "ResourceLocation", "MeterCategory"])
        .default("ServiceName"),
      maxResults: z.number().min(1).max(500).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_cost_analysis" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new CostManagementClient(credential);

        const scope = `/subscriptions/${params.subscriptionId}`;
        const result = await client.query.usage(scope, {
          type: "ActualCost",
          timeframe: "Custom",
          timePeriod: {
            from: new Date(params.startDate),
            to: new Date(params.endDate),
          },
          dataset: {
            granularity: "None",
            aggregation: {
              totalCost: { name: "Cost", function: "Sum" },
            },
            grouping: [{ type: "Dimension", name: params.groupBy }],
          },
        });

        const items: NormalizedCostItem[] = [];
        const columns = (result.columns ?? []) as Array<{ name: string }>;

        for (const row of (result.rows ?? []).slice(0, params.maxResults)) {
          const item = normalizeAzureCostItem(row as unknown[], columns);
          item.accountId = params.subscriptionId;
          items.push(item);
        }

        items.sort((a, b) => b.currentMonthlyCost - a.currentMonthlyCost);
        const totalCost = items.reduce((s, i) => s + i.currentMonthlyCost, 0);

        const response: ToolResponse<{
          items: NormalizedCostItem[];
          totalCost: number;
          currency: string;
          period: { start: string; end: string };
          serviceBreakdown: Array<{ service: string; cost: number; percent: number }>;
        }> = {
          success: true,
          requestId,
          data: {
            items,
            totalCost,
            currency: "USD",
            period: { start: params.startDate, end: params.endDate },
            serviceBreakdown: items.map((i) => ({
              service: i.service,
              cost: i.currentMonthlyCost,
              percent: totalCost > 0 ? (i.currentMonthlyCost / totalCost) * 100 : 0,
            })),
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
