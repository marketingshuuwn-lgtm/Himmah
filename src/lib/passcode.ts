// Passcode-based quick re-login.
// We encrypt the current refresh_token with a key derived from the user's
// passcode using PBKDF2 + AES-GCM, store it in localStorage, and on unlock
// decrypt + `supabase.auth.setSession` to restore the session.

const STORAGE_KEY = "alamaa.passcode.v1";
const ATTEMPTS_KEY = "alamaa.passcode.attempts";
// OWASP-recommended work factor for PBKDF2-SHA256 (2023+). Older records
// created at 150k keep decrypting via the per-record `iterations` field.
const PBKDF2_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 150_000;
const MAX_FAILED_ATTEMPTS = 5;

export interface PasscodeRecord {
  email: string;
  fullName: string;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64 (encrypted refresh_token)
  accessIv: string;
  accessCipher: string;
  createdAt: number;
  /** PBKDF2 iterations used at save time (absent on legacy records = 150k). */
  iterations?: number;
}

function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(
  passcode: string,
  salt: ArrayBuffer,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function savePasscode(params: {
  passcode: string;
  refreshToken: string;
  accessToken: string;
  email: string;
  fullName: string;
}): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const accessIv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(params.passcode, salt.buffer);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(params.refreshToken),
  );
  const accessCipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: accessIv },
    key,
    enc.encode(params.accessToken),
  );
  const rec: PasscodeRecord = {
    email: params.email,
    fullName: params.fullName,
    salt: b64encode(salt.buffer),
    iv: b64encode(iv.buffer),
    ciphertext: b64encode(ciphertext),
    accessIv: b64encode(accessIv.buffer),
    accessCipher: b64encode(accessCipher),
    createdAt: Date.now(),
    iterations: PBKDF2_ITERATIONS,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  localStorage.removeItem(ATTEMPTS_KEY);
}

export function getPasscodeRecord(): PasscodeRecord | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PasscodeRecord;
  } catch {
    return null;
  }
}

export function clearPasscode(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
}

function readFailedAttempts(): number {
  const raw = localStorage.getItem(ATTEMPTS_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Remaining unlock attempts before the stored record is wiped. */
export function remainingAttempts(): number {
  if (typeof window === "undefined") return MAX_FAILED_ATTEMPTS;
  return Math.max(0, MAX_FAILED_ATTEMPTS - readFailedAttempts());
}

export async function unlockWithPasscode(passcode: string): Promise<{
  refreshToken: string;
  accessToken: string;
} | null> {
  const rec = getPasscodeRecord();
  if (!rec) return null;
  try {
    const iters = rec.iterations ?? LEGACY_ITERATIONS;
    const key = await deriveKey(passcode, b64decode(rec.salt), iters);
    const refreshBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(rec.iv) },
      key,
      b64decode(rec.ciphertext),
    );
    const accessBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(rec.accessIv) },
      key,
      b64decode(rec.accessCipher),
    );
    const dec = new TextDecoder();
    localStorage.removeItem(ATTEMPTS_KEY);
    return {
      refreshToken: dec.decode(refreshBuf),
      accessToken: dec.decode(accessBuf),
    };
  } catch {
    // Wrong passcode: count the failure; wipe the stored record after
    // MAX_FAILED_ATTEMPTS so the encrypted session can't be guessed at
    // leisure on a shared device. User falls back to full login.
    const failed = readFailedAttempts() + 1;
    if (failed >= MAX_FAILED_ATTEMPTS) {
      clearPasscode();
    } else {
      localStorage.setItem(ATTEMPTS_KEY, String(failed));
    }
    return null;
  }
}
