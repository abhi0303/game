// The New Dawn: Chapter 3, Two Roads.
//
// Two people are awake. Teo asks to wake his friend Mira, the artist, who stands in stone outside
// the cave where the bear has gone to ground: smoke drives it out, one more dose wakes her. With
// three of them, a lab: Teo and Mira make the pots while Ren fetches wood, leaves and minerals and
// builds it beside the shelter; the pots go on its racks with their names painted on, three doses
// are brewed, and Mira paints the first picture on its wall. Next morning Teo drags in a stone
// giant. Garron wakes, kills the bear with his hands, teaches a spear, and that evening says what
// he wants: to wake only the strong, and the rest to work for him. He takes every dose and goes.
// The three pack what is left (Mira hid the last Revonite in the CLAY pot) and go east over the
// mountains, toward the green ring: a rockslide (a lever), a ravine (a rope on an arrow), a
// meadow with what the old world left on it, wolves at dusk, and at last a river, a bridge, and on
// the far side a village of living people.
//
// As in Chapter 2: the card says what to do, the waypoint shows where (the nearest place to get
// whatever is still short), the kit and the field notes say how; and if a minute goes by with
// nothing done, one of the others says what next.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, smoothstep, seeded } = D;
  const T = D.terrain;
  const L = D.LAYOUT;
  const C = D.CAVE;
  const REN = 'Ren';
  const TEO = 'Teo';
  const MIRA = 'Mira';
  const GARRON = 'Garron';

  const STAGES = ['c3talk', 'c3bear', 'c3dose', 'c3mira', 'c3home', 'c3axe', 'c3lab', 'c3minerals', 'c3labelled', 'c3brew', 'c3night',
    'c3giant', 'c3garron', 'c3strong', 'c3argue', 'c3jungle', 'c3pack', 'c3pass', 'c3ravine', 'c3meadow', 'c3wolves', 'c3river', 'c3end'];
  const HOURS = {
    c3talk: [6.4, 6.9], c3bear: [6.9, 8.4], c3dose: [8.4, 11.2], c3mira: [11.2, 12.2], c3home: [12.2, 13], c3axe: [13, 13.6], c3lab: [13.6, 16.4],
    c3minerals: [14.5, 17.2], c3labelled: [17.2, 17.7], c3brew: [17.6, 18.9], c3night: [20, 21], c3giant: [6.2, 6.8], c3garron: [6.8, 7.6],
    c3strong: [7.6, 17.4], c3argue: [18.4, 19], c3jungle: [22.3, 23], c3pack: [5.6, 6.3], c3pass: [6.3, 9.4], c3ravine: [9.4, 12.6], c3meadow: [12.6, 17.2],
    c3wolves: [17.6, 19.4], c3river: [6.1, 7.4], c3end: [7, 7.5],
  };
  // what the title's Continue says for each
  const TITLES = {
    c3talk: 'Ch. 3: Teo\'s request', c3bear: 'Ch. 3: The bear in the cave', c3dose: 'Ch. 3: One more dose', c3mira: 'Ch. 3: Mira', c3home: 'Ch. 3: Home',
    c3axe: 'Ch. 3: A stone axe', c3lab: 'Ch. 3: Building the lab', c3minerals: 'Ch. 3: Minerals', c3labelled: 'Ch. 3: Labelled', c3brew: 'Ch. 3: Three doses',
    c3night: 'Ch. 3: A quiet night', c3giant: 'Ch. 3: The stone giant', c3garron: 'Ch. 3: Garron', c3strong: 'Ch. 3: Stronger', c3argue: 'Ch. 3: Two roads',
    c3jungle: 'Ch. 3: Two roads', c3pack: 'Ch. 3: We can\'t stay', c3pass: 'Ch. 3: Over the ridge', c3ravine: 'Ch. 3: The ravine', c3meadow: 'Ch. 3: The High Meadow',
    c3wolves: 'Ch. 3: Wolves', c3river: 'Ch. 3: The river',
  };
  const ERRAND = { walk: 20, deliver: 150, shape: 330, bake: 450, paint: 540 }; // seconds into Teo and Mira's work
  const LAB_NEEDS = { nitre: 9, revonite: 9 };
  const JUNGLE = { x: -104, z: -216 }; // where Garron goes
  const LOG = { x: -22, z: -146 };

  const ch3 = { STAGES, TITLES, NAMES: { REN, TEO, MIRA, GARRON } };
  const stage = () => D.story.stage;
  const flags = () => D.story.flags;
  const have = (k) => D.items.count(k);
  ch3.started = () => STAGES.includes(stage());
  const at = (s) => STAGES.indexOf(stage()) >= STAGES.indexOf(s);
  ch3.at = at;
  ch3.hours = (s) => HOURS[s] || null;
  ch3.flag = (k) => !!flags()[k];
  const think = (text, s = 4) => D.ui.think(text, s);
  const says = (who, text, s = 4.5, now = false) => D.ui.say(who, text, s, now);
  const go = (s) => D.story.setStage(s);
  const raise = (s) => HOURS[s] && D.story.raiseHour(HOURS[s][0]);
  const P = () => D.people;
  const teo = () => P().get('teo');
  const mira = () => P().get('mira');
  const garron = () => P().get('garron');
  const lab = () => D.lab;
  const east = () => D.east;

  // ---------- The world, as Chapter 3 finds it ----------

  let world = null;
  const miraStatue = () => D.statues.list.find((s) => s.spot.pose === 'shield' && Math.abs(s.spot.x - 31) < 0.5 && Math.abs(s.spot.z - 224) < 0.5) || D.statues.list[1];
  function setupWorld() {
    if (world) return world;
    if (D.ch2 && D.ch2.setupWorld) D.ch2.setupWorld();
    const random = seeded(3101);
    world = { resin: [], poles: [], stumps: [] };
    const scatter = (cx, cz, r, n, type, prefix, min = 3) => {
      for (let i = 0, tries = 0; i < n && tries < 500; tries++) {
        const a = random() * Math.PI * 2;
        const d = min + random() * r;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const y = T.height(x, z);
        if (T.waterAt(x, z) || T.normal(x, z).y < 0.85 || D.flora.trunkHit(x, y + 0.5, z, 0.5)) continue;
        if (Math.hypot(x - L.tree.x, z - L.tree.z) < 4.5 || lab().inside(x, z) || Math.hypot(x - lab().frame.cx, z - lab().frame.cz) < 5) continue;
        D.items.spawn(type, x, z, random() * 6.3, `${prefix}${i}`);
        i++;
      }
    };
    // dead wood and stones round the Elder Tree (the lab wants a lot), at the cave mouth, on the way
    scatter(L.tree.x, L.tree.z, 26, 26, 'stick', 'c3stick', 6);
    scatter(L.tree.x, L.tree.z, 24, 8, 'stone', 'c3stone', 6);
    scatter(18, 232, 16, 8, 'stick', 'c3mstick');
    scatter(-30, -130, 22, 8, 'stick', 'c3tstick');
    scatter(470, -24, 14, 9, 'stick', 'c3wstick', 4);
    scatter(232, 82, 8, 3, 'stone', 'c3lstone', 2);
    // loose stones on the floor of the vein hall, for chipping with
    const hb = D.cave.galleries && D.cave.galleries.hallB;
    if (hb) [[-2.5, 1.5], [1.8, -2.2], [3.2, 2.4]].forEach(([dx, dz], i) => D.items.spawn('stone', hb.x + dx, hb.z + dz, i * 2, `c3gstone${i}`));
    // the plants grow back: vines, saplings, the yellow grass
    D.items.regrow('vine');
    D.items.regrow('sapling');
    D.items.regrow('fibre');
    // fresh resin on the Elder Tree's bark, round the other side from Chapter 2's
    const resinMat = D.addCaveShade(new THREE.MeshStandardMaterial({ color: D.col(0xd8931f), roughness: 0.18, metalness: 0, emissive: new THREE.Color(0x6a3a00), emissiveIntensity: 0.25 }));
    const bead = new THREE.SphereGeometry(0.07, 8, 6);
    const SP = D.shelter.P;
    const a0 = SP ? Math.atan2(SP.ox, SP.oz) : 0;
    for (const off of [0.95, -1.05, 3.4]) {
      const a = a0 + off;
      const r = (D.shelter.trunkR || 2.05) + 0.06;
      const x = L.tree.x + Math.sin(a) * r;
      const z = L.tree.z + Math.cos(a) * r;
      const y = T.height(x, z) + 1.5;
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(bead, resinMat);
        b.position.set((random() - 0.5) * 0.3, (random() - 0.5) * 0.4, (random() - 0.5) * 0.3);
        b.scale.setScalar(0.6 + random() * 0.9);
        b.scale.y *= 1.4;
        g.add(b);
      }
      g.position.set(x, y, z);
      D.scene.add(g);
      world.resin.push({ id: `c3resin${world.resin.length}`, x: L.tree.x + Math.sin(a) * (r + 0.5), z: L.tree.z + Math.cos(a) * (r + 0.5), y: y - 1.5, mesh: g });
    }
    // young trees for poles: thin, straight, pale; round the Elder Tree, along the trail, by the Lookout
    const bark = new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0xd9c7a8), roughness: 0.85 });
    const leafMat = D.flora.kinds.canopy ? D.flora.kinds.canopy.near[1].material : bark;
    const spots = [[-62, -158], [-30, -186], [-60, -190], [-26, -160], [-36, -142], [-14, -128], [-66, -176], [-40, -200], [222, 84], [226, 74]];
    spots.forEach(([sx, sz]) => {
      let x = sx;
      let z = sz;
      for (let k = 0; k < 12 && (D.flora.trunkHit(x, T.height(x, z) + 1, z, 0.8) || lab().inside(x, z)); k++) {
        x += (random() - 0.5) * 4;
        z += (random() - 0.5) * 4;
      }
      const y = T.height(x, z);
      const g = new THREE.Group();
      const h = 5.5 + random() * 1.5;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8).translate(0, h / 2, 0), bark);
      stem.castShadow = true;
      g.add(stem);
      for (let k = 0; k < 9; k++) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), leafMat);
        card.position.set((random() - 0.5) * 1.1, h - 0.6 + random() * 0.9, (random() - 0.5) * 1.1);
        card.rotation.set(-Math.PI / 2 + (random() - 0.5) * 1.4, random() * 6, 0);
        card.castShadow = true;
        g.add(card);
      }
      g.position.set(x, y - 0.05, z);
      D.scene.add(g);
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.35, 8), bark);
      stump.position.set(x, y + 0.12, z);
      stump.visible = false;
      D.scene.add(stump);
      world.poles.push({ id: `c3pole${world.poles.length}`, x, z, y, mesh: g, stump });
      D.flora.reserved.push([x, z, 1]);
    });
    // the basket of clay Teo leaves by the lab
    const clayMat = new THREE.MeshStandardMaterial({ color: D.col(0x8f8a7e), roughness: 0.6 });
    const basket = new THREE.Group();
    const weave = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.4, 14, 1, true), new THREE.MeshStandardMaterial({ color: D.col(0x9a7a4a), roughness: 0.95, side: THREE.DoubleSide }));
    weave.position.y = 0.2;
    const clay = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), clayMat);
    clay.scale.y = 0.45;
    clay.position.y = 0.33;
    basket.add(weave, clay);
    const bp = lab().at(3.6, 4.4);
    basket.position.set(bp.x, T.height(bp.x, bp.z), bp.z);
    basket.visible = false;
    D.scene.add(basket);
    world.basket = { mesh: basket, x: bp.x, z: bp.z };
    // the training post, by the lab
    const post = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8), bark);
    pole.position.y = 1.1;
    const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.9, 10), new THREE.MeshStandardMaterial({ color: D.col(0x7a6a44), roughness: 1 }));
    sack.position.y = 1.35;
    post.add(pole, sack);
    post.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const pp = lab().at(-6.5, 6);
    post.position.set(pp.x, T.height(pp.x, pp.z), pp.z);
    post.visible = false;
    D.scene.add(post);
    world.post = { mesh: post, sack, x: pp.x, z: pp.z, hits: 0 };
    // the fallen log Garron carries
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 4.2, 10), bark);
    log.rotation.z = Math.PI / 2;
    log.position.set(LOG.x, T.height(LOG.x, LOG.z) + 0.3, LOG.z);
    log.castShadow = true;
    D.scene.add(log);
    world.log = log;
    // the sledge, Teo's travois, for the stone giant
    const sledge = new THREE.Group();
    for (const s of [-0.55, 0.55]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.4, 6), bark);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(s, 0.18, 0);
      sledge.add(rail);
    }
    for (let k = 0; k < 7; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6), bark);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.26, -1.8 + k * 0.6);
      sledge.add(bar);
    }
    sledge.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    sledge.visible = false;
    D.scene.add(sledge);
    world.sledge = sledge;
    // the jungle where Garron goes: three people of stone he has chosen
    world.three = [];
    return world;
  }
  function refreshWorld() {
    if (!world) return;
    for (const r of world.resin) r.mesh.visible = !D.items.taken.has(r.id);
    for (const p of world.poles) {
      const cut = D.items.taken.has(p.id);
      p.mesh.visible = !cut;
      p.stump.visible = cut;
    }
    world.basket.mesh.visible = !!flags().clayDelivered && !flags().clayTaken;
    world.post.mesh.visible = at('c3strong') && !at('c3pack');
    world.log.visible = !flags().logCarried;
    if (D.ch2 && D.ch2.refreshWorld) D.ch2.refreshWorld();
  }

  // ---------- Where things are (for the waypoint and the guide) ----------

  const nearestOf = (list, from, ok = (p) => !D.items.taken.has(p.id)) => {
    let best = null;
    let bd = Infinity;
    for (const p of list) {
      if (!ok(p)) continue;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };
  // resin: Chapter 3's beads first, then any of Chapter 2's left
  const ch2Resin = D.guide.sources.resin;
  D.guide.sources.resin = (from) => {
    if (world && ch3.started()) {
      const p = nearestOf(world.resin, from);
      if (p) return { x: p.x, z: p.z, label: 'Resin (Elder Tree bark)', r: 1.4, y: p.y + 1.6 };
    }
    return ch2Resin ? ch2Resin(from) : null;
  };
  D.guide.sources.pole = (from) => {
    if (!world) return null;
    const p = nearestOf(world.poles, from);
    return p ? { x: p.x, z: p.z, label: D.items.has('axe') ? 'A young tree (poles)' : 'A young tree (needs the stone axe)', r: 1.8 } : null;
  };
  D.guide.sources.clay = ((before) => (from) => {
    if (world && ch3.started() && flags().clayDelivered && !flags().clayTaken) return { x: world.basket.x, z: world.basket.z, label: 'The clay Teo left (6)', r: 1.6 };
    return before ? before(from) : null;
  })(D.guide.sources.clay);
  // nitre: the guano beds first, then the crust on the walls
  const ch2Nitre = D.guide.sources.nitre;
  const ch2Rev = D.guide.sources.revonite;
  const galleries = () => D.cave.galleries;
  const crackMark = () => {
    const g = galleries();
    return { x: g.crack.x, z: g.crack.z, y: C.floor + 1.6, label: 'The crack (to the galleries)', r: 1.5 };
  };
  function nitreMark(from) {
    const g = galleries();
    if (!D.cave.inGalleries(D.hero.pos)) return crackMark();
    const bed = nearestOf(g.guano || [], from, (q) => !q.taken);
    if (bed) return { x: bed.x, z: bed.z, y: bed.y + 0.4, label: 'Guano bed (nitre, 3 a scrape)', r: 1.5 };
    return ch2Nitre ? ch2Nitre(from) : null;
  }
  function revMark(from) {
    const g = galleries();
    if (!D.cave.inGalleries(D.hero.pos)) return crackMark();
    const low = nearestOf(g.revonite, from, (q) => !q.taken);
    if (low && !at('c3minerals')) return { x: low.x, z: low.z, y: low.y + 0.3, label: 'Revonite', r: 1.4 };
    const seam = nearestOf(g.seam || [], from, (q) => !q.taken);
    if (seam && g.ladderAt) return { x: g.ladderAt.x, z: g.ladderAt.z, y: g.ladderAt.y + 1.2, label: flags().ladder ? 'The high seam (climb the ladder: E)' : 'The high seam: build a ladder here', r: 1.6 };
    if (low) return { x: low.x, z: low.z, y: low.y + 0.3, label: 'Revonite', r: 1.4 };
    return ch2Rev ? ch2Rev(from) : null;
  }
  const fireMark = (id, label = null) => {
    const s = D.camp.spot(id);
    return s ? { x: s.x, z: s.z, y: T.height(s.x, s.z) + 1.4, label: label || s.label, r: 2.6 } : null;
  };
  const labMark = (label = 'The lab') => {
    const s = lab().site;
    return s ? { x: s.x, z: s.z, y: s.y + 1.6, label, r: 3 } : null;
  };
  const potMark = (key, label) => {
    const p = lab().potFor(key);
    return p ? { x: p.x, z: p.z, y: p.y + 0.5, label, r: 1.2 } : labMark();
  };
  const personMark = (p, label) => (p ? { x: p.x, z: p.z, y: p.y + 2.1 * p.scale, label, r: 2.2 } : null);
  const MOUTH = { x: 21.5, z: 241.5 };
  D.camp.addSpot('mouth', { x: MOUTH.x, z: MOUTH.z, label: 'The cave mouth' });

  // ---------- What E does (Chapter 3's things) ----------

  function target(x, z) {
    if (!ch3.started() || !world) return null;
    const out = [];
    const h = D.hero;
    // resin
    for (const r of world.resin) {
      if (D.items.taken.has(r.id) || Math.hypot(r.x - x, r.z - z) > 2.2) continue;
      out.push({ x: r.x, z: r.z, reach: 2, bias: -0.2, label: 'Cut resin from the bark', cannot: D.items.has('blade') ? null : 'Needs the flint blade',
        act: () => D.items.harvest({ ...r, label: 'Cutting resin' }, 'cut', 1.8, () => {
          D.items.add('resin', 2);
          refreshWorld();
        }, () => D.audio && D.audio.scrape()) });
    }
    // young trees
    for (const p of world.poles) {
      if (D.items.taken.has(p.id) || Math.hypot(p.x - x, p.z - z) > 2.4) continue;
      out.push({ x: p.x, z: p.z, reach: 2.4, bias: -0.3, label: 'Fell the young tree (2 poles)', cannot: D.items.has('axe') ? null : 'Needs a stone axe (Tab, Make)',
        act: () => D.items.harvest({ ...p, label: 'Chopping' }, 'cut', 3.2, () => {
          D.items.add('pole', 2);
          refreshWorld();
        }, () => D.audio && D.audio.chop()) });
    }
    // the clay Teo left
    if (flags().clayDelivered && !flags().clayTaken && Math.hypot(world.basket.x - x, world.basket.z - z) < 2.2) {
      out.push({ x: world.basket.x, z: world.basket.z, reach: 2.2, bias: -0.3, label: 'Take the clay Teo left (6)', act: () => {
        if (h.startAction('Taking the clay', 1, { pose: 'gather', onDone: () => {
          flags().clayTaken = true;
          D.items.add('clay', 6);
          refreshWorld();
        } })) h.action.face = Math.atan2(world.basket.x - h.pos.x, world.basket.z - h.pos.z);
      } });
    }
    // the smoky fire at the cave mouth
    if (stage() === 'c3bear' && Math.hypot(MOUTH.x - x, MOUTH.z - z) < 4) {
      const f = D.camp.fire('mouth');
      if (!f || !f.built) {
        const lack = Object.entries({ stick: 4, leaves: 6 }).filter(([k, n]) => !D.items.has(k, n)).map(([k, n]) => `${n - have(k)} ${k === 'stick' ? 'sticks' : 'ferns (leaves)'}`);
        out.push({ x: MOUTH.x, z: MOUTH.z, reach: 3.5, bias: -0.5, label: 'Pile wood and green ferns at the mouth', cannot: lack.length ? `Still need ${lack.join(', ')}` : null, act: () => {
          if (h.startAction('Piling wood and ferns', 2.5, { pose: 'build', fixed: true, onDone: () => {
            D.items.remove('stick', 4);
            D.items.remove('leaves', 6);
            D.camp.build('mouth');
            D.camp.fire('mouth').smoky = true;
            if (D.audio) D.audio.rustle();
          } })) h.action.face = Math.atan2(MOUTH.x - h.pos.x, MOUTH.z - h.pos.z);
        } });
      } else if (!f.lit) {
        out.push({ x: MOUTH.x, z: MOUTH.z, reach: 3.5, bias: -0.5, label: 'Light it with your torch', cannot: D.camp.torchLit() ? null : 'Needs a burning torch: light one at a fire (4 holds it)', act: () => {
          if (h.startAction('Lighting the ferns', 1.2, { pose: 'gather', onDone: () => {
            D.camp.light('mouth', 160);
            D.camp.fire('mouth').smoky = true;
            if (D.audio) D.audio.flare();
            smokeOut();
          } })) h.action.face = Math.atan2(MOUTH.x - h.pos.x, MOUTH.z - h.pos.z);
        } });
      }
    }
    // the galleries: guano beds; the ladder and the high seam
    const g = galleries();
    if (g && D.cave.inGalleries(h.pos)) {
      const lit = D.camp.holdingLight();
      // the crust on the walls, and the Revonite crystals (as in Chapter 2)
      for (const s of g.nitre) {
        if (s.taken || Math.hypot(s.x - x, s.z - z) > 2.4) continue;
        out.push({ x: s.x, z: s.z, reach: 2.2, bias: -0.2, label: 'Scrape nitre crust', cannot: !lit ? 'Too dark to see: hold a lit torch (4)' : !D.items.has('blade') ? 'Needs the flint blade' : null,
          act: () => D.items.harvest({ id: s.id, x: s.x, z: s.z, label: 'Scraping nitre' }, 'cut', 2, () => {
            D.items.add('nitre', 2);
            D.cave.takeSpot('nitre', s.id);
          }, () => D.audio && D.audio.scrape()) });
      }
      for (const s of g.revonite) {
        if (s.taken || Math.hypot(s.x - x, s.z - z) > 2.4) continue;
        out.push({ x: s.x, z: s.z, reach: 2.2, bias: -0.2, label: 'Chip Revonite shards', cannot: !lit ? 'Too dark to work: hold a lit torch (4)' : !D.items.has('stone') ? 'Needs a stone to chip with' : null,
          act: () => D.items.harvest({ id: s.id, x: s.x, z: s.z, label: 'Chipping Revonite' }, 'cut', 2.4, () => {
            D.items.add('revonite', 1);
            D.cave.takeSpot('revonite', s.id);
          }, () => D.audio && D.audio.knap()) });
      }
      for (const s of g.guano || []) {
        if (s.taken || Math.hypot(s.x - x, s.z - z) > 2.4) continue;
        out.push({ x: s.x, z: s.z, reach: 2.4, bias: -0.3, label: 'Scrape the guano bed (nitre)', cannot: !lit ? 'Too dark to see: hold a lit torch (4)' : !D.items.has('blade') ? 'Needs the flint blade' : null,
          act: () => D.items.harvest({ id: s.id, x: s.x, z: s.z, label: 'Scraping guano' }, 'gather', 2.2, () => {
            D.items.add('nitre', 3);
            D.cave.takeSpot('guano', s.id);
          }, () => D.audio && D.audio.dig()) });
      }
      const la = g.ladderAt;
      if (la && at('c3minerals') && Math.hypot(la.x - x, la.z - z) < 2.8) {
        if (!flags().ladder) {
          const lack = Object.entries({ stick: 6, vine: 3 }).filter(([k, n]) => !D.items.has(k, n)).map(([k, n]) => `${n - have(k)} ${k === 'stick' ? 'sticks' : 'vines'}`);
          out.push({ x: la.x, z: la.z, reach: 2.8, bias: -0.4, label: 'Build a ladder up to the high seam', cannot: lack.length ? `Still need ${lack.join(', ')}` : null, act: () => {
            if (h.startAction('Lashing a ladder', 4, { pose: 'build', fixed: true, onDone: () => {
              D.items.remove('stick', 6);
              D.items.remove('vine', 3);
              flags().ladder = true;
              showLadder();
              if (D.audio) D.audio.craft();
            }, sound: () => D.audio && D.audio.knock() })) h.action.face = Math.atan2(la.x - h.pos.x, la.z - h.pos.z);
          } });
        } else {
          const seam = (g.seam || []).find((q) => !q.taken);
          if (seam) {
            out.push({ x: la.x, z: la.z, reach: 2.8, bias: -0.4, label: 'Climb up and chip the high seam (3 Revonite)', cannot: !lit ? 'Too dark: hold a lit torch (4)' : !D.items.has('stone') ? 'Needs a stone to chip with' : null,
              act: () => D.items.harvest({ id: seam.id, x: la.x, z: la.z, label: 'Chipping the high seam' }, 'pull', 3, () => {
                D.items.add('revonite', 3);
                D.cave.takeSpot('seam', seam.id);
              }, () => D.audio && D.audio.knap()) });
          }
        }
      }
    }
    // water: fill an empty pot (as in Chapter 2)
    if (D.items.has('pot')) {
      const fx = Math.sin(h.facing);
      const fz = Math.cos(h.facing);
      for (const ahead of [0, 0.9, 1.6, 2.3]) {
        const w = T.waterAt(x + fx * ahead, z + fz * ahead);
        if (w && w.depth > 0.04) {
          const d = Math.max(0.9, Math.min(ahead, 1));
          out.push({ x: x + fx * d, z: z + fz * d, reach: 2.4, bias: 0.2, label: 'Fill a pot with water', act: () => {
            if (h.startAction('Filling a pot', 1.6, { pose: 'drink', onDone: () => {
              D.items.remove('pot', 1);
              D.items.add('pot_water', 1);
              h.stats.thirst = Math.min(100, h.stats.thirst + 20);
              if (D.audio) D.audio.pour();
            } })) h.action.face = h.facing;
          } });
          break;
        }
      }
    }
    // the people: pour the fluid; give them what they need
    const ms = miraStatue();
    if (ms && !ms.awake && stage() === 'c3mira' && Math.hypot(ms.x - x, ms.z - z) < 2.8) {
      out.push({ x: ms.x, z: ms.z, reach: 2.8, bias: -0.8, label: 'Pour the revival fluid over her', cannot: D.items.has('fluid') ? null : 'Needs the revival fluid', act: () => pour(ms.x, ms.z, wakeMira) });
    }
    const gp = garron();
    if (gp && stage() === 'c3giant' && gp.mode === 'stone' && gp.group.visible && Math.hypot(gp.x - x, gp.z - z) < 3) {
      out.push({ x: gp.x, z: gp.z, reach: 3, bias: -0.8, label: 'Pour the revival fluid over him', cannot: D.items.has('fluid') ? null : 'Needs a dose: take one from a FLUID pot in the lab (E)', act: () => pour(gp.x, gp.z, wakeGarron) });
    }
    const m = mira();
    if (m && m.group.visible && m.mode !== 'stone' && Math.hypot(m.x - x, m.z - z) < 2.6) {
      if (stage() === 'c3ravine' && !have('rope') && !have('rope_arrow') && !east().rope && !flags().braiding) {
        out.push({ x: m.x, z: m.z, y: m.y + 1.2, reach: 2.6, bias: -0.6, label: 'Give Mira the plant fibre (8) to braid a rope', cannot: have('fiber') >= 8 ? null : `She needs 8 plant fibre (you have ${have('fiber')})`, act: () => giveMira('fiber', 8, 'braiding') });
      }
      if (stage() === 'c3meadow' && !flags().bandages && !flags().sewing) {
        out.push({ x: m.x, z: m.z, y: m.y + 1.2, reach: 2.6, bias: -0.6, label: 'Give Mira the wild cotton (6) for bandages', cannot: have('cotton') >= 6 ? null : `She needs 6 wild cotton (you have ${have('cotton')})`, act: () => giveMira('cotton', 6, 'sewing') });
      }
    }
    // the training post
    if (stage() === 'c3strong' && flags().strongStep === 'train' && Math.hypot(world.post.x - x, world.post.z - z) < 3.4) {
      out.push({ x: world.post.x, z: world.post.z, reach: 3.4, bias: 0.5, label: D.hero.weapon === 'spear' ? 'The post: jab it (left mouse)' : 'Hold the spear (5), then jab (left mouse)', cannot: 'Use the spear: 5, then left mouse', act: () => {} });
    }
    // dawn by the river: nothing to do but look
    return out.length ? out : null;
  }
  D.items.extraTargets.push(target);
  // the boulder in the pass (east.js asks)
  ch3.eastTargets = (x, z) => {
    const out = [];
    const b = east().BOULDER;
    if (stage() === 'c3pass' && !east().cleared && Math.hypot(b.x - x, b.z - z) < b.r + 3) {
      if (!flags().leverSet) {
        const lack = Object.entries({ pole: 1, stone: 1 }).filter(([k, n]) => !D.items.has(k, n)).map(([k]) => (k === 'pole' ? 'a long pole' : 'a stone'));
        out.push({ x: b.x, z: b.z, reach: b.r + 3, bias: -0.5, label: 'Set a lever: a pole under the boulder, over a stone', cannot: lack.length ? `Needs ${lack.join(' and ')}` : null, act: () => {
          const h = D.hero;
          if (h.startAction('Setting the lever', 2.5, { pose: 'build', fixed: true, onDone: () => {
            D.items.remove('pole', 1);
            D.items.remove('stone', 1);
            flags().leverSet = true;
            east().setLever();
          } })) h.action.face = Math.atan2(b.x - h.pos.x, b.z - h.pos.z);
        } });
      } else {
        out.push({ x: b.x, z: b.z, reach: b.r + 3.5, bias: -0.5, label: 'Lean on the lever', act: () => {
          const h = D.hero;
          if (h.startAction('Leaning on the lever', 3, { pose: 'pull', fixed: true, onDone: () => east().clearPass(true), sound: () => D.audio && D.audio.creak() })) h.action.face = Math.atan2(b.x - h.pos.x, b.z - h.pos.z);
        } });
      }
    }
    // the meadow's finds: look at them
    const look = (spot, key, text, label) => {
      if (stage() === 'c3meadow' && Math.hypot(spot.x - x, spot.z - z) < 3.5) {
        out.push({ x: spot.x, z: spot.z, reach: 3.5, bias: -0.2, label, act: () => {
          flags()[key] = true;
          text.forEach((t, i) => think(t, 4 + i * 0.1));
          D.story.refresh(true);
        } });
      }
    };
    look(east().CAR, 'sawCar', ['A car. Under all that moss, a car.', 'There was a road here. People drove it, every day.'], 'Look at the mound by the road');
    look(east().SIGN, 'sawSign', ['"...ERSIDE, 4 km". A town, by a river.', 'Four kilometres. East.'], 'Read the sign');
    return out.length ? out : null;
  };

  function giveMira(key, n, what) {
    const m = mira();
    const h = D.hero;
    if (!h.startAction('Giving it to Mira', 0.9, { pose: 'gather', onDone: () => {
      D.items.remove(key, n);
      flags()[what] = true;
      flags()[`${what}T`] = 0;
      P().setPose(m, 'work', { x: m.x, z: m.z, h: m.h });
      says(MIRA, what === 'braiding' ? 'Give me a moment. Twenty breaths, and you\'ll have a rope.' : 'Cotton! Clean, soft... I\'ll make bandages. Keep walking, I\'ll catch up.', 4);
    } })) return;
    h.action.face = Math.atan2(m.x - h.pos.x, m.z - h.pos.z);
  }

  function pour(x, z, then) {
    const h = D.hero;
    if (!D.items.has('fluid')) return;
    if (!h.startAction('Pouring the revival fluid', 2.4, { pose: 'gather', fixed: true, onDone: () => {
      D.items.remove('fluid', 1);
      then();
    }, sound: () => D.audio && D.audio.pour() })) return;
    h.action.face = Math.atan2(x - h.pos.x, z - h.pos.z);
  }

  let ladder = null;
  function showLadder() {
    const g = galleries();
    if (!g || !g.ladderAt) return;
    if (ladder) {
      ladder.visible = true;
      return;
    }
    const la = g.ladderAt;
    const wood = new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0xd2b48a), roughness: 0.9 });
    D.addCaveShade(wood);
    ladder = new THREE.Group();
    const side = new THREE.Vector3(-la.out.z, 0, la.out.x);
    const foot = new THREE.Vector3(la.x, la.y, la.z);
    const top = la.top.clone();
    for (const s of [-0.28, 0.28]) {
      const a = foot.clone().addScaledVector(side, s);
      const b = top.clone().addScaledVector(side, s);
      const len = a.distanceTo(b);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, len, 6), wood);
      rail.position.copy(a).add(b).multiplyScalar(0.5);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      ladder.add(rail);
    }
    for (let k = 1; k < 9; k++) {
      const p = foot.clone().lerp(top, k / 9);
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), wood);
      rung.position.copy(p);
      rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
      ladder.add(rung);
    }
    D.scene.add(ladder);
  }

  // ---------- The objectives ----------

  const need = (key, n, text = null, extra = 0) => {
    const def = D.items.ITEMS[key];
    const got = Math.min(have(key) + extra, n);
    return { text: text || (n > 1 ? def.plural : def.name), count: `${got}/${n}`, done: have(key) + extra >= n };
  };
  const tick = (text, done) => ({ text, done: !!done });
  const fireOut = (id) => {
    const f = D.camp.fire(id);
    return f && f.built && !f.lit;
  };
  const brewFire = () => {
    // the nearest fire to brew at: the camp by the pond, or the one under the Elder Tree
    const h = D.hero.pos;
    // (a lit one before an unlit one: the smoky fire at the cave mouth counts, once it is a fire)
    const ids = ['mouth', 'day', 'night'].filter((id) => D.camp.fire(id) && D.camp.fire(id).built && (id !== 'mouth' || at('c3dose')));
    const cost = (id) => Math.hypot(D.camp.fire(id).x - h.x, D.camp.fire(id).z - h.z) + (D.camp.fire(id).lit ? 0 : 600);
    ids.sort((a, b) => cost(a) - cost(b));
    return ids[0] || 'night';
  };
  // When the fire you need is out: how to light it again (and where), or null if it burns.
  const relight = (id) => {
    const f = D.camp.fire(id);
    if (!f || f.lit) return null;
    if (D.camp.torchLit()) return { hint: 'That fire has gone out: E lights it again with your burning torch.', marker: fireMark(id, 'Light the fire (E)') };
    const tinder = D.guide.forNeeds(D.camp.tinderNeeds);
    if (tinder) return { hint: 'Every fire has gone out. To light one: the bow drill, with a stick and 2 plant fibre for tinder.', marker: tinder };
    return { hint: 'Every fire has gone out: E at a fire pit, then the bow drill (A, D, A, D; E blows the ember).', marker: fireMark(id, 'Light the fire (E)') };
  };
  // Where to scoop wood ash: the nearest fire that has some; or, if none has yet, the fire to keep
  // burning until it does.
  const ashStep = (fire) => {
    const h = D.hero.pos;
    const withAsh = D.camp.fires.filter((f) => f.ash >= 1).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
    if (withAsh) return { hint: 'Wood ash: E at that fire scoops it out.', marker: fireMark(withAsh.id, 'Scoop out ash (E)') };
    return { hint: 'No ash yet: a fire leaves some every half a minute it burns. Keep it fed (E adds wood) and wait a moment.', marker: fireMark(fire, 'Ash soon: keep it burning') };
  };
  const errandText = () => {
    const e = flags().errand;
    if (!e || at('c3labelled')) return null;
    const t = e.t;
    if (t < ERRAND.walk) return ['Teo &amp; Mira: <b>setting off for the Clay Banks</b>', t / ERRAND.paint];
    if (t < ERRAND.deliver) return ['Teo &amp; Mira: <b>digging clay</b> at the Clay Banks', t / ERRAND.paint];
    if (t < ERRAND.shape) return [`Teo &amp; Mira: <b>shaping pots</b> (${Math.min(12, Math.floor(((t - ERRAND.deliver) / (ERRAND.shape - ERRAND.deliver)) * 12))} of 12)`, t / ERRAND.paint];
    if (t < ERRAND.bake) return ['Teo &amp; Mira: <b>baking the pots</b> in a pit fire', t / ERRAND.paint];
    if (t < ERRAND.paint) return ['Teo &amp; Mira: <b>painting the labels</b>', t / ERRAND.paint];
    return [lab().done() ? 'Teo &amp; Mira: <b>bringing the pots</b> to the lab' : 'Teo &amp; Mira: <b>the pots are ready</b>, waiting for the lab', 1];
  };
  const mineralsReady = () => have('nitre') + (lab().store.nitre || 0) >= LAB_NEEDS.nitre && have('revonite') + (lab().store.revonite || 0) >= LAB_NEEDS.revonite;

  const OBJECTIVES = {
    c3talk: () => ({ title: 'Morning', list: [], hint: '', marker: null }),
    c3bear: () => {
      const f = D.camp.fire('mouth');
      const built = f && f.built;
      const torches = have('torch') + (D.camp.torchLit() ? 1 : 0);
      const list = [
        need('leaves', 6, 'Green ferns (leaves)', built ? 6 : 0),
        need('stick', 4, 'Dead wood', built ? 4 : 0),
        tick(D.camp.torchLit() ? 'A burning torch' : 'A torch, lit at a fire', D.camp.torchLit()),
        tick('Pile it all at the cave mouth (E)', built),
        tick('Light it, and stand clear', f && f.lit),
      ];
      let hint;
      let marker;
      const short = !built && D.guide.forNeeds({ leaves: 6, stick: 4 });
      if (short) {
        hint = short.key === 'leaves' ? 'Ferns: E on any fern gathers its fronds (3 a plant). Green ones make the most smoke.' : 'Dead wood: sticks lie about; the marker shows the nearest.';
        marker = short;
      } else if (!D.camp.torchLit() && torches === 0) {
        const t = D.guide.forNeeds({ stick: 1, fiber: 1, resin: 1 });
        hint = 'A torch to light it with: 1 stick, 1 fibre, 1 resin (Tab, Make), lit at a fire.';
        marker = t || fireMark('night', 'Make a torch (Tab), light it here');
      } else if (!D.camp.torchLit()) {
        const out = relight(brewFire());
        hint = out ? out.hint : 'Light a torch at a fire (E): the one under the Elder Tree is still burning, or the camp by the pond.';
        marker = out ? out.marker : fireMark(brewFire(), 'Light a torch (E)');
      } else if (!built) {
        hint = 'At the cave mouth: E piles the wood and ferns. The draught pulls the smoke inside.';
        marker = { x: MOUTH.x, z: MOUTH.z, label: 'Pile it here (E)', r: 2.5 };
      } else if (!f.lit) {
        hint = 'E lights it with your torch, then get out of the way: the bear will come out fast.';
        marker = { x: MOUTH.x, z: MOUTH.z, label: 'Light it (E)', r: 2.5 };
      } else {
        hint = 'Stand clear of the mouth, off to the side by the rocks, and wait. It will come out running.';
        marker = { x: MOUTH.x + 9, z: MOUTH.z - 4, label: 'Stand clear, over here', r: 2 };
      }
      return { title: 'Smoke out the bear', list, hint, marker, page: 'smoke' };
    },
    c3dose: () => {
      const boil = D.camp.progress('saltpetre');
      const warm = D.camp.progress('fluid');
      const doneSalt = have('saltpetre') >= 2 || warm || have('fluid');
      const list = [
        need('nitre', 6, 'Nitre (guano beds under the roost)', doneSalt || boil ? 6 : 0),
        need('revonite', 3, 'Revonite shards', warm || have('fluid') ? 3 : 0),
        tick('Saltpetre (Tab, At the fire)', doneSalt),
        tick(warm ? `Warming: ${Math.ceil(warm.left)} s` : 'The revival fluid (Tab, At the fire)', have('fluid') >= 1),
      ];
      let hint;
      let marker;
      const inside = D.cave.inGalleries(D.hero.pos);
      const fire = brewFire();
      if (have('fluid') >= 1) {
        hint = 'It\'s ready.';
        marker = null;
      } else if (!doneSalt && !boil && have('nitre') < 6) {
        if (!D.camp.torchLit() && !inside) {
          const out = have('torch') && relight(fire);
          hint = out ? out.hint : have('torch') ? 'Light a torch at a fire (E): it is dark in the galleries.' : 'A torch for the galleries: 1 stick, 1 fibre, 1 resin (Tab, Make), lit at a fire.';
          marker = out ? out.marker : have('torch') ? fireMark(fire, 'Light a torch (E)') : D.guide.forNeeds({ stick: 1, fiber: 1, resin: 1 }) || fireMark(fire);
        } else {
          hint = inside ? 'The dark mounds on the floor under the bat roost: guano. E with the blade scrapes 3 nitre at a time.' : 'Into the cave, through the crack by the green vein, to the far hall. Hold your torch (4).';
          marker = nitreMark(D.hero.pos);
        }
      } else if (!warm && have('revonite') < 3 && !have('stone')) {
        hint = 'A stone to chip the Revonite with: the marker shows the nearest.';
        marker = D.guide.source('stone');
      } else if (!warm && have('revonite') < 3) {
        hint = 'Revonite: chip it from the green crystals with a stone. There\'s more in the small hall off the first one.';
        marker = revMark(D.hero.pos);
      } else if (!doneSalt && !boil && relight(fire)) {
        ({ hint, marker } = relight(fire));
      } else if (!doneSalt && !boil) {
        if (!have('pot_water')) {
          hint = have('pot') ? 'A pot of water: E at the pond\'s edge fills it.' : 'You need an empty pot (2 clay, at a fire).';
          marker = have('pot') ? D.guide.water(D.hero.pos, 'Fill a pot (the pond)') : fireMark(fire);
        } else if (!have('ash')) {
          ({ hint, marker } = ashStep(fire));
        } else {
          hint = 'At a fire: Tab, then At the fire, Saltpetre. It boils down on its own.';
          marker = fireMark(fire, 'Make saltpetre (Tab)');
        }
      } else if (boil && !boil.done) {
        hint = `Boiling down (${Math.ceil(boil.left)} s). Fill another pot of water meanwhile: the fluid needs one.`;
        marker = have('pot') ? D.guide.water(D.hero.pos, 'Fill another pot') : fireMark(boil.fire);
      } else if (!warm && have('pot_water') && relight(fire)) {
        ({ hint, marker } = relight(fire));
      } else if (!warm) {
        hint = have('pot_water') ? 'Tab, At the fire: Revival fluid.' : 'A pot of water for the fluid: the pond.';
        marker = have('pot_water') ? fireMark(fire, 'Make the fluid (Tab)') : D.guide.water(D.hero.pos, 'Fill a pot (the pond)');
      } else {
        hint = 'Warming. Nearly there.';
        marker = fireMark(warm.fire);
      }
      return { title: 'One more dose', list, hint, marker, page: 'fluid' };
    },
    c3mira: () => {
      const s = miraStatue();
      return {
        title: 'Wake Mira',
        list: [tick('The revival fluid', have('fluid') >= 1), tick('Mira, outside the cave mouth', s && s.awake)],
        hint: 'She is the stone woman just outside the cave mouth, arms over her face. E pours the fluid.',
        marker: s ? { x: s.x, z: s.z, label: 'Mira', r: 2.2 } : null,
        page: 'mira',
      };
    },
    c3home: () => ({
      title: 'Home, to the Elder Tree',
      list: [tick('Back to the Elder Tree, the three of you', flags().labPlanned)],
      hint: 'North through the forest and the gorge, Teo and Mira with you.',
      marker: labMark('The Elder Tree'),
    }),
    c3axe: () => {
      const short = D.guide.forNeeds({ flint: 1, stick: 1, vine: 1, resin: 1 });
      const where = { flint: 'Flint: the dark stones on Flint Rise (you may have one already).', stick: 'A stick: the marker shows the nearest.', vine: 'A vine: they hang from the jungle trees; E cuts one with the blade.', resin: 'Resin: fresh beads on the Elder Tree\'s bark (E with the blade).' };
      return {
        title: 'A stone axe',
        list: [need('flint', 1), need('stick', 1), need('vine', 1), need('resin', 1, 'Resin (the glue)'), tick('The stone axe (Tab, Make)', have('axe'))],
        hint: short ? `${where[short.key]} Then Tab, Make: the stone axe.` : 'You have everything: Tab, Make, the stone axe.',
        marker: short || labMark('Make the axe (Tab)'),
        page: 'axe',
      };
    },
    c3lab: () => {
      const L5 = lab();
      const s = L5.STAGES[L5.stage];
      const list = s ? Object.entries(s.needs).map(([k, n]) => need(k, n, `${D.items.ITEMS[k][n > 1 ? 'plural' : 'name']} for the ${s.title.toLowerCase()}`)) : [];
      list.push(tick(`The lab: ${L5.stage} of ${L5.STAGES.length} parts built`, L5.done()));
      let hint;
      let marker;
      // (the clay is on its way from Teo: point at whatever else is short first)
      const waitingClay = s && s.needs.clay && !flags().clayDelivered && have('clay') < s.needs.clay;
      const others = s && Object.fromEntries(Object.entries(s.needs).filter(([k]) => !(waitingClay && k === 'clay')));
      const short = s && D.guide.forNeeds(others);
      if (!s) {
        hint = 'The lab is built.';
        marker = labMark();
      } else if (!short && waitingClay) {
        hint = 'Teo is bringing clay for the walls: he will be here any moment. (Or dig your own at the Clay Banks.)';
        marker = labMark('Clay: Teo is on his way');
      } else if (short) {
        const where = {
          pole: D.items.has('axe') ? 'Poles: fell the young trees, the thin pale ones (E with the axe, 2 each).' : 'Poles need the stone axe (Tab, Make).',
          stick: 'Sticks: dead wood all round the tree.', vine: 'Vines: hanging from the jungle trees (E with the blade).',
          clay: flags().clayDelivered ? 'Clay: Teo left a basket of it by the lab.' : 'Clay: Teo will bring some when they have dug it; or dig your own at the Clay Banks.',
          stone: 'Stones: the marker shows the nearest.', big_leaf: 'Big leaves: the banana plants in the jungle (E with the blade, 2 each).',
        };
        hint = `${s.title}: ${where[short.key] || 'the marker shows where.'}`;
        marker = short.key === 'clay' && !flags().clayDelivered ? labMark('Clay: Teo is bringing it') : short;
      } else {
        hint = `You have what the ${s.title.toLowerCase()} needs: E at the lab's site.`;
        marker = labMark(`Build: ${s.title} (E)`);
      }
      return { title: 'Build the lab', list, hint, marker, page: 'lab' };
    },
    c3minerals: () => {
      const g = galleries();
      const stored = (k) => lab().store[k] || 0;
      const list = [
        need('nitre', LAB_NEEDS.nitre, 'Nitre, for three doses', stored('nitre')),
        need('revonite', LAB_NEEDS.revonite, 'Revonite, for three doses', stored('revonite')),
        tick('A ladder to the high seam', flags().ladder || (g && g.seam && g.seam.every((q) => q.taken))),
      ];
      let hint;
      let marker;
      const inside = D.cave.inGalleries(D.hero.pos);
      if (mineralsReady()) {
        hint = 'Everything for three doses. Back to the lab: Teo and Mira are on their way with the pots.';
        marker = labMark('The lab: the pots are coming');
      } else if (!D.camp.torchLit() && !inside) {
        const out = have('torch') && relight(brewFire());
        hint = out ? out.hint : have('torch') ? 'Light a torch at a fire (E), then into the galleries.' : 'A torch: 1 stick, 1 fibre, 1 resin (Tab, Make), lit at a fire.';
        marker = out ? out.marker : have('torch') ? fireMark(brewFire(), 'Light a torch (E)') : D.guide.forNeeds({ stick: 1, fiber: 1, resin: 1 }) || fireMark(brewFire());
      } else if (have('nitre') + stored('nitre') < LAB_NEEDS.nitre) {
        hint = inside ? 'Guano beds under the roost (3 a scrape), or the white crust on the walls (2).' : 'Back to the Nitre Galleries, through the crack by the green vein.';
        marker = nitreMark(D.hero.pos);
      } else if (!flags().ladder && have('stick') < 6) {
        hint = 'The rich Revonite is high on the vein wall. A ladder: 6 sticks and 3 vines, built against the wall.';
        marker = D.guide.source('stick');
      } else if (!flags().ladder && have('vine') < 3) {
        hint = 'Vines for the ladder: they hang from the jungle trees.';
        marker = D.guide.source('vine');
      } else if (flags().ladder && !have('stone')) {
        hint = 'A stone to chip the seam with: there are loose ones on the floor of this hall.';
        marker = D.guide.source('stone');
      } else {
        hint = flags().ladder ? 'Up the ladder: E chips the high seam (3 Revonite each time). Hold your torch.' : 'At the foot of the vein wall, under the seam: E builds the ladder.';
        marker = revMark(D.hero.pos);
      }
      return { title: 'Minerals for three doses', list, hint, marker, page: 'nitre2' };
    },
    c3labelled: () => ({ title: 'Labelled', list: [], hint: '', marker: labMark() }),
    c3brew: () => {
      const brew = D.camp.progress('doses');
      const hearth = D.camp.fire('lab');
      const store = lab().store;
      const doses = (store.fluid || 0) + have('fluid');
      const list = [
        need('nitre', 9, 'Nitre', brew || doses >= 3 ? 9 : 0),
        need('revonite', 9, 'Revonite', brew || doses >= 3 ? 9 : 0),
        need('ash', 2, 'Wood ash', brew || doses >= 3 ? 2 : 0),
        tick(brew ? (brew.done ? 'Brewed' : `Brewing: ${Math.ceil(brew.left)} s`) : 'Brew at the lab\'s hearth (Tab, At the fire)', brew || doses >= 3),
        { text: 'Doses in the FLUID pots (E at the rack)', count: `${Math.min(3, store.fluid || 0)}/3`, done: (store.fluid || 0) >= 3 },
      ];
      let hint;
      let marker;
      if (doses < 3 && !brew) {
        if (have('nitre') < 9 && (store.nitre || 0) > 0) {
          hint = 'Your nitre is in the NITRE pot: E there takes it back out.';
          marker = potMark('nitre', 'NITRE pot (E)');
        } else if (have('revonite') < 9 && (store.revonite || 0) > 0) {
          hint = 'Your Revonite is in its pot: E there takes it out.';
          marker = potMark('revonite', 'REVONITE pot (E)');
        } else if (have('ash') < 2) {
          ({ hint, marker } = ashStep('lab'));
        } else if (fireOut('lab')) {
          hint = 'The hearth is out: light it with a burning torch (or the bow drill).';
          marker = fireMark('lab', 'Light the hearth (E)');
        } else {
          hint = 'By the lab door: Tab, then At the fire, Revival fluid, three doses. It brews on its own.';
          marker = fireMark('lab', 'Brew three doses (Tab)');
        }
      } else if (brew && !brew.done) {
        hint = `Brewing (${Math.ceil(brew.left)} s).`;
        marker = fireMark('lab');
      } else {
        hint = 'Into the lab: E at a FLUID pot stores a dose. Three pots, three doses.';
        marker = potMark('fluid', 'FLUID pots (E)');
      }
      return { title: 'Three doses', list, hint, marker, page: 'lab' };
    },
    c3night: () => ({ title: 'A quiet night', list: [], hint: '', marker: null }),
    c3giant: () => {
      const gp = garron();
      const list = [tick('A dose, from a FLUID pot in the lab (E)', have('fluid') >= 1), tick('Pour it over the stone giant', gp && gp.mode !== 'stone')];
      return {
        title: 'The stone giant',
        list,
        hint: have('fluid') ? 'E by him pours it.' : 'Into the lab: E at a FLUID pot takes a dose.',
        marker: have('fluid') ? personMark(gp, 'The stone giant') : potMark('fluid', 'FLUID pots (E)'),
        page: 'garron',
      };
    },
    c3garron: () => ({ title: 'Garron', list: [], hint: '', marker: null }),
    c3strong: () => {
      const step = flags().strongStep || 'log';
      const list = [
        tick('Help Garron fetch the fallen log', flags().logCarried),
        tick('Make a spear (Tab, Make)', have('spear')),
        { text: 'Train with Garron: jab the post', count: `${Math.min(5, world ? world.post.hits : 0)}/5`, done: flags().trained },
      ];
      let hint;
      let marker;
      if (step === 'log') {
        hint = 'Garron wants the big fallen log down the trail, for a seat by the fire. Show him where it is.';
        marker = { x: LOG.x, z: LOG.z, label: 'The fallen log', r: 3 };
      } else if (step === 'spear' || !have('spear')) {
        const short = D.guide.forNeeds({ stave: 1, flint: 1, vine: 1 });
        const where = { stave: 'A stave: cut a young sapling with the blade (E).', flint: 'Flint: Flint Rise, the dark stones.', vine: 'A vine: from the jungle trees.' };
        hint = short ? `${where[short.key]} Then Tab, Make: the spear.` : 'Tab, Make: the spear.';
        marker = short || labMark('Make the spear (Tab)');
      } else {
        hint = D.hero.weapon === 'spear' ? 'Left mouse jabs. Five good hits on the post.' : 'Press 5 to hold the spear, then left mouse to jab the post.';
        marker = world ? { x: world.post.x, z: world.post.z, label: 'The training post', r: 2.4 } : null;
      }
      return { title: 'Stronger', list, hint, marker, page: 'spear' };
    },
    c3argue: () => ({ title: 'Two roads', list: [], hint: '', marker: null }),
    c3jungle: () => ({ title: 'Two roads', list: [], hint: '', marker: null }),
    c3pack: () => {
      const items = [['revonite', 'The Revonite Mira hid (CLAY pot)', 'clay'], ['resin', 'Resin, for torches', 'resin'], ['fiber', 'Plant fibre', 'fiber'], ['pot_water', 'Water', 'pot_water']];
      const left = items.filter(([, , pot]) => (pot === 'clay' ? !flags().hiddenTaken : (lab().store[pot] || 0) > 0));
      const list = items.map(([, text, pot]) => tick(text, pot === 'clay' ? flags().hiddenTaken : !(lab().store[pot] > 0)));
      list.push(tick('Rest: we leave at first light', false));
      const next = left[0];
      return {
        title: 'We can\'t stay',
        list,
        hint: next ? 'In the lab: E at each pot on the packing list.' : 'Packed. Climb up to the shelter and lie down (E): we go at first light.',
        marker: next ? potMark(next[2], `${next[2] === 'clay' ? 'CLAY' : next[2] === 'pot_water' ? 'WATER' : next[2] === 'fiber' ? 'FIBRE' : 'RESIN'} pot (E)`) : D.shelter.ladder ? { x: D.shelter.ladder.bottom.x, z: D.shelter.ladder.bottom.z, label: 'The ladder (E)', r: 1.5 } : null,
      };
    },
    c3pass: () => {
      const b = east().BOULDER;
      const atPass = flags().sawBoulder;
      const list = [
        tick('East, to the Lookout and on into the pass', atPass),
        need('pole', 1, 'A long pole', flags().leverSet ? 1 : 0),
        need('stone', 1, 'A stone, to lever over', flags().leverSet ? 1 : 0),
        tick('Set the lever (E at the boulder)', flags().leverSet),
        tick('Lean on it', east().cleared),
      ];
      let hint;
      let marker;
      if (!atPass) {
        hint = 'Up the goat trail past Flint Rise to the Lookout, and on east into the gap in the mountains.';
        marker = { x: b.x - 5, z: b.z, label: 'The Eastern Pass', r: 4 };
      } else if (!flags().leverSet && !have('pole')) {
        hint = D.items.has('axe') ? 'A long pole: there are young trees just below the Lookout (E with the axe).' : 'A pole needs the stone axe.';
        marker = D.guide.source('pole');
      } else if (!flags().leverSet && !have('stone')) {
        hint = 'A stone for the pole to pivot on: the marker shows the nearest.';
        marker = D.guide.source('stone');
      } else {
        hint = flags().leverSet ? 'E: lean on the long end of the lever.' : 'E at the boulder: the pole goes under its edge, over the stone.';
        marker = { x: b.x - 2.8, z: b.z, label: flags().leverSet ? 'Lean on the lever (E)' : 'Set the lever (E)', r: 2.5 };
      }
      return { title: 'Over the ridge', list, hint, marker, page: 'lever' };
    },
    c3ravine: () => {
      const E3 = east();
      const list = [
        need('fiber', 8, 'Plant fibre, for rope', flags().braiding || have('rope') || have('rope_arrow') || E3.rope ? 8 : 0),
        tick('Mira braids a rope (give her the fibre)', have('rope') || have('rope_arrow') || E3.rope),
        tick('A rope arrow (Tab, Make)', have('rope_arrow') || E3.rope),
        tick('Shoot it into the big tree across', E3.rope),
        tick('Cross, hand over hand (E at the post)', E3.crossed),
      ];
      let hint;
      let marker;
      const m = mira();
      if (E3.crossed) {
        hint = 'Across! Teo and Mira are coming over after you.';
        marker = null;
      } else if (!flags().sawRavine) {
        hint = 'On along the pass to the east.';
        marker = { x: E3.WEST_POST.x - 3, z: E3.WEST_POST.z, label: 'On through the pass', r: 4 };
      } else if (!E3.rope && !have('rope') && !have('rope_arrow') && !flags().braiding) {
        if (have('fiber') < 8) {
          hint = 'Plant fibre: the tall yellow grass in the pass. Mira needs 8.';
          marker = D.guide.source('fiber');
        } else {
          hint = 'Give Mira the fibre (E by her): she braids it into a rope.';
          marker = personMark(m, 'Mira (E)');
        }
      } else if (flags().braiding && !have('rope') && !have('rope_arrow') && !E3.rope) {
        hint = 'Mira is braiding the rope. A few moments.';
        marker = personMark(m, 'Mira');
      } else if (!have('rope_arrow') && !E3.rope) {
        hint = have('arrow') ? 'Tab, Make: a rope arrow (an arrow and the rope).' : 'An arrow for the rope: 2 sticks and 1 flint make 2 (Tab, Make).';
        marker = have('arrow') ? personMark(m, 'Make a rope arrow (Tab)') : D.guide.forNeeds({ stick: 2, flint: 1 });
      } else if (!E3.rope) {
        hint = 'The bow (3): aim at the big tree on the far side and shoot. The rope arrow goes first. Missed? Mira pulls it back.';
        marker = { x: E3.TREE.x, z: E3.TREE.z, y: T.height(E3.TREE.x, E3.TREE.z) + 3, label: 'Shoot the rope arrow here', r: 1.2 };
      } else {
        hint = 'E at the post: hold W to go hand over hand. Let go of W to rest your arms; S goes back.';
        marker = { x: E3.WEST_POST.x, z: E3.WEST_POST.z, label: 'Cross on the rope (E)', r: 1.6 };
      }
      return { title: 'The ravine', list, hint, marker, page: 'rope' };
    },
    c3meadow: () => {
      const E3 = east();
      const list = [
        tick('The mound by the old road', flags().sawCar),
        tick('The sign', flags().sawSign),
        tick('The stone hiker\'s compass', have('compass')),
        need('cotton', 6, 'Wild cotton', flags().sewing || flags().bandages ? 6 : 0),
        tick('Mira makes bandages (give her the cotton)', flags().bandages),
        tick('Before dark: the rock overhang', false),
      ];
      let hint;
      let marker;
      const m = mira();
      if (!flags().sawCar) {
        hint = 'Follow the old road east. Something by it, under the moss.';
        marker = { x: E3.CAR.x, z: E3.CAR.z, label: 'Under the moss', r: 3 };
      } else if (!flags().sawSign) {
        hint = 'A post with a sign on it, further along.';
        marker = { x: E3.SIGN.x, z: E3.SIGN.z, label: 'The sign', r: 2 };
      } else if (!have('compass')) {
        hint = 'The stone hiker by the road: something in his hand.';
        marker = { x: E3.HIKER.x, z: E3.HIKER.z, label: 'The stone hiker (E)', r: 2 };
      } else if (have('cotton') < 6 && !flags().sewing && !flags().bandages) {
        hint = 'Wild cotton: the bushes with white bolls on them (E, 2 each).';
        const c = (E3.cotton || []).filter((q) => !D.items.taken.has(q.id)).sort((a, b) => Math.hypot(a.x - D.hero.pos.x, a.z - D.hero.pos.z) - Math.hypot(b.x - D.hero.pos.x, b.z - D.hero.pos.z))[0];
        marker = c ? { x: c.x, z: c.z, label: 'Wild cotton', r: 1.6 } : null;
      } else if (!flags().sewing && !flags().bandages) {
        hint = 'Give Mira the cotton (E by her).';
        marker = personMark(m, 'Mira (E)');
      } else {
        hint = 'The light is going. The rock overhang, across the meadow: shelter for the night.';
        marker = { x: E3.camp.x, z: E3.camp.z, label: 'The rock overhang', r: 4 };
      }
      return { title: 'The High Meadow', list, hint, marker, page: 'compass' };
    },
    c3wolves: () => {
      const f = D.camp.fire('overhang');
      const pack = east().pack;
      const list = [
        need('stick', 4, 'Dead wood for a fire', f && f.lit ? 4 : 0),
        tick('A fire under the overhang', f && f.lit),
        { text: 'Hold them off, by the fire', count: pack ? `${Math.min(100, Math.round((pack.held || 0) / 0.7))}%` : '', done: pack && pack.fled },
        { text: 'Wolves driven off', count: `${Math.min(3, pack ? pack.killed : 0)}/3`, done: pack && pack.fled },
      ];
      let hint;
      let marker;
      if (!(f && f.lit)) {
        const short = D.guide.forNeeds({ stick: 4 });
        if (short && !(f && f.built)) {
          hint = 'Dead wood: under the trees round the overhang. Quick.';
          marker = short;
        } else {
          const tinder = D.guide.forNeeds(D.camp.tinderNeeds);
          hint = D.camp.torchLit() ? 'E at the ring of stones: light it with your torch.' : tinder ? 'Tinder for the bow drill: a stick and 2 plant fibre.' : 'E at the ring of stones: the bow drill. Saw A, D, A, D; E blows the ember.';
          if (!D.camp.torchLit() && tinder) {
            marker = tinder;
            return { title: 'Wolves', list, hint, marker, page: 'wolves' };
          }
          marker = fireMark('overhang', 'Light the fire (E)');
        }
      } else {
        hint = 'Stay by the fire: they won\'t come near it. Spear (5) or bow (3) for the ones that dart in. Hurt? Q binds a bandage.';
        marker = fireMark('overhang', 'The fire');
      }
      return { title: 'Wolves', list, hint, marker, page: 'wolves' };
    },
    c3river: () => ({
      title: 'The river',
      list: [tick('Down to the river, at the bridge', flags().sawVillage)],
      hint: 'The road goes on down the slope, east, to the gorge.',
      marker: { x: east().bridgehead.x, z: east().bridgehead.z, label: 'The bridge', r: 4 },
    }),
    c3end: () => ({ title: 'Two Roads', list: [], hint: '', marker: null }),
  };
  ch3.objective = (s) => {
    const o = OBJECTIVES[s] ? OBJECTIVES[s]() : null;
    // what Teo and Mira are doing, under it
    const e = errandText();
    D.ui.tracker(e ? e[0] : null, e ? e[1] : 0);
    return o;
  };

  // the kit's tab, the fire's recipes, what E at a fire offers first, which fires are ours
  ch3.kitTab = () => {
    if (stage() === 'c3lab') return 'build';
    if (stage() === 'c3brew' || (stage() === 'c3dose' && (have('nitre') >= 6 || have('saltpetre')))) return 'fire';
    return 'make';
  };
  ch3.recipeOpen = (id) => ({ pots: true, saltpetre: true, fluid: true, doses: at('c3brew') }[id]);
  ch3.fireWants = () => ({ c3bear: 'torch', c3dose: have('ash') ? 'torch' : 'ash', c3minerals: 'torch', c3brew: 'ash' }[stage()] || null);
  ch3.campSpots = () => ['day', 'night', ...(at('c3dose') && D.camp.fire('mouth') && D.camp.fire('mouth').built ? ['mouth'] : []), ...(lab().stage >= 3 ? ['lab'] : []), ...(at('c3wolves') ? ['overhang'] : [])];
  ch3.canBuildLab = () => at('c3lab') && !at('c3labelled');
  // what E at a lab pot does, when the story wants something special (Mira's hidden Revonite)
  ch3.potAction = (p) => {
    if (p.text === 'CLAY' && stage() === 'c3pack' && !flags().hiddenTaken) {
      return { label: 'Take the Revonite Mira hid under the clay (3)', act: () => {
        const h = D.hero;
        if (h.startAction('Taking the Revonite', 1, { pose: 'gather', onDone: () => {
          flags().hiddenTaken = true;
          D.items.add('revonite', 3);
          D.story.refresh(true);
        } })) h.action.face = Math.atan2(p.x - h.pos.x, p.z - h.pos.z);
      } };
    }
    // packing: take, never put back
    if (stage() === 'c3pack' && ['resin', 'fiber', 'pot_water'].includes(p.key) && !(lab().store[p.key] > 0)) {
      return { label: `${p.text}: packed`, cannot: 'Already packed: it is in your kit', act: () => {} };
    }
    return undefined;
  };
  ch3.showVillage = () => stage() === 'c3river' || stage() === 'c3end';

  // ---------- Stage by stage ----------

  // Checked twice a second: has the goal been reached?
  ch3.check = () => {
    if (!ch3.started()) return;
    const h = D.hero;
    switch (stage()) {
      case 'c3dose':
        if (have('fluid') >= 1) {
          think('One dose. For Mira.', 3);
          go('c3mira');
          raise('c3mira');
        }
        break;
      case 'c3home':
        if (Math.hypot(h.pos.x - lab().site.x, h.pos.z - lab().site.z) < 12) planScene();
        break;
      case 'c3axe':
        if (have('axe')) {
          think('A good edge. Now: poles.', 3);
          go('c3lab');
          raise('c3lab');
        }
        break;
      case 'c3lab':
        if (lab().done()) {
          think('Done. A room of our own.', 3);
          go('c3minerals');
          raise('c3minerals');
        }
        break;
      case 'c3minerals':
        if (mineralsReady() && lab().done()) {
          if (flags().errand && flags().errand.t >= ERRAND.paint) labelledScene();
          else if (!flags().waitPots) {
            flags().waitPots = true;
            think('Everything I need. Now, where are those pots?', 3.5);
          }
        }
        break;
      case 'c3brew':
        if ((lab().store.fluid || 0) >= 3) nightScene();
        break;
      case 'c3strong':
        if (flags().strongStep === 'log' && Math.hypot(h.pos.x - LOG.x, h.pos.z - LOG.z) < 7) logScene();
        if (flags().strongStep === 'spear' && have('spear')) {
          flags().strongStep = 'train';
          says(GARRON, 'Good. Now the post, by the lab. Hit it like it owes you something.', 4);
          refreshWorld();
          D.story.refresh(true);
        }
        break;
      case 'c3pack':
        break;
      case 'c3pass':
        if (!flags().sawBoulder && Math.hypot(h.pos.x - east().BOULDER.x, h.pos.z - east().BOULDER.z) < 12) {
          flags().sawBoulder = true;
          says(TEO, 'Rockslide. Not old, either. The whole pass is choked.', 3.5, true);
          says(REN, 'We can\'t lift that. But a long enough pole can. A lever.', 3.5);
          says(MIRA, 'A pole and a stone. That\'s all?', 2.5);
          says(REN, 'Give me a place to stand, and I\'ll move the world.', 3);
          D.story.refresh(true);
        }
        break;
      case 'c3ravine':
        if (!flags().sawRavine && Math.hypot(h.pos.x - east().WEST_POST.x, h.pos.z - east().WEST_POST.z) < 22) {
          flags().sawRavine = true;
          says(MIRA, 'The bridge... it\'s gone. Look, the cables rusted right through.', 3.5, true);
          says(REN, 'Then we make our own. A rope, shot across into that tree.', 3.5);
          says(MIRA, 'Rope I can do. Bring me fibre: eight handfuls of that yellow grass.', 4);
          D.story.refresh(true);
        }
        break;
      case 'c3meadow':
        if ((flags().bandages || flags().sewing) && Math.hypot(h.pos.x - east().camp.x, h.pos.z - east().camp.z) < 9) startWolves();
        break;
      case 'c3river':
        if (!flags().sawVillage && Math.hypot(h.pos.x - east().bridgehead.x, h.pos.z - east().bridgehead.z) < 8) riverScene();
        break;
      default:
        break;
    }
  };

  // Things that happen, from the rest of the game.
  ch3.on = (event, data) => {
    if (!ch3.started()) return;
    switch (event) {
      case 'cooked':
        if (data === 'saltpetre' && stage() === 'c3dose') think('Saltpetre. Now the Revonite, and a pot of water.', 3.5);
        if (data === 'doses' && stage() === 'c3brew') {
          says(MIRA, 'Three doses! Into the FLUID pots with them, before something knocks them over.', 4);
          D.story.refresh(true);
        }
        break;
      case 'labBuilt':
        if (data === 'walls') think('Walls of woven sticks. Next, clay to fill them.', 3);
        if (data === 'daub') think('It\'ll dry hard as a pot. And a hearth by the door.', 3.5);
        if (data === 'roof') think('A roof I can stand up under.', 3);
        break;
      case 'stored':
        D.story.refresh(true);
        break;
      case 'took':
        D.story.refresh(true);
        break;
      case 'gained':
        if (data.key === 'pole' && !flags().pole1) {
          flags().pole1 = true;
          think('Straight and strong. Two poles from each tree.', 3);
        }
        break;
      case 'ropeAcross':
        says(MIRA, 'It held! It\'s in the tree!', 2.5, true);
        says(TEO, 'Tie it off at this end. I\'m not going first.', 3);
        D.story.refresh(true);
        break;
      case 'ropeMissed':
        says(MIRA, 'Missed! I\'ve got the rope, I\'ll pull it back. Try again.', 3.5, true);
        break;
      case 'crossed':
        if (data === 'east' && stage() === 'c3ravine') {
          says(REN, 'Across. Come on, one at a time, slowly!', 3, true);
          setTimeout(() => {
            for (const p of [teo(), mira()]) if (p) P().teleport(p, east().TREE.x - 2.5 - Math.random(), east().TREE.z + 2 + Math.random() * 2);
            says(TEO, 'Never... again.', 2.5);
            says(MIRA, 'The road. Look, there\'s an old road under the grass.', 3.5);
            go('c3meadow');
            raise('c3meadow');
          }, 3500);
        }
        break;
      case 'passCleared':
        if (stage() === 'c3pass') {
          says(TEO, 'It moved! It actually moved!', 2.5, true);
          says(MIRA, 'A pole and a stone. I\'ll never doubt you again.', 3);
          go('c3ravine');
          raise('c3ravine');
        }
        break;
      case 'compass':
        think('A compass. The needle still swings north, after a thousand years.', 4);
        think('North... and the ring is that way. North-east.', 3.5);
        D.story.refresh(true);
        break;
      case 'wolfDown':
        if (data === 1) says(TEO, 'One down! Stay by the fire!', 2.5, true);
        break;
      case 'wolvesGone':
        if (stage() === 'c3wolves') {
          says(MIRA, 'They\'re going... they\'re going!', 2.5, true);
          setTimeout(() => wolvesNight(), 2500);
        }
        break;
      case 'bandaged':
        D.story.refresh(true);
        break;
      default:
        break;
    }
  };

  // ---------- The scenes ----------

  // A conversation: everyone where they are, the camera moving slowly round a point.
  function talk(lines, centre, { radius = 4.2, height = 1.2, a0 = 2.4, turn = 0.5, fov = 46, after = null } = {}) {
    const total = lines.reduce((s, l) => s + l[2] + 0.4, 0);
    D.story.playCine([{
      dur: total, caption: '',
      enter: () => lines.forEach(([who, text, s], i) => D.ui.say(who, text, s, i === 0)),
      update: () => {},
      cam: (k) => {
        const c = typeof centre === 'function' ? centre() : centre;
        const a = a0 + k * turn;
        return { pos: c.clone().add(new THREE.Vector3(Math.cos(a) * radius, height, Math.sin(a) * radius)), look: c.clone().add(new THREE.Vector3(0, 0.3, 0)), fov };
      },
    }], () => {
      D.ui.quiet();
      if (after) after();
    });
  }
  const followAll = () => {
    const t = teo();
    const m = mira();
    if (t && t.group.visible) P().follow(t, 0);
    if (m && m.group.visible) P().follow(m, 1);
  };

  // 1. Teo's request, at the fire under the Elder Tree.
  function talkScene() {
    const t = teo();
    const f = D.camp.fire('night');
    const h = D.hero;
    h.teleport(f.x - 1.6, f.z + 0.4, Math.atan2(1.6, -0.4));
    h.cinematicPose = 'sit';
    if (t) P().setPose(t, 'sit', { x: f.x + 1.5, z: f.z - 0.5, h: Math.atan2(-1.5, 0.5) });
    talk([
      [TEO, 'I couldn\'t sleep. I kept thinking about her.', 3.5],
      [REN, 'Her?', 1.5],
      [TEO, 'Mira. We came to map the cave together, that last day. She drew everything I found: every crystal, every bat.', 5.5],
      [TEO, 'When the light came, I ran for the cave and shouted for her to follow. She was right behind me.', 5],
      [TEO, 'She\'s still there. Just outside the mouth, arms over her face.', 4],
      [REN, 'Then we wake her. We need hands, and from what you say, hers can make anything.', 4.5],
      [TEO, 'There\'s a problem. The bear you hit last night: I saw it limp into the cave at first light.', 5],
      [TEO, 'It\'s in the tunnel. Between us and the Revonite.', 3.5],
      [REN, 'Then we get it out. We don\'t fight it in the dark.', 3.5],
      [TEO, 'Smoke. Animals hate smoke. Green ferns on a fire at the mouth, and the draught carries it straight in.', 5],
    ], new THREE.Vector3(f.x, f.y + 0.9, f.z), { after: () => {
      h.cinematicPose = null;
      followAll();
      D.story.startPlay(true);
      go('c3bear');
      raise('c3bear');
      think('Ferns, dead wood, a torch to light it. To the cave.', 3.5);
      D.ui.tutorial('Follow the marker &middot; <kbd>Tab</kbd> kit &middot; <kbd>B</kbd> field notes: Chapter 3', 7);
    } });
  }

  // 2. The bear comes out of the smoke.
  function smokeOut() {
    const bear = D.combat.getBear();
    if (!bear) return;
    D.combat.revive(bear);
    bear.raid = false;
    bear.visit = null;
    bear.group.visible = true;
    bear.x = C.statue.x;
    bear.z = C.statue.z + 4;
    bear.h = Math.PI;
    flags().smoking = { t: 0 };
    says(TEO, 'Get clear of the mouth! Over here, to the side!', 3, true);
    think('Come on... come on...', 3);
  }
  function updateSmoke(dt) {
    const s = flags().smoking;
    const bear = D.combat.bear;
    if (!s || !bear || stage() !== 'c3bear') return;
    s.t += dt;
    const h = D.hero;
    if (s.t < 7) {
      bear.tx = C.statue.x;
      bear.tz = C.statue.z + 4;
      bear.goal = 0;
      if (s.t > 5.5 && !s.roared) {
        s.roared = true;
        bear.roaring = 2.5;
        if (D.audio) D.audio.roar('bear', Math.hypot(bear.x - h.pos.x, bear.z - h.pos.z), 1.4);
        says(TEO, 'Here it comes!', 1.5, true);
      }
    } else {
      // out of the mouth at a run, past the fire, and away to the east
      const path = [[C.statue.x, C.mouthZ - 2], [24, 232], [44, 214], [80, 190]];
      s.leg = s.leg || 0;
      const [tx, tz] = path[Math.min(s.leg, path.length - 1)];
      bear.tx = tx;
      bear.tz = tz;
      bear.goal = bear.sp.run * 0.75;
      if (Math.hypot(bear.x - tx, bear.z - tz) < 3 && s.leg < path.length - 1) s.leg++;
      const toHero = Math.hypot(bear.x - h.pos.x, bear.z - h.pos.z);
      if (toHero < 2.2 && !s.hit && !h.dead) {
        s.hit = true;
        h.hurt(22, 'Run down by the bear', (h.pos.x - bear.x) / toHero, (h.pos.z - bear.z) / toHero, 1.4);
        says(TEO, 'I said stand clear!', 2, true);
      }
      if (s.leg >= path.length - 1 && Math.hypot(bear.x - tx, bear.z - tz) < 4) {
        bear.group.visible = false;
        flags().smoking = null;
        says(TEO, 'It\'s gone. It\'s really gone!', 2.5, true);
        think('The cave is ours again. Now: one more dose.', 3.5);
        go('c3dose');
        raise('c3dose');
        return;
      }
    }
    D.combat.moveBeast(bear, dt);
    D.combat.animateBeast(bear, dt);
  }

  // 4. Mira wakes.
  function wakeMira() {
    const s = miraStatue();
    const m = P().make({ id: 'mira', name: MIRA, statue: s });
    D.story.playCine(P().wakeShots(m, [
      [MIRA, 'Teo...? Teo! The light, it was everywhere, I couldn\'t see...', 4],
      [TEO, 'I know. I know. It\'s over. It\'s been over for a very long time.', 4],
    ]), () => {
      P().alive(m);
      P().stand(m, D.hero.pos);
      const t = teo();
      if (t) {
        P().teleport(t, m.x + 1.2, m.z + 0.8);
        P().stand(t, m);
      }
      talk([
        [MIRA, 'How long?', 1.8],
        [REN, 'A thousand years, near enough. Everyone turned to stone: you, him, me. Everyone.', 5],
        [REN, 'I woke in that cave. Water dripping through the green stone did it. I\'ve learned to make it: the fluid that woke you.', 6],
        [MIRA, '...And who are you?', 2],
        [REN, 'Ren. I woke two days ago. Teo, yesterday.', 3],
        [MIRA, 'Ren. Your clothes are falling apart, Ren.', 3],
        [TEO, 'She sewed our tents. She drew every map we made.', 3.5],
        [MIRA, 'Give me fibre and a sharp bone, and I can make you anything.', 4],
        [REN, 'Then there\'s a lot to make. Home is the big tree to the north. Come on.', 4],
      ], () => new THREE.Vector3(m.x, m.y + 1.2, m.z), { radius: 4.6, after: () => {
        followAll();
        D.story.startPlay(true);
        go('c3home');
        raise('c3home');
      } });
    });
  }

  // 5. The plan, at the Elder Tree.
  function planScene() {
    if (flags().labPlanned) return;
    flags().labPlanned = true;
    const site = lab().site;
    const t = teo();
    const m = mira();
    if (t) P().setPose(t, null, { x: site.x + 1.5, z: site.z + 1, h: Math.atan2(-1.5, -1) });
    if (m) P().setPose(m, null, { x: site.x - 1.3, z: site.z + 1.4, h: Math.atan2(1.3, -1.4) });
    talk([
      [MIRA, 'So where do you keep everything?', 2.5],
      [REN, '...Here. In my arms.', 2.5],
      [MIRA, 'Then that\'s the first thing. A storeroom: dry, safe, every pot with its name on it.', 4.5],
      [TEO, 'A lab. Somewhere to brew the fluid properly. Three doses at a time, not one.', 4.5],
      [REN, 'Right here, beside the tree. Posts, walls of woven sticks with clay pressed in, a roof of big leaves, racks inside.', 6],
      [MIRA, 'Teo and I will make the pots. Twelve, with lids. We\'ll dig the clay at the river bank, bake them, and paint the names on.', 6],
      [TEO, 'And I\'ll bring you clay for the walls.', 2.5],
      [REN, 'Then I\'ll get the wood, the leaves... and nitre and Revonite for three doses. A stone axe first, for the poles.', 5.5],
      [MIRA, 'Go on, then. We\'ll find you here by evening.', 3],
    ], new THREE.Vector3(site.x, site.y + 1.2, site.z), { after: () => {
      // off they go, to the Clay Banks
      flags().errand = { t: 0 };
      for (const p of [t, m]) if (p) P().goTo(p, L.tree.x + 6, L.tree.z + 26, { speed: 1.5, onArrive: (q) => P().hide(q) });
      D.story.startPlay(true);
      go('c3axe');
      raise('c3axe');
      D.ui.tutorial('Teo and Mira\'s work shows under your goal &middot; <kbd>Tab</kbd>: Make, Build the lab', 7);
    } });
  }

  // Teo and Mira's day: at the Clay Banks while you work; there to be seen if you go and look.
  function updateErrand(dt) {
    const e = flags().errand;
    if (!e || at('c3labelled')) return;
    // the rest of you waiting on them: they hurry
    const waiting = lab().done() && mineralsReady();
    e.t += dt * (waiting && e.t < ERRAND.paint ? 6 : 1);
    // the clay for the walls: Teo brings it as soon as the walls are woven (or when it is dug)
    if (!flags().clayDelivered && !e.bringing && (lab().stage >= 2 || e.t >= ERRAND.deliver) && e.t >= ERRAND.walk) {
      const t0 = teo();
      const near = Math.hypot(D.hero.pos.x - world.basket.x, D.hero.pos.z - world.basket.z) < 60;
      if (t0 && near) {
        e.bringing = true;
        const from = lab().at(-4, 22);
        P().show(t0);
        P().teleport(t0, from.x, from.z);
        P().goTo(t0, world.basket.x - 0.6, world.basket.z + 0.8, { speed: 2.2, pose: 'carry', onArrive: (q) => {
          flags().clayDelivered = true;
          e.bringing = false;
          refreshWorld();
          says(TEO, 'Clay for your walls! In the basket. Back to the pots, Mira will skin me!', 4);
          D.story.refresh(true);
          P().goTo(q, from.x, from.z, { speed: 2.4, onArrive: (r) => P().hide(r) });
        } });
      } else {
        flags().clayDelivered = true;
        refreshWorld();
        D.ui.toast('Teo left a basket of clay by the lab');
        D.story.refresh(true);
      }
    }
    const w = D.ch2 && D.ch2.world && D.ch2.world();
    const banks = w && w.clayCentre;
    const t = teo();
    const m = mira();
    if (!banks || !t || !m || e.t < ERRAND.walk) return;
    const near = Math.hypot(D.hero.pos.x - banks.x, D.hero.pos.z - banks.z) < 75;
    for (const [p, dx, dz] of [[t, 2.5, -1.5], [m, -1.5, 1.8]]) {
      if (p === t && e.bringing) continue;
      if (near && !p.group.visible) {
        P().show(p);
        const pose = e.t < ERRAND.deliver ? 'work' : e.t < ERRAND.bake ? (p === m ? 'work' : 'sit') : e.t < ERRAND.paint ? 'sit' : (p === m ? 'paint' : 'sit');
        P().setPose(p, pose, { x: banks.x + 4 + dx, z: banks.z + dz, h: Math.atan2(-dx, -dz) });
      } else if (!near && p.group.visible && p.mode !== 'goto' && !e.bringing) P().hide(p);
    }
  }

  // 8. Labelled: the pots come home.
  function labelledScene() {
    go('c3labelled');
    const L5 = lab();
    const t = teo();
    const m = mira();
    const site = L5.site;
    const door = L5.door;
    const from = L5.at(-2, 16);
    const inside = L5.at(0.8, 0.6, 1.5);
    const rack = L5.at(0, -1.6, 1.0);
    for (const p of [t, m]) P().show(p);
    // poles across their shoulders, pots hanging from them
    const potGeo = new THREE.LatheGeometry([[0, 0], [0.08, 0], [0.12, 0.04], [0.14, 0.12], [0.13, 0.19], [0.08, 0.24], [0.07, 0.27]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    const potMat = new THREE.MeshStandardMaterial({ color: D.col(0xb4704a), roughness: 0.85 });
    const loads = [t, m].map((p) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), new THREE.MeshStandardMaterial({ color: D.col(0x8a6a42) }));
      pole.rotation.z = Math.PI / 2;
      g.add(pole);
      for (const s of [-0.8, -0.6, 0.6, 0.8]) {
        const pot = new THREE.Mesh(potGeo, potMat);
        pot.position.set(s, -0.5, 0);
        g.add(pot);
      }
      // across the shoulders (in the body's own frame: x across, y up), pots hanging either side
      P().hold(p, g, null, { pos: new THREE.Vector3(0, 1.48, 0.05) });
      return g;
    });
    P().teleport(t, from.x + 0.8, from.z, Math.atan2(site.x - from.x, site.z - from.z));
    P().teleport(m, from.x - 0.8, from.z - 1.2, Math.atan2(site.x - from.x, site.z - from.z));
    P().goTo(t, site.x + 0.6, site.z, { speed: 1.3, pose: 'carry' });
    P().goTo(m, site.x - 0.6, site.z - 0.6, { speed: 1.3, pose: 'carry' });
    let shown = 0;
    D.story.playCine([
      {
        dur: 7, caption: 'Evening. Through the trees, the sound of voices, and pots knocking together.',
        enter: () => {
          D.env.hour = Math.max(D.env.hour, 17.3);
          L5.showPots(0, false);
        },
        update: (k) => {
          // (they walk while the scene plays: people.js only moves people in play, so here)
          for (const p of [t, m]) {
            if (p.goal) {
              const g = p.goal;
              const d = Math.hypot(g.x - p.x, g.z - p.z);
              if (d > 0.6) {
                p.h = Math.atan2(g.x - p.x, g.z - p.z);
                p.x += Math.sin(p.h) * 1.3 / 60;
                p.z += Math.cos(p.h) * 1.3 / 60;
                p.y = T.height(p.x, p.z);
                p.speed = 1.3;
                P().place(p);
              } else p.speed = 0;
            }
          }
          void k;
        },
        cam: (k) => ({ pos: site.clone().add(new THREE.Vector3(3 - k * 2, 2.2, 3)), look: t.group.position.clone().add(new THREE.Vector3(0, 1.3, 0)), fov: 52 }),
      },
      {
        dur: 8, caption: '',
        enter: () => {
          for (const p of [t, m]) P().drop(p);
          loads.length = 0;
          P().setPose(m, 'paint', { x: rack.x + 0.4, z: rack.z + 0.9, y: L5.frame.y, h: Math.atan2(rack.x - (rack.x + 0.4), rack.z - (rack.z + 0.9)) });
          P().setPose(t, null, { x: rack.x - 1.2, z: rack.z + 1.3, y: L5.frame.y, h: Math.atan2(0.4, -1) });
          says(MIRA, 'Twelve pots. Twelve names. NITRE. SALTPETRE. ASH. REVONITE...', 4.5, true);
          says(TEO, 'And three for the fluid. One for every dose.', 3);
        },
        update: (k) => {
          const n = Math.min(12, Math.floor(k * 14));
          if (n !== shown) {
            shown = n;
            L5.showPots(n, n >= 12);
            if (D.audio) D.audio.knock();
          }
        },
        cam: (k) => ({ pos: inside.clone().add(new THREE.Vector3(0, 0.1 - k * 0.2, 0)), look: rack.clone().add(new THREE.Vector3((k - 0.5) * 2, 0, 0)), fov: 58 }),
      },
      {
        dur: 7, caption: '',
        enter: () => {
          L5.showPots(12, true);
          D.camp.light('lab', 300);
          says(REN, 'It\'s real now. A lab.', 2.5, true);
          says(MIRA, 'A storeroom, with ideas.', 2.5);
          says(TEO, 'Now: three doses. Let\'s see what this place can do.', 3.5);
        },
        update: () => {},
        cam: (k) => {
          const a = L5.at(-2.2 + k * 3.6, -0.6, 1.3);
          return { pos: a, look: L5.at(-2.2 + k * 3.6, -2.2, 0.9), fov: 50 };
        },
      },
    ], () => {
      D.ui.quiet();
      L5.showPots(12, true);
      for (const p of [t, m]) P().drop(p);
      P().setPose(t, 'sit', { x: D.camp.spot('night').x + 1.5, z: D.camp.spot('night').z - 0.5, h: Math.atan2(-1.5, 0.5) });
      P().stand(m, null);
      P().teleport(m, door.x + 1.4, door.z + 1.2);
      flags().errand = null;
      D.ui.tracker(null);
      D.story.startPlay(true);
      go('c3brew');
      raise('c3brew');
    });
  }

  // 10. A quiet night: the mural, and sleep.
  function nightScene() {
    if (flags().nightDone) return;
    flags().nightDone = true;
    go('c3night');
    const L5 = lab();
    const t = teo();
    const m = mira();
    const f = D.camp.fire('night');
    const h = D.hero;
    const wall = L5.at(-3.4, 0.1, 1.2);
    D.story.playCine([
      {
        dur: 9, caption: 'That night, by the fire.',
        enter: () => {
          D.env.hour = 20.3;
          D.forceSkyCapture();
          D.nightFill = 0.7;
          D.camp.light('night', 300);
          h.teleport(f.x - 1.6, f.z + 0.4, Math.atan2(1.6, -0.4));
          h.cinematicPose = 'sit';
          P().setPose(t, 'sit', { x: f.x + 1.5, z: f.z - 0.5, h: Math.atan2(-1.5, 0.5) });
          P().setPose(m, 'paint', { x: wall.x - 0.9, z: wall.z, h: Math.atan2(0.9, 0) + 0 });
          m.h = Math.atan2(wall.x - (wall.x - 0.9), 0.001);
          P().place(m);
          L5.mural.visible = true;
          says(MIRA, 'There. The first page of our story.', 3, true);
          says(TEO, 'A man waking in a cave. And three people, walking toward the ring.', 4);
          says(REN, 'Why three?', 1.6);
          says(MIRA, 'Because I\'m not staying behind.', 2.5);
        },
        update: () => {},
        cam: (k) => ({ pos: wall.clone().add(new THREE.Vector3(-3.4 + k * 0.6, 0.6, 2.4)), look: wall.clone().add(new THREE.Vector3(0, 0.2, 0)), fov: 50 }),
      },
      {
        dur: 9, caption: '',
        enter: () => {
          P().setPose(m, 'sit', { x: f.x + 0.2, z: f.z + 1.6, h: Math.atan2(-0.2, -1.6) });
          says(TEO, '...There are so many of them out there. Strong ones, too. People who could help us.', 5, true);
          says(REN, 'One at a time. We wake people we can trust.', 3);
          says(TEO, 'How do you know, until they\'re awake?', 3);
        },
        update: () => {},
        cam: (k) => {
          const c = new THREE.Vector3(f.x, f.y + 0.9, f.z);
          const a = 1.2 + k * 0.4;
          return { pos: c.clone().add(new THREE.Vector3(Math.cos(a) * 4, 1.1, Math.sin(a) * 4)), look: c, fov: 46 };
        },
      },
      {
        dur: 7, caption: 'They slept, the three of them, high in the Elder Tree.',
        enter: () => {
          h.cinematicPose = 'lie';
          const SP = D.shelter;
          const b0 = SP.bed(0);
          h.teleport(b0.x, b0.z, b0.facing, b0.y);
          h.platform = SP.P;
          const b1 = SP.bed(1);
          const b2 = SP.bed(2);
          P().setPose(t, 'sleep', { x: b1.x, z: b1.z, y: b1.y, h: b1.facing });
          P().setPose(m, 'sleep', { x: b2.x, z: b2.z, y: b2.y, h: b2.facing });
        },
        update: (k) => {
          D.env.hour = 21 + k;
        },
        cam: (k) => {
          const SP = D.shelter.P;
          const c = new THREE.Vector3(SP.cx, SP.y + 1.2, SP.cz);
          return { pos: c.clone().add(new THREE.Vector3(SP.ox * (9 - k), 3 + k, SP.oz * (9 - k))).add(new THREE.Vector3(SP.ax * 3, 0, SP.az * 3)), look: c, fov: 48 };
        },
      },
    ], () => {
      D.ui.quiet();
      D.story.fadeTo(1, 1.2, () => {
        D.nightFill = 0;
        D.env.hour = HOURS.c3giant[0];
        D.forceSkyCapture();
        h.cinematicPose = null;
        giantScene();
        D.story.fadeTo(0, 1.5);
      });
    });
  }

  // 11. Morning: Teo brings home a stone giant.
  function makeGarron() {
    let g = garron();
    if (!g) {
      g = P().make({ id: 'garron', name: GARRON, tpl: 5, x: L.tree.x, z: L.tree.z + 20, scale: 1.13, bulk: 1.2, stone: true });
      g.pose = 'stance';
      g.poseW = 1;
    }
    return g;
  }
  function giantScene() {
    go('c3giant');
    const t = teo();
    const m = mira();
    const h = D.hero;
    const f = D.camp.fire('night');
    const g = makeGarron();
    h.platform = null;
    h.teleport(f.x - 1.6, f.z + 1.6, Math.atan2(1.6, -1.6));
    P().setPose(m, 'sit', { x: f.x + 0.4, z: f.z + 1.8, h: Math.atan2(-0.4, -1.8) });
    // he comes up the trail dragging the sledge, the stone man lying on it
    const start = new THREE.Vector3(-20, 0, -140);
    const end = new THREE.Vector3(f.x + 5, 0, f.z + 7);
    const sledge = world.sledge;
    sledge.visible = true;
    P().show(t);
    P().setPose(t, 'drag', null);
    t.mode = 'pose';
    g.group.visible = true;
    g.mode = 'stone';
    g.uniforms.petrify.value = 1;
    g.lie = 1;
    const place = (k) => {
      const x = start.x + (end.x - start.x) * k;
      const z = start.z + (end.z - start.z) * k;
      const head = Math.atan2(end.x - start.x, end.z - start.z);
      t.x = x;
      t.z = z;
      t.h = head;
      t.y = T.height(x, z);
      t.speed = k < 1 ? 1.1 : 0;
      P().place(t);
      const bx = x - Math.sin(head) * 2.6;
      const bz = z - Math.cos(head) * 2.6;
      sledge.position.set(bx, T.height(bx, bz), bz);
      sledge.rotation.y = head;
      // on his back along the sledge, head to the back of it (lying tips a body over behind it)
      P().teleport(g, bx + Math.sin(head) * 2.3, bz + Math.cos(head) * 2.3, head, T.height(bx, bz) + 0.32);
    };
    place(0);
    D.story.playCine([
      {
        dur: 8, caption: 'At first light, Teo was gone. He came back up the trail dragging something heavy.',
        enter: () => {},
        update: (k) => place(smoothstep(0, 1, k) * 0.85),
        cam: (k) => {
          const c = t.group.position.clone();
          return { pos: c.clone().add(new THREE.Vector3(6 - k * 2, 2.6, 5)), look: c.clone().add(new THREE.Vector3(0, 0.6, 0)).lerp(g.group.position, 0.4), fov: 50 };
        },
      },
      {
        dur: 26, caption: '',
        enter: () => {
          place(1);
          P().setPose(t, null, { x: t.x, z: t.z, h: Math.atan2(h.pos.x - t.x, h.pos.z - t.z) });
          says(TEO, 'Look at him. Look at the size of him.', 3, true);
          says(TEO, 'He was in the gorge, by the tiger\'s old den. Not a crack on him.', 4);
          says(MIRA, 'Teo... he\'s frightening.', 2.5);
          says(TEO, 'He\'s strong. He could carry logs, fight off anything that comes for us, guard us while we work.', 5);
          says(REN, 'We said we\'d wake people we can trust.', 3);
          says(TEO, 'How can we know until he\'s awake? Ren. Please. One dose.', 4);
        },
        update: () => {},
        cam: (k) => {
          const c = g.group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
          const a = 0.6 + k * 0.6;
          return { pos: c.clone().add(new THREE.Vector3(Math.cos(a) * 4.4, 1.8, Math.sin(a) * 4.4)), look: c, fov: 48 };
        },
      },
    ], () => {
      D.ui.quiet();
      // stood up beside the lab, for the waking
      sledge.visible = false;
      g.lie = 0;
      const spot = lab().at(-5, 5);
      P().teleport(g, spot.x, spot.z, Math.atan2(D.hero.pos.x - spot.x, D.hero.pos.z - spot.z));
      g.mode = 'stone';
      P().stand(t, g);
      P().teleport(t, spot.x + 2, spot.z + 1.5);
      P().stand(m, g);
      P().teleport(m, spot.x - 2, spot.z + 2);
      D.story.startPlay(true);
      D.story.refresh(true);
      think('One dose. From the lab.', 3);
    });
  }

  // 12. Garron wakes.
  function wakeGarron() {
    const g = garron();
    D.story.playCine(P().wakeShots(g, [
      [GARRON, '...So. It finally ended.', 3],
      [REN, 'You... know what happened?', 2.5],
      [GARRON, 'I know I was standing, and then I wasn\'t. How long?', 3.5],
    ], { kneelTo: 'brace' }), () => {
      P().alive(g);
      P().stand(g, D.hero.pos);
      talk([
        [REN, 'A thousand years, near enough.', 2.5],
        [GARRON, 'And how many of you are awake?', 2.5],
        [REN, 'Three. Now four.', 2],
        [GARRON, 'And who decides who wakes next?', 3],
        [REN, '...We do. Together.', 2.5],
        [GARRON, 'Good answer.', 2],
        [GARRON, 'I\'m Garron. Show me what you\'ve built, little scientist.', 3.5],
      ], () => new THREE.Vector3(g.x, g.y + 1.5, g.z), { radius: 4.8, after: () => {
        P().follow(g, 2);
        followAll();
        flags().strongStep = 'log';
        D.story.startPlay(true);
        go('c3strong');
        raise('c3strong');
        says(GARRON, 'That fallen tree down the trail. It\'d make a good seat by your fire. Show me.', 4);
      } });
    });
  }

  // 13. Stronger: the log, the bear, the spear, the post.
  function logScene() {
    if (flags().logCarried) return;
    flags().logCarried = true;
    const g = garron();
    const m = mira();
    const t = teo();
    const h = D.hero;
    const f = D.camp.fire('night');
    const logMesh = world.log;
    D.story.playCine([
      {
        dur: 5, caption: '',
        enter: () => {
          P().setPose(g, 'brace', { x: LOG.x + 0.2, z: LOG.z + 1.1, h: Math.PI });
          says(GARRON, 'Stand back.', 1.8, true);
        },
        update: (k) => {
          logMesh.position.y = T.height(LOG.x, LOG.z) + 0.3 + smoothstep(0.3, 0.9, k) * 1.4;
          logMesh.rotation.y = k * 0.3;
        },
        cam: (k) => ({ pos: new THREE.Vector3(LOG.x + 4 - k, T.height(LOG.x, LOG.z) + 1.6, LOG.z + 4), look: new THREE.Vector3(LOG.x, T.height(LOG.x, LOG.z) + 1.2, LOG.z), fov: 50 }),
      },
    ], () => {
      think('He lifted it like a branch.', 3);
      logMesh.visible = false;
      // back at the fire: and the bear comes for Mira
      D.story.fadeTo(1, 0.8, () => {
        h.teleport(f.x - 3, f.z + 3, Math.atan2(3, -3));
        P().setPose(m, 'sit', { x: f.x + 0.6, z: f.z + 1.6, h: Math.atan2(-0.6, -1.6) });
        P().stand(t, f);
        P().teleport(t, f.x + 2, f.z - 1.5);
        P().stand(g, f);
        P().teleport(g, f.x - 1, f.z + 4);
        D.story.fadeTo(0, 0.8);
        bearScene();
      });
    });
  }
  function bearScene() {
    const bear = D.combat.getBear();
    const g = garron();
    const m = mira();
    const f = D.camp.fire('night');
    D.combat.revive(bear);
    bear.group.visible = true;
    bear.raid = false;
    bear.visit = null;
    const from = { x: f.x + 26, z: f.z + 14 };
    bear.x = from.x;
    bear.z = from.z;
    let killed = false;
    D.story.playCine([
      {
        dur: 4.5, caption: '',
        enter: () => {
          bear.roaring = 2.5;
          if (D.audio) D.audio.roar('bear', 20, 1.5);
          says(MIRA, 'The bear!', 1.5, true);
        },
        update: (k) => {
          bear.tx = m.x;
          bear.tz = m.z;
          bear.goal = bear.sp.run * 0.8;
          D.combat.moveBeast(bear, 1 / 60);
          D.combat.animateBeast(bear, 1 / 60);
          void k;
        },
        cam: (k) => ({ pos: new THREE.Vector3(f.x - 3, f.y + 1.6, f.z - 2), look: new THREE.Vector3(bear.x, bear.y + 1, bear.z), fov: 48 + k * 4 }),
      },
      {
        dur: 3.5, caption: '',
        enter: () => {
          P().setPose(g, 'brace', { x: m.x + (bear.x - m.x) * 0.35, z: m.z + (bear.z - m.z) * 0.35, h: Math.atan2(bear.x - m.x, bear.z - m.z) });
          says(GARRON, 'Behind me.', 1.5, true);
          D.env.shake = 0.8;
          if (D.audio) D.audio.maul();
        },
        update: (k) => {
          bear.tx = g.x;
          bear.tz = g.z;
          bear.goal = k < 0.4 ? bear.sp.run * 0.5 : 0;
          D.combat.moveBeast(bear, 1 / 60);
          D.combat.animateBeast(bear, 1 / 60);
          if (k > 0.6 && !killed) {
            killed = true;
            D.combat.kill(bear, bear.x - g.x, bear.z - g.z);
            D.env.shake = 1;
            if (D.audio) D.audio.thud();
          }
        },
        cam: (k) => ({ pos: g.group.position.clone().add(new THREE.Vector3(3.2 - k, 1.6, -2.4)), look: g.group.position.clone().lerp(new THREE.Vector3(bear.x, bear.y, bear.z), 0.5).add(new THREE.Vector3(0, 1.2, 0)), fov: 46 }),
      },
      {
        dur: 13, caption: '',
        enter: () => {
          P().setPose(g, 'stance', null);
          says(MIRA, 'You... you killed it. With your hands.', 3, true);
          says(GARRON, 'It was already dying. Now it isn\'t suffering.', 3.5);
          says(TEO, 'Did you see that? Did you SEE that?', 2.5);
          says(GARRON, 'You fight with sticks and stones, little scientist. I\'ll show you a spear. A long stave, a flint point, vine to bind it.', 6);
        },
        update: () => {},
        cam: (k) => {
          const c = new THREE.Vector3(bear.x, bear.y + 0.8, bear.z).lerp(g.group.position, 0.5);
          return { pos: c.clone().add(new THREE.Vector3(4.5 - k, 2.4, 3)), look: c, fov: 48 };
        },
      },
    ], () => {
      D.ui.quiet();
      flags().strongStep = 'spear';
      flags().spearShown = true;
      flags().bearDead = true;
      P().stand(g, null);
      P().follow(g, 2);
      followAll();
      D.story.startPlay(true);
      D.story.refresh(true);
      D.ui.tutorial('New in your kit: the spear (Tab, Make) &middot; <kbd>5</kbd> holds it &middot; left mouse jabs', 7);
    });
  }
  // a jab at the post
  D.combat.meleeTargets.push((point) => {
    if (!world || stage() !== 'c3strong' || flags().strongStep !== 'train') return false;
    const p = world.post;
    if (Math.hypot(point.x - p.x, point.z - p.z) > 1.1) return false;
    p.hits++;
    p.sack.rotation.z = 0.25;
    setTimeout(() => { p.sack.rotation.z = 0; }, 250);
    const lines = ['Again.', 'Lower. Your legs, not your arms.', 'Better.', 'Your weight behind it!', 'Good. Now you\'re stronger than you were this morning.'];
    says(GARRON, lines[Math.min(4, p.hits - 1)], 2.5, true);
    D.story.refresh(true);
    if (p.hits >= 5 && !flags().trained) {
      flags().trained = true;
      D.hero.stats.strength = 1.35;
      D.ui.toast('<b>Stronger:</b> your stamina lasts longer and comes back faster; your spear hits harder');
      setTimeout(() => {
        D.story.raiseHour(18.4);
        argueScene();
      }, 3500);
    }
    return true;
  });

  // 14. Two roads.
  function argueScene() {
    if (stage() !== 'c3strong') return;
    go('c3argue');
    const g = garron();
    const t = teo();
    const m = mira();
    const h = D.hero;
    const f = D.camp.fire('night');
    const L5 = lab();
    const rack = L5.at(0, -1.4, 1.0);
    D.story.playCine([
      {
        dur: 22, caption: 'That evening.',
        enter: () => {
          D.env.hour = 18.6;
          D.forceSkyCapture();
          h.teleport(f.x - 1.6, f.z + 0.4, Math.atan2(1.6, -0.4));
          h.cinematicPose = 'sit';
          P().setPose(t, 'sit', { x: f.x + 1.5, z: f.z - 0.5, h: Math.atan2(-1.5, 0.5) });
          P().setPose(m, 'sit', { x: f.x + 0.2, z: f.z + 1.6, h: Math.atan2(-0.2, -1.6) });
          P().setPose(g, 'folded', { x: f.x - 0.4, z: f.z - 2.2, h: Math.atan2(0.4, 2.2) });
          says(GARRON, 'Your lab. Your pots. Your little doses.', 3, true);
          says(GARRON, 'Tell me, Ren. When you\'ve woken everyone... the old, the sick, the liars, the ones who sat in towers and owned everything. What then?', 7);
          says(REN, 'Then everyone gets a second chance. We rebuild it all: medicine, homes, all of it.', 4.5);
          says(GARRON, 'The old world was weak, and it ate itself. This one doesn\'t have to be.', 4.5);
        },
        update: () => {},
        cam: (k) => {
          // from the far side of the fire, facing him
          const gp = new THREE.Vector3(g.x, g.y + 1.7, g.z);
          const away = new THREE.Vector3(f.x - g.x, 0, f.z - g.z).normalize();
          const pos = new THREE.Vector3(f.x, f.y + 1.5, f.z).addScaledVector(away, 2.6 + k * 0.4).add(new THREE.Vector3(away.z * 1.2, 0, -away.x * 1.2));
          return { pos, look: gp, fov: 44 };
        },
      },
      {
        dur: 15, caption: '',
        enter: () => {
          P().setPose(g, 'stance', { x: g.x, z: g.z, h: g.h });
          says(GARRON, 'From now on, we wake the strong. Only the strong.', 3.5, true);
          says(GARRON, 'And the rest of you work for me.', 3);
          says(MIRA, 'Work for you?', 2);
          says(REN, 'No. Every person out there deserves to wake up. That isn\'t yours to decide.', 4.5);
        },
        update: () => {},
        cam: () => ({ pos: g.group.position.clone().add(new THREE.Vector3(Math.sin(g.h) * 3.4 - 1, 1.9, Math.cos(g.h) * 3.4)), look: g.group.position.clone().add(new THREE.Vector3(0, 2, 0)), fov: 44 }),
      },
      {
        dur: 9, caption: '',
        enter: () => {
          // into the lab, to the FLUID pots
          P().setPose(g, 'brace', { x: rack.x + 0.2, z: rack.z + 1.0, y: L5.frame.y, h: Math.atan2(-0.2, -1.0) });
          h.cinematicPose = null;
          h.teleport(rack.x + 1.6, rack.z + 2.6, Math.atan2(-1.4, -1.6));
          says(REN, 'Put those down.', 2, true);
          says(GARRON, 'They\'re wasted on you.', 2.5);
        },
        update: (k) => {
          if (k > 0.55 && !flags().fluidStolen) {
            flags().fluidStolen = true;
            L5.store.fluid = 0;
            h.cinematicPose = 'lie';
            D.env.shake = 1;
            if (D.audio) D.audio.maul();
            h.stats.health = Math.max(25, h.stats.health - 35);
          }
        },
        cam: (k) => ({ pos: L5.at(1.8, 1.5, 1.7), look: g.group.position.clone().add(new THREE.Vector3(0, 1.2 - k * 0.5, 0)), fov: 52 }),
      },
      {
        dur: 9, caption: '',
        enter: () => {
          // he stands outside the door; you, on the floor just inside it
          const out = L5.at(-0.9, 5.8);
          const floorAt = L5.at(-0.9, 1.2);
          h.teleport(floorAt.x, floorAt.z, Math.atan2(out.x - floorAt.x, out.z - floorAt.z), L5.frame.y);
          P().setPose(g, 'stance', { x: out.x, z: out.z, h: Math.atan2(floorAt.x - out.x, floorAt.z - out.z) });
          says(GARRON, 'Wake one more of them, and I\'ll come back for every one of you.', 4.5, true);
        },
        update: () => {},
        cam: () => ({ pos: L5.at(-0.9, 1.6, 0.7), look: g.group.position.clone().add(new THREE.Vector3(0, 2.0, 0)), fov: 54 }),
      },
    ], () => {
      D.ui.quiet();
      h.cinematicPose = null;
      jungleScene();
    });
  }

  // 15. In the jungle (you see; the others don't).
  function jungleScene() {
    const g = garron();
    const y0 = T.height(JUNGLE.x, JUNGLE.z);
    if (!world.three.length) {
      const three = [
        { tpl: 4, pose: 'archer', dx: -2.2, dz: 0.5, scale: 1, bulk: 1 },
        { tpl: 3, pose: 'ninja', dx: 0, dz: -1.4, scale: 1, bulk: 1 },
        { tpl: 5, pose: 'stance', dx: 2.6, dz: 0.4, scale: 1.3, bulk: 1.3 },
      ];
      for (const [i, s] of three.entries()) {
        const p = P().make({ id: `three${i}`, tpl: s.tpl, x: JUNGLE.x + s.dx, z: JUNGLE.z + s.dz, h: Math.PI * 0.1, scale: s.scale, bulk: s.bulk, stone: true });
        p.pose = s.pose;
        p.poseW = 1;
        p.drop = s.pose === 'ninja' ? 0.35 : 0;
        world.three.push(p);
      }
    }
    for (const p of world.three) {
      p.group.visible = true;
      p.uniforms.petrify.value = 1;
      p.uniforms.crack.value = 0;
    }
    const centre = new THREE.Vector3(JUNGLE.x, y0 + 1.4, JUNGLE.z);
    D.story.playCine([
      {
        dur: 7, caption: 'Far off in the jungle, by moonlight.',
        enter: () => {
          go('c3jungle');
          D.env.hour = 22.5;
          D.forceSkyCapture();
          D.nightFill = 0.9;
          P().setPose(g, 'drink', { x: JUNGLE.x - 0.6, z: JUNGLE.z + 1.6, h: Math.PI });
          says(GARRON, 'Wake up. All three of you. We have a world to take.', 4, true);
        },
        update: (k) => {
          for (const [i, p] of world.three.entries()) p.uniforms.crack.value = smoothstep(0.2 + i * 0.2, 0.9, k) * 0.7;
        },
        cam: (k) => ({ pos: centre.clone().add(new THREE.Vector3(-1 + k * 2, 0.3, 6 - k * 1.5)), look: centre, fov: 50 }),
      },
      {
        dur: 4, caption: '',
        enter: () => {
          if (D.audio) D.audio.crack(1);
        },
        update: (k) => {
          for (const p of world.three) p.uniforms.crack.value = 0.7 + k * 0.3;
        },
        cam: (k) => ({ pos: world.three[1].group.position.clone().add(new THREE.Vector3(0, 1.0, 1.4 - k * 0.4)), look: world.three[1].group.position.clone().add(new THREE.Vector3(0, 1.0, 0)), fov: 40 }),
      },
    ], () => {
      D.ui.quiet();
      for (const p of world.three) p.group.visible = false;
      P().hide(g);
      D.nightFill = 0;
      packScene();
    });
  }

  // 16. We can't stay.
  function packScene() {
    const t = teo();
    const m = mira();
    const h = D.hero;
    const f = D.camp.fire('night');
    D.story.fadeTo(1, 0.1, () => D.story.fadeTo(0, 1.2));
    go('c3pack');
    D.env.hour = 21.2;
    D.forceSkyCapture();
    h.teleport(f.x - 1.6, f.z + 0.4, Math.atan2(1.6, -0.4));
    h.cinematicPose = 'sit';
    P().setPose(t, 'sit', { x: f.x + 1.5, z: f.z - 0.5, h: Math.atan2(-1.5, 0.5) });
    P().setPose(m, 'sit', { x: f.x + 0.2, z: f.z + 1.6, h: Math.atan2(-0.2, -1.6) });
    // what Teo and Mira had put by while you worked
    const st = lab().store;
    st.resin = (st.resin || 0) + 3;
    st.fiber = (st.fiber || 0) + 8;
    st.pot_water = (st.pot_water || 0) + 2;
    talk([
      [TEO, 'He knows where we live. And he has every dose we made.', 3.5],
      [REN, 'Then we can\'t stay. Not here. Not now.', 3],
      [MIRA, 'Not every dose.', 2],
      [MIRA, 'When I saw how he looked at the shelves, I put the last of the Revonite in the CLAY pot. Under the clay. He never even glanced at it.', 7],
      [TEO, 'Mira...', 1.5],
      [REN, 'East, then. Toward the ring. Take what we can carry; we go at first light.', 4.5],
      [MIRA, 'I\'ll paint us a map of what Teo saw from the Lookout. Better than nothing.', 4],
    ], new THREE.Vector3(f.x, f.y + 0.9, f.z), { after: () => {
      h.cinematicPose = null;
      P().stand(m, null);
      P().stand(t, null);
      // Mira's map: the way east, painted in
      for (const [x, z] of [[262, 72], [300, 58], [340, 42], [380, 28], [430, 10], [480, -14], [530, -44]]) D.ui.reveal(x, z, 40);
      D.story.startPlay(true);
      D.story.refresh(true);
      D.ui.tutorial('The packing list: <kbd>E</kbd> at each pot in the lab', 6);
    } });
  }
  // packed: E at the ladder ends the night
  D.items.extraTargets.push((x, z) => {
    if (stage() !== 'c3pack' || !D.shelter.ladder) return null;
    const packed = flags().hiddenTaken && !(lab().store.resin > 0) && !(lab().store.fiber > 0) && !(lab().store.pot_water > 0);
    const b = D.shelter.ladder.bottom;
    if (!packed || flags().leaving || Math.hypot(b.x - x, b.z - z) > 2) return null;
    return [{ x: b.x, z: b.z, reach: 2, bias: -1, label: 'Climb up and sleep: we leave at first light', act: () => leaveAtDawn() }];
  });
  function leaveAtDawn() {
    if (flags().leaving) return;
    flags().leaving = true;
    const h = D.hero;
    h.cancelAction();
    h.control = false;
    D.story.fadeTo(1, 1.2, () => {
      h.cancelAction();
      h.platform = null;
      h.control = true;
      D.env.hour = HOURS.c3pass[0];
      D.forceSkyCapture();
      // by mid-morning, the goat trail up from Flint Rise; the Lookout ahead
      h.teleport(196, 80, Math.PI / 2);
      followAll();
      for (const p of [teo(), mira()]) if (p) P().teleport(p, h.pos.x - 2, h.pos.z - 2);
      east().reachBoulder();
      go('c3pass');
      D.story.fadeTo(0, 1.5);
      think('Up the goat trail, past the Lookout, and into the mountains.', 4);
    });
  }

  // 20. Wolves at dusk.
  function startWolves() {
    if (stage() !== 'c3meadow') return;
    go('c3wolves');
    raise('c3wolves');
    D.camp.build('overhang');
    if (D.audio) D.audio.howl(70);
    says(TEO, 'Listen.', 1.5, true);
    says(REN, 'Wolves. A pack of them.', 2.5);
    says(MIRA, 'They\'ve been following us since the road. I\'ve built a ring of stones here, quick: wood!', 4.5);
    says(REN, 'Under the rock, all of us. A fire. Now.', 3);
    flags().wolfTimer = 0;
  }
  function updateWolfStart(dt) {
    if (stage() !== 'c3wolves' || east().pack) return;
    const f = D.camp.fire('overhang');
    flags().wolfTimer = (flags().wolfTimer || 0) + dt;
    if ((f && f.lit) || flags().wolfTimer > 50) {
      east().spawnWolves(east().camp.x, east().camp.z, 5);
      for (const p of [teo(), mira()]) if (p) P().setPose(p, 'crouch', { x: east().camp.x + (p === teo() ? 1.6 : -1.4), z: east().camp.z - 1.2, h: Math.PI });
      says(TEO, 'There! Eyes, in the grass!', 2, true);
    }
  }
  function wolvesNight() {
    if (stage() !== 'c3wolves') return;
    const h = D.hero;
    const c = east().camp;
    D.story.playCine([{
      dur: 7, caption: 'They kept the fire high all night. The wolves did not come back.',
      enter: () => {
        D.env.hour = 21;
        D.forceSkyCapture();
        D.nightFill = 0.7;
        h.teleport(c.x - 1.4, c.z + 1, Math.atan2(1.4, -1));
        h.cinematicPose = 'sit';
        for (const p of [teo(), mira()]) if (p) P().setPose(p, 'sit', { x: c.x + (p === teo() ? 1.5 : 0.2), z: c.z + (p === teo() ? -0.4 : 1.6), h: p === teo() ? Math.atan2(-1.5, 0.4) : Math.atan2(-0.2, -1.6) });
      },
      update: (k) => {
        D.env.hour = 21 + k * 2;
      },
      cam: (k) => {
        const f = new THREE.Vector3(c.x, T.height(c.x, c.z) + 0.9, c.z);
        const a = 0.8 + k * 0.6;
        return { pos: f.clone().add(new THREE.Vector3(Math.cos(a) * 6, 2.4, Math.sin(a) * 6)), look: f, fov: 50 };
      },
    }], () => {
      D.ui.quiet();
      D.story.fadeTo(1, 1.2, () => {
        east().clearWolves();
        D.nightFill = 0;
        D.env.hour = HOURS.c3river[0];
        D.forceSkyCapture();
        h.cinematicPose = null;
        followAll();
        go('c3river');
        D.story.startPlay(true);
        D.story.fadeTo(0, 1.5);
        think('Morning. The road goes on down, east. I can hear water.', 4);
      });
    });
  }

  // 21. The river, and the village.
  function riverScene() {
    flags().sawVillage = true;
    const E3 = east();
    E3.showVillage(true);
    const h = D.hero;
    const head = new THREE.Vector3(E3.bridgehead.x, T.height(E3.bridgehead.x, E3.bridgehead.z), E3.bridgehead.z);
    const village = new THREE.Vector3(622, T.height(622, -48) + 2, -48);
    const t = teo();
    const m = mira();
    D.story.playCine([
      {
        dur: 8, caption: '',
        enter: () => {
          h.teleport(head.x - 1, head.z + 0.6, Math.PI / 2);
          if (t) P().setPose(t, null, { x: head.x - 1.5, z: head.z + 2, h: Math.PI / 2 });
          if (m) P().setPose(m, null, { x: head.x - 1.8, z: head.z - 1.4, h: Math.PI / 2 });
          says(MIRA, 'Smoke. That\'s cooking smoke.', 2.5, true);
          says(TEO, 'People. Ren... those are people. Moving.', 3.5);
        },
        update: () => {},
        cam: (k) => ({ pos: head.clone().add(new THREE.Vector3(-4 + k * 2, 2.2, 1.5)), look: village.clone().add(new THREE.Vector3(0, -2 + k * 2, 0)), fov: 50 - k * 12 }),
      },
      {
        dur: 9, caption: '',
        enter: () => {
          says(REN, 'Alive.', 2, true);
          says(REN, 'Someone else found the way back.', 3);
          says(MIRA, 'Do we... just walk over there?', 2.5);
          says(REN, 'We say hello. Carefully.', 2.5);
        },
        update: () => {},
        cam: (k) => ({ pos: village.clone().add(new THREE.Vector3(-30 + k * 6, 3, 10 - k * 6)), look: village.clone().add(new THREE.Vector3(0, -1.5, 0)), fov: 40 }),
      },
      {
        dur: 7, caption: 'Chapter 4: The Village',
        enter: () => {},
        update: () => {},
        cam: (k) => ({ pos: head.clone().add(new THREE.Vector3(-9 - k * 3, 5 + k * 2, 5)), look: head.clone().add(new THREE.Vector3(18, 0, 0)), fov: 54 }),
      },
    ], () => {
      D.ui.quiet();
      go('c3end');
      D.story.endChapter3();
    });
  }

  // ---------- Each frame ----------

  let nudgeT = 0;
  let nudgeKey = '';
  let nudgeEvery = 1;
  ch3.frame = (dt) => {
    if (!ch3.started()) return;
    if (D.state.mode !== 'play' || dt <= 0) return;
    updateSmoke(dt);
    updateErrand(dt);
    updateWolfStart(dt);
    // Mira at work: the rope, the bandages
    for (const what of ['braiding', 'sewing']) {
      if (!flags()[what]) continue;
      flags()[`${what}T`] = (flags()[`${what}T`] || 0) + dt;
      if (flags()[`${what}T`] > 20) {
        flags()[what] = false;
        const m = mira();
        if (what === 'braiding') {
          D.items.add('rope', 1);
          says(MIRA, 'One rope. Tie it to an arrow, and aim for the trunk.', 3.5, true);
        } else {
          D.items.add('bandage', 3);
          flags().bandages = true;
          says(MIRA, 'Three bandages. Q binds one, if you get hurt. Which, knowing you...', 4, true);
        }
        if (m) P().follow(m, 1);
        D.story.refresh(true);
      }
    }
    // the compass, once you have it
    D.ui.compass(D.items.has('compass'), D.hero.yaw);
    // a minute with nothing changing on the card: someone says what next (looked at each second)
    nudgeT += dt;
    nudgeEvery -= dt;
    if (nudgeEvery > 0) return;
    nudgeEvery = 1;
    const o = OBJECTIVES[stage()] && OBJECTIVES[stage()]();
    const key = o ? JSON.stringify(o.list) : '';
    if (key !== nudgeKey) {
      nudgeKey = key;
      nudgeT = 0;
    } else if (o && o.hint) {
      if (nudgeT > 60) {
        nudgeT = 0;
        const who = mira() && mira().group.visible && !at('c3pack') ? MIRA : teo() && teo().group.visible ? TEO : null;
        const first = o.hint.split(/(?<=[.!?])\s/)[0];
        if (who) says(who, first, 4.5);
        else think(first, 4.5);
      }
    }
  };

  // ---------- Starting, saving, loading ----------

  const restorePeople = (list) => {
    const saved = (id) => P().find(list, id);
    const tSave = saved('teo');
    let t = D.ch2.teo || P().get('teo');
    if (!t && tSave) t = P().make({ id: 'teo', name: TEO, statue: D.statues.list[0] });
    D.ch2.teo = t || D.ch2.teo;
    if (t) {
      P().alive(t);
      if (tSave) {
        P().teleport(t, tSave.x, tSave.z, tSave.h, tSave.y);
        t.group.visible = tSave.visible;
      }
      if (tSave && tSave.mode === 'hidden') t.group.visible = false;
      else if (!tSave || !['pose'].includes(tSave.mode)) P().follow(t, 0);
      else P().setPose(t, tSave.pose, null);
    }
    const mSave = saved('mira');
    if (mSave) {
      const m = P().make({ id: 'mira', name: MIRA, statue: miraStatue() });
      P().alive(m);
      P().teleport(m, mSave.x, mSave.z, mSave.h, mSave.y);
      if (!mSave.visible || mSave.mode === 'hidden') P().hide(m);
      else if (mSave.mode === 'pose') P().setPose(m, mSave.pose, null);
      else P().follow(m, 1);
    }
    const gSave = saved('garron');
    if (gSave) {
      const g = makeGarron();
      P().teleport(g, gSave.x, gSave.z, gSave.h, gSave.y);
      if (gSave.mode === 'stone') {
        g.mode = 'stone';
        g.uniforms.petrify.value = 1;
        g.pose = 'stance';
        g.poseW = 1;
        g.lie = 0;
        g.group.visible = gSave.visible;
      } else if (!gSave.visible || gSave.mode === 'hidden') P().hide(g);
      else {
        P().alive(g);
        P().follow(g, 2);
      }
    }
  };

  // From the end of Chapter 2: the same morning, by the fire under the Elder Tree.
  ch3.start = () => {
    setupWorld();
    refreshWorld();
    const h = D.hero;
    D.shelter.setStage(3);
    D.combat.resetTiger(false);
    flags().tigerDead = true;
    h.revive();
    h.petrify = 0;
    h.frozen = false;
    h.cinematicPose = null;
    h.group.visible = true;
    h.platform = null;
    Object.assign(h.stats, { health: 100, stamina: 100, hunger: Math.max(h.stats.hunger, 70), thirst: Math.max(h.stats.thirst, 70) });
    // Teo, and a fire
    const t = D.ch2.teo || P().make({ id: 'teo', name: TEO, statue: D.statues.list[0] });
    D.ch2.teo = t;
    P().alive(t);
    P().show(t);
    D.camp.light('night', 300);
    D.ringReveal = 1;
    D.env.hour = HOURS.c3talk[0];
    D.forceSkyCapture();
    D.ui.tracker(null);
    go('c3talk');
    talkScene();
  };

  ch3.save = () => ({
    camp: D.camp.save(),
    lab: lab().save(),
    east: east().save(),
    people: P().save(),
    scattered: !!(galleries() && galleries().scattered),
    post: world ? world.post.hits : 0,
  });
  ch3.load = (s) => {
    if (!ch3.started()) {
      ch3.reset();
      return;
    }
    setupWorld();
    D.camp.load(s && s.camp);
    const mouth = D.camp.fire('mouth');
    if (mouth) mouth.smoky = true;
    lab().load(s && s.lab);
    east().load(s && s.east);
    D.cave.restoreGalleries(D.items.taken, s && s.scattered);
    if (flags().ladder) showLadder();
    restorePeople(s && s.people);
    // out on their errand: back at their work (a delivery cut short starts again)
    const e = flags().errand;
    if (e && !at('c3labelled')) {
      e.bringing = false;
      for (const p of [teo(), mira()]) if (p) P().hide(p);
    }
    if (world) world.post.hits = (s && s.post) || 0;
    if (flags().bearDead && D.combat.bear) D.combat.bear.group.visible = false;
    refreshWorld();
    D.ringReveal = 1;
    if (at('c3pass')) east().reachBoulder();
    // a scene that was playing when the game was saved: on from its start, or past it
    const st = stage();
    if (st === 'c3talk') setTimeout(() => talkScene(), 50);
    if (st === 'c3labelled') setTimeout(() => labelledScene(), 50);
    if (st === 'c3night') {
      flags().nightDone = false;
      go('c3brew');
      setTimeout(() => nightScene(), 50);
    }
    if (st === 'c3garron' && garron() && garron().mode === 'stone') go('c3giant');
    if (st === 'c3argue' || st === 'c3jungle') {
      go('c3strong');
      setTimeout(() => argueScene(), 50);
    }
    if (st === 'c3wolves') {
      east().clearWolves();
      flags().wolfTimer = 0;
    }
  };
  ch3.reset = () => {
    for (const id of ['mira', 'garron', 'three0', 'three1', 'three2']) {
      const p = P().get(id);
      if (p) p.group.visible = false;
    }
    const ms = miraStatue();
    if (ms) D.statues.unwake(ms);
    if (world) {
      world.basket.mesh.visible = false;
      world.post.mesh.visible = false;
      world.sledge.visible = false;
      world.log.visible = true;
    }
    if (ladder) ladder.visible = false;
    if (lab()) lab().load(null);
    if (east()) east().load(null);
    if (D.ui && D.ui.tracker) D.ui.tracker(null);
    if (D.ui && D.ui.compass) D.ui.compass(false);
    if (D.hero) D.hero.stats.strength = undefined;
  };

  // ---------- For testing: ?stage=c3lab starts there with what that part needs ----------

  ch3.devStart = (s) => {
    setupWorld();
    const h = D.hero;
    const give = (o) => Object.entries(o).forEach(([k, n]) => D.items.add(k, n, true));
    D.shelter.setStage(3);
    D.combat.resetTiger(false);
    flags().tigerDead = true;
    flags().mauled = true;
    give({ blade: 1, bow: 1, arrow: 8, torch: 2, stone: 2, pot: 2 });
    const i = STAGES.indexOf(s);
    const past = (q) => i > STAGES.indexOf(q);
    const t = D.ch2.teo || P().make({ id: 'teo', name: TEO, statue: D.statues.list[0] });
    D.ch2.teo = t;
    P().alive(t);
    D.camp.light('night', 400);
    D.ringReveal = 1;
    if (past('c3bear')) {
      D.camp.light('mouth', 160);
      D.camp.fire('mouth').smoky = true;
      if (D.combat.bear) D.combat.bear.group.visible = false;
    }
    if (s === 'c3mira') give({ fluid: 1 });
    if (past('c3mira')) {
      const m = P().make({ id: 'mira', name: MIRA, statue: miraStatue() });
      P().alive(m);
    }
    if (past('c3home')) flags().labPlanned = true;
    if (past('c3axe')) give({ axe: 1 });
    if (s === 'c3lab') {
      flags().errand = { t: 100 };
      give({ pole: 4, vine: 4, stick: 6 });
    }
    if (past('c3lab')) lab().setStage(5);
    if (s === 'c3minerals') {
      flags().errand = { t: 500 };
      give({ nitre: 6, revonite: 3 });
    }
    if (past('c3minerals')) {
      lab().showPots(12, true);
      D.camp.light('lab', 300);
    }
    if (s === 'c3brew') give({ nitre: 9, revonite: 9, ash: 2 });
    if (past('c3night')) {
      lab().mural.visible = true;
      lab().store.fluid = 3;
    }
    if (past('c3giant')) {
      const g = makeGarron();
      P().alive(g);
      lab().store.fluid = 2;
    }
    if (past('c3garron')) {
      flags().strongStep = 'log';
    }
    if (past('c3argue')) {
      flags().logCarried = true;
      flags().spearShown = true;
      flags().trained = true;
      flags().bearDead = true;
      flags().fluidStolen = true;
      lab().store.fluid = 0;
      give({ spear: 1 });
      h.stats.strength = 1.35;
      if (garron()) P().hide(garron());
    }
    if (s === 'c3pack') {
      const st = lab().store;
      st.resin = 3;
      st.fiber = 8;
      st.pot_water = 2;
    }
    if (past('c3pack')) {
      flags().hiddenTaken = true;
      give({ revonite: 3, resin: 3, fiber: 8, pot_water: 2, pole: 1 });
    }
    if (past('c3pass')) east().clearPass(false);
    if (s === 'c3ravine') give({ fiber: 8 });
    if (past('c3ravine')) {
      east().ropeHit();
      east().crossed = true;
      east().side = 'east';
    }
    if (past('c3meadow')) {
      give({ compass: 1, bandage: 3 });
      flags().sawCar = true;
      flags().sawSign = true;
      flags().bandages = true;
      D.items.taken.add('compass');
    }
    const spot = {
      c3talk: null, c3bear: [-44, -158], c3dose: [18, 236], c3mira: [28, 228], c3home: [24, 224], c3axe: [-40, -160], c3lab: [-40, -160],
      c3minerals: [18, 248], c3labelled: [-40, -160], c3brew: [-40, -160], c3night: [-40, -160], c3giant: null, c3garron: [-40, -160], c3strong: [-40, -160],
      c3argue: [-40, -160], c3pack: [-40, -160], c3pass: [224, 80], c3ravine: [318, 50], c3meadow: [360, 34], c3wolves: [462, -16], c3river: [500, -26],
    }[s];
    Object.assign(h.stats, { hunger: 85, thirst: 85, health: 100, stamina: 100 });
    if (past('c3pass') || s === 'c3pass') {
      L.edge.maxX = past('c3pass') ? 700 : L.edge.maxX;
      east().reachBoulder();
    }
    if (spot) h.teleport(spot[0], spot[1], Math.PI);
    for (const [p, slot] of [[t, 0], [mira(), 1]]) {
      if (!p) continue;
      P().show(p);
      P().teleport(p, h.pos.x + 1.5 + slot, h.pos.z + 2);
      P().follow(p, slot);
    }
    if (s === 'c3talk') {
      ch3.start();
      return;
    }
    D.env.hour = (HOURS[s] || [12])[0];
    D.forceSkyCapture();
    D.story.startPlay(false);
    if (s === 'c3labelled') {
      go('c3minerals');
      give({ nitre: 9, revonite: 9 });
      flags().errand = { t: ERRAND.paint };
      labelledScene();
      return;
    }
    if (s === 'c3night') {
      go('c3brew');
      lab().store.fluid = 3;
      nightScene();
      return;
    }
    if (s === 'c3giant') {
      go('c3brew');
      giantScene();
      return;
    }
    if (s === 'c3argue') {
      go('c3strong');
      if (garron()) {
        P().show(garron());
        P().alive(garron());
      }
      argueScene();
      return;
    }
    if (s === 'c3garron') {
      go('c3giant');
      const g = makeGarron();
      g.group.visible = true;
      const sp = lab().at(-5, 5);
      P().teleport(g, sp.x, sp.z, 0);
      give({ fluid: 1 });
      return;
    }
    go(s);
    if (s === 'c3wolves') {
      D.camp.build('overhang');
      flags().wolfTimer = 0;
    }
    refreshWorld();
    if (D.items.has('bow')) D.items.setWeapon(s === 'c3dose' || s === 'c3minerals' ? 'torch' : 'bow');
  };

  // (for testing: the scenes on their own)
  ch3.scenes = { talkScene, wakeMira, planScene, labelledScene, nightScene, giantScene, wakeGarron, logScene, bearScene, argueScene, jungleScene, packScene, riverScene };

  D.ch3 = ch3;
})();
