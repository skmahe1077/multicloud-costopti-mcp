import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RecommenderClient } from "@google-cloud/recommender";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_committed_use_recommendations",
    "Get GCP Committed Use Discount (CUD) purchase recommendations based on historical usage. Covers Compute Engine and Cloud SQL committed use opportunities.",
    {
      projectId: z.string().describe("GCP Project ID"),
      location: z.string().default("us-central1"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_committed_use_recommendations" });

      try {
        const client = new RecommenderClient();
        const recommendations: OptimizationRecommendation[] = [];

        const recommenderIds = [
          "google.compute.commitment.UsageCommitmentRecommender",
          "google.cloudsql.commitment.UsageCommitmentRecommender",
        ];

        for (const recommenderId of recommenderIds) {
          try {
            const parent = `projects/${params.projectId}/locations/${params.location}/recommenders/${recommenderId}`;
            const [recs] = await client.listRecommendations({ parent });

            for (const rec of recs) {
              if (recommendations.length >= params.maxResults) break;

              const impact = rec.primaryImpact;
              const savingsUnits = Math.abs(Number(impact?.costProjection?.cost?.units ?? 0));
              const duration = Number(impact?.costProjection?.duration?.seconds ?? 2592000);
              const monthlySavings = duration > 0 ? (savingsUnits / duration) * 2592000 : savingsUnits;

              const service = recommenderId.includes("compute") ? "Compute Engine" : "Cloud SQL";

              const opt: OptimizationRecommendation = {
                id: uuid(),
                cloud: "gcp",
                service,
                type: "COMMITTED_USE",
                category: service === "Compute Engine" ? "COMPUTE" : "DATABASE",
                title: rec.description ?? `Purchase ${service} CUD commitment`,
                description: `${rec.description ?? "Committed use discount recommendation"} — estimated savings: $${monthlySavings.toFixed(2)}/mo`,
                resourceId: rec.name ?? "cud-recommendation",
                resourceName: service,
                accountId: params.projectId,
                region: params.location,
                currentMonthlyCost: monthlySavings * 3,
                projectedMonthlyCost: monthlySavings * 2,
                estimatedMonthlySavings: monthlySavings,
                estimatedAnnualSavings: monthlySavings * 12,
                savingsPercentage: 33,
                impact: computeImpact(monthlySavings),
                effort: "LOW",
                priorityScore: 0,
                actionSteps: [
                  "Review usage patterns to confirm steady-state workload",
                  `Purchase 1-year or 3-year CUD for ${service}`,
                  "CUDs apply automatically to matching resources",
                  "Monitor commitment utilization in Billing console",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: rec,
              };
              opt.priorityScore = computePriorityScore(opt);
              recommendations.push(opt);
            }
          } catch { /* recommender not available */ }
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
