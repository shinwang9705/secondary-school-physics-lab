import test from 'node:test';
import assert from 'node:assert/strict';
import {laboratories,initialState,solveLaboratory,validateLaboratory} from '../public/physics/laboratory.js';
import {experiment,catalog} from '../core/catalog.mjs';
import {judge,validateState} from '../core/judge.mjs';
import {passingState} from './laboratory-fixtures.mjs';
for(const id of Object.keys(laboratories))test(id+' 完整实验、误读、空记录与越界保护',()=>{
 const s=passingState(id);validateState('laboratory',s,id);const r=judge(experiment(id),s);assert.equal(r.status,'PASS',JSON.stringify(r.checks));
 const bad=structuredClone(s);const key=Object.keys(bad.records[0].measured)[0];bad.records[0].measured[key]+=1000;assert.equal(judge(experiment(id),bad).status,'NEEDS_WORK');
 assert.equal(judge(experiment(id),initialState(id)).status,'NEEDS_WORK');assert.throws(()=>validateLaboratory({...s,ticks:-1}));assert.throws(()=>validateState('laboratory',s,id==='j01'?'j02':'j01'));assert.throws(()=>validateLaboratory({...s,modelVersion:'future'}));
 const f=laboratories[id].fields[0];const outside=structuredClone(s);outside.params[f.key]=99999999;assert.throws(()=>validateLaboratory(outside));
});
test('42 项已开放；独立物理基准',()=>{
 assert.equal(catalog.length,42);assert.equal(catalog.filter(e=>e.status==='ready').length,42);
 const calc=(id,p,t=0)=>solveLaboratory(id,{...initialState(id).params,...p},t);
 const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,actual+' vs '+expected);
 near(calc('h08',{mode:0,initial:0},50).voltage,6*(1-Math.exp(-1)));
 near(calc('h21',{volume:20}).pressure,250);near(calc('h21',{volume:20}).values.product,5000);
 near(calc('h15',{incident:30,glass:0}).refracted,19.4712206345);
 near(calc('h16',{}).spacing,1.2);near(calc('j10',{}).onset,112);
 near(calc('h01',{velocity:2,acceleration:0}).interval,.01);
 const collision=calc('h13',{},100);near(collision.v1,0);near(collision.v2,2);near(collision.values.before,1);near(collision.values.after,1);
 near(calc('h06',{},40).x,1);near(calc('h06',{},40).drop,.196);
});
test('控制变量与实验边界不能由重复或无效条件替代',()=>{
 const s=passingState('h17');s.records=s.records.map(r=>({...r,params:{...r.params,closed:0},measured:{current:0}}));assert.equal(judge(experiment('h17'),s).status,'NEEDS_WORK');
 const flat=passingState('h06');flat.records=flat.records.map(r=>({...r,ticks:250,measured:solveLaboratory('h06',r.params,250).values}));assert.equal(judge(experiment('h06'),flat).status,'NEEDS_WORK');
 for(const id of Object.keys(laboratories)){const duplicate=passingState(id);duplicate.records=[duplicate.records[0],duplicate.records[0],duplicate.records[0]];assert.equal(judge(experiment(id),duplicate).status,'NEEDS_WORK',id);}
});
