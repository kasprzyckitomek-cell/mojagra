// Hasła (scrypt) i podpisane tokeny sesji (HMAC, format zbliżony do JWT).
import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('[auth] Brak JWT_SECRET – tokeny wygasną po restarcie serwera.');

export function hashPassword(pass: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}

export function verifyPassword(pass: string, stored: string): boolean {
  const [alg, salt, h] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const test = crypto.scryptSync(pass, salt, 64);
  const ref = Buffer.from(h, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function signToken(payload: { uid: number; name: string }, days = 30): string {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): { uid: number; name: string } | null {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (exp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp < Date.now()) return null;
    return { uid: p.uid, name: p.name };
  } catch {
    return null;
  }
}

/** Prosty limiter: max `n` zdarzeń na `ms` dla klucza. */
export class RateLimiter {
  private m = new Map<string, number[]>();
  constructor(private n: number, private ms: number) {}
  hit(key: string): boolean {
    const now = Date.now();
    const arr = (this.m.get(key) || []).filter((t) => now - t < this.ms);
    arr.push(now);
    this.m.set(key, arr);
    if (this.m.size > 5000) this.m.clear();
    return arr.length <= this.n;
  }
}

const BAD = ['kurw', 'chuj', 'pierdol', 'jeban', 'cipa', 'fuck', 'shit', 'nigg'];
export function cleanName(s: string): string {
  let n = String(s || '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
  if (BAD.some((b) => n.toLowerCase().includes(b))) n = 'Rozbitek';
  return n;
}
export function censor(s: string): string {
  let out = s;
  for (const b of BAD) out = out.replace(new RegExp(b + '\\p{L}*', 'giu'), '***');
  return out;
}
