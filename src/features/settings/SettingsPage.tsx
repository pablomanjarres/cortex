import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Trash2, Eye, EyeOff, Key } from 'lucide-react'

interface KeyField {
  service: string
  label: string
  placeholder: string
  description: string
}

const keyFields: KeyField[] = [
  { service: 'github-token', label: 'GitHub Token', placeholder: 'ghp_...', description: 'Personal access token with repos scope' },
  { service: 'vercel-token', label: 'Vercel Token', placeholder: 'Bearer token from account settings', description: 'Account → Settings → Tokens' },
  { service: 'supabase-url', label: 'Supabase URL', placeholder: 'https://xxx.supabase.co', description: 'Your Nella project URL' },
  { service: 'supabase-service-key', label: 'Supabase Service Key', placeholder: 'eyJ...', description: 'Service role key (not anon key)' },
  { service: 'lemon-api-key', label: 'Lemon Squeezy API Key', placeholder: 'API key from Settings', description: 'Settings → API in Lemon Squeezy dashboard' },
  { service: 'lemon-store-id', label: 'Lemon Squeezy Store ID', placeholder: '12345', description: 'Your store ID number' },
]

function KeyRow({ field }: { field: KeyField }) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  const [showValue, setShowValue] = useState(false)
  const [loading, setLoading] = useState(true)
  const isElectron = !!window.electronAPI?.keychain

  useEffect(() => {
    if (!isElectron) { setLoading(false); return }
    window.electronAPI!.keychain.has(field.service).then((has) => {
      setSaved(has)
      setLoading(false)
    })
  }, [field.service, isElectron])

  const save = async () => {
    if (!isElectron || !value.trim()) return
    await window.electronAPI!.keychain.save(field.service, value.trim())
    setSaved(true)
    setValue('')
    setShowValue(false)
  }

  const remove = async () => {
    if (!isElectron) return
    await window.electronAPI!.keychain.delete(field.service)
    setSaved(false)
    setValue('')
  }

  const reveal = async () => {
    if (!isElectron) return
    if (showValue) { setShowValue(false); setValue(''); return }
    const key = await window.electronAPI!.keychain.get(field.service)
    if (key) { setValue(key); setShowValue(true) }
  }

  if (loading) return null

  return (
    <div className="flex items-center gap-3 rounded-lg bg-secondary/30 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{field.label}</p>
          {saved && <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium"><Check className="h-3 w-3" /> Saved</span>}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{field.description}</p>
        {(!saved || showValue) && (
          <div className="flex gap-2 mt-2">
            <Input
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={field.placeholder}
              className="h-8 bg-input text-sm font-mono flex-1"
            />
            {!saved && (
              <Button size="sm" onClick={save} disabled={!value.trim()} className="h-8">
                Save
              </Button>
            )}
          </div>
        )}
      </div>
      {saved && (
        <div className="flex gap-1 shrink-0">
          <button onClick={reveal} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button onClick={remove} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-secondary transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export function SettingsPage() {
  const isElectron = !!window.electronAPI?.keychain

  return (
    <PageShell>
      <WidgetCard title="API KEYS" description="Stored securely in macOS Keychain" delay={0}>
        {isElectron ? (
          <div className="flex flex-col gap-2">
            {keyFields.map((field) => (
              <KeyRow key={field.service} field={field} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <Key className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">API keys can only be configured in the desktop app</p>
          </div>
        )}
      </WidgetCard>
    </PageShell>
  )
}
