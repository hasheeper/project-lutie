/* Liquid outlines.

   A HUD surface is not drawn; it is a few round parts — beads and tapered
   tubes — merged by a smooth minimum, so that parts pull into each other
   through a neck the way drops do. The merged distance field is sampled once
   on a coarse grid and everything else is read from it:
     · the outline, traced as a polygon, clips the glass
     · the distance to the edge and the edge normal drive refraction and light

   Field convention: negative inside, positive outside, in pixels.            */
(function (L) {
  'use strict';

  const FAR = 1e4;
  const SOFTEN = 3;

  /* ── Parts ────────────────────────────────────────────── */

  /**
   * A round drop. `wobble` lists low harmonics as [order, amplitude, phase],
   * amplitude as a fraction of the radius: enough to keep it from being a
   * compass circle. `k` is how far it reaches to merge with what is already
   * there; 0 keeps it separate, like a droplet that has just let go.
   */
  function bead(x, y, r, { k, wobble } = {}) {
    const swell = wobble ? wobble.reduce((sum, w) => sum + Math.abs(w[1]), 0) : 0;
    const reach = r * (1 + swell);
    return {
      k,
      box: [x - reach, y - reach, x + reach, y + reach],
      dist(px, py) {
        const dx = px - x;
        const dy = py - y;
        let radius = r;
        if (wobble) {
          const a = Math.atan2(dy, dx);
          for (const [order, amp, phase] of wobble) radius += r * amp * Math.cos(order * a + phase);
        }
        return Math.hypot(dx, dy) - radius;
      },
    };
  }

  /** Distance to a capsule whose ends have different radii (after Inigo Quilez). */
  function capsule(ax, ay, ra, bx, by, rb) {
    const h = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / h;
    const uy = (by - ay) / h;
    const sb = (ra - rb) / h;
    const ca = Math.sqrt(1 - sb * sb);
    return function (px, py) {
      const rx = px - ax;
      const ry = py - ay;
      const along = rx * ux + ry * uy;
      const across = Math.abs(rx * uy - ry * ux);
      const side = along * ca - across * sb;
      if (side < 0) return Math.hypot(across, along) - ra;
      if (side > ca * h) return Math.hypot(across, along - h) - rb;
      return across * ca + along * sb - ra;
    };
  }

  /**
   * A tapered tube through `nodes` ([x, y, radius] each), smoothed with a
   * Catmull–Rom spline so three or four nodes are enough for a clean sweep.
   * The resampled centre line is kept as `spine` for anything that needs to
   * run along the tube. `step` is the resampling pitch in px; a long, fat tube
   * with a gentle sweep can take a coarse one.
   */
  function tube(nodes, { k, step = 14 } = {}) {
    const spine = [];
    const last = nodes.length - 1;
    const node = (i) => {
      if (i < 0) return nodes[0].map((v, c) => 2 * v - nodes[1][c]);
      if (i > last) return nodes[last].map((v, c) => 2 * v - nodes[last - 1][c]);
      return nodes[i];
    };
    for (let i = 0; i < last; i++) {
      const p0 = node(i - 1);
      const p1 = node(i);
      const p2 = node(i + 1);
      const p3 = node(i + 2);
      const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        spine.push(
          [0, 1, 2].map(
            (c) =>
              0.5 *
              (2 * p1[c] +
                (p2[c] - p0[c]) * t +
                (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t +
                (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t)
          )
        );
      }
    }
    spine.push(nodes[last].slice());

    const pieces = [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < spine.length; i++) {
      const [x, y, r] = spine[i];
      box[0] = Math.min(box[0], x - r);
      box[1] = Math.min(box[1], y - r);
      box[2] = Math.max(box[2], x + r);
      box[3] = Math.max(box[3], y + r);
      if (i === 0) continue;
      const [ax, ay, ra] = spine[i - 1];
      const h = Math.hypot(x - ax, y - ay);
      // A capsule needs its ends further apart than their radii differ; a step
      // that is not degenerates to the larger end, which loses nothing.
      if (h > Math.abs(ra - r) + 1e-3) pieces.push(capsule(ax, ay, ra, x, y, r));
      else pieces.push(ra >= r ? (px, py) => Math.hypot(px - ax, py - ay) - ra : (px, py) => Math.hypot(px - x, py - y) - r);
    }

    return {
      k,
      box,
      spine,
      dist(px, py) {
        let d = FAR;
        for (let i = 0; i < pieces.length; i++) {
          const v = pieces[i](px, py);
          if (v < d) d = v;
        }
        return d;
      },
    };
  }

  /* ── Field ────────────────────────────────────────────── */

  /** Polynomial smooth minimum: where a and b are within k of each other they blend. */
  function smin(a, b, k) {
    if (!k) return Math.min(a, b);
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }

  /**
   * Sample a shape on a grid that extends `pad` beyond its box on every side.
   * Node (i, j) sits at (i·cell − pad, j·cell − pad) in the shape's own
   * coordinates. The gradient is stored unit-length: the outward edge normal.
   *
   * `seed` is the `raw` distance of a field already sampled on the same grid;
   * the shape's parts are then merged into that body instead of into nothing.
   * That is how a large surface grows a variant — a tongue reaching out of
   * it — without being sampled again.
   */
  function field(shape, pad, cell = 2, seed = null) {
    const cols = Math.ceil((shape.w + pad * 2) / cell) + 1;
    const rows = Math.ceil((shape.h + pad * 2) / cell) + 1;
    const d = new Float32Array(cols * rows);
    const gx = new Float32Array(cols * rows);
    const gy = new Float32Array(cols * rows);
    const blend = shape.k === undefined ? 24 : shape.k;
    // Far from a part, the distance to its bounding box is close enough and much cheaper.
    const parts = shape.parts.map((part) => {
      const k = part.k === undefined ? blend : part.k;
      return { part, k, margin: pad + k + cell * 2 };
    });

    for (let j = 0; j < rows; j++) {
      const y = j * cell - pad;
      for (let i = 0; i < cols; i++) {
        const x = i * cell - pad;
        let v = seed ? seed[j * cols + i] : FAR;
        for (let p = 0; p < parts.length; p++) {
          const q = parts[p];
          const box = q.part.box;
          const away = Math.hypot(Math.max(box[0] - x, 0, x - box[2]), Math.max(box[1] - y, 0, y - box[3]));
          v = away > q.margin ? Math.min(v, away) : smin(v, q.part.dist(x, y), q.k);
        }
        d[j * cols + i] = v;
      }
    }

    const raw = d.slice();

    // Where two rims meet, the raw field has a crease along the line between
    // them, and a crease would catch the light. A liquid surface has none, so
    // the field is relaxed a little (binomial passes, about 3.5px in all).
    const pass = new Float32Array(cols * rows);
    for (let n = 0; n < SOFTEN * 2; n++) {
      const stride = n % 2 ? cols : 1;
      const count = n % 2 ? rows : cols;
      for (let o = 0; o < d.length; o++) {
        const at = n % 2 ? (o / cols) | 0 : o % cols;
        const m2 = at >= 2 ? o - 2 * stride : at >= 1 ? o - stride : o;
        const m1 = at >= 1 ? o - stride : o;
        const p1 = at < count - 1 ? o + stride : o;
        const p2 = at < count - 2 ? o + 2 * stride : p1;
        pass[o] = (d[m2] + d[p2] + 4 * (d[m1] + d[p1]) + 6 * d[o]) / 16;
      }
      d.set(pass);
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const o = j * cols + i;
        const dx = d[j * cols + Math.min(cols - 1, i + 1)] - d[j * cols + Math.max(0, i - 1)];
        const dy = d[Math.min(rows - 1, j + 1) * cols + i] - d[Math.max(0, j - 1) * cols + i];
        const len = Math.hypot(dx, dy) || 1;
        gx[o] = dx / len;
        gy[o] = dy / len;
      }
    }

    // How the outline turns: positive where it bulges, negative in a neck.
    const bow = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        bow[j * cols + i] =
          (gx[j * cols + Math.min(cols - 1, i + 1)] - gx[j * cols + Math.max(0, i - 1)] +
            gy[Math.min(rows - 1, j + 1) * cols + i] - gy[Math.max(0, j - 1) * cols + i]) /
          (2 * cell);
      }
    }

    return { w: shape.w, h: shape.h, pad, cell, cols, rows, d, gx, gy, bow, raw };
  }

  /* ── Outline ──────────────────────────────────────────── */

  // Marching squares. Corner bits: 1 top-left, 2 top-right, 4 bottom-right,
  // 8 bottom-left (set = inside). Cell edges: 0 top, 1 right, 2 bottom, 3 left.
  const SEGMENTS = {
    1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]],
    8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[3, 1]], 13: [[0, 1]], 14: [[3, 0]],
  };
  const SADDLE = {
    5: { joined: [[0, 1], [2, 3]], apart: [[3, 0], [1, 2]] },
    10: { joined: [[3, 0], [1, 2]], apart: [[0, 1], [2, 3]] },
  };

  /**
   * The zero contour as closed loops of [x, y] in grid-node units.
   * Every crossing lies on a grid edge shared by exactly two cells, so loops
   * are recovered by walking from edge to edge.
   */
  function loops(f) {
    const { cols, rows, d } = f;
    const links = new Map();
    const link = (a, b) => {
      if (!links.has(a)) links.set(a, []);
      links.get(a).push(b);
    };
    // Horizontal edge (i, j)–(i+1, j) is even, vertical (i, j)–(i, j+1) odd.
    const edgeId = (i, j, edge) =>
      edge === 0 ? 2 * (j * cols + i)
      : edge === 1 ? 2 * (j * cols + i + 1) + 1
      : edge === 2 ? 2 * ((j + 1) * cols + i)
      : 2 * (j * cols + i) + 1;

    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const tl = d[j * cols + i];
        const tr = d[j * cols + i + 1];
        const br = d[(j + 1) * cols + i + 1];
        const bl = d[(j + 1) * cols + i];
        const code = (tl < 0 ? 1 : 0) | (tr < 0 ? 2 : 0) | (br < 0 ? 4 : 0) | (bl < 0 ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const saddle = SADDLE[code];
        const segs = saddle ? (tl + tr + br + bl < 0 ? saddle.joined : saddle.apart) : SEGMENTS[code];
        for (const [e1, e2] of segs) {
          const a = edgeId(i, j, e1);
          const b = edgeId(i, j, e2);
          link(a, b);
          link(b, a);
        }
      }
    }

    const point = (id) => {
      const node = id >> 1;
      const i = node % cols;
      const j = (node - i) / cols;
      const a = d[node];
      if (id & 1) return [i, j + a / (a - d[node + cols])];
      return [i + a / (a - d[node + 1]), j];
    };

    const seen = new Set();
    const out = [];
    for (const start of links.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let prev = -1;
      let at = start;
      while (at !== undefined && !seen.has(at)) {
        seen.add(at);
        loop.push(point(at));
        const next = links.get(at);
        const step = next[0] !== prev ? next[0] : next[1];
        prev = at;
        at = step;
      }
      if (loop.length > 2) out.push(loop);
    }
    return out;
  }

  /**
   * The outline as an SVG path. `inBox` gives coordinates in the padded box
   * (what the clipped body uses); otherwise they are in the shape's own box.
   */
  function outline(f, inBox) {
    const shift = inBox ? 0 : -f.pad;
    const fix = (v) => Math.round((v * f.cell + shift) * 10) / 10;
    return loops(f)
      .map((loop) => 'M' + loop.map(([x, y]) => `${fix(x)} ${fix(y)}`).join('L') + 'Z')
      .join('');
  }

  L.Blob = { bead, tube, field, outline, loops };
})(window.Lutie);
