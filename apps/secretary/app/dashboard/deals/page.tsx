"use client";

import { useState } from "react";
import { useData } from "@/lib/data-context";
import { DealType, DealStatus } from "@/types";
import DealFilters from "@/components/deals/DealFilters";
import DealCard from "@/components/deals/DealCard";

export default function DealsPage() {
  const { deals, dealsLoading, dealsPagination, loadMoreDeals } = useData();
  const [typeFilter, setTypeFilter] = useState<DealType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DealStatus | "ALL">("ALL");

  const filtered = deals.filter((d) => {
    if (typeFilter !== "ALL" && d.dealType !== typeFilter) return false;
    if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
    return true;
  });

  const hasMoreDeals = dealsPagination.page > 0 && dealsPagination.page < dealsPagination.pages;

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
        {hasMoreDeals && (
          <button
            onClick={loadMoreDeals}
            disabled={dealsLoading}
            className="w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {dealsLoading ? "Loading..." : "Load more"}
          </button>
        )}
    </div>
  );
}