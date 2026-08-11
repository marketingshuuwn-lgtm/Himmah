-- Passkey login: allow anonymous (pre-auth) login challenges.
-- Login challenges are created and consumed exclusively via the service
-- role in public server functions; RLS continues to protect user-scoped
-- registration/authentication challenges.

ALTER TABLE public.webauthn_challenges
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_login
  ON public.webauthn_challenges (purpose, created_at DESC)
  WHERE user_id IS NULL;
