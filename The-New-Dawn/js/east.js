// The New Dawn: the land beyond the eastern mountains (Chapter 3).
//
// The goat trail from the Lookout climbs on into the Eastern Pass, where a rockslide blocks it
// (a pole and a stone: a lever); then a ravine, its old-world bridge long fallen (a rope, shot
// across on an arrow, and hand over hand); then the High Meadow over an old road, with what the
// old world left there (a car under the moss, a sign, a hiker with a compass), wild cotton, and a
// rock overhang where wolves come at dusk; and last, a river in a gorge, a bridge of planks and
// ropes, and on the far side a village where people are alive.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, lerp, smoothstep, smooth, seeded, wrapAngle } = D;
  const T = D.terrain;
  const L = D.LAYOUT;
  const E = L.east;

  const east = { group: new THREE.Group(), cleared: false, rope: false, crossed: false, crossing: null, wolves: [], villagers: [] };
  D.scene.add(east.group);

  // ---------- Where things are ----------

  const BOULDER = { x: 248.2, z: 75.1, r: 2.7 };
  const CROSS_Z = 42;
  const ravineX = (z) => E.ravineX(z);
  const WEST_POST = { x: 332.6, z: 42.6 };
  const TREE = { x: 351.6, z: 41.2, r: 0.75 };
  const CAR = { x: 392, z: 25, h: Math.atan2(28, -10) };
  const SIGN = { x: 413, z: 21.5 };
  const HIKER = { x: 437, z: 10.5 };
  const OVERHANG = { x: 471, z: -31 };
  const BRIDGE = { z: E.bridgeZ, x0: E.riverX(E.bridgeZ) - 19.6, x1: E.riverX(E.bridgeZ) + 19.6 };
  east.BOULDER = BOULDER;
  east.WEST_POST = WEST_POST;
  east.TREE = TREE;
  east.CAR = CAR;
  east.SIGN = SIGN;
  east.HIKER = HIKER;
  east.OVERHANG = OVERHANG;
  east.BRIDGE = BRIDGE;
  east.camp = { x: OVERHANG.x + 0.5, z: OVERHANG.z + 4.6 };
  east.bridgehead = { x: BRIDGE.x0 - 2.5, z: BRIDGE.z };
  // keep the plants off them
  for (const [x, z, r] of [[BOULDER.x, BOULDER.z, 8], [WEST_POST.x, WEST_POST.z, 3], [TREE.x, TREE.z, 4], [CAR.x, CAR.z, 4], [SIGN.x, SIGN.z, 1.5], [HIKER.x, HIKER.z, 2], [OVERHANG.x, OVERHANG.z, 9], [BRIDGE.x0, BRIDGE.z, 5]]) D.flora.reserved.push([x, z, r]);

  // ---------- Looks ----------

  let M = null;
  function mats() {
    if (M) return M;
    const stoneU = D.stoneUniforms();
    stoneU.petrify.value = 1;
    const mossy = (color) => {
      const m = new THREE.MeshStandardMaterial({ map: D.photo('stone', 'color'), color: D.col(color), roughness: 0.95, envMapIntensity: 0.3 });
      D.addStone(m, stoneU, { space: 'world', moss: true, scale: 1.8 });
      return m;
    };
    M = {
      rock: new THREE.MeshStandardMaterial({ map: D.photo('cliff', 'color'), normalMap: D.photo('cliff', 'normal'), color: D.col(0xc7bba8), roughness: 0.95, envMapIntensity: 0.3 }),
      mossy: mossy(0xb5b0a6),
      mossyDark: mossy(0x8d8a84),
      wood: new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), normalMap: D.photo('bark', 'normal'), color: D.col(0xd8c4a4), roughness: 0.9 }),
      plank: new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0xb89a74), roughness: 0.92 }),
      rope: new THREE.MeshStandardMaterial({ color: D.col(0xb89a62), roughness: 0.9 }),
      rust: new THREE.MeshStandardMaterial({ color: D.col(0x7a4a2e), roughness: 0.8, metalness: 0.2 }),
      concrete: mossy(0xa7a39a),
      bark: new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), normalMap: D.photo('bark', 'normal'), color: D.col(0xbfae94), roughness: 0.95 }),
      leaf: D.flora.kinds.canopy ? D.flora.kinds.canopy.near[1].material : new THREE.MeshStandardMaterial({ color: D.col(0x3d6626) }),
      cotton: new THREE.MeshStandardMaterial({ color: D.col(0xf3efe4), roughness: 0.95 }),
      cottonLeaf: new THREE.MeshStandardMaterial({ color: D.col(0x55703a), roughness: 0.85 }),
      thatch: new THREE.MeshStandardMaterial({ color: D.col(0x8a7a4a), roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0xc9a982), roughness: 0.9 }),
      stoneU,
    };
    return M;
  }
  const y = (x, z) => T.height(x, z);
  function pole(a, b, r, material) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r * 0.85, r, len, 7);
    const m = new THREE.Mesh(g, material);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function rockMesh(part, scale, material = null) {
    const parts = D.models.part('rocks', part);
    const g = new THREE.Group();
    for (const p of parts) {
      const m = new THREE.Mesh(p.geometry, material || p.material);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    g.scale.setScalar(scale);
    return g;
  }
  const v3 = (x, z, up = 0) => new THREE.Vector3(x, y(x, z) + up, z);

  // ---------- The rockslide ----------

  function buildRockslide() {
    const random = seeded(7701);
    const g = new THREE.Group();
    const boulder = rockMesh('boulder', 2.4);
    boulder.position.set(BOULDER.x, y(BOULDER.x, BOULDER.z) + 0.4, BOULDER.z);
    boulder.rotation.set(0.3, 1.2, 0.2);
    g.add(boulder);
    east.boulder = boulder;
    east.boulderHome = boulder.position.clone();
    // rubble across the pass and up its sides
    east.rubble = [];
    for (let k = 0; k < 16; k++) {
      const side = k % 2 ? 1 : -1;
      const off = 2.6 + (k >> 1) * 0.95 + random() * 0.6;
      const x = BOULDER.x + (random() - 0.5) * 3;
      const z = BOULDER.z + side * off;
      const r = rockMesh(random() < 0.5 ? 'rock' : 'boulder', 0.6 + random() * 0.9);
      r.position.set(x, y(x, z) - 0.1, z);
      r.rotation.set(random() * 3, random() * 6, random() * 3);
      g.add(r);
      east.rubble.push({ x, z, r: 0.9 + 0.45 * r.scale.x });
    }
    east.group.add(g);
    // the lever (shown once set): a pole under the boulder's edge, over a stone
    const lever = new THREE.Group();
    const under = new THREE.Vector3(BOULDER.x - 1.6, y(BOULDER.x - 1.6, BOULDER.z) + 0.35, BOULDER.z + 0.3);
    const end = new THREE.Vector3(BOULDER.x - 5.4, y(BOULDER.x - 5.4, BOULDER.z) + 1.7, BOULDER.z + 0.9);
    lever.add(pole(under, end, 0.075, mats().wood));
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), mats().mossyDark);
    stone.position.copy(under).lerp(end, 0.22);
    stone.position.y = y(stone.position.x, stone.position.z) + 0.2;
    stone.castShadow = true;
    lever.add(stone);
    lever.visible = false;
    east.group.add(lever);
    east.lever = lever;
    east.leverEnd = end;
  }

  // ---------- The ravine ----------

  function buildRavine() {
    const m = mats();
    // the post on the near rim, where the rope will be tied
    const base = v3(WEST_POST.x, WEST_POST.z);
    east.group.add(pole(base.clone().add(new THREE.Vector3(0, -0.4, 0)), base.clone().add(new THREE.Vector3(0, 1.9, 0)), 0.12, m.wood));
    east.ropeFrom = base.clone().add(new THREE.Vector3(0, 1.75, 0));
    // the big tree on the far rim
    const tb = v3(TREE.x, TREE.z, -0.3);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, TREE.r, 15, 12), m.bark);
    trunk.position.copy(tb).add(new THREE.Vector3(0, 7.5, 0));
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    east.group.add(trunk);
    const random = seeded(4404);
    const cards = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 70; i++) {
      const a = random() * 6.3;
      const r = Math.sqrt(random()) * 5.5;
      dummy.position.set(tb.x + Math.cos(a) * r, tb.y + 12 + random() * 4 - r * 0.3, tb.z + Math.sin(a) * r);
      dummy.rotation.set(-Math.PI / 2 + (random() - 0.5) * 1.2, random() * 6.3, (random() - 0.5) * 1.2);
      dummy.scale.set(3 + random() * 2, 3 + random() * 2, 1);
      dummy.updateMatrix();
      cards.push(new THREE.PlaneGeometry(1, 1).applyMatrix4(dummy.matrix));
    }
    const crown = new THREE.Mesh(D.models.joinGeometries(cards), m.leaf);
    crown.castShadow = true;
    east.group.add(crown);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + 0.4;
      east.group.add(pole(tb.clone().add(new THREE.Vector3(0, 8 + k, 0)), tb.clone().add(new THREE.Vector3(Math.cos(a) * 4, 11 + k, Math.sin(a) * 4)), 0.18, m.bark));
    }
    east.ropeTo = tb.clone().add(new THREE.Vector3(-0.2, 2.6, 0.05));
    // the old bridge: concrete anchors on both rims, rusted cables hanging into the ravine,
    // and what is left of the deck on the floor of it
    const anchors = [[ravineX(CROSS_Z + 3) - 9.2, CROSS_Z + 3], [ravineX(CROSS_Z + 3) + 9.2, CROSS_Z + 3]];
    for (const [ax, az] of anchors) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 2.6), m.concrete);
      block.position.set(ax, y(ax, az) + 0.3, az);
      block.rotation.y = 0.05;
      block.castShadow = true;
      block.receiveShadow = true;
      east.group.add(block);
      const dir = ax < ravineX(az) ? 1 : -1;
      for (const dz of [-0.9, 0.9]) {
        const top = new THREE.Vector3(ax + dir * 0.7, y(ax, az) + 0.8, az + dz);
        const hang = new THREE.Vector3(ax + dir * 3.2, y(ax, az) - 9 - Math.abs(dz) * 2, az + dz * 1.4);
        east.group.add(pole(top, hang, 0.035, m.rust));
      }
    }
    const floor = 17;
    for (let k = 0; k < 9; k++) {
      const z = CROSS_Z + 3 + (random() - 0.5) * 10;
      const x = ravineX(z) + (random() - 0.5) * 6;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2 + random(), 0.08, 0.35), m.plank);
      plank.position.set(x, Math.max(floor, y(x, z)) + 0.1, z);
      plank.rotation.set((random() - 0.5) * 0.4, random() * 3, (random() - 0.5) * 0.5);
      east.group.add(plank);
    }
    // the rope, once it is there
    east.ropeMesh = null;
  }
  // The rope's line: from the post, sagging, to the tree.
  function ropePoint(t, out = new THREE.Vector3()) {
    out.copy(east.ropeFrom).lerp(east.ropeTo, t);
    out.y -= Math.sin(t * Math.PI) * 1.1;
    return out;
  }
  function showRope() {
    if (east.ropeMesh) {
      east.ropeMesh.visible = true;
      return;
    }
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push(ropePoint(i / 24));
    east.ropeMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.03, 6, false), mats().rope);
    east.ropeMesh.castShadow = true;
    east.group.add(east.ropeMesh);
  }
  east.ropeLength = () => east.ropeFrom.distanceTo(east.ropeTo);

  // ---------- The High Meadow: what the old world left ----------

  function buildCar() {
    const m = mats();
    // a small hatchback, from the side: bonnet, windscreen, roof, tailgate, and the arches over
    // the wheels; extruded to its width, the edges rounded
    const shape = new THREE.Shape();
    shape.moveTo(-2.05, 0.28);
    shape.lineTo(-2.1, 0.62);
    shape.quadraticCurveTo(-2.05, 0.82, -1.7, 0.86);
    shape.lineTo(-0.75, 0.95);
    shape.quadraticCurveTo(-0.45, 1.42, 0.1, 1.48);
    shape.lineTo(1.2, 1.45);
    shape.quadraticCurveTo(1.75, 1.4, 1.95, 0.9);
    shape.lineTo(2.05, 0.4);
    shape.lineTo(1.75, 0.28);
    shape.absarc(1.25, 0.28, 0.48, 0, Math.PI, true);
    shape.lineTo(-0.85, 0.28);
    shape.absarc(-1.35, 0.28, 0.48, 0, Math.PI, true);
    shape.lineTo(-2.05, 0.28);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.55, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 10 }), m.mossy);
    body.geometry.translate(0, 0, -0.78);
    const g = new THREE.Group();
    g.add(body);
    // windows: dark hollows under the moss
    const glass = new THREE.MeshStandardMaterial({ color: D.col(0x1d2219), roughness: 1 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 1.62), glass);
    win.position.set(0.35, 1.18, 0);
    g.add(win);
    for (const [x, z] of [[-1.35, -0.8], [-1.35, 0.8], [1.25, -0.8], [1.25, 0.8]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 14), m.mossyDark);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.3, z);
      g.add(w);
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // half sunk, tipped a little, grass growing up its sides
    g.position.set(CAR.x, y(CAR.x, CAR.z) - 0.32, CAR.z);
    g.rotation.set(0.05, CAR.h + Math.PI / 2, -0.07);
    east.group.add(g);
  }
  function signTexture() {
    return D.canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = '#5c6a5a';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#cfd6c8';
      g.lineWidth = 6;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#dfe4d8';
      g.font = '700 38px Arial, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('...ERSIDE', 22, 52);
      g.font = '700 30px Arial, sans-serif';
      g.fillText('4 km', 22, 92);
      g.beginPath();
      g.moveTo(190, 92);
      g.lineTo(230, 92);
      g.lineTo(214, 78);
      g.moveTo(230, 92);
      g.lineTo(214, 106);
      g.stroke();
      // moss and the weather of a thousand years
      for (let n = 0; n < 900; n++) {
        const v = Math.random();
        g.fillStyle = v < 0.5 ? `rgba(70,90,40,${0.15 + Math.random() * 0.4})` : `rgba(40,38,30,${0.1 + Math.random() * 0.3})`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 0, 6.3);
        g.fill();
      }
      g.fillStyle = 'rgba(60,80,36,0.75)';
      g.fillRect(0, 0, 96, h);
    }, { repeat: false });
  }
  function buildSign() {
    const m = mats();
    const base = v3(SIGN.x, SIGN.z);
    east.group.add(pole(base.clone().add(new THREE.Vector3(0, -0.3, 0)), base.clone().add(new THREE.Vector3(0, 2.3, 0)), 0.05, m.rust));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.65, 0.04), [m.rust, m.rust, m.rust, m.rust, new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8 }), m.rust]);
    plate.position.copy(base).add(new THREE.Vector3(0, 2.05, 0));
    plate.rotation.set(0, -1.2, -0.12);
    plate.castShadow = true;
    east.group.add(plate);
  }
  function buildHiker() {
    // one of the people of stone, out walking when the light came: a pack on his back, a
    // compass in his hand
    const p = D.people.make({ id: 'hiker', tpl: 4, x: HIKER.x, z: HIKER.z, h: -1.9, stone: true });
    p.pose = 'walk';
    p.poseW = 1;
    p.mode = 'stone';
    const m = mats();
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.24), m.mossy);
    D.people.hold(p, pack, 'spine2', { pos: new THREE.Vector3(0, 0.05, -0.2) });
    const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 12), m.mossyDark);
    D.people.hold(p, compass, 'handR', { pos: new THREE.Vector3(0, 0.06, 0.03), rot: new THREE.Euler(0, 0, Math.PI / 2) });
    east.hiker = p;
    east.compassMesh = compass;
  }
  // wild cotton: low bushes with white bolls
  function buildCotton() {
    const m = mats();
    const random = seeded(6620);
    east.cotton = [];
    const spots = [[402, 32], [406, 6], [418, 34], [425, 0], [431, 28], [446, 22], [452, -4], [440, -8], [398, 14], [462, 12]];
    const leafGeo = new THREE.IcosahedronGeometry(0.42, 1);
    leafGeo.scale(1, 0.75, 1);
    const bollGeo = new THREE.IcosahedronGeometry(0.075, 1);
    for (const [cx, cz] of spots) {
      const x = cx + (random() - 0.5) * 2;
      const z = cz + (random() - 0.5) * 2;
      const g = new THREE.Group();
      const bush = new THREE.Mesh(leafGeo, m.cottonLeaf);
      bush.position.y = 0.45;
      bush.castShadow = true;
      g.add(bush);
      const bolls = [];
      for (let k = 0; k < 14; k++) {
        const b = new THREE.Mesh(bollGeo, m.cotton);
        const a = random() * 6.3;
        const up = 0.25 + random() * 0.55;
        b.position.set(Math.cos(a) * 0.38 * (1.1 - up), 0.3 + up * 0.75, Math.sin(a) * 0.38 * (1.1 - up));
        b.scale.setScalar(0.8 + random() * 0.6);
        g.add(b);
        bolls.push(b);
      }
      g.position.set(x, y(x, z) - 0.05, z);
      g.rotation.y = random() * 6.3;
      east.group.add(g);
      east.cotton.push({ id: `cotton${east.cotton.length}`, x, z, y: y(x, z), group: g, bolls });
      D.flora.reserved.push([x, z, 1.2]);
    }
  }
  east.refreshCotton = () => {
    for (const c of east.cotton || []) {
      const taken = D.items.taken.has(c.id);
      c.bolls.forEach((b) => { b.visible = !taken; });
    }
    if (east.compassMesh) east.compassMesh.visible = !D.items.taken.has('compass');
  };

  // The overhang: a shelf of rock jutting from a crag, room under it for three and a fire.
  function buildOverhang() {
    const m = mats();
    const random = seeded(5151);
    // a lump of rock: a sphere, pushed in and out by noise, then squashed to shape
    const lump = (r, sx, sy, sz, rough = 0.28) => {
      const g = new THREE.IcosahedronGeometry(r, 3);
      const p = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = D.noise3 ? D.noise3(v.x * 0.6 + 3, v.y * 0.6, v.z * 0.6) : random();
        v.multiplyScalar(1 + (n - 0.5) * rough * 2);
        p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
      }
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, m.rock);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const base = v3(OVERHANG.x, OVERHANG.z);
    const turn = 0.3;
    const g = new THREE.Group();
    g.position.copy(base);
    g.rotation.y = turn;
    // the crag behind, tall; and the shelf jutting out from its top, 3 m up
    const crag = lump(4, 1.6, 1.25, 0.9);
    crag.position.set(0, 2.4, -3.4);
    const shelf = lump(3.2, 1.75, 0.38, 1.25, 0.22);
    shelf.position.set(0.2, 3.7, -0.4);
    const foot = lump(1.6, 1.2, 0.6, 1.0);
    foot.position.set(4.6, 0.4, -1.2);
    g.add(crag, shelf, foot);
    east.group.add(g);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const at = (lx, lz) => ({ x: base.x + lx * c + lz * s, z: base.z - lx * s + lz * c });
    const back = at(0, -3.6);
    const foot2 = at(4.6, -1.2);
    east.overhangSolid = [{ x: back.x, z: back.z, r: 3.6 }, { x: foot2.x, z: foot2.z, r: 1.5 }];
    const fire = at(0.3, 1.0);
    east.camp = { x: fire.x, z: fire.z };
    if (D.camp) D.camp.addSpot('overhang', { x: fire.x, z: fire.z, label: 'The overhang' });
  }

  // ---------- The river, the bridge, the village ----------

  function buildBridge() {
    const m = mats();
    const z = BRIDGE.z;
    const a = new THREE.Vector3(BRIDGE.x0, y(BRIDGE.x0, z) + 0.15, z);
    const b = new THREE.Vector3(BRIDGE.x1, y(BRIDGE.x1, z) + 0.15, z);
    const at = (t) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 2.4, 0));
    const planks = [];
    const n = 52;
    for (let i = 0; i < n; i++) {
      const p = at((i + 0.5) / n);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.5), m.plank);
      plank.position.copy(p);
      plank.rotation.set(0, 0, (Math.random() - 0.5) * 0.05);
      planks.push(plank);
    }
    const deck = new THREE.Mesh(D.models.joinGeometries(planks.map((p) => {
      p.updateMatrix();
      return p.geometry.clone().applyMatrix4(p.matrix);
    })), m.plank);
    deck.castShadow = true;
    deck.receiveShadow = true;
    east.group.add(deck);
    for (const dz of [-0.85, 0.85]) {
      const pts = [];
      for (let i = 0; i <= 30; i++) pts.push(at(i / 30).add(new THREE.Vector3(0, 1.05 - Math.sin((i / 30) * Math.PI) * 0.15, dz)));
      east.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.035, 6, false), m.rope));
      for (const end of [a, b]) east.group.add(pole(end.clone().add(new THREE.Vector3(0, -0.8, dz)), end.clone().add(new THREE.Vector3(0, 1.6, dz)), 0.11, m.wood));
      // the hangers, rail to deck
      for (let i = 1; i < 15; i++) {
        const p = at(i / 15);
        east.group.add(pole(p.clone().add(new THREE.Vector3(0, 0, dz)), p.clone().add(new THREE.Vector3(0, 1.0, dz)), 0.012, m.rope));
      }
    }
  }

  // A house: plank walls on short stilts, a thatched roof, a door; facing `h`.
  function house(x, z, h, w, d, random) {
    const m = mats();
    const g = new THREE.Group();
    const lift = 0.5;
    const wallH = 2.4;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), m.wall);
    walls.position.y = lift + wallH / 2;
    g.add(walls);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, lift + 0.6, 6), m.wood);
      s.position.set((sx * w) / 2.1, (lift - 0.6) / 2, (sz * d) / 2.1);
      g.add(s);
    }
    const roofH = 1.6 + random() * 0.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, roofH, 4, 1), m.thatch);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w / Math.hypot(w, d) * 1.45, 1, d / Math.hypot(w, d) * 1.45);
    roof.position.y = lift + wallH + roofH / 2 - 0.05;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.05), new THREE.MeshStandardMaterial({ color: D.col(0x3a2a1a), roughness: 0.9 }));
    door.position.set(0, lift + 0.9, d / 2 + 0.03);
    g.add(door);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.position.set(x, y(x, z), z);
    g.rotation.y = h;
    return g;
  }
  function smokeColumn(x, z) {
    // a few soft sprites, rising and spreading (moved in update)
    const tex = D.canvasTexture(64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(225,225,225,0.55)');
      grad.addColorStop(1, 'rgba(225,225,225,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }, { repeat: false });
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.6 });
    const puffs = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(mat);
      s.userData.t = i / 14;
      east.villageGroup.add(s);
      puffs.push(s);
    }
    return { x, z, y: y(x, z) + 0.6, puffs };
  }
  function buildVillage() {
    const random = seeded(9090);
    east.villageGroup = new THREE.Group();
    east.group.add(east.villageGroup);
    const V = E.village;
    const homes = [[606, -78, 1.4], [612, -20, 1.9], [628, -96, 0.9], [640, -60, 1.2], [632, -12, 2.4], [652, -32, 1.6], [604, -48, 1.5], [656, -84, 0.6], [622, -38, 1.7]];
    for (const [x, z, h] of homes) east.villageGroup.add(house(x, z, h, 3.6 + random() * 1.4, 3 + random(), random));
    // a watchtower by the bridge
    const m = mats();
    const tx = BRIDGE.x1 + 6;
    const tz = BRIDGE.z + 7;
    const ty = y(tx, tz);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) east.villageGroup.add(pole(new THREE.Vector3(tx + sx, ty - 0.3, tz + sz), new THREE.Vector3(tx + sx * 0.8, ty + 6, tz + sz * 0.8), 0.1, m.wood));
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 2.2), m.plank);
    deck.position.set(tx, ty + 5.6, tz);
    east.villageGroup.add(deck);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.4, 4), m.thatch);
    roof.position.set(tx, ty + 7.3, tz);
    roof.rotation.y = Math.PI / 4;
    east.villageGroup.add(roof);
    // fences, drying racks
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 1.2 + 2.4;
      const x0 = V.x + Math.cos(a) * 40;
      const z0 = V.z + Math.sin(a) * 58;
      const x1 = V.x + Math.cos(a + 0.12) * 40;
      const z1 = V.z + Math.sin(a + 0.12) * 58;
      if (x0 < E.riverX(z0) + 21 || x1 < E.riverX(z1) + 21) continue;
      east.villageGroup.add(pole(new THREE.Vector3(x0, y(x0, z0) + 0.9, z0), new THREE.Vector3(x1, y(x1, z1) + 0.9, z1), 0.04, m.wood));
      east.villageGroup.add(pole(new THREE.Vector3(x0, y(x0, z0) - 0.2, z0), new THREE.Vector3(x0, y(x0, z0) + 1.2, z0), 0.06, m.wood));
    }
    // smoke from the hearths
    east.smoke = [smokeColumn(618, -56), smokeColumn(640, -26), smokeColumn(612, -90)];
    // and the people: alive
    const spots = [[614, -56], [620, -60], [610, -30], [636, -70], [626, -24], [646, -48], [602, -64], [632, -44], [600, -36], [644, -88], [592, -52]];
    spots.forEach(([x, z], i) => {
      const p = D.people.make({ id: `villager${i}`, tpl: (i * 5 + 1) % 6, x, z, h: random() * 6.3, stone: false });
      p.home = { x, z };
      p.wander = 3 + random() * 8;
      p.next = random() * 6;
      if (i % 4 === 1) D.people.setPose(p, 'sit', { x, z, h: Math.atan2(618 - x, -56 - z) });
      else if (i % 4 === 3) D.people.setPose(p, 'work', { x, z, h: random() * 6.3 });
      else D.people.stand(p, null);
      east.villagers.push(p);
    });
    east.showVillage(false);
  }
  east.showVillage = (on) => {
    if (!east.villageGroup) return;
    east.villageGroup.visible = on;
    for (const p of east.villagers) p.group.visible = on;
  };

  // ---------- Wolves ----------

  const WOLF = { health: 70, walk: 1.6, run: 7.5, scale: 0.42, bite: 12 };
  function makeWolf(x, z) {
    const template = D.models.list.wolf;
    if (!template) return null;
    const group = new THREE.Group();
    const body = THREE.SkeletonUtils.clone(template.root);
    body.scale.setScalar(WOLF.scale);
    body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    group.add(body);
    D.scene.add(group);
    const mixer = new THREE.AnimationMixer(body);
    const actions = {};
    for (const clip of template.animations) {
      if (clip.name.includes('|')) continue;
      const a = mixer.clipAction(clip);
      actions[clip.name] = a;
    }
    for (const k of ['Idle', 'Walk', 'Gallop']) if (actions[k]) {
      actions[k].play();
      actions[k].setEffectiveWeight(k === 'Idle' ? 1 : 0);
    }
    const w = { group, body, mixer, actions, x, z, y: y(x, z), h: 0, speed: 0, goal: 0, tx: x, tz: z, health: WOLF.health, state: 'circle', timer: 2 + Math.random() * 4, angle: Math.random() * 6.3, dead: null, bitT: 0 };
    group.position.set(x, w.y, z);
    return w;
  }
  east.spawnWolves = (cx, cz, n = 5) => {
    east.clearWolves();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const w = makeWolf(cx + Math.cos(a) * 34, cz + Math.sin(a) * 34);
      if (w) {
        w.angle = a;
        w.radius = 13 + Math.random() * 6;
        east.wolves.push(w);
      }
    }
    east.pack = { t: 0, fled: false, killed: 0, cx, cz };
    if (D.audio) {
      D.audio.howl(60);
      D.audio.howl(80, 1.6);
    }
  };
  east.clearWolves = () => {
    for (const w of east.wolves) D.scene.remove(w.group);
    east.wolves = [];
    east.pack = null;
  };
  function hurtWolf(w, damage) {
    if (w.dead) return;
    w.health -= damage;
    w.state = 'flee';
    w.timer = 3;
    if (D.audio) D.audio.yelp();
    if (w.health <= 0) {
      w.dead = { t: 0 };
      w.speed = 0;
      const a = w.actions;
      for (const k of Object.keys(a)) a[k].setEffectiveWeight(0);
      if (a.Death) {
        a.Death.reset();
        a.Death.setLoop(THREE.LoopOnce);
        a.Death.clampWhenFinished = true;
        a.Death.setEffectiveWeight(1);
        a.Death.play();
      }
      if (east.pack) east.pack.killed++;
      if (D.story) D.story.on('wolfDown', east.pack ? east.pack.killed : 1);
    }
  }
  // arrows and spears find them
  const wolfAt = (p, pad) => east.wolves.find((w) => !w.dead && Math.hypot(p.x - w.x, p.z - w.z) < 0.85 + pad && p.y > w.y && p.y < w.y + 1.3);
  D.combat.arrowTargets.push((head, arrow) => {
    // the tree across the ravine takes the rope arrow (and any other)
    if (east.ropeTo && Math.hypot(head.x - TREE.x, head.z - TREE.z) < TREE.r + 0.25 && head.y > y(TREE.x, TREE.z) - 0.5 && head.y < y(TREE.x, TREE.z) + 12) {
      if (arrow.rope) east.ropeHit(arrow);
      if (D.audio) D.audio.arrowHit(false);
      return true;
    }
    const w = wolfAt(head, 0.1);
    if (w) {
      hurtWolf(w, 45 + 35 * arrow.power);
      if (D.audio) D.audio.arrowHit(true);
      if (D.ui) D.ui.hitMarker(false);
      return true;
    }
    return false;
  });
  D.combat.meleeTargets.push((point, dir, damage) => {
    const w = wolfAt(point, 0.7);
    if (!w) return false;
    hurtWolf(w, damage);
    w.x += dir.x * 0.8;
    w.z += dir.z * 0.8;
    return true;
  });

  // The pack: round and round at the edge of the light, one darting in now and then; the fire
  // keeps them off it, and the people by it; three down, or long enough held off, and they go.
  function updateWolves(dt) {
    const pack = east.pack;
    if (!pack || !east.wolves.length) return;
    pack.t += dt;
    const h = D.hero;
    const fire = D.camp && D.camp.fire('overhang');
    const lit = !!(fire && fire.lit);
    const fx = fire ? fire.x : pack.cx;
    const fz = fire ? fire.z : pack.cz;
    const byFire = lit && Math.hypot(h.pos.x - fx, h.pos.z - fz) < 5;
    pack.held = byFire ? (pack.held || 0) + dt : Math.max(0, (pack.held || 0) - dt * 0.5);
    if (!pack.fled && (pack.killed >= 3 || pack.held > 70)) {
      pack.fled = true;
      if (D.audio) D.audio.howl(40);
      if (D.story) D.story.on('wolvesGone');
    }
    let darting = east.wolves.some((w) => w.state === 'dart');
    for (const w of east.wolves) {
      if (w.dead) {
        w.dead.t += dt;
        w.mixer.update(dt);
        continue;
      }
      w.timer -= dt;
      w.bitT = Math.max(0, w.bitT - dt);
      const toHero = Math.hypot(h.pos.x - w.x, h.pos.z - w.z);
      if (pack.fled) w.state = 'leave';
      switch (w.state) {
        case 'circle': {
          w.angle += dt * 0.35 * (w.radius > 15 ? 1 : 1.3);
          const cx = lit ? fx : h.pos.x;
          const cz = lit ? fz : h.pos.z;
          const r = lit ? Math.max(w.radius, 10) : w.radius * 0.8;
          w.tx = cx + Math.cos(w.angle) * r;
          w.tz = cz + Math.sin(w.angle) * r;
          w.goal = WOLF.walk * 2.2;
          // one at a time darts in (at you, if you are away from the fire)
          if (w.timer <= 0 && !darting && !h.dead && (!byFire || Math.random() < 0.25)) {
            w.state = 'dart';
            w.timer = 4;
            darting = true;
            if (D.audio) D.audio.growl(toHero);
          } else if (w.timer <= 0) w.timer = 2 + Math.random() * 3;
          break;
        }
        case 'dart':
          w.tx = h.pos.x;
          w.tz = h.pos.z;
          w.goal = WOLF.run;
          // the fire turns it
          if (lit && Math.hypot(w.x - fx, w.z - fz) < 4.2) {
            w.state = 'flee';
            w.timer = 2.5;
          }
          if (toHero < 1.6 && w.bitT <= 0 && !h.dead) {
            h.hurt(WOLF.bite, 'Wolves', (h.pos.x - w.x) / toHero, (h.pos.z - w.z) / toHero, 0.4);
            w.bitT = 1.2;
            if (w.actions.Attack) {
              w.actions.Attack.reset();
              w.actions.Attack.setLoop(THREE.LoopOnce);
              w.actions.Attack.setEffectiveWeight(1);
              w.actions.Attack.play();
            }
            w.state = 'flee';
            w.timer = 2.2;
          }
          if (w.timer <= 0) {
            w.state = 'circle';
            w.timer = 3 + Math.random() * 3;
          }
          break;
        case 'flee':
          w.tx = w.x + (w.x - h.pos.x);
          w.tz = w.z + (w.z - h.pos.z);
          w.goal = WOLF.run * 0.8;
          if (w.timer <= 0) {
            w.state = 'circle';
            w.timer = 3 + Math.random() * 4;
            w.angle = Math.atan2(w.z - fz, w.x - fx);
          }
          break;
        case 'leave':
          w.tx = w.x + (w.x - fx) * 3;
          w.tz = w.z + (w.z - fz) * 3;
          w.goal = WOLF.run * 0.7;
          if (toHero > 60) w.group.visible = false;
          break;
        default:
          break;
      }
      // move: no cliffs, round the rocks
      const want = Math.atan2(w.tx - w.x, w.tz - w.z);
      w.h += clamp(wrapAngle(want - w.h), -5 * dt, 5 * dt);
      const left = Math.hypot(w.tx - w.x, w.tz - w.z);
      const goal = left < 0.8 ? 0 : w.goal;
      w.speed += (goal - w.speed) * Math.min(1, dt * 5);
      const probe = { x: w.x + Math.sin(w.h) * w.speed * dt, y: w.y, z: w.z + Math.cos(w.h) * w.speed * dt };
      D.flora.collide(probe, 0.4);
      east.collide(probe, 0.4);
      if (T.normal(probe.x, probe.z).y > 0.62 || T.height(probe.x, probe.z) < w.y) {
        w.x = probe.x;
        w.z = probe.z;
      }
      w.y = T.height(w.x, w.z);
      w.group.position.set(w.x, w.y, w.z);
      w.group.rotation.y = w.h;
      // the clips: idle, walk, gallop by speed
      const run = clamp((w.speed - 3) / 3, 0, 1);
      const moving = clamp(w.speed / 0.5, 0, 1);
      const a = w.actions;
      if (a.Idle) a.Idle.setEffectiveWeight(1 - moving);
      if (a.Walk) {
        a.Walk.setEffectiveWeight(moving * (1 - run));
        a.Walk.timeScale = clamp(w.speed / 1.6, 0.6, 2);
      }
      if (a.Gallop) {
        a.Gallop.setEffectiveWeight(moving * run);
        a.Gallop.timeScale = clamp(w.speed / 7, 0.7, 1.4);
      }
      w.mixer.update(dt);
    }
  }
  east.wolvesLeft = () => east.wolves.filter((w) => !w.dead && w.group.visible).length;

  // ---------- The rope across the ravine ----------

  east.ropeReady = () => !east.rope && Math.hypot(D.hero.pos.x - WEST_POST.x, D.hero.pos.z - WEST_POST.z) < 40;
  let flying = null;
  east.ropeShot = (arrow) => {
    flying = { arrow, line: null };
    const g = new THREE.BufferGeometry().setFromPoints([east.ropeFrom.clone(), arrow.pos.clone()]);
    flying.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xb89a62 }));
    east.group.add(flying.line);
  };
  east.ropeHit = () => {
    east.rope = true;
    if (flying && flying.line) east.group.remove(flying.line);
    flying = null;
    showRope();
    if (D.story) D.story.on('ropeAcross');
  };
  east.ropeMissed = (arrow) => {
    if (flying && flying.line) east.group.remove(flying.line);
    flying = null;
    // it is on a rope: pulled back, and you can try again
    setTimeout(() => {
      if (east.rope) return;
      arrow.taken = true;
      D.scene.remove(arrow.mesh);
      D.items.add('rope_arrow', 1, true);
      if (D.story) D.story.on('ropeMissed');
    }, 1800);
  };

  function startCrossing(back = false) {
    const h = D.hero;
    if (!h.startAction(back ? 'Crossing back' : 'Crossing the ravine', 9999, { pose: 'hang', fixed: true, label: 'Hand over hand: hold W (S goes back)' })) return;
    east.crossing = { s: back ? east.ropeLength() - 0.6 : 0.6, back, still: 0 };
    if (D.ui) D.ui.tutorial('Hold <kbd>W</kbd> to go hand over hand &middot; let go to rest your arms &middot; <kbd>S</kbd> goes back', 7);
  }
  function updateCrossing(dt) {
    const c = east.crossing;
    const h = D.hero;
    if (!c) return;
    if (!h.action || !h.action.name.startsWith('Crossing')) {
      east.crossing = null;
      return;
    }
    const input = D.input;
    const len = east.ropeLength();
    const fwd = c.back ? -1 : 1;
    const want = (input.held.has('KeyW') ? 1 : 0) - (input.held.has('KeyS') ? 1 : 0);
    const st = h.stats.strength || 1;
    h.staminaRest = 0;
    if (want !== 0 && h.stats.stamina > 0.5) {
      c.s = clamp(c.s + want * fwd * 1.25 * dt, 0, len);
      h.stats.stamina = Math.max(0, h.stats.stamina - (dt * 4.2) / st);
      c.still = 0;
      c.sound = (c.sound || 0) - dt;
      if (c.sound <= 0 && D.audio) {
        D.audio.creak();
        c.sound = 0.8;
      }
    } else {
      // hanging still, the arms come back a little
      c.still += dt;
      h.stats.stamina = Math.min(100, h.stats.stamina + dt * 2.5 * st);
      if (h.stats.stamina <= 0.5 && !c.warned && D.ui) {
        c.warned = true;
        D.ui.think('My arms... let them rest a moment.', 3, true);
      }
    }
    const t = c.s / len;
    const p = ropePoint(t);
    h.pos.set(p.x, p.y - 1.95, p.z);
    h.vel.set(0, 0, 0);
    h.group.position.copy(h.pos);
    h.facing = Math.atan2(east.ropeTo.x - east.ropeFrom.x, east.ropeTo.z - east.ropeFrom.z) + (c.back ? Math.PI : 0);
    h.group.rotation.y = h.facing;
    // across (or back where you started)
    if ((!c.back && c.s >= len - 0.05) || (c.back && c.s <= 0.05)) {
      const farSide = !c.back;
      east.crossing = null;
      h.cancelAction();
      const to = farSide ? { x: TREE.x - 1.6, z: TREE.z + 1.2 } : { x: WEST_POST.x - 1.4, z: WEST_POST.z };
      h.teleport(to.x, to.z, farSide ? Math.PI / 2 : -Math.PI / 2);
      east.side = farSide ? 'east' : 'west';
      if (farSide) east.crossed = true;
      if (D.story) D.story.on('crossed', farSide ? 'east' : 'west');
    } else if (!c.back && c.s <= 0.05 && want < 0) {
      east.crossing = null;
      h.cancelAction();
      h.teleport(WEST_POST.x - 1.4, WEST_POST.z, -Math.PI / 2);
    }
  }

  // ---------- Walking about it ----------

  // The boulder (until it is moved), its rubble, the ravine's rims (no walking off them), the
  // crag of the overhang.
  east.collide = (pos, r) => {
    if (pos.x < 236 || pos.x > 700) return;
    const push = (cx, cz, cr) => {
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < cr + r && d > 1e-4) {
        pos.x = cx + (dx / d) * (cr + r);
        pos.z = cz + (dz / d) * (cr + r);
      }
    };
    if (pos.x < 262) {
      if (!east.cleared) push(BOULDER.x, BOULDER.z, BOULDER.r);
      for (const q of east.rubble || []) push(q.x, q.z, q.r);
    }
    // the ravine: never over the edge
    if (pos.x > 318 && pos.x < 365 && pos.z > -25 && pos.z < 95) {
      const rx = ravineX(pos.z);
      if (pos.x < rx) pos.x = Math.min(pos.x, rx - 8.1);
      else pos.x = Math.max(pos.x, rx + 8.1);
    }
    for (const q of east.overhangSolid || []) push(q.x, q.z, q.r);
    // the gorge: not over its edge either (the bridge is for Chapter 4)
    if (pos.x > 520 && pos.z > -150 && pos.z < 40) {
      const rx = E.riverX(pos.z);
      if (pos.x < rx) pos.x = Math.min(pos.x, rx - 20.5);
    }
  };

  // ---------- What E does here ----------

  east.target = (x, z) => {
    const out = [];
    const ch = D.ch3;
    // the rope: across, and back
    if (east.rope && !east.crossing) {
      if (Math.hypot(x - WEST_POST.x, z - WEST_POST.z) < 2.6) out.push({ x: WEST_POST.x, z: WEST_POST.z, reach: 2.6, bias: -0.6, label: 'Cross the ravine on the rope (hold W)', act: () => startCrossing(false) });
      if (Math.hypot(x - TREE.x, z - TREE.z) < 3.2) out.push({ x: TREE.x, z: TREE.z, reach: 3.2, bias: -0.4, label: 'Cross back on the rope', act: () => startCrossing(true) });
    }
    // the cotton
    for (const c of east.cotton || []) {
      if (D.items.taken.has(c.id) || Math.hypot(c.x - x, c.z - z) > 2.4) continue;
      out.push({ x: c.x, z: c.z, reach: 2.2, bias: -0.2, label: 'Pick wild cotton', act: () => D.items.harvest({ ...c, label: 'Picking cotton' }, 'gather', 1.4, () => {
        D.items.add('cotton', 2);
        east.refreshCotton();
      }, () => D.audio && D.audio.rustle()) });
    }
    // the hiker's compass
    if (east.hiker && !D.items.taken.has('compass') && Math.hypot(HIKER.x - x, HIKER.z - z) < 2.6) {
      out.push({ x: HIKER.x, z: HIKER.z, reach: 2.6, bias: -0.5, label: 'Take the compass from his hand', act: () => D.items.harvest({ id: 'compass', x: HIKER.x, z: HIKER.z, label: 'Taking the compass' }, 'gather', 1.6, () => {
        D.items.add('compass', 1);
        east.refreshCotton();
        if (D.story) D.story.on('compass');
      }) });
    }
    const more = ch && ch.eastTargets ? ch.eastTargets(x, z) : null;
    if (more) out.push(...more);
    return out.length ? out : null;
  };
  D.items.extraTargets.push((x, z) => (x > 236 ? east.target(x, z) : null));

  // ---------- Moving the boulder ----------

  east.setLever = () => {
    east.lever.visible = true;
  };
  east.clearPass = (animate = true) => {
    east.lever.visible = !animate ? false : east.lever.visible;
    const from = east.boulderHome.clone();
    const to = new THREE.Vector3(BOULDER.x + 1.5, y(BOULDER.x + 1.5, BOULDER.z - 6) - 1.1, BOULDER.z - 6);
    if (!animate) {
      east.boulder.position.copy(to);
      east.boulder.rotation.set(1.2, 1.4, 0.9);
      east.cleared = true;
      L.edge.maxX = 700;
      return;
    }
    east.rolling = { t: 0, from, to };
    if (D.audio) D.audio.rumble();
  };
  function updateRolling(dt) {
    const r = east.rolling;
    if (!r) return;
    r.t += dt / 2.6;
    const k = smooth(Math.min(1, r.t));
    east.boulder.position.lerpVectors(r.from, r.to, k);
    east.boulder.position.y += Math.sin(k * Math.PI) * 0.8;
    east.boulder.rotation.set(0.3 + k * 0.9, 1.2 + k * 0.2, 0.2 + k * 0.7);
    if (r.t >= 1) {
      east.rolling = null;
      east.lever.visible = false;
      east.cleared = true;
      L.edge.maxX = 700;
      D.env.shake = Math.max(D.env.shake, 0.5);
      if (D.story) D.story.on('passCleared');
    }
  }

  // ---------- Building, each frame, saving ----------

  east.build = () => {
    buildRockslide();
    buildRavine();
    buildCar();
    buildSign();
    buildHiker();
    buildCotton();
    buildOverhang();
    buildBridge();
    buildVillage();
    east.refreshCotton();
  };

  east.update = (dt, time) => {
    if (!east.boulder) return;
    // none of it can be seen from the valley (the mountains are in the way): drawn only out here
    const out = D.hero.pos.x > 190 || D.camera.position.x > 190;
    if (east.group.visible !== out) {
      east.group.visible = out;
      if (east.hiker) east.hiker.group.visible = out;
    }
    updateRolling(dt);
    if (dt > 0) {
      updateCrossing(dt);
      updateWolves(dt);
    }
    // the rope paying out behind a rope arrow
    if (flying && flying.arrow) {
      const pos = flying.line.geometry.attributes.position;
      pos.setXYZ(1, flying.arrow.pos.x, flying.arrow.pos.y, flying.arrow.pos.z);
      pos.needsUpdate = true;
    }
    // the village lives only when you can see it
    const h = D.hero.pos;
    const near = h.x > 470 || (D.ch3 && D.ch3.showVillage && D.ch3.showVillage());
    if (east.villageGroup && east.villageGroup.visible !== !!near) east.showVillage(!!near);
    if (near) {
      for (const s of east.smoke) {
        for (const p of s.puffs) {
          const t = (p.userData.t + time * 0.06) % 1;
          p.position.set(s.x + Math.sin(t * 5 + s.x) * t * 1.6, s.y + t * 9, s.z + t * 2.5);
          p.scale.setScalar(0.8 + t * 3.4);
          p.material.opacity = 0.5 * (1 - t);
        }
      }
      // the villagers about their day: a few steps here and there
      for (const p of east.villagers) {
        if (p.mode !== 'idle') continue;
        p.next -= dt;
        if (p.next <= 0) {
          p.next = 6 + Math.random() * 10;
          const a = Math.random() * 6.3;
          D.people.goTo(p, p.home.x + Math.cos(a) * p.wander, p.home.z + Math.sin(a) * p.wander, { speed: 1.1, onArrive: (q) => D.people.stand(q, null) });
        }
      }
    }
  };

  east.save = () => ({ cleared: east.cleared, rope: east.rope, crossed: east.crossed, side: east.side || 'west' });
  east.load = (s) => {
    east.rope = !!(s && s.rope);
    east.crossed = !!(s && s.crossed);
    east.side = (s && s.side) || 'west';
    if (east.ropeMesh) east.ropeMesh.visible = east.rope;
    if (east.rope) showRope();
    if (s && s.cleared) east.clearPass(false);
    else {
      east.cleared = false;
      L.edge.maxX = L.bounds.maxX;
      if (east.boulder) {
        east.boulder.position.copy(east.boulderHome);
        east.boulder.rotation.set(0.3, 1.2, 0.2);
      }
      if (east.lever) east.lever.visible = false;
    }
    east.refreshCotton();
    east.clearWolves();
  };
  // before the pass is cleared the hero may come as far as the boulder
  east.reachBoulder = () => {
    if (!east.cleared) L.edge.maxX = Math.max(L.edge.maxX, BOULDER.x - BOULDER.r - 0.2);
  };

  D.east = east;
})();
