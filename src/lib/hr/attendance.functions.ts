import { createServerFn } from "@tanstack/react-start";
import { mapDbError } from "@/lib/hr/db-errors";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  riyadhToday,
  riyadhNowMinutes,
  riyadhIsoAt,
  riyadhIsoAtDate,
  riyadhHM,
  isWeekend,
  datesOfMonth,
} from "@/lib/hr/time";
import {
  holidayDateSet,
  countAbsenceDays,
  absenceDeductionFor,
  EXCUSED_OR_PRESENT,
} from "@/lib/hr/payroll-engine";
import {
  lateDeductionFor,
  halfDayDeductionFor,
  earlyLeaveDeductionFor,
} from "@/lib/hr/deduction-engine";

export type {
  LateTier,
  AttendanceRule,
  PunchPhase,
  PunchWindowState,
  AttendanceStatus,
  AttendanceRecord,
  MissedCheckoutAlert,
  ShiftInfo,
  MyAttendanceContext,
  CorrectionStatus,
  CorrectionInfo,
  EarlyLeaveResult,
} from "@/lib/hr/attendance-core";

// Pure logic + shared types live in attendance-core.ts, and all Supabase
// access helpers in attendance-rules.server.ts. This file must stay a thin
// wrapper of createServerFn declarations: the build transform drops
// module-scope siblings of a server function, which would otherwise surface
// as ReferenceError at runtime in production.
export { classifyCheckIn, classifyEarlyLeave, computeWindowState } from "@/lib/hr/attendance-core";

import {
  haversine,
  hmToMin,
  hmToMinSafe,
  normalizeRule,
  summarize,
  todayIsoAt,
  classifyCheckIn,
  classifyEarlyLeave,
  computeWindowState,
  parseCorrection,
  HISTORY_FIELDS,
  fmtVal,
  type AttendanceRule,
  type AttendanceRecord,
  type AttendanceStatus,
  type CorrectionInfo,
  type CorrectionStatus,
  type MissedCheckoutAlert,
  type MyAttendanceContext,
  type PunchWindowState,
  type ShiftInfo,
} from "@/lib/hr/attendance-core";
import {
  assertAllowedNetwork,
  assertAttendanceEditor,
  assertManagementRole,
  assertPunchCooldown,
  getClientIp,
  loadEffectiveRule,
  loadOverrideRole,
  loadRuleFor,
  loadShiftFor,
  loadTodayPermissions,
  logPunch,
} from "@/lib/hr/attendance-rules.server";

/** Public helper for the rules editor: what IP does the server see for me now? */
export const getMyNetworkIp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ ip: await getClientIp() }));

export const getMyAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAttendanceContext> => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id, department_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) {
      return {
        employee_id: null,
        rule: null,
        today: null,
        recent: [],
        missed_checkout: null,
        window_state: null,
        shift: null,
        can_override: false,
        month_summary: {
          present: 0,
          late: 0,
          early: 0,
          half_day: 0,
          absent: 0,
          total_late_minutes: 0,
          total_late_deduction: 0,
        },
      };
    }

    const today = riyadhToday();
    const monthStart = today.slice(0, 7) + "-01";
    const [{ data: todayRow }, { data: recent }, { data: monthRows }, eff, canOverride] =
      await Promise.all([
        supabase
          .from("attendance_records")
          .select("*")
          .eq("employee_id", emp.id)
          .eq("work_date", today)
          .maybeSingle(),
        supabase
          .from("attendance_records")
          .select("*")
          .eq("employee_id", emp.id)
          .order("work_date", { ascending: false })
          .limit(14),
        supabase
          .from("attendance_records")
          .select("*")
          .eq("employee_id", emp.id)
          .gte("work_date", monthStart),
        loadEffectiveRule(supabase, emp, riyadhToday()),
        loadOverrideRole(supabase, userId),
      ]);
    const rule = eff.rule;
    const shift = eff.shift;

    // Read-only detection: prior day with check-in but no check-out.
    // Flagging (status=half_day + deduction) is owned exclusively by the
    // auto_close cron in attendance-reminders — a GET must not mutate data.
    let missed: MissedCheckoutAlert | null = null;
    const recentList = (recent as AttendanceRecord[]) ?? [];
    const orphan = recentList.find(
      (r) => r.work_date !== today && r.check_in_at && !r.check_out_at && r.status !== "half_day",
    );
    if (orphan) {
      // Not yet processed by the cron — surface the alert without writing.
      missed = {
        record_id: orphan.id,
        work_date: orphan.work_date,
        check_in_at: orphan.check_in_at!,
      };
    } else {
      // Surface still-pending half_day missed_checkout entries as the active alert
      const flagged = recentList.find(
        (r) => r.work_date !== today && r.notes === "missed_checkout" && !r.check_out_at,
      );
      if (flagged) {
        missed = {
          record_id: flagged.id,
          work_date: flagged.work_date,
          check_in_at: flagged.check_in_at!,
        };
      }
    }

    const todayRec = (todayRow as AttendanceRecord) ?? null;
    return {
      employee_id: emp.id,
      rule,
      today: todayRec,
      recent: recentList,
      missed_checkout: missed,
      window_state: computeWindowState(rule, todayRec, new Date()),
      shift,
      can_override: canOverride,
      month_summary: summarize((monthRows as AttendanceRecord[]) ?? []),
    };
  });

const checkInSchema = z.object({
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  webauthn_response: z.any().optional().nullable(),
  selfie_path: z.string().max(300).optional().nullable(),
  override: z.boolean().optional().default(false),
});

export const checkIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkInSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, department_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (empErr) throw mapDbError(empErr);
    if (!emp) throw new Error("لا يوجد سجل موظف مرتبط بحسابك");

    const today0 = riyadhToday();
    const [{ rule }, perms] = await Promise.all([
      loadEffectiveRule(supabase, emp, today0),
      loadTodayPermissions(supabase, emp.id, today0),
    ]);

    // Network restriction (when the admin registered office IPs).
    await assertAllowedNetwork(rule);

    // 2-minute cooldown between any two punch attempts.
    await assertPunchCooldown(supabase, emp.id);

    // Repeated presses inside the check-in frame: the FIRST punch was adopted;
    // record this one as a non-adopted punch and return the adopted status.
    const today = riyadhToday();
    const { data: existing } = await supabase
      .from("attendance_records")
      .select("id, check_in_at, status, late_minutes, late_deduction_amount")
      .eq("employee_id", emp.id)
      .eq("work_date", today)
      .maybeSingle();
    if (existing?.check_in_at) {
      await logPunch(supabase, {
        employee_id: emp.id,
        work_date: today,
        kind: "in",
        adopted: false,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        via_override: !!data.override,
      });
      return {
        ok: true,
        idempotent: true,
        status: existing.status,
        late_minutes: existing.late_minutes ?? 0,
        deduction: Number(existing.late_deduction_amount ?? 0),
      };
    }

    // Window enforcement (override for HR/Admin/Owner only).
    // An approved late-arrival permission extends the check-in window to its
    // end time + grace.
    const win = computeWindowState(rule, null, new Date());
    const permittedNow =
      perms.excuseUntilM > 0 &&
      riyadhNowMinutes(new Date()) <= perms.excuseUntilM + (rule?.late_grace_minutes ?? 0);
    if (win && !win.can_act && win.action === "check_in" && !permittedNow) {
      const isOverrider = data.override && (await loadOverrideRole(supabase, userId));
      if (!isOverrider) {
        if (win.phase === "before_checkin")
          throw new Error(`تسجيل الحضور لم يفتح بعد (يبدأ ${win.checkin_window.start})`);
        if (win.phase === "checkin_missed")
          throw new Error(`فات وقت تسجيل الحضور (أُغلق ${win.checkin_window.end})`);
      }
      // Privileged bypass must leave a durable audit trail.
      await supabase.from("security_audit_log").insert({
        entity_type: "attendance",
        entity_id: null,
        action: "checkin_window_override",
        actor_user_id: userId,
        actor_kind: "user",
        metadata: { employee_id: emp.id, phase: win.phase, work_date: today },
      });
    }

    let geoNote: string | null = null;
    let distanceM: number | null = null;
    if (rule?.require_geo) {
      if (data.lat == null || data.lng == null) throw new Error("الموقع الجغرافي مطلوب");
      if (rule.geo_lat != null && rule.geo_lng != null) {
        const dist = haversine(data.lat, data.lng, Number(rule.geo_lat), Number(rule.geo_lng));
        distanceM = Math.round(dist);
        if (dist > rule.geo_radius_m) {
          throw new Error(`أنت خارج نطاق المكتب (${Math.round(dist)}م)`);
        }
        if (dist < 1) geoNote = "[review] exact-match coords";
      }
      try {
        const { getRequest } = await import("@tanstack/react-start/server");
        const req = getRequest();
        const ip =
          req?.headers.get("cf-connecting-ip") || req?.headers.get("x-forwarded-for") || "";
        const ua = req?.headers.get("user-agent") || "";
        console.info("[attendance.checkIn]", {
          user_id: userId,
          employee_id: emp.id,
          lat: data.lat,
          lng: data.lng,
          ip,
          ua,
          flagged: !!geoNote,
          override: !!data.override,
        });
      } catch {
        /* ignore */
      }
    }

    if (rule?.require_selfie && !data.selfie_path) {
      throw new Error("صورة السيلفي مطلوبة للتحقق");
    }
    if (data.selfie_path) {
      const expectedPrefix = `${userId}/`;
      if (!data.selfie_path.startsWith(expectedPrefix)) {
        throw new Error("مسار الصورة غير صالح");
      }
    }

    // Enforce WebAuthn server-side when required by the rule.
    let webauthnVerified = false;
    if (rule?.require_webauthn) {
      if (!data.webauthn_response) {
        throw new Error("التحقق ببصمة الجهاز مطلوب");
      }
      const { verifyAndConsumeAuthAssertion } = await import("@/lib/hr/webauthn.server");
      await verifyAndConsumeAuthAssertion(supabase, userId, data.webauthn_response);
      webauthnVerified = true;
    }

    const cls = classifyCheckIn(new Date(), rule, perms.excuseUntilM);

    const verification_method: "webauthn" | "geo" | "manual" = webauthnVerified
      ? "webauthn"
      : rule?.require_geo
        ? "geo"
        : "manual";

    const notesArr: string[] = [];
    if (geoNote) notesArr.push(geoNote);
    if (data.override) notesArr.push("[override] check-in outside window");
    if (perms.excuseUntilM > 0) notesArr.push("[permission] late arrival excused");
    const payload = {
      employee_id: emp.id,
      work_date: today,
      check_in_at: new Date().toISOString(),
      check_in_lat: data.lat ?? null,
      check_in_lng: data.lng ?? null,
      check_in_distance_m: distanceM,
      selfie_in_path: data.selfie_path ?? null,
      verification_method,
      status: cls.status,
      late_minutes: cls.lateMinutes,
      late_deduction_amount: cls.deduction,
      notes: notesArr.join(" ") || null,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("attendance_records")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw mapDbError(error);
    } else {
      const { error } = await supabase.from("attendance_records").insert(payload);
      if (error) throw mapDbError(error);
    }

    // First check-in of the day → this punch is the adopted one.
    await logPunch(supabase, {
      employee_id: emp.id,
      work_date: today,
      kind: "in",
      adopted: true,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      distance_m: distanceM,
      via_override: !!data.override,
    });

    return {
      ok: true,
      idempotent: false,
      status: cls.status,
      late_minutes: cls.lateMinutes,
      deduction: cls.deduction,
    };
  });

export const checkOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkInSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id, department_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) throw new Error("لا يوجد سجل موظف");
    const today0 = riyadhToday();
    const [{ rule }, perms] = await Promise.all([
      loadEffectiveRule(supabase, emp, today0),
      loadTodayPermissions(supabase, emp.id, today0),
    ]);

    // Network restriction (when the admin registered office IPs).
    await assertAllowedNetwork(rule);

    // 2-minute cooldown between any two punch attempts.
    await assertPunchCooldown(supabase, emp.id);

    let distanceM: number | null = null;
    if (rule?.require_geo) {
      if (data.lat == null || data.lng == null) throw new Error("الموقع الجغرافي مطلوب");
      if (rule.geo_lat != null && rule.geo_lng != null) {
        const dist = haversine(data.lat, data.lng, Number(rule.geo_lat), Number(rule.geo_lng));
        distanceM = Math.round(dist);
        if (dist > rule.geo_radius_m) {
          throw new Error(`أنت خارج نطاق المكتب (${Math.round(dist)}م)`);
        }
      }
    }
    if (rule?.require_selfie && !data.selfie_path) {
      throw new Error("صورة السيلفي مطلوبة عند الانصراف");
    }
    if (data.selfie_path) {
      const expectedPrefix = `${userId}/`;
      if (!data.selfie_path.startsWith(expectedPrefix)) {
        throw new Error("مسار الصورة غير صالح");
      }
    }

    const today = riyadhToday();
    const { data: row } = await supabase
      .from("attendance_records")
      .select("id, check_in_at, check_out_at")
      .eq("employee_id", emp.id)
      .eq("work_date", today)
      .maybeSingle();
    if (!row?.check_in_at) throw new Error("سجّل الحضور أولًا");

    // Window enforcement: allow only within checkout window (or after), never before,
    // unless HR/Admin/Owner explicitly overrides.
    const win = computeWindowState(rule, row as AttendanceRecord, new Date());
    const earlyLeavePermitted =
      perms.earlyLeaveFromM != null && riyadhNowMinutes(new Date()) >= perms.earlyLeaveFromM;
    if (win && win.phase === "working" && !earlyLeavePermitted) {
      const isOverrider = data.override && (await loadOverrideRole(supabase, userId));
      if (!isOverrider) {
        throw new Error(`تسجيل الانصراف يفتح ${win.checkout_window.start}`);
      }
      // Privileged bypass must leave a durable audit trail.
      await supabase.from("security_audit_log").insert({
        entity_type: "attendance",
        entity_id: row.id,
        action: "checkout_window_override",
        actor_user_id: userId,
        actor_kind: "user",
        metadata: { employee_id: emp.id, work_date: today },
      });
    }

    // Multiple presses allowed: latest check-out wins (last punch adopted).
    const isUpdate = !!row.check_out_at;
    const outAt = new Date();
    // Early-leave deduction (opt-in per rule); an approved early-leave
    // permission moves the effective end time, so it never gets deducted.
    const early = classifyEarlyLeave(outAt, rule, perms.earlyLeaveFromM ?? null);
    const { error } = await supabase
      .from("attendance_records")
      .update({
        check_out_at: outAt.toISOString(),
        check_out_lat: data.lat ?? null,
        check_out_lng: data.lng ?? null,
        check_out_distance_m: distanceM,
        selfie_out_path: data.selfie_path ?? null,
        early_leave_minutes: early.earlyMinutes,
        early_leave_deduction_amount: early.deduction,
      } as any)
      .eq("id", row.id);
    if (error) throw mapDbError(error);

    // Record the punch; helper un-adopts earlier 'out' punches (last-out-wins).
    await logPunch(supabase, {
      employee_id: emp.id,
      work_date: today,
      kind: "out",
      adopted: true,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      distance_m: distanceM,
      via_override: !!data.override,
    });

    if (isUpdate) {
      await supabase
        .from("attendance_audit_log")
        .insert({
          record_id: row.id,
          edited_by: userId,
          reason: "checkout_updated (multi-punch: latest wins)",
          old_values: { check_out_at: row.check_out_at },
          new_values: { check_out_at: new Date().toISOString() },
        })
        .then(
          () => {},
          () => {},
        );
    }
    return { ok: true, updated: isUpdate };
  });

export const getSelfieSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("attendance-selfies")
      .createSignedUrl(data.path, 300);
    if (error) throw mapDbError(error);
    return { url: signed?.signedUrl ?? null };
  });

export const listTeamAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AttendanceRecord[]> => {
    const { supabase } = context;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const { data: records, error } = await supabase
      .from("attendance_records")
      .select("*")
      .gte("work_date", since)
      .order("work_date", { ascending: false })
      .limit(500);
    if (error) throw mapDbError(error);

    const empIds = Array.from(new Set((records ?? []).map((r) => r.employee_id)));
    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, user_id").in("id", empIds)
      : { data: [] as { id: string; user_id: string }[] };
    const userIds = (emps ?? []).map((e) => e.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string }[] };
    const empToUser = new Map((emps ?? []).map((e) => [e.id, e.user_id] as const));
    const userToName = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));

    return (records ?? []).map((r) => ({
      ...(r as AttendanceRecord),
      employee_name: userToName.get(empToUser.get(r.employee_id) ?? "") ?? "—",
    }));
  });

// -------------------- Monthly Report --------------------

export interface MonthlyEmployeeReport {
  employee_id: string;
  employee_name: string;
  present_days: number;
  early_days: number;
  late_days: number;
  half_day_days: number;
  absent_days: number;
  total_late_minutes: number;
  total_late_deduction: number;
  total_early_leave_minutes: number;
  total_early_leave_deduction: number;
  total_absence_deduction: number;
}

const monthSchema = z.object({ period_month: z.string().min(7) });

export const listMonthlyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthSchema.parse(d))
  .handler(async ({ data, context }): Promise<MonthlyEmployeeReport[]> => {
    const { supabase } = context;
    const start = data.period_month;
    const monthDates = datesOfMonth(start);
    const monthEnd = monthDates[monthDates.length - 1];
    // Cap at today (Riyadh) for the current month — don't report future days as absence.
    const today = riyadhToday();
    const asOfDate = today < monthEnd ? today : monthEnd;

    const { data: emps } = await supabase
      .from("employees")
      .select("id, user_id, department_id, hire_date, base_salary")
      .eq("status", "active");
    if (!emps?.length) return [];

    const userIds = Array.from(new Set(emps.map((e) => e.user_id)));
    const [{ data: profiles }, { data: records }, { data: rules }, { data: hol }] =
      await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", userIds),
        supabase
          .from("attendance_records")
          .select(
            "employee_id, work_date, status, late_minutes, late_deduction_amount, early_leave_minutes, early_leave_deduction_amount",
          )
          .in(
            "employee_id",
            emps.map((e) => e.id),
          )
          .gte("work_date", start)
          .lte("work_date", monthEnd),
        supabase
          .from("attendance_rules")
          .select("department_id, absence_deduction, absence_calc_mode"),
        supabase
          .from("holidays")
          .select("start_date, end_date")
          .lte("start_date", monthEnd)
          .gte("end_date", start),
      ]);
    const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));

    const absenceByDept = new Map<string | null, number>();
    const calcModeByDept = new Map<string | null, "salary_per_30" | "fixed_amount">();
    for (const r of rules ?? []) {
      absenceByDept.set(r.department_id, Number(r.absence_deduction || 0));
      calcModeByDept.set(
        r.department_id,
        (r as { absence_calc_mode?: string }).absence_calc_mode === "fixed_amount"
          ? "fixed_amount"
          : "salary_per_30",
      );
    }
    const globalAbsence = absenceByDept.get(null) ?? 0;
    const globalCalcMode = calcModeByDept.get(null) ?? "salary_per_30";
    const getAbsence = (d: string | null) => (d && absenceByDept.get(d)) ?? globalAbsence;
    const getCalcMode = (d: string | null) => (d && calcModeByDept.get(d)) ?? globalCalcMode;

    // Working days: exclude Fri/Sat AND public holidays; cap at asOfDate.
    const holidaySet = holidayDateSet((hol ?? []) as { start_date: string; end_date: string }[]);
    const workingDates = monthDates.filter(
      (d) => d <= asOfDate && !isWeekend(d) && !holidaySet.has(d),
    );

    return emps.map((e) => {
      const recs = (records ?? []).filter((r) => r.employee_id === e.id);
      const present = recs.filter((r) => r.status === "present").length;
      const late = recs.filter((r) => r.status === "late").length;
      const early = recs.filter((r) => r.status === "early").length;
      const half = recs.filter((r) => r.status === "half_day").length;
      // Attended or excused dates (leave counts as excused, never absence).
      // Uses the payroll engine's own status set + absence formula so the HR
      // report can never disagree with the payslip.
      const attendedDates = new Set(
        recs.filter((r) => EXCUSED_OR_PRESENT.has(r.status)).map((r) => r.work_date),
      );
      const hire = (e as { hire_date?: string | null }).hire_date ?? null;
      const absent = countAbsenceDays(attendedDates, workingDates, hire);

      const totalLateMin = recs.reduce((a, r) => a + (r.late_minutes || 0), 0);
      const totalLateDed = recs.reduce((a, r) => a + Number(r.late_deduction_amount || 0), 0);
      const totalEarlyMin = recs.reduce(
        (a, r) => a + Number((r as { early_leave_minutes?: number }).early_leave_minutes || 0),
        0,
      );
      const totalEarlyDed = recs.reduce(
        (a, r) =>
          a +
          Number(
            (r as { early_leave_deduction_amount?: number }).early_leave_deduction_amount || 0,
          ),
        0,
      );
      return {
        employee_id: e.id,
        employee_name: nameByUser.get(e.user_id) || "—",
        present_days: present,
        early_days: early,
        late_days: late,
        half_day_days: half,
        absent_days: absent,
        total_late_minutes: totalLateMin,
        total_late_deduction: totalLateDed,
        total_early_leave_minutes: totalEarlyMin,
        total_early_leave_deduction: totalEarlyDed,
        total_absence_deduction: absenceDeductionFor(
          absent,
          Number((e as { base_salary?: number }).base_salary ?? 0),
          getCalcMode(e.department_id) === "fixed_amount" ? "fixed_amount" : "salary_per_30",
          Number(getAbsence(e.department_id) ?? 0),
        ),
      };
    });
  });

// -------------------- Admin Edit --------------------

const editSchema = z.object({
  id: z.string().uuid(),
  check_in_at: z.string().nullable().optional(),
  check_out_at: z.string().nullable().optional(),
  status: z.enum(["present", "late", "absent", "leave", "early", "half_day"]).optional(),
  late_minutes: z.number().int().min(0).optional(),
  late_deduction_amount: z.number().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).default(""),
});

export const adminEditAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAttendanceEditor(supabase, userId, "admin_edit_attendance", data.id);

    const { data: old, error: gErr } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (gErr) throw mapDbError(gErr);
    if (!old) throw new Error("السجل غير موجود");

    const patch: Record<string, any> = { manually_edited: true };
    if (data.check_in_at !== undefined) patch.check_in_at = data.check_in_at;
    if (data.check_out_at !== undefined) patch.check_out_at = data.check_out_at;
    if (data.status !== undefined) patch.status = data.status;
    if (data.late_minutes !== undefined) patch.late_minutes = data.late_minutes;
    if (data.late_deduction_amount !== undefined)
      patch.late_deduction_amount = data.late_deduction_amount;
    if (data.notes !== undefined) patch.notes = data.notes;

    const { error: uErr } = await supabase
      .from("attendance_records")
      .update(patch as any)
      .eq("id", data.id);
    if (uErr) throw mapDbError(uErr);

    await supabase.from("attendance_audit_log").insert({
      record_id: data.id,
      edited_by: userId,
      old_values: old as any,
      new_values: patch as any,
      reason: data.reason || null,
    });

    return { ok: true };
  });

// -------------------- Rules CRUD --------------------

export const listAttendanceRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Anti-fraud config (geofence, IP allow-list, WebAuthn requirements)
    // must not be readable by ordinary employees. Same role gate helper used
    // by every other management-only attendance read.
    await assertManagementRole(context.supabase, context.userId, [
      "hr_admin",
      "owner",
      "admin",
      "dept_manager",
      "accountant",
    ]);

    const { data, error } = await context.supabase
      .from("attendance_rules")
      .select("*")
      .order("department_id", { nullsFirst: true });
    if (error) throw mapDbError(error);
    return (data ?? []).map(normalizeRule);
  });

const tierSchema = z.object({
  from: z.number().min(0),
  to: z.number().min(0),
  rate: z.number().min(0),
});

const tiersValidated = z
  .array(tierSchema)
  .default([])
  .superRefine((tiers, ctx) => {
    const sorted = [...tiers].sort((a, b) => a.from - b.from);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (t.to <= t.from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `شريحة التأخير غير صالحة: النهاية (${t.to}) يجب أن تكون أكبر من البداية (${t.from})`,
        });
      }
      if (i > 0 && t.from < sorted[i - 1].to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `تداخل بين شرائح التأخير: الشريحة التي تبدأ عند ${t.from} تتقاطع مع شريحة تنتهي عند ${sorted[i - 1].to}`,
        });
      }
    }
  });

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  department_id: z.string().uuid().nullable(),
  work_start: z.string(),
  work_end: z.string(),
  late_grace_minutes: z.number().int().min(0).max(240),
  absence_deduction: z.number().min(0),
  absence_calc_mode: z.enum(["salary_per_30", "fixed_amount"]).default("salary_per_30"),
  late_deduction_per_minute: z.number().min(0),
  require_geo: z.boolean(),
  network_label: z.string().trim().max(80).nullable().optional(),
  allowed_ip_ranges: z
    .array(z.string().trim().max(50))
    .max(20)
    .default([])
    .superRefine((ranges, ctx) => {
      const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
      const prefix = /^\d{1,3}(\.\d{1,3}){0,2}\.$/;
      const cidr = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;
      for (const r of ranges) {
        if (r && !ipv4.test(r) && !prefix.test(r) && !cidr.test(r)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `صيغة غير صالحة: «${r}» — استخدم IP كاملاً أو بادئة تنتهي بنقطة أو CIDR`,
          });
        }
      }
    }),
  geo_lat: z.number().nullable(),
  geo_lng: z.number().nullable(),
  geo_radius_m: z.number().int().min(10).max(10000),
  require_webauthn: z.boolean(),
  require_selfie: z.boolean().default(false),
  flex_enabled: z.boolean().default(false),
  early_window_start: z.string().nullable(),
  late_window_end: z.string().nullable(),
  half_day_deduction: z.number().min(0).default(0),
  tiered_late_deduction: tiersValidated,
  checkout_window_before_min: z.number().int().min(0).max(720).default(60),
  checkout_window_after_min: z.number().int().min(0).max(720).default(60),
  checkin_window_before_min: z.number().int().min(0).max(720).default(60),
  checkin_window_after_min: z.number().int().min(0).max(720).default(120),
  early_leave_deduction_enabled: z.boolean().default(false),
  early_leave_grace_minutes: z.number().int().min(0).max(240).default(0),
  early_leave_deduction_per_minute: z.number().min(0).default(0),
});

export const upsertAttendanceRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ruleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data };
    delete (payload as { id?: string }).id;
    if (data.id) {
      const { error } = await context.supabase
        .from("attendance_rules")
        .update(payload)
        .eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("attendance_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw mapDbError(error);
    return { id: inserted.id };
  });

export const deleteAttendanceRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("attendance_rules").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

// -------------------- Correction Request --------------------

const correctionSchema = z
  .object({
    record_id: z.string().uuid().optional(),
    work_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    suggested_check_in: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    suggested_check_out: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().min(3).max(500),
  })
  .refine((d) => d.record_id || d.work_date, {
    message: "يجب تحديد السجل أو تاريخ اليوم",
  });

/**
 * Employee files a correction request — either for a specific existing
 * record (forgotten check-out, same-minute anomaly) or for ANY past day at
 * all, including a day with no punch whatsoever (e.g. a marked absence the
 * employee believes is wrong). Stored as a permission_request
 * (personal_excuse) so the existing manager review flow + RLS apply.
 * Approval looks the target record up by (employee_id, request_date) —
 * not a parsed record_id — so it transparently creates a new attendance
 * record when none existed, or updates the existing one otherwise.
 */
// ---------------- Historical attendance bulk import ----------------
// A manager (their own department only) or HR admin (any department) can
// back-fill historical check-in/check-out records — e.g. from a period
// before this system was in use, or a paper log that needs digitizing.
// Bypasses the live-punch window/geo/WebAuthn checks entirely (this is
// data entry, not a real-time punch); status is still recomputed via the
// same classifyCheckIn engine for consistency with everything else.

const historicalRow = z.object({
  employee_no: z.string().trim().min(1).max(40),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_in: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  check_out: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  status: z.enum(["present", "late", "absent", "leave", "early", "half_day"]).optional(),
});

const bulkHistoricalInput = z.object({
  rows: z.array(historicalRow).min(1).max(2000),
});

export interface BulkAttendanceImportResult {
  inserted: number;
  updated: number;
  skipped: Array<{ employee_no: string; work_date: string; reason: string }>;
}

export const bulkImportHistoricalAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkHistoricalInput.parse(d))
  .handler(async ({ data, context }): Promise<BulkAttendanceImportResult> => {
    const { supabase, userId } = context;

    // Authorization: hr_admin (any department) or dept_manager (own
    // department's employees only — enforced via the employee lookup below).
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
    const isHR = roleSet.has("hr_admin");
    const isManager = roleSet.has("dept_manager");
    if (!isHR && !isManager) {
      throw new Error("هذا الإجراء يتطلب صلاحية مدير قسم أو موارد بشرية");
    }

    let managerDeptId: string | null = null;
    if (!isHR) {
      const { data: deptRow } = await supabase.rpc("manager_department_id", { _user_id: userId });
      managerDeptId = (deptRow as string | null) ?? null;
      if (!managerDeptId) throw new Error("لم يتم العثور على قسمك الإداري");
    }

    const today = riyadhToday();
    const empNos = Array.from(new Set(data.rows.map((r) => r.employee_no)));
    const { data: emps } = await supabase
      .from("employees")
      .select("id, employee_no, department_id")
      .in("employee_no", empNos);
    const empByNo = new Map((emps ?? []).map((e) => [e.employee_no, e]));

    const skipped: BulkAttendanceImportResult["skipped"] = [];
    let inserted = 0;
    let updated = 0;

    for (const row of data.rows) {
      const emp = empByNo.get(row.employee_no);
      if (!emp) {
        skipped.push({
          employee_no: row.employee_no,
          work_date: row.work_date,
          reason: "رقم وظيفي غير موجود",
        });
        continue;
      }
      if (!isHR && emp.department_id !== managerDeptId) {
        skipped.push({
          employee_no: row.employee_no,
          work_date: row.work_date,
          reason: "الموظف خارج قسمك",
        });
        continue;
      }
      if (row.work_date > today) {
        skipped.push({
          employee_no: row.employee_no,
          work_date: row.work_date,
          reason: "تاريخ مستقبلي",
        });
        continue;
      }
      // Never retroactively touch a month whose payroll is already locked.
      const periodMonth = row.work_date.slice(0, 7) + "-01";
      const { data: lockedRun } = await supabase
        .from("payroll_runs")
        .select("id")
        .eq("employee_id", emp.id)
        .eq("period_month", periodMonth)
        .not("locked_at", "is", null)
        .maybeSingle();
      if (lockedRun) {
        skipped.push({
          employee_no: row.employee_no,
          work_date: row.work_date,
          reason: "رواتب هذا الشهر مقفلة بالفعل",
        });
        continue;
      }

      const patch: Record<string, unknown> = {
        employee_id: emp.id,
        work_date: row.work_date,
        manually_edited: true,
        verification_method: "manual",
      };

      if (row.check_in) {
        const [inH, inM] = row.check_in.split(":").map(Number);
        const checkInAt = riyadhIsoAtDate(row.work_date, inH * 60 + inM);
        patch.check_in_at = checkInAt;
        if (row.check_out) {
          const [outH, outM] = row.check_out.split(":").map(Number);
          patch.check_out_at = riyadhIsoAtDate(row.work_date, outH * 60 + outM);
        }
        if (row.status) {
          patch.status = row.status;
        } else {
          const rule = await loadRuleFor(supabase, emp.department_id);
          const cls = classifyCheckIn(new Date(checkInAt), rule, 0);
          patch.status = cls.status;
          patch.late_minutes = cls.lateMinutes;
          patch.late_deduction_amount = cls.deduction;
        }
      } else {
        // No punch given at all — explicit absence/leave marker.
        patch.status = row.status ?? "absent";
      }

      const { data: existing } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("employee_id", emp.id)
        .eq("work_date", row.work_date)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("attendance_records")
          .update(patch as never)
          .eq("id", existing.id);
        if (error) {
          skipped.push({
            employee_no: row.employee_no,
            work_date: row.work_date,
            reason: error.message,
          });
          continue;
        }
        updated++;
      } else {
        const { error } = await supabase.from("attendance_records").insert(patch as never);
        if (error) {
          skipped.push({
            employee_no: row.employee_no,
            work_date: row.work_date,
            reason: error.message,
          });
          continue;
        }
        inserted++;
      }
    }

    await supabase.from("security_audit_log").insert({
      entity_type: "attendance_records",
      entity_id: null,
      action: "bulk_historical_import",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { rows: data.rows.length, inserted, updated, skipped: skipped.length },
    });

    return { inserted, updated, skipped };
  });

export const requestAttendanceCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => correctionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) throw new Error("لا يوجد سجل موظف");

    let workDate: string;
    let derivedFromTime = "09:00";
    let existingRecordId: string | null = null;

    if (data.record_id) {
      // Existing-record path (forgotten check-out, same-minute anomaly).
      const { data: rec } = await supabase
        .from("attendance_records")
        .select("id, work_date, check_in_at, employee_id")
        .eq("id", data.record_id)
        .maybeSingle();
      if (!rec || rec.employee_id !== emp.id) throw new Error("السجل غير موجود");
      workDate = rec.work_date;
      existingRecordId = rec.id;
      // Riyadh wall-clock, not UTC — check_in_at is a UTC instant and
      // slicing it directly would show the wrong hour.
      if (rec.check_in_at) derivedFromTime = riyadhHM(rec.check_in_at);
    } else {
      // Any-day path: employee picks a date from the calendar, with or
      // without an existing punch (including a full absence day).
      workDate = data.work_date!;
      if (workDate > riyadhToday()) throw new Error("لا يمكن تقديم طلب ليوم في المستقبل");
      const { data: rec } = await supabase
        .from("attendance_records")
        .select("id, check_in_at")
        .eq("employee_id", emp.id)
        .eq("work_date", workDate)
        .maybeSingle();
      if (rec) {
        existingRecordId = rec.id;
        if (rec.check_in_at) derivedFromTime = riyadhHM(rec.check_in_at);
      }
    }

    const fromTime = data.suggested_check_in ?? derivedFromTime;
    const [fH, fM] = fromTime.split(":").map(Number);
    const [tH, tM] = data.suggested_check_out.split(":").map(Number);
    const duration = tH * 60 + tM - (fH * 60 + fM);
    if (duration <= 0) throw new Error("وقت الانصراف يجب أن يكون بعد الحضور");

    // Guard against duplicate pending requests for the same day.
    const { data: dupe } = await supabase
      .from("permission_requests")
      .select("id")
      .eq("employee_id", emp.id)
      .eq("request_date", workDate)
      .eq("status", "pending")
      .eq("kind", "attendance_correction")
      .maybeSingle();
    if (dupe) throw new Error("لديك طلب تصحيح معلّق بالفعل لهذا اليوم");

    const reasonText = existingRecordId
      ? data.suggested_check_in
        ? `[attendance_correction:${existingRecordId}] تعديل حضور ${workDate} → ${fromTime} وانصراف → ${data.suggested_check_out} — ${data.reason}`
        : `[attendance_correction:${existingRecordId}] تعديل انصراف ${workDate} → ${data.suggested_check_out} — ${data.reason}`
      : `[attendance_correction] تسجيل حضور ليوم ${workDate} — لا يوجد بصمة مسجّلة — ${data.reason}`;

    const { error } = await supabase.from("permission_requests").insert({
      employee_id: emp.id,
      type: "personal_excuse",
      kind: "attendance_correction",
      request_date: workDate,
      from_time: fromTime + ":00",
      to_time: data.suggested_check_out + ":00",
      duration_minutes: duration,
      reason: reasonText,
    });
    if (error) throw mapDbError(error);

    // Notify HR admins via in-app notification
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "تم إرسال طلب تصحيح الانصراف",
      body: `بانتظار مراجعة المدير ليوم ${workDate}`,
      link: "/permissions",
    });

    return { ok: true };
  });

// -------------------- Correction Status & Review --------------------

export interface PendingCorrectionRow extends CorrectionInfo {
  employee_id: string;
  employee_name: string;
  check_in_at: string | null;
}

export const listMyCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CorrectionInfo[]> => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return [];
    const { data, error } = await supabase
      .from("permission_requests")
      .select(
        "id, status, from_time, to_time, reason, request_date, review_note, created_at, reviewed_at",
      )
      .eq("employee_id", emp.id)
      .eq("type", "personal_excuse")
      .eq("kind", "attendance_correction")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw mapDbError(error);
    return (data ?? []).map(parseCorrection).filter((x): x is CorrectionInfo => !!x);
  });

export const listPendingCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingCorrectionRow[]> => {
    const { supabase, userId } = context;
    await assertManagementRole(supabase, userId, ["hr_admin", "owner", "admin", "dept_manager"]);

    const { data: rows, error } = await supabase
      .from("permission_requests")
      .select(
        "id, employee_id, status, from_time, to_time, reason, request_date, review_note, created_at, reviewed_at",
      )
      .eq("type", "personal_excuse")
      .eq("kind", "attendance_correction")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw mapDbError(error);

    const parsed = (rows ?? [])
      .map((r: any) => {
        const info = parseCorrection(r);
        return info ? { ...info, employee_id: r.employee_id as string } : null;
      })
      .filter((x): x is CorrectionInfo & { employee_id: string } => !!x);
    if (!parsed.length) return [];

    const empIds = Array.from(new Set(parsed.map((p) => p.employee_id)));

    const [{ data: recs }, { data: emps }] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("employee_id, work_date, check_in_at")
        .in("employee_id", empIds),
      supabase.from("employees").select("id, user_id").in("id", empIds),
    ]);
    const userIds = (emps ?? []).map((e: any) => e.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const recMap = new Map((recs ?? []).map((r: any) => [`${r.employee_id}:${r.work_date}`, r]));
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e.user_id]));
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name as string]));

    return parsed.map((p) => {
      const rec = recMap.get(`${p.employee_id}:${p.work_date}`) as any;
      return {
        ...p,
        employee_name: nameMap.get(empMap.get(p.employee_id) ?? "") ?? "—",
        check_in_at: rec?.check_in_at ?? null,
      };
    });
  });

const reviewCorrectionSchema = z.object({
  permission_id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

export const reviewAttendanceCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewCorrectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAttendanceEditor(
      supabase,
      userId,
      "review_attendance_correction",
      data.permission_id,
    );

    const { data: req, error: gErr } = await supabase
      .from("permission_requests")
      .select(
        "id, employee_id, status, from_time, to_time, reason, request_date, review_note, created_at, reviewed_at",
      )
      .eq("id", data.permission_id)
      .maybeSingle();
    if (gErr) throw mapDbError(gErr);
    if (!req) throw new Error("الطلب غير موجود");
    if (req.status !== "pending") throw new Error("تم البتّ في هذا الطلب مسبقًا");

    const info = parseCorrection(req);
    if (!info) throw new Error("طلب غير صالح");

    const nextStatus = data.action === "approve" ? "approved" : "rejected";
    // Guarded update: the `.eq("status","pending")` filter makes the
    // transition atomic, so two concurrent reviewers can't both succeed.
    const { data: reviewed, error: uErr } = await supabase
      .from("permission_requests")
      .update({
        status: nextStatus,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note || null,
      })
      .eq("id", data.permission_id)
      .eq("status", "pending")
      .select("id");
    if (uErr) throw mapDbError(uErr);
    if (!reviewed?.length) throw new Error("تم البتّ في هذا الطلب مسبقًا");

    if (data.action === "approve") {
      const { data: rec } = await supabase
        .from("attendance_records")
        .select("id, work_date, employee_id, notes")
        .eq("employee_id", req.employee_id)
        .eq("work_date", info.work_date)
        .maybeSingle();

      const { data: emp } = await supabase
        .from("employees")
        .select("department_id")
        .eq("id", req.employee_id)
        .maybeSingle();
      // Use the *effective* rule (department rule + shift + special work
      // period) so a corrected day is re-classified against the hours the
      // employee actually worked, exactly like the live punch path.
      const [eff, perms] = await Promise.all([
        loadEffectiveRule(
          supabase,
          { id: req.employee_id, department_id: emp?.department_id ?? null },
          info.work_date,
        ),
        loadTodayPermissions(supabase, req.employee_id, info.work_date),
      ]);
      const rule = eff.rule;

      const [inH, inM] = info.suggested_check_in.split(":").map(Number);
      const checkInMinutes = inH * 60 + inM;
      const checkInAt = riyadhIsoAtDate(info.work_date, checkInMinutes);
      const checkOutAt = riyadhIsoAtDate(
        info.work_date,
        (() => {
          const [oH, oM] = info.suggested_check_out.split(":").map(Number);
          return oH * 60 + oM;
        })(),
      );

      // Recompute status/deduction from the corrected check-in — a
      // corrected time can still be late, not automatically "present".
      const cls = classifyCheckIn(new Date(checkInAt), rule, perms.excuseUntilM);
      const early = classifyEarlyLeave(new Date(checkOutAt), rule, perms.earlyLeaveFromM ?? null);
      const patch: Record<string, any> = {
        check_in_at: checkInAt,
        check_out_at: checkOutAt,
        manually_edited: true,
        status: cls.status,
        late_minutes: cls.lateMinutes,
        late_deduction_amount: cls.deduction,
        early_leave_minutes: early.earlyMinutes,
        early_leave_deduction_amount: early.deduction,
      };

      if (rec) {
        await supabase
          .from("attendance_records")
          .update({ ...patch, notes: rec.notes === "missed_checkout" ? null : rec.notes } as any)
          .eq("id", rec.id);
        await supabase.from("attendance_audit_log").insert({
          record_id: rec.id,
          edited_by: userId,
          old_values: { check_out_at: null, status: "half_day" } as any,
          new_values: patch as any,
          reason: `approved correction ${data.permission_id}`,
        });
      } else {
        // No punch existed at all for this day (e.g. a marked absence the
        // employee successfully disputed) — create the record fresh.
        const { data: created } = await supabase
          .from("attendance_records")
          .insert({
            employee_id: req.employee_id,
            work_date: info.work_date,
            verification_method: "manual",
            ...patch,
          } as any)
          .select("id")
          .maybeSingle();
        if (created) {
          await supabase.from("attendance_audit_log").insert({
            record_id: created.id,
            edited_by: userId,
            old_values: { existed: false } as any,
            new_values: patch as any,
            reason: `approved correction (new record) ${data.permission_id}`,
          });
        }
      }
    }

    const { data: emp } = await supabase
      .from("employees")
      .select("user_id")
      .eq("id", req.employee_id)
      .maybeSingle();
    if (emp) {
      await supabase.from("notifications").insert({
        user_id: emp.user_id,
        kind: "attendance",
        title:
          data.action === "approve"
            ? "تمت الموافقة على تصحيح الانصراف"
            : "تم رفض طلب تصحيح الانصراف",
        body:
          data.note ||
          (data.action === "approve"
            ? `تم اعتماد وقت الانصراف ${info.suggested_check_out} ليوم ${req.request_date}`
            : `طلب تصحيح انصراف يوم ${req.request_date}`),
        link: "/attendance",
      });
    }

    return { ok: true };
  });

// -------------------- Attendance edit history --------------------
// A per-record timeline: every edit (who / when / before / after / reason)
// from attendance_audit_log, merged with any correction request filed for
// that same day so the approval state is visible in the same list.

export interface AttendanceHistoryEntry {
  id: string;
  kind: "edit" | "correction";
  at: string;
  actor_name: string;
  reason: string | null;
  /** Approval state — only present for correction requests. */
  approval_status: CorrectionStatus | null;
  changes: Array<{ field: string; before: string | null; after: string | null }>;
}

export const listAttendanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ record_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AttendanceHistoryEntry[]> => {
    const { supabase } = context;

    // RLS on attendance_records decides visibility: an employee only sees
    // their own record, managers see their scope.
    const { data: rec } = await supabase
      .from("attendance_records")
      .select("id, employee_id, work_date")
      .eq("id", data.record_id)
      .maybeSingle();
    if (!rec) throw new Error("السجل غير موجود");

    const [{ data: logs }, { data: reqs }] = await Promise.all([
      supabase
        .from("attendance_audit_log")
        .select("id, edited_by, old_values, new_values, reason, created_at")
        .eq("record_id", data.record_id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("permission_requests")
        .select(
          "id, status, from_time, to_time, reason, request_date, review_note, created_at, reviewed_at",
        )
        .eq("employee_id", rec.employee_id)
        .eq("request_date", rec.work_date)
        .eq("kind", "attendance_correction")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const actorIds = Array.from(new Set((logs ?? []).map((l: any) => l.edited_by).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
    }

    const editEntries: AttendanceHistoryEntry[] = (logs ?? []).map((l: any) => {
      const oldV = (l.old_values ?? {}) as Record<string, unknown>;
      const newV = (l.new_values ?? {}) as Record<string, unknown>;
      const changes = HISTORY_FIELDS.filter(
        (f) => f in newV && fmtVal(newV[f]) !== fmtVal(oldV[f]),
      ).map((f) => ({ field: f, before: fmtVal(oldV[f]), after: fmtVal(newV[f]) }));
      return {
        id: l.id,
        kind: "edit" as const,
        at: l.created_at,
        actor_name: nameById.get(l.edited_by) ?? "النظام",
        reason: l.reason ?? null,
        approval_status: null,
        changes,
      };
    });

    const correctionEntries: AttendanceHistoryEntry[] = (reqs ?? [])
      .map((r: any): AttendanceHistoryEntry | null => {
        const info = parseCorrection(r);
        if (!info) return null;
        return {
          id: r.id,
          kind: "correction" as const,
          at: info.reviewed_at ?? info.created_at,
          actor_name: "الموظف",
          reason: info.review_note ? `${info.reason} — ${info.review_note}` : info.reason,
          approval_status: info.status,
          changes: [
            { field: "check_in_at", before: null, after: info.suggested_check_in },
            { field: "check_out_at", before: null, after: info.suggested_check_out },
          ],
        };
      })
      .filter((x): x is AttendanceHistoryEntry => !!x);

    return [...editEntries, ...correctionEntries].sort((a, b) => (a.at < b.at ? 1 : -1));
  });

// -------------------- Strict attendance authorization --------------------
// One gate for every privileged attendance action (manual edits, approving
// corrections). Denials are recorded so an unauthorized attempt is visible.

// -------------------- Searchable attendance edit log --------------------

export interface AttendanceEditLogRow {
  id: string;
  record_id: string;
  work_date: string;
  employee_id: string;
  employee_name: string;
  attendance_status: string;
  actor_name: string;
  reason: string | null;
  created_at: string;
  changes: Array<{ field: string; before: string | null; after: string | null }>;
}

const editLogFilters = z.object({
  employee_id: z.string().uuid().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  q: z.string().max(120).optional().nullable(),
});

/**
 * Org-wide attendance edit history with filters (employee / attendance status /
 * date range / free text). Visibility still follows RLS on attendance_records.
 */
export const searchAttendanceEdits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editLogFilters.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AttendanceEditLogRow[]> => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const list = (roles ?? []).map((r: any) => r.role as string);
    if (!list.some((r) => ["hr_admin", "owner", "admin", "dept_manager"].includes(r))) {
      throw new Error("هذا السجل مخصص للإدارة");
    }

    let recQ = supabase
      .from("attendance_records")
      .select("id, employee_id, work_date, status")
      .order("work_date", { ascending: false })
      .limit(1000);
    if (data.employee_id) recQ = recQ.eq("employee_id", data.employee_id);
    if (data.status) recQ = recQ.eq("status", data.status as any);
    if (data.from) recQ = recQ.gte("work_date", data.from);
    if (data.to) recQ = recQ.lte("work_date", data.to);
    const { data: recs, error: rErr } = await recQ;
    if (rErr) throw mapDbError(rErr);
    if (!recs?.length) return [];

    const recMap = new Map((recs as any[]).map((r) => [r.id, r]));
    const { data: logs, error } = await supabase
      .from("attendance_audit_log")
      .select("id, record_id, edited_by, old_values, new_values, reason, created_at")
      .in("record_id", Array.from(recMap.keys()))
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw mapDbError(error);
    if (!logs?.length) return [];

    const empIds = Array.from(new Set((recs as any[]).map((r) => r.employee_id)));
    const { data: emps } = await supabase.from("employees").select("id, user_id").in("id", empIds);
    const actorIds = Array.from(new Set((logs as any[]).map((l) => l.edited_by).filter(Boolean)));
    const profileIds = Array.from(
      new Set([...(emps ?? []).map((e: any) => e.user_id), ...actorIds]),
    );
    const { data: profiles } = profileIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : { data: [] as any[] };
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name as string]));
    const empName = new Map((emps ?? []).map((e: any) => [e.id, nameById.get(e.user_id) ?? "—"]));

    const term = (data.q ?? "").trim().toLowerCase();
    return (logs as any[])
      .map((l) => {
        const rec = recMap.get(l.record_id) as any;
        const oldV = (l.old_values ?? {}) as Record<string, unknown>;
        const newV = (l.new_values ?? {}) as Record<string, unknown>;
        const changes = HISTORY_FIELDS.filter(
          (f) => f in newV && fmtVal(newV[f]) !== fmtVal(oldV[f]),
        ).map((f) => ({ field: f, before: fmtVal(oldV[f]), after: fmtVal(newV[f]) }));
        return {
          id: l.id,
          record_id: l.record_id,
          work_date: rec.work_date,
          employee_id: rec.employee_id,
          employee_name: empName.get(rec.employee_id) ?? "—",
          attendance_status: rec.status,
          actor_name: nameById.get(l.edited_by) ?? "النظام",
          reason: l.reason ?? null,
          created_at: l.created_at,
          changes,
        } satisfies AttendanceEditLogRow;
      })
      .filter(
        (r) =>
          !term ||
          r.employee_name.toLowerCase().includes(term) ||
          r.actor_name.toLowerCase().includes(term) ||
          (r.reason ?? "").toLowerCase().includes(term),
      );
  });
