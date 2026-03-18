import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConsumptionManagementClient } from "@azure/arm-consumption";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse, BudgetStatus, BudgetAlert } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_budget_alerts",
    "Retrieve Azure budget status, spend vs. budget amounts, and forecast alerts. Shows which budgets are approaching or exceeding thresholds.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_budget_alerts" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new ConsumptionManagementClient(credential, params.subscriptionId);
        const budgets: BudgetStatus[] = [];

        const scope = `/subscriptions/${params.subscriptionId}`;

        for await (const budget of client.budgets.list(scope)) {
          if (budgets.length >= params.maxResults) break;

          const amount = budget.amount ?? 0;
          const currentSpend = budget.currentSpend?.amount ?? 0;
          const forecastSpend = budget.forecastSpend?.amount ?? 0;
          const percentUsed = amount > 0 ? (currentSpend / amount) * 100 : 0;
          const percentForecasted = amount > 0 ? (forecastSpend / amount) * 100 : 0;

          const alerts: BudgetAlert[] = [];
          for (const [, notification] of Object.entries(budget.notifications ?? {})) {
            const n = notification as unknown as Record<string, unknown>;
            alerts.push({
              threshold: Number(n.threshold ?? 0),
              currentAmount: currentSpend,
              alertType: String(n.thresholdType ?? "Actual").includes("Forecast")
                ? "FORECASTED"
                : "ACTUAL",
              triggered: percentUsed >= Number(n.threshold ?? 0),
            });
          }

          budgets.push({
            cloud: "azure",
            budgetName: budget.name ?? "unknown",
            budgetAmount: amount,
            currentSpend,
            forecastedSpend: forecastSpend,
            percentUsed,
            percentForecasted,
            currency: budget.currentSpend?.unit ?? "USD",
            periodStart: budget.timePeriod?.startDate ?? new Date(),
            periodEnd: budget.timePeriod?.endDate ?? new Date(),
            isOverBudget: currentSpend > amount,
            isForecastOverBudget: forecastSpend > amount,
            alerts,
          });
        }

        const overBudgetCount = budgets.filter((b) => b.isOverBudget).length;
        const forecastOverCount = budgets.filter((b) => b.isForecastOverBudget).length;

        const result: ToolResponse<{
          budgets: BudgetStatus[];
          overBudgetCount: number;
          forecastOverBudgetCount: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: { budgets, overBudgetCount, forecastOverBudgetCount: forecastOverCount, count: budgets.length },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
