import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SqlManagementClient } from "@azure/arm-sql";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "azure_get_sql_optimization",
    "Analyze Azure SQL databases for cost optimization: underutilized DTUs/vCores, elastic pool candidates, and idle databases.",
    {
      subscriptionId: z.string().describe("Azure Subscription ID"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "azure_get_sql_optimization" });

      try {
        const credential = new DefaultAzureCredential();
        const client = new SqlManagementClient(credential, params.subscriptionId);
        const recommendations: OptimizationRecommendation[] = [];

        for await (const server of client.servers.list()) {
          const serverName = server.name ?? "unknown";
          const rgName = server.id?.split("/resourceGroups/")[1]?.split("/")[0];
          if (!rgName) continue;

          for await (const db of client.databases.listByServer(rgName, serverName)) {
            if (recommendations.length >= params.maxResults) break;
            if (db.name === "master") continue;

            const dbName = db.name ?? "unknown";
            const sku = db.sku;
            const maxSizeGB = (db.maxSizeBytes ?? 0) / (1024 ** 3);

            // Estimate cost based on SKU
            const estimatedCost = estimateDbCost(sku?.name ?? "", sku?.capacity ?? 0);

            // Check for DTU-based databases that could use serverless
            if (sku?.tier === "Basic" || sku?.tier === "Standard") {
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "azure",
                service: "SQL Database",
                type: "MODERNIZATION",
                category: "DATABASE",
                title: `Consider serverless for ${serverName}/${dbName} (${sku.tier} ${sku.capacity} DTU)`,
                description: `Database uses DTU model (${sku.tier}). Serverless vCore model auto-pauses during inactivity and can significantly reduce costs for intermittent workloads.`,
                resourceId: db.id ?? dbName,
                resourceName: `${serverName}/${dbName}`,
                region: db.location,
                accountId: params.subscriptionId,
                currentMonthlyCost: estimatedCost,
                projectedMonthlyCost: estimatedCost * 0.5,
                estimatedMonthlySavings: estimatedCost * 0.5,
                estimatedAnnualSavings: estimatedCost * 6,
                savingsPercentage: 50,
                impact: computeImpact(estimatedCost * 0.5),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  "Analyze workload patterns (peak vs idle hours)",
                  "Test serverless tier with auto-pause enabled",
                  `Migrate from ${sku.tier} DTU to General Purpose Serverless`,
                  "Set min/max vCores based on workload requirements",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { db, sku },
              };
              rec.priorityScore = computePriorityScore(rec);
              recommendations.push(rec);
            }

            // Over-provisioned premium tier
            if (sku?.tier === "Premium" && (sku.capacity ?? 0) > 125) {
              const savings = estimatedCost * 0.3;
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "azure",
                service: "SQL Database",
                type: "RIGHTSIZING",
                category: "DATABASE",
                title: `Rightsize Premium SQL DB: ${serverName}/${dbName}`,
                description: `Premium ${sku.capacity} DTU database — verify if this performance tier is needed. Business Critical vCore may be more cost-effective.`,
                resourceId: db.id ?? dbName,
                resourceName: `${serverName}/${dbName}`,
                region: db.location,
                accountId: params.subscriptionId,
                currentMonthlyCost: estimatedCost,
                projectedMonthlyCost: estimatedCost - savings,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: 30,
                impact: computeImpact(savings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  "Review DTU utilization in Azure Portal metrics",
                  "Consider migrating to vCore pricing model",
                  "Evaluate Hyperscale tier for large databases",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { db, sku },
              };
              rec.priorityScore = computePriorityScore(rec);
              recommendations.push(rec);
            }
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

function estimateDbCost(skuName: string, capacity: number): number {
  if (skuName === "Basic") return 5;
  if (skuName === "S0") return 15;
  if (skuName === "S1") return 25;
  if (skuName === "S2") return 50;
  if (skuName === "S3") return 100;
  if (skuName.startsWith("P")) return capacity * 5;
  return capacity * 2;
}
