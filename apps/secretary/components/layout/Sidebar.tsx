"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Wallet,
  Inbox,
  ArrowLeftRight,
  ShieldAlert,
  Briefcase,
  ScrollText,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/data-context";
import { logout } from "@/lib/api";

function getUserFromToken() {
  if (typeof window === "undefined") return { name: "", email: "", initials: "" };
  const token = localStorage.getItem("token");
  if (!token) return { name: "", email: "", initials: "" };
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const name  = payload.fullName || payload.name || payload.phone || "Staff";
    const email = payload.email || "";
    const parts = name.trim().split(" ");
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
    return { name, email, initials };
  } catch { return { name: "Staff", email: "", initials: "ST" }; }
}

const navItems = [
  { name: "Overview", href: "/dashboard", icon: Home },
  { name: "Float Wallet", href: "/dashboard/float", icon: Wallet, badge: "balance" },
  { name: "Confirmations", href: "/dashboard/confirmations", icon: Inbox, badge: "pending" },
  { name: "FX Conversion", href: "/dashboard/fx", icon: ArrowLeftRight },
  { name: "Disputes", href: "/dashboard/disputes", icon: ShieldAlert, badge: "disputes" },
  { name: "Active Deals", href: "/dashboard/deals", icon: Briefcase },
  { name: "Logs", href: "/dashboard/logs", icon: ScrollText },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { deals, disputes, floatBalance } = useData();
  const user = getUserFromToken();

  const pendingConfirmations = deals.filter(
    (d) => d.status === "PAYMENT_PENDING_CONFIRMATION"
  ).length;

  const b2cReady = deals.filter((d) =>
    d.milestones.some((m) => m.status === "EVIDENCE_SUBMITTED")
  ).length;

  const openDisputes = disputes.filter(
    (d) => d.status === "OPEN" || d.status === "UNDER_REVIEW"
  ).length;

  const getBadge = (badgeType?: string) => {
    switch (badgeType) {
      case "balance":
        return (
          <Badge variant="outline" className="ml-auto text-xs font-medium border-green-200 text-green-700 bg-green-50">
            KES {floatBalance.toLocaleString()}
          </Badge>
        );
      case "pending":
        return pendingConfirmations > 0 ? (
          <Badge className="ml-auto bg-red-500 text-white text-xs">
            {pendingConfirmations}
          </Badge>
        ) : null;
      case "b2c":
        return b2cReady > 0 ? (
          <Badge className="ml-auto bg-purple-500 text-white text-xs">
            {b2cReady}
          </Badge>
        ) : null;
      case "disputes":
        return openDisputes > 0 ? (
          <Badge className="ml-auto bg-orange-500 text-white text-xs">
            {openDisputes}
          </Badge>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#16a34a] flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-[#16a34a]">LipaSafe</span>
        </Link>
        <p className="text-xs text-gray-400 mt-1 ml-10">Secretary Portal</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-green-50 text-[#16a34a]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive ? "text-[#16a34a]" : "text-gray-400")} />
              <span>{item.name}</span>
              {getBadge(item.badge)}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-[#16a34a] flex items-center justify-center">
            <span className="text-sm font-bold text-white">{user.initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full text-sm text-gray-600 border-gray-200 hover:bg-gray-50"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </aside>
  );
}