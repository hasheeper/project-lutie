/* Every liquid surface of the HUD, as data.

   Coordinates are in the widget's own box (w × h). Parts are merged in order;
   a part's `k` is how far it reaches to fuse with what is already there.

   Optics (see glass.js)
     edge     width of the curved rim, px — how thick the liquid reads
     bend     how far the rim displaces what is behind it, px;
              positive pulls the view inward (a drop of water),
              negative pushes it outward (a bubble of air)
     reach    how far in from the outline the bend carries, px (default: edge);
              the full radius makes the whole body a lens
     power    how quickly the bend dies away from the edge
     blur     softening of what is seen through the body, px
     gloss    tightness of the wet highlight
     spec · sheen · caustic · dark · iris   strengths of the light terms
     rim      strength of the mirror along a thick rim (sky above, floor below)
     wall     [strength, depth, around] of the line where that rim's inner face
              shows; `around` is how much of it survives on the lit side
     arcs     crescents lying along the rim, each [strength, from, to, side]:
              between two depths (1 at the outline, 0 where the rim ends), on
              the side facing the light (1) or away from it (-1)
     line     strength of the hair-thin outline
     skin     [line, fill] for a shape that has an `inner` body: how bright the
              inner outline is, and how much lighter the band around it
     haze     how much the highlight blooms around itself (default 0.16)
     shadow   [strength, offset, softness] of the shade it casts behind
     contact  the same, for a second, tight shade under things with weight
     near     [x, y, range, floor] for a surface so wide that the key light is
              plainly nearer one end: what it returns of that light falls to
              `floor` over `range` px from the point nearest the key

   A shape may also name a coarser sampling grid (`cell`, px) and a lower
   light resolution (`ratio`); see glass.js.

   Only what is pressed has rim, wall and contact: a vesicle is a film of
   liquid on the pane, a button is a piece of glass in front of it.           */
(function (L) {
  'use strict';

  const { bead, tube } = L.Blob;

  /* Corner vesicles: one body holding several organs. Clear and dark, like
     the water seen through them. Their edge is said once: a crescent of light
     toward the key, an outline that thins to nothing on the far side. ───── */

  const VESICLE = {
    edge: 18, bend: 22, power: 2.4, blur: 0.8,
    gloss: 100, spec: 1, haze: 0.1, sheen: 0.3, rim: 0.3, line: 0.36,
    arcs: [[0.95, 0.74, 0.9, 1]],
    caustic: 0.16, dark: 0.16,
    shadow: [0.34, 12, 14],
  };

  // Upper left: one drop that hugs the corner of the port. Its head, on the
  // right, holds the ether dial; the body lies along the top with the
  // temperature in it; and it runs out down the left side into a tail. The
  // hydration vein follows the inside of that curve.
  const env = {
    w: 368,
    h: 218,
    parts: [
      tube([[304, 66, 60], [236, 74, 49], [150, 78, 51], [84, 96, 44], [40, 136, 30], [20, 178, 15]]),
      bead(9, 208, 5.5, { k: 0 }),
    ],
    optics: VESICLE,
  };

  // The vein's own channel, offset (18, 92) from that drop's corner. It is
  // not liquid glass but a solid of its own (liquid.js); only its centre line
  // and radii are used.
  const vein = {
    w: 228,
    h: 88,
    parts: [tube([[218, 10, 6], [142, 14, 11], [80, 22, 12], [30, 50, 9], [9, 78, 5]])],
  };

  // Lower left. A drop lying on the sill, drawn out to a tip that has just let go of a bead.
  const cycle = {
    w: 334,
    h: 116,
    parts: [
      tube([[52, 66, 46], [158, 68, 41], [250, 62, 31], [292, 54, 15]]),
      bead(322, 46, 7, { k: 0 }),
    ],
    optics: VESICLE,
  };

  /* Care bubbles: balls of clear glass with air in them. Clear and a little
     dark inside, so what they carry reads; their volume is all in the rim —
     a hard crescent of light on the side toward the key, its echo opposite,
     a hair of outline, and colour only where the skin is seen edge-on. ──── */

  const AIR = {
    bend: -30, power: 2, blur: 0.4,
    gloss: 150, spec: 0.9, haze: 0.05, sheen: 0, rim: 0.3, line: 0.55,
    arcs: [[1, 0.86, 0.95, 1], [0.55, 0.89, 0.94, -1]],
    caustic: 0.1, dark: 0.3, iris: 0.3,
    shadow: [0.32, 12, 14], contact: [0.36, 4, 5],
  };

  const bubbleWater = {
    w: 136,
    h: 120,
    centre: [58, 62],
    parts: [
      bead(58, 62, 52, { wobble: [[2, 0.03, 0.6], [3, 0.016, 2.1]] }),
      bead(118, 26, 7.5, { k: 0 }),
      bead(128, 48, 5, { k: 0 }),
    ],
    optics: { ...AIR, edge: 52 },
  };

  const bubbleLight = {
    w: 112,
    h: 112,
    centre: [56, 56],
    parts: [bead(56, 56, 48, { wobble: [[2, 0.034, 2.4], [3, 0.014, 0.3]] })],
    optics: { ...AIR, edge: 48 },
  };

  const bubbleFeed = {
    w: 124,
    h: 120,
    centre: [64, 58],
    parts: [
      bead(64, 58, 51, { wobble: [[2, 0.026, 4.2], [3, 0.02, 5]] }),
      bead(14, 108, 6, { k: 0 }),
    ],
    optics: { ...AIR, edge: 51 },
  };

  /* The lens that holds the crystal, and two drops it has not gathered yet. */

  const view = {
    w: 276,
    h: 254,
    centre: [150, 128],
    parts: [
      bead(150, 128, 118, { wobble: [[2, 0.012, 1]] }),
      bead(36, 214, 12, { k: 0 }),
      bead(15, 186, 5.5, { k: 0 }),
    ],
    optics: {
      edge: 30, reach: 118, bend: 44, power: 1.7, blur: 0.5,
      gloss: 120, spec: 0.9, haze: 0.08, sheen: 0.2, rim: 0.45, line: 0.55, wall: [0.3, 10, 0.3],
      arcs: [[1, 0.8, 0.93, 1], [0.5, 0.76, 0.84, -1]],
      caustic: 0.14, dark: 0.26,
      shadow: [0.46, 16, 18], contact: [0.42, 5, 6],
    },
  };

  /* Speech: a long cell of dark, clear glass — the water behind it stays
     visible, only dimmed. Like a cell it swells at both ends and narrows in
     the middle, and it has a skin: a second body inside the first, close under
     the outline along the waist and well inside it at the ends. Her name is on
     a smaller, paler capsule laid across its upper-left edge. ─────────────── */

  const dialog = {
    w: 704,
    h: 104,
    parts: [tube([[52, 52, 49], [190, 51, 41], [352, 52, 38], [516, 53, 41], [652, 52, 48]])],
    inner: [tube([[59, 52, 36], [190, 51, 33], [352, 52, 31.5], [516, 53, 33], [645, 52, 35]])],
    optics: {
      edge: 14, bend: 8, power: 2, blur: 1,
      gloss: 80, spec: 0.6, haze: 0.08, sheen: 0.3, rim: 0.3, line: 0.75, skin: [0.62, 0.045],
      arcs: [[0.9, 0.72, 0.9, 1]],
      caustic: 0.05, dark: 0.08,
      shadow: [0.36, 10, 14],
    },
  };

  const nameTag = {
    w: 180,
    h: 46,
    parts: [tube([[23, 24, 19], [90, 22, 21], [158, 24, 17]])],
    optics: {
      edge: 10, bend: 8, power: 2, blur: 3,
      gloss: 70, spec: 0.8, haze: 0.1, sheen: 0.4, rim: 0.4, line: 0.7, wall: [0.24, 6, 0.4],
      arcs: [[0.9, 0.66, 0.88, 1]],
      caustic: 0.14, dark: 0.1,
      shadow: [0.36, 6, 8],
    },
  };

  /* ── The system sheet ─────────────────────────────────
     Settings are not a panel laid over the port. The pane is given a film of
     water to carry them: a vesicle like the ones in the corners, only spread
     wide. So it is lit the same way — one crescent toward the key, an edge
     that thins out on the far side — and, being wide, it is brightest at the
     corner nearest the lamp and quiet by the time it reaches the other.

     Its outline is a pooled drop: four fat tubes for the rim and two more to
     fill the middle. It is heaviest at the upper left, where the title is,
     and draws in toward the lower right, where a couple of beads have just
     let go of it. The film itself lies between x = 220 and 966; the room to
     its left is for the four bubbles that choose a page (NAV: centre and
     radius of each, in the sheet's box) and for the tongue the film puts out
     to the one that is chosen.                                                */

  const FILM = {
    edge: 20, bend: 16, power: 2.2, blur: 2,
    gloss: 100, spec: 0.85, haze: 0.08, sheen: 0.26, rim: 0.3, line: 0.34,
    arcs: [[0.85, 0.74, 0.9, 1]],
    caustic: 0.12, dark: 0.14,
    shadow: [0.3, 12, 16],
    near: [236, 24, 940, 0.2],
  };

  const sheet = {
    w: 972,
    h: 632,
    cell: 3,
    ratio: 1.5,
    parts: [
      tube([[296, 92, 76], [600, 86, 58], [904, 88, 56]], { step: 40 }),
      tube([[296, 92, 76], [280, 320, 60], [284, 556, 64]], { step: 40 }),
      tube([[904, 88, 56], [912, 310, 54], [876, 530, 52]], { step: 40 }),
      tube([[284, 556, 64], [590, 560, 54], [876, 530, 52]], { step: 40 }),
      tube([[362, 208, 134], [838, 204, 122]], { step: 80 }),
      tube([[358, 428, 134], [826, 418, 116]], { step: 80 }),
      bead(929, 578, 6.5, { k: 0 }),
      bead(945.5, 555.5, 3.5, { k: 0 }),
    ],
    optics: FILM,
  };

  const NAV = [[76, 112, 44], [68, 238, 40], [74, 362, 42], [95, 482, 39]];

  // The film reaching out to the chosen bubble: a cup under it, a neck that
  // carries its name, and a root well inside the film so the two run together.
  const tongue = (i) => {
    const [x, y, r] = NAV[i];
    return tube([[x, y, r + 7], [x + r + 22, y + 1, 32], [196, y, 30], [280, y, 44]], { k: 34 });
  };

  // The page bubbles are air, like the care bubbles, and no two are alike.
  const nav = NAV.map(([, , r], i) => ({
    w: r * 2 + 4,
    h: r * 2 + 4,
    centre: [r + 2, r + 2],
    parts: [bead(r + 2, r + 2, r, { wobble: [[2, 0.028, 0.7 + i * 1.3], [3, 0.014, 2.2 - i * 0.9]] })],
    optics: { ...AIR, edge: r, bend: -24 },
  }));

  // The way in, and the way back out: a small bubble in the upper-right
  // corner of the port, half over the hull. (The map's is beside it.)
  const entry = {
    w: 68,
    h: 68,
    centre: [34, 34],
    parts: [
      bead(34, 34, 30, { wobble: [[2, 0.03, 3.4], [3, 0.016, 1.1]] }),
      bead(5, 61, 3.6, { k: 0 }),
    ],
    optics: { ...AIR, edge: 30, bend: -18, shadow: [0.3, 8, 10], contact: [0.34, 3, 4] },
  };

  /* What is set on the sheet. A level is a channel of water, like the
     hydration vein, with a drop riding its front; a choice is a small cell
     with a lobe for each option. Only the drop stands proud: it is the one
     thing here a hand takes hold of.                                          */

  // Three channels, so that no two rows on a page are the same line. Only
  // their centre lines and radii are used (liquid.js).
  const tracks = [[0, -1.4, 0.6], [0.8, 1.2, -0.6], [-0.6, 0.4, 1.2]].map(([a, b, c]) => ({
    w: 372,
    h: 30,
    parts: [tube([[11, 15 + a, 6.6], [130, 15 + b, 6.2], [250, 15 + c, 5.7], [362, 15, 5.1]], { step: 22 })],
  }));

  const thumb = {
    w: 26,
    h: 32,
    centre: [13, 20],
    parts: [tube([[13, 20, 10.5], [13.3, 8.5, 3.6]])],
    optics: {
      edge: 8, bend: 9, power: 1.8, blur: 0,
      gloss: 60, spec: 1, haze: 0.12, sheen: 0.5, rim: 0.4, line: 0.7,
      arcs: [[0.9, 0.6, 0.86, 1]],
      caustic: 0.34, dark: 0.12,
      shadow: [0.42, 4, 5], contact: [0.3, 2, 3],
    },
  };

  // Inside the film there is nothing behind a cell to bend, so it has no lens.
  const ORGAN = {
    edge: 9, bend: 0,
    gloss: 70, spec: 0.5, haze: 0.08, sheen: 0.2, rim: 0.2, line: 0.34,
    arcs: [[0.6, 0.62, 0.86, 1]],
    caustic: 0.1, dark: 0.1,
    shadow: [0.18, 4, 6],
  };

  // A lobed cell (lobes.js) also says where each option is centred, how wide
  // an option may be, and how far left of that centre the bead rests.
  const lobes2 = {
    w: 300,
    h: 46,
    lobes: [78, 224],
    span: 124,
    bead: 38,
    parts: [tube([[24, 23, 19.5], [78, 22.6, 18.6], [152, 23.4, 14], [224, 23, 18], [278, 23, 18.6]])],
    optics: ORGAN,
  };

  /* ── The map ──────────────────────────────────────────
     The map itself is printed on the pane (map.js) and has no surface. Three
     things about it are glass: the second bubble in the corner, which opens
     it; the cell its three views are chosen in, which lies where the speech
     sheet does and, like it, has water behind it to bend; and the small
     bubble that forms on a zone's mark while the zone is being looked at.    */

  const entryMap = {
    w: 60,
    h: 60,
    centre: [30, 30],
    parts: [bead(30, 30, 26, { wobble: [[2, 0.032, 0.9], [3, 0.016, 4.1]] })],
    optics: { ...AIR, edge: 26, bend: -16, shadow: [0.3, 8, 10], contact: [0.34, 3, 4] },
  };

  const lobes3 = {
    w: 492,
    h: 50,
    lobes: [92, 246, 400],
    span: 150,
    bead: 52,
    parts: [tube([[27, 25, 21], [92, 24.5, 20], [169, 25.6, 15], [246, 25, 19.5], [323, 24.4, 15], [400, 25.4, 20], [465, 25, 21]])],
    optics: {
      edge: 12, bend: 9, power: 2, blur: 1,
      gloss: 80, spec: 0.6, haze: 0.08, sheen: 0.3, rim: 0.3, line: 0.5,
      arcs: [[0.85, 0.7, 0.9, 1]],
      caustic: 0.08, dark: 0.1,
      shadow: [0.34, 8, 12],
    },
  };

  const pip = {
    w: 40,
    h: 40,
    centre: [20, 20],
    parts: [bead(20, 20, 17, { wobble: [[2, 0.03, 2.2]] })],
    optics: { ...AIR, edge: 17, bend: -10, shadow: [0.26, 5, 7], contact: [0.3, 2, 3] },
  };

  L.Shapes = {
    env, vein, cycle, bubbleWater, bubbleLight, bubbleFeed, view, dialog, nameTag,
    sheet, tongue, NAV, nav0: nav[0], nav1: nav[1], nav2: nav[2], nav3: nav[3], entry,
    tracks, thumb, lobes2,
    entryMap, lobes3, pip,
  };
})(window.Lutie);
