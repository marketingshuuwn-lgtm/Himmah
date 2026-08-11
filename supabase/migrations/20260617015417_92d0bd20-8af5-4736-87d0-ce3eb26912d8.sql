
-- ============================================================
-- 1) LEAVE TYPES (catalog)
-- ============================================================
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  default_annual_days numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT true,
  requires_attachment boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT '#3b82f6',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone reads leave types" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages leave types" ON public.leave_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin')) WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));
CREATE TRIGGER trg_leave_types_updated BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed common types
INSERT INTO public.leave_types (code, name_ar, name_en, default_annual_days, is_paid, requires_attachment, color) VALUES
  ('annual',     'إجازة سنوية',  'Annual Leave',    21, true,  false, '#10b981'),
  ('sick',       'إجازة مرضية',  'Sick Leave',      30, true,  true,  '#f59e0b'),
  ('emergency',  'إجازة طارئة',  'Emergency',       5,  true,  false, '#ef4444'),
  ('unpaid',     'إجازة بدون راتب','Unpaid Leave',  0,  false, false, '#6b7280'),
  ('maternity',  'إجازة وضع',    'Maternity',       70, true,  true,  '#ec4899'),
  ('paternity',  'إجازة أبوة',   'Paternity',       3,  true,  false, '#6366f1'),
  ('hajj',       'إجازة حج',     'Hajj',            10, true,  false, '#0ea5e9'),
  ('bereavement','إجازة وفاة',   'Bereavement',     5,  true,  false, '#475569');

-- ============================================================
-- 2) LEAVE BALANCES (per employee, per type, per year)
-- ============================================================
CREATE TABLE public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  year int NOT NULL,
  entitled_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,
  carried_over numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employee sees own balance" ON public.leave_balances FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "HR/Mgr sees all balances" ON public.leave_balances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "HR manages balances" ON public.leave_balances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_leave_balances_updated BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) LEAVE REQUESTS
-- ============================================================
CREATE TYPE public.leave_request_status AS ENUM ('draft','pending','approved','rejected','cancelled');

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL,
  reason text,
  attachment_url text,
  status public.leave_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee creates own leave" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "Employee reads own leave" ON public.leave_requests FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "Employee cancels own pending" ON public.leave_requests FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status IN ('draft','pending'))
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "HR/Manager reads all leave" ON public.leave_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "HR/Manager manages leave" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager'));
CREATE POLICY "HR deletes leave" ON public.leave_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'));

CREATE TRIGGER trg_leave_requests_updated BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_leave_requests_emp ON public.leave_requests(employee_id, status);
CREATE INDEX idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

-- ============================================================
-- 4) PERMISSION REQUESTS (late arrival / early leave / make-up)
-- ============================================================
CREATE TYPE public.permission_type AS ENUM ('late_arrival','early_leave','personal_excuse','makeup_hours');
CREATE TYPE public.permission_status AS ENUM ('pending','approved','rejected','cancelled');

CREATE TABLE public.permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type public.permission_type NOT NULL,
  request_date date NOT NULL,
  from_time time NOT NULL,
  to_time time NOT NULL,
  duration_minutes int NOT NULL,
  reason text NOT NULL,
  status public.permission_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_requests TO authenticated;
GRANT ALL ON public.permission_requests TO service_role;
ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee creates own permission" ON public.permission_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "Employee reads own permission" ON public.permission_requests FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "Employee cancels own pending permission" ON public.permission_requests FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status='pending')
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "HR/Mgr reads all permissions" ON public.permission_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "HR/Mgr manages permissions" ON public.permission_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager'));
CREATE POLICY "HR deletes permission" ON public.permission_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin'));

CREATE TRIGGER trg_permission_requests_updated BEFORE UPDATE ON public.permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_permission_requests_emp ON public.permission_requests(employee_id, request_date);

-- ============================================================
-- 5) HOLIDAYS (official calendar)
-- ============================================================
CREATE TYPE public.holiday_kind AS ENUM ('national','religious','company','weekend_override');

CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  kind public.holiday_kind NOT NULL DEFAULT 'national',
  country text NOT NULL DEFAULT 'SA',
  paid boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone reads holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages holidays" ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_holidays_updated BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_holidays_dates ON public.holidays(start_date, end_date);

-- Seed common KSA holidays 2026
INSERT INTO public.holidays (name_ar, name_en, start_date, end_date, kind, country) VALUES
  ('عيد الفطر',     'Eid Al-Fitr',     '2026-03-20','2026-03-24','religious','SA'),
  ('عيد الأضحى',    'Eid Al-Adha',     '2026-05-26','2026-05-30','religious','SA'),
  ('اليوم الوطني',  'National Day',    '2026-09-23','2026-09-23','national','SA'),
  ('يوم التأسيس',   'Founding Day',    '2026-02-22','2026-02-22','national','SA');

-- ============================================================
-- 6) SHIFTS
-- ============================================================
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes int NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#3b82f6',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone reads shifts" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages shifts" ON public.shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.shifts (name_ar, name_en, start_time, end_time, break_minutes, color) VALUES
  ('صباحية',  'Morning',   '08:00','16:00', 60, '#10b981'),
  ('مسائية',  'Evening',   '14:00','22:00', 60, '#f59e0b'),
  ('ليلية',   'Night',     '22:00','06:00', 60, '#6366f1'),
  ('مرنة',    'Flexible',  '09:00','17:00', 60, '#3b82f6');

CREATE TABLE public.employee_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_shifts TO authenticated;
GRANT ALL ON public.employee_shifts TO service_role;
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employee sees own shift" ON public.employee_shifts FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));
CREATE POLICY "HR/Mgr sees all shifts" ON public.employee_shifts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'dept_manager') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "HR manages employee shifts" ON public.employee_shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin')) WITH CHECK (public.has_role(auth.uid(),'hr_admin'));
CREATE TRIGGER trg_employee_shifts_updated BEFORE UPDATE ON public.employee_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_employee_shifts_emp ON public.employee_shifts(employee_id, effective_from);

-- ============================================================
-- 7) NOTIFICATIONS
-- ============================================================
CREATE TYPE public.notification_kind AS ENUM ('info','success','warning','error','leave','permission','contract','payroll','attendance');

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "User updates own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "User deletes own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
