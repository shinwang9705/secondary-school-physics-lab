import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
// Offline operation: the caller must stop this instance before restoring.
const args=process.argv.slice(2),source=resolve(args[0]||''),dir=resolve(args[1]||'data');
if(args.length!==3||args[2]!=='--server-stopped')throw Error('用法：node tools/restore.mjs <备份.sqlite> <data目录> --server-stopped；先停止应用');
if(!existsSync(source))throw Error('备份文件不存在');
const check=new DatabaseSync(source,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('数据库完整性检查失败');for(const table of ['users','classes','sessions','events','tasks'])if(!check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('备份缺少表 '+table);}finally{check.close();}
mkdirSync(dir,{recursive:true});const target=resolve(dir,'physics.sqlite');if(source===target)throw Error('备份不能与目标相同');
if(existsSync(target)){const old=new DatabaseSync(target);try{old.exec("VACUUM INTO '"+resolve(dir,'before-restore-'+Date.now()+'.sqlite').replace(/'/g,"''")+"'");}finally{old.close();}}
for(const name of ['physics.sqlite-wal','physics.sqlite-shm']){const file=resolve(dir,name);if(dirname(file)!==dir)throw Error('恢复路径越界');if(existsSync(file))unlinkSync(file);}
copyFileSync(source,target);const restored=new DatabaseSync(target);try{restored.exec('DELETE FROM auth');if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('恢复校验失败');}finally{restored.close();}
console.log('恢复完成。旧数据保存在 before-restore 文件；会话已撤销，请重新启动并登录。');
