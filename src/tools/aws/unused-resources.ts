import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EC2Client, DescribeVolumesCommand, DescribeAddressesCommand, DescribeNatGatewaysCommand } from "@aws-sdk/client-ec2";
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand, DescribeTargetHealthCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { logger } from "../../logger.js";
import type { ToolResponse, UnusedResource } from "../../types/cost.js";

export function register(server: McpServer): void {
  server.tool(
    "aws_get_unused_resources",
    "Detect unused AWS resources: unattached EBS volumes, unused Elastic IPs, idle NAT Gateways, and load balancers with no healthy targets. Each result includes estimated monthly cost.",
    {
      resourceTypes: z
        .array(z.enum(["EBS_VOLUMES", "ELASTIC_IPS", "NAT_GATEWAYS", "LOAD_BALANCERS"]))
        .default(["EBS_VOLUMES", "ELASTIC_IPS", "NAT_GATEWAYS", "LOAD_BALANCERS"]),
      maxResults: z.number().min(1).max(200).default(50),
    },
    async (params) => {
      const requestId = uuid();
      logger.info("Tool invoked", { requestId, tool: "aws_get_unused_resources" });

      try {
        const ec2 = new EC2Client({ requestHandler: { requestTimeout: 30000 } });
        const elbv2 = new ElasticLoadBalancingV2Client({ requestHandler: { requestTimeout: 30000 } });
        const unused: UnusedResource[] = [];

        // Unattached EBS Volumes
        if (params.resourceTypes.includes("EBS_VOLUMES")) {
          const volumes = await ec2.send(new DescribeVolumesCommand({
            Filters: [{ Name: "status", Values: ["available"] }],
            MaxResults: 500,
          }));
          for (const vol of volumes.Volumes ?? []) {
            const sizeGB = vol.Size ?? 0;
            const costPerGB = vol.VolumeType === "gp3" ? 0.08 : vol.VolumeType === "io1" ? 0.125 : 0.10;
            unused.push({
              id: uuid(),
              cloud: "aws",
              service: "EBS",
              resourceType: "EBS Volume",
              resourceId: vol.VolumeId ?? "unknown",
              resourceName: vol.Tags?.find(t => t.Key === "Name")?.Value ?? vol.VolumeId ?? "unknown",
              region: vol.AvailabilityZone,
              accountId: process.env.AWS_ACCOUNT_ID,
              monthlyCost: sizeGB * costPerGB,
              reason: `Unattached ${vol.VolumeType} volume (${sizeGB} GB) — not attached to any instance`,
              actionSteps: ["Snapshot the volume if data is needed", "Delete the unattached volume"],
              tags: Object.fromEntries((vol.Tags ?? []).map(t => [t.Key ?? "", t.Value ?? ""])),
              detectedAt: new Date(),
              rawData: vol,
            });
          }
        }

        // Unused Elastic IPs
        if (params.resourceTypes.includes("ELASTIC_IPS")) {
          const eips = await ec2.send(new DescribeAddressesCommand({}));
          for (const eip of eips.Addresses ?? []) {
            if (!eip.AssociationId) {
              unused.push({
                id: uuid(),
                cloud: "aws",
                service: "EC2",
                resourceType: "Elastic IP",
                resourceId: eip.AllocationId ?? "unknown",
                resourceName: eip.PublicIp ?? "unknown",
                region: process.env.AWS_DEFAULT_REGION,
                accountId: process.env.AWS_ACCOUNT_ID,
                monthlyCost: 3.65,
                reason: "Elastic IP not associated with any running instance",
                actionSteps: ["Release the Elastic IP if not needed"],
                tags: Object.fromEntries((eip.Tags ?? []).map(t => [t.Key ?? "", t.Value ?? ""])),
                detectedAt: new Date(),
                rawData: eip,
              });
            }
          }
        }

        // Idle NAT Gateways
        if (params.resourceTypes.includes("NAT_GATEWAYS")) {
          const nats = await ec2.send(new DescribeNatGatewaysCommand({
            Filter: [{ Name: "state", Values: ["available"] }],
          }));
          for (const nat of nats.NatGateways ?? []) {
            unused.push({
              id: uuid(),
              cloud: "aws",
              service: "VPC",
              resourceType: "NAT Gateway",
              resourceId: nat.NatGatewayId ?? "unknown",
              resourceName: nat.Tags?.find(t => t.Key === "Name")?.Value ?? nat.NatGatewayId ?? "unknown",
              region: nat.SubnetId,
              accountId: process.env.AWS_ACCOUNT_ID,
              monthlyCost: 32.40,
              reason: "NAT Gateway — verify if actively used; $32.40/mo fixed cost + data processing",
              actionSteps: [
                "Check CloudWatch BytesOut metric for last 14 days",
                "If zero traffic, delete the NAT Gateway",
                "Update route tables to remove NAT Gateway routes",
              ],
              tags: Object.fromEntries((nat.Tags ?? []).map(t => [t.Key ?? "", t.Value ?? ""])),
              detectedAt: new Date(),
              rawData: nat,
            });
          }
        }

        // Load Balancers with no healthy targets
        if (params.resourceTypes.includes("LOAD_BALANCERS")) {
          const lbs = await elbv2.send(new DescribeLoadBalancersCommand({}));
          const tgs = await elbv2.send(new DescribeTargetGroupsCommand({}));

          for (const lb of lbs.LoadBalancers ?? []) {
            const lbTGs = (tgs.TargetGroups ?? []).filter(
              tg => tg.LoadBalancerArns?.includes(lb.LoadBalancerArn ?? ""),
            );

            let hasHealthy = false;
            for (const tg of lbTGs) {
              const health = await elbv2.send(
                new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }),
              );
              if ((health.TargetHealthDescriptions ?? []).some(t => t.TargetHealth?.State === "healthy")) {
                hasHealthy = true;
                break;
              }
            }

            if (!hasHealthy) {
              const cost = lb.Type === "application" ? 22.27 : lb.Type === "network" ? 22.27 : 18.25;
              unused.push({
                id: uuid(),
                cloud: "aws",
                service: "ELB",
                resourceType: `${lb.Type} Load Balancer`,
                resourceId: lb.LoadBalancerArn ?? "unknown",
                resourceName: lb.LoadBalancerName ?? "unknown",
                region: lb.AvailabilityZones?.[0]?.ZoneName,
                accountId: process.env.AWS_ACCOUNT_ID,
                monthlyCost: cost,
                reason: "Load balancer has no healthy targets",
                actionSteps: [
                  "Verify no services are expected to register",
                  "Delete the load balancer and target groups",
                  "Update DNS records",
                ],
                tags: {},
                detectedAt: new Date(),
                rawData: lb,
              });
            }
          }
        }

        const totalWaste = unused.reduce((s, r) => s + r.monthlyCost, 0);

        const result: ToolResponse<{
          unusedResources: UnusedResource[];
          totalMonthlyWaste: number;
          totalAnnualWaste: number;
          count: number;
        }> = {
          success: true,
          requestId,
          data: {
            unusedResources: unused.slice(0, params.maxResults),
            totalMonthlyWaste: totalWaste,
            totalAnnualWaste: totalWaste * 12,
            count: unused.length,
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
