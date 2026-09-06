import { FloatTransaction } from "@/types";

export const MOCK_FLOAT_BALANCE = 245000;

export const MOCK_FLOAT_TRANSACTIONS: FloatTransaction[] = [
  { id: "ft-001", type: "ADD", amount: 87750, reference: "QHJ12345", dealId: "deal-002", addedBy: "Wanjiku M", createdAt: new Date("2024-09-02T12:00:00") },
  { id: "ft-002", type: "B2C_PAYOUT", amount: 45000, reference: "QHJ12346", dealId: "deal-002", milestoneId: "m-004", addedBy: "Wanjiku M", createdAt: new Date("2024-09-02T15:00:00") },
  { id: "ft-003", type: "ADD", amount: 117000, reference: "QHJ12347", dealId: "deal-005", addedBy: "Wanjiku M", createdAt: new Date("2024-09-05T16:00:00") },
  { id: "ft-004", type: "B2C_PAYOUT", amount: 30000, reference: "QHJ12348", dealId: "deal-005", milestoneId: "m-010", addedBy: "Wanjiku M", createdAt: new Date("2024-09-05T17:00:00") },
  { id: "ft-005", type: "ADD", amount: 200000, reference: "QHJ12349", addedBy: "Wanjiku M", createdAt: new Date("2024-09-06T09:00:00") },
];
