import * as React from "react";
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from "@react-email/components";

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif", direction: "rtl" as const };
const container = { padding: "32px 24px", maxWidth: "560px", margin: "0 auto" };
const header = { borderBottom: "3px solid #0d9488", paddingBottom: "12px", marginBottom: "24px" };
const brand = { color: "#0d9488", fontSize: "20px", fontWeight: 700, margin: 0 };
const heading = { color: "#0f172a", fontSize: "22px", margin: "0 0 12px" };
const paragraph = { color: "#334155", fontSize: "15px", lineHeight: "24px", margin: "8px 0" };
const box = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", margin: "16px 0" };
const label = { color: "#64748b", fontSize: "12px", margin: "0 0 4px" };
const value = { color: "#0f172a", fontSize: "15px", fontWeight: 600, margin: 0 };
const footer = { color: "#94a3b8", fontSize: "12px", marginTop: "24px", textAlign: "center" as const };
const statusPill = (color: string) => ({
  display: "inline-block", padding: "4px 12px", borderRadius: "999px",
  backgroundColor: color + "22", color, fontSize: "13px", fontWeight: 600,
});

export interface ApprovalEmailProps {
  employeeName?: string;
  requestKind: "leave" | "permission";
  action: "approved" | "rejected" | "cancelled";
  details?: Record<string, string>;
  note?: string | null;
}

const ACTION_META = {
  approved: { label: "تمت الموافقة", color: "#16a34a", verb: "الموافقة على" },
  rejected: { label: "تم الرفض", color: "#dc2626", verb: "رفض" },
  cancelled: { label: "تم الإلغاء", color: "#64748b", verb: "إلغاء" },
} as const;

export function ApprovalEmail({ employeeName, requestKind, action, details, note }: ApprovalEmailProps) {
  const kindAr = requestKind === "leave" ? "الإجازة" : "الإذن";
  const meta = ACTION_META[action];
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{`${meta.label} — طلب ${kindAr}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>نظام الموارد البشرية — العلامة</Text>
          </Section>
          <Heading style={heading}>{`${meta.verb} طلب ${kindAr}`}</Heading>
          <Text style={paragraph}>مرحباً {employeeName || "،"},</Text>
          <Text style={paragraph}>
            نُعلمك بأنه {action === "cancelled" ? "قد تم إلغاء" : "قد تمت مراجعة"} طلب {kindAr} الخاص بك.
          </Text>
          <Section style={box}>
            <Text style={label}>الحالة</Text>
            <Text style={value}>
              <span style={statusPill(meta.color)}>{meta.label}</span>
            </Text>
            {details && Object.entries(details).map(([k, v]) => (
              <div key={k} style={{ marginTop: "12px" }}>
                <Text style={label}>{k}</Text>
                <Text style={value}>{v}</Text>
              </div>
            ))}
            {note && (
              <div style={{ marginTop: "12px" }}>
                <Text style={label}>ملاحظة المراجع</Text>
                <Text style={value}>{note}</Text>
              </div>
            )}
          </Section>
          <Hr />
          <Text style={footer}>هذه رسالة تلقائية من نظام الموارد البشرية.</Text>
        </Container>
      </Body>
    </Html>
  );
}
