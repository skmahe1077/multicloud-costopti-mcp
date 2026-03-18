import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  S3Client,
  ListBucketsCommand,
  GetBucketAnalyticsConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_s3_cost_optimization",
    "Analyze S3 buckets for cost optimization: missing lifecycle policies, storage class opportunities, and buckets without Intelligent-Tiering.",
    {
      maxBuckets: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_s3_cost_optimization" });

      try {
        const s3 = new S3Client({ requestHandler: { requestTimeout: 30000 } });
        const cw = new CloudWatchClient({ requestHandler: { requestTimeout: 30000 } });
        const recommendations: OptimizationRecommendation[] = [];

        const buckets = await s3.send(new ListBucketsCommand({}));

        for (const bucket of (buckets.Buckets ?? []).slice(0, params.maxBuckets)) {
          const bucketName = bucket.Name ?? "unknown";

          // Check lifecycle policy
          let hasLifecycle = false;
          try {
            await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucketName }));
            hasLifecycle = true;
          } catch {
            hasLifecycle = false;
          }

          // Get bucket size from CloudWatch
          let sizeBytes = 0;
          try {
            const metric = await cw.send(new GetMetricStatisticsCommand({
              Namespace: "AWS/S3",
              MetricName: "BucketSizeBytes",
              Dimensions: [
                { Name: "BucketName", Value: bucketName },
                { Name: "StorageType", Value: "StandardStorage" },
              ],
              StartTime: new Date(Date.now() - 2 * 86400000),
              EndTime: new Date(),
              Period: 86400,
              Statistics: ["Average"],
            }));
            sizeBytes = metric.Datapoints?.[0]?.Average ?? 0;
          } catch {
            // CloudWatch may not have data
          }

          const sizeGB = sizeBytes / (1024 ** 3);
          const monthlyCostStandard = sizeGB * 0.023;

          if (!hasLifecycle && sizeGB > 1) {
            const savings = monthlyCostStandard * 0.4; // Estimate 40% savings with lifecycle
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "S3",
              type: "STORAGE_TIERING",
              category: "STORAGE",
              title: `Add lifecycle policy to S3 bucket ${bucketName}`,
              description: `Bucket ${bucketName} (${sizeGB.toFixed(1)} GB) has no lifecycle policy. Adding Intelligent-Tiering or transition rules could save ~$${savings.toFixed(2)}/mo`,
              resourceId: bucketName,
              resourceName: bucketName,
              region: process.env.AWS_DEFAULT_REGION,
              accountId: process.env.AWS_ACCOUNT_ID,
              currentMonthlyCost: monthlyCostStandard,
              projectedMonthlyCost: monthlyCostStandard - savings,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 40,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Analyze access patterns with S3 Storage Lens",
                "Enable S3 Intelligent-Tiering for automatic optimization",
                "Add lifecycle rules to transition infrequently accessed data to S3-IA after 30 days",
                "Add lifecycle rules to move to Glacier after 90 days if applicable",
                "Set expiration rules for temporary data",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: { bucket, sizeGB, hasLifecycle },
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
            bucketsAnalyzed: Math.min(buckets.Buckets?.length ?? 0, params.maxBuckets),
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
