import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readdirSync,statSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {experiment} from './catalog.mjs';
import {reportData,reportCSV,reportHTML,reportPDF} from './reports.mjs';
export function migrate(db){
 const add=(table,name,definition)=>{if(!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition);};
 add('users','active','INTEGER NOT NULL DEFAULT 1');add('tasks','due_at','TEXT');add('tasks','description',"TEXT DEFAULT ''");add('sessions','task_id','INTEGER REFERENCES tasks(id)');
 for(const field of ['model_version','asset_version','rule_version'])add('sessions',field,'TEXT');add('sessions','submitted_at','TEXT');
 db.exec('CREATE TABLE IF NOT EXISTS class_teachers(class_id INTEGER REFERENCES classes(id),teacher_id INTEGER REFERENCES users(id),PRIMARY KEY(class_id,teacher_id)); CREATE TABLE IF NOT EXISTS keyframes(id INTEGER PRIMARY KEY,session_id INTEGER REFERENCES sessions(id),revision INTEGER,png BLOB,created_at TEXT DEFAULT CURRENT_TIMESTAMP);');
 db.exec('INSERT OR IGNORE INTO class_teachers SELECT id,teacher_id FROM classes WHERE teacher_id IS NOT NULL');
 for(const row of db.prepare('SELECT id,experiment_id FROM sessions WHERE model_version IS NULL').all()){const version=experiment(row.experiment_id)?.version||'unknown';db.prepare('UPDATE sessions SET model_version=?,asset_version=?,rule_version=? WHERE id=?').run(version,version,version,row.id);}
}
export function platformRoutes(ctx){
 const {db,data,query,all,run,fail,audit,password,publicUser,sessionAccess,serialize}=ctx;
 const teach=(u,classId)=>u.role==='ADMIN'||!!query('SELECT 1 FROM class_teachers WHERE class_id=? AND teacher_id=?',classId,u.id);
 const backupDir=resolve(data,'backups');mkdirSync(backupDir,{recursive:true});
 const checkPassword=(u,value)=>typeof value==='string'&&timingSafeEqual(scryptSync(value.slice(0,128),u.salt,64),Buffer.from(u.hash,'hex'));
 function setPassword(id,value){password(value);const salt=randomBytes(16).toString('hex');run('UPDATE users SET salt=?,hash=? WHERE id=?',salt,scryptSync(value,salt,64).toString('hex'),id);run('DELETE FROM auth WHERE user_id=?',id);}
 function backup(){const name='physics-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex')+'.sqlite',path=resolve(backupDir,name);db.exec("VACUUM INTO '"+path.replace(/'/g,"''")+"'");return name;}
 if(process.env.BACKUP_INTERVAL_HOURS){const hours=Number(process.env.BACKUP_INTERVAL_HOURS);if(Number.isFinite(hours)&&hours>=1){setInterval(()=>{try{backup();}catch(e){console.error('备份失败',e.message);}},hours*3600000).unref();}}
 return async({path,req,res,body,u,reply,url})=>{
  const bytes=(type,buffer,filename,attachment=true)=>{res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':(attachment?'attachment':'inline')+'; filename="'+filename+'"'});res.end(buffer);};
  if(path==='/api/password'&&req.method==='POST'){if(!checkPassword(u,body.oldPassword))fail(403,'当前密码不正确');setPassword(u.id,body.newPassword);audit(u,'CHANGE_PASSWORD');reply(200,{ok:true,relogin:true});return true;}
  const account=path.match(/^\/api\/users\/(\d+)(?:\/(password))?$/);
  if(account){if(u.role!=='ADMIN')fail(403,'仅管理员可以管理账号');const id=+account[1],old=query('SELECT * FROM users WHERE id=?',id);if(!old)fail(404,'账号不存在');
   if(account[2]&&req.method==='POST'){setPassword(id,body.password);audit(u,'RESET_PASSWORD',id);reply(200,{ok:true});return true;}
   if(!account[2]&&req.method==='PATCH'){const role=body.role??old.role,active=body.active??old.active,name=String(body.displayName??old.display_name).trim(),classId=body.classId===undefined?old.class_id:body.classId;
    if(!['ADMIN','TEACHER','STUDENT'].includes(role)||![0,1].includes(active)||!name||name.length>40)fail(400,'账号信息无效');if(classId&&!query('SELECT id FROM classes WHERE id=?',classId))fail(400,'班级不存在');
    if(old.role==='ADMIN'&&old.active&&(role!=='ADMIN'||!active)&&query("SELECT COUNT(*) n FROM users WHERE role='ADMIN' AND active=1").n<=1)fail(409,'必须保留一个启用的管理员');
    if(old.role==='TEACHER'&&role!=='TEACHER'&&query('SELECT 1 FROM class_teachers WHERE teacher_id=?',id))fail(409,'请先调整此教师的带班关系');
    run('UPDATE users SET display_name=?,role=?,class_id=?,active=? WHERE id=?',name,role,classId||null,active,id);if(role!==old.role||classId!==old.class_id||!active)run('DELETE FROM auth WHERE user_id=?',id);audit(u,'UPDATE_USER',id);reply(200,{ok:true});return true;}
  }
  const cls=path.match(/^\/api\/classes\/(\d+)$/);
  if(cls&&req.method==='PATCH'){if(u.role!=='ADMIN')fail(403,'仅管理员可以管理班级');const id=+cls[1];if(!query('SELECT id FROM classes WHERE id=?',id))fail(404,'班级不存在');const name=String(body.name||'').trim(),teachers=body.teacherIds;
   if(!name||name.length>40||!Array.isArray(teachers)||teachers.length>20||!teachers.every(t=>Number.isInteger(t)&&query("SELECT id FROM users WHERE id=? AND role='TEACHER' AND active=1",t)))fail(400,'班级信息无效');
   db.exec('BEGIN');try{run('UPDATE classes SET name=?,teacher_id=? WHERE id=?',name,teachers[0]||null,id);run('DELETE FROM class_teachers WHERE class_id=?',id);for(const t of new Set(teachers))run('INSERT INTO class_teachers VALUES(?,?)',id,t);audit(u,'UPDATE_CLASS',id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');if(String(e.message).includes('UNIQUE'))fail(409,'班级名已存在');throw e;}reply(200,{ok:true});return true;
  }
  const task=path.match(/^\/api\/tasks\/(\d+)\/submissions$/);
  if(task&&req.method==='GET'){const t=query('SELECT * FROM tasks WHERE id=?',+task[1]);if(!t)fail(404,'任务不存在');if(!['ADMIN','TEACHER'].includes(u.role)||!teach(u,t.class_id))fail(403,'无权查看班级统计');
   const students=all("SELECT id,display_name FROM users WHERE class_id=? AND role='STUDENT'",t.class_id);const sessions=all('SELECT id,user_id,status,result,submitted_at,updated_at FROM sessions WHERE task_id=? ORDER BY id DESC',t.id).map(s=>({...s,result:s.result?JSON.parse(s.result):null,late:!!(s.submitted_at&&t.due_at&&s.submitted_at>t.due_at)}));reply(200,{task:t,students:students.map(s=>({...s,sessions:sessions.filter(r=>r.user_id===s.id)}))});return true;
  }
  if(path==='/api/backups'){if(u.role!=='ADMIN')fail(403,'仅管理员可备份');if(req.method==='POST'){const name=backup();audit(u,'BACKUP',name);reply(201,{name});return true;}if(req.method==='GET'){reply(200,readdirSync(backupDir).filter(n=>/^physics-[\w-]+\.sqlite$/.test(n)).sort().reverse().map(name=>({name,bytes:statSync(resolve(backupDir,name)).size})));return true;}}
  const b=path.match(/^\/api\/backups\/(physics-[\w-]+\.sqlite)$/);if(b&&req.method==='GET'){if(u.role!=='ADMIN')fail(403,'仅管理员可下载备份');if(!readdirSync(backupDir).includes(b[1]))fail(404,'备份不存在');audit(u,'DOWNLOAD_BACKUP',b[1]);bytes('application/octet-stream',readFileSync(resolve(backupDir,b[1])),b[1]);return true;}
  const session=path.match(/^\/api\/sessions\/(\d+)\/(report|keyframes|explain)(?:\/(\d+))?$/);
  if(session){const id=+session[1],action=session[2],s=sessionAccess(u,id,req.method==='POST'&&action==='keyframes');
   if(action==='report'&&req.method==='GET'){const format=url.searchParams.get('format')||'json',report=reportData(serialize(s),experiment(s.experiment_id),query('SELECT display_name FROM users WHERE id=?',s.user_id).display_name,all('SELECT id,revision,created_at FROM keyframes WHERE session_id=?',id));
    if(format==='csv')bytes('text/csv; charset=utf-8',reportCSV(report),'physics-'+id+'.csv');else if(format==='html')bytes('text/html; charset=utf-8',reportHTML(report),'physics-'+id+'.html',false);else if(format==='pdf')bytes('application/pdf',reportPDF(report),'physics-'+id+'.pdf');else if(format==='json')bytes('application/json; charset=utf-8',JSON.stringify(report,null,2),'physics-'+id+'.json');else fail(400,'报告格式无效');return true;
   }
   if(action==='keyframes'){
    if(req.method==='GET'&&session[3]){const k=query('SELECT png FROM keyframes WHERE id=? AND session_id=?',+session[3],id);if(!k)fail(404,'关键帧不存在');bytes('image/png',k.png,'frame-'+session[3]+'.png',false);return true;}
    if(req.method==='GET'){reply(200,all('SELECT id,revision,created_at FROM keyframes WHERE session_id=? ORDER BY id',id));return true;}
    if(req.method==='POST'){if(s.status!=='DRAFT'||body.revision!==s.revision||!s.state)fail(409,'请先保存当前草稿再截取');if(query('SELECT COUNT(*) n FROM keyframes WHERE session_id=?',id).n>=20)fail(400,'每个实例最多 20 张关键帧');if(typeof body.png!=='string'||body.png.length>1400000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.png))fail(400,'图像无效');const png=Buffer.from(body.png.split(',')[1],'base64');if(png.length>1000000||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.length<24||png.readUInt32BE(16)>2000||png.readUInt32BE(20)>2000)fail(400,'PNG 尺寸或格式无效');const frame=Number(run('INSERT INTO keyframes(session_id,revision,png) VALUES(?,?,?)',id,s.revision,png).lastInsertRowid);audit(u,'KEYFRAME',frame);reply(201,{id:frame});return true;}
   }
   if(action==='explain'&&req.method==='POST'){if(!s.result)fail(400,'请先提交实验');const result=JSON.parse(s.result);let explanation=result.explanation,source='local';
    if(body.external===true){if(!process.env.AI_GATEWAY_URL)fail(400,'尚未配置外部教学解释服务');const destination=new URL(process.env.AI_GATEWAY_URL);if(destination.protocol!=='https:'&&!(destination.protocol==='http:'&&['127.0.0.1','localhost'].includes(destination.hostname)))fail(400,'外部教学服务必须使用 HTTPS');
     const response=await fetch(destination,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.AI_GATEWAY_KEY?{Authorization:'Bearer '+process.env.AI_GATEWAY_KEY}:{})},body:JSON.stringify({model:process.env.AI_MODEL||'default',input:{experiment:experiment(s.experiment_id).title,checks:result.checks,scope:result.gradingScope}}),signal:AbortSignal.timeout(20000)});if(!response.ok)fail(502,'外部教学解释服务失败');const output=await response.text();if(output.length>20000)fail(502,'解释结果过长');let parsed;try{parsed=JSON.parse(output);}catch{fail(502,'解释格式无效');}if(typeof parsed.text!=='string'||!parsed.text.trim()||parsed.text.length>10000)fail(502,'解释内容无效');explanation=parsed.text;source='external';audit(u,'AI_EXPLAIN',id);
    }reply(200,{explanation,source,changesGrade:false});return true;
   }
  }
  if(path==='/api/config'&&req.method==='GET'){reply(200,{externalAI:!!process.env.AI_GATEWAY_URL,backupIntervalHours:Number(process.env.BACKUP_INTERVAL_HOURS)||null});return true;}
  if(path==='/api/audit'&&req.method==='GET'){if(u.role!=='ADMIN')fail(403,'仅管理员可查审计');reply(200,all('SELECT a.*,u.display_name FROM audit a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.id DESC LIMIT 500'));return true;}
  return false;
 };
}
