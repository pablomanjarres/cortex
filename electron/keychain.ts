import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const KEYS_FILE = () => path.join(app.getPath('userData'), 'cortex-keys.enc')

interface StoredKeys {
  [service: string]: string // base64-encoded encrypted value
}

function readStore(): StoredKeys {
  try {
    const data = fs.readFileSync(KEYS_FILE(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function writeStore(store: StoredKeys) {
  fs.writeFileSync(KEYS_FILE(), JSON.stringify(store, null, 2))
}

export function saveKey(service: string, value: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const encrypted = safeStorage.encryptString(value)
  const store = readStore()
  store[service] = encrypted.toString('base64')
  writeStore(store)
  return true
}

export function getKey(service: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore()
  const encrypted = store[service]
  if (!encrypted) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

export function deleteKey(service: string): boolean {
  const store = readStore()
  delete store[service]
  writeStore(store)
  return true
}

export function hasKey(service: string): boolean {
  const store = readStore()
  return !!store[service]
}

export function listKeys(): string[] {
  const store = readStore()
  return Object.keys(store)
}
