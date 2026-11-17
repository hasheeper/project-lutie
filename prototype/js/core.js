/* Shared namespace: small math helpers, a keyed store, and one animation loop. */
(function () {
  'use strict';

  const L = (window.Lutie = window.Lutie || {});

  L.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  L.lerp = (a, b, t) => a + (b - a) * t;
  L.rand = (a, b) => a + Math.random() * (b - a);
  L.$ = (sel, root) => (root || document).querySelector(sel);
  L.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  L.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Store ─────────────────────────────────────────────
     light      ether light, 0‥1
     temp       water temperature, °C
     humidity   air humidity above the pool, 0‥1
     hydration  how much water Lutie holds, 0‥1
     mood       calm | curious | drowsy | overload
     view       human | sense
     mode       observe | system | map: what the pane is being used for
     parallax   how far the layers part as the eye moves; 1 as designed
     pace       how long she takes over each character; 1 as designed  */
  const state = {
    light: 0.62,
    temp: 20.0,
    humidity: 0.78,
    hydration: 0.86,
    mood: 'calm',
    view: 'human',
    cycle: 4,
    mode: 'observe',
    parallax: 1,
    pace: 1,
  };
  const listeners = new Map();

  L.store = {
    get: (key) => state[key],
    set(key, value) {
      if (state[key] === value) return;
      const prev = state[key];
      state[key] = value;
      (listeners.get(key) || []).forEach((fn) => fn(value, prev));
    },
    /** Subscribe; fires immediately with the current value unless `lazy`. */
    on(key, fn, lazy) {
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(fn);
      if (!lazy) fn(state[key], state[key]);
    },
  };

  /* ── Loop ─────────────────────────────────────────────── */
  const tasks = new Set();
  let last = 0;

  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, last ? t - last : 0.016);
    last = t;
    tasks.forEach((fn) => fn(t, dt));
    requestAnimationFrame(frame);
  }

  L.loop = {
    add(fn) {
      tasks.add(fn);
      return () => tasks.delete(fn);
    },
    start() {
      requestAnimationFrame(frame);
    },
  };
})();
