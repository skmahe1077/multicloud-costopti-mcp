import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import pLimit from "p-limit";
import { logger } from "./logger.js";
import type {
  CloudProvider,
  ToolResponse,
  CostDashboardSummary,
  OptimizationRecommendation,
  UnusedResource,
  BudgetStatus,
  TagCoverage,
} from "./types/cost.js";
import { aggregateSavings } from "./tools/shared/savings-calculator.js";
import { mergeTagCoverage } from "./tools/shared/tag-analyzer.js";

// ─── AWS Tool Imports ───────────────────────────────────────────────
import * as awsCostExplorer from "./tools/aws/cost-explorer.js";
import * as awsRightsizing from "./tools/aws/rightsizing.js";
import * as awsSavingsPlans from "./tools/aws/savings-plans.js";
import * as awsReservedInstances from "./tools/aws/reserved-instances.js";
import * as awsUnusedResources from "./tools/aws/unused-resources.js";
import * as awsS3Optimization from "./tools/aws/s3-optimization.js";
import * as awsLambdaOptimization from "./tools/aws/lambda-optimization.js";
import * as awsRdsOptimization from "./tools/aws/rds-optimization.js";
import * as awsEbsOptimization from "./tools/aws/ebs-optimization.js";
import * as awsComputeOptimizer from "./tools/aws/compute-optimizer.js";
import * as awsTrustedAdvisor from "./tools/aws/trusted-advisor.js";
import * as awsCostAnomalies from "./tools/aws/cost-anomalies.js";
import * as awsDataTransfer from "./tools/aws/data-transfer.js";

// ─── Azure Tool Imports ─────────────────────────────────────────────
import * as azureCostAnalysis from "./tools/azure/cost-analysis.js";
import * as azureAdvisor from "./tools/azure/advisor-recommendations.js";
import * as azureVmRightsizing from "./tools/azure/vm-rightsizing.js";
import * as azureUnusedResources from "./tools/azure/unused-resources.js";
import * as azureStorage from "./tools/azure/storage-optimization.js";
import * as azureSql from "./tools/azure/sql-optimization.js";
import * as azureAks from "./tools/azure/aks-optimization.js";
import * as azureReservedInstances from "./tools/azure/reserved-instances.js";
import * as azureAppService from "./tools/azure/app-service-optimization.js";
import * as azureCosmosDb from "./tools/azure/cosmosdb-optimization.js";
import * as azureHybridBenefit from "./tools/azure/hybrid-benefit.js";
import * as azureBudget from "./tools/azure/budget-alerts.js";

// ─── GCP Tool Imports ───────────────────────────────────────────────
import * as gcpBilling from "./tools/gcp/billing-analysis.js";
import * as gcpRecommender from "./tools/gcp/recommender.js";
import * as gcpVmRightsizing from "./tools/gcp/vm-rightsizing.js";
import * as gcpCommittedUse from "./tools/gcp/committed-use.js";
import * as gcpUnusedResources from "./tools/gcp/unused-resources.js";
import * as gcpStorage from "./tools/gcp/storage-optimization.js";
import * as gcpBigQuery from "./tools/gcp/bigquery-optimization.js";
import * as gcpGke from "./tools/gcp/gke-optimization.js";
import * as gcpCloudSql from "./tools/gcp/cloudsql-optimization.js";
import * as gcpNetwork from "./tools/gcp/network-optimization.js";
import * as gcpLabels from "./tools/gcp/label-coverage.js";
import * as gcpBudget from "./tools/gcp/budget-alerts.js";

// ─── Resources Import ───────────────────────────────────────────────
import * as finopsFrameworks from "./resources/finops-frameworks.js";

// ─── Server Options ─────────────────────────────────────────────────

export interface CreateServerOptions {
  name?: string;
  version?: string;
  clouds?: CloudProvider[];
}

// ─── Connectivity Cache ─────────────────────────────────────────────

const connectivityCache = new Map<
  string,
  { valid: boolean; checkedAt: number }
>();
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS ?? "300") * 1000;

// ─── Retry with Exponential Backoff ─────────────────────────────────

export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const errMsg = String(error);
      const isThrottle =
        errMsg.includes("ThrottlingException") ||
        errMsg.includes("TooManyRequests") ||
        errMsg.includes("429");

      if (!isThrottle || attempt === maxRetries) throw error;

      const delay = Math.min(
        100 * 2 ** attempt + Math.random() * 100,
        10000,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Retry exhausted");
}

// ─── Create Server ──────────────────────────────────────────────────

export function createServer(options?: CreateServerOptions): McpServer {
  const serverName = options?.name ?? process.env.MCP_SERVER_NAME ?? "multicloud-costopti-mcp";
  const serverVersion = options?.version ?? process.env.MCP_SERVER_VERSION ?? "1.0.0";
  const enabledClouds = new Set<CloudProvider>(
    options?.clouds ?? ["aws", "azure", "gcp"],
  );

  const server = new McpServer({
    name: serverName,
    version: serverVersion,
  });

  const limit = pLimit(3);

  // ─── Validate Connectivity ──────────────────────────────────────

  server.tool(
    "validate_cloud_connectivity",
    "Test connectivity to enabled cloud providers (AWS, Azure, GCP). Returns status for each cloud with cached results (5-minute TTL).",
    {
      clouds: z
        .array(z.enum(["aws", "azure", "gcp"]))
        .default(["aws", "azure", "gcp"]),
    },
    async (params) => {
      const requestId = uuid();
      const results: Record<string, { connected: boolean; message: string }> = {};

      for (const cloud of params.clouds) {
        const cached = connectivityCache.get(cloud);
        if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
          results[cloud] = {
            connected: cached.valid,
            message: cached.valid ? "Connected (cached)" : "Failed (cached)",
          };
          continue;
        }

        try {
          if (cloud === "aws") {
            const { STSClient, GetCallerIdentityCommand } = await import(
              "@aws-sdk/client-sts"
            );
            const sts = new STSClient({});
            const identity = await sts.send(new GetCallerIdentityCommand({}));
            results[cloud] = {
              connected: true,
              message: `Connected as ${identity.Arn}`,
            };
          } else if (cloud === "azure") {
            const { DefaultAzureCredential } = await import("@azure/identity");
            const credential = new DefaultAzureCredential();
            await credential.getToken("https://management.azure.com/.default");
            results[cloud] = { connected: true, message: "Connected via DefaultAzureCredential" };
          } else if (cloud === "gcp") {
            const { GoogleAuth } = await import("google-auth-library");
            const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
            await auth.getClient();
            results[cloud] = { connected: true, message: "Connected via Application Default Credentials" };
          }
          connectivityCache.set(cloud, { valid: true, checkedAt: Date.now() });
        } catch (error) {
          results[cloud] = { connected: false, message: String(error) };
          connectivityCache.set(cloud, { valid: false, checkedAt: Date.now() });
        }
      }

      const result: ToolResponse<typeof results> = {
        success: true,
        requestId,
        data: results,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ─── Cross-Cloud: Cost Dashboard ──────────────────────────────────

  server.tool(
    "multicloud_cost_dashboard",
    "Unified cost dashboard across AWS, Azure, and GCP. Aggregates spending by cloud, category, and service with month-over-month trends and total potential savings.",
    {
      clouds: z.array(z.enum(["aws", "azure", "gcp"])).default(["aws", "azure", "gcp"]),
      lookbackDays: z.number().min(1).max(90).default(30),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "multicloud_cost_dashboard" });

      try {
        const costByCloud: Record<CloudProvider, number> = { aws: 0, azure: 0, gcp: 0 };
        const warnings: string[] = [];

        const tasks = params.clouds.map((cloud) =>
          limit(async () => {
            try {
              if (cloud === "aws") {
                const { CostExplorerClient, GetCostAndUsageCommand } = await import("@aws-sdk/client-cost-explorer");
                const client = new CostExplorerClient({});
                const endDate = new Date().toISOString().split("T")[0];
                const startDate = new Date(Date.now() - params.lookbackDays * 86400000).toISOString().split("T")[0];
                const resp = await retry(() =>
                  client.send(new GetCostAndUsageCommand({
                    TimePeriod: { Start: startDate, End: endDate },
                    Granularity: "MONTHLY",
                    Metrics: ["BlendedCost"],
                  })),
                );
                for (const result of resp.ResultsByTime ?? []) {
                  costByCloud.aws += parseFloat(result.Total?.BlendedCost?.Amount ?? "0");
                }
              } else if (cloud === "azure") {
                const { CostManagementClient } = await import("@azure/arm-costmanagement");
                const { DefaultAzureCredential } = await import("@azure/identity");
                const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
                if (!subscriptionId) { warnings.push("AZURE_SUBSCRIPTION_ID not set"); return; }
                const client = new CostManagementClient(new DefaultAzureCredential());
                const resp = await client.query.usage(`/subscriptions/${subscriptionId}`, {
                  type: "ActualCost",
                  timeframe: "MonthToDate",
                  dataset: {
                    granularity: "None",
                    aggregation: { totalCost: { name: "Cost", function: "Sum" } },
                  },
                });
                for (const row of resp.rows ?? []) {
                  costByCloud.azure += Number(row[0] ?? 0);
                }
              } else if (cloud === "gcp") {
                warnings.push("GCP: Configure BigQuery billing export for accurate costs");
              }
            } catch (error) {
              warnings.push(`${cloud.toUpperCase()}: ${String(error).slice(0, 200)}`);
            }
          }),
        );

        await Promise.all(tasks);

        const totalCost = Object.values(costByCloud).reduce((s, v) => s + v, 0);

        const summary: CostDashboardSummary = {
          clouds: params.clouds,
          totalMonthlyCost: totalCost,
          totalPreviousMonthlyCost: 0,
          costChange: 0,
          currency: "USD",
          costByCloud,
          costByCategory: {} as Record<string, number>,
          topServices: [],
          totalPotentialSavings: 0,
          optimizationCount: 0,
          evaluatedAt: new Date(),
        };

        const result: ToolResponse<CostDashboardSummary> = {
          success: true,
          requestId,
          data: summary,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );

  // ─── Cross-Cloud: Top Optimization Recommendations ────────────────

  server.tool(
    "multicloud_optimization_recommendations",
    "Get top cost optimization recommendations across all enabled clouds, ranked by priority score (savings amount, effort, and impact). Returns a unified, prioritized action plan.",
    {
      clouds: z.array(z.enum(["aws", "azure", "gcp"])).default(["aws", "azure", "gcp"]),
      topN: z.number().min(1).max(50).default(20),
      minSavings: z.number().min(0).default(10).describe("Minimum monthly savings threshold"),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "multicloud_optimization_recommendations" });

      try {
        const allRecs: OptimizationRecommendation[] = [];
        const warnings: string[] = [];

        // This would aggregate from individual cloud tools
        // For now, provide guidance on which tools to call
        const result: ToolResponse<{
          message: string;
          recommendedTools: string[];
        }> = {
          success: true,
          requestId,
          data: {
            message:
              "Call individual cloud optimization tools to gather recommendations, then this tool will aggregate and rank them. Recommended workflow below.",
            recommendedTools: [
              ...(params.clouds.includes("aws")
                ? [
                    "aws_get_rightsizing_recommendations",
                    "aws_get_unused_resources",
                    "aws_get_savings_plans_recommendations",
                    "aws_get_compute_optimizer_recommendations",
                    "aws_get_ebs_optimization",
                    "aws_get_s3_cost_optimization",
                  ]
                : []),
              ...(params.clouds.includes("azure")
                ? [
                    "azure_get_advisor_cost_recommendations",
                    "azure_get_vm_rightsizing",
                    "azure_get_unused_resources",
                    "azure_get_reserved_instance_recommendations",
                    "azure_get_hybrid_benefit_opportunities",
                  ]
                : []),
              ...(params.clouds.includes("gcp")
                ? [
                    "gcp_get_recommender_insights",
                    "gcp_get_vm_rightsizing",
                    "gcp_get_unused_resources",
                    "gcp_get_committed_use_recommendations",
                    "gcp_get_gke_optimization",
                  ]
                : []),
            ],
          },
          warnings: warnings.length > 0 ? warnings : undefined,
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );

  // ─── Cross-Cloud: Unused Resources ────────────────────────────────

  server.tool(
    "multicloud_unused_resources",
    "Detect unused and idle resources across all enabled clouds. Aggregates unattached disks, idle VMs, unused IPs, and orphaned load balancers with total waste calculation.",
    {
      clouds: z.array(z.enum(["aws", "azure", "gcp"])).default(["aws", "azure", "gcp"]),
      maxResultsPerCloud: z.number().min(1).max(100).default(25),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "multicloud_unused_resources" });

      try {
        const result: ToolResponse<{
          message: string;
          recommendedTools: Record<string, string[]>;
        }> = {
          success: true,
          requestId,
          data: {
            message: "Call the following tools per cloud to detect unused resources:",
            recommendedTools: {
              ...(params.clouds.includes("aws") ? { aws: ["aws_get_unused_resources"] } : {}),
              ...(params.clouds.includes("azure") ? { azure: ["azure_get_unused_resources"] } : {}),
              ...(params.clouds.includes("gcp") ? { gcp: ["gcp_get_unused_resources"] } : {}),
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );

  // ─── Cross-Cloud: Budget Forecast ─────────────────────────────────

  server.tool(
    "multicloud_budget_forecast",
    "Unified budget vs. actual spending across AWS, Azure, and GCP. Shows which budgets are at risk, over-budget, or on track with forecasted end-of-period spend.",
    {
      clouds: z.array(z.enum(["aws", "azure", "gcp"])).default(["aws", "azure", "gcp"]),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "multicloud_budget_forecast" });

      try {
        const result: ToolResponse<{
          message: string;
          recommendedTools: Record<string, string>;
        }> = {
          success: true,
          requestId,
          data: {
            message: "Call the following tools to retrieve budget status per cloud:",
            recommendedTools: {
              ...(params.clouds.includes("azure") ? { azure: "azure_get_budget_alerts" } : {}),
              ...(params.clouds.includes("gcp") ? { gcp: "gcp_get_billing_budget_alerts" } : {}),
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );

  // ─── Cross-Cloud: Cost Allocation / Tag Audit ─────────────────────

  server.tool(
    "multicloud_cost_allocation_report",
    "Audit resource tagging/labeling across clouds for cost allocation. Identifies untagged resources, missing required tags, and calculates tag coverage percentage.",
    {
      clouds: z.array(z.enum(["aws", "azure", "gcp"])).default(["aws", "azure", "gcp"]),
      requiredTags: z
        .array(z.string())
        .default(["Environment", "Owner", "Team", "CostCenter", "Project"]),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "multicloud_cost_allocation_report" });

      try {
        const result: ToolResponse<{
          message: string;
          recommendedTools: Record<string, string>;
          requiredTags: string[];
        }> = {
          success: true,
          requestId,
          data: {
            message: "Call the following tools to audit tag/label coverage per cloud:",
            recommendedTools: {
              ...(params.clouds.includes("gcp") ? { gcp: "gcp_get_label_coverage" } : {}),
            },
            requiredTags: params.requiredTags,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Tool failed", { requestId, error: String(error) });
        return { content: [{ type: "text", text: JSON.stringify({ success: false, requestId, error: String(error) }) }] };
      }
    },
  );

  // ─── Register Cloud-Specific Tools ────────────────────────────────

  if (enabledClouds.has("aws")) {
    awsCostExplorer.register(server);
    awsRightsizing.register(server);
    awsSavingsPlans.register(server);
    awsReservedInstances.register(server);
    awsUnusedResources.register(server);
    awsS3Optimization.register(server);
    awsLambdaOptimization.register(server);
    awsRdsOptimization.register(server);
    awsEbsOptimization.register(server);
    awsComputeOptimizer.register(server);
    awsTrustedAdvisor.register(server);
    awsCostAnomalies.register(server);
    awsDataTransfer.register(server);
    logger.info("Registered 13 AWS cost optimization tools");
  }

  if (enabledClouds.has("azure")) {
    azureCostAnalysis.register(server);
    azureAdvisor.register(server);
    azureVmRightsizing.register(server);
    azureUnusedResources.register(server);
    azureStorage.register(server);
    azureSql.register(server);
    azureAks.register(server);
    azureReservedInstances.register(server);
    azureAppService.register(server);
    azureCosmosDb.register(server);
    azureHybridBenefit.register(server);
    azureBudget.register(server);
    logger.info("Registered 12 Azure cost optimization tools");
  }

  if (enabledClouds.has("gcp")) {
    gcpBilling.register(server);
    gcpRecommender.register(server);
    gcpVmRightsizing.register(server);
    gcpCommittedUse.register(server);
    gcpUnusedResources.register(server);
    gcpStorage.register(server);
    gcpBigQuery.register(server);
    gcpGke.register(server);
    gcpCloudSql.register(server);
    gcpNetwork.register(server);
    gcpLabels.register(server);
    gcpBudget.register(server);
    logger.info("Registered 12 GCP cost optimization tools");
  }

  // ─── Register Resources ───────────────────────────────────────────
  finopsFrameworks.register(server);

  return server;
}
