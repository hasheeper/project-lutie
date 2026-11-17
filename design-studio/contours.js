import * as T from './vendor/three.module.js';

// Every manufactured object shares this contour language. Colour identifies
// the space; brightness follows the view, rather than hand-picked light strips.
//
// A contour is a set of segments, each drawn as a quad widened on screen. A GL
// line is one device pixel wide whatever is asked of it, which is too little to
// carry light; these have a width, add their light to what is behind them, and
// are bright enough for the presentation's bloom to give them a fine halo.
// Pale, not neon: an edge is nearly white, with only enough colour to say which kind of thing it belongs to.
const COLORS={cyan:0xb6edf5,amber:0xffe6b0,water:0xbff7ee};
const QUAD=[0,-1,0, 1,-1,0, 1,1,0, 0,1,0];   // x: along the segment, y: across it

export function createContourMaterial(tone) {
  const material=new T.ShaderMaterial({
    uniforms:{
      contourColor:{value:new T.Color(COLORS[tone])},
      contourOpacity:{value:1},              // overall gain; above 1 is light for the bloom
      contourWidth:{value:2.6},              // drawing-buffer pixels
      resolution:{value:new T.Vector2(1024,1024)},
    },
    transparent:true,depthWrite:false,depthTest:true,clipping:true,toneMapped:false,side:T.DoubleSide,
    blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneFactor,
    vertexShader:`
      attribute vec3 segmentStart;
      attribute vec3 segmentEnd;
      attribute float segmentWeight;
      attribute vec3 contourCenter;
      uniform vec2 resolution;
      uniform float contourWidth;
      varying float prominence;
      varying float across;
      #include <clipping_planes_pars_vertex>
      void main(){
        vec3 local=mix(segmentStart,segmentEnd,position.x);
        vec4 world=modelMatrix*vec4(local,1.);
        // An edge that faces the eye is clear; one on the far side of its object is faint.
        vec3 outward=normalize(mat3(modelMatrix)*(local-contourCenter)+vec3(.00001));
        vec3 towardCamera=isOrthographic?normalize(vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2])):normalize(cameraPosition-world.xyz);
        prominence=segmentWeight*mix(.26,1.,smoothstep(-.5,.7,dot(outward,towardCamera)));
        vec4 a=modelViewMatrix*vec4(segmentStart,1.),b=modelViewMatrix*vec4(segmentEnd,1.);
        if(!isOrthographic){
          // A segment that passes the eye is cut short just in front of it.
          float near=-.04;
          if(a.z>near&&b.z<near)a=mix(a,b,(a.z-near)/(a.z-b.z));
          else if(b.z>near&&a.z<near)b=mix(b,a,(b.z-near)/(b.z-a.z));
        }
        vec4 mvPosition=mix(a,b,position.x);
        vec4 ca=projectionMatrix*a,cb=projectionMatrix*b;
        vec2 along=(cb.xy/cb.w-ca.xy/ca.w)*resolution;
        float len=length(along);along=len>.0001?along/len:vec2(1.,0.);
        float reach=contourWidth*.5+1.;
        // Ends run half a width past their corner, so two edges meet squarely and the corner is a little brighter.
        vec2 push=vec2(-along.y,along.x)*position.y*reach+along*(position.x*2.-1.)*contourWidth*.5;
        vec4 clip=mix(ca,cb,position.x);
        clip.xy+=push/resolution*2.*clip.w;
        clip.z-=.0003*clip.w;                 // an edge lies on its surface: keep it in front
        gl_Position=clip;
        across=position.y*reach;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader:`
      uniform vec3 contourColor;
      uniform float contourOpacity;
      uniform float contourWidth;
      varying float prominence;
      varying float across;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float core=1.-smoothstep(contourWidth*.5-.75,contourWidth*.5+.75,abs(across));
        gl_FragColor=vec4(contourColor*contourOpacity*prominence*core,0.);
      }`,
  });
  material.userData.contour=true;
  return material;
}

/* ── Segments: ax ay az · bx by bz · weight ─────────────── */

const segment=(a,b,weight)=>[a[0],a[1],a[2],b[0],b[1],b[2],weight];
const loop=(points,weight)=>points.flatMap((p,i)=>segment(p,points[(i+1)%points.length],weight));

/** The twelve edges of a box about its centre: what is walked on or looked down at is the clearest. */
export function boxSegments(w,h,d,{top=1,post=.8,foot=.5}={}) {
  const x=w/2,y=h/2,z=d/2,ring=v=>[[-x,v,-z],[x,v,-z],[x,v,z],[-x,v,z]];
  return [...loop(ring(y),top),...loop(ring(-y),foot),...ring(0).flatMap(([a,,b])=>segment([a,-y,b],[a,y,b],post))];
}

/** The creases of any other solid: for a cylinder, its two rims. */
export function edgeSegments(geometry,weight=.9) {
  const p=new T.EdgesGeometry(geometry,28).attributes.position,out=[];
  for(let i=0;i<p.count;i+=2)out.push(p.getX(i),p.getY(i),p.getZ(i),p.getX(i+1),p.getY(i+1),p.getZ(i+1),weight);
  return out;
}

/** Architecture is not drawn as boxes: a wall is one sheet, a floor is what is stood on. */
export function architecturalSegments(mesh) {
  const {width:w,height:h,depth:d}=mesh.geometry.parameters||{};
  if(!w||!h||!d)return null;
  const x=w/2,y=h/2,z=d/2;
  if(mesh.userData.contourRole==='panel'){
    // One boundary at the panel centre; front/back thickness edges are not wall joints.
    const c=w<d?[[0,-y,-z],[0,y,-z],[0,y,z],[0,-y,z]]:[[-x,-y,0],[-x,y,0],[x,y,0],[x,-y,0]];
    return [...segment(c[0],c[1],.85),...segment(c[1],c[2],1),...segment(c[2],c[3],.85),...segment(c[3],c[0],.62)];
  }
  if(mesh.userData.contourRole==='slab'){
    const walked=loop([[-x,y,-z],[x,y,-z],[x,y,z],[-x,y,z]],1);
    if(mesh.userData.kind==='stair'){
      // A tread, and the riser down to the next: the block below it is buried.
      const r=mesh.userData.riser||0,last=mesh.userData.index===9;
      return last?walked:[...walked,...[-x,x].flatMap(a=>segment([a,y-r,-z],[a,y,-z],.7))];
    }
    // The walking perimeter, and the plate's thickness wherever it is exposed (what is buried, depth hides).
    return [...walked,...loop([[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]],.34),...[[-x,-z],[x,-z],[x,z],[-x,z]].flatMap(([a,b])=>segment([a,-y,b],[a,y,b],.5))];
  }
  return null;
}

function contourGeometry(segments) {
  const count=segments.length/7,start=new Float32Array(count*3),end=new Float32Array(count*3),weight=new Float32Array(count),centers=new Float32Array(count*3);
  const bounds=new T.Box3(),point=new T.Vector3();
  for(let i=0;i<count;i++){
    const k=i*7;start.set(segments.slice(k,k+3),i*3);end.set(segments.slice(k+3,k+6),i*3);weight[i]=segments[k+6];
    bounds.expandByPoint(point.fromArray(segments,k));bounds.expandByPoint(point.fromArray(segments,k+3));
  }
  const center=bounds.getCenter(new T.Vector3());
  for(let i=0;i<count;i++)center.toArray(centers,i*3);
  const geometry=new T.InstancedBufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(QUAD,3));geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('segmentStart',new T.InstancedBufferAttribute(start,3));
  geometry.setAttribute('segmentEnd',new T.InstancedBufferAttribute(end,3));
  geometry.setAttribute('segmentWeight',new T.InstancedBufferAttribute(weight,1));
  geometry.setAttribute('contourCenter',new T.InstancedBufferAttribute(centers,3));
  geometry.instanceCount=count;
  // The quad says nothing about where the contour is: bounds come from its segments.
  geometry.boundingBox=bounds;geometry.boundingSphere=bounds.getBoundingSphere(new T.Sphere());
  return geometry;
}

export function createContour(segments,material) {
  const contour=new T.Mesh(contourGeometry(segments),material);contour.userData.contour=true;return contour;
}

export function setContourSegments(contour,segments) {
  contour.geometry.dispose();contour.geometry=contourGeometry(segments);
}

/** Where an edge's "outward" is measured from, when the middle of its own segments is not the answer. */
export function setContourCenter(contour,center) {
  const centers=contour.geometry.attributes.contourCenter;
  for(let i=0;i<centers.count;i++)centers.setXYZ(i,...center);
  centers.needsUpdate=true;
}

/** One place for a host to set what every contour shares: its size on screen, and how much light it carries. */
export function tuneContours(materials,{width,height,line,gain}) {
  for(const material of materials){
    if(!material.userData.contour)continue;
    material.uniforms.resolution.value.set(width,height);
    material.uniforms.contourWidth.value=line;
    material.uniforms.contourOpacity.value=gain*(material.userData.contourGain??1);
  }
}

/** The height at which a set of clipping planes cuts a wall off, for the light that follows the cut (addEdgeLight). */
export const cutTop=planes=>planes.reduce((top,plane)=>plane.normal.y<-.5?Math.min(top,plane.constant):top,1000);

/* ── Light in the surfaces themselves ───────────────────── */

/** A rounded surface shows its contour where it turns away from the eye. */
export function addSurfaceRim(material,tone,strength=.32) {
  const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey.call(material);
  material.onBeforeCompile=shader=>{
    prior.call(material,shader);shader.uniforms.contourTint={value:new T.Color(COLORS[tone])};
    shader.fragmentShader='uniform vec3 contourTint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      #include <opaque_fragment>
      float contourRim=pow(1.-abs(dot(normal,geometryViewDir)),5.);
      gl_FragColor.rgb+=contourTint*contourRim*${strength.toFixed(3)}/max(gl_FragColor.a,.2);
    `);
  };
  material.customProgramCacheKey=()=> `${priorKey}/surface-rim/${tone}/${strength}`;
}

/** Give a box the measurement a shader needs to light it from its edges: the size of each face, in metres. */
export function measureFaces(geometry,w,h,d) {
  const sizes=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]],count=geometry.attributes.position.count,face=new Float32Array(count*2);
  for(let i=0;i<count;i++)face.set(sizes[i>>2],i*2);
  geometry.setAttribute('faceSize',new T.BufferAttribute(face,2));
}

/**
 * Sheet and plate carry light to their edges, the way cast acrylic does: a
 * face is clear in its middle and brightens toward its border; a face that is
 * all border — the thickness of a floor, the cut top of a wall — is lit
 * throughout. `edgeCut` is the height a cutaway currently cuts the sheet at,
 * so the light follows the cut; `edgeGain` is zero where the model is shown solid.
 */
export function addEdgeLight(material,tone,strength) {
  const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey.call(material);
  const cut={value:1000},gain={value:strength};
  material.userData.edgeLight={cut,gain,strength};
  material.onBeforeCompile=shader=>{
    prior.call(material,shader);
    Object.assign(shader.uniforms,{edgeTint:{value:new T.Color(COLORS[tone])},edgeCut:cut,edgeGain:gain});
    shader.vertexShader='attribute vec2 faceSize;varying vec4 vFace;varying float vLift;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvFace=vec4(uv,faceSize);vLift=(modelMatrix*vec4(transformed,1.)).y;');
    shader.fragmentShader='uniform vec3 edgeTint;uniform float edgeCut;uniform float edgeGain;varying vec4 vFace;varying float vLift;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      #include <opaque_fragment>
      if(vFace.z>0.&&edgeGain>0.){
        // Metres from the nearest border of this face, or from the cut if that is nearer.
        vec2 border=min(vFace.xy,1.-vFace.xy)*vFace.zw;
        float reach=min(min(border.x,border.y),max(edgeCut-vLift,0.));
        // A fine line of light at the border itself, and a little that carries a hand's breadth into the sheet.
        float edgeGlow=.7*exp(-reach/.014)+.16*exp(-reach/.09);
        gl_FragColor.rgb+=edgeTint*edgeGlow*edgeGain/max(gl_FragColor.a,.2);
      }
    `);
  };
  material.customProgramCacheKey=()=> `${priorKey}/edge-light-v2/${tone}`;
}
