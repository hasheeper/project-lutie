/* Lutie's sense view: the switch itself and the ether she feels moving.

   Ether is drawn as light streaming toward the centre of her bell along
   logarithmic spirals. Every particle on an arm is placed on the same curve,
   so the field reads as a few clean currents rather than scattered sparks.    */
(function (L) {
  'use strict';

  const TAU = Math.PI * 2;
  const ARMS = 9;
  const PER_ARM = 22;
  const TRAIL = 44;
  const SWIRL = (64 * Math.PI) / 180;       // angle between the flow and the straight line inward
  const TAN_SWIRL = Math.tan(SWIRL);
  const COS_SWIRL = Math.cos(SWIRL);
  const SIN_SWIRL = Math.sin(SWIRL);
  const CORE = 58;                          // radius at which ether is taken up
  const REACH = 1080;                       // radius at which it enters the field
  const HEART = { y: 380 };                 // centre of the bell, in stage pixels

  let stage = null;
  let world = null;
  let canvas = null;
  let ctx = null;
  let observer = null;
  let switchEl = null;
  let W = 1536;
  let H = 1024;
  let ratio = 1;
  let running = 0;                          // seconds left to keep drawing after the view closes
  const particles = [];
  let arms = null;                          // the currents themselves, drawn faintly under the light moving along them
  const seen = { x: 0, y: 0, ready: false };

  function place(p, r) {
    const theta = (p.arm / ARMS) * TAU - TAN_SWIRL * Math.log(r / REACH) + p.jitter;
    p.x = W / 2 + Math.cos(theta) * r;
    p.y = HEART.y + Math.sin(theta) * r;
    p.trail.length = 0;
  }

  function seed() {
    particles.length = 0;
    for (let arm = 0; arm < ARMS; arm++) {
      for (let k = 0; k < PER_ARM; k++) {
        const p = { arm, jitter: L.rand(-0.012, 0.012), speed: L.rand(54, 92), x: 0, y: 0, trail: [] };
        // Spread evenly in log-radius so the arms start out uniformly populated.
        place(p, CORE * Math.pow(REACH / CORE, (k + Math.random()) / PER_ARM));
        particles.push(p);
      }
    }
  }

  function traceArms() {
    arms = new Path2D();
    for (let arm = 0; arm < ARMS; arm++) {
      for (let r = REACH, first = true; r >= CORE; r *= 0.975, first = false) {
        const theta = (arm / ARMS) * TAU - TAN_SWIRL * Math.log(r / REACH);
        const x = W / 2 + Math.cos(theta) * r;
        const y = HEART.y + Math.sin(theta) * r;
        if (first) arms.moveTo(x, y);
        else arms.lineTo(x, y);
      }
    }
  }

  function step(t, dt) {
    const sensing = L.store.get('view') === 'sense';
    if (sensing) running = 1.8;
    else if (running > 0) running -= dt;
    else return;

    // The observer: where the pointer rests, eased so it feels like a body, not a cursor.
    const ptr = L.pointer;
    if (ptr) {
      if (!seen.ready) {
        seen.x = ptr.x;
        seen.y = ptr.y;
        seen.ready = true;
      }
      const k = Math.min(1, dt * 5);
      seen.x += (ptr.x - seen.x) * k;
      seen.y += (ptr.y - seen.y) * k;
      observer.style.transform = `translate3d(${seen.x.toFixed(1)}px, ${seen.y.toFixed(1)}px, 0)`;
    }

    const cx = W / 2;
    const cy = HEART.y;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      const dx = cx - p.x;
      const dy = cy - p.y;
      const r = Math.hypot(dx, dy);
      if (r < CORE) {
        place(p, REACH);
        continue;
      }
      const ux = dx / r;
      const uy = dy / r;
      // Faster as it nears her, like water toward a drain.
      const v = p.speed * (0.5 + 300 / (r + 180)) * dt;
      p.x += (ux * COS_SWIRL - uy * SIN_SWIRL) * v;
      p.y += (ux * SIN_SWIRL + uy * COS_SWIRL) * v;
      p.trail.unshift(p.x, p.y);
      if (p.trail.length > TRAIL * 2) p.trail.length = TRAIL * 2;
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,216,152,.11)';
    ctx.stroke(arms);

    // One stroke per trail age, so alpha falls off along each streak.
    ctx.lineWidth = 1.3;
    for (let k = 0; k < TRAIL - 1; k++) {
      const a = Math.pow(1 - k / TRAIL, 1.6) * 0.7;
      ctx.strokeStyle = `rgba(255,216,152,${a.toFixed(3)})`;
      ctx.beginPath();
      for (const p of particles) {
        const i = k * 2;
        if (p.trail.length < i + 4) continue;
        ctx.moveTo(p.trail[i], p.trail[i + 1]);
        ctx.lineTo(p.trail[i + 2], p.trail[i + 3]);
      }
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,246,222,.95)';
    ctx.beginPath();
    for (const p of particles) {
      if (!p.trail.length) continue;
      ctx.moveTo(p.x + 1.3, p.y);
      ctx.arc(p.x, p.y, 1.3, 0, TAU);
    }
    ctx.fill();
  }

  /* ── Stills ───────────────────────────────────────────
     The light field and her felt body do not change, so each is filtered once
     into a small canvas and scaled up; both are soft enough that the missing
     resolution cannot be seen. Nothing is read back from the canvas, so this
     also works for images loaded straight from disk.                          */

  const FIELD_WIDTH = 512;
  const SELF = { w: 308, h: 644, pad: 80 };   // half of the sprite's stage size, plus room for glow
  const canFilter = 'filter' in CanvasRenderingContext2D.prototype;

  function paint(target, filterId, draw) {
    const g = target.getContext('2d');
    g.clearRect(0, 0, target.width, target.height);
    target.classList.toggle('is-plain', !canFilter);
    if (canFilter) g.filter = `url(#${filterId})`;
    draw(g);
    g.filter = 'none';
  }

  function renderStills() {
    const room = L.$('.scene__bg', stage);
    const body = L.$('.lutie__sprite', stage);

    if (room.complete && room.naturalWidth) {
      const target = L.$('#senseField', stage);
      target.width = FIELD_WIDTH;
      target.height = Math.round((FIELD_WIDTH * H) / W);
      paint(target, 'fx-lightfield', (g) => {
        // Same framing as the room itself: cover, anchored a little above centre.
        const s = Math.max(target.width / room.naturalWidth, target.height / room.naturalHeight);
        const w = room.naturalWidth * s;
        const h = room.naturalHeight * s;
        g.drawImage(room, (target.width - w) / 2, (target.height - h) * 0.44, w, h);
      });
    } else {
      room.addEventListener('load', renderStills, { once: true });
    }

    if (body.complete && body.naturalWidth) {
      const target = L.$('#senseSelf', stage);
      target.width = SELF.w + SELF.pad * 2;
      target.height = SELF.h + SELF.pad * 2;
      paint(target, 'fx-self', (g) => g.drawImage(body, SELF.pad, SELF.pad, SELF.w, SELF.h));
    } else {
      body.addEventListener('load', renderStills, { once: true });
    }
  }

  /** The view opens out of the crystal, so anchor the reveal to its centre. */
  function anchor() {
    const x = switchEl.offsetLeft + L.Gem.centre[0];
    const y = switchEl.offsetTop + L.Gem.centre[1];
    world.style.setProperty('--ox', `${x}px`);
    world.style.setProperty('--oy', `${y}px`);
  }

  function init(stageEl) {
    stage = stageEl;
    world = L.$('.world--sense', stage);
    canvas = L.$('.sense__flow', stage);
    observer = L.$('.sense__observer', stage);
    switchEl = L.$('#viewSwitch', stage);
    ctx = canvas.getContext('2d');

    L.store.on('view', (view) => {
      anchor();
      stage.dataset.view = view;
      switchEl.setAttribute('aria-pressed', String(view === 'sense'));
      L.$('#viewName').textContent = view === 'sense' ? 'LUTIE' : 'HUMAN';
    });

    L.loop.add(step);
  }

  function resize(w, h, scale) {
    const changed = w !== W || !particles.length;
    W = w;
    H = h;
    ratio = L.clamp((window.devicePixelRatio || 1) * scale, 1, 2);
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    if (changed) {
      seed();
      traceArms();
      renderStills();
    }
    anchor();
  }

  function toggle() {
    L.store.set('view', L.store.get('view') === 'sense' ? 'human' : 'sense');
  }

  L.Sense = { init, resize, toggle };
})(window.Lutie);
