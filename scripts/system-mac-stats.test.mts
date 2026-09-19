import test from 'node:test'
import assert from 'node:assert/strict'
import { selectPrimaryDisk, type MacDisk } from '../src/features/system/mac-stats.ts'

const sharedApfsSize = 494_350_000_000
const volumes: MacDisk[] = [
  { device_name: '/dev/disk3s1s1', mnt_point: '/', fs_type: 'apfs', size: sharedApfsSize, used: 12_600_000_000, free: 146_900_000_000, percent: 9.5 },
  { device_name: '/dev/disk3s6', mnt_point: '/System/Volumes/VM', fs_type: 'apfs', size: sharedApfsSize, used: 3_000_000_000, free: 146_900_000_000, percent: 2.3 },
  { device_name: '/dev/disk3s2', mnt_point: '/System/Volumes/Preboot', fs_type: 'apfs', size: sharedApfsSize, used: 8_400_000_000, free: 146_900_000_000, percent: 6.3 },
  { device_name: '/dev/disk3s4', mnt_point: '/System/Volumes/Update', fs_type: 'apfs', size: sharedApfsSize, used: 6_600_000, free: 146_900_000_000, percent: 0.1 },
  { device_name: '/dev/disk3s5', mnt_point: '/System/Volumes/Data', fs_type: 'apfs', size: sharedApfsSize, used: 347_450_000_000, free: 146_900_000_000, percent: 74.2 },
]

test('selectPrimaryDisk shows the Data volume rather than a shared-space APFS system mount', () => {
  assert.equal(selectPrimaryDisk(volumes)?.mnt_point, '/System/Volumes/Data')
  assert.equal(selectPrimaryDisk(volumes)?.used, 347_450_000_000)
  assert.equal(volumes[0].mnt_point, '/') // selection must not reorder the Glances payload
})

test('selectPrimaryDisk falls back to the root volume when Data is unavailable', () => {
  assert.equal(selectPrimaryDisk(volumes.slice(0, 4))?.mnt_point, '/')
})

test('selectPrimaryDisk ignores a zero-sized Data volume', () => {
  const missingData = { ...volumes[4], size: 0 }
  assert.equal(selectPrimaryDisk([...volumes.slice(0, 4), missingData])?.mnt_point, '/')
})

test('selectPrimaryDisk uses the largest usable volume when neither Data nor root exists', () => {
  const otherVolumes: MacDisk[] = [
    { ...volumes[0], mnt_point: '/Volumes/Backup', size: 1_000_000_000 },
    { ...volumes[0], mnt_point: '/Volumes/Work', size: 2_000_000_000 },
  ]
  assert.equal(selectPrimaryDisk(otherVolumes)?.mnt_point, '/Volumes/Work')
})

test('selectPrimaryDisk returns null when Glances reports no volumes', () => {
  assert.equal(selectPrimaryDisk([]), null)
})
