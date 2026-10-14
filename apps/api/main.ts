import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { json } from 'express';
import { ApiService } from './service.js';
import { equalSecret } from '../../packages/shared/security.js';
import { RateLimiter } from '../../packages/shared/security.js';
import { db } from '../../packages/database/index.js';
const service=new ApiService();
@Controller()
class ApiController {
  @Get('apis') list(){return service.list();}
  @Post('apis') create(@Body() b:unknown){return service.create(b);}
  @Get('apis/:id') detail(@Param('id') id:string){return service.detail(id);}
  @Patch('apis/:id') update(@Param('id') id:string,@Body() b:unknown){return service.update(id,b);}
  @Delete('apis/:id') remove(@Param('id') id:string){return service.remove(id);}
  @Get('dashboard') dashboard(){return service.dashboard();}
  @Post('apis/:id/credentials') credential(@Param('id') id:string,@Body() b:unknown){return service.credential(id,b);}
  @Delete('apis/:id/credentials/:key') revoke(@Param('id') id:string,@Param('key') key:string){return service.revoke(id,key);}
  @Post('apis/:id/test') test(@Param('id') id:string,@Body() b:unknown){return service.test(id,b);}
  @Post('incidents/:id/resolve') resolve(@Param('id') id:string){return service.resolve(id);}
}
@Module({controllers:[ApiController]}) class AppModule {}
export async function startControl() {
  const token=process.env.MANAGEMENT_TOKEN;
  if(!token || token.length<32 || token.includes('GENERATE')) throw new Error('Run pnpm setup to generate a management token');
  const app=await NestFactory.create(AppModule,{logger:['error','warn','log'],bodyParser:false});
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const limiter=new RateLimiter();
  app.use((req:Request,res:Response,next:NextFunction)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(!['127.0.0.1:3000','localhost:3000'].includes(req.headers.host || '')) return res.status(403).json({error:'Invalid management host'});
    const origin=req.headers.origin;
    if(origin && !['http://localhost:5173','http://127.0.0.1:5173'].includes(origin)) return res.status(403).json({error:'Origin denied'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-APIShield-Token');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');}
    if(req.method==='OPTIONS') return res.status(204).end();
    const provided=req.headers['x-apishield-token'];
    if(typeof provided!=='string' || !equalSecret(provided,token)) return res.status(401).json({error:'Management token required'});
    if(!limiter.check(req.socket.remoteAddress || 'local',300,60).allowed) return res.status(429).json({error:'Management rate limit exceeded'});
    next();
  });
  app.use(json({limit:'1100kb'}));
  app.useGlobalFilters({catch(error:unknown,host){const res=host.switchToHttp().getResponse<Response>();const e=error as {name?:string;code?:string;message?:string;status?:number};const status=e.code==='P2025'?404:e.status===413?413:e.status===400||e.name==='ZodError'||e.message?.startsWith('Backend must')?400:500;res.status(status).json({error:status===500?'Operation failed. Check database connectivity and request configuration.':status===404?'Record not found':status===413?'Management request body too large':e.name==='ZodError'?e.message:'Invalid request or backend destination'});}});
  const server=app.getHttpServer();server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  await app.listen(3000,'127.0.0.1');console.log('Control API ready at http://127.0.0.1:3000');
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>db.$disconnect()).then(()=>process.exit()));
  return app;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/api/main.ts')) await startControl();
