import {solveMechanics,measurementFor,MODEL_VERSION} from '../public/physics/mechanics.js';
export {validateMechanics} from '../public/physics/mechanics.js';

const equal=(a,b)=>Math.abs(a-b)<1e-8;
const distinct=values=>new Set(values.map(x=>x.toFixed(6))).size;
function varies(rows, variable, constants, minimum=3){
 return rows.some(anchor=>distinct(rows.filter(row=>constants.every(key=>equal(row.params[key],anchor.params[key]))).map(row=>row.params[variable]))>=minimum);
}
export function mechanicsChecks(exp,state,add){
 const rows=state.records;
 const verified=rows.filter(row=>Math.abs(row.measured-measurementFor(exp.id,row.params,row.ticks))<=Math.max(0.02,Math.abs(measurementFor(exp.id,row.params,row.ticks))*0.02));
 add('测量与模型复算一致',rows.length>=3&&verified.length===rows.length,'至少三组记录；根据每组条件重新计算。允许 2% 或 0.02 单位的读数误差，取较大值。');
 if(exp.engine==='spring'){
  add('在线性区间内使用弹簧',rows.length>0&&rows.every(row=>!solveMechanics('spring',row.params).overloaded),'伸长量不得超过 25 cm。');
  add('消除零点偏差',equal(state.params.zero,0)&&rows.length>0&&rows.every(row=>equal(row.params.zero,0)),'请先卸载检查零点，再调零；有零点偏差的记录需删除后重新测量。');
  if(exp.id==='j06')add('多种挂载力',distinct(rows.map(row=>row.params.force))>=3,'至少三种不同挂载力，包括可选的无载荷检查。');
  else {
   add('保持同一弹簧，改变挂载力',varies(rows,'force',['stiffness','zero']),'同一劲度系数下至少三种不同挂载力。');
   add('同一弹簧包含无载荷基准',rows.some(zero=>equal(zero.params.force,0)&&distinct(rows.filter(row=>equal(row.params.stiffness,zero.params.stiffness)).map(row=>row.params.force))>=3),'无载荷伸长量应为零，与该弹簧的加载数据一起记录。');
  }
 }else if(exp.engine==='lever'){
  add('记录时杠杆平衡',rows.length>=3&&rows.every(row=>solveMechanics('lever',row.params).balanced),'两侧 F×l 的差不超过 0.002 N·m；倾斜状态的记录需重测。');
  add('三种平衡条件，包含不等力臂',new Set(rows.map(row=>JSON.stringify(['force1','arm1','force2','arm2'].map(k=>row.params[k])))).size>=3&&rows.some(row=>!equal(row.params.arm1,row.params.arm2)),'至少三种不同条件，且包含一组不等力臂，避免只重复验证等力臂时两侧力相等。');
 }else if(exp.engine==='buoyancy'){
  add('保持液体密度与物体体积，改变浸入比例',varies(rows,'immersion',['density','volume']),'至少三种排开体积，用 G−T 比较浮力。');
  add('保持排开体积，改变液体密度',varies(rows.filter(row=>row.params.immersion>0),'density',['volume','immersion']),'至少三种液体密度；物体体积和浸入比例必须相同且不为零。');
 }else if(exp.engine==='motion'){
  add('具有足够的运动测量时间',rows.length>0&&rows.every(row=>row.ticks>=25),'每组至少运动 0.5 s；时间由整数步数×0.02 s 得到。');
  if(exp.id==='j05'){
   add('保持匀速运动',equal(state.params.force,0)&&rows.every(row=>equal(row.params.force,0)),'本实验按理想匀速运动计算 s/t。');
   add('至少三种速度',distinct(rows.map(row=>row.params.initialVelocity))>=3,'改变初速度，重复测量平均速度。');
  }else {
   const positive=rows.filter(row=>row.params.force>0);
   add('保持质量不变，改变合力',varies(positive,'force',['mass','initialVelocity']),'同一质量与初速度下至少三种非零合力。');
   add('保持合力不变，改变质量',varies(positive,'mass',['force','initialVelocity']),'同一非零合力与初速度下至少三种质量。');
  }
 }
 return MODEL_VERSION;
}
