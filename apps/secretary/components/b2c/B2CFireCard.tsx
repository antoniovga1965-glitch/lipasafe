"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data-context";
import { DiasporaDeal, DiasporaMilestone, MilestoneStatus } from "@/types";
import { Rocket, Wallet, Construction, Wrench, Package, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const dealTypeEmojis: Record<string, string> = {
  CONSTRUCTION: "🏗️",
  FUNDI: "🔧",
  GOODS: "📦",
  CUSTOM: "📝",
};

export default function B2CPage() {
  const { deals, updateDeal, floatBalance, setFloatBalance, addFloatTransaction, addLog } = useData();
  const [confirmingMilestone, setConfirmingMilestone] = useState<{
    deal: DiasporaDeal;
    milestone: DiasporaMilestone;
  } | null>(null);

  const readyMilestones: { deal: DiasporaDeal; milestone: DiasporaMilestone }[] = [];
  deals.forEach((deal) => {
    deal.milestones.forEach((ms) => {
      if (ms.status === "EVIDENCE_SUBMITTED") {
        readyMilestones.push({ deal, milestone: ms });
      }
    });
  });

  const handleFireB2C = () => {
    if (!confirmingMilestone) return;
    const { deal, milestone } = confirmingMilestone;

    if (floatBalance < milestone.amount) {
      toast.error("Insufficient float balance!");
      return;
    }

    const newBalance = floatBalance - milestone.amount;
    setFloatBalance(newBalance);

    const updatedMilestones = deal.milestones.map((m) =>
      m.id === milestone.id ? { ...m, status: "RELEASED" as MilestoneStatus, completedAt: new Date().toISOString() } : m
    );

    const allReleased = updatedMilestones.every((m) => m.status === "RELEASED");
    const updatedDeal: DiasporaDeal = {
      ...deal,
      milestones: updatedMilestones,
      status: allReleased ? "COMPLETED" : deal.status,
      updatedAt: new Date().toISOString(),
    };

    updateDeal(updatedDeal);

    addFloatTransaction({
      id: `ftx-${Date.now()}`,
      type: "B2C_PAYOUT",
      amount: milestone.amount,
      reference: `B2C-${deal.reference}-${milestone.id}`,
      dealRef: deal.reference,
      description: `${milestone.title} → ${deal.counterpartyName}`,
      addedBy: "Wanjiku M",
      timestamp: new Date().toISOString(),
    });

    addLog({
      id: `log-${Date.now()}`,
      action: "B2C Fired",
      performedBy: "Wanjiku M",
      dealRef: deal.reference,
      amount: milestone.amount,
      details: `${milestone.title} → ${deal.counterpartyName}`,
      timestamp: new Date().toISOString(),
    });

    toast.success(`B2C fired! KES ${milestone.amount.toLocaleString()} sent to ${deal.counterpartyName}`);
    setConfirmingMilestone(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">
        B2C Fire Queue ({readyMilestones.length})
      </h2>

      {readyMilestones.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">No milestones ready for B2C payout.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {readyMilestones.map(({ deal, milestone }) => {
            const hasEnoughFloat = floatBalance >= milestone.amount;
            return (
              <Card key={`${deal.id}-${milestone.id}`} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center text-2xl shrink-0">
                        {dealTypeEmojis[deal.dealType]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-500">{deal.reference}</span>
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200">READY</Badge>
                        </div>
                        <p className="font-semibold text-gray-900">{milestone.title}</p>
                        <p className="text-sm text-gray-500">
                          {deal.counterpartyName} • {deal.counterpartyPhone}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          Funder approved {milestone.approvedAt ? formatDistanceToNow(new Date(milestone.approvedAt), { addSuffix: true }) : "recently"}
                        </p>
                        {milestone.evidenceUrls && milestone.evidenceUrls.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {milestone.evidenceUrls.slice(0, 3).map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Evidence ${i + 1}`}
                                className="h-16 w-16 rounded-lg object-cover border"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={hasEnoughFloat ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-700 bg-red-50"}
                      >
                        <Wallet className="h-3 w-3 mr-1" />
                        {hasEnoughFloat ? "Sufficient Float" : "Insufficient Float"}
                      </Badge>
                      <div className="text-right mr-2">
                        <p className="text-2xl font-bold text-gray-900">KES {milestone.amount.toLocaleString()}</p>
                      </div>
                      <Button
                        className="bg-[#16a34a] hover:bg-[#15803d]"
                        onClick={() => setConfirmingMilestone({ deal, milestone })}
                        disabled={!hasEnoughFloat}
                      >
                        <Rocket className="h-4 w-4 mr-1.5" />
                        Fire B2C
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!confirmingMilestone} onOpenChange={() => setConfirmingMilestone(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm B2C Payout</DialogTitle>
            <DialogDescription>
              You are about to send money via M-Pesa B2C
            </DialogDescription>
          </DialogHeader>
          {confirmingMilestone && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-gray-500">Recipient</p>
                <p className="font-semibold">{confirmingMilestone.deal.counterpartyName}</p>
                <p className="font-mono text-sm">{confirmingMilestone.deal.counterpartyPhone}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-gray-500">Amount</p>
                <p className="text-2xl font-bold text-[#16a34a]">
                  KES {confirmingMilestone.milestone.amount.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmingMilestone(null)}>
                  Cancel
                </Button>
                <Button className="flex-1 bg-[#16a34a] hover:bg-[#15803d]" onClick={handleFireB2C}>
                  <Rocket className="h-4 w-4 mr-1.5" />
                  Confirm & Send
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}