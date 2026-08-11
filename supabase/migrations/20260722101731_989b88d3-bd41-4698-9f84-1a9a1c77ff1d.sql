-- Allow anonymous login challenges (purpose='login', no user yet).
ALTER TABLE public.webauthn_challenges ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.webauthn_challenges
  DROP CONSTRAINT IF EXISTS webauthn_challenges_user_purpose_ck;

ALTER TABLE public.webauthn_challenges
  ADD CONSTRAINT webauthn_challenges_user_purpose_ck
  CHECK (
    (purpose = 'login' AND user_id IS NULL)
    OR (purpose <> 'login' AND user_id IS NOT NULL)
  );