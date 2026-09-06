"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetchFloat, postAddFloat } from "@/lib/api";

interface FloatTx {
  id: string;
  type: "ADD" | "B2C_PAYOUT" | "REVERSAL";
  amount: number;
  reference: string;
  dealRef?: string;
  milestoneId?: string;
  addedBy?: string;
  note?: string;
  createdAt: string;
}

interface FloatData {
  id: string;
  balance: number;
  currency: string;
  lastUpdated: string;
  transactions: FloatTx[];
}

export default function FloatPage() {
  const [float, setFloat]           = useState<FloatData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [waitingMpesa, setWaitingMpesa] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount]         = useState("");
  const [phone, setPhone]           = useState("");
  const [note, setNote]             = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFloat();
      if (res.success) setFloat(res.float);
      else toast.error(res.message || "Failed to load float");
    } catch {
      toast.error("Network error loading float");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll for balance update after STK push
  const pollBalance = useCallback(async (before: number) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetchFloat();
        if (res.success && Number(res.float.balance) > before) {
          setFloat(res.float);
          setWaitingMpesa(false);
          toast.success("Float credited successfully!");
          clearInterval(interval);
        }
      } catch {}
      if (attempts >= 24) { // 2 min timeout
        clearInterval(interval);
        setWaitingMpesa(false);
        toast.error("M-Pesa confirmation timed out — check float balance manually");
        await load();
      }
    }, 5000);
  }, [load]);

  const handleAdd = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!phone)           { toast.error("Enter phone number"); return; }

    setSubmitting(true);
    try {
      const res = await postAddFloat(amt, phone, note || "Float top-up");
      if (res.success) {
        toast.success("STK push sent — check your phone and enter M-Pesa PIN");
        setAmount(""); setPhone(""); setNote("");
        setDialogOpen(false);
        setWaitingMpesa(true);
        const before = Number(float?.balance ?? 0);
        pollBalance(before);
      } else {
        toast.error(res.message || "Failed to initiate STK push");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const balance = Number(float?.balance ?? 0);
  const txs     = float?.transactions ?? [];

  return (
    <div className="space-y-6">

      {/* Waiting for M-Pesa banner */}
      {waitingMpesa && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-blue-600 shrink-0 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-blue-700">Waiting for M-Pesa confirmation</p>
            <p className="text-xs text-blue-600">Enter your PIN on the prompt — balance will update automatically.</p>
          </div>
        </div>
      )}

      {/* Low float warning */}
      {!loading && !waitingMpesa && balance < 50000 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Low Float Warning</p>
            <p className="text-xs text-red-600">Balance below KES 50,000 — add funds before next release.</p>
          </div>
        </div>
      )}

      {/* Balance card */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="text-sm text-gray-500 mb-1">Current Float Balance</p>
              {loading
                ? <div className="h-10 w-48 bg-gray-100 animate-pulse rounded" />
                : <p className="text-4xl font-bold text-[#16a34a]">
                    KES {balance.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </p>
              }
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="icon" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#16a34a] hover:bg-[#15803d] h-12 px-6 text-base">
                    <Plus className="h-5 w-5 mr-2" /> Add Float
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Float via M-Pesa</DialogTitle>
                    <DialogDescription>
                      Enter the phone number and amount. You'll receive an M-Pesa STK push to confirm.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input
                        type="tel"
                        placeholder="e.g. 0712345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (KES)</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 50000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Note (optional)</Label>
                      <Input
                        placeholder="e.g. Equity Bank transfer"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full bg-[#16a34a] hover:bg-[#15803d]"
                      onClick={handleAdd}
                      disabled={submitting}
                    >
                      {submitting
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending STK push...</>
                        : <><Smartphone className="h-4 w-4 mr-2" /> Send M-Pesa Prompt</>
                      }
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Transaction History ({txs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading
            ? <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
                ))}
              </div>
            : txs.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No transactions yet.</p>
              : <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="pb-3 px-4 font-medium">Date</th>
                        <th className="pb-3 px-4 font-medium">Type</th>
                        <th className="pb-3 px-4 font-medium text-right">Amount</th>
                        <th className="pb-3 px-4 font-medium">Reference</th>
                        <th className="pb-3 px-4 font-medium">Deal Ref</th>
                        <th className="pb-3 px-4 font-medium">Added By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txs.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-600">
                            {tx.createdAt ? format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm") : "—"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={
                                tx.type === "ADD"
                                  ? "border-green-200 text-green-700 bg-green-50"
                                  : tx.type === "REVERSAL"
                                  ? "border-yellow-200 text-yellow-700 bg-yellow-50"
                                  : "border-red-200 text-red-700 bg-red-50"
                              }
                            >
                              {tx.type === "ADD"
                                ? <ArrowUpCircle className="h-3 w-3 mr-1 inline" />
                                : <ArrowDownCircle className="h-3 w-3 mr-1 inline" />
                              }
                              {tx.type}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            <span className={tx.type === "ADD" ? "text-green-600" : "text-red-600"}>
                              {tx.type === "ADD" ? "+" : "-"} KES {Number(tx.amount).toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-gray-600">{tx.reference}</td>
                          <td className="py-3 px-4 font-mono text-xs text-gray-500">{tx.dealRef ?? "—"}</td>
                          <td className="py-3 px-4 text-gray-600">{tx.addedBy ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
