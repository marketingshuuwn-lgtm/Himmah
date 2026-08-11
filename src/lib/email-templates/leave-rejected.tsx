import * as React from "react";
import type { TemplateEntry } from "./registry";
import { ApprovalEmail } from "./_shared";

interface Props {
  employeeName?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  note?: string | null;
}

const Email = (p: Props) => (
  <ApprovalEmail
    employeeName={p.employeeName}
    requestKind="leave"
    action="rejected"
    note={p.note}
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
  subject: "تم رفض طلب الإجازة",
  displayName: "رفض إجازة",
  previewData: { employeeName: "أحمد", leaveType: "سنوية", startDate: "2026-08-01", endDate: "2026-08-05", days: 5, note: "الفترة غير مناسبة" },
} satisfies TemplateEntry;
