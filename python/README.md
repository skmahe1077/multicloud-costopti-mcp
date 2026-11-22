# multicloud-costopti-mcp

[![PyPI version](https://img.shields.io/pypi/v/multicloud-costopti-mcp.svg)](https://pypi.org/project/multicloud-costopti-mcp/)
[![npm version](https://img.shields.io/npm/v/multicloud-costopti-mcp.svg)](https://www.npmjs.com/package/multicloud-costopti-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-ready **Model Context Protocol (MCP)** server providing unified cost optimization visibility across **AWS**, **Azure**, and **GCP**. Designed for AI agents and Claude Desktop.

**43 cost optimization tools** spanning cost visibility, rightsizing, waste detection, reserved capacity planning, and savings recommendations — all exposed through a single MCP server, built on the FinOps Framework's Inform/Optimize/Operate principles.

## Install

```bash
# pip
pip install multicloud-costopti-mcp

# uv
uv pip install multicloud-costopti-mcp

# pipx (isolated global install)
pipx install multicloud-costopti-mcp
```

> **Prerequisite:** Node.js 18+ must be available on PATH. Install from [nodejs.org](https://nodejs.org) if needed.

## Quick Start

```bash
# Run the MCP server
multicloud-costopti-mcp

# Or via python module
python -m multicloud_costopti_mcp
```

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

### Using pip installation

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "multicloud-costopti-mcp",
      "env": {
        "AWS_PROFILE": "cost-reader",
        "AZURE_CLIENT_ID": "your-app-id",
        "AZURE_CLIENT_SECRET": "your-secret",
        "AZURE_TENANT_ID": "your-tenant",
        "AZURE_SUBSCRIPTION_ID": "your-sub",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/sa.json",
        "GCP_PROJECT_ID": "your-project"
      }
    }
  }
}
```

### Using uvx (no install needed)

```json
{
  "mcpServers": {
    "multicloud-costopti": {
      "command": "uvx",
      "args": ["multicloud-costopti-mcp"],
      "env": {
        "AWS_PROFILE": "cost-reader"
      }
    }
  }
}
```

## What's Included

### AWS (13 tools)
Cost Explorer, Rightsizing, Savings Plans, Reserved Instances, Unused Resources, S3 Optimization, Lambda Optimization, RDS Optimization, EBS Optimization, Compute Optimizer, Trusted Advisor, Cost Anomalies, Data Transfer

### Azure (12 tools)
Cost Analysis, Advisor Recommendations, VM Rightsizing, Unused Resources, Storage Optimization, SQL Optimization, AKS Optimization, Reserved Instances, App Service Optimization, Cosmos DB Optimization, Hybrid Benefit, Budget Alerts

### GCP (12 tools)
Billing Analysis, Recommender Insights, VM Rightsizing, Committed Use Discounts, Unused Resources, Storage Optimization, BigQuery Optimization, GKE Optimization, Cloud SQL Optimization, Network Cost Optimization, Label Coverage, Billing Budget Alerts

### Cross-Cloud (6 tools)
Cost Dashboard, Optimization Recommendations, Unused Resources, Budget Forecast, Cost Allocation / Tag Audit, Connectivity Validation

## Cloud Authentication

Set environment variables for each cloud you want to use:

```bash
# AWS
export AWS_PROFILE=cost-reader
export AWS_DEFAULT_REGION=us-east-1

# Azure
export AZURE_CLIENT_ID=...
export AZURE_CLIENT_SECRET=...
export AZURE_TENANT_ID=...
export AZURE_SUBSCRIPTION_ID=...

# GCP
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GCP_PROJECT_ID=your-project-id
export GCP_BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX
```

## Example Prompts

- *"Show me my AWS cost breakdown for the last 30 days"*
- *"Find all unused resources across my AWS and Azure accounts"*
- *"What are my top rightsizing opportunities for EC2 instances?"*
- *"Should I purchase Savings Plans or Reserved Instances for my EC2 workloads?"*
- *"Give me a full FinOps health check across all my cloud accounts"*

## Also Available via npm

```bash
npx multicloud-costopti-mcp
# or
npm install -g multicloud-costopti-mcp
```

## License

MIT
