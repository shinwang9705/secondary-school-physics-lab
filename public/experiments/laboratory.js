import {laboratories,initialState,solveLaboratory,validateLaboratory,VERSION} from '/physics/laboratory.js';
import {renderBench,observations} from '/experiments/laboratory-render.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),id=query.get('experiment'),spec=laboratories[id];
if(!spec)throw Error('找不到实验规格');
let state=initialState(id),running=false,readOnly=false,last=0,elapsed=0,excluded=new Set();
const dynamic=['j03','j04','j10','j11','h01','h05','h06','h07','h08','h13','h14','h18'].includes(id);
const fmt=(v,n=3)=>Number.isFinite(v)?Number(v.toFixed(n)).toString():'—';
function pause(){running=false;last=0;elapsed=0;$('run').textContent='开始 / 继续';}
function operation(kind,extra={}){state.operation={kind,ticks:state.ticks,...extra};document.dispatchEvent(new Event('change',{bubbles:true}));}
function updateField(field,value,typing=false){
 if(readOnly)return;
 const old=state.params[field.key],probe={...state,params:{...state.params,[field.key]:value}};
 try{validateLaboratory(probe,id);}catch(e){$('message').textContent=e.message;if(!typing)syncControls();return;}
 if(value===old)return;
 const previous=solveLaboratory(id,state.params,state.ticks);
 pause();state.params[field.key]=value;
 if(id==='h08'&&['mode','closed'].includes(field.key))state.params.initial=Math.round(previous.voltage*100)/100;
 else if(id==='h08'&&field.key!=='initial')state.params.initial=state.params.mode?state.params.voltage:0;
 state.ticks=0;operation('PARAM',{field:field.key,from:old,to:value});draw();
}
function createControls(){for(const field of spec.fields){const box=document.createElement('div'),label=document.createElement('label');box.className='control';label.textContent=field.label;box.append(label);if(field.options){const select=document.createElement('select');select.id='control-'+field.key;select.setAttribute('aria-label',field.label);for(const [value,text] of field.options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.onchange=()=>updateField(field,+select.value);label.append(select);}else{const pair=document.createElement('div');pair.className='pair';for(const type of ['range','number']){const input=document.createElement('input');input.type=type;input.id=type+'-'+field.key;input.min=field.min;input.max=field.max;input.step=field.step;input.setAttribute('aria-label',field.label+(type==='number'?'（数值）':''));input.addEventListener('input',()=>{if(input.value.trim())updateField(field,+input.value,true);});if(type==='number')input.addEventListener('change',()=>updateField(field,+input.value));pair.append(input);}box.append(pair);}$('controls').append(box);}}
function syncControls(){for(const field of spec.fields){if(field.options)$('control-'+field.key).value=state.params[field.key];else{ $('range-'+field.key).value=state.params[field.key];$('number-'+field.key).value=state.params[field.key];}}}
function draw(){
 syncControls();const r=solveLaboratory(id,state.params,state.ticks);$('bench').innerHTML=renderBench(id,spec,state.params,r);$('readouts').replaceChildren();
 for(const [key,label,unit] of [...(dynamic?[['time','仿真时间','s']]:[]),...(observations[id]||[])]){const box=document.createElement('div'),b=document.createElement('b');box.className='reading';box.append(label);b.textContent=fmt(r[key],key==='interval'?5:3)+' '+unit;box.append(b);$('readouts').append(box);}
 $('warning').textContent=!r.valid?'当前测量条件无效，请按实验说明调整器材或等待运动完成。':id==='j03'&&!r.stable?'读数仍在变化，请等待稳定。':r.finished?'本轮运动/加热结束，可记录或重新计时。':'';
 $('seek').value=fmt(state.ticks*spec.dt,5);
}
function conditions(p){return spec.fields.filter(f=>id!=='h11'||!['vRange','iRange','rRange','zero'].includes(f.key)).map(f=>f.label+': '+(f.options?f.options.find(([k])=>k===p[f.key])[1]:fmt(p[f.key]))).join('；');}
function measurementText(row){return spec.measurements.map(m=>m.label+': '+fmt(row.measured[m.key],5)).join('；');}
function renderRecords(){
 $('count').textContent=state.records.length+' 组';$('records').replaceChildren();
 state.records.forEach((row,index)=>{const tr=document.createElement('tr');for(const text of [index+1,conditions(row.params),fmt(row.ticks*spec.dt),measurementText(row)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}const td=document.createElement('td'),b=document.createElement('button');b.className='secondary';b.textContent='删除';b.disabled=readOnly;b.onclick=()=>{if(readOnly)return;state.records.splice(index,1);excluded=new Set([...excluded].filter(i=>i!==index).map(i=>i>index?i-1:i));operation('DELETE',{record:index});renderRecords();};td.append(b);tr.append(td);const cell=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=!excluded.has(index);check.setAttribute('aria-label','第 '+(index+1)+' 组纳入绘图');check.onchange=()=>{if(check.checked)excluded.delete(index);else excluded.add(index);drawGraph();};cell.append(check);tr.append(cell);$('records').append(tr);});drawGraph();
}
function axisValue(row,key){return key==='time'?row.ticks*spec.dt:key.startsWith('p:')?row.params[key.slice(2)]:row.measured[key.slice(2)];}
function graphPoints(){return state.records.filter((_,index)=>!excluded.has(index)).map(row=>[axisValue(row,$('graph-x').value),axisValue(row,$('graph-y').value)]);}
function drawGraph(){
 const points=graphPoints(),xvals=points.map(p=>p[0]),yvals=points.map(p=>p[1]),xmin=Math.min(0,...xvals),xmax=Math.max(xmin+1,...xvals),ymin=Math.min(0,...yvals),ymax=Math.max(ymin+1,...yvals);
 const px=x=>70+(x-xmin)/(xmax-xmin)*650,py=y=>185-(y-ymin)/(ymax-ymin)*145;
 let svg='<path d="M70 35 V185 H750" stroke="#86a99a" fill="none"/>';for(let n=0;n<=4;n++){const x=xmin+(xmax-xmin)*n/4,y=ymin+(ymax-ymin)*n/4;svg+=`<text x="${px(x)-12}" y="208" fill="#64877b" font-size="12">${fmt(x)}</text><text x="8" y="${py(y)+4}" fill="#64877b" font-size="12">${fmt(y)}</text>`;}points.forEach(([x,y],i)=>svg+=`<circle cx="${px(x)}" cy="${py(y)}" r="5" fill="#16877d"/><text x="${px(x)+7}" y="${py(y)-5}" font-size="11" fill="#64877b">${i+1}</text>`);$('graph').innerHTML=svg;
}
function seek(ticks){if(readOnly)return;pause();state.ticks=Math.max(0,Math.min(spec.maxTicks,ticks));operation('PARAM',{field:'ticks',to:state.ticks});draw();}
$('run').onclick=()=>{if(readOnly)return;if(running){pause();operation('PAUSE');}else if(state.ticks<spec.maxTicks){running=true;last=0;$('run').textContent='暂停';operation('RUN');}};
$('step').onclick=()=>seek(state.ticks+Math.max(1,Math.round(0.1/spec.dt)));
$('reset-time').onclick=()=>seek(0);
$('seek').oninput=$('seek').onchange=()=>{const time=+$('seek').value;if(Number.isFinite(time))seek(Math.round(time/spec.dt));};
$('reset').onclick=()=>{if(readOnly)return;pause();const old=state;state={...initialState(id),records:old.records,analysis:old.analysis,conclusion:old.conclusion};operation('RESET');draw();};
$('record').onclick=()=>{if(readOnly)return;pause();const measured={};for(const m of spec.measurements){const input=$('measured-'+m.key);if(!input.value.trim()||!Number.isFinite(+input.value)||Math.abs(+input.value)>1e7){$('message').textContent='请填写全部有效测量值（方向量允许负数）。';return;}measured[m.key]=+input.value;}if(state.records.length>=300){$('message').textContent='最多记录 300 组。';return;}state.records.push({params:{...state.params},ticks:state.ticks,measured});operation('MEASURE',{record:state.records.length});$('message').textContent='已记录 '+state.records.length+' 组，提交时检查模型和控制变量。';renderRecords();};
$('csv').onclick=()=>window.parent.postMessage({type:'LAB_EXPORT_CSV'},location.origin);
$('conclusion').oninput=()=>{if(!readOnly){state.conclusion=$('conclusion').value;operation('CONCLUSION');}};
for(const key of ['emf','internal'])$('analysis-'+key).oninput=$('analysis-'+key).onchange=()=>{if(readOnly)return;const input=$('analysis-'+key);if(input.value.trim()&&Number.isFinite(+input.value))state.analysis[key]=+input.value;else delete state.analysis[key];operation('ANALYSIS',{field:key});};
$('graph-x').onchange=$('graph-y').onchange=drawGraph;
$('fit').onclick=()=>{const points=graphPoints(),n=points.length;if(n<3){$('fit-result').textContent='至少三组数据才进行拟合。';return;}const mx=points.reduce((s,p)=>s+p[0],0)/n,my=points.reduce((s,p)=>s+p[1],0)/n,xx=points.reduce((s,p)=>s+(p[0]-mx)**2,0);if(xx<1e-12){$('fit-result').textContent='横轴条件相同，无法估计斜率。';return;}const slope=points.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/xx,intercept=my-slope*mx,ss=points.reduce((s,p)=>s+(p[1]-my)**2,0),residual=points.reduce((s,p)=>s+(p[1]-slope*p[0]-intercept)**2,0);$('fit-result').textContent=`y = ${fmt(slope,6)} x + ${fmt(intercept,6)}；R² = ${fmt(ss<1e-12?1:1-residual/ss,5)}。请先筛选同一轮控制变量数据，拟合不代替物理判定。`;};
function animate(now){if(running&&!readOnly){if(last)elapsed+=Math.min((now-last)/1000,0.2)*spec.speed;last=now;const steps=Math.floor((elapsed+1e-9)/spec.dt);if(steps){elapsed-=steps*spec.dt;state.ticks=Math.min(spec.maxTicks,state.ticks+steps);draw();if(state.ticks===spec.maxTicks||solveLaboratory(id,state.params,state.ticks).finished){pause();operation('PAUSE');}}}requestAnimationFrame(animate);}
window.labAdapter={pause,snapshot:()=>structuredClone(state),restore(value){validateLaboratory(value,id);pause();state=structuredClone(value);excluded.clear();$('conclusion').value=state.conclusion;for(const key of ['emf','internal'])$('analysis-'+key).value=state.analysis[key]??'';draw();renderRecords();},reset(){pause();state=initialState(id);excluded.clear();$('conclusion').value='';for(const key of ['emf','internal'])$('analysis-'+key).value='';draw();renderRecords();},setReadOnly(value){readOnly=!!value;pause();document.querySelectorAll('input,select,button,textarea').forEach(el=>el.disabled=readOnly);for(const key of ['csv','graph-x','graph-y','fit'])$(key).disabled=false;renderRecords();}};
$('title').textContent=query.get('title')||spec.goal;$('goal').textContent=spec.goal;$('boundary').textContent='模型与边界：'+spec.boundary+' 文字结论由教师复核，当前为教学仿真；不将客户端状态视为真实考试操作证据。';
$('clock').hidden=!dynamic;$('seek').step=spec.dt;$('seek').max=spec.maxTicks*spec.dt;$('clock-info').textContent=`固定步长 ${spec.dt} s，运行显示按 ${spec.speed} 倍仿真时间；卡顿时仿真变慢。修改器材条件会暂停并重新计时，保留历史测量。`;
for(const m of spec.measurements){const label=document.createElement('label'),input=document.createElement('input');label.textContent=m.label;input.id='measured-'+m.key;input.type='number';input.step='any';input.placeholder='观察或计算后填写';label.append(input);$('measurements').append(label);}
$('table-head').innerHTML='<tr><th>序号</th><th>测量时的器材条件</th><th>仿真时间 / s</th><th>手动测量</th><th></th><th>绘图</th></tr>';
for(const [key,label] of [['time','仿真时间 / s'],...spec.fields.map(f=>['p:'+f.key,f.label]),...spec.measurements.map(m=>['m:'+m.key,m.label])])for(const target of ['graph-x','graph-y']){const option=document.createElement('option');option.value=key;option.textContent=label;$(target).append(option);}
$('graph-x').value=dynamic?'time':'p:'+spec.fields[0].key;$('graph-y').value='m:'+spec.measurements[0].key;if(id==='h12'){$('graph-x').value='m:current';$('graph-y').value='m:voltage';}$('analysis').hidden=id!=='h12';createControls();draw();renderRecords();requestAnimationFrame(animate);
