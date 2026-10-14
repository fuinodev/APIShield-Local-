import 'dotenv/config';
import { request } from 'undici';
import { safePath } from '../validation/index.js';
export function validateBackend(raw: string): URL {
  const u = new URL(raw);
  const ports = (process.env.ALLOWED_BACKEND_PORTS || '8080,8081,8082').split(',');
  if (!['http:','https:'].includes(u.protocol) || !['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !ports.includes(u.port || (u.protocol === 'https:' ? '443':'80')) || ['3000','4000','5173'].includes(u.port)) throw new Error('Backend must use a loopback address and an explicitly allowed development port');
  // Pin localhost to a literal loopback address: no DNS lookup or rebinding.
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
  return u;
}
export function targetUrl(base: string, path: string): string {
  safePath.parse(path);
  const u = validateBackend(base);
  const relative = new URL('http://path.invalid' + path);
  if (relative.origin !== 'http://path.invalid') throw new Error('Invalid path');
  u.pathname = u.pathname.replace(/\/$/, '') + relative.pathname;
  u.search = relative.search;
  return u.toString();
}
const denied = new Set(['host','connection','keep-alive','transfer-encoding','upgrade','proxy-authorization','proxy-authenticate','te','trailer','content-length','forwarded','via']);
export function cleanHeaders(headers: Record<string, string | string[] | undefined>, response = false): Record<string,string | string[]> {
  const connection = String(headers.connection || '').toLowerCase().split(',').map(s=>s.trim());
  const result: Record<string,string | string[]> = {};
  for (const [key,value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (value !== undefined && !denied.has(name) && !connection.includes(name) && !name.startsWith('x-forwarded-') && !name.startsWith('proxy-') && (response || name !== 'x-apishield-token')) result[name] = value;
  }
  return result;
}
export async function boundedRequest(url: string, options: { method?: string; headers?: Record<string,string|string[]>; body?: string | Buffer; timeoutMs: number; responseLimit: number }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const start = performance.now();
  try {
    const res = await request(url, { method: (options.method || 'GET') as 'GET', headers: cleanHeaders(options.headers || {}), body: options.body, signal: controller.signal, headersTimeout: options.timeoutMs, bodyTimeout: options.timeoutMs });
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of res.body) { size += chunk.length; if (size > options.responseLimit) { res.body.destroy(); throw new Error('Upstream response exceeded limit'); } chunks.push(Buffer.from(chunk)); }
    return { statusCode: res.statusCode, headers: cleanHeaders(res.headers, true), body: Buffer.concat(chunks), latencyMs: performance.now() - start };
  } finally { clearTimeout(timer); }
}
