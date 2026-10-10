import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {passingState} from './laboratory-fixtures.mjs';
test('可选 AI 网关：显式选择、最小数据、失败不改变判定',async()=>{
 let captured,invalid=false;
 const gateway=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;captured={body:JSON.parse(body),authorization:req.headers.authorization};res.setHeader('Content-Type','application/json');res.end(JSON.stringify(invalid?{wrong:'missing text'}:{text:'建议比较 RC 时间常数与测量点，不改变成绩。'}));});
 await new Promise(ok=>gateway.listen(0,'127.0.0.1',ok));const dir=mkdtempSync(join(tmpdir(),'physics-ai-test-'));const proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:'0',AI_GATEWAY_URL:'http://127.0.0.1:'+gateway.address().port,AI_GATEWAY_KEY:'test-only-key'},stdio:['ignore','pipe','pipe']});
 try{const base=await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('启动超时')),15000);proc.stdout.on('data',c=>{const url=String(c).match(/http:\/\/\S+/)?.[0];if(url){clearTimeout(timer);ok(url);}});proc.on('exit',code=>{clearTimeout(timer);no(Error('启动失败 '+code));});});
  let cookie='';async function req(path,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:data};}
  await req('/setup','POST',{username:'testadmin',password:'test-only-admin-123',displayName:'私人姓名不应外传'});await req('/login','POST',{username:'testadmin',password:'test-only-admin-123'});const sid=(await req('/sessions','POST',{experimentId:'h08'})).body.id;await req('/sessions/'+sid,'PUT',{revision:0,state:passingState('h08')});const original=(await req('/sessions/'+sid+'/submit','POST',{})).body;
  assert.equal((await req('/sessions/'+sid+'/explain','POST',{})).body.source,'local');assert.equal(captured,undefined);
  const result=(await req('/sessions/'+sid+'/explain','POST',{external:true})).body;assert.equal(result.source,'external');assert.equal(result.changesGrade,false);assert.equal(captured.authorization,'Bearer test-only-key');assert.deepEqual(Object.keys(captured.body.input).sort(),['checks','experiment','scope']);assert.ok(!JSON.stringify(captured.body).includes('私人姓名'));assert.ok(!JSON.stringify(captured.body).includes('testadmin'));
  invalid=true;assert.equal((await req('/sessions/'+sid+'/explain','POST',{external:true})).status,502);assert.deepEqual((await req('/sessions/'+sid)).body.result,original);
 }finally{if(proc.exitCode===null)await new Promise(ok=>{proc.on('exit',ok);proc.kill();});await new Promise(ok=>gateway.close(ok));const abs=resolve(dir);assert.equal(dirname(abs),resolve(tmpdir()));assert.ok(basename(abs).startsWith('physics-ai-test-'));rmSync(abs,{recursive:true,force:true});}
});
