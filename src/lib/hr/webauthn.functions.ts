import { createServerFn } from "@tanstack/react-start";
import { mapDbError } from "@/lib/hr/db-errors";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
} from "@simplewebauthn/server";
import { getRpInfo, verifyAndConsumeAuthAssertion } from "@/lib/hr/webauthn.server";

export interface RegisteredDevice {
  id: string;
  credential_id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RegisteredDevice[]> => {
    const { data, error } = await context.supabase
      .from("webauthn_credentials")
      .select("id, credential_id, device_label, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    return data ?? [];
  });

export const removeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("webauthn_credentials")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

// ---- Registration ----
export const startRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID, rpName } = getRpInfo();
    const { data: existing } = await context.supabase
      .from("webauthn_credentials")
      .select("credential_id")
      .eq("user_id", context.userId);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(context.userId),
      userName: (context.claims.email as string) ?? context.userId,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id })),
    });

    await context.supabase.from("webauthn_challenges").insert({
      user_id: context.userId,
      challenge: options.challenge,
      purpose: "registration",
    });

    return options;
  });

export const finishRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ response: z.any(), label: z.string().max(80).default("جهازي") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rpID, origin } = getRpInfo();
    const { data: challengeRow } = await context.supabase
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", context.userId)
      .eq("purpose", "registration")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!challengeRow) throw new Error("لا توجد جلسة تسجيل نشطة");
    if (new Date(challengeRow.expires_at).getTime() < Date.now())
      throw new Error("انتهت صلاحية الجلسة");

    const verification = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo)
      throw new Error("فشل التحقق من الجهاز");

    const { credential } = verification.registrationInfo;
    const credIdB64 = credential.id;
    const pubKeyB64 = Buffer.from(credential.publicKey).toString("base64url");

    await context.supabase.from("webauthn_credentials").insert({
      user_id: context.userId,
      credential_id: credIdB64,
      public_key: pubKeyB64,
      counter: credential.counter,
      device_label: data.label,
    });

    await context.supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);
    return { ok: true };
  });

// ---- Authentication (for signing) ----
export const startAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID } = getRpInfo();
    const { data: creds } = await context.supabase
      .from("webauthn_credentials")
      .select("credential_id")
      .eq("user_id", context.userId);

    if (!creds || creds.length === 0) throw new Error("لم تسجل أي جهاز بعد");

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
    });

    await context.supabase.from("webauthn_challenges").insert({
      user_id: context.userId,
      challenge: options.challenge,
      purpose: "authentication",
    });

    return options;
  });


export const verifyAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ response: z.any() }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await verifyAndConsumeAuthAssertion(
      context.supabase,
      context.userId,
      data.response,
    );
    return { ok: true, credential_id: res.credential_id };
  });
