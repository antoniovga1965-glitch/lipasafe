"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data-context";
import { DisputeCase, DisputeStatus, DisputeResolution } from "@/types";
import { ShieldAlert, Gavel, RotateCcw, MessageSquare, Image, Video, Music } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function DisputesPage() {
  const { disputes, updateDispute, deals, updateDeal, setFloatBalance, floatBalance, addFloatTransaction, addLog } = useData();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeCase | null>(null);

  const openCount = disputes.filter((d) => d.status === "OPEN").length;
  const underReviewCount = disputes.filter((d) => d.status === "UNDER_REVIEW").length;

  const handleRule = (dispute: DisputeCase, resolution: DisputeResolution) => {
    const updated: DisputeCase = {
      ...dispute,
      status: "RESOLVED",
      resolution,
      resolvedAt: new Date().toISOString(),
    };
    updateDispute(updated);

    if (resolution === "FAVOR_CONTRACTOR") {
      const deal = deals.find((d) => d.id === dispute.dealId);
      if (deal) {
        const updatedMilestones = deal.milestones.map((m) =>
          m.id === dispute.milestoneId ? { ...m, status: "RELEASED" as const, completedAt: new Date().toISOString() } : m
        );
        const allReleased = updatedMilestones.every((m) => m.status === "RELEASED");
        updateDeal({
          ...deal,
          milestones: updatedMilestones,
          status: allReleased ? "COMPLETED" : deal.status,
          updatedAt: new Date().toISOString(),
        });

        if (floatBalance >= dispute.amountAtStake) {
          setFloatBalance(floatBalance - dispute.amountAtStake);
          addFloatTransaction({
            id: `ftx-${Date.now()}`,
            type: "B2C_PAYOUT",
            amount: dispute.amountAtStake,
            reference: `B2C-DISP-${dispute.id}`,
            dealRef: dispute.dealRef,
            description: `Dispute resolution payout → ${dispute.raisedByName}`,
            addedBy: "Wanjiku M",
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    addLog({
      id: `log-${Date.now()}`,
      action: "Dispute Resolved",
      performedBy: "Wanjiku M",
      dealRef: dispute.dealRef,
      amount: dispute.amountAtStake,
      details: `Ruled in favor of ${resolution === "FAVOR_FUNDER" ? "funder (refund)" : "contractor (release)"}`,
      timestamp: new Date().toISOString(),
    });

    toast.success(`Dispute resolved in favor of ${resolution === "FAVOR_FUNDER" ? "funder" : "contractor"}`);
  };

  const handleRequestEvidence = (dispute: DisputeCase) => {
    const updated: DisputeCase = {
      ...dispute,
      status: "UNDER_REVIEW",
      secretaryNotes: dispute.secretaryNotes + "\n[Evidence requested on " + new Date().toLocaleDateString() + "]",
    };
    updateDispute(updated);
    addLog({
      id: `log-${Date.now()}`,
      action: "Evidence Requested",
      performedBy: "Wanjiku M",
      dealRef: dispute.dealRef,
      details: "Secretary requested more evidence from parties",
      timestamp: new Date().toISOString(),
    });
    toast.info("Evidence request noted");
    setNotesModalOpen(false);
  };

  const updateNotes = (dispute: DisputeCase, notes: string) => {
    updateDispute({ ...dispute, secretaryNotes: notes });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-sm font-semibold text-red-700">{openCount} OPEN</span>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
          <span className="text-sm font-semibold text-orange-700">{underReviewCount} UNDER REVIEW</span>
        </div>
      </div>

      {disputes.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">No disputes at this time.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {disputes.map((dispute) => (
            <Card key={dispute.id} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-500">{dispute.dealRef}</span>
                      <Badge
                        className={
                          dispute.status === "OPEN"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : dispute.status === "UNDER_REVIEW"
                            ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-green-100 text-green-700 border-green-200"
                        }
                      >
                        {dispute.status}
                      </Badge>
                      <span className="text-sm text-gray-500 ml-2">{dispute.milestoneName}</span>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Raised by {dispute.raisedBy} — {dispute.raisedByName}</p>
                      <p className="text-sm text-gray-700 mt-1">{dispute.reason}</p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">Evidence</p>
                      <div className="flex flex-wrap gap-2">
                        {dispute.evidenceUrls.map((url, i) => {
                          const type = dispute.evidenceTypes[i];
                          if (type === "image") {
                            return (
                              <button
                                key={i}
                                onClick={() => setLightboxImage(url)}
                                className="h-20 w-20 rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                              >
                                <img src={url} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
                              </button>
                            );
                          }
                          if (type === "video") {
                            return (
                              <div key={i} className="w-full max-w-md">
                                <video src={url} controls className="w-full rounded-lg border" />
                              </div>
                            );
                          }
                          if (type === "audio") {
                            return (
                              <div key={i} className="w-full max-w-md bg-gray-50 rounded-lg p-3 border">
                                <div className="flex items-center gap-2 mb-2">
                                  <Music className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs text-gray-500">Audio Evidence</span>
                                </div>
                                <audio src={url} controls className="w-full" />
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" /> Messages
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {dispute.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-lg max-w-[80%] ${
                              msg.sender === "funder"
                                ? "bg-blue-50 text-blue-900 ml-0 mr-auto"
                                : "bg-green-50 text-green-900 ml-auto mr-0"
                            }`}
                          >
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:w-80 space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Amount at Stake</p>
                      <p className="text-2xl font-bold text-gray-900">KES {dispute.amountAtStake.toLocaleString()}</p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">Secretary Notes</p>
                      <Textarea
                        value={dispute.secretaryNotes}
                        onChange={(e) => updateNotes(dispute, e.target.value)}
                        className="min-h-[100px] text-sm"
                        placeholder="Add your notes here..."
                      />
                    </div>

                    {dispute.status !== "RESOLVED" && (
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => handleRule(dispute, "FAVOR_FUNDER")}
                        >
                          <Gavel className="h-4 w-4 mr-2" />
                          Rule for Funder — Refund
                        </Button>
                        <Button
                          className="w-full justify-start bg-[#16a34a] hover:bg-[#15803d]"
                          onClick={() => handleRule(dispute, "FAVOR_CONTRACTOR")}
                        >
                          <Gavel className="h-4 w-4 mr-2" />
                          Rule for Contractor — Release
                        </Button>
                        <Button
                          variant="secondary"
                          className="w-full justify-start"
                          onClick={() => {
                            setSelectedDispute(dispute);
                            setNotesModalOpen(true);
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Request More Evidence
                        </Button>
                      </div>
                    )}

                    {dispute.status === "RESOLVED" && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm font-semibold text-green-700">
                          Resolved: {dispute.resolution === "FAVOR_FUNDER" ? "Refund to Funder" : "Released to Contractor"}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          {dispute.resolvedAt ? formatDistanceToNow(new Date(dispute.resolvedAt), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {lightboxImage && (
        <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
            <img src={lightboxImage} alt="Full size" className="w-full h-auto" />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={notesModalOpen} onOpenChange={setNotesModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request More Evidence</DialogTitle>
            <DialogDescription>Add notes about what evidence is needed</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Describe what additional evidence you need..."
            className="min-h-[120px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotesModalOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#16a34a] hover:bg-[#15803d]"
              onClick={() => selectedDispute && handleRequestEvidence(selectedDispute)}
            >
              Send Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}