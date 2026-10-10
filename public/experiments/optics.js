const $=id=>document.getElementById(id),engine=new URLSearchParams(location.search).get('engine')||'reflection',reflect=engine==='reflection';
let angle=40,distance=40,records=[];
$('title').textContent=reflect?'探究光的反射定律':'探究平面镜成像的特点';
$('intro').textContent=reflect?'改变入射光线方向，观察入射角与反射角。角度均相对法线测量。':'改变物体距镜面的距离，观察物体与虚像的位置关系。';
$('parameter-label').textContent=reflect?'入射角 / °':'物距 / cm';
$('parameter').min=reflect?5:10;$('parameter').max=reflect?85:100;
$('input-column').textContent=reflect?'入射角 / °':'物距 / cm';$('output-column').textContent=reflect?'反射角 / °':'像距 / cm';
$('boundary').textContent=reflect?'模型：理想平面反射；只探究角度关系，三线共面与纸板折转操作尚未实现。':'模型：理想平面镜、正立等大虚像；当前为对称位置探究，玻璃板替代、重合定位与光屏验证尚未实现。';
function draw(){
 $('parameter').value=reflect?angle:distance;
 if(reflect){
 const t=angle*Math.PI/180,x=210*Math.sin(t),y=210*Math.cos(t),ox=400,oy=290;
 $('bench').innerHTML='<line x1="60" y1="290" x2="740" y2="290" stroke="#344e59" stroke-width="6"/><line x1="400" y1="35" x2="400" y2="300" stroke="#a0b8bd" stroke-dasharray="7 6"/><text x="412" y="42" fill="#6f8a91">法线</text><path d="M'+(ox-x)+' '+(oy-y)+' L400 290 L'+(ox+x)+' '+(oy-y)+'" fill="none" stroke="#dd9a35" stroke-width="4"/><circle cx="400" cy="290" r="5" fill="#147d78"/><text x="100" y="345" fill="#6f8a91">平面镜</text><text x="240" y="90" fill="#b9822c">入射光 → 镜面 → 反射光</text><text x="345" y="255">'+angle+'°</text><text x="425" y="255">'+angle+'°</text>';
 $('condition').textContent=angle+'°';$('observation').textContent='反射角 '+angle+'°';
 }else{
 const x=distance*2.6;
 $('bench').innerHTML='<line x1="400" y1="45" x2="400" y2="320" stroke="#607d89" stroke-width="5"/><line x1="'+(400-x)+'" y1="280" x2="'+(400+x)+'" y2="280" stroke="#b7c9cc" stroke-dasharray="6 5"/><path d="M'+(400-x)+' 250 V115 l-12 18 m12-18 l12 18" fill="none" stroke="#147d78" stroke-width="6"/><path d="M'+(400+x)+' 250 V115 l-12 18 m12-18 l12 18" fill="none" stroke="#dd9a35" stroke-dasharray="7 4" stroke-width="6"/><text x="'+(380-x)+'" y="95">物体</text><text x="'+(375+x)+'" y="95">虚像</text><text x="410" y="325">平面镜</text><text x="'+(400-x/2-25)+'" y="305">'+distance+'cm</text><text x="'+(400+x/2-25)+'" y="305">'+distance+'cm</text>';
 $('condition').textContent=distance+'cm';$('observation').textContent='正立、等大虚像';
 }
 $('records').replaceChildren();records.forEach((r,i)=>{const tr=document.createElement('tr');for(const text of [i+1,reflect?r.angle:r.distance,reflect?r.angle:r.distance,r.measured]){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('records').append(tr);});
}
$('parameter').addEventListener('input',()=>{if(reflect)angle=+$('parameter').value;else distance=+$('parameter').value;draw();});
$('record').addEventListener('click',()=>{if($('measurement').value===''){ $('message').textContent=' 请先填写测量值';return;}const measured=+$('measurement').value;if(!Number.isFinite(measured)||measured<0||measured>180){$('message').textContent=' 测量值无效';return;}records.push({angle,distance,measured});records=records.slice(-100);$('measurement').value='';$('message').textContent=' 已记录';draw();});
window.labAdapter={snapshot:()=>({angle,distance,records:structuredClone(records)}),restore:s=>{angle=s.angle||40;distance=s.distance||40;records=structuredClone(s.records||[]);draw();},reset:()=>{angle=40;distance=40;records=[];draw();}};
draw();

