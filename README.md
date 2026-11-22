# multicloud-costopti-mcp

[![npm version](https://img.shields.io/npm/v/multicloud-costopti-mcp.svg)](https://www.npmjs.com/package/multicloud-costopti-mcp)
[![PyPI version](https://img.shields.io/pypi/v/multicloud-costopti-mcp.svg)](https://pypi.org/project/multicloud-costopti-mcp/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://python.org)

A production-ready **Model Context Protocol (MCP)** server providing unified cost optimization visibility across **AWS**, **Azure**, and **GCP**. Built for AI agents and Claude Desktop.

**43 cost optimization tools** | **3 MCP resources** | **3 cloud providers** | **1 unified interface**

---

## Features

- **43 cost optimization tools** spanning cost visibility, rightsizing, waste detection, commitment optimization, storage optimization, container optimization, database optimization, budget monitoring, and tag/label auditing
- **6 cross-cloud tools** for unified cost dashboards, prioritized optimization action plans, aggregated unused resource detection, budget forecasting, and cost allocation auditing
- **Normalized cost schema** that unifies cost data from all three clouds into a single `NormalizedCostItem`/`OptimizationRecommendation` format with priority scoring (0-100)
- **Built on the FinOps Framework**: Inform, Optimize, and Operate principles with normalized data types and cross-cloud aggregation
- **Resilient by design** with exponential backoff, jitter-based retry (100ms base, 5 retries), and 30-second SDK timeouts
- **Read-only operations**: no infrastructure modifications, safe for production use
- **Zod-validated inputs** on every tool call
- **Structured logging** via Winston with account ID masking
- **Programmatic API** for embedding the server in your own applications

---

## Architecture

![Multi-Cloud Cost Optimization MCP Server Architecture](https://raw.githubusercontent.com/skmahe1077/multicloud-costopti-mcp/main/docs/multicloud-costopti-mcp-architecture.svg)

### Design Patterns

| Pattern | Description |
|---------|-------------|
| **Server Factory** | `createServer(options?)` returns a fully-wired `McpServer`: configurable name, version, and enabled clouds |
| **Tool Registration** | Each tool file exports `register(server)`: validates input with Zod, calls cloud SDK, normalizes response |
| **Unified Types** | All tools return `ToolResponse<T>` with `NormalizedCostItem`, `OptimizationRecommendation`, or `UnusedResource` |
| **Priority Scoring** | `computePriorityScore()` ranks recommendations 0-100 by savings amount, percentage, effort, and type |
| **Retry Strategy** | Exponential backoff with jitter (100ms base, 5 retries, 10s max) on throttling/429 errors |
| **Connectivity Cache** | Cloud credential checks cached for 5 minutes (configurable via `CACHE_TTL_SECONDS`) |
| **Concurrency Control** | `p-limit(3)` for parallel cross-cloud queries |
| **Read-Only** | All tools are read-only, with no modifications to cloud resources |

---

## Install

### npm

```bash
# Run directly with npx (no install needed)
npx multicloud-costopti-mcp

# Or install globally
npm install -g multicloud-costopti-mcp

# Or add to a project
npm install multicloud-costopti-mcp
```

### pip

```bash
# pip
pip install multicloud-costopti-mcp

# uv
uv pip install multicloud-costopti-mcp

# uvx (no install needed)
uvx multicloud-costopti-mcp

# pipx (isolated global install)
pipx install multicloud-costopti-mcp
```

> **Note:** The Python package is a thin wrapper that delegates to the Node.js server at runtime. Node.js 18+ must be available on PATH.

---

## Quick Start

### Prerequisites

- **Node.js 18+**: [nodejs.org](https://nodejs.org)
- **Python 3.10+** (only if installing via pip)
- Cloud credentials configured for at least one provider (AWS, Azure, or GCP)

### Option 1: npx (recommended)

```bash
npx multicloud-costopti-mcp
```

### Option 2: Global install (npm)

```bash
npm install -g multicloud-costopti-mcp
multicloud-costopti-mcp
```

### Option 3: pip install

```bash
pip install multicloud-costopti-mcp
multicloud-costopti-mcp
```

### Option 4: From source

```bash
git clone https://github.com/skmahe1077/multicloud-costopti-mcp.git
cd multicloud-costopti-mcp
npm install
npm run build
npm start
```

### Development

```bash
npm run dev        # hot reload with tsx watch
npm test           # run tests
npm run typecheck  # type checking only
```

---

## MCP Client Configuration

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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
claude mcp add multicloud-costopti -- npx multicloud-costopti-mcp
```

Or manually add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
        "path": "npx",
        "args": ["multicloud-costopti-mcp"],
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
- **Command:** `npx`
- **Arguments:** `multicloud-costopti-mcp`
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
      "command": "npx",
      "args": ["multicloud-costopti-mcp"],
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
| **Zed** | `~/.config/zed/settings.json` | N/A | `~/.config/zed/settings.json` |
| **JetBrains** | `~/Library/Application Support/JetBrains/<IDE>/options/mcp.xml` | `%APPDATA%\JetBrains\<IDE>\options\mcp.xml` | `~/.config/JetBrains/<IDE>/options/mcp.xml` |
| **Amazon Q** | `~/.aws/amazonq/mcp.json` | `%USERPROFILE%\.aws\amazonq\mcp.json` | `~/.aws/amazonq/mcp.json` |
| **Cline** | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| **Roo Code** | `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json` | `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` |

---

## Cloud Authentication

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
- `Cost Management Reader`: for cost analysis and budgets
- `Reader`: for resource enumeration and metrics
- `Advisor Reader`: for Advisor recommendations (optional)

### GCP

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GCP_PROJECT_ID=your-project-id
export GCP_BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX
```

**Required roles:**
- `roles/billing.viewer`: billing analysis and budgets
- `roles/compute.viewer`: VM and disk enumeration
- `roles/recommender.viewer`: Recommender insights
- `roles/bigquery.user`: BigQuery billing export queries
- `roles/storage.objectViewer`: GCS bucket analysis
- `roles/container.clusterViewer`: GKE cluster analysis
- `roles/cloudasset.viewer`: label coverage audit
- `roles/cloudsql.viewer`: Cloud SQL analysis

---

## Programmatic Usage

Embed the MCP server in your own application:

```typescript
import { createServer } from "multicloud-costopti-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create with all clouds enabled (default)
const server = createServer();

// Or enable only specific clouds
const awsOnly = createServer({ clouds: ["aws"] });

// Connect to any MCP transport
await server.connect(new StdioServerTransport());
```

### Using types and utilities directly

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

## Tools Reference

### AWS Tools (13)

| Tool | Category | Description |
|------|----------|-------------|
| `aws_get_cost_explorer_summary` | Cost visibility | Cost breakdown by service, region, account, or usage type via Cost Explorer |
| `aws_get_rightsizing_recommendations` | Rightsizing | EC2 rightsizing and idle instance detection with projected savings |
| `aws_get_savings_plans_recommendations` | Commitment optimization | Savings Plans purchase recommendations (Compute, EC2, SageMaker) |
| `aws_get_reserved_instance_recommendations` | Commitment optimization | RI recommendations for EC2, RDS, ElastiCache, OpenSearch, Redshift |
| `aws_get_unused_resources` | Waste detection | Unattached EBS volumes, unused Elastic IPs, idle NAT Gateways, idle ALBs |
| `aws_get_s3_cost_optimization` | Storage optimization | S3 buckets missing lifecycle policies, Intelligent-Tiering opportunities |
| `aws_get_lambda_cost_optimization` | Rightsizing | Lambda memory rightsizing, unused function detection |
| `aws_get_rds_optimization` | Database optimization | Idle and over-provisioned RDS instances based on CPU and connection metrics |
| `aws_get_ebs_optimization` | Storage optimization | gp2-to-gp3 migration, underutilized io1/io2 IOPS analysis |
| `aws_get_compute_optimizer_recommendations` | Rightsizing | AWS Compute Optimizer for EC2, Lambda, EBS, and Auto Scaling |
| `aws_get_trusted_advisor_cost_checks` | Cost visibility | Trusted Advisor cost optimization checks (requires Business/Enterprise Support) |
| `aws_get_cost_anomalies` | Budget monitoring | Cost Anomaly Detection with root cause analysis |
| `aws_get_data_transfer_costs` | Cost visibility | Data transfer analysis: inter-AZ, internet egress, inter-region |

### Azure Tools (12)

| Tool | Category | Description |
|------|----------|-------------|
| `azure_get_cost_analysis` | Cost visibility | Cost breakdown by service, resource group, or location via Cost Management API |
| `azure_get_advisor_cost_recommendations` | Cost visibility | Azure Advisor cost recommendations (rightsizing, RIs, unused resources) |
| `azure_get_vm_rightsizing` | Rightsizing | VM rightsizing based on CPU utilization metrics |
| `azure_get_unused_resources` | Waste detection | Unattached managed disks, deallocated VMs, unassociated public IPs |
| `azure_get_storage_optimization` | Storage optimization | Storage tier analysis, redundancy downgrades (GRS to LRS), V1-to-V2 upgrades |
| `azure_get_sql_optimization` | Database optimization | SQL Database DTU/vCore optimization, serverless migration candidates |
| `azure_get_aks_optimization` | Container optimization | AKS autoscaler configuration, spot node pool opportunities |
| `azure_get_reserved_instance_recommendations` | Commitment optimization | Azure RI purchase recommendations via Consumption API |
| `azure_get_app_service_optimization` | Rightsizing | Empty App Service Plans, Premium-to-Standard downgrades |
| `azure_get_cosmosdb_optimization` | Database optimization | Cosmos DB RU autoscale, multi-region review, serverless candidates |
| `azure_get_hybrid_benefit_opportunities` | Commitment optimization | Windows Server VMs not using Azure Hybrid Benefit (AHUB) |
| `azure_get_budget_alerts` | Budget monitoring | Budget status, spend vs. budget, and forecast overspend alerts |

### GCP Tools (12)

| Tool | Category | Description |
|------|----------|-------------|
| `gcp_get_billing_analysis` | Cost visibility | Billing data analysis via BigQuery billing export |
| `gcp_get_recommender_insights` | Cost visibility | GCP Recommender cost insights (compute, disk, SQL, address) |
| `gcp_get_vm_rightsizing` | Rightsizing | Compute Engine rightsizing, stopped VM disk costs, custom machine type opportunities |
| `gcp_get_committed_use_recommendations` | Commitment optimization | Committed Use Discount (CUD) recommendations for Compute and Cloud SQL |
| `gcp_get_unused_resources` | Waste detection | Unattached persistent disks, unused static external IPs |
| `gcp_get_storage_optimization` | Storage optimization | GCS lifecycle policy gaps, Autoclass enablement, storage class analysis |
| `gcp_get_bigquery_optimization` | Database optimization | Expensive query detection, unpartitioned table identification |
| `gcp_get_gke_optimization` | Container optimization | GKE autoscaler configuration, spot VM pools, Autopilot migration |
| `gcp_get_cloudsql_optimization` | Database optimization | Cloud SQL HA review, instance rightsizing |
| `gcp_get_network_cost_optimization` | Cost visibility | Network egress and inter-region transfer costs via billing export |
| `gcp_get_label_coverage` | Tag/label auditing | Resource labeling audit against required labels for cost allocation |
| `gcp_get_billing_budget_alerts` | Budget monitoring | Billing budget status and threshold alerts |

### Cross-Cloud Tools (5)

| Tool | Description |
|------|-------------|
| `multicloud_cost_dashboard` | Unified cost dashboard aggregating spend by cloud and category |
| `multicloud_optimization_recommendations` | Prioritized optimization action plan across all clouds |
| `multicloud_unused_resources` | Aggregated unused/idle resource detection across clouds |
| `multicloud_budget_forecast` | Cross-cloud budget vs. actual with forecast alerts |
| `multicloud_cost_allocation_report` | Tag/label coverage audit for cost allocation |

### Utility

| Tool | Description |
|------|-------------|
| `validate_cloud_connectivity` | Health check for all configured cloud provider connections (cached 5 min) |

---

## MCP Resources

| URI | Description |
|-----|-------------|
| `cost://summary/schema` | Schema reference for `NormalizedCostItem` and `OptimizationRecommendation` types |
| `cost://finops/framework` | FinOps Framework reference with Inform/Optimize/Operate domain mapping to tools |
| `cost://playbook/quick-wins` | Prioritized quick-win playbook: eliminate waste, rightsize, optimize storage, buy commitments |

---

## Example Prompts

| Prompt | Tools Used |
|--------|-----------|
| *"Show me my AWS cost breakdown for the last 30 days"* | `aws_get_cost_explorer_summary` |
| *"Find all unused resources across my AWS and Azure accounts"* | `multicloud_unused_resources` |
| *"What are my top rightsizing opportunities for EC2 instances?"* | `aws_get_rightsizing_recommendations` |
| *"Check if any of my S3 buckets are missing lifecycle policies"* | `aws_get_s3_cost_optimization` |
| *"Analyze my GKE clusters for cost optimization opportunities"* | `gcp_get_gke_optimization` |
| *"Should I purchase Savings Plans or Reserved Instances for my EC2 workloads?"* | `aws_get_savings_plans_recommendations`, `aws_get_reserved_instance_recommendations` |
| *"How many of my Azure VMs are missing Azure Hybrid Benefit?"* | `azure_get_hybrid_benefit_opportunities` |
| *"Find BigQuery tables that should be partitioned to reduce scan costs"* | `gcp_get_bigquery_optimization` |
| *"Give me a full FinOps health check across all my cloud accounts"* | `multicloud_cost_dashboard`, `multicloud_optimization_recommendations` |

---

## Security

| Feature | Detail |
|---------|--------|
| Read-only | All tools perform read-only operations, no infrastructure changes |
| Input validation | Every tool input validated with Zod schemas before SDK calls |
| Credential safety | Credentials are never logged or included in tool responses |
| Account ID masking | Account IDs masked in logs when `LOG_MASK_ACCOUNT_IDS=true` |
| Request tracing | Every invocation generates a UUID `requestId` for end-to-end tracing |
| SDK timeouts | All cloud SDK calls timeout after 30 seconds |
| Retry with backoff | Exponential backoff with jitter (100ms base, max 5 retries) for throttling |

---

## Configuration

All configuration is via environment variables.

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |
| `LOG_MASK_ACCOUNT_IDS` | Mask cloud account IDs in logs | `true` |
| `CACHE_TTL_SECONDS` | Cache TTL for connectivity checks | `300` |
| `MCP_SERVER_NAME` | Server name reported to MCP clients | `multicloud-costopti-mcp` |
| `MCP_SERVER_VERSION` | Server version reported to MCP clients | `1.0.0` |

---

## Testing

```bash
npm test              # run all tests (35 tests across 3 suites)
npm run test:watch    # watch mode
npm run typecheck     # type checking only
```

---

## Publishing

### npm

```bash
npm login
npm pack --dry-run    # preview what will be published
npm publish           # runs clean → build → test automatically
```

### PyPI

```bash
cd python
pip install --upgrade build twine
python -m build
twine upload dist/*
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run `npm test && npm run typecheck` to verify
5. Commit and push your branch
6. Open a pull request

---

## Related Projects

- [multicloud-security-mcp](https://github.com/skmahe1077/multicloud-security-mcp): Multi-cloud security MCP server with 47 security tools across AWS, Azure, and GCP

---

## License

[MIT](LICENSE)
