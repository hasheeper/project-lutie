/* Boot: fit the stage, build the port, start the loop, route input. */
(function (L) {
  'use strict';

  const HEIGHT = 1024;
  const MIN_WIDTH = 1536;     // 3:2, the concept art's frame
  const MAX_WIDTH = 1880;     // a little past 16:9

  const stage = L.$('#stage');
  const hull = L.$('#hull');
  const lamps = L.$('#lamps');
  const pane = L.$('.pane');
  const bevel = L.$('.bevel');
  const taps = L.$('.taps');
  const layers = L.$$('[data-depth]').map((el) => ({ el, depth: Number(el.dataset.depth) }));

  let width = 0;        // stage width the canvases are sized for
  let built = 0;        // stage width the port was last drawn for
  let scale = 1;
  let settle = 0;

  /* ── Layout ───────────────────────────────────────────── */

  /**
   * Fit the stage to the window. Scaling is immediate; redrawing the port for
   * a new width costs a few tens of milliseconds, so while the window is
   * being dragged it waits until the size has settled.
   */
  function layout(settled) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.round(L.clamp((HEIGHT * vw) / vh, MIN_WIDTH, MAX_WIDTH));
    scale = Math.min(vw / w, vh / HEIGHT);

    stage.style.width = `${w}px`;
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;

    clearTimeout(settle);
    if (w !== built) {
      if (settled) {
        const port = L.Frame.build(hull, lamps, w, HEIGHT);
        pane.style.clipPath = `path('${port.glass}')`;
        bevel.style.clipPath = `path(evenodd, '${port.bevel}')`;
        L.Hud.attach(port);
        L.System.attach(port);
        L.Map.fit(port);
        built = w;
      } else {
        settle = setTimeout(() => layout(true), 140);
      }
    }
    L.Water.resize(w, HEIGHT, scale);
    L.Sense.resize(w, HEIGHT, scale);
    L.Map.resize(w, HEIGHT, scale);
    width = w;
  }

  /* ── Pointer ──────────────────────────────────────────── */

  const aim = { x: 0, y: 0 };      // where the eye is drawn, −1‥1
  const eye = { x: 0, y: 0 };      // where it has eased to

  function toStage(e) {
    const box = stage.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  }

  window.addEventListener('pointermove', (e) => {
    const p = toStage(e);
    L.pointer = p;
    aim.x = L.clamp((p.x / width) * 2 - 1, -1, 1);
    aim.y = L.clamp((p.y / HEIGHT) * 2 - 1, -1, 1);
  });

  // Parallax, measured against the pod (which is fixed to the eye): what lies
  // beyond the pane lags behind the pointer, the further the more; the
  // instruments, in front of the hull, lead it.
  L.loop.add((t, dt) => {
    if (L.reducedMotion) return;
    const k = Math.min(1, dt * 3);
    eye.x += (aim.x - eye.x) * k;
    eye.y += (aim.y - eye.y) * k;
    const gain = L.store.get('parallax');
    for (const { el, depth } of layers) {
      el.style.transform = `translate3d(${(eye.x * depth * gain).toFixed(2)}px, ${(eye.y * depth * gain * 0.6).toFixed(2)}px, 0)`;
    }
  });

  // A knock on the glass. Not while the pane is the map: she is not behind it then, and it is the model being touched.
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.w') || L.store.get('mode') === 'map') return;
    const p = toStage(e);
    const tap = document.createElement('div');
    tap.className = 'tap';
    tap.style.left = `${p.x}px`;
    tap.style.top = `${p.y}px`;
    tap.innerHTML = '<i></i><i></i><i></i>';
    tap.lastChild.addEventListener('animationend', () => tap.remove());
    taps.appendChild(tap);
    L.Hud.stir('curious', 4);
    L.Hud.say('tap');
  });

  window.addEventListener('keydown', (e) => {
    // While the pane is the system sheet or the map, Escape closes that (system.js, map.js) and the view stays human.
    if (L.store.get('mode') !== 'observe') return;
    if (e.key === 'v' || e.key === 'V') L.Sense.toggle();
    if (e.key === 'Escape') L.store.set('view', 'human');
  });

  /* ── Start ────────────────────────────────────────────── */

  L.Water.init(L.$('.caustics'), L.$('.motes'));
  L.Sense.init(stage);
  L.Hud.init(stage);
  L.System.init(stage);
  L.Map.init(stage);
  layout(true);
  window.addEventListener('resize', () => layout(false));
  L.loop.start();
})(window.Lutie);
