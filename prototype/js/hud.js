/* HUD behaviour. Each instrument is a small function that binds one widget to the store. */
(function (L) {
  'use strict';

  /* ── Speech ───────────────────────────────────────────── */

  const LINES = {
    idle: ['……水里的光，暖暖的。', '……你在，玻璃那边。', '……泡泡，往上走了。', '……今天的水，软软的。', '……听得到。你的，心跳。'],
    tap: ['……咚。是你吗？', '……玻璃，响了一下。'],
    water: ['……水在动。痒痒的。', '……流过去了。凉凉的。'],
    dim: ['……暗暗的。安静。'],
    soft: ['……刚刚好。舒服。'],
    bright: ['……亮了。像，早上。'],
    overload: ['……太亮了。头，嗡嗡的。'],
    feed: ['……软软的。甜的？', '……果冻。喜欢。'],
  };
  const cursor = {};
  const PAUSE = { '…': 110, '，': 260, '。': 200, '？': 200 };

  let dialogEl = null;
  let lineEl = null;
  let typing = 0;

  function say(kind) {
    const set = LINES[kind] || LINES.idle;
    cursor[kind] = ((cursor[kind] === undefined ? -1 : cursor[kind]) + 1) % set.length;
    const text = set[cursor[kind]];
    const chars = Array.from(text);
    const run = ++typing;
    let i = 0;

    dialogEl.classList.remove('is-idle');
    lineEl.textContent = '';

    if (L.reducedMotion) {
      lineEl.textContent = text;
      dialogEl.classList.add('is-idle');
      return;
    }

    (function next() {
      if (run !== typing) return;
      if (i >= chars.length) {
        dialogEl.classList.add('is-idle');
        return;
      }
      const ch = chars[i++];
      lineEl.textContent += ch;
      setTimeout(next, (PAUSE[ch] || 62) * L.store.get('pace'));
    })();
  }

  function initDialog() {
    dialogEl = L.$('#dialog');
    lineEl = L.$('#line');
    dialogEl.addEventListener('click', () => say('idle'));
    setTimeout(() => say('idle'), 1900);
  }

  /* ── Mood ─────────────────────────────────────────────── */

  let moodTimer = 0;

  /** Mood follows the light, except for a short while after something catches her attention. */
  function restingMood() {
    const light = L.store.get('light');
    return light > 0.9 ? 'overload' : light < 0.2 ? 'drowsy' : 'calm';
  }

  function stir(mood, seconds) {
    clearTimeout(moodTimer);
    L.store.set('mood', mood);
    moodTimer = setTimeout(() => L.store.set('mood', restingMood()), seconds * 1000);
  }

  /* ── Ether light dial ─────────────────────────────────── */

  const DIAL = { cx: 56, cy: 56, r: 42, from: 135, sweep: 270 };

  function initDial() {
    const dial = L.$('#dial');
    const value = L.$('#dialValue');
    const knob = L.$('#dialKnob');
    const stage = L.$('#stage');

    L.store.on('light', (v) => {
      const a = ((DIAL.from + DIAL.sweep * v) * Math.PI) / 180;
      value.setAttribute('stroke-dasharray', `${(75 * v).toFixed(2)} 100`);
      knob.setAttribute('cx', (DIAL.cx + DIAL.r * Math.cos(a)).toFixed(2));
      knob.setAttribute('cy', (DIAL.cy + DIAL.r * Math.sin(a)).toFixed(2));
      dial.setAttribute('aria-valuenow', Math.round(v * 100));
      stage.style.setProperty('--light', v.toFixed(3));
    });

    function fromPointer(e) {
      const box = dial.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const rel = ((Math.atan2(dy, dx) * 180) / Math.PI - DIAL.from + 720) % 360;
      // The gap at the bottom of the arc belongs to whichever end is nearer.
      const v = rel <= DIAL.sweep ? rel / DIAL.sweep : rel > (360 + DIAL.sweep) / 2 ? 0 : 1;
      L.store.set('light', L.clamp(v, 0.04, 1));
    }

    function settle() {
      const mood = restingMood();
      clearTimeout(moodTimer);
      L.store.set('mood', mood);
      const light = L.store.get('light');
      say(mood === 'overload' ? 'overload' : mood === 'drowsy' ? 'dim' : light > 0.72 ? 'bright' : 'soft');
    }

    dial.addEventListener('pointerdown', (e) => {
      dial.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    dial.addEventListener('pointermove', (e) => {
      if (dial.hasPointerCapture(e.pointerId)) fromPointer(e);
    });
    dial.addEventListener('pointerup', settle);
    dial.addEventListener('keydown', (e) => {
      const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key];
      if (!step) return;
      e.preventDefault();
      L.store.set('light', L.clamp(L.store.get('light') + step, 0.04, 1));
      settle();
    });

    return { settle };
  }

  /* ── Humidity scale and the subject's label ───────────
     Both are printed on the pane, so both are built from the port's outline:
     the scale is a stretch of the port's left edge moved a little way into the
     glass, with ticks square to it, and its spine carries on down the curve
     and turns to become the rule under her name.                              */

  const RULER = { from: 262, to: 620, inset: 22, ticks: 40, rule: 700, run: 236 };
  const ruler = { walk: null, marker: null, value: null };

  function placeHumidity(h) {
    if (!ruler.walk) return;
    const p = ruler.walk.at(ruler.walk.length * (1 - h));
    ruler.marker.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    ruler.value.textContent = Math.round(h * 100);
  }

  /** Redraw everything that follows the port. Called whenever the port is rebuilt. */
  function attach(port) {
    const G = L.geometry;
    const fix = G.fix;
    const W = port.width;
    const H = port.height;
    const scale = port.flank(RULER.from, RULER.to, RULER.inset);
    const tail = port.flank(RULER.to, RULER.rule - 50, RULER.inset);
    ruler.walk = G.walker(scale, false);

    const ticks = ['', ''];
    for (let i = 0; i <= RULER.ticks; i++) {
      const p = ruler.walk.at((ruler.walk.length * i) / RULER.ticks);
      const major = i % 5 === 0;
      const len = major ? 11 : 5;
      ticks[major ? 1 : 0] += `M${fix(p.x)} ${fix(p.y)}L${fix(p.x - p.nx * len)} ${fix(p.y - p.ny * len)}`;
    }

    // Leave the curve along its own tangent and land level, where the rule starts.
    const end = tail[tail.length - 1];
    const prev = tail[tail.length - 2];
    const tl = Math.hypot(end.x - prev.x, end.y - prev.y);
    const tx = (end.x - prev.x) / tl;
    const ty = (end.y - prev.y) / tl;
    const ruleX = end.x + 46;
    const spine =
      G.toPath(scale.concat(tail.slice(1)), false) +
      `C${fix(end.x + tx * 24)} ${fix(end.y + ty * 24)} ${fix(ruleX - 22)} ${RULER.rule} ${fix(ruleX)} ${RULER.rule}` +
      `H${fix(ruleX + RULER.run)}`;

    const svg = L.$('#etch');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="etch-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${fix(W * 0.36)}" y2="${fix(H * 0.42)}">
          <stop offset="0" stop-color="#e6fbff" stop-opacity=".34"/>
          <stop offset=".6" stop-color="#e6fbff" stop-opacity=".08"/>
          <stop offset="1" stop-color="#e6fbff" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="etch-pool" gradientUnits="userSpaceOnUse" x1="${W}" y1="${H}" x2="${fix(W * 0.66)}" y2="${fix(H * 0.6)}">
          <stop offset="0" stop-color="#b6fff0" stop-opacity=".24"/>
          <stop offset="1" stop-color="#b6fff0" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="etch-rule" gradientUnits="userSpaceOnUse" x1="${fix(ruleX + 30)}" y1="0" x2="${fix(ruleX + RULER.run)}" y2="0">
          <stop offset="0" stop-color="#c4eefc" stop-opacity=".5"/>
          <stop offset="1" stop-color="#c4eefc" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path class="etch__dome" d="${G.toPath(port.inner(16))}" stroke="url(#etch-sky)"/>
      <path class="etch__dome" d="${G.toPath(port.inner(16))}" stroke="url(#etch-pool)"/>
      <g class="ruler" data-human>
        <path class="ruler__spine" d="${spine}" stroke="url(#etch-rule)"/>
        <path class="ruler__ticks" d="${ticks[0]}"/>
        <path class="ruler__ticks ruler__ticks--major" d="${ticks[1]}"/>
        <circle class="ruler__end" cx="${fix(scale[0].x)}" cy="${fix(scale[0].y)}" r="1.8"/>
        <g class="ruler__marker" id="rulerMarker">
          <circle r="3"/>
          <path d="M15 0h14"/>
          <text x="35" y="4.2" id="rulerValue">78</text>
          <text class="ruler__unit" x="35" y="15.5">% RH</text>
        </g>
      </g>`;

    ruler.marker = L.$('#rulerMarker');
    ruler.value = L.$('#rulerValue');
    placeHumidity(L.store.get('humidity'));
    // Glide only after it has been put in place once.
    requestAnimationFrame(() => ruler.marker.classList.add('is-live'));

    const plate = L.$('#plate');
    plate.style.left = `${fix(ruleX - 18)}px`;
    plate.style.top = `${RULER.rule - 56}px`;
  }

  /* ── Life cycle ───────────────────────────────────────── */

  const STAGES = ['LARVA', 'MIMICRY', 'SAPIENT', 'SAPIENT', 'SAPIENT', 'SAPIENT', 'SAPIENT', 'RETURN'];

  function initCycle() {
    const track = L.$('#cycleTrack');
    const label = L.$('#cycleStage');
    const now = L.store.get('cycle');
    const rest = STAGES[now - 1];

    STAGES.forEach((name, i) => {
      const li = document.createElement('li');
      const year = i + 1;
      li.className = year < now ? 'is-past' : year === now ? 'is-now' : '';
      li.addEventListener('pointerenter', () => {
        label.textContent = `Y${String(year).padStart(2, '0')} · ${name}`;
      });
      li.addEventListener('pointerleave', () => {
        label.textContent = rest;
      });
      track.appendChild(li);
    });
  }

  /* ── Care bubbles ─────────────────────────────────────── */

  const LIGHT_PRESETS = [0.28, 0.62, 0.96];

  function initBubbles(dial) {
    const actions = {
      water() {
        L.Water.surge();
        stir('curious', 4);
        say('water');
      },
      light() {
        const light = L.store.get('light');
        const next = LIGHT_PRESETS.find((p) => p > light + 0.02) || LIGHT_PRESETS[0];
        L.store.set('light', next);
        dial.settle();
      },
      feed() {
        const jelly = document.createElement('i');
        jelly.className = 'jelly';
        jelly.addEventListener('animationend', () => jelly.remove());
        L.$('.offerings').appendChild(jelly);
        stir('curious', 6);
        setTimeout(() => say('feed'), 2600);
      },
    };

    L.$$('.w-actions .bubble').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.remove('is-popped');
        void btn.offsetWidth;                 // restart the wobble
        btn.classList.add('is-popped');
        actions[btn.dataset.action]();
      });
    });
  }

  /* ── Slow drift of the readings ───────────────────────── */

  function initDrift() {
    const temp = L.$('#temp');
    L.store.on('temp', (v) => {
      temp.textContent = v.toFixed(1);
    });
    setInterval(() => {
      const t = L.store.get('temp') + (Math.random() < 0.5 ? -0.1 : 0.1);
      L.store.set('temp', Math.round(L.clamp(t, 19.7, 20.3) * 10) / 10);
      const h = L.store.get('humidity') + (Math.random() < 0.5 ? -0.01 : 0.01);
      L.store.set('humidity', Math.round(L.clamp(h, 0.74, 0.82) * 100) / 100);
    }, 5200);
  }

  /* ── Boot ─────────────────────────────────────────────── */

  function init(stage) {
    if (!L.Crystal.init(L.$('#crystal'), L.$('#viewSwitch'))) L.Gem.build(L.$('#gem'));
    L.Glass.mountAll(stage);
    initDialog();
    const dial = initDial();
    L.Liquid.init(L.$('#veinLiquid'));
    initCycle();
    initBubbles(dial);
    initDrift();
    L.store.on('humidity', placeHumidity);

    L.store.on('mood', (mood) => {
      stage.dataset.mood = mood;
    });
    // What the pane is being used for; modes.css has what follows from it.
    L.store.on('mode', (mode) => {
      stage.dataset.mode = mode;
    });
    L.$('#viewSwitch').addEventListener('click', L.Sense.toggle);
  }

  L.Hud = { init, attach, say, stir };
})(window.Lutie);
