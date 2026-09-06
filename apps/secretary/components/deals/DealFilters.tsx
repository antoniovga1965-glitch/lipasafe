"use client";

import { Button } from "@/components/ui/button";
import { DealType, DealStatus } from "@/types";

const typeFilters: { type: DealType | "ALL"; label: string }[] = [
  { type: "ALL", label: "All" },
  { type: "CONSTRUCTION", label: "Construction" },
  { type: "FUNDI", label: "Fundi" },
  { type: "GOODS", label: "Goods" },
  { type: "CUSTOM", label: "Custom" },
];

const statusFilters: { status: DealStatus | "ALL"; label: string }[] = [
  { status: "ALL", label: "All" },
  { status: "ACTIVE", label: "Active" },
  { status: "HELD", label: "Held" },
  { status: "COMPLETED", label: "Completed" },
];

interface DealFiltersProps {
  typeFilter: DealType | "ALL";
  statusFilter: DealStatus | "ALL";
  onTypeChange: (type: DealType | "ALL") => void;
  onStatusChange: (status: DealStatus | "ALL") => void;
}

export default function DealFilters({ typeFilter, statusFilter, onTypeChange, onStatusChange }: DealFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {typeFilters.map((f) => (
          <Button
            key={f.type}
            variant={typeFilter === f.type ? "default" : "outline"}
            size="sm"
            className={typeFilter === f.type ? "bg-[#16a34a] hover:bg-[#15803d]" : ""}
            onClick={() => onTypeChange(f.type)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((f) => (
          <Button
            key={f.status}
            variant={statusFilter === f.status ? "default" : "outline"}
            size="sm"
            className={statusFilter === f.status ? "bg-[#16a34a] hover:bg-[#15803d]" : ""}
            onClick={() => onStatusChange(f.status)}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}