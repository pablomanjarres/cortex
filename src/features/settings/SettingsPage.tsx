import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Check, Trash2, Eye, EyeOff, Download, Upload, FolderOpen, HardDrive } from 'lucide-react'

interface KeyField {
  service: string
  label: string
  placeholder: string
  description: string
}

const keyFields: KeyField[] = [
  { service: 'github-token', label: 'GitHub Token', placeholder: 'ghp_...', description: 'Personal access token with repos scope' },
  { service: 'vercel-token', label: 'Vercel Token', placeholder: 'Bearer token from account settings', description: 'Account → Settings → Tokens' },
  { service: 'supabase-url', label: 'Supabase URL', placeholder: 'https://xxx.supabase.co', description: 'Your Supabase project URL' },
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

  if (loading) {
    return (
      <div className="rounded-md bg-secondary/30 px-4 py-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-56" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-md bg-secondary/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{field.label}</p>
          {saved && (
            <Chip variant="success" size="sm">
              <Check /> Saved
            </Chip>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
        {(!saved || showValue) && (
          <div className="mt-2 flex gap-2">
            <Input
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={field.placeholder}
              className="h-8 flex-1 font-mono text-sm"
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
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" onClick={reveal} aria-label={showValue ? `Hide ${field.label}` : `Reveal ${field.label}`}>
            {showValue ? <EyeOff /> : <Eye />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={remove} className="hover:text-destructive" aria-label={`Delete ${field.label}`}>
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  )
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function SettingsPage() {
  const isElectron = !!window.electronAPI?.keychain
  const hasData = !!window.electronAPI?.data
  const [dataPath, setDataPath] = useState('')
  const [dataKeys, setDataKeys] = useState<string[]>([])
  const [dataStats, setDataStats] = useState<{ key: string; size: number }[]>([])
  const [exportStatus, setExportStatus] = useState('')
  const [importStatus, setImportStatus] = useState('')

  useEffect(() => {
    if (hasData) {
      window.electronAPI!.data.getPath().then(setDataPath)
      window.electronAPI!.data.listKeys().then(setDataKeys)
      window.electronAPI!.data.getStats().then(setDataStats)
    }
  }, [hasData])

  const handleExport = async () => {
    if (!hasData) return
    setExportStatus('Exporting...')
    const json = await window.electronAPI!.data.exportAll()
    if (!json) { setExportStatus('Export failed'); return }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cortex-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportStatus(`Exported ${dataKeys.length} stores`)
    setTimeout(() => setExportStatus(''), 3000)
  }

  const handleImport = async () => {
    if (!hasData) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setImportStatus('Importing...')
      const text = await file.text()
      const result = await window.electronAPI!.data.importAll(text)
      if (result.success) {
        setImportStatus(`Imported ${result.count} stores. Restart app to see changes.`)
        window.electronAPI!.data.listKeys().then(setDataKeys)
      } else {
        setImportStatus(`Import failed: ${result.error}`)
      }
      setTimeout(() => setImportStatus(''), 5000)
    }
    input.click()
  }

  return (
    <PageShell>
      <WidgetCard title="API keys" description="Stored securely in macOS Keychain" delay={0}>
        {isElectron ? (
          <div className="flex flex-col gap-2">
            {keyFields.map((field) => (
              <KeyRow key={field.service} field={field} />
            ))}
          </div>
        ) : (
          <EmptyState
            message="API keys live in the desktop app."
            hint="Open Cortex on the Mac mini to configure them."
          />
        )}
      </WidgetCard>

      <WidgetCard title="Data" description="Your data lives as JSON files — portable, human-readable, backed up" delay={0.1}>
        {hasData ? (
          <div className="flex flex-col gap-4">
            {/* Storage info */}
            <div className="flex items-center gap-3 rounded-md bg-secondary/30 px-4 py-3">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">Storage location</p>
                <p className="truncate font-mono text-2xs text-muted-foreground">{dataPath}</p>
              </div>
            </div>

            {/* Data stores list with sizes */}
            <div className="rounded-md bg-secondary/30 px-4 py-3">
              <div className="mb-2 flex items-center gap-3">
                <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs font-medium">{dataKeys.length} data stores</p>
                <span className="ml-auto font-mono text-2xs tabular-nums text-muted-foreground">
                  {fmtSize(dataStats.reduce((s, f) => s + f.size, 0))} total
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {dataStats
                  .filter(f => !f.key.includes('.bak') && !f.key.includes('backup'))
                  .sort((a, b) => b.size - a.size)
                  .map((f) => (
                    <div key={f.key} className="flex items-center justify-between px-1 py-0.5">
                      <span className="mr-2 truncate font-mono text-2xs text-muted-foreground">{f.key}</span>
                      <span className={`shrink-0 font-mono text-2xs tabular-nums ${f.size > 1024 * 1024 ? 'font-medium text-warning' : 'text-foreground-faint'}`}>
                        {fmtSize(f.size)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Export / Import buttons */}
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={handleExport} className="flex-1">
                <Download /> Export all data
              </Button>
              <Button variant="secondary" size="sm" onClick={handleImport} className="flex-1">
                <Upload /> Import backup
              </Button>
            </div>

            {(exportStatus || importStatus) && (
              <p className={`font-mono text-2xs ${(exportStatus || importStatus).includes('fail') ? 'text-destructive' : 'text-success'}`}>
                {exportStatus || importStatus}
              </p>
            )}

            <p className="text-2xs leading-relaxed text-foreground-faint">
              All your data is stored as plain JSON files in the project folder. Your hourly backup covers them automatically.
              Export creates a single portable file you can open in any text editor. Import restores from a previous export (backs up current data first).
            </p>
          </div>
        ) : (
          <EmptyState
            message="Data management lives in the desktop app."
            hint="Open Cortex on the Mac mini to export or import."
          />
        )}
      </WidgetCard>
    </PageShell>
  )
}
