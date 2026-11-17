import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, LIMITS, normalize, metrics, checks, exportDesign } from '../space.mjs';
import { createFacility } from '../model.js';
import * as T from '../vendor/three.module.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);

test('space budget and seated eye have one metric source',()=>{
  const m=metrics(DEFAULTS);close(m.total,100);close(m.eye,-.65);close(m.immersion,.5);close(m.waterDepth,2.05);
  close(m.wetArea,6.5);close(m.waterArea,16.6478);
  assert.equal(exportDesign(DEFAULTS).metrics.eye,m.eye);
});
test('wider wet deck consumes pool area and does not enlarge the building',()=>{
  const a=metrics({...DEFAULTS,deck:.6}),b=metrics({...DEFAULTS,deck:1.8});
  close(a.total,b.total);close(b.wetArea-a.wetArea,1.2*5.2);close(a.waterArea-b.waterArea,1.2*4.94);
});
test('an eye above water is reported as a design issue',()=>{
  const p={...DEFAULTS,office:-1.2,water:-.35};
  assert.ok(metrics(p).immersion<0);assert.equal(checks(p).find(c=>c.id==='eye').ok,false);
});
test('bad saved values are bounded without contaminating geometry',()=>{
  const p=normalize({office:1000,water:'bad',deck:-9});
  close(p.office,LIMITS.office[1]);close(p.water,DEFAULTS.water);close(p.deck,LIMITS.deck[0]);
});
test('3D water, eye point, and stair landings match parameter values across extremes',()=>{
  for(const office of [-2.05,-1.8,-1.2])for(const deck of [.6,1.25,1.8]){
    const p={...DEFAULTS,office,deck},f=createFacility(p),m=metrics(p),stairs=[];
    f.root.traverse(object=>{
      if(object.userData.kind==='stair')stairs.push(object);
      const positions=object.geometry?.attributes?.position?.array;
      if(positions)for(const value of positions)assert.ok(Number.isFinite(value));
    });
    assert.equal(stairs.length,10);close(stairs[0].userData.top,-m.riser);close(stairs[9].userData.top,office);
    close(f.eye.y,m.eye);close(f.water.position.y+f.water.geometry.parameters.height/2,p.water);
    close(f.water.geometry.parameters.width*f.water.geometry.parameters.depth,m.waterArea);
    f.sectionCaps(-1.2);assert.ok(f.groups.caps.children.length>0);
    f.select('office');assert.equal(f.groups.selection.visible,true);f.dispose();
  }
});
test('wall cutaway never truncates furniture or sealed machinery sharing the same finish',()=>{
  const f=createFacility(DEFAULTS);
  for(const group of ['furniture','equipment','water'])f.groups[group].traverse(object=>{
    if(object.material)assert.equal(object.material.userData.cutawayHeight,null,`${group}/${object.name}`);
  });
  const boiler=f.root.getObjectByName('sealed-boiler'),dome=f.root.getObjectByName('boiler-dome');
  assert.equal(boiler.geometry.parameters.openEnded,false);assert.ok(dome.position.y>1.1);
  assert.equal(f.root.getObjectByName('cultivation-backing').material.userData.cutawayHeight,1.65);
  assert.ok(f.outerWalls.every(w=>w.mesh.material.userData.cutawayHeight===1.1));
  assert.equal(new Set(f.outerWalls.map(w=>w.edge.material)).size,f.outerWalls.length,'each exterior contour must keep its own camera-dependent clipping planes');
  f.dispose();
});
test('sofa has both arms, dining chairs face the table, and the full-length bed clears walls',()=>{
  const f=createFacility(DEFAULTS);f.root.updateMatrixWorld(true);
  const sofa=f.root.getObjectByName('sofa');assert.ok(sofa.getObjectByName('arm-left'));assert.ok(sofa.getObjectByName('arm-right'));
  for(const id of ['dining-west','dining-east']){
    const chair=f.root.getObjectByName(id),facing=new T.Vector3(-1,0,0).applyQuaternion(chair.quaternion);
    const towardTable=new T.Vector3(.5,0,2.1).sub(chair.position).normalize();assert.ok(facing.dot(towardTable)>.99);
  }
  const bed=f.root.getObjectByName('bed'),bounds=new T.Box3().setFromObject(bed);
  assert.ok(bounds.max.x-bounds.min.x>=2);assert.ok(bounds.min.z>2.165&&bounds.max.z<3.935);assert.ok(bounds.min.x>2.715&&bounds.max.x<6.185);
  f.dispose();
});
test('pool has depth-coloured volume and a filled water section',()=>{
  const f=createFacility(DEFAULTS);assert.ok(f.volume.geometry.attributes.color);assert.ok(f.volume.material.opacity>=.25);
  close(f.volume.geometry.parameters.height,2.05);assert.equal(f.volume.castShadow,false);
  f.sectionCaps(-2.8);assert.ok(f.groups.caps.getObjectByName('water-section'));f.dispose();
});
test('entrance clears the kitchen and cultivation well has a retaining back wall',()=>{
  const f=createFacility(DEFAULTS);f.root.updateMatrixWorld(true);
  const kitchen=new T.Box3().setFromObject(f.root.getObjectByName('kitchen-base'));
  const entranceCorridor=new T.Box3(new T.Vector3(-2.1,0,3),new T.Vector3(-1,2,4));
  assert.equal(kitchen.intersectsBox(entranceCorridor),false);
  const back=new T.Box3().setFromObject(f.root.getObjectByName('cultivation-backing'));
  close(back.min.y,DEFAULTS.office);assert.ok(back.max.y>=2.8-1e-6);assert.ok(back.min.z<=-3.9&&back.max.z>=-1.1);
  f.dispose();
});
