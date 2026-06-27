
// ─── THEME & UTILS ───────────────────────────────────────────────────────────
const formatKES = (amount) => `KES ${amount.toLocaleString('en-KE')}`;
const formatPhone = (phone) => (phone || '—').replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ─── REALISTIC KENYAN DATA ───────────────────────────────────────────────────
const KENYAN_NAMES = [
  'James Mwangi', 'Grace Wanjiku', 'Peter Ochieng', 'Amina Hassan',
  'David Kimani', 'Faith Njeri', 'Brian Otieno', 'Lucy Akinyi',
  'John Kamau', 'Mary Wambui', 'Kevin Mutua', 'Sarah Achieng',
  'Daniel Njoroge', 'Joyce Muthoni', 'Eric Omondi', 'Cynthia Wangari',
  'Samuel Kipchoge', 'Diana Chebet', 'Allan Wekesa', 'Ruth Mwikali',
  'Victor Onyango', 'Esther Wairimu', 'Paul Mbugua', 'Nancy Jepchirchir',
  'George Muriuki', 'Lilian Moraa', 'Tony Kariuki', 'Beatrice Nyambura',
  'Francis Mwenda', 'Catherine Muthoni'
];

const SERVICE_TYPES = ['Bundles', 'Second Hand', 'Fundi', 'Delivery', 'House', 'Custom'];
const DISPUTE_REASONS = [
  'Item not as described', 'Service incomplete', 'Late delivery', 
  'Damaged goods', 'Payment dispute', 'Quality issues', 'Fraud suspicion',
  'Wrong item delivered', 'Contract breach', 'Unauthorized transaction'
];

const generateId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// Generate users
const USERS = Array.from({ length: 45 }, (_, i) => ({
  id: `USR-${1000 + i}`,
  name: KENYAN_NAMES[i % KENYAN_NAMES.length],
  phone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  kycTier: ['Unverified', 'Basic', 'Verified', 'Premium'][Math.floor(Math.random() * 4)],
  walletBalance: Math.floor(Math.random() * 50000) + 500,
  status: Math.random() > 0.15 ? 'Active' : 'Suspended',
  joined: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
  email: `${KENYAN_NAMES[i % KENYAN_NAMES.length].toLowerCase().replace(' ', '.')}@gmail.com`,
  location: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika'][Math.floor(Math.random() * 6)],
  transactions: Math.floor(Math.random() * 50) + 1,
}));

// Generate escrows
const ESCROWS = Array.from({ length: 60 }, (_, i) => ({
  id: generateId('ESC'),
  serviceType: SERVICE_TYPES[Math.floor(Math.random() * SERVICE_TYPES.length)],
  buyer: KENYAN_NAMES[Math.floor(Math.random() * KENYAN_NAMES.length)],
  buyerPhone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  seller: KENYAN_NAMES[Math.floor(Math.random() * KENYAN_NAMES.length)],
  sellerPhone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  amount: Math.floor(Math.random() * 45000) + 1000,
  status: ['Pending', 'Active', 'Completed', 'Disputed', 'Refunded', 'Released'][Math.floor(Math.random() * 6)],
  createdAt: new Date(2025, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1).toISOString(),
  description: [
    'iPhone 14 Pro Max 256GB', 'Plumbing repair - Westlands', 'Safaricom 10GB bundle',
    'House deposit - Kilimani', 'Furniture delivery - Ngong Rd', 'Custom web design project',
    'Samsung Galaxy S23', 'Electrical wiring - Kileleshwa', 'Airtel 5GB monthly',
    '2-bedroom apartment deposit', 'Motorcycle delivery - CBD', 'Logo design + branding'
  ][Math.floor(Math.random() * 12)],
}));

// Generate disputes
const DISPUTES = Array.from({ length: 25 }, (_, i) => ({
  id: generateId('DSP'),
  escrowId: ESCROWS[i % ESCROWS.length].id,
  serviceType: SERVICE_TYPES[Math.floor(Math.random() * SERVICE_TYPES.length)],
  buyer: KENYAN_NAMES[Math.floor(Math.random() * KENYAN_NAMES.length)],
  buyerPhone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  seller: KENYAN_NAMES[Math.floor(Math.random() * KENYAN_NAMES.length)],
  sellerPhone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  amount: Math.floor(Math.random() * 30000) + 2000,
  reason: DISPUTE_REASONS[Math.floor(Math.random() * DISPUTE_REASONS.length)],
  status: ['Open', 'Escalated', 'Resolved'][Math.floor(Math.random() * 3)],
  createdAt: new Date(2025, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1).toISOString(),
  llmConfidence: Math.floor(Math.random() * 40) + 55,
  buyerClaim: 'The item delivered was significantly different from what was advertised. The seller promised an original iPhone but delivered a refurbished unit with a cracked screen.',
  sellerCounter: 'The buyer is being unreasonable. The listing clearly stated "refurbished with minor cosmetic damage." Photos were provided. Buyer accepted the terms before payment.',
  buyerPhotos: 3,
  sellerPhotos: 2,
  resolution: i < 8 ? ['Refunded Buyer', 'Released to Seller', 'Partial Refund'][Math.floor(Math.random() * 3)] : null,
  resolutionNote: i < 8 ? 'After reviewing all evidence, the decision was made based on platform policy section 4.2.' : '',
}));

// Generate M-Pesa logs
const MPESA_LOGS = Array.from({ length: 50 }, (_, i) => ({
  id: generateId('MP'),
  type: Math.random() > 0.5 ? 'STK Push' : 'B2C Payout',
  phone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  amount: Math.floor(Math.random() * 20000) + 500,
  status: Math.random() > 0.15 ? 'Success' : 'Failed',
  reference: `LIP${Math.floor(Math.random() * 999999)}`,
  merchantRequestId: `MR-${Math.random().toString(36).substr(2, 10).toUpperCase()}`,
  checkoutRequestId: `ws_CO_${Math.random().toString(36).substr(2, 15).toUpperCase()}`,
  timestamp: new Date(2025, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)).toISOString(),
  errorMessage: Math.random() > 0.85 ? 'STK push timeout - user did not enter PIN' : null,
}));

// Generate KYC queue
const KYC_QUEUE = Array.from({ length: 12 }, (_, i) => ({
  id: `KYC-${2000 + i}`,
  name: KENYAN_NAMES[i % KENYAN_NAMES.length],
  phone: `07${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 899 + 100)}`,
  idNumber: `${Math.floor(Math.random() * 89 + 10)}${Math.floor(Math.random() * 8999999 + 1000000)}`,
  submittedAt: new Date(2025, 5, Math.floor(Math.random() * 14) + 1).toISOString(),
  idPhoto: `https://picsum.photos/seed/${i + 100}/400/250`,
  selfiePhoto: `https://picsum.photos/seed/${i + 200}/400/400`,
  status: 'Pending',
}));

// Generate audit logs
const AUDIT_LOGS = Array.from({ length: 80 }, (_, i) => ({
  id: generateId('AUD'),
  actor: ['Admin James', 'Supervisor Grace', 'Support Peter', 'Manager Amina', 'Admin David'][Math.floor(Math.random() * 5)],
  action: ['Approved KYC', 'Resolved Dispute', 'Suspended User', 'Released Escrow', 'Refunded Buyer', 'Force Released', 'Updated Settings', 'Verified Payment', 'Rejected KYC', 'Reactivated User'][Math.floor(Math.random() * 10)],
  target: [KENYAN_NAMES[Math.floor(Math.random() * KENYAN_NAMES.length)], `ESC-${Math.floor(Math.random() * 999999)}`, `USR-${1000 + Math.floor(Math.random() * 45)}`, `KYC-${2000 + Math.floor(Math.random() * 12)}`][Math.floor(Math.random() * 4)],
  timestamp: new Date(2025, 5, Math.floor(Math.random() * 14) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)).toISOString(),
  ip: `197.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
  details: 'Action performed via admin dashboard with full authorization.',
}));

// ─── SHARED COMPONENTS ─────────────────────────────────────────────────────────

const StatusBadge = ({ status, size = 'md' }) => {
  const styles = {
    Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Pending: 'bg-amber-100 text-amber-700 border-amber-200',
    Completed: 'bg-blue-100 text-blue-700 border-blue-200',
    Disputed: 'bg-red-100 text-red-700 border-red-200',
    Refunded: 'bg-gray-100 text-gray-700 border-gray-200',
    Released: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Suspended: 'bg-red-100 text-red-700 border-red-200',
    Open: 'bg-red-100 text-red-700 border-red-200',
    Escalated: 'bg-orange-100 text-orange-700 border-orange-200',
    Resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Failed: 'bg-red-100 text-red-700 border-red-200',
    Unverified: 'bg-gray-100 text-gray-600 border-gray-200',
    Basic: 'bg-blue-100 text-blue-700 border-blue-200',
    Verified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Premium: 'bg-purple-100 text-purple-700 border-purple-200',
  };
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';
  return (
    <span className={`inline-flex items-center rounded-full border ${sizeClasses} ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
};

const Pagination = ({ currentPage, totalPages, onPageChange }) => (
  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
    <div className="text-sm text-gray-500">
      Page {currentPage} of {totalPages}
    </div>
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        let page;
        if (totalPages <= 5) page = i + 1;
        else if (currentPage <= 3) page = i + 1;
        else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
        else page = currentPage - 2 + i;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
              currentPage === page 
                ? 'bg-[#35a089] text-white' 
                : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            {page}
          </button>
        );
      })}
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(90vh-4rem)]">
          {children}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, change, changeType, icon: Icon, color }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
        <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${changeType === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
          {changeType === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span>{change}</span>
          <span className="text-gray-400 font-normal">vs last month</span>
        </div>
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
  </div>
);

// ─── SCREEN 1: DASHBOARD OVERVIEW ────────────────────────────────────────────

const UserManagement = ({ token }) => {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionUser, setActionUser] = useState(null)
  const [newStatus, setNewStatus] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const fetchUsers = (p = 1, status = statusFilter, q = search) => {
    setLoading(true)
    if (q) {
      apiFetch(`/admin/users/search?q=${encodeURIComponent(q)}`, token)
        .then(d => {
          if (d.success) { setUsers(d.data); setTotal(d.data.length); setPages(1) }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    } else {
      const qs = new URLSearchParams({ page: p, limit: 20, ...(status ? { status } : {}) })
      apiFetch(`/admin/users?${qs}`, token)
        .then(d => {
          if (d.success) { setUsers(d.data); setTotal(d.total); setPages(d.pages); setPage(d.page) }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }

  useEffect(() => { fetchUsers(1) }, [statusFilter])

  const handleSearch = () => {
    setSearch(searchInput)
    if (searchInput) {
      setLoading(true)
      apiFetch(`/admin/users/search?q=${encodeURIComponent(searchInput)}`, token)
        .then(d => { if (d.success) { setUsers(d.data); setTotal(d.data.length); setPages(1) } })
        .catch(console.error)
        .finally(() => setLoading(false))
    } else {
      fetchUsers(1)
    }
  }

  const handleClearSearch = () => {
    setSearchInput(''); setSearch('')
    fetchUsers(1, statusFilter, '')
  }

  const handleStatusUpdate = async () => {
    if (!actionUser || !newStatus) return
    setActionLoading(true)
    try {
      const d = await apiFetch(`/admin/users/${actionUser.id}/status`, token, {
        method: 'PATCH', body: JSON.stringify({ status: newStatus }),
      })
      if (d.success) {
        setMsg({ type: 'success', text: `User ${newStatus} successfully` })
        setActionUser(null); setNewStatus('')
        fetchUsers(page)
      } else {
        setMsg({ type: 'error', text: d.message || 'Failed to update status' })
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setActionLoading(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }

  const statusColor = s => ({
    active:    'bg-green-100 text-green-700',
    suspended: 'bg-yellow-100 text-yellow-700',
    frozen:    'bg-blue-100 text-blue-700',
    banned:    'bg-red-100 text-red-700',
  }[s] || 'bg-gray-100 text-gray-600')

  const kycColor = s => ({
    verified: 'bg-green-100 text-green-700',
    pending:  'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-700',
  }[s] || 'bg-gray-100 text-gray-600')

  return (
    <div className="p-6 space-y-5">
      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2 flex-1 min-w-[220px]">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35a089]"
            placeholder="Search name or phone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} className="bg-[#35a089] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a7d6b]">Search</button>
          {search && <button onClick={handleClearSearch} className="text-gray-500 text-sm px-2 hover:text-gray-800">✕ Clear</button>}
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35a089]"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="frozen">Frozen</option>
          <option value="banned">Banned</option>
        </select>
        <span className="text-sm text-gray-500">{total} user{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">KYC</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Txns</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[#f0faf8] transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.fullName || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(u.accountStatus)}`}>{u.accountStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kycColor(u.kycStatus)}`}>{u.kycStatus || 'none'}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {u.walletBalance != null ? `KES ${parseFloat(u.walletBalance).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{u.transactions}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setActionUser(u); setNewStatus(u.accountStatus) }}
                        className="text-[#35a089] hover:text-[#2a7d6b] text-xs font-medium underline"
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!search && pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); fetchUsers(page - 1) }}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => { setPage(p => p + 1); fetchUsers(page + 1) }}
            className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}

      {/* Status Update Modal */}
      {actionUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Update Status — {actionUser.fullName || actionUser.phone}</h3>
            <p className="text-xs text-gray-500">Current: <span className={`px-2 py-0.5 rounded-full font-medium ${statusColor(actionUser.accountStatus)}`}>{actionUser.accountStatus}</span></p>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35a089]"
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="frozen">Frozen</option>
              <option value="banned">Banned</option>
            </select>
            <div className="flex gap-3">
              <button onClick={() => { setActionUser(null); setNewStatus('') }}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleStatusUpdate} disabled={actionLoading || newStatus === actionUser.accountStatus}
                className="flex-1 bg-[#35a089] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#2a7d6b] disabled:opacity-50">
                {actionLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const DashboardOverview = ({ token, setActiveScreen }) => {
  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [mpesaHealth, setMpesaHealth] = useState(null);
  const [disputeAlerts, setDisputeAlerts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      apiFetch('/admin/dashboard', token)
        .then(d => {
          if (!cancelled && d.success) {
            setStats(d.stats);
            setRecentTransactions(d.recentTxs || []);
          }
        })
        .catch(console.error);
      apiFetch('/admin/disputes', token)
        .then(d => {
          if (!cancelled && d.success) {
            const alerts = (d.disputes || [])
              .filter(x => x.status === 'open' || x.status === 'escalated' || x.status === 'under_review')
              .slice(0, 5);
            setDisputeAlerts(alerts);
          }
        })
        .catch(console.error);
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const fetchHealth = () => {
      apiFetch('/admin/mpesa-health', token)
        .then(d => { if (!cancelled) setMpesaHealth(d); })
        .catch(console.error);
    };
    fetchHealth();
    const iv = setInterval(fetchHealth, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats ? stats.totalUsers.toLocaleString() : 'N/A'} change="" changeType="up" icon={Users} color="bg-blue-500" />
        <StatCard title="Active Escrows" value={stats ? stats.heldEscrowCount.toLocaleString() : 'N/A'} change="" changeType="up" icon={Package} color="bg-[#35a089]" />
        <StatCard title="Open Disputes" value={stats ? stats.openDisputes.toLocaleString() : 'N/A'} change="" changeType="up" icon={AlertTriangle} color="bg-orange-500" />
        <StatCard title="Platform Revenue" value={stats ? formatKES(stats.totalRevenue) : 'N/A'} change="" changeType="up" icon={DollarSign} color="bg-emerald-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Revenue This Month" value={stats ? formatKES(stats.totalRevenue) : 'N/A'} change="" changeType="up" icon={BarChart3} color="bg-purple-500" />
        <StatCard title="Funds in Escrow" value={stats ? formatKES(stats.heldEscrowAmount) : 'N/A'} change="" changeType="up" icon={Wallet} color="bg-indigo-500" />
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-500">M-Pesa Health</p>
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${mpesaHealth?.status === 'down' ? 'bg-red-500' : mpesaHealth?.status === 'degraded' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className={`text-sm font-medium ${mpesaHealth?.status === 'down' ? 'text-red-600' : mpesaHealth?.status === 'degraded' ? 'text-amber-600' : 'text-emerald-600'}`}>{mpesaHealth?.status ? mpesaHealth.status.charAt(0).toUpperCase() + mpesaHealth.status.slice(1) : 'N/A'}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">STK Push Success</span>
              <span className="font-medium text-gray-900">{mpesaHealth?.stkPushSuccessRate != null ? `${mpesaHealth.stkPushSuccessRate}%` : 'N/A'}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: mpesaHealth?.stkPushSuccessRate != null ? `${mpesaHealth.stkPushSuccessRate}%` : '0%' }} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">B2B Payout Success</span>
              <span className="font-medium text-gray-900">{mpesaHealth?.b2bPayoutSuccessRate != null ? `${mpesaHealth.b2bPayoutSuccessRate}%` : 'N/A'}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full" style={{ width: mpesaHealth?.b2bPayoutSuccessRate != null ? `${mpesaHealth.b2bPayoutSuccessRate}%` : '0%' }} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">B2C Payout Success</span>
              <span className="font-medium text-gray-900">{mpesaHealth?.b2cPayoutSuccessRate != null ? `${mpesaHealth.b2cPayoutSuccessRate}%` : 'N/A'}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-[#35a089] h-2 rounded-full" style={{ width: mpesaHealth?.b2cPayoutSuccessRate != null ? `${mpesaHealth.b2cPayoutSuccessRate}%` : '0%' }} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Avg STK Callback</span>
              <span className="font-medium text-gray-900">{mpesaHealth?.avgStkLatencyMs != null ? `${mpesaHealth.avgStkLatencyMs}ms` : mpesaHealth?.tokenLatencyMs != null ? `${mpesaHealth.tokenLatencyMs}ms` : 'N/A'}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: mpesaHealth ? `${Math.min(((mpesaHealth.avgStkLatencyMs ?? mpesaHealth.tokenLatencyMs ?? 0) / 15000) * 100, 100).toFixed(1)}%` : '0%' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
            <button className="text-sm text-[#35a089] font-medium hover:underline" onClick={() => setActiveScreen('escrows')}>View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {recentTransactions.length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-400">No transactions yet</td></tr>
                )}
                {(recentTransactions || []).map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm font-mono text-gray-900">{tx.id}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          tx.category === 'bundles' ? 'bg-blue-500' :
                          tx.category === 'second_hand' ? 'bg-orange-500' :
                          tx.category === 'fundi' ? 'bg-purple-500' :
                          tx.category === 'delivery' ? 'bg-cyan-500' :
                          tx.category === 'house' ? 'bg-red-500' : 'bg-gray-500'
                        }`} />
                        {tx.category || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{formatKES(tx.amount)}</td>
                    <td className="px-6 py-3"><StatusBadge status={tx.state} size="sm" /></td>
                    <td className="px-6 py-3 text-sm text-gray-500">{formatDate(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              Dispute Alerts
            </h3>
          </div>
          <div className="divide-y divide-gray-300">
            {(disputeAlerts || []).map((dispute) => (
              <div key={dispute.id} className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-mono text-gray-500">{dispute.id}</span>
                  <StatusBadge status={dispute.status} size="sm" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">{dispute.reason}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{dispute.buyer?.fullName || dispute.buyer || ""} vs {dispute.seller?.fullName || dispute.seller || ""}</span>
                  <span>•</span>
                  <span>{formatKES(dispute.amount)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatDate(dispute.openedAt || dispute.createdAt)}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{(dispute.service || dispute.serviceType || "").replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-gray-100">
            <button className="w-full text-center text-sm text-[#35a089] font-medium hover:underline" onClick={() => setActiveScreen('disputes')}>
              View All Disputes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 2: DISPUTE CENTER ────────────────────────────────────────────────

const DisputeCenter = ({ token }) => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [partialMode, setPartialMode] = useState(false);
  const [buyerAmount, setBuyerAmount] = useState('');
  const [sellerAmount, setSellerAmount] = useState('');
  const [resolving, setResolving] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    let cancelled = false;
    const fetch_ = () => {
      Promise.all([
        apiFetch('/admin/disputes', token),
        apiFetch('/admin/house-disputes', token),
        apiFetch('/admin/fundi-disputes', token),
        apiFetch('/admin/delivery-disputes', token),
      ])
        .then(([general, house, fundi, delivery]) => {
          if (cancelled) return;
          const generalList = (general?.success ? (general.disputes || []) : []);
          const houseList = (house?.success ? (house.data || house.disputes || []) : []).map(d => ({
            id: d.id, _id: d.id, service: 'house', serviceType: 'House',
            buyer: { fullName: 'House Buyer', phone: d.escrow?.buyerPhone || '' },
            buyerPhone: d.escrow?.buyerPhone || '', sellerPhone: d.escrow?.sellerPhone || '',
            seller: '—', amount: d.escrow?.amount || 0,
            reason: d.reason, status: d.status, createdAt: d.createdAt, _raw: 'house',
          }));

          const fundiList = (fundi?.success ? (fundi.data || fundi.disputes || []) : []).map(d => ({
         
            id: d.id, _id: d.id, _jobId: d.jobId, service: 'fundi', serviceType: 'Fundi',
            
            buyer: { fullName: d.opener?.fullName || 'Buyer', phone: d.opener?.phone || '' },
            buyerPhone: d.opener?.phone || '', sellerPhone: d.job?.fundiPhone || '',
            seller: d.job?.fundiPhone || '—', amount: d.job?.amount || 0,
            reason: d.reason, status: d.status, createdAt: d.createdAt, _raw: 'fundi',
           _jobId: d.jobId,
          
          }));
          const deliveryList = (delivery?.success ? (delivery.data || delivery.disputes || []) : []).map(d => ({
            id: d.id, _id: d.id, service: 'delivery', serviceType: 'Delivery',
            buyer: { fullName: 'Buyer', phone: d.order?.buyerId || '' },
            buyerPhone: d.order?.buyerId || '', sellerPhone: d.order?.deliveryGuyPhone || '',
            seller: d.order?.deliveryGuyPhone || '—', amount: d.order?.amount || 0,
            reason: d.reason, status: d.status, createdAt: d.createdAt, _raw: 'delivery',
          }));
          const merged = [...generalList, ...houseList, ...fundiList, ...deliveryList]
setDisputes(merged.filter((d, i, arr) =>
  arr.findIndex(x => x._raw === d._raw && x.id === d.id) === i
))
          // setDisputes([...(generalList||[]), ...(houseList||[]), ...(fundiList||[]), ...(deliveryList||[])]);
          
        })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    fetch_();
    const iv = setInterval(fetch_, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const filtered = useMemo(() => {
    let data = disputes;
    if (filter !== 'All') data = data.filter(d => d.service === filter.toLowerCase().replace(/ /g, '_'));
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(d =>
        (d.id || '').toLowerCase().includes(s) ||
        (d.buyer?.fullName || '').toLowerCase().includes(s) ||
        (d.seller?.fullName || '').toLowerCase().includes(s) ||
        (d.reason || '').toLowerCase().includes(s) ||
        (d.referenceNo || '').toLowerCase().includes(s)
      );
    }
    return data;
  }, [filter, search, disputes]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleResolve = async (action, bAmt, sAmt) => {

    setResolving(true);
    try {
      const resolveUrl = selectedDispute._raw === 'house'
  ? `/admin/house-disputes/${selectedDispute._id}/resolve`
  : selectedDispute._raw === 'fundi'
  ? `/admin/fundi-disputes/${selectedDispute._jobId || selectedDispute.jobId}/resolve`
  : selectedDispute._raw === 'delivery'
  ? `/delivery/disputes/resolve`
  : selectedDispute._raw === 'custom'
  ? `/admin/custom-disputes/${selectedDispute._id}/resolve`
  : `/admin/disputes/${selectedDispute._id}/resolve`
      const resolveMethod = ['house', 'fundi'].includes(selectedDispute._raw) ? 'PATCH' : 'POST'
      // delivery controller expects disputeId in body and resolution as 'REFUND'|'PAY'
      const deliveryActionMap = { 'Refund Buyer': 'REFUND', 'Release to Seller': 'N/A' }
      const body = selectedDispute._raw === 'delivery'
        ? { disputeId: selectedDispute._id, resolution: deliveryActionMap[action] || action, adminNotes: resolutionNote }
        : { action, note: resolutionNote, service: selectedDispute._raw };
      if (action === 'Partial Refund') {
        body.buyerAmount  = parseFloat(bAmt);
        body.sellerAmount = parseFloat(sAmt);
      }
      await apiFetch(resolveUrl, token, { method: resolveMethod, body: JSON.stringify(body) });
      setDisputes(prev => prev.filter(d => d.id !== selectedDispute.id));
      setSelectedDispute(null);
      setResolutionNote('');
      setPartialMode(false);
      setBuyerAmount('');
      setSellerAmount('');
    } catch (err) { alert(err.message || 'Resolution failed'); }
    setResolving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dispute Center</h2>
          <p className="text-gray-500 mt-1">Manage and resolve escrow disputes across all services</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Total: {filtered.length}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search disputes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#35a089] focus:ring-2 focus:ring-[#35a089]/20 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', ...SERVICE_TYPES].map(type => (
            <button
              key={type}
              onClick={() => { setFilter(type); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === type 
                  ? 'bg-[#35a089] text-white shadow-sm' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Buyer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Seller</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {(paginated || []).map((dispute) => (
                <tr 
                  key={`${dispute._raw}-${dispute.id}`}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedDispute(dispute)}
                >
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 border-r border-gray-300">{dispute.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{(dispute.service || dispute.serviceType || "").replace(/_/g, " ")}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{dispute.buyer?.fullName || dispute.buyer || ""}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{dispute.seller?.fullName || dispute.seller || ""}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatKES(dispute.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{dispute.reason}</td>
                  <td className="px-6 py-4"><StatusBadge status={dispute.status} /></td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(dispute.openedAt || dispute.createdAt)}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedDispute(dispute); }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#35a089] rounded-lg hover:bg-[#2a7d6b] transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Modal 
        isOpen={!!selectedDispute} 
        onClose={() => { setSelectedDispute(null); setResolutionNote(''); }}
        title={`Dispute Details`}
        size="lg"
      >
        {selectedDispute && (
          <div className="p-6 space-y-6">
            {/* ID Subtitle */}
            <p className="text-sm text-gray-500 -mt-4">{selectedDispute?.id}</p>

            {/* Unified Table */}
            <div className="border border-gray-300 rounded-xl overflow-hidden">

              {/* Info Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-300 border-b border-gray-300 bg-gray-50">
                <div className="p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Amount</p>
                  <p className="text-xl font-bold text-gray-900">{formatKES(selectedDispute.amount)}</p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Service Type</p>
                  <div className="flex items-center gap-1">
                    <span className="text-lg">🏷️</span>
                    <p className="text-sm font-medium text-gray-700">{selectedDispute.serviceType}</p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Status</p>
                  <StatusBadge status={selectedDispute.status} />
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Seller Score</p>
                  <div className="flex items-center gap-1">
                    <span className="text-lg">⭐</span>
                    <p className="text-sm font-medium text-gray-700">N/A</p>
                  </div>
                </div>
              </div>

              {/* Buyer & Seller Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-gray-300 border-b border-gray-300">

                {/* Buyer Column */}
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-200">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-600">
                      B
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">Buyer</p>
                      <p className="text-xs text-gray-500 truncate">{selectedDispute.buyer?.fullName || selectedDispute.buyer || ""} - {formatPhone(selectedDispute.buyer?.phone || selectedDispute.buyerPhone)}</p>
                    </div>
                  </div>

                  {selectedDispute.reason && (
                    <div className="mb-3 pb-3 border-b border-gray-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">🏷️</span>
                        <p className="text-xs font-medium text-gray-500 uppercase">Reason</p>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{selectedDispute.reason}</p>
                    </div>
                  )}

                  <div className="mb-3 pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">📋</span>
                      <p className="text-xs font-medium text-gray-500 uppercase">Claim</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedDispute.description || 'No description provided'}</p>
                  </div>

                  {(() => {
                    const photos = selectedDispute.buyerEvidence?.urls || selectedDispute.buyerEvidence?.photos || selectedDispute.buyerEvidence?.files || [];
                    return photos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
                          </a>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No photos attached</p>;
                  })()}
                </div>

                {/* Seller Column */}
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-200">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-amber-600">
                      S
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">Seller</p>
                      <p className="text-xs text-gray-500 truncate">{selectedDispute.seller?.fullName || selectedDispute.seller || ""} - {formatPhone(selectedDispute.seller?.phone || selectedDispute.sellerPhone)}</p>
                    </div>
                  </div>

                  <div className="mb-3 pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">✓</span>
                      <p className="text-xs font-medium text-gray-500 uppercase">Counter Evidence</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedDispute.sellerEvidence?.notes || 'No counter evidence yet'}</p>
                  </div>

                  {(() => {
                    const photos = selectedDispute.sellerEvidence?.urls || selectedDispute.sellerEvidence?.photos || selectedDispute.sellerEvidence?.files || [];
                    return photos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
                          </a>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No counter photos</p>;
                  })()}
                </div>
              </div>

              {/* System Notes Row */}
              <div className="bg-blue-50 p-4 flex gap-3">
                <span className="text-2xl flex-shrink-0">ℹ️</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">System Notes</p>
                  {selectedDispute.cvReport ? (
                    <div className="text-sm text-gray-700 mt-1 space-y-1">
                      <p>
                        <span className="font-medium">CV Verdict:</span>{' '}
                        {selectedDispute.cvReport.verdict || 'N/A'}
                        {' — '}
                        <span className="font-medium">Confidence:</span>{' '}
                        {selectedDispute.cvReport.confidence ?? selectedDispute.llmConfidence ?? 'N/A'}%
                      </p>
                      {selectedDispute.cvReport.issues?.length > 0 && (
                        <p><span className="font-medium">Issues:</span> {selectedDispute.cvReport.issues.join(', ')}</p>
                      )}
                      {selectedDispute.cvReport.flags?.length > 0 && (
                        <p><span className="font-medium">Flags:</span> {selectedDispute.cvReport.flags.join(', ')}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 mt-1">No automated analysis available for this dispute type. Review evidence above and resolve manually.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Resolution Note */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">Resolution Note</p>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Enter your resolution reasoning..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleResolve('Refund Buyer')}
                className="flex-1 px-4 py-3 border-2 border-red-200 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                ↩️ Refund Buyer
              </button>
              <button
                onClick={() => handleResolve('Release to Seller')}
                className="flex-1 px-4 py-3 bg-emerald-500 text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
              >
                ✓ Release to Seller
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
    

// ─── SCREEN 4: KYC VERIFICATION ──────────────────────────────────────────────

const KYCVerification = ({ token }) => {
  const [queue, setQueue]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [acting, setActing]           = useState(false);
  const [selectedKyc, setSelectedKyc] = useState(null);
  const [kycStats, setKycStats]       = useState({ pending: 0, verified: 0, rejected: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const totalPages = Math.ceil(queue.length / itemsPerPage);
  const paginated  = queue.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const fetchQueue = async () => {
    setLoading(true);
    const data = await apiFetch('/admin/kyc/pending', token);
    if (data?.success) {
      setQueue((data.data || []).map(u => ({
        id:          u.id,
        name:        u.fullName || u.sellerProfile?.businessName || u.phone,
        phone:       u.phone,
        idNumber:    u.sellerProfile?.idNumber  || '—',
        idPhoto:     u.sellerProfile?.idDocUrl  || '',
        selfiePhoto: u.sellerProfile?.selfieUrl || '',
        status:      'Pending',
      })));
    }
    setLoading(false);
  };
  useEffect(() => {
    fetchQueue();
    apiFetch('/admin/dashboard', token)
      .then(d => {
        if (d?.stats) setKycStats({
          pending:  d.stats.pendingKyc  || 0,
          verified: d.stats.verifiedUsers || 0,
          rejected: d.stats.rejectedKyc || 0,
        });
      })
      .catch(console.error);
  }, []);

  const handleApprove = async (id) => {
    setActing(true);
    await apiFetch(`/admin/kyc/${id}/resolve`, token, { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) });
    setQueue(prev => prev.filter(k => k.id !== id));
    setSelectedKyc(null);
    setActing(false);
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Rejection reason:') || 'Rejected by admin';
    setActing(true);
    await apiFetch(`/admin/kyc/${id}/resolve`, token, { method: 'PATCH', body: JSON.stringify({ action: 'reject', reason }) });
    setQueue(prev => prev.filter(k => k.id !== id));
    setSelectedKyc(null);
    setActing(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading KYC queue…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">KYC Verification</h2>
          <p className="text-gray-500 mt-1">Review and approve identity verification requests</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <Clock size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-700">{queue.length} pending</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-sm font-medium text-green-700">✓ {kycStats.verified} verified</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-sm font-medium text-red-700">✕ {kycStats.rejected} rejected</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(paginated || []).map((kyc) => (
          <div key={kyc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200" style={{borderTop: "3px solid #35a089"}}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#35a089] to-[#2a7d6b] flex items-center justify-center text-white text-sm font-bold overflow-hidden ring-2 ring-[#35a089]/20">
                  {kyc.selfiePhoto
                    ? <img src={kyc.selfiePhoto} alt={kyc.name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                    : null}
                  <span style={{display: kyc.selfiePhoto ? 'none' : 'flex'}}>{kyc.name.split(' ').map(n => n[0]).join('')}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{kyc.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{kyc.id}</p>
                </div>
              </div>
              <StatusBadge status="Pending" size="sm" />
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500 uppercase">Phone</p>
                  <p className="text-sm font-medium text-gray-900 font-mono">{formatPhone(kyc.phone)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500 uppercase">ID Number</p>
                  <p className="text-sm font-medium text-gray-900 font-mono">{kyc.idNumber}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedKyc(kyc)}
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Eye size={14} />
                  Preview
                </button>
                <button 
                  onClick={() => handleApprove(kyc.id)}
                  className="flex-1 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check size={14} />
                  Approve
                </button>
                <button 
                  onClick={() => handleReject(kyc.id)}
                  className="flex-1 px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
                >
                  <X size={14} />
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      <Modal isOpen={!!selectedKyc} onClose={() => setSelectedKyc(null)} title="KYC Document Review" size="lg">
        {selectedKyc && (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#35a089] to-[#2a7d6b] flex items-center justify-center text-white text-lg font-bold overflow-hidden ring-2 ring-[#35a089] ring-offset-2">
                {selectedKyc.selfiePhoto
                  ? <img src={selectedKyc.selfiePhoto} alt={selectedKyc.name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                  : null}
                <span style={{display: selectedKyc.selfiePhoto ? 'none' : 'flex'}}>{selectedKyc.name.split(' ').map(n => n[0]).join('')}</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedKyc.name}</h3>
                <p className="text-sm text-gray-500">{formatPhone(selectedKyc.phone)} - ID: <span className="font-mono font-semibold text-gray-700">{selectedKyc.idNumber}</span></p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">ID Document</p>
                <div className="aspect-[4/3] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                  <img 
                    src={selectedKyc.idPhoto} 
                    alt="ID Document" 
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div class="flex flex-col items-center gap-2 text-gray-400"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span class="text-sm">ID Photo Preview</span></div>'; }}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Selfie Verification</p>
                <div className="aspect-[4/3] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                  <img 
                    src={selectedKyc.selfiePhoto} 
                    alt="Selfie" 
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div class="flex flex-col items-center gap-2 text-gray-400"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span class="text-sm">Selfie Preview</span></div>'; }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Verification Checklist</p>
              <div className="space-y-2">
                {[
                  'ID document is clear and readable',
                  'ID number matches application',
                  'Selfie matches ID photo',
                  'No signs of document tampering',
                  'User is over 18 years old'
                ].map((item, i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#35a089] focus:ring-[#35a089]" defaultChecked={i < 3} />
                    <span className="text-sm text-gray-700">{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => handleApprove(selectedKyc.id)}
                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Approve Verification
              </button>
              <button 
                onClick={() => handleReject(selectedKyc.id)}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <X size={18} />
                Reject Verification
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── SCREEN 5: ESCROW MANAGEMENT ─────────────────────────────────────────────

const EscrowManagement = ({ token }) => {
  const [serviceFilter, setServiceFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEscrow, setSelectedEscrow] = useState(null);
  const itemsPerPage = 10;
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const fetch_ = () => {
      apiFetch('/admin/transactions?limit=200', token)
        .then(data => { if (!cancelled && data?.success) setEscrows(data.data || []); })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    fetch_();
    const iv = setInterval(fetch_, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [token]);
  const filtered = useMemo(() => {
    let data = escrows;
    if (serviceFilter !== 'All') data = data.filter(e => (e.serviceType || e.category || '').toLowerCase() === serviceFilter.toLowerCase());
    if (statusFilter !== 'All') data = data.filter(e => (e.status || '').toLowerCase() === statusFilter.toLowerCase());
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(e =>
        (e.id || '').toLowerCase().includes(s) ||
        (e.buyer || e.buyerName || '').toLowerCase().includes(s) ||
        (e.seller || e.sellerName || '').toLowerCase().includes(s) ||
        (e.description || '').toLowerCase().includes(s)
      );
    }
    return data;
  }, [serviceFilter, statusFilter, search, escrows]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Escrow Management</h2>
          <p className="text-gray-500 mt-1">Monitor and manage all escrow transactions</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search escrows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#35a089] focus:ring-2 focus:ring-[#35a089]/20 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select 
            value={serviceFilter}
            onChange={(e) => { setServiceFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:border-[#35a089] outline-none"
          >
            <option value="All">All Services</option>
            {(SERVICE_TYPES || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:border-[#35a089] outline-none"
          >
            <option value="All">All Statuses</option>
            {['Pending', 'Active', 'Completed', 'Disputed', 'Refunded', 'Released'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Buyer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Seller</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {(paginated || []).map((escrow) => (
                <tr key={escrow.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 border-r border-gray-300">{escrow.id}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      escrow.category === 'bundles' ? 'bg-blue-50 text-blue-700' :
                      escrow.category === 'second_hand' ? 'bg-orange-50 text-orange-700' :
                      escrow.category === 'fundi' ? 'bg-purple-50 text-purple-700' :
                      escrow.category === 'delivery' ? 'bg-cyan-50 text-cyan-700' :
                      escrow.category === 'house' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'
                    }`}>
                      {escrow.category === 'bundles' && <Package size={12} />}
                      {escrow.category === 'second_hand' && <ShoppingBag size={12} />}
                      {escrow.category === 'fundi' && <Wrench size={12} />}
                      {escrow.category === 'delivery' && <Truck size={12} />}
                      {escrow.category === 'house' && <Home size={12} />}
                      {escrow.category === 'custom' && <Settings size={12} />}
                      {escrow.category || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">{escrow.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex flex-col gap-0.5">
                      <span>{escrow.buyer?.fullName || escrow.buyerPhone || '—'}</span>
                      {escrow.buyer?.kycStatus && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full w-fit ${
                          escrow.buyer.kycStatus === 'verified'  ? 'bg-green-100 text-green-700' :
                          escrow.buyer.kycStatus === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                          escrow.buyer.kycStatus === 'rejected'  ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{escrow.buyer.kycStatus}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex flex-col gap-0.5">
                      <span>{escrow.seller?.fullName || escrow.sellerPhone || '—'}</span>
                      {escrow.seller?.kycStatus && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full w-fit ${
                          escrow.seller.kycStatus === 'verified'  ? 'bg-green-100 text-green-700' :
                          escrow.seller.kycStatus === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                          escrow.seller.kycStatus === 'rejected'  ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{escrow.seller.kycStatus}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatKES(escrow.amount)}</td>
                  <td className="px-6 py-4"><StatusBadge status={escrow.state} /></td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(escrow.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setSelectedEscrow(escrow)}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="View"
                      >
                        <Eye size={16} className="text-gray-500" />
                      </button>
                      {escrow.state === 'disputed' && (
                        <>
                          <button 
                            className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                            title="Force Refund"
                            onClick={() => alert(`Force refund escrow ${escrow.id}?`)}
                          >
                            <RotateCcw size={16} className="text-red-500" />
                          </button>
                          <button 
                            className="p-2 rounded-lg hover:bg-emerald-50 transition-colors"
                            title="Force Release"
                            onClick={() => alert(`Force release escrow ${escrow.id}?`)}
                          >
                            <CheckCircle size={16} className="text-emerald-500" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Modal isOpen={!!selectedEscrow} onClose={() => setSelectedEscrow(null)} title="Escrow Details" size="md">
        {selectedEscrow && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Amount</p>
                <p className="text-lg font-bold text-gray-900">{formatKES(selectedEscrow.amount)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Service</p>
                <p className="text-sm font-medium text-gray-900">{selectedEscrow.category || "—"}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Status</p>
                <StatusBadge status={selectedEscrow.state} />
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase">Created</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(selectedEscrow.createdAt)}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase mb-1">Description</p>
              <p className="text-sm text-gray-900">{selectedEscrow.description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Buyer</p>
                <p className="text-sm font-medium text-gray-900">{selectedEscrow.buyer?.fullName || selectedEscrow.buyerPhone || "—"}</p>
                <p className="text-sm text-gray-500 font-mono">{formatPhone(selectedEscrow.buyerPhone)}</p>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Seller</p>
                <p className="text-sm font-medium text-gray-900">{selectedEscrow.seller?.fullName || selectedEscrow.sellerPhone || "—"}</p>
                <p className="text-sm text-gray-500 font-mono">{formatPhone(selectedEscrow.sellerPhone)}</p>
              </div>
            </div>

            {selectedEscrow.state === 'disputed' && (
              <div className="flex gap-3">
                <button 
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
                  onClick={() => alert(`Force refund ${selectedEscrow.id}?`)}
                >
                  Force Refund Buyer
                </button>
                <button 
                  className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors"
                  onClick={() => alert(`Force release ${selectedEscrow.id}?`)}
                >
                  Force Release to Seller
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── SCREEN 6: M-PESA LOGS ───────────────────────────────────────────────────

const MPesaLogs = ({ token }) => {
  const [activeTab, setActiveTab] = useState('stk');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    apiFetch(`/admin/mpesa-logs?type=${activeTab}`, token)
      .then(d => { if (!cancelled && d.success) setLogs(d.logs); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, token]);

  const filtered = useMemo(() => {
    let data = logs;
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(l => 
        l.id.toLowerCase().includes(s) ||
        l.phone.includes(s) ||
        l.reference.toLowerCase().includes(s) ||
        l.merchantRequestId?.toLowerCase().includes(s)
      );
    }
    return data;
  }, [activeTab, search]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">M-Pesa Logs</h2>
          <p className="text-gray-500 mt-1">Monitor STK Push and B2C payout transactions</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex bg-white rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => { setActiveTab('stk'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'stk' ? 'bg-[#35a089] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            STK Push Log
          </button>
          <button
            onClick={() => { setActiveTab('b2c'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'b2c' ? 'bg-[#35a089] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            B2C Payout Log
          </button>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#35a089] focus:ring-2 focus:ring-[#35a089]/20 outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {(paginated || []).map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 border-r border-gray-300">{log.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-mono">{formatPhone(log.phone)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatKES(log.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">{log.reference}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={log.status} />
                    {log.errorMessage && (
                      <p className="text-xs text-red-500 mt-1">{log.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(log.timestamp)}</td>
                  <td className="px-6 py-4">
                    {log.status === 'Failed' && (
                      <button 
                        className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                        onClick={() => alert(`Retry transaction ${log.id}?`)}
                      >
                        <RefreshCw size={14} />
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
};

// ─── SCREEN 7: WALLET MANAGEMENT ─────────────────────────────────────────────

const AuditLog = ({ token }) => {
  const [search, setSearch]           = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [logs, setLogs]               = useState([]);
  const [totalPages, setTotalPages]   = useState(1);
  const [loading, setLoading]         = useState(true);
  const itemsPerPage = 12;

  const fetchLogs = async () => {
    setLoading(true);
    const data = await apiFetch(`/admin/audit-log?page=${currentPage}&limit=${itemsPerPage}&search=${encodeURIComponent(search)}`, token);
    if (data?.success) {
      setLogs((data.data || []).map(l => ({
        id:        l.id,
        actor:     l.actor?.fullName || l.actor?.phone || 'System',
        action:    l.action,
        target:    l.entityId,
        timestamp: l.timestamp,
        ip:        l.ipAddress || '—',
      })));
      setTotalPages(data.pages || 1);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [currentPage]);
  useEffect(() => {
    setCurrentPage(1);
    const t = setTimeout(fetchLogs, 300); // debounce search
    return () => clearTimeout(t);
  }, [search]);

  const paginated = logs;

  const actionColors = {
    'Approved KYC': 'bg-emerald-50 text-emerald-700',
    'Resolved Dispute': 'bg-blue-50 text-blue-700',
    'Suspended User': 'bg-red-50 text-red-700',
    'Released Escrow': 'bg-purple-50 text-purple-700',
    'Refunded Buyer': 'bg-orange-50 text-orange-700',
    'Force Released': 'bg-amber-50 text-amber-700',
    'Updated Settings': 'bg-gray-50 text-gray-700',
    'Verified Payment': 'bg-cyan-50 text-cyan-700',
    'Rejected KYC': 'bg-red-50 text-red-700',
    'Reactivated User': 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-gray-500 mt-1">Chronological record of all admin actions</p>
        </div>
        <button className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search audit logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#35a089] focus:ring-2 focus:ring-[#35a089]/20 outline-none transition-all"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Actor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Target</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 last:border-r-0">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {(paginated || []).map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{log.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {log.actor.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-sm text-gray-900">{log.actor}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-50 text-gray-700'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{log.target}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(log.timestamp)}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
};

// ─── SIDEBAR & LAYOUT ──────────────────────────────────────────────────────────

const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
      active 
        ? 'bg-[#35a089] text-white shadow-sm' 
        : 'text-gray-400 hover:bg-[#1e293b] hover:text-gray-200'
    }`}
  >
    <Icon size={18} />
    <span className="flex-1 text-left">{label}</span>
    {badge && (
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-red-500/20 text-red-400'
      }`}>
        {badge}
      </span>
    )}
  </button>
);

const Sidebar = ({ activeScreen, setActiveScreen, isOpen, setIsOpen, setToken, setAdminName }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'disputes', label: 'Dispute Center', icon: AlertTriangle},
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'kyc', label: 'KYC Verification', icon: ShieldCheck},
    { id: 'escrows', label: 'Escrow Management', icon: Package },
    { id: 'mpesa', label: 'M-Pesa Logs', icon: CreditCard },
    { id: 'audit', label: 'Audit Log', icon: FileText },
  ];

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-[#0f172a] flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#35a089] flex items-center justify-center shadow-lg shadow-[#35a089]/20">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">LipaSafe</h1>
              <p className="text-xs text-gray-500">Admin Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Main</p>
          {(menuItems || []).map(item => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeScreen === item.id}
              onClick={() => { setActiveScreen(item.id); setIsOpen(false); }}
              badge={item.badge}
            />
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800 space-y-1">
          <SidebarItem icon={Settings} label="Settings" active={activeScreen === 'settings'} onClick={() => setActiveScreen('settings')} />
          <SidebarItem icon={LogOut} label="Logout" active={false} onClick={() => {
            if (!confirm('Logout?')) return;
            localStorage.removeItem('ls_admin_token');
            setToken('');
          }} />
        </div>
      </aside>
    </>
  );
};

// ─── MAIN APP ──────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:4000';
const apiFetch = async (path, token, opts = {}) => {
  const r = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
  });
  if (r.status === 401) {
    localStorage.removeItem('ls_admin_token');
    window.location.reload();
    return;
  }
  return r.json();
};

const App = () => {
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('ls_admin_token') || '');
  const [adminName, setAdminName] = useState(() => {
    try {
      const t = localStorage.getItem('ls_admin_token');
      if (!t) return 'Admin';
      const p = JSON.parse(atob(t.split('.')[1]));
      return p.fullName || p.name || p.phone || 'Admin';
    } catch(e) { return 'Admin'; }
  });
  const [loginPhone, setLoginPhone] = useState('');
  useEffect(() => {
    const t = localStorage.getItem('ls_admin_token');
    if (!t) return;
    fetch(`${API_URL}/user/me`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(u => { if (u?.user?.fullName) setAdminName(u.user.fullName); })
      .catch(() => {});
  }, []);
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, pin: loginPin })
      }).then(r => r.json());
      if (data.success && data.user?.role === 'admin') {
        setToken(data.accessToken);
        localStorage.setItem('ls_admin_token', data.accessToken);
        try {
          const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
          const name = payload.fullName || payload.name || '';
          if (name) { setAdminName(name); }
          else {
            fetch(`${API_URL}/user/me`, { headers: { Authorization: `Bearer ${data.accessToken}` } })
              .then(r => r.json())
              .then(u => { if (u?.user?.fullName) setAdminName(u.user.fullName); })
              .catch(() => {});
          }
        } catch(e) { setAdminName('Admin'); }
      } else if (data.success) {
        setLoginError('Not an admin account.');
      } else {
        setLoginError(data.message || 'Login failed');
      }
    } catch (err) {
      setLoginError('Cannot connect to server');
    }
    setLoginLoading(false);
  };

  if (!token) return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#35a089] flex items-center justify-center text-white font-bold text-lg">L</div>
          <div><h1 className="text-lg font-bold text-gray-900">LipaSafe Admin</h1><p className="text-xs text-gray-500">Sign in to continue</p></div>
        </div>
        <div className="space-y-4">
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Phone</label>
            <input type="text" value={loginPhone} onChange={e => setLoginPhone(e.target.value)} placeholder="0727669032"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35a089]" /></div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">PIN</label>
            <input type="password" value={loginPin} onChange={e => setLoginPin(e.target.value)} placeholder="••••"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35a089]" /></div>
          {loginError && <p className="text-sm text-red-500">{loginError}</p>}
          <button onClick={handleLogin} disabled={loginLoading}
            className="w-full bg-[#35a089] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#2a7d6b] transition-colors disabled:opacity-60">
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );

  const screens = {
    dashboard: <DashboardOverview token={token} setActiveScreen={setActiveScreen} />,
    disputes: <DisputeCenter token={token} />,
    users: <UserManagement token={token} />,
    kyc: <KYCVerification token={token} />,
    escrows: <EscrowManagement token={token} />,
    mpesa: <MPesaLogs token={token} />,
    audit: <AuditLog token={token} />,
  };

  const screenTitles = {
    dashboard: 'Dashboard Overview',
    disputes: 'Dispute Center',
    users: 'User Management',
    kyc: 'KYC Verification',
    escrows: 'Escrow Management',
    mpesa: 'M-Pesa Logs',
    audit: 'Audit Log',
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Sidebar 
        activeScreen={activeScreen} 
        setActiveScreen={setActiveScreen} 
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        setToken={setToken}
        setAdminName={setAdminName}
      />

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Menu size={20} className="text-gray-600" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{screenTitles[activeScreen]}</h2>
                <p className="text-sm text-gray-500 hidden sm:block">{new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Bell size={20} className="text-gray-600" />

              </button>
              <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#35a089] to-[#2a7d6b] flex items-center justify-center text-white text-sm font-bold">
                  {(adminName || 'AD').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{adminName || 'Admin'}</p>
                  <p className="text-xs text-gray-500">Super Admin</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto">
          {screens[activeScreen]}
        </div>
      </main>
    </div>
  );
};

