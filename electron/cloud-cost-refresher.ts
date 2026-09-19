import fs from 'fs'
import path from 'path'
import { ipcMain, powerMonitor } from 'electron'
import { encryptAndWriteAsync } from './crypto.js'
import { deleteKey, getKey, hasKey, saveKey } from './keychain.js'
import { GCP_BILLING_KEY_SERVICE } from './keychain-access.js'
import type {
  CloudCostCache,
  CloudCostSettings,
  CloudCostSourceStatus,
  CloudProvider,
} from './cloud-cost-types.js'
import {
  automaticRefreshDelayMs,
  billingWindow,
  compatibleCloudCostCache,
  isProviderConfigured,
  mergeProviderResults,
  safeCloudCostError,
  type ProviderFetchResult,
  type ProviderResults,
} from './cloud-cost-refresh-state.js'
import { fetchAwsCosts } from './integrations/aws-costs.js'
import { fetchGcpCosts, parseGcpServiceAccount } from './integrations/gcp-costs.js'

const CACHE_KEY = 'cortex-cloud-costs'
const SETTINGS_KEY = 'cortex-cloud-cost-settings'
const JITTER_MS = 10 * 60 * 1000
const PROVIDERS: CloudProvider[] = ['aws', 'gcp']

const DEFAULT_SETTINGS: CloudCostSettings = {
  awsProfile: '',
  gcpBillingTable: '',
  gcpQueryProject: '',
  monthlyBudgetUsd: 0,
}

export interface CloudCostRefresherDeps {
  dataDir: string
  readDataKeyParsed<T>(key: string, fallback: T): Promise<T>
  broadcastDataChanged(key: string, source: 'main', rev: string | null): void
}

let deps: CloudCostRefresherDeps | null = null
let cache: CloudCostCache | null = null
let cycleInflight: Promise<CloudCostCache | null> | null = null
let cycleTimer: ReturnType<typeof setTimeout> | null = null

function normalizeSettings(raw: CloudCostSettings): CloudCostSettings {
  return {
    awsProfile: typeof raw?.awsProfile === 'string' ? raw.awsProfile.trim() : '',
    gcpBillingTable: typeof raw?.gcpBillingTable === 'string' ? raw.gcpBillingTable.trim() : '',
    gcpQueryProject: typeof raw?.gcpQueryProject === 'string' ? raw.gcpQueryProject.trim() : '',
    monthlyBudgetUsd: Number.isFinite(raw?.monthlyBudgetUsd) && raw.monthlyBudgetUsd >= 0
      ? raw.monthlyBudgetUsd
      : 0,
  }
}

async function fetchProvider(
  provider: CloudProvider,
  settings: CloudCostSettings,
  start: string,
  end: string,
): Promise<ProviderFetchResult> {
  try {
    const costs = provider === 'aws'
      ? await fetchAwsCosts(settings, start, end)
      : await fetchGcpCosts(settings, start, end, storedGcpCredentials())
    return { ok: true, ...costs }
  } catch (error) {
    const safeError = safeCloudCostError(error)
    console.error(`[Cloud costs] ${provider} refresh failed: ${safeError}`)
    return { ok: false, error: safeError }
  }
}

function storedGcpCredentials(): string | null {
  if (!hasKey(GCP_BILLING_KEY_SERVICE)) return null
  const value = getKey(GCP_BILLING_KEY_SERVICE)
  if (!value) throw new Error('GCP credentials: stored service account key is unavailable')
  return value
}

function gcpCredentialStatus(): { configured: boolean; email: string | null } {
  if (!hasKey(GCP_BILLING_KEY_SERVICE)) return { configured: false, email: null }
  try {
    const value = storedGcpCredentials()
    return { configured: true, email: value ? parseGcpServiceAccount(value).client_email : null }
  } catch {
    return { configured: true, email: null }
  }
}

export function storeGcpCredential(raw: string): string {
  if (raw.length > 20_000) throw new Error('Choose a GCP service account key smaller than 20 KB.')
  const credentials = parseGcpServiceAccount(raw)
  if (!saveKey(GCP_BILLING_KEY_SERVICE, JSON.stringify(credentials))) {
    throw new Error('Secure macOS storage is unavailable.')
  }
  return credentials.client_email
}

async function writeCache(next: CloudCostCache): Promise<void> {
  if (!deps) return
  const file = path.join(deps.dataDir, `${CACHE_KEY}.json`)
  await encryptAndWriteAsync(file, JSON.stringify(next))
  let rev: string | null = null
  try { rev = String((await fs.promises.stat(file)).mtimeMs) } catch { rev = String(Date.now()) }
  cache = next
  deps.broadcastDataChanged(CACHE_KEY, 'main', rev)
}

async function readSettings(): Promise<CloudCostSettings> {
  if (!deps) return DEFAULT_SETTINGS
  return normalizeSettings(await deps.readDataKeyParsed(SETTINGS_KEY, DEFAULT_SETTINGS))
}

async function runCycle(settingsOverride?: CloudCostSettings): Promise<CloudCostCache | null> {
  if (!deps) return null
  const settings = settingsOverride ? normalizeSettings(settingsOverride) : await readSettings()
  const window = billingWindow()
  const results: ProviderResults = {}

  await Promise.all(PROVIDERS.map(async (provider) => {
    if (!isProviderConfigured(provider, settings)) return
    results[provider] = await fetchProvider(provider, settings, window.start, window.end)
  }))

  const next = mergeProviderResults(cache, settings, results, window, new Date().toISOString())
  try {
    await writeCache(next)
    return next
  } catch {
    console.error('[Cloud costs] encrypted cache write failed')
    return cache
  }
}

export function refreshCloudCosts(settingsOverride?: CloudCostSettings): Promise<CloudCostCache | null> {
  if (cycleInflight) return cycleInflight
  cycleInflight = runCycle(settingsOverride).finally(() => { cycleInflight = null })
  return cycleInflight
}

export function cloudCostStatus(): Record<CloudProvider, CloudCostSourceStatus> {
  return cache?.sources ?? {
    aws: { configured: false, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null },
    gcp: { configured: false, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null },
  }
}

function scheduleNextCycle(delayMs: number): void {
  if (cycleTimer) clearTimeout(cycleTimer)
  const jitter = Math.random() * JITTER_MS
  cycleTimer = setTimeout(() => {
    void refreshCloudCosts().finally(() => { void scheduleFromCache() })
  }, Math.max(0, delayMs) + jitter)
}

async function scheduleFromCache(settingsOverride?: CloudCostSettings): Promise<void> {
  const settings = settingsOverride ? normalizeSettings(settingsOverride) : await readSettings()
  scheduleNextCycle(automaticRefreshDelayMs(cache, settings))
}

async function seedFromDisk(): Promise<void> {
  if (!deps) return
  cache = compatibleCloudCostCache(await deps.readDataKeyParsed<CloudCostCache | null>(CACHE_KEY, null))
}

export function startCloudCostRefresher(dependencies: CloudCostRefresherDeps): void {
  deps = dependencies
  ipcMain.handle('cloud-costs:gcp-credential-status', () => gcpCredentialStatus())
  ipcMain.handle('cloud-costs:gcp-credential-import', async (_event, raw: unknown) => {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'Choose a valid GCP service account key file.' }
    }
    try {
      const email = storeGcpCredential(raw)
      if (cycleInflight) await cycleInflight.catch(() => null)
      const result = await refreshCloudCosts()
      await scheduleFromCache()
      return { ok: true, email, source: result?.sources.gcp ?? null }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      return { ok: false, error: message.startsWith('Secure macOS storage') || message.includes('20 KB')
        ? message : 'Choose a valid GCP service account key file.' }
    }
  })
  ipcMain.handle('cloud-costs:gcp-credential-remove', async () => {
    const removed = deleteKey(GCP_BILLING_KEY_SERVICE)
    if (removed) {
      if (cycleInflight) await cycleInflight.catch(() => null)
      await refreshCloudCosts()
      await scheduleFromCache()
    }
    return removed
  })
  ipcMain.handle('cloud-costs:refresh', async (_event, settings?: CloudCostSettings) => {
    const result = await refreshCloudCosts(settings)
    await scheduleFromCache(settings)
    return result
  })
  ipcMain.handle('cloud-costs:status', () => cloudCostStatus())

  powerMonitor.on('resume', () => {
    void (async () => {
      const settings = await readSettings()
      if (automaticRefreshDelayMs(cache, settings) === 0) await refreshCloudCosts(settings)
      await scheduleFromCache()
    })()
  })

  void (async () => {
    await seedFromDisk()
    const settings = await readSettings()
    if (automaticRefreshDelayMs(cache, settings) === 0) await refreshCloudCosts(settings)
    await scheduleFromCache()
  })()
}
