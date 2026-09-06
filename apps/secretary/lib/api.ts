const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('token') || ''
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  return res.json()
}

export async function fetchFloat() {
  return apiFetch('/diaspora/admin/float')
}

export async function postAddFloat(amount: number, phone: string, note: string) {
  return apiFetch('/diaspora/admin/float/add', {
    method: 'POST',
    body: JSON.stringify({ amount, phone, note }),
  })
}

export async function fetchPendingDeals() {
  return apiFetch('/diaspora/admin/pending')
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token')
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  window.location.href = "/login"
  }
}

export async function loginStaff(phone: string, pin: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  })
  const data = await res.json()
  if (data.success && data.accessToken) {
    localStorage.setItem("token", data.accessToken)
    localStorage.setItem("accessToken", data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken || '')
  }
  return data
}

export async function confirmDeal(id: string, bankRef: string) {
  return apiFetch(`/diaspora/${id}/confirm-deposit`, { method: 'POST', body: JSON.stringify({ bankRef }) })
}

export async function rejectDeal(id: string, reason?: string) {
  return apiFetch(`/diaspora/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function fetchDisputesAPI() {
  return apiFetch('/diaspora/admin/disputes')
}

export async function resolveDisputeAPI(
  disputeId: string,
  resolution: 'REFUND_FUNDER' | 'RELEASE_TO_WORKER',
  adminNotes?: string
) {
  const decision = resolution === 'FAVOR_FUNDER' ? 'refund' : 'release'
  return apiFetch(`/diaspora/admin/disputes/${disputeId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decision, resolution: resolution === 'FAVOR_FUNDER' ? 'REFUND_FUNDER' : 'RELEASE_TO_WORKER', adminNotes }),
  })
}

export async function dismissDisputeAPI(disputeId: string) {
  return apiFetch(`/diaspora/admin/disputes/${disputeId}/dismiss`, {
    method: 'DELETE',
  })
}

export async function fetchActivityLogs(page: number = 1, limit: number = 20) {
  return apiFetch(`/diaspora/admin/logs?page=${page}&limit=${limit}`)
}

export async function fetchAllDeals() {
  return apiFetch('/diaspora/admin/deals')
}

