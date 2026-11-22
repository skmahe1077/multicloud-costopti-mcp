import { v4 as uuid } from "uuid";
import {
  type NormalizedCostItem,
  type CostCategory,
  type CloudProvider,
} from "../../types/cost.js";

// AWS Cost Explorer → NormalizedCostItem

export function normalizeAwsCostItem(
  result: Record<string, unknown>,
  groupKey: string,
  periodStart: string,
  periodEnd: string,
): NormalizedCostItem {
  const metrics = (result as Record<string, unknown>)?.Metrics as Record<string, Record<string, string>> | undefined;
  const amount = parseFloat(
    metrics?.BlendedCost?.Amount ?? "0",
  );
  const currency =
    metrics?.BlendedCost?.Unit ?? "USD";
  const service = groupKey || "Unknown";

  return {
    id: uuid(),
    cloud: "aws",
    service,
    category: mapAwsServiceToCategory(service),
    resourceId: service,
    resourceName: service,
    region: process.env.AWS_DEFAULT_REGION,
    accountId: process.env.AWS_ACCOUNT_ID,
    currentMonthlyCost: amount,
    previousMonthlyCost: 0,
    costChange: 0,
    currency,
    tags: {},
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    rawData: result,
  };
}

// Azure Cost → NormalizedCostItem

export function normalizeAzureCostItem(
  row: unknown[],
  columns: Array<{ name: string }>,
): NormalizedCostItem {
  const getCol = (name: string): unknown => {
    const idx = columns.findIndex(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    return idx >= 0 ? row[idx] : undefined;
  };

  const cost = Number(getCol("Cost") ?? getCol("PreTaxCost") ?? 0);
  const service = String(getCol("ServiceName") ?? getCol("MeterCategory") ?? "Unknown");
  const currency = String(getCol("Currency") ?? "USD");

  return {
    id: uuid(),
    cloud: "azure",
    service,
    category: mapAzureServiceToCategory(service),
    resourceId: String(getCol("ResourceId") ?? service),
    resourceName: String(getCol("ResourceGroupName") ?? service),
    region: String(getCol("ResourceLocation") ?? ""),
    accountId: process.env.AZURE_SUBSCRIPTION_ID,
    currentMonthlyCost: cost,
    previousMonthlyCost: 0,
    costChange: 0,
    currency,
    tags: {},
    periodStart: new Date(),
    periodEnd: new Date(),
    rawData: row,
  };
}

// GCP Billing → NormalizedCostItem

export function normalizeGcpCostItem(
  row: Record<string, unknown>,
): NormalizedCostItem {
  const service = String(
    (row as Record<string, Record<string, string>>)?.service?.description ??
      "Unknown",
  );
  const cost = Number(
    (row as Record<string, Record<string, string>>)?.cost?.amount ?? 0,
  );
  const currency = String(
    (row as Record<string, Record<string, string>>)?.cost?.currency ?? "USD",
  );

  return {
    id: uuid(),
    cloud: "gcp",
    service,
    category: mapGcpServiceToCategory(service),
    resourceId: String(
      (row as Record<string, Record<string, string>>)?.resource?.name ??
        service,
    ),
    resourceName: service,
    region: String(
      (row as Record<string, Record<string, string>>)?.location?.region ?? "",
    ),
    accountId: process.env.GCP_PROJECT_ID,
    currentMonthlyCost: cost,
    previousMonthlyCost: 0,
    costChange: 0,
    currency,
    tags: (row as Record<string, Record<string, string>>)?.labels ?? {},
    periodStart: new Date(),
    periodEnd: new Date(),
    rawData: row,
  };
}

// Service → Category Mappers

export function mapAwsServiceToCategory(service: string): CostCategory {
  const s = service.toLowerCase();
  if (s.includes("ec2") || s.includes("lightsail")) return "COMPUTE";
  if (s.includes("s3") || s.includes("efs") || s.includes("glacier"))
    return "STORAGE";
  if (s.includes("rds") || s.includes("dynamo") || s.includes("redshift"))
    return "DATABASE";
  if (
    s.includes("vpc") ||
    s.includes("cloudfront") ||
    s.includes("route 53") ||
    s.includes("data transfer")
  )
    return "NETWORKING";
  if (s.includes("lambda") || s.includes("fargate")) return "SERVERLESS";
  if (s.includes("ecs") || s.includes("eks") || s.includes("ecr"))
    return "CONTAINER";
  if (s.includes("sagemaker") || s.includes("bedrock") || s.includes("rekognition"))
    return "AI_ML";
  if (s.includes("athena") || s.includes("emr") || s.includes("glue"))
    return "DATA_ANALYTICS";
  if (s.includes("guardduty") || s.includes("waf") || s.includes("shield"))
    return "SECURITY";
  if (s.includes("cloudwatch") || s.includes("cloudtrail") || s.includes("config"))
    return "MANAGEMENT";
  return "OTHER";
}

export function mapAzureServiceToCategory(service: string): CostCategory {
  const s = service.toLowerCase();
  if (s.includes("virtual machines") || s.includes("compute")) return "COMPUTE";
  if (s.includes("storage")) return "STORAGE";
  if (s.includes("sql") || s.includes("cosmos") || s.includes("database"))
    return "DATABASE";
  if (
    s.includes("virtual network") ||
    s.includes("bandwidth") ||
    s.includes("load balancer")
  )
    return "NETWORKING";
  if (s.includes("functions") || s.includes("logic apps")) return "SERVERLESS";
  if (s.includes("kubernetes") || s.includes("container")) return "CONTAINER";
  if (s.includes("cognitive") || s.includes("machine learning") || s.includes("openai"))
    return "AI_ML";
  if (s.includes("synapse") || s.includes("data factory") || s.includes("databricks"))
    return "DATA_ANALYTICS";
  if (s.includes("sentinel") || s.includes("defender") || s.includes("key vault"))
    return "SECURITY";
  if (s.includes("monitor") || s.includes("log analytics")) return "MANAGEMENT";
  return "OTHER";
}

export function mapGcpServiceToCategory(service: string): CostCategory {
  const s = service.toLowerCase();
  if (s.includes("compute engine")) return "COMPUTE";
  if (s.includes("cloud storage")) return "STORAGE";
  if (s.includes("cloud sql") || s.includes("spanner") || s.includes("bigtable"))
    return "DATABASE";
  if (
    s.includes("networking") ||
    s.includes("cloud cdn") ||
    s.includes("cloud dns") ||
    s.includes("vpc")
  )
    return "NETWORKING";
  if (s.includes("cloud functions") || s.includes("cloud run")) return "SERVERLESS";
  if (s.includes("kubernetes") || s.includes("gke")) return "CONTAINER";
  if (s.includes("vertex") || s.includes("ai platform") || s.includes("automl"))
    return "AI_ML";
  if (s.includes("bigquery") || s.includes("dataflow") || s.includes("dataproc"))
    return "DATA_ANALYTICS";
  if (s.includes("security") || s.includes("kms") || s.includes("secret"))
    return "SECURITY";
  if (s.includes("stackdriver") || s.includes("monitoring") || s.includes("logging"))
    return "MANAGEMENT";
  return "OTHER";
}

// Category Label Helper

export function getCategoryLabel(category: CostCategory): string {
  const labels: Record<CostCategory, string> = {
    COMPUTE: "Compute",
    STORAGE: "Storage",
    DATABASE: "Database",
    NETWORKING: "Networking",
    SERVERLESS: "Serverless",
    CONTAINER: "Containers",
    AI_ML: "AI/ML",
    DATA_ANALYTICS: "Data Analytics",
    SECURITY: "Security",
    MANAGEMENT: "Management & Governance",
    OTHER: "Other",
  };
  return labels[category];
}

export function groupCostsByCloud(
  items: NormalizedCostItem[],
): Record<CloudProvider, NormalizedCostItem[]> {
  const grouped: Record<CloudProvider, NormalizedCostItem[]> = {
    aws: [],
    azure: [],
    gcp: [],
  };
  for (const item of items) {
    grouped[item.cloud].push(item);
  }
  return grouped;
}
