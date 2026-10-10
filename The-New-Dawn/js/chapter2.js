// The New Dawn: Chapter 2, The Second Waking.
//
// The morning after the long night. What woke him (bat guano, dripping water and the green
// Revonite) can wake someone else: fire, clay pots, torches, the Nitre Galleries under the
// mountain, saltpetre, and a revival fluid. One dose wakes the runner by the cave mouth, Teo.
// Then a second night, the two of them under the Elder Tree with a bear in the dark, and at
// dawn, from a ledge on the eastern mountains, the first sight of where the light came from.
//
// Every step says what to do (the objective card), where (the waypoint, pointing to the nearest
// place to get whatever is still short), and how (the Field Notes' pages for the step).
(() => {
  'use strict';
  const D = window.Dawn;
  const { $, clamp, lerp, smoothstep, seeded, rand, wrapAngle } = D;
  const T = D.terrain;
  const L = D.LAYOUT;
  const C = D.CAVE;
  const NAME = 'Teo';

  const STAGES = ['c2wake', 'c2fire', 'c2clay', 'c2torch', 'c2cave', 'c2salt', 'c2fluid', 'c2revive', 'c2escort', 'c2night', 'c2dawn', 'c2end'];
  // the hours each part of the day runs between: [at least, at most] (the night runs itself)
  const HOURS = {
    c2wake: [6.3, 7.4], c2fire: [7.2, 8.8], c2clay: [8.6, 10.2], c2torch: [10, 11.4], c2cave: [11.2, 12.9], c2salt: [12.7, 14.2],
    c2fluid: [14, 15.4], c2revive: [15.2, 16.4], c2escort: [16.3, 18.25], c2dawn: [5.7, 6.6], c2end: [6.5, 7.4],
  };
  const LOOKOUT = { x: 232, z: 79 };
  const NIGHT_LENGTH = 240; // seconds from dusk to dawn
  const FIREWOOD = 6;

  const ch2 = { STAGES, NAME, LOOKOUT, teo: null };
  const stage = () => D.story.stage;
  const flags = () => D.story.flags;
  const have = (k) => D.items.count(k);
  ch2.started = () => STAGES.includes(stage());
  const at = (s) => STAGES.indexOf(stage()) >= STAGES.indexOf(s);
  ch2.at = at;
  ch2.hours = (s) => HOURS[s] || null;
  const say = (text, s = 4) => D.ui.think(text, s);
  const teoSays = (text, s = 4.5) => D.ui.say(NAME, text, s);
  const youSay = (text, s = 4.5) => D.ui.say('You', text, s);
  const go = (s) => D.story.setStage(s);
  const raise = (s) => HOURS[s] && D.story.raiseHour(HOURS[s][0]);

  // ---------- The world, as Chapter 2 finds it ----------

  // Fresh sticks and stones round the camp (the night brought down dead wood), dead wood under
  // the Elder Tree, clay pits on the river bank, resin on the Elder Tree's bark.
  let world = null;
  const pitMat = () => world.pitMat;
  function setupWorld() {
    if (world) return world;
    const random = seeded(2402);
    world = { clay: [], resin: [] };
    const scatter = (cx, cz, r, n, type, prefix) => {
      for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
        const a = random() * Math.PI * 2;
        const d = 3 + random() * r;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const y = T.height(x, z);
        if (T.waterAt(x, z) || T.normal(x, z).y < 0.85 || D.flora.trunkHit(x, y + 0.5, z, 0.5)) continue;
        if (Math.hypot(x - L.tree.x, z - L.tree.z) < 4.5) continue;
        D.items.spawn(type, x, z, random() * 6.3, `${prefix}${i}`);
        i++;
      }
    };
    const day = D.camp.spot('day');
    scatter(day.x, day.z, 24, 12, 'stone', 'c2stone');
    scatter(day.x, day.z, 28, 12, 'stick', 'c2stick');
    scatter(L.tree.x, L.tree.z, 20, 16, 'stick', 'c2wood');
    scatter(L.tree.x, L.tree.z, 22, 6, 'branch', 'c2branch');
    scatter(L.tree.x, L.tree.z, 18, 10, 'stone', 'c2tstone');
    scatter(-2, 186, 26, 6, 'stick', 'c2fstick');
    // the yellow grass on Flint Rise grows back over the winter... over the night, at least
    D.items.regrow('fibre');

    // the Clay Banks: grey mounds in the bank where the stream from the pond meets the river
    const clayTex = D.canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#8b877c';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 900; n++) {
        const v = Math.random();
        g.fillStyle = `rgba(${90 + v * 70},${88 + v * 66},${80 + v * 60},0.35)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
    });
    world.pitMat = new THREE.MeshStandardMaterial({ map: clayTex, color: D.col(0xb9b4a6), roughness: 0.42, metalness: 0 });
    world.dugMat = new THREE.MeshStandardMaterial({ color: D.col(0x4a4438), roughness: 0.75 });
    const mound = new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    mound.scale(1.25, 0.42, 1);
    for (const z of [92, 98, 104, 111, 117, 123]) {
      let x = T.riverX(z) + T.riverHalf(z) + 2.2;
      for (let k = 0; k < 20 && (T.waterAt(x, z) || T.height(x, z) < 0.25); k++) x += 0.7;
      const m = new THREE.Mesh(mound, world.pitMat);
      m.position.set(x, T.height(x, z) - 0.05, z);
      m.rotation.y = random() * 6.3;
      m.receiveShadow = true;
      D.scene.add(m);
      world.clay.push({ id: `clay${world.clay.length}`, kind: 'clay', x, z, y: T.height(x, z), mesh: m });
    }
    world.clayCentre = world.clay.reduce((s, p) => ({ x: s.x + p.x / world.clay.length, z: s.z + p.z / world.clay.length }), { x: 0, z: 0 });

    // resin: amber beads on the Elder Tree's bark, on the sides away from the platform
    const resinMat = D.addCaveShade(new THREE.MeshStandardMaterial({ color: D.col(0xd8931f), roughness: 0.18, metalness: 0, emissive: new THREE.Color(0x6a3a00), emissiveIntensity: 0.25 }));
    const bead = new THREE.SphereGeometry(0.07, 8, 6);
    const P = D.shelter.P;
    const a0 = P ? Math.atan2(P.ox, P.oz) : 0;
    for (const off of [1.55, 2.6, -1.9]) {
      const a = a0 + off;
      const r = (D.shelter.trunkR || 2.05) + 0.06;
      const x = L.tree.x + Math.sin(a) * r;
      const z = L.tree.z + Math.cos(a) * r;
      const y = T.height(x, z) + 1.35;
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
      world.resin.push({ id: `resin${world.resin.length}`, kind: 'resin', x: L.tree.x + Math.sin(a) * (r + 0.5), z: L.tree.z + Math.cos(a) * (r + 0.5), y: y - 1.35, mesh: g });
    }

    // the Lookout: a cairn on a ledge up the eastern slope
    const stone = D.items.modelOf('stone');
    const cairn = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(stone.geometry, stone.material);
      const k = 1 - i / 8;
      s.scale.setScalar(stone.scale.x * (3.2 * k + 1));
      s.position.set((random() - 0.5) * 0.15, 0.12 + i * 0.22, (random() - 0.5) * 0.15);
      s.rotation.set(random() * 3, random() * 6, random() * 3);
      s.castShadow = true;
      cairn.add(s);
    }
    cairn.position.set(LOOKOUT.x + 1.2, T.height(LOOKOUT.x + 1.2, LOOKOUT.z), LOOKOUT.z);
    D.scene.add(cairn);
    refreshWorld();
    return world;
  }
  // what has been dug or cut shows it
  function refreshWorld() {
    if (!world) return;
    for (const p of world.clay) {
      const dug = D.items.taken.has(p.id);
      p.mesh.material = dug ? world.dugMat : world.pitMat;
      p.mesh.scale.y = dug ? 0.12 : 1;
    }
    for (const r of world.resin) r.mesh.visible = !D.items.taken.has(r.id);
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
  D.guide.sources.clay = (from) => {
    if (!world) return null;
    const p = nearestOf(world.clay, from);
    return p ? { x: p.x, z: p.z, label: 'Clay (the Clay Banks)', r: 1.6 } : null;
  };
  D.guide.sources.resin = (from) => {
    if (!world) return null;
    const p = nearestOf(world.resin, from);
    return p ? { x: p.x, z: p.z, label: 'Resin (Elder Tree bark)', r: 1.4, y: p.y + 1.4 } : null;
  };
  D.guide.sources.nitre = (from) => {
    const g = D.cave.galleries;
    if (!g) return null;
    if (!D.cave.inGalleries(D.hero.pos)) return { x: g.crack.x, z: g.crack.z, y: C.floor + 1.6, label: 'The crack (to the galleries)', r: 1.5 };
    const p = nearestOf(g.nitre, from, (q) => !q.taken);
    return p ? { x: p.x, z: p.z, y: p.y + 0.3, label: 'Nitre crust', r: 1.4 } : null;
  };
  D.guide.sources.revonite = (from) => {
    const g = D.cave.galleries;
    if (!g) return null;
    if (!D.cave.inGalleries(D.hero.pos)) return { x: g.crack.x, z: g.crack.z, y: C.floor + 1.6, label: 'The crack (to the galleries)', r: 1.5 };
    const p = nearestOf(g.revonite, from, (q) => !q.taken);
    return p ? { x: p.x, z: p.z, y: p.y + 0.3, label: 'Revonite (the green vein)', r: 1.4 } : null;
  };
  const campMark = (id = 'day', label = null) => {
    const s = D.camp.spot(id);
    return s ? { x: s.x, z: s.z, y: T.height(s.x, s.z) + 1.4, label: label || s.label, r: 2.6 } : null;
  };
  const veinMark = () => ({ x: C.galleries.ways[0].a[0] - 1.2, z: C.galleries.ways[0].a[2] - 0.4, y: C.floor + 2.2, label: 'The green vein (the cave)', r: 2.5 });
  const runner = () => D.statues.list[0];

  // ---------- What E does (Chapter 2's things) ----------

  function target(x, z) {
    if (!ch2.started() || !world) return null;
    const out = [];
    const h = D.hero;
    // clay
    for (const p of world.clay) {
      if (D.items.taken.has(p.id) || Math.hypot(p.x - x, p.z - z) > 2.4) continue;
      out.push({ x: p.x, z: p.z, reach: 2.2, bias: -0.2, label: 'Dig clay', cannot: D.items.has('digstick') ? null : 'Needs a digging stick (Tab, Make: 1 stick, shaped with the blade)',
        act: () => D.items.harvest({ ...p, label: 'Digging clay' }, 'gather', 2.2, () => {
          D.items.add('clay', 2);
          refreshWorld();
        }, () => D.audio && D.audio.dig()) });
    }
    // resin
    for (const r of world.resin) {
      if (D.items.taken.has(r.id) || Math.hypot(r.x - x, r.z - z) > 2.2) continue;
      out.push({ x: r.x, z: r.z, reach: 2, bias: -0.2, label: 'Cut resin from the bark', cannot: D.items.has('blade') ? null : 'Needs the flint blade',
        act: () => D.items.harvest({ ...r, label: 'Cutting resin' }, 'cut', 1.8, () => {
          D.items.add('resin', 2);
          refreshWorld();
        }, () => D.audio && D.audio.scrape()) });
    }
    // the galleries
    const g = D.cave.galleries;
    if (g && D.cave.inGalleries(h.pos)) {
      const lit = D.camp.holdingLight();
      for (const s of g.nitre) {
        if (s.taken || Math.hypot(s.x - x, s.z - z) > 2.4) continue;
        const why = !lit ? 'Too dark to see: hold a lit torch (4)' : !D.items.has('blade') ? 'Needs the flint blade' : null;
        out.push({ x: s.x, z: s.z, reach: 2.2, bias: -0.2, label: 'Scrape nitre crust', cannot: why,
          act: () => D.items.harvest({ id: s.id, x: s.x, z: s.z, label: 'Scraping nitre' }, 'cut', 2, () => {
            D.items.add('nitre', 2);
            D.cave.takeSpot('nitre', s.id);
          }, () => D.audio && D.audio.scrape()) });
      }
      for (const s of g.revonite) {
        if (s.taken || Math.hypot(s.x - x, s.z - z) > 2.4) continue;
        const why = !lit ? 'Too dark to work: hold a lit torch (4)' : !D.items.has('stone') ? 'Needs a stone to chip with' : null;
        out.push({ x: s.x, z: s.z, reach: 2.2, bias: -0.2, label: 'Chip Revonite shards', cannot: why,
          act: () => D.items.harvest({ id: s.id, x: s.x, z: s.z, label: 'Chipping Revonite' }, 'cut', 2.4, () => {
            D.items.add('revonite', 1);
            D.cave.takeSpot('revonite', s.id);
          }, () => D.audio && D.audio.knap()) });
      }
    }
    // water: fill an empty pot
    if (D.items.has('pot')) {
      const fx = Math.sin(h.facing);
      const fz = Math.cos(h.facing);
      for (const ahead of [0, 0.9, 1.6, 2.3]) {
        const w = T.waterAt(x + fx * ahead, z + fz * ahead);
        if (w && w.depth > 0.04) {
          out.push({ x: x + fx * Math.max(0.9, Math.min(ahead, 1)), z: z + fz * Math.max(0.9, Math.min(ahead, 1)), reach: 2.4, bias: 0.2, label: 'Fill a pot with water',
            act: () => {
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
    // the runner: pour the fluid
    const s = runner();
    if (s && !s.awake && at('c2revive') && Math.hypot(s.x - x, s.z - z) < 2.8) {
      out.push({ x: s.x, z: s.z, reach: 2.8, bias: -0.8, label: 'Pour the revival fluid over him', cannot: D.items.has('fluid') ? null : 'Needs the revival fluid',
        act: () => pour(s) });
    }
    // dawn: the chapter can end here, by the fire
    if (stage() === 'c2dawn' && flags().c2talked) {
      const f = D.camp.fire('night');
      if (f && Math.hypot(f.x - x, f.z - z) < 3.5) out.push({ x: f.x, z: f.z, reach: 3.2, bias: -0.6, label: 'Rest by the fire: end Chapter 2 here', act: () => endChapter(false) });
    }
    return out.length ? out : null;
  }
  D.items.extraTargets.push(target);

  // ---------- The objectives ----------

  // a line of the checklist for a count of something
  const need = (key, n, text = null) => {
    const def = D.items.ITEMS[key];
    return { text: text || (n > 1 ? def.plural : def.name), count: `${Math.min(have(key), n)}/${n}`, done: have(key) >= n };
  };
  const tick = (text, done) => ({ text, done: !!done });
  const fireOut = (id) => {
    const f = D.camp.fire(id);
    return f && f.built && !f.lit;
  };

  const OBJECTIVES = {
    c2wake: () => ({
      title: 'Go back to the green vein',
      list: [tick('The green vein in the cave tunnel', flags().c2vein)],
      hint: D.hero.platform ? 'Climb down the ladder (E), then go south through the gorge and the forest to the cave where you woke. The vein glows green in the tunnel wall.' : 'South, through the gorge and the petrified forest, to the cave where you woke. The vein glows green in the tunnel wall.',
      marker: D.hero.platform && D.shelter.ladder ? { x: D.shelter.ladder.top.x, z: D.shelter.ladder.top.z, y: D.shelter.P.y + 1, label: 'The ladder (E)', r: 1.2 } : veinMark(),
    }),
    c2fire: () => {
      const f = D.camp.fire('day');
      const built = f && f.built;
      const pitShort = !built && D.guide.forNeeds(D.camp.pitNeeds);
      const tinderShort = built && D.guide.forNeeds(D.camp.tinderNeeds);
      const list = built ? [
        tick('Fire pit at the camp by the pond', true),
        need('stick', 1, 'Tinder: a stick'), need('fiber', 2, 'Tinder: plant fibre'),
        tick('Light it with the bow drill', f.lit),
      ] : [
        need('stone', 8, 'Stones for the fire pit'), need('stick', 4, 'Sticks for the fire pit'),
        tick('Build the fire pit at the camp by the pond', false),
      ];
      let hint;
      let marker;
      if (!built) {
        hint = pitShort ? `${pitShort.key === 'stone' ? 'Stones' : 'Sticks'} lie all round the clearing (the marker shows the nearest). Then E at the camp spot by the pond builds the pit.` : 'You have enough: go to the camp by the pond and press E to build the fire pit.';
        marker = pitShort || campMark('day', 'Build the fire pit here');
      } else {
        hint = tinderShort ? (tinderShort.key === 'fiber' ? 'Dry fibre is the tinder: pull it from the tall yellow grass on Flint Rise (the marker shows the nearest).' : 'One more stick for the drill: the marker shows the nearest.') : 'E at the pit, then saw the bow: A, D, A, D, in a steady rhythm. When the ember glows, press E to blow on it.';
        marker = tinderShort || campMark('day', 'Light the fire (E)');
      }
      return { title: 'Make fire', list, hint, marker };
    },
    c2clay: () => {
      const baking = D.camp.progress('pots');
      const potsDone = have('pot') + have('pot_water') >= 3;
      const list = [
        tick('A digging stick (Tab, Make)', have('digstick') || potsDone || baking),
        { ...need('clay', 6, 'Clay from the Clay Banks'), done: have('clay') >= 6 || !!baking || potsDone },
        tick(baking ? `Pots baking in the fire: ${Math.ceil(baking.left)} s` : 'Shape three pots at your fire (Tab, At the fire)', baking || potsDone),
        tick('Three baked pots', potsDone),
      ];
      let hint;
      let marker;
      if (fireOut('day') && !potsDone) {
        hint = 'Your fire has gone out. Light it again at the pit (E, then the bow drill).';
        marker = campMark('day', 'Relight your fire');
      } else if (!have('digstick') && !baking && have('clay') < 6) {
        if (!have('stick')) {
          hint = 'A digging stick first: you need a stick (the marker shows the nearest), then Tab, Make.';
          marker = D.guide.source('stick');
        } else {
          hint = 'Open your kit (Tab) and make a digging stick: 1 stick, shaped with the blade. Then go west along the stream to the Clay Banks.';
          marker = world && { x: world.clayCentre.x, z: world.clayCentre.z, label: 'The Clay Banks (make a digging stick: Tab)', r: 8 };
        }
      } else if (have('clay') < 6 && !baking) {
        hint = 'Follow the stream west from the pond to the river: the grey mounds in the bank are clay. E digs (2 each).';
        marker = D.guide.source('clay');
      } else if (!baking && !potsDone) {
        hint = 'Back to your fire. Tab, then At the fire: shape three pots. They bake on their own while you do other things.';
        marker = campMark('day', 'Your fire: shape pots (Tab)');
      } else if (baking && baking.done) {
        hint = 'The pots are baked: they are yours as soon as you are back near the fire.';
        marker = campMark('day', 'Your fire: the pots are ready');
      } else {
        // while they bake: what the torches will need (3 each of resin, fibre, sticks)
        const next = D.guide.forNeeds({ resin: 3, fiber: 3, stick: 3 });
        const where = { resin: 'resin is on the Elder Tree\'s bark', fiber: 'fibre is in the yellow grass on Flint Rise', stick: 'sticks lie all round' };
        hint = next ? `The pots are baking (${Math.ceil(baking.left)} s). Meanwhile, gather for torches: ${where[next.key]}.` : `The pots are baking (${Math.ceil(baking.left)} s). You have what the torches need: wait by the fire, or make them now (Tab).`;
        marker = next || campMark('day', `Pots baking: ${Math.ceil(baking.left)} s`);
      }
      return { title: 'Make clay pots', list, hint, marker };
    },
    c2torch: () => {
      const torches = have('torch') + (D.camp.torchLit() ? 1 : 0);
      const makeNeeds = { resin: Math.max(0, 3 - torches), fiber: Math.max(0, 3 - torches), stick: Math.max(0, 3 - torches) };
      const short = D.guide.forNeeds(makeNeeds);
      const list = [
        { text: 'Resin (Elder Tree bark)', count: `${Math.min(have('resin') + torches, 3)}/3`, done: have('resin') + torches >= 3 },
        { text: 'Plant fibre', count: `${Math.min(have('fiber') + torches, 3)}/3`, done: have('fiber') + torches >= 3 },
        { text: 'Sticks', count: `${Math.min(have('stick') + torches, 3)}/3`, done: have('stick') + torches >= 3 },
        { text: 'Torches (Tab, Make)', count: `${Math.min(torches, 3)}/3`, done: torches >= 3 },
        tick('Light one at your fire', D.camp.torchLit()),
      ];
      let hint;
      let marker;
      if (torches < 3 && short) {
        const where = { resin: 'Resin: the amber beads on the Elder Tree\'s bark, at the end of the jungle trail (E with the blade).', fiber: 'Fibre: the tall yellow grass on Flint Rise.', stick: 'Sticks: the marker shows the nearest.' };
        hint = `${where[short.key]} Each torch is 1 resin, 1 fibre, 1 stick; three will see you through the galleries.`;
        marker = short;
      } else if (torches < 3) {
        hint = 'You have what you need: open your kit (Tab) and make the torches.';
        marker = campMark('day', 'Make torches (Tab), then light one here');
      } else if (fireOut('day')) {
        hint = 'Your fire is out: light it again (E at the pit, the bow drill), then light a torch from it.';
        marker = campMark('day', 'Relight your fire');
      } else {
        hint = 'At your fire, press E to light a torch (4 holds it). It burns about three minutes; the next lights from the last.';
        marker = campMark('day', 'Light a torch (E)');
      }
      return { title: 'Make torches', list, hint, marker };
    },
    c2cave: () => {
      const lit = D.camp.torchLit();
      const inside = D.cave.inGalleries(D.hero.pos);
      const list = [
        tick('A lit torch in hand (4)', lit && D.hero.weapon === 'torch'),
        tick('Through the crack beside the green vein', flags().c2inside),
        need('nitre', 6, 'Nitre crust (white, on the walls)'),
        need('revonite', 3, 'Revonite shards (the great vein)'),
        tick('A stone, to chip with', have('stone') >= 1),
      ];
      let hint;
      let marker;
      if (!have('stone')) {
        hint = 'You will need a stone to chip the Revonite: the marker shows the nearest.';
        marker = D.guide.source('stone');
      } else if (!lit && !have('torch')) {
        hint = 'You are out of torches. Make more (Tab: resin, fibre, a stick each) and light one at a fire.';
        marker = D.guide.forNeeds({ resin: 1, fiber: 1, stick: 1 }) || campMark('day', 'Light a torch (E)');
      } else if (!lit) {
        hint = 'Light a torch at your fire first (E): in the galleries there is no other light.';
        marker = campMark('day', 'Light a torch (E)');
      } else if (!inside) {
        hint = 'Into the cave, to the green vein: the narrow crack beside it leads to the galleries. Hold the torch (4).';
        marker = D.guide.sources.nitre(D.hero.pos);
      } else if (have('nitre') < 6) {
        hint = 'The white crust low on the walls is nitre: E with the blade scrapes it off (2 each).';
        marker = D.guide.sources.nitre(D.hero.pos);
      } else {
        hint = 'Through the passage to the next hall: the great green vein. E with a stone chips shards off.';
        marker = D.guide.sources.revonite(D.hero.pos);
      }
      return { title: 'Into the Nitre Galleries', list, hint, marker };
    },
    c2salt: () => {
      const boil = D.camp.progress('saltpetre');
      const list = [
        tick('A pot of water (fill it at the pond)', have('pot_water') >= 1 || boil),
        tick('Wood ash from your fire (E at the fire)', have('ash') >= 1 || boil),
        need('nitre', 6, 'Nitre crust'),
        tick(boil ? `Boiling down: ${Math.ceil(boil.left)} s` : 'Boil it down at the fire (Tab, At the fire)', boil),
        need('saltpetre', 2, 'Saltpetre'),
      ];
      let hint;
      let marker;
      if (fireOut('day') && !have('saltpetre')) {
        hint = 'Your fire has gone out: light it again at the pit (E).';
        marker = campMark('day', 'Relight your fire');
      } else if (!boil && !have('pot_water')) {
        hint = have('pot') ? 'Take an empty pot to the pond: E at the water\'s edge fills it.' : 'You need an empty clay pot to fill: shape more at the fire (2 clay each).';
        marker = have('pot') ? D.guide.water(D.hero.pos, 'Fill a pot (the pond)') : campMark('day');
      } else if (!boil && !have('ash')) {
        hint = 'A burning fire leaves ash: E at your fire scoops it out (feed the fire a stick if there is none yet).';
        marker = campMark('day', 'Scoop out wood ash (E)');
      } else if (!boil) {
        hint = 'Tab, then At the fire: Saltpetre. It boils down on its own (30 s).';
        marker = campMark('day', 'Make saltpetre (Tab)');
      } else {
        hint = boil.done ? 'Done: it is yours when you are back near the fire.' : 'It is boiling down. Fill another pot of water at the pond while you wait: the fluid needs one.';
        marker = boil.done ? campMark('day', 'Your fire') : have('pot') ? D.guide.water(D.hero.pos, 'Fill another pot') : campMark('day');
      }
      return { title: 'Make saltpetre', list, hint, marker };
    },
    c2fluid: () => {
      const warm = D.camp.progress('fluid');
      const list = [
        tick('A pot of water', have('pot_water') >= 1 || warm),
        need('saltpetre', 2, 'Saltpetre'),
        need('revonite', 3, 'Revonite shards'),
        tick(warm ? `Warming: ${Math.ceil(warm.left)} s` : 'Warm it at the fire (Tab, At the fire)', warm),
        need('fluid', 1, 'Revival fluid'),
      ];
      let hint;
      let marker;
      if (!warm && !have('pot_water')) {
        hint = have('pot') ? 'Fill a pot at the pond (E at the water\'s edge).' : 'You need an empty clay pot to fill: shape one at the fire (2 clay).';
        marker = have('pot') ? D.guide.water(D.hero.pos, 'Fill a pot (the pond)') : campMark('day');
      } else if (!warm && have('revonite') < 3) {
        hint = 'More Revonite: back through the crack to the great vein (with a lit torch).';
        marker = D.guide.sources.revonite(D.hero.pos);
      } else if (!warm) {
        hint = 'Tab, then At the fire: Revival fluid. It warms on its own (25 s).';
        marker = campMark('day', 'Make the revival fluid (Tab)');
      } else {
        hint = warm.done ? 'It is ready: come back near the fire.' : 'It is warming. Nearly there.';
        marker = campMark('day', 'Your fire');
      }
      return { title: 'Brew the revival fluid', list, hint, marker };
    },
    c2revive: () => {
      const s = runner();
      return {
        title: 'Wake the runner',
        list: [tick('The revival fluid', have('fluid') >= 1), tick('The runner by the cave mouth', s && s.awake)],
        hint: 'He was running for the cave when the light came. Take the fluid to him (south, before the cave mouth) and press E.',
        marker: s ? { x: s.x, z: s.z, label: 'The runner', r: 2.2 } : null,
      };
    },
    c2escort: () => {
      const t = ch2.teo;
      const atTree = t && Math.hypot(t.x - L.tree.x, t.z - L.tree.z) < 14;
      const f = D.camp.fire('night');
      const wood = have('stick') + have('branch');
      const list = [
        tick(`Bring ${NAME} to the Elder Tree (he walks slowly)`, atTree),
        { text: 'Firewood for the night (sticks, branches)', count: `${Math.min(wood, FIREWOOD)}/${FIREWOOD}`, done: wood >= FIREWOOD || (f && f.lit && wood >= FIREWOOD - 2) },
        tick('A fire pit at the foot of the tree', f && f.built),
        tick('Light it before dark', f && f.lit),
      ];
      let hint;
      let marker;
      const pitShort = !(f && f.built) && D.guide.forNeeds(D.camp.pitNeeds);
      if (!atTree && t && Math.hypot(t.x - D.hero.pos.x, t.z - D.hero.pos.z) > 25) {
        hint = `${NAME} has fallen behind: go back for him.`;
        marker = { x: t.x, z: t.z, label: NAME, r: 4 };
      } else if (!atTree) {
        hint = `North through the forest and the gorge to the Elder Tree, ${NAME} following. Pick up firewood on the way: dead wood lies all round the tree.`;
        marker = { x: L.tree.x, z: L.tree.z, label: 'The Elder Tree', r: 8 };
      } else if (wood < FIREWOOD + (f && f.built ? 1 : 5)) {
        hint = 'Dead wood lies all round the tree: sticks and branches. You need enough for the fire pit (4), the tinder (1) and the night (6).';
        marker = D.guide.source(have('branch') < 2 && D.items.nearestPickup('branch', D.hero.pos.x, D.hero.pos.z) ? 'branch' : 'stick');
      } else if (pitShort) {
        hint = 'Stones for the fire pit: the marker shows the nearest.';
        marker = pitShort;
      } else if (!(f && f.built)) {
        hint = 'Build the fire pit by the ladder (E), then light it.';
        marker = campMark('night', 'Build the fire pit here');
      } else {
        const tinder = D.guide.forNeeds(D.camp.tinderNeeds);
        hint = tinder ? 'Tinder for the drill: 1 stick and 2 plant fibre.' : 'E at the pit: saw the bow (A, D) and blow on the ember (E).';
        marker = tinder || campMark('night', 'Light the fire (E)');
      }
      return { title: 'Before nightfall', list, hint, marker };
    },
    c2night: () => {
      const f = D.camp.fire('night');
      const left = Math.max(0, NIGHT_LENGTH - (ch2.night ? ch2.night.t : 0));
      const wood = have('stick') + have('branch');
      const mins = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      const list = [
        { text: 'Keep the fire burning until dawn', count: mins, done: false },
        { text: 'Wood in the fire', count: f && f.lit ? D.camp.fuelText(f) : 'out!', done: false },
        { text: 'Firewood carried', count: `${wood}`, done: wood > 0 },
      ];
      const low = !f || !f.lit || f.fuel < 60;
      let marker = campMark('night', low ? 'Feed the fire (E)!' : 'The fire');
      if (wood === 0 && f && f.lit && f.fuel > 50) marker = D.guide.source('stick') || marker;
      return {
        title: 'The second night',
        list,
        hint: !f || !f.lit ? 'The fire is out! Light it again (E): without it, the bear will climb to the shelter.' : wood === 0 ? 'Out of firewood: dead wood lies round the tree. Do not go far from the fire.' : 'Feed the fire when it burns low (E). If the bear comes close, shoot it (3) or face it with a torch (4).',
        marker,
      };
    },
    c2dawn: () => ({
      title: 'What they saw',
      list: [tick('Climb to the Lookout on the eastern slope', flags().c2lookout)],
      hint: 'Up the goat trail from the far side of Flint Rise, to the cairn on the ledge. (Or rest by the fire to end the chapter here.)',
      marker: flags().c2talked ? { x: LOOKOUT.x, z: LOOKOUT.z, label: 'The Lookout', r: 3 } : null,
    }),
    c2end: () => ({ title: 'Morning', list: [], hint: '', marker: null }),
  };
  ch2.objective = (s) => (OBJECTIVES[s] ? OBJECTIVES[s]() : null);

  // which kit tab to open on, which fire recipes are known yet, what E at a fire should offer first
  ch2.kitTab = () => (['c2clay', 'c2salt', 'c2fluid'].includes(stage()) && (have('clay') >= 6 || have('pot_water') || have('saltpetre')) ? 'fire' : 'make');
  ch2.recipeOpen = (id) => ({ pots: at('c2clay'), saltpetre: at('c2salt') || have('nitre') > 0, fluid: at('c2fluid') || have('saltpetre') > 0 }[id]);
  ch2.fireWants = () => ({ c2torch: 'torch', c2cave: 'torch', c2salt: 'ash' }[stage()] || null);
  ch2.campSpots = () => (at('c2escort') ? ['day', 'night'] : ['day']);

  // ---------- Stage by stage ----------

  // Checked twice a second (story.js): has the goal been reached?
  ch2.check = () => {
    const h = D.hero;
    switch (stage()) {
      case 'c2wake': {
        const v = veinMark();
        if (!flags().c2vein && Math.hypot(h.pos.x - v.x, h.pos.z - v.z) < 4.5 && h.pos.z > C.mouthZ) {
          flags().c2vein = true;
          say('The vein. Revonite... and water dripping down it, onto where I stood.', 4.5);
          say('Wait. Cold air, on my face. From this crack.', 4);
          say('The cave goes on, deeper. But it\'s pitch dark in there.', 4);
          say('I need light. I need fire.', 3.5);
          go('c2fire');
          raise('c2fire');
        }
        break;
      }
      case 'c2cave':
        if (D.cave.inGalleries(h.pos) && !flags().c2inside) {
          flags().c2inside = true;
          D.ui.zone(9);
          say(D.camp.holdingLight() ? 'White crust on every wall... nitre. Bats made this, over a thousand years.' : 'Black. I can\'t see my own hands. I need a lit torch.', 4.5);
        }
        if (have('nitre') >= 6 && have('revonite') >= 3) {
          say('Nitre and Revonite. Everything that woke me, in my hands.', 4);
          say('Now I make it pure: water, ash, fire.', 3.5);
          go('c2salt');
          raise('c2salt');
        }
        break;
      case 'c2revive':
        break;
      case 'c2escort': {
        const t = ch2.teo;
        const f = D.camp.fire('night');
        if (t && f && f.lit && Math.hypot(t.x - L.tree.x, t.z - L.tree.z) < 14 && have('stick') + have('branch') >= FIREWOOD - 2) startNight();
        // dusk is coming: say so, once
        if (D.env.hour > 17.6 && !flags().c2dusk) {
          flags().c2dusk = true;
          say('The light is going. We need that fire before dark.', 3.5);
        }
        break;
      }
      case 'c2dawn':
        if (flags().c2talked && !flags().c2lookout && Math.hypot(h.pos.x - LOOKOUT.x, h.pos.z - LOOKOUT.z) < 4) {
          flags().c2lookout = true;
          lookoutReveal();
        }
        break;
      default:
        break;
    }
  };

  // Things that happen, from the rest of the game.
  ch2.on = (event, data) => {
    if (!ch2.started()) return;
    switch (event) {
      case 'pitBuilt':
        if (data === 'day') say('A ring of stones. Now, the hard part: fire.', 3.2);
        D.ui.tutorial('<kbd>E</kbd> at the pit: the bow drill &middot; saw with <kbd>A</kbd> <kbd>D</kbd> in turn &middot; <kbd>E</kbd> blows the ember', 8);
        break;
      case 'fireLit':
        if (data === 'day' && stage() === 'c2fire') {
          say('Fire! I made fire!', 3);
          say('With fire I can bake clay, boil water... and see in the dark.', 4.5);
          say('Clay first: pots to hold what I brew. The stream bank by the river looked grey.', 4.5);
          go('c2clay');
          raise('c2clay');
        }
        break;
      case 'gained':
        if (data.key === 'clay' && !flags().c2clay1) {
          flags().c2clay1 = true;
          say('Good clay. Smooth, sticky. It will hold a shape.', 3.5);
        }
        if (data.key === 'resin' && !flags().c2resin1) {
          flags().c2resin1 = true;
          say('Resin. It burns slow and bright.', 3);
        }
        if (data.key === 'revonite' && !flags().c2rev1) {
          flags().c2rev1 = true;
          say('It\'s warm. The stone is warm in my hand.', 3.5);
        }
        break;
      case 'cooked':
        if (data === 'pots' && stage() === 'c2clay') {
          say('Pots. Ugly, but they will hold water... and whatever I brew in them.', 4);
          say('Now, light for that crack. Torches: resin from the Elder Tree, fibre, sticks.', 4.5);
          go('c2torch');
          raise('c2torch');
        }
        if (data === 'saltpetre' && stage() === 'c2salt') {
          say('White crystals. Saltpetre. Just as it was made by hand, centuries ago.', 4.5);
          say('Now the Revonite, ground fine, in clean water... warmed.', 4);
          go('c2fluid');
          raise('c2fluid');
        }
        if (data === 'fluid' && stage() === 'c2fluid') {
          say('It glows. One dose... enough for one person.', 4);
          say('Who first? The man by the cave mouth. He was running toward the cave. Toward me.', 5);
          go('c2revive');
          raise('c2revive');
        }
        break;
      case 'torchLit':
        if (stage() === 'c2torch') {
          say('Light. Now, the crack in the cave.', 3);
          D.ui.tutorial('<kbd>4</kbd> holds the torch &middot; it burns about three minutes &middot; spares light from the last flame', 7);
          go('c2cave');
          raise('c2cave');
        }
        break;
      case 'fireOut':
        if (data === 'day' && at('c2clay') && !at('c2revive')) say('The fire\'s gone out. I\'ll need to light it again.', 3);
        if (data === 'night' && stage() === 'c2night') say('The fire\'s out! Light it, quick!', 2.5, true);
        break;
      default:
        break;
    }
  };

  // ---------- The waking ----------

  // Teo: a living copy of the runner's figure, stone at first, waking as the hero did (people.js
  // walks him, poses him and has him follow).
  function buildTeo() {
    if (ch2.teo) return ch2.teo;
    ch2.teo = D.people.make({ id: 'teo', name: NAME, statue: runner() });
    return ch2.teo;
  }
  const placeTeo = () => D.people.place(ch2.teo);

  function pour(s) {
    const h = D.hero;
    if (!D.items.has('fluid')) return;
    if (!h.startAction('Pouring the revival fluid', 2.4, { pose: 'gather', fixed: true, onDone: () => {
      D.items.remove('fluid', 1);
      wakeScene(s);
    }, sound: () => D.audio && D.audio.pour() })) return;
    h.action.face = Math.atan2(s.x - h.pos.x, s.z - h.pos.z);
  }

  function wakeScene(s) {
    const t = buildTeo();
    D.story.playCine(D.people.wakeShots(t, [
      [NAME, '...the light. The green light... where... ?', 3.2],
      ['You', 'Easy. Breathe. You\'ve been stone for a long, long time.', 3.4],
      [NAME, 'Stone... ? I was running. For the cave...', 2.6],
    ]), () => {
      D.people.follow(t, 0);
      D.story.startPlay(true);
      say('He can barely stand. Night is coming: I have to get him to the shelter.', 4.5);
      go('c2escort');
      raise('c2escort');
    });
  }

  // ---------- The second night ----------

  function startNight() {
    const t = ch2.teo;
    const P = D.shelter.P;
    ch2.night = { t: 0, bear: { state: 'lurk', timer: 30, angle: Math.random() * 6.3, fled: 0, hurt: 0, gone: false }, outFor: 0 };
    // he climbs up to the shelter, and sits there
    if (t && P) {
      D.people.setPose(t, 'sit', { x: P.cx, z: P.cz, y: P.y + 0.42 });
      t.mode = 'up';
    }
    teoSays('I\'ll keep watch from up here. You... keep that fire alive.', 4);
    say('Something big is moving out there in the dark.', 3.5);
    go('c2night');
    D.story.saveNow();
    const bear = D.combat.getBear();
    if (bear) {
      bear.raid = true;
      bear.visit = null;
      bear.group.visible = true;
      bear.health = bear.sp.health;
      const f = D.camp.fire('night');
      bear.x = f.x + 30;
      bear.z = f.z - 18;
      bear.h = 0;
    }
  }
  D.combat.onBearHit = (bear, dmg) => {
    const n = ch2.night;
    if (!n) return;
    bear.health -= dmg;
    n.bear.hurt += 1;
    n.bear.state = 'flee';
    n.bear.timer = 22;
    bear.roaring = 2.5;
    if (D.audio) D.audio.roar('bear', Math.hypot(bear.x - D.hero.pos.x, bear.z - D.hero.pos.z), 1.3);
    if (bear.health <= 0 || n.bear.hurt >= 3) {
      n.bear.state = 'gone';
      say('It\'s running. It won\'t be back tonight.', 3.5);
    } else say(n.bear.hurt === 1 ? 'Hit! It\'s backing off.' : 'Again! Go on, get away!', 2.8);
  };
  function updateNight(dt) {
    const n = ch2.night;
    if (!n || stage() !== 'c2night' || D.state.mode !== 'play') return;
    n.t += dt;
    D.env.hour = (19 + (n.t / NIGHT_LENGTH) * 10.6) % 24;
    D.nightFill = 0.35;
    const f = D.camp.fire('night');
    const h = D.hero;
    const bear = D.combat.bear;
    const b = n.bear;
    if (!f || !bear) return;
    n.outFor = f.lit ? 0 : n.outFor + dt;
    // the bear
    if (b.state !== 'gone' || bear.group.visible) {
      const fx = f.x;
      const fz = f.z;
      const dBear = Math.hypot(bear.x - fx, bear.z - fz);
      const toHero = Math.hypot(bear.x - h.pos.x, bear.z - h.pos.z);
      b.timer -= dt;
      const strong = f.lit && f.fuel > 45;
      // a lit torch in his face turns it
      if (D.camp.holdingLight() && toHero < 6 && ['probe', 'charge'].includes(b.state)) {
        b.state = 'flee';
        b.timer = 14;
        bear.roaring = 2;
        say('Back! Get back!', 2, true);
      }
      switch (b.state) {
        case 'lurk':
          b.angle += dt * 0.08;
          bear.tx = fx + Math.cos(b.angle) * 26;
          bear.tz = fz + Math.sin(b.angle) * 26;
          bear.goal = bear.sp.walk;
          if (b.timer <= 0) {
            b.state = 'probe';
            b.timer = 20;
            if (!n.firstProbe) {
              n.firstProbe = true;
              say('Eyes. In the dark, there. It\'s coming closer.', 3.5, true);
            }
          }
          break;
        case 'probe':
          bear.tx = fx;
          bear.tz = fz;
          bear.goal = bear.sp.walk * 1.3;
          if (dBear < 11) {
            if (strong) {
              bear.roaring = 3;
              if (D.audio) D.audio.roar('bear', toHero, 1.2);
              b.state = 'flee';
              b.timer = 16;
              if (!n.firstTurn) {
                n.firstTurn = true;
                say('The fire. It won\'t come near the fire.', 3.5);
              }
            } else {
              b.state = 'charge';
              b.timer = 8;
              say('The fire\'s too low! It\'s coming!', 2.5, true);
            }
          }
          if (b.timer <= 0) {
            b.state = 'flee';
            b.timer = 12;
          }
          break;
        case 'charge':
          bear.tx = h.pos.x;
          bear.tz = h.pos.z;
          bear.goal = bear.sp.run * 0.8;
          if (toHero < 2.3 && !h.dead) {
            h.hurt(24, 'Mauled by the bear', (h.pos.x - bear.x) / toHero, (h.pos.z - bear.z) / toHero, 1.4);
            b.state = 'flee';
            b.timer = 18;
          }
          if (b.timer <= 0) {
            b.state = 'flee';
            b.timer = 12;
          }
          break;
        case 'flee':
          bear.tx = fx + (bear.x - fx) * 4;
          bear.tz = fz + (bear.z - fz) * 4;
          bear.goal = bear.sp.walk * 2.2;
          if (b.timer <= 0) {
            b.state = 'lurk';
            b.timer = rand(28, 42);
            b.angle = Math.atan2(bear.z - fz, bear.x - fx);
          }
          break;
        case 'gone':
          bear.tx = fx + (bear.x - fx) * 6;
          bear.tz = fz + (bear.z - fz) * 6;
          bear.goal = bear.sp.walk * 2.5;
          if (dBear > 60) bear.group.visible = false;
          break;
        case 'climb':
          bear.tx = D.shelter.ladder.bottom.x;
          bear.tz = D.shelter.ladder.bottom.z;
          bear.goal = bear.sp.run * 0.7;
          if (Math.hypot(bear.x - bear.tx, bear.z - bear.tz) < 2 && !h.dead) {
            bear.roaring = 3;
            if (D.audio) D.audio.roar('bear', toHero, 1.4);
            h.die('The bear reached the shelter');
          }
          break;
        default:
          break;
      }
      // the fire out too long: it goes for the shelter
      if (n.outFor > 25 && b.state !== 'gone' && b.state !== 'climb') {
        b.state = 'climb';
        say('It\'s going for the ladder! For Teo! Light the fire!', 3, true);
      }
      if (b.state === 'climb' && f.lit) {
        b.state = 'flee';
        b.timer = 15;
      }
      D.combat.moveBeast(bear, dt);
      D.combat.animateBeast(bear, dt);
    }
    // dawn
    if (n.t >= NIGHT_LENGTH) dawn();
  }

  function dawn() {
    const n = ch2.night;
    ch2.night = null;
    const bear = D.combat.bear;
    if (bear) {
      bear.raid = false;
      bear.group.visible = false;
    }
    D.nightFill = 0;
    const f = D.camp.fire('night');
    const t = ch2.teo;
    D.story.fadeTo(1, 1.5, () => {
      D.env.hour = 5.75;
      D.forceSkyCapture();
      // morning: both of them by the fire
      if (f) D.camp.light('night', 200);
      const h = D.hero;
      h.teleport(f.x - 1.6, f.z + 0.4, Math.atan2(1.6, -0.4));
      if (t) D.people.setPose(t, 'sit', { x: f.x + 1.5, z: f.z - 0.5, h: Math.atan2(-1.5, 0.5) });
      go('c2dawn');
      D.story.fadeTo(0, 1.5);
      talkAtDawn();
    });
    if (n && D.audio) D.audio.sting('dawn');
  }

  // ---------- Dawn ----------

  function talkAtDawn() {
    const t = ch2.teo;
    const f = D.camp.fire('night');
    const h = D.hero;
    h.cinematicPose = 'sit';
    const between = () => new THREE.Vector3(f.x, f.y + 0.9, f.z);
    const lines = [
      [NAME, 'I keep thinking it\'s a dream. That I\'ll wake up at my desk.', 4],
      ['You', 'It\'s real. A thousand years, near enough. Everyone, everywhere, turned to stone.', 4.5],
      [NAME, 'The light. I saw it come over the mountains... from the north-east. A ring of green fire.', 5],
      [NAME, 'I\'m a geologist. I\'d mapped that cave: nitre beds, and a green mineral nobody could name.', 5],
      ['You', 'Revonite. It\'s what woke me. And now you.', 3.5],
      [NAME, 'Then it can wake the others. All of them.', 3.5],
      ['You', 'One at a time. We\'ll need more of everything: nitre, Revonite, pots, fire.', 4.5],
      [NAME, 'And answers. Whatever made that light... it\'s still out there.', 4],
      [NAME, 'There\'s a ledge up the eastern slope, past Flint Rise. You can see over the ridge from there. Go and look.', 5.5],
    ];
    const total = lines.reduce((s, l) => s + l[2] + 0.4, 0);
    D.story.playCine([{
      dur: total, caption: '',
      enter: () => {
        lines.forEach(([who, text, s], i) => D.ui.say(who, text, s, i === 0));
      },
      update: () => {},
      cam: (k) => {
        const c = between();
        const a = 2.4 + k * 0.5;
        return { pos: c.clone().add(new THREE.Vector3(Math.cos(a) * 4.2, 1.1, Math.sin(a) * 4.2)), look: c.clone().add(new THREE.Vector3(0, 0.3, 0)), fov: 46 };
      },
    }], () => {
      D.ui.quiet(); // (skipped: what was left unsaid goes unsaid)
      h.cinematicPose = null;
      if (t) D.people.follow(t, 0);
      flags().c2talked = true;
      D.story.startPlay(true);
      D.story.refresh(true);
      say('The Lookout. East, past Flint Rise, up the slope.', 3.5);
    });
  }

  // where the ring stands (the sky shader draws it there): up and to the north-east
  const RING = new THREE.Vector3(0.68, 0.66, -0.52).normalize();
  function lookoutReveal() {
    D.ui.quiet();
    D.story.playCine([
      {
        dur: 5.5, caption: '',
        enter: () => {
          // the sun up over the mountains
          D.env.hour = Math.max(D.env.hour, 6.35);
          D.forceSkyCapture();
          say('There... over the ridge.', 2.5, true);
        },
        update: (k) => {
          D.ringReveal = smoothstep(0.15, 0.9, k);
        },
        cam: (k) => {
          const p = new THREE.Vector3(LOOKOUT.x - 2, T.height(LOOKOUT.x, LOOKOUT.z) + 1.8, LOOKOUT.z + 1.5);
          const look = RING.clone().multiplyScalar(100);
          look.y -= 30 * (1 - k); // from the ridge up to the sky
          return { pos: p, look: p.clone().add(look), fov: 54 };
        },
      },
      {
        dur: 7, caption: '',
        enter: () => {
          D.ui.say('You', 'A ring. A ring of green, standing over the world.', 3.5);
          D.ui.say(NAME, 'That\'s where it came from. That\'s where we have to go.', 3.5);
          if (D.audio) D.audio.sting('done');
        },
        update: () => {
          D.ringReveal = 1;
        },
        cam: (k) => {
          // back from the ledge: the two of them small against it
          const p = new THREE.Vector3(LOOKOUT.x - 7 + k * 1.5, T.height(LOOKOUT.x, LOOKOUT.z) + 2.4 + k * 1.5, LOOKOUT.z + 6);
          return { pos: p, look: p.clone().add(RING.clone().multiplyScalar(100)).add(new THREE.Vector3(0, -22, 0)), fov: 62 };
        },
      },
    ], () => {
      D.ui.quiet();
      endChapter(true);
    });
  }

  function endChapter(sawRing) {
    D.ui.quiet();
    D.story.endChapter2({ sawRing });
  }

  // ---------- Each frame ----------

  let enteredDark = false;
  ch2.frame = (dt) => {
    if (!ch2.started()) return;
    if (ch2.teo) ch2.teo.weak = stage() === 'c2escort';
    if (dt > 0) updateNight(dt);
    // in the galleries: the bats, and the dark
    const h = D.hero;
    const g = D.cave.galleries;
    if (g && D.state.mode === 'play') {
      const inside = D.cave.inGalleries(h.pos);
      if (inside && !D.camp.holdingLight() && !enteredDark) {
        enteredDark = true;
        say('Too dark. I need a lit torch in my hand (4).', 3.5, true);
      }
      if (!inside) enteredDark = false;
      if (!g.scattered && D.camp.holdingLight() && Math.hypot(h.pos.x - g.hallB.x, h.pos.z - g.hallB.z) < g.hallB.rx + 1.5) {
        D.cave.scatterGallery();
        D.camp.torchDim = 0.45;
        setTimeout(() => {
          D.camp.torchDim = 1;
        }, 1800);
        say('Bats! Hundreds of them!', 2.5, true);
        say('...gone. And there: the vein. A whole wall of it.', 4);
      }
    }
    D.ringShown = D.ringReveal || 0;
  };

  // ---------- Starting, saving, loading ----------

  // From the end of Chapter 1: the morning after, on the platform in the Elder Tree.
  ch2.start = () => {
    setupWorld();
    const h = D.hero;
    const P = D.shelter.P;
    D.shelter.setStage(3);
    D.combat.resetTiger(false);
    flags().tigerDead = true;
    h.revive();
    h.petrify = 0;
    h.frozen = false;
    h.cinematicPose = null;
    h.group.visible = true;
    Object.assign(h.stats, { health: 100, stamina: 100, hunger: Math.max(h.stats.hunger, 70), thirst: Math.max(h.stats.thirst, 65) });
    if (P) {
      h.teleport(P.cx + P.ox * 1.15, P.cz + P.oz * 1.15, Math.atan2(P.ox, P.oz), P.y + 0.44);
      h.platform = P;
    }
    D.env.hour = HOURS.c2wake[0];
    D.forceSkyCapture();
    go('c2wake');
    D.story.startPlay(false);
    say('Morning. I made it through the night.', 3.5);
    say('Guano, water, the green stone... and time. If that woke me, it could wake someone else.', 5);
    say('I need to see that cave wall again.', 3.5);
    D.ui.tutorial('<kbd>E</kbd> at the ladder climbs down &middot; follow the marker &middot; <kbd>B</kbd> field notes: Chapter 2', 8);
  };

  ch2.save = () => {
    const t = ch2.teo;
    return {
      camp: D.camp.save(),
      teo: t ? { mode: t.mode, x: t.x, z: t.z, h: t.h } : null,
      scattered: !!(D.cave.galleries && D.cave.galleries.scattered),
      night: ch2.night ? { t: ch2.night.t } : null,
    };
  };
  ch2.load = (s) => {
    if (!ch2.started()) {
      ch2.reset();
      return;
    }
    setupWorld();
    refreshWorld();
    D.camp.load(s && s.camp);
    D.cave.restoreGalleries(D.items.taken, s && s.scattered);
    const r = runner();
    if (s && s.teo) {
      const t = buildTeo();
      D.people.alive(t);
      D.people.teleport(t, s.teo.x, s.teo.z, s.teo.h);
      D.people.follow(t, 0);
    } else if (ch2.teo) {
      ch2.teo.group.visible = false;
      D.statues.unwake(r);
    }
    // the night, from its start (a retry or a reload lands at dusk, fire lit)
    if (stage() === 'c2night') {
      D.story.setStage('c2escort', { save: false, flash: false });
      D.camp.light('night', 160);
      D.env.hour = 18.2;
      startNight();
    }
  };
  ch2.reset = () => {
    ch2.night = null;
    if (ch2.teo) ch2.teo.group.visible = false;
    if (D.statues.list[0]) D.statues.unwake(D.statues.list[0]);
    D.camp.load(null);
    D.ringReveal = 0;
    const bear = D.combat.bear;
    if (bear) {
      bear.raid = false;
      bear.group.visible = false;
    }
  };

  // ---------- For testing: ?stage=c2clay starts there with what that part needs ----------

  ch2.devStart = (s) => {
    setupWorld();
    const h = D.hero;
    const give = (o) => Object.entries(o).forEach(([k, n]) => D.items.add(k, n, true));
    D.shelter.setStage(3);
    D.combat.resetTiger(false);
    flags().tigerDead = true;
    flags().mauled = true;
    give({ blade: 1, bow: 1, arrow: 8 });
    const i = STAGES.indexOf(s);
    if (i >= STAGES.indexOf('c2clay')) {
      D.camp.light('day', 400);
      give({ stick: 2 });
    }
    if (i >= STAGES.indexOf('c2torch')) give({ pot: 3 });
    if (i >= STAGES.indexOf('c2cave')) {
      give({ torch: 2, stone: 2 });
      D.camp.torch.lit = true;
      D.camp.torch.left = 170;
    }
    if (i >= STAGES.indexOf('c2salt')) give({ nitre: 6, revonite: 3 });
    if (i >= STAGES.indexOf('c2fluid')) {
      D.items.remove('nitre', 6);
      give({ saltpetre: 2 });
    }
    if (i >= STAGES.indexOf('c2revive')) {
      D.items.remove('saltpetre', 2);
      D.items.remove('revonite', 3);
      give({ fluid: 1 });
    }
    const spot = {
      c2wake: null, c2fire: [-24, 96], c2clay: [-34, 96], c2torch: [-40, -160], c2cave: [18, 248], c2salt: [-26, 94], c2fluid: [-26, 94],
      c2revive: [6, 224], c2escort: [6, 224], c2night: null, c2dawn: null,
    }[s];
    Object.assign(h.stats, { hunger: 80, thirst: 80, health: 100, stamina: 100 });
    if (spot) h.teleport(spot[0], spot[1], Math.PI);
    if (s === 'c2escort' || s === 'c2night' || s === 'c2dawn') {
      const t = buildTeo();
      D.people.alive(t);
      D.people.teleport(t, spot ? spot[0] + 2 : L.tree.x + 6, spot ? spot[1] + 2 : L.tree.z + 8);
      D.people.follow(t, 0);
    }
    if (s === 'c2night' || s === 'c2dawn') {
      give({ stick: 8, branch: 2 });
      D.camp.build('night');
      D.camp.light('night', 200);
      const f = D.camp.fire('night');
      h.teleport(f.x - 2, f.z + 2, Math.PI);
      D.people.teleport(ch2.teo, f.x + 2, f.z + 2);
    }
    if (s === 'c2wake') {
      ch2.start();
      return;
    }
    D.env.hour = (HOURS[s] || [18.2])[0];
    D.forceSkyCapture();
    D.story.startPlay(false);
    go(s === 'c2night' ? 'c2escort' : s);
    if (s === 'c2night') startNight();
    if (s === 'c2dawn') {
      flags().c2talked = true;
      D.story.refresh(true);
    }
    if (D.items.has('bow')) D.items.setWeapon(s === 'c2cave' ? 'torch' : 'bow');
  };

  // (Chapter 3 carries on in this world: the clay banks, the resin, the cairn)
  ch2.setupWorld = () => setupWorld();
  ch2.refreshWorld = () => refreshWorld();
  ch2.world = () => world;

  D.ch2 = ch2;
})();
