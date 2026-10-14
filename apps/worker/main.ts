import { db } from '../../packages/database/index.js';
import { boundedRequest,targetUrl } from '../../packages/shared/network.js';
import { policySchema } from '../../packages/validation/index.js';
import { event } from '../../packages/shared/telemetry.js';
let stopped=false;
const due=new Map<string,number>();
export async function checkApi(api:Awaited<ReturnType<typeof db.api.findMany>>[number]) {
  const start=performance.now();let statusCode=0;
  try {const policy=policySchema.parse(api.policy);statusCode=(await boundedRequest(targetUrl(api.baseUrl,api.monitorPath),{timeoutMs:policy.timeoutMs,responseLimit:policy.responseLimit})).statusCode;} catch { /* Connection and validation failures are recorded without sensitive exception text. */ }
  const success=statusCode>=200 && statusCode<400;
  await db.measurement.create({data:{apiId:api.id,kind:'health',statusCode,latencyMs:performance.now()-start,decision:success?'healthy':statusCode?'degraded':'down'}});
  const incident=await db.incident.findFirst({where:{apiId:api.id,incidentType:'DOWNTIME',resolvedAt:null}});
  if(success && incident) {await db.incident.update({where:{id:incident.id},data:{resolvedAt:new Date()}});await event(api.id,'RECOVERY','INFO');}
  if(!success && !incident) {const recent=await db.measurement.findMany({where:{apiId:api.id,kind:'health'},orderBy:{createdAt:'desc'},take:2});if(recent.length===2 && recent.every(r=>r.decision!=='healthy')) {await db.incident.create({data:{apiId:api.id,incidentType:'DOWNTIME'}});await event(api.id,'DOWNTIME','CRITICAL');}}
}
async function tick() {
  try {
    const apis=await db.api.findMany({where:{monitoring:true}});
    // Sequential checks bound concurrency to one; the next tick starts only after this batch finishes.
    for(const api of apis) {if(stopped)break;if((due.get(api.id)||0)>Date.now())continue;await checkApi(api);due.set(api.id,Date.now()+api.intervalSeconds*1000);}
    const ids=new Set(apis.map(a=>a.id));for(const id of due.keys())if(!ids.has(id))due.delete(id);
    // Resolve alert episodes after five quiet minutes, retaining incident history.
    for(const incident of await db.incident.findMany({where:{resolvedAt:null,incidentType:{in:['REPEATED_RATE_LIMIT','REPEATED_AUTH_FAILURE']}}})) {const types=incident.incidentType==='REPEATED_RATE_LIMIT'?['RATE_LIMIT']:['API_KEY','JWT'];if(!await db.event.count({where:{apiId:incident.apiId,eventType:{in:types},createdAt:{gte:new Date(Date.now()-300000)}}}))await db.incident.update({where:{id:incident.id},data:{resolvedAt:new Date()}});}
  } catch {console.error('Monitor cycle failed; check database connectivity');}
  if(!stopped)setTimeout(()=>void tick(),1000);
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/worker/main.ts')) {console.log('Monitoring worker started');void tick();for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopped=true;void db.$disconnect().then(()=>process.exit());});}
