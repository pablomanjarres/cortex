import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseCortexRef, type CortexRefKind } from '../../electron/knowledge/refs'

/**
 * A screen selection (tab, record) kept in the hash URL's query, so links such
 * as `#/social?tab=crm&record=crm%3Aid` open that exact view. Values outside
 * `allowed` fall back to `fallback`. Updates replace the history entry.
 */
export function useUrlParam<T extends string>(name: string, fallback: T, allowed?: readonly T[]): [T, (value: T | null) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(name)
  const value = raw !== null && (!allowed || allowed.includes(raw as T)) ? raw as T : fallback
  const setValue = useCallback((next: T | null) => {
    setParams((current) => {
      const updated = new URLSearchParams(current)
      if (next === null || next === fallback) updated.delete(name)
      else updated.set(name, next)
      return updated
    }, { replace: true })
  }, [name, fallback, setParams])
  return [value, setValue]
}

/** The id of the `?record=` reference when it is of the given kind, e.g. 'crm' → contact id. */
export function useRecordParam(kind: CortexRefKind): string | null {
  const [params] = useSearchParams()
  const ref = parseCortexRef(params.get('record'))
  return ref?.kind === kind ? ref.id : null
}

/**
 * Calls `open` once for each new non-null key, during render like a state
 * update, so a deep link opens its record exactly once and the user can close
 * it again. `open` must only set the calling component's own state. Returns the
 * last opened key.
 */
export function useOpenOnce(key: string | null, open: (key: string) => void): string | null {
  const [opened, setOpened] = useState<string | null>(null)
  if (key !== null && key !== opened) {
    setOpened(key)
    open(key)
  }
  return opened
}

/** Smoothly centres the element with this id after the next paint whenever the id changes; null does nothing. */
export function useScrollIntoView(elementId: string | null): void {
  useEffect(() => {
    if (!elementId) return
    const frame = requestAnimationFrame(() => document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [elementId])
}
