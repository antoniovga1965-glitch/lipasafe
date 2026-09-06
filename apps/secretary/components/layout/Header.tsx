"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data-context";
import { cn } from "@/lib/utils";
import { getSocket } from "@/lib/socket";

interface LiveNotification {
  id: string;
  disputeId: string;
  dealId: string;
  message: string;
  bankName?: string;
  accountNo?: string;
  at: Date;
}

const pageTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/float": "Float Wallet",
  "/dashboard/confirmations": "Pending Confirmations",
  "/dashboard/fx": "FX Conversion",
  "/dashboard/b2c": "B2C Fire Queue",
  "/dashboard/disputes": "Disputes",
  "/dashboard/deals": "Active Deals",
  "/dashboard/logs": "Audit Logs",
  "/dashboard/settings": "Settings",
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { floatBalance } = useData();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const sock = getSocket();
    sock.on("bank_details_received", (data: any) => {
      setNotifications(prev => [{
        id: crypto.randomUUID(),
        disputeId: data.disputeId,
        dealId:    data.dealId,
        message:   data.message,
        bankName:  data.bankName,
        accountNo: data.accountNo,
        at:        new Date(),
      }, ...prev]);
    });
    return () => { sock.off("bank_details_received"); };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dismiss = (id: string) =>
    setNotifications(prev => prev.filter(n => n.id !== id));

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-GB", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

  const getFloatColor = () => {
    if (floatBalance > 100000) return "bg-green-100 text-green-700 border-green-200";
    if (floatBalance >= 50000) return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {pageTitles[pathname] || "Dashboard"}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-sm font-medium text-gray-700 tabular-nums">
            {currentTime ? formatTime(currentTime) : "--:--:--"}
          </span>
          <span className="text-xs text-gray-400">
            {currentTime ? formatDate(currentTime) : ""}
          </span>
        </div>

        <Badge
          variant="outline"
          className={cn("flex items-center gap-1.5 px-3 py-1.5 font-medium", getFloatColor())}
        >
          <Wallet className="h-3.5 w-3.5" />
          KES {floatBalance.toLocaleString()}
        </Badge>

        <div className="relative" ref={panelRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setOpen(o => !o)}
          >
            <Bell className="h-5 w-5 text-gray-500" />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </Button>

          {open && (
            <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  Notifications
                  {notifications.length > 0 && (
                    <Badge className="ml-2 bg-red-500 text-white text-xs">
                      {notifications.length}
                    </Badge>
                  )}
                </span>
                {notifications.length > 0 && (
                  <button
                    onClick={() => setNotifications([])}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  No new notifications
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className="px-4 py-3 hover:bg-green-50 cursor-pointer flex items-start gap-3"
                      onClick={() => {
                        router.push("/dashboard/disputes");
                        setOpen(false);
                      }}
                    >
                      <div className="h-2 w-2 mt-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Bank Details Received
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                        {n.bankName && (
                          <p className="text-xs text-green-700 font-mono mt-1">
                            {n.bankName} — {n.accountNo}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {n.at.toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        className="flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
