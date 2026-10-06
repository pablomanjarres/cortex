import { useEffect, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { Skeleton } from '@/components/shared/Skeleton'
import { findExerciseMedia, type ExerciseMedia } from '@/lib/exercise-media'
import { cn } from '@/lib/utils'

interface ExerciseImageProps {
  name: string
  gifMediaId?: string
  className?: string
  showBadge?: boolean // muscle/equipment overlay — off for small thumbnails
  animated?: boolean
}

export function ExerciseImage(props: ExerciseImageProps) {
  return <ExerciseImageResource key={props.name.trim().toLowerCase()} {...props} />
}

/** Static movement thumbnail, with optional start/end animation for exercise guides. */
function ExerciseImageResource({ name, gifMediaId, className = '', showBadge = true, animated = false }: ExerciseImageProps) {
  const reduceMotion = useReducedMotion()
  const [media, setMedia] = useState<ExerciseMedia | null | undefined>(undefined) // undefined = loading
  const [frame, setFrame] = useState(0)
  const [failed, setFailed] = useState(false)
  const [failedGif, setFailedGif] = useState<{ name: string; id?: string } | null>(null)
  const skipGif = failedGif?.name === name && failedGif.id === gifMediaId

  useEffect(() => setFailedGif(null), [name, gifMediaId])

  useEffect(() => {
    let alive = true
    setMedia(undefined)
    setFailed(false)
    setFrame(0)
    findExerciseMedia(name, skipGif ? undefined : gifMediaId).then((m) => {
      if (alive) setMedia(m)
    })
    return () => {
      alive = false
    }
  }, [name, gifMediaId, skipGif])

  useEffect(() => {
    if (!animated || reduceMotion || !media || media.images.length < 2) return
    const id = setInterval(() => setFrame((f) => (f + 1) % media.images.length), 1200)
    return () => clearInterval(id)
  }, [media, animated, reduceMotion])

  if (media === undefined) {
    return <Skeleton className={cn('rounded-xl', className)} />
  }

  if (!media || failed) {
    return (
      <div role="img" aria-label={`${name}: image unavailable`} className={cn('flex items-center justify-center rounded-xl bg-secondary', className)}>
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
        onError={() => {
          if (media.gifMediaId) setFailedGif({ name, id: gifMediaId })
          else setFailed(true)
        }}
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
