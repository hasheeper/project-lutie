/* The hydration vein: a round glass channel with her water in it.

   The channel is a tapered tube along a curve (the `vein` spine in shapes.js).
   For every pixel the shader finds the nearest point on that curve, which
   gives three things: how far along the vein it is, how far across, and how
   wide the vein is there. From those alone it draws a solid:
     · across the vein the surface is round, so there is a surface normal —
       the wall darkens toward its edges and carries one line of the key light
     · the water fills the vein from the tip of the tail up to a front, which
       climbs the wall a little and never quite sits still
     · the light in the water is a moving net of caustics laid out in the
       vein's own coordinates, so it runs along the vein, round the bend
   Beyond the front the channel is empty glass.                               */
(function (L) {
  'use strict';

  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  const frag = (count) => `
    precision highp float;
    #define N ${count}

    uniform vec3 uSpine[N];      // points down the vein, tail first: x, y, radius (stage px, y down)
    uniform vec2 uRes;
    uniform float uRatio;        // canvas pixels per stage pixel
    uniform float uLength;       // length of the vein
    uniform float uFront;        // how far along the water reaches
    uniform float uTime;

    const float TAU = 6.28318530718;
    const vec3 KEY = vec3(-0.5003, -0.7204, 0.4803);        // the HUD's key light, y down
    const vec3 HALF = vec3(-0.2907, -0.4186, 0.8604);

    // Tileable water caustic, after Dave Hoskins — the same light as on the pool floor.
    float caustic(vec2 uv, float t) {
      vec2 p = mod(uv * TAU, TAU) - 250.0;
      vec2 i = p;
      float c = 1.0;
      const float inten = 0.005;
      for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - 3.5 / float(n + 1));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
      }
      c /= 4.0;
      c = 1.17 - pow(c, 1.4);
      return pow(abs(c), 8.0);
    }

    void main() {
      vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRatio;

      float wall = 1e9;            // distance to the channel wall, negative inside
      float along = 0.0;           // distance down the vein from the tail
      float side = 0.0;            // distance across it, signed
      float radius = 1.0;
      vec2 across = vec2(0.0, 1.0);
      float run = 0.0;
      for (int i = 0; i < N - 1; i++) {
        vec2 a = uSpine[i].xy;
        vec2 ab = uSpine[i + 1].xy - a;
        float len = length(ab);
        float t = clamp(dot(p - a, ab) / (len * len), 0.0, 1.0);
        vec2 q = p - (a + ab * t);
        float r = mix(uSpine[i].z, uSpine[i + 1].z, t);
        float d = length(q) - r;
        if (d < wall) {
          wall = d;
          along = run + t * len;
          radius = r;
          across = vec2(-ab.y, ab.x) / len;
          side = dot(q, across);
        }
        run += len;
      }
      float cover = 1.0 - smoothstep(-0.6, 0.6, wall);
      if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }

      // Across the vein the surface is round.
      float x = clamp(side / radius, -1.0, 1.0);
      float z = sqrt(1.0 - x * x);
      vec3 n = vec3(across * x, z);
      float glint = pow(max(dot(n, HALF), 0.0), 70.0);
      float lit = max(dot(n, KEY), 0.0);

      // The water's front: higher at the wall than in the middle, and restless.
      float front = uFront + 2.6 * x * x + sin(uTime * 1.3) * 0.7;
      float wet = 1.0 - smoothstep(-0.7, 0.7, along - front);

      vec3 water = mix(vec3(0.36, 0.98, 0.84), vec3(0.28, 0.8, 1.0), along / uLength);
      float net = caustic(vec2(along * 0.021 - uTime * 0.11, x * 0.24 + 0.5), uTime * 0.55);
      vec3 liquid = water * (0.2 + 0.52 * z)                       // deeper in the middle
        + vec3(0.82, 1.0, 0.95) * net * (0.45 + 0.75 * z)          // light moving in it
        + water * 0.4 * lit * (1.0 - z);                           // the wall catching the key
      vec3 glass = vec3(0.03, 0.12, 0.19) * (0.5 + 0.5 * z);

      vec3 c = mix(glass, liquid, wet);
      float a = mix(0.36 + 0.34 * (1.0 - z), 0.9, wet);
      float meniscus = exp(-pow((along - front) / 1.2, 2.0));
      c += vec3(0.92, 1.0, 0.97) * meniscus * 0.75;
      c += vec3(1.0) * glint * 0.95;
      a = clamp(a + glint + meniscus * 0.5, 0.0, 1.0);

      gl_FragColor = vec4(min(c, vec3(1.0)) * a, a) * cover;
    }`;

  let gl = null;
  let ctx = null;
  let canvas = null;
  let spine = [];
  let length = 0;
  const uniform = {};

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const reach = () => (0.05 + 0.9 * L.store.get('hydration')) * length;

  function init(target) {
    canvas = target;
    const shape = L.Shapes.vein;
    spine = shape.parts[0].spine.slice().reverse();          // tail → head
    length = 0;
    for (let i = 1; i < spine.length; i++) length += Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]);

    const ratio = 2;
    canvas.style.width = `${shape.w}px`;
    canvas.style.height = `${shape.h}px`;
    canvas.width = shape.w * ratio;
    canvas.height = shape.h * ratio;

    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
      if (!gl) throw new Error('WebGL unavailable');
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag(spine.length)));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['uSpine', 'uRes', 'uRatio', 'uLength', 'uFront', 'uTime']) uniform[name] = gl.getUniformLocation(prog, name);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform3fv(uniform.uSpine, new Float32Array(spine.flat()));
      gl.uniform2f(uniform.uRes, canvas.width, canvas.height);
      gl.uniform1f(uniform.uRatio, ratio);
      gl.uniform1f(uniform.uLength, length);
      L.loop.add(step);
    } catch (err) {
      // Without a shader the vein is still a gauge: a plain column, redrawn when the level changes.
      console.warn('[liquid] drawing the vein flat:', err.message);
      gl = null;
      const flat = document.createElement('canvas');
      flat.className = canvas.className;
      flat.style.cssText = canvas.style.cssText;
      flat.width = canvas.width;
      flat.height = canvas.height;
      canvas.replaceWith(flat);
      canvas = flat;
      ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      L.store.on('hydration', drawFlat);
    }
  }

  function step(t) {
    if (document.hidden) return;
    gl.uniform1f(uniform.uFront, reach());
    gl.uniform1f(uniform.uTime, t);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawFlat() {
    const upTo = reach();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    let run = 0;
    for (let i = 1; i < spine.length; i++) {
      const [ax, ay, ar] = spine[i - 1];
      const [bx, by, br] = spine[i];
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineWidth = ar + br;
      ctx.strokeStyle = run < upTo ? 'rgba(111,240,224,.72)' : 'rgba(8,40,60,.5)';
      ctx.stroke();
      run += Math.hypot(bx - ax, by - ay);
    }
  }

  /* ── Channels ─────────────────────────────────────────
     The same solid, for any number of short channels: the levels on the
     system sheet. They share one off-screen context. Each frame it draws the
     channels that are showing, one at a time, and each one's own canvas takes
     a copy — so a page of them costs one context, not one apiece.

     A channel's spine runs from where the water starts. `front` is how far
     along it the water reaches, in px; `at(s)` is the point that far along.   */

  const channels = [];
  const shared = { gl: null, canvas: null, programs: new Map(), failed: false };
  const RATIO = 2;

  function programFor(count) {
    if (shared.programs.has(count)) return shared.programs.get(count);
    const g = shared.gl;
    const make = (type, src) => {
      const s = g.createShader(type);
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s));
      return s;
    };
    const prog = g.createProgram();
    g.attachShader(prog, make(g.VERTEX_SHADER, VERT));
    g.attachShader(prog, make(g.FRAGMENT_SHADER, frag(count)));
    g.bindAttribLocation(prog, 0, 'p');
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
    const at = {};
    for (const name of ['uSpine', 'uRes', 'uRatio', 'uLength', 'uFront', 'uTime']) at[name] = g.getUniformLocation(prog, name);
    const entry = { prog, at };
    shared.programs.set(count, entry);
    return entry;
  }

  function ready() {
    if (shared.gl) return true;
    if (shared.failed) return false;
    try {
      shared.canvas = document.createElement('canvas');
      const g = shared.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
      if (!g) throw new Error('WebGL unavailable');
      shared.gl = g;
      g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.enable(g.SCISSOR_TEST);
      g.clearColor(0, 0, 0, 0);
      return true;
    } catch (err) {
      console.warn('[liquid] drawing the channels flat:', err.message);
      shared.failed = true;
      shared.gl = null;
      return false;
    }
  }

  function channel(target, shape) {
    const line = shape.parts[0].spine;
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));

    target.style.width = `${shape.w}px`;
    target.style.height = `${shape.h}px`;
    target.width = shape.w * RATIO;
    target.height = shape.h * RATIO;

    const ch = {
      canvas: target,
      ctx: target.getContext('2d'),
      line,
      flat: new Float32Array(line.flat()),
      length: cum[cum.length - 1],
      front: 0,
      live: false,
      drawn: -1,
      at(s) {
        s = L.clamp(s, 0, ch.length);
        let i = 1;
        while (i < cum.length - 1 && cum[i] < s) i++;
        const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        return { x: L.lerp(line[i - 1][0], line[i][0], t), y: L.lerp(line[i - 1][1], line[i][1], t) };
      },
    };
    channels.push(ch);
    if (channels.length === 1) L.loop.add(drawChannels);
    return ch;
  }

  function drawChannels(t) {
    if (document.hidden) return;
    for (const ch of channels) {
      if (!ch.live) continue;
      if (!ready()) {
        if (ch.drawn !== ch.front) drawChannelFlat(ch);
        continue;
      }
      const g = shared.gl;
      const w = ch.canvas.width;
      const h = ch.canvas.height;
      if (shared.canvas.width < w || shared.canvas.height < h) {
        shared.canvas.width = Math.max(shared.canvas.width, w);
        shared.canvas.height = Math.max(shared.canvas.height, h);
      }
      const { prog, at } = programFor(ch.line.length);
      g.useProgram(prog);
      // The lower-left corner of the shared canvas, which is where gl_FragCoord starts.
      g.viewport(0, 0, w, h);
      g.scissor(0, 0, w, h);
      g.uniform3fv(at.uSpine, ch.flat);
      g.uniform2f(at.uRes, w, h);
      g.uniform1f(at.uRatio, RATIO);
      g.uniform1f(at.uLength, ch.length);
      g.uniform1f(at.uFront, ch.front);
      g.uniform1f(at.uTime, t);
      g.clear(g.COLOR_BUFFER_BIT);
      g.drawArrays(g.TRIANGLES, 0, 3);
      ch.ctx.clearRect(0, 0, w, h);
      ch.ctx.drawImage(shared.canvas, 0, shared.canvas.height - h, w, h, 0, 0, w, h);
    }
  }

  function drawChannelFlat(ch) {
    const g = ch.ctx;
    g.setTransform(RATIO, 0, 0, RATIO, 0, 0);
    g.clearRect(0, 0, ch.canvas.width, ch.canvas.height);
    g.lineCap = 'round';
    let run = 0;
    for (let i = 1; i < ch.line.length; i++) {
      const [ax, ay, ar] = ch.line[i - 1];
      const [bx, by, br] = ch.line[i];
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineWidth = ar + br;
      g.strokeStyle = run < ch.front ? 'rgba(111,240,224,.72)' : 'rgba(8,40,60,.5)';
      g.stroke();
      run += Math.hypot(bx - ax, by - ay);
    }
    ch.drawn = ch.front;
  }

  L.Liquid = { init, channel };
})(window.Lutie);
