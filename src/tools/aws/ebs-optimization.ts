import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EC2Client, DescribeVolumesCommand } from "@aws-sdk/client-ec2";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

const EBS_COST_PER_GB: Record<string, number> = {
  gp2: 0.10,
  gp3: 0.08,
  io1: 0.125,
  io2: 0.125,
  st1: 0.045,
  sc1: 0.015,
  standard: 0.05,
};

export function register(server: McpServer): void {
  server.tool(
    "aws_get_ebs_optimization",
    "Analyze EBS volumes for cost optimization: gp2→gp3 migration, underutilized io1/io2 volumes, and oversized volumes with low IOPS usage.",
    {
      lookbackDays: z.number().min(7).max(90).default(14),
      maxResults: z.number().min(1).max(200).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_ebs_optimization" });

      try {
        const ec2 = new EC2Client({ requestHandler: { requestTimeout: 30000 } });
        const cw = new CloudWatchClient({ requestHandler: { requestTimeout: 30000 } });
        const recommendations: OptimizationRecommendation[] = [];

        const volumes = await ec2.send(new DescribeVolumesCommand({
          Filters: [{ Name: "status", Values: ["in-use"] }],
          MaxResults: 500,
        }));

        const startTime = new Date(Date.now() - params.lookbackDays * 86400000);

        for (const vol of (volumes.Volumes ?? []).slice(0, params.maxResults)) {
          const volId = vol.VolumeId ?? "unknown";
          const sizeGB = vol.Size ?? 0;
          const volType = vol.VolumeType ?? "gp2";
          const costPerGB = EBS_COST_PER_GB[volType] ?? 0.10;
          const monthlyCost = sizeGB * costPerGB;

          // gp2 → gp3 migration (20% savings, better baseline performance)
          if (volType === "gp2") {
            const gp3Cost = sizeGB * 0.08;
            const savings = monthlyCost - gp3Cost;

            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "EBS",
              type: "MODERNIZATION",
              category: "STORAGE",
              title: `Migrate EBS ${volId} from gp2 → gp3 (${sizeGB} GB)`,
              description: `gp3 is 20% cheaper than gp2 with better baseline IOPS (3000) and throughput (125 MB/s). Save $${savings.toFixed(2)}/mo.`,
              resourceId: volId,
              resourceName: vol.Tags?.find(t => t.Key === "Name")?.Value ?? volId,
              region: vol.AvailabilityZone,
              accountId: process.env.AWS_ACCOUNT_ID,
              currentMonthlyCost: monthlyCost,
              projectedMonthlyCost: gp3Cost,
              estimatedMonthlySavings: savings,
              estimatedAnnualSavings: savings * 12,
              savingsPercentage: 20,
              impact: computeImpact(savings),
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Modify volume type from gp2 to gp3 (online, no downtime)",
                "Verify IOPS and throughput requirements are met by gp3 baseline",
                "Add provisioned IOPS/throughput only if needed above baseline",
              ],
              tags: Object.fromEntries((vol.Tags ?? []).map(t => [t.Key ?? "", t.Value ?? ""])),
              detectedAt: new Date(),
              rawData: vol,
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }

          // io1/io2 with low IOPS utilization
          if ((volType === "io1" || volType === "io2") && vol.Iops) {
            let avgReadOps = 0;
            let avgWriteOps = 0;
            try {
              const readMetric = await cw.send(new GetMetricStatisticsCommand({
                Namespace: "AWS/EBS",
                MetricName: "VolumeReadOps",
                Dimensions: [{ Name: "VolumeId", Value: volId }],
                StartTime: startTime,
                EndTime: new Date(),
                Period: params.lookbackDays * 86400,
                Statistics: ["Average"],
              }));
              avgReadOps = readMetric.Datapoints?.[0]?.Average ?? 0;

              const writeMetric = await cw.send(new GetMetricStatisticsCommand({
                Namespace: "AWS/EBS",
                MetricName: "VolumeWriteOps",
                Dimensions: [{ Name: "VolumeId", Value: volId }],
                StartTime: startTime,
                EndTime: new Date(),
                Period: params.lookbackDays * 86400,
                Statistics: ["Average"],
              }));
              avgWriteOps = writeMetric.Datapoints?.[0]?.Average ?? 0;
            } catch { /* no data */ }

            const totalIOPS = avgReadOps + avgWriteOps;
            const provisionedIOPS = vol.Iops;
            const iopsUtilization = provisionedIOPS > 0 ? (totalIOPS / provisionedIOPS) * 100 : 0;

            if (iopsUtilization < 20) {
              const ioCost = monthlyCost + (provisionedIOPS * 0.065);
              const gp3Cost = sizeGB * 0.08;
              const savings = ioCost - gp3Cost;

              if (savings > 10) {
                const rec: OptimizationRecommendation = {
                  id: uuid(),
                  cloud: "aws",
                  service: "EBS",
                  type: "RIGHTSIZING",
                  category: "STORAGE",
                  title: `Switch ${volId} from ${volType} → gp3 (${iopsUtilization.toFixed(0)}% IOPS used)`,
                  description: `Volume using ${iopsUtilization.toFixed(1)}% of ${provisionedIOPS} provisioned IOPS. gp3 provides 3000 baseline IOPS at lower cost.`,
                  resourceId: volId,
                  resourceName: vol.Tags?.find(t => t.Key === "Name")?.Value ?? volId,
                  region: vol.AvailabilityZone,
                  accountId: process.env.AWS_ACCOUNT_ID,
                  currentMonthlyCost: ioCost,
                  projectedMonthlyCost: gp3Cost,
                  estimatedMonthlySavings: savings,
                  estimatedAnnualSavings: savings * 12,
                  savingsPercentage: (savings / ioCost) * 100,
                  impact: computeImpact(savings),
                  effort: "LOW",
                  priorityScore: 0,
                  actionSteps: [
                    `Current IOPS utilization: ${iopsUtilization.toFixed(1)}%`,
                    "Modify volume type to gp3 (online modification)",
                    "Provision additional IOPS on gp3 if needed above 3000 baseline",
                  ],
                  tags: Object.fromEntries((vol.Tags ?? []).map(t => [t.Key ?? "", t.Value ?? ""])),
                  detectedAt: new Date(),
                  rawData: vol,
                };
                rec.priorityScore = computePriorityScore(rec);
                recommendations.push(rec);
              }
            }
          }
        }

        recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
        const totalSavings = recommendations.reduce((s, r) => s + r.estimatedMonthlySavings, 0);

        const result: ToolResponse<{
          recommendations: OptimizationRecommendation[];
          totalMonthlySavings: number;
          totalAnnualSavings: number;
          volumesAnalyzed: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            volumesAnalyzed: volumes.Volumes?.length ?? 0,
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
