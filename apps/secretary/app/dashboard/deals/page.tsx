"use client";

import { useState } from "react";
import { useData } from "@/lib/data-context";
import { DealType, DealStatus } from "@/types";
import DealFilters from "@/components/deals/DealFilters";
import DealCard from "@/components/deals/DealCard";

export default function DealsPage() {
  const { deals } = useData();
  const [typeFilter, setTypeFilter] = useState<DealType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DealStatus | "ALL">("ALL");

  const filtered = deals.filter((d) => {
    if (typeFilter !== "ALL" && d.dealType !== typeFilter) return false;
    if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <DealFilters
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
      />

      <div className="grid gap-4">
        {filtered.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}