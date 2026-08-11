ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS checkout_window_before_min INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS checkout_window_after_min  INT NOT NULL DEFAULT 60;