import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "gcp_get_cloudsql_optimization",
    "Analyze Cloud SQL instances for cost optimization: over-provisioned instances, HA not needed, and storage autoresize review.",
    {
      projectId: z.string().describe("GCP Project ID"),
      maxResults: z.number().min(1).max(50).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "gcp_get_cloudsql_optimization" });

      try {
        const auth = new google.auth.GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/sqlservice.admin"],
        });
        const sqladmin = google.sqladmin({ version: "v1beta4", auth });
        const recommendations: OptimizationRecommendation[] = [];

        const response = await sqladmin.instances.list({ project: params.projectId });

        for (const instance of (response.data.items ?? []).slice(0, params.maxResults)) {
          const name = instance.name ?? "unknown";
          const tier = instance.settings?.tier ?? "db-f1-micro";
          const region = instance.region ?? "unknown";
          const haEnabled = instance.settings?.availabilityType === "REGIONAL";
          const estimatedCost = estimateSqlCost(tier, haEnabled);

          // HA instances that might not need HA
          if (haEnabled) {
            const savings = estimatedCost * 0.5;
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "gcp",
              service: "Cloud SQL",
              type: "RIGHTSIZING",
              category: "DATABASE",
              title: `Review HA for Cloud SQL: ${name} (${tier})`,
              description: `Instance ${name} has Regional (HA) availability. If this is a dev/staging instance, switching to Zonal saves ~50%.`,
              resourceId: instance.selfLink ?? name,
              resourceName: name,
              region,
              accountId: params.projectId,
              currentMonthlyCost: estimatedCost,
              projectedMonthlyCost: estimatedCost - savings,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 50,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Verify if HA is required for this instance",
                "For dev/staging, switch to Zonal availability",
                "Edit instance → Availability → Single zone",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: instance,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // Over-provisioned tier
          if (tier.includes("db-custom") || tier.includes("db-n1-standard")) {
            const cpuCount = parseInt(tier.split("-").pop() ?? "1");
            if (cpuCount >= 4) {
              const savings = estimatedCost * 0.3;
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "gcp",
                service: "Cloud SQL",
                type: "RIGHTSIZING",
                category: "DATABASE",
                title: `Rightsize Cloud SQL: ${name} (${tier})`,
                description: `Instance ${name} uses ${tier}. Check CPU and memory utilization — downsizing could save ~30%.`,
                resourceId: instance.selfLink ?? name,
                resourceName: name,
                region,
                accountId: params.projectId,
                currentMonthlyCost: estimatedCost,
                projectedMonthlyCost: estimatedCost - savings,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: 30,
                impact: computeImpact(savings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  "Check CPU utilization in Cloud Monitoring",
                  "Review memory usage patterns",
                  "Reduce machine type to match actual needs",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: instance,
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

function estimateSqlCost(tier: string, ha: boolean): number {
  const baseCosts: Record<string, number> = {
    "db-f1-micro": 8, "db-g1-small": 26, "db-n1-standard-1": 51,
    "db-n1-standard-2": 102, "db-n1-standard-4": 204, "db-n1-standard-8": 409,
    "db-custom-1-3840": 51, "db-custom-2-7680": 102, "db-custom-4-15360": 204,
  };
  const base = baseCosts[tier] ?? 100;
  return ha ? base * 2 : base;
}
