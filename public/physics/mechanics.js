// SI units internally. One simulation tick is 20 ms, independent of rendering rate.
export const DT = 0.02;
export const MAX_TICKS = 500;
export const MODEL_VERSION = '0.2.0';
export const defaults = {
  spring: {stiffness:50, force:1, zero:0},
  lever: {force1:2, arm1:0.2, force2:2, arm2:0.2},
  buoyancy: {density:1000, volume:100, immersion:1},
  motion: {mass:1, force:1, initialVelocity:1}
};
const ranges = {
  spring: {stiffness:[20,100], force:[0,5], zero:[-1,1]},
  lever: {force1:[0.5,5], arm1:[0.05,0.4], force2:[0.5,5], arm2:[0.05,0.4]},
  buoyancy: {density:[800,1200], volume:[20,200], immersion:[0,1]},
  motion: {mass:[0.2,2], force:[0,2], initialVelocity:[0.5,3]}
};
export function validateMechanics(engine, state) {
  if(!ranges[engine] || !state || typeof state !== 'object' || Array.isArray(state)) throw Error('力学状态无效');
  if(!Array.isArray(state.records) || state.records.length>300) throw Error('测量记录超限');
  const valid = row => {
    if(!row?.params || typeof row.params!=='object' || Array.isArray(row.params)) throw Error('力学参数无效');
    for(const [key,[min,max]] of Object.entries(ranges[engine])) {
      const n=row.params[key];
      if(!Number.isFinite(n)||n<min||n>max) throw Error('参数超出范围：'+key);
    }
    if(!Number.isInteger(row.ticks)||row.ticks<0||row.ticks>MAX_TICKS) throw Error('仿真时间无效');
  };
  valid(state);
  for(const row of state.records) {
    valid(row);
    if(!Number.isFinite(row.measured)||row.measured<0||row.measured>1000) throw Error('测量值无效');
  }
}
export function solveMechanics(engine, params, ticks=0) {
  if(engine==='spring') {
    const extension=params.force/params.stiffness;
    return {extension, reading:params.force+params.zero, overloaded:extension>0.25};
  }
  if(engine==='lever') {
    const leftTorque=params.force1*params.arm1, rightTorque=params.force2*params.arm2;
    return {leftTorque,rightTorque, balanced:Math.abs(leftTorque-rightTorque)<=0.002,
      angle:Math.max(-0.22,Math.min(0.22,(rightTorque-leftTorque)*0.5))};
  }
  if(engine==='buoyancy') {
    const displaced=params.volume*1e-6*params.immersion, weight=2500*params.volume*1e-6*10;
    const buoyancy=params.density*10*displaced;
    return {weight,buoyancy,tension:weight-buoyancy,displacedMl:displaced*1e6,displacedWeight:buoyancy};
  }
  if(engine==='motion') {
    const time=ticks*DT, acceleration=params.force/params.mass;
    // Exact constant-acceleration step, rounded tick count avoids accumulating clock error.
    return {time,acceleration,velocity:params.initialVelocity+acceleration*time,
      position:params.initialVelocity*time+0.5*acceleration*time*time};
  }
  throw Error('力学引擎无效');
}
export function measurementFor(id, params, ticks) {
  const engine = {j05:'motion',j06:'spring',j13:'buoyancy',j14:'lever',h02:'spring',h04:'motion'}[id];
  const r=solveMechanics(engine,params,ticks);
  return id==='j05'?(r.time?r.position/r.time:0):id==='j06'?r.reading:
    id==='j13'?r.buoyancy:id==='j14'?params.force2:id==='h02'?r.extension*100:r.acceleration;
}
