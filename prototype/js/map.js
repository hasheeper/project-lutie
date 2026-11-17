/* The map of the facility.

   A model of the place, standing in the pane. The model is not drawn here:
   it is the overview of the design workbench (design-studio/overview.js) —
   the same rooms, the same finish, the same light — on a canvas with nothing
   behind it, so the water of the room shows round it and through its glass.
   It is a module, so it arrives after everything else (map-model.js) and is
   handed to `attach`. Until then, and if it cannot be had (a page opened
   straight from disk cannot load a module), the map has its title and says
   that the model is missing.

   It is something to be handled, a little. The view leans a few degrees
   after the pointer, as a head does in front of a thing on a table. A touch
   on a zone — on its floor in the model, or on its name — brings that zone
   closer; a touch on it again, or anywhere off the model, or Escape, lets it
   go back.

   What is here is what is printed round the model:
     · the title
     · each zone's name, standing on a rule, and the hairline that leads from
       the rule to a mark in the zone. While a zone is looked at, its outline
       lights in the model, a bubble forms on its mark, and what is inside it
       is named
     · how big the place is, set out along its two near sides
     · the cell the three views are chosen in
   The names stay where they are; everything that touches the model is placed
   by asking it where a point of the building falls on the canvas, and placed
   again whenever the view has moved, so print and model cannot drift apart.

   Zones, their names and areas, and what is named inside them are the
   workbench's (design-studio/space.mjs, model.js). Nothing about the plan is
   written down here but where the leaders end.

   Three views of the same model, chosen in the cell at the foot of the pane:
     ecology    the place as it is
     humidity   how damp the air is, laid on the floors (map-fields.js). Each
                zone's figure stands under its name, and the lines that leave
                the deck's door are numbered where they cross the way in
     ether      ether streaming toward her, as she feels it; quicker the
                higher the dial is set
   The humidity scale on the port's left edge and the ether dial in the
   corner stay where they are while the map is open: they read the same
   things, and are its legend.                                                */
(function (L) {
  'use strict';

  /* ── The view ─────────────────────────────────────────
     The model has a box of its own, centred on the stage; everything below is
     in that box's pixels, so nothing here depends on how wide the stage is.   */

  const BOX = { w: 1400, h: 900, top: 74 };
  const MARGIN = [56, 172, 62, 172];        // kept clear round the model: top, right, bottom, left
  const SHARP = 2;                          // the most canvas pixels drawn for one of the stage's

  /* Each zone, in the workbench's order: where its leader leaves its rule,
     which way the rule runs from there and how much of it is bare before the
     name, and the point of the building the leader ends on (metres: x east,
     y up, z south; `m` is the workbench's levels).                            */
  const ZONES = [
    { from: [1140, 700], run: 1, lead: 46, mark: (m) => [-5.6, m.water, -1.6] },        // the water
    { from: [360, 708], run: -1, lead: 0, mark: (m) => [0.6, m.office, -3.3] },         // the sunken observatory
    { from: [198, 168], run: -1, lead: 0, mark: () => [5.6, 0, -1.2] },                 // life support
    { from: [1168, 198], run: 1, lead: 46, mark: () => [-2.4, 0, 3.4] },                // living
  ];
  const OUT = 0.78;                         // how far outside the plate its sizes are set out, m
  const PLATE = { x: 6.45, y: -2.34, z: 4.2 };   // the plate the model stands on: half its size, and its top
  const VIEWS = [['eco', '生态视图'], ['humid', '湿度分布'], ['ether', '以太流向']];

  let stage = null;
  let mapEl = null;
  let model = null;
  let width = 1536;
  let ratio = 1;                 // canvas pixels to one of the stage's
  let line = 1;                  // and how many of them a contour is wide
  let view = 0;
  let awake = 0;                 // seconds left to keep drawing after the map closes
  let drawn = 0;                 // when the model was last drawn
  let ticked = 0;                // and when its fields last moved
  let hovered = -1;              // the zone whose name the pointer is on
  let held = -1;                 // the zone that has been brought closer
  let looked = -1;               // the zone being looked at
  let seen = '';                 // where the pointer was when the model was last asked what is under it
  let under = -1;                // and what was
  let ids = [];                  // per zone, the workbench's name for it
  let parts = [];                // per zone, what is placed by the model and what lights up with it
  let notes = [];                // what is named inside the zones
  let sizes = null;              // the group the two lengths are drawn in
  let levels = [];               // the figures on the humidity lines: { el, at }
  const weight = [1, 0, 0];      // how much of each view is showing
  const hot = [0, 0, 0, 0];      // how closely each zone is being looked at
  const weights = {};

  const fix = (v) => v.toFixed(1);
  const inBox = (p) => [p.x - (width - BOX.w) / 2, p.y - BOX.top];

  /* ── Print ────────────────────────────────────────────── */

  /** A length set out between two points of the floor: a line, a tick at every half metre, and what it comes to. */
  function dimension(a, b, out, text) {
    const at = (p) => model.project(p[0], PLATE.y, p[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const A = at(a);
    const B = at(b);
    let d = `M${fix(A[0])} ${fix(A[1])}L${fix(B[0])} ${fix(B[1])}`;
    for (let s = 0; s <= len + 1e-6; s += len / Math.round(len / 0.5)) {
      const end = s < 1e-6 || s > len - 1e-6;
      const whole = Math.abs(s - Math.round(s)) < 1e-6;
      const reach = end ? 0.3 : whole ? 0.16 : 0.08;
      const p = [a[0] + along[0] * s, a[1] + along[1] * s];
      const from = at(end ? [p[0] - out[0] * reach, p[1] - out[1] * reach] : p);
      const to = at([p[0] + out[0] * reach, p[1] + out[1] * reach]);
      d += `M${fix(from[0])} ${fix(from[1])}L${fix(to[0])} ${fix(to[1])}`;
    }
    const [tx, ty] = at([(a[0] + b[0]) / 2 + out[0] * 0.62, (a[1] + b[1]) / 2 + out[1] * 0.62]);
    let turn = (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;
    if (turn > 90) turn -= 180;
    if (turn < -90) turn += 180;
    return `<path d="${d}"/><text x="${fix(tx)}" y="${fix(ty)}" transform="rotate(${fix(turn)} ${fix(tx)} ${fix(ty)})">${text}</text>`;
  }

  /** What is printed: made once. Where the model decides, it is left to `place`. */
  function print() {
    const plan = L.$('.map__print', mapEl);
    const m = model.metrics;
    ids = model.rooms.map((room) => room.id);

    const callouts = model.rooms.map((room, i) => {
      const { from, run, lead } = ZONES[i];
      return (
        `<i class="map__pip glass" data-glass="pip" data-zone="${i}"></i>` +
        `<div class="callout${run < 0 ? ' callout--end' : ''}" tabindex="0" data-zone="${i}" style="left:${from[0] + (run > 0 ? lead : 0)}px;top:${from[1]}px">` +
        `<span class="callout__name"><em class="num">${room.number}</em>${room.name}</span>` +
        `<span class="callout__sub">${room.en} · ${Math.round(room.area)} M²</span>` +
        '<span class="callout__read"><b class="num"></b><i>% RH</i></span></div>'
      );
    }).join('');
    // What is named inside a zone, and where the one who is looking sits.
    const named = model.details.concat([{ text: '观察位 · YOU', room: 'office', at: [0.18, m.eye + 0.34, -1.85] }]);
    plan.innerHTML =
      named.map(({ text, room }) => `<span class="map__note" data-zone="${ids.indexOf(room)}">${text}</span>`).join('') +
      `<svg class="map__lines" viewBox="0 0 ${BOX.w} ${BOX.h}" aria-hidden="true"><g class="map__sizes"></g>` +
      ZONES.map((_, i) => `<g class="leader" data-zone="${i}"><path/><circle r="2.4"/></g>`).join('') +
      `</svg><div class="map__levels"></div>${callouts}`;

    notes = L.$$('.map__note', plan).map((el, i) => ({ el, at: named[i].at }));
    sizes = L.$('.map__sizes', plan);
    parts = ZONES.map((zone, i) => {
      const all = L.$$(`[data-zone="${i}"]`, plan);
      const name = L.$(`.callout[data-zone="${i}"]`, plan);
      const leader = L.$(`.leader[data-zone="${i}"]`, plan);
      // A rule is as long as the name that stands on it.
      return {
        all, read: L.$('.callout__read b', name), at: zone.mark(m), pip: L.$(`.map__pip[data-zone="${i}"]`, plan), path: leader.firstChild, dot: leader.lastChild,
        rule: `M${zone.from[0] + zone.run * (name.offsetWidth + zone.lead)} ${zone.from[1]}H${zone.from[0]}`,
      };
    });
    L.$('.map__total', mapEl).textContent = ` · ${Math.round(model.rooms.reduce((sum, room) => sum + room.area, 0))} M²`;

    L.$$('.callout', plan).forEach((el) => {
      const zone = Number(el.dataset.zone);
      const enter = () => {
        hovered = zone;
      };
      const leave = () => {
        if (hovered === zone) hovered = -1;
      };
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
      el.addEventListener('focus', enter);
      el.addEventListener('blur', leave);
    });
    L.Glass.mountAll(plan);
    read();
    place();
  }

  /** What the humidity view says in figures: each zone's, and those on the lines. Said again whenever the air changes. */
  function read() {
    if (!model || !parts.length) return;
    model.climate({ humidity: L.store.get('humidity'), light: L.store.get('light') });
    const figures = model.readings();
    parts.forEach((part, i) => {
      part.read.textContent = figures[ids[i]];
    });
    const marks = model.levels();
    const box = L.$('.map__levels', mapEl);
    if (marks.length !== levels.length) box.innerHTML = marks.map(() => '<span class="map__level num"></span>').join('');
    levels = marks.map((mark, i) => {
      const el = box.children[i];
      el.textContent = mark.figure;
      return { el, at: mark.at };
    });
    place();
  }

  /** Put everything that touches the model where the model now is. */
  function place() {
    for (const part of parts) {
      const [x, y] = model.project(...part.at);
      part.path.setAttribute('d', `${part.rule}L${fix(x)} ${fix(y)}`);
      part.dot.setAttribute('cx', fix(x));
      part.dot.setAttribute('cy', fix(y));
      part.pip.style.left = `${fix(x - 20)}px`;
      part.pip.style.top = `${fix(y - 20)}px`;
    }
    for (const note of notes.concat(levels)) {
      const [x, y] = model.project(...note.at);
      note.el.style.left = `${fix(x)}px`;
      note.el.style.top = `${fix(y)}px`;
    }
    const { width: wide, depth } = model.site;
    sizes.innerHTML =
      dimension([wide / 2, -PLATE.z - OUT], [-wide / 2, -PLATE.z - OUT], [0, -1], `${wide} M`) +
      dimension([-PLATE.x - OUT, -depth / 2], [-PLATE.x - OUT, depth / 2], [-1, 0], `${depth.toFixed(1)} M`);
    seen = '';
  }

  /* ── The loop ─────────────────────────────────────────── */

  /** Which zone is being looked at: the one whose name the pointer is on, else the one whose floor is under it, else the one held close. */
  function look(on, k) {
    let zone = -1;
    if (on && model) {
      if (L.pointer) {
        const at = `${Math.round(L.pointer.x)},${Math.round(L.pointer.y)},${width}`;
        if (at !== seen) {
          seen = at;
          under = ids.indexOf(model.roomAt(...inBox(L.pointer)));
          stage.classList.toggle('is-over-zone', under >= 0);
        }
      }
      zone = hovered >= 0 ? hovered : under >= 0 ? under : held;
    }
    if (zone !== looked) {
      looked = zone;
      parts.forEach((part, i) => part.all.forEach((el) => el.classList.toggle('is-hot', i === zone)));
    }
    for (let i = 0; i < hot.length; i++) hot[i] += ((i === zone ? 1 : 0) - hot[i]) * k;
  }

  function frame(t, dt) {
    const on = L.store.get('mode') === 'map';
    if (on) awake = 1.2;
    else if (awake > 0) awake -= dt;
    else return;
    if (!model) return;

    // The view leans after the pointer, and comes closer to the zone that is held.
    const lean = on && L.pointer && !L.reducedMotion;
    model.aim(
      lean ? L.clamp((L.pointer.x / width) * 2 - 1, -1, 1) : 0,
      lean ? L.clamp((L.pointer.y / 1024) * 2 - 1, -1, 1) : 0,
      on && held >= 0 ? ids[held] : null,
    );
    const moved = model.step(dt);
    if (moved) place();
    const k = Math.min(1, dt * 4);
    look(on, k);
    for (let i = 0; i < weight.length; i++) weight[i] += ((i === view ? 1 : 0) - weight[i]) * k;

    // While the view is moving every frame is drawn. Otherwise only the water moves, slowly: thirty a second are enough.
    if (!moved && t - drawn < 0.03) return;
    drawn = t;
    ids.forEach((id, i) => {
      weights[id] = hot[i];
    });
    model.look(weights);
    model.show({ humid: weight[1], ether: weight[2] });
    if (!L.reducedMotion) model.tick(t, Math.min(0.1, t - ticked));
    ticked = t;
    model.render(L.reducedMotion ? undefined : t);
  }

  /* ── Assembly ─────────────────────────────────────────── */

  function build(viewsEl) {
    // A page opened straight from disk cannot load a module, and so has no model: say where to open it instead.
    const missing = location.protocol === 'file:'
      ? '空间模型未载入 · 本页是从磁盘直接打开的，请改从 http://localhost:4173/prototype/ 打开'
      : '空间模型未载入 · 请刷新页面重试（浏览器需支持 WebGL）';
    mapEl.innerHTML =
      '<header class="heading map__head"><h2 class="heading__title"><b>MAP</b><span>设施空间视图</span></h2>' +
      '<p class="heading__sub">NORRENS BIOLOGICAL INSTITUTE · INDIVIDUAL PROJECT<span class="map__total"></span></p></header>' +
      '<div class="map__port"><canvas class="map__canvas" aria-hidden="true"></canvas></div>' +
      `<div class="map__plan"><div class="map__print"></div><p class="map__missing">${missing}</p></div>`;

    const choice = L.Lobes.build('lobes3', 'Map view', VIEWS.map((v) => v[1]), 0, (i) => {
      view = i;
      stage.dataset.map = VIEWS[i][0];
    });
    viewsEl.append(choice.el);
    stage.dataset.map = VIEWS[view][0];
    L.Glass.mountAll(viewsEl);
  }

  /** The model has arrived: `create` is the workbench's createOverview. */
  function attach(create) {
    if (model || !mapEl) return;
    try {
      model = create(L.$('.map__canvas', mapEl), { margin: MARGIN });
    } catch (error) {
      console.warn('Map: the model could not be made.', error);
      return;
    }
    model.resize(BOX.w, BOX.h, ratio, line);
    print();
    mapEl.classList.add('has-model');
    // Its first picture is the slow one. Have it drawn before it is asked for.
    setTimeout(() => {
      if (L.store.get('mode') !== 'map') model.render();
    }, 300);
  }

  /* ── State ────────────────────────────────────────────── */

  function open() {
    if (L.store.get('mode') === 'map') return;
    L.store.set('view', 'human');           // a map is a human's way of seeing a place
    L.store.set('mode', 'map');
  }

  function close() {
    if (L.store.get('mode') === 'map') L.store.set('mode', 'observe');
  }

  /** Bring a zone closer, or (−1) let go of the one that is. While one is held, the print that is not about it makes way. */
  function hold(zone) {
    held = zone;
    stage.classList.toggle('is-holding', held >= 0);
    parts.forEach((part, i) => part.all.forEach((el) => el.classList.toggle('is-held', i === held)));
  }

  /** A touch on the map: on a zone, it is brought closer, or let go if it already is; anywhere else, whatever is held is let go. */
  function touch(e) {
    if (L.store.get('mode') !== 'map' || !model || e.target.closest('.w, button')) return;
    const name = e.target.closest('.callout');
    let zone = name ? Number(name.dataset.zone) : -1;
    if (zone < 0) {
      const box = stage.getBoundingClientRect();
      const k = width / box.width;
      zone = ids.indexOf(model.roomAt(...inBox({ x: (e.clientX - box.left) * k, y: (e.clientY - box.top) * k })));
    }
    hold(zone === held ? -1 : zone);
  }

  function init(stageEl) {
    stage = stageEl;
    mapEl = L.$('#map', stage);
    const entry = L.$('#mapEntry', stage);
    const entryLabel = L.$('#mapEntryLabel', stage);

    build(L.$('#mapViews', stage));

    L.store.on('mode', (mode) => {
      const on = mode === 'map';
      mapEl.setAttribute('aria-hidden', String(!on));
      entry.setAttribute('aria-expanded', String(on));
      entry.setAttribute('aria-label', on ? 'Close' : 'Map');
      entryLabel.textContent = on ? 'CLOSE' : 'MAP';
      if (!on) {
        hold(-1);
        stage.classList.remove('is-over-zone');
      }
    });

    L.store.on('humidity', read, true);
    L.store.on('light', read, true);

    entry.addEventListener('click', () => {
      entry.classList.remove('is-popped');
      void entry.offsetWidth;
      entry.classList.add('is-popped');
      if (L.store.get('mode') === 'map') close();
      else open();
    });
    stage.addEventListener('click', touch);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Escape lets go of what is held before it closes the map.
      if (held >= 0 && L.store.get('mode') === 'map') hold(-1);
      else close();
    });

    L.loop.add(frame);
  }

  function resize(w, h, scale) {
    width = w;
    const dense = (window.devicePixelRatio || 1) * scale;       // screen pixels to one of the stage's
    // As many pixels as the screen has for it and no more: every one drawn past that is shaded, and then thrown
    // away when the canvas is scaled down to the screen. In twentieth steps, so dragging the window does not
    // have the model remade at every size on the way.
    const next = L.clamp(Math.round(dense * 20) / 20, 1, SHARP);
    // A contour is one of the stage's pixels wide, and no more than two of the screen's or so: on a large
    // screen the model is larger, and its lines should not thicken with it.
    const wide = Math.round(next * L.clamp(2 / dense, 0.75, 1) * 20) / 20;
    if (next === ratio && wide === line) return;
    ratio = next;
    line = wide;
    if (model) model.resize(BOX.w, BOX.h, ratio, line);
  }

  /** The model is behind the port's glass, and is cut where the glass is: `port` is what frame.js built. */
  function fit(port) {
    L.$('.map__port', mapEl).style.clipPath = `path('${port.glass}')`;
  }

  L.Map = { init, attach, fit, resize, open, close };
})(window.Lutie);
