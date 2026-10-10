import {laboratories} from '../public/physics/laboratory.js';
export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reportData(session,exp,student,keyframes=[]){return {experiment:exp,student,session,keyframes,scope:'教学仿真与基础规则反馈；教师评分单独记录。客户端记录和截图不能证明真实操作。',boundary:laboratories[exp.id]?.boundary||'理想教学模型；仪表内阻、无阻力运动或几何光学等简化详见实验说明。'};}
const clean=s=>String(s??'').replace(/[\r\n\t]/g,' ');
function lines(report){const {experiment:e,session:s}=report;return [
 '中学物理实验报告',e.title,'实验者：'+report.student+'    实例：'+s.id+'    状态：'+s.status,
 '创建时间：'+s.created_at+' UTC    修订：'+s.revision,
 '平台：1.0.0    模型：'+s.model_version+'    规则：'+s.rule_version+'    资产：'+s.asset_version,
 '任务：'+(s.task_id||'自由练习')+'    提交时间：'+(s.submitted_at||'尚未提交'),report.scope,'实验目标：'+e.goal,'模型边界：'+report.boundary,
 '一、原始测量记录（参数、时间和手动读数）',...(s.state?.records||[]).flatMap((row,i)=>{const spec=laboratories[e.id],num=v=>Number.isFinite(v)?Number(v.toFixed(5)):v;return ['第 '+(i+1)+' 组'+(spec?'；仿真时间 '+num(row.ticks*spec.dt)+' s':''),...(spec?[spec.fields.map(f=>f.label+'='+num(row.params[f.key])).join('；'),spec.measurements.map(m=>m.label+'='+num(row.measured[m.key])).join('；')]:[JSON.stringify(row)])];}),
 '二、分析与结论',JSON.stringify(s.state?.analysis||{}),s.state?.conclusion||'未填写文字结论',
 '三、基础检查',s.result?.summary||'尚未提交检查',...(s.result?.checks||[]).map(c=>(c.pass?'通过：':'未通过：')+c.title+'。'+c.detail),
 '四、教师复核与评分',...(s.result?.reviews||[]).map(r=>r.by+' '+r.at+'；分数：'+(r.grade??'未评分')+'；结论：'+(r.decision||'仅意见')+'；'+r.note),
 '五、关键帧索引',...report.keyframes.map(k=>'画面 '+k.id+'；修订 '+k.revision+'；'+k.created_at),
 '完整结构化数据请同时导出 JSON；CSV 可用于数据分析。'
 ].map(clean);}
export function reportCSV(report){const rows=report.session.state?.records||[],spec=laboratories[report.experiment.id];const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];let headers,values;if(spec){headers=['序号','仿真时间/s',...spec.fields.map(f=>f.label),...spec.measurements.map(m=>m.label)];values=rows.map((r,i)=>[i+1,r.ticks*spec.dt,...spec.fields.map(f=>r.params[f.key]),...spec.measurements.map(m=>r.measured[m.key])]);}else{headers=['序号',...keys];values=rows.map((r,i)=>[i+1,...keys.map(k=>typeof r[k]==='object'?JSON.stringify(r[k]):r[k])]);}const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,x=>"'"+x).replace(/"/g,'""')+'"';return '\uFEFF'+[headers,...values].map(row=>row.map(cell).join(',')).join('\r\n');}
export function reportHTML(report){return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>物理实验报告</title><style>body{font:15px/1.8 system-ui,sans-serif;max-width:950px;margin:32px auto;color:#173d35;padding:24px}p{overflow-wrap:anywhere}h1{font-size:28px}img{max-width:100%;border:1px solid #ddd}button{padding:10px 18px}@media print{button{display:none}body{margin:0;padding:0}p{break-inside:avoid}h2{break-after:avoid}}</style><button onclick="window.print()">打印 / 保存为 PDF</button>'+lines(report).map((l,i)=>i===0?'<h1>'+escape(l)+'</h1>':/^[一二三四五]、/.test(l)?'<h2>'+escape(l)+'</h2>':'<p>'+escape(l)+'</p>').join('')+report.keyframes.map(k=>'<p>修订 '+k.revision+'</p><img alt="实验关键帧" src="/api/sessions/'+report.session.id+'/keyframes/'+k.id+'">').join('')+'</html>';}
// Type0 CJK font uses standard PDF CID mapping. No browser/service dependency.
export function reportPDF(report){
 const wrapped=[];for(const line of lines(report)){let row='',width=0;for(const ch of line){const w=ch.charCodeAt(0)>255?1:.55;if(width+w>44){wrapped.push(row);row='';width=0;}row+=ch;width+=w;}wrapped.push(row||' ');}
 const pages=[];for(let i=0;i<wrapped.length;i+=35)pages.push(wrapped.slice(i,i+35));
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>','<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 /W [32 ['+Array(95).fill(500).join(' ')+']] >>'];
 const hex=s=>{const b=Buffer.from(s,'utf16le');b.swap16();return b.toString('hex');},kids=[];
 pages.forEach((page,i)=>{const pageId=objects.length+1,streamId=pageId+1;kids.push(pageId+' 0 R');objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+streamId+' 0 R >>');const draw=(line,y,size=11)=>{let x=50;return [...line].map(ch=>{const item='1 0 0 1 '+x.toFixed(2)+' '+y+' Tm <'+hex(ch)+'> Tj';x+=(ch.charCodeAt(0)>255?1:.55)*size;return item;}).join('\n');};const stream='BT /F1 11 Tf '+page.map((l,n)=>draw(l,785-n*17)).join('\n')+' ET\nBT /F1 10 Tf '+draw('物理实验室 | '+(i+1)+' / '+pages.length,35,10)+' ET';objects.push('<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');});
 objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>';let text='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=Buffer.byteLength(text);text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(text);
}
