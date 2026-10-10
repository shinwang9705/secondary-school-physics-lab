import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,DT,MAX_TICKS,solveMechanics,measurementFor} from '../public/physics/mechanics.js';
import {judge,validateState} from '../core/judge.mjs';
import {experiment} from '../core/catalog.mjs';
function state(id,conditions,ticks=100){const engine=experiment(id).engine,records=conditions.map(p=>{const params={...defaults[engine],...p};return {params,ticks,measured:measurementFor(id,params,ticks)};});return {params:records.at(-1).params,ticks,records};}

test('力学数值与单位：胡克、力矩、部分浸入和匀加速运动',()=>{
 assert.deepEqual(solveMechanics('spring',{stiffness:50,force:2,zero:0.2}),{extension:0.04,reading:2.2,overloaded:false});
 assert.equal(solveMechanics('lever',{force1:2,arm1:0.2,force2:4,arm2:0.1}).balanced,true);
 const b=solveMechanics('buoyancy',{density:1000,volume:100,immersion:0.5});
 assert.ok(Math.abs(b.buoyancy-0.5)<1e-10);assert.ok(Math.abs(b.tension-2)<1e-10);assert.ok(Math.abs(b.displacedMl-50)<1e-10);
 const m=solveMechanics('motion',{mass:0.5,force:1,initialVelocity:1},100);
 assert.deepEqual(m,{time:2,acceleration:2,velocity:5,position:6});
 assert.equal(DT*MAX_TICKS,10);
 const endpoint=solveMechanics('motion',{mass:1,force:0,initialVelocity:3},500);assert.equal(endpoint.position,30);
});
test('测力计：未调零不能通过，纠正后需三种载荷',()=>{
 const s=state('j06',[{force:1},{force:2},{force:3}]);assert.equal(judge(experiment('j06'),s).status,'PASS');
 s.records[0].params.zero=0.2;s.records[0].measured=1.2;assert.equal(judge(experiment('j06'),s).status,'NEEDS_WORK');
});
test('胡克定律：不能用换弹簧代替同一弹簧的控制变量',()=>{
 const s=state('h02',[{force:0},{force:1},{force:2}]);assert.equal(judge(experiment('h02'),s).status,'PASS');
 s.records[2].params.stiffness=60;s.records[2].measured=2/60*100;assert.equal(judge(experiment('h02'),s).status,'NEEDS_WORK');
 const limit=state('h02',[{stiffness:20,force:0},{stiffness:20,force:2},{stiffness:20,force:5}]);assert.equal(judge(experiment('h02'),limit).status,'PASS');
});
test('杠杆：三个不同平衡条件通过，重复与不平衡记录不通过',()=>{
 const s=state('j14',[{},{force1:1,force2:1},{force1:2,arm1:0.1,force2:1,arm2:0.2}]);assert.equal(judge(experiment('j14'),s).status,'PASS');
 s.records[2].params.arm1=0.2;assert.equal(judge(experiment('j14'),s).status,'NEEDS_WORK');
 const repeat=state('j14',[{},{},{}]);assert.equal(judge(experiment('j14'),repeat).status,'NEEDS_WORK');
 const equalArms=state('j14',[{force1:1,force2:1},{force1:2,force2:2},{force1:3,force2:3}]);assert.equal(judge(experiment('j14'),equalArms).status,'NEEDS_WORK');
});
test('浮力：必须完成浸入比例和液体密度两轮，未浸入不能完成密度轮',()=>{
 const s=state('j13',[{immersion:0.2},{immersion:0.5},{immersion:1},{density:800},{density:1200}]);assert.equal(judge(experiment('j13'),s).status,'PASS');
 s.records=s.records.slice(0,3);assert.equal(judge(experiment('j13'),s).status,'NEEDS_WORK');
 const zero=state('j13',[{immersion:0},{immersion:0.5},{immersion:1},{density:800,immersion:0},{density:1200,immersion:0}]);assert.equal(judge(experiment('j13'),zero).status,'NEEDS_WORK');
});
test('速度测量：必须匀速且时间足够，伪造测量值不通过',()=>{
 const s=state('j05',[{force:0,initialVelocity:1},{force:0,initialVelocity:2},{force:0,initialVelocity:3}]);assert.equal(judge(experiment('j05'),s).status,'PASS');
 s.records[0].ticks=24;assert.equal(judge(experiment('j05'),s).status,'NEEDS_WORK');s.records[0].ticks=100;
 s.records[0].measured=99;assert.equal(judge(experiment('j05'),s).status,'NEEDS_WORK');
 const accelerated=state('j05',[{initialVelocity:1},{initialVelocity:2},{initialVelocity:3}]);assert.equal(judge(experiment('j05'),accelerated).status,'NEEDS_WORK');
});
test('加速度：质量/合力控制变量两轮，原始参数复算而不相信伪造输出',()=>{
 const s=state('h04',[{mass:1,force:0.5},{mass:1,force:1},{mass:1,force:1.5},{mass:0.5,force:1},{mass:2,force:1}]);assert.equal(judge(experiment('h04'),s).status,'PASS');
 s.records[0].acceleration=999;assert.equal(judge(experiment('h04'),s).status,'PASS');
 s.records[0].measured=999;assert.equal(judge(experiment('h04'),s).status,'NEEDS_WORK');
 s.records=s.records.slice(0,3);assert.equal(judge(experiment('h04'),s).status,'NEEDS_WORK');
});
test('畸形历史参数、NaN、非整数步数、越界时间与过多记录均拒绝',()=>{
 for(const mutate of [s=>s.records[0].params.mass=0,s=>s.records[0].measured=NaN,s=>s.ticks=1.5,s=>s.ticks=501,s=>s.records[0]=null,s=>s.records=Array(301).fill(s.records[0])]){const s=state('h04',[{force:1}]);mutate(s);assert.throws(()=>validateState('motion',s));}
});
