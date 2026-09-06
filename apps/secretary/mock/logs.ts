import { AuditLog } from "@/types";

export const MOCK_LOGS: AuditLog[] = [
  { id: "log-001", action: "Payment confirmed — marked as HELD", performedBy: "Wanjiku M", dealRef: "LSF-DSP-20240902-0002", amount: 90000, timestamp: new Date("2024-09-02T10:00:00") },
  { id: "log-002", action: "FX recorded: 1 USD = 129 KES", performedBy: "Wanjiku M", dealRef: "LSF-DSP-20240902-0002", amount: 87750, timestamp: new Date("2024-09-02T12:00:00") },
  { id: "log-003", action: "Float loaded via C2B", performedBy: "Wanjiku M", amount: 87750, timestamp: new Date("2024-09-02T12:05:00") },
  { id: "log-004", action: "B2C fired — Plumbing milestone released", performedBy: "Wanjiku M", dealRef: "LSF-DSP-20240902-0002", amount: 45000, timestamp: new Date("2024-09-02T15:00:00") },
  { id: "log-005", action: "Payment confirmed — marked as HELD", performedBy: "Wanjiku M", dealRef: "LSF-DSP-20240905-0005", amount: 120000, timestamp: new Date("2024-09-05T15:00:00") },
  { id: "log-006", action: "FX recorded: 1 GBP = 168 KES", performedBy: "Wanjiku M", dealRef: "LSF-DSP-20240905-0005", amount: 117000, timestamp: new Date("2024-09-05T16:00:00") },
  { id: "log-007", action: "B2C fired — Demolition milestone released", performedBy: "Wanjiku M", dealRef: "LSF-DSP-20240905-0005", amount: 30000, timestamp: new Date("2024-09-05T17:00:00") },
  { id: "log-008", action: "Dispute raised on Reconstruction milestone", performedBy: "System", dealRef: "LSF-DSP-20240905-0005", timestamp: new Date("2024-09-06T10:00:00") },
  { id: "log-009", action: "Float topped up manually", performedBy: "Wanjiku M", amount: 200000, timestamp: new Date("2024-09-06T09:00:00") },
  { id: "log-010", action: "Payment proof uploaded by funder", performedBy: "System", dealRef: "LSF-DSP-20240901-0001", timestamp: new Date("2024-09-01T10:00:00") },
];
