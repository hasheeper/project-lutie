/* What the map lays over the model in its other two views.

   Humidity — a field on the floors. How damp the air is over every point of
   the plan, as the place is kept: wet over her water and the deck beside it;
   spilling through the deck's door into the sitting room, and thinning as it
   goes; held off by glass, so the level steps at the walls; drawn down where
   air is dried — the observatory, the kitchen, the bedroom — and raised a
   little where water is worked with. It is drawn on the floors themselves,
   so what stands on a floor stands on the field: bands that deepen toward
   the water, and a line wherever the level passes a round figure. The figure
   over the water is the one the scale on the port's edge reads.

   Ether — light in the air. It streams toward her along spirals, as it does
   in her own view of the room (sense.js): every mote on an arm on the same
   curve, coming down out of the rooms into the water, quicker the nearer it
   is to her and the higher the ether dial is set. It is not matter, and no
   wall hides it.

   Both are made here, of the same stuff the model is made of, and put into
   its picture (design-studio/overview.js: add). The field is written twice —
   once for the picture, once to be asked for a figure — from one set of
   numbers, below.                                                            */
import * as T from '../../design-studio/vendor/three.module.js';

/* ── The field ────────────────────────────────────────── */

const DRY = 44;                               // % RH where nothing wets or dries the air
const SOFT = 0.1;                             // how wide a wall is, to the air: m
// Where the plan is not the four zones (design-studio/model.js): the bathroom, the bedroom, the deck's door.
const BATH = [4.45, 0.8, 6.25, 2.1];
const BED = [2.65, 2.1, 6.25, 4];
const DOOR = [-4.1, 0.8];
const WELL = [2.94, -2.6];                    // the cultivation columns
const PLANT = [5.55, -0.35];                  // filtration and heat exchange
const HOB = [0.7, 3.3];                       // the kitchen's extraction
const STEP = 5;                               // a line at every so many % RH

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const inside = (x, z, [x1, z1, x2, z2]) =>
  smooth(x1 - SOFT, x1 + SOFT, x) * (1 - smooth(x2 - SOFT, x2 + SOFT, x)) * smooth(z1 - SOFT, z1 + SOFT, z) * (1 - smooth(z2 - SOFT, z2 + SOFT, z));
const bell = (x, z, [cx, cz], r) => Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (2 * r * r));

/** % RH at a point of the plan, when it is `over` % over the water. */
function humidityAt(x, z, over, rooms, front) {
  const wet = over - DRY;
  const south = smooth(0.72, 0.9, z);         // past the wall the deck's door is in
  return (
    DRY +
    wet * inside(x, z, rooms.habitat) * (1 - 0.07 * smooth(front - 0.2, 0.8, z)) +
    wet * 0.5 * bell(x, z, DOOR, 1.45) * south -
    6 * inside(x, z, rooms.office) +
    (5 * bell(x, z, WELL, 0.9) + 7 * bell(x, z, PLANT, 0.9)) * inside(x, z, rooms.support) +
    13 * inside(x, z, BATH) -
    4 * inside(x, z, BED) -
    3 * bell(x, z, HOB, 1.1) * south
  );
}

// The same, for the picture.
const FIELD = `
  uniform float over;uniform float front;uniform vec4 habitat;uniform vec4 office;uniform vec4 support;
  float inside(vec2 p,vec4 r){
    return smoothstep(r.x-${SOFT},r.x+${SOFT},p.x)*(1.-smoothstep(r.z-${SOFT},r.z+${SOFT},p.x))*smoothstep(r.y-${SOFT},r.y+${SOFT},p.y)*(1.-smoothstep(r.w-${SOFT},r.w+${SOFT},p.y));
  }
  float bell(vec2 p,vec2 c,float r){vec2 d=p-c;return exp(-dot(d,d)/(2.*r*r));}
  float humidity(vec2 p){
    float wet=over-${DRY}.,south=smoothstep(.72,.9,p.y);
    return ${DRY}.
      +wet*inside(p,habitat)*(1.-.07*smoothstep(front-.2,.8,p.y))
      +wet*.5*bell(p,vec2(${DOOR}),1.45)*south
      -6.*inside(p,office)
      +(5.*bell(p,vec2(${WELL}),.9)+7.*bell(p,vec2(${PLANT}),.9))*inside(p,support)
      +13.*inside(p,vec4(${BATH}))
      -4.*inside(p,vec4(${BED}))
      -3.*bell(p,vec2(${HOB}),1.1)*south;
  }`;

function createHumidity(model) {
  const rooms = Object.fromEntries(model.rooms.map((room) => [room.id, room.bounds]));
  const front = model.metrics.front;
  const uniforms = {
    over: { value: 78 }, front: { value: front }, time: { value: 0 }, showing: { value: 0 },
    habitat: { value: new T.Vector4(...rooms.habitat) }, office: { value: new T.Vector4(...rooms.office) }, support: { value: new T.Vector4(...rooms.support) },
    tint: { value: new T.Color(0x9fe3f7) },
  };
  // Light added to the floor it lies on: nothing where the air is dry, a wash where it is wet, a line at each figure.
  const material = new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, toneMapped: false,
    blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor,
    vertexShader: 'varying vec2 place;void main(){vec4 world=modelMatrix*vec4(position,1.);place=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}',
    fragmentShader: `
      uniform float time;uniform float showing;uniform vec3 tint;varying vec2 place;
      ${FIELD}
      void main(){
        // It is never quite still.
        float h=humidity(place)+.8*sin(time*.45+place.x*.6-place.y*.4);
        float slope=fwidth(h);                                    // % RH to the pixel
        float fine=1.-smoothstep(.6*slope,1.6*slope,abs(fract(h/${STEP}.+.5)-.5)*${STEP}.);
        float firm=1.-smoothstep(.6*slope,1.6*slope,abs(fract(h/${STEP * 2}.+.5)-.5)*${STEP * 2}.);
        // Where the level falls so fast that its lines would touch — at a wall — they are left out, and the step says it.
        float apart=1.-smoothstep(${(STEP / 4).toFixed(2)},${(STEP / 2).toFixed(2)},slope);
        float damp=smoothstep(${DRY - 8}.,84.,floor(h/${STEP}.)*${STEP}.+${(STEP / 2).toFixed(2)});
        gl_FragColor=vec4(tint*showing*(.15*damp+(.3*fine+.5*firm)*apart*(.3+.7*damp)),0.);
      }`,
  });
  const group = new T.Group();
  for (const floor of model.floors) {
    const sheet = new T.Mesh(new T.PlaneGeometry(floor.w, floor.d), material);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(floor.x, floor.y + 0.012, floor.z);
    // On a floor it is drawn straight after the floor, under whatever stands there; on the water, after the water.
    sheet.renderOrder = floor.water ? 5 : -2;
    group.add(sheet);
  }
  group.visible = false;
  model.add(group);

  const at = (x, z) => humidityAt(x, z, uniforms.over.value, rooms, front);
  const water = model.floors.find((floor) => floor.water);
  // Where each zone is read: over the water; at the desk; on the service deck; in the middle of the sitting room.
  const READ = { habitat: [water.x, water.z], office: [0.5, -2.2], support: [5.1, -1.8], living: [-1.5, 2.4] };
  return {
    uniforms, group,
    /** % RH in each zone, { id: figure }. */
    readings: () => Object.fromEntries(Object.entries(READ).map(([id, [x, z]]) => [id, Math.round(at(x, z))])),
    /** Where the lines that leave the deck's door cross the way into the sitting room: [{ figure, at: [x, y, z] }]. */
    levels() {
      const out = [];
      const reach = 4.2;
      let was = at(DOOR[0], DOOR[1] + 0.2);
      for (let s = 0.02; s <= reach; s += 0.02) {
        const x = DOOR[0] + 0.75 * s;
        const z = DOOR[1] + 0.2 + 0.66 * s;
        const now = at(x, z);
        const figure = Math.ceil(now / STEP) * STEP;
        if (figure <= was && figure > now) out.push({ figure, at: [x, 0.03, z] });
        was = now;
      }
      return out;
    },
  };
}

/* ── Ether ────────────────────────────────────────────── */

const ETHER = { arms: 9, each: 13, trail: 18, swirl: (62 * Math.PI) / 180, core: 0.3, reach: 8, lift: 1.5, streak: 0.026 };
const TAN = Math.tan(ETHER.swirl);
const WHOLE = Math.PI * 2;

/** How far from her a mote is, when it has `along` of its way still to go (1 → 0): quicker the nearer. */
const out = (along) => ETHER.core + (ETHER.reach - ETHER.core) * Math.pow(along, 0.62);
/** Where on an arm that is, about her: the ether comes down out of the rooms into the water as it comes in. */
function onArm(arm, along, her) {
  const r = out(along);
  const turn = (arm * WHOLE) / ETHER.arms - TAN * Math.log(r / ETHER.reach);
  return [her[0] + Math.cos(turn) * r, her[1] + ETHER.lift * smooth(ETHER.core, ETHER.reach * 0.85, r), her[2] + Math.sin(turn) * r];
}

function createEther(model) {
  const her = model.her;
  const light = () => ({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor,
  });
  const uniforms = {
    her: { value: new T.Vector3(...her) }, phase: { value: 0 }, showing: { value: 0 }, pixelRatio: { value: 1 },
    tint: { value: new T.Color(0xffd898) },
  };
  const group = new T.Group();

  // The ways it comes by: a hair of light along each arm, there to be followed and no more.
  const ways = new T.ShaderMaterial({
    uniforms, ...light(),
    vertexShader: 'attribute float along;varying float faint;void main(){faint=smoothstep(0.,.1,along)*(1.-smoothstep(.55,1.,along));gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 tint;uniform float showing;varying float faint;void main(){gl_FragColor=vec4(tint*.2*showing*faint,0.);}',
  });
  for (let arm = 0; arm < ETHER.arms; arm++) {
    const steps = 140;
    const at = new Float32Array((steps + 1) * 3);
    const along = new Float32Array(steps + 1);
    for (let k = 0; k <= steps; k++) {
      along[k] = k / steps;
      at.set(onArm(arm, along[k], her), k * 3);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(at, 3));
    geometry.setAttribute('along', new T.BufferAttribute(along, 1));
    const way = new T.Line(geometry, ways);
    way.frustumCulled = false;
    way.renderOrder = 10;
    group.add(way);
  }

  // The motes. Each is drawn several times over, a little further back along its way each time: its streak.
  // One more point, marked by a streak of −1, is where it all gathers: in her.
  const count = ETHER.arms * ETHER.each * ETHER.trail + 1;
  const seed = new Float32Array(count * 4);
  let i = 0;
  for (let arm = 0; arm < ETHER.arms; arm++) {
    for (let k = 0; k < ETHER.each; k++) {
      const start = (k + Math.random()) / ETHER.each;
      const own = Math.random();
      for (let t = 0; t < ETHER.trail; t++) seed.set([arm, start, t / ETHER.trail, own], i++ * 4);
    }
  }
  seed.set([0, 0, -1, 0], i * 4);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('seed', new T.BufferAttribute(seed, 4));
  const material = new T.ShaderMaterial({
    uniforms, ...light(),
    vertexShader: `
      attribute vec4 seed;                    // arm · where it began · how far back along its streak · its own number
      uniform vec3 her;uniform float phase;uniform float showing;uniform float pixelRatio;
      varying float light;varying float soft;
      void main(){
        // Along its way: 1 where it comes into being, 0 where it reaches her.
        float along=fract(seed.y-phase*(.8+.4*seed.w)+max(seed.z,0.)*${ETHER.streak});
        float r=${ETHER.core}+${ETHER.reach - ETHER.core}*pow(along,.62);
        float turn=seed.x*${(WHOLE / ETHER.arms).toFixed(5)}-${TAN.toFixed(5)}*log(r/${ETHER.reach}.)+(seed.w-.5)*.07;
        vec3 at=her+vec3(cos(turn)*r,${ETHER.lift}*smoothstep(${ETHER.core},${(ETHER.reach * 0.85).toFixed(2)},r),sin(turn)*r);
        light=showing*pow(1.-seed.z,1.5)*smoothstep(0.,.014,along)*(1.-smoothstep(.8,1.,along));
        gl_PointSize=pixelRatio*mix(3.,1.7,seed.z);soft=3.2;
        if(seed.z<0.){at=her;light=showing*(.3+.05*sin(phase*40.));gl_PointSize=pixelRatio*44.;soft=5.;}
        gl_Position=projectionMatrix*viewMatrix*vec4(at,1.);
      }`,
    fragmentShader: `
      uniform vec3 tint;varying float light;varying float soft;
      void main(){
        float r=length(gl_PointCoord*2.-1.);
        gl_FragColor=vec4(tint*1.5*light*exp(-r*r*soft)*smoothstep(1.,.7,r),0.);
      }`,
  });
  const motes = new T.Points(geometry, material);
  motes.frustumCulled = false;
  motes.renderOrder = 11;
  group.add(motes);
  group.visible = false;
  model.add(group, (w, h, ratio) => {
    uniforms.pixelRatio.value = ratio;
  });
  return { uniforms, group };
}

/* ── Assembly ─────────────────────────────────────────── */

/** Give a model (design-studio/overview.js) the map's two other views. Returns the same model, with them. */
export function addFields(model) {
  const humid = createHumidity(model);
  const ether = createEther(model);
  return Object.assign(model, {
    /** How much of each view is showing, 0‥1. */
    show({ humid: h = 0, ether: e = 0 }) {
      humid.uniforms.showing.value = h;
      humid.group.visible = h > 0.004;
      ether.uniforms.showing.value = e;
      ether.group.visible = e > 0.004;
    },
    /** What the instruments read: humidity over the water and the ether dial, both 0‥1. */
    climate({ humidity, light }) {
      humid.uniforms.over.value = humidity * 100;
      ether.drive = 0.03 + 0.08 * light;
      ether.uniforms.tint.value.set(0xffd898).multiplyScalar(0.6 + 0.4 * light);
    },
    /** Time passes: `seconds` on the clock, `dt` since the last. */
    tick(seconds, dt) {
      humid.uniforms.time.value = seconds;
      ether.uniforms.phase.value += dt * (ether.drive || 0.08);
    },
    readings: humid.readings,
    levels: humid.levels,
  });
}
