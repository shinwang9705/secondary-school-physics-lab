import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {laboratories} from '../public/physics/laboratory.js';
import {passingState} from './laboratory-fixtures.mjs';
test('v1 平台：28 实验闭环、账号授权、任务统计、报告、关键帧、备份恢复',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'physics-platform-test-')),proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:'0',AI_GATEWAY_URL:''},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('启动超时')),15000);proc.stdout.on('data',chunk=>{const url=String(chunk).match(/http:\/\/\S+/)?.[0];if(url){clearTimeout(timer);ok(url);}});proc.on('exit',code=>{clearTimeout(timer);no(Error('提前退出 '+code));});});
  async function req(path,method='GET',body,cookie=''){const r=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  await req('/setup','POST',{username:'admin',password:'platform-admin-123'});const admin=(await req('/login','POST',{username:'admin',password:'platform-admin-123'})).cookie;
  const teacher=(await req('/users','POST',{username:'teacher',password:'platform-teacher-123',role:'TEACHER'},admin)).body.id;
  const teacher2=(await req('/users','POST',{username:'teacher2',password:'platform-teacher-123',role:'TEACHER'},admin)).body.id;
  const cid=(await req('/classes','POST',{name:'一班',teacherId:teacher},admin)).body.id;
  assert.equal((await req('/classes/'+cid,'PATCH',{name:'一班',teacherIds:[teacher,teacher2]},admin)).status,200);
  const student=(await req('/users','POST',{username:'student',password:'platform-student-123',role:'STUDENT',classId:cid},admin)).body.id;
  const other=(await req('/users','POST',{username:'other',password:'platform-student-123',role:'STUDENT'},admin)).body.id;
  const sc=(await req('/login','POST',{username:'student',password:'platform-student-123'})).cookie,tc=(await req('/login','POST',{username:'teacher2',password:'platform-teacher-123'})).cookie,oc=(await req('/login','POST',{username:'other',password:'platform-student-123'})).cookie;
  const task=(await req('/tasks','POST',{classId:cid,experimentId:'h08',title:'RC',dueAt:'2026-01-01T00:00:00Z',description:'观察时间常数'},tc)).body.id;
  assert.equal((await req('/sessions','POST',{experimentId:'h08',taskId:task},oc)).status,403);
  let rcId;
  for(const id of Object.keys(laboratories)){
   const created=await req('/sessions','POST',{experimentId:id,...(id==='h08'?{taskId:task}:{})},sc);assert.equal(created.status,201);assert.equal(created.body.model_version,'1.0.0');const sid=created.body.id,state=passingState(id);
   assert.equal((await req('/sessions/'+sid,'PUT',{revision:0,state:passingState(id==='j01'?'j02':'j01')},sc)).status,400);
   assert.equal((await req('/sessions/'+sid,'PUT',{revision:0,state},sc)).status,200);
   assert.deepEqual((await req('/sessions/'+sid,'GET',null,sc)).body.state,state);
   if(id==='h08'){rcId=sid;const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';assert.equal((await req('/sessions/'+sid+'/keyframes','POST',{revision:1,png},sc)).status,201);}
   assert.equal((await req('/sessions/'+sid+'/submit','POST',{},sc)).body.status,'PASS',id);
  }
  const reviewed=await req('/sessions/'+rcId+'/review','POST',{note:'数据完整',grade:92,decision:'APPROVED'},tc);assert.equal(reviewed.body.status,'PASS');assert.equal(reviewed.body.teacherAssessment.grade,92);
  assert.equal((await req('/sessions/'+rcId+'/review','POST',{note:'错误',grade:101},tc)).status,400);
  assert.equal((await req('/sessions/'+rcId+'/review','POST',{note:'无权限'},oc)).status,403);
  const board=(await req('/tasks/'+task+'/submissions','GET',null,tc)).body;assert.equal(board.students[0].sessions[0].late,true);assert.equal(board.students[0].sessions[0].result.teacherAssessment.grade,92);assert.equal((await req('/tasks/'+task+'/submissions','GET',null,sc)).status,403);
  for(const format of ['json','csv','html','pdf']){const r=await fetch(base+'/api/sessions/'+rcId+'/report?format='+format,{headers:{Cookie:sc}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length>100);if(format==='pdf')assert.equal(bytes.subarray(0,8).toString(),'%PDF-1.4');if(format==='html')assert.ok(bytes.toString().includes('数据完整'));if(format==='csv')assert.ok(bytes.toString().includes('仿真时间'));}
  assert.equal((await req('/sessions/'+rcId+'/explain','POST',{external:false},sc)).body.source,'local');assert.equal((await req('/sessions/'+rcId+'/explain','POST',{external:true},sc)).status,400);
  assert.equal((await req('/backups','POST',{},sc)).status,403);const name=(await req('/backups','POST',{},admin)).body.name;const download=await fetch(base+'/api/backups/'+name,{headers:{Cookie:admin}});const backup=join(dir,'download.sqlite');writeFileSync(backup,Buffer.from(await download.arrayBuffer()));const restoredDir=join(dir,'restored');const restore=spawnSync(process.execPath,['tools/restore.mjs',backup,restoredDir,'--server-stopped'],{encoding:'utf8'});assert.equal(restore.status,0,restore.stderr);const restored=new DatabaseSync(join(restoredDir,'physics.sqlite'));assert.equal(restored.prepare('SELECT COUNT(*) n FROM sessions').get().n,28);assert.equal(restored.prepare('SELECT COUNT(*) n FROM keyframes').get().n,1);assert.equal(restored.prepare('SELECT COUNT(*) n FROM auth').get().n,0);restored.close();
  const many=await Promise.all(Array.from({length:50},()=>req('/catalog','GET',null,sc)));assert.ok(many.every(r=>r.status===200&&r.body.length===42));
  assert.equal((await req('/users/1','PATCH',{active:0},admin)).status,409);
  assert.equal((await req('/users/'+other,'PATCH',{active:0},admin)).status,200);assert.equal((await req('/me','GET',null,oc)).status,401);
  assert.equal((await req('/users/'+student+'/password','POST',{password:'new-student-123'},admin)).status,200);assert.equal((await req('/me','GET',null,sc)).status,401);const newsc=(await req('/login','POST',{username:'student',password:'new-student-123'})).cookie;
  assert.equal((await req('/password','POST',{oldPassword:'bad',newPassword:'another-student-123'},newsc)).status,403);assert.equal((await req('/password','POST',{oldPassword:'new-student-123',newPassword:'another-student-123'},newsc)).status,200);assert.equal((await req('/me','GET',null,newsc)).status,401);
 }finally{if(proc.exitCode===null)await new Promise(ok=>{proc.on('exit',ok);proc.kill();});const abs=resolve(dir);assert.equal(dirname(abs),resolve(tmpdir()));assert.ok(basename(abs).startsWith('physics-platform-test-'));rmSync(abs,{recursive:true,force:true});}
});
