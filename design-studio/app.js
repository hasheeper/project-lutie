import * as T from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createFacility } from './model.js';
import { tuneContours, cutTop } from './contours.js';
import { createPresentation, createFloorReflection, addFloorReflection, createOpticalPanels, createLighting } from './rendering.js';
import { DEFAULTS, ROOMS, VERSION, normalize, metrics, checks, fmt, exportDesign } from './space.mjs';

const $=s=>document.querySelector(s);
const viewport=$('#viewport'),host=$('#canvas-host'),labelRoot=$('#model-labels');
let parameters={...DEFAULTS},mode='overview',selected=null,sectionZ=-1.2,dirty=true;
const preferences={furniture:true,equipment:true,water:true,glass:true,dimensions:false,fullWalls:false,avoidWalls:true,route:'none'};
try{const saved=JSON.parse(localStorage.getItem('lutie-space-study-v1'));if(saved?.version===VERSION)parameters=normalize(saved.parameters);}catch{}
const persist=()=>{try{localStorage.setItem('lutie-space-study-v1',JSON.stringify({version:VERSION,parameters}));}catch{}};
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});}
catch(error){$('#loading').hidden=true;$('#error-message').hidden=false;$('#error-message').textContent='无法启动 3D 渲染。请在支持 WebGL 的浏览器中打开本页，并启用硬件加速。';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x071a2a);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
renderer.localClippingEnabled=true;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','三维空间模型，可拖动旋转、滚轮缩放');renderer.domElement.setAttribute('role','img');
const scene=new T.Scene();
// Light, and the glow the lit plate lays on the ground round it, are the same wherever the model is shown (rendering.js).
const lighting=createLighting(renderer),halo=lighting.halo;lighting.addTo(scene);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x04182a,roughness:1,metalness:0,envMapIntensity:.08}));ground.rotation.x=-Math.PI/2;ground.position.y=-2.68;ground.receiveShadow=true;scene.add(ground);
const grid=new T.GridHelper(32,32,0x568090,0x365462);grid.position.y=-2.665;grid.material.transparent=true;grid.material.opacity=.16;scene.add(grid);
const presentation=createPresentation(renderer),floorReflection=createFloorReflection(renderer),opticalPanels=createOpticalPanels(renderer);
const ortho=new T.OrthographicCamera(-10,10,7,-7,.05,150);
const perspective=new T.PerspectiveCamera(64,1,.035,100);
let camera=ortho,controls=null,facility=null,labelNodes=[],elevationLabels=[],lastSize={w:0,h:0};
let eyeYaw=-Math.PI/2,eyePitch=0,pointerStart=null,eyeDrag=null;
let wallVisibilityKey='';
const raycaster=new T.Raycaster(),pointer=new T.Vector2();
const wallCut=new T.Plane(new T.Vector3(0,-1,0),1.1),crossCut=new T.Plane(new T.Vector3(0,0,-1),sectionZ);
const cutawayPlanes=new Map([[1.1,wallCut]]);
const VIEWS={
  overview:{code:'AXONOMETRIC / 01',title:'让空间关系清晰可见。',description:'半透明模型 · 下沉池体 · 错层观察',position:[-12,14,-16],target:[0,-.5,0],hint:'拖动旋转 · 滚轮缩放 · 右键平移'},
  plan:{code:'FLOOR PLAN / 02',title:'一个平面，四种生活。',description:'正交顶视 · 北向朝上 · 尺寸单位 m',position:[0,25,.001],target:[0,0,0],hint:'拖动平移 · 滚轮缩放 · 点选房间'},
  section:{code:'SECTION A—A / 03',title:'看见水面之下。',description:'东西向剖切 · 移动剖线检查标高',position:[0,1.3,24],target:[0,-.1,0],hint:'拖动平移 · 滚轮缩放 · 下方移动剖线'},
  eye:{code:'OBSERVER / 04',title:'坐在观察窗前。',description:'固定眼点 · 坐姿眼高 1.15 m',hint:'拖动转头 · 眼点位置保持固定'},
};
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3000);}

function updateReadings(){
  const m=metrics(parameters);
  for(const key of Object.keys(DEFAULTS)){
    $(`#param-${key}`).value=parameters[key];
    $(`#out-${key}`).innerHTML=`${key==='deck'?parameters[key].toFixed(2):fmt(parameters[key])} <small>m</small>`;
  }
  $('#read-depth').innerHTML=`${m.waterDepth.toFixed(2)} <small>m</small>`;
  $('#read-eye').innerHTML=`${fmt(m.eye)} <small>m</small>`;
  $('#checks').innerHTML=checks(parameters).map(c=>`<div class="check ${c.ok?'':'attention'}"><i>${c.ok?'✓':'↗'}</i><div><strong>${c.label}</strong><small>${c.note}</small></div></div>`).join('');
  $('#eye-note-text').textContent=m.immersion>0?`眼位 ${fmt(m.eye)} m · 水面下 ${m.immersion.toFixed(2)} m`:`眼位 ${fmt(m.eye)} m · 水面上 ${(-m.immersion).toFixed(2)} m`;
  $('#footer-metric').innerHTML=`12.50 × 8.00 m <b>／</b> 水面 ${m.waterArea.toFixed(1)} ㎡`;
}
function buildLabels(){
  labelRoot.replaceChildren();labelNodes=[];
  for(const item of facility.labels){const el=document.createElement('span');el.className=`model-label ${item.kind}`;el.textContent=item.text;labelRoot.append(el);labelNodes.push({...item,el});}
  const m=facility.metrics;
  elevationLabels=[
    {text:`水面 ${fmt(m.water)} m`,position:new T.Vector3(-4.7,m.water,sectionZ+.2)},
    {text:`池底 ${fmt(SITE_POOL_BOTTOM)} m`,position:new T.Vector3(-4.7,-2.2,sectionZ+.2)},
    {text:`地坪 ${fmt(m.office)} m`,position:new T.Vector3(.35,m.office,sectionZ+.2)},
    {text:`眼位 ${fmt(m.eye)} m`,position:new T.Vector3(.25,m.eye,sectionZ+.2)},
    {text:'生活层 ±0.00 m',position:new T.Vector3(5.1,0,sectionZ+.2)},
  ].map(item=>{const el=document.createElement('span');el.className='model-label elevation';el.textContent=item.text;labelRoot.append(el);return{...item,el};});
}
const SITE_POOL_BOTTOM=-2.2;
// What the look depends on outside the model: the size of the picture, and which view it is shown in.
// The overview is the presentation — contours carry light; the other views are drawings, and keep a plain line.
function tuneLook(){
  if(!facility||!lastSize.w)return;
  const ratio=renderer.getPixelRatio(),lit=mode==='overview';
  tuneContours(facility.materials,{width:lastSize.w*ratio,height:lastSize.h*ratio,line:ratio,gain:lit?1.15:mode==='eye'?.9:.6});
  for(const material of facility.materials)if(material.userData.spark)material.uniforms.pixelRatio.value=ratio;
  halo.visible=lit;
}
function applyLayers(){
  if(!facility)return;
  for(const key of ['furniture','equipment','water','glass'])facility.groups[key].visible=preferences[key];
  facility.groups.dimensions.visible=preferences.dimensions||mode==='plan';
  for(const name of ['human','lutie','plumbing'])facility.groups[name].visible=preferences.route===name&&mode!=='eye';
  facility.groups.section.visible=mode==='section';facility.groups.caps.visible=mode==='section';facility.groups.roof.visible=mode==='eye';
  facility.groups.selection.visible=Boolean(selected)&&mode!=='eye';
  crossCut.constant=sectionZ;
  const cutaway=!preferences.fullWalls&&(mode==='overview'||mode==='plan');
  for(const {material,cutawayHeight} of facility.clippingTargets){
    if(material.userData.presentationOpacity!==undefined){
      const transparent=mode==='overview'||mode==='plan';
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.opacity=transparent?material.userData.presentationOpacity:1;material.depthWrite=transparent?material.userData.presentationDepthWrite:true;
    }
    const planes=mode==='section'?[crossCut]:[];
    if(cutaway&&cutawayHeight!==null){
      if(!cutawayPlanes.has(cutawayHeight))cutawayPlanes.set(cutawayHeight,new T.Plane(new T.Vector3(0,-1,0),cutawayHeight));
      planes.push(cutawayPlanes.get(cutawayHeight));
    }
    material.clippingPlanes=planes;material.clipShadows=true;
    const light=material.userData.edgeLight;
    if(light){light.gain.value=mode==='overview'||mode==='plan'?light.strength:0;light.cut.value=cutTop(planes);}
  }
  tuneLook();
  facility.groups.wallCaps.visible=cutaway;
  wallVisibilityKey='';updateWallVisibility();
  $('#avoid-walls').disabled=preferences.fullWalls;
  facility.sectionFrame.position.z=sectionZ;
  if(mode==='section')facility.sectionCaps(sectionZ);
  grid.visible=mode==='plan'||preferences.dimensions;
  renderer.shadowMap.needsUpdate=true;dirty=true;
}
function updateWallVisibility(){
  if(!facility)return;
  const active=preferences.avoidWalls&&!preferences.fullWalls&&mode==='overview';
  const direction=camera.position.clone().sub(controls?.target||new T.Vector3(0,-.5,0));
  const x=Math.abs(direction.x)<.5?'':direction.x<0?'west':'east';
  const z=Math.abs(direction.z)<.5?'':direction.z<0?'north':'south';
  const key=`${mode}/${active}/${x}/${z}`;if(key===wallVisibilityKey)return;wallVisibilityKey=key;
  const regular=mode==='section'?[crossCut]:!preferences.fullWalls&&(mode==='overview'||mode==='plan')?[wallCut]:[];
  for(const wall of facility.outerWalls){
    const cut=active&&(wall.side===x||wall.side===z);
    const planes=cut?[...regular,wall.cut]:regular;
    wall.mesh.material.clippingPlanes=planes;wall.edge.material.clippingPlanes=planes;
    wall.mesh.material.clipShadows=true;
    const light=wall.mesh.material.userData.edgeLight;if(light)light.cut.value=cutTop(planes);
  }
  for(const item of facility.wallCaps){
    const height=active&&item.outer&&(item.outer.side===x||item.outer.side===z)?item.outer.cut.constant:item.cutawayHeight;
    const half=item.source.geometry.parameters.height/2;
    item.cap.visible=height>item.source.position.y-half&&height<item.source.position.y+half;
    item.cap.position.y=height+.002;
  }
  renderer.shadowMap.needsUpdate=true;dirty=true;
}
function rebuild(){
  if(facility){scene.remove(facility.root);facility.dispose();}
  facility=createFacility(parameters);scene.add(facility.root);facility.select(selected);
  opticalPanels.bind(facility.root);
  addFloorReflection(facility.root.getObjectByName('living-floor').material,floorReflection);
  buildLabels();applyLayers();updateReadings();
  if(mode==='eye')setEyeDirection();
  renderer.shadowMap.needsUpdate=true;dirty=true;
}
function resize(){
  const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  lastSize={w,h};renderer.setSize(w,h,false);
  const pixelRatio=renderer.getPixelRatio();presentation.setSize(Math.round(w*pixelRatio),Math.round(h*pixelRatio));floorReflection.setSize(w*pixelRatio,h*pixelRatio);
  opticalPanels.setSize(Math.round(w*pixelRatio),Math.round(h*pixelRatio));
  const aspect=w/h;
  const vertical=mode==='plan'?Math.max(11.8,16/aspect):mode==='section'?Math.max(9.6,16/aspect):Math.max(13.5,19/aspect);
  ortho.left=-vertical*aspect/2;ortho.right=vertical*aspect/2;ortho.top=vertical/2;ortho.bottom=-vertical/2;
  ortho.setViewOffset(w,h,0,-h*.07,w,h);ortho.updateProjectionMatrix();
  perspective.aspect=aspect;perspective.updateProjectionMatrix();tuneLook();dirty=true;
}
function setEyeDirection(){
  camera.position.copy(facility.eye);
  const direction=new T.Vector3(Math.sin(eyeYaw)*Math.cos(eyePitch),Math.sin(eyePitch),Math.cos(eyeYaw)*Math.cos(eyePitch));
  camera.lookAt(facility.eye.clone().add(direction.multiplyScalar(5)));camera.updateMatrixWorld();dirty=true;
}
function setView(next){
  if(!VIEWS[next])return;mode=next;const info=VIEWS[mode];controls?.dispose();controls=null;
  camera=mode==='eye'?perspective:ortho;
  camera.up.set(0,1,0);document.body.classList.toggle('eye-view',mode==='eye');
  $('#view-code').textContent=info.code;$('#view-name').textContent=info.title;$('#view-description').textContent=info.description;
  $('#interaction-hint').textContent=info.hint;
  $('#reset-camera').textContent=mode==='overview'?'↺ 默认视角':'↺ 复位视角';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));
  $('#section-control').hidden=mode!=='section';$('#eye-note').hidden=mode!=='eye';
  if(mode==='eye'){eyeYaw=Math.atan2(facility.target.x-facility.eye.x,facility.target.z-facility.eye.z);eyePitch=0;setEyeDirection();}
  else{
    camera.zoom=1;camera.position.fromArray(info.position);
    if(mode==='plan')camera.up.set(0,0,-1);
    camera.lookAt(new T.Vector3(...info.target));
    controls=new OrbitControls(camera,renderer.domElement);controls.target.fromArray(info.target);controls.enableDamping=true;controls.dampingFactor=.09;
    controls.minZoom=.55;controls.maxZoom=5;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI/2-.05;
    controls.enableRotate=mode==='overview';
    if(mode!=='overview')controls.mouseButtons.LEFT=T.MOUSE.PAN;
    controls.addEventListener('change',()=>dirty=true);controls.update();
  }
  applyLayers();resize();dirty=true;
}
function selectRoom(id){
  selected=id===selected?null:id;facility.select(selected);
  document.querySelectorAll('.room-item').forEach(el=>{el.classList.toggle('is-selected',el.dataset.room===selected);el.setAttribute('aria-pressed',String(el.dataset.room===selected));});
  $('#selection-info').hidden=!selected;
  if(selected){const r=ROOMS.find(r=>r.id===selected);$('#selection-area').textContent=`${r.area.toFixed(2)} ㎡`;$('#selection-name').textContent=r.name;$('#selection-description').textContent=r.brief;}
  dirty=true;
}
function placeLabels(){
  const {w,h}=lastSize,rectangles=[];
  function put(item,visible){
    const v=item.position.clone().project(camera);const x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;
    visible=visible&&v.z>=-1&&v.z<=1&&x>30&&x<w-30&&y>74&&y<h-65;
    if(mode!=='section'&&x<390&&y<175)visible=false;
    if(visible){
      const width=item.el.offsetWidth||item.text.length*10;
      const r={left:x-width/2,right:x+width/2,top:y-13,bottom:y+13};
      if(rectangles.some(q=>r.left<q.right+5&&r.right>q.left-5&&r.top<q.bottom+4&&r.bottom>q.top-4))visible=false;
      else rectangles.push(r);
    }
    item.el.style.visibility=visible?'visible':'hidden';item.el.style.left=`${x}px`;item.el.style.top=`${y}px`;
  }
  for(const item of elevationLabels){item.position.z=sectionZ+.2;put(item,mode==='section');}
  for(const item of labelNodes){
    const visible=mode!=='eye'&&mode!=='section'&&(item.kind==='room'||(item.kind==='dimension'&&(preferences.dimensions||mode==='plan'))||(item.kind==='detail'&&item.room===selected));
    put(item,visible);
  }
}
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let lastWaterFrame=0;
function frame(time=0){
  requestAnimationFrame(frame);controls?.update();updateWallVisibility();
  if(!document.hidden&&!reducedMotion.matches&&preferences.water&&mode!=='plan'&&time-lastWaterFrame>33){facility?.animate(time/1000);lastWaterFrame=time;dirty=true;}
  if(!dirty)return;
  camera.updateMatrixWorld();renderModel();placeLabels();
  const yaw=Math.atan2(camera.position.x,camera.position.z)*180/Math.PI;$('#compass-needle').setAttribute('transform',`rotate(${-yaw} 30 30)`);
  dirty=false;
}
function renderModel(){
  opticalPanels.disable();floorReflection.render(scene,camera);opticalPanels.render(scene,camera);presentation.render(scene,camera,{bloom:mode!=='plan'&&mode!=='section'});
}

$('#room-list').innerHTML=ROOMS.map(r=>`<button class="room-item" data-room="${r.id}" aria-pressed="false"><span class="room-number">${r.number}</span><span><span class="room-name">${r.name}</span><span class="room-meta">${r.area.toFixed(2)} ㎡ / ${r.en}</span></span></button>`).join('');
document.querySelectorAll('.room-item').forEach(el=>el.addEventListener('click',()=>selectRoom(el.dataset.room)));
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
for(const key of ['furniture','equipment','water','glass','dimensions'])$(`#layer-${key}`).addEventListener('change',e=>{preferences[key]=e.target.checked;applyLayers();});
$('#full-walls').addEventListener('change',e=>{preferences.fullWalls=e.target.checked;applyLayers();});
$('#avoid-walls').addEventListener('change',e=>{preferences.avoidWalls=e.target.checked;applyLayers();});
$('#route-select').addEventListener('change',e=>{preferences.route=e.target.value;applyLayers();});
let rebuildTimer=0;
for(const key of Object.keys(DEFAULTS))$(`#param-${key}`).addEventListener('input',e=>{
  parameters[key]=Number(e.target.value);updateReadings();clearTimeout(rebuildTimer);
  rebuildTimer=setTimeout(()=>{rebuild();persist();},50);
});
$('#reset-parameters').addEventListener('click',()=>{clearTimeout(rebuildTimer);parameters={...DEFAULTS};rebuild();persist();toast('已恢复本版初始参数');});
$('#section-position').addEventListener('input',e=>{sectionZ=Number(e.target.value);$('#section-output').textContent=`${fmt(sectionZ)} m`;applyLayers();});
$('#reset-camera').addEventListener('click',()=>setView(mode));
$('#eye-reset').addEventListener('click',()=>setView('eye'));
$('#toggle-panels').addEventListener('click',()=>{
  const hidden=document.body.classList.toggle('panels-hidden');$('#toggle-panels').setAttribute('aria-label',hidden?'展开侧栏':'收起侧栏');$('#toggle-panels').title=hidden?'展开侧栏':'收起侧栏';resize();
});
function download(url,name){const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
$('#save-design').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(exportDesign(parameters),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  download(url,'lutie-space-a01.json');setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前方案参数');
});
$('#export-image').addEventListener('click',()=>{
  renderModel();download(renderer.domElement.toDataURL('image/png'),`lutie-space-${mode}.png`);toast('已导出三维模型图（不含网页标注）');
});
renderer.domElement.addEventListener('pointerdown',e=>{
  pointerStart={x:e.clientX,y:e.clientY};
  if(mode==='eye'){eyeDrag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:eyeYaw,pitch:eyePitch};renderer.domElement.setPointerCapture(e.pointerId);}
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!eyeDrag||mode!=='eye')return;
  const base=Math.atan2(facility.target.x-facility.eye.x,facility.target.z-facility.eye.z);
  eyeYaw=T.MathUtils.clamp(eyeDrag.yaw-(e.clientX-eyeDrag.x)*.004,base-1.15,base+1.15);
  eyePitch=T.MathUtils.clamp(eyeDrag.pitch+(e.clientY-eyeDrag.y)*.003,-.5,.5);setEyeDirection();
});
renderer.domElement.addEventListener('pointerup',e=>{
  eyeDrag=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
  if(mode==='eye'||!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
  const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(facility.selectable).find(h=>mode!=='section'||h.point.z<=sectionZ);
  if(hit)selectRoom(hit.object.userData.room);pointerStart=null;
});
renderer.domElement.addEventListener('pointercancel',()=>{eyeDrag=null;pointerStart=null;});
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey)return;
  const views=['overview','plan','section','eye'];if(['1','2','3','4'].includes(e.key))setView(views[Number(e.key)-1]);
  if(e.key==='Escape')setView('overview');
});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('#error-message').hidden=false;$('#error-message').textContent='3D 图形上下文暂时中断，请刷新页面恢复。当前参数已保存在本机。';});
new ResizeObserver(resize).observe(host);
rebuild();setView('overview');frame();$('#loading').hidden=true;$('#render-status').textContent='3D 模型就绪';
