import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GroupDefinition,
} from "@aws-sdk/client-cost-explorer";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { normalizeAwsCostItem } from "../shared/cost-normalizer.js";
import type { ToolResponse, NormalizedCostItem } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_cost_explorer_summary",
    "Retrieve AWS cost breakdown by service, account, or region using Cost Explorer. Returns normalized cost data with service categorization for the specified time period.",
    {
      startDate: z
        .string()
        .describe("Start date in YYYY-MM-DD format")
        .default(
          new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
        ),
      endDate: z
        .string()
        .describe("End date in YYYY-MM-DD format")
        .default(new Date().toISOString().split("T")[0]),
      granularity: z
        .enum(["DAILY", "MONTHLY", "HOURLY"])
        .default("DAILY")
        .describe("Cost aggregation granularity"),
      groupBy: z
        .enum(["SERVICE", "REGION", "LINKED_ACCOUNT", "USAGE_TYPE"])
        .default("SERVICE")
        .describe("Group cost results by this dimension"),
      maxResults: z.number().min(1).max(500).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", {
        requestId,
        tool: "aws_get_cost_explorer_summary",
      });

      try {
        const client = new CostExplorerClient({
          requestHandler: { requestTimeout: 30000 },
        });

        const groupDef: GroupDefinition = {
          Type: "DIMENSION",
          Key: params.groupBy,
        };

        const command = new GetCostAndUsageCommand({
          TimePeriod: { Start: params.startDate, End: params.endDate },
          Granularity: params.granularity,
          Metrics: ["BlendedCost", "UnblendedCost", "UsageQuantity"],
          GroupBy: [groupDef],
        });

        const response = await client.send(command);
        const items: NormalizedCostItem[] = [];

        for (const result of response.ResultsByTime ?? []) {
          for (const group of result.Groups ?? []) {
            const groupKey = group.Keys?.[0] ?? "Unknown";
            const amount = parseFloat(
              group.Metrics?.BlendedCost?.Amount ?? "0",
            );
            if (amount > 0) {
              const item = normalizeAwsCostItem(
                group as Record<string, unknown>,
                groupKey,
                result.TimePeriod?.Start ?? params.startDate,
                result.TimePeriod?.End ?? params.endDate,
              );
              item.currentMonthlyCost = amount;
              items.push(item);
            }
          }
        }

        // Aggregate by service for summary
        const serviceMap = new Map<string, number>();
        for (const item of items) {
          serviceMap.set(
            item.service,
            (serviceMap.get(item.service) ?? 0) + item.currentMonthlyCost,
          );
        }

        const sorted = [...serviceMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, params.maxResults);

        const totalCost = sorted.reduce((sum, [, cost]) => sum + cost, 0);

        const result: ToolResponse<{
          items: NormalizedCostItem[];
          totalCost: number;
          currency: string;
          period: { start: string; end: string };
          serviceBreakdown: Array<{
            service: string;
            cost: number;
            percent: number;
          }>;
        }> = {
          success: true,
          requestId,
          data: {
            items: items.slice(0, params.maxResults),
            totalCost,
            currency: "USD",
            period: { start: params.startDate, end: params.endDate },
            serviceBreakdown: sorted.map(([service, cost]) => ({
              service,
              cost,
              percent: totalCost > 0 ? (cost / totalCost) * 100 : 0,
            })),
          },
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        const result: ToolResponse<null> = {
          success: false,
          requestId,
          error: String(error),
        };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
