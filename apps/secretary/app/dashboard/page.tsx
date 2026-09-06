"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useData } from "@/lib/data-context";
import {
  Wallet,
  Inbox,
  Briefcase,
  ShieldAlert,
  Send,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#16a34a", "#3b82f6", "#f59e0b", "#8b5cf6"];

const formatAction = (action: string) =>
  action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function OverviewPage() {
  const {
    deals, disputes, floatBalance,
    activityLogs, logsPagination, logsLoading, loadMoreLogs,
    allDeals, allDealsLoading,
  } = useData();

  const pendingConfirmations = deals.filter((d) => d.status === "PENDING_CONFIRMATION").length;
  const activeDeals = deals.filter((d) => d.status === "ACTIVE").length;
  const openDisputes = disputes.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW").length;
  const b2cReady = deals.filter((d) =>
    d.milestones.some((m) => m.status === "EVIDENCE_SUBMITTED")
  ).length;
  const completedThisMonth = deals.filter((d) => d.status === "COMPLETED").length;

  // Deal Breakdown is intentionally built from allDeals (every deal ever
  // created), not the pending-only `deals` list above — those two lists
  // serve different purposes and shouldn't be conflated.
  const dealTypeData = [
    { name: "Construction", value: allDeals.filter((d) => d.dealType === "CONSTRUCTION").length },
    { name: "Fundi", value: allDeals.filter((d) => d.dealType === "FUNDI").length },
    { name: "Goods", value: allDeals.filter((d) => d.dealType === "GOODS").length },
    { name: "Custom", value: allDeals.filter((d) => d.dealType === "CUSTOM").length },
  ].filter((d) => d.value > 0);

  const hasMoreLogs = logsPagination.page > 0 && logsPagination.page < logsPagination.pages;

  const stats = [
    { title: "Total Float", value: `KES ${floatBalance.toLocaleString()}`, icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
    { title: "Pending Confirmations", value: pendingConfirmations, icon: Inbox, color: "text-yellow-600", bg: "bg-yellow-50" },
    { title: "Active Deals", value: activeDeals, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Open Disputes", value: openDisputes, icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50" },
    { title: "Completed This Month", value: completedThisMonth, icon: CheckCircle, color: "text-gray-600", bg: "bg-gray-50" },
  ];

  return (
    <div className="space-y-8 p-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{stat.title}</p>
                    <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 pt-6 px-7">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-7 pb-8 pt-3">
            {logsLoading && activityLogs.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <Inbox className="h-9 w-9" />
                <p className="text-sm">No recent activity yet</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                      <div className="h-2 w-2 rounded-full bg-[#16a34a] mt-2 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{formatAction(log.action)}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-mono">{log.entityId.slice(0, 8)}</span>
                          {log.amount != null && <span> • KES {Number(log.amount).toLocaleString()}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          {log.actor?.fullName ? ` by ${log.actor.fullName}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {hasMoreLogs && (
                  <button
                    onClick={loadMoreLogs}
                    disabled={logsLoading}
                    className="w-full mt-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {logsLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 pt-6 px-7">
            <CardTitle className="text-base font-semibold">Deal Breakdown by Type</CardTitle>
          </CardHeader>
          <CardContent className="px-7 pb-8 pt-3">
            {allDealsLoading && allDeals.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : dealTypeData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
                <Briefcase className="h-8 w-8" />
                <p className="text-sm">No deals yet</p>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dealTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {dealTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
