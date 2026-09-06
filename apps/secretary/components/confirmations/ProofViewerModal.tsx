"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check } from "lucide-react";
import { DiasporaDeal } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface ProofViewerModalProps {
  deal: DiasporaDeal | null;
  open: boolean;
  onClose: () => void;
}

export default function ProofViewerModal({ deal, open, onClose }: ProofViewerModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!deal) return null;

  const proofUrl = deal.deposit?.proofUrl;
  const submittedAt = deal.deposit?.submittedAt;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const CopyButton = ({ value, label }: { value: string; label: string }) => (
    <button
      onClick={() => copyToClipboard(value, label)}
      className="ml-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      title={`Copy ${label}`}
    >
      {copied === label
        ? <Check className="h-3.5 w-3.5 text-green-500" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-8">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex items-center gap-2">
            Payment Proof — {deal.reference}
            <CopyButton value={deal.reference} label="reference" />
          </DialogTitle>
          <DialogDescription>
            Submitted {submittedAt ? formatDistanceToNow(new Date(submittedAt), { addSuffix: true }) : "recently"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border">
            {proofUrl ? (
              <img
                src={proofUrl}
                alt="Payment proof"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                No proof uploaded
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 rounded-lg p-4">
            <div>
              <p className="text-gray-500 mb-0.5">Amount (KES)</p>
              <div className="flex items-center">
                <p className="font-semibold text-gray-900">KES {deal.totalAmount?.toLocaleString() ?? "0"}</p>
                <CopyButton value={`KES ${deal.totalAmount?.toLocaleString() ?? "0"}`} label="amount" />
              </div>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Estimated Foreign</p>
              <div className="flex items-center">
                <p className="font-semibold text-gray-900">
                  {deal.funderCountry} {deal.totalAmount?.toLocaleString()}
                </p>
                <CopyButton value={`${deal.funderCountry} ${deal.totalAmount?.toLocaleString()}`} label="foreign" />
              </div>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Funder</p>
              <div className="flex items-center">
                <p className="font-semibold text-gray-900">{deal.funderName}</p>
                <CopyButton value={deal.funderName ?? ""} label="funder" />
              </div>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Submitted At</p>
              <div className="flex items-center">
                <p className="font-semibold text-gray-900">
                  {submittedAt ? new Date(submittedAt).toLocaleString("en-GB") : "N/A"}
                </p>
                {submittedAt && (
                  <CopyButton value={new Date(submittedAt).toLocaleString("en-GB")} label="date" />
                )}
              </div>
            </div>
          </div>

          {proofUrl && (
            <Button variant="outline" className="w-full" asChild>
              <a href={proofUrl} target="_blank" rel="noopener noreferrer" download>
                <Download className="h-4 w-4 mr-2" />
                Download Proof
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
