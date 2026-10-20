export interface MacDisk {
  device_name: string
  mnt_point: string
  size: number
  used: number
  free: number
  percent: number
  fs_type: string
}

/** APFS system mounts share capacity; Data reflects the user's actual storage. */
export function selectPrimaryDisk(disks: readonly MacDisk[]): MacDisk | null {
  const usable = disks.filter((disk) => Number.isFinite(disk.size) && disk.size > 0)
  return usable.find((disk) => disk.mnt_point === '/System/Volumes/Data')
    ?? usable.find((disk) => disk.mnt_point === '/')
    ?? usable.sort((a, b) => b.size - a.size)[0]
    ?? null
}
