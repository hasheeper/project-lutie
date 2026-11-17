/* Liquid glass.

   An element names a shape from shapes.js:
     <section class="glass" data-glass="env">
   and receives, behind its own content:
     .glass__body   what is seen through the liquid, clipped to its outline
     .glass__light  everything the key light does to it, and the shade it casts

   The body is clear in the middle. Only the rim, where the surface curves
   down to the glass, bends the view (a displacement map; Chromium only — other
   engines keep a plain soft blur). Nothing outlines the shape: the side facing
   the key light carries one wet highlight, the far side gathers a little of
   the light that passed through, and in between the edge is left to the dark. */
(function (L) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const RATIO = 2;                                    // light is drawn at twice stage resolution
  const isChromium = typeof navigator !== 'undefined' && /Chrome\//.test(navigator.userAgent);

  const unit = (v) => {
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
  };
  const KEY = unit([-0.5, -0.72, 0.48]);              // key light: above, left, in front of the glass
  const HALF = unit([KEY[0], KEY[1], KEY[2] + 1]);    // halfway between the light and the eye
  const TOWARD = unit([KEY[0], KEY[1]]);              // where the light is, on the plane of the glass
  const SKY = unit([-0.3, -0.95]);                    // where the water's surface is: overhead, a little to the light's side

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (lo, hi, v) => {
    const t = clamp01((v - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
  };

  /** Room the body and its light need around the shape. */
  function padding(o) {
    const [, reach, soft] = o.shadow;
    return Math.ceil(Math.max(6, reach + soft + 2, o.bend < 0 ? 4 - o.bend : 0));
  }

  /* ── Light ────────────────────────────────────────────
     The rim is treated as a quarter-round fillet `edge` wide: at the outline
     the surface stands upright, `edge` further in it lies flat. That gives a
     surface normal at every pixel, and the terms below read from it.          */

  function shade(f, o, ratio = RATIO, inner = null) {
    const width = Math.round((f.w + f.pad * 2) * ratio);
    const height = Math.round((f.h + f.pad * 2) * ratio);
    const data = new Uint8ClampedArray(width * height * 4);
    const { cols, rows, cell, d, gx, gy, bow } = f;
    const step = 1 / (ratio * cell);                  // grid nodes per output pixel
    const [shadow, reach, soft] = o.shadow;
    const shiftX = (TOWARD[0] * reach) / cell;
    const shiftY = (TOWARD[1] * reach) / cell;
    const [contact, near, tight] = o.contact || [0, 0, 1];
    const [wall, wallAt, wallRound = 0.2] = o.wall || [0, 0];
    const rim = o.rim || 0;
    const line = o.line || 0;
    const arcs = o.arcs || [];
    const haze = o.haze === undefined ? 0.16 : o.haze;
    const [skinLine, skinFill] = o.skin || [0, 0];
    const maxX = cols - 1.001;
    const maxY = rows - 1.001;
    const iris = o.iris || 0;
    const lamp = o.near || null;

    const distanceAt = (fx, fy) => {
      fx = fx < 0 ? 0 : fx > maxX ? maxX : fx;
      fy = fy < 0 ? 0 : fy > maxY ? maxY : fy;
      const i = fx | 0;
      const j = fy | 0;
      const tx = fx - i;
      const ty = fy - j;
      const o0 = j * cols + i;
      const o1 = o0 + cols;
      return (d[o0] * (1 - tx) + d[o0 + 1] * tx) * (1 - ty) + (d[o1] * (1 - tx) + d[o1 + 1] * tx) * ty;
    };

    for (let y = 0; y < height; y++) {
      const fy = Math.min(maxY, (y + 0.5) * step);
      const j = fy | 0;
      const ty = fy - j;
      for (let x = 0; x < width; x++) {
        const fx = Math.min(maxX, (x + 0.5) * step);
        const i = fx | 0;
        const tx = fx - i;
        const o0 = j * cols + i;
        const o1 = o0 + cols;
        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        const dist = d[o0] * w00 + d[o0 + 1] * w10 + d[o1] * w01 + d[o1 + 1] * w11;
        if (dist > reach + soft + 1) continue;

        const inside = clamp01(0.5 - dist * ratio);   // coverage, for a clean edge
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;

        // The shade it casts: the shape itself, moved away from the light and
        // softened — a wide one for its height above the pane, and for things
        // with weight a tight one where they all but touch it.
        if (shadow && inside < 1) {
          const t = clamp01(0.5 - distanceAt(fx + shiftX, fy + shiftY) / (soft * 2));
          let k = shadow * t * t * (3 - 2 * t);
          if (contact) {
            const u = clamp01(0.5 - distanceAt(fx + (TOWARD[0] * near) / cell, fy + (TOWARD[1] * near) / cell) / (tight * 2));
            k = 1 - (1 - k) * (1 - contact * u * u * (3 - 2 * u));
          }
          k *= 1 - inside;
          r = 1 * k;
          g = 6 * k;
          b = 12 * k;
          a = k;
        }

        const m = inside > 0 ? clamp01(1 + dist / o.edge) : 0;   // 1 at the outline, 0 where the rim ends
        if (m > 0) {
          let nx = gx[o0] * w00 + gx[o0 + 1] * w10 + gx[o1] * w01 + gx[o1 + 1] * w11;
          let ny = gy[o0] * w00 + gy[o0 + 1] * w10 + gy[o1] * w01 + gy[o1 + 1] * w11;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          const facing = nx * TOWARD[0] + ny * TOWARD[1];
          const lit = facing > 0 ? facing : 0;
          const back = facing < 0 ? -facing : 0;
          // In a neck between two drops the surface is a saddle; it should not flare.
          let convex = clamp01(1 + 14 * (bow[o0] * w00 + bow[o0 + 1] * w10 + bow[o1] * w01 + bow[o1 + 1] * w11));
          // A surface wide enough that the key is plainly nearer one end of it:
          // what it returns of that light falls away with distance.
          if (lamp) {
            const t = clamp01(Math.hypot(fx * cell - f.pad - lamp[0], fy * cell - f.pad - lamp[1]) / lamp[2]);
            convex *= 1 - (1 - lamp[3]) * t * t * (3 - 2 * t);
          }
          let k;

          // Thickness: the rim holds more liquid, most visibly away from the light.
          k = o.dark * m * m * (0.3 + 0.7 * back) * inside;
          r = r * (1 - k) + 2 * k;
          g = g * (1 - k) + 14 * k;
          b = b * (1 - k) + 24 * k;
          a = a * (1 - k) + k;

          // Light that entered on the near side gathers inside the far rim —
          // inside it, not on it, so that edge still falls away into the dark.
          k = o.caustic * Math.pow(back, 1.3) * Math.pow(6.75 * m * m * (1 - m), 1.2) * inside;
          r = r * (1 - k) + 190 * k;
          g = g * (1 - k) + 255 * k;
          b = b * (1 - k) + 242 * k;
          a = a * (1 - k) + k;

          // Thin-film colour, for skins of air: only where the skin is seen edge-on.
          if (iris) {
            const hue = Math.atan2(ny, nx) * 2;
            k = iris * m * m * m * m * m * inside;
            r = r * (1 - k) + (200 + 55 * Math.cos(hue)) * k;
            g = g * (1 - k) + (200 + 55 * Math.cos(hue + 2.094)) * k;
            b = b * (1 - k) + (200 + 55 * Math.cos(hue + 4.189)) * k;
            a = a * (1 - k) + k;
          }

          // Seen at a glancing angle a thick rim is a mirror: its upper side shows
          // the bright surface overhead, its lower side the dark floor. This, more
          // than anything, is what gives the glass a wall.
          if (rim) {
            const glance = Math.pow(1 - Math.sqrt(1 - m * m), 2.2);
            const sky = smooth(-0.3, 0.8, nx * SKY[0] + ny * SKY[1]);
            k = clamp01(rim * 0.7 * glance * (1 - sky)) * inside;
            r = r * (1 - k) + 2 * k;
            g = g * (1 - k) + 10 * k;
            b = b * (1 - k) + 18 * k;
            a = a * (1 - k) + k;
            k = clamp01(rim * glance * sky) * convex * inside;
            r = r * (1 - k) + 226 * k;
            g = g * (1 - k) + 248 * k;
            b = b * (1 - k) + 255 * k;
            a = a * (1 - k) + k;
          }

          // The inner face of that wall: a second, fainter line a little way in.
          if (wall) {
            const off = (-dist - wallAt) / 0.85;
            k = clamp01(wall * Math.exp(-off * off) * (wallRound + (1 - wallRound) * Math.pow(back, 0.7))) * convex * inside;
            r = r * (1 - k) + 214 * k;
            g = g * (1 - k) + 250 * k;
            b = b * (1 - k) + 255 * k;
            a = a * (1 - k) + k;
          }

          // Reflections of something broad — the lit surface, a window — lie along
          // the rim as crescents: thin, hard-edged, a set distance in, and only on
          // the stretch of rim that faces their source (or, for an echo off the
          // far wall, the stretch opposite).
          for (let i = 0; i < arcs.length; i++) {
            const [strength, from, to, side] = arcs[i];
            const span = side > 0 ? smooth(0.3, 0.9, facing) : smooth(0.55, 0.97, -facing);
            if (span <= 0) continue;
            // Full width in the middle of its stretch, drawn out to a point at each end.
            const lo = to - (to - from) * span;
            k = clamp01(strength * Math.min(1, span * 4) * smooth(lo, lo + 0.022, m) * (1 - smooth(to - 0.018, to, m))) * convex * inside;
            r = r * (1 - k) + 255 * k;
            g = g * (1 - k) + 255 * k;
            b = b * (1 - k) + 255 * k;
            a = a * (1 - k) + k;
          }

          // The outline of a piece of glass: hair-thin, and never even — it all
          // but vanishes on the side away from the light.
          if (line) {
            const m4 = m * m * m * m;
            k = clamp01(line * m4 * m4 * m4 * (0.22 + 0.78 * lit)) * convex * inside;
            r = r * (1 - k) + 232 * k;
            g = g * (1 - k) + 250 * k;
            b = b * (1 - k) + 255 * k;
            a = a * (1 - k) + k;
          }

          // A wet line along the edges that face the light, fading as they turn away.
          k = clamp01(o.sheen * Math.pow(lit, 1.5) * m * m * m * m) * convex * inside;
          r = r * (1 - k) + 236 * k;
          g = g * (1 - k) + 252 * k;
          b = b * (1 - k) + 255 * k;
          a = a * (1 - k) + k;

          // The highlight itself: sharp where the fillet mirrors the light to the eye.
          const ndh = nx * m * HALF[0] + ny * m * HALF[1] + Math.sqrt(1 - m * m) * HALF[2];
          if (ndh > 0) {
            k = clamp01(o.spec * (Math.pow(ndh, o.gloss) + haze * m * Math.pow(ndh, o.gloss / 6))) * convex * inside;
            r = r * (1 - k) + 255 * k;
            g = g * (1 - k) + 255 * k;
            b = b * (1 - k) + 255 * k;
            a = a * (1 - k) + k;
          }
        }

        // A body within the body, as a cell has: the band between the two
        // outlines is skin — thinner, so it lets more light through — and the
        // inner outline shows as a second line, brightest where it lies across
        // the light.
        if (inner && inside > 0) {
          const d2 = inner.d[o0] * w00 + inner.d[o0 + 1] * w10 + inner.d[o1] * w01 + inner.d[o1 + 1] * w11;
          const ix = inner.gx[o0] * w00 + inner.gx[o0 + 1] * w10 + inner.gx[o1] * w01 + inner.gx[o1 + 1] * w11;
          const iy = inner.gy[o0] * w00 + inner.gy[o0 + 1] * w10 + inner.gy[o1] * w01 + inner.gy[o1 + 1] * w11;
          const across = Math.abs(ix * TOWARD[0] + iy * TOWARD[1]) / (Math.hypot(ix, iy) || 1);
          let k = skinFill * smooth(0, 1.5, d2) * inside;
          r = r * (1 - k) + 150 * k;
          g = g * (1 - k) + 222 * k;
          b = b * (1 - k) + 244 * k;
          a = a * (1 - k) + k;
          const off = d2 / 0.8;
          k = clamp01(skinLine * Math.exp(-off * off) * (0.35 + 0.65 * across)) * inside;
          r = r * (1 - k) + 226 * k;
          g = g * (1 - k) + 250 * k;
          b = b * (1 - k) + 255 * k;
          a = a * (1 - k) + k;
        }

        if (a > 0.002) {
          const p = (y * width + x) * 4;
          data[p] = r / a;
          data[p + 1] = g / a;
          data[p + 2] = b / a;
          data[p + 3] = a * 255;
        }
      }
    }
    return { width, height, data };
  }

  /* ── Refraction ───────────────────────────────────────
     Red and green carry how far, and which way, each pixel of the body looks
     for what it shows: along the edge normal, strongest at the outline and
     gone where the rim ends. Water bends the view inward; air, outward.       */

  function lensMap(f, o) {
    const width = f.w + f.pad * 2;
    const height = f.h + f.pad * 2;
    const data = new Uint8ClampedArray(width * height * 4);
    const { cols, cell, d, gx, gy } = f;
    const sign = o.bend > 0 ? -1 : 1;
    const reach = o.reach || o.edge;                  // how far in from the outline the view is bent
    for (let y = 0; y < height; y++) {
      const fy = (y + 0.5) / cell;
      const j = fy | 0;
      const ty = fy - j;
      for (let x = 0; x < width; x++) {
        const fx = (x + 0.5) / cell;
        const i = fx | 0;
        const tx = fx - i;
        const o0 = j * cols + i;
        const o1 = o0 + cols;
        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        const dist = d[o0] * w00 + d[o0 + 1] * w10 + d[o1] * w01 + d[o1 + 1] * w11;
        const p = (y * width + x) * 4;
        let ox = 0;
        let oy = 0;
        const m = dist < 0 ? clamp01(1 + dist / reach) : 0;
        if (m > 0) {
          const nx = gx[o0] * w00 + gx[o0 + 1] * w10 + gx[o1] * w01 + gx[o1 + 1] * w11;
          const ny = gy[o0] * w00 + gy[o0 + 1] * w10 + gy[o1] * w01 + gy[o1 + 1] * w11;
          const amount = (sign * Math.pow(m, o.power)) / (Math.hypot(nx, ny) || 1);
          ox = nx * amount;
          oy = ny * amount;
        }
        data[p] = 128 + 127 * ox;
        data[p + 1] = 128 + 127 * oy;
        data[p + 2] = 128;
        data[p + 3] = 255;
      }
    }
    return { width, height, data };
  }

  function toCanvas(image) {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    return c;
  }

  /** Add the shape's lens to the page and return the backdrop filter that uses it. */
  function refract(name, f, o) {
    const map = lensMap(f, o);
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', `lens-${name}`);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', map.width);
    filter.setAttribute('height', map.height);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.innerHTML = `
      <feImage href="${toCanvas(map).toDataURL()}" x="0" y="0" width="${map.width}" height="${map.height}" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${Math.abs(o.bend) * 2}" xChannelSelector="R" yChannelSelector="G"/>`;
    L.$('.defs defs').appendChild(filter);

    return `url(#lens-${name}) blur(${o.blur || 0}px) saturate(1.3) brightness(1.08)`;
  }

  /* ── Build and mount ──────────────────────────────────── */

  const built = new Map();

  /**
   * Everything a shape needs worked out, once per name: its field, its
   * outline, the light on it and, where the engine can bend the view, its
   * lens. A shape may ask for a coarser grid (`cell`) or a lower light
   * resolution (`ratio`) — a surface hundreds of pixels across needs neither
   * as fine as a bead does. `f` is passed by a caller that has grown the
   * field itself (a variant of the shape; see `seed` in blob.js).
   */
  function build(name, shape, f) {
    const o = shape.optics;
    const pad = padding(o);
    const cell = shape.cell || 2;
    if (!f) f = L.Blob.field(shape, pad, cell);
    const inner = shape.inner ? L.Blob.field({ w: shape.w, h: shape.h, parts: shape.inner }, pad, cell) : null;
    const made = {
      w: shape.w,
      h: shape.h,
      pad,
      f,
      clip: `path(evenodd, '${L.Blob.outline(f, true)}')`,
      light: toCanvas(shade(f, o, shape.ratio || RATIO, inner)),
      lens: o.bend && isChromium ? refract(name, f, o) : '',
      taken: false,
    };
    built.set(name, made);
    return made;
  }

  /**
   * The two elements a built shape is shown with. Body and light share one
   * box: the shape plus its padding. A shape shown more than once gets a copy
   * of its light each time after the first.
   */
  function surface(made) {
    const body = document.createElement('div');
    body.className = 'glass__body';
    body.style.inset = `${-made.pad}px`;
    body.style.clipPath = made.clip;
    if (made.lens) {
      body.style.backdropFilter = made.lens;
      body.style.webkitBackdropFilter = made.lens;
    }

    let light = made.light;
    if (made.taken) {
      light = document.createElement('canvas');
      light.width = made.light.width;
      light.height = made.light.height;
      light.getContext('2d').drawImage(made.light, 0, 0);
    }
    made.taken = true;
    light.className = 'glass__light';
    light.setAttribute('aria-hidden', 'true');
    light.style.left = light.style.top = `${-made.pad}px`;
    light.style.width = `${made.w + made.pad * 2}px`;
    light.style.height = `${made.h + made.pad * 2}px`;
    return { body, light };
  }

  function mount(el) {
    if (el.querySelector(':scope > .glass__body')) return;
    const name = el.dataset.glass;
    const made = built.get(name) || build(name, L.Shapes[name]);
    el.style.width = `${made.w}px`;
    el.style.height = `${made.h}px`;
    const { body, light } = surface(made);
    el.prepend(light);
    el.prepend(body);
  }

  L.Glass = {
    mountAll(root) {
      L.$$('[data-glass]', root).forEach(mount);
    },
    build,
    surface,
    /** Outline of a built shape as an SVG path, in the shape's own box. */
    outline: (name) => L.Blob.outline(built.get(name).f, false),
    padding,
    shade,
    lensMap,
  };
})(window.Lutie);
