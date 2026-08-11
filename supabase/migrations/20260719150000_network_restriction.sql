-- Network-based punch restriction.
-- Browsers cannot read Wi-Fi SSIDs (privacy), so the technically correct
-- web equivalent is the network's public IP: the admin registers the office
-- network's name (label, for display) and its public IP addresses/ranges.
-- When configured, punches are only accepted from those addresses.

ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS network_label TEXT,
  ADD COLUMN IF NOT EXISTS allowed_ip_ranges TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.attendance_rules.allowed_ip_ranges IS
  'Exact IPs, prefixes (e.g. 84.23.96.), or IPv4 CIDR (e.g. 84.23.96.0/24). Empty = no network restriction.';
