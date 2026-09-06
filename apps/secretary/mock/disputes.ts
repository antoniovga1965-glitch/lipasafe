import { DisputeCase } from "@/types";

export const MOCK_DISPUTES: DisputeCase[] = [
  {
    id: "disp-001",
    milestoneId: "m-011",
    dealId: "deal-005",
    dealReference: "LSF-DSP-20240905-0005",
    milestoneName: "Reconstruction",
    amount: 60000,
    raisedBy: "funder",
    raisedByName: "Robert Otieno",
    reason: "Work not done to agreed standard. Walls are cracking already.",
    evidence: [
      { type: "image", url: "https://picsum.photos/400/305" },
      { type: "image", url: "https://picsum.photos/400/306" },
      { type: "video", url: "https://www.w3schools.com/html/mov_bbb.mp4" },
    ],
    messages: [
      { from: "funder", text: "The walls are cracking, this is unacceptable.", timestamp: new Date("2024-09-06T10:00:00") },
      { from: "contractor", text: "The cracks are normal settling, will fill them.", timestamp: new Date("2024-09-06T11:00:00") },
      { from: "funder", text: "This was not in the agreement. I want a refund.", timestamp: new Date("2024-09-06T12:00:00") },
    ],
    secretaryNotes: "",
    status: "OPEN",
    createdAt: new Date("2024-09-06T10:00:00"),
  },
];
