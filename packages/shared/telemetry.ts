import { db } from '../database/index.js';
const messages: Record<string,string> = {
  RATE_LIMIT:'Request rate exceeded the configured limit. Review client retry behavior or adjust the rate policy.',
  API_KEY:'API credential rejected. Check the x-api-key header and credential revocation status.',
  JWT:'JWT rejected. Check signature, expiry, issuer, audience and the configured public key.',
  IP_POLICY:'Client address rejected by an IP policy. Review allow and block rules.',
  BODY_LIMIT:'Request exceeded the configured body limit. Reduce payload size or adjust the limit.',
  MALFORMED:'Malformed request rejected. Check URL encoding, content length and HTTP syntax.',
  UPSTREAM_TIMEOUT:'Backend request failed or timed out. Check the backend process, port, TLS certificate and timeout.',
  POLICY_ERROR:'Gateway configuration is unavailable or invalid. Check database connectivity and saved policies.',
  BURST:'Unusual request burst observed. Check client concurrency and retry loops.',
  RECOVERY:'Backend health checks have recovered.',
  DOWNTIME:'Two consecutive health checks failed. Check the backend process and health endpoint.'
};
// A bounded queue keeps database latency out of the proxy path. No bodies, query strings or credentials are logged.
let pending=0;
export function record(work:()=>Promise<unknown>) { if(pending>=500) { console.error('Telemetry queue full; measurement dropped'); return; } pending++; void work().catch(()=>console.error('Telemetry persistence failed')).finally(()=>pending--); }
export async function event(apiId:string,eventType:string,severity='WARNING') {
  await db.event.create({data:{apiId,eventType,severity,reason:messages[eventType] || 'Review gateway configuration.'}});
  if(['RATE_LIMIT','API_KEY','JWT'].includes(eventType)) {
    const count=await db.event.count({where:{apiId,eventType:{in:eventType==='RATE_LIMIT'?['RATE_LIMIT']:['API_KEY','JWT']},createdAt:{gte:new Date(Date.now()-60000)}}});
    if(count>=5) {
      const type=eventType==='RATE_LIMIT'?'REPEATED_RATE_LIMIT':'REPEATED_AUTH_FAILURE';
      await db.$transaction(async tx=>{
        // Serialize creation of each incident episode when several requests fail together.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${apiId+':'+type}))`;
        if(!await tx.incident.findFirst({where:{apiId,incidentType:type,resolvedAt:null}}))await tx.incident.create({data:{apiId,incidentType:type}});
      });
    }
  }
}
