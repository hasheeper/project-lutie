import * as T from './vendor/three.module.js';
import { SITE, ROOMS, metrics } from './space.mjs';
import { createFinishes, createWaterTextures, createHologramMaterial, createSparkMaterial } from './finishes.js';
import { createContourMaterial, createContour, setContourSegments, setContourCenter, boxSegments, edgeSegments, architecturalSegments, addSurfaceRim, addEdgeLight, measureFaces } from './contours.js';

const PALETTE={edge:0xa1c4ce,metal:0x819da5,brass:0xaf9868};
export function createFacility(parameters) {
  const finishes=createFinishes(),M=finishes.M;
  const m=metrics(parameters), root=new T.Group(), selectable=[], labels=[], materialSet=finishes.materials, sectionBoxes=[], outerWalls=[], furnitureAssets=[], textures=finishes.textures;
  const groups={};
  for(const name of ['structure','furniture','water','glass','equipment','dimensions','human','lutie','plumbing','section','selection','roof','caps','wallCaps']) {
    groups[name]=new T.Group();groups[name].name=name;root.add(groups[name]);
  }
  const mat=(color,options={})=>{const value=new T.MeshStandardMaterial({color,roughness:.72,metalness:0,...options});materialSet.add(value);return value;};
  const label=(text,position,kind='detail',room=null)=>labels.push({text,position:new T.Vector3(...position),kind,room});
  // Contours are light, drawn with a width (contours.js). Which tone each takes is settled once everything is in place.
  const contourMaterials={cyan:createContourMaterial('cyan'),amber:createContourMaterial('amber'),water:createContourMaterial('water')};
  Object.values(contourMaterials).forEach(material=>materialSet.add(material));
  function edge(mesh,nominal=null) {
    const lines=createContour(nominal?boxSegments(...nominal):edgeSegments(mesh.geometry),contourMaterials.cyan);
    lines.position.copy(mesh.position);lines.rotation.copy(mesh.rotation);lines.scale.copy(mesh.scale);mesh.parent.add(lines);mesh.userData.edge=lines;return lines;
  }
  function softBox(w,h,d,r){
    const shape=new T.Shape(),x=-w/2+r,y=-h/2+r,a=w-2*r,b=h-2*r,c=Math.min(r,a/4,b/4);
    shape.moveTo(x+c,y);shape.lineTo(x+a-c,y);shape.quadraticCurveTo(x+a,y,x+a,y+c);
    shape.lineTo(x+a,y+b-c);shape.quadraticCurveTo(x+a,y+b,x+a-c,y+b);
    shape.lineTo(x+c,y+b);shape.quadraticCurveTo(x,y+b,x,y+b-c);
    shape.lineTo(x,y+c);shape.quadraticCurveTo(x,y,x+c,y);
    const geometry=new T.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r,bevelThickness:r,curveSegments:4});
    geometry.translate(0,0,-(d-2*r)/2);return geometry;
  }
  function box(x,z,w,d,y,h,material=M.wall,group='structure',outline=true,room=null) {
    const soft=material===M.soft||material===M.linen;
    const rounded=group==='furniture'&&(soft||[M.wood,M.white,M.dark,M.rock].includes(material));
    const geometry=rounded?softBox(w,h,d,Math.min(soft?.045:.018,w/5,h/5,d/5)):new T.BoxGeometry(w,h,d);
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;
    if(!rounded)measureFaces(geometry,w,h,d);   // square stock can be lit from its edges
    groups[group].add(mesh);if(outline&&!soft)edge(mesh,[w,h,d]);
    if(group==='structure')sectionBoxes.push(mesh);
    if(room){mesh.userData.room=room;selectable.push(mesh);}return mesh;
  }
  function cylinder(x,z,r,y,h,material=M.metal,group='equipment',segments=32) {
    const mesh=new T.Mesh(new T.CylinderGeometry(r,r,h,segments),material);mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;groups[group].add(mesh);return mesh;
  }
  function line(points,color=0x72827d,group='dimensions',dashed=false,through=false,width=1) {
    const geometry=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));
    const material=dashed ? new T.LineDashedMaterial({color,dashSize:.15,gapSize:.09,depthTest:!through}) : new T.LineBasicMaterial({color,depthTest:!through,linewidth:width});
    materialSet.add(material);const item=new T.Line(geometry,material);item.computeLineDistances();groups[group].add(item);if(through)item.renderOrder=20;return item;
  }
  function tube(points,r,color=PALETTE.brass,group='equipment') {
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'centripetal');
    const finish=M.metal.clone();materialSet.add(finish);
    const mesh=new T.Mesh(new T.TubeGeometry(curve,Math.max(16,points.length*10),r,10,false),finish);groups[group].add(mesh);mesh.castShadow=true;return mesh;
  }
  function wall(x1,z1,x2,z2,base=0,height=SITE.ceiling,material=M.wall,group='structure',width=.13) {
    const mesh=box((x1+x2)/2,(z1+z2)/2,Math.max(width,Math.abs(x2-x1)),Math.max(width,Math.abs(z2-z1)),base,height,material,group);
    mesh.userData.cutawayHeight=1.1;if(mesh.userData.edge)mesh.userData.edge.userData.cutawayHeight=1.1;return mesh;
  }
  function outerWall(side,x1,z1,x2,z2,base=0,height=SITE.ceiling){
    const material=M.wall.clone();materialSet.add(material);
    const mesh=wall(x1,z1,x2,z2,base,height,material);
    outerWalls.push({side,mesh,edge:mesh.userData.edge,cut:new T.Plane(new T.Vector3(0,-1,0),base+.12)});
  }
  function glass(x1,z1,x2,z2,base=0,height=SITE.ceiling) {
    const panel=wall(x1,z1,x2,z2,base,height,M.glass,'glass',.035);panel.castShadow=false;
    [0,1].forEach(k=>{const post=cylinder(x1+(x2-x1)*k,z1+(z2-z1)*k,.023,base,height,M.metal,'glass',8);post.userData.cutawayHeight=1.1;});
    wall(x1,z1,x2,z2,base,.035,M.metal,'glass',.035);
    wall(x1,z1,x2,z2,base+height-.035,.035,M.metal,'glass',.035);
  }
  function table(x,z,w,d,y=.0) {
    box(x,z,w,d,y+.72,.07,M.wood,'furniture');
    for(const a of [-1,1])for(const b of [-1,1])box(x+a*(w/2-.07),z+b*(d/2-.07),.045,.045,y,.72,M.metal,'furniture',false);
  }
  function assembly(id,x,z,floor,yaw,build,metadata={}){
    const first=groups.furniture.children.length;build();
    const group=new T.Group();group.name=id;group.add(...groups.furniture.children.slice(first));
    group.position.set(x,floor,z);group.rotation.y=yaw;group.userData={...metadata,id};groups.furniture.add(group);furnitureAssets.push(group);return group;
  }
  function chair(x,z,floor=0,facing='west',id='chair') {
    const yaw={west:0,east:Math.PI,north:-Math.PI/2,south:Math.PI/2}[facing];
    return assembly(id,x,z,floor,yaw,()=>{
      box(0,0,.46,.46,.4,.09,M.soft,'furniture').name='seat';
      box(.21,0,.065,.46,.46,.42,M.soft,'furniture').name='back';
      for(const a of [-1,1])for(const b of [-1,1])box(a*.16,b*.16,.035,.035,0,.4,M.metal,'furniture',false);
    },{type:'chair',facing});
  }
  function round(x,z,r,base,h,material,group='furniture'){return cylinder(x,z,r,base,h,material,group);}

  // Single metric building: horizontal coordinates x/east, z/south; y/elevation.
  // The plate everything stands on: a paler glass than the floors, so the building reads as set down on it.
  const plinth=M.slab.clone();plinth.color.set(0x2f6c8c);materialSet.add(plinth);
  box(0,0,12.9,8.4,-2.5,.16,plinth);
  box(0,0,12.5,8,2.8,.12,M.slab,'roof');
  box(-3.65,(-4+m.front)/2,5.2,m.front+4,SITE.poolBottom-.14,.14,M.wet,'structure',true,'habitat');
  box(-3.65,(m.front+.8)/2,5.2,m.deck,-.15,.15,M.wet,'structure',true,'habitat');
  box(.5125,-1.6,3.125,4.8,m.office-.14,.14,M.floor,'structure',true,'office');
  // Every floor at ±0.00 shares one finish: the polished one that mirrors what stands on it.
  const livingFinish=M.floor.clone();materialSet.add(livingFinish);
  box(.5125,.325,3.125,.95,-.15,.15,livingFinish,'structure',true,'office');
  box(0,2.4,12.5,3.2,-.16,.16,livingFinish,'structure',true,'living').name='living-floor';
  // Recessed cultivation well. Its cylinders cross the service-floor level.
  box(2.97,-2.5,1.79,2.9,m.office-.14,.14,M.floor,'structure',true,'support');
  box(5.0575,-1.6,2.385,4.8,-.15,.15,livingFinish,'structure',true,'support');
  box(2.97,-.125,1.79,1.85,-.15,.15,livingFinish,'structure',true,'support');
  box(2.97,-3.925,1.79,.15,-.15,.15,M.slab);
  // Fine joints give the polished floors a real, metre-scaled surface.
  function floorJoints(x1,z1,x2,z2,y){
    for(let x=Math.ceil(x1);x<x2;x++){
      const joint=line([[x,y+.009,z1],[x,y+.009,z2]],0x87b0bd,'dimensions');joint.material.transparent=true;joint.material.opacity=.12;
    }
    for(let z=Math.ceil(z1);z<z2;z++){
      const joint=line([[x1,y+.009,z],[x2,y+.009,z]],0x87b0bd,'dimensions');joint.material.transparent=true;joint.material.opacity=.12;
    }
  }
  floorJoints(-6.18,.86,6.18,3.93,0);floorJoints(-.98,-3.93,2.0,-.15,m.office);floorJoints(3.95,-3.93,6.18,.73,0);
  outerWall('west',-6.25,-4,-6.25,4,-2.2,5);
  outerWall('north',-6.25,-4,6.25,-4,-2.2,5);
  outerWall('east',6.25,-4,6.25,4,-.15,2.95);
  outerWall('south',-6.25,4,-2.1,4);outerWall('south',-1.0,4,6.25,4);
  // Retaining faces reveal the actual pool and office drops in section.
  wall(-6.25,m.front,-1.05,m.front,-2.2,2.2,M.wall,'structure',.1);
  wall(-1.05,.8,2.075,.8,m.office,-m.office,M.wall,'structure',.12);
  glass(-1.05,-4,-1.05,.8,-2.2,5);
  glass(2.075,-4,2.075,-.15,m.office,2.8-m.office);
  // Solid backing retains the service deck beside the cultivation well.
  const backing=wall(3.865,-4,3.865,-1.05,m.office,2.8-m.office,M.panel,'structure',.15);
  backing.name='cultivation-backing';backing.userData.cutawayHeight=1.65;backing.userData.edge.userData.cutawayHeight=1.65;
  const wellEnd=wall(2.075,-1.05,3.865,-1.05,m.office,-m.office,M.wall,'structure',.15);wellEnd.name='well-retaining-end';
  // Upper-side service hatches belong to the equipment, not the cutaway shell.
  for(const z of [-3.2,-1.95])box(3.948,z,.025,.62,.25,.65,M.metal,'equipment');
  glass(-6.25,.8,-4.7,.8);glass(-3.5,.8,-1.05,.8);
  // Sliding panel shown parked clear of a 1.2m doorway.
  glass(-5.9,.86,-4.72,.86,0,2.2);
  glass(-1.05,.8,-.55,.8);glass(.45,.8,3.0,.8);glass(4.0,.8,6.25,.8);
  glass(.45,.86,1.35,.86,0,2.2);glass(4.0,.86,4.9,.86,0,2.2);
  // 10 risers / 270mm going, with upper and lower landings.
  for(let i=0;i<10;i++) {
    const top=-(i+1)*m.riser;
    const stair=box(1.35,-.15-(i+.5)*.27,1.0,.27,m.office-.1,top-m.office+.1,M.slab);
    Object.assign(stair.userData,{kind:'stair',index:i,top,riser:m.riser});
    if(i%3===0)cylinder(.82,-.15-(i+.5)*.27,.018,top,.9,M.metal,'structure',8);
  }
  tube([[.82,.9,-.15],[.82,m.office+.9,-2.85]],.021,PALETTE.metal,'structure');
  glass(-1.0,-.15,.8,-.15,0,1.0);
  tube([[3.91,1,-3.8],[3.91,1,-1.05],[2.15,1,-1.05]],.022,PALETTE.metal,'structure');
  for(const z of [-3.7,-2.4,-1.05])cylinder(3.91,z,.018,0,1,M.metal,'structure',8);
  box(-1.02,-1.6,.025,4.65,-2.16,.025,M.glow,'glass',false);
  box(2.105,-2.5,.025,2.8,m.office+.025,.025,M.glow,'glass',false);

  // Submerged shelf + short emergence ramp. Lutie swims up from the deep pool.
  box(-4.65,m.front-.83,2.7,1.65,-2.2,1.75,M.wet);
  const rampX=[-4.95,-3.65],start=m.front-1.5,end=m.front;
  const vertices=new Float32Array([rampX[0],-.45,start,rampX[1],-.45,start,rampX[1],0,end,rampX[0],0,end]);
  const rampGeo=new T.BufferGeometry();rampGeo.setAttribute('position',new T.BufferAttribute(vertices,3));rampGeo.setIndex([0,2,1,0,3,2]);rampGeo.computeVertexNormals();
  const rampMaterial=M.wet.clone();rampMaterial.side=T.DoubleSide;materialSet.add(rampMaterial);
  const ramp=new T.Mesh(rampGeo,rampMaterial);groups.structure.add(ramp);ramp.receiveShadow=true;
  for(let i=1;i<10;i++){const t=i/10;line([[rampX[0]+.07,-.45+.45*t+.006,start+1.5*t],[rampX[1]-.07,-.45+.45*t+.006,start+1.5*t]],0x758980,'structure');}
  // Two distinct surfaces: small reflected ripples above, depth-coloured volume below.
  const {normals,caustics}=createWaterTextures();for(const texture of [normals,caustics])textures.add(texture);
  const surfaceMaterial=new T.MeshPhysicalMaterial({color:0x6fd6dc,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide,roughness:.13,metalness:0,clearcoat:.15,clearcoatRoughness:.2,normalMap:normals,normalScale:new T.Vector2(.14,.14),envMapIntensity:.85,specularIntensity:1,emissive:0x17a9b8,emissiveIntensity:.1});materialSet.add(surfaceMaterial);
  surfaceMaterial.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.rgb+=totalSpecular*(1.-diffuseColor.a)/max(diffuseColor.a,.05)*.65;');
  };
  surfaceMaterial.customProgramCacheKey=()=> 'water-reflection-v1';
  const water=box(-3.6,(-3.82+m.front)/2,4.94,m.front+3.82,m.water-.018,.018,surfaceMaterial,'water',false);water.name='pool-surface';water.castShadow=false;water.renderOrder=4;
  water.geometry.setIndex(Array.from(water.geometry.index.array).slice(12,18));water.geometry.clearGroups();
  const volume=box(-3.6,(-3.82+m.front)/2,4.94,m.front+3.82,-2.2,m.water+2.2,mat(0xffffff,{vertexColors:true,transparent:true,opacity:.42,depthWrite:false,side:T.FrontSide,roughness:.4,emissive:0x0a6682,emissiveIntensity:.22}),'water',false);
  // The volume has no second top face competing with the optical water surface.
  const indices=Array.from(volume.geometry.index.array);volume.geometry.setIndex([...indices.slice(0,12),...indices.slice(18)]);volume.geometry.clearGroups();
  volume.name='pool-volume';volume.castShadow=false;volume.renderOrder=3;
  const points=volume.geometry.attributes.position,colors=new Float32Array(points.count*3),deep=new T.Color(0x094a6a),shallow=new T.Color(0x35c2cf);
  for(let i=0;i<points.count;i++){const t=(points.getY(i)/(m.water+2.2))+.5,c=deep.clone().lerp(shallow,t);colors.set([c.r,c.g,c.b],i*3);}volume.geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  // The net of light is thin and bright: it is what says "water" from across the room.
  const causticMaterial=new T.MeshBasicMaterial({map:caustics,transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-1});causticMaterial.color.multiplyScalar(1.3);materialSet.add(causticMaterial);
  // A second, finer net lies just under the surface and drifts the other way, so the surface itself reads as lit.
  const sheen=caustics.clone();sheen.repeat.set(2.3,1.9);sheen.needsUpdate=true;textures.add(sheen);
  const sheenMaterial=new T.MeshBasicMaterial({map:sheen,transparent:true,opacity:.2,depthWrite:false,blending:T.AdditiveBlending});materialSet.add(sheenMaterial);
  const surfaceNet=new T.Mesh(new T.PlaneGeometry(4.91,m.front+3.8),sheenMaterial);surfaceNet.rotation.x=-Math.PI/2;surfaceNet.position.set(-3.6,m.water-.03,(-3.82+m.front)/2);surfaceNet.renderOrder=4;groups.water.add(surfaceNet);
  const floorLight=new T.Mesh(new T.PlaneGeometry(4.91,m.front+3.8),causticMaterial);floorLight.rotation.x=-Math.PI/2;floorLight.position.set(-3.6,-2.185,(-3.82+m.front)/2);groups.water.add(floorLight);
  const shelfLight=new T.Mesh(new T.PlaneGeometry(2.68,1.63),causticMaterial);shelfLight.rotation.x=-Math.PI/2;shelfLight.position.set(-4.65,-.442,m.front-.83);groups.water.add(shelfLight);
  // Keep caustic scale in metres: the shallow shelf must not squeeze a whole pool's pattern onto itself.
  const shelfPositions=shelfLight.geometry.attributes.position,shelfUvs=shelfLight.geometry.attributes.uv;
  for(let i=0;i<shelfPositions.count;i++){
    const x=shelfPositions.getX(i)+shelfLight.position.x,z=shelfLight.position.z-shelfPositions.getY(i);
    shelfUvs.setXY(i,(x+6.055)/4.91,((m.front-3.82)/2-z)/(m.front+3.8)+.5);
  }
  const poolGlow=new T.PointLight(0x72d4df,5,7,2);poolGlow.position.set(-3.5,-.9,-1.9);groups.water.add(poolGlow);
  for(const x of [-6.12,-1.13]){
    const wash=new T.Mesh(new T.PlaneGeometry(m.front+3.8,m.water+2.2),causticMaterial);wash.rotation.y=x<-3?Math.PI/2:-Math.PI/2;
    wash.position.set(x,(m.water-2.2)/2,(-3.82+m.front)/2);groups.water.add(wash);
  }
  // The body of water has its own contour: the meniscus clearest, its depth fainter.
  const meniscus=createContour(boxSegments(4.94,m.water+2.2,m.front+3.82,{top:1,post:.6,foot:.3}),contourMaterials.water);
  meniscus.position.set(-3.6,(m.water-2.2)/2+.01,(-3.82+m.front)/2);meniscus.name='meniscus';groups.water.add(meniscus);
  // Privacy alcove under an overhang, represented as a real enclosed hollow.
  const archGeometry=new T.TorusGeometry(.47,.17,12,40,Math.PI),archPoints=archGeometry.attributes.position;
  for(let i=0;i<archPoints.count;i++){
    const x=archPoints.getX(i),y=archPoints.getY(i),z=archPoints.getZ(i),variation=1+.055*Math.sin(x*19+y*13+z*7);
    archPoints.setXYZ(i,x*variation,y*variation,z*variation);
  }
  archGeometry.computeVertexNormals();const shelter=new T.Mesh(archGeometry,M.rock);shelter.position.set(-5.45,-1.87,-3.13);shelter.scale.set(1.08,1.1,2.3);shelter.castShadow=true;shelter.receiveShadow=true;groups.furniture.add(shelter);
  const shelterBack=new T.Mesh(new T.SphereGeometry(.6,24,16),M.rock);shelterBack.scale.set(1,.8,.22);shelterBack.position.set(-5.45,-1.87,-3.49);groups.furniture.add(shelterBack);
  // A few grains in the rock catch the light, slowly.
  const scatter=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const grainCount=9,grainAt=new Float32Array(grainCount*3),grainPhase=new Float32Array(grainCount);
  for(let i=0;i<grainCount;i++){
    const around=Math.PI*(.12+.76*scatter(i)),across=(scatter(i+40)-.5)*2.6,ring=.47+.19*Math.cos(across);
    grainAt.set([-5.45+Math.cos(around)*ring*1.08,-1.87+Math.sin(around)*ring*1.1,-3.13+Math.sin(across)*.19*2.3],i*3);grainPhase[i]=scatter(i+80);
  }
  const grainGeometry=new T.BufferGeometry();grainGeometry.setAttribute('position',new T.BufferAttribute(grainAt,3));grainGeometry.setAttribute('phase',new T.BufferAttribute(grainPhase,1));
  const grains=new T.Points(grainGeometry,createSparkMaterial(0xbdf6ff,{size:3}));materialSet.add(grains.material);groups.furniture.add(grains);
  // Wet edge: a small fixed table, with the main dry seating across the door.
  box(-2.3,(m.front+.8)/2,.66,.42,.42,.06,M.white,'furniture');
  for(const a of [-1,1])for(const b of [-1,1])cylinder(-2.3+a*.25,(m.front+.8)/2+b*.14,.025,0,.42,M.metal,'furniture');
  table(-.68,-1.9,.58,1.7,m.office);chair(.1,-1.85,m.office,'west','observer-chair');
  box(-.77,-2.4,.045,.65,m.office+.83,.35,M.dark,'furniture');
  box(-.742,-2.4,.008,.55,m.office+.87,.25,M.screen,'furniture',false);
  box(-.45,-3.67,.9,.38,m.office,.9,M.white,'furniture');
  // Cultivation columns deliberately descend beside the observation room.
  // Their medium is lit from within; samples hang in it and fine bubbles rise past them.
  const medium=new T.MeshPhysicalMaterial({color:0x58e2ea,transparent:true,opacity:.4,depthWrite:false,roughness:.25,metalness:0,emissive:0x1cc4d6,emissiveIntensity:.42});materialSet.add(medium);addSurfaceRim(medium,'cyan',1.1);
  const bubbleMaterial=createSparkMaterial(0xd6fbff,{size:3});materialSet.add(bubbleMaterial);
  const bubbles=[];
  for(const z of [-3.2,-1.95]){
    cylinder(2.94,z,.43,m.office,.13,M.metal);
    cylinder(2.94,z,.405,m.office+.13,2.85,M.vessel,'glass').castShadow=false;
    cylinder(2.94,z,.38,m.office+.15,2.57,medium,'water').castShadow=false;
    cylinder(2.94,z,.43,m.office+2.98,.1,M.brass);
    for(const h of [.5,1.15,1.8]){
      const sample=new T.Mesh(new T.SphereGeometry(.085,20,14),M.glow);sample.position.set(2.94,m.office+h,z);groups.equipment.add(sample);
    }
    cylinder(2.94,z,.414,m.office+.14,.035,M.glow);
    cylinder(2.94,z,.414,m.office+2.93,.035,M.glow);
    const count=16,rise=new Float32Array(count*3),phase=new Float32Array(count);
    for(let i=0;i<count;i++){const a=i*2.399963,r=.09+.22*((i*.618034)%1);rise.set([Math.cos(a)*r,0,Math.sin(a)*r],i*3);phase[i]=(i*.381966+z)%1;if(phase[i]<0)phase[i]+=1;}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(rise,3));geometry.setAttribute('phase',new T.BufferAttribute(phase,1));
    const cloud=new T.Points(geometry,bubbleMaterial);cloud.position.set(2.94,m.office+.2,z);cloud.frustumCulled=false;groups.water.add(cloud);bubbles.push(cloud);
  }
  const cultivationLight=new T.PointLight(0x79dce6,3.4,4.5,2);cultivationLight.position.set(2.94,m.office+1.9,-2.6);groups.equipment.add(cultivationLight);
  table(4.9,-3.48,2.0,.62);
  for(const x of [4.5,5.15])cylinder(x,-2.2,.28,0,1.1,M.metal);
  const boiler=cylinder(5.55,-.35,.39,0,1.28,M.brass);boiler.name='sealed-boiler';
  const dome=new T.Mesh(new T.SphereGeometry(.39,32,16,0,Math.PI*2,0,Math.PI/2),M.brass);dome.position.set(5.55,1.28,-.35);dome.name='boiler-dome';groups.equipment.add(dome);dome.castShadow=true;
  cylinder(5.55,-.35,.41,.07,.08,M.metal);cylinder(5.55,-.35,.07,1.65,.16,M.metal);
  const gauge=new T.Mesh(new T.CircleGeometry(.1,24),M.white);gauge.rotation.y=Math.PI;gauge.position.set(5.55,.91,-.748);groups.equipment.add(gauge);
  line([[5.55,.91,-.75],[5.6,.96,-.75]],0x415350,'equipment');
  box(4.55,-.25,.8,.6,0,1.0,M.white,'equipment');
  tube([[5.55,1.81,-.35],[5.55,1.81,-1.3],[5.15,1.3,-2.2],[5.15,1.1,-2.2]],.035);
  tube([[4.5,1.1,-2.2],[4.15,1.1,-2.2],[4.15,.28,-3.5],[3.4,.28,-3.5]],.03);

  // South: independent domestic program with a compact sanitary room.
  assembly('sofa',-4.4,3.35,0,0,()=>{
    box(0,0,2.5,.82,.12,.28,M.wood,'furniture').name='sofa-base';
    box(0,.34,2.5,.16,.4,.48,M.soft,'furniture').name='sofa-back';
    for(const side of [-1,1]){
      box(side*1.16,0,.18,.82,.4,.25,M.soft,'furniture').name=side<0?'arm-left':'arm-right';
      box(side*.53,-.04,1.02,.57,.4,.14,M.soft,'furniture').name='seat-cushion';
      box(side*.53,.23,1.02,.16,.54,.3,M.soft,'furniture').name='back-cushion';
      const pillow=box(side*.81,.08,.32,.17,.57,.25,M.linen,'furniture',false);pillow.rotation.z=side*.12;
    }
    for(const x of [-1.05,1.05])for(const z of [-.27,.27])box(x,z,.075,.075,0,.12,M.metal,'furniture',false);
  },{type:'sofa',width:2.5,depth:.82});
  round(-4.25,2.25,.26,0,.31,M.dark);round(-4.25,2.25,.425,.31,.016,M.brass);round(-4.25,2.25,.42,.326,.034,M.wood);chair(-2.8,2.3,0,'west','lounge-chair');
  round(-5.88,3.1,.15,0,.035,M.brass);round(-5.88,3.1,.014,.035,1.23,M.brass);
  const shade=new T.Mesh(new T.SphereGeometry(.095,24,16),M.warm);shade.position.set(-5.88,1.29,3.1);groups.furniture.add(shade);
  const loungeLight=new T.PointLight(0xffd45f,3.6,3.4,2);loungeLight.position.set(-5.7,1.25,3.04);groups.furniture.add(loungeLight);
  box(.7,3.65,2.7,.58,0,.86,M.dark,'furniture').name='kitchen-base';box(.7,3.65,2.75,.63,.86,.055,M.wood,'furniture');
  for(const x of [-.17,.7,1.57]){box(x,3.354,.82,.018,.12,.65,M.panel,'furniture',false);box(x,3.338,.32,.016,.68,.012,M.brass,'furniture',false);}
  box(.08,3.65,.48,.35,.918,.018,M.metal,'furniture');
  tube([[.08,.94,3.87],[.08,1.18,3.87],[.08,1.18,3.71]],.018,PALETTE.metal,'furniture');
  for(const x of [1.2,1.65])round(x,3.65,.115,.918,.012,M.dark);
  table(.5,2.1,1.3,.7);chair(-.55,2.1,0,'east','dining-west');chair(1.55,2.1,0,'west','dining-east');
  // Bedroom entrance on the north; privacy walls are physical, not a screen.
  wall(2.65,1.7,2.65,4);wall(2.65,2.1,3.1,2.1);wall(3.95,2.1,6.25,2.1);
  assembly('bed',4.65,3.05,0,0,()=>{
    box(0,0,2,1.3,0,.28,M.wood,'furniture');box(0,0,1.96,1.26,.28,.2,M.soft,'furniture');
    box(1.02,0,.12,1.3,.28,.55,M.wood,'furniture');
    box(-.22,0,1.45,1.26,.46,.055,M.linen,'furniture',false);
    for(const z of [-.31,.31])box(.68,z,.36,.52,.48,.12,M.linen,'furniture');
  },{type:'bed',width:2,depth:1.3});
  box(5.95,2.55,.4,.45,0,.5,M.wood,'furniture');
  round(5.95,2.55,.1,.5,.035,M.brass);round(5.95,2.55,.018,.53,.27,M.brass);
  const bedsideOrb=new T.Mesh(new T.SphereGeometry(.085,24,16),M.warm);bedsideOrb.position.set(5.95,.88,2.55);groups.furniture.add(bedsideOrb);
  const bedsideLight=new T.PointLight(0xffd15a,3,3.5,2);bedsideLight.position.set(5.8,1.05,2.5);groups.furniture.add(bedsideLight);
  // Bathroom access: sliding door in its south-west edge.
  wall(4.45,.8,4.45,1.2);wall(4.45,1.9,4.45,2.1);
  glass(5.35,.88,5.35,2.02,0,2.2);
  box(5.75,1.45,.76,1.0,0,.05,M.white,'furniture');
  round(4.87,1.22,.19,0,.4,M.white);box(4.87,1.0,.34,.18,0,.65,M.white,'furniture');
  box(4.85,1.92,.46,.28,.65,.12,M.white,'furniture');
  // Scale figure at the seated eye height used by the camera.
  // It is a projection of a person, not a piece of furniture: light at its outline, clear within.
  const humanMaterial=createHologramMaterial(0x8fe6f2,{body:.34,rim:1.6,power:2,opacity:.42});materialSet.add(humanMaterial);
  const figure=(geometry,x,y,z,lean=0)=>{const part=new T.Mesh(geometry,humanMaterial);part.position.set(x,y,z);part.rotation.z=lean;groups.furniture.add(part);return part;};
  figure(new T.SphereGeometry(.105,24,16),.18,m.eye-.015,-1.85);
  figure(new T.CapsuleGeometry(.13,.25,6,16),.19,m.office+.715,-1.85);
  for(const z of [-1.95,-1.75]){
    figure(new T.CapsuleGeometry(.065,.22,4,12),.03,m.office+.49,z,Math.PI/2);
    figure(new T.CapsuleGeometry(.055,.32,4,12),-.11,m.office+.215,z);
  }
  // 1.2m Lutie proxy. Bell + flowing body, intentionally a scale maquette — and the one thing here that glows of itself.
  const lutie=new T.Group(),top=m.water-.12,foot=top-1.2;
  const gel=createHologramMaterial(0xa8ffe6,{body:.62,rim:1.8,power:1.7,opacity:.62});materialSet.add(gel);
  const bell=new T.Mesh(new T.SphereGeometry(.29,32,20,0,Math.PI*2,0,Math.PI*.56),gel);bell.position.set(-3.25,top-.29,-2.05);lutie.add(bell);
  const body=new T.Mesh(new T.CylinderGeometry(.12,.23,.85,24,1,true),gel);body.position.set(-3.25,foot+.425,-2.05);lutie.add(body);
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2+.4;
    const mesh=new T.Mesh(new T.SphereGeometry(.05,12,8),gel);mesh.scale.set(.6,5.4,.6);mesh.position.set(-3.25+Math.cos(a)*.2,foot+.24,-2.05+Math.sin(a)*.2);lutie.add(mesh);
  }
  const heartMaterial=new T.MeshBasicMaterial({color:0xb4ffe8});heartMaterial.color.multiplyScalar(2.4);materialSet.add(heartMaterial);
  const heart=new T.Mesh(new T.SphereGeometry(.06,16,12),heartMaterial);heart.position.set(-3.25,top-.36,-2.05);lutie.add(heart);
  const herLight=new T.PointLight(0x8ff5dc,2.2,3.4,2);herLight.position.set(-3.25,top-.5,-2.05);lutie.add(herLight);
  groups.furniture.add(lutie);

  // Optional relationship overlays. They are diagrams, not fluid simulations.
  const stairPoints=Array.from({length:11},(_,i)=>[1.35,-m.riser*i+.08,-.15-.27*i]);
  line([[-1.55,.08,4.25],[-1.55,.08,1.25],[1.35,.08,.3],...stairPoints,[.3,m.office+.08,-3.15],[.3,m.office+.08,-1.8]],0xaf7748,'human',true,true);
  line([[-1.55,.08,1.25],[-4.1,.08,1.25],[-4.1,.08,.2]],0xaf7748,'human',true,true);
  line([[-3.25,foot+.6,-2.05],[-4.25,-.28,m.front-1.6],[-4.25,-.28,m.front-1.5],[-4.25,.08,m.front],[-2.9,.08,(m.front+.8)/2]],0x377f77,'lutie',true,true);
  line([[-5.4,-2.31,-2.9],[-5.4,-2.31,-3.6],[5.55,-2.31,-3.6],[5.55,.35,-.35]],0x417e9b,'plumbing',true,true);
  line([[4.5,.5,-2.2],[4.5,-2.31,-2.9],[-1.5,-2.31,-2.9],[-1.5,-.6,-1.6]],0x8a9657,'plumbing',true,true);
  // Architectural dimensions, all in real metres.
  function dim(a,b,title,position){line([a,b]);for(const p of [a,b])line([[p[0]-.08,p[1],p[2]-.08],[p[0]+.08,p[1],p[2]+.08]]);label(title,position,'dimension');}
  dim([-6.25,.03,4.65],[6.25,.03,4.65],'12.50 m',[0,.04,4.85]);
  dim([-6.95,.03,-4],[-6.95,.03,4],'8.00 m',[-7.2,.04,0]);
  dim([-5.75,.05,m.front],[-5.75,.05,.8],`${m.deck.toFixed(2)} m`,[-5.9,.12,(m.front+.8)/2]);
  label('01  水域与亲水台',[-4.25,.45,-1.8],'room','habitat');
  label('02  错层观察室',[.2,.45,-2.25],'room','office');
  label('03  维生与培育区',[4.9,.5,-1.25],'room','support');
  label('04  人类生活区',[-1.5,.5,2.4],'room','living');
  label('Lutie · 1.20 m',[-3.25,top+.18,-2.05],'detail','habitat');
  label('隐蔽休息区',[-5.4,-.85,-3.1],'detail','habitat');
  label('短坡 / 水下浅台',[-4.3,.12,m.front-.7],'detail','habitat');
  label('10 级楼梯',[1.35,.5,-1.5],'detail','office');
  label('下沉培育井',[2.94,1.5,-2.6],'detail','support');
  label('过滤 / 换热',[5.2,1.65,-.3],'detail','support');
  label('卫生间',[5.1,1.15,1.4],'detail','living');
  label('卧室',[4.7,.75,3.1],'detail','living');
  label('入口',[-1.55,.12,4.08],'detail','living');

  const sectionGeometry=new T.BufferGeometry().setFromPoints([new T.Vector3(-6.4,-2.4,0),new T.Vector3(-6.4,1.25,0),new T.Vector3(6.4,1.25,0),new T.Vector3(6.4,-2.4,0)]);
  const sectionFrame=new T.Line(sectionGeometry,new T.LineDashedMaterial({color:0xb5774b,dashSize:.13,gapSize:.1,depthTest:false}));sectionFrame.computeLineDistances();sectionFrame.renderOrder=25;groups.section.add(sectionFrame);
  const selection=new T.LineLoop(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x946a3f,depthTest:false}));selection.renderOrder=22;groups.selection.add(selection);
  const capMaterial=new T.MeshBasicMaterial({color:0x849387,side:T.DoubleSide});
  const waterCapMaterial=new T.MeshBasicMaterial({color:0x429b9d,transparent:true,opacity:.44,depthWrite:false,side:T.DoubleSide});
  function sectionCaps(z){
    for(const child of [...groups.caps.children]){child.geometry.dispose();groups.caps.remove(child);}
    for(const mesh of sectionBoxes){
      const {width,height,depth}=mesh.geometry.parameters;
      if(z<=mesh.position.z-depth/2||z>=mesh.position.z+depth/2)continue;
      const cap=new T.Mesh(new T.PlaneGeometry(width,height),capMaterial);cap.position.set(mesh.position.x,mesh.position.y,z+.008);groups.caps.add(cap);
    }
    if(z>-3.82&&z<m.front){
      const waterSection=new T.Mesh(new T.PlaneGeometry(4.94,m.water+2.2),waterCapMaterial);waterSection.position.set(-3.6,(m.water-2.2)/2,z+.003);waterSection.name='water-section';groups.caps.add(waterSection);
    }
  }
  // Generate a complete, consistent contour treatment from geometry.
  root.updateMatrixWorld(true);
  const manufactured=[];
  root.traverse(object=>{
    if(!object.isMesh||!object.material.isMeshPhysicalMaterial||object.material===M.rock)return;
    let group=object;while(group.parent&&group.parent!==root)group=group.parent;
    if(!['structure','furniture','equipment','glass','roof'].includes(group.name))return;
    const world=object.getWorldPosition(new T.Vector3());
    object.userData.contourTone=group.name==='furniture'&&world.z>=.8?'amber':'cyan';
    if(object.geometry.type==='BoxGeometry'&&object.material.userData.opticalDensity!==undefined)object.userData.contourRole='panel';
    else if(group.name==='glass'&&object.material.userData.opticalDensity===undefined&&object.material.name!=='vessel')object.userData.contourRole='frame';
    else if(group.name==='structure'&&(object.userData.kind==='stair'||object.geometry.parameters?.height<.2||object.material===M.wet))object.userData.contourRole='slab';
    manufactured.push(object);
  });
  for(const mesh of manufactured){
    let contour=mesh.userData.edge;
    if(mesh.userData.contourRole==='frame'){
      if(contour){contour.parent.remove(contour);contour.geometry.dispose();delete mesh.userData.edge;}continue;
    }
    if(!contour&&['BoxGeometry','CylinderGeometry'].includes(mesh.geometry.type)){
      const bounds=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).getSize(new T.Vector3());
      if(Math.min(bounds.x,bounds.y,bounds.z)>.055){const p=mesh.geometry.parameters;contour=edge(mesh,mesh.geometry.type==='BoxGeometry'?[p.width,p.height,p.depth]:null);}
    }
    if(contour){
      const segments=architecturalSegments(mesh);if(segments)setContourSegments(contour,segments);
      contour.material=contourMaterials[mesh.userData.contourTone];
      // Exterior walls have independent camera-dependent cuts; never share their contour material.
      if(outerWalls.some(wall=>wall.mesh===mesh)){contour.material=contour.material.clone();materialSet.add(contour.material);}
      contour.userData.contourTone=mesh.userData.contourTone;
      contour.userData.cutawayHeight=mesh.userData.cutawayHeight??null;
    }
  }
  // Cutaway policy belongs to each architectural part, never to shared furniture materials.
  // How much each finish turns to light at a rounded silhouette, and at the border of a flat face.
  const RIM={soft:.7,linen:.7,glass:.85,vessel:1.5,metal:.5},EDGE={wall:.17,glass:.1,slab:.12,floor:.09,wet:.1,panel:.11,metal:.08,brass:.08,white:.09,wood:.1,dark:.07};
  const policyMaterials=new Map(),clippingTargets=[],cutSources=[];
  root.traverse(object=>{
    if(!object.material)return;
    const original=object.material,height=object.userData.cutawayHeight??null,tone=object.userData.contourTone,key=`${original.uuid}/${height}/${tone||''}`;
    materialSet.add(original);
    if(!policyMaterials.has(key)){
      const copy=original.clone();copy.userData.cutawayHeight=height;copy.onBeforeCompile=original.onBeforeCompile;copy.customProgramCacheKey=original.customProgramCacheKey;
      if(tone&&copy.isMeshPhysicalMaterial){
        addSurfaceRim(copy,tone,RIM[original.name]??.36);
        if(EDGE[original.name])addEdgeLight(copy,tone,EDGE[original.name]);
      }
      policyMaterials.set(key,copy);materialSet.add(copy);clippingTargets.push({material:copy,cutawayHeight:height});
    }
    object.material=policyMaterials.get(key);
    // Drawing order, for a model in which nearly everything is see-through: what is stood on first, so nothing
    // on it is painted over; sheets of glass late, since each carries a picture of all that is behind it; and
    // contours last, so the ones in front of a sheet stay crisp.
    let group=object;while(group.parent&&group.parent!==root)group=group.parent;
    if(object.userData.contour)object.renderOrder=8;
    else if(original.userData.opticalDensity!==undefined)object.renderOrder=6;
    else if(group.name==='structure'&&object.isMesh)object.renderOrder=-3;
    if(object.isMesh&&object.geometry.type==='BoxGeometry'&&height!==null)cutSources.push(object);
  });
  // Where the cutaway cuts a wall, the cut is marked: a rim on everything, and the faintest face of light on solid stock.
  const wallCapMaterial=new T.MeshBasicMaterial({color:0xb6edf5,transparent:true,opacity:.05,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}),wallCaps=[];materialSet.add(wallCapMaterial);
  const rimMaterial=createContourMaterial('cyan');rimMaterial.userData.contourGain=1.12;materialSet.add(rimMaterial);
  for(const source of cutSources){
    const {width,height,depth}=source.geometry.parameters,outer=outerWalls.find(w=>w.mesh===source),cutawayHeight=source.userData.cutawayHeight;
    if(!outer&&(cutawayHeight<=source.position.y-height/2||cutawayHeight>=source.position.y+height/2))continue;
    const cap=new T.Group(),x=width/2,z=depth/2,thin=Math.min(width,depth)<.06;
    cap.position.set(source.position.x,cutawayHeight+.002,source.position.z);groups.wallCaps.add(cap);
    if(!source.material.transparent||source.material.userData.presentationOpacity!==undefined){
      const face=new T.Mesh(new T.PlaneGeometry(width,depth),wallCapMaterial);face.rotation.x=-Math.PI/2;face.renderOrder=7;cap.add(face);
    }
    const run=thin?(width>depth?[-x,0,0,x,0,0,1]:[0,0,-z,0,0,z,1]):[[-x,-z],[x,-z],[x,z],[-x,z]].flatMap((p,i,c)=>[p[0],0,p[1],c[(i+1)%4][0],0,c[(i+1)%4][1],1]);
    const rim=createContour(run,rimMaterial);setContourCenter(rim,[0,-2,0]);rim.renderOrder=8;cap.add(rim);
    wallCaps.push({source,cap,cutawayHeight,outer});
  }
  function select(id){const room=ROOMS.find(r=>r.id===id);groups.selection.visible=Boolean(room);if(!room)return;const [a,b,c,d]=room.bounds;const y=id==='office'?m.office+.02:.035;selection.geometry.dispose();selection.geometry=new T.BufferGeometry().setFromPoints([[a,y,b],[c,y,b],[c,y,d],[a,y,d]].map(v=>new T.Vector3(...v)));}
  function dispose(){root.traverse(o=>{o.geometry?.dispose();});materialSet.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());capMaterial.dispose();waterCapMaterial.dispose();}
  function animate(seconds){
    normals.offset.set(seconds*.008,seconds*.004);caustics.offset.set(seconds*.006,seconds*.003);sheen.offset.set(-seconds*.004,seconds*.005);
    for(const cloud of bubbles){
      const at=cloud.geometry.attributes.position,phase=cloud.geometry.attributes.phase;
      for(let i=0;i<at.count;i++){const k=phase.getX(i);at.setY(i,((seconds*(.05+.05*k)+k*9)%1)*2.4);}
      at.needsUpdate=true;
    }
    grains.material.uniforms.time.value=seconds;
  }
  return {root,groups,materials:materialSet,clippingTargets,wallCaps,furnitureAssets,selectable,labels,outerWalls,metrics:m,select,dispose,animate,eye:new T.Vector3(.18,m.eye,-1.85),target:new T.Vector3(-3.25,m.eye,-2.05),sectionFrame,sectionCaps,water,volume};
}
