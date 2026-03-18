import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BigQuery } from "@google-cloud/bigquery";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_bigquery_optimization",
    "Analyze BigQuery for cost optimization: expensive queries, tables without partitioning/clustering, and slot reservation opportunities.",
    {
      projectId: z.string().describe("GCP Project ID"),
      lookbackDays: z.number().min(1).max(90).default(30),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_bigquery_optimization" });

      try {
        const bigquery = new BigQuery({ projectId: params.projectId });
        const recommendations: OptimizationRecommendation[] = [];

        // Find most expensive queries
        const costQuery = `
          SELECT
            user_email,
            query,
            total_bytes_processed,
            total_bytes_billed,
            (total_bytes_billed / POW(1024, 4)) * 6.25 AS estimated_cost_usd,
            creation_time,
            job_id
          FROM \`region-us\`.INFORMATION_SCHEMA.JOBS
          WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${params.lookbackDays} DAY)
            AND job_type = 'QUERY'
            AND state = 'DONE'
            AND total_bytes_billed > 0
          ORDER BY total_bytes_billed DESC
          LIMIT ${params.maxResults}
        `;

        try {
          const [expensiveQueries] = await bigquery.query({ query: costQuery });

          for (const row of expensiveQueries) {
            const cost = Number(row.estimated_cost_usd ?? 0);
            if (cost < 1) continue;

            const querySnippet = String(row.query ?? "").slice(0, 200);
            const tbProcessed = Number(row.total_bytes_processed ?? 0) / (1024 ** 4);

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "BigQuery",
              type: "RIGHTSIZING",
              category: "DATA_ANALYTICS",
              title: `Expensive query: $${cost.toFixed(2)} (${tbProcessed.toFixed(3)} TB scanned)`,
              description: `Query by ${row.user_email}: "${querySnippet}..."`,
              resourceId: String(row.job_id ?? "unknown"),
              resourceName: "BigQuery Query",
              accountId: params.projectId,
              currentMonthlyCost: cost * 30,
              projectedMonthlyCost: cost * 10,
              estimatedMonthlySavings: cost * 20,
              estimatedAnnualSavings: cost * 240,
              savingsPercentage: 67,
              impact: computeImpact(cost * 20),
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps: [
                "Add WHERE clauses to filter on partitioned columns",
                "SELECT only needed columns instead of SELECT *",
                "Use table partitioning and clustering",
                "Consider materialized views for repeated queries",
                "Evaluate flat-rate pricing if query volume is high",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: row,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }
        } catch { /* INFORMATION_SCHEMA may not be accessible */ }

        // Check datasets for tables without partitioning
        try {
          const [datasets] = await bigquery.getDatasets();
          for (const dataset of datasets.slice(0, 5)) {
            const [tables] = await dataset.getTables();
            for (const table of tables.slice(0, 10)) {
              const [metadata] = await table.getMetadata();
              const sizeBytes = Number(metadata.numBytes ?? 0);
              const sizeGB = sizeBytes / (1024 ** 3);

              if (sizeGB > 10 && !metadata.timePartitioning) {
                const scanCost = (sizeGB / 1024) * 6.25;
                const rec: OptimizationRecommendation = {
                  id: uuid(),
                  cloud: "gcp",
                  service: "BigQuery",
                  type: "MODERNIZATION",
                  category: "DATA_ANALYTICS",
                  title: `Partition table: ${dataset.id}.${table.id} (${sizeGB.toFixed(1)} GB)`,
                  description: `Table ${dataset.id}.${table.id} is ${sizeGB.toFixed(1)} GB without partitioning. Each full scan costs ~$${scanCost.toFixed(2)}. Partitioning can reduce scan costs by 80%+.`,
                  resourceId: `${dataset.id}.${table.id}`,
                  resourceName: `${dataset.id}.${table.id}`,
                  accountId: params.projectId,
                  currentMonthlyCost: scanCost * 10,
                  projectedMonthlyCost: scanCost * 2,
                  estimatedMonthlySavings: scanCost * 8,
                  estimatedAnnualSavings: scanCost * 96,
                  savingsPercentage: 80,
                  impact: computeImpact(scanCost * 8),
                  effort: "MEDIUM",
                  priorityScore: 0,
                  actionSteps: [
                    "Identify a date/timestamp column for partitioning",
                    "Recreate table with time-based partitioning",
                    "Add clustering on frequently filtered columns",
                    "Update queries to filter on partition column",
                  ],
                  tags: {},
                  detectedAt: new Date(),
                  rawData: metadata,
                };
                rec.priorityScore = computePriorityScore(rec);
                recommendations.push(rec);
              }
            }
          }
        } catch { /* dataset listing error */ }

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
