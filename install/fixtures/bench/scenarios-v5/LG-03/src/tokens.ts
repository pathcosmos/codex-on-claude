import crypto from 'crypto';

const KEY = process.env.TOKEN_KEY || 'dev-secret-dev-secret-dev-secret!!';
const IV = Buffer.alloc(16, 0);

export function seal(payload: object): string {
  const json = JSON.stringify({ payload, exp: Date.now() + 15 * 60_000 });
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(KEY).slice(0, 32), IV);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const sig = crypto.createHash('sha256').update(enc).digest('hex');
  return `${enc.toString('base64')}.${sig}`;
}

export function open(token: string): any {
  const [body, sig] = token.split('.');
  const enc = Buffer.from(body, 'base64');
  const actual = crypto.createHash('sha256').update(enc).digest('hex');
  if (sig !== actual) throw new Error('bad token');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY).slice(0, 32), IV);
  const raw = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(raw);
  if (parsed.exp < Date.now()) throw new Error('expired');
  return parsed.payload;
}