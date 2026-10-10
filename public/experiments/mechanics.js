import {DT,MAX_TICKS,defaults,solveMechanics,validateMechanics} from '/physics/mechanics.js';

const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search), id=query.get('experiment')||'j06';
const specs={
 j05:{engine:'motion',title:'测量物体运动的速度',intro:'选择小车速度，开始运动，暂停后用路程和时间计算平均速度。改变速度完成三次测量。',measurement:'计算平均速度 / m·s⁻¹',fields:[['initialVelocity','初速度 / m·s⁻¹',0.5,3,0.1]],boundary:'理想匀速直线运动，无摩擦。用 s/t 测量平均速度。每次至少运动 0.5 s；更改条件会暂停并重新计时，保留已有记录。'},
 j06:{engine:'spring',title:'用弹簧测力计测量力',intro:'先调整零点，再改变挂载力，读取测力计示数并记录。观察零点偏差对测量的影响。',measurement:'测力计示数 / N',fields:[['force','挂载力 / N',0,5,0.1],['zero','零点偏差 / N',-1,1,0.1]],boundary:'理想弹簧测力计，量程 0—5 N；读数 = 挂载力 + 零点偏差。记录时必须调零，至少三种载荷。尚未模拟视差、挂钩接线或真实仪器回滞。'},
 h02:{engine:'spring',title:'探究弹簧弹力与形变量的关系',intro:'保持同一弹簧，依次改变挂载力。由刻度尺读出伸长量，记录至少三组数据，并包含无载荷状态。',measurement:'测得伸长量 / cm',fields:[['stiffness','劲度系数 / N·m⁻¹',20,100,10],['force','挂载力 / N',0,5,0.1]],boundary:'F = kx，原长 10 cm；仅适用伸长量 ≤25 cm 的线性弹性区间。改变劲度系数相当于更换弹簧；至少三组需来自同一弹簧。'},
 j13:{engine:'buoyancy',title:'探究浮力大小与哪些因素有关',intro:'调节浸入比例、液体密度与物体体积。用空气中重力减去浸液后的拉力，计算浮力；分别控制变量探究排开体积和液体密度。',measurement:'由 G − T 计算浮力 / N',fields:[['density','液体密度 / kg·m⁻³',800,1200,100],['volume','物体体积 / cm³',20,200,10],['immersion','浸入比例',0,1,0.1]],boundary:'F浮 = ρ液gV排，g = 10 m/s²；物体为密度 2500 kg/m³ 的均匀柱体，静止悬挂、无容器底部接触。只模拟静态受力，不模拟液体流动、漂浮过程和表面张力。'},
 j14:{engine:'lever',title:'探究杠杆的平衡条件',intro:'调整两侧力和力臂，使杠杆水平平衡。至少记录三组不同条件，包含一组不等力臂，比较两侧力与力臂的乘积。',measurement:'右侧力 F₂ / N',fields:[['force1','左侧力 F₁ / N',0.5,5,0.1],['arm1','左力臂 l₁ / m',0.05,0.4,0.01],['force2','右侧力 F₂ / N',0.5,5,0.1],['arm2','右力臂 l₂ / m',0.05,0.4,0.01]],boundary:'理想无质量杠杆，力垂直于水平杆。平衡判据 |F₁l₁ − F₂l₂| ≤0.002 N·m。倾斜仅表示力矩不平衡方向，不表示真实摆动或静态倾角；未模拟杠杆自重、摩擦和调平螺母。'},
 h04:{engine:'motion',title:'探究加速度与物体受力、物体质量的关系',intro:'先保持质量不变改变合力，再保持合力不变改变质量。运行并暂停，用 (v − v₀)/t 计算加速度；每轮至少三种条件。',measurement:'计算加速度 / m·s⁻²',fields:[['mass','小车质量 / kg',0.2,2,0.1],['force','水平合力 / N',0,2,0.1],['initialVelocity','初速度 / m·s⁻¹',0.5,3,0.1]],boundary:'a = F/m，理想水平无摩擦轨道，合力直接作用于小车；无绳、滑轮和悬挂砝码近似。固定步长 0.02 s，总时长上限 10 s；更改条件会重新计时。显示卡顿时仿真会变慢，计算使用仿真时间。'}
};
const spec=specs[id]||specs.j06,engine=spec.engine;
let params={...defaults[engine]},ticks=0,records=[],running=false,readOnly=false,lastTime=0,accumulator=0;
if(id==='j05')params.force=0;
const initial={...params};
$('title').textContent=spec.title;$('intro').textContent=spec.intro;
$('measurement-label').textContent=spec.measurement;$('boundary').textContent=spec.boundary;
$('motion-actions').hidden=engine!=='motion';
const fmt=(v,n=2)=>Number(v).toFixed(n),svgText=(x,y,text,color='#516b70')=>`<text x="${x}" y="${y}" fill="${color}" font-size="16">${text}</text>`;
function notifyChange(){document.dispatchEvent(new Event('change',{bubbles:true}));}
function pause(){running=false;accumulator=0;lastTime=0;$('run').textContent='开始运动';}
function makeControls(){
 for(const [key,label,min,max,step] of spec.fields){
  const field=document.createElement('label'),heading=document.createElement('span'),caption=document.createElement('span'),value=document.createElement('output'),input=document.createElement('input');
  heading.className='control-heading';caption.textContent=label;value.id='value-'+key;heading.append(caption,value);
  input.type='range';input.min=min;input.max=max;input.step=step;input.id=key;input.setAttribute('aria-label',label);
  input.oninput=()=>{if(readOnly)return;pause();params[key]=+input.value;ticks=0;$('measured').value='';draw();};
  field.append(heading,input);$('controls').append(field);
 }
}
function readouts(items){$('readouts').replaceChildren();for(const [label,value] of items){const box=document.createElement('div'),b=document.createElement('b');box.className='reading';box.append(label);b.textContent=value;box.append(b);$('readouts').append(box);}}
function draw(){
 for(const [key] of spec.fields){$(key).value=params[key];$('value-'+key).value=fmt(params[key]);}
 const r=solveMechanics(engine,params,ticks);let art='';$('warning').textContent='';
 if(engine==='spring'){
  const length=40+r.extension*400,top=65,bottom=top+length;
  art='<path d="M160 40 H490 M320 40 V65" stroke="#46676b" stroke-width="7" fill="none"/>';
  let spring='M320 65';for(let i=1;i<=20;i++)spring+=` L${320+(i%2?12:-12)} ${top+length*i/21}`;spring+=` L320 ${bottom}`;
  art+=`<path d="${spring}" stroke="#147d78" stroke-width="4" fill="none"/><rect x="295" y="${bottom}" width="50" height="36" rx="5" fill="#dfaa57"/>`;
  for(let cm=0;cm<=36;cm++){const y=top+cm*4;art+=`<line x1="420" y1="${y}" x2="${cm%5===0?444:433}" y2="${y}" stroke="#829d9d"/>`;if(cm%5===0)art+=svgText(450,y+5,cm+' cm');}
  art+=`<line x1="352" y1="105" x2="420" y2="105" stroke="#91a8a5" stroke-dasharray="5 4"/>`+svgText(120,110,'原长 10 cm')+svgText(520,95,'理想测力计 / N');
  const pointer=130+r.reading*25;
  art+=`<line x1="565" y1="130" x2="565" y2="255" stroke="#547773" stroke-width="2"/>`;
  for(let f=0;f<=5;f++)art+=`<line x1="555" y1="${130+f*25}" x2="580" y2="${130+f*25}" stroke="#547773"/>`+svgText(587,135+f*25,f);
  art+=`<path d="M530 ${pointer} h24 l-8 -6 m8 6 l-8 6" stroke="#c5842a" stroke-width="3" fill="none"/>`;
  readouts([['原长','10.00 cm'],['当前长度',fmt(10+r.extension*100)+' cm'],['示数',fmt(r.reading)+' N']]);
  if(r.overloaded)$('warning').textContent='已超出约定线性弹性区间，请减小载荷。';
  else if(params.zero!==0)$('warning').textContent='零点偏差未消除；先卸载观察零点，再调零。';
 }else if(engine==='lever'){
  const deg=r.angle*180/Math.PI,l=params.arm1*700,q=params.arm2*700;
  art=`<path d="M390 275 L370 305 H410 Z" fill="#8ca7a4"/><g transform="rotate(${deg} 390 270)"><line x1="90" y1="270" x2="690" y2="270" stroke="#52766e" stroke-width="9"/><circle cx="390" cy="270" r="9" fill="#fff" stroke="#147d78" stroke-width="4"/>`;
  for(let n=-4;n<=4;n++)art+=`<line x1="${390+n*70}" y1="258" x2="${390+n*70}" y2="282" stroke="#d3e5df"/>`;
  for(const [x,f] of [[390-l,params.force1],[390+q,params.force2]])art+=`<path d="M${x} 270 V320 l-7 -10 m7 10 l7 -10" fill="none" stroke="#d09537" stroke-width="3"/>`+svgText(x-28,245,fmt(f)+' N');
  art+='</g>'+svgText(125,100,'左力臂 '+fmt(params.arm1)+' m')+svgText(450,100,'右力臂 '+fmt(params.arm2)+' m')+svgText(290,50,r.balanced?'水平平衡':'力矩不平衡',r.balanced?'#147d78':'#a75420');
  readouts([['左侧力矩',fmt(r.leftTorque,3)+' N·m'],['右侧力矩',fmt(r.rightTorque,3)+' N·m'],['状态',r.balanced?'平衡':'倾向较大力矩一侧']]);
 }else if(engine==='buoyancy'){
  const waterY=220,blockH=85,blockY=waterY-blockH*(1-params.immersion),blockW=35+params.volume*0.2;
  art=`<path d="M160 140 V325 H490 V140" stroke="#7eaaa9" stroke-width="4" fill="none"/><rect x="163" y="220" width="324" height="102" fill="#a4d9e4" opacity="0.6"/><line x1="163" y1="220" x2="487" y2="220" stroke="#4fa8ba" stroke-width="2"/><rect x="295" y="25" width="50" height="75" rx="8" fill="#e6efeb" stroke="#648e84"/><path d="M320 100 V${blockY}" stroke="#5e7c78" stroke-width="2"/><rect x="${320-blockW/2}" y="${blockY}" width="${blockW}" height="85" rx="3" fill="#d6a35d" stroke="#a57329"/>`;
  art+=svgText(540,120,'空气中 G = '+fmt(r.weight)+' N')+svgText(540,165,'浸液后 T = '+fmt(r.tension)+' N')+svgText(540,230,'排开体积 '+fmt(r.displacedMl)+' mL')+svgText(540,275,'排液重力 '+fmt(r.displacedWeight)+' N');
  readouts([['空气中重力 G',fmt(r.weight)+' N'],['测力计拉力 T',fmt(r.tension)+' N'],['排开液体体积',fmt(r.displacedMl)+' mL']]);
 }else{
  const maxDistance=Math.max(12,r.position*1.15),scale=640/maxDistance,x=70+r.position*scale;
  art=`<line x1="55" y1="260" x2="735" y2="260" stroke="#55766c" stroke-width="5"/>`;
  for(let i=0;i<=8;i++){const mark=70+i*80;art+=`<line x1="${mark}" y1="260" x2="${mark}" y2="275" stroke="#849f95"/>`+svgText(mark-10,298,fmt(maxDistance*i/8,1));}
  for(let t=0;t<=Math.floor(r.time);t++){const sample=solveMechanics('motion',params,t*50);art+=`<circle cx="${70+sample.position*scale}" cy="245" r="4" fill="#c5d9d0"/>`;}
  art+=`<rect x="${x-24}" y="215" width="48" height="27" rx="5" fill="#16877d"/><circle cx="${x-15}" cy="247" r="8" fill="#47615b"/><circle cx="${x+15}" cy="247" r="8" fill="#47615b"/>`+svgText(70,65,'水平理想轨道；浅色点为每隔 1 s 的位置')+svgText(550,330,'路程标尺 / m（自动缩放）');
  if(params.force>0)art+=`<path d="M${x+27} 228 h38 l-10 -6 m10 6 l-10 6" fill="none" stroke="#d09537" stroke-width="3"/>`;
  readouts([['仿真时间',fmt(r.time)+' s'],['路程 s',fmt(r.position)+' m'],['当前速度 v',fmt(r.velocity)+' m/s'],['初速度 v₀',fmt(params.initialVelocity)+' m/s']]);
  if(ticks===MAX_TICKS)$('warning').textContent='已运行 10 s，可记录或重新计时。';
 }
 $('bench').innerHTML=art;
}
function conditions(p){return spec.fields.map(([key,label])=>label.split(' / ')[0]+': '+fmt(p[key])).join('；');}
function observation(row){const r=solveMechanics(engine,row.params,row.ticks);return engine==='spring'?'长度 '+fmt(10+r.extension*100)+' cm；示数 '+fmt(r.reading)+' N':engine==='lever'?'力矩 '+fmt(r.leftTorque,3)+' / '+fmt(r.rightTorque,3)+' N·m':engine==='buoyancy'?'G '+fmt(r.weight)+' N；T '+fmt(r.tension)+' N；V排 '+fmt(r.displacedMl)+' mL':'s '+fmt(r.position)+' m；v '+fmt(r.velocity)+' m/s';}
function renderRecords(){
 $('count').textContent=records.length+' 组';$('records').replaceChildren();
 records.forEach((row,i)=>{const tr=document.createElement('tr');for(const value of [i+1,conditions(row.params),fmt(row.ticks*DT),fmt(row.measured),observation(row)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const td=document.createElement('td'),b=document.createElement('button');b.textContent='删除';b.className='secondary';b.disabled=readOnly;b.onclick=()=>{if(readOnly)return;records.splice(i,1);renderRecords();notifyChange();};td.append(b);tr.append(td);$('records').append(tr);});
}
$('run').onclick=()=>{if(readOnly)return;if(running){pause();notifyChange();}else if(ticks<MAX_TICKS){running=true;lastTime=0;$('run').textContent='暂停运动';}};
$('reset-run').onclick=()=>{if(readOnly)return;pause();ticks=0;draw();notifyChange();};
$('record').onclick=()=>{
 if(readOnly)return;pause();
 const input=$('measured').value,measured=Number(input),r=solveMechanics(engine,params,ticks);
 if(!input.trim()||!Number.isFinite(measured)||measured<0||measured>1000){$('message').textContent='请填写有效的非负测量值。';return;}
 if(engine==='motion'&&ticks<25){$('message').textContent='请至少运动 0.5 s 后记录。';return;}
 if(engine==='spring'&&r.overloaded){$('message').textContent='超过线性区间，请减小载荷后记录。';return;}
 if(records.length>=300){$('message').textContent='最多记录 300 组。';return;}
 records.push({params:{...params},ticks,measured});renderRecords();$('message').textContent='已记录第 '+records.length+' 组；提交后由服务器重新计算与检查。';notifyChange();
};
$('csv').onclick=()=>{const lines=[['序号','实验条件','仿真时间/s',spec.measurement,'观察数据'],...records.map((r,i)=>[i+1,conditions(r.params),fmt(r.ticks*DT),r.measured,observation(r)])];const csv='\ufeff'+lines.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=spec.title+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function animate(now){if(running&&!readOnly){if(lastTime)accumulator+=Math.min((now-lastTime)/1000,0.2);lastTime=now;const steps=Math.floor((accumulator+1e-9)/DT);if(steps){accumulator-=steps*DT;ticks=Math.min(MAX_TICKS,ticks+steps);draw();if(ticks===MAX_TICKS){pause();notifyChange();}}}requestAnimationFrame(animate);}
window.labAdapter={
 pause,
 snapshot(){return {version:2,modelVersion:'0.2.0',params:{...params},ticks,records:structuredClone(records)};},
 restore(s){validateMechanics(engine,s);pause();params={...s.params};ticks=s.ticks;records=structuredClone(s.records);$('measured').value='';$('message').textContent='';draw();renderRecords();},
 reset(){pause();params={...initial};ticks=0;records=[];draw();renderRecords();},
 setReadOnly(value){readOnly=!!value;pause();document.querySelectorAll('input,button').forEach(el=>el.disabled=readOnly);$('csv').disabled=false;renderRecords();}
};
makeControls();draw();renderRecords();requestAnimationFrame(animate);
