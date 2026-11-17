/* The crystal in the view switch.

   It is built the way a cut stone is seen, front to back, rather than as
   coloured tiles:
     · a body with almost no colour of its own, so the lens shows through it
     · the far facets, seen through the near ones — a second net that turns
       slowly against the first, which is what makes the inside seem to move
     · the near facets, each a gradient from the edge that catches the key
       light to nothing, weighted by how squarely that facet faces the light
     · a core of light, a prism fringe just inside the outline, and the few
       rays it throws across the lens on the side away from the light

   Everything is derived from two rings of points and the same key light the
   liquid glass uses.                                                          */
(function (L) {
  'use strict';

  const C = [150, 116];                                   // centre, in the lens's box
  // The outline, clockwise from the upper point, and the table one level in.
  const RIM = [[0, -80], [37, -45], [51, -4], [33, 40], [0, 74], [-31, 41], [-51, -8], [-35, -47]];
  const TABLE = [[1, -37], [20, -21], [26, -1], [16, 21], [0, 35], [-15, 21], [-25, -4], [-18, -23]];
  const CORE = [2, -3];
  const CULET = [-3, 6];                                  // where the far facets meet
  const LIFT = { rim: 0, table: 30, core: 40 };           // height toward the eye
  const TINTS = ['#ffffff', '#ffe9c4', '#d6f6ff', '#e2d9ff', '#c8fff1', '#ffffff', '#ffdcea', '#d6f6ff'];

  const unit = (v) => {
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
  };
  const KEY = unit([-0.5, -0.72, 0.48]);
  const HALF = unit([KEY[0], KEY[1], KEY[2] + 1]);
  const TOWARD = unit([KEY[0], KEY[1]]);
  const fix = (n) => Math.round(n * 10) / 10;
  const place = (p, z = 0) => [C[0] + p[0], C[1] + p[1], z];
  const xy = (p) => `${fix(p[0])},${fix(p[1])}`;
  const outline = (ring) => 'M' + ring.map((p) => xy(place(p)).replace(',', ' ')).join('L') + 'Z';

  function facets() {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const r0 = place(RIM[i], LIFT.rim);
      const r1 = place(RIM[j], LIFT.rim);
      const t0 = place(TABLE[i], LIFT.table);
      const t1 = place(TABLE[j], LIFT.table);
      out.push({ pts: [r0, r1, t0], tint: '#f2fcff' });
      out.push({ pts: [r1, t1, t0], tint: '#cfeeff' });
      out.push({ pts: [t0, t1, place(CORE, LIFT.core)], tint: TINTS[i] });
    }
    return out.map((f, index) => {
      const [a, b, c] = f.pts;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
      if (n[2] < 0) n = n.map((k) => -k);
      const lambert = Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]);
      const mirror = Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 24);
      const bright = Math.min(0.96, 0.1 + 0.5 * lambert + 0.9 * mirror);

      // The gradient runs across the facet, from its corner nearest the light.
      const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      const along = f.pts.map((p) => (p[0] - centre[0]) * TOWARD[0] + (p[1] - centre[1]) * TOWARD[1]);
      const near = Math.max(...along);
      const far = Math.min(...along);
      return {
        index,
        points: f.pts.map(xy).join(' '),
        tint: f.tint,
        bright,
        from: [centre[0] + TOWARD[0] * near, centre[1] + TOWARD[1] * near],
        to: [centre[0] + TOWARD[0] * far, centre[1] + TOWARD[1] * far],
      };
    });
  }

  /** The far side: the same outline turned over, converging on the culet. */
  function pavilion() {
    const back = RIM.map(([x, y]) => [-x * 0.9, y * 0.9]);
    const mid = back.map(([x, y]) => [x + (CULET[0] - x) * 0.48, y + (CULET[1] - y) * 0.48]);
    let lines = '';
    let fills = '';
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      lines += `M${xy(place(back[i])).replace(',', ' ')}L${xy(place(CULET)).replace(',', ' ')}`;
      fills += `<polygon points="${xy(place(CULET))} ${xy(place(mid[i]))} ${xy(place(mid[j]))}" fill-opacity="${i % 2 ? 0.05 : 0.16}"/>`;
    }
    return `${fills}<path d="${lines}${outline(mid)}"/>`;
  }

  /** Light leaving the stone on the far side from the key, fanned across the lens. */
  function rays() {
    const fan = [
      { from: RIM[2], to: RIM[3], turn: -0.34, reach: 62 },
      { from: RIM[3], to: RIM[4], turn: 0.02, reach: 84 },
      { from: [RIM[4][0] - 10, RIM[4][1] - 6], to: RIM[4], turn: 0.4, reach: 58 },
    ];
    return fan
      .map(({ from, to, turn, reach }) => {
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const dx = (-TOWARD[0] * cos + TOWARD[1] * sin) * reach;
        const dy = (-TOWARD[0] * sin - TOWARD[1] * cos) * reach;
        const a = place([from[0] * 0.92, from[1] * 0.92]);
        const b = place([to[0] * 0.92, to[1] * 0.92]);
        return `<polygon points="${xy(a)} ${xy(b)} ${xy([b[0] + dx * 1.06, b[1] + dy * 1.06])} ${xy([a[0] + dx, a[1] + dy])}"/>`;
      })
      .join('');
  }

  function star(p, s, i) {
    const [x, y] = place(p);
    const a = fix(s * 0.13);
    const b = fix(s * 0.87);
    return `<path class="gem__star" style="--i:${i}" d="M${fix(x)} ${fix(y - s)}q${a} ${b} ${s} ${s}q${-b} ${a} ${-s} ${s}q${-a} ${-b} ${-s} ${-s}q${b} ${-a} ${s} ${-s}Z"/>`;
  }

  function build(svg) {
    const list = facets();
    const rim = outline(RIM);
    const [cx, cy] = place(CORE);

    let net = '';
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const r1 = xy(place(RIM[j])).replace(',', ' ');
      const t0 = xy(place(TABLE[i])).replace(',', ' ');
      net += `M${xy(place(RIM[i])).replace(',', ' ')}L${t0}L${r1}M${t0}L${fix(cx)} ${fix(cy)}`;
    }
    net += outline(TABLE);

    const flare = [[0, 46], [60, 32], [120, 32]]
      .map(([turn, reach]) => `<polygon transform="rotate(${turn} ${fix(cx)} ${fix(cy)})" points="${fix(cx - reach)},${fix(cy)} ${fix(cx)},${fix(cy - 1.3)} ${fix(cx + reach)},${fix(cy)} ${fix(cx)},${fix(cy + 1.3)}"/>`)
      .join('');

    svg.innerHTML = `
      <defs>
        <clipPath id="gem-clip"><path d="${rim}"/></clipPath>
        <radialGradient id="gem-halo">
          <stop offset="0" stop-color="#d9f8ff" stop-opacity=".5"/>
          <stop offset=".55" stop-color="#8fe0ff" stop-opacity=".14"/>
          <stop offset="1" stop-color="#8fe0ff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="gem-core">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>
          <stop offset=".3" stop-color="#d8f8ff" stop-opacity=".5"/>
          <stop offset="1" stop-color="#9fe2ff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="gem-flare">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="gem-edge" gradientUnits="userSpaceOnUse" x1="${C[0] - 46}" y1="${C[1] - 70}" x2="${C[0] + 40}" y2="${C[1] + 66}">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".96"/>
          <stop offset=".5" stop-color="#d4f4ff" stop-opacity=".5"/>
          <stop offset="1" stop-color="#bfeaff" stop-opacity=".14"/>
        </linearGradient>
        <linearGradient id="gem-prism" gradientUnits="userSpaceOnUse" x1="${C[0] - 50}" y1="${C[1] + 50}" x2="${C[0] + 50}" y2="${C[1] - 50}">
          <stop offset="0" stop-color="#ffa9cd"/><stop offset=".25" stop-color="#ffd58a"/>
          <stop offset=".5" stop-color="#b6ffe6"/><stop offset=".75" stop-color="#9fd0ff"/>
          <stop offset="1" stop-color="#d5b8ff"/>
        </linearGradient>
        <linearGradient id="gem-ray" gradientUnits="userSpaceOnUse" x1="${C[0] + 14}" y1="${C[1] + 30}" x2="${C[0] + 62}" y2="${C[1] + 100}">
          <stop offset="0" stop-color="#eafcff" stop-opacity=".4"/>
          <stop offset="1" stop-color="#bfeeff" stop-opacity="0"/>
        </linearGradient>
        ${list
          .map(
            (f) => `<linearGradient id="gem-f${f.index}" gradientUnits="userSpaceOnUse" x1="${fix(f.from[0])}" y1="${fix(f.from[1])}" x2="${fix(f.to[0])}" y2="${fix(f.to[1])}">
          <stop offset="0" stop-color="${f.tint}" stop-opacity="${f.bright.toFixed(2)}"/>
          <stop offset="1" stop-color="${f.tint}" stop-opacity="${(f.bright * 0.24).toFixed(2)}"/>
        </linearGradient>`
          )
          .join('')}
      </defs>
      <circle class="gem__halo" cx="${C[0]}" cy="${C[1] + 4}" r="92" fill="url(#gem-halo)"/>
      <g class="gem__rays" fill="url(#gem-ray)">${rays()}</g>
      <g class="gem">
        <path class="gem__body" d="${rim}"/>
        <g clip-path="url(#gem-clip)"><g class="gem__back">${pavilion()}</g></g>
        <g class="gem__crown">${list.map((f) => `<polygon class="gem__facet" style="--i:${f.index}" points="${f.points}" fill="url(#gem-f${f.index})"/>`).join('')}</g>
        <circle class="gem__core" cx="${fix(cx)}" cy="${fix(cy)}" r="44" fill="url(#gem-core)"/>
        <g class="gem__flare" fill="url(#gem-flare)">${flare}</g>
        <g clip-path="url(#gem-clip)"><path class="gem__prism" d="${rim}" stroke="url(#gem-prism)"/></g>
        <path class="gem__net" d="${net}"/>
        <path class="gem__edge" d="${rim}" stroke="url(#gem-edge)"/>
      </g>
      ${star([RIM[7][0] * 0.8, RIM[7][1] * 0.8], 7, 0)}${star(TABLE[2], 5, 1)}`;
  }

  L.Gem = { build, centre: C };
})(window.Lutie);
