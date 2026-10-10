import {initialState,solveLaboratory} from '../public/physics/laboratory.js';
const fixtures={
 j01:[[{object:0,weights:120,rider:.3}], [{object:1,weights:85,rider:.6}],[{object:2,weights:205,rider:.2}]],
 j02:[...[20,40,60].map(volume=>[{mode:0,volume}]),...[20,40,60].map(volume=>[{mode:1,volume}])],
 j03:[10,40,80].map(temperature=>[{temperature},1000]),j04:[...Array.from({length:3},(_,object)=>[{object,mode:0,start:2}]),[{mode:1},100]],
 j10:[0,100,240,360].map(t=>[{},t]),j11:[...[.2,.4,.6].map(mass=>[{mass,surface:0}]),...[1,2].map(surface=>[{mass:.4,surface}])],
 j12:[...[.1,.2,.3].map(depth=>[{depth,density:1000,direction:0}]),...[800,1200].map(density=>[{density,depth:.2}]),...[90,180].map(direction=>[{direction,depth:.2}])],
 j18:[[{current:.4,winding:1}],[{current:-.4,winding:1}],[{current:.4,winding:-1}]],j19:[[{velocity:0,closed:1}],[{velocity:1,closed:0}],[{velocity:1,closed:1}]],
 h01:[.5,1,1.5].map(velocity=>[{velocity},1000]),h03:[[30,150,2],[45,135,2.83],[60,120,3.46]].map(([angle1,angle2,single])=>[{angle1,angle2,single,angle3:90}]),
 h05:[0,40,80].map(t=>[{},t]),h06:[20,40,60].map(t=>[{},t]),h07:[...[.05,.1,.15].map(mass=>[{mass,radius:.1,omega:4}]),...[.05,.2].map(radius=>[{radius,mass:.1,omega:4}]),...[2,6].map(omega=>[{omega,mass:.1,radius:.1}])],
 h08:[...[0,25,100].map(t=>[{mode:0,initial:0},t]),...[0,25,100].map(t=>[{mode:1,initial:6},t])],h09:[[{tool:0,object:0,opening:5}],[{tool:1,object:0,opening:5.4}],[{tool:2,object:0,opening:5.36}]],h10:[.5,1,1.5].map(length=>[{length}]),h11:[[{mode:0,connection:0,powered:1}],[{mode:1,connection:1,powered:1}],[{mode:2,connection:2,powered:0}]],h12:[5,10,20].map(load=>[{load}]),h13:[.3,.5,.7].map(mass1=>[{mass1},100]),
 h14:[.5,1,1.5].map(length=>[{length},3500]),h15:[20,40,60].map(incident=>[{incident}]),h16:[.5,1,1.5].map(distance=>[{distance,cursor2:distance*3.6}]),h17:[[{field:1,velocity:1,orientation:1}],[{field:-1,velocity:1,orientation:1}],[{field:1,velocity:-1,orientation:1}],[{field:1,velocity:1,orientation:-1}]],h18:[100,200,400].map(secondary=>[{secondary}]),h19:[0,100,1000].map(light=>[{light}]),h20:[40,50,60].map(drops=>[{drops}]),h21:[20,50,100].map(volume=>[{volume}])
};
export function passingState(id){const state=initialState(id);state.records=fixtures[id].map(([params,ticks=0])=>{const row={params:{...state.params,...params},ticks};row.measured={...solveLaboratory(id,row.params,ticks).values};return row;});state.params={...state.records.at(-1).params};state.ticks=state.records.at(-1).ticks;if(id==='h12')state.analysis={emf:3,internal:1};return state;}
