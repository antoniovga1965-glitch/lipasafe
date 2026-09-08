import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDisputesAPI } from '@/lib/api'

export interface SecretaryNotification {
  id: string
  type: 'NEW_DISPUTE' | 'BANK_DETAILS_RECEIVED'
  title: string
  body: string
  disputeId: string
  timestamp: string
  read: boolean
}

const KEY = 'lipa_secretary_notifs_v1'

function load(): SecretaryNotification[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function save(n: SecretaryNotification[]) {
  localStorage.setItem(KEY, JSON.stringify(n.slice(0, 50)))
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<SecretaryNotification[]>([])
  const prevRef = useRef<Record<string, any>>({})
  const ready   = useRef(false)

  const poll = useCallback(async () => {
    try {
      const data = await fetchDisputesAPI()
      if (!data.success || !Array.isArray(data.data?.disputes)) return

      const fresh: SecretaryNotification[] = []
      const now = new Date().toISOString()

      for (const d of data.data.disputes) {
        const prev = prevRef.current[d.id]

        // New dispute appeared after initial load
        if (!prev && ready.current) {
          fresh.push({
            id: `dispute-new-${d.id}`,
            type: 'NEW_DISPUTE',
            title: 'New Dispute Raised',
            body: `${d.id.slice(0, 8).toUpperCase()} — KES ${Number(d.amountAtStake ?? 0).toLocaleString()} at stake`,
            disputeId: d.id,
            timestamp: d.createdAt ?? now,
            read: false,
          })
        }

        // Client just submitted bank details
        if (prev && !prev.refundBankName && d.refundBankName) {
          fresh.push({
            id: `bank-${d.id}`,
            type: 'BANK_DETAILS_RECEIVED',
            title: 'Bank Details Received',
            body: `${d.refundBankName} | ${d.refundAccountNo} — dispute ${d.id.slice(0, 8).toUpperCase()}`,
            disputeId: d.id,
            timestamp: now,
            read: false,
          })
        }

        prevRef.current[d.id] = d
      }

      ready.current = true

      if (fresh.length > 0) {
        setNotifications(prev => {
          const deduped = [...fresh, ...prev.filter(p => !fresh.find(f => f.id === p.id))]
          save(deduped)
          return deduped
        })
      }
    } catch {}
  }, [])

  useEffect(() => {
    setNotifications(load())
    poll()
    const id = setInterval(poll, 15_000)
    return () => clearInterval(id)
  }, [poll])

  const markAllRead = useCallback(() => {
    setNotifications(prev => { const u = prev.map(n => ({ ...n, read: true })); save(u); return u })
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications(prev => { const u = prev.map(n => n.id === id ? { ...n, read: true } : n); save(u); return u })
  }, [])

  return {
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    markAllRead,
    markRead,
  }
}
