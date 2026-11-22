# multicloud-costopti-mcp

> Multi-cloud cost optimization MCP server for AWS, Azure, and GCP — unified FinOps visibility, rightsizing, waste detection, and savings recommendations for AI-powered IDEs and agents.

[![npm version](https://img.shields.io/npm/v/multicloud-costopti-mcp.svg)](https://www.npmjs.com/package/multicloud-costopti-mcp)
[![PyPI version](https://img.shields.io/pypi/v/multicloud-costopti-mcp.svg)](https://pypi.org/project/multicloud-costopti-mcp/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.12-green)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

A production-grade **Model Context Protocol (MCP) server** that provides **43 cost optimization tools**, **3 MCP resources**, and **4 shared utility modules** — giving AI agents and Claude Desktop unified, read-only visibility into cloud spending across AWS, Azure, and GCP.

Built on the [FinOps Framework](https://www.finops.org/framework/) principles of **Inform**, **Optimize**, and **Operate**, this server enables AI-driven cloud cost management with normalized data types, priority-scored recommendations, and cross-cloud aggregation.

### Key Capabilities

- **Cost Visibility** — Unified cost breakdowns by service, category, region, and account across all three clouds
- **Rightsizing** — EC2, Azure VM, and GCE instance rightsizing based on CPU/memory utilization metrics
- **Waste Detection** — Automated discovery of unused EBS volumes, unattached disks, idle load balancers, orphaned IPs, and stopped VMs
- **Commitment Optimization** — Savings Plans, Reserved Instance, and Committed Use Discount (CUD) purchase recommendations
- **Storage Optimization** — S3 lifecycle policies, gp2-to-gp3 migration, Azure storage tier analysis, GCS Autoclass enablement
- **Container Optimization** — AKS and GKE autoscaler configuration, spot/preemptible node opportunities, Autopilot migration
- **Database Optimization** — RDS/Cloud SQL/Azure SQL idle detection, rightsizing, and serverless migration candidates
- **Budget Monitoring** — Cross-cloud budget status, forecasted overspend alerts, and anomaly detection
- **Tag/Label Auditing** — Resource tagging coverage analysis for proper cost allocation

---

## Tool Inventory

### Cross-Cloud Tools (6)

| Tool | Description |
|------|-------------|
| `validate_cloud_connectivity` | Test connectivity to AWS, Azure, GCP with 5-minute cached results |
| `multicloud_cost_dashboard` | Unified cost dashboard aggregating spend by cloud and category |
| `multicloud_optimization_recommendations` | Prioritized optimization action plan across all clouds |
| `multicloud_unused_resources` | Aggregated unused/idle resource detection across clouds |
| `multicloud_budget_forecast` | Cross-cloud budget vs. actual with forecast alerts |
| `multicloud_cost_allocation_report` | Tag/label coverage audit for cost allocation |

### AWS Tools (13)

| Tool | Description |
|------|-------------|
| `aws_get_cost_explorer_summary` | Cost breakdown by service, region, account, or usage type via Cost Explorer |
| `aws_get_rightsizing_recommendations` | EC2 rightsizing and idle instance detection with projected savings |
| `aws_get_savings_plans_recommendations` | Savings Plans purchase recommendations (Compute, EC2, SageMaker) |
| `aws_get_reserved_instance_recommendations` | RI recommendations for EC2, RDS, ElastiCache, OpenSearch, Redshift |
| `aws_get_unused_resources` | Unattached EBS volumes, unused Elastic IPs, idle NAT Gateways, idle ALBs |
| `aws_get_s3_cost_optimization` | S3 buckets missing lifecycle policies, Intelligent-Tiering opportunities |
| `aws_get_lambda_cost_optimization` | Lambda memory rightsizing, unused function detection |
| `aws_get_rds_optimization` | Idle and over-provisioned RDS instances based on CPU and connection metrics |
| `aws_get_ebs_optimization` | gp2-to-gp3 migration, underutilized io1/io2 IOPS analysis |
| `aws_get_compute_optimizer_recommendations` | AWS Compute Optimizer for EC2, Lambda, EBS, and Auto Scaling |
| `aws_get_trusted_advisor_cost_checks` | Trusted Advisor cost optimization checks (requires Business/Enterprise Support) |
| `aws_get_cost_anomalies` | Cost Anomaly Detection with root cause analysis |
| `aws_get_data_transfer_costs` | Data transfer analysis: inter-AZ, internet egress, inter-region |

### Azure Tools (12)

| Tool | Description |
|------|-------------|
| `azure_get_cost_analysis` | Cost breakdown by service, resource group, or location via Cost Management API |
| `azure_get_advisor_cost_recommendations` | Azure Advisor cost recommendations (rightsizing, RIs, unused resources) |
| `azure_get_vm_rightsizing` | VM rightsizing based on CPU utilization metrics |
| `azure_get_unused_resources` | Unattached managed disks, deallocated VMs, unassociated public IPs |
| `azure_get_storage_optimization` | Storage tier analysis, redundancy downgrades (GRS to LRS), V1-to-V2 upgrades |
| `azure_get_sql_optimization` | SQL Database DTU/vCore optimization, serverless migration candidates |
| `azure_get_aks_optimization` | AKS autoscaler configuration, spot node pool opportunities |
| `azure_get_reserved_instance_recommendations` | Azure RI purchase recommendations via Consumption API |
| `azure_get_app_service_optimization` | Empty App Service Plans, Premium-to-Standard downgrades |
| `azure_get_cosmosdb_optimization` | Cosmos DB RU autoscale, multi-region review, serverless candidates |
| `azure_get_hybrid_benefit_opportunities` | Windows Server VMs not using Azure Hybrid Benefit (AHUB) |
| `azure_get_budget_alerts` | Budget status, spend vs. budget, and forecast overspend alerts |

### GCP Tools (12)

| Tool | Description |
|------|-------------|
| `gcp_get_billing_analysis` | Billing data analysis via BigQuery billing export |
| `gcp_get_recommender_insights` | GCP Recommender cost insights (compute, disk, SQL, address) |
| `gcp_get_vm_rightsizing` | Compute Engine rightsizing, stopped VM disk costs, custom machine type opportunities |
| `gcp_get_committed_use_recommendations` | Committed Use Discount (CUD) recommendations for Compute and Cloud SQL |
| `gcp_get_unused_resources` | Unattached persistent disks, unused static external IPs |
| `gcp_get_storage_optimization` | GCS lifecycle policy gaps, Autoclass enablement, storage class analysis |
| `gcp_get_bigquery_optimization` | Expensive query detection, unpartitioned table identification |
| `gcp_get_gke_optimization` | GKE autoscaler configuration, spot VM pools, Autopilot migration |
| `gcp_get_cloudsql_optimization` | Cloud SQL HA review, instance rightsizing |
| `gcp_get_network_cost_optimization` | Network egress and inter-region transfer costs via billing export |
| `gcp_get_label_coverage` | Resource labeling audit against required labels for cost allocation |
| `gcp_get_billing_budget_alerts` | Billing budget status and threshold alerts |

### MCP Resources (3)

| Resource URI | Description |
|-------------|-------------|
| `cost://summary/schema` | Schema reference for `NormalizedCostItem` and `OptimizationRecommendation` types |
| `cost://finops/framework` | FinOps Framework reference with Inform/Optimize/Operate domain mapping to tools |
| `cost://playbook/quick-wins` | Prioritized quick-win playbook: eliminate waste, rightsize, optimize storage, buy commitments |

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Cloud credentials configured for at least one provider (AWS, Azure, or GCP)

### Install and Build

```bash
git clone https://github.com/devopstronaut/multicloud-costopti-mcp.git
cd multicloud-costopti-mcp
npm install
npm run build
```

### Run

```bash
# Development with hot reload
npm run dev

# Production
npm start
```

### MCP Client Configuration

<details>
<summary><strong>Claude Desktop</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Code/User/settings.json` |
| Windows | `%APPDATA%\Code\User\settings.json` |
| Linux | `~/.config/Code/User/settings.json` |

Add to your `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

Or add to your **workspace** `.vscode/settings.json` for project-scoped configuration.

You can also use the `.vscode/mcp.json` file in your workspace root:

```json
{
  "servers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Code (CLI)</strong></summary>

**Config file path:**

| Scope | Path |
|-------|------|
| Global | `~/.claude.json` |
| Project | `.claude/settings.json` (in project root) |

Add via CLI:

```bash
claude mcp add multicloud-costopti -- node /absolute/path/to/multicloud-costopti-mcp/dist/index.js
```

Or manually add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/.cursor/mcp.json` |
| Windows | `%USERPROFILE%\.cursor\mcp.json` |
| Linux | `~/.cursor/mcp.json` |

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf (Codeium)</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/.codeium/windsurf/mcp_config.json` |
| Windows | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |
| Linux | `~/.codeium/windsurf/mcp_config.json` |

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Zed</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/.config/zed/settings.json` |
| Linux | `~/.config/zed/settings.json` |

Add to your `settings.json`:

```json
{
  "context_servers": {
    "multicloud-costopti": {
      "command": {
        "path": "node",
        "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
        "env": {
          "AWS_PROFILE": "cost-reader",
          "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
          "AZURE_TENANT_ID": "your-tenant-id",
          "GCP_PROJECT_ID": "your-project-id",
          "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
        }
      }
    }
  }
}
```

</details>

<details>
<summary><strong>JetBrains IDEs (IntelliJ, WebStorm, PyCharm, etc.)</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/JetBrains/<IDE><version>/options/mcp.xml` |
| Windows | `%APPDATA%\JetBrains\<IDE><version>\options\mcp.xml` |
| Linux | `~/.config/JetBrains/<IDE><version>/options/mcp.xml` |

> Replace `<IDE><version>` with your IDE name and version, e.g., `IntelliJIdea2025.1`, `WebStorm2025.1`.

Or configure via **Settings > Tools > AI Assistant > MCP Servers**, then add:

- **Name:** `multicloud-costopti`
- **Command:** `node`
- **Arguments:** `/absolute/path/to/multicloud-costopti-mcp/dist/index.js`
- **Environment Variables:** `AWS_PROFILE=cost-reader`, `AZURE_SUBSCRIPTION_ID=your-subscription-id`, etc.

</details>

<details>
<summary><strong>Amazon Q Developer CLI</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/.aws/amazonq/mcp.json` |
| Windows | `%USERPROFILE%\.aws\amazonq\mcp.json` |
| Linux | `~/.aws/amazonq/mcp.json` |

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cline (VS Code Extension)</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Windows | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` |
| Linux | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

Or configure via: **Cline sidebar > MCP Servers > Configure** in VS Code.

</details>

<details>
<summary><strong>Roo Code (VS Code Extension)</strong></summary>

**Config file path:**

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` |
| Windows | `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json` |
| Linux | `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` |

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "node",
      "args": ["/absolute/path/to/multicloud-costopti-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id",
        "AZURE_TENANT_ID": "your-tenant-id",
        "GCP_PROJECT_ID": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

</details>

### Config Path Quick Reference

| MCP Client | macOS | Windows | Linux |
|------------|-------|---------|-------|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` | `~/.config/claude_desktop_config.json` |
| **VS Code (Copilot)** | `~/Library/Application Support/Code/User/settings.json` | `%APPDATA%\Code\User\settings.json` | `~/.config/Code/User/settings.json` |
| **VS Code (Workspace)** | `.vscode/mcp.json` | `.vscode/mcp.json` | `.vscode/mcp.json` |
| **Claude Code** | `~/.claude.json` | `~/.claude.json` | `~/.claude.json` |
| **Cursor** | `~/.cursor/mcp.json` | `%USERPROFILE%\.cursor\mcp.json` | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |
| **Zed** | `~/.config/zed/settings.json` | — | `~/.config/zed/settings.json` |
| **JetBrains** | `~/Library/Application Support/JetBrains/<IDE>/options/mcp.xml` | `%APPDATA%\JetBrains\<IDE>\options\mcp.xml` | `~/.config/JetBrains/<IDE>/options/mcp.xml` |
| **Amazon Q** | `~/.aws/amazonq/mcp.json` | `%USERPROFILE%\.aws\amazonq\mcp.json` | `~/.aws/amazonq/mcp.json` |
| **Cline** | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| **Roo Code** | `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json` | `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` |

---

## Architecture

![Multi-Cloud Cost Optimization MCP Server Architecture](https://raw.githubusercontent.com/skmahe1077/multicloud-costopti-mcp/main/docs/multicloud-costopti-mcp-architecture.svg)

```
src/
├── index.ts                              # CLI entry point (stdio transport)
├── server.ts                             # MCP server factory + 6 cross-cloud tools
├── lib.ts                                # Public API exports for programmatic usage
├── logger.ts                             # Winston logger with account ID masking
├── types/
│   └── cost.ts                          # Core types: NormalizedCostItem, OptimizationRecommendation,
│                                        #   UnusedResource, BudgetStatus, CostTrend, TagCoverage, etc.
├── resources/
│   └── finops-frameworks.ts             # 3 MCP resources: schema, FinOps framework, playbook
└── tools/
    ├── aws/                             # 13 AWS cost optimization tools
    │   ├── cost-explorer.ts             #   Cost breakdown by service/region/account
    │   ├── rightsizing.ts               #   EC2 rightsizing recommendations
    │   ├── savings-plans.ts             #   Savings Plans purchase recommendations
    │   ├── reserved-instances.ts        #   RI purchase recommendations
    │   ├── unused-resources.ts          #   Unattached EBS, unused EIPs, idle NAT GWs, idle ALBs
    │   ├── s3-optimization.ts           #   S3 lifecycle & Intelligent-Tiering
    │   ├── lambda-optimization.ts       #   Lambda memory rightsizing & unused functions
    │   ├── rds-optimization.ts          #   RDS idle/over-provisioned instances
    │   ├── ebs-optimization.ts          #   gp2→gp3 migration, io1/io2 rightsizing
    │   ├── compute-optimizer.ts         #   AWS Compute Optimizer (EC2, Lambda, EBS, ASG)
    │   ├── trusted-advisor.ts           #   Trusted Advisor cost checks
    │   ├── cost-anomalies.ts            #   Cost Anomaly Detection
    │   └── data-transfer.ts             #   Data transfer cost analysis
    ├── azure/                           # 12 Azure cost optimization tools
    │   ├── cost-analysis.ts             #   Cost Management API breakdown
    │   ├── advisor-recommendations.ts   #   Azure Advisor cost recommendations
    │   ├── vm-rightsizing.ts            #   VM CPU utilization analysis
    │   ├── unused-resources.ts          #   Unattached disks, deallocated VMs
    │   ├── storage-optimization.ts      #   Storage tier & redundancy optimization
    │   ├── sql-optimization.ts          #   SQL DTU/vCore & serverless optimization
    │   ├── aks-optimization.ts          #   AKS autoscaler & spot node analysis
    │   ├── reserved-instances.ts        #   Azure RI recommendations
    │   ├── app-service-optimization.ts  #   Empty/over-provisioned App Service Plans
    │   ├── cosmosdb-optimization.ts     #   Cosmos DB RU & region optimization
    │   ├── hybrid-benefit.ts            #   Azure Hybrid Benefit (AHUB) opportunities
    │   └── budget-alerts.ts             #   Budget status & alerts
    ├── gcp/                             # 12 GCP cost optimization tools
    │   ├── billing-analysis.ts          #   BigQuery billing export analysis
    │   ├── recommender.ts               #   GCP Recommender cost insights
    │   ├── vm-rightsizing.ts            #   Compute Engine rightsizing
    │   ├── committed-use.ts             #   CUD recommendations
    │   ├── unused-resources.ts          #   Unattached disks, unused static IPs
    │   ├── storage-optimization.ts      #   GCS lifecycle & Autoclass
    │   ├── bigquery-optimization.ts     #   Expensive queries & partitioning
    │   ├── gke-optimization.ts          #   GKE autoscaler & spot nodes
    │   ├── cloudsql-optimization.ts     #   Cloud SQL HA & rightsizing
    │   ├── network-optimization.ts      #   Egress & inter-region costs
    │   ├── label-coverage.ts            #   Resource labeling audit
    │   └── budget-alerts.ts             #   Billing budget alerts
    └── shared/                          # 4 shared utility modules
        ├── cost-normalizer.ts           #   Normalize cost data across clouds
        ├── savings-calculator.ts        #   Priority scoring (0-100) & savings aggregation
        ├── cost-trend-analyzer.ts       #   Trend detection & anomaly analysis
        └── tag-analyzer.ts              #   Tag/label coverage analysis
```

### Design Patterns

| Pattern | Description |
|---------|-------------|
| **Server Factory** | `createServer(options?)` returns a fully-wired `McpServer` — configurable name, version, and enabled clouds |
| **Tool Registration** | Each tool file exports `register(server)` — validates input with Zod, calls cloud SDK, normalizes response |
| **Unified Types** | All tools return `ToolResponse<T>` with `NormalizedCostItem`, `OptimizationRecommendation`, or `UnusedResource` |
| **Priority Scoring** | `computePriorityScore()` ranks recommendations 0-100 by savings amount, percentage, effort, and type |
| **Retry Strategy** | Exponential backoff with jitter (100ms base, 5 retries, 10s max) on throttling/429 errors |
| **Connectivity Cache** | Cloud credential checks cached for 5 minutes (configurable via `CACHE_TTL_SECONDS`) |
| **Concurrency Control** | `p-limit(3)` for parallel cross-cloud queries |
| **Read-Only** | All tools are read-only — no modifications to cloud resources |

---

## Cloud Credentials

### AWS

```bash
# Option 1: Named profile (recommended)
export AWS_PROFILE=cost-reader

# Option 2: Access keys
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1

# Option 3: SSO / assumed role
# Configure via ~/.aws/config
```

**Required IAM permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetRightsizingRecommendation",
        "ce:GetSavingsPlansPurchaseRecommendation",
        "ce:GetReservationPurchaseRecommendation",
        "ce:GetAnomalies",
        "ec2:DescribeVolumes",
        "ec2:DescribeAddresses",
        "ec2:DescribeNatGateways",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLifecycleConfiguration",
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "rds:DescribeDBInstances",
        "cloudwatch:GetMetricStatistics",
        "compute-optimizer:GetEC2InstanceRecommendations",
        "compute-optimizer:GetLambdaFunctionRecommendations",
        "compute-optimizer:GetEBSVolumeRecommendations",
        "support:DescribeTrustedAdvisorChecks",
        "support:DescribeTrustedAdvisorCheckResult",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

### Azure

```bash
export AZURE_CLIENT_ID=...
export AZURE_CLIENT_SECRET=...
export AZURE_TENANT_ID=...
export AZURE_SUBSCRIPTION_ID=...
```

**Required roles:**
- `Cost Management Reader` — for cost analysis and budgets
- `Reader` — for resource enumeration and metrics
- `Advisor Reader` — for Advisor recommendations (optional)

### GCP

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GCP_PROJECT_ID=your-project-id
export GCP_BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX
```

**Required roles:**
- `roles/billing.viewer` — billing analysis and budgets
- `roles/compute.viewer` — VM and disk enumeration
- `roles/recommender.viewer` — Recommender insights
- `roles/bigquery.user` — BigQuery billing export queries
- `roles/storage.objectViewer` — GCS bucket analysis
- `roles/container.clusterViewer` — GKE cluster analysis
- `roles/cloudasset.viewer` — label coverage audit
- `roles/cloudsql.viewer` — Cloud SQL analysis

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_PROFILE` | — | AWS named profile |
| `AWS_DEFAULT_REGION` | `us-east-1` | Default AWS region |
| `AZURE_SUBSCRIPTION_ID` | — | Azure subscription to analyze |
| `GCP_PROJECT_ID` | — | GCP project to analyze |
| `GCP_BILLING_ACCOUNT_ID` | — | GCP billing account for budget tools |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_MASK_ACCOUNT_IDS` | `true` | Mask 12-digit account IDs in logs |
| `CACHE_TTL_SECONDS` | `300` | Connectivity cache TTL (seconds) |

---

## Testing

```bash
# Run all 35 tests
npm test

# Watch mode
npm run test:watch

# Type checking only
npm run typecheck
```

**Test suites:**
- `tests/savings-calculator.test.ts` — Priority scoring, impact computation, savings aggregation (12 tests)
- `tests/cost-trend-analyzer.test.ts` — Trend detection, anomaly detection, percent change (15 tests)
- `tests/tag-analyzer.test.ts` — Tag coverage analysis, cross-cloud merging (8 tests)

---

## Programmatic Usage

```typescript
import {
  createServer,
  computePriorityScore,
  aggregateSavings,
  analyzeTrend,
  analyzeTagCoverage,
} from "multicloud-costopti-mcp";

// Create server with specific clouds enabled
const server = createServer({
  name: "my-finops-server",
  version: "1.0.0",
  clouds: ["aws", "azure"],
});

// Use shared utilities independently
const score = computePriorityScore({
  estimatedMonthlySavings: 500,
  savingsPercentage: 40,
  effort: "LOW",
  type: "UNUSED_RESOURCE",
});
// => 75 (high priority: good savings, low effort, quick-win type)

// Analyze cost trends
const trend = analyzeTrend([
  { date: new Date("2024-01-01"), amount: 100, currency: "USD" },
  { date: new Date("2024-02-01"), amount: 150, currency: "USD" },
  { date: new Date("2024-03-01"), amount: 200, currency: "USD" },
]);
// => "INCREASING"
```

---

## Example Prompts for Claude

Once configured in Claude Desktop, try these prompts:

```
"Show me my AWS cost breakdown for the last 30 days"

"Find all unused resources across my AWS and Azure accounts"

"What are my top rightsizing opportunities for EC2 instances?"

"Check if any of my S3 buckets are missing lifecycle policies"

"Analyze my GKE clusters for cost optimization opportunities"

"Should I purchase Savings Plans or Reserved Instances for my EC2 workloads?"

"How many of my Azure VMs are missing Azure Hybrid Benefit?"

"Find BigQuery tables that should be partitioned to reduce scan costs"

"Give me a full FinOps health check across all my cloud accounts"
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`node dist/index.js`) |
| `npm run dev` | Development mode with hot reload (`tsx watch`) |
| `npm test` | Run test suite (`vitest run`) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type check without emitting (`tsc --noEmit`) |
| `npm run lint` | Lint source files |
| `npm run clean` | Remove `dist/` directory |

---

## Related Projects

- [multicloud-security-mcp](https://github.com/devopstronaut/multicloud-security-mcp) — Multi-cloud security MCP server with 46 security tools across AWS, Azure, and GCP

---

## License

MIT
