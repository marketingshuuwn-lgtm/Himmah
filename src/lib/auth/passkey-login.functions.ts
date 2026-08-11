// Passkey (WebAuthn) LOGIN — public, pre-authentication server functions.
//
// Flow:
//   1. passkeyLoginOptions  → anonymous single-use challenge (stored via the
//      service role with user_id NULL, purpose 'login') + authentication
//      options for navigator.credentials.get (discoverable credentials).
//   2. passkeyLoginVerify   → consumes the challenge (single-use, deleted
//      before verification to kill replays), resolves the credential to its
//      owner, verifies the signature + counter, then mints a Supabase session
//      via admin.generateLink(magiclink) — returning token_hash for the
//      client to exchange with supabase.auth.verifyOtp. No email is sent.
//
// Reuses the same webauthn_credentials devices employees already registered
// for attendance verification — register once, use everywhere.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { getRpInfo } from "@/lib/hr/webauthn.server";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Typed error codes make it possible for the UI to react (auto-retry, show
// specific guidance) rather than blindly forwarding raw messages.
class PasskeyLoginError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    // Encode both code + message so the client can parse either side.
    this.message = `[${code}] ${message}`;
  }
}

export const passkeyLoginOptions = createServerFn({ method: "POST" }).handler(async () => {
  const { rpID } = getRpInfo();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    // Empty list → discoverable credential (the device offers its passkeys)
    allowCredentials: [],
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const { data: row, error } = await (
    supabaseAdmin as never as {
      from: (t: string) => {
        insert: (v: unknown) => {
          select: (c: string) => {
            single: () => Promise<{ data: { id: string } | null; error: unknown }>;
          };
        };
      };
    }
  )
    .from("webauthn_challenges")
    .insert({
      user_id: null,
      challenge: options.challenge,
      purpose: "login",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !row)
    throw new PasskeyLoginError("challenge_create_failed", "تعذر بدء جلسة الدخول");

  return { challenge_id: row.id, options, expires_at: expiresAt };
});

const verifySchema = z.object({
  challenge_id: z.string().uuid(),
  // WebAuthn assertion JSON from @simplewebauthn/browser
  response: z.any(),
});

export const passkeyLoginVerify = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifySchema.parse(d))
  .handler(async ({ data }) => {
    const { rpID, origin } = getRpInfo();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any; // service role; anon rows are RLS-invisible

    // Load the anonymous login challenge.
    const { data: ch } = await admin
      .from("webauthn_challenges")
      .select("id, challenge, created_at, expires_at")
      .eq("id", data.challenge_id)
      .eq("purpose", "login")
      .is("user_id", null)
      .maybeSingle();
    if (!ch)
      throw new PasskeyLoginError(
        "challenge_missing",
        "انتهت جلسة الدخول أو استُخدمت — سنبدأ محاولة جديدة",
      );

    // Single-use: delete BEFORE verification so a stolen challenge can't be replayed.
    await admin.from("webauthn_challenges").delete().eq("id", ch.id);

    const expiresMs = ch.expires_at
      ? new Date(ch.expires_at).getTime()
      : new Date(ch.created_at).getTime() + CHALLENGE_TTL_MS;
    if (Date.now() > expiresMs) {
      throw new PasskeyLoginError(
        "challenge_expired",
        "انتهت صلاحية جلسة الدخول — سنبدأ محاولة جديدة",
      );
    }

    const credId: string | undefined = data.response?.id;
    if (!credId)
      throw new PasskeyLoginError("invalid_response", "استجابة غير صالحة من الجهاز");

    const { data: cred } = await admin
      .from("webauthn_credentials")
      .select("id, user_id, credential_id, public_key, counter")
      .eq("credential_id", credId)
      .maybeSingle();
    if (!cred) {
      throw new PasskeyLoginError(
        "device_not_registered",
        "هذا الجهاز غير مسجل — سجّل الدخول بكلمة المرور ثم فعّل بصمة الجهاز من الإعدادات",
      );
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: data.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: cred.credential_id,
          publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")),
          counter: Number(cred.counter),
        },
      });
    } catch (e) {
      throw new PasskeyLoginError(
        "verification_failed",
        e instanceof Error ? e.message : "فشل التحقق من بصمة الجهاز",
      );
    }
    if (!verification.verified)
      throw new PasskeyLoginError("verification_failed", "فشل التحقق من بصمة الجهاز");

    await admin
      .from("webauthn_credentials")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", cred.id);

    // Resolve the account and mint a session token (no email is sent).
    const { data: userRes, error: uErr } = await admin.auth.admin.getUserById(cred.user_id);
    const email: string | undefined = userRes?.user?.email ?? undefined;
    if (uErr || !email)
      throw new PasskeyLoginError(
        "account_unresolved",
        "تعذر تحديد الحساب المرتبط بهذا الجهاز",
      );

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash: string | undefined = link?.properties?.hashed_token;
    if (linkErr || !tokenHash)
      throw new PasskeyLoginError("session_mint_failed", "تعذر إنشاء الجلسة");

    await admin.from("security_audit_log").insert({
      entity_type: "auth",
      entity_id: null,
      action: "passkey_login",
      actor_user_id: cred.user_id,
      actor_kind: "user",
      metadata: { credential_id: cred.credential_id },
    });

    return { token_hash: tokenHash };
  });
