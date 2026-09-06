"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useData } from "@/lib/data-context";
import { DiasporaDeal, DealStatus } from "@/types";
import { CheckCircle, XCircle, Eye, Construction, Wrench, Package, FileText, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ProofViewerModal from "@/components/confirmations/ProofViewerModal";
import { confirmDeal, rejectDeal } from "@/lib/api";

const dealTypeIcons: Record<string, { icon: typeof Construction; label: string }> = {
  CONSTRUCTION: { icon: Construction, label: "Construction" },
  FUNDI: { icon: Wrench, label: "Fundi" },
  GOODS: { icon: Package, label: "Goods" },
  CUSTOM: { icon: FileText, label: "Custom" },
};

export default function ConfirmationsPage() {
  const { deals, updateDeal, addLog } = useData();
  const [viewingDeal, setViewingDeal] = useState<DiasporaDeal | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [rejectingDeal, setRejectingDeal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bankRefInputs, setBankRefInputs] = useState<Record<string, string>>({});

  const pendingDeals = deals.filter((d) => d.status === "PENDING_CONFIRMATION");

  const handleConfirm = async (deal: DiasporaDeal) => {
    const bankRef = bankRefInputs[deal.id]?.trim();
    if (!bankRef || bankRef.length < 3) {
      toast.error("Enter a bank reference (min 3 characters)");
      return;
    }
    const res = await confirmDeal(deal.id, bankRef);
    if (!res.success) {
      toast.error(res.message || "Failed to confirm deal");
      return;
    }
    const updated: DiasporaDeal = { ...deal, status: "HELD" };
    updateDeal(updated);
    addLog({
      id: `log-${Date.now()}`,
      action: "Payment Confirmed",
      performedBy: "Wanjiku M",
      dealRef: deal.reference,
      amount: deal.totalAmount,
      details: `Bank credit confirmed (ref: ${bankRef}), deal marked as HELD`,
      timestamp: new Date().toISOString(),
    });
    toast.success(`${deal.reference} confirmed and marked as HELD`);
  };

  const handleReject = async (deal: DiasporaDeal) => {
    if (!rejectReason.trim() || rejectReason.trim().length < 5) {
      toast.error("Rejection reason must be at least 5 characters");
      return;
    }
    const res = await rejectDeal(deal.id, rejectReason.trim());
    if (!res.success) {
      toast.error(res.message || "Failed to reject deal");
      return;
    }
    const updated: DiasporaDeal = { ...deal, status: "CANCELLED" };
    updateDeal(updated);
    addLog({
      id: `log-${Date.now()}`,
      action: "Payment Rejected",
      performedBy: "Wanjiku M",
      dealRef: deal.reference,
      amount: deal.totalAmount,
      details: `Rejected: ${rejectReason}`,
      timestamp: new Date().toISOString(),
    });
    toast.error(`${deal.reference} rejected: ${rejectReason}`);
    setRejectingDeal(null);
    setRejectReason("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending Confirmations ({pendingDeals.length})
        </h2>
      </div>

      {pendingDeals.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <p className="text-gray-500">No pending confirmations. All caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingDeals.map((deal) => {
            const typeInfo = dealTypeIcons[deal.dealType];
            return (
              <Card key={deal.id} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                        <typeInfo.icon className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-500">{deal.reference}</span>
                          <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-700 bg-yellow-50">
                            AWAITING CONFIRMATION
                          </Badge>
                        </div>
                        <p className="font-semibold text-gray-900 mt-0.5 flex items-center">
                          {deal.funderName}
                          <Globe className="inline h-4 w-4 text-blue-500 mx-1" />
                          {deal.counterpartyName}
                        </p>
                        <p className="text-sm text-gray-500">{deal.counterpartyPhone}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="font-semibold text-gray-900">KES {deal.totalAmount.toLocaleString()}</span>
                          <span className="text-gray-400">
                            ≈ {deal.funderCountry} {deal.totalAmount?.toLocaleString()}
                          </span>
                          <span className="text-gray-400">
                            Submitted {formatDistanceToNow(new Date(deal.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setViewingDeal(deal);
                          setProofModalOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        View Proof
                      </Button>
                      {rejectingDeal === deal.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Reason for rejection"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="w-48 h-9"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(deal)}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRejectingDeal(null);
                              setRejectReason("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setRejectingDeal(deal.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1.5" />
                            Reject
                          </Button>
                          <Input
                            placeholder="Bank ref"
                            value={bankRefInputs[deal.id] || ""}
                            onChange={(e) =>
                              setBankRefInputs((prev) => ({ ...prev, [deal.id]: e.target.value }))
                            }
                            className="w-32 h-9"
                          />
                          <Button
                            size="sm"
                            className="bg-[#16a34a] hover:bg-[#15803d]"
                            onClick={() => handleConfirm(deal)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1.5" />
                            Confirm — Mark as HELD
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProofViewerModal
        deal={viewingDeal}
        open={proofModalOpen}
        onClose={() => setProofModalOpen(false)}
      />
    </div>
  );
}
