import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require=createRequire(import.meta.url);
const commands=[['--import','tsx','apps/api/main.ts'],['--import','tsx','apps/gateway/main.ts'],['--import','tsx','apps/worker/main.ts'],[join(dirname(require.resolve('vite/package.json')),'bin/vite.js'),'--config','apps/web/vite.config.ts']];
const children=commands.map(args=>spawn(process.execPath,args,{stdio:'inherit',windowsHide:true}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();setTimeout(()=>process.exit(code),500);}
for(const child of children)child.on('exit',code=>{if(!stopping)stop(code||0);});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
