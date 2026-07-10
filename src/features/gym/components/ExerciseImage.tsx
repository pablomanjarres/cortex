import { useEffect, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { findExerciseMedia, type ExerciseMedia } from '@/lib/exercise-media'
import { cn } from '@/lib/utils'

interface ExerciseImageProps {
  name: string
  className?: string
  showBadge?: boolean // muscle/equipment overlay — off for small thumbnails
}

/** Cycles the DB's start/end frames for a pseudo-GIF; falls back to a placeholder on miss/error. */
export function ExerciseImage({ name, className = '', showBadge = true }: ExerciseImageProps) {
  const [media, setMedia] = useState<ExerciseMedia | null | undefined>(undefined) // undefined = loading
  const [frame, setFrame] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setMedia(undefined)
    setFailed(false)
    setFrame(0)
    findExerciseMedia(name).then((m) => {
      if (alive) setMedia(m)
    })
    return () => {
      alive = false
    }
  }, [name])

  useEffect(() => {
    if (!media || media.images.length < 2) return
    const id = setInterval(() => setFrame((f) => (f + 1) % media.images.length), 1200)
    return () => clearInterval(id)
  }, [media])

  if (media === undefined) {
    return <Skeleton className={cn('rounded-xl', className)} />
  }

  if (!media || failed) {
    return (
      <div className={cn('flex items-center justify-center rounded-xl bg-secondary', className)}>
        <Dumbbell className="h-8 w-8 text-foreground-faint" />
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-white', className)}>
      <img
        src={media.images[frame]}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
      {showBadge && media.primaryMuscles?.[0] && (
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-2xs capitalize text-white backdrop-blur-sm">
          {media.primaryMuscles[0]}
          {media.equipment ? ` · ${media.equipment}` : ''}
        </span>
      )}
    </div>
  )
}
