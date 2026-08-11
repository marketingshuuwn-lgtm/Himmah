
-- Add enum values for early & half_day
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'early';
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'half_day';
