export type DealType = "CONSTRUCTION" | "FUNDI" | "GOODS" | "CUSTOM";

export type DealStatus =
  | "AWAITING_PAYMENT"
  | "PENDING_CONFIRMATION"
  | "HELD"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type MilestoneStatus =
  | "PENDING"
  | "ACTIVE"
  | "EVIDENCE_SUBMITTED"
  | "RELEASED"
  | "DISPUTED";

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED";
export type DisputeResolution = "FAVOR_FUNDER" | "FAVOR_CONTRACTOR";
export type FloatTxType = "ADD" | "B2C_PAYOUT";

export interface DiasporaMilestone {
  id: string;
  dealId: string;
  title: string;
  description?: string;
  amount: number;
  order: number;
  status: MilestoneStatus;
  evidencePhotos: string[];
  releasedAt?: Date;
  b2cTransactionId?: string;
  createdAt: Date;
}

export interface DiasporaDeal {
  id: string;
  reference: string;
  funderId: string;
  funderName: string;
  funderCountry: string;
  counterpartyPhone: string;
  counterpartyName: string;
  dealType: DealType;
  description: string;
  totalAmount: number;
  proofOfPaymentUrl?: string;
  deposit?: {
    proofUrl: string;
    submittedAt: string;
    bankRef?: string | null;
    status: string;
  };
  confirmedBy?: string;
  confirmedAt?: Date;
  fxRate?: number;
  grossKes?: number;
  lipasafeCut?: number;
  netFloatAmount?: number;
  fxRecordedBy?: string;
  fxRecordedAt?: Date;
  status: DealStatus;
  milestones: DiasporaMilestone[];
  createdAt: Date;
}

export interface DisputeMessage {
  from: "funder" | "contractor";
  text: string;
  timestamp: Date;
}

export interface DisputeEvidence {
  type: "image" | "video" | "audio";
  url: string;
}

export interface DisputeCase {
  id: string;
  milestoneId: string;
  dealId: string;
  dealReference: string;
  milestoneName: string;
  amount: number;
  raisedBy: "funder" | "contractor";
  raisedByName: string;
  reason: string;
  evidence: DisputeEvidence[];
  messages: DisputeMessage[];
  secretaryNotes:        string;
  bankDetailsRequested?: boolean;
  refundBankName?:       string;
  refundAccountNo?:      string;
  status: DisputeStatus;
  resolution?: DisputeResolution;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface FloatTransaction {
  id: string;
  type: FloatTxType;
  amount: number;
  reference?: string;
  dealId?: string;
  milestoneId?: string;
  addedBy: string;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  dealRef?: string;
  amount?: number;
  timestamp: Date;
}

export interface DiasporaActivityLog {
  id: string;
  action: string;
  actorId: string | null;
  actorType: string;
  entityType: string;
  entityId: string;
  amount?: number | null;
  newState?: any;
  previousState?: any;
  timestamp: string;
  actor?: { fullName?: string; phone?: string } | null;
}

export interface ActivityLogsPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
