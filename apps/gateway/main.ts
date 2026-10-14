import Fastify, { type FastifyRequest } from 'fastify';
import { db } from '../../packages/database/index.js';
import { policySchema, safePath, type Policy } from '../../packages/validation/index.js';
import { boundedRequest, targetUrl, validateBackend, cleanHeaders } from '../../packages/shared/network.js';
import { hashKey, equalSecret, ipAllowed, routeAuth, verifyToken, RateLimiter } from '../../packages/shared/security.js';
import { event, record } from '../../packages/shared/telemetry.js';
type Config = { id:string; slug:string; baseUrl:string; enabled:boolean; policy:Policy; hashes:string[] };
export function createGateway(load:()=>Promise<Config[]> = async()=> (await db.api.findMany({include:{credentials:{where:{revokedAt:null}}}})).map(a=>({...a,policy:policySchema.parse(a.policy),hashes:a.credentials.map(c=>c.keyHash)}))) {
  const app=Fastify({logger:false, bodyLimit:10485760, requestTimeout:35000, connectionTimeout:35000, keepAliveTimeout:5000, trustProxy:false});
  app.server.headersTimeout=10000;
  let configs=new Map<string,Config>(); let refreshed=0; let refreshing=false;
  const limiter=new RateLimiter();
  async function refresh() { if(refreshing) return; refreshing=true; try { const items=await load(); for(const a of items) validateBackend(a.baseUrl); configs=new Map(items.map(a=>[a.slug,a])); refreshed=Date.now(); } catch { console.error('Gateway configuration refresh failed'); } finally { refreshing=false; } }
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  const state=new WeakMap<FastifyRequest,{config:Config; path:string; start:number; decision:string}>();
  app.addHook('onRequest', async(req,reply)=>{
    const match=req.raw.url?.match(/^\/gateway\/([^/?]+)(.*)$/);
    if(!match) return reply.code(404).send({error:'Use /gateway/{api-slug}/{path}'});
    const config=configs.get(match[1]);
    if(!config || !config.enabled) return reply.code(404).send({error:'Gateway route not found or disabled'});
    const path=match[2].startsWith('?')?'/'+match[2]:(match[2] || '/');
    const s={config,path,start:performance.now(),decision:'allowed'}; state.set(req,s);
    const reject=(code:number,type:string)=>{s.decision='blocked';record(()=>event(config.id,type));return reply.code(code).send({error:type});};
    if(Date.now()-refreshed>30000) return reject(503,'POLICY_ERROR');
    if(!safePath.safeParse(path).success) return reject(400,'MALFORMED');
    if(!ipAllowed(req.ip,config.policy.ipRules)) return reject(403,'IP_POLICY');
    const rate=limiter.check(`${config.id}:${req.ip}:${config.policy.rateLimit}:${config.policy.windowSeconds}`,config.policy.rateLimit,config.policy.windowSeconds);
    if(!rate.allowed) {reply.header('retry-after',rate.retryAfter); return reject(429,'RATE_LIMIT');}
    if(rate.count===Math.max(10,Math.floor(config.policy.rateLimit*.8))) record(()=>event(config.id,'BURST','INFO'));
    if(Number(req.headers['content-length'] || 0)>config.policy.bodyLimit) return reject(413,'BODY_LIMIT');
    const auth=routeAuth(config.policy,path);
    if(auth.authMode==='apiKey') { const key=req.headers['x-api-key']; if(typeof key!=='string' || !config.hashes.some(h=>equalSecret(h,hashKey(key)))) return reject(401,'API_KEY'); }
    if(auth.authMode==='jwt') { try { const h=req.headers.authorization; if(!h?.startsWith('Bearer ')) throw new Error(); await verifyToken(h.slice(7),auth); } catch { return reject(401,'JWT'); } }
  });
  app.setErrorHandler((error,req,reply)=>{const s=state.get(req);const type=(error as {code?:string}).code==='FST_ERR_CTP_BODY_TOO_LARGE'?'BODY_LIMIT':'MALFORMED'; if(s){s.decision='blocked';record(()=>event(s.config.id,type));} reply.code(type==='BODY_LIMIT'?413:400).send({error:type});});
  app.addHook('onResponse',async(req,reply)=>{const s=state.get(req);if(s)record(()=>db.measurement.create({data:{apiId:s.config.id,kind:'gateway',method:req.method,path:s.path.split('?')[0],statusCode:reply.statusCode,latencyMs:performance.now()-s.start,decision:s.decision}}));});
  app.all('/gateway/*',async(req,reply)=>{
    const s=state.get(req); if(!s) return reply.code(404).send();
    const body=Buffer.isBuffer(req.body)?req.body:undefined;
    if(body && body.length>s.config.policy.bodyLimit) {s.decision='blocked';record(()=>event(s.config.id,'BODY_LIMIT'));return reply.code(413).send({error:'BODY_LIMIT'});}
    try {
      const headers=cleanHeaders(req.headers);
      // APIShield credentials terminate at the gateway; application bearer tokens are preserved.
      if(routeAuth(s.config.policy,s.path).authMode==='apiKey') delete headers['x-api-key'];
      const result=await boundedRequest(targetUrl(s.config.baseUrl,s.path),{method:req.method,headers,body,timeoutMs:s.config.policy.timeoutMs,responseLimit:s.config.policy.responseLimit});
      reply.headers(result.headers).code(result.statusCode).send(result.body);
    } catch {record(()=>event(s.config.id,'UPSTREAM_TIMEOUT'));reply.code(502).send({error:'Backend unavailable, timed out, or exceeded response limit'});}
  });
  app.addHook('onReady',async()=>{await refresh();});
  const timer=setInterval(()=>void refresh(),2000);timer.unref();
  app.addHook('onClose',async()=>clearInterval(timer));
  return app;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/gateway/main.ts')) {
  const app=createGateway(); await app.listen({host:'127.0.0.1',port:4000}); console.log('Gateway ready at http://127.0.0.1:4000');
  for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>void app.close().then(()=>db.$disconnect()).then(()=>process.exit()));
}
