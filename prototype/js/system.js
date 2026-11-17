/* The system sheet.

   Opening it does not put a panel over the port. The pane changes what it is
   for: the observation steps back (the room dims and softens, Lutie moves
   into the clear water on the right and goes on breathing), the things a hand
   reaches for leave, and a film of water spreads on the glass with the
   settings printed in it. system.css has the look; this file has the parts.

   Pages are data (PAGES). A row is one of
     level    a channel of water with a drop riding its front (liquid.js)
     choice   a cell with a lobe for each option and a bead of air in the
              chosen one (lobes.js)
     note     a line of print
   Rows with `apply` change something the eye can check, and do it at once,
   on the scene beside the sheet.

   The film has one face per page: the same body, with a tongue reaching out
   to that page's bubble. The body is sampled once and each tongue is merged
   into it (blob.js, `seed`), so a face costs little; they are made while the
   stage is idle, or on the spot if one is asked for first.                    */
(function (L) {
  'use strict';

  const BOX = { left: 40, top: 172 };                 // the sheet's box on the stage; see .sheet
  const THREAD = { from: 214, to: 722, inset: 44 };   // the stretch of the port's left edge the page bubbles hang along
  const TRAVEL = 12;                                  // how far short of each end of its channel a drop stops
  // Lutie while the sheet is open: half the width of her bell, how far back
  // she draws (as a scale), and the water left between her and the port's edge.
  const LUTIE = { half: 278, back: 0.93, clear: 20 };

  const svg = (cls, box, body) => `<svg class="${cls}" viewBox="${box}" aria-hidden="true">${body}</svg>`;

  /* ── Marks ────────────────────────────────────────────── */

  // One for each page, drawn for the 40-unit box of a bubble icon.
  const PAGE_MARK = [
    '<path d="M7 20.5 C9.4 20.5 9.8 14 12.2 14 S15 27.5 17.4 27.5 S20.2 9.5 22.6 9.5 S25.4 25 27.8 25 S30.4 20.5 33 20.5"/>',
    '<path d="M6.5 20 Q20 7.6 33.5 20 Q20 32.4 6.5 20 Z"/><circle cx="20" cy="20" r="4.7"/><path d="M17.6 18.2 a3 3 0 0 1 1.9 -1.3"/>',
    '<path d="M10.5 13.5 H29.5 M10.5 20 H24.5 M10.5 26.5 H19.5"/><path class="fill" d="M28.4 22.4 q.6 3.5 4.1 4.1 q-3.5 .6 -4.1 4.1 q-.6 -3.5 -4.1 -4.1 q3.5 -.6 4.1 -4.1 Z"/>',
    '<path d="M20 7 L29 18.6 L20 33 L11 18.6 Z M11 18.6 H29 M20 7 L16.6 18.6 L20 33 M20 7 L23.4 18.6 L20 33"/>',
  ];

  // One for each row, in a 24-unit box.
  const MARK = {
    speaker: 'M4 9.6h3.2L11.4 6v12l-4.2-3.6H4z M14.8 9.2q2.3 2.8 0 5.6 M17.4 6.8q4.3 5.2 0 10.4',
    waves: 'M3.6 9.4q2.8-2.6 5.6 0t5.6 0t5.6 0 M3.6 14.6q2.8-2.6 5.6 0t5.6 0t5.6 0',
    voice: 'M12 4a2.6 2.6 0 0 1 2.6 2.6v4.6a2.6 2.6 0 0 1-5.2 0V6.6A2.6 2.6 0 0 1 12 4z M7 11.2a5 5 0 0 0 10 0 M12 16.2V20',
    pulse: 'M3 12.4h4.2l1.9-4.8 3.1 9.4 2.5-6.6 1.2 2H21',
    pane: 'M5.4 6.6q6.6-2.2 13.2 0v10.8q-6.6 2.2-13.2 0z M9 9.4q-1.2 2.6 0 5.2',
    caustic: 'M4 8q4-3.2 8 0t8 0 M4 16q4-3.2 8 0t8 0 M8 12q2-1.6 4 0t4 0',
    motes: 'M7 9.4a1.4 1.4 0 1 0 .01 0z M15.6 6.4a.9.9 0 1 0 .01 0z M16.6 13.4a1.7 1.7 0 1 0 .01 0z M9.6 16.6a.9.9 0 1 0 .01 0z',
    depth: 'M12 4.4l7.6 3.8L12 12 4.4 8.2z M4.4 12.2 12 16l7.6-3.8 M4.4 16 12 19.8l7.6-3.8',
    screen: 'M4.6 6.2q7.4-1.2 14.8 0v9.6q-7.4 1.2-14.8 0z M9 20h6 M12 16.6V20',
    leaf: 'M6 18C6 10 11 5.6 19 5.6 19 13.6 14.5 18 6 18z M6 18l7.2-7.2',
    raster: 'M5 7.4h14 M5 12h14 M5 16.6h9',
    pace: 'M4 12h2.6 M9 12h3.2 M14.6 12H20 M17.2 9l3 3-3 3',
    clock: 'M12 4a8 8 0 1 0 .01 0z M12 8v4.4l3 1.8',
    globe: 'M12 3.6a8.4 8.4 0 1 0 .01 0z M3.6 12h16.8 M12 3.6q-4.6 8.4 0 16.8 M12 3.6q4.6 8.4 0 16.8',
    size: 'M4.6 18l4.6-11.4L13.8 18 M6.2 14h6 M15 18l2.5-6.2L20 18 M15.8 16h3.4',
    drop: 'M12 3.8C12 3.8 6.2 11 6.2 14.6a5.8 5.8 0 0 0 11.6 0C17.8 11 12 3.8 12 3.8z M9.4 14.8a2.8 2.8 0 0 0 2 2.6',
    crystal: 'M12 3.6l5.6 6.6L12 20.4 6.4 10.2z M6.4 10.2h11.2 M12 3.6l-2 6.6 2 10.2 2-10.2z',
  };

  /* ── Pages ────────────────────────────────────────────── */

  let stage = null;

  const percent = (v) => [Math.round(v * 100), '%'];

  const PAGES = [
    {
      zh: '音频', en: 'AUDIO',
      sections: [
        { zh: '音量', en: 'VOLUME', rows: [
          { kind: 'level', zh: '主音量', mark: 'speaker', value: 0.8 },
          { kind: 'level', zh: '环境水声', mark: 'waves', value: 0.6 },
          { kind: 'level', zh: '语音音量', mark: 'voice', value: 0.7 },
        ] },
        { zh: '聆听', en: 'LISTENING', rows: [
          { kind: 'choice', zh: '心跳回声', mark: 'pulse', options: ['开启', '关闭'], value: 0 },
          { kind: 'choice', zh: '隔窗听感', mark: 'pane', options: ['柔和', '拟真'], value: 0 },
        ] },
      ],
    },
    {
      zh: '显示', en: 'DISPLAY',
      sections: [
        // Each of these is as designed at its starting value, and can be watched changing in the room beside the sheet.
        { zh: '光与水', en: 'LIGHT & WATER', rows: [
          { kind: 'level', zh: '水面焦散', mark: 'caustic', value: 0.7, apply: (v) => stage.style.setProperty('--fx-caustics', (v / 0.7).toFixed(3)) },
          { kind: 'level', zh: '浮游微粒', mark: 'motes', value: 1, apply: (v) => stage.style.setProperty('--fx-motes', v.toFixed(3)) },
          { kind: 'level', zh: '镜头视差', mark: 'depth', value: 0.5, apply: (v) => L.store.set('parallax', v / 0.5) },
        ] },
        { zh: '画面', en: 'GRAPHICS', rows: [
          { kind: 'choice', zh: '画面模式', mark: 'screen', options: ['全屏', '窗口'], value: 1 },
          { kind: 'choice', zh: '感官滤镜', mark: 'leaf', options: ['柔和', '拟真'], value: 0 },
          { kind: 'choice', zh: '扫描光栅', mark: 'raster', options: ['开启', '关闭'], value: 0, apply: (i) => { stage.dataset.raster = i ? 'off' : 'on'; } },
        ] },
      ],
    },
    {
      zh: '文本', en: 'TEXT',
      sections: [
        { zh: '对话', en: 'DIALOGUE', rows: [
          { kind: 'level', zh: '文字速度', mark: 'pace', value: 0.5, apply: (v) => L.store.set('pace', Math.pow(2, 1 - v * 2)) },
          { kind: 'level', zh: '停留时长', mark: 'clock', value: 0.4, read: (v) => [(1 + v * 5).toFixed(1), 'S'] },
        ] },
        { zh: '语言', en: 'LANGUAGE', rows: [
          { kind: 'choice', zh: '语言', mark: 'globe', options: ['中文', 'EN'], value: 0 },
          { kind: 'choice', zh: '字号', mark: 'size', options: ['标准', '放大'], value: 0 },
        ] },
      ],
    },
    {
      zh: '存档', en: 'SAVE',
      sections: [
        { zh: '记忆晶核', en: 'MEMORY CORE', rows: [
          { kind: 'choice', zh: '自动记录', mark: 'drop', options: ['开启', '关闭'], value: 0 },
          { kind: 'level', zh: '记录间隔', mark: 'clock', value: 0.2, read: (v) => [Math.round(5 + v * 25), 'MIN'] },
        ] },
        { zh: '当前记录', en: 'LAST WRITTEN', rows: [
          { kind: 'note', zh: '第 04 年', mark: 'crystal', text: 'CYCLE 04 / 08 · DAY 112 · 02:14' },
        ] },
      ],
    },
  ];

  /* ── The film's faces ─────────────────────────────────── */

  let sheetEl = null;
  let base = null;                 // the film without a tongue
  const faces = [];                // per page, once made: { body, light }

  function face(i) {
    if (faces[i]) return faces[i];
    const shape = L.Shapes.sheet;
    if (!base) base = L.Blob.field(shape, L.Glass.padding(shape.optics), shape.cell);
    const grown = L.Blob.field({ w: shape.w, h: shape.h, parts: [L.Shapes.tongue(i)] }, base.pad, base.cell, base.raw);
    faces[i] = L.Glass.surface(L.Glass.build(`sheet${i}`, shape, grown));
    sheetEl.prepend(faces[i].light);
    sheetEl.prepend(faces[i].body);
    void faces[i].body.offsetWidth;      // so that it fades in rather than appearing
    return faces[i];
  }

  function showFace(i) {
    face(i);
    faces.forEach((f, n) => {
      f.body.classList.toggle('is-on', n === i);
      f.light.classList.toggle('is-on', n === i);
    });
  }

  /* ── Levels ───────────────────────────────────────────── */

  const levels = [];

  function setLevel(lv, v, first) {
    v = L.clamp(v, 0, 1);
    lv.value = v;
    const s = TRAVEL + v * (lv.ch.length - TRAVEL * 2);
    const p = lv.ch.at(s);
    const [cx, cy] = L.Shapes.thumb.centre;
    lv.ch.front = s;
    lv.thumb.style.translate = `${(p.x - cx).toFixed(1)}px ${(p.y - cy).toFixed(1)}px`;
    const [text, unit] = (lv.row.read || percent)(v);
    lv.out.firstChild.textContent = text;
    lv.out.lastChild.textContent = unit;
    lv.el.setAttribute('aria-valuenow', Math.round(v * 100));
    lv.el.setAttribute('aria-valuetext', `${text} ${unit}`);
    if (lv.row.apply && !first) lv.row.apply(v);
  }

  function buildLevel(row, pageIndex, n) {
    const el = document.createElement('div');
    el.className = 'level';
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', row.zh);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    el.innerHTML = '<canvas class="level__liquid" aria-hidden="true"></canvas><i class="level__thumb glass" data-glass="thumb"></i>';

    const out = document.createElement('output');
    out.className = 'row__value';
    out.innerHTML = '<b class="num"></b><i></i>';

    const shape = L.Shapes.tracks[n % L.Shapes.tracks.length];
    const lv = { row, page: pageIndex, el, out, thumb: el.lastChild, ch: L.Liquid.channel(el.firstChild, shape), value: row.value };
    levels.push(lv);
    setLevel(lv, row.value, true);

    const fromPointer = (e) => {
      const box = el.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * shape.w - lv.ch.line[0][0];
      setLevel(lv, (x - TRAVEL) / (lv.ch.length - TRAVEL * 2));
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-held');
      fromPointer(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture(e.pointerId)) fromPointer(e);
    });
    const release = () => el.classList.remove('is-held');
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('keydown', (e) => {
      const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, Home: -1, End: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      setLevel(lv, Math.round((lv.value + step) * 20) / 20);
    });

    return [el, out];
  }

  /* ── Choices ──────────────────────────────────────────── */

  function buildChoice(row) {
    const ctl = document.createElement('div');
    ctl.className = 'row__ctl';
    ctl.append(L.Lobes.build('lobes2', row.zh, row.options, row.value, row.apply).el);
    return [ctl];
  }

  /* ── Assembly ─────────────────────────────────────────── */

  let page = 0;
  const navEls = [];
  const labelEls = [];
  const pageEls = [];

  function buildRow(row, pageIndex, n) {
    const el = document.createElement('div');
    el.className = `row row--${row.kind}`;
    el.innerHTML = svg('row__mark', '0 0 24 24', `<path d="${MARK[row.mark]}"/>`) + `<span class="row__name">${row.zh}</span>`;
    if (row.kind === 'level') el.append(...buildLevel(row, pageIndex, n));
    else if (row.kind === 'choice') el.append(...buildChoice(row));
    else el.insertAdjacentHTML('beforeend', `<p class="row__note">${row.text}</p>`);
    return el;
  }

  function build() {
    sheetEl.innerHTML =
      '<div class="sheet__hit"></div>' +
      '<header class="heading sheet__head"><h2 class="heading__title"><b>SYSTEM</b><span>观察舱设置</span></h2>' +
      '<p class="heading__sub">WITH LIGHT AND WATER</p></header>';

    const nav = document.createElement('nav');
    nav.className = 'sheet__nav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Pages');
    const pages = document.createElement('div');
    pages.className = 'sheet__pages';

    PAGES.forEach((pg, i) => {
      const [x, y, r] = L.Shapes.NAV[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'w bubble nav glass';
      btn.dataset.glass = `nav${i}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', `${pg.zh} ${pg.en}`);
      btn.style.cssText = `left:${x - r - 2}px;top:${y - r - 2}px;--cx:${r + 2}px;--cy:${r + 2}px;--bob:${(-i * 2.3).toFixed(1)}s;--i:${i}`;
      btn.innerHTML = svg('bubble__icon', '0 0 40 40', PAGE_MARK[i]);

      const label = document.createElement('span');
      label.className = 'nav__label';
      label.style.cssText = `left:${x + r + 15}px;top:${y}px`;
      label.innerHTML = `<b>${pg.zh}</b><i>${pg.en}</i>`;

      btn.addEventListener('click', () => select(i));
      label.addEventListener('click', () => select(i));
      nav.append(btn, label);
      navEls.push(btn);
      labelEls.push(label);

      const el = document.createElement('div');
      el.className = 'page';
      el.setAttribute('role', 'tabpanel');
      el.setAttribute('aria-label', pg.zh);
      let n = 0;
      pg.sections.forEach((sec) => {
        el.insertAdjacentHTML('beforeend', `<h3 class="sect"><b>${sec.zh}</b><i>${sec.en}</i></h3>`);
        sec.rows.forEach((row) => el.append(buildRow(row, i, n++)));
      });
      pages.append(el);
      pageEls.push(el);
    });

    sheetEl.append(nav, pages);
    L.Glass.mountAll(sheetEl);
  }

  /* ── State ────────────────────────────────────────────── */

  let resting = 0;

  /** Only the channels that can be seen are drawn. */
  function syncLive() {
    clearTimeout(resting);
    if (L.store.get('mode') === 'system') {
      levels.forEach((lv) => {
        lv.ch.live = lv.page === page;
      });
    } else {
      resting = setTimeout(() => levels.forEach((lv) => {
        lv.ch.live = false;
      }), 900);
    }
  }

  function select(i) {
    page = i;
    navEls.forEach((el, n) => {
      el.classList.toggle('is-active', n === i);
      el.setAttribute('aria-selected', String(n === i));
    });
    labelEls.forEach((el, n) => el.classList.toggle('is-active', n === i));
    pageEls.forEach((el, n) => el.classList.toggle('is-on', n === i));
    if (L.store.get('mode') === 'system') showFace(i);
    syncLive();
  }

  function open() {
    if (L.store.get('mode') === 'system') return;
    L.store.set('view', 'human');          // the sheet is print; only a human eye reads it
    showFace(page);
    L.store.set('mode', 'system');
  }

  function close() {
    if (L.store.get('mode') === 'system') L.store.set('mode', 'observe');
  }

  function toggle() {
    if (L.store.get('mode') === 'system') close();
    else open();
  }

  /* ── Boot ─────────────────────────────────────────────── */

  function init(stageEl) {
    stage = stageEl;
    sheetEl = L.$('#sheet', stage);
    const entry = L.$('#sysEntry', stage);
    const entryLabel = L.$('#sysEntryLabel', stage);

    build();
    select(0);

    L.store.on('mode', (mode) => {
      const on = mode === 'system';
      sheetEl.setAttribute('aria-hidden', String(!on));
      entry.setAttribute('aria-expanded', String(on));
      entry.setAttribute('aria-label', on ? 'Close' : 'System');
      entryLabel.textContent = on ? 'CLOSE' : 'SYSTEM';
      syncLive();
    });

    entry.addEventListener('click', () => {
      entry.classList.remove('is-popped');
      void entry.offsetWidth;
      entry.classList.add('is-popped');
      toggle();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    // Make the faces while nothing else is happening, the first page's first.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 160));
    let next = 0;
    const warm = () => {
      if (next >= PAGES.length) return;
      face(next++);
      idle(warm, { timeout: 1500 });
    };
    setTimeout(() => idle(warm, { timeout: 1500 }), 700);
  }

  /** Redraw what follows the port. Called whenever the port is rebuilt. */
  function attach(port) {
    const G = L.geometry;
    const run = port.flank(THREAD.from, THREAD.to, THREAD.inset);
    const etch = L.$('#sysEtch', stage);
    etch.setAttribute('viewBox', `0 0 ${port.width} ${port.height}`);
    etch.innerHTML = `
      <defs>
        <linearGradient id="sys-thread" gradientUnits="userSpaceOnUse" x1="0" y1="${THREAD.from}" x2="0" y2="${THREAD.to}">
          <stop offset="0" stop-color="#c4eefc" stop-opacity="0"/>
          <stop offset=".16" stop-color="#c4eefc" stop-opacity=".42"/>
          <stop offset=".84" stop-color="#c4eefc" stop-opacity=".42"/>
          <stop offset="1" stop-color="#c4eefc" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path class="sys-thread" d="${G.toPath(run, false)}" stroke="url(#sys-thread)"/>`;

    // Where she waits while the sheet is open: midway between the film and the
    // far edge of the port, or as near to that as the port has room for.
    const film = BOX.left + 966;
    const edge = port.width - 22;
    const shift = Math.min((film + edge) / 2 - port.width / 2, port.width / 2 - 22 - LUTIE.clear - LUTIE.half * LUTIE.back);
    stage.style.setProperty('--sys-shift', `${Math.round(shift)}px`);
    stage.style.setProperty('--sys-back', LUTIE.back);
  }

  L.System = { init, attach, open, close, toggle };
})(window.Lutie);
