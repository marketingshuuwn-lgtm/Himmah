
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS selfie_in_path text,
  ADD COLUMN IF NOT EXISTS selfie_out_path text,
  ADD COLUMN IF NOT EXISTS check_in_distance_m integer,
  ADD COLUMN IF NOT EXISTS check_out_distance_m integer;

ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS require_selfie boolean NOT NULL DEFAULT false;
