import { ShieldCheck } from 'lucide-react'
import type { CloudCostSettings as Settings } from '../../../electron/cloud-cost-types.ts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'

interface CloudCostSettingsProps {
  settings: Settings
  onChange: (update: (current: Settings) => Settings) => void
}

interface FieldProps {
  id: string
  label: string
  hint: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

function SettingField({ id, label, hint, value, placeholder, onChange }: FieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
      <span className="text-2xs leading-relaxed text-foreground-faint">{hint}</span>
    </label>
  )
}

export function CloudCostSettings({ settings, onChange }: CloudCostSettingsProps) {
  const set = <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
    onChange((current) => ({ ...current, [key]: value }))
  }

  return (
    <WidgetCard
      title="Connections"
      description="Read-only local credentials. Cortex never stores AWS or Google secrets."
      delay={0.35}
    >
      <div className="mb-4 flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-success" />
        <p className="text-xs text-muted-foreground">
          AWS uses your shared profile. GCP uses Application Default Credentials.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-md bg-secondary/20 p-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">AWS Cost Explorer</p>
            <Chip variant={settings.awsProfile ? 'success' : 'neutral'} size="sm">
              {settings.awsProfile ? 'Configured' : 'Not configured'}
            </Chip>
          </div>
          <SettingField
            id="aws-profile"
            label="AWS profile"
            hint="A local profile with ce:GetCostAndUsage. Enter default for the standard profile."
            value={settings.awsProfile}
            placeholder="default"
            onChange={(value) => set('awsProfile', value)}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-md bg-secondary/20 p-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">GCP Billing Export</p>
            <Chip variant={settings.gcpBillingTable ? 'success' : 'neutral'} size="sm">
              {settings.gcpBillingTable ? 'Configured' : 'Not configured'}
            </Chip>
          </div>
          <SettingField
            id="gcp-billing-table"
            label="Billing table"
            hint="The Standard or Detailed export table in project.dataset.table form."
            value={settings.gcpBillingTable}
            placeholder="billing-project.costs.gcp_billing_export_v1_ACCOUNT"
            onChange={(value) => set('gcpBillingTable', value)}
          />
          <SettingField
            id="gcp-query-project"
            label="Query project"
            hint="Optional project charged for BigQuery queries."
            value={settings.gcpQueryProject}
            placeholder="billing-project"
            onChange={(value) => set('gcpQueryProject', value)}
          />
        </div>
      </div>

      <div className="mt-4 max-w-xs">
        <label htmlFor="cloud-budget" className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Monthly budget (USD)</span>
          <Input
            id="cloud-budget"
            type="number"
            min="0"
            step="1"
            value={settings.monthlyBudgetUsd || ''}
            onChange={(event) => set('monthlyBudgetUsd', Math.max(0, Number(event.target.value) || 0))}
            placeholder="100"
            className="font-mono text-xs"
          />
          <span className="text-2xs text-foreground-faint">Set to zero to hide budget progress.</span>
        </label>
      </div>
    </WidgetCard>
  )
}
