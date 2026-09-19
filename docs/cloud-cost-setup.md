# Cloud cost setup

Cortex reads billing data from local AWS and Google credentials. It stores usage charges and account adjustments separately in its encrypted data directory. Cloud credentials stay in the standard AWS and Google credential stores.

The graphs show usage before promotional credits, not the amount charged to a payment method. Credits and estimated net cost appear separately at account scope. A project total is its usage cost; shared billing credits are not assigned to projects.

## AWS Cost Explorer

### 1. Grant read-only billing access

Attach this policy to the IAM user or role used by Cortex:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ce:GetCostAndUsage",
      "Resource": "*"
    }
  ]
}
```

Cost Explorer must be enabled for the AWS account. An AWS Organizations management account can control whether member accounts may read their own cost data.

### 2. Create or choose a local profile

For access keys:

```bash
AWS_PROFILE=cortex-billing aws configure
```

For AWS IAM Identity Center, use an SSO profile and refresh its local session when needed:

```bash
AWS_PROFILE=cortex-billing aws sso login
```

### 3. Configure Cortex

Open **Cloud Spend** and enter the profile name in **AWS profile**. Cortex queries Cost Explorer in `us-east-1` with daily granularity and service/linked-account groups. It reads amortized usage, credits, and net amortized cost in separate passes so promotional credits cannot erase usage graphs. Amortized usage reflects reservation and Savings Plan pricing; it is not public list price.

## GCP Cloud Billing

### 1. Enable a billing export

In Google Cloud Console, open **Billing**, then **Billing export**, then enable either the Standard usage cost export or the Detailed usage cost export to BigQuery.

The export creates a table with one of these shapes:

```text
project-id.dataset.gcp_billing_export_v1_BILLING_ACCOUNT_ID
project-id.dataset.gcp_billing_export_resource_v1_BILLING_ACCOUNT_ID
```

Google only exposes rows present in that export. A new multi-region export can backfill the current and previous month. Other dataset locations begin from the date the export was enabled.

### 2. Grant read-only BigQuery access

The local Google identity needs:

- `roles/bigquery.dataViewer` on the export dataset
- `roles/bigquery.jobUser` on the project that runs the query

Create local Application Default Credentials:

```bash
gcloud auth application-default login
```

### 3. Configure Cortex

Open **Cloud Spend** and enter:

- **Billing table:** the full `project.dataset.table` value
- **Query project:** the project charged for BigQuery queries, when it differs from the credential default

Cortex groups GCP usage by usage date, service, and `project.id`. A Detailed export also supplies resource names when Google includes them. Rows without an identity remain under **Unallocated resource** within their project. A Standard export shows project and service totals without resource detail. Cortex converts charges and credits separately using the export's `currency_conversion_rate`.

## Refresh and retention

Cortex refreshes stale data at startup, after the Mac wakes, every six hours with a small randomized offset, and when **Refresh** is pressed. Each provider refreshes independently. If one provider fails, Cortex keeps that provider's last successful rows and marks them stale.

The dashboard keeps the current month and the previous 12 calendar months. Select a GCP project to see its monthly usage, services, and resource costs. Combined totals use USD equivalents. A monthly budget is optional and measures usage before credits.

## Query cost

AWS Cost Explorer and BigQuery can charge for API requests or scanned data. Each AWS refresh makes three paginated Cost Explorer passes; GCP checks the table schema and queries dated billing rows. Cortex uses a six-hour cadence and date filters to limit requests. A partitioned GCP billing export keeps BigQuery scans smaller.

## Troubleshooting

- **Credentials unavailable:** Run the matching AWS SSO login or Google ADC login on the same Mac account that launches Cortex.
- **Access denied:** Confirm `ce:GetCostAndUsage` for AWS or the two BigQuery roles for GCP.
- **Billing export table was not found:** Copy the full table ID from BigQuery and confirm the local identity can read the dataset.
- **Usage unavailable:** Save at least one provider setting, wait a moment for it to persist, then press **Refresh**. A net-only cache from an older app cannot be used for usage graphs and must be fetched again.
