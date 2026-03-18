import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RecommenderClient } from "@google-cloud/recommender";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";
import { mapGcpServiceToCategory } from "../shared/cost-normalizer.js";

const COST_RECOMMENDER_IDS = [
  "google.compute.instance.MachineTypeRecommender",
  "google.compute.instance.IdleResourceRecommender",
  "google.compute.disk.IdleResourceRecommender",
  "google.compute.address.IdleResourceRecommender",
  "google.compute.image.IdleResourceRecommender",
  "google.cloudsql.instance.IdleRecommender",
  "google.cloudsql.instance.OverprovisionedRecommender",
];

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_recommender_insights",
    "Get GCP Recommender cost optimization insights for compute, disk, SQL, and address resources. Returns rightsizing, idle resource, and commitment recommendations.",
    {
      projectId: z.string().describe("GCP Project ID"),
      location: z.string().default("us-central1").describe("GCP region"),
      maxResults: z.number().min(1).max(100).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_recommender_insights" });

      try {
        const client = new RecommenderClient();
        const recommendations: OptimizationRecommendation[] = [];

        for (const recommenderId of COST_RECOMMENDER_IDS) {
          if (recommendations.length >= params.maxResults) break;

          try {
            const parent = `projects/${params.projectId}/locations/${params.location}/recommenders/${recommenderId}`;
            const [recs] = await client.listRecommendations({ parent });

            for (const rec of recs) {
              if (recommendations.length >= params.maxResults) break;

              const impact = rec.primaryImpact;
              const savings = Math.abs(
                impact?.costProjection?.cost?.units
                  ? Number(impact.costProjection.cost.units)
                  : 0,
              );
              const duration = impact?.costProjection?.duration?.seconds
                ? Number(impact.costProjection.duration.seconds)
                : 2592000;
              const monthlySavings = duration > 0 ? (savings / duration) * 2592000 : savings;

              const service = recommenderId.split(".")[1] ?? "compute";
              const isIdle = recommenderId.includes("Idle");
              const targetResource = rec.content?.operationGroups?.[0]?.operations?.[0]?.resource ?? "";

              const opt: OptimizationRecommendation = {
                id: uuid(),
                cloud: "gcp",
                service,
                type: isIdle ? "IDLE_RESOURCE" : "RIGHTSIZING",
                category: mapGcpServiceToCategory(service),
                title: rec.description ?? `${isIdle ? "Remove idle" : "Rightsize"} ${service} resource`,
                description: rec.description ?? "",
                resourceId: targetResource,
                resourceName: targetResource.split("/").pop() ?? "unknown",
                accountId: params.projectId,
                region: params.location,
                currentMonthlyCost: monthlySavings * 2,
                projectedMonthlyCost: monthlySavings,
                estimatedMonthlySavings: monthlySavings,
                estimatedAnnualSavings: monthlySavings * 12,
                savingsPercentage: 50,
                impact: computeImpact(monthlySavings),
                effort: isIdle ? "LOW" : "MEDIUM",
                priorityScore: 0,
                actionSteps: (rec.content?.operationGroups ?? []).flatMap(
                  (og) => (og.operations ?? []).map(
                    (op) => `${op.action} on ${op.resource}`,
                  ),
                ),
                tags: {},
                detectedAt: new Date(),
                rawData: rec,
              };
              opt.priorityScore = computePriorityScore(opt);
              recommendations.push(opt);
            }
          } catch {
            // Recommender may not be enabled for this type
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
