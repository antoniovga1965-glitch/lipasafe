"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Banknote, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const { notifications, markAllRead, markRead } = useNotifications();
  const router = useRouter();

  useEffect(() => { markAllRead() }, [markAllRead]);

  const Icon = ({ type }: { type: string }) => {
    if (type === 'BANK_DETAILS_RECEIVED') return <Banknote className="h-5 w-5 text-purple-600" />;
    if (type === 'NEW_DISPUTE')           return <AlertCircle className="h-5 w-5 text-red-600" />;
    return <Bell className="h-5 w-5 text-gray-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
        <span className="text-sm text-gray-400">{notifications.length} total</span>
      </div>

      {notifications.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Bell className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No notifications yet. They appear here when disputes are raised or bank details come in.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={`border-0 shadow-sm cursor-pointer transition-colors hover:bg-gray-50 ${!n.read ? 'border-l-4 border-l-green-500' : ''}`}
              onClick={() => { markRead(n.id); router.push('/dashboard/disputes') }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5"><Icon type={n.type} /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      {!n.read && <Badge className="bg-green-100 text-green-700 text-xs px-1.5">New</Badge>}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
