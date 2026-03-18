import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from "@aws-sdk/client-lambda";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import { computePriorityScore, computeImpact } from "../shared/savings-calculator.js";
import type { ToolResponse, OptimizationRecommendation } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_lambda_cost_optimization",
    "Analyze Lambda functions for cost optimization: over-provisioned memory, low invocation counts, long durations, and unused functions.",
    {
      lookbackDays: z.number().min(7).max(90).default(30),
      maxFunctions: z.number().min(1).max(100).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_lambda_cost_optimization" });

      try {
        const lambda = new LambdaClient({ requestHandler: { requestTimeout: 30000 } });
        const cw = new CloudWatchClient({ requestHandler: { requestTimeout: 30000 } });
        const recommendations: OptimizationRecommendation[] = [];

        const functions = await lambda.send(new ListFunctionsCommand({ MaxItems: params.maxFunctions }));
        const startTime = new Date(Date.now() - params.lookbackDays * 86400000);
        const endTime = new Date();

        for (const fn of functions.Functions ?? []) {
          const fnName = fn.FunctionName ?? "unknown";
          const memoryMB = fn.MemorySize ?? 128;

          // Get invocation count
          let invocations = 0;
          try {
            const invMetric = await cw.send(new GetMetricStatisticsCommand({
              Namespace: "AWS/Lambda",
              MetricName: "Invocations",
              Dimensions: [{ Name: "FunctionName", Value: fnName }],
              StartTime: startTime,
              EndTime: endTime,
              Period: params.lookbackDays * 86400,
              Statistics: ["Sum"],
            }));
            invocations = invMetric.Datapoints?.[0]?.Sum ?? 0;
          } catch { /* no data */ }

          // Get average duration
          let avgDurationMs = 0;
          try {
            const durMetric = await cw.send(new GetMetricStatisticsCommand({
              Namespace: "AWS/Lambda",
              MetricName: "Duration",
              Dimensions: [{ Name: "FunctionName", Value: fnName }],
              StartTime: startTime,
              EndTime: endTime,
              Period: params.lookbackDays * 86400,
              Statistics: ["Average"],
            }));
            avgDurationMs = durMetric.Datapoints?.[0]?.Average ?? 0;
          } catch { /* no data */ }

          // Estimate monthly cost: $0.0000166667 per GB-second + $0.20 per 1M requests
          const gbSeconds = (memoryMB / 1024) * (avgDurationMs / 1000) * invocations;
          const computeCost = gbSeconds * 0.0000166667;
          const requestCost = (invocations / 1_000_000) * 0.20;
          const monthlyCost = computeCost + requestCost;

          // Unused function
          if (invocations === 0) {
            const rec: OptimizationRecommendation = {
              id: uuid(),
              cloud: "aws",
              service: "Lambda",
              type: "UNUSED_RESOURCE",
              category: "SERVERLESS",
              title: `Remove unused Lambda function: ${fnName}`,
              description: `Function ${fnName} had 0 invocations in the last ${params.lookbackDays} days`,
              resourceId: fn.FunctionArn ?? fnName,
              resourceName: fnName,
              region: process.env.AWS_DEFAULT_REGION,
              accountId: process.env.AWS_ACCOUNT_ID,
              currentMonthlyCost: 0,
              projectedMonthlyCost: 0,
              estimatedMonthlySavings: 0,
              estimatedAnnualSavings: 0,
              savingsPercentage: 100,
              impact: "LOW",
              effort: "LOW",
              priorityScore: 0,
              actionSteps: [
                "Verify the function is not a cold-standby or disaster recovery function",
                "Check if it's triggered by scheduled events that haven't fired",
                "Delete the function and associated IAM roles",
              ],
              tags: {},
              detectedAt: new Date(),
              rawData: { fn, invocations, avgDurationMs },
            };
            rec.priorityScore = computePriorityScore(rec);
            recommendations.push(rec);
          }
          // Over-provisioned memory (using less than 40% of memory, rough heuristic)
          else if (memoryMB >= 512 && avgDurationMs < 1000) {
            const reducedMemory = Math.max(128, Math.ceil(memoryMB * 0.5 / 64) * 64);
            const newGbSeconds = (reducedMemory / 1024) * (avgDurationMs / 1000) * invocations;
            const newComputeCost = newGbSeconds * 0.0000166667;
            const savings = computeCost - newComputeCost;

            if (savings > 1) {
              const rec: OptimizationRecommendation = {
                id: uuid(),
                cloud: "aws",
                service: "Lambda",
                type: "RIGHTSIZING",
                category: "SERVERLESS",
                title: `Rightsize Lambda ${fnName}: ${memoryMB}MB → ${reducedMemory}MB`,
                description: `Function ${fnName} may be over-provisioned at ${memoryMB}MB with avg ${avgDurationMs.toFixed(0)}ms duration. Consider reducing to ${reducedMemory}MB.`,
                resourceId: fn.FunctionArn ?? fnName,
                resourceName: fnName,
                region: process.env.AWS_DEFAULT_REGION,
                accountId: process.env.AWS_ACCOUNT_ID,
                currentMonthlyCost: monthlyCost,
                projectedMonthlyCost: monthlyCost - savings,
                estimatedMonthlySavings: savings,
                estimatedAnnualSavings: savings * 12,
                savingsPercentage: monthlyCost > 0 ? (savings / monthlyCost) * 100 : 0,
                impact: computeImpact(savings),
                effort: "LOW",
                priorityScore: 0,
                actionSteps: [
                  "Use AWS Lambda Power Tuning to find optimal memory",
                  `Update memory configuration to ${reducedMemory}MB`,
                  "Monitor for increased duration or errors after change",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: { fn, invocations, avgDurationMs, monthlyCost },
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
          functionsAnalyzed: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            recommendations,
            totalMonthlySavings: totalSavings,
            totalAnnualSavings: totalSavings * 12,
            functionsAnalyzed: functions.Functions?.length ?? 0,
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
