// The New Dawn: the plants. Thick jungle north of the cliffs and along the river, a thinner
// forest round the petrified people, open meadow in the clearing, scrub on Flint Rise.
//
// Tens of thousands of plants, so each kind is drawn two ways (as in Car Drive's jungle): the
// real model for those near the camera, rebuilt a few times a second from a grid of cells
// (only those roughly in view), and for big plants further off, a picture of the plant on
// two crossed cards, taken from the model itself. Undergrowth is only worked out, a square at
// a time, where you are.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, smoothstep, lerp, seeded, noise2, fbm2 } = D;
  const T = D.terrain;
  const L = D.LAYOUT;

  // ---------- Where each kind grows ----------

  // A density map (0..1 per channel) on a 4 m grid, worked out once from the land.
  const DX0 = -340;
  const DZ0 = -400;
  const DSTEP = 4;
  const DNX = 261; // (out to x = 700: the land beyond the eastern mountains, Chapter 3)
  const DNZ = 201;
  const CHANNELS = ['trees', 'palms', 'bananas', 'under', 'ferns', 'grass', 'rocks'];
  const density = {};
  const reserved = []; // [x, z, r]: kept clear (the statues, the Elder Tree, the den...)

  function inCave(x, z) {
    const M = D.CAVE.mass;
    const M2 = D.CAVE.galleries.mass; // Chapter 2's galleries
    return Math.hypot((x - M.x) / (M.rx + 3), (z - M.z) / (M.rz + 3)) < 1 || Math.hypot((x - D.CAVE.x) / 18, (z - 236) / 12) < 1
      || Math.hypot((x - M2.x) / (M2.rx + 3), (z - M2.z) / (M2.rz + 3)) < 1;
  }

  function computeDensity() {
    for (const c of CHANNELS) density[c] = new Float32Array(DNX * DNZ);
    for (let j = 0; j < DNZ; j++) {
      for (let i = 0; i < DNX; i++) {
        const x = DX0 + i * DSTEP;
        const z = DZ0 + j * DSTEP;
        const k = j * DNX + i;
        const h = T.height(x, z);
        const n = T.normal(x, z);
        const water = T.waterAt(x, z);
        if (water || inCave(x, z)) continue;
        const [wJ, wD, wM, wP, rocky] = T.surface(x, z, h);
        const jungle = T.jungleAmount(x, z);
        const mount = T.mountainous(x, z);
        const zone = T.zoneAt(x, z);
        const path = T.pathDistance(x, z);
        const flat = smoothstep(0.78, 0.9, n.y);
        const offPath = smoothstep(2.5, 6, path);
        const patch = fbm2(x * 0.02 + 7, z * 0.02 - 3, 3);
        const riverside = smoothstep(70, 20, Math.abs(x - T.riverX(z)) - T.riverHalf(z));
        const pastRiver = x < T.riverX(z) ? 1 : 0;
        // beyond the eastern mountains (Chapter 3): open grass, rocks, a few trees
        if (zone >= 11 && zone <= 14) {
          const open = (1 - smoothstep(0.3, 0.6, mount)) * smoothstep(0.72, 0.86, n.y);
          density.trees[k] = clamp((zone === 13 ? 0.05 + smoothstep(0.6, 0.78, patch) * 0.35 : zone === 14 ? 0.12 : 0.02) * open * offPath, 0, 1);
          density.palms[k] = 0;
          density.bananas[k] = 0;
          density.under[k] = clamp((zone === 14 ? 0.15 : 0.06) * open * offPath, 0, 1);
          density.ferns[k] = clamp(0.12 * patch * open, 0, 1);
          density.grass[k] = clamp(0.95 * open * smoothstep(1.2, 2.4, path) * (1 - rocky), 0, 1);
          density.rocks[k] = clamp(Math.max(rocky * 0.9, zone === 11 ? 0.3 : 0.1, smoothstep(0.85, 0.65, n.y) * 0.5) * smoothstep(1.5, 3, path), 0, 1);
          continue;
        }
        let trees = jungle * 0.95;
        if (zone === 2) trees = 0.32 + patch * 0.3;
        if (zone === 3) trees = 0.04 + smoothstep(0.62, 0.8, patch) * 0.4;
        if (zone === 5) trees = 0.06;
        if (zone === 4) trees = 0;
        if (zone === 1) trees = 0.05;
        trees = Math.max(trees, riverside * 0.7, pastRiver * 0.8);
        trees = lerp(trees, 0.35, smoothstep(0.1, 0.4, mount)) * (1 - smoothstep(0.5, 0.85, mount));
        trees *= flat * offPath * (1 - smoothstep(0.4, 0.8, rocky)) * (1 - wD * 0.7);
        density.trees[k] = clamp(trees, 0, 1);
        let palms = zone === 3 ? 0.35 : zone === 2 ? 0.08 : jungle * 0.2;
        palms = Math.max(palms, riverside * 0.55, pastRiver * 0.5);
        density.palms[k] = clamp(palms * flat * offPath * (1 - rocky) * (1 - smoothstep(0.1, 0.4, mount)), 0, 1);
        let bananas = (z < -20 ? jungle * 0.75 : 0) + riverside * 0.3 + (zone === 3 ? 0.03 : 0);
        density.bananas[k] = clamp(bananas * flat * offPath * (1 - rocky) * (1 - mount), 0, 1);
        let under = zone === 2 ? 0.5 : zone === 3 ? 0.12 : zone === 5 ? 0.1 : jungle;
        under = Math.max(under, riverside * 0.7, pastRiver);
        density.under[k] = clamp(under * smoothstep(0.7, 0.85, n.y) * smoothstep(1.5, 3.5, path) * (1 - rocky * 0.8) * (1 - wD * 0.8) * (1 - smoothstep(0.2, 0.6, mount)), 0, 1);
        density.ferns[k] = clamp(Math.max(density.under[k], (1 - jungle) * 0.3 * patch) * (1 - wD), 0, 1);
        const grassy = Math.max(0, 1 - wJ - wD - wM - wP);
        density.grass[k] = clamp(Math.max(grassy * (1 - jungle * 0.5), jungle * 0.4 * (1 - wD)) * smoothstep(0.75, 0.88, n.y) * smoothstep(1.2, 2.4, path) * (1 - rocky) * (1 - smoothstep(0.3, 0.6, mount)), 0, 1);
        density.rocks[k] = clamp(Math.max(rocky * 0.9, zone === 5 ? 0.45 : 0.06, smoothstep(0.85, 0.65, n.y) * 0.5) * smoothstep(1.5, 3, path) * (zone === 4 ? 0.3 : 1), 0, 1);
      }
    }
  }

  function densityAt(channel, x, z) {
    const gx = (x - DX0) / DSTEP;
    const gz = (z - DZ0) / DSTEP;
    if (gx < 0 || gz < 0 || gx >= DNX - 1 || gz >= DNZ - 1) return 0;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const d = density[channel];
    const a = d[j * DNX + i];
    const b = d[j * DNX + i + 1];
    const c = d[(j + 1) * DNX + i];
    const e = d[(j + 1) * DNX + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, e, fx), fz);
  }

  const isReserved = (x, z, extra = 0) => reserved.some(([rx, rz, r]) => (x - rx) ** 2 + (z - rz) ** 2 < (r + extra) ** 2);

  // ---------- Kinds ----------

  //   per: plants per hectare where the density is 1; near: metres within which the model is
  //   drawn (on High; less on the other presets); card: drawn as a picture out to the haze;
  //   trunk: radius that blocks you; lazy: worked out a square at a time; wind: sway, flutter;
  //   gives: what E gathers from it
  const KINDS = {
    canopy: { parts: () => canopyParts(0), per: 26, channel: 'trees', scale: [0.8, 1.25], near: 1200, trunk: 0.55, shadow: true },
    canopy2: { parts: () => canopyParts(1), per: 20, channel: 'trees', scale: [0.75, 1.15], near: 1200, trunk: 0.5, shadow: true },
    jungletree: { model: 'jungletree', per: 16, channel: 'trees', scale: [0.55, 0.9], near: 80, card: true, trunk: 0.75, shadow: true, wind: [0.0018, 0.0009] },
    palm: { model: 'palm', per: 22, channel: 'palms', scale: [0.85, 1.25], near: 80, card: true, trunk: 0.3, shadow: true, wind: [0.004, 0.002] },
    banana: { model: 'banana', per: 120, channel: 'bananas', scale: [0.85, 1.3], near: 55, card: true, trunk: 0.18, soft: true, shadow: true, wind: [0.01, 0.006], windAll: true, gives: 'big_leaf' },
    monstera: { model: 'monstera', per: 420, channel: 'under', scale: [0.8, 1.4], near: 42, lazy: true, wind: [0.02, 0.012], gives: 'big_leaf' },
    fern: { model: 'fern', per: 260, channel: 'ferns', scale: [0.9, 1.7], near: 36, lazy: true, wind: [0.04, 0.02], gives: 'leaves' },
    fernA: { model: 'foliage', part: 'fernA', per: 900, channel: 'ferns', scale: [0.9, 1.7], near: 34, lazy: true, wind: [0.04, 0.02], gives: 'leaves' },
    fernB: { model: 'foliage', part: 'fernB', per: 760, channel: 'ferns', scale: [0.9, 1.6], near: 34, lazy: true, wind: [0.04, 0.02], gives: 'leaves' },
    grassA: { model: 'foliage', part: 'grassA', per: 500, channel: 'grass', scale: [0.8, 1.5], near: 30, lazy: true, wind: [0.07, 0.03] },
    grassB: { model: 'foliage', part: 'grassB', per: 450, channel: 'grass', scale: [0.8, 1.5], near: 30, lazy: true, wind: [0.07, 0.03] },
    grassC: { model: 'foliage', part: 'grassC', per: 400, channel: 'grass', scale: [0.9, 1.7], near: 26, lazy: true, wind: [0.07, 0.03] },
    deadbush: { model: 'foliage', part: 'deadbush', per: 30, channel: 'rocks', scale: [0.8, 1.3], near: 34, lazy: true, wind: [0.03, 0.01] },
    boulder: { model: 'rocks', part: 'boulder', per: 5, channel: 'rocks', scale: [0.8, 1.9], near: 180, trunk: 0.8, solid: true, shadow: true, sink: 0.25 },
    rock: { model: 'rocks', part: 'rock', per: 10, channel: 'rocks', scale: [0.6, 1.5], near: 120, trunk: 0.5, solid: true, shadow: true, sink: 0.15 },
    slab: { model: 'rocks', part: 'slab', per: 12, channel: 'rocks', scale: [0.6, 1.5], near: 90, shadow: true, sink: 0.1 },
  };
  const CELL = 32;
  const flora = {
    group: new THREE.Group(),
    kinds: {},
    dirty: false,
    reserved, densityAt, fixed: [],
  };
  D.scene.add(flora.group);

  // ---------- Broadleaf rainforest trees, made here ----------

  // Tall straight trunks flaring into buttress roots, a few heavy limbs, and a wide crown of
  // leaf clusters. Two shapes; every tree is one of them, turned and scaled.
  let leafTexture = null;
  function paintLeaves() {
    return D.canvasTexture(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const leaf = (x, y, len, ang, hue, light) => {
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        const grad = g.createLinearGradient(0, 0, len, 0);
        grad.addColorStop(0, `hsl(${hue}, 45%, ${light - 9}%)`);
        grad.addColorStop(1, `hsl(${hue + 6}, 50%, ${light + 4}%)`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(len * 0.3, -len * 0.26, len * 0.75, -len * 0.2, len, 0);
        g.bezierCurveTo(len * 0.75, len * 0.2, len * 0.3, len * 0.26, 0, 0);
        g.fill();
        g.strokeStyle = `hsla(${hue + 10}, 40%, ${light + 16}%, 0.55)`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(2, 0);
        g.lineTo(len * 0.92, 0);
        g.stroke();
        g.restore();
      };
      // clusters of leaves on twigs, spread over the card, thicker in the middle
      for (let c = 0; c < 26; c++) {
        const a = Math.random() * Math.PI * 2;
        const r = 190 * Math.sqrt(Math.random());
        const cx = w / 2 + Math.cos(a) * r;
        const cy = h / 2 + Math.sin(a) * r;
        g.strokeStyle = 'rgba(70,52,30,0.8)';
        g.lineWidth = 2;
        const twig = Math.random() * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(twig) * 30, cy + Math.sin(twig) * 30);
        g.stroke();
        const count = 7 + Math.floor(Math.random() * 6);
        for (let n = 0; n < count; n++) {
          leaf(cx + Math.cos(twig) * n * 4, cy + Math.sin(twig) * n * 4, 30 + Math.random() * 26, twig + (n % 2 ? 1 : -1) * (0.5 + Math.random() * 0.7),
            88 + Math.random() * 30, 20 + Math.random() * 18);
        }
      }
    }, { srgb: true, repeat: false });
  }
  const cleanCanvas = (tex) => D.cleanCutout(tex.image, { flip: true });

  const canopyCache = [];
  function canopyParts(variant) {
    if (canopyCache[variant]) return canopyCache[variant];
    const random = seeded(4242 + variant * 97);
    if (!leafTexture) leafTexture = cleanCanvas(paintLeaves());
    const barkMap = D.photo('bark', 'color');
    const barkNormal = D.photo('bark', 'normal');
    const trunkParts = [];
    const height = variant === 0 ? 24 : 17;
    // the trunk: a tapering, slightly leaning column
    const trunk = new THREE.CylinderGeometry(0.42, 0.7, height, 10, 8, true);
    trunk.translate(0, height / 2, 0);
    {
      const p = trunk.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const lean = (y / height) ** 2 * 1.2;
        p.setX(i, p.getX(i) + lean);
        // buttresses: the base flares out into fins
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const fin = Math.max(0, Math.cos(a * 4)) ** 6 * smoothstep(3.2, 0, y) * 1.6;
        const k = 1 + fin + smoothstep(1.5, 0, y) * 0.4;
        p.setX(i, (p.getX(i) - lean) * k + lean);
        p.setZ(i, p.getZ(i) * k);
      }
      // bark repeats every metre or so up the trunk
      const uv = trunk.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * height / 2.2);
      trunk.computeVertexNormals();
    }
    trunkParts.push(trunk);
    // limbs into the crown
    const crownY = height * 0.78;
    const limbs = [];
    const limbCount = variant === 0 ? 5 : 4;
    for (let i = 0; i < limbCount; i++) {
      const a = (i / limbCount) * Math.PI * 2 + random() * 0.6;
      const out = 3 + random() * 3;
      const up = 2.5 + random() * 3;
      const from = new THREE.Vector3(1.0 * (crownY / height) ** 2, crownY - random() * 3, 0);
      const to = new THREE.Vector3(from.x + Math.cos(a) * out, from.y + up, Math.sin(a) * out);
      const len = from.distanceTo(to);
      const limb = new THREE.CylinderGeometry(0.12, 0.28, len, 7, 1, true);
      limb.translate(0, len / 2, 0);
      limb.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())));
      limb.translate(from.x, from.y, from.z);
      trunkParts.push(limb);
      limbs.push(to);
    }
    const wood = D.models.joinGeometries(trunkParts.map((g) => g.index ? g : g));
    // the crown: leaf cards round the limb ends and over the top
    const cards = [];
    const dummy = new THREE.Object3D();
    const cardCount = variant === 0 ? 110 : 85;
    for (let i = 0; i < cardCount; i++) {
      const base = limbs[i % limbs.length];
      const spread = 4.4;
      dummy.position.set(base.x + (random() - 0.5) * spread * 2, base.y + (random() - 0.35) * 2.6, base.z + (random() - 0.5) * spread * 2);
      dummy.rotation.set(-Math.PI / 2 + (random() - 0.5) * 1.1, random() * 6.3, (random() - 0.5) * 1.1);
      const s = 3.4 + random() * 2.2;
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      const card = new THREE.PlaneGeometry(1, 1);
      card.applyMatrix4(dummy.matrix);
      // light from above, like a canopy, whatever way the card faces
      const nrm = card.attributes.normal;
      for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, (random() - 0.5) * 0.3, 1, (random() - 0.5) * 0.3);
      cards.push(card);
    }
    const leaves = D.models.joinGeometries(cards);
    const barkMat = new THREE.MeshStandardMaterial({ map: barkMap, normalMap: barkNormal, color: D.col(0xb8ab98), roughness: 0.95 });
    const leafMat = D.foliageMaterial({ map: leafTexture, alphaTest: 0.45, side: THREE.DoubleSide, color: D.col(0xd6e2b2) });
    D.addWind(leafMat, 0.0016, 0.0012);
    wood.computeBoundingBox();
    leaves.computeBoundingBox();
    canopyCache[variant] = [{ geometry: wood, material: barkMat }, { geometry: leaves, material: leafMat, depth: true }];
    return canopyCache[variant];
  }

  // ---------- Planting ----------

  function partsOf(spec) {
    return spec.parts ? spec.parts() : D.models.part(spec.model, spec.part);
  }

  function addPlant(k, list, x, z, turn, size) {
    const spec = k.spec;
    const plant = { id: k.nextId++, kind: k.name, x, y: T.height(x, z) - 0.06 - (spec.sink || 0) * size, z, turn, s: size, gone: false };
    if (spec.trunk) {
      const r = spec.trunk * size;
      plant.r = r;
      plant.solid = !!spec.solid;
      plant.top = spec.solid ? plant.y + 1.2 * size : plant.y + 14;
    }
    list.push(plant);
    return plant;
  }

  const B = { minX: -330, maxX: 320, minZ: -390, maxZ: 380 };
  function plantAll() {
    let seed = 1;
    for (const [name, spec] of Object.entries(KINDS)) {
      const k = { spec, name, list: [], cells: new Map(), near: [], card: null, nextId: 1, seed: seed++ };
      flora.kinds[name] = k;
      // plants placed on purpose (the tree a statue sits under...) come first
      for (const f of flora.fixed.filter((e) => e.kind === name)) {
        const plant = addPlant(k, k.list, f.x, f.z, f.turn || 0, f.s || 1);
        const key = Math.floor(f.x / CELL) * 8192 + Math.floor(f.z / CELL);
        if (!k.cells.has(key)) k.cells.set(key, []);
        k.cells.get(key).push(plant);
      }
      if (spec.lazy) continue;
      const random = seeded(20261008 + k.seed * 101);
      const area = ((B.maxX - B.minX) * (B.maxZ - B.minZ)) / 10000;
      const wanted = Math.round(spec.per * area);
      for (let n = 0; n < wanted; n++) {
        const x = B.minX + random() * (B.maxX - B.minX);
        const z = B.minZ + random() * (B.maxZ - B.minZ);
        const roll = random();
        const turn = random() * Math.PI * 2;
        const size = spec.scale[0] + random() * (spec.scale[1] - spec.scale[0]);
        if (roll > densityAt(spec.channel, x, z)) continue;
        if (isReserved(x, z, spec.trunk ? 2 : 0)) continue;
        const plant = addPlant(k, k.list, x, z, turn, size);
        const key = Math.floor(x / CELL) * 8192 + Math.floor(z / CELL);
        if (!k.cells.has(key)) k.cells.set(key, []);
        k.cells.get(key).push(plant);
      }
      // the land beyond the eastern mountains (Chapter 3), on its own dice, after the valley's,
      // so nothing in the valley moves
      const E = { minX: 330, maxX: 690, minZ: -190, maxZ: 110 };
      const er = seeded(20261009 + k.seed * 131);
      const eWanted = Math.round((spec.per * (E.maxX - E.minX) * (E.maxZ - E.minZ)) / 10000);
      for (let n = 0; n < eWanted; n++) {
        const x = E.minX + er() * (E.maxX - E.minX);
        const z = E.minZ + er() * (E.maxZ - E.minZ);
        const roll = er();
        const turn = er() * Math.PI * 2;
        const size = spec.scale[0] + er() * (spec.scale[1] - spec.scale[0]);
        if (roll > densityAt(spec.channel, x, z)) continue;
        if (isReserved(x, z, spec.trunk ? 2 : 0)) continue;
        const plant = addPlant(k, k.list, x, z, turn, size);
        const key = Math.floor(x / CELL) * 8192 + Math.floor(z / CELL);
        if (!k.cells.has(key)) k.cells.set(key, []);
        k.cells.get(key).push(plant);
      }
    }
  }

  // The undergrowth of one square, worked out the first time it is wanted (from the square's
  // own seed, so it is the same each time).
  function growCell(k, cx, cz) {
    const key = cx * 8192 + cz;
    const list = [];
    k.cells.set(key, list);
    const spec = k.spec;
    const random = seeded((key * 31 + k.seed * 7919) >>> 0);
    const count = (spec.per * CELL * CELL) / 10000;
    const n = Math.floor(count) + (random() < count % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = (cx + random()) * CELL;
      const z = (cz + random()) * CELL;
      const turn = random() * Math.PI * 2;
      const size = spec.scale[0] + random() * (spec.scale[1] - spec.scale[0]);
      const roll = random();
      // undergrowth clumps: thicker in patches
      const clump = 0.55 + 0.9 * noise2(x * 0.09 + k.seed, z * 0.09);
      if (roll > densityAt(spec.channel, x, z) * clump) continue;
      if (isReserved(x, z)) continue;
      const plant = addPlant(k, list, x, z, turn, size);
      plant.id = key * 1000 + k.seed * 100000000 + i;
      plant.gone = flora.taken.has(`${plant.kind}:${plant.id}`);
    }
    return list;
  }

  // The plants of one kind within `reach` of (x, z).
  function plantsNear(kind, x, z, reach, out = []) {
    const k = flora.kinds[kind];
    if (!k) return out;
    const x0 = Math.floor((x - reach) / CELL);
    const x1 = Math.floor((x + reach) / CELL);
    const z0 = Math.floor((z - reach) / CELL);
    const z1 = Math.floor((z + reach) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        let list = k.cells.get(cx * 8192 + cz);
        if (!list && k.spec.lazy) list = growCell(k, cx, cz);
        if (list) for (const p of list) if (!p.gone && (p.x - x) ** 2 + (p.z - z) ** 2 < reach * reach) out.push(p);
      }
    }
    return out;
  }
  flora.plantsNear = plantsNear;

  // ---------- Drawing ----------

  // A picture of a plant from two sides, for its distant cards: the model drawn flat-lit into
  // a texture, the front view on the left half and the side view on the right.
  // (drawn again into the same picture should the browser lose the graphics card's memory)
  function paintCard(spec, target) {
    const parts = partsOf(spec);
    const box = new THREE.Box3();
    for (const { geometry } of parts) box.union(geometry.boundingBox);
    const size = box.getSize(new THREE.Vector3());
    const w = Math.max(size.x, size.z);
    const studio = new THREE.Scene();
    const flat = parts.map(({ geometry, material }) => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: material.map, color: material.color.clone().multiplyScalar(0.62), alphaTest: 0.45, side: THREE.DoubleSide, toneMapped: false,
    })));
    flat.forEach((m) => studio.add(m));
    const lens = new THREE.OrthographicCamera(-w / 2, w / 2, box.max.y, box.min.y, -100, 100);
    const renderer = D.renderer;
    const before = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x1e2a14, 0);
    renderer.clear(true, true, false);
    for (const [view, x, z] of [[0, 0, 1], [1, 1, 0]]) {
      target.viewport.set(view * 512, 0, 512, 512);
      renderer.setRenderTarget(target);
      lens.position.set(x * 50, 0, z * 50);
      lens.lookAt(0, 0, 0);
      renderer.render(studio, lens);
    }
    target.viewport.set(0, 0, 1024, 512);
    renderer.setRenderTarget(before);
    renderer.autoClear = autoClear;
    renderer.setClearColor(clear, alpha);
    flat.forEach((m) => m.material.dispose());
    return { box, w };
  }

  function bakeCard(spec) {
    const target = new THREE.WebGLRenderTarget(1024, 512, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
    const { box, w } = paintCard(spec, target);
    const card = new THREE.BufferGeometry();
    const h0 = box.min.y;
    const h1 = box.max.y;
    const hw = w / 2;
    card.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw, h0, 0, hw, h0, 0, hw, h1, 0, -hw, h1, 0,
      0, h0, hw, 0, h0, -hw, 0, h1, -hw, 0, h1, hw,
    ], 3));
    card.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
    card.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0.5, 1, 0, 1, 0.5, 0, 1, 0, 1, 1, 0.5, 1], 2));
    card.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    // lit as the near plants are, so a plant does not change shade as it turns from model to card
    const material = D.foliageMaterial({ map: target.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    return { geometry: card, material, target };
  }

  // Everything drawn into textures here, drawn again (after the browser has lost and restored
  // the graphics context, which empties them).
  flora.repaint = () => {
    for (const k of Object.values(flora.kinds)) if (k.cardTarget) paintCard(k.spec, k.cardTarget);
    flora.dirty = true;
  };

  function buildMeshes() {
    for (const k of Object.values(flora.kinds)) {
      const spec = k.spec;
      const reach = Math.min(spec.near, 400);
      const room = spec.near > 400 ? k.list.length + 4 : Math.ceil(((spec.per * Math.PI * reach * reach) / 10000) * 1.6) + 16;
      // wind on the leaves (once per material)
      for (const { geometry, material } of partsOf(spec)) {
        if (spec.wind && !material.userData.windy && (material.userData.cutOut !== false || spec.windAll)) {
          D.addWind(material, spec.wind[0], spec.wind[1]);
          material.userData.windy = true;
        }
        const mesh = new THREE.InstancedMesh(geometry, material, room);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = !!spec.shadow;
        mesh.receiveShadow = true;
        if (material.alphaTest > 0) {
          mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: material.map, alphaTest: material.alphaTest });
        }
        flora.group.add(mesh);
        k.near.push(mesh);
      }
      k.room = room;
      if (spec.card) {
        const baked = bakeCard(spec);
        k.cardTarget = baked.target;
        k.card = new THREE.InstancedMesh(baked.geometry, baked.material, k.list.length + 4);
        k.card.count = 0;
        k.card.frustumCulled = false;
        k.card.receiveShadow = true;
        flora.group.add(k.card);
      }
    }
  }

  const plantMatrix = new THREE.Matrix4();
  const plantQ = new THREE.Quaternion();
  const plantPos = new THREE.Vector3();
  const plantScale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  function matrixOf(p) {
    plantQ.setFromAxisAngle(yAxis, p.turn);
    return plantMatrix.compose(plantPos.set(p.x, p.y, p.z), plantQ, plantScale.setScalar(p.s));
  }

  // Which plants are drawn as models and which as cards, from where the camera is. Each kind
  // is redone on its own when the camera has moved or turned enough since that kind was last
  // done, a few kinds a frame within a millisecond or so, so the work never piles up into one
  // long frame; the cards, which change less, more rarely still.
  const found = [];
  let cursor = 0;
  const lookNow = () => {
    D.camera.getWorldDirection(plantPos);
    return Math.atan2(plantPos.x, plantPos.z);
  };

  function updateKind(k, look, force) {
    const cam = D.camera;
    const eye = cam.position;
    const spec = k.spec;
    // the cards are redone with the models, every time: a plant leaving the models' reach is
    // a card in the same frame, never missing in between
    const doCards = !!k.card;
    k.eye = k.eye || new THREE.Vector3();
    k.eye.copy(eye);
    k.look = look;
    const lx = Math.sin(look);
    const lz = Math.cos(look);
    // in front of the camera, with a wide margin either side for turning before the next update
    const spread = Math.cos(Math.min(Math.PI, (cam.fov * cam.aspect * Math.PI) / 360 + 0.75));
    const reach = spec.near > 400 ? spec.near : spec.near * (spec.lazy ? D.gq.grass : D.gq.flora);
    found.length = 0;
    if (spec.near > 400) {
      for (const p of k.list) if (!p.gone) found.push(p);
    } else plantsNear(k.name, eye.x, eye.z, reach, found);
    let n = 0;
    const nearIds = doCards ? new Set() : null;
    for (const p of found) {
      const dx = p.x - eye.x;
      const dz = p.z - eye.z;
      const d = Math.hypot(dx, dz);
      const big = (spec.trunk || 1) * p.s * 8 + 6;
      if (d > big && (dx * lx + dz * lz) / d < spread) continue; // behind the camera
      if (n >= k.room) break;
      matrixOf(p);
      for (const mesh of k.near) mesh.setMatrixAt(n, plantMatrix);
      n++;
      if (nearIds) nearIds.add(p.id);
    }
    for (const mesh of k.near) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (doCards) {
      let c = 0;
      for (const p of k.list) {
        if (p.gone || nearIds.has(p.id)) continue;
        const dx = p.x - eye.x;
        const dz = p.z - eye.z;
        const d = Math.hypot(dx, dz);
        if (d > cam.far) continue;
        if ((dx * lx + dz * lz) / d < spread - 0.2 && d > 30) continue;
        matrixOf(p);
        k.card.setMatrixAt(c++, plantMatrix);
      }
      k.card.count = c;
      k.card.instanceMatrix.needsUpdate = true;
    }
  }

  flora.update = (dt, force = false) => {
    if (!flora.built) return;
    force = force || flora.dirty;
    flora.dirty = false;
    updateCarpet(force);
    const look = lookNow();
    const eye = D.camera.position;
    const kinds = Object.values(flora.kinds);
    if (force) {
      for (const k of kinds) updateKind(k, look, true);
      return;
    }
    const start = performance.now();
    for (let tries = 0; tries < kinds.length; tries++) {
      const k = kinds[cursor];
      cursor = (cursor + 1) % kinds.length;
      const moved = k.eye ? Math.hypot(eye.x - k.eye.x, eye.z - k.eye.z) : Infinity;
      const turned = k.eye ? Math.abs(D.wrapAngle(look - k.look)) : Infinity;
      const due = moved > 2.5 || turned > 0.12;
      if (!due) continue;
      updateKind(k, look, false);
      if (performance.now() - start > 1.0) break;
    }
  };

  flora.refresh = () => {
    flora.dirty = true;
  };

  // ---------- The grass carpet ----------

  // A thick sward round the camera: thousands of little clumps of blades, each two crossed
  // cards, on a grid fixed to the ground (so they do not swim as you move), thinning with
  // the land's grass and shrinking away at the edge of the ring so they never pop.
  const carpet = { mesh: null, cell: 0.75, radius: 40, at: new THREE.Vector2(1e9, 1e9), uniforms: { ringCentre: { value: new THREE.Vector3() }, ringRadius: { value: 40 } } };
  function bladeTexture() {
    return D.canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let n = 0; n < 70; n++) {
        const x = 10 + Math.random() * (w - 20);
        const tall = h * (0.45 + Math.random() * 0.55);
        const bend = (Math.random() - 0.5) * 50;
        const width = 3 + Math.random() * 4;
        const hue = 70 + Math.random() * 35;
        const light = 22 + Math.random() * 22;
        const grad = g.createLinearGradient(0, h, 0, h - tall);
        grad.addColorStop(0, `hsl(${hue - 10}, 45%, ${light - 12}%)`);
        grad.addColorStop(1, `hsl(${hue}, 55%, ${light + 8}%)`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - width / 2, h);
        g.quadraticCurveTo(x + bend * 0.3, h - tall * 0.6, x + bend, h - tall);
        g.quadraticCurveTo(x + bend * 0.3 + width * 0.4, h - tall * 0.6, x + width / 2, h);
        g.fill();
      }
    }, { srgb: true, repeat: false });
  }
  function buildCarpet() {
    const quads = [];
    for (let i = 0; i < 3; i++) {
      const q = new THREE.PlaneGeometry(1, 1, 1, 2);
      q.translate(0, 0.5, 0);
      q.rotateY((i * Math.PI) / 3);
      const nrm = q.attributes.normal;
      for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
      quads.push(q);
    }
    const geometry = D.models.joinGeometries(quads);
    const material = D.foliageMaterial({ map: cleanCanvas(bladeTexture()), alphaTest: 0.42, side: THREE.DoubleSide, color: D.col(0xe4e6b8) });
    const skyFill = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      skyFill(shader, renderer);
      shader.uniforms.windTime = D.windUniforms.windTime;
      shader.uniforms.ringCentre = carpet.uniforms.ringCentre;
      shader.uniforms.ringRadius = carpet.uniforms.ringRadius;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float windTime;
          uniform vec3 ringCentre;
          uniform float ringRadius;
          varying vec3 vGrassTint;
          ${D.GLSL_NOISE}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 gAt = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          float gEdge = 1.0 - smoothstep(ringRadius * 0.7, ringRadius, distance(gAt, ringCentre.xz));
          transformed.y *= gEdge;
          float gPhase = gAt.x * 0.31 + gAt.y * 0.23;
          float gBend = position.y * position.y;
          transformed.x += (sin(windTime * 1.6 + gPhase) * 0.12 + sin(windTime * 4.3 + gPhase * 2.7) * 0.04) * gBend;
          transformed.z += cos(windTime * 1.3 + gPhase * 1.4) * 0.08 * gBend;
          float gn = dawnNoise(gAt * 0.08);
          float gm = dawnNoise(gAt * 0.31 + 5.0);
          vGrassTint = mix(vec3(0.62, 0.85, 0.42), vec3(1.0, 0.92, 0.55), gn * 0.7) * (0.8 + 0.35 * gm);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassTint;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrassTint;');
    };
    material.customProgramCacheKey = () => 'dawn-grass';
    const max = 12000;
    const mesh = new THREE.InstancedMesh(geometry, material, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    flora.group.add(mesh);
    carpet.mesh = mesh;
    carpet.max = max;
  }
  // The carpet is laid out in 8 m tiles, each worked out once and kept (the clumps' matrices),
  // so following the camera is only a matter of copying the tiles round it into place.
  const TILE = 8;
  const tiles = new Map();
  let tileCell = 0;
  function carpetTile(tx, tz, c) {
    const key = tx * 8192 + tz;
    let m = tiles.get(key);
    if (m) {
      // most recently used last, so the oldest go first when the cache is trimmed
      tiles.delete(key);
      tiles.set(key, m);
      return m;
    }
    const out = [];
    const i0 = Math.ceil((tx * TILE) / c);
    const i1 = Math.ceil(((tx + 1) * TILE) / c) - 1;
    const j0 = Math.ceil((tz * TILE) / c);
    const j1 = Math.ceil(((tz + 1) * TILE) / c) - 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h1 = D.hash2(i, j);
        const h2 = D.hash2(i + 7919, j - 104729);
        const x = (i + h1) * c;
        const z = (j + h2) * c;
        const want = densityAt('grass', x, z) * (0.55 + 0.9 * noise2(x * 0.11, z * 0.11));
        if (D.hash2(i - 31, j + 57) > want) continue;
        if (isReserved(x, z, -1)) continue;
        const sc = 0.75 + h1 * 0.5;
        plantQ.setFromAxisAngle(yAxis, h2 * 6.28);
        plantMatrix.compose(plantPos.set(x, T.height(x, z) - 0.04, z), plantQ, plantScale.set(sc * 1.15, (0.32 + h2 * 0.3 + want * 0.25) * sc, sc * 1.15));
        for (let e = 0; e < 16; e++) out.push(plantMatrix.elements[e]);
      }
    }
    m = new Float32Array(out);
    tiles.set(key, m);
    if (tiles.size > 900) tiles.delete(tiles.keys().next().value);
    return m;
  }

  function updateCarpet(force) {
    if (!carpet.mesh) return;
    const eye = D.camera.position;
    const radius = 40 * D.gq.grass;
    carpet.uniforms.ringRadius.value = radius;
    if (!force && Math.hypot(eye.x - carpet.at.x, eye.z - carpet.at.y) < 2) return;
    carpet.at.set(eye.x, eye.z);
    carpet.uniforms.ringCentre.value.set(eye.x, 0, eye.z);
    const c = carpet.cell / Math.sqrt(D.gq.grass);
    if (c !== tileCell) {
      tiles.clear();
      tileCell = c;
    }
    const t0x = Math.floor((eye.x - radius) / TILE);
    const t1x = Math.floor((eye.x + radius) / TILE);
    const t0z = Math.floor((eye.z - radius) / TILE);
    const t1z = Math.floor((eye.z + radius) / TILE);
    const array = carpet.mesh.instanceMatrix.array;
    let n = 0;
    for (let tz = t0z; tz <= t1z; tz++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        // the tile's nearest point to the eye, within the ring?
        const nx = Math.max(tx * TILE, Math.min(eye.x, (tx + 1) * TILE));
        const nz = Math.max(tz * TILE, Math.min(eye.z, (tz + 1) * TILE));
        if ((nx - eye.x) ** 2 + (nz - eye.z) ** 2 > radius * radius) continue;
        const m = carpetTile(tx, tz, c);
        const fit = Math.min(m.length / 16, carpet.max - n);
        if (fit <= 0) continue;
        array.set(fit * 16 === m.length ? m : m.subarray(0, fit * 16), n * 16);
        n += fit;
      }
    }
    carpet.mesh.count = n;
    carpet.mesh.instanceMatrix.needsUpdate = true;
  }
  flora.updateCarpet = updateCarpet;

  // ---------- Bumping into things ----------

  const solidKinds = Object.entries(KINDS).filter(([, s]) => s.trunk).map(([n]) => n);
  const bumpList = [];
  // Pushes a body at (pos.x, pos.z) of radius r out of trunks and rocks; returns the top of
  // a rock it is standing on, if any. pos.y is the body's feet.
  flora.collide = (pos, r) => {
    let standOn = -Infinity;
    for (const kind of solidKinds) {
      bumpList.length = 0;
      plantsNear(kind, pos.x, pos.z, r + 4, bumpList);
      for (const p of bumpList) {
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const d = Math.hypot(dx, dz);
        const min = p.r + r;
        if (d >= min) continue;
        if (p.solid && pos.y > p.top - 0.45) {
          standOn = Math.max(standOn, p.top);
          continue;
        }
        if (KINDS[kind].soft) continue;
        if (d < 1e-4) {
          pos.x += min;
          continue;
        }
        pos.x = p.x + (dx / d) * min;
        pos.z = p.z + (dz / d) * min;
      }
    }
    return standOn;
  };

  // Is the straight line from a to b (on the ground) blocked by a trunk? For arrows and sight.
  flora.trunkHit = (x, y, z, radius = 0) => {
    for (const kind of solidKinds) {
      bumpList.length = 0;
      plantsNear(kind, x, z, 3, bumpList);
      for (const p of bumpList) {
        if (y > p.top || y < p.y - 0.5) continue;
        if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + radius) ** 2) return p;
      }
    }
    return null;
  };

  // The nearest plant in front of (x, z) facing `h`, of kinds that give something.
  flora.nearestGiving = (x, z, h, reach = 2.4) => {
    let best = null;
    let bestScore = Infinity;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    for (const [name, spec] of Object.entries(KINDS)) {
      if (!spec.gives) continue;
      bumpList.length = 0;
      plantsNear(name, x, z, reach + (spec.trunk ? 1 : 0), bumpList);
      for (const p of bumpList) {
        const dx = p.x - x;
        const dz = p.z - z;
        const d = Math.hypot(dx, dz);
        const ahead = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
        if (ahead < 0.2) continue;
        const score = d - ahead;
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
    }
    return best;
  };
  flora.gives = (p) => KINDS[p.kind].gives;
  flora.canopyParts = canopyParts;
  flora.kindName = (p) => ({ banana: 'banana plant', monstera: 'elephant-ear plant', fern: 'fern', fernA: 'fern', fernB: 'fern' }[p.kind] || p.kind);

  // A plant is taken: it goes (and stays gone: its id is remembered for saving).
  flora.taken = new Set();
  flora.take = (p) => {
    p.gone = true;
    flora.taken.add(`${p.kind}:${p.id}`);
    flora.dirty = true;
  };
  flora.restoreTaken = (ids) => {
    flora.taken = new Set(ids);
    for (const k of Object.values(flora.kinds)) {
      for (const list of k.cells.values()) for (const p of list) p.gone = flora.taken.has(`${p.kind}:${p.id}`);
    }
    flora.dirty = true;
  };
  flora.build = () => {
    computeDensity();
    plantAll();
    buildMeshes();
    buildCarpet();
    flora.built = true;
    flora.update(0, true);
  };

  D.flora = flora;
})();
