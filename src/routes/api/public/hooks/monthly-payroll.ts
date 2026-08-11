import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "./_auth";
import { computePayrollRows } from "@/lib/hr/payroll-engine";
import { riyadhToday, lastDateOfMonth, nextMonthStart } from "@/lib/hr/time";

/**
 * Monthly payroll cron hook.
 * Intended to be invoked daily by the external scheduler; internally
 * checks payroll_settings.auto_generate_day and no-ops on any other day,
 * so HR can change the generation date from the app without touching the
 * external trigger's schedule.
 * Behavior:
 *   - For each active employee, ensure a payroll_runs row for current month.
 *     (Uses the SAME shared engine as generatePayroll — no duplicated logic.)
 *   - Absence is counted only for working days elapsed up to today (Riyadh),
 *     so the day-25 run never deducts the not-yet-happened end of month.
 *   - Approved leave days and public holidays are excused, never absence.
 *   - Sets approval_status per payroll_settings.auto_request_approval:
 *     'pending_admin_approval' (default) so HR must explicitly sign off
 *     before anything reaches an employee, or 'draft' if disabled.
 *   - Sets pay_date to the last day of the current month.
 */
export const Route = createFileRoute("/api/public/hooks/monthly-payroll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronAuth(request);
        if (unauth) return unauth;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const today = riyadhToday();
          const periodMonth = today.slice(0, 7) + "-01";
          const payDate = lastDateOfMonth(periodMonth);
          const start = periodMonth;
          const end = nextMonthStart(periodMonth);
          // Mid-month generation: only count absence for days that have passed.
          const asOfDate = today < payDate ? today : payDate;

          const { data: settings } = await supabaseAdmin
            .from("payroll_settings")
            .select("auto_generate_day, auto_request_approval")
            .eq("id", true)
            .maybeSingle();
          const targetDay = settings?.auto_generate_day ?? 25;
          const todayDay = Number(today.slice(8, 10));
          if (todayDay !== targetDay) {
            return Response.json({
              ok: true,
              skipped: true,
              reason: `today is day ${todayDay}, configured generation day is ${targetDay}`,
            });
          }
          const initialStatus =
            (settings?.auto_request_approval ?? true)
              ? ("pending_admin_approval" as const)
              : ("draft" as const);

          const { data: emps } = await supabaseAdmin
            .from("employees")
            .select("id, user_id, department_id, base_salary, allowances, hire_date")
            .eq("status", "active");
          if (!emps?.length) return Response.json({ ok: true, generated: 0 });

          const empIds = emps.map((e: any) => e.id);

          const [rulesRes, att, bn, dd, hol] = await Promise.all([
            supabaseAdmin
              .from("attendance_rules")
              .select(
                "department_id, absence_deduction, late_deduction_per_minute, absence_calc_mode",
              ),
            supabaseAdmin
              .from("attendance_records")
              .select("employee_id, work_date, status, late_minutes, late_deduction_amount")
              .in("employee_id", empIds)
              .gte("work_date", start)
              .lt("work_date", end),
            supabaseAdmin
              .from("bonuses")
              .select("employee_id, amount")
              .in("employee_id", empIds)
              .gte("period_month", start)
              .lt("period_month", end),
            supabaseAdmin
              .from("deductions")
              .select("employee_id, amount")
              .in("employee_id", empIds)
              .gte("period_month", start)
              .lt("period_month", end),
            supabaseAdmin
              .from("holidays")
              .select("start_date, end_date")
              .lte("start_date", payDate)
              .gte("end_date", start),
          ]);

          const now = new Date().toISOString();
          const computed = computePayrollRows({
            periodMonth: start,
            asOfDate,
            employees: emps as any,
            attendance: (att.data ?? []) as any,
            bonuses: (bn.data ?? []) as any,
            deductions: (dd.data ?? []) as any,
            rules: (rulesRes.data ?? []) as any,
            holidays: (hol.data ?? []) as any,
          }).map((r) => ({
            ...r,
            generated_at: now,
            pay_date: payDate,
            emailed_at: now,
            approval_status: initialStatus,
            approved_by: null,
            approved_at: null,
            employee_decided_at: null,
          }));

          // Never overwrite finalized (locked) rows or rows already
          // delivered to / confirmed by the employee.
          const { data: protectedRows } = await supabaseAdmin
            .from("payroll_runs")
            .select("employee_id, locked_at, approval_status")
            .eq("period_month", start);
          const protectedSet = new Set(
            (protectedRows ?? [])
              .filter(
                (r: { locked_at: string | null; approval_status: string }) =>
                  r.locked_at != null ||
                  r.approval_status === "sent_to_employee" ||
                  r.approval_status === "employee_approved",
              )
              .map((r: { employee_id: string }) => r.employee_id),
          );
          const rows = computed.filter((r) => !protectedSet.has(r.employee_id));

          if (rows.length) {
            const { error: upErr } = await supabaseAdmin
              .from("payroll_runs")
              .upsert(rows, { onConflict: "employee_id,period_month" });
            if (upErr) throw upErr;
          }

          // Notify HR that this month's payroll is ready for their review —
          // employees are notified only later, once HR explicitly approves
          // and sends via approveAndSendPayroll.
          if (rows.length && initialStatus === "pending_admin_approval") {
            const { data: hrRoles } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .eq("role", "hr_admin");
            const recipients = Array.from(
              new Set((hrRoles ?? []).map((r: { user_id: string }) => r.user_id)),
            );
            if (recipients.length) {
              await supabaseAdmin.from("notifications").insert(
                recipients.map((uid) => ({
                  user_id: uid,
                  kind: "payroll" as const,
                  title: `رواتب ${start} بانتظار اعتمادك`,
                  body: `تولّد ${rows.length} كشف راتب تلقائياً — راجع واعتمد الإرسال للموظفين.`,
                  link: "/payroll",
                })),
              );
            }
          }

          // Audit-log the cron-triggered payroll batch.
          await supabaseAdmin.from("security_audit_log").insert({
            entity_type: "payroll_run",
            entity_id: null,
            action: "monthly_generate",
            actor_user_id: null,
            actor_kind: "cron",
            metadata: {
              period_month: start,
              pay_date: payDate,
              as_of_date: asOfDate,
              generated: rows.length,
              source: "monthly-payroll-hook",
            },
          });

          return Response.json({
            ok: true,
            generated: rows.length,
            skipped_locked: protectedSet.size,
            pay_date: payDate,
          });
        } catch (e: any) {
          console.error("[monthly-payroll]", e);
          return Response.json(
            { ok: false, error: e?.message ?? "internal error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
