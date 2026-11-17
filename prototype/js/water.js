/* The water itself: moving caustics (WebGL) and what drifts in it (2D canvas).

   Caustics are computed, not sampled, so nothing is read back from the artwork
   and the page still works when opened straight from disk.                     */
(function (L) {
  'use strict';

  const TAU = Math.PI * 2;

  /* ── Caustics ─────────────────────────────────────────── */

  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  // Tileable caustic after Dave Hoskins' "Tileable Water Caustic":
  // light is concentrated where the iterated wave field folds over itself.
  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;

    const float TAU = 6.28318530718;

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
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      float y = 1.0 - uv.y;                       // 0 at the surface, 1 at the sill

      // The pool floor recedes to a horizon at mid-height.
      float depth = max(y - 0.5, 0.0005);
      vec2 floorUv = vec2((uv.x - 0.5) * aspect / depth, 1.0 / depth) * 1.25;
      float onFloor = caustic(floorUv + vec2(0.0, uTime * 0.02), uTime * 0.34);
      float floorMask = smoothstep(0.585, 0.82, y);

      // The same light, very large and faint, sliding over everything in the water.
      float inWater = caustic(vec2(uv.x * aspect, uv.y) * 0.62 + vec2(uTime * 0.008, 0.0), uTime * 0.2);
      float waterMask = 1.0 - smoothstep(0.55, 0.95, y) * 0.6;

      vec3 tint = vec3(0.52, 0.94, 1.0);
      gl_FragColor = vec4(tint * (onFloor * floorMask * 0.5 + inWater * waterMask * 0.085), 1.0);
    }`;

  let gl = null;
  let glCanvas = null;
  let uRes = null;
  let uTime = null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function initCaustics(canvas) {
    glCanvas = canvas;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
      if (!gl) throw new Error('WebGL unavailable');
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'uRes');
      uTime = gl.getUniformLocation(prog, 'uTime');
    } catch (err) {
      // The painted caustics in the artwork remain; only the motion is lost.
      console.warn('[water] caustics disabled:', err.message);
      gl = null;
      canvas.remove();
    }
  }

  /* ── Motes and bubbles ────────────────────────────────── */

  const MOTES = 96;
  const COLUMNS = [0.165, 0.835];          // where bubble threads rise: the two clear lanes beside the HUD
  const motes = [];
  const bubbles = [];
  const columnClock = COLUMNS.map(() => 0);

  let ctx = null;
  let moteCanvas = null;
  let sprite = null;
  let W = 1536;
  let H = 1024;
  let ratio = 1;
  let flow = 1;         // 1 at rest; raised briefly when the water is stirred
  let waterTime = 0;

  function makeSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(226,250,255,1)');
    grad.addColorStop(0.28, 'rgba(190,240,255,.5)');
    grad.addColorStop(1, 'rgba(160,230,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function newMote(anywhere) {
    const z = Math.random();
    return {
      x: L.rand(0, W),
      y: anywhere ? L.rand(0, H) : H + 12,
      z,
      size: 3 + z * z * 13,
      rise: 3 + z * 9,
      sway: L.rand(5, 20),
      phase: L.rand(0, TAU),
      twinkle: L.rand(0.4, 1.3),
    };
  }

  function emit(column, y) {
    bubbles.push({
      x0: column * W + L.rand(-4, 4),
      y: y === undefined ? L.rand(H * 0.57, H * 0.62) : y,
      r: L.rand(1.6, 6.4),
      phase: L.rand(0, TAU),
      age: 0,
    });
  }

  function drawMotes(t, dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.rise * flow * dt;
      if (m.y < -12) motes[i] = newMote(false);
      const x = m.x + Math.sin(t * 0.3 + m.phase) * m.sway;
      ctx.globalAlpha = (0.1 + m.z * 0.42) * (0.62 + 0.38 * Math.sin(t * m.twinkle + m.phase));
      ctx.drawImage(sprite, x - m.size / 2, m.y - m.size / 2, m.size, m.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBubbles(dt) {
    const top = H * 0.2;
    const fadeFrom = H * 0.3;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;
      b.y -= (16 + b.r * 7) * flow * dt;
      if (b.y < top) {
        bubbles.splice(i, 1);
        continue;
      }
      const x = b.x0 + Math.sin(b.age * 1.6 + b.phase) * (2 + b.r * 0.8);
      const a = Math.min(1, b.age / 0.6) * L.clamp((b.y - top) / (fadeFrom - top), 0, 1);

      ctx.beginPath();
      ctx.arc(x, b.y, b.r, 0, TAU);
      ctx.fillStyle = `rgba(170,232,255,${0.07 * a})`;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(218,248,255,${0.62 * a})`;
      ctx.stroke();

      if (b.r > 2.6) {
        ctx.beginPath();
        ctx.arc(x, b.y, b.r * 0.6, Math.PI * 1.08, Math.PI * 1.46);
        ctx.lineWidth = Math.max(0.8, b.r * 0.2);
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
        ctx.stroke();
      }
    }
  }

  /* ── Public ───────────────────────────────────────────── */

  function init(causticsCanvas, motesCanvas) {
    initCaustics(causticsCanvas);
    moteCanvas = motesCanvas;
    ctx = motesCanvas.getContext('2d');
    sprite = makeSprite();
    L.loop.add(step);
  }

  function resize(w, h, scale) {
    const first = motes.length === 0;
    const widthChanged = w !== W;
    W = w;
    H = h;
    ratio = L.clamp((window.devicePixelRatio || 1) * scale, 1, 2);

    moteCanvas.width = Math.round(W * ratio);
    moteCanvas.height = Math.round(H * ratio);

    if (gl) {
      // Caustics are soft by nature; half resolution is indistinguishable and four times cheaper.
      glCanvas.width = Math.round(W / 2);
      glCanvas.height = Math.round(H / 2);
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
    }

    if (first || widthChanged) {
      motes.length = 0;
      for (let i = 0; i < MOTES; i++) motes.push(newMote(true));
      if (first) {
        // Start with the threads already risen rather than empty.
        COLUMNS.forEach((c) => {
          for (let y = H * 0.6; y > H * 0.22; y -= L.rand(30, 64)) emit(c, y);
        });
      }
    }
  }

  function step(t, dt) {
    flow += (1 - flow) * Math.min(1, dt * 0.9);
    waterTime += dt * flow;

    if (gl) {
      gl.uniform1f(uTime, waterTime);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    for (let i = 0; i < COLUMNS.length; i++) {
      columnClock[i] -= dt * flow;
      if (columnClock[i] <= 0) {
        emit(COLUMNS[i]);
        columnClock[i] = L.rand(0.45, 1.15);
      }
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawMotes(t, dt);
    drawBubbles(dt);
  }

  /** Stir the water: everything quickens, then settles. */
  function surge() {
    flow = 3.6;
    for (let i = 0; i < 20; i++) {
      const column = COLUMNS[i % COLUMNS.length] + L.rand(-0.012, 0.012);
      emit(column, L.rand(H * 0.36, H * 0.62));
    }
  }

  L.Water = {
    init,
    resize,
    surge,
    /** The caustics as an image, for anything that wants the same water (the map's pools); null without WebGL. */
    caustics: () => (gl ? glCanvas : null),
  };
})(window.Lutie);
