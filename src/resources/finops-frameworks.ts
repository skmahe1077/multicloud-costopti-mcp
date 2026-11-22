import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function register(server: McpServer): void {
  // Cost Summary Schema
  server.resource(
    "cost://summary/schema",
    "cost://summary/schema",
    async () => ({
      contents: [
        {
          uri: "cost://summary/schema",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              description: "Schema reference for normalized cost items and optimization recommendations",
              normalizedCostItem: {
                fields: [
                  "id", "cloud", "service", "category", "resourceId", "resourceName",
                  "region", "accountId", "currentMonthlyCost", "previousMonthlyCost",
                  "costChange", "currency", "tags", "periodStart", "periodEnd",
                ],
              },
              optimizationRecommendation: {
                fields: [
                  "id", "cloud", "service", "type", "category", "title", "description",
                  "resourceId", "currentMonthlyCost", "projectedMonthlyCost",
                  "estimatedMonthlySavings", "estimatedAnnualSavings", "savingsPercentage",
                  "impact", "effort", "priorityScore", "actionSteps",
                ],
              },
              optimizationTypes: [
                "RIGHTSIZING", "UNUSED_RESOURCE", "IDLE_RESOURCE",
                "RESERVED_INSTANCE", "SAVINGS_PLAN", "COMMITTED_USE",
                "STORAGE_TIERING", "SPOT_INSTANCE", "LICENSE_OPTIMIZATION",
                "NETWORK_OPTIMIZATION", "SCHEDULING", "MODERNIZATION",
              ],
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // FinOps Framework Reference
  server.resource(
    "cost://finops/framework",
    "cost://finops/framework",
    async () => ({
      contents: [
        {
          uri: "cost://finops/framework",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              name: "FinOps Framework",
              version: "1.0",
              domains: [
                {
                  name: "Inform",
                  description: "Visibility and allocation of cloud costs",
                  tools: [
                    "aws_get_cost_explorer_summary",
                    "azure_get_cost_analysis",
                    "gcp_get_billing_analysis",
                    "multicloud_cost_dashboard",
                    "multicloud_cost_allocation_report",
                    "gcp_get_label_coverage",
                  ],
                },
                {
                  name: "Optimize",
                  description: "Reduce waste and optimize resource usage",
                  tools: [
                    "aws_get_rightsizing_recommendations",
                    "aws_get_unused_resources",
                    "aws_get_ebs_optimization",
                    "aws_get_s3_cost_optimization",
                    "aws_get_lambda_cost_optimization",
                    "aws_get_rds_optimization",
                    "azure_get_advisor_cost_recommendations",
                    "azure_get_vm_rightsizing",
                    "azure_get_unused_resources",
                    "azure_get_storage_optimization",
                    "gcp_get_recommender_insights",
                    "gcp_get_vm_rightsizing",
                    "gcp_get_unused_resources",
                    "gcp_get_storage_optimization",
                    "gcp_get_bigquery_optimization",
                    "multicloud_optimization_recommendations",
                    "multicloud_unused_resources",
                  ],
                },
                {
                  name: "Operate",
                  description: "Commitment-based discounts and budgets",
                  tools: [
                    "aws_get_savings_plans_recommendations",
                    "aws_get_reserved_instance_recommendations",
                    "azure_get_reserved_instance_recommendations",
                    "azure_get_hybrid_benefit_opportunities",
                    "gcp_get_committed_use_recommendations",
                    "azure_get_budget_alerts",
                    "gcp_get_billing_budget_alerts",
                    "multicloud_budget_forecast",
                  ],
                },
              ],
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // Optimization Playbook
  server.resource(
    "cost://playbook/quick-wins",
    "cost://playbook/quick-wins",
    async () => ({
      contents: [
        {
          uri: "cost://playbook/quick-wins",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              name: "Quick Win Cost Optimization Playbook",
              description: "Prioritized list of low-effort, high-impact cost optimization actions",
              steps: [
                {
                  order: 1,
                  action: "Eliminate unused resources",
                  effort: "LOW",
                  impact: "HIGH",
                  tools: ["aws_get_unused_resources", "azure_get_unused_resources", "gcp_get_unused_resources"],
                },
                {
                  order: 2,
                  action: "Rightsize over-provisioned instances",
                  effort: "MEDIUM",
                  impact: "HIGH",
                  tools: ["aws_get_rightsizing_recommendations", "azure_get_vm_rightsizing", "gcp_get_vm_rightsizing"],
                },
                {
                  order: 3,
                  action: "Optimize storage tiers and lifecycle policies",
                  effort: "LOW",
                  impact: "MEDIUM",
                  tools: ["aws_get_s3_cost_optimization", "aws_get_ebs_optimization", "azure_get_storage_optimization", "gcp_get_storage_optimization"],
                },
                {
                  order: 4,
                  action: "Purchase commitment-based discounts",
                  effort: "LOW",
                  impact: "HIGH",
                  tools: ["aws_get_savings_plans_recommendations", "aws_get_reserved_instance_recommendations", "azure_get_reserved_instance_recommendations", "gcp_get_committed_use_recommendations"],
                },
                {
                  order: 5,
                  action: "Enable hybrid benefit and license optimization",
                  effort: "LOW",
                  impact: "MEDIUM",
                  tools: ["azure_get_hybrid_benefit_opportunities"],
                },
                {
                  order: 6,
                  action: "Optimize container clusters",
                  effort: "MEDIUM",
                  impact: "HIGH",
                  tools: ["azure_get_aks_optimization", "gcp_get_gke_optimization"],
                },
                {
                  order: 7,
                  action: "Implement tagging/labeling for cost allocation",
                  effort: "MEDIUM",
                  impact: "MEDIUM",
                  tools: ["gcp_get_label_coverage", "multicloud_cost_allocation_report"],
                },
              ],
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
