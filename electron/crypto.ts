import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { saveKey, getKey } from './keychain.js'

const MAGIC = Buffer.from('CTX1')
const VERSION = 1
const IV_LEN = 12
const TAG_LEN = 16
const HEADER_LEN = MAGIC.length + 2 + IV_LEN + TAG_LEN // 34 bytes
const KEY_SERVICE = 'cortex-data-encryption-key'

let _masterKey: Buffer | null = null
let _encryptionAvailable = false

export function initEncryption(): boolean {
  try {
    const existing = getKey(KEY_SERVICE)
    if (existing) {
      _masterKey = Buffer.from(existing, 'base64')
      if (_masterKey.length !== 32) {
        console.error('[Cortex] Encryption key has wrong length, regenerating')
        _masterKey = null
      }
    }

    if (!_masterKey) {
      const newKey = crypto.randomBytes(32)
      if (!saveKey(KEY_SERVICE, newKey.toString('base64'))) {
        console.warn('[Cortex] safeStorage unavailable — cannot store encryption key')
        return false
      }
      _masterKey = newKey
      console.log('[Cortex] Generated new data encryption key')
    }

    _encryptionAvailable = true
    return true
  } catch (e) {
    console.error('[Cortex] Encryption init failed:', e)
    return false
  }
}

export function isEncryptionEnabled(): boolean {
  return _encryptionAvailable
}

export function encrypt(plaintext: string): Buffer {
  if (!_masterKey) throw new Error('Encryption not initialized')
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv('aes-256-gcm', _masterKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()

  const version = Buffer.alloc(2)
  version.writeUInt16BE(VERSION)

  return Buffer.concat([MAGIC, version, iv, tag, encrypted])
}

export function decrypt(data: Buffer): string {
  if (!_masterKey) throw new Error('Encryption not initialized')
  if (data.length < HEADER_LEN) throw new Error('Encrypted data too short')
  if (!data.subarray(0, 4).equals(MAGIC)) throw new Error('Invalid magic header')

  const iv = data.subarray(6, 6 + IV_LEN)
  const tag = data.subarray(6 + IV_LEN, 6 + IV_LEN + TAG_LEN)
  const ciphertext = data.subarray(HEADER_LEN)

  const decipher = crypto.createDecipheriv('aes-256-gcm', _masterKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8')
}

export function isEncryptedBuffer(data: Buffer): boolean {
  return data.length >= 4 && data.subarray(0, 4).equals(MAGIC)
}

export function encryptAndWrite(filePath: string, jsonString: string): void {
  const tmpFile = filePath + '.tmp'
  if (_encryptionAvailable) {
    const encrypted = encrypt(jsonString)
    fs.writeFileSync(tmpFile, encrypted)
  } else {
    fs.writeFileSync(tmpFile, jsonString, 'utf-8')
  }
  fs.renameSync(tmpFile, filePath)
}

export function readAndDecrypt(filePath: string): string {
  const data = fs.readFileSync(filePath)
  if (_encryptionAvailable && isEncryptedBuffer(data)) {
    return decrypt(data)
  }
  return data.toString('utf-8')
}

function collectJsonFiles(dir: string, recursive: boolean): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(full)
    } else if (recursive && entry.isDirectory()) {
      files.push(...collectJsonFiles(full, true))
    }
  }
  return files
}

export function migrateToEncrypted(dataDir: string, backupDir: string): void {
  if (!_encryptionAvailable) return
  const sentinel = path.join(dataDir, '.encrypted')
  if (fs.existsSync(sentinel)) return

  console.log('[Cortex] Migrating data files to encrypted format...')
  let migrated = 0
  let skipped = 0
  let failed = 0

  const allFiles = [
    ...collectJsonFiles(dataDir, false),
    ...collectJsonFiles(backupDir, true),
  ]

  for (const file of allFiles) {
    try {
      const data = fs.readFileSync(file)
      if (isEncryptedBuffer(data)) { skipped++; continue }
      // Validate it's parseable JSON before encrypting
      const text = data.toString('utf-8')
      JSON.parse(text)
      encryptAndWrite(file, text)
      migrated++
    } catch (e) {
      console.warn(`[Cortex] Migration: failed to encrypt ${path.basename(file)}:`, e)
      failed++
    }
  }

  // Also handle .gz backup
  const gzFile = path.join(backupDir, 'cortex-backup-latest.json.gz')
  if (fs.existsSync(gzFile)) {
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(gzFile))
      if (!isEncryptedBuffer(raw)) {
        const text = raw.toString('utf-8')
        JSON.parse(text)
        const encrypted = encrypt(text)
        fs.writeFileSync(gzFile + '.tmp', zlib.gzipSync(encrypted))
        fs.renameSync(gzFile + '.tmp', gzFile)
        migrated++
      }
    } catch { /* gz migration optional */ }
  }

  if (failed === 0) {
    fs.writeFileSync(sentinel, JSON.stringify({ migratedAt: new Date().toISOString(), version: VERSION }))
  }

  console.log(`[Cortex] Migration complete: ${migrated} encrypted, ${skipped} already encrypted, ${failed} failed`)
}

