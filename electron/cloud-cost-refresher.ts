import fs from 'fs'
import path from 'path'
import { ipcMain, powerMonitor } from 'electron'
import { encryptAndWriteAsync } from './crypto.js'
import type {
  CloudCostCache,
  CloudCostSettings,
  CloudCostSourceStatus,
  CloudProvider,
} from './cloud-cost-types.js'
import {
  billingWindow,
  isProviderConfigured,
  mergeProviderResults,
  safeCloudCostError,
  type ProviderFetchResult,
  type ProviderResults,
} from './cloud-cost-refresh-state.js'
import { fetchAwsCosts } from './integrations/aws-costs.js'
import { fetchGcpCosts } from './integrations/gcp-costs.js'

const CACHE_KEY = 'cortex-cloud-costs'
const SETTINGS_KEY = 'cortex-cloud-cost-settings'
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const JITTER_MS = 10 * 60 * 1000
const RESUME_MIN_AGE_MS = 30 * 60 * 1000
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
    const items = provider === 'aws'
      ? await fetchAwsCosts(settings, start, end)
      : await fetchGcpCosts(settings, start, end)
    return { ok: true, items }
  } catch (error) {
    const safeError = safeCloudCostError(error)
    console.error(`[Cloud costs] ${provider} refresh failed: ${safeError}`)
    return { ok: false, error: safeError }
  }
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

async function runCycle(): Promise<CloudCostCache | null> {
  if (!deps) return null
  const settings = normalizeSettings(await deps.readDataKeyParsed(SETTINGS_KEY, DEFAULT_SETTINGS))
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

export function refreshCloudCosts(): Promise<CloudCostCache | null> {
  if (cycleInflight) return cycleInflight
  cycleInflight = runCycle().finally(() => { cycleInflight = null })
  return cycleInflight
}

export function cloudCostStatus(): Record<CloudProvider, CloudCostSourceStatus> {
  return cache?.sources ?? {
    aws: { configured: false, ok: false, fetchedAt: null, error: null },
    gcp: { configured: false, ok: false, fetchedAt: null, error: null },
  }
}

function scheduleNextCycle(): void {
  if (cycleTimer) clearTimeout(cycleTimer)
  const jitter = (Math.random() * 2 - 1) * JITTER_MS
  cycleTimer = setTimeout(() => {
    void refreshCloudCosts().finally(scheduleNextCycle)
  }, REFRESH_INTERVAL_MS + jitter)
}

async function seedFromDisk(): Promise<void> {
  if (!deps) return
  cache = await deps.readDataKeyParsed<CloudCostCache | null>(CACHE_KEY, null)
}

export function startCloudCostRefresher(dependencies: CloudCostRefresherDeps): void {
  deps = dependencies
  ipcMain.handle('cloud-costs:refresh', () => refreshCloudCosts())
  ipcMain.handle('cloud-costs:status', () => cloudCostStatus())

  powerMonitor.on('resume', () => {
    const age = cache?.fetchedAt ? Date.now() - new Date(cache.fetchedAt).getTime() : Infinity
    if (age >= RESUME_MIN_AGE_MS) void refreshCloudCosts()
  })

  void (async () => {
    await seedFromDisk()
    const age = cache?.fetchedAt ? Date.now() - new Date(cache.fetchedAt).getTime() : Infinity
    if (age >= REFRESH_INTERVAL_MS) await refreshCloudCosts()
    scheduleNextCycle()
  })()
}
