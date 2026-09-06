"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useData } from "@/lib/data-context";
import { DiasporaDeal } from "@/types";
import { ArrowRightLeft, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const mockRates = {
  GBP: 168.0,
  USD: 129.0,
  EUR: 140.0,
};

export default function FXPage() {
  const { deals, updateDeal, addLog, setFloatBalance, floatBalance, addFloatTransaction } = useData();
  const [fxInputs, setFxInputs] = useState<Record<string, { currency: string; rate: string; cut: string }>>({});

  const heldDeals = deals.filter((d) => d.status === "HELD");

  const getInput = (dealId: string) =>
    fxInputs[dealId] || { currency: "USD", rate: "", cut: "2.5" };

  const handleRecordFX = (deal: DiasporaDeal) => {
    const input = getInput(deal.id);
    const rate = parseFloat(input.rate);
    const cut = parseFloat(input.cut);

    if (!rate || rate <= 0) {
      toast.error("Please enter a valid exchange rate");
      return;
    }

    const foreignAmount = deal.totalAmount || deal.totalAmount / rate;
    const grossKes = Math.round(foreignAmount * rate);
    const lipasafeAmount = Math.round(grossKes * (cut / 100));
    const netFloat = grossKes - lipasafeAmount;

    const updated: DiasporaDeal = {
      ...deal,
      status: "ACTIVE",
      fxRate: rate,
      grossKes,
      lipasafeCut: cut,
      netFloatAmount: netFloat,
      foreignCurrency: input.currency as "GBP" | "USD" | "EUR",
      updatedAt: new Date().toISOString(),
    };

    updateDeal(updated);
    setFloatBalance(floatBalance + netFloat);

    addFloatTransaction({
      id: `ftx-${Date.now()}`,
      type: "ADD",
      amount: netFloat,
      reference: `C2B-${deal.reference}`,
      dealRef: deal.reference,
      description: `FX conversion load (${input.currency}→KES @ ${rate})`,
      addedBy: "Wanjiku M",
      timestamp: new Date().toISOString(),
    });

    addLog({
      id: `log-${Date.now()}`,
      action: "FX Recorded & Float Loaded",
      performedBy: "Wanjiku M",
      dealRef: deal.reference,
      amount: netFloat,
      details: `${input.currency}→KES @ ${rate}, LipaSafe cut ${cut}%, net loaded to float`,
      timestamp: new Date().toISOString(),
    });

    toast.success(`${deal.reference} FX recorded and KES ${netFloat.toLocaleString()} loaded to float`);
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-[#16a34a]" />
            <span className="font-semibold text-[#16a34a]">Live Reference Rates</span>
          </div>
          <div className="flex gap-6 text-sm">
            <span><strong>1 GBP</strong> = KES {mockRates.GBP}</span>
            <span><strong>1 USD</strong> = KES {mockRates.USD}</span>
            <span><strong>1 EUR</strong> = KES {mockRates.EUR}</span>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold text-gray-900">
        HELD Deals Awaiting FX ({heldDeals.length})
      </h2>

      {heldDeals.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">No deals awaiting FX conversion.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {heldDeals.map((deal) => {
            const input = getInput(deal.id);
            const rate = parseFloat(input.rate) || 0;
            const cut = parseFloat(input.cut) || 2.5;
            const foreignAmount = deal.totalAmount || (rate > 0 ? deal.totalAmount / rate : 0);
            const grossKes = rate > 0 ? Math.round(foreignAmount * rate) : 0;
            const netFloat = grossKes > 0 ? Math.round(grossKes * (1 - cut / 100)) : 0;

            return (
              <Card key={deal.id} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm text-gray-500">{deal.reference}</span>
                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">HELD</Badge>
                      </div>
                      <p className="font-semibold text-gray-900">{deal.funderName} → {deal.counterpartyName}</p>
                      <p className="text-sm text-gray-500 mt-1">Amount: KES {deal.totalAmount.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">
                        Estimated foreign: {deal.funderCountry || "USD"} {deal.totalAmount?.toLocaleString()}
                      </p>
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Currency</Label>
                        <Select
                          value={input.currency}
                          onValueChange={(v) =>
                            setFxInputs((prev) => ({ ...prev, [deal.id]: { ...input, currency: v } }))
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GBP">GBP (£)</SelectItem>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Exchange Rate</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 168.50"
                          value={input.rate}
                          onChange={(e) =>
                            setFxInputs((prev) => ({ ...prev, [deal.id]: { ...input, rate: e.target.value } }))
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Gross KES</Label>
                        <Input value={grossKes > 0 ? grossKes.toLocaleString() : "—"} disabled className="h-9 bg-gray-50" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">LipaSafe Cut %</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={input.cut}
                          onChange={(e) =>
                            setFxInputs((prev) => ({ ...prev, [deal.id]: { ...input, cut: e.target.value } }))
                          }
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col justify-between items-end gap-3 min-w-[180px]">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Net to Float</p>
                        <p className="text-xl font-bold text-[#16a34a]">
                          KES {netFloat > 0 ? netFloat.toLocaleString() : "—"}
                        </p>
                      </div>
                      <Button
                        className="bg-[#16a34a] hover:bg-[#15803d] w-full"
                        onClick={() => handleRecordFX(deal)}
                        disabled={rate <= 0}
                      >
                        <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                        Record FX + Load to Float
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}