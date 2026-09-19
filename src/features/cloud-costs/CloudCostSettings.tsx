import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { CloudCostSettings as Settings } from '../../../electron/cloud-cost-types.ts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'

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

function GcpBillingCredential() {
  const api = window.electronAPI?.cloudCosts
  const fileInput = useRef<HTMLInputElement>(null)
  const [identity, setIdentity] = useState<{ configured: boolean; email: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!api) return
    let active = true
    void api.gcpCredentialStatus()
      .then((result) => { if (active) setIdentity(result) })
      .catch(() => { if (active) setMessage('GCP key status is unavailable.') })
    return () => { active = false }
  }, [api])

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!api || !file) return
    if (file.size > 20_000) {
      setMessage('Choose a GCP service account key smaller than 20 KB.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const result = await api.importGcpCredential(await file.text())
      if (result.ok) {
        setIdentity({ configured: true, email: result.email ?? null })
        setMessage(result.source?.ok ? 'Key saved. GCP costs are up to date.' : 'Key saved. Check the GCP source status above.')
      } else {
        setMessage(result.error ?? 'Could not import the GCP key.')
      }
    } catch {
      setMessage('Could not import the GCP key.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!api) return
    setBusy(true)
    try {
      if (await api.removeGcpCredential()) {
        setIdentity({ configured: false, email: null })
        setMessage('Dedicated key removed. Cortex will use local Google ADC if available.')
      } else {
        setMessage('Could not remove the GCP key.')
      }
    } catch {
      setMessage('Could not remove the GCP key.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-border/60 pt-3">
      <p className="text-xs font-medium text-foreground">Unattended GCP refresh</p>
      <p className="mt-1 text-2xs leading-relaxed text-foreground-faint">
        Import a billing-only service account key once. Cortex encrypts it locally and refreshes without your Google login session.
      </p>
      {identity?.configured && (
        <p className="mt-2 break-all font-mono text-2xs text-success">
          {identity.email ?? 'Stored key needs attention'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileInput} type="file" accept=".json,application/json" onChange={importFile} className="hidden" aria-label="GCP service account key file" />
        <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} disabled={!api || busy}>
          {identity?.configured ? 'Replace GCP key' : 'Import GCP key'}
        </Button>
        {identity?.configured && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>Remove key</Button>
        )}
      </div>
      {!api && <p className="mt-2 text-2xs text-foreground-faint">Open the installed Mac app to import a key.</p>}
      {message && <p className="mt-2 text-2xs text-foreground">{message}</p>}
    </div>
  )
}

export function CloudCostSettings({ settings, onChange }: CloudCostSettingsProps) {
  const set = <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
    onChange((current) => ({ ...current, [key]: value }))
  }

  return (
    <WidgetCard
      title="Connections"
      description="AWS shared profile and encrypted local GCP billing credentials."
      delay={0.35}
    >
      <div className="mb-4 flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-success" />
        <p className="text-xs text-muted-foreground">
          AWS uses your shared profile. GCP prefers a dedicated billing key, then local Application Default Credentials.
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
          <GcpBillingCredential />
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
