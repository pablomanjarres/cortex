import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Skeleton } from '@/components/shared/Skeleton'
import type { CreditCardReminderSettings } from '../../../../electron/credit-card-types'
import type { CreditCardAlertOutcome, CreditCardAlertStatus } from '../../../../electron/credit-card-alerts-types'
import type { CreditCardLogin } from '../../../../electron/credit-card-api'
import { CardInput, CardFormActions } from './CardForm'
import { cardRequest } from './card-api'
import type { SaveCardCommand } from './use-credit-card'

export function ReminderSettings({ settings, pending, onSave, onClose }: {
  settings: CreditCardReminderSettings; pending: boolean; onSave: SaveCardCommand; onClose: () => void
}) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [channels, setChannels] = useState(settings.channels)
  const [leads, setLeads] = useState(settings.leadDays.join(', '))
  const [before, setBefore] = useState(String(settings.quietBefore))
  const [after, setAfter] = useState(String(settings.quietAfter))
  const [status, setStatus] = useState<CreditCardAlertStatus | null>(null)
  const [login, setLogin] = useState<CreditCardLogin | null>(null)
  const [delivery, setDelivery] = useState<CreditCardAlertOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const api = window.electronAPI?.creditCard
    Promise.all([api ? api.alertStatus() : cardRequest<CreditCardAlertStatus>('alerts'),
      api ? api.getLogin() : cardRequest<CreditCardLogin>('login')]).then(([alerts, launch]) => {
      if (active) { setStatus(alerts); setLogin(launch) }
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Reminder status could not be loaded.') })
    return () => { active = false }
  }, [])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Reminder action failed.') }
    finally { setBusy(false) }
  }
  const api = window.electronAPI?.creditCard
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    if (await onSave({ type: 'reminders.save', reminders: { enabled, channels,
      leadDays: leads.split(',').map((day) => Number(day.trim())), quietBefore: Number(before), quietAfter: Number(after) } })) onClose()
  }}>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Enable payment and closing reminders</label>
    <CardInput label="Days before payment" hint="Comma-separated lead times, for example 7, 3, 1. Due-day and daily overdue reminders are included." value={leads} onChange={(event) => setLeads(event.target.value)} />
    <div className="grid grid-cols-2 gap-3">
      <CardInput label="Deliver from hour" type="number" min={0} max={23} step={1} required value={before} onChange={(event) => setBefore(event.target.value)} />
      <CardInput label="Deliver before hour" type="number" min={1} max={24} step={1} required value={after} onChange={(event) => setAfter(event.target.value)} />
    </div>
    <p className="text-xs text-muted-foreground">America/Bogota. Delivery waits outside this daytime window.</p>
    <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Reminder channels</legend>
      {(['native', 'phone'] as const).map((channel) => <div key={channel} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={channels.includes(channel)} onChange={(event) => setChannels((selected) => event.target.checked ? [...selected, channel] : selected.filter((entry) => entry !== channel))} />{channel === 'native' ? 'Mac notifications' : 'Phone via Pushcut'}</label>
        <div className="flex items-center gap-2">{status?.channels[channel] && <Chip size="sm" variant={status.channels[channel].ready ? 'success' : 'warning'}>{status.channels[channel].ready ? 'Ready' : 'Unavailable'}</Chip>}
          <Button type="button" size="sm" variant="secondary" disabled={busy || pending} onClick={() => { void run(async () => setDelivery(api ? await api.test(channel) : await cardRequest<CreditCardAlertOutcome>('test', { channel }))) }}>Test {channel === 'native' ? 'Mac' : 'phone'}</Button>
        </div>
        {status?.channels[channel].error && <p className="w-full text-xs text-warning">{status.channels[channel].error}</p>}
      </div>)}
    </fieldset>
    {!status && !error && <Skeleton className="h-10 w-full" />}
    {status && <div className="space-y-2 text-xs text-muted-foreground">
      <p>Last check: {status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString('en-US', { timeZone: 'America/Bogota' }) : 'Not checked yet'}</p>
      {status.error && <p role="alert" className="text-destructive">{status.error}</p>}
      {status.outcomes.slice(-5).reverse().map((outcome) => <p key={`${outcome.id}-${outcome.at}`}>{outcome.channel} · {outcome.status === 'Sent' && outcome.channel === 'phone' ? 'Provider accepted' : outcome.status} · {outcome.title}{outcome.error ? ` · ${outcome.error}` : ''}</p>)}
      <Button type="button" size="sm" variant="ghost" disabled={busy || pending} onClick={() => { void run(async () => setStatus(api ? await api.retry() : await cardRequest<CreditCardAlertStatus>('retry', {}))) }}>Retry current reminders</Button>
    </div>}
    {delivery && <p role="status" className={`text-sm ${delivery.status === 'Failed' ? 'text-destructive' : 'text-muted-foreground'}`}>Test {delivery.channel}: {delivery.status === 'Sent' && delivery.channel === 'phone' ? 'Provider accepted; check your phone for display' : delivery.status}{delivery.error ? ` · ${delivery.error}` : ''}</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!login?.available || busy || pending} checked={login?.enabled ?? false} onChange={(event) => {
      const next = event.target.checked, previous = login
      if (login) setLogin({ ...login, enabled: next })
      void run(async () => {
        try { setLogin(api ? await api.setLogin(next) : await cardRequest<CreditCardLogin>('login', { enabled: next })) }
        catch (failure) { setLogin(previous); throw failure }
      })
    }} />Launch Cortex at login{login && !login.available ? ' · Unavailable on this host' : ''}</label>
    <p className="text-xs text-muted-foreground">Cortex checks on startup, hourly, after wake, and after saved card changes. The tray keeps it running when you close the window. Quitting Cortex or sleeping the Mac pauses checks.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <CardFormActions pending={pending || busy} label="Save reminders" />
  </form>
}
