// The New Dawn: the shape of the land, its surfaces, and the water.
//
// The playable valley runs south to north. The cave (Zone 1) is in the foot of the southern
// mountains; north of it lie the petrified forest (2) and the clearing with its pond (3), with
// Flint Rise (5) on the rocky eastern side. A wall of cliffs crosses the whole valley, cut by
// a single narrow gorge (4) where the tiger lairs; beyond it is the deep jungle (6) and the
// Elder Tree (7). The edges are part of the land, not invisible walls: a wide, fast river to
// the west, mountains to the east, south and north.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, lerp, smoothstep, fbm2, ridged2, noise2, polylineDistance } = D;

  // ---------- Layout ----------

  const L = {
    cave: D.CAVE, // the cave's rock and hollow are in shaders.js, where its light is worked out
    pond: { x: -48, z: 76, r: 15, level: 0.65 },
    riverLevel: 0,
    gorgeX: 20,
    tree: { x: -48, z: -172 }, // the Elder Tree, where the shelter goes
    den: { x: 21, z: -2 }, // the tiger's place in the gorge
    bounds: { minX: -262, maxX: 240, minZ: -312, maxZ: 300 },
    // worn trails between the places that matter
    paths: [
      [[18, 246], [14, 228], [8, 205], [2, 186], [-6, 160], [-14, 132], [-20, 104]],
      [[-20, 104], [6, 90], [40, 80], [78, 74], [112, 70]],
      [[-20, 104], [-6, 70], [8, 40], [16, 18], [21, 0], [19, -24], [6, -60], [-14, -100], [-32, -138], [-46, -164]],
      [[2, 186], [-24, 178], [-48, 174]],
      [[-20, 104], [-36, 88]],
      // Chapter 2: the goat trail from Flint Rise up the eastern slope to the Lookout
      [[112, 70], [142, 76], [172, 79], [202, 80], [230, 79]],
      // Chapter 3: on through the Eastern Pass, and the old road over the High Meadow
      [[232, 79], [262, 72], [300, 58], [326, 47], [333, 44]],
      [[349, 40], [378, 30], [420, 16], [460, 2], [480, -14], [504, -30], [530, -45], [544, -46]],
    ],
    stream: [[-60, 82], [-88, 91], [-122, 86], [-158, 97], [-205, 106]],
  };
  // rocky knolls on Flint Rise: x, z, radius, height
  L.outcrops = [[104, 56, 15, 5], [132, 80, 11, 7], [118, 98, 12, 4.5], [150, 54, 10, 6.5], [94, 90, 8, 3], [140, 112, 9, 4]];
  L.zones = [
    null,
    { name: 'The Awakening Cave', tag: 'Zone 1' },
    { name: 'The Petrified Forest', tag: 'Zone 2' },
    { name: 'The Clearing', tag: 'Zone 3' },
    { name: 'The Tiger\'s Gorge', tag: 'Zone 4' },
    { name: 'Flint Rise', tag: 'Zone 5' },
    { name: 'The Deep Jungle', tag: 'Zone 6' },
    { name: 'The Elder Tree', tag: 'Zone 7' },
    { name: 'The Clay Banks', tag: 'Zone 8' },
    { name: 'The Nitre Galleries', tag: 'Zone 9' },
    { name: 'The Lookout', tag: 'Zone 10' },
    { name: 'The Eastern Pass', tag: 'Zone 11' },
    { name: 'The Ravine', tag: 'Zone 12' },
    { name: 'The High Meadow', tag: 'Zone 13' },
    { name: 'The River Gorge', tag: 'Zone 14' },
  ];
  L.lookout = { x: 232, z: 79, h: 31.5 };
  D.LAYOUT = L;

  // ---------- Chapter 3: over the eastern mountains ----------

  // Past the Lookout the goat trail climbs on through a gap in the mountains (the Eastern Pass),
  // meets a ravine, crosses the High Meadow, and comes down to a river in a gorge, with a village
  // on its far bank. Steep on every side but the way through, like the valley.
  const EAST = {
    pass: [[226, 80], [262, 72], [300, 58], [326, 47], [352, 38], [378, 30]],
    passH: [31.5, 35, 40.5, 39, 35.5, 33],
    ravineX: (z) => 340 + 2.5 * Math.sin(z * 0.06),
    meadow: { x: 428, z: 4, rx: 80, rz: 62, h: 33 },
    descent: [[480, -14], [504, -30], [528, -44]],
    descentH: [33, 29, 25],
    riverX: (z) => 566 + 6 * Math.sin(z * 0.021 + 1),
    rim: 24.5,
    riverLevel: 5,
    village: { x: 628, z: -46, rx: 46, rz: 70, h: 25 },
    bridgeZ: -46,
    edge: { maxX: 240 }, // how far east the hero may go: the pass is blocked until Chapter 3 clears it
  };
  L.east = EAST;
  L.edge = { minX: L.bounds.minX, maxX: L.bounds.maxX, minZ: L.bounds.minZ, maxZ: L.bounds.maxZ };
  // nearest point of a polyline: distance, and how far along (0..n-1 in segments)
  function along(x, z, pts) {
    let best = { d: Infinity, at: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
      if (d < best.d) best = { d, at: i + t };
    }
    return best;
  }
  const alongH = (heights, at) => {
    const i = Math.min(heights.length - 2, Math.floor(at));
    return lerp(heights[i], heights[i + 1], smoothstep(0, 1, at - i));
  };
  // How much of the new land is at (x, z) (0..1), and its own height there.
  function eastLand(x, z) {
    if (x < 200 || x > 720 || z < -200 || z > 130) return { m: 0, h: 0 };
    let m = 0;
    let h = 0;
    const take = (mm, hh) => {
      if (mm > m) {
        m = mm;
        h = hh;
      }
    };
    const P = along(x, z, EAST.pass);
    if (P.d < 34) take(1 - smoothstep(7, 30, P.d), alongH(EAST.passH, P.at) + (noise2(x * 0.15, z * 0.15) - 0.5) * 0.8);
    const M = EAST.meadow;
    const e = Math.hypot((x - M.x) / M.rx, (z - M.z) / M.rz);
    if (e < 1.45) take(1 - smoothstep(0.8, 1.4, e), M.h + (fbm2(x * 0.02 + 5, z * 0.02 - 2, 3) - 0.5) * 5);
    const Q = along(x, z, EAST.descent);
    if (Q.d < 34) take(1 - smoothstep(7, 30, Q.d), alongH(EAST.descentH, Q.at) + (noise2(x * 0.15, z * 0.15) - 0.5) * 0.6);
    // the gorge: rims either side of the river, sheer walls down to it
    if (z > -150 && z < 40) {
      const rd = Math.abs(x - EAST.riverX(z));
      const span = (1 - smoothstep(-130, -150, z)) * (1 - smoothstep(20, 40, z));
      if (rd < 60) {
        const rim = EAST.rim + (noise2(x * 0.1, z * 0.1) - 0.5) * 1.2;
        const bed = EAST.riverLevel - 2.8 * (1 - smoothstep(0, 15, rd));
        take(span * (1 - smoothstep(28, 56, rd)), lerp(bed, rim, smoothstep(15.5, 19.5, rd)));
      }
    }
    const V = EAST.village;
    const ve = Math.hypot((x - V.x) / V.rx, (z - V.z) / V.rz);
    if (ve < 1.45 && x > EAST.riverX(z) + 19) take(1 - smoothstep(0.8, 1.4, ve), V.h + (fbm2(x * 0.03, z * 0.03, 2) - 0.5) * 2.5);
    return { m, h };
  }
  EAST.land = eastLand;

  // ---------- The shape of the land ----------

  const riverX = (z) => -214 + 16 * Math.sin(z * 0.011 + 0.5) + 7 * Math.sin(z * 0.029 + 2);
  const riverHalf = (z) => 15 + 3 * Math.sin(z * 0.017 + 1);
  const ridgeZ = (x) => 2 + 7 * Math.sin(x * 0.021) + 4 * Math.sin(x * 0.05 + 1);
  const gorgeCentre = (z) => L.gorgeX + 2.5 * Math.sin(z * 0.06);

  // The stream: its water level falls from the pond's to the river's along its length.
  const streamLen = [];
  {
    let total = 0;
    streamLen.push(0);
    for (let i = 1; i < L.stream.length; i++) {
      total += Math.hypot(L.stream[i][0] - L.stream[i - 1][0], L.stream[i][1] - L.stream[i - 1][1]);
      streamLen.push(total);
    }
  }
  const streamTotal = streamLen[streamLen.length - 1];
  function streamNear(x, z) {
    let best = { d: Infinity, along: 0 };
    for (let i = 0; i < L.stream.length - 1; i++) {
      const [ax, az] = L.stream[i];
      const [bx, bz] = L.stream[i + 1];
      const s = D.segment(x, z, ax, az, bx, bz);
      if (s.d < best.d) best = { d: s.d, along: streamLen[i] + s.t * (streamLen[i + 1] - streamLen[i]) };
    }
    best.level = lerp(L.pond.level - 0.05, L.riverLevel + 0.05, best.along / streamTotal);
    return best;
  }

  // How mountainous it is here, 0 in the valley to 1 in the mountains.
  function mountainous(x, z) {
    const wobble = (fbm2(x * 0.008 + 50, z * 0.008 - 20, 3) - 0.5) * 70;
    const east = smoothstep(190 + wobble, 300 + wobble, x) * (1 - eastLand(x, z).m);
    const south = smoothstep(290 + wobble * 0.5, 370 + wobble, z);
    const north = smoothstep(-284 - wobble * 0.5, -370 - wobble, z);
    const west = smoothstep(-300 + wobble, -440 + wobble, x);
    return clamp(Math.max(east, south, north, west), 0, 1);
  }

  // Under Chapter 2's galleries (inside their rock) the ground is level, as under the chamber:
  // below 1 within their footprint (with 3 m to spare).
  function galleryHollow(x, z) {
    const G = L.cave.galleries;
    let best = 9;
    // (4.5 m to spare: the ground climbs steeply into the cliff beyond, and on its 2 m grid that
    // climb must stay inside the rock, never showing in the halls)
    for (const hl of G.halls) best = Math.min(best, Math.hypot((x - hl.x) / (hl.rx + 4.5), (z - hl.z) / (hl.rz + 4.5)));
    for (const w of G.ways) {
      const bx = w.b[0] - w.a[0];
      const bz = w.b[2] - w.a[2];
      const t = clamp(((x - w.a[0]) * bx + (z - w.a[2]) * bz) / (bx * bx + bz * bz), 0, 1);
      best = Math.min(best, Math.hypot(x - w.a[0] - bx * t, z - w.a[2] - bz * t) / (w.hw + 4.5));
    }
    return best;
  }

  // The height of the land, before it is cached on the grid (see height()).
  function rawHeight(x, z) {
    // the valley floor: highest at the cave, down to the clearing, rolling everywhere
    let h = 3 + smoothstep(110, 250, z) * 8 + smoothstep(-40, -250, z) * 1.5;
    h += (fbm2(x * 0.011 + 3, z * 0.011 - 7, 4) - 0.5) * 7;
    h += (fbm2(x * 0.045, z * 0.045, 3) - 0.5) * 1.3;

    // mountains all round
    const m = mountainous(x, z);
    if (m > 0) {
      const peaks = ridged2(x * 0.0042 + 11, z * 0.0042 - 3, 5);
      h += m * (30 + 150 * peaks * peaks) + m * (fbm2(x * 0.03, z * 0.03, 3) - 0.5) * 22 * m;
    }

    // the hill in the petrified forest, the knolls of Flint Rise, the rise of the Elder Tree
    h += 13 * Math.exp(-((x + 58) ** 2 + (z - 172) ** 2) / (2 * 21 * 21));
    for (const [ox, oz, r, oh] of L.outcrops) {
      const d = Math.hypot(x - ox, z - oz) / r;
      if (d < 1.6) h += oh * (1 - smoothstep(0.45, 1.25, d)) * (0.75 + 0.5 * noise2(x * 0.3, z * 0.3));
    }
    h += 2 * smoothstep(110, 30, Math.hypot(x - 120, z - 75)); // Flint Rise sits a little higher
    h += 3.2 * Math.exp(-((x - L.tree.x) ** 2 + (z - L.tree.z) ** 2) / (2 * 22 * 22));

    // the wall of cliffs across the valley, cut by the gorge
    const rd = Math.abs(z - ridgeZ(x));
    if (rd < 46) {
      // ragged: its edge wanders, its top rises and falls, its faces are broken into ledges
      const rdn = rd + (fbm2(x * 0.045 + 3, z * 0.045, 3) - 0.5) * 14;
      const top = 20 + 30 * ridged2(x * 0.016 + 5, z * 0.016, 3);
      const wall = smoothstep(30, 9, rdn);
      const ledges = Math.floor(wall * 4 + noise2(x * 0.08, z * 0.08) * 0.6) / 4;
      const gorge = 1 - smoothstep(6.5, 12.5, Math.abs(x - gorgeCentre(z)));
      const rough = (noise2(x * 0.22, z * 0.22) - 0.5) * 4 * wall;
      h += (lerp(wall, ledges, 0.35) * top + rough) * (1 - gorge) * smoothstep(-235, -195, x);
      // the gorge floor: level going through
      if (gorge > 0) h = lerp(h, 5.2 + noise2(x * 0.2, z * 0.2) * 0.6, gorge * smoothstep(30, 8, rd));
    }

    // the cave: the mountain's foot comes forward in cliffs either side of the rock it is
    // cut into, and the ground is level under the hollow itself (the tunnel and the chamber)
    const cx = Math.abs(x - L.cave.x);
    if (z > 236 && cx < 140) {
      const cliff = smoothstep(236, 262, z + (fbm2(x * 0.05, z * 0.05, 2) - 0.5) * 12) * smoothstep(135, 55, cx);
      h += cliff * (30 + 24 * ridged2(x * 0.02 + 4, z * 0.02, 3) + (noise2(x * 0.2, z * 0.2) - 0.5) * 5);
      const ch = Math.hypot((x - L.cave.chamber.x) / (L.cave.chamber.rx + 3), (z - L.cave.chamber.z) / (L.cave.chamber.rz + 3));
      const tu = z < L.cave.tunnel.z0 - 4 ? 9 : Math.max(cx / (L.cave.tunnel.rx * 1.2 + 3), (z - L.cave.tunnel.z1 - 4) / 6);
      const hollow = Math.min(ch, tu, galleryHollow(x, z));
      h = lerp(L.cave.floor + (noise2(x * 0.25, z * 0.25) - 0.5) * 0.5, h, smoothstep(1.0, 1.3, hollow));
    }
    // the approach to the mouth is level too
    const ad = Math.hypot((x - L.cave.x) / 22, (z - 238) / 14);
    if (ad < 1.4) h = lerp(L.cave.floor - 0.4 + (noise2(x * 0.2, z * 0.2) - 0.5) * 0.6, h, smoothstep(0.6, 1.4, ad));

    // the new land beyond the Lookout (Chapter 3), and the ravine across the pass
    const E = eastLand(x, z);
    if (E.m > 0) h = lerp(h, E.h, E.m);
    if (x > 325 && x < 355 && z > -20 && z < 100) {
      const rv = Math.abs(x - EAST.ravineX(z));
      if (rv < 8) h = Math.min(h, lerp(17 + (noise2(x * 0.3, z * 0.3) - 0.5) * 1.5, h, smoothstep(4.6, 7.8, rv)));
    }

    // the Lookout: a level ledge on the eastern slope (Chapter 2)
    const lk = Math.hypot(x - L.lookout.x, z - L.lookout.z);
    if (lk < 10) h = lerp(L.lookout.h + (noise2(x * 0.3, z * 0.3) - 0.5) * 0.3, h, smoothstep(4, 10, lk));

    // the pond in the clearing, its bank, and the stream out of it to the river
    const pd = Math.hypot(x - L.pond.x, z - L.pond.z);
    if (pd < L.pond.r + 30) {
      const ground = lerp(L.pond.level + 0.7, h, smoothstep(L.pond.r + 5, L.pond.r + 22, pd));
      const bed = L.pond.level - 2.2 * (1 - (pd / L.pond.r) ** 2) - 0.25;
      h = lerp(bed, ground, smoothstep(L.pond.r - 3, L.pond.r + 3, pd));
    }
    const s = streamNear(x, z);
    if (s.d < 16) {
      const ground = lerp(s.level + 0.9, h, smoothstep(5, 16, s.d));
      const bed = s.level - 0.75 * (1 - (s.d / 2.6) ** 2);
      h = Math.min(h, lerp(bed, ground, smoothstep(1.6, 4.5, s.d)));
    }

    // the river: a deep channel with low banks either side
    const rx = riverX(z);
    const half = riverHalf(z);
    const d = Math.abs(x - rx);
    if (d < half + 60) {
      const banks = lerp(L.riverLevel + 1.3 + noise2(x * 0.1, z * 0.1) * 0.8, h, smoothstep(half + 4, half + 46, d));
      const bed = L.riverLevel - 0.6 - 3.6 * (1 - smoothstep(0, half, d));
      h = lerp(bed, banks, smoothstep(half - 3, half + 3, d));
    }
    return h;
  }

  // ---------- The height grid ----------

  // Heights are worked out once on a 2 m grid over the valley and kept, so the ground you
  // walk on is exactly the ground that is drawn (same triangles, same split).
  const GRID = 2;
  const GX0 = -340;
  const GZ0 = -400;
  const GN_X = 341; // -340..340
  const GN_Z = 401; // -400..400
  const grid = new Float32Array(GN_X * GN_Z);
  for (let j = 0; j < GN_Z; j++) {
    for (let i = 0; i < GN_X; i++) grid[j * GN_X + i] = rawHeight(GX0 + i * GRID, GZ0 + j * GRID);
  }
  const inGrid = (x, z) => x >= GX0 && x <= GX0 + (GN_X - 1) * GRID && z >= GZ0 && z <= GZ0 + (GN_Z - 1) * GRID;
  // and a second over the land beyond the eastern mountains (Chapter 3)
  const EX0 = 300;
  const EZ0 = -200;
  const EN_X = 201; // 300..700
  const EN_Z = 151; // -200..100
  const egrid = new Float32Array(EN_X * EN_Z);
  for (let j = 0; j < EN_Z; j++) {
    for (let i = 0; i < EN_X; i++) egrid[j * EN_X + i] = rawHeight(EX0 + i * GRID, EZ0 + j * GRID);
  }
  const inEast = (x, z) => x >= EX0 && x <= EX0 + (EN_X - 1) * GRID && z >= EZ0 && z <= EZ0 + (EN_Z - 1) * GRID;
  function eastHeight(x, z) {
    const gx = (x - EX0) / GRID;
    const gz = (z - EZ0) / GRID;
    const i = Math.min(EN_X - 2, Math.floor(gx));
    const j = Math.min(EN_Z - 2, Math.floor(gz));
    const fx = gx - i;
    const fz = gz - j;
    const h00 = egrid[j * EN_X + i];
    const h10 = egrid[j * EN_X + i + 1];
    const h01 = egrid[(j + 1) * EN_X + i];
    const h11 = egrid[(j + 1) * EN_X + i + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  // Height of the drawn ground at (x, z). Each grid square is two triangles split from its
  // (i, j+1) corner to its (i+1, j) corner, as the meshes are built.
  function height(x, z) {
    if (!inGrid(x, z)) return inEast(x, z) ? eastHeight(x, z) : rawHeight(x, z);
    const gx = (x - GX0) / GRID;
    const gz = (z - GZ0) / GRID;
    const i = Math.min(GN_X - 2, Math.floor(gx));
    const j = Math.min(GN_Z - 2, Math.floor(gz));
    const fx = gx - i;
    const fz = gz - j;
    const h00 = grid[j * GN_X + i];
    const h10 = grid[j * GN_X + i + 1];
    const h01 = grid[(j + 1) * GN_X + i];
    const h11 = grid[(j + 1) * GN_X + i + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  // The ground's upward normal at (x, z).
  const normalOut = new THREE.Vector3();
  function normal(x, z, out = normalOut) {
    const e = 1;
    return out.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
  }

  // ---------- Where things are ----------

  // How far north of the cliffs, and how far into the riverside, the jungle has closed in: 0..1.
  function jungleAmount(x, z) {
    const north = smoothstep(-8, -48, z) * (x > 236 ? 0 : 1);
    const riverside = smoothstep(70, 22, Math.abs(x - riverX(z)) - riverHalf(z)) * 0.7;
    const forest = smoothstep(130, 175, z) * 0.45 * smoothstep(250, 225, z); // the petrified forest
    return clamp(Math.max(north, riverside, forest), 0, 1);
  }

  const pathDistance = (x, z) => {
    let best = Infinity;
    for (const p of L.paths) best = Math.min(best, polylineDistance(x, z, p));
    return best;
  };

  // Which zone (1..7) a point is in.
  function zoneAt(x, z) {
    if (x < -168 && z > 82 && z < 134) return 8; // where the stream meets the river
    if (Math.hypot(x - L.lookout.x, z - L.lookout.z) < 18) return 10;
    // Chapter 3: beyond the Lookout
    if (x > 236) {
      if (Math.abs(x - EAST.ravineX(z)) < 12 && z > 10 && z < 75) return 12;
      if (x < 340) return 11;
      if (x < EAST.descent[0][0] + 8) return 13;
      return 14;
    }
    if (Math.hypot((x - L.cave.x) / 30, (z - L.cave.z) / 30) < 1) return 1;
    if (Math.abs(z - ridgeZ(x)) < 26 && Math.abs(x - L.gorgeX) < 34) return 4;
    if (z < ridgeZ(x)) return Math.hypot(x - L.tree.x, z - L.tree.z) < 34 ? 7 : 6;
    if (x > 66 && z < 150) return 5;
    if (z > 138) return 2;
    return 3;
  }

  // Water at (x, z), if any: { level, depth, kind }.
  function waterAt(x, z) {
    const ground = height(x, z);
    const pd = Math.hypot(x - L.pond.x, z - L.pond.z);
    if (pd < L.pond.r + 4 && ground < L.pond.level) return { level: L.pond.level, depth: L.pond.level - ground, kind: 'pond' };
    const s = streamNear(x, z);
    if (s.d < 5 && ground < s.level) return { level: s.level, depth: s.level - ground, kind: 'stream' };
    if (Math.abs(x - riverX(z)) < riverHalf(z) + 8 && ground < L.riverLevel) return { level: L.riverLevel, depth: L.riverLevel - ground, kind: 'river' };
    if (x > 520 && Math.abs(x - EAST.riverX(z)) < 17 && ground < EAST.riverLevel) return { level: EAST.riverLevel, depth: EAST.riverLevel - ground, kind: 'river' };
    return null;
  }

  // ---------- Surfaces ----------

  // What covers the ground at (x, z), as weights: jungle floor, dirt, mud, pebbles, and how
  // rocky (on top of steepness, which the shader adds).
  function surface(x, z, h) {
    const jungle = jungleAmount(x, z);
    const patch = fbm2(x * 0.035 + 40, z * 0.035, 3);
    let wJungle = clamp(jungle * 1.15 - 0.1 + (patch - 0.5) * 0.6, 0, 1);
    // dirt on the trails, in bare patches, in the gorge and on Flint Rise
    const pd = pathDistance(x, z);
    let wDirt = (1 - smoothstep(1.0, 3.4 + noise2(x * 0.2, z * 0.2) * 1.4, pd)) * 0.92;
    wDirt = Math.max(wDirt, smoothstep(0.66, 0.8, fbm2(x * 0.05 - 9, z * 0.05 + 3, 3)) * 0.8);
    const gorge = Math.abs(z - ridgeZ(x)) < 30 ? 1 - smoothstep(5, 12, Math.abs(x - gorgeCentre(z))) : 0;
    wDirt = Math.max(wDirt, gorge * 0.85);
    const flint = smoothstep(70, 30, Math.hypot(x - 122, z - 76));
    wDirt = Math.max(wDirt, flint * (0.45 + 0.4 * patch));
    // mud in the cave (guano), along the water and under the cliffs
    const cave = Math.max(1 - smoothstep(0.7, 1.0, Math.hypot((x - L.cave.x) / 26, (z - L.cave.z) / 26)), 1 - smoothstep(0.8, 1.0, galleryHollow(x, z)));
    const water = waterAt(x, z);
    const pondBank = smoothstep(L.pond.r + 6, L.pond.r, Math.hypot(x - L.pond.x, z - L.pond.z));
    const s = streamNear(x, z);
    const streamBank = smoothstep(6, 2.5, s.d);
    const riverBank = smoothstep(10, 2, Math.abs(x - riverX(z)) - riverHalf(z));
    let wMud = Math.max(cave, pondBank * 0.8, streamBank * 0.75, riverBank * 0.7);
    // pebbles under water
    let wPeb = water ? smoothstep(0.05, 0.6, water.depth) : 0;
    wPeb = Math.max(wPeb, streamBank * 0.4 * (water ? 1 : 0.3));
    if (wPeb > 0.5) wMud *= 0.4;
    // rock: mountains, Flint Rise knolls, the cliff tops
    let rocky = smoothstep(0.35, 0.8, mountainous(x, z)) * 0.9;
    for (const [ox, oz, r] of L.outcrops) rocky = Math.max(rocky, smoothstep(r * 0.75, r * 0.25, Math.hypot(x - ox, z - oz)) * 0.85);
    if (Math.abs(z - ridgeZ(x)) < 22 && h > 14) rocky = Math.max(rocky, smoothstep(14, 22, h) * 0.6);
    if (cave > 0) wJungle *= 1 - cave;
    // keep weights summing to at most 1 (grass takes the rest)
    const total = wJungle + wDirt + wMud + wPeb;
    if (total > 1) {
      wJungle /= total;
      wDirt /= total;
      wMud /= total;
      wPeb /= total;
    }
    return [wJungle, wDirt, wMud, wPeb, rocky];
  }

  // The dominant surface under foot, for footsteps: 'grass', 'leaves', 'dirt', 'mud', 'rock', 'water'.
  function groundKind(x, z) {
    const water = waterAt(x, z);
    if (water && water.depth > 0.12) return 'water';
    const h = height(x, z);
    const [j, d, m, p, r] = surface(x, z, h);
    const n = normal(x, z);
    if (r > 0.5 || n.y < 0.72 || p > 0.5) return 'rock';
    const g = 1 - j - d - m - p;
    const best = Math.max(j, d, m, g);
    return best === m ? 'mud' : best === d ? 'dirt' : best === j ? 'leaves' : 'grass';
  }

  // ---------- The terrain mesh ----------

  // 100 m chunks: fine (2 m) over the valley, coarse (5 m) out in the mountains. Each has a
  // skirt hanging down round its edge so the two sizes never show a crack between them.
  // Smooth value noise, four independent fields (one per channel), baked once into a small
  // tiling texture: 32 cells across, 8 texels a cell, smoothed between lattice points. One look-up
  // stands in for four noise functions worked out in the shader.
  D.noiseTexture = (() => {
    const size = 256;
    const cells = 32;
    const per = size / cells;
    const data = new Uint8Array(size * size * 4);
    const lattice = [0, 1, 2, 3].map((c) => {
      const random = D.seeded(911 + c * 7);
      return Float32Array.from({ length: cells * cells }, () => random());
    });
    const sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = x / per;
        const gy = y / per;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = sm(gx - ix);
        const fy = sm(gy - iy);
        const i0 = ix % cells;
        const i1 = (ix + 1) % cells;
        const j0 = iy % cells;
        const j1 = (iy + 1) % cells;
        for (let c = 0; c < 4; c++) {
          const L = lattice[c];
          const a = L[j0 * cells + i0];
          const b = L[j0 * cells + i1];
          const d = L[j1 * cells + i0];
          const e = L[j1 * cells + i1];
          data[(y * size + x) * 4 + c] = Math.round((a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy) * 255);
        }
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  })();
  // noise at `freq` lattice cells a metre: texture2D(tNoise, p * freq / 32.0)

  // The ground: up to five layers blended by the splat weights each vertex carries, with rock
  // projected from three sides on steep ground. Every layer's pictures are only looked up where
  // that layer is actually present, and the fine surface relief is left off far away.
  const terrainUniforms = {};
  function terrainMaterial() {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.32 });
    const t = (key, kind) => D.photo(key, kind);
    Object.assign(terrainUniforms, {
      tGrass: { value: t('grass', 'color') }, tJungle: { value: t('jungle', 'color') }, tDirt: { value: t('dirt', 'color') },
      tMud: { value: t('mud', 'color') }, tPebbles: { value: t('pebbles', 'color') }, tCliff: { value: t('cliff', 'color') },
      nGrass: { value: t('grass', 'normal') }, nJungle: { value: t('jungle', 'normal') }, nDirt: { value: t('dirt', 'normal') },
      nCliff: { value: t('cliff', 'normal') }, nPebbles: { value: t('pebbles', 'normal') },
      tNoise: { value: D.noiseTexture },
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, terrainUniforms, D.caveUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 splat;
          attribute float rocky;
          varying vec4 vSplat;
          varying float vRocky;
          varying vec3 vTPos;
          varying vec3 vTNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vSplat = splat;
          vRocky = rocky;
          vTPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vTNormal = normalize(mat3(modelMatrix) * normal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tGrass, tJungle, tDirt, tMud, tPebbles, tCliff;
          uniform sampler2D nGrass, nJungle, nDirt, nCliff, nPebbles;
          uniform sampler2D tNoise;
          varying vec4 vSplat;
          varying float vRocky;
          varying vec3 vTPos;
          varying vec3 vTNormal;
          ${D.GLSL_CAVE}
          // sRGB to linear: a close polynomial, much cheaper than pow on every look-up
          vec3 tLin(vec4 c) { return c.rgb * (c.rgb * (c.rgb * 0.305306011 + 0.682171111) + 0.012522878); }
          vec3 tNrm(vec4 c) { return c.xyz * 2.0 - 1.0; }
          float tLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }`)
        .replace('#include <map_fragment>', `
          vec2 wp = vTPos.xz;
          vec3 geoN = normalize(vTNormal);
          float camDist = length(vTPos - cameraPosition);
          vec4 nA = texture2D(tNoise, wp * (0.7 / 32.0));
          vec4 nB = texture2D(tNoise, wp * (2.3 / 32.0));
          vec4 nM = texture2D(tNoise, wp * (0.013 / 32.0));
          vec4 nM2 = texture2D(tNoise, wp * (0.051 / 32.0));
          // weights first, sharpened by each layer's own relief so they meet in ragged edges
          float edge = nA.r * 0.5 + nB.g * 0.25;
          vec4 s = vSplat;
          float wGrassRaw = max(0.0, 1.0 - s.x - s.y - s.z - s.w);
          float slope = 1.0 - geoN.y;
          float wRock = clamp(max(vRocky, smoothstep(0.25, 0.42, slope + (edge - 0.4) * 0.12)), 0.0, 1.0);
          float wG = 0.0;
          vec4 w4 = vec4(0.0);
          float sum = 1e-4;
          vec3 albedo = vec3(0.0);
          if (wRock < 0.99) {
            if (wGrassRaw > 0.01) {
              // two scales, to hide the repeat
              vec3 c = mix(tLin(texture2D(tGrass, wp / 4.2)), tLin(texture2D(tGrass, wp / 15.0 + 0.37)), 0.4) * vec3(0.62, 0.78, 0.42);
              wG = clamp(wGrassRaw * 1.6 - 0.3 + (tLum(c) * 2.0 + edge - 0.6) * 0.5, 0.0, 1.0);
              albedo += c * wG;
            }
            if (s.x > 0.01) {
              vec3 c = mix(tLin(texture2D(tJungle, wp / 3.6)), tLin(texture2D(tJungle, wp / 12.0 + 0.21)), 0.35) * vec3(0.4, 0.42, 0.27);
              w4.x = clamp(s.x * 1.6 - 0.3 + (tLum(c) * 2.0 + edge - 0.6) * 0.5, 0.0, 1.0);
              albedo += c * w4.x;
            }
            if (s.y > 0.01) {
              vec3 c = tLin(texture2D(tDirt, wp / 3.4)) * vec3(0.46, 0.37, 0.28);
              w4.y = clamp(s.y * 1.6 - 0.3 + (tLum(c) * 2.0 + edge - 0.6) * 0.5, 0.0, 1.0);
              albedo += c * w4.y;
            }
            if (s.z > 0.01) {
              vec3 c = tLin(texture2D(tMud, wp / 3.0)) * vec3(0.95, 0.88, 0.8);
              w4.z = clamp(s.z * 1.6 - 0.3 + (tLum(c) * 2.0 + edge - 0.6) * 0.5, 0.0, 1.0);
              albedo += c * w4.z;
            }
            if (s.w > 0.01) {
              vec3 c = tLin(texture2D(tPebbles, wp / 2.6)) * vec3(0.55, 0.52, 0.45);
              w4.w = clamp(s.w * 1.6 - 0.3 + (tLum(c) * 2.0 + edge - 0.6) * 0.5, 0.0, 1.0);
              albedo += c * w4.w;
            }
            sum += wG + w4.x + w4.y + w4.z + w4.w;
            albedo /= sum;
          }
          // rock, projected from whichever sides it faces
          vec3 bw = pow(abs(geoN), vec3(4.0));
          bw /= bw.x + bw.y + bw.z;
          if (wRock > 0.004) {
            vec3 cCliff = vec3(0.0);
            float bsum = 1e-4;
            if (bw.x > 0.03) { cCliff += tLin(texture2D(tCliff, vTPos.zy / 10.0)) * bw.x; bsum += bw.x; }
            if (bw.y > 0.03) { cCliff += tLin(texture2D(tCliff, wp / 10.0)) * bw.y; bsum += bw.y; }
            if (bw.z > 0.03) { cCliff += tLin(texture2D(tCliff, vTPos.xy / 10.0)) * bw.z; bsum += bw.z; }
            albedo = mix(albedo, cCliff / bsum * vec3(0.95, 0.92, 0.88), wRock);
          }
          // large-scale variation in colour and brightness
          float macro = nM.r * 0.6 + nM2.g * 0.4;
          albedo *= 0.8 + 0.4 * macro;
          albedo = mix(albedo, albedo * vec3(0.92, 1.05, 0.85), nM.b * (1.0 - wRock));
          diffuseColor.rgb *= albedo;`)
        .replace('#include <roughnessmap_fragment>', `
          float wetness = clamp(w4.z / sum * 0.5 + w4.w / sum * 0.7, 0.0, 1.0);
          float roughnessFactor = mix(0.97, 0.55, wetness) - wRock * 0.08;`)
        .replace('#include <normal_fragment_maps>', `
          vec3 bumped = geoN;
          if (camDist < 150.0) {
            float near = 1.0 - smoothstep(100.0, 150.0, camDist);
            vec3 pTop = vec3(0.0);
            if (wRock < 0.99) {
              if (wG > 0.0) pTop += tNrm(texture2D(nGrass, wp / 4.2)) * wG;
              if (w4.x > 0.0) pTop += tNrm(texture2D(nJungle, wp / 3.6)) * w4.x;
              if (w4.y + w4.z > 0.0) pTop += tNrm(texture2D(nDirt, wp / 3.4)) * (w4.y + w4.z);
              if (w4.w > 0.0) pTop += tNrm(texture2D(nPebbles, wp / 2.6)) * w4.w;
              pTop /= sum;
            }
            vec3 pRock = vec3(0.0);
            if (wRock > 0.004) {
              if (bw.x > 0.03) { vec3 nx = tNrm(texture2D(nCliff, vTPos.zy / 10.0)); pRock += vec3(0.0, nx.y, nx.x) * bw.x; }
              if (bw.y > 0.03) { vec3 ny = tNrm(texture2D(nCliff, wp / 10.0)); pRock += vec3(ny.x, 0.0, ny.y) * bw.y; }
              if (bw.z > 0.03) { vec3 nz = tNrm(texture2D(nCliff, vTPos.xy / 10.0)); pRock += vec3(nz.x, nz.y, 0.0) * bw.z; }
            }
            bumped = normalize(geoN + (vec3(pTop.x, 0.0, -pTop.y) * 0.9 * (1.0 - wRock) + pRock * 1.1 * wRock) * near);
          }
          normal = normalize((viewMatrix * vec4(bumped, 0.0)).xyz);`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float caveShade = dawnCaveLight(vTPos);
          reflectedLight.indirectDiffuse *= caveShade;
          reflectedLight.indirectSpecular *= caveShade;
          if (caveShade < 0.999 || localOn > 0.5) reflectedLight.indirectDiffuse += dawnCaveGlow(vTPos) * material.diffuseColor;`);
    };
    material.customProgramCacheKey = () => 'dawn-terrain';
    return material;
  }

  const terrain = { group: new THREE.Group(), chunks: [] };
  D.scene.add(terrain.group);

  function buildChunk(x0, z0, size, step, material) {
    const n = Math.round(size / step);
    const verts = (n + 1) * (n + 1);
    const skirt = 4 * (n + 1);
    const count = verts + skirt;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const spl = new Float32Array(count * 4);
    const rock = new Float32Array(count);
    const fine = step <= GRID;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const x = x0 + i * step;
        const z = z0 + j * step;
        const h = fine ? height(x, z) : rawHeight(x, z);
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const e = fine ? GRID : step;
        const hx = (fine ? height(x + e, z) - height(x - e, z) : rawHeight(x + e, z) - rawHeight(x - e, z));
        const hz = (fine ? height(x, z + e) - height(x, z - e) : rawHeight(x, z + e) - rawHeight(x, z - e));
        const len = Math.hypot(hx, 2 * e, hz);
        nor[k * 3] = -hx / len;
        nor[k * 3 + 1] = (2 * e) / len;
        nor[k * 3 + 2] = -hz / len;
        const w = surface(x, z, h);
        spl.set(w.slice(0, 4), k * 4);
        rock[k] = w[4];
      }
    }
    // the skirt: a copy of each edge vertex, 6 m lower
    const edge = [];
    for (let i = 0; i <= n; i++) edge.push(i); // z0 edge
    for (let i = 0; i <= n; i++) edge.push(n * (n + 1) + i); // far z edge
    for (let j = 0; j <= n; j++) edge.push(j * (n + 1)); // x0 edge
    for (let j = 0; j <= n; j++) edge.push(j * (n + 1) + n); // far x edge
    edge.forEach((src, e) => {
      const k = verts + e;
      pos[k * 3] = pos[src * 3];
      pos[k * 3 + 1] = pos[src * 3 + 1] - 6;
      pos[k * 3 + 2] = pos[src * 3 + 2];
      nor.set(nor.subarray(src * 3, src * 3 + 3), k * 3);
      spl.set(spl.subarray(src * 4, src * 4 + 4), k * 4);
      rock[k] = rock[src];
    });
    const index = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i; // (i, j)
        const b = a + 1; // (i+1, j)
        const c = a + n + 1; // (i, j+1)
        const d = c + 1; // (i+1, j+1)
        // split from (i, j+1) to (i+1, j), as height() assumes; facing up
        index.push(a, c, b, b, c, d);
      }
    }
    const strip = (from, len, flip) => {
      for (let i = 0; i < len - 1; i++) {
        const top0 = edge[from + i];
        const top1 = edge[from + i + 1];
        const low0 = verts + from + i;
        const low1 = verts + from + i + 1;
        if (flip) index.push(top0, low0, top1, top1, low0, low1);
        else index.push(top0, top1, low0, top1, low1, low0);
      }
    };
    strip(0, n + 1, false);
    strip(n + 1, n + 1, true);
    strip(2 * (n + 1), n + 1, true);
    strip(3 * (n + 1), n + 1, false);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    geometry.setAttribute('rocky', new THREE.BufferAttribute(rock, 1));
    geometry.setIndex(verts + skirt > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true; // the mountains and cliffs shade the valley at sunrise and sunset
    // drawn after the plants, rocks and people on it, so the ground they hide is never shaded
    mesh.renderOrder = 6;
    terrain.group.add(mesh);
    terrain.chunks.push(mesh);
  }

  terrain.build = () => {
    const material = terrainMaterial();
    terrain.material = material;
    const SIZE = 100;
    for (let cz = -8; cz < 8; cz++) {
      for (let cx = -8; cx < 8; cx++) {
        const x0 = cx * SIZE;
        const z0 = cz * SIZE;
        const inner = (x0 >= GX0 && x0 + SIZE <= GX0 + (GN_X - 1) * GRID && z0 >= GZ0 && z0 + SIZE <= GZ0 + (GN_Z - 1) * GRID)
          || (x0 >= EX0 && x0 + SIZE <= EX0 + (EN_X - 1) * GRID && z0 >= EZ0 && z0 + SIZE <= EZ0 + (EN_Z - 1) * GRID);
        buildChunk(x0, z0, SIZE, inner ? GRID : 5, material);
      }
    }
    buildWater();
  };

  // ---------- Water ----------

  // A rippling, see-through surface: the bed shows through in the shallows, the sky is
  // reflected more at grazing angles, the sun glints off it, foam gathers at the edges, and
  // the river runs. The ripples are a normal map painted from noise.
  const waterNormals = D.canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const f = (x, y) => {
      // tileable: sample noise on a torus-like wrap
      let v = 0;
      for (const [freq, amp] of [[4, 0.5], [8, 0.3], [16, 0.2]]) {
        const a = (x / w) * freq;
        const b = (y / h) * freq;
        const ia = Math.floor(a);
        const ib = Math.floor(b);
        const fa = a - ia;
        const fb = b - ib;
        const hsh = (p, q) => D.hash2(((p % freq) + freq) % freq + freq * 31, ((q % freq) + freq) % freq + freq * 17);
        const sa = fa * fa * (3 - 2 * fa);
        const sb = fb * fb * (3 - 2 * fb);
        v += amp * lerp(lerp(hsh(ia, ib), hsh(ia + 1, ib), sa), lerp(hsh(ia, ib + 1), hsh(ia + 1, ib + 1), sa), sb);
      }
      return v;
    };
    const hgt = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hgt[y * w + x] = f(x, y);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = hgt[y * w + ((x + 1) % w)] - hgt[y * w + ((x - 1 + w) % w)];
        const dy = hgt[((y + 1) % h) * w + x] - hgt[((y - 1 + h) % h) * w + x];
        const nx = -dx * 6;
        const ny = -dy * 6;
        const len = Math.hypot(nx, ny, 1);
        const k = (y * w + x) * 4;
        img.data[k] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });

  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    tNormal: { value: null },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    skyTop: { value: new THREE.Color() },
    skyLow: { value: new THREE.Color() },
    light: { value: 1 },
  }]);
  waterUniforms.tNormal.value = waterNormals;
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide, // (the strips are wound whichever way they come out)
    fog: true,
    vertexShader: `
      attribute float depth;
      attribute vec2 flow;
      varying float vDepth;
      varying vec2 vFlow;
      varying vec3 vPos;
      #include <fog_pars_vertex>
      void main() {
        vDepth = depth;
        vFlow = flow;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPos = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time;
      uniform sampler2D tNormal;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform vec3 skyTop;
      uniform vec3 skyLow;
      uniform float light;
      varying float vDepth;
      varying vec2 vFlow;
      varying vec3 vPos;
      #include <fog_pars_fragment>
      ${D.GLSL_NOISE}
      void main() {
        vec2 p = vPos.xz;
        vec2 run = vFlow * time;
        vec3 n1 = texture2D(tNormal, p / 9.0 + run * 0.11 + vec2(time * 0.01, 0.0)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(tNormal, p / 3.7 - vec2(0.0, time * 0.017) + run * 0.23).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(tNormal, p / 1.3 + run * 0.5 + vec2(time * 0.03)).xyz * 2.0 - 1.0;
        vec3 n = normalize(vec3(n1.x + n2.x * 0.7 + n3.x * 0.25, 5.0, n1.y + n2.y * 0.7 + n3.y * 0.25));
        vec3 view = normalize(cameraPosition - vPos);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
        vec3 r = reflect(-view, n);
        vec3 sky = mix(skyLow, skyTop, smoothstep(0.0, 0.6, r.y));
        sky = pow(sky, vec3(2.2));
        float spec = pow(max(dot(r, sunDir), 0.0), 320.0) * 7.0 + pow(max(dot(r, sunDir), 0.0), 40.0) * 0.25;
        float d = max(vDepth, 0.0);
        vec3 shallow = vec3(0.09, 0.13, 0.08);
        vec3 deep = vec3(0.01, 0.035, 0.03);
        vec3 body = mix(shallow, deep, smoothstep(0.0, 2.6, d)) * light;
        vec3 col = mix(body, sky * light, fres * 0.85) + sunColor * spec * light;
        // foam: at the edge, and streaks where the river runs
        float foamN = dawnNoise(p * 1.7 + run * 1.3) * 0.6 + dawnNoise(p * 4.1 - run * 2.0) * 0.4;
        float foam = (1.0 - smoothstep(0.0, 0.32, d)) * smoothstep(0.45, 0.75, foamN);
        foam += smoothstep(0.78, 0.9, foamN) * clamp(length(vFlow) * 0.6, 0.0, 0.6);
        col = mix(col, vec3(0.8, 0.83, 0.8) * light, clamp(foam, 0.0, 1.0) * 0.7);
        float alpha = mix(0.45, 0.95, smoothstep(0.0, 1.2, d));
        alpha = max(alpha, fres * 0.9);
        gl_FragColor = vec4(col, alpha * smoothstep(-0.05, 0.08, d));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        #include <fog_fragment>
      }`,
  });
  D.waterMaterial = waterMaterial;

  function waterMesh(positions, flows, rows, cols) {
    const count = rows * cols;
    const depth = new Float32Array(count);
    for (let k = 0; k < count; k++) depth[k] = positions[k * 3 + 1] - height(positions[k * 3], positions[k * 3 + 2]);
    const index = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
    geometry.setAttribute('flow', new THREE.BufferAttribute(flows, 2));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.renderOrder = 2;
    terrain.group.add(mesh);
    return mesh;
  }

  // A strip of water along a centre line: points [{ x, z, y, half, fx, fz }].
  function ribbon(points, cols = 9) {
    const rows = points.length;
    const pos = new Float32Array(rows * cols * 3);
    const flow = new Float32Array(rows * cols * 2);
    points.forEach((p, j) => {
      const prev = points[Math.max(0, j - 1)];
      const next = points[Math.min(rows - 1, j + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      for (let i = 0; i < cols; i++) {
        const t = i / (cols - 1) * 2 - 1;
        const k = j * cols + i;
        pos[k * 3] = p.x - dz * p.half * t;
        pos[k * 3 + 1] = p.y;
        pos[k * 3 + 2] = p.z + dx * p.half * t;
        const middle = 1 - t * t;
        flow[k * 2] = dx * p.speed * (0.3 + 0.7 * middle);
        flow[k * 2 + 1] = dz * p.speed * (0.3 + 0.7 * middle);
      }
    });
    return waterMesh(pos, flow, rows, cols);
  }

  function buildWater() {
    // the river runs north, fast
    const river = [];
    for (let z = 420; z >= -460; z -= 4) river.push({ x: riverX(z), z, y: L.riverLevel, half: riverHalf(z) + 9, speed: 0.9 });
    ribbon(river, 13);
    // the river in the eastern gorge (Chapter 3)
    const gorge = [];
    for (let z = 40; z >= -150; z -= 4) gorge.push({ x: EAST.riverX(z), z, y: EAST.riverLevel, half: 18, speed: 1.3 });
    ribbon(gorge, 9);
    // the stream, falling from the pond to the river
    const stream = [];
    for (let i = 0; i < L.stream.length - 1; i++) {
      const [ax, az] = L.stream[i];
      const [bx, bz] = L.stream[i + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
      for (let s = 0; s < steps; s++) {
        const x = lerp(ax, bx, s / steps);
        const z = lerp(az, bz, s / steps);
        stream.push({ x, z, y: streamNear(x, z).level, half: 4, speed: 0.5 });
      }
    }
    stream.push({ x: L.stream[L.stream.length - 1][0], z: L.stream[L.stream.length - 1][1], y: L.riverLevel + 0.05, half: 4, speed: 0.5 });
    ribbon(stream, 7);
    // the pond: a disc, still
    const rings = 12;
    const sides = 56;
    const pos = new Float32Array((rings + 1) * sides * 3);
    const flow = new Float32Array((rings + 1) * sides * 2);
    for (let r = 0; r <= rings; r++) {
      for (let s = 0; s < sides; s++) {
        const a = (s / (sides - 1)) * Math.PI * 2;
        const rad = (r / rings) * (L.pond.r + 6);
        const k = r * sides + s;
        pos[k * 3] = L.pond.x + Math.cos(a) * rad;
        pos[k * 3 + 1] = L.pond.level;
        pos[k * 3 + 2] = L.pond.z + Math.sin(a) * rad;
      }
    }
    waterMesh(pos, flow, rings + 1, sides);
  }

  D.onFrame((dt, time) => {
    const u = waterUniforms;
    u.time.value = time;
    u.sunDir.value.copy(D.sunDir);
    u.sunColor.value.copy(D.sun.color).multiplyScalar(D.env.night > 0.5 ? 0.3 : 1);
    u.skyTop.value.copy(D.skyDome.material.uniforms.zenith.value);
    u.skyLow.value.copy(D.skyDome.material.uniforms.horizon.value);
    u.light.value = 0.18 + 0.82 * D.env.day;
  });

  Object.assign(terrain, {
    height, normal, rawHeight, jungleAmount, zoneAt, waterAt, surface, groundKind, pathDistance, riverX, riverHalf, ridgeZ, gorgeCentre, mountainous, streamNear, eastLand,
  });
  D.terrain = terrain;
})();
