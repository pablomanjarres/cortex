import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Trash2, Eye, EyeOff, Key, Download, Upload, FolderOpen, HardDrive } from 'lucide-react'

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
  { service: 'paperclip-token', label: 'Paperclip Token', placeholder: 'pcp_board_...', description: 'Bearer token from ~/.paperclip/auth.json on the VM, or mint via paperclipai auth login' },
  { service: 'paperclip-base-url', label: 'Paperclip Base URL', placeholder: 'http://openclaw-vm:3100', description: 'Override only if Paperclip is not on the default tailnet host' },
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

      <WidgetCard title="DATA" description="Your data lives as JSON files — portable, human-readable, backed up" delay={0.1}>
        {hasData ? (
          <div className="flex flex-col gap-4">
            {/* Storage info */}
            <div className="flex items-center gap-3 rounded-lg bg-secondary/30 px-4 py-3">
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Storage Location</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">{dataPath}</p>
              </div>
            </div>

            {/* Data stores list with sizes */}
            <div className="rounded-lg bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs font-medium">{dataKeys.length} Data Stores</p>
                <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                  {fmtSize(dataStats.reduce((s, f) => s + f.size, 0))} total
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {dataStats
                  .filter(f => !f.key.includes('.bak') && !f.key.includes('backup'))
                  .sort((a, b) => b.size - a.size)
                  .map((f) => (
                    <div key={f.key} className="flex items-center justify-between px-1 py-0.5">
                      <span className="text-[11px] text-muted-foreground truncate mr-2">{f.key}</span>
                      <span className={`text-[10px] tabular-nums shrink-0 ${f.size > 1024 * 1024 ? 'text-red-400 font-medium' : 'text-muted-foreground/60'}`}>
                        {fmtSize(f.size)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Export / Import buttons */}
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={handleExport} className="flex-1">
                <Download className="mr-2 h-3.5 w-3.5" />
                Export All Data
              </Button>
              <Button variant="secondary" size="sm" onClick={handleImport} className="flex-1">
                <Upload className="mr-2 h-3.5 w-3.5" />
                Import Backup
              </Button>
            </div>

            {(exportStatus || importStatus) && (
              <p className={`text-[11px] ${(exportStatus || importStatus).includes('fail') ? 'text-red-400' : 'text-green-400'}`}>
                {exportStatus || importStatus}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              All your data is stored as plain JSON files in the project folder. Your hourly backup covers them automatically.
              Export creates a single portable file you can open in any text editor. Import restores from a previous export (backs up current data first).
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <HardDrive className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Data management available in the desktop app</p>
          </div>
        )}
      </WidgetCard>
    </PageShell>
  )
}
