/* Outline geometry for the viewport.

   The port is seen through a very wide lens from close up, so its outline is
   not a rounded rectangle but one continuous curve: a superellipse whose upper
   and lower halves have their own height and exponent. The upper half is tall
   and square-shouldered, so the water surface fills the top of the view; the
   lower half is rounder, so the sill sweeps up into the corners.

   Outlines are closed clockwise polylines that carry outward normals, which
   makes every other line on the glass an exact parallel of the same curve.    */
(function (L) {
  'use strict';

  const TAU = Math.PI * 2;
  const fix = (n) => Math.round(n * 100) / 100;

  /**
   * @param {{cx:number, cy:number, a:number, top:{b:number,n:number}, bottom:{b:number,n:number}, steps?:number}} port
   * @returns {{x:number,y:number,nx:number,ny:number}[]} clockwise on screen,
   * starting at the rightmost point: right → bottom → left → top.
   */
  function port({ cx, cy, a, top, bottom, steps = 720 }) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * TAU;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const half = s >= 0 ? bottom : top;
      const e = 2 / half.n;
      const u = Math.sign(c) * Math.pow(Math.abs(c), e);
      const v = Math.sign(s) * Math.pow(Math.abs(s), e);
      // Gradient of |u|^n + |v|^n in screen space, i.e. the outward normal.
      const gx = (Math.sign(c) * Math.pow(Math.abs(u), half.n - 1)) / a;
      const gy = (Math.sign(s) * Math.pow(Math.abs(v), half.n - 1)) / half.b;
      const gl = Math.hypot(gx, gy) || 1;
      pts.push({ x: cx + u * a, y: cy + v * half.b, nx: gx / gl, ny: gy / gl });
    }
    return pts;
  }

  /** Parallel curve at distance d (positive = outward). */
  function offset(pts, d) {
    return pts.map((p) => ({ x: p.x + p.nx * d, y: p.y + p.ny * d, nx: p.nx, ny: p.ny }));
  }

  function toPath(pts, closed = true) {
    let d = `M${fix(pts[0].x)} ${fix(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) d += `L${fix(pts[i].x)} ${fix(pts[i].y)}`;
    return closed ? d + 'Z' : d;
  }

  /** Arc-length parametrisation of a polyline, closed or open. */
  function walker(pts, closed = true) {
    const segments = closed ? pts.length : pts.length - 1;
    const cum = [0];
    for (let i = 0; i < segments; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const length = cum[segments];

    function at(s) {
      s = closed ? ((s % length) + length) % length : Math.min(length, Math.max(0, s));
      let lo = 0;
      let hi = segments;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid;
      }
      const a = pts[lo];
      const b = pts[(lo + 1) % pts.length];
      const seg = cum[lo + 1] - cum[lo] || 1;
      const t = (s - cum[lo]) / seg;
      const nx = a.nx + (b.nx - a.nx) * t;
      const ny = a.ny + (b.ny - a.ny) * t;
      const nl = Math.hypot(nx, ny) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        nx: nx / nl,
        ny: ny / nl,
      };
    }

    return {
      length,
      at,
      /** Arc length at which vertex `i` sits. */
      mark: (i) => cum[i],
    };
  }

  L.geometry = { port, offset, toPath, walker, fix };
})(window.Lutie);
