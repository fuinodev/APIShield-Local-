import { createServer } from 'node:http';
export function createFixture(){return createServer(async(req,res)=>{
  if(req.url==='/slow'){setTimeout(()=>{res.end('late');},1000);return;}
  if(req.url==='/large'){res.end('x'.repeat(200000));return;}
  if(req.url==='/redirect'){res.writeHead(302,{location:'http://example.com'});res.end();return;}
  if(req.url==='/error'){res.writeHead(500);res.end('fixture failure');return;}
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
  res.setHeader('Content-Type','application/json');res.setHeader('X-Fixture','apishield');
  res.end(JSON.stringify({service:'APIShield isolated test backend',method:req.method,url:req.url,headers:req.headers,body:Buffer.concat(chunks).toString()}));
});}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/fixture.ts'))createFixture().listen(8082,'127.0.0.1',()=>console.log('Isolated test backend at http://127.0.0.1:8082'));
