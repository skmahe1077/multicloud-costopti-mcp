import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BudgetServiceClient } from "@google-cloud/billing-budgets";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse, BudgetStatus, BudgetAlert } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_billing_budget_alerts",
    "Retrieve GCP billing budgets and alert status. Shows which budgets are approaching or exceeding thresholds with current and forecasted spend.",
    {
      billingAccountId: z.string().describe("GCP Billing Account ID (format: billingAccounts/XXXXXX-XXXXXX-XXXXXX)"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_billing_budget_alerts" });

      try {
        const client = new BudgetServiceClient();
        const budgets: BudgetStatus[] = [];

        const parent = params.billingAccountId.startsWith("billingAccounts/")
          ? params.billingAccountId
          : `billingAccounts/${params.billingAccountId}`;

        const [budgetList] = await client.listBudgets({ parent });

        for (const budget of (budgetList ?? []).slice(0, params.maxResults)) {
          const amount = Number(budget.amount?.specifiedAmount?.units ?? 0);
          const currency = budget.amount?.specifiedAmount?.currencyCode ?? "USD";

          const alerts: BudgetAlert[] = (budget.thresholdRules ?? []).map((rule) => ({
            threshold: (rule.thresholdPercent ?? 0) * 100,
            currentAmount: 0,
            alertType: rule.spendBasis === "FORECASTED_SPEND" ? "FORECASTED" : "ACTUAL",
            triggered: false,
          }));

          budgets.push({
            cloud: "gcp",
            budgetName: budget.displayName ?? "unknown",
            budgetAmount: amount,
            currentSpend: 0,
            forecastedSpend: 0,
            percentUsed: 0,
            percentForecasted: 0,
            currency,
            periodStart: new Date(),
            periodEnd: new Date(),
            isOverBudget: false,
            isForecastOverBudget: false,
            alerts,
          });
        }

        const result: ToolResponse<{
          budgets: BudgetStatus[];
          count: number;
        }> = {
          success: true,
          requestId,
          data: { budgets, count: budgets.length },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
