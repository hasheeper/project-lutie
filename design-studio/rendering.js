import * as T from './vendor/three.module.js';
import { createReflectionEnvironment } from './finishes.js';

// What the model is lit by, wherever it is shown: a studio of soft panels to reflect, a cool key from the
// north-west with a warm fill against it, and the light the lit plate lays on whatever is round it.
export function createLighting(renderer) {
  const environment=createReflectionEnvironment(renderer);
  const sky=new T.HemisphereLight(0xc1e2ef,0x244656,.38);
  const sun=new T.DirectionalLight(0xd9f1ff,2.1);sun.position.set(-3,15,-5);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.radius=5;sun.shadow.intensity=.5;Object.assign(sun.shadow.camera,{left:-11,right:11,top:11,bottom:-11,near:.5,far:40});sun.shadow.normalBias=.04;sun.shadow.bias=-.0003;
  const fill=new T.DirectionalLight(0xffd77a,.65);fill.position.set(2,8,8);
  // `reach`: how much light lies far from the plate, and how much close against it.
  const reach={value:new T.Vector2(.13,.2)};
  const halo=new T.Mesh(new T.PlaneGeometry(40,30),new T.ShaderMaterial({uniforms:{reach},transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec2 reach;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*vec2(40.,30.);float d=length(max(abs(p)-vec2(6.45,4.2),0.));gl_FragColor=vec4(.14,.5,.66,reach.x*exp(-d/2.2)+reach.y*exp(-d/.4));}'}));
  halo.rotation.x=-Math.PI/2;halo.position.y=-2.66;
  return {
    sun,halo,reach:reach.value,
    addTo(scene){scene.environment=environment.texture;scene.environmentIntensity=.75;scene.add(sky,sun,fill,halo);},
    dispose(){environment.dispose();halo.geometry.dispose();halo.material.dispose();},
  };
}

// Capture the occupied scene before the thin panels. Transmission and surface
// reflection are then composed separately, instead of fading both with alpha.
export function createOpticalPanels(renderer) {
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:2});
  const resolution=new T.Vector2(1,1),background={value:target.texture};
  let meshes=[],materials=[];
  // A finish is prepared once, however often the panels are bound again (overview.js binds after batching).
  const prepared=new Map();
  // For `draw`: the copy the panels see, and two full-screen sheets — one lays the picture into the copy, one
  // lays it back where it was taken from. Both are drawn first, before anything else. The copy's depth is drawn
  // again, not copied: a contour often lies a hair from the surface it runs along, and a copy of the depth, one
  // value to a pixel, would let some through that were hidden.
  const within=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:2}),tiny=new T.WebGLRenderTarget(1,1);
  const kept={image:{value:null}},sheetVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const sheet=material=>{const mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);mesh.frustumCulled=false;mesh.renderOrder=-1e9;mesh.visible=false;return mesh;};
  const copy=()=>sheet(new T.ShaderMaterial({uniforms:kept,vertexShader:sheetVertex,depthTest:false,depthWrite:false,blending:T.NoBlending,toneMapped:false,
    fragmentShader:'uniform sampler2D image;varying vec2 vUv;void main(){gl_FragColor=texture2D(image,vUv);}'}));
  const keep=copy(),resume=copy();
  // Depth alone, cut where the finish is cut: what a finish leaves in the depth buffer, without its light.
  const twins=new WeakMap(),twin=material=>{
    let depth=twins.get(material);
    if(!depth)twins.set(material,depth=new T.MeshBasicMaterial({colorWrite:false}));
    Object.assign(depth,{side:material.side,depthTest:material.depthTest,depthFunc:material.depthFunc,clippingPlanes:material.clippingPlanes,clipIntersection:material.clipIntersection});
    return depth;
  };
  return {
    disable(){for(const entry of materials)entry.active.value=0;},
    bind(root){
      meshes=[];materials=[];const seen=new Set();
      root.traverse(mesh=>{
        if(!mesh.isMesh||mesh.material?.userData.opticalDensity===undefined)return;
        meshes.push(mesh);const material=mesh.material;if(seen.has(material))return;seen.add(material);
        if(prepared.has(material)){materials.push({material,active:prepared.get(material)});return;}
        const active={value:0},prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey.call(material);
        materials.push({material,active});prepared.set(material,active);material.forceSinglePass=true;
        material.onBeforeCompile=shader=>{
          prior.call(material,shader);
          Object.assign(shader.uniforms,{panelBackground:background,panelResolution:{value:resolution},panelActive:active,panelDensity:{value:material.userData.opticalDensity}});
          shader.fragmentShader='uniform sampler2D panelBackground;uniform vec2 panelResolution;uniform float panelActive;uniform float panelDensity;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
            if(panelActive>.5){
              float facing=abs(dot(normal,geometryViewDir));
              float fresnel=.025+.48*pow(1.-facing,4.);
              vec2 uv=gl_FragCoord.xy/panelResolution;
              vec2 bend=normal.xy*.0025*(1.-facing);
              // What is behind stays sharp: a contour seen through a sheet is still a line.
              vec4 seen=texture2D(panelBackground,clamp(uv+bend,vec2(.001),vec2(.999)));
              vec3 behind=seen.rgb*.7;
              behind+=texture2D(panelBackground,clamp(uv+bend+vec2(.0003,0.),vec2(.001),vec2(.999))).rgb*.15;
              behind+=texture2D(panelBackground,clamp(uv+bend-vec2(.0003,0.),vec2(.001),vec2(.999))).rgb*.15;
              vec3 absorption=mix(vec3(1.),pow(max(diffuseColor.rgb,vec3(.01)),vec3(.3)),panelDensity);
              outgoingLight=behind*absorption*(1.-fresnel)+totalSpecular*.6+totalDiffuse*panelDensity*.25;
              // A sheet is as solid as what is seen through it. Where the picture has nothing behind it (a model
              // shown with no ground: overview.js) it keeps only its own substance, and the page shows through.
              float sheet=mix(max(.2,fresnel+panelDensity),1.,clamp(seen.a,0.,1.));
              outgoingLight/=sheet;diffuseColor.a=sheet;
            }
            #include <opaque_fragment>
          `);
        };
        material.customProgramCacheKey=()=> `${priorKey}/optical-panels-v4`;material.needsUpdate=true;
      });
    },
    setSize(w,h){target.setSize(w,h);within.setSize(w,h);resolution.set(w,h);},
    render(scene,camera){
      for(const entry of materials)entry.active.value=entry.material.opacity<.99?1:0;
      const hidden=meshes.filter(mesh=>mesh.visible&&mesh.material.opacity<.99);
      if(!hidden.length)return;                       // shown solid: nothing is seen through
      for(const mesh of hidden)mesh.visible=false;
      const shadowUpdate=renderer.shadowMap.needsUpdate;renderer.shadowMap.needsUpdate=false;
      // Nothing drawn into the picture may read from it meanwhile.
      background.value=null;
      renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);
      background.value=target.texture;
      for(const mesh of hidden)mesh.visible=true;
      renderer.shadowMap.needsUpdate=shadowUpdate;
    },
    /**
     * The whole scene into `picture`, the panels seeing through to it — without lighting the scene a second
     * time for what is behind them. What a panel sees is the picture as it stands just before the panels are
     * drawn, and whatever is drawn after them (contours, the cut, a host's overlays): so the picture is drawn
     * up to the panels, kept, finished in the copy with what comes after them, and then taken up again. Says
     * false, having drawn nothing, if no panel is see-through just now.
     *
     * Each render into a multisampled target ends by resolving it and letting its colour go (three.js keeps
     * the depth), so the picture is taken up again by laying the resolved colour back first.
     */
    draw(scene,camera,picture){
      const panels=[],early=[],late=[];
      for(const entry of materials)entry.active.value=entry.material.opacity<.99?1:0;
      const panel=new Set(meshes);
      (function walk(object){
        if(!object.visible)return;
        if(object.isMesh||object.isLine||object.isPoints){
          if(panel.has(object))(object.material.opacity<.99?panels:early).push(object);
          else (object.material.transparent&&object.renderOrder>=7?late:early).push(object);  // drawn after the panels (renderOrder 6)
        }
        for(const child of object.children)walk(child);
      })(scene);
      if(!panels.length)return false;
      if(keep.parent!==scene)scene.add(keep,resume);
      const show=(list,on)=>{for(const object of list)object.visible=on;},clear=renderer.autoClear;
      // Shadows are cast by everything, panels too: if they are due, they are drawn now, with all of it in place.
      if(renderer.shadowMap.needsUpdate){renderer.setRenderTarget(tiny);renderer.render(scene,camera);}
      const shadowUpdate=renderer.shadowMap.needsUpdate;renderer.shadowMap.needsUpdate=false;
      background.value=null;show(panels,false);show(late,false);
      renderer.setRenderTarget(picture);renderer.render(scene,camera);
      kept.image.value=picture.texture;
      // The copy: that picture, the depth of what made it, and what is drawn after the panels.
      const solid=early.filter(object=>object.isMesh&&object.material.depthWrite),finishes=solid.map(object=>object.material);
      show(early,false);show(solid,true);solid.forEach(object=>{object.material=twin(object.material);});show(late,true);keep.visible=true;
      renderer.setRenderTarget(within);renderer.render(scene,camera);
      solid.forEach((object,i)=>{object.material=finishes[i];});
      keep.visible=false;show(solid,false);background.value=within.texture;show(panels,true);resume.visible=true;
      renderer.autoClear=false;renderer.setRenderTarget(picture);renderer.render(scene,camera);renderer.autoClear=clear;
      resume.visible=false;show(early,true);
      renderer.shadowMap.needsUpdate=shadowUpdate;
      return true;
    },
  };
}

// The finish. What is brighter than white is light, and light spreads: at four
// scales, from a hair of halo that leaves a contour a line, to a wide breath of
// colour round the lamps and the water. The model itself is never blurred.
// It is kept low: enough to say that a thing gives light, never enough to veil what is beside it.
const SPREAD=[.14,.06,.025,.012];
export function createPresentation(renderer) {
  const target=(w=1,h=1)=>new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,depthBuffer:false});
  const sceneTarget=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4});
  sceneTarget.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const levels=[2,4,8,16].map(divisor=>({divisor,a:target(),b:target(),w:1,h:1}));
  const camera=new T.OrthographicCamera(-1,1,1,-1,0,1),scene=new T.Scene();
  const vertex='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const pass=(uniforms,fragment)=>new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:`varying vec2 vUv; ${fragment}`,depthTest:false,depthWrite:false,toneMapped:false});
  const extract=pass({image:{value:sceneTarget.texture}},`uniform sampler2D image;void main(){vec3 c=texture2D(image,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.85,1.6,l),1.);}`);
  const blur=pass({image:{value:null},direction:{value:new T.Vector2()}},`uniform sampler2D image;uniform vec2 direction;void main(){vec3 c=texture2D(image,vUv).rgb*.227027;c+=texture2D(image,vUv+direction*1.384615).rgb*.316216;c+=texture2D(image,vUv-direction*1.384615).rgb*.316216;c+=texture2D(image,vUv+direction*3.230769).rgb*.070270;c+=texture2D(image,vUv-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}`);
  const compose=pass({image:{value:sceneTarget.texture},depth:{value:sceneTarget.depthTexture},inverseProjection:{value:new T.Matrix4()},projectionScale:{value:new T.Vector2()},perspective:{value:0},
    fine:{value:levels[0].a.texture},soft:{value:levels[1].b.texture},wide:{value:levels[2].b.texture},breath:{value:levels[3].b.texture},spread:{value:new T.Vector4()},
    exposure:{value:1},saturation:{value:1},hazeRange:{value:new T.Vector2()},hazeStrength:{value:0},hazeColor:{value:new T.Color(0x0f3a55)},open:{value:0}},`
    uniform sampler2D image;uniform sampler2D depth;uniform mat4 inverseProjection;uniform vec2 projectionScale;uniform float perspective;
    uniform sampler2D fine;uniform sampler2D soft;uniform sampler2D wide;uniform sampler2D breath;uniform vec4 spread;uniform float exposure;uniform float saturation;
    uniform vec2 hazeRange;uniform float hazeStrength;uniform vec3 hazeColor;uniform float open;
    vec3 viewPosition(vec2 uv){float z=texture2D(depth,uv).r;vec4 p=inverseProjection*vec4(uv*2.-1.,z*2.-1.,1.);return p.xyz/p.w;}
    vec3 film(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    void main(){vec3 p=viewPosition(vUv);vec3 n=normalize(cross(dFdx(p),dFdy(p)));float occlusion=0.;
      vec2 radius=projectionScale*.18/mix(1.,max(.1,-p.z),perspective);
      for(int i=0;i<12;i++){float a=float(i)*2.399963;float r=sqrt((float(i)+.5)/12.);
        vec3 d=viewPosition(vUv+vec2(cos(a),sin(a))*radius*r)-p;float len=length(d);
        occlusion+=max(0.,dot(n,d/max(len,.001))-.13)*(1.-smoothstep(.04,.55,len));}
      vec3 light=texture2D(fine,vUv).rgb*spread.x+texture2D(soft,vUv).rgb*spread.y+texture2D(wide,vUv).rgb*spread.z+texture2D(breath,vUv).rgb*spread.w;
      vec4 picture=texture2D(image,vUv);float solid=mix(1.,clamp(picture.a,0.,1.),open);
      vec3 c=picture.rgb*(1.-min(.2,occlusion*.08))+light;
      float haze=hazeStrength*smoothstep(hazeRange.x,hazeRange.y,-p.z)*solid;
      c=mix(c,hazeColor,haze);
      float vignette=1.-.2*smoothstep(.25,.8,length((vUv-.5)*vec2(1.,.85)))*(1.-open);
      c=film(c*exposure)*vignette;c=max(mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation),0.);
      c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
      // An open picture keeps how solid each point is, and light counts as solid in the measure of its own
      // brightness: a point that is brighter than it is solid is not a colour a page can be relied on to
      // show (a browser may drop it outright where nothing was drawn), and this is what it would be on a screen.
      gl_FragColor=vec4(c,mix(1.,max(solid,min(max(c.r,max(c.g,c.b)),1.)),open));}
  `);
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),compose);scene.add(quad);
  function draw(material,output){quad.material=material;renderer.setRenderTarget(output);renderer.render(scene,camera);}
  function spreadLight(){
    draw(extract,levels[0].a);
    levels.forEach((level,i)=>{
      // Each scale is blurred from the one before it, at half its size.
      const source=i===0?level.a:i===1?levels[0].a:levels[i-1].b,[first,second]=i===0?[level.b,level.a]:[level.a,level.b];
      blur.uniforms.image.value=source.texture;blur.uniforms.direction.value.set(1/level.w,0);draw(blur,first);
      blur.uniforms.image.value=first.texture;blur.uniforms.direction.value.set(0,1/level.h);draw(blur,second);
      // A blur this small stops short, and where there is nothing else to look at — far from the light, over
      // dark ground or none — the place it stops shows as an edge. The two wide scales are blurred again.
      if(i<2)return;
      blur.uniforms.image.value=second.texture;blur.uniforms.direction.value.set(1/level.w,0);draw(blur,first);
      blur.uniforms.image.value=first.texture;blur.uniforms.direction.value.set(0,1/level.h);draw(blur,second);
    });
  }
  return {
    setSize(w,h){
      sceneTarget.setSize(w,h);
      for(const level of levels){level.w=Math.max(1,Math.round(w/level.divisor));level.h=Math.max(1,Math.round(h/level.divisor));level.a.setSize(level.w,level.h);level.b.setSize(level.w,level.h);}
    },
    // `bloom` is the presentation look: light spreads and colour is full. Without it the model is a clean drawing.
    // `open` leaves the picture clear wherever nothing was drawn, for a canvas that stands in front of a page.
    // `panels` (createOpticalPanels) draws the scene itself, its panels seeing through to the picture as it is drawn.
    render(world,view,{bloom=true,open=false,panels=null}={}){
      compose.uniforms.open.value=open?1:0;
      compose.uniforms.inverseProjection.value.copy(view.projectionMatrixInverse);compose.uniforms.projectionScale.value.set(view.projectionMatrix.elements[0],view.projectionMatrix.elements[5]);compose.uniforms.perspective.value=view.isPerspectiveCamera?1:0;
      const distance=view.position.length();compose.uniforms.hazeRange.value.set(view.isPerspectiveCamera?1:Math.max(1,distance-7),view.isPerspectiveCamera?9:distance+7);compose.uniforms.hazeStrength.value=bloom?.05:0;
      compose.uniforms.saturation.value=bloom?1:.94;compose.uniforms.spread.value.fromArray(bloom?SPREAD:[0,0,0,0]);
      if(!panels?.draw(world,view,sceneTarget)){renderer.setRenderTarget(sceneTarget);renderer.render(world,view);}
      if(bloom)spreadLight();
      draw(compose,null);
    },
  };
}

// Reflect only the occupied side of the living floor. Its position never changes the plan.
export function createFloorReflection(renderer) {
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  const matrix=new T.Matrix4(),clip=new T.Plane(new T.Vector3(0,1,0),-.018);
  const ortho=new T.OrthographicCamera(),perspective=new T.PerspectiveCamera();
  const bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),sampler={value:target.texture};
  /** The camera the floor is seen in: `camera` turned over the floor's plane. */
  function reflect(camera){
    const mirror=camera.isPerspectiveCamera?perspective:ortho;mirror.copy(camera,false);
    const direction=camera.getWorldDirection(new T.Vector3());direction.y*=-1;
    mirror.position.y=-camera.position.y;mirror.up.copy(camera.up);mirror.up.y*=-1;
    mirror.lookAt(mirror.position.clone().add(direction));mirror.updateMatrixWorld();
    if(reflection.layer!==null)mirror.layers.set(reflection.layer);
    return mirror;
  }
  const reflection={
    texture:target.texture,sampler,matrix,
    /** A layer of its own to draw, for a host that builds the reflected picture separately (overview.js); null: the camera's. */
    layer:null,
    reflect,
    setSize(w,h){target.setSize(Math.max(1,Math.round(w/2)),Math.max(1,Math.round(h/2)));},
    render(scene,camera){
      const mirror=reflect(camera);
      matrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
      const prior=renderer.clippingPlanes,shadowUpdate=renderer.shadowMap.needsUpdate;
      renderer.clippingPlanes=[clip];renderer.shadowMap.needsUpdate=false;
      sampler.value=null;                              // the floor is below the mirror, but is still asked to draw
      renderer.setRenderTarget(target);renderer.render(scene,mirror);sampler.value=target.texture;
      renderer.clippingPlanes=prior;renderer.shadowMap.needsUpdate=shadowUpdate;renderer.setRenderTarget(null);
    },
  };
  return reflection;
}

export function addFloorReflection(material,reflection) {
  const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=shader=>{
    prior.call(material,shader);
    shader.uniforms.floorReflection=reflection.sampler;shader.uniforms.floorMatrix={value:reflection.matrix};
    shader.vertexShader='uniform mat4 floorMatrix; varying vec4 floorUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nfloorUv=floorMatrix*modelMatrix*vec4(transformed,1.);');
    shader.fragmentShader='uniform sampler2D floorReflection; varying vec4 floorUv;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec2 reflectedUv=floorUv.xy/floorUv.w;
      vec3 reflected=texture2D(floorReflection,reflectedUv).rgb*.4;
      reflected+=texture2D(floorReflection,reflectedUv+vec2(.0015,0.)).rgb*.15;
      reflected+=texture2D(floorReflection,reflectedUv-vec2(.0015,0.)).rgb*.15;
      reflected+=texture2D(floorReflection,reflectedUv+vec2(0.,.0015)).rgb*.15;
      reflected+=texture2D(floorReflection,reflectedUv-vec2(0.,.0015)).rgb*.15;
      float facing=abs(dot(normal,normalize(vViewPosition)));
      // Polished enough to hold what stands on it: the light of a lamp, the line of a chair leg.
      float reflectionStrength=.2+.2*pow(1.-facing,2.);
      outgoingLight=mix(outgoingLight,reflected,reflectionStrength);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> `${priorKey}/living-floor-reflection-v2`;material.needsUpdate=true;
}
