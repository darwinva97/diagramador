/** Utilidades criptográficas: contraseñas (PBKDF2), sesiones firmadas (HMAC) y API keys. */

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export const randomId = (bytes = 12) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
export const nowIso = () => new Date().toISOString();

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g)!.map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120_000 }, key, 256);
  return { hash: hex(bits), salt: hex(salt.buffer) };
}
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const h = await hashPassword(password, salt);
  return timingSafeEqual(h.hash, hash);
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Token de sesión: base64url(userId|exp).firma */
export async function signSession(secret: string, userId: string, days = 30): Promise<string> {
  const payload = b64url(`${userId}|${Date.now() + days * 86_400_000}`);
  return `${payload}.${await hmac(secret, payload)}`;
}
export async function verifySession(secret: string, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (!timingSafeEqual(await hmac(secret, payload), sig)) return null;
  const [userId, exp] = unb64url(payload).split('|');
  if (!userId || Number(exp) < Date.now()) return null;
  return userId;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return 'dgk_' + [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}
export async function sha256(s: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
