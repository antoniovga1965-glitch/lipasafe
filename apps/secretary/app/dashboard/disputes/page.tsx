"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data-context";
import { DisputeCase, DisputeResolution } from "@/types";
import { Gavel, RotateCcw, MessageSquare, Music, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { fetchDisputesAPI, resolveDisputeAPI, dismissDisputeAPI, apiFetch } from "@/lib/api";

function inferEvidenceType(url: string): 'image' | 'video' | 'audio' {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(ext)) return 'audio';
  return 'image';
}

function mapDispute(raw: any): DisputeCase {
  return {
    id:            raw.id,
    dealId:        raw.dealId        ?? raw.deal?.id        ?? '',
    dealRef:       raw.dealRef       ?? raw.deal?.ref       ?? raw.id.slice(0, 8).toUpperCase(),
    milestoneId:   raw.milestoneId   ?? raw.milestone?.id   ?? '',
    milestoneName: raw.milestoneName ?? raw.milestone?.title ?? 'Milestone',
    status:        (raw.status?.toUpperCase() ?? 'OPEN') as DisputeCase['status'],
    resolution:    raw.resolution    ?? undefined,
    resolvedAt:    raw.resolvedAt    ?? undefined,
    raisedBy:      raw.raisedBy      ?? 'funder',
    raisedByName:  raw.raisedByName  ?? raw.funder?.name    ?? 'Unknown',
    reason:        raw.reason        ?? raw.description      ?? '',
    amountAtStake: raw.amountAtStake ?? raw.milestone?.amount ?? raw.amount ?? 0,
    evidenceUrls:  raw.evidenceUrls  ?? raw.evidence?.map((e: any) => e.url)           ?? [],
    evidenceTypes: raw.evidenceTypes ?? raw.evidence?.map((e: any) => e.type ?? 'image') ?? (raw.evidenceUrls ?? []).map((u: string) => inferEvidenceType(u)),
    messages: (raw.messages ?? []).map((m: any) => ({
      id:        m.id,
      sender:    m.sender    ?? m.senderType ?? 'funder',
      text:      m.text      ?? m.content    ?? '',
      timestamp: m.timestamp ?? m.createdAt  ?? new Date().toISOString(),
    })),
    secretaryNotes:        raw.secretaryNotes        ?? '',
    bankDetailsRequested:  raw.bankDetailsRequested  ?? false,
    refundBankName:        raw.refundBankName         ?? '',
    refundAccountNo:       raw.refundAccountNo        ?? '',
  }
}

export default function DisputesPage() {
  const { addLog, setFloatBalance, floatBalance, addFloatTransaction } = useData();

  const [disputes, setDisputes]           = useState<DisputeCase[]>([]);
  const [loading, setLoading]             = useState(true);
  const [resolving, setResolving]         = useState<string | null>(null);
  const [requestingBank, setRequestingBank] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeCase | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [disputeToDismiss, setDisputeToDismiss] = useState<DisputeCase | null>(null);

  const loadDisputes = useCallback(async () => {
    try {
      const data = await fetchDisputesAPI();
      if (data.success && Array.isArray(data.data?.disputes)) {
        setDisputes(data.data.disputes.map(mapDispute));
      } else {
        toast.error(data.message ?? 'Failed to load disputes');
      }
    } catch {
      toast.error('Network error loading disputes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDisputes() }, [loadDisputes]);

  // Re-fetch every 30s so bank details appear without a manual refresh
  useEffect(() => {
    const id = setInterval(loadDisputes, 30_000);
    return () => clearInterval(id);
  }, [loadDisputes]);

  // Also re-fetch whenever the secretary tabs back into this window
  useEffect(() => {
    window.addEventListener('focus', loadDisputes);
    return () => window.removeEventListener('focus', loadDisputes);
  }, [loadDisputes]);

  const openCount        = disputes.filter((d) => d.status === 'OPEN').length;
  const underReviewCount = disputes.filter((d) => d.status === 'UNDER_REVIEW').length;

  const handleRequestBankDetails = async (dispute: DisputeCase) => {
    setRequestingBank(dispute.id);
    try {
      const data = await apiFetch(`/diaspora/admin/disputes/${dispute.id}/request-bank-details`, {
        method: 'POST',
      });
      if (!data.success) throw new Error(data.message ?? 'Failed');
      setDisputes(prev => prev.map(d =>
        d.id === dispute.id ? { ...d, bankDetailsRequested: true } : d
      ));
      toast.success('Bank details request sent to funder');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send request');
    } finally {
      setRequestingBank(null);
    }
  };

  const handleRule = async (dispute: DisputeCase, resolution: DisputeResolution) => {
    setResolving(dispute.id);
    try {
      const res = await resolveDisputeAPI(dispute.id, resolution, dispute.secretaryNotes);
      if (!res.success) throw new Error(res.message ?? 'Resolve failed');

      setDisputes(prev => prev.map(d =>
        d.id === dispute.id
          ? { ...d, status: 'RESOLVED', resolution, resolvedAt: new Date().toISOString() }
          : d
      ));

      if (resolution === 'FAVOR_CONTRACTOR' && floatBalance >= dispute.amountAtStake) {
        setFloatBalance(floatBalance - dispute.amountAtStake);
        addFloatTransaction({
          id: `ftx-${Date.now()}`, type: 'B2C_PAYOUT',
          amount: dispute.amountAtStake,
          reference: `B2C-DISP-${dispute.id}`,
          dealRef: dispute.dealRef,
          description: `Dispute payout → ${dispute.raisedByName}`,
          addedBy: 'Wanjiku M',
          timestamp: new Date().toISOString(),
        });
      }

      addLog({
        id: `log-${Date.now()}`, action: 'Dispute Resolved',
        performedBy: 'Wanjiku M', dealRef: dispute.dealRef,
        amount: dispute.amountAtStake,
        details: `Ruled: ${resolution === 'FAVOR_FUNDER' ? 'funder (refund)' : 'contractor (release)'}`,
        timestamp: new Date().toISOString(),
      });

      toast.success(`Resolved in favor of ${resolution === 'FAVOR_FUNDER' ? 'funder' : 'contractor'}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to resolve dispute');
    } finally {
      setResolving(null);
    }
  };

  const handleDismiss = async (dispute: DisputeCase) => {
    setDismissing(dispute.id);
    try {
      const res = await dismissDisputeAPI(dispute.id);
      if (!res.success) throw new Error(res.message ?? 'Dismiss failed');
      setDisputes(prev => prev.filter(d => d.id !== dispute.id));
      addLog({
        id: `log-${Date.now()}`, action: 'Dispute Dismissed',
        performedBy: 'Wanjiku M', dealRef: dispute.dealRef,
        details: 'Secretary dismissed the dispute',
        timestamp: new Date().toISOString(),
      });
      toast.success('Dispute dismissed');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to dismiss dispute');
    } finally {
      setDismissing(null);
      setDisputeToDismiss(null);
    }
  };

  const updateNotes = (dispute: DisputeCase, notes: string) =>
    setDisputes(prev => prev.map(d => d.id === dispute.id ? { ...d, secretaryNotes: notes } : d));

  const handleRequestEvidence = (dispute: DisputeCase) => {
    updateNotes(dispute, dispute.secretaryNotes + '\n[Evidence requested ' + new Date().toLocaleDateString() + ']');
    addLog({
      id: `log-${Date.now()}`, action: 'Evidence Requested',
      performedBy: 'Wanjiku M', dealRef: dispute.dealRef,
      details: 'Secretary requested more evidence', timestamp: new Date().toISOString(),
    });
    toast.info('Evidence request noted');
    setNotesModalOpen(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );

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
                      <Badge className={
                        dispute.status === 'OPEN'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : dispute.status === 'UNDER_REVIEW'
                          ? 'bg-orange-100 text-orange-700 border-orange-200'
                          : 'bg-green-100 text-green-700 border-green-200'
                      }>{dispute.status}</Badge>
                      <span className="text-sm text-gray-500 ml-2">{dispute.milestoneName}</span>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Raised by {dispute.raisedBy} — {dispute.raisedByName}</p>
                      <p className="text-sm text-gray-700 mt-1">{dispute.reason}</p>
                    </div>

                    {(dispute.evidenceUrls ?? []).length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-2">Evidence</p>
                        <div className="flex flex-wrap gap-2">
                          {dispute.evidenceUrls!.map((url, i) => {
                            const type = dispute.evidenceTypes?.[i];
                            if (type === 'image') return (
                              <button key={i} onClick={() => setLightboxImage(url)}
                                className="h-20 w-20 rounded-lg overflow-hidden border hover:opacity-80 transition-opacity">
                                <img src={url} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
                              </button>
                            );
                            if (type === 'video') return (
                              <div key={i} className="w-full max-w-md">
                                <video src={url} controls className="w-full rounded-lg border" />
                              </div>
                            );
                            if (type === 'audio') return (
                              <div key={i} className="w-full max-w-md bg-gray-50 rounded-lg p-3 border">
                                <div className="flex items-center gap-2 mb-2">
                                  <Music className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs text-gray-500">Audio Evidence</span>
                                </div>
                                <audio src={url} controls className="w-full" />
                              </div>
                            );
                            return null;
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" /> Messages
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {dispute.messages.map((msg) => (
                          <div key={msg.id} className={`p-3 rounded-lg max-w-[80%] ${
                            msg.sender === 'funder'
                              ? 'bg-blue-50 text-blue-900 ml-0 mr-auto'
                              : 'bg-green-50 text-green-900 ml-auto mr-0'
                          }`}>
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
                      <p className="text-2xl font-bold text-gray-900">
                        KES {dispute.amountAtStake?.toLocaleString() ?? '—'}
                      </p>
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

                    {dispute.status !== 'RESOLVED' && (
                      <div className="space-y-2">
                        <Button variant="outline"
                          className="w-full justify-start text-purple-600 border-purple-200 hover:bg-purple-50"
                          disabled={requestingBank === dispute.id}
                          onClick={() => handleRequestBankDetails(dispute)}>
                          {requestingBank === dispute.id
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <Gavel className="h-4 w-4 mr-2" />}
                          {dispute.bankDetailsRequested ? 'Resend Bank Details Request' : 'Refund Funder — Request Bank Details'}
                        </Button>
                        {dispute.refundBankName && (
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-semibold text-purple-700">Bank Details Received</p>
                            <p className="text-sm font-mono text-purple-900">{dispute.refundBankName}</p>
                            <p className="text-sm font-mono text-purple-900">{dispute.refundAccountNo}</p>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm"
                                className="flex-1 bg-[#16a34a] hover:bg-[#15803d] text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    `${dispute.refundBankName} | ${dispute.refundAccountNo}`
                                  );
                                  toast.success('Copied to clipboard');
                                }}>
                                Copy Details
                              </Button>
                              <Button size="sm" variant="outline"
                                className="flex-1 text-xs border-green-200 text-green-700"
                                onClick={() => handleRule(dispute, 'FAVOR_FUNDER')}>
                                Mark Settled
                              </Button>
                            </div>
                          </div>
                        )}
                        <Button className="w-full justify-start bg-[#16a34a] hover:bg-[#15803d]"
                          disabled={resolving === dispute.id}
                          onClick={() => handleRule(dispute, 'FAVOR_CONTRACTOR')}>
                          {resolving === dispute.id
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <Gavel className="h-4 w-4 mr-2" />}
                          Rule for Contractor — Release
                        </Button>
                        <Button variant="secondary" className="w-full justify-start"
                          onClick={() => { setSelectedDispute(dispute); setNotesModalOpen(true); }}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Request More Evidence
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
                          disabled={dismissing === dispute.id}
                          onClick={() => setDisputeToDismiss(dispute)}
                        >
                          {dismissing === dispute.id
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <RotateCcw className="h-4 w-4 mr-2 rotate-180" />}
                          Dismiss Dispute
                        </Button>
                      </div>
                    )}

                    {dispute.status === 'RESOLVED' && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm font-semibold text-green-700">
                          Resolved: {dispute.resolution === 'FAVOR_FUNDER' ? 'Refund to Funder' : 'Released to Contractor'}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          {dispute.resolvedAt ? formatDistanceToNow(new Date(dispute.resolvedAt), { addSuffix: true }) : ''}
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
          <Textarea placeholder="Describe what additional evidence you need..." className="min-h-[120px]" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotesModalOpen(false)}>Cancel</Button>
            <Button className="bg-[#16a34a] hover:bg-[#15803d]"
              onClick={() => selectedDispute && handleRequestEvidence(selectedDispute)}>
              Send Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!disputeToDismiss} onOpenChange={(open) => !open && setDisputeToDismiss(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this dispute?</DialogTitle>
            <DialogDescription>
              This will remove the dispute from the active list. This cannot be undone from this screen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDisputeToDismiss(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={dismissing === disputeToDismiss?.id}
              onClick={() => disputeToDismiss && handleDismiss(disputeToDismiss)}
            >
              {dismissing === disputeToDismiss?.id
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : null}
              Yes, Dismiss
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
