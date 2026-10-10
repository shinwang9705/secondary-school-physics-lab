import {validateLaboratory,laboratoryChecks} from '../public/physics/laboratory.js';
import {solveCircuit} from './circuit.mjs';
import {validateMechanics,mechanicsChecks} from './mechanics.mjs';
export function validateState(engine,s,id){
 if(!s||typeof s!=='object'||!Array.isArray(s.records)||s.records.length>300)throw Error('实验状态或记录数量无效');
 if(engine==='laboratory')validateLaboratory(s,id);
 else if(engine==='circuit'){
  validateCircuit(s);
  for(const r of s.records){if(!Number.isFinite(r.U)||!Number.isFinite(r.I)||r.U<0||r.I<0)throw Error('读数无效');if(r.circuit)validateCircuit(r.circuit);}
 }else if(engine==='lens'){
  const valid=r=>Number.isFinite(r.f)&&[10,15,20].includes(r.f)&&Number.isFinite(r.u)&&r.u>=8&&r.u<=75&&Number.isFinite(r.s)&&r.s>=8&&r.s<=90;
  if(!valid(s)||!s.records.every(valid))throw Error('透镜参数超出范围');
 }else if(engine==='reflection'||engine==='mirror'){
  const valid=r=>engine==='reflection'?Number.isFinite(r.angle)&&r.angle>=5&&r.angle<=85:Number.isFinite(r.distance)&&r.distance>=10&&r.distance<=100;
  if(!valid(s)||!s.records.every(valid))throw Error('光学参数超出范围');
 }else if(['spring','lever','buoyancy','motion'].includes(engine))validateMechanics(engine,s);
 else throw Error('实验引擎无效');
}
function validateCircuit(s){
 if(!Array.isArray(s.components)||!Array.isArray(s.wires)||s.components.length>32||s.wires.length>100)throw Error('电路数量超限');
 const ids=new Set(),types=['source','resistor','rheostat','lamp','switch','ammeter','voltmeter'];
 for(const c of s.components){
  if(typeof c.id!=='string'||!/^c[0-9]+$/.test(c.id)||ids.has(c.id)||!types.includes(c.type)||!Number.isFinite(c.x)||!Number.isFinite(c.y))throw Error('元件无效');
  ids.add(c.id);
  if(['source','resistor','rheostat','lamp'].includes(c.type)&&(!Number.isFinite(c.value)||c.value<=0||c.value>(c.type==='source'?6:100)))throw Error('元件参数无效');
 }
 for(const w of s.wires)for(const p of [w.a,w.b])if(!p||!ids.has(p.id)||![0,1].includes(p.port))throw Error('导线端口无效');
}
const near=(a,b,t=.02)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b));
function nodes(s){
 const p=new Map(s.components.flatMap(c=>[0,1].map(i=>[c.id+':'+i,c.id+':'+i])));
 const find=k=>{if(p.get(k)!==k)p.set(k,find(p.get(k)));return p.get(k);};
 const union=(a,b)=>p.set(find(a),find(b));
 for(const w of s.wires)union(w.a.id+':'+w.a.port,w.b.id+':'+w.b.port);
 for(const c of s.components)if(c.type==='switch'&&c.closed)union(c.id+':0',c.id+':1');
 return c=>[find(c.id+':0'),find(c.id+':1')];
}
function topology(s){
 const n=nodes(s),rs=s.components.filter(c=>c.type==='resistor');if(rs.length!==2)return 'other';
 const [a,b]=rs.map(n),parallel=a.every(x=>b.includes(x));if(parallel)return 'parallel';
 const common=a.filter(x=>b.includes(x));if(common.length!==1)return 'other';
 const touching=s.components.filter(c=>!['switch','voltmeter'].includes(c.type)&&n(c).includes(common[0]));
 return touching.length===2?'series':'other';
}
export function judge(exp,s){
 validateState(exp.engine,s,exp.id);
 const checks=[];let modelVersion='0.1.0';const add=(title,pass,detail)=>checks.push({title,pass:!!pass,detail});
 if(exp.engine==='laboratory'){modelVersion='1.0.0';laboratoryChecks(exp.id,s,add);}
 else if(exp.engine==='circuit'){
  const result=solveCircuit(s.components,s.wires);
  add('当前电路可求解且无过流',!result.unsafe,result.error||result.warnings.join('；')||'服务器已根据元件和连接重新求解。');
  add('具有电源及待测元件',s.components.some(c=>c.type==='source')&&s.components.some(c=>c.type==='resistor'),'使用直流稳态模型。');
  const verified=s.records.filter(r=>{if(!r.circuit)return false;const z=solveCircuit(r.circuit.components,r.circuit.wires),v=z.readings.get(r.targetId);return !z.unsafe&&v&&near(r.U,v.U)&&near(r.I,v.I,.001);});
  const need=['j09','j21'].includes(exp.id)?3:exp.id==='j20'?2:1;
  add('有效测量记录',verified.length>=need,'已复算 '+verified.length+' 组，至少需要 '+need+' 组；旧导入记录缺少电路快照时不计入。');
  if(exp.id==='j07')add('电流表参与通电回路',s.components.some(c=>c.type==='ammeter'&&(result.readings.get(c.id)?.I||0)>1e-6),'检查电流表非零示数；完整串联拓扑与接线规范考核将在后续扩展。');
  if(exp.id==='j08'){
   const n=nodes(s);add('电压表并联待测电阻',s.components.some(c=>c.type==='voltmeter'&&(result.readings.get(c.id)?.U||0)>.01&&s.components.some(r=>r.type==='resistor'&&n(r).every(x=>n(c).includes(x)))),'按电路节点判断并联关系，不依赖元件画布布局。');
  }
  if(exp.id==='j09'){
   const groups=new Map();for(const r of verified){const a=groups.get(r.targetId)||[];a.push(r);groups.set(r.targetId,a);}
   add('同一电阻的多次测量', [...groups.values()].some(rs=>rs.length>=3&&rs.every(r=>r.I>1e-6&&near(r.U/r.I,rs[0].U/rs[0].I))&&new Set(rs.map(r=>r.U.toFixed(3))).size>=3),'至少三组不同电压，U/I 基本一致。');
  }
  if(exp.id==='j20'){
   const ts=new Set(verified.map(r=>topology(r.circuit)));
   add('串联与并联两种拓扑',ts.has('series')&&ts.has('parallel'),'使用两个定值电阻，分别搭建串联和并联电路并记录；仪表示数由服务器复算。');
  }
  if(exp.id==='j21'){
   const rs=verified.filter(r=>r.I>1e-6).map(r=>({...r,R:r.U/r.I}));
   const fixedR=rs.some(a=>{const g=rs.filter(b=>b.targetId===a.targetId&&near(b.R,a.R,.002));return new Set(g.map(b=>b.U.toFixed(2))).size>=3;});
   const fixedU=rs.some(a=>{const g=rs.filter(b=>b.targetId===a.targetId&&Math.abs(b.U-a.U)<.02);return new Set(g.map(b=>b.R.toFixed(2))).size>=3;});
   add('保持电阻不变，改变电压',fixedR,'同一待测电阻至少三组不同电压。');
   add('保持电压不变，改变电阻',fixedU,'同一待测元件至少三种阻值，端电压差小于 0.02V。');
  }
 }else if(exp.engine==='lens'){
  const cases=new Set(s.records.map(r=>r.u>2*r.f?'far':r.u===2*r.f?'twice':r.u>r.f?'middle':r.u===r.f?'focus':'virtual'));
  add('五种成像情形',cases.size===5,'已覆盖 '+cases.size+'/5 种。');
  const real=s.records.filter(r=>r.u>r.f),focused=real.filter(r=>Math.abs(r.s-r.f*r.u/(r.u-r.f))<=1);
  add('实像测量对焦',real.length>=3&&focused.length===real.length,'实像记录需在理论像距 ±1cm 内；虚像不在光屏上形成实像。');
  add('观察记录',s.records.length>=5,'服务器按 f/u/s 重算，无须相信客户端理论像距。');
 }else if(['spring','lever','buoyancy','motion'].includes(exp.engine)){
  modelVersion=mechanicsChecks(exp,s,add);
 }else{
  const reflect=exp.engine==='reflection';
  add('至少三组不同条件',new Set(s.records.map(r=>reflect?r.angle:r.distance)).size>=3,'请改变'+(reflect?'入射角':'物距')+'重复测量。');
  add('测量符合规律',s.records.length>=3&&s.records.every(r=>reflect?near(r.measured,r.angle,.01):near(r.measured,r.distance,.01)),reflect?'反射角等于入射角，角度相对法线测量。':'像距等于物距，像为正立等大虚像。');
 }
 const passed=checks.filter(c=>c.pass).length;
 return {status:passed===checks.length?'PASS':'NEEDS_WORK',checks,summary:'通过 '+passed+'/'+checks.length+' 项基础检查。',explanation:'反馈由确定性模型与规则生成。'+(checks.filter(c=>!c.pass).map(c=>c.title+'：'+c.detail).join(' ')||'可以继续改变条件，比较实验现象。'),modelVersion,gradingScope:'教学反馈，不作为完整操作考核成绩；文字结论由教师复核',createdAt:new Date().toISOString()};
}

