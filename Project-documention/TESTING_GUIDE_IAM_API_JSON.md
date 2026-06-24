# GravityLens: IAM, API Calls, and JSON Data Structures

> **A complete reference for your testing friend on permissions, API volumes, and actual response formats**

---

## Table of Contents

- [Part 1: IAM Roles & Permissions](#part-1-iam-roles--permissions)
  - User IAM Role (what user creates)
  - GravityLens Central Role (what you need)
  - Pricing API Permissions
- [Part 2: API Call Volume Analysis](#part-2-api-call-volume-analysis)
  - Calls per service
  - Total calls per scan
  - Cost implications
- [Part 3: JSON Response Structures](#part-3-json-response-structures)
  - Pricing API responses
  - Scanner responses
  - Database payloads
  - Frontend responses
- [Part 4: Testing Setup](#part-4-testing-setup)
  - Local development IAM setup
  - Mock AWS responses
  - Test data for each service

---

## Part 1: IAM Roles & Permissions

### 1.1 User's IAM Role (What Each Customer Creates)

Your users need to create ONE role in their AWS account that allows GravityLens to scan their infrastructure.

**Role Name:** `GravityLens-Scanner-Role`

**Trust Policy** (paste this into AWS Console → IAM → Create Role):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_GRAVITYLENS_ACCOUNT_ID:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "unique-external-id-per-tenant"
        }
      }
    }
  ]
}
```

**Permissions Policy** (attach `ReadOnlyAccess` or use custom policy below for stricter access):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "rds:DescribeDBInstances",
        "rds:DescribeDBClusters",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketVersioning",
        "sqs:ListQueues",
        "sqs:GetQueueAttributes",
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "apigateway:GET"
      ],
      "Resource": "*"
    }
  ]
}
```

**What you need from user:**
```
User provides this to you during onboarding:
- Role ARN: arn:aws:iam::123456789012:role/GravityLens-Scanner-Role
- External ID: unique-id-for-tenant-xyz
```

---

### 1.2 Your GravityLens Central IAM Setup

**Create TWO IAM users in YOUR AWS account:**

#### User 1: Scanner Bot (for scanning infrastructure)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/GravityLens-Scanner-Role"
    }
  ]
}
```

**Environment variables for this user:**
```
SCANNER_AWS_ACCESS_KEY_ID=AKIA...
SCANNER_AWS_SECRET_ACCESS_KEY=...
SCANNER_AWS_DEFAULT_REGION=us-east-1
```

#### User 2: Pricing Bot (for querying AWS Price List API)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "pricing:DescribeServices",
        "pricing:GetProducts",
        "pricing:ListPriceLists",
        "pricing:GetPriceListFileUrl"
      ],
      "Resource": "*"
    }
  ]
}
```

**Environment variables for this user:**
```
PRICING_AWS_ACCESS_KEY_ID=AKIA...
PRICING_AWS_SECRET_ACCESS_KEY=...
PRICING_AWS_DEFAULT_REGION=us-east-1
```

---

### 1.3 Testing Friend Setup (.env file)

Your testing friend should create a `.env` file in the `backend/` directory:

```env
# ============================================
# AWS CREDENTIALS FOR TESTING
# ============================================

# Your GravityLens Account (for assuming customer roles)
AWS_ACCESS_KEY_ID=AKIA...your_testing_scanner_key...
AWS_SECRET_ACCESS_KEY=...your_testing_scanner_secret...
AWS_DEFAULT_REGION=us-east-1

# Central Pricing Bot (for fetching prices)
PRICING_AWS_ACCESS_KEY_ID=AKIA...your_pricing_key...
PRICING_AWS_SECRET_ACCESS_KEY=...your_pricing_secret...
PRICING_AWS_DEFAULT_REGION=us-east-1

# Test Customer Account Role ARN
TEST_CUSTOMER_ROLE_ARN=arn:aws:iam::123456789012:role/GravityLens-Scanner-Role
TEST_CUSTOMER_EXTERNAL_ID=test-tenant-001

# Test Customer Region
TEST_REGION=ap-south-1

# Database
DATABASE_URL=postgresql://gravitylens:gravitylens123@localhost:5432/gravitylens_db
```

---

## Part 2: API Call Volume Analysis

### 2.1 API Calls Per Service (Per Region)

When scanning 8 services in **ONE region**, here's how many AWS API calls are made:

| Service | Main Call | Paginator Loops | Security/Config Calls | Total per Region |
|---------|-----------|--|--|--|
| VPC | 1 | 1-5 | 1 (IAM check) | **5-10** |
| Subnet | 1 | 1-5 | 0 | **5-10** |
| EC2 | 1 | 1-10 | 2 (describe + security) | **10-20** |
| Lambda | 1 | 1-5 | 2 (list + get config) | **5-15** |
| RDS | 1 | 1-5 | 2 (list + describe) | **5-15** |
| S3 | 1 | 1-2 | 1 (no region needed) | **3-5** |
| SQS | 1 | 1-3 | 1 (attributes) | **3-10** |
| API Gateway | 1 | 1-3 | 2 (get integrations) | **3-10** |

**Subtotal per region: 40-95 API calls**

### 2.2 Total API Calls Per Scan (Multi-Region)

If user has infrastructure in **3 regions** (ap-south-1, us-east-1, eu-west-1):

```
Calls per region: 40-95
× 3 regions = 120-285 calls

Plus:
- STS AssumeRole call: 1
- STS GetCallerIdentity: 1
- Pricing API calls (1 per unique resource type): 8-15 calls

TOTAL PER SCAN: ~130-310 AWS API calls
```

### 2.3 Pricing API Calls

For **pricing data** specifically:

```
Services:         EC2, RDS, Lambda, SQS, S3, API Gateway = 6 services
Pricing API calls per service type:

EC2 instances:
  - get_products() call: 1 per instance type discovered
  - Average: 3-5 different instance types in one account
  - Subtotal: 3-5 calls

RDS instances:
  - get_products() per DB engine type
  - Average: 2-3 DB engines
  - Subtotal: 2-3 calls

Lambda:
  - get_products() per memory configuration
  - Average: 1-2 calls (Lambda pricing is simpler)
  - Subtotal: 1-2 calls

S3: 1 call (pricing is standard)
SQS: 1 call (pricing is standard)
API Gateway: 1 call (pricing is standard)

TOTAL PRICING CALLS: 10-15 per scan
```

### 2.4 Cost Implications

**AWS API Costs:**
- EC2, RDS, Lambda API calls: Free
- SQS, S3, API Gateway API calls: Free
- Pricing API calls: Free (no charge for pricing queries)

**So scanning costs: $0 in API fees** ✅

**Actual costs come from:**
- Data Transfer out of AWS: ~$0.09 per GB
- RDS and other services being scanned (but those are customer costs, not API costs)

---

## Part 3: JSON Response Structures

### 3.1 AWS Pricing API Response (get_products)

**Request:**
```python
response = pricing_client.get_products(
    ServiceCode='AmazonEC2',
    Filters=[
        {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': 't3.medium'},
        {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
        {'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'},
        {'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'}
    ]
)
```

**Response (simplified):**
```json
{
  "PriceList": [
    "{\"product\":{\"attributes\":{\"instanceType\":\"t3.medium\",\"operatingSystem\":\"Linux\",\"tenancy\":\"Shared\",\"region\":\"ap-south-1\"},\"sku\":\"6QCMYABX3D\"},\"terms\":{\"OnDemand\":{\"6QCMYABX3D.JRTCKXETXF\":{\"priceDimensions\":{\"6QCMYABX3D.JRTCKXETXF.6YS6EN2CT7\":{\"unit\":\"Hrs\",\"pricePerUnit\":{\"USD\":\"0.0416\"}}}}}}}"
  ],
  "NextToken": null
}
```

**Parsed correctly:**
```json
{
  "product": {
    "attributes": {
      "instanceType": "t3.medium",
      "operatingSystem": "Linux",
      "tenancy": "Shared",
      "region": "ap-south-1"
    }
  },
  "terms": {
    "OnDemand": {
      "6QCMYABX3D.JRTCKXETXF": {
        "priceDimensions": {
          "6QCMYABX3D.JRTCKXETXF.6YS6EN2CT7": {
            "unit": "Hrs",
            "pricePerUnit": {
              "USD": "0.0416"
            }
          }
        }
      }
    }
  }
}
```

**So extracted: `hourlyPrice = 0.0416`, `monthlyPrice = 0.0416 * 730 = 30.37`**

---

### 3.2 EC2 Scanner Response (describe_instances)

**Request:**
```python
response = ec2_client.describe_instances()
```

**Response (one instance):**
```json
{
  "Reservations": [
    {
      "OwnerId": "123456789012",
      "Instances": [
        {
          "InstanceId": "i-0abc123def456ghi",
          "InstanceType": "t3.medium",
          "ImageId": "ami-0c123456789abcdef",
          "State": {
            "Code": 16,
            "Name": "running"
          },
          "PrivateIpAddress": "10.0.1.42",
          "PublicIpAddress": "54.123.45.67",
          "SubnetId": "subnet-0abc123def456ghi",
          "VpcId": "vpc-0abc123def456ghi",
          "SecurityGroups": [
            {
              "GroupName": "default",
              "GroupId": "sg-0abc123def456ghi"
            }
          ],
          "Monitoring": {
            "State": "disabled"
          },
          "Placement": {
            "AvailabilityZone": "ap-south-1a",
            "GroupName": "",
            "Tenancy": "default"
          },
          "Tags": [
            {
              "Key": "Name",
              "Value": "web-server-1"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 3.3 RDS Scanner Response (describe_db_instances)

**Request:**
```python
response = rds_client.describe_db_instances()
```

**Response (one instance):**
```json
{
  "DBInstances": [
    {
      "DBInstanceIdentifier": "production-postgres-db",
      "DBInstanceClass": "db.t3.small",
      "Engine": "postgres",
      "DBInstanceStatus": "available",
      "MasterUsername": "postgres",
      "DBName": "myappdb",
      "Endpoint": {
        "Address": "production-postgres-db.c9akciq32.ap-south-1.rds.amazonaws.com",
        "Port": 5432,
        "HostedZoneId": "Z2H3DC222Q5E7D"
      },
      "AllocatedStorage": 100,
      "StorageType": "gp2",
      "DBSubnetGroup": {
        "DBSubnetGroupName": "default-rds-subnet-group",
        "DBSubnetGroupDescription": "Created from CloudFormation",
        "VpcId": "vpc-0abc123def456ghi",
        "SubnetGroupStatus": "Complete",
        "Subnets": [
          {
            "SubnetIdentifier": "subnet-0abc123def456ghi",
            "SubnetAvailabilityZone": {
              "Name": "ap-south-1a"
            }
          },
          {
            "SubnetIdentifier": "subnet-0def456ghi789jkl",
            "SubnetAvailabilityZone": {
              "Name": "ap-south-1b"
            }
          }
        ]
      },
      "VpcSecurityGroups": [
        {
          "VpcSecurityGroupId": "sg-0abc123def456ghi",
          "Status": "active"
        }
      ],
      "MultiAZ": true,
      "Tags": [
        {
          "Key": "Name",
          "Value": "production-db"
        }
      ]
    }
  ]
}
```

---

### 3.4 Lambda Scanner Response (list_functions)

**Request:**
```python
response = lambda_client.list_functions()
```

**Response (one function):**
```json
{
  "Functions": [
    {
      "FunctionName": "process-orders",
      "FunctionArn": "arn:aws:lambda:ap-south-1:123456789012:function:process-orders",
      "Runtime": "nodejs20.x",
      "Role": "arn:aws:iam::123456789012:role/lambda-execution-role",
      "Handler": "index.handler",
      "CodeSize": 45678,
      "Description": "Processes customer orders from SQS",
      "Timeout": 30,
      "MemorySize": 512,
      "LastModified": "2026-06-15T10:30:00.000+0000",
      "CodeSha256": "abc123def456ghi789jklmno",
      "VpcConfig": {
        "SubnetIds": ["subnet-0abc123def456ghi"],
        "SecurityGroupIds": ["sg-0abc123def456ghi"],
        "VpcId": "vpc-0abc123def456ghi"
      },
      "Environment": {
        "Variables": {
          "DB_HOST": "production-postgres-db.c9akciq32.ap-south-1.rds.amazonaws.com",
          "DB_PORT": "5432"
        }
      },
      "TracingConfig": {
        "Mode": "PassThrough"
      },
      "Tags": {
        "Owner": "backend-team",
        "Environment": "production"
      }
    }
  ],
  "NextMarker": null
}
```

---

### 3.5 Database Storage Format (PostgreSQL JSON)

**Insert statement for discovered resource:**

```sql
INSERT INTO discovered_resources (
  tenant_id,
  resource_id,
  resource_type,
  resource_arn,
  resource_name,
  service,
  region,
  configuration,
  hourly_cost,
  monthly_cost,
  snapshot_version,
  created_at
) VALUES (
  'tenant-123',
  'i-0abc123def456ghi',
  'ec2Instance',
  'arn:aws:ec2:ap-south-1:123456789012:instance/i-0abc123def456ghi',
  'web-server-1',
  'ec2',
  'ap-south-1',
  '{
    "instanceType": "t3.medium",
    "state": "running",
    "privateIp": "10.0.1.42",
    "publicIp": "54.123.45.67",
    "securityGroups": ["default"],
    "availabilityZone": "ap-south-1a",
    "subnetId": "subnet-0abc123def456ghi",
    "vpcId": "vpc-0abc123def456ghi"
  }',
  0.0416,
  30.37,
  1,
  NOW()
);
```

---

### 3.6 Backend API Response Format

**Endpoint:** `GET /api/dashboard/latest/{tenant_id}`

**Response:**
```json
{
  "status": "success",
  "snapshot_id": "snap-xyz789",
  "version_number": 1,
  "label": "First scan",
  "scanned_at": "2026-06-15T10:30:00Z",
  "summary": {
    "ec2": 4,
    "rds": 2,
    "lambda": 5,
    "s3": 1,
    "sqs": 2,
    "apigateway": 1
  },
  "total_resources": 15,
  "total_monthly_cost": 3245.67,
  "graph": {
    "nodes": [
      {
        "id": "arn:aws:ec2:ap-south-1:123456789012:instance/i-0abc123def456ghi",
        "type": "ec2Node",
        "position": {
          "x": 100,
          "y": 50
        },
        "data": {
          "name": "web-server-1",
          "service": "ec2",
          "region": "ap-south-1",
          "insights": "Running - t3.medium",
          "metrics": {
            "instanceType": "t3.medium",
            "state": "running",
            "privateIp": "10.0.1.42",
            "publicIp": "54.123.45.67",
            "securityGroups": ["default"],
            "availabilityZone": "ap-south-1a",
            "hourlyPrice": 0.0416,
            "monthlyPrice": 30.37
          }
        }
      },
      {
        "id": "arn:aws:rds:ap-south-1:123456789012:db:production-postgres-db",
        "type": "rdsNode",
        "position": {
          "x": 400,
          "y": 200
        },
        "data": {
          "name": "production-postgres-db",
          "service": "rds",
          "region": "ap-south-1",
          "insights": "Multi-AZ - db.t3.small",
          "metrics": {
            "dbInstanceClass": "db.t3.small",
            "engine": "postgres",
            "allocatedStorage": 100,
            "storageType": "gp2",
            "multiAz": true,
            "hourlyPrice": 0.192,
            "monthlyPrice": 140.16
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-ec2-to-rds-1",
        "source": "arn:aws:ec2:ap-south-1:123456789012:instance/i-0abc123def456ghi",
        "target": "arn:aws:rds:ap-south-1:123456789012:db:production-postgres-db",
        "type": "animatedEdge",
        "label": "Reads/Writes",
        "data": {
          "transferCost": 12.50
        }
      }
    ]
  }
}
```

---

## Part 4: Testing Setup

### 4.1 Local Development Environment

Your testing friend should set up this locally:

**1. Create test AWS Account or Use AWS Free Tier**

```bash
# Verify credentials
aws sts get-caller-identity

# Should return:
{
    "UserId": "AIDAI...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/gravitylens-test"
}
```

**2. Create Test Customer Role**

```bash
# In your test AWS account, create the role that a "customer" would create

aws iam create-role \
  --role-name GravityLens-Scanner-Role \
  --assume-role-policy-document file://trust-policy.json

# trust-policy.json content:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "test-external-id"
        }
      }
    }
  ]
}

# Attach read-only access
aws iam attach-role-policy \
  --role-name GravityLens-Scanner-Role \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

**3. Create Test Infrastructure**

```bash
# Create a test VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16

# Create a test EC2 instance
aws ec2 run-instances \
  --image-id ami-0c123456789abcdef \
  --instance-type t3.medium \
  --key-name test-key \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=test-web-server}]'

# Create a test RDS instance
aws rds create-db-instance \
  --db-instance-identifier test-postgres-db \
  --db-instance-class db.t3.small \
  --engine postgres \
  --master-username postgres \
  --master-user-password testPassword123! \
  --allocated-storage 20
```

### 4.2 Mock Testing Without Real AWS Account

If testing friend doesn't have AWS account, provide mock responses:

**File: `backend/tests/mock_aws_responses.py`**

```python
# Mock EC2 response
MOCK_EC2_INSTANCES = {
    "Reservations": [
        {
            "Instances": [
                {
                    "InstanceId": "i-test001",
                    "InstanceType": "t3.medium",
                    "State": {"Name": "running"},
                    "PrivateIpAddress": "10.0.1.42",
                    "PublicIpAddress": "54.123.45.67",
                    "SubnetId": "subnet-test001",
                    "VpcId": "vpc-test001",
                    "Tags": [{"Key": "Name", "Value": "test-web-server"}],
                    "SecurityGroups": [{"GroupName": "default"}],
                    "Placement": {"AvailabilityZone": "ap-south-1a"}
                },
                {
                    "InstanceId": "i-test002",
                    "InstanceType": "t3.large",
                    "State": {"Name": "running"},
                    "PrivateIpAddress": "10.0.2.50",
                    "PublicIpAddress": "54.234.56.78",
                    "SubnetId": "subnet-test002",
                    "VpcId": "vpc-test001",
                    "Tags": [{"Key": "Name", "Value": "test-api-server"}],
                    "SecurityGroups": [{"GroupName": "api-sg"}],
                    "Placement": {"AvailabilityZone": "ap-south-1b"}
                }
            ]
        }
    ]
}

# Mock RDS response
MOCK_RDS_INSTANCES = {
    "DBInstances": [
        {
            "DBInstanceIdentifier": "test-postgres-db",
            "DBInstanceClass": "db.t3.small",
            "Engine": "postgres",
            "DBInstanceStatus": "available",
            "Endpoint": {
                "Address": "test-postgres-db.c9akciq32.ap-south-1.rds.amazonaws.com",
                "Port": 5432
            },
            "AllocatedStorage": 100,
            "DBSubnetGroup": {
                "Subnets": [
                    {"SubnetIdentifier": "subnet-test001"},
                    {"SubnetIdentifier": "subnet-test002"}
                ]
            },
            "VpcSecurityGroups": [{"VpcSecurityGroupId": "sg-test001"}],
            "MultiAZ": True
        }
    ]
}

# Mock Pricing response
MOCK_PRICING_RESPONSE = {
    "PriceList": [
        '{"terms":{"OnDemand":{"ABC123.JRTCKXETXF":{"priceDimensions":{"ABC123.JRTCKXETXF.6YS6EN2CT7":{"pricePerUnit":{"USD":"0.0416"}}}}}}'
    ]
}
```

**File: `backend/tests/test_scanner_with_mocks.py`**

```python
import pytest
from unittest.mock import patch, MagicMock
from app.scanners.ec2_scanner import ec2_scanner
from tests.mock_aws_responses import MOCK_EC2_INSTANCES, MOCK_PRICING_RESPONSE

@patch('boto3.client')
def test_ec2_scanner_with_mock_data(mock_boto_client):
    # Mock the EC2 client
    mock_ec2 = MagicMock()
    mock_ec2.describe_instances.return_value = MOCK_EC2_INSTANCES
    mock_boto_client.return_value = mock_ec2
    
    # Run scanner
    result = ec2_scanner.scan(
        credentials={
            'AccessKeyId': 'AKIA...',
            'SecretAccessKey': '...',
            'SessionToken': '...'
        },
        region='ap-south-1',
        account_id='123456789012',
        subnet_map={}
    )
    
    # Verify results
    assert len(result['nodes']) == 2
    assert result['nodes'][0]['raw_id'] == 'i-test001'
    assert result['nodes'][0]['node']['data']['metrics']['instanceType'] == 't3.medium'
    assert result['status'] == 'success'

@patch('boto3.client')
def test_pricing_api_with_mock(mock_boto_client):
    # Mock the Pricing client
    mock_pricing = MagicMock()
    mock_pricing.get_products.return_value = MOCK_PRICING_RESPONSE
    mock_boto_client.return_value = mock_pricing
    
    # Verify price extraction
    import json
    price_data = json.loads(MOCK_PRICING_RESPONSE['PriceList'][0])
    hourly_price = float(
        list(price_data['terms']['OnDemand'].values())[0]
        ['priceDimensions']
        [list(price_data['terms']['OnDemand'].values())[0]['priceDimensions'].keys().__iter__().__next__()]
        ['pricePerUnit']['USD']
    )
    
    assert hourly_price == 0.0416
    assert hourly_price * 730 == 30.368  # monthly
```

### 4.3 Testing Checklist for Your Friend

```
IAM & Permissions
☐ Create test AWS Account
☐ Create GravityLens-Scanner-Role in test account
☐ Verify role ARN format: arn:aws:iam::123456789012:role/GravityLens-Scanner-Role
☐ Test STS AssumeRole with correct ExternalId
☐ Verify credentials work with pricing:DescribeServices

API Call Volume
☐ Count API calls in CloudTrail for one full scan
☐ Verify no errors in scan logs
☐ Check that pricing queries work (no AccessDenied errors)
☐ Measure scan duration (should be < 2 minutes for 8 services)

JSON Data Integrity
☐ Verify nodes match expected structure
☐ Check that all metrics are present
☐ Verify costs are calculated: hourly_price * 730 = monthly_price
☐ Check tenant_id isolation (User A can't see User B data)

Edge Case Testing
☐ Account with 0 resources (should return empty graph)
☐ Account with 100+ resources (pagination should work)
☐ Missing pricing data (should default to $0)
☐ User with no read permissions (should fail gracefully)
☐ Multi-region account (should scan all regions)
```

---

## Quick Reference Summary

| Category | Detail |
|----------|--------|
| **IAM Roles** | User creates 1 role, you need 2 IAM users (scanner + pricing) |
| **API Calls per Scan** | ~130-310 calls (including pricing queries) |
| **Pricing API Calls** | ~10-15 per scan |
| **API Cost** | $0 (all free tier) |
| **Average Scan Time** | 30-120 seconds |
| **Total Cost to Customer** | $0 for scanning, pay only for resources being scanned |
| **Database Isolation** | tenant_id column ensures multi-tenant safety |
| **Frontend Data** | Includes nodes + edges + costs in JSON response |

---

**Your testing friend can now:**
1. Set up IAM roles correctly
2. Understand API call volumes and costs
3. Know exactly what JSON structures to expect
4. Write comprehensive tests using mock data
5. Verify that tenant isolation works properly
