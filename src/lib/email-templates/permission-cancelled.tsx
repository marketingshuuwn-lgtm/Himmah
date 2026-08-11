import * as React from "react";
import type { TemplateEntry } from "./registry";
import { ApprovalEmail } from "./_shared";

interface Props {
  employeeName?: string;
  permissionType?: string;
  requestDate?: string;
  fromTime?: string;
  toTime?: string;
}

const Email = (p: Props) => (
  <ApprovalEmail
    employeeName={p.employeeName}
    requestKind="permission"
    action="cancelled"
    details={{
      "نوع الإذن": p.permissionType || "—",
      "التاريخ": p.requestDate || "—",
      "من": p.fromTime || "—",
      "إلى": p.toTime || "—",
    }}
  />
);

export const template = {
  component: Email,
  subject: "تم إلغاء طلب الإذن",
  displayName: "إلغاء إذن",
  previewData: { employeeName: "أحمد", permissionType: "استئذان شخصي", requestDate: "2026-07-15", fromTime: "13:00", toTime: "15:00" },
} satisfies TemplateEntry;
