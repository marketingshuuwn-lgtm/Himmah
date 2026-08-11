import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { requireCronAuth } from "./_auth";
import { riyadhToday } from "@/lib/hr/time";

/**
 * Scheduled attendance maintenance.
 * mode = "checkout_reminder" → notify employees who checked in but not out (run ~18:00)
 * mode = "auto_close"        → close orphan sessions from the last few days as half_day
 * mode = "checkin_reminder"  → remind active employees with no record today  (run ~09:00)
 *
 * Both maintenance modes deliberately skip days that are not real working days
 * for the employee (public holidays, approved leave) and employees who are not
 * active yet / anymore — otherwise the cron generates false half-days and
 * notification noise, which is the fastest way to lose users' trust in the
 * attendance data.
 */

/** How far back auto_close looks. Bounded so the job stays O(days), not O(history). */
const AUTO_CLOSE_LOOKBACK_DAYS = 3;
const AUTO_CLOSE_MAX_ROWS = 500;

export const Route = createFileRoute("/api/public/hooks/attendance-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronAuth(request);
        if (unauth) return unauth;
        const body = (await request.json().catch(() => ({}))) as { mode?: string };
        const mode = body.mode ?? "checkout_reminder";

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const today = riyadhToday();

        // Audit every cron invocation for traceability.
        await supabase.from("security_audit_log").insert({
          entity_type: "attendance",
          entity_id: null,
          action: `cron_${mode}`,
          actor_user_id: null,
          actor_kind: "cron",
          metadata: { mode, run_date: today, source: "attendance-reminders-hook" },
        });

        /** Dates covered by a public holiday inside [from, to]. */
        const loadHolidayDates = async (from: string, to: string) => {
          const { data } = await supabase
            .from("holidays")
            .select("start_date, end_date")
            .lte("start_date", to)
            .gte("end_date", from);
          const set = new Set<string>();
          for (const h of data ?? []) {
            const cur = new Date(h.start_date + "T00:00:00Z");
            const end = new Date(h.end_date + "T00:00:00Z");
            while (cur <= end) {
              set.add(cur.toISOString().slice(0, 10));
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          }
          return set;
        };

        /** "employeeId|date" keys covered by an approved leave inside [from, to]. */
        const loadLeaveKeys = async (employeeIds: string[], from: string, to: string) => {
          const keys = new Set<string>();
          if (!employeeIds.length) return keys;
          const { data } = await supabase
            .from("leave_requests")
            .select("employee_id, start_date, end_date")
            .eq("status", "approved")
            .in("employee_id", employeeIds)
            .lte("start_date", to)
            .gte("end_date", from);
          for (const l of data ?? []) {
            const cur = new Date(l.start_date + "T00:00:00Z");
            const end = new Date(l.end_date + "T00:00:00Z");
            while (cur <= end) {
              keys.add(`${l.employee_id}|${cur.toISOString().slice(0, 10)}`);
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          }
          return keys;
        };

        if (mode === "auto_close") {
          const since = riyadhToday(new Date(Date.now() - AUTO_CLOSE_LOOKBACK_DAYS * 86_400_000));
          const { data: rawOrphans } = await supabase
            .from("attendance_records")
            .select("id, employee_id, work_date, late_deduction_amount")
            .gte("work_date", since)
            .lt("work_date", today)
            .is("check_out_at", null)
            .not("check_in_at", "is", null)
            .neq("status", "half_day")
            .limit(AUTO_CLOSE_MAX_ROWS);

          const candidates = rawOrphans ?? [];
          let closed = 0;

          if (candidates.length) {
            const empIds = Array.from(new Set(candidates.map((o) => o.employee_id)));
            const [{ data: emps }, holidayDates, leaveKeys] = await Promise.all([
              supabase
                .from("employees")
                .select("id, user_id, department_id, status")
                .in("id", empIds),
              loadHolidayDates(since, today),
              loadLeaveKeys(empIds, since, today),
            ]);
            const empById = new Map((emps ?? []).map((e) => [e.id, e]));

            // Only genuinely missed checkouts get penalised.
            const orphans = candidates.filter((o) => {
              const emp = empById.get(o.employee_id);
              if (!emp || emp.status !== "active") return false;
              if (holidayDates.has(o.work_date)) return false;
              if (leaveKeys.has(`${o.employee_id}|${o.work_date}`)) return false;
              return true;
            });

            if (orphans.length) {
              // Unified financial behavior: a missed checkout carries the same
              // half_day_deduction as a check-in-classified half day. Keep the
              // larger of any existing deduction (e.g. morning lateness) and
              // the department's half-day deduction.
              const { data: hdRules } = await supabase
                .from("attendance_rules")
                .select("department_id, half_day_deduction");
              const hdByDept = new Map(
                (hdRules ?? []).map((r) => [r.department_id, Number(r.half_day_deduction || 0)]),
              );
              const globalHd = hdByDept.get(null) ?? 0;
              // Batch by the resulting deduction amount: one UPDATE ... IN (...)
              // per distinct amount instead of one round-trip per record.
              const byDeduction = new Map<number, string[]>();
              for (const o of orphans) {
                const dept = empById.get(o.employee_id)?.department_id ?? null;
                const hd = (dept && hdByDept.get(dept)) || globalHd;
                const ded = Math.max(Number(o.late_deduction_amount || 0), hd);
                const bucket = byDeduction.get(ded);
                if (bucket) bucket.push(o.id);
                else byDeduction.set(ded, [o.id]);
              }
              await Promise.all(
                Array.from(byDeduction.entries()).map(([ded, ids]) =>
                  supabase
                    .from("attendance_records")
                    .update({
                      status: "half_day",
                      notes: "missed_checkout",
                      late_deduction_amount: ded,
                    })
                    .in("id", ids),
                ),
              );
              closed = orphans.length;

              // notify the affected employees (once each)
              const notified = new Set<string>();
              const rows = orphans.flatMap((o) => {
                const emp = empById.get(o.employee_id);
                if (!emp || notified.has(emp.user_id)) return [];
                notified.add(emp.user_id);
                return [
                  {
                    user_id: emp.user_id,
                    title: "نسيت تسجيل الانصراف",
                    body: `تم احتساب نصف يوم ليوم ${o.work_date}. يمكنك تقديم طلب تصحيح من صفحة الحضور.`,
                    link: "/attendance",
                  },
                ];
              });
              if (rows.length) await supabase.from("notifications").insert(rows);
            }
          }

          return new Response(JSON.stringify({ ok: true, scanned: candidates.length, closed }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        if (mode === "checkin_reminder") {
          // A public holiday is not a working day — stay silent.
          const holidayDates = await loadHolidayDates(today, today);
          if (holidayDates.has(today)) {
            return new Response(JSON.stringify({ ok: true, sent: 0, reason: "holiday" }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          const { data: emps } = await supabase
            .from("employees")
            .select("id, user_id, hire_date")
            .eq("status", "active")
            .lte("hire_date", today);
          const empIds = (emps ?? []).map((e) => e.id);
          if (!empIds.length)
            return new Response(JSON.stringify({ ok: true, sent: 0 }), {
              headers: { "Content-Type": "application/json" },
            });
          const [{ data: todayRecs }, leaveKeys] = await Promise.all([
            supabase
              .from("attendance_records")
              .select("employee_id")
              .eq("work_date", today)
              .in("employee_id", empIds),
            loadLeaveKeys(empIds, today, today),
          ]);
          const present = new Set((todayRecs ?? []).map((r) => r.employee_id));
          const missing = (emps ?? []).filter(
            (e) => !present.has(e.id) && !leaveKeys.has(`${e.id}|${today}`),
          );
          if (missing.length) {
            await supabase.from("notifications").insert(
              missing.map((e) => ({
                user_id: e.user_id,
                title: "تذكير: لم تسجّل حضورك بعد",
                body: "ابدأ يومك بتسجيل الحضور.",
                link: "/attendance",
              })),
            );
          }
          return new Response(JSON.stringify({ ok: true, sent: missing.length }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // default: checkout_reminder
        const { data: open } = await supabase
          .from("attendance_records")
          .select("employee_id")
          .eq("work_date", today)
          .not("check_in_at", "is", null)
          .is("check_out_at", null);
        const empIds = (open ?? []).map((o) => o.employee_id);
        if (!empIds.length)
          return new Response(JSON.stringify({ ok: true, sent: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        const { data: emps } = await supabase
          .from("employees")
          .select("id, user_id")
          .in("id", empIds)
          .eq("status", "active");
        await supabase.from("notifications").insert(
          (emps ?? []).map((e) => ({
            user_id: e.user_id,
            title: "🔔 لا تنسَ تسجيل الانصراف",
            body: "اضغط هنا لتسجيل انصرافك قبل مغادرة المكتب.",
            link: "/attendance",
          })),
        );
        return new Response(JSON.stringify({ ok: true, sent: emps?.length ?? 0 }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
