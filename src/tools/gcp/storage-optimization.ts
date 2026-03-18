import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_storage_optimization",
    "Analyze GCS buckets for cost optimization: storage class recommendations, lifecycle policy gaps, and Autoclass enablement opportunities.",
    {
      projectId: z.string().describe("GCP Project ID"),
      maxBuckets: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_storage_optimization" });

      try {
        const storage = new Storage({ projectId: params.projectId });
        const recommendations: OptimizationRecommendation[] = [];

        const [buckets] = await storage.getBuckets();

        for (const bucket of buckets.slice(0, params.maxBuckets)) {
          const name = bucket.name;
          const metadata = bucket.metadata;
          const storageClass = metadata.storageClass ?? "STANDARD";
          const hasLifecycle = (metadata.lifecycle?.rule ?? []).length > 0;
          const hasAutoclass = metadata.autoclass?.enabled ?? false;

          // No lifecycle rules
          if (!hasLifecycle && !hasAutoclass) {
            const savings = 20; // Estimated
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "Cloud Storage",
              type: "STORAGE_TIERING",
              category: "STORAGE",
              title: `Add lifecycle policy to bucket: ${name}`,
              description: `Bucket ${name} (${storageClass}) has no lifecycle rules or Autoclass. Adding lifecycle management or enabling Autoclass could reduce costs significantly.`,
              resourceId: name,
              resourceName: name,
              accountId: params.projectId,
              currentMonthlyCost: 30,
              projectedMonthlyCost: 10,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 67,
              impact: "MEDIUM",
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Enable Autoclass for automatic storage class transitions",
                "Or add lifecycle rules to transition to Nearline after 30 days",
                "Add rules for Coldline after 90 days and Archive after 365 days",
                "Set object expiration for temporary data",
              ],
              tags: (metadata.labels ?? {}) as Record<string, string>,
              detectedAt: new Date(),
              rawData: metadata,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // Standard storage that should be Nearline/Coldline
          if (storageClass === "STANDARD" && !hasAutoclass) {
            const savings = 15;
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "Cloud Storage",
              type: "STORAGE_TIERING",
              category: "STORAGE",
              title: `Evaluate storage class: ${name} (STANDARD)`,
              description: `Bucket ${name} uses STANDARD class. If data is accessed less than once a month, Nearline saves 50%. Enable Autoclass for automatic optimization.`,
              resourceId: name,
              resourceName: name,
              accountId: params.projectId,
              currentMonthlyCost: 30,
              projectedMonthlyCost: 15,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 50,
              impact: "MEDIUM",
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Analyze access patterns using Storage Insights",
                "Enable Autoclass for automatic storage class management",
                "Or manually set default class to Nearline for infrequent access",
              ],
              tags: (metadata.labels ?? {}) as Record<string, string>,
              detectedAt: new Date(),
              rawData: metadata,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }
        }

        recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
        const totalSavings = recommendations.reduce((s, r) => s + r.estimatedMonthlySavings, 0);

        const result: ToolResponse<{
          recommendations: OptimizationRecommendation[];
          totalMonthlySavings: number;
          totalAnnualSavings: number;
          bucketsAnalyzed: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            bucketsAnalyzed: Math.min(buckets.length, params.maxBuckets),
            count: recommendations.length,
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
