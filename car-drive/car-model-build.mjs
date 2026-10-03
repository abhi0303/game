// Turns a heavy, Draco-compressed model into a small plain GLB the game can embed.
//   node model-build.mjs <in> <out> <ratio> <error> [part,to,drop] [bake]
// `bake` moves every part into one shared frame (its node placement is applied to its
// vertices), which suits models whose parts the game re-pivots itself.
//
// The source stores every triangle with its own three vertices, and every panel twice,
// once facing each way. That is no use to a simplifier (nothing shares a vertex, and each
// surface is pinned by its twin), so each part is rebuilt as one consistently oriented,
// welded surface first:
//   1. drop the duplicate of every triangle pair,
//   2. weld vertices by position,
//   3. flip triangles until neighbours agree on which side is the front, and each
//      connected piece faces away from the middle of its part,
//   4. give each corner its face normal and merge corners that share a position and
//      point within about 60 degrees of each other, so panels are smooth but creases stay,
//   5. simplify.
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const [input, out] = process.argv.slice(2, 4);
const [ratio, error] = [Number(process.argv[4]), Number(process.argv[5])];
const DROP = new Set((process.argv[6] || '').split(',').filter(Boolean));
const bake = process.argv[7] === 'bake';

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(input);
for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose(); // write plain geometry
for (const node of doc.getRoot().listNodes()) if (DROP.has(node.getName())) node.dispose();

const key = (x, y, z) => `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
const buffer = doc.getRoot().listBuffers()[0];

function rebuild(prim, matrix) {
  const p = Float32Array.from(prim.getAttribute('POSITION').getArray());
  if (matrix) {
    const m = matrix; // column-major 4x4
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
      p[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
  }
  const count = p.length / 3;
  const source = prim.getIndices() ? prim.getIndices().getArray() : Uint32Array.from({ length: count }, (_, i) => i);

  // 2. weld by position
  const ids = new Map();
  const points = [];
  const id = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const k = key(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    if (!ids.has(k)) { ids.set(k, points.length); points.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]); }
    id[i] = ids.get(k);
  }
  // 1. one triangle per set of three points
  const tris = [];
  const seen = new Set();
  for (let t = 0; t < source.length; t += 3) {
    const tri = [id[source[t]], id[source[t + 1]], id[source[t + 2]]];
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue;
    const k = [...tri].sort((a, b) => a - b).join(',');
    if (!seen.has(k)) { seen.add(k); tris.push(tri); }
  }

  // 3. consistent orientation: two triangles agree when they run along their shared edge
  // in opposite directions
  const edges = new Map();
  tris.forEach((tri, t) => {
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(t);
    }
  });
  const direction = (tri, a, b) => { // +1 if the triangle runs a -> b, -1 if b -> a
    for (let e = 0; e < 3; e++) if (tri[e] === a && tri[(e + 1) % 3] === b) return 1;
    return -1;
  };
  const centre = [0, 1, 2].map((axis) => (Math.min(...points.map((q) => q[axis])) + Math.max(...points.map((q) => q[axis]))) / 2);
  const faceNormal = (tri) => {
    const [a, b, c] = tri.map((i) => points[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  };
  const visited = new Uint8Array(tris.length);
  for (let start = 0; start < tris.length; start++) {
    if (visited[start]) continue;
    const piece = [start];
    visited[start] = 1;
    for (let head = 0; head < piece.length; head++) {
      const t = piece[head];
      for (let e = 0; e < 3; e++) {
        const a = tris[t][e], b = tris[t][(e + 1) % 3];
        const pair = edges.get(a < b ? `${a},${b}` : `${b},${a}`);
        if (pair.length !== 2) continue; // an open edge, or a junction of several sheets
        const other = pair[0] === t ? pair[1] : pair[0];
        if (visited[other]) continue;
        if (direction(tris[other], a, b) === 1) tris[other].reverse();
        visited[other] = 1;
        piece.push(other);
      }
    }
    // face the whole piece away from the middle of the part
    let facing = 0;
    for (const t of piece) {
      const f = faceNormal(tris[t]);
      const mid = [0, 1, 2].map((k) => (points[tris[t][0]][k] + points[tris[t][1]][k] + points[tris[t][2]][k]) / 3 - centre[k]);
      facing += f[0] * mid[0] + f[1] * mid[1] + f[2] * mid[2];
    }
    if (facing < 0) for (const t of piece) tris[t].reverse();
  }

  // 4. corners become vertices: same point and similar facing share one
  const clusters = points.map(() => []);
  const verts = [];
  const index = [];
  for (const tri of tris) {
    const f = faceNormal(tri);
    const len = Math.hypot(f[0], f[1], f[2]) || 1;
    const unit = [f[0] / len, f[1] / len, f[2] / len];
    for (const point of tri) {
      let found = null;
      for (const c of clusters[point]) {
        const cl = Math.hypot(c.sum[0], c.sum[1], c.sum[2]) || 1;
        if ((c.sum[0] * unit[0] + c.sum[1] * unit[1] + c.sum[2] * unit[2]) / cl > 0.5) { found = c; break; }
      }
      if (!found) {
        found = { id: verts.length, point, sum: [0, 0, 0] };
        verts.push(found);
        clusters[point].push(found);
      }
      for (let k = 0; k < 3; k++) found.sum[k] += f[k]; // weighted by the triangle's area
      index.push(found.id);
    }
  }
  const pos = new Float32Array(verts.length * 3);
  const nor = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    pos.set(points[v.point], i * 3);
    const len = Math.hypot(v.sum[0], v.sum[1], v.sum[2]) || 1;
    nor.set([v.sum[0] / len, v.sum[1] / len, v.sum[2] / len], i * 3);
  });
  for (const name of prim.listSemantics()) prim.setAttribute(name, null);
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(index)).setBuffer(buffer));
}

const done = new Set();
const placements = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const matrix = bake ? node.getWorldMatrix() : null;
  for (const prim of mesh.listPrimitives()) if (!done.has(prim)) { done.add(prim); rebuild(prim, matrix); }
  if (bake) placements.push(node);
}
if (bake) {
  // every part now sits in the scene's own frame, so flatten the hierarchy and clear the placements
  const scene = doc.getRoot().listScenes()[0];
  for (const node of placements) {
    scene.addChild(node);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
}

const count = () => {
  const rows = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    rows[node.getName()] = (rows[node.getName()] || 0) + mesh.listPrimitives().reduce((k, q) => k + q.getIndices().getCount() / 3, 0);
  }
  return rows;
};
const before = count();
await MeshoptSimplifier.ready;
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }), prune());
const after = count();
let a = 0, b = 0;
for (const name of Object.keys(before)) { a += before[name]; b += after[name] || 0; }
console.log(Object.keys(before).map((name) => `${name} ${before[name]}->${after[name]}`).join(', '));
console.log(out, 'triangles', a, '->', b);
await io.write(out, doc);
