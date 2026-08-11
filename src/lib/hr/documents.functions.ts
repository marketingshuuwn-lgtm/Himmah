import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export type DocumentCategory =
  | "national_id" | "passport" | "iqama" | "driver_license"
  | "qualification" | "certificate" | "cv" | "contract_copy"
  | "medical" | "insurance" | "training" | "work_permit" | "other";

export const documentCategoryLabels: Record<DocumentCategory, string> = {
  national_id: "هوية وطنية",
  passport: "جواز سفر",
  iqama: "إقامة",
  driver_license: "رخصة قيادة",
  qualification: "مؤهل علمي",
  certificate: "شهادة",
  cv: "السيرة الذاتية",
  contract_copy: "نسخة عقد",
  medical: "تقرير طبي / تأمين",
  insurance: "بوليصة تأمين",
  training: "دورة تدريبية",
  work_permit: "تصريح عمل",
  other: "أخرى",
};

export interface DocumentRow {
  id: string;
  employee_id: string;
  employee_name: string;
  category: DocumentCategory;
  title: string;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  notes: string | null;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  days_to_expiry: number | null;
}

async function resolveEmpIdForUser(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("employees").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

function daysToExpiry(d: string | null): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scope: z.enum(["mine", "all"]).default("mine"), employee_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<DocumentRow[]> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("employee_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.scope === "mine") {
      const empId = await resolveEmpIdForUser(supabase, userId);
      if (!empId) return [];
      q = q.eq("employee_id", empId);
    } else if (data.employee_id) {
      q = q.eq("employee_id", data.employee_id);
    }
    const { data: rows, error } = await q;
    if (error) throw mapDbError(error);

    const empIds = Array.from(new Set((rows ?? []).map((r: any) => r.employee_id)));
    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, user_id").in("id", empIds)
      : { data: [] as any[] };
    const userIds = (emps ?? []).map((e: any) => e.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e.user_id]));
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

    return (rows ?? []).map((r: any) => ({
      ...r,
      employee_name: (profMap.get(empMap.get(r.employee_id)!) as string) || "—",
      days_to_expiry: daysToExpiry(r.expiry_date),
    }));
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  category: z.enum([
    "national_id","passport","iqama","driver_license","qualification","certificate",
    "cv","contract_copy","medical","insurance","training","work_permit","other",
  ]),
  title: z.string().min(1).max(150),
  document_number: z.string().max(60).optional().nullable(),
  issue_date: z.string().min(10).optional().nullable(),
  expiry_date: z.string().min(10).optional().nullable(),
  issuing_authority: z.string().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  storage_path: z.string().min(1).max(500),
  file_size: z.number().int().nonnegative().optional().nullable(),
  mime_type: z.string().max(120).optional().nullable(),
});

export const upsertDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let empId = data.employee_id;
    if (!empId) {
      const own = await resolveEmpIdForUser(supabase, userId);
      if (!own) throw new Error("لا يوجد ملف موظف مرتبط بحسابك");
      empId = own;
    }
    const payload: any = {
      employee_id: empId,
      category: data.category,
      title: data.title,
      document_number: data.document_number ?? null,
      issue_date: data.issue_date ?? null,
      expiry_date: data.expiry_date ?? null,
      issuing_authority: data.issuing_authority ?? null,
      notes: data.notes ?? null,
      storage_path: data.storage_path,
      file_size: data.file_size ?? null,
      mime_type: data.mime_type ?? null,
      uploaded_by: userId,
    };
    if (data.id) {
      const { error } = await supabase.from("employee_documents").update(payload).eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("employee_documents").insert(payload).select("id").single();
    if (error) throw mapDbError(error);
    return { id: row.id };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row } = await supabase.from("employee_documents").select("storage_path").eq("id", data.id).maybeSingle();
    const { error } = await supabase.from("employee_documents").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    if (row?.storage_path) {
      await supabase.storage.from("documents").remove([row.storage_path]);
    }
    return { ok: true };
  });

export const signDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("documents")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const expiringDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(180).default(30) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const cutoff = new Date(Date.now() + data.days * 86400000).toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("employee_documents")
      .select("id, title, category, expiry_date, employee_id")
      .not("expiry_date", "is", null)
      .lte("expiry_date", cutoff)
      .order("expiry_date", { ascending: true })
      .limit(50);
    if (error) throw mapDbError(error);
    return (rows ?? []).map((r: any) => ({ ...r, days_to_expiry: daysToExpiry(r.expiry_date) }));
  });
