import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const source='C:/Users/86131/Documents/Codex/2026-09-23/new-chat/outputs/';
mkdirSync('public/experiments',{recursive:true});
let circuit=readFileSync(source+'可自定义虚拟电路实验台.html','utf8');
const solver=circuit.slice(circuit.indexOf('function solveLinear('),circuit.indexOf('function wirePath('));
writeFileSync('core/circuit.mjs',"export function solveCircuit(components,wires){\nconst clamp=(v,a,b)=>Math.min(b,Math.max(a,v));const key=(id,p)=>id+':'+p;\n"+solver+"\nreturn simulate();\n}\n");
circuit=circuit.replace("const STORAGE='custom-circuit-lab-v1'","const STORAGE='physics-circuit-'+new URLSearchParams(location.search).get('sid')");
circuit=circuit.replace('records.push({experiment:','records.push({circuit:structuredClone({components,wires}),experiment:');
circuit=circuit.replace('function preset(kind){components=[];wires=[];', 'function preset(kind,keepRecords=false){const oldRecords=keepRecords?records:[];components=[];wires=[];');
circuit=circuit.replace("ui.target.value='';store();render()}","records=oldRecords;ui.target.value='';store();render()}");
circuit=circuit.replace("'载入示例会替换当前电路和实验记录，继续吗？'", "'载入示例会替换当前电路，已有测量记录保留，继续吗？'");
circuit=circuit.replace('preset(ui.preset.value)});','preset(ui.preset.value,true)});');
circuit=circuit.replace("if(components.length&&!confirm('载入示例会替换当前电路，已有测量记录保留，继续吗？'))return;", '');
circuit=circuit.replace(/<p class="small muted">返回基础课：.*?<\/p>/, '');
circuit=circuit.replace("function preset(kind,keepRecords=false){", "function preset(kind,keepRecords=false){if(kind!=='blank')ui.preset.value=kind;");
const circuitBridge=`
window.labAdapter={
 snapshot:()=>structuredClone({version:1,components,wires,records,nextId}),
 restore:s=>{components=structuredClone(s.components);wires=structuredClone(s.wires);records=structuredClone(s.records||[]);nextId=s.nextId||1000;selected=null;wireStart=null;store();render()},
 reset:()=>preset(new URLSearchParams(location.search).get('preset')||'ohm')
};
preset(new URLSearchParams(location.search).get('preset')||'ohm');
`;
circuit=circuit.replace('\n})();','\n'+circuitBridge+'\n})();');
writeFileSync('public/experiments/circuit.html',circuit);
let lens=readFileSync(source+'凸透镜成像-虚拟实验课.html','utf8');
lens=lens.replace("const key='convex-lens-records-v1'","const key='physics-lens-'+new URLSearchParams(location.search).get('sid')");
const lensBridge=`
window.labAdapter={
 snapshot:()=>JSON.parse(JSON.stringify({...state(),records})),
 restore:st=>{els.f.value=st.f;els.u.value=st.u;els.s.value=st.s;records=structuredClone(st.records||[]);draw();renderRecords()},
 reset:()=>{els.f.value=15;els.u.value=45;els.s.value=22;records=[];draw();renderRecords()}
};
`;
lens=lens.replace('  draw();renderRecords();','  '+lensBridge+'\n  draw();renderRecords();');
writeFileSync('public/experiments/lens.html',lens);
console.log('已导入电路、凸透镜原型，并提取共享电路求解器。');

