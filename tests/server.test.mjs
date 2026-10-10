import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
test('API：初始化、账号与班级隔离、保存恢复、修订冲突、幂等提交与审计',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'physics-lab-test-'));
 const proc=spawn(process.execPath,['server.mjs'],{cwd:resolve('.'),env:{...process.env,DATA_DIR:dir,PORT:'0'},stdio:['ignore','pipe','pipe']});
 let base;try{
  base=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('服务器启动超时')),15000);proc.stdout.on('data',c=>{const m=String(c).match(/http:\/\/[^\s]+/);if(m){clearTimeout(timeout);resolve(m[0]);}});proc.on('exit',code=>{clearTimeout(timeout);reject(Error('服务器提前退出 '+code));});});
  async function req(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  assert.equal((await req('/api/health')).status,200);
  const html=await fetch(base+'/');assert.equal(html.status,200);assert.ok((await html.text()).includes('物理实验室'));
  assert.equal((await req('/api/setup','POST',{username:'admin',password:'test-admin-123',displayName:'测试管理员'})).status,201);
  assert.equal((await req('/api/setup','POST',{username:'again',password:'test-admin-123'})).status,409);
  const admin=(await req('/api/login','POST',{username:'admin',password:'test-admin-123'})).cookie;
  const teacherId=(await req('/api/users','POST',{username:'teacher',password:'test-teacher-123',role:'TEACHER'},admin)).body.id;
  const classId=(await req('/api/classes','POST',{name:'测试班',teacherId},admin)).body.id;
  for(const username of ['student_a','student_b'])assert.equal((await req('/api/users','POST',{username,password:'test-student-123',role:'STUDENT',classId},admin)).status,201);
  const teacher=(await req('/api/login','POST',{username:'teacher',password:'test-teacher-123'})).cookie;
  const a=(await req('/api/login','POST',{username:'student_a',password:'test-student-123'})).cookie;
  const b=(await req('/api/login','POST',{username:'student_b',password:'test-student-123'})).cookie;
  assert.equal((await req('/api/catalog')).status,401);
  assert.equal((await req('/api/users','GET',null,a)).status,403);
  const create=await req('/api/sessions','POST',{experimentId:'j17'},a),id=create.body.id;
  assert.equal(create.status,201);
  assert.equal((await req('/api/sessions/'+id,'GET',null,b)).status,403);
  assert.equal((await req('/api/sessions/'+id,'GET',null,teacher)).status,200);
  const state={f:15,u:45,s:22.5,records:[{f:15,u:45,s:22.5},{f:15,u:30,s:30},{f:15,u:20,s:60},{f:15,u:15,s:40},{f:15,u:10,s:40}]};
  assert.equal((await req('/api/sessions/'+id,'PUT',{revision:0,state},teacher)).status,403);
  assert.equal((await req('/api/sessions/'+id,'PUT',{revision:0,state},a)).body.revision,1);
  assert.equal((await req('/api/sessions/'+id,'PUT',{revision:0,state},a)).status,409);
  assert.deepEqual((await req('/api/sessions/'+id,'GET',null,a)).body.state,state);
  const result=(await req('/api/sessions/'+id+'/submit','POST',{},a)).body;
  assert.equal(result.status,'PASS');
  assert.deepEqual((await req('/api/sessions/'+id+'/submit','POST',{},a)).body,result);
  assert.equal((await req('/api/sessions/'+id,'PUT',{revision:1,state},a)).status,409);
  assert.equal((await req('/api/sessions/'+id+'/events','GET',null,a)).body.length,1);
  assert.equal((await req('/api/sessions/'+id+'/review','POST',{note:'已核查'},teacher)).body.review.note,'已核查');
  const secondReview=(await req('/api/sessions/'+id+'/review','POST',{note:'补充复核'},teacher)).body;
  assert.deepEqual(secondReview.reviews.map(r=>r.note),['已核查','补充复核']);
  assert.deepEqual((await req('/api/sessions/'+id,'GET',null,a)).body.result.reviews,secondReview.reviews);
  assert.equal((await req('/api/sessions/'+id+'/review','POST',{note:'无权复核'},b)).status,403);
  const motionId=(await req('/api/sessions','POST',{experimentId:'h04'},a)).body.id;
  const motionState={params:{mass:1,force:1,initialVelocity:1},ticks:100,records:[]};
  assert.equal((await req('/api/sessions/'+motionId,'PUT',{revision:0,state:{...motionState,ticks:501}},a)).status,400);
  assert.equal((await req('/api/sessions/'+motionId,'PUT',{revision:0,state:motionState},a)).status,200);
  assert.deepEqual((await req('/api/sessions/'+motionId,'GET',null,a)).body.state,motionState);
  assert.equal((await req('/api/sessions/'+motionId+'/submit','POST',{},a)).body.modelVersion,'0.2.0');
  assert.equal((await req('/api/sessions/'+motionId,'PUT',{revision:1,state:motionState},a)).status,409);
  assert.equal((await req('/api/tasks','POST',{classId,experimentId:'j17',title:'透镜实验'},teacher)).status,201);
  assert.equal((await req('/api/tasks','GET',null,a)).body.length,1);
  assert.equal((await req('/api/sessions','POST',{experimentId:'unknown'},a)).status,400);
  const csrf=await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json',Cookie:a,Origin:'https://example.org'},body:JSON.stringify({experimentId:'j17'})});assert.equal(csrf.status,403);
  await req('/api/logout','POST',{},a);assert.equal((await req('/api/me','GET',null,a)).status,401);
 }finally{if(proc.exitCode===null)await new Promise(resolve=>{proc.on('exit',resolve);proc.kill();});const abs=resolve(dir);assert.equal(dirname(abs),resolve(tmpdir()));assert.ok(basename(abs).startsWith('physics-lab-test-'));rmSync(abs,{recursive:true,force:true});}
});

