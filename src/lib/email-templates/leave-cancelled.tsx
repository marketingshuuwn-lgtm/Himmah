import * as React from "react";
import type { TemplateEntry } from "./registry";
import { ApprovalEmail } from "./_shared";

interface Props {
  employeeName?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
}

const Email = (p: Props) => (
  <ApprovalEmail
    employeeName={p.employeeName}
    requestKind="leave"
    action="cancelled"
    details={{
      "نوع الإجازة": p.leaveType || "—",
      "من": p.startDate || "—",
      "إلى": p.endDate || "—",
      "عدد الأيام": String(p.days ?? "—"),
    }}
  />
);

export const template = {
  component: Email,
  subject: "تم إلغاء طلب الإجازة",
  displayName: "إلغاء إجازة",
  previewData: { employeeName: "أحمد", leaveType: "سنوية", startDate: "2026-08-01", endDate: "2026-08-05", days: 5 },
} satisfies TemplateEntry;
