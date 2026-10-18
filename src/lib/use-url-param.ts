import { useCallback } from 'react'
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
