import {migrate,platformRoutes} from './core/platform.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalog,experiment} from './core/catalog.mjs';
import {validateState,judge} from './core/judge.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const root=dirname(fileURLToPath(import.meta.url)),data=resolve(process.env.DATA_DIR||resolve(root,'data'));
mkdirSync(data,{recursive:true});
const db=new DatabaseSync(resolve(data,'physics.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,teacher_id INTEGER);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL,class_id INTEGER REFERENCES classes(id),salt TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),experiment_id TEXT NOT NULL,mode TEXT NOT NULL,state TEXT,revision INTEGER DEFAULT 0,result TEXT,status TEXT DEFAULT 'DRAFT',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,session_id INTEGER REFERENCES sessions(id),revision INTEGER,type TEXT,payload TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(session_id,revision));
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,class_id INTEGER REFERENCES classes(id),teacher_id INTEGER REFERENCES users(id),experiment_id TEXT,title TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,resource TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
migrate(db);
const query=(sql,...p)=>db.prepare(sql).get(...p),all=(sql,...p)=>db.prepare(sql).all(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
const publicUser=u=>({id:u.id,username:u.username,displayName:u.display_name,role:u.role,classId:u.class_id,active:u.active});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const audit=(u,action,resource='')=>run('INSERT INTO audit(user_id,action,resource) VALUES(?,?,?)',u?.id||null,action,String(resource));
function password(p){if(typeof p!=='string'||p.length<10||p.length>128)fail(400,'密码需要 10—128 个字符');}
function makeUser(b){
 if(typeof b.username!=='string'||! /^[a-zA-Z0-9_-]{3,32}$/.test(b.username))fail(400,'用户名需要 3—32 位字母、数字、横线或下划线');
 password(b.password);if(!['ADMIN','TEACHER','STUDENT'].includes(b.role))fail(400,'角色无效');
 const name=String(b.displayName||b.username).trim().slice(0,40),salt=randomBytes(16).toString('hex'),hash=scryptSync(b.password,salt,64).toString('hex');
 if(b.classId&&!query('SELECT id FROM classes WHERE id=?',b.classId))fail(400,'班级不存在');
 try{return Number(run('INSERT INTO users(username,display_name,role,class_id,salt,hash) VALUES(?,?,?,?,?,?)',b.username,name,b.role,b.classId||null,salt,hash).lastInsertRowid);}catch{fail(409,'用户名已存在');}
}
function sessionAccess(u,id,write=false){
 const s=query('SELECT * FROM sessions WHERE id=?',Number(id));if(!s)fail(404,'记录不存在');
 const owner=query('SELECT * FROM users WHERE id=?',s.user_id);
 const allow=s.user_id===u.id||!write&&(u.role==='ADMIN'||u.role==='TEACHER'&&owner.class_id&&query('SELECT class_id FROM class_teachers WHERE class_id=? AND teacher_id=?',owner.class_id,u.id));
 if(!allow){audit(u,'ACCESS_DENIED',id);fail(403,'无权访问此实验记录');}return s;
}
const serialize=s=>({...s,state:s.state?JSON.parse(s.state):null,result:s.result?JSON.parse(s.result):null});
const extraRoutes=platformRoutes({db,data,query,all,run,fail,audit,password,publicUser,sessionAccess,serialize});
let attempts=new Map();
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){
   const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)fail(403,'请求来源无效');
  }
  let body={};
  if(['POST','PUT','PATCH'].includes(req.method)){
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2_000_000)fail(413,'请求超过 2MB');chunks.push(chunk);}
   try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'请求格式无效');}
   if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'请求内容必须为对象');
  }
  const path=url.pathname;
  if(path==='/api/health')return reply(200,{ok:true,version:'1.0.0'});
  if(path==='/api/bootstrap'&&req.method==='GET')return reply(200,{needsSetup:!query('SELECT id FROM users LIMIT 1')});
  if(path==='/api/setup'&&req.method==='POST'){
   if(query('SELECT id FROM users LIMIT 1'))fail(409,'初始化已完成');
   const id=makeUser({...body,role:'ADMIN'});audit({id},'SETUP');return reply(201,{ok:true});
  }
  if(path==='/api/login'&&req.method==='POST'){
   const key=req.socket.remoteAddress,now=Date.now(),a=attempts.get(key)||{n:0,until:now+60000};if(now>a.until){a.n=0;a.until=now+60000;}if(++a.n>15)fail(429,'登录尝试过多，请稍后重试');attempts.set(key,a);
   const u=query('SELECT * FROM users WHERE username=?',String(body.username||''));
   const h=scryptSync(String(body.password||'').slice(0,128),u?.salt||'dummy',64);
   if(!u||!u.active||!timingSafeEqual(h,Buffer.from(u.hash,'hex')))fail(401,'用户名或密码错误');
   const token=randomBytes(32).toString('hex');run('DELETE FROM auth WHERE expires<?',now);run('INSERT INTO auth VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),u.id,now+8*3600000);
   res.setHeader('Set-Cookie','lab_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(process.env.COOKIE_SECURE==='1'?'; Secure':''));audit(u,'LOGIN');return reply(200,publicUser(u));
  }
  if(path.startsWith('/api/')){
   const token=(req.headers.cookie||'').match(/(?:^|;\s*)lab_session=([a-f0-9]{64})(?:;|$)/)?.[1];
   const auth=token&&query('SELECT * FROM auth WHERE token=? AND expires>?',createHash('sha256').update(token).digest('hex'),Date.now());
   if(!auth)fail(401,'请先登录');
   const u=query('SELECT * FROM users WHERE id=?',auth.user_id);if(!u?.active)fail(401,'账号已停用');
   if(await extraRoutes({path,req,res,body,u,reply,url}))return;
   if(path==='/api/me')return reply(200,publicUser(u));
   if(path==='/api/logout'&&req.method==='POST'){run('DELETE FROM auth WHERE token=?',auth.token);res.setHeader('Set-Cookie','lab_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply(200,{ok:true});}
   if(path==='/api/catalog')return reply(200,catalog);
   if(path==='/api/classes'){
    if(req.method==='GET'){const rows=u.role==='ADMIN'?all('SELECT * FROM classes'):u.role==='TEACHER'?all('SELECT * FROM classes WHERE id IN (SELECT class_id FROM class_teachers WHERE teacher_id=?)',u.id):all('SELECT * FROM classes WHERE id=?',u.class_id||-1);return reply(200,rows.map(c=>({...c,teacherIds:all('SELECT teacher_id FROM class_teachers WHERE class_id=?',c.id).map(t=>t.teacher_id)})));}
    if(req.method==='POST'){
     if(u.role!=='ADMIN')fail(403,'仅管理员可以管理班级');
     const name=String(body.name||'').trim();if(!name||name.length>40)fail(400,'班级名称无效');
     if(body.teacherId&&!query("SELECT id FROM users WHERE id=? AND role='TEACHER'",Number(body.teacherId)))fail(400,'教师不存在');
     let id;try{id=Number(run('INSERT INTO classes(name,teacher_id) VALUES(?,?)',name,body.teacherId||null).lastInsertRowid);}catch{fail(409,'班级已存在');}if(body.teacherId)run('INSERT INTO class_teachers VALUES(?,?)',id,Number(body.teacherId));audit(u,'CREATE_CLASS',id);return reply(201,{id});
    }
   }
   if(path==='/api/users'){
    if(u.role!=='ADMIN'){audit(u,'ACCESS_DENIED','users');fail(403,'仅管理员可以管理账号');}
    if(req.method==='GET')return reply(200,all('SELECT id,username,display_name,role,class_id,active FROM users'));
    if(req.method==='POST'){const id=makeUser(body);audit(u,'CREATE_USER',id);return reply(201,{id});}
   }
   if(path==='/api/tasks'){
    if(req.method==='GET')return reply(200,u.role==='ADMIN'?all('SELECT * FROM tasks ORDER BY id DESC'):u.role==='TEACHER'?all('SELECT * FROM tasks WHERE class_id IN (SELECT class_id FROM class_teachers WHERE teacher_id=?) ORDER BY id DESC',u.id):all('SELECT * FROM tasks WHERE class_id=? ORDER BY id DESC',u.class_id||-1));
    if(req.method==='POST'){
     if(!['ADMIN','TEACHER'].includes(u.role))fail(403,'仅教师可布置实验');
     if(!query('SELECT id FROM classes WHERE id=?',Number(body.classId))||(u.role==='TEACHER'&&!query('SELECT 1 FROM class_teachers WHERE class_id=? AND teacher_id=?',Number(body.classId),u.id)))fail(403,'无权布置此班级');
     if(experiment(body.experimentId)?.status!=='ready')fail(400,'实验尚未开放');
     let due=null;if(body.dueAt){if(!Number.isFinite(Date.parse(body.dueAt)))fail(400,'截止时间无效');due=new Date(body.dueAt).toISOString();}const id=Number(run('INSERT INTO tasks(class_id,teacher_id,experiment_id,title,due_at,description) VALUES(?,?,?,?,?,?)',Number(body.classId),u.id,body.experimentId,String(body.title||'实验任务').slice(0,80),due,String(body.description||'').slice(0,2000)).lastInsertRowid);audit(u,'ASSIGN_TASK',id);return reply(201,{id});
    }
   }
   if(path==='/api/sessions'){
    if(req.method==='GET'){
     const rows=u.role==='ADMIN'?all('SELECT s.*,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 200'):u.role==='TEACHER'?all('SELECT s.*,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.user_id=? OR u.class_id IN (SELECT class_id FROM class_teachers WHERE teacher_id=?) ORDER BY s.id DESC LIMIT 200',u.id,u.id):all('SELECT s.*,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 200',u.id);
     return reply(200,rows.map(({state,...s})=>serialize({...s,state:null})));
    }
    if(req.method==='POST'){
     if(experiment(body.experimentId)?.status!=='ready')fail(400,'实验尚未开放');
     const mode=['guided','explore'].includes(body.mode)?body.mode:'guided';
     const exp=experiment(body.experimentId);let taskId=null;if(body.taskId){const task=query('SELECT * FROM tasks WHERE id=?',Number(body.taskId));if(!task||task.experiment_id!==exp.id||u.role!=='STUDENT'||task.class_id!==u.class_id)fail(403,'任务或班级不匹配');taskId=task.id;}const id=Number(run('INSERT INTO sessions(user_id,experiment_id,mode,task_id,model_version,asset_version,rule_version) VALUES(?,?,?,?,?,?,?)',u.id,exp.id,mode,taskId,exp.version,exp.version,exp.version).lastInsertRowid);return reply(201,serialize(sessionAccess(u,id)));
    }
   }
   const match=path.match(/^\/api\/sessions\/(\d+)(?:\/(events|submit|review))?$/);
   if(match){
    const id=Number(match[1]),action=match[2];
    if(req.method==='GET'&&!action){const s=sessionAccess(u,id);return reply(200,serialize({...s,display_name:query('SELECT display_name FROM users WHERE id=?',s.user_id).display_name}));}
    if(req.method==='GET'&&action==='events'){sessionAccess(u,id);return reply(200,all('SELECT revision,type,payload,created_at FROM events WHERE session_id=? ORDER BY revision',id).map(e=>({...e,payload:JSON.parse(e.payload)})));}
    if(req.method==='PUT'&&!action){
     const s=sessionAccess(u,id,true);if(s.status!=='DRAFT')fail(409,'已提交记录不可修改，请新建实验');
     if(body.revision!==s.revision)fail(409,'记录已更新，请重新载入');
     if(s.model_version!==experiment(s.experiment_id).version||s.rule_version!==experiment(s.experiment_id).version||s.asset_version!==experiment(s.experiment_id).version)fail(409,'此实例版本不受当前程序支持，请保留导出并新建实例');
     try{if(body.state?.modelVersion&&body.state.modelVersion!==s.model_version)throw Error('模型版本不匹配');validateState(experiment(s.experiment_id).engine,body.state,s.experiment_id);}catch(e){fail(400,e.message);}
     const type=['STATE','UNDO','REDO','RESET'].includes(body.type)?body.type:'STATE';
     db.exec('BEGIN');try{run('UPDATE sessions SET state=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',JSON.stringify(body.state),id);run('INSERT INTO events(session_id,revision,type,payload) VALUES(?,?,?,?)',id,s.revision+1,type,JSON.stringify(body.state));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
     return reply(200,{revision:s.revision+1});
    }
    if(req.method==='POST'&&action==='submit'){
     const s=sessionAccess(u,id,true);if(s.result)return reply(200,JSON.parse(s.result));if(!s.state)fail(400,'请先保存操作记录');
     if(s.model_version!==experiment(s.experiment_id).version||s.rule_version!==experiment(s.experiment_id).version||s.asset_version!==experiment(s.experiment_id).version)fail(409,'实例版本不受支持');const result=judge(experiment(s.experiment_id),JSON.parse(s.state));run("UPDATE sessions SET status='SUBMITTED',result=?,submitted_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",JSON.stringify(result),new Date().toISOString(),id);audit(u,'SUBMIT',id);return reply(200,result);
    }
    if(req.method==='POST'&&action==='review'){
     const s=sessionAccess(u,id);if(!['TEACHER','ADMIN'].includes(u.role)||!s.result)fail(403,'无权复核此记录');
     const note=String(body.note||'').trim().slice(0,1000);if(!note)fail(400,'请填写复核意见');
     const previous=JSON.parse(s.result),reviews=previous.reviews|| (previous.review?[previous.review]:[]);
     let grade=null;if(body.grade!==undefined&&body.grade!==null&&body.grade!==''){grade=Number(body.grade);if(!Number.isFinite(grade)||grade<0||grade>100)fail(400,'评分必须为 0—100');}const decision=body.decision||'COMMENT';if(!['COMMENT','APPROVED','REVISE'].includes(decision))fail(400,'复核结论无效');const review={by:u.display_name,userId:u.id,note,grade,decision,at:new Date().toISOString()};
     const result={...previous,review,reviews:[...reviews,review],teacherAssessment:decision==='COMMENT'&&grade===null?previous.teacherAssessment:{grade,decision,by:u.display_name,at:review.at}};
     db.exec('BEGIN');try{run('UPDATE sessions SET result=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',JSON.stringify(result),id);audit(u,'REVIEW',id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
     return reply(200,result);
    }
   }
   fail(404,'接口不存在');
  }
  if(!['GET','HEAD'].includes(req.method))fail(405,'方法不支持');
  const rel=decodeURIComponent(path==='/'?'/index.html':path),file=resolve(root,'public','.'+rel);
  if(!file.startsWith(resolve(root,'public')+ '/'.replace('/',process.platform==='win32'?'\\':'/'))||!existsSync(file))fail(404,'页面不存在');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:readFileSync(file));
 }catch(e){reply(e.status||500,{error:e.status?e.message:'服务暂时不可用'});if(!e.status)console.error(e);}
});
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log('Physics Lab: http://'+host+':'+server.address().port));

