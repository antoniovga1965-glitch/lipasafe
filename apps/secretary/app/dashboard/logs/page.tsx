"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") ?? "";
}

async function apiFetch(path: string) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
  });
  return res.json();
}

// ── types ──────────────────────────────────────────────────────────────────────
interface LogEntry {
  id:          string;
  timestamp:   string;
  action:      string;
  performedBy: string;
  dealReference: string | null;
  amount:      number | null;
  details:     string | null;
  category:    string;
}

const ACTION_FILTERS = ["All", "Deal Created", "Payment Confirmed", "Payment Rejected", "Float Added", "Float Released", "Dispute Raised", "Dispute Resolved", "Milestone Released"];

const CATEGORY_COLORS: Record<string, string> = {
  Float:     "bg-blue-100 text-blue-700",
  Payment:   "bg-green-100 text-green-700",
  Deal:      "bg-purple-100 text-purple-700",
  Dispute:   "bg-red-100 text-red-700",
  Milestone: "bg-amber-100 text-amber-700",
};

// ── component ──────────────────────────────────────────────────────────────────
export default function LogsPage() {
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchRef, setSearchRef] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await apiFetch("/api/secretary/logs?limit=200");
      if (res.success) setLogs(res.data);
    } catch (err) {
      console.error("logs error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (searchRef && !log.dealReference?.toLowerCase().includes(searchRef.toLowerCase()) &&
          !log.details?.toLowerCase().includes(searchRef.toLowerCase())) return false;
      if (actionFilter !== "All" && log.action !== actionFilter) return false;
      return true;
    });
  }, [logs, searchRef, actionFilter]);

  // Reset to page 1 whenever the filtered set changes shape (new search/filter)
  useEffect(() => { setPage(1); }, [searchRef, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const handleExport = () => {
    const csv = [
      "Timestamp,Action,Category,Performed By,Deal Ref,Amount,Details",
      ...filtered.map((l) =>
        `"${l.timestamp}","${l.action}","${l.category}","${l.performedBy}","${l.dealReference || ""}","${l.amount ?? ""}","${l.details || ""}"`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `diaspora-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* ── filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {ACTION_FILTERS.map((type) => (
            <Button
              key={type}
              variant={actionFilter === type ? "default" : "outline"}
              size="sm"
              className={actionFilter === type ? "bg-[#16a34a] hover:bg-[#15803d] text-white" : ""}
              onClick={() => setActionFilter(type)}
            >
              {type}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search ref or details..."
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              className="pl-9 w-52"
            />
          </div>
          <Button variant="outline" onClick={() => fetchLogs(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── summary chips ───────────────────────────────────────────────── */}
      {!loading && (
        <p className="text-sm text-gray-500">
          Showing <span className="font-semibold text-gray-800">{filtered.length}</span> of{" "}
          <span className="font-semibold text-gray-800">{logs.length}</span> events
        </p>
      )}

      {/* ── table ───────────────────────────────────────────────────────── */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Performed By</th>
                  <th className="px-4 py-3 font-medium">Deal Ref</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No log entries found
                    </td>
                  </tr>
                ) : (
                  paginated.map((log, i) => (
                    <tr key={log.id} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[log.category] || "bg-gray-100 text-gray-600"}`}>
                          {log.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{log.action}</td>
                      <td className="px-4 py-3 text-gray-600">{log.performedBy}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.dealReference || "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">
                        {log.amount != null ? `KES ${Number(log.amount).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={log.details || ""}>
                        {log.details || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── pagination ──────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page <span className="font-semibold text-gray-800">{page}</span> of{" "}
            <span className="font-semibold text-gray-800">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
