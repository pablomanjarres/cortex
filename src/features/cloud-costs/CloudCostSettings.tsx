import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { CloudCostSettings as Settings } from '../../../electron/cloud-cost-types.ts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'

interface CloudCostSettingsProps {
  settings: Settings
  onChange: (update: (current: Settings) => Settings) => void
}

interface SettingFieldProps {
  label: string
  hint: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

function SettingField({ label, hint, value, placeholder, onChange }: SettingFieldProps) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
      )}
    </Field>
  )
}

/** One credential source: title, configured state, and its settings. */
function ProviderPanel({ title, configured, children }: { title: string; configured: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-md bg-secondary/20 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{title}</h3>
        <Chip variant={configured ? 'success' : 'neutral'} size="sm">
          {configured ? 'Configured' : 'Not configured'}
        </Chip>
      </div>
      {children}
    </section>
  )
}

function GcpBillingCredential({ settings }: { settings: Settings }) {
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
      const result = await api.importGcpCredential(await file.text(), settings)
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
      if (await api.removeGcpCredential(settings)) {
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
        <ProviderPanel title="AWS Cost Explorer" configured={Boolean(settings.awsProfile)}>
          <SettingField
            label="AWS profile"
            hint="A local profile with ce:GetCostAndUsage. Enter default for the standard profile."
            value={settings.awsProfile}
            placeholder="default"
            onChange={(value) => set('awsProfile', value)}
          />
        </ProviderPanel>

        <ProviderPanel title="GCP Billing Export" configured={Boolean(settings.gcpBillingTable)}>
          <SettingField
            label="Billing table"
            hint="The Standard or Detailed export table in project.dataset.table form."
            value={settings.gcpBillingTable}
            placeholder="billing-project.costs.gcp_billing_export_v1_ACCOUNT"
            onChange={(value) => set('gcpBillingTable', value)}
          />
          <SettingField
            label="Query project"
            hint="Optional project charged for BigQuery queries."
            value={settings.gcpQueryProject}
            placeholder="billing-project"
            onChange={(value) => set('gcpQueryProject', value)}
          />
          <GcpBillingCredential settings={settings} />
        </ProviderPanel>
      </div>

      <Field label="Monthly budget (USD)" hint="Set to zero to hide budget progress." className="mt-4 max-w-xs">
        {(id) => (
          <Input
            id={id}
            type="number"
            min="0"
            step="1"
            value={settings.monthlyBudgetUsd || ''}
            onChange={(event) => set('monthlyBudgetUsd', Math.max(0, Number(event.target.value) || 0))}
            placeholder="100"
            className="font-mono text-xs"
          />
        )}
      </Field>
    </WidgetCard>
  )
}
