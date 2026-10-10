// The New Dawn: what there is to find, carry, eat and make.
//
// Only what lies easily to hand: fallen fruit and berries, sticks and stones, flint on the
// rocky rise, fibrous grass, young saplings, and deeper in the jungle sturdy fallen branches,
// big leaves and hanging vines. E picks up or uses whatever is in front of him; Q eats;
// Tab opens the kit, where things are made.
(() => {
  'use strict';
  const D = window.Dawn;
  const { seeded } = D;
  const T = D.terrain;
  const L = D.LAYOUT;

  // ---------- What things are ----------

  const ITEMS = {
    mango: { name: 'Mango', plural: 'Mangoes', food: 24, water: 8, color: '#f0a23a', desc: 'Ripe fruit: the most filling food here. Q eats.' },
    banana: { name: 'Banana', plural: 'Bananas', food: 18, water: 4, color: '#f2d45c', desc: 'Quick energy. Q eats.' },
    berries: { name: 'Berries', plural: 'Berries', food: 8, water: 5, color: '#c22f4a', desc: 'A handful of red berries. Q eats.' },
    coconut: { name: 'Coconut', plural: 'Coconuts', food: 12, water: 24, color: '#7a5634', desc: 'Its water quenches thirst as well as hunger. Q eats.' },
    stick: { name: 'Stick', plural: 'Sticks', color: '#9a7449', desc: 'Straight sticks become arrow shafts (2 sticks + 1 flint = 2 arrows), torches, firewood.',
      where: 'Lying on the ground in the forest, round the clearing and on Flint Rise; dead wood lies under the Elder Tree too. E picks one up.' },
    stone: { name: 'Stone', plural: 'Stones', color: '#a19d94', desc: 'An ordinary stone: a hammer, in a pinch, and a fire ring.',
      where: 'Lying on the ground in the forest, round the clearing and on Flint Rise. E picks one up.' },
    flint: { name: 'Flint', plural: 'Flint', color: '#4a5059', desc: 'Dark, glassy stone that breaks into razor edges. 2 make a flint blade; 1 tips 2 arrows.',
      where: 'Dark, almost black stones on Flint Rise, the rocky ground east of the clearing.' },
    leaves: { name: 'Leaves', plural: 'Leaves', color: '#5f8f3c', desc: 'Fern fronds: bedding for the shelter floor.',
      where: 'From ferns, all over the forest and jungle floor: E on a fern gathers 3.' },
    fiber: { name: 'Plant fibre', plural: 'Plant fibre', color: '#cdb86c', desc: 'Tough strands from the tall yellow grass. 3 twist into a cord; dry, it is tinder.',
      where: 'Pulled from the tall yellow grass on Flint Rise: E gives 2 fibres a clump.' },
    branch: { name: 'Sturdy branch', plural: 'Sturdy branches', color: '#6b4f31', desc: 'Thick and strong: the frame and floor of the shelter.',
      where: 'Ready made: long, thick branches lying on the ground. Most are in the Deep Jungle along the trail north of the gorge; a few in the forest and the clearing. E picks one up.' },
    vine: { name: 'Vine', plural: 'Vines', color: '#4f6d2d', desc: 'Jungle rope: lashes the shelter together.',
      where: 'Ready made: hanging from the big trees beside the jungle paths, north of the gorge. E pulls one down.' },
    big_leaf: { name: 'Big leaf', plural: 'Big leaves', color: '#3c7f37', desc: 'Huge, waxy and waterproof: thatch for the shelter roof.',
      where: 'Cut from banana plants and elephant-ear plants in the jungle: E cuts 2 at a time.' },
    stave: { name: 'Bow stave', plural: 'Bow staves', color: '#a87a4a', desc: 'A young, springy sapling, cut to length. With a cord, it becomes a bow.' },
    cord: { name: 'Cord', plural: 'Cord', color: '#bfa36a', desc: 'Twisted fibre: the bow\'s string.' },
    arrow: { name: 'Arrow', plural: 'Arrows', color: '#d9c7a1', desc: 'A stick with a flint point. Pick them back up after shooting.' },
    blade: { name: 'Flint blade', plural: 'Flint blades', color: '#2f3640', tool: true, desc: 'A sharp flint flake in a wooden grip: cuts saplings, needed for the bow and arrows. Press 2 to hold it.' },
    bow: { name: 'Bow', plural: 'Bows', color: '#8a5b2e', tool: true, desc: 'Press 3 to hold it. Right mouse aims, left mouse draws, let go to shoot.' },
    // Chapter 2
    digstick: { name: 'Digging stick', plural: 'Digging sticks', color: '#a07a4a', tool: true, desc: 'A stick with a sharpened end: digs clay out of the bank.',
      where: 'Make it in the kit (Tab, Make): 1 stick, shaped with the flint blade.' },
    clay: { name: 'Clay', plural: 'Clay', color: '#8f8a7e', desc: 'Grey river clay. Shaped and baked, it holds water.',
      where: 'Grey patches in the bank at the Clay Banks, where the stream from the pond runs into the river, west of the clearing. E digs it, with a digging stick.' },
    pot: { name: 'Clay pot', plural: 'Clay pots', color: '#b4704a', desc: 'Baked clay: it holds water and can sit in the fire.',
      where: 'Shape 2 clay at your fire (Tab, At the fire); it bakes hard in the embers.' },
    pot_water: { name: 'Pot of water', plural: 'Pots of water', color: '#4f86b8', desc: 'A clay pot full of clean water.',
      where: 'E at the edge of the pond or the stream, with an empty clay pot.' },
    resin: { name: 'Resin', plural: 'Resin', color: '#d99a2b', desc: 'Sticky tree sap: it burns slowly and brightly.',
      where: 'Amber beads on the bark of the Elder Tree, at the end of the jungle trail. E with the flint blade cuts them off.' },
    torch: { name: 'Torch', plural: 'Torches', color: '#e0703a', desc: 'A stick wrapped in fibre and resin: about three minutes of light. Press 4 to hold it.',
      where: 'Make it in the kit (Tab, Make): 1 stick, 1 plant fibre, 1 resin. Light it at your fire.' },
    ash: { name: 'Wood ash', plural: 'Wood ash', color: '#b9b6ae', desc: 'Fine grey ash. Poured through it, nitre water turns to saltpetre.',
      where: 'Builds up in a burning fire: E at the fire scoops it out.' },
    nitre: { name: 'Nitre crust', plural: 'Nitre crust', color: '#e8e4d6', desc: 'White crystals off the cave walls: the nitrate the bats left.',
      where: 'White crust on the walls of the Nitre Galleries, through the crack in the cave tunnel. Bring a lit torch; E with the flint blade scrapes it.' },
    revonite: { name: 'Revonite shard', plural: 'Revonite shards', color: '#3ddc97', desc: 'The green, glowing mineral: the catalyst that let the stone give way.',
      where: 'The great green vein in the far gallery of the Nitre Galleries. E chips shards off with a stone.' },
    saltpetre: { name: 'Saltpetre', plural: 'Saltpetre', color: '#f4f1e8', desc: 'White nitrate crystals, boiled clean.',
      where: 'Made at your fire (Tab, At the fire): 6 nitre crust, 1 wood ash and a pot of water, boiled down.' },
    fluid: { name: 'Revival fluid', plural: 'Revival fluid', color: '#63ffb4', desc: 'Saltpetre water with crushed Revonite, warmed: one dose, to wake one person.',
      where: 'Made at your fire (Tab, At the fire): 2 saltpetre, 3 Revonite shards and a pot of water.' },
    // Chapter 3
    axe: { name: 'Stone axe', plural: 'Stone axes', color: '#5d6168', tool: true, desc: 'A flint head glued and lashed to a handle: it fells young trees for poles.',
      where: 'Make it in your kit (Tab, Make): 1 flint, 1 stick, 1 vine and 1 resin for glue.' },
    pole: { name: 'Pole', plural: 'Poles', color: '#8a6a42', desc: 'A straight young trunk: posts, beams and racks for the lab.',
      where: 'Young trees with thin, pale trunks, round the Elder Tree and along the trail south of it: E with the stone axe (2 poles each).' },
    spear: { name: 'Spear', plural: 'Spears', color: '#9b7b50', tool: true, desc: 'Press 5 to hold it. Left mouse jabs: a long reach and a hard hit.',
      where: 'Make it in your kit (Tab, Make): 1 bow stave, 1 flint, 1 vine. A stave comes from a sapling.' },
    rope: { name: 'Rope', plural: 'Rope', color: '#c9a86a', desc: 'Long and strong: plant fibre braided by Mira.',
      where: 'Give Mira 8 plant fibre (E by her) and she braids it. Fibre: the tall yellow grass.' },
    rope_arrow: { name: 'Rope arrow', plural: 'Rope arrows', color: '#d8b77a', desc: 'An arrow with the rope tied on: shoot it into the big tree across the ravine.',
      where: 'Make it in your kit (Tab, Make): 1 arrow, 1 rope.' },
    compass: { name: 'Compass', plural: 'Compasses', color: '#b8c4cf', tool: true, desc: 'A hiker\'s compass, its needle still swinging north after a thousand years. North shows on your screen.',
      where: 'In the hand of the stone hiker on the High Meadow.' },
    cotton: { name: 'Wild cotton', plural: 'Wild cotton', color: '#f2efe6', desc: 'Soft white bolls from a wild cotton plant: Mira makes bandages of it.',
      where: 'White, fluffy plants on the High Meadow, along the old road (E).' },
    bandage: { name: 'Bandage', plural: 'Bandages', heal: 40, color: '#efe6d2', desc: 'Clean cotton, rolled tight. Q binds a wound when you are hurt (+40 health).',
      where: 'Give Mira 6 wild cotton (E by her): she makes 3.' },
  };

  const RECIPES = [
    { id: 'blade', name: 'Flint blade', needs: { flint: 2 }, makes: { blade: 1 }, once: true, time: 2.5,
      desc: 'Strike one flint on another until a sharp edge flakes away. Cuts saplings, vines and leaves.' },
    { id: 'cord', name: 'Cord', needs: { fiber: 3 }, makes: { cord: 1 }, time: 2,
      desc: 'Twist plant fibres together into a strong cord.' },
    { id: 'bow', name: 'Bow', needs: { stave: 1, cord: 1 }, makes: { bow: 1 }, tool: 'blade', once: true, time: 3.5,
      desc: 'Shave the stave thin at the ends, notch it, and string it with cord. Hold right to aim, left to draw.' },
    { id: 'arrows', name: 'Arrows (2)', needs: { stick: 2, flint: 1 }, makes: { arrow: 2 }, tool: 'blade', time: 2.5,
      desc: 'Shave two straight sticks and bind a sharp flake of flint to each.' },
    // Chapter 2 (shown once it begins)
    { id: 'digstick', name: 'Digging stick', needs: { stick: 1 }, makes: { digstick: 1 }, tool: 'blade', once: true, time: 2, chapter: 2, page: 'clay',
      desc: 'Sharpen one end of a stick: it digs the clay out of the river bank.' },
    { id: 'torch', name: 'Torch', needs: { stick: 1, fiber: 1, resin: 1 }, makes: { torch: 1 }, time: 2, chapter: 2, page: 'torches',
      desc: 'Wrap fibre round the end of a stick and smear it with resin. Light it at your fire; it burns about three minutes.' },
    // Chapter 3 (some only once someone has shown you how)
    { id: 'axe', name: 'Stone axe', needs: { flint: 1, stick: 1, vine: 1, resin: 1 }, makes: { axe: 1 }, once: true, time: 3.5, chapter: 3, page: 'axe',
      desc: 'Knock a flint into a wedge, set it in a split stick with warm resin, and lash it tight with vine. It fells young trees.' },
    { id: 'spear', name: 'Spear', needs: { stave: 1, flint: 1, vine: 1 }, makes: { spear: 1 }, tool: 'blade', once: true, time: 3, chapter: 3, page: 'spear',
      show: () => !!(D.story && D.story.flags.spearShown),
      desc: 'A long, straight stave with a flint point bound to the end. Garron\'s way: reach, and your weight behind it.' },
    { id: 'rope_arrow', name: 'Rope arrow', needs: { arrow: 1, rope: 1 }, makes: { rope_arrow: 1 }, time: 2, chapter: 3, page: 'rope',
      show: () => D.items.has('rope') || D.items.has('rope_arrow'),
      desc: 'Tie the rope fast behind the arrow\'s head and coil the rest so it pays out clean.' },
  ];

  const items = {
    ITEMS, RECIPES,
    inv: {},
    things: [], // everything E can be used on
    target: null,
    taken: new Set(), // ids of things picked up or used up, for saving
    stats: { eaten: 0, made: 0, gathered: 0, examined: 0, drank: 0 },
    group: new THREE.Group(),
  };
  D.scene.add(items.group);

  items.count = (key) => items.inv[key] || 0;
  items.has = (key, n = 1) => items.count(key) >= n;
  items.add = (key, n = 1, quiet = false) => {
    items.inv[key] = items.count(key) + n;
    if (!quiet && D.ui) D.ui.toast(`<b>+${n}</b> ${n > 1 ? ITEMS[key].plural : ITEMS[key].name}`);
    if (D.story) D.story.on('gained', { key, n });
  };
  items.remove = (key, n = 1) => {
    items.inv[key] = Math.max(0, items.count(key) - n);
  };

  // ---------- The look of things ----------

  const bark = () => D.photo('bark', 'color');
  let mats = null;
  function materials() {
    if (mats) return mats;
    mats = {
      wood: new THREE.MeshStandardMaterial({ map: bark(), normalMap: D.photo('bark', 'normal'), color: D.col(0xb09a80), roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: D.col(0x9c988e), roughness: 0.9 }),
      flint: new THREE.MeshStandardMaterial({ color: D.col(0x3a3f48), roughness: 0.32, metalness: 0.05 }),
      coconut: new THREE.MeshStandardMaterial({
        roughness: 0.95,
        map: D.canvasTexture(128, 128, (g, w, h) => {
          g.fillStyle = '#5a3b22';
          g.fillRect(0, 0, w, h);
          for (let n = 0; n < 900; n++) {
            g.strokeStyle = `rgba(${120 + Math.random() * 60},${80 + Math.random() * 40},${40 + Math.random() * 20},0.5)`;
            g.beginPath();
            const x = Math.random() * w;
            const y = Math.random() * h;
            g.moveTo(x, y);
            g.lineTo(x + (Math.random() - 0.5) * 6, y + 6 + Math.random() * 8);
            g.stroke();
          }
        }),
      }),
      berry: new THREE.MeshStandardMaterial({ color: D.col(0xb3203f), roughness: 0.3 }),
      leafBush: null,
      fiber: null,
    };
    return mats;
  }

  // A stick or a branch: a tapering, slightly crooked length of wood with a stub or two.
  function branchGeometry(length, radius, seed) {
    const random = seeded(seed);
    const parts = [];
    const main = new THREE.CylinderGeometry(radius * 0.6, radius, length, 7, 4);
    const p = main.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / length;
      p.setX(i, p.getX(i) + Math.sin(y * 4 + seed) * radius * 0.8);
    }
    main.rotateZ(Math.PI / 2); // lying along x
    parts.push(main);
    for (let k = 0; k < 2; k++) {
      const len = length * (0.15 + random() * 0.15);
      const stub = new THREE.CylinderGeometry(radius * 0.25, radius * 0.45, len, 5);
      stub.translate(0, len / 2, 0);
      stub.rotateZ(-0.9 + random() * 0.4);
      stub.rotateX((random() - 0.5) * 1.5);
      stub.translate((random() - 0.5) * length * 0.6, 0, 0);
      parts.push(stub);
    }
    const g = D.models.joinGeometries(parts);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * length * 0.8);
    g.computeVertexNormals();
    return g;
  }

  // Kinds of pickups: the geometry, the material, how it lies.
  const PICKUP = {};
  function pickupKinds() {
    const m = materials();
    const rocks = D.models.part('rocks', 'stone');
    const stoneGeo = rocks.length ? rocks[0].geometry : new THREE.DodecahedronGeometry(0.1);
    const mango = D.models.part('mango');
    const banana = D.models.part('bananas');
    Object.assign(PICKUP, {
      stick: { geo: branchGeometry(0.8, 0.02, 3), mat: m.wood, y: 0.02, reach: 1.7 },
      branch: { geo: branchGeometry(2.1, 0.055, 7), mat: m.wood, y: 0.05, reach: 2.2 },
      stone: { geo: stoneGeo, mat: m.stone, scale: 0.75, y: 0.02, reach: 1.6, tilt: true },
      flint: { geo: stoneGeo, mat: m.flint, scale: 0.6, y: 0.02, reach: 1.6, tilt: true },
      coconut: { geo: new THREE.SphereGeometry(0.11, 12, 9).scale(1, 0.85, 1), mat: m.coconut, y: 0.09, reach: 1.6 },
      mango: mango.length ? { geo: mango[0].geometry, mat: mango[0].material, scale: 1.4, y: 0.0, reach: 1.6 } : { geo: new THREE.SphereGeometry(0.06), mat: m.berry, y: 0.05, reach: 1.6 },
      banana: banana.length ? { geo: banana[0].geometry, mat: banana[0].material, scale: 1.3, y: 0.0, reach: 1.6 } : { geo: new THREE.SphereGeometry(0.06), mat: m.berry, y: 0.05, reach: 1.6 },
    });
  }

  // ---------- Placing them ----------

  // Somewhere for a thing to lie in a zone: dry, not too steep, not in a trunk.
  function spotIn(random, zones, near = null, spread = 0, tries = 80) {
    for (let t = 0; t < tries; t++) {
      let x;
      let z;
      if (near) {
        const a = random() * Math.PI * 2;
        const d = Math.sqrt(random()) * spread;
        x = near[0] + Math.cos(a) * d;
        z = near[1] + Math.sin(a) * d;
      } else {
        x = L.bounds.minX + random() * (L.bounds.maxX - L.bounds.minX);
        z = L.bounds.minZ + random() * (L.bounds.maxZ - L.bounds.minZ);
      }
      if (zones && !zones.includes(T.zoneAt(x, z))) continue;
      if (T.waterAt(x, z)) continue;
      if (T.normal(x, z).y < 0.8) continue;
      if (Math.abs(x - T.riverX(z)) < T.riverHalf(z) + 6) continue;
      if (D.flora.trunkHit(x, T.height(x, z) + 0.5, z, 0.4)) continue;
      return [x, z];
    }
    return null;
  }

  let nextId = 0;
  const instanced = {}; // type -> { mesh, list }
  function addPickup(type, x, z, turn = 0) {
    const thing = { id: `p${nextId++}`, kind: 'pickup', type, x, z, y: T.height(x, z), turn, gone: false };
    items.things.push(thing);
    (instanced[type] || (instanced[type] = { list: [] })).list.push(thing);
    return thing;
  }

  const dummy = new THREE.Object3D();
  function drawPickups() {
    for (const [type, entry] of Object.entries(instanced)) {
      const kind = PICKUP[type];
      // room for more (fruit shaken down from the trees); made again if ever outgrown
      if (entry.mesh && entry.mesh.instanceMatrix.count < entry.list.length) {
        items.group.remove(entry.mesh);
        entry.mesh.dispose();
        entry.mesh = null;
      }
      if (!entry.mesh) {
        entry.mesh = new THREE.InstancedMesh(kind.geo, kind.mat, entry.list.length + 24);
        entry.mesh.castShadow = true;
        entry.mesh.receiveShadow = true;
        items.group.add(entry.mesh);
      }
      let n = 0;
      for (const t of entry.list) {
        if (t.gone) continue;
        dummy.position.set(t.x, t.y + kind.y, t.z);
        dummy.rotation.set(kind.tilt ? 1.2 : 0, t.turn, kind.tilt ? 0.4 : 0);
        dummy.scale.setScalar(kind.scale || 1);
        dummy.updateMatrix();
        entry.mesh.setMatrixAt(n++, dummy.matrix);
      }
      entry.mesh.count = n;
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  items.redraw = drawPickups;

  // ---------- Things that grow: fruit trees, bushes, fibre grass, saplings, vines ----------

  const MANGO_TREES = [[-8, 97], [24, 70], [-58, 104], [41, 206]];
  const BUSHES = [[-31, 121], [-2, 129], [-44, 58], [15, 93], [51, 151], [-29, 197], [-70, 86]];
  const FIBRE = [[96, 52], [108, 84], [122, 60], [141, 74], [133, 101], [113, 112], [150, 96], [90, 96], [-40, 62], [-58, 70], [-30, 92], [86, 70]];
  const SAPLINGS = [[89, 79], [113, 47], [139, 66], [128, 106], [153, 89], [104, 103], [97, 63]];
  for (const [x, z] of MANGO_TREES) {
    D.flora.fixed.push({ kind: 'canopy2', x, z, turn: x * 0.3, s: 0.42 });
    D.flora.reserved.push([x, z, 3.5]);
  }
  for (const [x, z] of [...BUSHES, ...SAPLINGS]) D.flora.reserved.push([x, z, 1.5]);

  // A berry bush: a low dome of leaf cards, studded with red berries.
  let bushParts = null;
  function bushGeometry() {
    if (bushParts) return bushParts;
    const random = seeded(99);
    const cards = [];
    const d = new THREE.Object3D();
    for (let i = 0; i < 26; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 0.7;
      d.position.set(Math.cos(a) * r, 0.25 + random() * 0.6 * (1 - r * 0.6), Math.sin(a) * r);
      d.rotation.set(-Math.PI / 2 + (random() - 0.5) * 1.6, random() * 6.3, (random() - 0.5) * 1.6);
      d.scale.setScalar(0.75 + random() * 0.4);
      d.updateMatrix();
      const c = new THREE.PlaneGeometry(1, 1);
      c.applyMatrix4(d.matrix);
      const nrm = c.attributes.normal;
      for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
      cards.push(c);
    }
    const leaves = D.models.joinGeometries(cards);
    const berries = [];
    for (let i = 0; i < 40; i++) {
      const a = random() * Math.PI * 2;
      const r = 0.25 + random() * 0.5;
      const b = new THREE.SphereGeometry(0.028, 6, 4);
      b.translate(Math.cos(a) * r, 0.35 + random() * 0.45, Math.sin(a) * r);
      berries.push(b);
    }
    const berryGeo = D.models.joinGeometries(berries);
    const leafMat = D.flora && D.flora.kinds.canopy ? D.flora.kinds.canopy.near[1].material : new THREE.MeshStandardMaterial({ color: 0x3a6a2a });
    bushParts = { leaves, berryGeo, leafMat };
    return bushParts;
  }

  // A hanging vine: a long rope of stem looping down out of the canopy, with leaves on it.
  // A liana: rooted in the ground a few strides out from a big tree, climbing up to it in a
  // sagging, twisting rope, with leaves along it. Local +x points at the trunk, `reach` away.
  function vineGeometry(top, reach, random) {
    const pts = [
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0.25, 0.9, 0.35),
      new THREE.Vector3(0.05, 2.2, -0.25),
      new THREE.Vector3(reach * 0.35, top * 0.42, 0.45 + random() * 0.4),
      new THREE.Vector3(reach * 0.7, top * 0.62, -0.3),
      new THREE.Vector3(reach * 0.92, top * 0.86, 0.2),
      new THREE.Vector3(reach, top, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const stem = new THREE.TubeGeometry(curve, 80, 0.055, 6, false);
    const leaves = [];
    for (let i = 0; i < 60; i++) {
      const t = 0.04 + random() ** 0.8 * 0.94;
      const p = curve.getPoint(t);
      const leaf = new THREE.PlaneGeometry(0.45, 0.6);
      leaf.translate(0, -0.22, 0);
      leaf.rotateY(random() * 6.3);
      leaf.rotateX((random() - 0.5) * 1.0);
      leaf.translate(p.x, p.y, p.z);
      leaves.push(leaf);
    }
    return { stem, leaves: D.models.joinGeometries(leaves) };
  }

  const growing = []; // things with meshes of their own (bushes, fibre grass, saplings, vines, mango trees)

  function buildGrowing() {
    const m = materials();
    const random = seeded(777);
    const bush = bushGeometry();
    // berry bushes
    BUSHES.forEach(([x, z], i) => {
      const y = T.height(x, z);
      const group = new THREE.Group();
      const leaves = new THREE.Mesh(bush.leaves, bush.leafMat);
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      const berries = new THREE.Mesh(bush.berryGeo, m.berry);
      berries.castShadow = true;
      group.add(leaves, berries);
      group.position.set(x, y - 0.05, z);
      group.rotation.y = i * 1.7;
      group.scale.setScalar(1.1 + (i % 3) * 0.15);
      items.group.add(group);
      growing.push({
        id: `bush${i}`, kind: 'bush', x, z, y, group, berries, reach: 2.2, gone: false,
        label: 'Pick berries', act: (t) => harvest(t, 'gather', 1.6, () => {
          items.add('berries', 4);
          t.berries.visible = false;
          t.gone = true;
        }),
      });
    });
    // fibre grass: tall clumps of tough yellow grass
    const grassParts = D.models.part('foliage', 'grassA');
    if (grassParts.length) {
      const fibreMat = D.foliageMaterial({ map: grassParts[0].material.map, alphaTest: 0.45, side: THREE.DoubleSide, color: D.col(0xe8d58a) });
      D.addWind(fibreMat, 0.07, 0.03);
      items.fibreMat = fibreMat;
      FIBRE.forEach(([x, z], i) => {
        const y = T.height(x, z);
        const group = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const g = new THREE.Mesh(grassParts[0].geometry, fibreMat);
          g.position.set((random() - 0.5) * 0.5, 0, (random() - 0.5) * 0.5);
          g.rotation.y = random() * 6.3;
          g.scale.set(1.3, 2.1 + random() * 0.6, 1.3);
          g.castShadow = true;
          group.add(g);
        }
        group.position.set(x, y - 0.05, z);
        items.group.add(group);
        growing.push({
          id: `fibre${i}`, kind: 'fibre', x, z, y, group, reach: 2, gone: false,
          label: 'Pull plant fibres', act: (t) => harvest(t, 'gather', 1.8, () => {
            items.add('fiber', 2);
            t.group.visible = false;
            t.gone = true;
          }),
        });
      });
    }
    // saplings: young straight trees, just right for a bow stave
    const sapMat = new THREE.MeshStandardMaterial({ map: bark(), color: D.col(0xc6a77e), roughness: 0.85 });
    const leafMat = bush.leafMat;
    SAPLINGS.forEach(([x, z], i) => {
      const y = T.height(x, z);
      const group = new THREE.Group();
      const height = 2.6 + random() * 0.6;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, height, 6).translate(0, height / 2, 0), sapMat);
      stem.castShadow = true;
      group.add(stem);
      for (let k = 0; k < 6; k++) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), leafMat);
        card.position.set((random() - 0.5) * 0.6, height - 0.3 + random() * 0.5, (random() - 0.5) * 0.6);
        card.rotation.set(-Math.PI / 2 + (random() - 0.5) * 1.4, random() * 6, 0);
        card.castShadow = true;
        group.add(card);
      }
      group.position.set(x, y - 0.05, z);
      items.group.add(group);
      growing.push({
        id: `sapling${i}`, kind: 'sapling', x, z, y, group, reach: 2, gone: false, needs: 'blade',
        label: 'Cut a bow stave', why: 'Needs a flint blade', act: (t) => harvest(t, 'cut', 3, () => {
          items.add('stave', 1);
          t.group.visible = false;
          t.gone = true;
        }, () => D.audio && D.audio.chop()),
      });
    });
    // mango trees: fruit up in the branches, a few fallen; shake the tree for more
    const mango = D.models.part('mango');
    MANGO_TREES.forEach(([x, z], i) => {
      const y = T.height(x, z);
      const hanging = [];
      if (mango.length) {
        for (let k = 0; k < 9; k++) {
          const a = random() * Math.PI * 2;
          const r = 1 + random() * 2.2;
          const f = new THREE.Mesh(mango[0].geometry, mango[0].material);
          f.position.set(x + Math.cos(a) * r, y + 5 + random() * 2.2, z + Math.sin(a) * r);
          f.scale.setScalar(1.5);
          f.rotation.set(Math.PI, random() * 6, 0);
          f.castShadow = true;
          items.group.add(f);
          hanging.push(f);
        }
      }
      for (let k = 0; k < 3; k++) {
        const s = spotIn(random, null, [x, z], 2.6, 30);
        if (s) addPickup('mango', s[0], s[1], random() * 6);
      }
      growing.push({
        id: `mangotree${i}`, kind: 'mangotree', x, z, y, reach: 2.8, gone: false, hanging,
        label: 'Shake the tree', act: (t) => harvest(t, 'shake', 1.8, () => {
          t.gone = true;
          // three fall
          for (let k = 0; k < 3; k++) {
            const f = t.hanging.pop();
            if (f) items.group.remove(f);
            const a = Math.random() * Math.PI * 2;
            const d = 1 + Math.random() * 1.5;
            addPickup('mango', t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, Math.random() * 6);
          }
          drawPickups();
          if (D.audio) D.audio.rustle();
          if (D.ui) D.ui.toast('Mangoes fell from the branches');
        }, () => D.audio && D.audio.rustle()),
      });
    });
  }

  // Vines in the deep jungle, hanging off the big trees near the paths north of the gorge.
  function buildVines() {
    const random = seeded(4321);
    const stemMat = new THREE.MeshStandardMaterial({ map: bark(), color: D.col(0xb3b07a), roughness: 0.9 });
    const leafMat = D.flora.kinds.canopy ? D.flora.kinds.canopy.near[1].material : stemMat;
    const trees = [...(D.flora.kinds.canopy ? D.flora.kinds.canopy.list : []), ...(D.flora.kinds.canopy2 ? D.flora.kinds.canopy2.list : [])]
      .filter((p) => p.z < -28 && p.z > -230 && T.pathDistance(p.x, p.z) < 26 && T.zoneAt(p.x, p.z) >= 6);
    const chosen = [];
    for (const p of trees.sort(() => random() - 0.5)) {
      if (chosen.length >= 20) break;
      if (chosen.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 9)) continue;
      chosen.push(p);
    }
    chosen.forEach((p, i) => {
      const a = random() * Math.PI * 2;
      const reach = 3 + random() * 1.5;
      const x = p.x + Math.cos(a) * (p.r + reach);
      const z = p.z + Math.sin(a) * (p.r + reach);
      const top = 9 + random() * 6;
      const geo = vineGeometry(top, reach + 0.1, random);
      const group = new THREE.Group();
      const stem = new THREE.Mesh(geo.stem, stemMat);
      const leaves = new THREE.Mesh(geo.leaves, leafMat);
      stem.castShadow = true;
      leaves.castShadow = true;
      group.add(stem, leaves);
      group.position.set(x, T.height(x, z), z);
      group.rotation.y = Math.PI - a; // local +x toward the trunk
      items.group.add(group);
      growing.push({
        id: `vine${i}`, kind: 'vine', x, z, y: T.height(x, z), group, reach: 2.2, gone: false,
        label: 'Pull down a vine', act: (t) => harvest(t, 'pull', 2, () => {
          items.add('vine', 1);
          t.group.visible = false;
          t.gone = true;
        }, () => D.audio && D.audio.rustle()),
      });
    });
  }

  // ---------- Scattering the pickups ----------

  function scatter() {
    const random = seeded(2468);
    const put = (type, count, zones, near = null, spread = 0) => {
      for (let n = 0; n < count; n++) {
        const s = spotIn(random, zones, near, spread);
        if (s) addPickup(type, s[0], s[1], random() * 6.3);
      }
    };
    // the clearing and the forest: sticks and stones, coconuts under the palms
    put('stick', 6, [2, 3], [-12, 125], 34);
    put('stick', 8, [2], [10, 180], 40);
    put('stick', 7, [3], [-10, 90], 45);
    put('stick', 6, [5], [115, 78], 40);
    put('stone', 8, [2, 3], [-6, 140], 50);
    put('stone', 6, [3], [-44, 76], 22);
    put('stone', 5, [5], [118, 76], 40);
    put('flint', 13, [5], [118, 78], 42);
    put('flint', 2, [3], [-40, 70], 12);
    put('branch', 3, [2], [0, 175], 40);
    put('branch', 2, [3], [-30, 110], 30);
    // the deep jungle: what the shelter needs
    put('branch', 9, [6, 7], [-20, -110], 70);
    put('branch', 6, [6, 7], [-45, -165], 30);
    put('banana', 4, [3], [-120, 100], 30);
    put('banana', 4, [6], [-10, -90], 50);
    // coconuts by the palms in the clearing
    const palms = (D.flora.kinds.palm ? D.flora.kinds.palm.list : []).filter((p) => T.zoneAt(p.x, p.z) === 3 && Math.hypot(p.x + 10, p.z - 95) < 90);
    palms.slice(0, 8).forEach((p) => {
      const s = spotIn(random, [3], [p.x, p.z], 2.5, 20);
      if (s) addPickup('coconut', s[0], s[1], random() * 6);
    });
    // a few things right outside the cave, so he learns to pick things up
    put('stick', 2, [1, 2], [16, 232], 8);
    put('stone', 2, [1, 2], [20, 230], 8);
  }

  items.build = () => {
    pickupKinds();
    buildGrowing();
    buildVines();
    scatter();
    drawPickups();
  };

  // ---------- Doing things ----------

  // A moment's work, then `done`.
  function harvest(t, pose, time, done, sound) {
    const h = D.hero;
    const face = Math.atan2(t.x - h.pos.x, t.z - h.pos.z);
    if (h.startAction(t.label, time, { pose, onDone: () => {
      done();
      items.taken.add(t.id);
      items.stats.gathered++;
      if (D.story) D.story.on('harvested', t);
    }, sound })) h.action.face = face;
  }

  function pickUp(t) {
    const h = D.hero;
    const face = Math.atan2(t.x - h.pos.x, t.z - h.pos.z);
    const quick = t.type !== 'branch';
    if (h.startAction(`Picking up`, quick ? 0.55 : 0.9, { pose: 'gather', onDone: () => {
      t.gone = true;
      items.taken.add(t.id);
      items.stats.gathered++;
      items.add(t.type, 1);
      drawPickups();
      if (D.audio) D.audio.pickup();
    } })) h.action.face = face;
  }

  items.eat = (key = null) => {
    const h = D.hero;
    if (h.action || h.dead) return;
    // hurt, with a bandage: that first
    if (key === 'bandage' || (!key && items.has('bandage') && h.stats.health < 70)) {
      if (!items.has('bandage')) return;
      if (h.stats.health > 97) {
        if (D.ui) D.ui.toast('You are not hurt', true);
        return;
      }
      h.startAction('Binding a wound', 1.6, { pose: 'gather', onDone: () => {
        items.remove('bandage', 1);
        h.stats.health = Math.min(100, h.stats.health + ITEMS.bandage.heal);
        if (D.story) D.story.on('bandaged');
      } });
      return;
    }
    const order = ['berries', 'banana', 'mango', 'coconut'];
    const food = key || order.find((k) => items.has(k));
    if (!food) {
      if (D.ui) D.ui.toast('You have nothing to eat', true);
      return;
    }
    if (h.stats.hunger > 97 && h.stats.thirst > 97) {
      if (D.ui) D.ui.toast('You are full', true);
      return;
    }
    h.startAction(`Eating ${ITEMS[food].name.toLowerCase()}`, 1.4, { pose: 'eat', onDone: () => {
      items.remove(food, 1);
      h.stats.hunger = Math.min(100, h.stats.hunger + ITEMS[food].food);
      h.stats.thirst = Math.min(100, h.stats.thirst + ITEMS[food].water);
      h.stats.health = Math.min(100, h.stats.health + 3);
      items.stats.eaten++;
      if (D.audio) D.audio.eat();
      if (D.story) D.story.on('ate', food);
    }, sound: () => D.audio && D.audio.eat() });
  };

  function drink() {
    const h = D.hero;
    if (h.stats.thirst > 98) {
      if (D.ui) D.ui.toast('You are not thirsty', true);
      return;
    }
    h.startAction('Drinking', 2.2, { pose: 'drink', onDone: () => {
      h.stats.thirst = Math.min(100, h.stats.thirst + 38);
      items.stats.drank++;
      if (D.story) D.story.on('drank');
    }, sound: () => D.audio && D.audio.drink() });
  }

  // Making something in the kit.
  items.canMake = (r) => {
    if (r.once && Object.keys(r.makes).some((k) => items.has(k))) return { ok: false, why: 'Made' };
    if (r.tool && !items.has(r.tool)) return { ok: false, why: `Needs a ${ITEMS[r.tool].name.toLowerCase()}` };
    for (const [k, n] of Object.entries(r.needs)) if (!items.has(k, n)) return { ok: false, why: 'Not enough' };
    return { ok: true };
  };
  items.make = (id) => {
    const r = RECIPES.find((x) => x.id === id);
    if (!r || !items.canMake(r).ok) return false;
    const h = D.hero;
    return h.startAction(`Making ${r.name.replace(/ \(.*\)/, '').toLowerCase()}`, r.time, { pose: 'build', fixed: true, onDone: () => {
      for (const [k, n] of Object.entries(r.needs)) items.remove(k, n);
      for (const [k, n] of Object.entries(r.makes)) items.add(k, n);
      items.stats.made++;
      if (D.audio) D.audio.craft();
      if (id === 'bow') items.setWeapon('bow');
      if (id === 'blade' && D.hero.weapon === 'hands') items.setWeapon('blade');
      if (D.story) D.story.on('made', id);
    }, sound: () => D.audio && D.audio.knap() });
  };

  // ---------- In hand ----------

  let bladeMesh = null;
  function bladeModel() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.025, 0.05);
    shape.lineTo(0.018, 0.13);
    shape.lineTo(0, 0.16);
    shape.lineTo(-0.018, 0.12);
    shape.lineTo(-0.022, 0.04);
    shape.lineTo(0, 0);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 }), materials().flint);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.07, 6).translate(0, -0.03, 0), materials().wood);
    g.add(blade, grip);
    return g;
  }
  // New copies of the things here, for pictures (the field notes, book.js).
  items.modelOf = (type) => {
    const kind = PICKUP[type];
    if (!kind) return new THREE.Group();
    const mesh = new THREE.Mesh(kind.geo, kind.mat);
    mesh.scale.setScalar(kind.scale || 1);
    return mesh;
  };
  items.bladeModel = () => bladeModel();
  items.fibreModel = () => {
    const g = new THREE.Group();
    const parts = D.models.part('foliage', 'grassA');
    if (!parts.length || !items.fibreMat) return g;
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(parts[0].geometry, items.fibreMat);
      m.position.set((k - 1) * 0.25, 0, (k % 2) * 0.2);
      m.rotation.y = k * 2.1;
      m.scale.set(1.3, 2.2 + k * 0.2, 1.3);
      g.add(m);
    }
    return g;
  };

  items.setWeapon = (w) => {
    const h = D.hero;
    if (w === 'blade' && !items.has('blade')) return;
    if (w === 'bow' && !items.has('bow')) return;
    if (w === 'torch' && !items.has('torch') && !(D.camp && D.camp.torchLit())) return;
    if (w === 'spear' && !items.has('spear')) return;
    h.weapon = w;
    if (!bladeMesh) {
      bladeMesh = bladeModel();
      bladeMesh.position.set(0, 0.08, 0.02);
      bladeMesh.rotation.set(0, 0, Math.PI);
      h.attach('blade', bladeMesh, 'handR');
    }
    bladeMesh.visible = w === 'blade';
    if (D.combat) D.combat.showBow(w === 'bow');
    if (D.camp) D.camp.showTorch(w === 'torch');
    if (D.combat && D.combat.showSpear) D.combat.showSpear(w === 'spear');
    if (D.ui) D.ui.hotbar();
  };

  // ---------- What is in front of him ----------

  const reachOf = (t) => t.reach || (t.kind === 'pickup' ? PICKUP[t.type].reach : 2);
  function findTarget() {
    const h = D.hero;
    if (!h.control || h.dead || h.action) return null;
    const x = h.pos.x;
    const z = h.pos.z;
    const fx = Math.sin(h.facing);
    const fz = Math.cos(h.facing);
    let best = null;
    let bestScore = Infinity;
    const consider = (t, label, act, extra = {}) => {
      const dx = t.x - x;
      const dz = t.z - z;
      const d = Math.hypot(dx, dz);
      const reach = extra.reach || reachOf(t);
      if (d > reach) return;
      const ahead = d < 0.5 ? 1 : (dx * fx + dz * fz) / d;
      if (ahead < -0.1) return;
      const score = d - ahead * 0.9 + (extra.bias || 0);
      if (score < bestScore) {
        bestScore = score;
        best = { thing: t, label, act, ...extra };
      }
    };
    for (const t of items.things) {
      if (t.gone || Math.abs(t.x - x) > 3 || Math.abs(t.z - z) > 3) continue;
      if (Math.abs(t.y - h.pos.y) > 1.5) continue;
      consider(t, `Pick up ${ITEMS[t.type].name.toLowerCase()}`, () => pickUp(t));
    }
    for (const t of growing) {
      if (t.gone || Math.abs(t.x - x) > 4 || Math.abs(t.z - z) > 4) continue;
      const blocked = t.needs && !items.has(t.needs);
      consider(t, t.label, () => t.act(t), { cannot: blocked ? t.why : null, bias: 0 }); // (ahead of drinking: water is everywhere on a bank)
    }
    // plants: ferns give leaves, banana and elephant-ear plants big leaves
    if (D.flora) {
      const p = D.flora.nearestGiving(x, z, h.facing, 2.2);
      if (p) {
        const gives = D.flora.gives(p);
        const label = gives === 'big_leaf' ? `Cut big leaves from the ${D.flora.kindName(p)}` : 'Gather leaves';
        consider(p, label, () => harvest({ x: p.x, z: p.z, id: `plant:${p.kind}:${p.id}`, label }, gives === 'big_leaf' ? 'cut' : 'gather', gives === 'big_leaf' ? 2.2 : 1.2, () => {
          D.flora.take(p);
          items.add(gives, gives === 'big_leaf' ? 2 : 3);
        }, () => D.audio && D.audio.rustle()), { bias: 1.0, reach: 2.6 }); // (things lying on the ground come first)
      }
    }
    // the petrified people
    if (D.statues) {
      const s = D.statues.nearest(x, z, h.facing, 2.8);
      if (s) consider(s, s.found ? 'Look again' : 'Examine', () => examine(s), { bias: -0.2, reach: 2.8 });
    }
    // water to drink: the edge of the pond, the stream or the river just ahead
    for (const ahead of [0, 0.9, 1.6, 2.3]) {
      const wx = x + fx * ahead;
      const wz = z + fz * ahead;
      const w = T.waterAt(wx, wz);
      if (w && w.depth > 0.04) {
        // (an arm's length ahead even when standing in the shallows, so a plant faced wins)
        consider({ x: x + fx * Math.max(0.9, Math.min(ahead, 1)), z: z + fz * Math.max(0.9, Math.min(ahead, 1)) }, 'Drink', drink, { reach: 2.4, bias: 0.4 });
        break;
      }
    }
    // the shelter, arrows lying about, and so on
    if (D.shelter && D.shelter.target) {
      const s = D.shelter.target(x, z, h.facing);
      if (s) consider(s, s.label, s.act, { cannot: s.cannot, reach: s.reach || 3, bias: -0.3 });
    }
    if (D.combat && D.combat.target) {
      const a = D.combat.target(x, z);
      if (a) consider(a, a.label, a.act, { reach: 2, bias: -0.1 });
    }
    // and whatever other parts of the game add (Chapter 2's fires, clay, crust...)
    for (const fn of items.extraTargets) {
      const found = fn(x, z, h.facing);
      if (!found) continue;
      for (const t of [].concat(found)) consider(t, t.label, t.act, { cannot: t.cannot || null, reach: t.reach || 2.2, bias: t.bias || 0 });
    }
    return best;
  }
  items.extraTargets = [];

  // ---------- For the rest of the game ----------

  // A new thing lying on the ground (dead wood, a dropped pot...).
  items.spawn = (type, x, z, turn = Math.random() * 6.28, id = null) => {
    const old = id && items.things.find((q) => q.id === id);
    if (old) return old;
    const t = addPickup(type, x, z, turn);
    if (id) {
      t.id = id;
      t.base = true; // part of the world: not saved as dropped, made again on load
    }
    t.gone = items.taken.has(t.id);
    drawPickups();
    return t;
  };
  // The nearest of a kind of thing still lying about, or still growing.
  items.nearestPickup = (type, x, z) => {
    let best = null;
    let bd = Infinity;
    for (const t of items.things) {
      if (t.gone || t.kind !== 'pickup' || t.type !== type) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };
  items.nearestGrowing = (kind, x, z) => {
    let best = null;
    let bd = Infinity;
    for (const t of growing) {
      if (t.gone || t.kind !== kind) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };
  // Things of a kind grow back (Chapter 2: the yellow grass, over the night).
  items.regrow = (kind) => {
    for (const t of growing) {
      if (t.kind !== kind || !t.gone) continue;
      t.gone = false;
      items.taken.delete(t.id);
      if (t.group) t.group.visible = true;
      if (t.berries) t.berries.visible = true;
    }
  };
  // A moment's work that takes something (marks it taken, counts it, tells the story).
  items.harvest = (t, pose, time, done, sound) => harvest(t, pose, time, done, sound);

  function examine(s) {
    const h = D.hero;
    const face = Math.atan2(s.x - h.pos.x, s.z - h.pos.z);
    h.action = null;
    h.facing = face;
    if (D.ui) D.ui.think(s.spot.thought, 5);
    if (!s.found) {
      s.found = true;
      items.stats.examined++;
      if (D.ui) D.ui.found();
      if (D.story) D.story.on('examined', s);
    }
  }

  items.update = () => {
    if (D.state.mode !== 'play' || D.state.panel) {
      items.target = null;
      if (D.ui) D.ui.prompt(null);
      return;
    }
    const input = D.input;
    items.target = findTarget();
    if (D.ui) D.ui.prompt(items.target);
    if (input.pressed.has('KeyE') && items.target) {
      if (items.target.cannot) {
        if (D.ui) D.ui.toast(items.target.cannot, true);
      } else items.target.act();
    }
    if (input.pressed.has('KeyQ')) items.eat();
    if (input.pressed.has('Digit1')) items.setWeapon('hands');
    if (input.pressed.has('Digit2')) items.setWeapon('blade');
    if (input.pressed.has('Digit3')) items.setWeapon('bow');
    if (input.pressed.has('Digit4')) items.setWeapon('torch');
    if (input.pressed.has('Digit5')) items.setWeapon('spear');
  };

  // ---------- Saving ----------

  items.save = () => ({
    inv: { ...items.inv },
    taken: [...items.taken],
    found: D.statues ? D.statues.list.filter((s) => s.found).map((s) => s.index) : [],
    weapon: D.hero.weapon,
    stats: { ...items.stats },
    shaken: growing.filter((t) => t.kind === 'mangotree' && t.gone).map((t) => t.id),
    dropped: items.things.filter((t) => t.kind === 'pickup' && !t.base).map((t) => ({ id: t.id, type: t.type, x: t.x, z: t.z })),
  });
  items.load = (s) => {
    items.inv = { ...(s.inv || {}) };
    items.taken = new Set(s.taken || []);
    Object.assign(items.stats, s.stats || {});
    // mangoes shaken down before: put them back where they fell
    for (const d of s.dropped || []) {
      if (!items.things.some((t) => t.id === d.id)) {
        const t = addPickup(d.type, d.x, d.z);
        t.id = d.id;
      }
    }
    for (const t of items.things) t.gone = items.taken.has(t.id);
    for (const t of growing) {
      t.gone = items.taken.has(t.id);
      if (t.group) t.group.visible = !t.gone || t.kind === 'bush';
      if (t.berries) t.berries.visible = !t.gone;
      if (t.kind === 'mangotree' && t.gone) for (const f of t.hanging.splice(0, 3)) items.group.remove(f);
    }
    if (D.statues) for (const s2 of D.statues.list) s2.found = (s.found || []).includes(s2.index);
    drawPickups();
    items.setWeapon(s.weapon || 'hands');
  };
  // what was placed at the start counts as part of the world, not as dropped
  const baseBuild = items.build;
  items.build = () => {
    baseBuild();
    for (const t of items.things) t.base = true;
  };

  D.items = items;
})();
