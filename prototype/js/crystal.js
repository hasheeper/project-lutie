/* The crystal in the view switch, as a solid.

   It is not drawn; it is a convex stone — the space on the inner side of a
   couple of dozen planes — and every pixel of its canvas follows one ray of
   sight through it:
     · where the ray meets a facet, part of the light is mirrored off it
     · the rest bends into the stone, runs from facet to facet, and at each
       one either escapes into the room or is thrown back inside
     · red, green and blue bend by slightly different amounts, so they part
       company inside and come out as colour along the edges
     · the path gathers a little of the light that sits at the stone's heart
   What the escaping rays see is a small stand-in for the room: the water's
   surface as bands of light overhead, the key light, Lutie's glow to one
   side, the warm lamps of the sill below.

   The stone turns slowly and leans toward the pointer. In Lutie's view the
   same room is read as ether: one warm colour, by brightness.               */
(function (L) {
  'use strict';

  const TAU = Math.PI * 2;
  const SIZE = { w: 200, h: 236, scale: 82, lift: 2 };       // canvas in stage px; px per unit; stone's centre above the canvas's
  const BOUNCES = 5;

  /* ── The cut ──────────────────────────────────────────
     A full stone, nearly as wide as it is tall, cut eightfold:
       crown     eight facets from the girdle up toward the point
       star      eight shallower ones that take over near the top, so the point
                 is a low pyramid on a steeper one
       pavilion  eight from the girdle down to the lower point, turned half a step
       bezel     where two crown facets would meet in a ridge, a steeper facet
                 takes the ridge off; likewise between pavilion facets
     Each plane is (unit normal, distance from the centre).                    */

  const CUT = {
    fold: 8,
    top: 1.0,
    bottom: -1.0,
    girdle: 0.03,
    radius: 0.74,              // from the axis to the middle of a facet, at the girdle
    star: [0.7, 0.8],          // how far up a crown facet the star starts; its slope against the crown's
    bezel: [0.3, 0.6],         // how far up the ridge the bezel reaches; how upright it stands
    bevel: [0.3, 0.6],
  };

  function cut() {
    const planes = [];
    const add = (nx, ny, nz, px, py, pz) => {
      const l = Math.hypot(nx, ny, nz);
      planes.push(nx / l, ny / l, nz / l, (nx * px + ny * py + nz * pz) / l);
    };
    const { fold, top, bottom, girdle, radius } = CUT;
    const half = TAU / (fold * 2);
    const ridge = radius / Math.cos(half);                  // where two neighbours of a ring would meet, at the girdle
    const rise = top - girdle;
    const fall = girdle - bottom;
    for (let k = 0; k < fold; k++) {
      const a = (k / fold) * TAU;
      const b = a + half;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(b);
      const sb = Math.sin(b);

      add(ca * rise, radius, sa * rise, 0, top, 0);                                      // crown
      add(cb * fall, -radius, sb * fall, 0, bottom, 0);                                  // pavilion

      const [w, slope] = CUT.star;
      add(ca * rise * slope, radius, sa * rise * slope, radius * (1 - w) * ca, girdle + w * rise, radius * (1 - w) * sa);

      const [u, tilt] = CUT.bezel;
      add(cb, tilt, sb, ridge * (1 - u) * cb, girdle + u * rise, ridge * (1 - u) * sb);

      const [v, drop] = CUT.bevel;
      add(ca, -drop, sa, ridge * (1 - v) * ca, girdle - v * fall, ridge * (1 - v) * sa);
    }
    return new Float32Array(planes);
  }

  /* ── Shader ───────────────────────────────────────────── */

  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  const frag = (count) => `
    precision highp float;
    #define N ${count}
    #define BOUNCES ${BOUNCES}

    uniform vec2 uCentre;        // the stone's centre, in canvas pixels
    uniform float uScale;        // canvas pixels per unit
    uniform mat3 uTurn;          // the stone's frame → the eye's
    uniform vec4 uPlanes[N];
    uniform float uEther;        // 0 the room as an eye sees it, 1 as ether
    uniform float uLift;         // 0 at rest, 1 under the pointer

    const float IOR = 1.72;
    const float SPREAD = 0.085;                             // how far apart red and blue bend
    const float CAM = 7.0;
    const vec3 KEY = vec3(-0.5003, 0.7204, 0.4803);         // the same key light as the glass: above, left, in front
    const vec3 FILL = vec3(0.64, 0.6, 0.48);                // the bright water above and to the right
    const vec3 GLOW = vec3(-0.894, 0.0, -0.447);            // Lutie, beyond the pane to the left
    const vec3 LAMPS = vec3(0.304, -0.862, 0.406);          // the sill
    const vec3 HEART = vec3(0.0, 0.06, 0.0);

    // The room, by direction (in the eye's frame, y up).
    vec3 room(vec3 d) {
      d = uTurn * d;
      vec3 c = mix(vec3(0.03, 0.14, 0.27), vec3(0.5, 0.86, 1.0), smoothstep(-0.75, 0.9, d.y));
      // The surface overhead is not even: six bands of light round the horizon.
      float band = abs(fract(atan(d.x, d.z) * 0.95493 + d.y * 0.6) - 0.5) * 2.0;
      c *= 0.2 + 1.25 * smoothstep(0.25, 0.75, band);
      c += vec3(1.0, 1.0, 0.97) * 3.4 * pow(max(dot(d, KEY), 0.0), 32.0);
      c += vec3(0.86, 0.94, 1.0) * 1.3 * pow(max(dot(d, FILL), 0.0), 30.0);
      c += vec3(0.45, 1.0, 0.85) * 0.8 * pow(max(dot(d, GLOW), 0.0), 5.0);
      c += vec3(1.0, 0.72, 0.4) * 1.5 * pow(max(dot(d, LAMPS), 0.0), 16.0);
      vec3 ether = vec3(1.0, 0.8, 0.5) * dot(c, vec3(0.3, 0.6, 0.1)) * 1.35 + vec3(0.05, 0.02, 0.0);
      return mix(c, ether, uEther);
    }

    // Follow light of one colour from just inside a facet until it has left the stone.
    vec3 inside(vec3 p, vec3 r, float ior, out float heart) {
      vec3 seen = vec3(0.0);
      float left = 1.0;                                     // share of the light still inside
      float f0 = (ior - 1.0) / (ior + 1.0);
      f0 *= f0;
      heart = 0.0;
      for (int b = 0; b < BOUNCES; b++) {
        float reach = 1e9;
        vec3 n = vec3(0.0, 1.0, 0.0);
        for (int i = 0; i < N; i++) {
          vec3 pn = uPlanes[i].xyz;
          float toward = dot(pn, r);
          if (toward > 1e-4) {
            float t = (uPlanes[i].w - dot(pn, p)) / toward;
            if (t < reach) { reach = t; n = pn; }
          }
        }
        // How near this stretch passes the heart of the stone.
        vec3 q = p + r * clamp(dot(HEART - p, r), 0.0, reach) - HEART;
        heart += left * exp(-dot(q, q) * 5.5);

        p += r * reach - n * 1e-4;
        vec3 leave = refract(r, -n, ior);
        if (dot(leave, leave) > 0.5) {
          float f = f0 + (1.0 - f0) * pow(1.0 - dot(leave, n), 5.0);
          seen += left * (1.0 - f) * room(leave);
          left *= f;
          if (left < 0.03) break;
        }
        r = reflect(r, -n);                                 // thrown back, wholly or in part
      }
      return seen + left * 0.6 * room(r);
    }

    void main() {
      vec2 xy = (gl_FragCoord.xy - uCentre) / uScale;
      // v * M is transpose(M) * v, and the transpose of a rotation undoes it.
      vec3 o = vec3(0.0, 0.0, CAM) * uTurn;
      vec3 d = normalize(vec3(xy, -CAM)) * uTurn;

      // Where the line of sight enters the stone and where it would leave.
      float enter = -1e9;
      float leaveAt = 1e9;
      vec3 n0 = vec3(0.0);
      for (int i = 0; i < N; i++) {
        vec3 pn = uPlanes[i].xyz;
        float toward = dot(pn, d);
        float slack = uPlanes[i].w - dot(pn, o);
        if (toward < -1e-5) {
          float t = slack / toward;
          if (t > enter) { enter = t; n0 = pn; }
        } else if (toward > 1e-5) {
          leaveAt = min(leaveAt, slack / toward);
        } else if (slack < 0.0) {
          enter = 1e9;
        }
      }
      float chord = leaveAt - enter;
      if (chord <= 0.0) { gl_FragColor = vec4(0.0); return; }
      vec3 p = o + d * enter;
      float px = 1.0 / uScale;

      // Distance, across the facet, to its nearest edge.
      float edge = 1e9;
      for (int i = 0; i < N; i++) {
        vec3 pn = uPlanes[i].xyz;
        float same = dot(pn, n0);
        if (same < 0.999) edge = min(edge, (uPlanes[i].w - dot(pn, p)) / sqrt(1.0 - same * same));
      }

      float f = 0.07 + 0.93 * pow(1.0 - dot(-d, n0), 5.0);
      vec3 start = p - n0 * 1e-4;
      float hr;
      float hg;
      float hb;
      vec3 through = vec3(
        inside(start, refract(d, n0, 1.0 / (IOR - SPREAD)), IOR - SPREAD, hr).r,
        inside(start, refract(d, n0, 1.0 / IOR), IOR, hg).g,
        inside(start, refract(d, n0, 1.0 / (IOR + SPREAD)), IOR + SPREAD, hb).b);

      vec3 c = room(reflect(d, n0)) * f + through * (1.0 - f) * vec3(0.8, 0.94, 1.0);
      c += mix(vec3(0.03, 0.11, 0.2), vec3(0.2, 0.12, 0.03), uEther);                // the stone's own faint colour, so its shadows are blue, not grey
      c += mix(vec3(0.72, 0.95, 1.0), vec3(1.0, 0.85, 0.55), uEther) * hg * (0.75 + 0.6 * uLift);
      c += vec3(0.42) * (1.0 - smoothstep(px * 0.5, px * 2.0, edge));          // a polished edge catches a line of light
      // The heart shows through as a small star: a core and four fine rays.
      vec2 s = xy - vec2(0.02, 0.05);
      float star = exp(-dot(s, s) * 16.0) * 0.5
        + (exp(-abs(s.x) * 46.0 - abs(s.y) * 3.6) + exp(-abs(s.y) * 46.0 - abs(s.x) * 3.6)) * 0.5;
      c += mix(vec3(0.86, 0.97, 1.0), vec3(1.0, 0.88, 0.6), uEther) * star * (0.7 + 0.5 * uLift);
      c = 1.0 - exp(-c * 1.45);

      // Bright facets are solid; dark ones let the lens behind show through.
      float cover = smoothstep(0.0, px * 2.5, chord);
      float a = clamp(max(c.r, max(c.g, c.b)) * 1.2 + 0.58, 0.0, 1.0);
      gl_FragColor = vec4(c, a) * cover;
    }`;

  /* ── Runtime ──────────────────────────────────────────── */

  let gl = null;
  let canvas = null;
  let host = null;
  const uniform = {};
  const pose = { spin: 0.4, lean: 0, yaw: 0, lift: 0, ether: 0 };
  let hover = false;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  /** @returns {boolean} false if the stone cannot be rendered here. */
  function init(target, button) {
    canvas = target;
    host = button;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
      if (!gl) throw new Error('WebGL unavailable');
      const planes = cut();
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag(planes.length / 4)));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['uCentre', 'uScale', 'uTurn', 'uPlanes', 'uEther', 'uLift']) uniform[name] = gl.getUniformLocation(prog, name);
      gl.uniform4fv(uniform.uPlanes, planes);
    } catch (err) {
      console.warn('[crystal] falling back to the drawn stone:', err.message);
      gl = null;
      canvas.remove();
      return false;
    }

    canvas.style.width = `${SIZE.w}px`;
    canvas.style.height = `${SIZE.h}px`;
    // Twice stage resolution whatever the screen: facet edges are hard, and
    // the extra samples are what keeps them clean.
    canvas.width = SIZE.w * 2;
    canvas.height = SIZE.h * 2;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniform.uCentre, canvas.width / 2, canvas.height / 2 + SIZE.lift * 2);
    gl.uniform1f(uniform.uScale, SIZE.scale * 2);

    host.addEventListener('pointerenter', () => { hover = true; });
    host.addEventListener('pointerleave', () => { hover = false; });
    L.loop.add(step);
    return true;
  }

  function step(t, dt) {
    if (document.hidden) return;
    const ease = Math.min(1, dt * 4);
    pose.lift += ((hover ? 1 : 0) - pose.lift) * ease;
    pose.ether += ((L.store.get('view') === 'sense' ? 1 : 0) - pose.ether) * Math.min(1, dt * 2.2);
    if (!L.reducedMotion) pose.spin += dt * (0.26 + pose.lift * 0.9);

    // Lean toward the pointer, as far as a stone held in water would.
    const ptr = L.pointer;
    let aimX = 0;
    let aimY = 0;
    if (ptr && !L.reducedMotion) {
      const cx = host.offsetLeft + L.Gem.centre[0];
      const cy = host.offsetTop + L.Gem.centre[1];
      aimX = L.clamp((ptr.x - cx) / 700, -1, 1) * 0.34;
      aimY = L.clamp((ptr.y - cy) / 500, -1, 1) * 0.26;
    }
    pose.yaw += (aimX - pose.yaw) * ease * 0.6;
    pose.lean += (aimY - pose.lean) * ease * 0.6;

    // Turn about its own axis, then tip the axis: a little toward the eye, a little to one side.
    const a = pose.spin + pose.yaw;
    const b = 0.16 + pose.lean + Math.sin(t * 0.5) * 0.04;
    const g = -0.2 + Math.sin(t * 0.37) * 0.03;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);
    // Rz(g) · Rx(b) · Ry(a), written out by column.
    gl.uniformMatrix3fv(uniform.uTurn, false, [
      cg * ca - sg * sb * sa, sg * ca + cg * sb * sa, -cb * sa,
      -sg * cb, cg * cb, sb,
      cg * sa + sg * sb * ca, sg * sa - cg * sb * ca, cb * ca,
    ]);
    gl.uniform1f(uniform.uEther, pose.ether);
    gl.uniform1f(uniform.uLift, pose.lift);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  L.Crystal = { init, cut };
})(window.Lutie);
