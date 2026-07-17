// ════════════════════════════════════════════════════════════
// Helpers partagés — sync sociale (social-oauth + sync-social)
// Chiffrement AES-GCM des tokens + état OAuth signé HMAC.
// Clé : secret SOCIAL_CRYPTO_KEY (32 octets, base64).
// ════════════════════════════════════════════════════════════

const RAW_KEY = Uint8Array.from(atob(Deno.env.get("SOCIAL_CRYPTO_KEY") || ""), (c) => c.charCodeAt(0));

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", RAW_KEY, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", RAW_KEY, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Chiffre un token → base64(iv ∥ ciphertext). */
export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), iv.length);
  return b64(out);
}

export async function decryptToken(stored: string): Promise<string> {
  const buf = unb64(stored);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, await aesKey(), buf.slice(12));
  return new TextDecoder().decode(pt);
}

/** État OAuth signé : base64url(json).base64url(hmac). */
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(json));
  return `${b64url(json)}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
}

export async function verifyState(state: string, maxAgeMs = 15 * 60 * 1000): Promise<Record<string, unknown> | null> {
  const [p, s] = (state || "").split(".");
  if (!p || !s) return null;
  try {
    const json = unb64url(p);
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(),
      Uint8Array.from(unb64url(s), (c) => c.charCodeAt(0)), new TextEncoder().encode(json));
    if (!ok) return null;
    const data = JSON.parse(json);
    if (!data.ts || Date.now() - data.ts > maxAgeMs) return null;
    return data;
  } catch { return null; }
}
