import { randomBytes } from 'node:crypto';
import { db } from '../../packages/database/index.js';
import { registrationSchema, updateSchema, policySchema, testSchema } from '../../packages/validation/index.js';
import { targetUrl, validateBackend, boundedRequest } from '../../packages/shared/network.js';
import { hashKey } from '../../packages/shared/security.js';
import { z } from 'zod';
export class ApiService {
  async list() { return db.api.findMany({orderBy:{createdAt:'desc'}}); }
  async create(input:unknown) {
    const data=registrationSchema.parse(input);validateBackend(data.baseUrl);
    const slug=(data.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'api')+'-'+randomBytes(3).toString('hex');
    return db.api.create({data:{...data,slug,policy:policySchema.parse({})}});
  }
  async update(id:string,input:unknown) {const data=updateSchema.parse(input);if(data.baseUrl)validateBackend(data.baseUrl);return db.api.update({where:{id},data});}
  async remove(id:string) {await db.api.delete({where:{id}});return {ok:true};}
  async detail(id:string) {
    const [api,measurements,events,incidents,credentials,savedRequests]=await Promise.all([db.api.findUniqueOrThrow({where:{id}}),db.measurement.findMany({where:{apiId:id},orderBy:{createdAt:'desc'},take:200}),db.event.findMany({where:{apiId:id},orderBy:{createdAt:'desc'},take:100}),db.incident.findMany({where:{apiId:id},orderBy:{startedAt:'desc'},take:100}),db.credential.findMany({where:{apiId:id},select:{id:true,label:true,revokedAt:true}}),db.savedRequest.findMany({where:{apiId:id},orderBy:{createdAt:'desc'},take:50})]);
    return {api,measurements,events,incidents,credentials,savedRequests};
  }
  async dashboard() {
    const since=new Date(Date.now()-86400000);
    const [apis,counts,events,incidents,health,series,categories]=await Promise.all([
      this.list(),db.measurement.groupBy({by:['decision'],where:{kind:'gateway',createdAt:{gte:since}},_count:true,_avg:{latencyMs:true}}),
      db.event.findMany({orderBy:{createdAt:'desc'},take:30}),db.incident.findMany({orderBy:{startedAt:'desc'},take:30}),
      db.measurement.findMany({where:{kind:'health'},orderBy:{createdAt:'desc'},distinct:['apiId']}),
      db.$queryRaw<Array<{hour:Date;allowed:bigint;blocked:bigint}>>`SELECT date_trunc('hour', "createdAt") AS hour, COUNT(*) FILTER (WHERE decision = 'allowed') AS allowed, COUNT(*) FILTER (WHERE decision = 'blocked') AS blocked FROM "Measurement" WHERE kind = 'gateway' AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      db.event.groupBy({by:['eventType'],where:{createdAt:{gte:since}},_count:true})
    ]);
    return {apis,counts,events,incidents,health,series:series.map(s=>({...s,allowed:Number(s.allowed),blocked:Number(s.blocked)})),categories};
  }
  async credential(id:string,input:unknown) { const {label}=z.object({label:z.string().trim().min(1).max(100)}).strict().parse(input);const key='ask_'+randomBytes(32).toString('base64url');const credential=await db.credential.create({data:{apiId:id,label,keyHash:hashKey(key)},select:{id:true,label:true}});return {...credential,key}; }
  async revoke(id:string,credentialId:string) {await db.credential.updateMany({where:{id:credentialId,apiId:id},data:{revokedAt:new Date()}});return {ok:true};}
  async resolve(id:string) {const incident=await db.incident.findUniqueOrThrow({where:{id}});if(incident.incidentType==='DOWNTIME')throw new Error('Downtime incidents resolve automatically after a successful health check');return db.incident.update({where:{id},data:{resolvedAt:new Date()}});}
  async test(id:string,input:unknown) {
    const config=testSchema.parse(input);const api=await db.api.findUniqueOrThrow({where:{id}});const policy=policySchema.parse(api.policy);
    const url=config.mode==='direct'?targetUrl(api.baseUrl,config.path):'http://127.0.0.1:4000/gateway/'+api.slug+config.path;
    const result=await boundedRequest(url,{method:config.method,headers:config.headers,body:config.method==='GET'?undefined:config.body,timeoutMs:policy.timeoutMs+1000,responseLimit:policy.responseLimit});
    // Save only replay-safe metadata. Tokens, headers, query values and bodies are deliberately excluded.
    await db.savedRequest.create({data:{apiId:id,name:config.name,requestConfig:{mode:config.mode,method:config.method,path:config.path.split('?')[0],statusCode:result.statusCode,latencyMs:result.latencyMs}}});
    return {...result,body:result.body.toString('utf8')};
  }
}
