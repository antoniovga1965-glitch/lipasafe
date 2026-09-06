"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiasporaDeal } from "@/types";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

const statusColors: Record<string, string> = {
  AWAITING_PAYMENT: "bg-gray-100 text-gray-700 border-gray-200",
  PAYMENT_PENDING_CONFIRMATION: "bg-yellow-100 text-yellow-700 border-yellow-200",
  HELD: "bg-blue-100 text-blue-700 border-blue-200",
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  COMPLETED: "bg-gray-100 text-gray-700 border-gray-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

const milestoneStatusColors: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  EVIDENCE_SUBMITTED: "bg-purple-100 text-purple-700",
  RELEASED: "bg-green-100 text-green-700",
  DISPUTED: "bg-red-100 text-red-700",
};

const typeEmojis: Record<string, string> = {
  CONSTRUCTION: "🏗️",
  FUNDI: "🔧",
  GOODS: "📦",
  CUSTOM: "📝",
};

interface DealCardProps {
  deal: DiasporaDeal;
}

export default function DealCard({ deal }: DealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const progress = {
    released: deal.milestones.filter((m) => m.status === "RELEASED").length,
    total: deal.milestones.length,
  };
  const percent = progress.total > 0 ? (progress.released / progress.total) * 100 : 0;

  const releasedAmount = deal.milestones
    .filter((m) => m.status === "RELEASED")
    .reduce((sum, m) => sum + m.amount, 0);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center text-xl shrink-0">
              {typeEmojis[deal.dealType]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-gray-500">{deal.reference}</span>
                <Badge variant="outline" className={statusColors[deal.status]}>
                  {deal.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-sm text-gray-700 mt-1">
                {deal.funderName} <ArrowRight className="h-3 w-3 inline mx-1 text-gray-400" /> {deal.counterpartyName}
              </p>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progress</span>
                  <span>KES {releasedAmount.toLocaleString()} / {deal.totalAmount.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#16a34a] rounded-full transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {progress.released} of {progress.total} milestones released
                </p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            {deal.milestones.map((ms) => (
              <div key={ms.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-gray-300" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ms.title}</p>
                    <p className="text-xs text-gray-500">KES {ms.amount.toLocaleString()}</p>
                  </div>
                </div>
                <Badge className={milestoneStatusColors[ms.status]}>
                  {ms.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}