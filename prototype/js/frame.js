/* The observation port, as it looks from inside the pod.

   The eye is close to a very large window, so almost all of the view is
   water. The pod itself only shows where the port curves away: a sliver down
   each side, a sill along the bottom, and a dark mass in each corner. It is
   near, unlit and out of focus — a shape that frames the view, not a thing to
   look at — so it is rendered small, as a lit surface, and scaled up soft.

   Reading outward from the glass, the hull's cross-section is
     gasket → rolled bead → groove → flange leaning toward the glass → plate
   and it is lit by what is actually there: the tank, glancing across the bead
   from the window side; a few warm lamps set into the sill and the upper
   corners; and almost nothing from the cabin behind the viewer.               */
(function (L) {
  'use strict';

  const G = L.geometry;

  const SPEC = {
    centre: 472,                        // height of the port's widest point
    side: 22,                           // hull showing beside the glass there
    top: { rise: 40, n: 4.2 },          // the upper edge crests this far above the stage
    bottom: { sill: 74, n: 2.9 },       // height of the sill at mid-width
    section: { gasket: 5, bead: 38, groove: 7, flange: 58 },
    glass: { overlap: 3, bevel: 14 },   // the pane runs under the gasket; its polished edge is this wide
    lamps: {
      sill: { count: 4, pitch: 300, at: 46, power: 0.5 },
      corner: { x: 62, y: 34, power: 0.9 },
    },
    scale: 2,                           // stage pixels per rendered pixel
  };

  const BASE = [6 / 255, 9 / 255, 13 / 255];             // unlit hull; also the page behind the stage
  const METAL = {
    gasket: [0.03, 0.04, 0.05],
    bead: [0.3, 0.36, 0.44],
    flange: [0.17, 0.21, 0.26],
    plate: [0.1, 0.125, 0.16],
  };
  const SURFACE = [0.62, 0.9, 1];                        // tank light near the surface
  const POOL = [0.4, 0.92, 0.86];                        // and down by the pool floor
  const WARM = [1, 0.7, 0.4];
  // Direction to the window from the hull beside it: inward, and a little behind the wall.
  const WINDOW = { xy: 0.976, z: -0.216 };
  const WINDOW_HALF = Math.hypot(WINDOW.xy, WINDOW.z + 1);

  const smooth = (lo, hi, v) => {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };

  function portOf(W, H) {
    return {
      cx: W / 2,
      cy: SPEC.centre,
      a: W / 2 - SPEC.side,
      top: { b: SPEC.centre + SPEC.top.rise, n: SPEC.top.n },
      bottom: { b: H - SPEC.bottom.sill - SPEC.centre, n: SPEC.bottom.n },
    };
  }

  /** Lamps sit in the hull: a row along the sill, one in each upper corner. */
  function placeLamps(outline, W) {
    const { sill, corner } = SPEC.lamps;
    const walk = G.walker(outline);
    const lowest = walk.mark(outline.length / 4);
    const lamps = [];
    for (let i = 0; i < sill.count; i++) {
      const p = walk.at(lowest + (i - (sill.count - 1) / 2) * sill.pitch);
      lamps.push({ x: p.x + p.nx * sill.at, y: p.y + p.ny * sill.at, power: sill.power, kind: 'pod' });
    }
    lamps.push({ x: corner.x, y: corner.y, power: corner.power, kind: 'key' });
    lamps.push({ x: W - corner.x, y: corner.y, power: corner.power, kind: 'key' });
    return lamps;
  }

  /**
   * The hull as pixels. The port's implicit form gives, at any point, a good
   * estimate of the distance to its edge and the direction straight away from
   * it; the cross-section turns that distance into a surface normal.
   */
  function shade(W, H, lamps) {
    const q = SPEC.scale;
    const width = Math.ceil(W / q);
    const height = Math.ceil(H / q);
    const data = new Uint8ClampedArray(width * height * 4);
    const port = portOf(W, H);
    const S = SPEC.section;
    const e0 = S.gasket;
    const e1 = e0 + S.bead;
    const e2 = e1 + S.groove;
    const e3 = e2 + S.flange;

    for (let j = 0; j < height; j++) {
      const y = (j + 0.5) * q;
      const half = y < port.cy ? port.top : port.bottom;
      const n = half.n;
      const v = (y - port.cy) / half.b;
      const av = Math.abs(v);
      const avn1 = Math.pow(av, n - 1);
      const avn = avn1 * av;
      const depth = smooth(0.3, 0.9, y / H);
      const tank = [0, 1, 2].map((c) => SURFACE[c] + (POOL[c] - SURFACE[c]) * depth);

      for (let i = 0; i < width; i++) {
        const x = (i + 0.5) * q;
        const u = (x - port.cx) / port.a;
        const au = Math.abs(u);
        const aun1 = Math.pow(au, n - 1);
        const aun = aun1 * au;
        const F = aun + avn;
        if (F < 0.93) continue;                           // well inside the glass

        // G = F^(1/n) is 1 on the edge and grows linearly away from the centre.
        const k = Math.pow(F, 1 / n - 1);
        const gx = (k * aun1 * Math.sign(u)) / port.a;
        const gy = (k * avn1 * Math.sign(v)) / half.b;
        const gl = Math.hypot(gx, gy);
        const dist = (Math.pow(F, 1 / n) - 1) / gl;
        if (dist < -1.5) continue;
        const nx = gx / gl;
        const ny = gy / gl;

        // Cross-section: surface normal (z toward the eye) and what the metal returns.
        let hx = 0;
        let hy = 0;
        let hz = 1;
        let metal = METAL.plate;
        let open = 1;                                     // how much of the light can reach in
        let polish = 0.25;
        if (dist < e0) {
          metal = METAL.gasket;
          polish = 0;
        } else if (dist < e1) {
          const phi = ((dist - e0) / S.bead) * Math.PI;
          const c = Math.cos(phi) * 0.9;
          const s = Math.sin(phi) + 0.25;
          const l = Math.hypot(c, s);
          hx = (-nx * c) / l;
          hy = (-ny * c) / l;
          hz = s / l;
          metal = METAL.bead;
          polish = 1;
        } else if (dist < e2) {
          metal = METAL.flange;
          open = 0.3;
        } else if (dist < e3) {
          hx = -nx * 0.305;
          hy = -ny * 0.305;
          hz = 0.952;
          metal = METAL.flange;
        }

        // The tank: a broad light from the window side, strongest close to it.
        const near = open / (1 + (dist * dist) / 4900);
        const ndw = -(hx * nx + hy * ny) * WINDOW.xy + hz * WINDOW.z;
        // It is brightest under the surface and over the pool, dimmest down the sides.
        const lift = (0.5 + 0.5 * Math.pow(Math.abs(ny), 1.5)) * near;
        const water = 0.7 * lift * Math.max(0, (ndw + 0.25) / 1.25);
        const ndq = (-(hx * nx + hy * ny) * WINDOW.xy + hz * (WINDOW.z + 1)) / WINDOW_HALF;
        const glint = ndq > 0 ? 0.26 * polish * lift * Math.pow(ndq, 28) : 0;

        // The lamps: a soft pool around each, and the streak a point of light
        // draws across turned metal, at right angles to the edge.
        let warm = 0;
        let streak = 0;
        for (let l = 0; l < lamps.length; l++) {
          const lamp = lamps[l];
          const dx = lamp.x - x;
          const dy = lamp.y - y;
          const r2 = dx * dx + dy * dy;
          if (r2 > 90000) continue;
          const toward = (hx * dx + hy * dy + hz * 24) / Math.sqrt(r2 + 576);
          warm += (lamp.power / (1 + r2 / 2700)) * (0.35 + 0.65 * Math.max(0, toward));
          if (dist >= e1) {
            const along = dy * nx - dx * ny;
            const across = dx * nx + dy * ny;
            streak += lamp.power * Math.exp(-(along * along) / 60 - (across * across) / 5000);
          }
        }
        warm *= open;
        streak *= 0.3 * open;

        // Plates meet on the diagonals; the joints run toward the middle of the
        // port, which is what makes the corners read as receding.
        let joint = 0;
        if (dist >= e1) {
          const off = Math.abs(aun - avn) / (n * Math.hypot(aun1 / port.a, avn1 / half.b));
          joint = 1 - smooth(0.7, 2.4, off);
        }

        const fill = 0.07 * hz;
        const fade = (1 - 0.72 * smooth(e2, e3 + 150, dist)) * (1 - 0.75 * joint);
        const p = (j * width + i) * 4;
        for (let c = 0; c < 3; c++) {
          const lit =
            metal[c] * (water * tank[c] + fill * (0.7 + 0.1 * c) + warm * WARM[c]) +
            glint * tank[c] +
            streak * WARM[c];
          data[p + c] = 255 * (BASE[c] * (1 - 0.5 * joint) + lit * fade);
        }
        data[p + 3] = 255 * smooth(-1.5, 1, dist);
      }
    }
    return { width, height, data };
  }

  /**
   * Render the hull into `canvas`, place the lamps, and return the port's
   * geometry for whatever else has to follow its curve.
   */
  function build(canvas, lampsEl, W, H) {
    const outline = G.port(portOf(W, H));
    const lamps = placeLamps(outline, W);

    const image = shade(W, H, lamps);
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);

    lampsEl.innerHTML = lamps
      .map((lamp, i) => `<i class="lamp lamp--${lamp.kind}" style="left:${G.fix(lamp.x)}px;top:${G.fix(lamp.y)}px;--i:${i}"></i>`)
      .join('');

    const glass = G.toPath(G.offset(outline, SPEC.glass.overlap));
    const left = outline.slice(outline.length / 4, (outline.length * 3) / 4 + 1).reverse();   // top → bottom

    return {
      width: W,
      height: H,
      /** The pane: the aperture, carried a little way under the gasket. */
      glass,
      /** The pane's polished edge, as an even-odd ring. */
      bevel: glass + G.toPath(G.offset(outline, -SPEC.glass.bevel)),
      /** The whole outline moved `inset` into the glass. */
      inner: (inset) => G.offset(outline, -inset),
      /**
       * The left edge of the port between two heights, top to bottom, moved
       * `inset` into the glass. Normals still point out of the port.
       */
      flank(from, to, inset) {
        const cut = (a, b, y) => {
          const t = (y - a.y) / (b.y - a.y);
          const nx = a.nx + (b.nx - a.nx) * t;
          const ny = a.ny + (b.ny - a.ny) * t;
          const nl = Math.hypot(nx, ny) || 1;
          return { x: a.x + (b.x - a.x) * t, y, nx: nx / nl, ny: ny / nl };
        };
        const run = [];
        for (let i = 0; i < left.length - 1; i++) {
          const a = left[i];
          const b = left[i + 1];
          if (b.y <= from || a.y >= to) continue;
          if (!run.length) run.push(a.y < from ? cut(a, b, from) : a);
          run.push(b.y > to ? cut(a, b, to) : b);
        }
        return run.map((p) => ({ x: p.x - p.nx * inset, y: p.y - p.ny * inset, nx: p.nx, ny: p.ny }));
      },
    };
  }

  L.Frame = { build, shade, portOf, placeLamps, SPEC };
})(window.Lutie);
