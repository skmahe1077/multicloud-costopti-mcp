import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

// Rough monthly cost estimates by instance class
const RDS_COST_MAP: Record<string, number> = {
  "db.t3.micro": 12.41,
  "db.t3.small": 24.82,
  "db.t3.medium": 49.64,
  "db.t3.large": 99.28,
  "db.r5.large": 172.80,
  "db.r5.xlarge": 345.60,
  "db.r5.2xlarge": 691.20,
  "db.m5.large": 124.10,
  "db.m5.xlarge": 248.20,
  "db.m5.2xlarge": 496.40,
};

export function register(server: McpServer): void {
  server.tool(
    "aws_get_rds_optimization",
    "Analyze RDS instances for cost optimization: idle databases, over-provisioned instances, and Multi-AZ deployments that may not need HA.",
    {
      lookbackDays: z.number().min(7).max(90).default(14),
      cpuThreshold: z.number().min(1).max(100).default(10).describe("CPU threshold % — instances below this are idle"),
      maxResults: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_rds_optimization" });

      try {
        const rds = new RDSClient({ requestHandler: { requestTimeout: 30000 } });
        const cw = new CloudWatchClient({ requestHandler: { requestTimeout: 30000 } });
        const recommendations: OptimizationRecommendation[] = [];

        const instances = await rds.send(new DescribeDBInstancesCommand({}));
        const startTime = new Date(Date.now() - params.lookbackDays * 86400000);

        for (const db of (instances.DBInstances ?? []).slice(0, params.maxResults)) {
          const dbId = db.DBInstanceIdentifier ?? "unknown";
          const instanceClass = db.DBInstanceClass ?? "unknown";
          const estimatedCost = RDS_COST_MAP[instanceClass] ?? 100;
          const multiAzCost = db.MultiAZ ? estimatedCost * 2 : estimatedCost;

          // Get average CPU
          let avgCpu = 50;
          try {
            const cpu = await cw.send(new GetMetricStatisticsCommand({
              Namespace: "AWS/RDS",
              MetricName: "CPUUtilization",
              Dimensions: [{ Name: "DBInstanceIdentifier", Value: dbId }],
              StartTime: startTime,
              EndTime: new Date(),
              Period: params.lookbackDays * 86400,
              Statistics: ["Average"],
            }));
            avgCpu = cpu.Datapoints?.[0]?.Average ?? 50;
          } catch { /* no data */ }

          // Get average connections
          let avgConnections = 10;
          try {
            const conn = await cw.send(new GetMetricStatisticsCommand({
              Namespace: "AWS/RDS",
              MetricName: "DatabaseConnections",
              Dimensions: [{ Name: "DBInstanceIdentifier", Value: dbId }],
              StartTime: startTime,
              EndTime: new Date(),
              Period: params.lookbackDays * 86400,
              Statistics: ["Average"],
            }));
            avgConnections = conn.Datapoints?.[0]?.Average ?? 10;
          } catch { /* no data */ }

          // Idle instance
          if (avgCpu < params.cpuThreshold && avgConnections < 2) {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "RDS",
              type: "IDLE_RESOURCE",
              category: "DATABASE",
              title: `Idle RDS instance: ${dbId} (${instanceClass})`,
              description: `RDS instance ${dbId} averages ${avgCpu.toFixed(1)}% CPU and ${avgConnections.toFixed(0)} connections over ${params.lookbackDays} days. Consider stopping or terminating.`,
              resourceId: db.DBInstanceArn ?? dbId,
              resourceName: dbId,
              region: db.AvailabilityZone,
              accountId: process.env.AWS_ACCOUNT_ID,
              currentMonthlyCost: multiAzCost,
              projectedMonthlyCost: 0,
              estimatedMonthlySavings: multiAzCost,
              estimatedAnnualSavings: multiAzCost * 12,
              savingsPercentage: 100,
              impact: computeImpact(multiAzCost),
              effort: "MEDIUM",
              priorityScore: 0,
              actionSteps: [
                "Take a final snapshot",
                "Stop the instance (saves compute, still charged for storage)",
                "Delete if no longer needed",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: { db, avgCpu, avgConnections },
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }
          // Over-provisioned
          else if (avgCpu < 25) {
            const smallerClass = instanceClass.replace(/\.(\w+)$/, (_, size) => {
              const sizes = ["micro", "small", "medium", "large", "xlarge", "2xlarge", "4xlarge"];
              const idx = sizes.indexOf(size);
              return idx > 0 ? `.${sizes[idx - 1]}` : `.${size}`;
            });
            const newCost = (RDS_COST_MAP[smallerClass] ?? estimatedCost * 0.5) * (db.MultiAZ ? 2 : 1);
            const savings = multiAzCost - newCost;

            if (savings > 10) {
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "aws",
                service: "RDS",
                type: "RIGHTSIZING",
                category: "DATABASE",
                title: `Rightsize RDS ${dbId}: ${instanceClass} → ${smallerClass}`,
                description: `RDS instance averages ${avgCpu.toFixed(1)}% CPU. Downsizing from ${instanceClass} to ${smallerClass} could save $${savings.toFixed(2)}/mo`,
                resourceId: db.DBInstanceArn ?? dbId,
                resourceName: dbId,
                region: db.AvailabilityZone,
                accountId: process.env.AWS_ACCOUNT_ID,
                currentMonthlyCost: multiAzCost,
                projectedMonthlyCost: newCost,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: (savings / multiAzCost) * 100,
                impact: computeImpact(savings),
                effort: "MEDIUM",
                priorityScore: 0,
                actionSteps: [
                  `Modify instance class to ${smallerClass}`,
                  "Schedule change during maintenance window",
                  "Monitor performance after change",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { db, avgCpu, avgConnections },
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
          instancesAnalyzed: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            instancesAnalyzed: instances.DBInstances?.length ?? 0,
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
