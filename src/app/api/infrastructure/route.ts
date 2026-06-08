import { NextResponse } from 'next/server';

export async function GET() {
  // Simulate minor network latency inherent to cloud API aggregation
  await new Promise((resolve) => setTimeout(resolve, 800));

  const mockAwsArchitecture = {
    "nodes": [
      // {
      //   "id": "vpc-main",
      //   "type": "VPC",
      //   "parentId": null,
      //   "position": { "x": 0, "y": 0 },
      //   "style": { "width": 900, "height": 500 },
      //   "data": {
      //     "name": "Production VPC",
      //     "status": "healthy",
      //     "insights": "Flow logs enabled.",
      //     "tags": {
      //       "Environment": "Production",
      //       "ManagedBy": "Terraform",
      //       "CostCenter": "CC-4921"
      //     },
      //     "metrics": {
      //       "cidrBlock": "10.0.0.0/16",
      //       "region": "ap-south-1",
      //       "activeGateways": 2,
      //       "vpcEndpoints": 0,
      //       "estMonthlyCost": 420 // 🚀 ADDED Cost
      //     },
      //     "telemetryData": [ // 🚀 ADDED Time-series network data
      //       { "time": "08:00", "natTrafficGB": 12, "egressTrafficGB": 8, "crossAzTrafficGB": 5 },
      //       { "time": "08:15", "natTrafficGB": 15, "egressTrafficGB": 10, "crossAzTrafficGB": 7 },
      //       { "time": "08:30", "natTrafficGB": 18, "egressTrafficGB": 14, "crossAzTrafficGB": 8 },
      //       { "time": "08:45", "natTrafficGB": 22, "egressTrafficGB": 18, "crossAzTrafficGB": 10 },
      //       { "time": "09:00", "natTrafficGB": 65, "egressTrafficGB": 45, "crossAzTrafficGB": 35 },
      //       { "time": "09:15", "natTrafficGB": 24, "egressTrafficGB": 19, "crossAzTrafficGB": 12 }
      //     ]
      //   }
      // },
      // {
      //   "id": "subnet-private",
      //   "type": "Subnet",
      //   "parentId": "vpc-main",
      //   "extent": "parent",
      //   "position": { "x": 50, "y": 80 },
      //   "style": { "width": 800, "height": 380 },
      //   "data": {
      //     "name": "Private Compute Subnet",
      //     "status": "healthy",
      //     "insights": "No direct internet access.",
      //     "tags": {
      //       "Environment": "Production",
      //       "Tier": "Private",
      //       "AvailabilityZone": "ap-south-1a"
      //     },
      //     "metrics": {
      //       "cidrBlock": "10.0.1.0/24",
      //       "availabilityZone": "ap-south-1a",
      //       "availableIPs": "184",
      //       "estMonthlyCost": 180 // 🚀 ADDED Cost
      //     },
      //     "telemetryData": [ // 🚀 ADDED Time-series network data
      //       { "time": "08:00", "dataTransferIn": 45, "dataTransferOut": 32 },
      //       { "time": "08:15", "dataTransferIn": 50, "dataTransferOut": 38 },
      //       { "time": "08:30", "dataTransferIn": 55, "dataTransferOut": 45 },
      //       { "time": "08:45", "dataTransferIn": 60, "dataTransferOut": 52 },
      //       { "time": "09:00", "dataTransferIn": 180, "dataTransferOut": 145 },
      //       { "time": "09:15", "dataTransferIn": 65, "dataTransferOut": 48 }
      //     ]
      //   }
      // },

      {
        "id": "vpc-main",
        "type": "VPC",
        "parentId": null,
        "position": { "x": 0, "y": 0 },
        "style": { "width": 900, "height": 520 }, // Slightly taller to fit the AZ
        "data": {
          "name": "Production VPC",
          "insights": "Flow logs enabled.",
          "metrics": { "cidrBlock": "10.0.0.0/16", "region": "ap-south-1", "estMonthlyCost": 420 },
          "telemetryData": [{ "time": "08:00", "natTrafficGB": 12 }, { "time": "08:15", "natTrafficGB": 15 }]
        }
      },
      //  NEW: The Availability Zone Layer
      {
        "id": "az-1a",
        "type": "AvailabilityZone",
        "parentId": "vpc-main",
        "extent": "parent",
        "position": { "x": 25, "y": 40 },
        "style": { "width": 850, "height": 450 },
        "data": {
          "name": "ap-south-1a",
          "insights": "Physical Data Center boundaries.",
          "metrics": { "status": "Operational", "powerGrid": "Stable" }
        }
      },
      //  UPDATED: Subnet is now a child of the AZ!
      {
        "id": "subnet-private",
        "type": "Subnet",
        "parentId": "az-1a",
        "extent": "parent",
        "position": { "x": 25, "y": 40 }, // Relative to AZ now
        "style": { "width": 800, "height": 380 },
        "data": {
          "name": "Private Compute Subnet",
          "metrics": { "cidrBlock": "10.0.1.0/24", "estMonthlyCost": 180 },
          "telemetryData": [{ "time": "08:00", "dataTransferIn": 45 }, { "time": "08:15", "dataTransferIn": 50 }]
        }
      },
      {
        "id": "api-gateway-ingress",
        "type": "apiGatewayNode",
        "parentId": null,
        "position": { "x": -315, "y": 250 },
        "data": {
          "name": "Client API Gateway",
          "status": "healthy",
          "insights": "Rate limiting active.",
          "tags": {
            "Service": "Ingress",
            "Team": "Edge Routing"
          },
          "metrics": {
            "requestsPerSec": "1200",
            "latency": "45ms",
            "totalRequests": "1.2M",
            "errorRate": "0.04%",
            "avgLatency": "42ms",
            "estMonthlyCost": 45
          },
          "telemetryData": [
            { "time": "08:00", "requests": 850, "latency": 35 },
            { "time": "08:15", "requests": 920, "latency": 38 },
            { "time": "08:30", "requests": 1050, "latency": 42 },
            { "time": "08:45", "requests": 1100, "latency": 44 },
            { "time": "09:00", "requests": 1800, "latency": 65 },
            { "time": "09:15", "requests": 1200, "latency": 45 }
          ]
        }
      },
      {
        "id": "sqs-job-queue",
        "type": "sqsNode",
        "parentId": "subnet-private",
        "extent": "parent",
        "position": { "x": 7, "y": 240 },
        "data": {
          "name": "Job Processing Queue",
          "status": "healthy",
          "insights": "5 messages in flight.",
          "tags": {
            "Service": "AsyncWorker",
            "Team": "Backend"
          },
          "metrics": {
            "type": "Standard",
            "retentionPeriod": "4 days",
            "messagesVisible": 14,
            "messagesDelayed": 0,
            "ageOfOldestMessage": "12s",
            "estMonthlyCost": 12
          },
          "telemetryData": [
            { "time": "08:00", "messages": 2 },
            { "time": "08:15", "messages": 5 },
            { "time": "08:30", "messages": 12 },
            { "time": "08:45", "messages": 8 },
            { "time": "09:00", "messages": 45 },
            { "time": "09:15", "messages": 14 }
          ]
        }
      },
      {
        "id": "lambda-processor",
        "type": "lambdaNode",
        "parentId": "subnet-private",
        "extent": "parent",
        "position": { "x": 300, "y": 10 },
        "data": {
          "name": "Data Processor",
          "status": "warning",
          "insights": "Warning: High memory usage.",
          "tags": {
            "Runtime": "Node.js 20.x",
            "Team": "Data Engineering"
          },
          "metrics": {
            "runtime": "nodejs20.x",
            "memory": "1024 MB",
            "avgDuration": "850ms",
            "memoryUtilization": "89%",
            "invocations": "450k",
            "errors": 2,
            "estMonthlyCost": 320
          },
          "telemetryData": [
            { "time": "08:00", "cpu": 45, "memory": 510 },
            { "time": "08:15", "cpu": 48, "memory": 580 },
            { "time": "08:30", "cpu": 52, "memory": 620 },
            { "time": "08:45", "cpu": 55, "memory": 750 },
            { "time": "09:00", "cpu": 85, "memory": 980 },
            { "time": "09:15", "cpu": 60, "memory": 890 }
          ]
        }
      },
      {
        "id": "db-mongo-cluster",
        "type": "databaseNode",
        "parentId": "subnet-private",
        "extent": "parent",
        "position": { "x": 590, "y": 240 },
        "data": {
          "name": "MongoDB Atlas",
          "status": "healthy",
          "insights": "Stable IOPS.",
          "tags": {
            "Engine": "MongoDB 7.0",
            "Tier": "Dedicated M10"
          },
          "metrics": {
            "engine": "MongoDB 7.0",
            "tier": "M10 Dedicated",
            "activeConnections": 142,
            "cpuUtilization": "24%",
            "diskUsed": "124GB",
            "estMonthlyCost": 850
          },
          "telemetryData": [
            { "time": "08:00", "connections": 120, "iops": 400 },
            { "time": "08:15", "connections": 125, "iops": 420 },
            { "time": "08:30", "connections": 130, "iops": 450 },
            { "time": "08:45", "connections": 135, "iops": 480 },
            { "time": "09:00", "connections": 210, "iops": 1200 },
            { "time": "09:15", "connections": 142, "iops": 650 }
          ]
        }
      },
      {
        "id": "s3-asset-bucket",
        "type": "s3Node",
        "parentId": null,
        "position": { "x": 950, "y": 250 },
        "data": {
          "name": "Asset Storage",
          "status": "healthy",
          "insights": "Encryption enabled.",
          "tags": {
            "DataClassification": "Public",
            "Backup": "Daily"
          },
          "metrics": {
            "totalSize": "1.2 TB",
            "versioning": "Active",
            "bucketObjects": "45,201",
            "publicAccess": "Disabled",
            "estMonthlyCost": 140
          },
          "telemetryData": [
            { "time": "08:00", "readOps": 1200, "writeOps": 40 },
            { "time": "08:15", "readOps": 1250, "writeOps": 45 },
            { "time": "08:30", "readOps": 1300, "writeOps": 50 },
            { "time": "08:45", "readOps": 1350, "writeOps": 55 },
            { "time": "09:00", "readOps": 2500, "writeOps": 300 },
            { "time": "09:15", "readOps": 1400, "writeOps": 60 }
          ]
        }
      }
    ],
    "edges": [
      {
        "id": "edge-api-to-sqs",
        "source": "api-gateway-ingress",
        "target": "sqs-job-queue",
        "type": "animatedEdge",
        "label": "POST /jobs",
        "data": { "transferCost": 4 } // Cheap local VPC traffic
      },
      {
        "id": "edge-sqs-to-lambda",
        "source": "sqs-job-queue",
        "target": "lambda-processor",
        "type": "animatedEdge",
        "label": "Triggers Event",
        "data": { "transferCost": 12 }
      },
      {
        "id": "edge-lambda-to-db",
        "source": "lambda-processor",
        "target": "db-mongo-cluster",
        "type": "animatedEdge",
        "label": "Reads/Writes State",
        "data": { "transferCost": 145 } // 🚨 Expensive Cross-AZ Database Traffic!
      },
      {
        "id": "edge-lambda-to-s3",
        "source": "lambda-processor",
        "target": "s3-asset-bucket",
        "type": "animatedEdge",
        "label": "Stores Assets",
        "data": { "transferCost": 45 }
      }
    ]
  };

  return NextResponse.json(mockAwsArchitecture);
}