import * as T from './vendor/three.module.js';
import { createFacility } from './model.js';
import { createContourMaterial, createContour, setContourCenter, tuneContours, cutTop } from './contours.js';
import { createPresentation, createFloorReflection, addFloorReflection, createOpticalPanels, createLighting } from './rendering.js';
import { DEFAULTS, ROOMS, SITE } from './space.mjs';

/* The overview, for another page to show.

   The same model, finish and light as the workbench's first view, seen from the same side — but with
   nothing behind it. The picture has no ground and no sky: only the model and the light it gives, so it
   can stand in front of whatever the host page has there.

   The camera keeps to the workbench's side of the building. From there it may lean a little, the way a
   head moves in front of something on a table, and come a little closer to one room. The host gives a
   canvas and a size, says where it is leaning and what it is looking at, and asks where things are.

   A host may lay things of its own over the model — a field on its floors, something moving through its
   rooms: it is told where the floors are and where she is, and adds what it has made to the picture.

   Used by the game HUD's map (prototype/js/map.js). */

const POSITION=[-12,14,-16],TARGET=[0,-.5,0];                 // app.js: VIEWS.overview
const EXTENT=[[-6.45,-2.5,-4.2],[6.45,1.1,4.2]];              // the plate it stands on, up to where the walls are cut
const NEAR=['west','north'];                                  // the outer walls between this camera and the rooms
const CLOSER=1.18;                                            // how much larger a room is while it is looked at closely
const TOWARD=.5;                                              // and how far it comes toward the middle of the picture

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {object} [options.parameters]  water, office and deck levels (space.mjs)
 * @param {number[]} [options.margin]    px kept clear round the model: top, right, bottom, left
 */
export function createOverview(canvas,{parameters=DEFAULTS,margin=[40,40,40,40]}={}) {
  const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:true,premultipliedAlpha:true});
  renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.localClippingEnabled=true;renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene(),lighting=createLighting(renderer);lighting.addTo(scene);
  // With no ground to lie on, the plate's light is only a breath in the water round it.
  lighting.reach.set(.025,.08);
  const presentation=createPresentation(renderer),floorReflection=createFloorReflection(renderer),opticalPanels=createOpticalPanels(renderer);

  const facility=createFacility(parameters),m=facility.metrics;scene.add(facility.root);
  opticalPanels.bind(facility.root);
  addFloorReflection(facility.root.getObjectByName('living-floor').material,floorReflection);

  // The workbench's overview, as it opens: walls cut at half height, the two near ones down to their foot.
  for(const name of ['dimensions','human','lutie','plumbing','section','caps','roof','selection'])facility.groups[name].visible=false;
  const cuts=new Map(),cutAt=height=>{if(!cuts.has(height))cuts.set(height,new T.Plane(new T.Vector3(0,-1,0),height));return cuts.get(height);};
  const cutMaterial=(material,planes)=>{
    material.clippingPlanes=planes;material.clipShadows=true;
    const light=material.userData.edgeLight;if(light){light.gain.value=light.strength;light.cut.value=cutTop(planes);}
  };
  for(const {material,cutawayHeight} of facility.clippingTargets)cutMaterial(material,cutawayHeight===null?[]:[cutAt(cutawayHeight)]);
  for(const wall of facility.outerWalls){
    const planes=NEAR.includes(wall.side)?[cutAt(1.1),wall.cut]:[cutAt(1.1)];
    cutMaterial(wall.mesh.material,planes);wall.edge.material.clippingPlanes=planes;
  }
  for(const item of facility.wallCaps){
    const height=item.outer&&NEAR.includes(item.outer.side)?item.outer.cut.constant:item.cutawayHeight,half=item.source.geometry.parameters.height/2;
    item.cap.visible=height>item.source.position.y-half&&height<item.source.position.y+half;item.cap.position.y=height+.002;
  }

  // The room being looked at: its outline on its own floor, in light, seen through whatever stands in front.
  const marks=new Map(),middles=new Map(),volumes=new Map();
  for(const room of ROOMS){
    const [x1,z1,x2,z2]=room.bounds,floor=room.id==='office'?m.office:room.id==='habitat'?m.water:0,y=floor+(floor?.02:.035);
    const material=createContourMaterial('cyan');material.depthTest=false;
    const outline=createContour([[x1,z1],[x2,z1],[x2,z2],[x1,z2]].flatMap((p,i,all)=>[p[0],y,p[1],all[(i+1)%4][0],y,all[(i+1)%4][1],1]),material);
    // Every side of it is toward the eye.
    setContourCenter(outline,[-POSITION[0]*20,-POSITION[1]*20,-POSITION[2]*20]);
    outline.renderOrder=9;outline.visible=false;scene.add(outline);marks.set(room.id,outline);
    middles.set(room.id,new T.Vector3((x1+x2)/2,floor,(z1+z2)/2));
    volumes.set(room.id,new T.Box3(new T.Vector3(x1,EXTENT[0][1]+.16,z1),new T.Vector3(x2,EXTENT[1][1],z2)));
  }

  /* The camera. It looks at one point of the building from a fixed distance; `lean` turns it about that
     point by a few degrees; its window is set so the model sits where the host wants it, and is drawn in
     and moved toward a room while that room is looked at closely. Asked for, then eased to.              */
  const camera=new T.OrthographicCamera(-1,1,1,-1,.05,150);
  const target=new T.Vector3(...TARGET),reach=new T.Spherical().setFromVector3(new T.Vector3(...POSITION).sub(target));
  const right=new T.Vector3(),up=new T.Vector3(),back=new T.Vector3(),point=new T.Vector3();
  const wanted={lean:[0,0],room:null},pose={lean:[0,0],zoom:1,pan:[0,0]};
  const size={w:1,h:1,ratio:1,scale:1},frame={left:-1,top:1,w:2,h:2};
  function stand(){
    camera.position.setFromSphericalCoords(reach.radius,reach.phi-pose.lean[1],reach.theta+pose.lean[0]).add(target);
    camera.lookAt(target);camera.updateMatrixWorld();camera.matrixWorld.extractBasis(right,up,back);
  }
  /** A point of the building, on the camera's own axes: metres right of and above the line it looks along. */
  const across=p=>{point.copy(p).sub(camera.position);return [point.dot(right),point.dot(up)];};
  function open(){
    camera.left=frame.left+pose.pan[0];camera.right=camera.left+frame.w;
    camera.top=frame.top+pose.pan[1];camera.bottom=camera.top-frame.h;
    camera.zoom=pose.zoom;camera.updateProjectionMatrix();
  }
  stand();
  // What has to fit: the plate and the cut walls, measured once, as the camera first stands.
  const low=[Infinity,Infinity],high=[-Infinity,-Infinity],corner=new T.Vector3();
  for(const x of [0,1])for(const y of [0,1])for(const z of [0,1]){
    across(corner.set(EXTENT[x][0],EXTENT[y][1],EXTENT[z][2])).forEach((v,i)=>{low[i]=Math.min(low[i],v);high[i]=Math.max(high[i],v);});
  }
  function resize(width,height,ratio=1,line=ratio){
    Object.assign(size,{w:width,h:height,ratio});
    const [top,east,bottom,west]=margin,room=[width-east-west,height-top-bottom];
    size.scale=Math.min(room[0]/(high[0]-low[0]),room[1]/(high[1]-low[1]));         // px to the metre
    const centre=[west+room[0]/2,top+room[1]/2];
    Object.assign(frame,{left:(low[0]+high[0])/2-centre[0]/size.scale,top:(low[1]+high[1])/2+centre[1]/size.scale,w:width/size.scale,h:height/size.scale});
    open();
    renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);
    const w=Math.round(width*ratio),h=Math.round(height*ratio);
    presentation.setSize(w,h);floorReflection.setSize(w,h);opticalPanels.setSize(w,h);
    tuneContours(facility.materials,{width:w,height:h,line,gain:1.15});
    for(const material of facility.materials)if(material.userData.spark)material.uniforms.pixelRatio.value=ratio;
    for(const outline of marks.values()){outline.material.uniforms.resolution.value.set(w,h);outline.material.uniforms.contourWidth.value=line*1.5;}
    for(const tell of sized)tell(w,h,ratio);
    renderer.shadowMap.needsUpdate=true;
  }
  /** Move toward what was asked for. Says whether anything on the canvas is somewhere else than it was. */
  function step(dt){
    // Leaning is slow, as a head is; coming closer answers a touch, and is quicker.
    const k=1-Math.exp(-dt*4),near=1-Math.exp(-dt*7),before=[pose.lean[0],pose.lean[1],pose.zoom,pose.pan[0],pose.pan[1]];
    for(const i of [0,1])pose.lean[i]+=(wanted.lean[i]-pose.lean[i])*k;
    stand();
    // The room comes toward the middle of the window as it was first set, and the window closes on it.
    const middle=wanted.room&&middles.get(wanted.room),goal=[0,0];
    if(middle){const at=across(middle);goal[0]=(at[0]-(frame.left+frame.w/2))*TOWARD;goal[1]=(at[1]-(frame.top-frame.h/2))*TOWARD;}
    for(const i of [0,1])pose.pan[i]+=(goal[i]-pose.pan[i])*near;
    pose.zoom+=((middle?CLOSER:1)-pose.zoom)*near;
    open();
    const after=[pose.lean[0],pose.lean[1],pose.zoom,pose.pan[0],pose.pan[1]];
    return after.some((v,i)=>Math.abs(v-before[i])>(i<2?2e-5:i===2?2e-4:1e-3));
  }

  // What can be walked on, room by room, as the top of each plate; and for the pool, the water rather than its bed.
  const floors=facility.selectable.filter(mesh=>mesh.position.y>SITE.poolBottom).map(mesh=>{
    const {width,height,depth}=mesh.geometry.parameters;
    return {room:mesh.userData.room,x:mesh.position.x,y:mesh.position.y+height/2,z:mesh.position.z,w:width,d:depth};
  });
  const pool=facility.water.geometry.parameters;
  floors.push({room:'habitat',water:true,x:facility.water.position.x,y:m.water,z:facility.water.position.z,w:pool.width,d:pool.depth});
  const sized=new Set();

  const raycaster=new T.Raycaster(),spot=new T.Vector2();
  return {
    rooms:ROOMS.map(({id,number,name,en,area,bounds})=>({id,number,name,en,area,bounds})),
    floors,
    /** Where she is: the light in her, metres. */
    her:[facility.target.x,m.water-.48,facility.target.z],
    /** Put something of the host's own into the picture. `sized`, if given, is told the canvas's size in its own pixels, now and whenever it changes. */
    add(object,onSize){
      scene.add(object);
      if(onSize){sized.add(onSize);if(size.w>1)onSize(Math.round(size.w*size.ratio),Math.round(size.h*size.ratio),size.ratio);}
      return object;
    },
    site:{width:SITE.width,depth:SITE.depth},
    metrics:m,
    /** What the workbench names inside each room: { text, room, at: [x, y, z] }. */
    details:facility.labels.filter(label=>label.kind==='detail').map(label=>({text:label.text,room:label.room,at:label.position.toArray()})),
    /** The canvas in px, how many of its own pixels to each, and how wide a contour is in those. */
    resize,
    /** Where the eye is drawn: `x`, `y` in −1‥1, turning the view by a few degrees; and the room to come closer to, or null. */
    aim(x,y,room=null){wanted.lean[0]=x*.075;wanted.lean[1]=-y*.035;wanted.room=room;},
    step,
    /** Metres (x east, y up, z south) → px on the canvas. */
    project(x,y,z){point.set(x,y,z).project(camera);return [(point.x*.5+.5)*size.w,(-point.y*.5+.5)*size.h];},
    /** The room under a point of the canvas, or null. */
    roomAt(x,y){
      spot.set(x/size.w*2-1,-(y/size.h)*2+1);raycaster.setFromCamera(spot,camera);
      const floor=raycaster.intersectObjects(facility.selectable,false)[0];
      if(floor)return floor.object.userData.room;
      // Not on a floor, then: on the cut face of what is under one — the building stands open on this side —
      // or on something standing at the edge of one. It is the room whose space the eye enters first.
      let found=null,nearest=Infinity;
      for(const [id,volume] of volumes){
        const entry=raycaster.ray.intersectBox(volume,point);if(!entry)continue;
        const distance=entry.distanceTo(raycaster.ray.origin);if(distance<nearest){nearest=distance;found=id;}
      }
      return found;
    },
    /** How closely each room is being looked at: { id: 0‥1 }. */
    look(weights){
      for(const [id,outline] of marks){const w=weights[id]||0;outline.visible=w>.01;outline.material.uniforms.contourOpacity.value=w*1.5;}
    },
    /** Draw. Give the time, in seconds, for the water to move; leave it out to hold it still. */
    render(seconds){
      if(seconds!==undefined)facility.animate(seconds);
      opticalPanels.disable();floorReflection.render(scene,camera);opticalPanels.render(scene,camera);
      presentation.render(scene,camera,{bloom:true,open:true});
    },
    dispose(){facility.dispose();lighting.dispose();for(const outline of marks.values()){outline.geometry.dispose();outline.material.dispose();}renderer.dispose();},
  };
}
