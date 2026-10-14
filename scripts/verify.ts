import 'dotenv/config';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { generateKeyPair,exportSPKI,SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';
import { createFixture } from './fixture.js';
import { checkApi } from '../apps/worker/main.js';
import { db } from '../packages/database/index.js';
import { policySchema } from '../packages/validation/index.js';
const headers={'Content-Type':'application/json','X-APIShield-Token':process.env.MANAGEMENT_TOKEN!};
const control='http://127.0.0.1:3000';
let fixture=createFixture();let id='';let gateway='';
const call=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(control+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${path}: ${r.status} ${r.ok?'':await r.text()}`);return r.json();};
const policy=async(value:Record<string,unknown>)=>{await call('/apis/'+id,'PATCH',{policy:policySchema.parse(value)});await sleep(2300);};
const pass=(name:string)=>console.log('PASS '+name);
try {
 for(let attempt=0;attempt<60;attempt++){try{await fetch(control+'/apis');break;}catch{if(attempt===59)throw new Error('Control API did not become ready');await sleep(1000);}}
 await new Promise<void>(resolve=>fixture.listen(8082,'127.0.0.1',resolve));
 assert.equal((await fetch(control+'/apis')).status,401);
 assert.equal((await fetch(control+'/apis',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);pass('management token and browser-origin protections');
 const unsafe=await fetch(control+'/apis',{method:'POST',headers,body:JSON.stringify({name:'Unsafe test',baseUrl:'http://example.com:8080'})});assert.equal(unsafe.status,400);pass('unsafe destination denied');
 const api=await call('/apis','POST',{name:'Verification fixture',baseUrl:'http://127.0.0.1:8082'});id=api.id;gateway='http://127.0.0.1:4000/gateway/'+api.slug;
 await call('/apis/'+id,'PATCH',{monitoring:false});await sleep(2300);
 const proxied=await fetch(gateway+'/echo?check=one',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'spoofed'},body:'{"valid":true}'});assert.equal(proxied.status,200);const echoed=await proxied.json();assert.equal(echoed.url,'/echo?check=one');assert.equal(echoed.method,'POST');assert.equal(echoed.body,'{"valid":true}');assert.equal(echoed.headers['x-forwarded-for'],undefined);pass('real proxy method, query, body and header handling');
 await policy({rateLimit:1});assert.equal((await fetch(gateway+'/')).status,200);assert.equal((await fetch(gateway+'/')).status,429);await Promise.all(Array.from({length:5},()=>fetch(gateway+'/')));await sleep(500);assert.equal(await db.incident.count({where:{apiId:id,incidentType:'REPEATED_RATE_LIMIT',resolvedAt:null}}),1);pass('rate limiting and deduplicated repeated-violation incidents');
 // A different rate window waits for the existing bucket to reset before subsequent cases.
 await policy({rateLimit:1000,bodyLimit:8});assert.equal((await fetch(gateway+'/',{method:'POST',body:'payload too large'})).status,413);pass('request size enforcement');
 const credential=await call('/apis/'+id+'/credentials','POST',{label:'Verification key'});
 await policy({authMode:'apiKey'});assert.equal((await fetch(gateway+'/')).status,401);assert.equal((await fetch(gateway+'/',{headers:{'x-api-key':credential.key}})).status,200);pass('API key hashing and enforcement');
 await call('/apis/'+id+'/credentials/'+credential.id,'DELETE');await sleep(2300);assert.equal((await fetch(gateway+'/',{headers:{'x-api-key':credential.key}})).status,401);pass('credential revocation');
 const pair=await generateKeyPair('RS256');const publicKey=await exportSPKI(pair.publicKey);await policy({authMode:'jwt',issuer:'fixture',audience:'apishield',publicKey});
 const jwt=await new SignJWT({}).setProtectedHeader({alg:'RS256'}).setIssuer('fixture').setAudience('apishield').setSubject('tester').setIssuedAt().setExpirationTime('2m').sign(pair.privateKey);
 assert.equal((await fetch(gateway+'/',{headers:{authorization:'Bearer invalid'}})).status,401);assert.equal((await fetch(gateway+'/',{headers:{authorization:'Bearer '+jwt}})).status,200);pass('JWT signature and claims enforcement');
 await policy({ipRules:[{cidr:'127.0.0.1/32',action:'block'}]});assert.equal((await fetch(gateway+'/')).status,403);pass('IP policy');
 await policy({routes:[{path:'/private',authMode:'apiKey'}]});assert.equal((await fetch(gateway+'/public')).status,200);assert.equal((await fetch(gateway+'/private/account')).status,401);assert.equal((await fetch(gateway+'/%70rivate/account')).status,401);pass('route authentication and encoded path protection');
 await policy({timeoutMs:100,responseLimit:1024});assert.equal((await fetch(gateway+'/slow')).status,502);assert.equal((await fetch(gateway+'/large')).status,502);pass('upstream duration and response size bounds');
 await policy({});
 const consoleResult=await call('/apis/'+id+'/test','POST',{mode:'gateway',method:'GET',path:'/console?secret=not-persisted',headers:{authorization:'Bearer do-not-store'},name:'Console verification'});assert.equal(consoleResult.statusCode,200);assert.ok(consoleResult.latencyMs>=0);pass('testing console request and measured latency');
 const config=await db.api.findUniqueOrThrow({where:{id}});await checkApi(config);
 await new Promise<void>(resolve=>fixture.close(()=>resolve()));await checkApi(config);await checkApi(config);assert.ok(await db.incident.findFirst({where:{apiId:id,incidentType:'DOWNTIME',resolvedAt:null}}));
 fixture=createFixture();await new Promise<void>(resolve=>fixture.listen(8082,'127.0.0.1',resolve));await checkApi(config);assert.equal(await db.incident.count({where:{apiId:id,incidentType:'DOWNTIME',resolvedAt:null}}),0);pass('healthy, confirmed downtime and automatic recovery');
 await sleep(500);const detail=await call('/apis/'+id);assert.ok(detail.events.length>=6);assert.ok(detail.measurements.length>=8);assert.ok(!JSON.stringify(detail.savedRequests).includes('do-not-store'));assert.ok(!JSON.stringify(detail.savedRequests).includes('not-persisted'));assert.ok(!JSON.stringify(detail.credentials).includes(credential.key));pass('real events and credential-free saved history');
 const fresh=new PrismaClient();assert.equal((await fresh.api.findUniqueOrThrow({where:{id}})).name,'Verification fixture');assert.ok(await fresh.measurement.count({where:{apiId:id}}));await fresh.$disconnect();pass('configuration and history persisted across database connections');
 const dashboard=await call('/dashboard');assert.ok(dashboard.series.length);pass('database-backed dashboard analytics');
 console.log('All live integration scenarios passed.');
} finally {if(id)await call('/apis/'+id,'DELETE').catch(()=>{});await new Promise<void>(resolve=>fixture.close(()=>resolve()));await db.$disconnect();}
