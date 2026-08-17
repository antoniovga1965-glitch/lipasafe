import pathlib

path = pathlib.Path("/mnt/datassd/projects-and-docs/lipasafe/apps/admin/LipaSafeAdminDashboard.jsx")
content = path.read_text()

old = '''            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white rounded-xl border border-gray-100">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Amount</p>
                <p className="text-xl font-bold text-gray-900">{formatKES(selectedDispute.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Service Type</p>
                <div className="flex items-center gap-1">
                  <span className="text-lg">🏷️</span>
                  <p className="text-sm font-medium text-gray-700">{selectedDispute.serviceType}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Status</p>
                <StatusBadge status={selectedDispute.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Seller Score</p>
                <div className="flex items-center gap-1">
                  <span className="text-lg">⭐</span>
                  <p className="text-sm font-medium text-gray-700">N/A</p>
                </div>
              </div>
            </div>

            {/* Buyer & Seller Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Buyer Card */}
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-600">
                    B
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">Buyer</p>
                    <p className="text-xs text-gray-500 truncate">{selectedDispute.buyer?.fullName || selectedDispute.buyer || ""} - {formatPhone(selectedDispute.buyer?.phone || selectedDispute.buyerPhone)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  {selectedDispute.reason && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">🏷️</span>
                        <p className="text-xs font-medium text-gray-500 uppercase">Reason</p>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{selectedDispute.reason}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">📋</span>
                    <p className="text-xs font-medium text-gray-500 uppercase">Claim</p>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedDispute.description || 'No description provided'}</p>
                </div>
                {(() => {
                  const photos = selectedDispute.buyerEvidence?.urls || selectedDispute.buyerEvidence?.photos || selectedDispute.buyerEvidence?.files || [];
                  return photos.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
                        </a>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-400 mt-2">No photos attached</p>;
                })()}
              </div>

              {/* Seller Card */}
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-amber-600">
                    S
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">Seller</p>
                    <p className="text-xs text-gray-500 truncate">{selectedDispute.seller?.fullName || selectedDispute.seller || ""} - {formatPhone(selectedDispute.seller?.phone || selectedDispute.sellerPhone)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">✓</span>
                    <p className="text-xs font-medium text-gray-500 uppercase">Counter Evidence</p>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedDispute.sellerEvidence?.notes || 'No counter evidence yet'}</p>
                </div>
                {(() => {
                  const photos = selectedDispute.sellerEvidence?.urls || selectedDispute.sellerEvidence?.photos || selectedDispute.sellerEvidence?.files || [];
                  return photos.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
                        </a>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-400 mt-2">No counter photos</p>;
                })()}
              </div>
            </div>

            {/* System Notes */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex gap-3">
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
            </div>'''

new = '''            {/* Unified Table */}
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
            </div>'''

assert content.count(old) == 1, f"expected 1 occurrence, found {content.count(old)}"
content = content.replace(old, new)

path.write_text(content)
print("Patched dispute modal into unified bordered table layout")
