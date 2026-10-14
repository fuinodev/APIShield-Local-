import { describe,it,expect,beforeAll,afterAll,vi } from 'vitest';
vi.mock('../packages/shared/telemetry.js',()=>({record:()=>{},event:async()=>{}}));
import { generateKeyPair,exportSPKI,SignJWT } from 'jose';
import { validateBackend,targetUrl,cleanHeaders,boundedRequest } from '../packages/shared/network.js';
import { policySchema,safePath } from '../packages/validation/index.js';
import { RateLimiter,ipAllowed,hashKey,routeAuth,verifyToken } from '../packages/shared/security.js';
import { createGateway } from '../apps/gateway/main.js';
import { createFixture } from '../scripts/fixture.js';
const fixture=createFixture();
beforeAll(()=>new Promise<void>(resolve=>fixture.listen(8082,'127.0.0.1',resolve)));
afterAll(()=>new Promise<void>(resolve=>fixture.close(()=>resolve())));
describe('outbound boundary',()=>{
 it.each(['http://example.com:8080','http://127.0.0.1:3000','http://127.0.0.1:5432','file:///etc/passwd','http://user:pass@localhost:8080','http://169.254.169.254:8080','http://localhost.evil.test:8080'])('rejects %s',url=>expect(()=>validateBackend(url)).toThrow());
 it('pins localhost and preserves base path and query',()=>expect(targetUrl('http://localhost:8082/v1','/accounts?q=1')).toBe('http://127.0.0.1:8082/v1/accounts?q=1'));
 it.each(['//evil.test/x','/\\evil','/%2f%2fevil','/x\r\nInjected: true'])('rejects unsafe path %s',p=>expect(safePath.safeParse(p).success).toBe(false));
 it('strips forwarding and connection-nominated headers',()=>expect(cleanHeaders({host:'evil',forwarded:'for=evil','x-forwarded-for':'evil',connection:'x-secret','x-secret':'secret',authorization:'Bearer app'})).toEqual({authorization:'Bearer app'}));
 it('does not follow redirects',async()=>expect((await boundedRequest('http://127.0.0.1:8082/redirect',{timeoutMs:500,responseLimit:1000})).statusCode).toBe(302));
 it('bounds responses',async()=>await expect(boundedRequest('http://127.0.0.1:8082/large',{timeoutMs:500,responseLimit:1000})).rejects.toThrow());
});
describe('security policies',()=>{
 it('rate limits and resets deterministically',()=>{const l=new RateLimiter();expect(l.check('a',1,1,1).allowed).toBe(true);expect(l.check('a',1,1,2).allowed).toBe(false);expect(l.check('a',1,1,1002).allowed).toBe(true);});
 it('gives block CIDRs priority and handles mapped IPv4',()=>{expect(ipAllowed('::ffff:127.0.0.1',[{cidr:'127.0.0.0/8',action:'allow'}])).toBe(true);expect(ipAllowed('127.0.0.1',[{cidr:'127.0.0.0/8',action:'allow'},{cidr:'127.0.0.1',action:'block'}])).toBe(false);});
 it('matches route boundaries and encoded letters',()=>{const p=policySchema.parse({routes:[{path:'/private',authMode:'apiKey'}]});expect(routeAuth(p,'/private/a').authMode).toBe('apiKey');expect(routeAuth(p,'/%70rivate/a').authMode).toBe('apiKey');expect(routeAuth(p,'/privateish').authMode).toBe('none');});
 it('cryptographically verifies JWT signature and claims',async()=>{const {publicKey,privateKey}=await generateKeyPair('RS256');const config={publicKey:await exportSPKI(publicKey),issuer:'fixture',audience:'apishield'};const token=await new SignJWT({}).setProtectedHeader({alg:'RS256'}).setIssuer('fixture').setAudience('apishield').setSubject('tester').setIssuedAt().setExpirationTime('1m').sign(privateKey);await expect(verifyToken(token,config)).resolves.toBeDefined();await expect(verifyToken(token,{...config,audience:'wrong'})).rejects.toThrow();await expect(verifyToken(token+'x',config)).rejects.toThrow();});
});
describe('real gateway request path',()=>{
 async function gateway(overrides:Record<string,unknown>={}){const app=createGateway(async()=>[{id:'isolated-test',slug:'fixture',baseUrl:'http://127.0.0.1:8082',enabled:true,policy:policySchema.parse(overrides),hashes:[hashKey('valid-key')]}]);await app.ready();return app;}
 it('preserves method, query and body and strips spoofed forwarding headers',async()=>{const app=await gateway();try{const res=await app.inject({method:'POST',url:'/gateway/fixture/echo?q=yes',headers:{'content-type':'application/json','x-forwarded-for':'evil'},payload:'{"hello":true}'});expect(res.statusCode).toBe(200);const body=res.json();expect(body.method).toBe('POST');expect(body.url).toBe('/echo?q=yes');expect(body.body).toBe('{"hello":true}');expect(body.headers['x-forwarded-for']).toBeUndefined();}finally{await app.close();}});
 it('rejects oversized, rate-limited, invalid-key and blocked-IP requests',async()=>{
  for(const [policy,requests,codes] of [[{bodyLimit:2},[{method:'POST',payload:'abcd'}],[413]],[{rateLimit:1},[{},{}],[200,429]],[{authMode:'apiKey'},[{}, {headers:{'x-api-key':'valid-key'}}],[401,200]],[{ipRules:[{cidr:'127.0.0.1',action:'block'}]},[{}],[403]]] as [Record<string,unknown>,Record<string,unknown>[],number[]][]){const app=await gateway(policy);try{for(let i=0;i<requests.length;i++){const r=await app.inject({url:'/gateway/fixture/',...requests[i]} as never);expect(r.statusCode).toBe(codes[i]);}}finally{await app.close();}}
 });
 it('fails a slow backend with bounded timeout',async()=>{const app=await gateway({timeoutMs:100});try{expect((await app.inject('/gateway/fixture/slow')).statusCode).toBe(502);}finally{await app.close();}});
 it('fails closed when the configuration cache expires',async()=>{const app=await gateway();const current=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(current+31000);try{expect((await app.inject('/gateway/fixture/')).statusCode).toBe(503);}finally{clock.mockRestore();await app.close();}});
});
