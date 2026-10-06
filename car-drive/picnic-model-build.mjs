// Turns the downloaded picnic models (camper, tools, camp kit, jungle plants, animals, bow)
// into small GLBs the game can embed, then writes them all into picnic-models.js.
//   node picnic-build.mjs <source dir> <out dir> [only]
//
// Every model ends up in metres with y up, facing +z, its left toward +x. A prop is baked
// into one frame and split into named parts (one node each, every part's own origin at its
// foot and middle); a rigged animal keeps its skeleton and clips under a node that scales
// and turns it. Only colour pictures are kept, shrunk and re-encoded.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, transformMesh, simplify, weld, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const [srcDir, outDir, only] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

// --- 4 x 4 column-major helpers ---
const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const turnY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
const turnX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
const turnZ = (a) => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const scaleBy = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const moveBy = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const IDENTITY = moveBy(0, 0, 0);

// Bounds of a list of { node, world } parts seen through matrix m.
function measure(parts, m) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const { node, world } of parts) {
    const mw = multiply(m, world);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i++) {
        const p = apply(mw, pos.getElement(i, []));
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      }
    }
  }
  return { lo, hi, size: [0, 1, 2].map((k) => hi[k] - lo[k]) };
}

function meshNodes(scene) {
  const parts = [];
  const visit = (node) => {
    if (node.getMesh() && !node.getSkin()) parts.push({ node, world: node.getWorldMatrix() });
    node.listChildren().forEach(visit);
  };
  scene.listChildren().forEach(visit);
  return parts;
}

// --- pictures ---

// Spreads each UV island's colours a few texels out over the unused background, so the
// filtering at an island's edge does not pull in the background (the white seams on scans).
async function bleed(image, doc, size) {
  const { data, info } = await sharp(Buffer.from(image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const used = new Uint8Array(W * H);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) continue;
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : uv.getCount();
      const at = (i) => { const t = uv.getElement(idx ? idx.getScalar(i) : i, []); return [t[0] * W, t[1] * H]; };
      for (let t = 0; t < count; t += 3) {
        const [a, b, c] = [at(t), at(t + 1), at(t + 2)];
        const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])) - 1);
        const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])) + 1);
        const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])) - 1);
        const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])) + 1);
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(area) < 1e-9) continue;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
            const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 >= 0 && w1 >= 0 && w2 >= 0) used[y * W + x] = 1;
          }
        }
      }
    }
  }
  // the scan's seams are near-white lines along the islands' edges: count those as unused too
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4] > 232 && data[i * 4 + 1] > 232 && data[i * 4 + 2] > 232) used[i] = 0;
  }
  // grow the used area outward, ring by ring, each new texel the average of its used neighbours
  for (let ring = 0; ring < 12; ring++) {
    const grown = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (used[y * W + x]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !used[ny * W + nx]) continue;
            const k = (ny * W + nx) * 4;
            r += data[k]; g += data[k + 1]; b += data[k + 2]; n++;
          }
        }
        if (n) grown.push([y * W + x, r / n, g / n, b / n]);
      }
    }
    for (const [i, r, g, b] of grown) {
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b;
      used[i] = 1;
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).resize(size, size, { fit: 'inside', withoutEnlargement: true });
}

// Colour only; each picture shrunk to `size` (or what sizeOf says for its material); JPEG
// unless the material cuts out by alpha. `recolour(r, g, b)` may return a new colour.
async function shrinkTextures(doc, cfg) {
  const root = doc.getRoot();
  for (const material of root.listMaterials()) {
    material.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null)
      .setMetallicFactor(0).setRoughnessFactor(0.85).setEmissiveFactor([0, 0, 0]);
  }
  await doc.transform(prune());
  for (const texture of root.listTextures()) {
    const users = texture.listParents().filter((p) => p.propertyType === 'Material');
    const alpha = users.some((m) => m.getAlphaMode() !== 'OPAQUE');
    const size = cfg.sizeOf ? cfg.sizeOf(users[0] ? users[0].getName() : '') : cfg.tex || 512;
    let image = cfg.bleed ? await bleed(texture.getImage(), doc, size) : sharp(Buffer.from(texture.getImage())).ensureAlpha();
    if (cfg.recolour) {
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 4) {
        const c = cfg.recolour(data[i], data[i + 1], data[i + 2]);
        if (c) [data[i], data[i + 1], data[i + 2]] = c;
      }
      image = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
    }
    image = image.resize(size, size, { fit: 'inside', withoutEnlargement: true });
    const out = alpha
      ? await image.png({ compressionLevel: 9, palette: cfg.palette !== false, quality: 90 }).toBuffer()
      : await image.removeAlpha().jpeg({ quality: cfg.quality || 82, mozjpeg: true }).toBuffer();
    texture.setImage(new Uint8Array(out)).setMimeType(alpha ? 'image/png' : 'image/jpeg').setURI('');
  }
}

function tidyAttributes(doc, keep = ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) if (!keep.includes(semantic)) prim.setAttribute(semantic, null);
      const indices = prim.getIndices();
      if (indices && prim.getAttribute('POSITION').getCount() < 65536 && !(indices.getArray() instanceof Uint16Array)) {
        indices.setArray(Uint16Array.from(indices.getArray()));
      }
    }
  }
}

// --- props ---

// cfg: { file, turn (about y), tilt ([x, z] turns first), parts: { name: { match, size: ['x'|'y'|'z'|'max', metres] } },
//        packScale (one scale for every part, from part `ref`), simplify: ratio, keepMaterial }
async function buildProp(name, cfg) {
  const doc = await io.read(path.join(srcDir, cfg.file));
  const root = doc.getRoot();
  for (const animation of root.listAnimations()) animation.dispose();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const all = meshNodes(scene);
  let frame = IDENTITY;
  if (cfg.tilt) frame = multiply(turnZ(cfg.tilt[1] || 0), turnX(cfg.tilt[0] || 0));
  frame = multiply(turnY(cfg.turn || 0), frame);
  const partsCfg = cfg.parts || { [name]: { match: /.*/, size: cfg.size } };
  const axis = { x: 0, y: 1, z: 2 };
  const scaleFor = (bounds, size) => (size[0] === 'max' ? size[1] / Math.max(...bounds.size) : size[1] / bounds.size[axis[size[0]]]);
  let packScale = null;
  if (cfg.packRef) {
    const [refName, size] = cfg.packRef;
    const rc = partsCfg[refName];
    const ref = all.filter(({ node }) => rc.match.test(node.getName()) && !(rc.skip && rc.skip.test(node.getName())));
    packScale = scaleFor(measure(ref, frame), size);
  }
  const report = [];
  const claimed = new Set();
  for (const [partName, pc] of Object.entries(partsCfg)) {
    const mine = all.filter((p) => !claimed.has(p.node) && pc.match.test(p.node.getName()) && !(pc.skip && pc.skip.test(p.node.getName())));
    for (const p of mine) claimed.add(p.node);
    if (!mine.length) { report.push(`${partName}: NOTHING MATCHED`); continue; }
    const b = measure(mine, frame);
    const s = pc.own ? scaleFor(b, pc.size) : packScale || scaleFor(b, pc.size || cfg.size);
    // foot on y = 0, middle over the origin (or the pivot given in the part's own units)
    const place = moveBy(-(b.lo[0] + b.hi[0]) / 2 * s, -b.lo[1] * s, -(b.lo[2] + b.hi[2]) / 2 * s);
    const m = multiply(place, multiply(scaleBy(s), frame));
    const node = doc.createNode(partName);
    scene.addChild(node);
    const meshUse = new Map();
    for (const { node: n } of mine) meshUse.set(n.getMesh(), (meshUse.get(n.getMesh()) || 0) + 1);
    for (const { node: n, world } of mine) {
      let mesh = n.getMesh();
      if (meshUse.get(mesh) > 1 || mesh.listParents().filter((p) => p.propertyType === 'Node').length > 1) mesh = mesh.clone();
      transformMesh(mesh, multiply(m, world));
      node.addChild(doc.createNode(`${partName}.${n.getName()}`).setMesh(mesh));
    }
    report.push(`${partName}: ${b.size.map((v) => (v * s).toFixed(2)).join(' x ')} m`);
  }
  for (const node of root.listNodes()) {
    const n = node.getName();
    if (!(n in partsCfg) && !Object.keys(partsCfg).some((p) => n.startsWith(`${p}.`))) node.dispose();
  }
  for (const node of root.listNodes()) if (!node.getParentNode() && !(node.getName() in partsCfg)) node.dispose();
  tidyAttributes(doc, cfg.colours ? ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'] : undefined);
  await doc.transform(prune(), dedup());
  if (cfg.simplify) {
    await doc.transform(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: cfg.simplify, error: cfg.error || 0.002 }));
  }
  if (cfg.drop) for (const m of root.listMaterials()) if (cfg.drop.test(m.getName())) m.dispose();
  if (cfg.thin) report.push(thinLeaves(doc, cfg.thin[0], cfg.thin[1], cfg.thin[2]));
  await shrinkTextures(doc, cfg);
  await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  return { doc, report };
}

// Leaves are many small separate cards: keep about `keep` of them, each grown about its own
// middle so the crown stays as full (the triangle count is what costs, not the leaf area).
function thinLeaves(doc, materialTest, keep, grow) {
  let before = 0;
  let after = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (!prim.getMaterial() || !materialTest.test(prim.getMaterial().getName())) continue;
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const src = idx.getArray();
      // pieces: triangles joined by shared corners
      const parent = new Int32Array(pos.getCount()).map((_, i) => i);
      const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (let t = 0; t < src.length; t += 3) {
        const a = find(src[t]);
        for (const k of [1, 2]) { const b = find(src[t + k]); if (a !== b) parent[b] = a; }
      }
      const pieces = new Map();
      for (let t = 0; t < src.length; t += 3) {
        const r = find(src[t]);
        if (!pieces.has(r)) pieces.set(r, []);
        pieces.get(r).push(t);
      }
      const kept = [];
      const arr = pos.getArray().slice();
      let n = 0;
      for (const [, tris] of pieces) {
        n++;
        if (hash(n, 7.1, tris.length) > keep) continue;
        const verts = new Set();
        for (const t of tris) for (let k = 0; k < 3; k++) verts.add(src[t + k]);
        const c = [0, 0, 0];
        for (const v of verts) for (let k = 0; k < 3; k++) c[k] += arr[v * 3 + k] / verts.size;
        for (const v of verts) for (let k = 0; k < 3; k++) arr[v * 3 + k] = c[k] + (arr[v * 3 + k] - c[k]) * grow;
        for (const t of tris) kept.push(src[t], src[t + 1], src[t + 2]);
      }
      before += src.length / 3;
      after += kept.length / 3;
      pos.setArray(arr);
      idx.setArray(src.constructor.from(kept));
    }
  }
  return `leaves ${before} -> ${after} triangles`;
}

// --- the camper: a photo scan in one piece; its wheels are cut out so they can turn ---

async function buildCamper(cfg) {
  const doc = await io.read(path.join(srcDir, cfg.file));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const parts = meshNodes(scene);
  let b = measure(parts, IDENTITY);
  // which end is the cab: the lower one
  const tops = [0, 0];
  for (const { node, world } of parts) {
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i++) {
        const p = apply(world, pos.getElement(i, []));
        const t = (p[2] - b.lo[2]) / b.size[2];
        if (t < 0.08) tops[0] = Math.max(tops[0], p[1]);
        if (t > 0.92) tops[1] = Math.max(tops[1], p[1]);
      }
    }
  }
  const turn = tops[1] < tops[0] ? 0 : Math.PI; // cab toward +z
  const t = turnY(turn);
  b = measure(parts, t);
  const s = cfg.length / b.size[2];
  const frame = multiply(moveBy(-(b.lo[0] + b.hi[0]) / 2 * s, -b.lo[1] * s, -(b.lo[2] + b.hi[2]) / 2 * s), multiply(scaleBy(s), t));
  for (const { node, world } of parts) transformMesh(node.getMesh(), multiply(frame, world));
  const size = b.size.map((v) => v * s);
  // the wheels: triangles inside each wheel's disc, on the outer part of the body's width
  const wheelParts = {};
  if (cfg.wheels) {
    for (const { node } of parts) {
      for (const prim of node.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        const src = idx.getArray();
        const keep = [];
        const pieces = { wheel_fl: [], wheel_fr: [], wheel_r: [] };
        for (let k = 0; k < src.length; k += 3) {
          const c = [0, 1, 2].map((j) => (pos.getElement(src[k], [])[j] + pos.getElement(src[k + 1], [])[j] + pos.getElement(src[k + 2], [])[j]) / 3);
          let role = null;
          for (const w of cfg.wheels) {
            if (Math.hypot(c[1] - w.y, c[2] - w.z) < w.r && Math.abs(c[0]) > w.inner) {
              role = w.z > 0 ? (c[0] > 0 ? 'wheel_fl' : 'wheel_fr') : 'wheel_r';
            }
          }
          if (role) pieces[role].push(src[k], src[k + 1], src[k + 2]);
          else keep.push(src[k], src[k + 1], src[k + 2]);
        }
        idx.setArray(new Uint32Array(keep));
        for (const [role, list] of Object.entries(pieces)) {
          if (!list.length) continue;
          const copy = prim.clone();
          copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)));
          if (!wheelParts[role]) wheelParts[role] = doc.createMesh(role);
          wheelParts[role].addPrimitive(copy);
        }
      }
    }
  }
  for (const { node } of parts) node.setName('part|body');
  // flatten: every part straight under the scene with no transform of its own
  for (const { node } of parts) {
    node.setMatrix(IDENTITY);
    scene.addChild(node);
  }
  for (const [role, mesh] of Object.entries(wheelParts)) scene.addChild(doc.createNode(`${role}|${role}`).setMesh(mesh));
  for (const node of root.listNodes()) if (!node.getName().includes('|')) node.dispose();
  tidyAttributes(doc);
  await doc.transform(prune(), dedup());
  if (cfg.simplify) await doc.transform(weld({ tolerance: 0.00001 }), simplify({ simplifier: MeshoptSimplifier, ratio: cfg.simplify, error: 0.0008, lockBorder: true }));
  await shrinkTextures(doc, cfg);
  await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  return { doc, report: [`size ${size.map((v) => v.toFixed(2)).join(' x ')} m, ${turn ? 'turned' : 'as is'}`, Object.keys(wheelParts).join(' ')] };
}

// --- animals: the rig and its clips kept; a new root scales and turns them ---

// cfg: { file, scale, turn, clips: { newName: oldName }, simplify, still: [bone names whose
//        translation is dropped in the clips, for running on the spot], colour(p, n) -> [r, g, b] }
async function buildAnimal(name, cfg) {
  const doc = await io.read(path.join(srcDir, cfg.file));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const top = doc.createNode(name).setScale([cfg.scale, cfg.scale, cfg.scale]).setRotation([0, Math.sin((cfg.turn || 0) / 2), 0, Math.cos((cfg.turn || 0) / 2)]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    top.addChild(child);
  }
  scene.addChild(top);
  // the clips: renamed, the unwanted dropped, root motion taken out
  for (const animation of root.listAnimations()) {
    const rename = Object.entries(cfg.clips || {}).find(([, old]) => old === animation.getName());
    if (!rename) { animation.dispose(); continue; }
    animation.setName(rename[0]);
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode();
      if (!target) continue;
      if (channel.getTargetPath() === 'translation' && (cfg.still || []).includes(target.getName())) {
        // keep the bob (y) and drop the travel (x, z): the game moves the animal itself
        const out = channel.getSampler().getOutput();
        const arr = out.getArray().slice();
        const x0 = arr[0];
        const z0 = arr[2];
        for (let i = 0; i < arr.length; i += 3) { arr[i] = x0; arr[i + 2] = z0; }
        out.setArray(arr);
      }
      if (channel.getTargetPath() === 'scale') channel.dispose();
    }
  }
  if (cfg.dropNodes) {
    for (const node of root.listNodes()) if (node.getMesh() && cfg.dropNodes.test(node.getName())) node.setMesh(null);
  }
  const keep = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
  if (cfg.colour) keep.push('COLOR_0');
  if (cfg.colour) paintCoat(doc, cfg.colour);
  tidyAttributes(doc, keep);
  await doc.transform(prune(), dedup());
  if (cfg.simplify) await doc.transform(weld({ tolerance: 0.00001 }), simplify({ simplifier: MeshoptSimplifier, ratio: cfg.simplify, error: 0.001 }));
  await shrinkTextures(doc, cfg);
  await doc.transform(prune());
  const clips = root.listAnimations().map((a) => a.getName());
  return { doc, report: [`clips ${clips.join(' ')}`, `${root.listSkins()[0].listJoints().length} joints`] };
}

// Vertex colours for an untextured animal, worked out from where each vertex sits on the
// body at rest (in the mesh's own units) and which way it faces.
function paintCoat(doc, colour) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const nor = prim.getAttribute('NORMAL');
      const material = prim.getMaterial() ? prim.getMaterial().getName() : '';
      const out = new Float32Array(pos.getCount() * 4);
      for (let i = 0; i < pos.getCount(); i++) {
        const c = colour(pos.getElement(i, []), nor ? nor.getElement(i, []) : [0, 1, 0], material);
        out.set([c[0], c[1], c[2], 1], i * 4);
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(out).setBuffer(pos.getBuffer()));
      if (prim.getMaterial()) prim.getMaterial().setBaseColorFactor([1, 1, 1, 1]);
    }
  }
}

// --- what to build ---

const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
const srgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
// soft value noise, for patches in a coat
const noise = (x, y, z) => {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const tx = x - fx, ty = y - fy, tz = z - fz;
  const sm = (t) => t * t * (3 - 2 * t);
  let v = 0;
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++) {
    v += hash(fx + dx, fy + dy, fz + dz) * (dx ? sm(tx) : 1 - sm(tx)) * (dy ? sm(ty) : 1 - sm(ty)) * (dz ? sm(tz) : 1 - sm(tz));
  }
  return v;
};

const PROPS = {
  hammer: { file: 'props/hammer.glb', size: ['max', 0.34] },
  axe: {
    file: 'props/axe.glb',
    parts: {
      axe: { match: /^Cylinder003/, size: ['max', 0.74] },
      stump: { match: /^Object003/, size: ['y', 0.42] },
    },
  },
  screwdriver: { file: 'props/tools.glb', size: ['max', 0.24] },
  torch: { file: 'props/flash2.glb', size: ['max', 0.21] },
  jerrycan: { file: 'props/jerry2.glb', size: ['y', 0.47] },
  stove: { file: 'props/stove.glb', size: ['y', 0.26], simplify: 0.2 },
  pots: {
    file: 'props/pots.glb', simplify: 0.45,
    packRef: ['pot', ['x', 0.24]],
    parts: { pan: { match: /^pan/ }, boiler: { match: /^Boiler/ }, pot: { match: /^pot/ }, kettle: { match: /^Kettle/ } },
  },
  knife: {
    file: 'props/knife.glb', packRef: ['knife', ['max', 0.27]],
    parts: { knife: { match: /^LP_(Blade|Guard|Handle|Screw)/ }, sheath: { match: /Leather|polySurface3/ } },
  },
  tent: {
    file: 'props/tent.glb',
    packRef: ['tent', ['x', 3.1]],
    parts: { tent: { match: /^(osnova|shtora)/, skip: /balki/ } },
  },
  lantern: { file: 'props/lantern.glb', size: ['y', 0.32], simplify: 0.25 },
  campfire: {
    file: 'props/campfire.glb', simplify: 0.4,
    packRef: ['ring', ['x', 1.05]],
    parts: {
      ring: { match: /^rock/ },
      tripod: { match: /^(wooden logs|wooden_log_top|ropes|kauchi)/ },
      kettle: { match: /^kettle/ },
      embers: { match: /^(burnt|nashshiri)/ },
    },
  },
  logpile: { file: 'props/logs.glb', size: ['x', 1.9] },
  rocks: {
    file: 'props/stones.glb', simplify: 0.12, error: 0.004,
    parts: {
      boulder: { match: /^BIG_1/, size: ['max', 1.9] },
      rock: { match: /^Big_3/, size: ['max', 1.2] },
      slab: { match: /^Mid_5/, size: ['max', 0.8] },
      stone: { match: /^Small_8/, size: ['max', 0.3] },
    },
  },
  fern: {
    file: 'props/fern.glb', size: ['x', 1.15],
    // red-brown fronds to a deep green
    recolour: (r, g, b) => {
      const l = (r + g + b) / 3;
      if (r > g + 20) return [l * 0.3, Math.min(255, l * 0.62 + 10), l * 0.2];
      return null;
    },
  },
  foliage: {
    file: 'props/foliage.glb',
    parts: {
      fernA: { match: /^SM_Fern_01/, size: ['max', 1.2] },
      fernB: { match: /^SM_Fern_02/, size: ['max', 1.3] },
      grassA: { match: /^SM_Grass_0[15]/, size: ['y', 0.75] },
      grassB: { match: /^SM_Grass_0[26]/, size: ['y', 0.7] },
      grassC: { match: /^SM_Grass_03/, size: ['y', 0.65] },
      deadbush: { match: /^SM_DeadBush_01/, size: ['max', 1.2] },
    },
  },
  banana: { file: 'props/banana.glb', size: ['y', 3.4] },
  palm: { file: 'props/palm.glb', size: ['y', 10.5], simplify: 0.5, tex: 1024, thin: [/Tree_4Mat/, 0.5, 1.3] },
  jungletree: { file: 'props/jungletree.glb', size: ['y', 21], simplify: 0.55, tex: 1024, thin: [/Leaves/, 0.4, 1.45] },
  monstera: { file: 'props/tropical.glb', size: ['y', 1.25] },
  mango: { file: 'props/mango.glb', size: ['max', 0.13], simplify: 0.4, tex: 256 },
  bananas: { file: 'props/bananafruit.glb', size: ['max', 0.19], tex: 256 },
  bolts: { file: 'props/nuts.glb', size: ['max', 0.1], simplify: 0.15, tex: 256 },
  firewood: { file: 'props/firewood.glb', size: ['max', 1.2], simplify: 0.12 },
  bow: {
    file: 'bow1.glb', turn: -Math.PI / 2, simplify: 0.2,
    packRef: ['bow', ['y', 1.62]],
    parts: {
      bow: { match: /^Object_(4|6|8|12|14|16|18|20|22|29|31|33|34|35|36|38|40|42|44)$/ },
      arrow: { match: /^Object_(24|25|26|27)$/, own: true, size: ['z', 0.8] },
    },
  },
};

const CAMPER = {
  file: 'rvscan.glb', length: 6.99, tex: 1024, bleed: true, quality: 86, simplify: 0.36,
  wheels: null, // set below once the wheels have been found
};

const ANIMALS = {
  // "Running Tiger", rigged 3ds Max biped; the run on the spot
  tiger: { file: 'tigerrun.glb', scale: 0.0098, clips: { run: 'Run' }, still: ['Bip01'], tex: 1024 },
  // "Bear": a Rigify rig, its only clip a roar
  bear: { file: 'bear.glb', scale: 0.0117, clips: { roar: 'metarig|metarigAction' }, tex: 1024 },
  // "Deer": idle, walk and run, untextured, so its coat is painted on here
  deer: {
    file: 'deer3.glb', scale: 0.72, simplify: 0.2, clips: { idle: 'Idle', walk: 'Walk', run: 'Run' }, still: ['_rootJoint', 'pelvis_01', 'root1_017'],
    dropNodes: /^(pCube|polySurface(17|19|20|21)|Object_122)/, // the teeth, gums and tongue, out of sight inside the mouth
    colour: ([x, y, z], [nx, ny, nz], material) => {
      if (/jiao/.test(material)) return mix(srgb(0x4a3a2a), srgb(0xcfc2a4), (y - 2.4) / 1.3); // antlers, pale at the tips
      if (/eye/.test(material)) return srgb(0x0d0b09);
      if (/kouqiang|yandi/.test(material)) return srgb(0x3a2422);
      const back = srgb(0x4d3b2b);
      const flank = srgb(0x6e5641);
      const belly = srgb(0xbfae92);
      const dark = srgb(0x2b2119);
      const f = noise(x * 9, y * 9, z * 9) * 0.5 + noise(x * 31, y * 31, z * 31) * 0.5; // patches, then the grain of the hair
      let c = mix(back, flank, 0.5 + 0.8 * (1 - ny) * 0.5 + (f - 0.5) * 0.5);
      // pale underneath: belly, inside the legs, throat
      const under = Math.max(0, -ny) * (y > 0.9 && y < 1.6 ? 1 : 0.6);
      c = mix(c, belly, under * 1.4 - 0.15);
      if (z > 0.95 && y > 1.6 && y < 2.0 && ny < 0.2) c = mix(c, belly, 0.55); // the throat
      // the rump patch and tail
      if (z < -0.95 && y > 1.15) c = mix(c, belly, (-0.95 - z) * 5 * (1 - Math.abs(x) * 3));
      // darker down the spine and over the face; the lower legs and hooves darker still
      c = mix(c, dark, Math.max(0, ny) * Math.max(0, 1 - Math.abs(x) * 4) * 0.5);
      if (y < 0.8) c = mix(c, dark, (0.8 - y) * 1.1);
      if (z > 1.55 && y > 1.85) c = mix(c, dark, (z - 1.55) * 2.2); // muzzle
      const grain = 0.88 + 0.24 * hash(x * 400, y * 400, z * 400);
      return c.map((v) => Math.min(1, v * grain)); // the game shows colours as they are given
    },
  },
};

fs.mkdirSync(outDir, { recursive: true });
const want = (n) => !only || only.split(',').includes(n);
for (const [name, cfg] of Object.entries(PROPS)) {
  if (!want(name)) continue;
  const { doc, report } = await buildProp(name, cfg);
  await io.write(path.join(outDir, `${name}.glb`), doc);
  console.log(name, (fs.statSync(path.join(outDir, `${name}.glb`)).size / 1024).toFixed(0), 'KB |', report.join(' | '));
}
for (const [name, cfg] of Object.entries(ANIMALS)) {
  if (!want(name)) continue;
  const { doc, report } = await buildAnimal(name, cfg);
  await io.write(path.join(outDir, `${name}.glb`), doc);
  console.log(name, (fs.statSync(path.join(outDir, `${name}.glb`)).size / 1024).toFixed(0), 'KB |', report.join(' | '));
}
if (want('camper')) {
  const wheelsFile = path.join(outDir, 'camper-wheels.json');
  if (fs.existsSync(wheelsFile)) CAMPER.wheels = JSON.parse(fs.readFileSync(wheelsFile, 'utf8'));
  const { doc, report } = await buildCamper(CAMPER);
  await io.write(path.join(outDir, 'camper.glb'), doc);
  console.log('camper', (fs.statSync(path.join(outDir, 'camper.glb')).size / 1024).toFixed(0), 'KB |', report.join(' | '));
}

// --- everything into one script the game loads when picnic mode is first switched on ---
const CREDITS = [
  ['camper', 'RV Photo Scan', 'Eydeet', 'a051cd62b8aa480a93ed0aae845ce1d4'],
  ['tiger', 'Running Tiger', 'Amil (francescolima74)', 'fc2c7fd74dd04e39935803b884c77258'],
  ['bear', 'Bear', 'Nyilonelycompany', 'ce0d5eb86cf5459bb6bd20244cb44b27'],
  ['deer', 'Deer', 'TyDrawsAlot', '06598a376fb64c909a69dbfb9fe28d84'],
  ['bow', 'Recurve Bow', 'MrEliptik', '800fb9f4eb224cedb1c8e0b9847bd00c'],
  ['hammer', 'Hammer Game Ready', 're1monsen', 'eb371236ff14403dabb065506ac124eb'],
  ['axe', 'Ax with a Stump', 'Ruslan Malovsky', 'bee3645990e14378acaad55971296629'],
  ['screwdriver', 'DAE - Game Asset Tool Assignment', 'Martijn', '2824b14b7f964e3dbdd6d13b6690414c'],
  ['torch', 'Flashlight', 'MAR.COS.', '5fa9a65e7b0141ee877ed18f4f42d953'],
  ['jerrycan', 'Jerry Can - Game Ready PBR', 'Billy Jackman', '612cdbbed93242c0b158c01fe2b5ea34'],
  ['stove', 'Portable Gas Camping Stove', 'Coozy', '4737490cbb4845c48ce6643ac3ddba86'],
  ['pots', 'Camping Cooking Pots', 'Guy in a Poncho', '3cf2b0e0d285408f97e2a33d6f19ee1c'],
  ['knife', 'BUCK 120 General Knife', 'Kirilllucas', 'e854d824feb14900b6963729ae122f55'],
  ['tent', 'Tent', 'VENIKAMEN', '979c0784868b4fdeb2b4563f65e0b5b4'],
  ['lantern', 'Old Lantern', 'Cobernicus', '689919de1fb646fcb90d5285a365cbe9'],
  ['campfire', 'Campfire', 'Mandrake', '1f6834effb514d4c8a0fd34accb88251'],
  ['logpile', 'Log Pile (Game Ready / 2K PBR)', 'Meerschaum Digital', '3f4205a30a7d4adda50c775fb8cce06c'],
  ['rocks', 'Stone Pack', 'ashkan.fancy', 'f3e0a67b9ca243b09119177649f21e17'],
  ['fern', 'Realistic Beech Fern Plant', '3D Environment Artist Shop', 'adf1e8832cf74a8a94c98792fa1d9088'],
  ['foliage', 'Some Foliage', 'soidev', '5e806681504a4642a16a59c057d34e8d'],
  ['banana', 'Banana Plant', 'evolveduk', '85695b82c7ba4b3497a663616cc3bf25'],
  ['palm', 'Coconut Palm', 'evolveduk', '26e787f2ff2e4c0fb004c3b0210805a3'],
  ['jungletree', 'Jungle Tree', 'kobaltsecond', '46f83ec5f6c04abf9d509c1070f67d1e'],
  ['monstera', 'Tropical Plant', 'alint', '3ee280726f1f496e9b2377d43b4cbb2d'],
  ['mango', 'Mango', 'Meerschaum Digital', 'e5fd174d7a2e4ac894e3e69a4550d1e2'],
  ['bananas', 'Banana (Game Ready / 2K PBR)', 'Meerschaum Digital', '55180008229841a9a6af3a35528ccdc6'],
  ['bolts', 'Bolts and nuts', 'SAIRUS_creative', 'a7b0477b8d774449b30da896033c6060'],
  ['firewood', 'Firewood_HP', 'ta.holovan', 'b94b159be8c8480690a2ae40c8bd3a4a'],
];
if (process.env.PACK) {
  const lines = [
    '// The 3D models for picnic mode (the camper, the camp kit and tools, the jungle\'s plants, the',
    '// animals and the bow), base64-encoded so the game can load them when index.html is opened',
    '// straight from disk. The game adds this script only when picnic mode is first switched on.',
    '// Made by picnic-model-build.mjs from these models, all CC BY 4.0, from Sketchfab:',
    ...CREDITS.map(([, title, author, uid]) => `//   "${title}" by ${author}, https://sketchfab.com/3d-models/${uid}`),
    'window.PICNIC_MODELS = {',
    ...CREDITS.map(([name]) => `  ${name}: '${fs.readFileSync(path.join(outDir, `${name}.glb`)).toString('base64')}',`),
    '};',
    '',
  ];
  fs.writeFileSync(process.env.PACK, lines.join('\n'));
  console.log('wrote', process.env.PACK, (fs.statSync(process.env.PACK).size / 1024 / 1024).toFixed(1), 'MB');
}
