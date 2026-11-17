import * as T from './vendor/three.module.js';
import { mergeContours } from './contours.js';

/* A picture whose parts no longer move, drawn in fewer calls.

   Nearly everything in the model is see-through and writes depth, so the order things are drawn in is part of
   the picture: three.js sorts what is see-through from the far end to the near, object by object. Here that
   order is worked out once, as three.js would for the camera as it stands, and kept: the objects stay in it,
   and neighbours in it that share a finish are joined into one object, drawn in one call, in the same order
   inside. Where order cannot matter — what only adds light, or what is solid — everything of one finish is
   joined, wherever it stands.

   Each view is a camera and the layer its copy of the picture lives on. The first keeps the original objects
   (those joined into others are hidden; they still answer a raycaster); every later view gets its own copies,
   which can take an order of their own. `include` leaves out of a view what that camera can never see.

   For a host whose model is fixed once it is set up (overview.js). The workbench changes its model as it is
   used and does not batch. */

const v4 = new T.Vector4();

/** Light that is only added, and leaves depth as it was: it can be drawn in any order. */
const additive = (m) => m.depthWrite === false && (m.blending === T.AdditiveBlending ||
  (m.blending === T.CustomBlending && m.blendEquation === T.AddEquation && m.blendSrc === T.OneFactor && m.blendDst === T.OneFactor));

/** What can be joined with what: the same finish, the same shadows, the same kind of geometry. null: drawn alone. */
function kind(object) {
  if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.morphTargetInfluences) return null;
  const { geometry: g, material: m } = object;
  // A see-through finish on both faces is drawn twice, back faces then front, one object at a time.
  if (m.transparent && m.side === T.DoubleSide && !m.forceSinglePass) return null;
  if (g.isInstancedBufferGeometry) return object.userData.contour && g.attributes.segmentStart ? `contour|${m.uuid}` : null;
  if (!g.attributes.position || Object.keys(g.morphAttributes).length) return null;
  const names = Object.keys(g.attributes).sort();
  if (names.some((n) => g.attributes[n].isInterleavedBufferAttribute)) return null;
  return `${m.uuid}|${object.castShadow}|${object.receiveShadow}|${names.map((n) => `${n}${g.attributes[n].itemSize}${g.attributes[n].normalized ? 'n' : ''}`).join(',')}`;
}

function worldBox(object) {
  const g = object.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  return g.boundingBox.clone().applyMatrix4(object.matrixWorld);
}

/** Where a box can appear on the picture, in the plane of the view, from any of the cameras (orthographic). */
function footprint(box, cameras, margin) {
  const area = new T.Box2(), p = new T.Vector3();
  for (const camera of cameras) for (let k = 0; k < 8; k++) {
    p.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse);
    area.expandByPoint(new T.Vector2(p.x, p.y));
  }
  return area.expandByScalar(margin);
}

/* three.js's own orders (WebGLRenderList): solid by finish, then near to far; see-through far to near. */
const solidOrder = (a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.material.id - b.material.id || a.z - b.z || a.id - b.id;
const clearOrder = (a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || b.z - a.z || a.id - b.id;

/** Meshes of one finish as one geometry, in world space, each keeping its triangles in their own order. */
function mergeMeshes(meshes) {
  const first = meshes[0].geometry, names = Object.keys(first.attributes);
  let vertices = 0, indices = 0;
  for (const { geometry: g } of meshes) {
    vertices += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  const data = Object.fromEntries(names.map((n) => [n, new Float32Array(vertices * first.attributes[n].itemSize)]));
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const p = new T.Vector3(), normalMatrix = new T.Matrix3();
  let v = 0, i = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry, count = g.attributes.position.count, matrix = mesh.matrixWorld;
    normalMatrix.getNormalMatrix(matrix);
    for (const n of names) {
      const source = g.attributes[n], target = data[n], size = source.itemSize;
      for (let k = 0; k < count; k++) {
        if (n === 'position') p.fromBufferAttribute(source, k).applyMatrix4(matrix).toArray(target, (v + k) * 3);
        else if (n === 'normal') p.fromBufferAttribute(source, k).applyMatrix3(normalMatrix).normalize().toArray(target, (v + k) * 3);
        else for (let c = 0; c < size; c++) target[(v + k) * size + c] = source.getComponent(k, c);
      }
    }
    // A mirrored placement turns its triangles over; turn them back.
    const flip = matrix.determinant() < 0, source = g.index, n = source ? source.count : count;
    for (let k = 0; k < n; k += 3) {
      const a = source ? source.getX(k) : k, b = source ? source.getX(k + 1) : k + 1, c = source ? source.getX(k + 2) : k + 2;
      index[i++] = v + a;
      index[i++] = v + (flip ? c : b);
      index[i++] = v + (flip ? b : c);
    }
    v += count;
  }
  const geometry = new T.BufferGeometry();
  for (const n of names) geometry.setAttribute(n, new T.BufferAttribute(data[n], first.attributes[n].itemSize, first.attributes[n].normalized));
  geometry.setIndex(new T.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * See-through things in an order that draws the same picture with as many neighbours of a kind as can be.
 * Order only shows where two things share pixels: those keep the order they were given, and everything else is
 * free to move. Of what may be drawn next, more of the kind just drawn is taken first; when none is left, the
 * kind with the most waiting.
 */
function gather(items) {
  const n = items.length, after = items.map(() => []), waiting = new Int32Array(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = items[i].footprint, b = items[j].footprint;
    if (a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y) { after[i].push(j); waiting[j]++; }
  }
  const ready = new Set();
  for (let i = 0; i < n; i++) if (!waiting[i]) ready.add(i);
  const runs = [];
  let run = null;
  while (ready.size) {
    let pick = -1;
    const kind = run && run[0].kind;
    if (kind !== null && kind !== undefined) for (const i of ready) if (items[i].kind === kind && (pick < 0 || i < pick)) pick = i;
    if (pick < 0) {
      const count = new Map();
      for (const i of ready) if (items[i].kind !== null) count.set(items[i].kind, (count.get(items[i].kind) || 0) + 1);
      let best = 0;
      for (const i of ready) {
        const c = items[i].kind === null ? 1 : count.get(items[i].kind);
        if (pick < 0 || c > best || (c === best && i < pick)) { pick = i; best = c; }
      }
      runs.push((run = []));
    }
    ready.delete(pick);
    run.push(items[pick]);
    for (const j of after[pick]) if (!--waiting[j]) ready.add(j);
  }
  return runs;
}

/** The same object again, where the original stands, sharing its geometry and finish. */
function copyOf(original) {
  const object = new original.constructor(original.geometry, original.material);
  object.matrixAutoUpdate = false;
  object.matrix.copy(original.matrixWorld);
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  for (const k of ['name', 'castShadow', 'receiveShadow', 'frustumCulled', 'renderOrder']) object[k] = original[k];
  object.userData.contour = original.userData.contour;
  return object;
}

/**
 * @param {T.Object3D} root      everything visible under it is batched
 * @param {{camera: T.Camera, layer: number, include?: (box: T.Box3, object: T.Object3D) => boolean}[]} views
 * @param {T.Object3D} [parent]  where the joined objects are put; it must stand at the world's origin
 * @returns {T.BufferGeometry[]} the geometry made, to be disposed with the picture
 */
export function batchStill(root, views, parent = root) {
  root.updateMatrixWorld(true);
  const drawn = [];
  (function walk(object, groupOrder) {
    if (!object.visible) return;
    if (object.isGroup) groupOrder = object.renderOrder;
    if ((object.isMesh || object.isLine || object.isPoints) && object.material && !Array.isArray(object.material)) drawn.push({ object, groupOrder });
    for (const child of object.children) walk(child, groupOrder);
  })(root, 0);
  for (const { object } of drawn) if (additive(object.material)) object.material.forceSinglePass = true;

  // What each view draws, in the order three.js would draw it: worked out for every view before anything changes.
  const plans = views.map(({ camera, poses = [], margin = 0, include }) => {
    for (const c of [camera, ...poses]) c.updateMatrixWorld();
    const toScreen = new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), items = [];
    for (const { object, groupOrder } of drawn) {
      const box = worldBox(object);
      if (include && !include(box, object)) continue;
      const g = object.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      v4.set(g.boundingSphere.center.x, g.boundingSphere.center.y, g.boundingSphere.center.z, 1).applyMatrix4(object.matrixWorld).applyMatrix4(toScreen);
      items.push({ object, groupOrder, renderOrder: object.renderOrder, material: object.material, z: v4.z, id: object.id, kind: kind(object), footprint: footprint(box, [camera, ...poses], margin) });
    }
    return [items.filter((i) => !i.material.transparent).sort(solidOrder), items.filter((i) => i.material.transparent).sort(clearOrder)];
  });

  const made = [], hide = [];
  views.forEach(({ layer }, view) => {
    const group = new T.Group();
    group.name = `batched-${layer}`;
    parent.add(group);
    for (const list of plans[view]) {
      // Bands: what three.js would never interleave. Inside a band, joined objects keep their place.
      const bands = [];
      for (const item of list) {
        const band = bands[bands.length - 1];
        if (band && band.groupOrder === item.groupOrder && band.renderOrder === item.renderOrder) band.items.push(item);
        else bands.push({ groupOrder: item.groupOrder, renderOrder: item.renderOrder, items: [item] });
      }
      for (const band of bands) {
        const free = band.items.every((i) => !i.material.transparent || additive(i.material)), runs = [];
        if (free) {
          // Order does not show here: everything of a kind goes together.
          const byKind = new Map();
          for (const item of band.items) {
            if (item.kind === null) { runs.push([item]); continue; }
            if (!byKind.has(item.kind)) runs.push(byKind.set(item.kind, []).get(item.kind));
            byKind.get(item.kind).push(item);
          }
        } else runs.push(...gather(band.items));
        const finals = runs.map((run) => {
          const first = run[0].object;
          if (run.length === 1 && view === 0) return first;               // stays where it is, as it is
          let object;
          if (run.length === 1) object = copyOf(first);
          else if (run[0].kind.startsWith('contour|')) {
            object = new T.Mesh(mergeContours(run.map((i) => i.object)), first.material);
            object.userData.contour = true;
          } else {
            object = new T.Mesh(mergeMeshes(run.map((i) => i.object)), first.material);
            object.castShadow = first.castShadow;
            object.receiveShadow = first.receiveShadow;
          }
          if (run.length > 1) {
            made.push(object.geometry);
            object.name = `${first.material.name || first.material.type} ×${run.length}`;
            if (view === 0) hide.push(...run.map((i) => i.object));
          }
          object.renderOrder = band.renderOrder;
          object.layers.set(layer);
          group.add(object);
          return object;
        });
        // Fix the order that was worked out: three.js sorts by renderOrder before distance.
        if (list === plans[view][1]) finals.forEach((object, rank) => { object.renderOrder = band.renderOrder + (rank + 1) / (finals.length + 2); });
      }
    }
  });
  for (const object of hide) object.visible = false;
  return made;
}
