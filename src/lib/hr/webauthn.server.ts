import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import {
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

export function getRpInfo() {
  const host = getRequestHost();
  const rpID = host.split(":")[0];
  const proto =
    getRequestHeader("x-forwarded-proto") ?? (rpID === "localhost" ? "http" : "https");
  const origin = `${proto}://${host}`;
  return { rpID, origin, rpName: "علاماء" };
}

/**
 * Internal helper: verify a WebAuthn authentication assertion server-side
 * by consuming an active challenge from `webauthn_challenges`.
 */
export async function verifyAndConsumeAuthAssertion(
  supabase: any,
  userId: string,
  response: any,
): Promise<{ credential_id: string }> {
  const { rpID, origin } = getRpInfo();
  const { data: challengeRow } = await supabase
    .from("webauthn_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", userId)
    .eq("purpose", "authentication")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challengeRow) throw new Error("لا توجد جلسة تحقق نشطة");
  if (new Date(challengeRow.expires_at).getTime() < Date.now())
    throw new Error("انتهت صلاحية الجلسة");

  const credId: string = response?.id;
  if (!credId) throw new Error("استجابة WebAuthn غير صالحة");

  const { data: cred } = await supabase
    .from("webauthn_credentials")
    .select("id, credential_id, public_key, counter")
    .eq("user_id", userId)
    .eq("credential_id", credId)
    .maybeSingle();

  if (!cred) throw new Error("الجهاز غير مسجل");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")),
      counter: Number(cred.counter),
    },
  });

  if (!verification.verified) throw new Error("فشل التحقق");

  await supabase
    .from("webauthn_credentials")
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", cred.id);
  await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);

  return { credential_id: cred.credential_id };
}
