import { z } from 'zod';
import ipaddr from 'ipaddr.js';
export const safePath = z.string().max(2048).regex(/^\/(?!\/)[^\r\n\\#]*$/, 'Use a relative path starting with /').refine(p => {
  try { decodeURIComponent(p); return !/%(?:2f|5c|00|0a|0d|25|2e|3f|23)/i.test(p.split('?')[0]); } catch { return false; }
}, 'Invalid encoding or ambiguous encoded path');
const ipRule = z.object({ cidr: z.string().refine(v => { try { v.includes('/') ? ipaddr.parseCIDR(v) : ipaddr.parse(v); return true; } catch { return false; } }, 'Invalid IP or CIDR'), action: z.enum(['allow', 'block']) }).strict();
const auth = { authMode: z.enum(['none','apiKey','jwt']).default('none'), issuer: z.string().max(500).default(''), audience: z.string().max(500).default(''), publicKey: z.string().max(16000).default('') };
export const policySchema = z.object({
  rateLimit: z.number().int().min(1).max(100000).default(120),
  windowSeconds: z.number().int().min(1).max(3600).default(60),
  bodyLimit: z.number().int().min(1).max(10485760).default(1048576),
  responseLimit: z.number().int().min(1).max(10485760).default(2097152),
  timeoutMs: z.number().int().min(100).max(30000).default(5000),
  ...auth,
  ipRules: z.array(ipRule).max(100).default([]),
  routes: z.array(z.object({ path: safePath, ...auth }).strict()).max(100).default([])
}).strict().superRefine((p, ctx) => {
  for (const a of [p, ...p.routes]) if (a.authMode === 'jwt' && (!a.issuer || !a.audience || !a.publicKey.includes('BEGIN PUBLIC KEY'))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'JWT requires issuer, audience and a PEM public signing key (RS256)' });
});
export type Policy = z.infer<typeof policySchema>;
export const registrationSchema = z.object({ name: z.string().trim().min(1).max(100), baseUrl: z.string().url().max(2048) }).strict();
export const updateSchema = registrationSchema.partial().extend({ enabled: z.boolean().optional(), monitoring: z.boolean().optional(), policy: policySchema.optional(), monitorPath: safePath.optional(), intervalSeconds: z.number().int().min(5).max(3600).optional() }).strict();
export const testSchema = z.object({ mode: z.enum(['direct','gateway']), method: z.enum(['GET','POST','PUT','PATCH','DELETE']), path: safePath, headers: z.record(z.string().max(8000)).default({}), body: z.string().max(1048576).optional(), name: z.string().max(100).default('Untitled request') }).strict();
