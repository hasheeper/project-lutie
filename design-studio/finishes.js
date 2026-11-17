import * as T from './vendor/three.module.js';

// Local, deterministic surface textures: no image downloads or canvas dependency.
export function createFinishes() {
  const textures=new Set(),materials=new Set();
  const texture=(size,sample,color=false)=>{
    const pixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels.set(sample(x,y,size),(y*size+x)*4);
    const map=new T.DataTexture(pixels,size,size);map.wrapS=map.wrapT=T.RepeatWrapping;
    map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;
    if(color)map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;textures.add(map);return map;
  };
  const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const grain=texture(128,(x,y)=>{const v=160+Math.round(noise(x,y)*65);return [v,v,v,255];});
  grain.repeat.set(7,7);
  const weave=texture(128,(x,y)=>{const v=150+(x%4<2?28:0)+(y%4<2?28:0)+noise(x,y)*15;return [v,v,v,255];});
  weave.repeat.set(5,5);
  const brushed=texture(128,(x,y)=>{const v=150+Math.round(noise(0,y)*70+noise(x,y)*15);return [v,v,v,255];});
  brushed.repeat.set(2,5);
  const screen=texture(256,(x,y,size)=>{
    const u=x/size,v=y/size,r=Math.hypot((u-.29)*1.8,v-.5);
    const ring=Math.abs(r-.27)<.007||Math.abs(r-.21)<.003;
    const graph=u>.55&&u<.93&&Math.abs(v-(.48+Math.sin(u*43)*.07+Math.cos(u*17)*.09))<.008;
    const grid=(x%32===0||y%32===0)&&u>.06&&u<.95&&v>.1&&v<.9;
    return ring||graph?[89,192,213,255]:grid?[22,66,83,255]:[7,27,38,255];
  },true);
  const physical=(color,options={})=>{const material=new T.MeshPhysicalMaterial({color,roughness:.5,envMapIntensity:.65,specularIntensity:.8,...options});materials.add(material);return material;};
  // The building is cast glass, cool and clear; what people use is frosted and pale, lit a little from within;
  // only three things give light of their own — samples (glow), screens, and lamps (warm).
  const M={
    slab:physical(0x275a78,{roughness:.5,metalness:0}),
    wall:physical(0x6ca0b5,{roughness:.16,metalness:0,side:T.DoubleSide,specularIntensity:1,envMapIntensity:.9}),
    panel:physical(0x4c7e94,{roughness:.5,metalness:0}),
    floor:physical(0x1b4560,{roughness:.2,metalness:0,clearcoat:.3,clearcoatRoughness:.25}),
    wet:physical(0x26768f,{roughness:.22,metalness:0,clearcoat:.35}),
    glass:physical(0xa9dae2,{transparent:true,opacity:.1,depthWrite:true,side:T.DoubleSide,roughness:.085,metalness:0,ior:1.46,specularIntensity:1,envMapIntensity:1.1}),
    // A vessel is glass too, but round and small: it is drawn as itself, so it can be seen through a wall of glass.
    vessel:physical(0xbfe9ee,{transparent:true,opacity:.14,depthWrite:false,roughness:.08,metalness:0,specularIntensity:1,envMapIntensity:1.1}),
    wood:physical(0x9fb8c0,{roughness:.36,metalness:.03,emissive:0x6f98a3,emissiveIntensity:.06}),
    soft:physical(0xc9d9db,{roughness:.45,metalness:0,sheen:.08,sheenColor:new T.Color(0xe8f5f6),sheenRoughness:.85,emissive:0x9fb9bd,emissiveIntensity:.1}),
    linen:physical(0xdfeaea,{roughness:.45,sheen:.08,sheenColor:new T.Color(0xeef6f4),sheenRoughness:.85,emissive:0xa9c0c2,emissiveIntensity:.1}),
    metal:physical(0x98b8c0,{roughness:.5,metalness:.08,bumpMap:brushed,bumpScale:.001}),
    dark:physical(0x1b3f57,{roughness:.5,metalness:0}),
    rock:physical(0x2b4a52,{roughness:.88,bumpMap:grain,bumpScale:.05}),
    white:physical(0xbccfd2,{roughness:.5,metalness:0,emissive:0x8fb0b6,emissiveIntensity:.07}),
    brass:physical(0xa3bcc2,{roughness:.4,metalness:.08}),
    glow:physical(0x7ceaf0,{roughness:.3,emissive:0x25d7e8,emissiveIntensity:2.1}),
    screen:physical(0xffffff,{map:screen,roughness:.3,emissive:0xffffff,emissiveMap:screen,emissiveIntensity:1.1}),
    warm:physical(0xffe2a2,{roughness:.55,emissive:0xffc541,emissiveIntensity:3.2}),
  };
  for(const [name,material] of Object.entries(M))material.name=name;
  // This is an architectural illustration: translucent mass, not a metal/glass product render. Everything
  // writes depth, so a thing hides what is inside it and what it stands in front of; the little that
  // shows through is its own colour.
  for(const [name,opacity] of Object.entries({slab:.8,wall:.26,panel:.7,floor:.78,wet:.8,wood:.72,metal:.74,dark:.86,white:.76,brass:.7,soft:.84,linen:.86})){
    const material=M[name],depthWrite=true;
    material.transparent=true;material.opacity=opacity;material.depthWrite=depthWrite;
    material.userData.presentationOpacity=opacity;material.userData.presentationDepthWrite=depthWrite;
  }
  M.wall.userData.massShell=true;
  M.wall.userData.opticalDensity=.28;M.glass.userData.opticalDensity=.08;
  return {M,textures,materials};
}

/**
 * What is alive is shown as a projection: light where the form turns away
 * from the eye, nearly clear where it faces it. `body` is the light of the
 * facing surface, `rim` of the outline, `power` how tightly the outline is drawn.
 */
export function createHologramMaterial(color,{body=.2,rim=1.5,power=2.2,opacity=.4}={}) {
  return new T.ShaderMaterial({
    uniforms:{hologramColor:{value:new T.Color(color)},hologramLook:{value:new T.Vector4(body,rim,power,opacity)}},
    transparent:true,depthWrite:false,clipping:true,toneMapped:false,
    vertexShader:`
      varying vec3 vNormal;
      varying vec3 vView;
      #include <clipping_planes_pars_vertex>
      void main(){
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        vNormal=normalize(normalMatrix*normal);
        vView=isOrthographic?vec3(0.,0.,1.):normalize(-mvPosition.xyz);
        gl_Position=projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader:`
      uniform vec3 hologramColor;
      uniform vec4 hologramLook;
      varying vec3 vNormal;
      varying vec3 vView;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        vec3 n=normalize(vNormal);
        float outline=pow(1.-abs(dot(n,normalize(vView))),hologramLook.z);
        float lit=.7+.3*n.y;                 // a little more light on what faces up
        gl_FragColor=vec4(hologramColor*(hologramLook.x*lit+hologramLook.y*outline),mix(hologramLook.w,1.,outline));
      }`,
  });
}

/**
 * Small lights: bubbles, grains in rock. Each point may carry a `phase`
 * (0‥1), which sets its size and the pace at which it brightens and dims.
 */
export function createSparkMaterial(color,{size=3}={}) {
  const material=new T.ShaderMaterial({
    uniforms:{sparkColor:{value:new T.Color(color)},sparkSize:{value:size},pixelRatio:{value:2},time:{value:0}},
    transparent:true,depthWrite:false,clipping:true,toneMapped:false,blending:T.AdditiveBlending,
    vertexShader:`
      attribute float phase;
      uniform float sparkSize;
      uniform float pixelRatio;
      uniform float time;
      varying float glint;
      #include <clipping_planes_pars_vertex>
      void main(){
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        glint=.6+.4*sin(time*(.5+phase)+phase*40.);
        gl_PointSize=sparkSize*pixelRatio*(.7+.6*phase);
        #include <clipping_planes_vertex>
      }`,
    fragmentShader:`
      uniform vec3 sparkColor;
      varying float glint;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float r=length(gl_PointCoord*2.-1.);
        gl_FragColor=vec4(sparkColor*1.6,exp(-r*r*4.5)*smoothstep(1.,.75,r)*glint);
      }`,
  });
  material.userData.spark=true;
  return material;
}

// A studio of large luminous panels supplies real specular reflections to PBR materials.
export function createReflectionEnvironment(renderer) {
  const environment=new T.Scene();environment.background=new T.Color(0x102e40);
  const cards=[];
  function card(color,intensity,w,h,position,target){
    const material=new T.MeshBasicMaterial({color,side:T.DoubleSide});material.color.multiplyScalar(intensity);
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material);mesh.position.set(...position);mesh.lookAt(...target);environment.add(mesh);cards.push(mesh);
  }
  card(0xcbeff5,3.6,11,5,[-6,10,-6],[0,0,0]);
  card(0xffe9c9,2,9,5,[1,8,9],[0,0,0]);
  card(0x96e9ef,2.2,3,7,[8,3,-5],[0,0,0]);
  const generator=new T.PMREMGenerator(renderer),target=generator.fromScene(environment,.025,.1,50);
  generator.dispose();for(const mesh of cards){mesh.geometry.dispose();mesh.material.dispose();}
  return target;
}

export function createWaterTextures() {
  const size=256,normalPixels=new Uint8Array(size*size*4),causticPixels=new Uint8Array(size*size*4);
  const fract=n=>n-Math.floor(n),hash=(x,y,s)=>fract(Math.sin(((x%8+8)%8)*127.1+((y%8+8)%8)*311.7+s)*43758.5453);
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const u=i/size*Math.PI*2,v=j/size*Math.PI*2,k=(j*size+i)*4;
    const dx=.32*Math.cos(u*3+Math.sin(v*2))+.16*Math.cos(u*7-v*4);
    const dz=.29*Math.cos(v*4+Math.sin(u*2))-.16*Math.cos(u*7-v*4);
    const norm=new T.Vector3(-dx,-dz,1).normalize();
    normalPixels.set([Math.round((norm.x*.5+.5)*255),Math.round((norm.y*.5+.5)*255),Math.round((norm.z*.5+.5)*255),255],k);
    const x=i/size*8+.38*Math.sin(v*3+Math.sin(u*2)),y=j/size*8+.38*Math.sin(u*2+Math.cos(v*3));
    let first=10,second=10;
    for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){
      const cx=Math.floor(x)+a,cy=Math.floor(y)+b;
      const distance=Math.hypot(cx+.2+.6*hash(cx,cy,0)-x,cy+.2+.6*hash(cx,cy,9)-y);
      if(distance<first){second=first;first=distance;}else if(distance<second)second=distance;
    }
    const ridge=Math.exp(-Math.pow((second-first)*21,2));
    causticPixels.set([164,246,238,Math.round(ridge*255)],k);
  }
  const make=(pixels,color=false)=>{
    const texture=new T.DataTexture(pixels,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;
    texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
    if(color)texture.colorSpace=T.SRGBColorSpace;return texture;
  };
  const normals=make(normalPixels),caustics=make(causticPixels,true);
  normals.repeat.set(1.5,1.3);caustics.repeat.set(1.4,1.2);
  return {normals,caustics};
}
