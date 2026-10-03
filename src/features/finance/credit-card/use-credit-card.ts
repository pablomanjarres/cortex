import { useEffect, useRef, useState } from 'react'
import { readStoreWithRev, useStore } from '@/lib/store'
import { CREDIT_CARD_KEY, type CreditCardCommand, type CreditCardCommandResult, type CreditCardState } from '../../../../electron/credit-card-types'
import { emptyCreditCardState } from '../../../../electron/credit-card-model'

export type CardMutation = CreditCardCommand extends infer Command
  ? Command extends CreditCardCommand ? Omit<Command, 'requestId'> : never : never
export type SaveCardCommand = (command: CardMutation) => Promise<boolean>
const fallback = emptyCreditCardState()

export function useCreditCard() {
  const [stored] = useStore<CreditCardState>(CREDIT_CARD_KEY, fallback)
  const [committed, setCommitted] = useState<CreditCardState | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const retry = useRef<{ json: string; requestId: string } | null>(null)
  const state = committed && !stored.requests.includes(committed.requests.at(-1) ?? '') ? committed : stored

  useEffect(() => {
    let active = true
    readStoreWithRev<CreditCardState>(CREDIT_CARD_KEY).then(({ data, rev }) => {
      if (!active) return
      if (!data && rev !== null) setError('The card ledger could not be read. Reload Cortex to retry.')
      setLoading(false)
    }).catch(() => {
      if (active) { setError('The card ledger could not be loaded.'); setLoading(false) }
    })
    return () => { active = false }
  }, [])

  const command: SaveCardCommand = async (mutation) => {
    if (inFlight.current) return false
    inFlight.current = true
    setPending(true)
    setError(null)
    const json = JSON.stringify(mutation)
    if (retry.current?.json !== json) retry.current = { json, requestId: crypto.randomUUID() }
    const payload = { ...mutation, requestId: retry.current.requestId } as CreditCardCommand
    try {
      let result: CreditCardCommandResult
      if (window.electronAPI?.creditCard) result = await window.electronAPI.creditCard.command(payload)
      else {
        const response = await fetch('/api/credit-card/command', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
        })
        result = await response.json()
        if (!response.ok && result.ok) throw new Error('The card command could not be saved.')
      }
      if (!result.ok) throw new Error(result.error)
      setCommitted(result.state)
      retry.current = null
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The card command could not be saved.')
      return false
    } finally { inFlight.current = false; setPending(false) }
  }
  return { state, loading, pending, error, command }
}
