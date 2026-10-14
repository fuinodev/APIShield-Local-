import 'dotenv/config';
import {writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {createFixture} from './fixture.js';
const headers={'Content-Type':'application/json','X-APIShield-Token':process.env.MANAGEMENT_TOKEN!};
const call=async(path:string,method='GET',body?:unknown)=>{const r=await fetch('http://127.0.0.1:3000'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok);return r.json();};
if(process.argv[2]==='prepare'){
 const fixture=createFixture();await new Promise<void>(resolve=>fixture.listen(8082,'127.0.0.1',resolve));
 try{const api=await call('/apis','POST',{name:'Restart verification',baseUrl:'http://127.0.0.1:8082'});writeFileSync('.restart-check.json',JSON.stringify({id:api.id}));await call('/apis/'+api.id,'PATCH',{monitoring:false});await sleep(2300);await call('/apis/'+api.id+'/test','POST',{mode:'gateway',method:'GET',path:'/persisted',headers:{},name:'Persisted verification'});await sleep(1000);console.log('Restart fixture saved. Restart APIShield, then run this script with finish.');}finally{await new Promise<void>(resolve=>fixture.close(()=>resolve()));}
}else if(process.argv[2]==='finish'){
 const {id}=JSON.parse(readFileSync('.restart-check.json','utf8'));
 for(let n=0;n<60;n++){try{await call('/apis');break;}catch{if(n===59)throw new Error('Control service did not restart');await sleep(1000);}}
 const detail=await call('/apis/'+id);assert.equal(detail.api.name,'Restart verification');assert.ok(detail.savedRequests.some((r:{name:string})=>r.name==='Persisted verification'));assert.ok(detail.measurements.some((m:{path:string})=>m.path==='/persisted'));await call('/apis/'+id,'DELETE');unlinkSync('.restart-check.json');console.log('PASS configuration, saved requests and gateway measurements survive a full service restart. Temporary record removed.');
}else throw new Error('Use prepare or finish');
