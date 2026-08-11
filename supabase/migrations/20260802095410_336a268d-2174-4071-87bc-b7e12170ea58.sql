ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS parent_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_flow jsonb NOT NULL DEFAULT '{"require_manager_approval": false, "require_biometric": false, "notify_by_email": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS manager_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_approved_by uuid;

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_approval_flow jsonb NOT NULL DEFAULT '{"require_manager_approval": false, "require_biometric": false, "notify_by_email": true}'::jsonb;

CREATE INDEX IF NOT EXISTS contracts_parent_idx ON public.contracts(parent_contract_id);