import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ContractStep {
  key: "created" | "sent" | "opened" | "employee_decision" | "biometric" | "signed";
  label: string;
  state: "done" | "current" | "pending" | "failed";
  at: string | null;
  actor: string | null;
  detail: string | null;
}

export interface ContractStatusResult {
  contract: {
    id: string;
    title: string;
    status: string;
    employee_name: string;
    created_at: string;
    sent_at: string | null;
    signed_at: string | null;
    effective_date: string | null;
    employee_note: string | null;
    employee_note_at: string | null;
  };
  steps: ContractStep[];
  timeline: Array<{
    id: string;
    event: string;
    created_at: string;
    actor_name: string | null;
    ip_address: string | null;
  }>;
}

/**
 * Approval-chain view of a single contract: email dispatch → employee opens →
 * employee decision → biometric verification → signature. Everything is derived
 * from the contract row, its audit trail and the signature record, so the page
 * never invents a step that did not actually happen.
 */
export const getContractApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contract_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ContractStatusResult> => {
    const { data: c, error } = await context.supabase
      .from("contracts")
      .select(
        "id, title, status, employee_id, created_at, sent_at, signed_at, effective_date, employee_note, employee_note_at",
      )
      .eq("id", data.contract_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("العقد غير موجود");

    const { data: emp } = await context.supabase
      .from("employees")
      .select("user_id")
      .eq("id", c.employee_id)
      .maybeSingle();
    let employeeName = "—";
    if (emp?.user_id) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", emp.user_id)
        .maybeSingle();
      employeeName = prof?.full_name ?? "—";
    }

    const { data: rows } = await context.supabase
      .from("contract_audit_log")
      .select("id, event, details, ip_address, created_at, actor_id")
      .eq("contract_id", data.contract_id)
      .order("created_at", { ascending: true });
    const events = rows ?? [];

    const ids = Array.from(new Set(events.map((r) => r.actor_id).filter(Boolean) as string[]));
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string }[] };
    const pm = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const nameOf = (id: string | null) => (id ? (pm.get(id) ?? null) : null);

    const first = (event: string) => events.find((e) => e.event === event) ?? null;

    const { data: sig } = await context.supabase
      .from("signatures")
      .select("signed_at, webauthn_verified, signer_id")
      .eq("contract_id", data.contract_id)
      .maybeSingle();

    const openedEvent = first("sign_link_opened") ?? first("viewed");
    const rejected = first("rejected");
    const cancelled = first("cancelled");
    const isCancelled = c.status === "cancelled";
    const isSigned = c.status === "signed";

    const steps: ContractStep[] = [
      {
        key: "created",
        label: "إنشاء العقد",
        state: "done",
        at: c.created_at,
        actor: nameOf(first("created")?.actor_id ?? null),
        detail: c.title,
      },
      {
        key: "sent",
        label: "إرسال بريد التوقيع للموظف",
        state: c.sent_at ? "done" : isCancelled ? "failed" : "current",
        at: c.sent_at,
        actor: nameOf(first("sent")?.actor_id ?? null),
        detail: c.sent_at ? "تم إرسال الإشعار للموظف" : "بانتظار الإرسال من الموارد البشرية",
      },
      {
        key: "opened",
        label: "فتح الموظف لرابط العقد",
        state: openedEvent ? "done" : c.sent_at ? "current" : "pending",
        at: openedEvent?.created_at ?? null,
        actor: nameOf(openedEvent?.actor_id ?? null),
        detail: openedEvent?.ip_address ? `IP ${openedEvent.ip_address}` : null,
      },
      {
        key: "employee_decision",
        label: "موافقة الموظف على البنود",
        state: rejected ? "failed" : isSigned ? "done" : openedEvent ? "current" : "pending",
        at: rejected?.created_at ?? c.employee_note_at ?? (isSigned ? c.signed_at : null),
        actor: employeeName,
        detail: rejected ? "رفض الموظف العقد" : (c.employee_note ?? null),
      },
      {
        key: "biometric",
        label: "التحقق بالبصمة / الوجه",
        state: sig ? (sig.webauthn_verified ? "done" : "pending") : isSigned ? "pending" : "pending",
        at: sig?.signed_at ?? null,
        actor: sig ? employeeName : null,
        detail: sig
          ? sig.webauthn_verified
            ? "تم التحقق عبر مفتاح المرور (WebAuthn)"
            : "وُقّع بدون تحقق حيوي"
          : "لم يتم التوقيع بعد",
      },
      {
        key: "signed",
        label: "التوقيع النهائي",
        state: isSigned ? "done" : isCancelled ? "failed" : "pending",
        at: c.signed_at,
        actor: isSigned ? employeeName : null,
        detail: isCancelled ? (cancelled ? "أُلغي العقد" : "ملغى") : null,
      },
    ];

    return {
      contract: {
        id: c.id,
        title: c.title,
        status: c.status as string,
        employee_name: employeeName,
        created_at: c.created_at,
        sent_at: c.sent_at,
        signed_at: c.signed_at,
        effective_date: c.effective_date ?? null,
        employee_note: c.employee_note ?? null,
        employee_note_at: c.employee_note_at ?? null,
      },
      steps,
      timeline: events.map((e) => ({
        id: e.id,
        event: e.event,
        created_at: e.created_at,
        actor_name: nameOf(e.actor_id),
        ip_address: e.ip_address,
      })),
    };
  });
