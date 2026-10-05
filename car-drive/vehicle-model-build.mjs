// Turns a downloaded vehicle model into a small, flat GLB the game can embed.
//   node vehicle-build.mjs bus|truck <in.glb> <out.glb>
//
// Every part is baked into one frame: metres, y up, facing +z with its left toward +x,
// wheels on the ground at y = 0 and the body centred on the origin. Each part keeps its
// own node, named "role|original name", where the role says what the game does with it
// (a wheel to spin or steer, a door to swing, a lamp to light). Only the colour textures
// are kept (the game lights its vehicles with plain materials), shrunk and re-encoded.
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, transformMesh } from '@gltf-transform/functions';
import sharp from 'sharp';

const CONFIG = {
  // "Generic Town Bus" by own.guest (CC BY 4.0), Sketchfab 14fe03d792914d51b6c6250b393c44fd
  bus: {
    turn: -Math.PI / 2, // it faces +x
    length: 11.0,
    roles: (node) => {
      if (node === 'Object_10') return 'wheel_fr';
      if (node === 'Object_11') return 'wheel_fl';
      if (/^Object_1[2-5]$/.test(node)) return 'wheel_r';
      if (node === 'Object_30') return 'lamp_tail';
      return 'part';
    },
    size: () => 512,
    recolourBlue: true, // the wheel rims come painted bright blue
  },
  // "Truck DAF CF 75.310" (CC BY 4.0), Sketchfab 2f2ced3e54f24b4f8bee695e3261bd30
  truck: {
    turn: 0, // already faces +z
    scale: 0.73, // modelled about 1.37 times life size
    roles: (node) => {
      if (['Jante_2_Jante_0', 'Pneu_2_Pneu_0'].includes(node)) return 'wheel_fr';
      if (['Jante_3_Jante_0', 'Pneu_3_Pneu_0'].includes(node)) return 'wheel_fl';
      if (['Pneu_1_Pneu_0', 'Pneu_Pneu_0', 'Jante_Jante 2_0'].includes(node)) return 'wheel_r';
      if (node.startsWith('Porti')) return 'door_l';
      if (node.startsWith('Porte_avant_droite')) return 'door_r';
      if (node === 'Phare_Phare_0') return 'lamps';
      if (node === 'Cordon_Cordon_0') return 'drop'; // cables behind the cab: out of sight, 10,000 triangles
      return 'part';
    },
    // the cab's paintwork and the lamps keep a sharp picture; the rest is plenty at 512
    size: (material) => (['Cr_Exterieur', 'Phare'].includes(material) ? 1024 : 512),
  },
};

const [kind, input, output] = process.argv.slice(2);
const config = CONFIG[kind];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
for (const animation of root.listAnimations()) animation.dispose(); // its doors and wipers move by the game's hand

// 4 x 4 column-major helpers
const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const turnY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
const scaleBy = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const moveBy = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// every node with a mesh, and where it sits in the world
const parts = [];
const visit = (node) => {
  if (node.getMesh()) parts.push({ node, world: node.getWorldMatrix() });
  node.listChildren().forEach(visit);
};
scene.listChildren().forEach(visit);

// turned to face +z, then measured, to find the scale and the shift that put it on the ground
const turn = turnY(config.turn);
const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
for (const { node, world } of parts) {
  const m = multiply(turn, world);
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) {
      const p = apply(m, pos.getElement(i, []));
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
  }
}
const s = config.scale || config.length / (hi[2] - lo[2]);
const frame = multiply(moveBy(-(lo[0] + hi[0]) / 2 * s, -lo[1] * s, -(lo[2] + hi[2]) / 2 * s), multiply(scaleBy(s), turn));
console.log(kind, 'scale', s.toFixed(4), 'size', ((hi[0] - lo[0]) * s).toFixed(2), ((hi[1] - lo[1]) * s).toFixed(2), ((hi[2] - lo[2]) * s).toFixed(2));

// bake each part into that frame, as its own node straight under the scene
const roles = {};
const meshUse = new Map();
for (const { node } of parts) meshUse.set(node.getMesh(), (meshUse.get(node.getMesh()) || 0) + 1);
for (const { node, world } of parts) {
  let mesh = node.getMesh();
  if (meshUse.get(mesh) > 1) mesh = mesh.clone(); // shared: this copy is placed on its own
  transformMesh(mesh, multiply(frame, world));
  const role = config.roles(node.getName());
  roles[role] = (roles[role] || 0) + 1;
  if (role === 'drop') continue;
  scene.addChild(doc.createNode(`${role}|${node.getName()}`).setMesh(mesh));
}
for (const node of root.listNodes()) if (!node.getName().includes('|')) node.dispose();
console.log('roles', JSON.stringify(roles));

// no tangents (there are no normal maps now), and 16-bit indices wherever they fit
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const semantic of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(semantic)) prim.setAttribute(semantic, null);
    const indices = prim.getIndices();
    if (indices && prim.getAttribute('POSITION').getCount() < 65536 && !(indices.getArray() instanceof Uint16Array)) {
      indices.setArray(Uint16Array.from(indices.getArray()));
    }
  }
}

// colour only; smaller pictures; JPEG unless the material needs the alpha
for (const material of root.listMaterials()) {
  material.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
}
await doc.transform(prune(), dedup());
for (const texture of root.listTextures()) {
  const users = texture.listParents().filter((p) => p.propertyType === 'Material');
  const name = users[0] ? users[0].getName() : '';
  const alpha = users.some((m) => m.getAlphaMode() !== 'OPAQUE');
  const size = config.size(name);
  let image = sharp(Buffer.from(texture.getImage())).ensureAlpha();
  if (config.recolourBlue && !alpha) {
    // bright blue rims and bands to steel grey
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (b > r + 40 && b > g + 10) {
        const grey = Math.min(235, 0.45 * (r + g + b) / 3 + 0.55 * b * 0.78);
        data[i] = data[i + 1] = data[i + 2] = grey;
      }
    }
    image = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }
  image = image.resize(size, size, { fit: 'inside', withoutEnlargement: true });
  const out = alpha
    ? await image.png({ compressionLevel: 9 }).toBuffer()
    : await image.removeAlpha().jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  texture.setImage(new Uint8Array(out)).setMimeType(alpha ? 'image/png' : 'image/jpeg').setURI('');
}
await doc.transform(prune());
await io.write(output, doc);
const fs = await import('fs');
console.log('wrote', output, (fs.statSync(output).size / 1024 / 1024).toFixed(2), 'MB');
