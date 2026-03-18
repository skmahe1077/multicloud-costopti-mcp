import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CostExplorerClient,
  GetAnomaliesCommand,
} from "@aws-sdk/client-cost-explorer";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse } from "../../types/cost.js";

export interface CostAnomalyResult {
  anomalyId: string;
  service: string;
  impact: {
    maxImpact: number;
    totalImpact: number;
  };
  rootCauses: Array<{
    service: string;
    region: string;
    linkedAccount: string;
    usageType: string;
  }>;
  startDate: string;
  endDate?: string;
  status: string;
}

export function register(server: McpServer): void {
  server.tool(
    "aws_get_cost_anomalies",
    "Detect AWS cost anomalies using the Cost Anomaly Detection service. Identifies unexpected cost spikes with root cause analysis.",
    {
      lookbackDays: z.number().min(1).max(90).default(30),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_cost_anomalies" });

      try {
        const client = new CostExplorerClient({ requestHandler: { requestTimeout: 30000 } });
        const startDate = new Date(Date.now() - params.lookbackDays * 86400000)
          .toISOString()
          .split("T")[0];

        const response = await client.send(new GetAnomaliesCommand({
          DateInterval: { StartDate: startDate },
          MaxResults: params.maxResults,
        }));

        const anomalies: CostAnomalyResult[] = (response.Anomalies ?? []).map((a) => ({
          anomalyId: a.AnomalyId ?? "unknown",
          service: a.RootCauses?.[0]?.Service ?? "Unknown",
          impact: {
            maxImpact: a.Impact?.MaxImpact ?? 0,
            totalImpact: a.Impact?.TotalImpact ?? 0,
          },
          rootCauses: (a.RootCauses ?? []).map((rc) => ({
            service: rc.Service ?? "",
            region: rc.Region ?? "",
            linkedAccount: rc.LinkedAccount ?? "",
            usageType: rc.UsageType ?? "",
          })),
          startDate: a.AnomalyStartDate ?? "",
          endDate: a.AnomalyEndDate,
          status: a.Feedback ?? "PENDING",
        }));

        const totalImpact = anomalies.reduce(
          (s, a) => s + a.impact.totalImpact,
          0,
        );

        const result: ToolResponse<{
          anomalies: CostAnomalyResult[];
          totalImpact: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: { anomalies, totalImpact, count: anomalies.length },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );
}
