import { createHash, timingSafeEqual } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { importSPKI, jwtVerify } from 'jose';
import type { Policy } from '../validation/index.js';
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export function equalSecret(a: string, b: string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length === y.length && timingSafeEqual(x,y); }
export function ipAllowed(ip: string, rules: Policy['ipRules']) {
  const address = ipaddr.process(ip);
  const matches = (cidr: string) => { const [network,bits] = cidr.includes('/') ? ipaddr.parseCIDR(cidr) : [ipaddr.parse(cidr), ipaddr.parse(cidr).kind()==='ipv4' ? 32 : 128] as const; return address.kind() === network.kind() && address.match(network,bits); };
  if (rules.some(r=>r.action === 'block' && matches(r.cidr))) return false;
  const allowed=rules.filter(r=>r.action==='allow');
  return !allowed.length || allowed.some(r=>matches(r.cidr));
}
export function routeAuth(policy: Policy, path: string) {
  const pathname = new URL('http://local' + decodeURIComponent(path.split('?')[0])).pathname;
  return [...policy.routes].sort((a,b)=>b.path.length-a.path.length).find(r=>pathname===r.path || pathname.startsWith(r.path.replace(/\/$/,'')+'/')) || policy;
}
export async function verifyToken(token: string, policy: Pick<Policy,'publicKey'|'issuer'|'audience'>) {
  const key = await importSPKI(policy.publicKey,'RS256');
  return jwtVerify(token,key,{ algorithms:['RS256'], issuer:policy.issuer, audience:policy.audience, requiredClaims:['exp','iat','sub'], clockTolerance:2 });
}
export class RateLimiter {
  private buckets = new Map<string,{ count:number; reset:number }>();
  check(key:string, limit:number, seconds:number, now=Date.now()) {
    let b=this.buckets.get(key);
    if (!b || b.reset<=now) { b={count:0,reset:now+seconds*1000}; this.buckets.set(key,b); }
    b.count++;
    if (this.buckets.size>10000) for (const [k,v] of this.buckets) if(v.reset<=now) this.buckets.delete(k);
    return { allowed:b.count<=limit, count:b.count, retryAfter:Math.max(1,Math.ceil((b.reset-now)/1000)) };
  }
}
