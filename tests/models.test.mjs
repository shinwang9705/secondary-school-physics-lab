import test from 'node:test';
import assert from 'node:assert/strict';
import {solveCircuit} from '../core/circuit.mjs';
import {catalog,experiment} from '../core/catalog.mjs';
import {judge,validateState} from '../core/judge.mjs';
const component=(id,type,value)=>({id,type,value,x:100,y:100,label:type});
const wire=(a,ap,b,bp)=>({a:{id:a,port:ap},b:{id:b,port:bp}});
function circuit(values=[10],parallel=false){
 const components=[component('c1','source',3),...values.map((r,i)=>component('c'+(i+2),'resistor',r))],wires=[];
 if(parallel)for(const r of components.slice(1))wires.push(wire('c1',0,r.id,0),wire(r.id,1,'c1',1));
 else{wires.push(wire('c1',0,'c2',0));for(let i=2;i<components.length;i++)wires.push(wire('c'+i,1,'c'+(i+1),0));wires.push(wire(components.at(-1).id,1,'c1',1));}
 return {components,wires,records:[]};
}
test('42 项目录，全部开放',()=>{assert.equal(catalog.length,42);assert.equal(catalog.filter(e=>e.status==='ready').length,42);});
test('3V/10Ω，串联与并联结果',()=>{for(const [s,current] of [[circuit(),.3],[circuit([10,10]),.15],[circuit([10,10],true),.3]])assert.ok(Math.abs(solveCircuit(s.components,s.wires).readings.get('c2').I-current)<1e-8);});
test('开路、短路和电源冲突不会给出有效结果',()=>{const s=circuit();s.wires=[];assert.equal(solveCircuit(s.components,s.wires).readings.get('c2').I,0);s.wires=[wire('c1',0,'c1',1)];assert.ok(solveCircuit(s.components,s.wires).unsafe);const t=circuit();t.components.push(component('c3','source',4));t.wires.push(wire('c1',0,'c3',0),wire('c1',1,'c3',1));assert.ok(solveCircuit(t.components,t.wires).error);});
test('客户端伪造读数不能通过复算',()=>{const s=circuit();s.records=[{targetId:'c2',U:3,I:99,circuit:structuredClone(s)}];assert.equal(judge(experiment('j09'),s).status,'NEEDS_WORK');});
test('串并联实验需两种实际拓扑',()=>{const s=circuit([10,10]),p=circuit([10,10],true);for(const x of [s,p]){const v=solveCircuit(x.components,x.wires).readings.get('c2');s.records.push({targetId:'c2',U:v.U,I:v.I,circuit:{components:x.components,wires:x.wires}});}assert.equal(judge(experiment('j20'),s).status,'PASS');});
test('控制变量实验必须完成两轮',()=>{const s=circuit();s.records=[];for(const [U,R] of [[1,10],[2,10],[3,10],[3,20],[3,30]]){const x=circuit([R]);x.components[0].value=U;const v=solveCircuit(x.components,x.wires).readings.get('c2');s.records.push({targetId:'c2',U:v.U,I:v.I,circuit:x});}assert.equal(judge(experiment('j21'),s).status,'PASS');s.records=s.records.slice(0,3);assert.equal(judge(experiment('j21'),s).status,'NEEDS_WORK');});
test('五种透镜情形与焦点边界',()=>{const records=[{f:15,u:45,s:22.5},{f:15,u:30,s:30},{f:15,u:20,s:60},{f:15,u:15,s:40},{f:15,u:10,s:40}];assert.equal(judge(experiment('j17'),{...records[0],records}).status,'PASS');records[0].s=40;assert.equal(judge(experiment('j17'),{...records[0],records}).status,'NEEDS_WORK');});
test('反射与平面镜手动错误测量不通过',()=>{for(const [id,key] of [['j15','angle'],['j16','distance']]){const records=[20,40,60].map(x=>({[key]:x,measured:x}));const s={angle:40,distance:40,records};assert.equal(judge(experiment(id),s).status,'PASS');s.records[0].measured=5;assert.equal(judge(experiment(id),s).status,'NEEDS_WORK');}});
test('未知端口与无穷参数被拒绝',()=>{const s=circuit();s.wires[0].a.port=2;assert.throws(()=>validateState('circuit',s));assert.throws(()=>validateState('lens',{f:Infinity,u:30,s:30,records:[]}));});

