// The New Dawn: the bow and its arrows, and the tiger that holds the gorge.
//
// The bow is made by hand from a sapling and plant-fibre cord, so it is drawn here: a
// tapering wooden stave, bound at the grip, and a string that pulls back as he draws. Arrows
// fly under gravity and stick where they land (in the ground, in a tree, in the tiger) and
// can be picked up again. The tiger lies up in the gorge, the only way north. Come close and
// it rises and warns you; closer, or shoot it, and it charges, mauls, and falls back to its
// den. Its legs are placed on the ground step by step (as in Car Drive), with its own gallop
// for the charge. At night a bear comes by the Elder Tree.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, lerp, smooth, approach, wrapAngle, rand } = D;
  const T = D.terrain;
  const L = D.LAYOUT;

  const combat = { arrows: [], tiger: null, bear: null, stats: { shot: 0, hit: 0 } };

  // ---------- The bow ----------

  const BOW_LEN = 1.36;
  function bowGeometry() {
    // a stave bent in a shallow arc (the belly toward the archer), thick at the grip and thin
    // at the tips, made of rings along its length
    const rings = 28;
    const sides = 7;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings * 2 - 1; // -1 bottom tip .. 1 top tip
      const y = t * BOW_LEN / 2;
      const z = 0.11 * (1 - t * t) - 0.02 * Math.abs(t) ** 4; // forward bulge; the tips flick back
      const r = lerp(0.008, 0.022, 1 - Math.abs(t) ** 1.4);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        pos.push(Math.cos(a) * r, y, z + Math.sin(a) * r * 1.3);
        uv.push(s / sides * 0.3, i / rings * 2.5);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let s = 0; s < sides; s++) {
        const a = i * (sides + 1) + s;
        const b = a + sides + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function arrowGeometry() {
    const parts = [];
    const shaft = new THREE.CylinderGeometry(0.0055, 0.0055, 0.78, 5);
    shaft.rotateX(Math.PI / 2); // along z, the head at +z
    parts.push({ g: shaft, m: 'wood' });
    const head = new THREE.ConeGeometry(0.014, 0.06, 4);
    head.rotateX(Math.PI / 2);
    head.translate(0, 0, 0.42);
    parts.push({ g: head, m: 'flint' });
    for (let k = 0; k < 3; k++) {
      const vane = new THREE.PlaneGeometry(0.035, 0.11);
      vane.rotateX(Math.PI / 2);
      vane.translate(0.018, 0, -0.32);
      vane.rotateZ((k / 3) * Math.PI * 2);
      parts.push({ g: vane, m: 'leaf' });
    }
    return parts;
  }

  let arrowParts = null;
  function arrowMesh() {
    if (!arrowParts) {
      const wood = new THREE.MeshStandardMaterial({ color: D.col(0xc9a874), roughness: 0.8 });
      const flint = new THREE.MeshStandardMaterial({ color: D.col(0x3a3f48), roughness: 0.35 });
      const leaf = new THREE.MeshStandardMaterial({ color: D.col(0x5a8a34), roughness: 0.8, side: THREE.DoubleSide });
      const m = { wood, flint, leaf };
      arrowParts = arrowGeometry().map(({ g, m: key }) => ({ g, m: m[key] }));
    }
    const group = new THREE.Group();
    for (const { g, m } of arrowParts) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return group;
  }

  const bow = { group: new THREE.Group(), stave: null, string: [], nocked: null, shown: false };
  function buildBow() {
    const woodMat = new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0xd6b07c), roughness: 0.7 });
    const stave = new THREE.Mesh(bowGeometry(), woodMat);
    stave.castShadow = true;
    bow.group.add(stave);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 7), new THREE.MeshStandardMaterial({ color: D.col(0x8a7650), roughness: 0.95 }));
    grip.position.z = 0.108;
    bow.group.add(grip);
    const stringMat = new THREE.MeshBasicMaterial({ color: D.col(0xe8dcc0) });
    for (let k = 0; k < 2; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 1, 3).translate(0, 0.5, 0), stringMat);
      bow.group.add(s);
      bow.string.push(s);
    }
    bow.nocked = arrowMesh();
    bow.group.add(bow.nocked);
    bow.group.visible = false;
    D.scene.add(bow.group);
  }

  // New copies of the bow (strung, an arrow on the string) and of an arrow, for pictures.
  combat.bowModel = () => {
    const g = new THREE.Group();
    const wood = bow.group.children[0].material;
    g.add(new THREE.Mesh(bow.group.children[0].geometry, wood));
    g.add(new THREE.Mesh(bow.group.children[1].geometry, bow.group.children[1].material));
    g.children[1].position.z = 0.108;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, BOW_LEN - 0.04, 4), bow.string[0].material);
    string.position.z = -0.01;
    g.add(string);
    return g;
  };
  combat.arrowModel = () => arrowMesh();

  combat.showBow = (on) => {
    bow.shown = on;
  };

  // Where the bow goes: in the left hand at arm's length when aiming, slung across the back
  // otherwise. Placed each frame from the hero's bones and aim (not parented to a bone, so
  // it stays upright whatever the hand bone's own axes are).
  const tipTop = new THREE.Vector3();
  const tipBottom = new THREE.Vector3();
  const nockAt = new THREE.Vector3();
  const handL = new THREE.Vector3();
  const handR = new THREE.Vector3();
  const back = new THREE.Vector3();
  function placeBow() {
    const h = D.hero;
    const visible = bow.shown && D.items && D.items.has('bow') && !h.dead && D.state.mode !== 'loading';
    bow.group.visible = visible;
    if (!visible) return;
    const aiming = h.weapon === 'bow' && (h.aiming || h.draw > 0) && !h.action;
    const g = bow.group;
    if (aiming) {
      h.boneWorld('handL', handL);
      h.boneWorld('handR', handR);
      g.position.copy(handL);
      // upright, canted a little, its back (+z, the grip side) toward the target
      g.rotation.order = 'YXZ';
      g.rotation.set(-h.pitch, h.facing, -0.18);
    } else {
      // across the back
      h.boneWorld('spine2', back);
      g.rotation.order = 'YXZ';
      g.rotation.set(0.15, h.facing, 0.75);
      g.position.copy(back).add(new THREE.Vector3(-Math.sin(h.facing) * 0.17, 0.02, -Math.cos(h.facing) * 0.17));
    }
    g.updateMatrixWorld(true);
    // the string: tip to nock to tip; the nock pulled back toward the drawing hand
    const draw = aiming ? h.draw : 0;
    tipTop.set(0, BOW_LEN / 2 - 0.02, -0.01);
    tipBottom.set(0, -BOW_LEN / 2 + 0.02, -0.01);
    nockAt.set(0, 0, -0.01 - 0.62 * draw); // drawn back toward the archer (-z)
    const setSeg = (mesh, a, b) => {
      mesh.position.copy(a);
      const d = b.clone().sub(a);
      mesh.scale.set(1, d.length(), 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    };
    setSeg(bow.string[0], tipBottom, nockAt);
    setSeg(bow.string[1], nockAt, tipTop);
    bow.nocked.visible = aiming && D.items.has('arrow') && h.draw > 0.02;
    bow.nocked.position.copy(nockAt).add(new THREE.Vector3(0, 0, 0.39)); // its tail on the string
    bow.nocked.rotation.set(0, 0, 0); // pointing at the target
  }

  // The pose for holding the bow: the bow arm straight out along the aim, the drawing arm
  // pulled back to the cheek, the body turned side-on.
  combat.bowPose = (pitch, draw) => {
    const up = pitch * 0.95;
    return {
      twist: -0.35, headTurn: 0.35,
      armL: -Math.PI / 2 - up, armLout: -0.12, foreL: -0.05,
      armR: -Math.PI / 2 - up * 0.9 + 0.1, armRout: 0.15, armRturn: 0.3 * draw, foreR: -0.35 - 2.05 * draw,
      head: -pitch * 0.4,
    };
  };

  // ---------- Shooting ----------

  const aimDir = new THREE.Vector3();
  const aimFrom = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  // Where the middle of the screen points, as far as the first thing in the way.
  function aimTarget(out) {
    const cam = D.camera;
    cam.getWorldDirection(aimDir);
    const p = cam.position.clone();
    for (let d = 2; d < 160; d += 0.5) {
      p.copy(cam.position).addScaledVector(aimDir, d);
      if (p.y < T.height(p.x, p.z)) break;
      if (combat.tiger && !combat.tiger.dead && hitTiger(p, 0.1)) break;
      if (D.flora.trunkHit(p.x, p.y, p.z)) break;
    }
    return out.copy(p);
  }

  // Others can take a flying arrow: fn(head, arrow) returns true when it hit them (Chapter 3:
  // the tree across the ravine, the wolves).
  combat.arrowTargets = [];
  // ...and a spear's jab: fn(point, dir, damage) returns true when it hit them.
  combat.meleeTargets = [];

  function shoot(draw) {
    const h = D.hero;
    // a rope arrow, if one is ready (Chapter 3: the ravine)
    const rope = D.items.has('rope_arrow') && !!(D.east && D.east.ropeReady && D.east.ropeReady());
    if (!rope && !D.items.has('arrow')) {
      D.ui && D.ui.toast('No arrows left. Make more in the kit, or pick up the ones you shot', true);
      return;
    }
    D.items.remove(rope ? 'rope_arrow' : 'arrow', 1);
    bow.group.updateMatrixWorld(true);
    bow.nocked.localToWorld(aimFrom.set(0, 0, -0.1));
    aimTarget(aimPoint);
    const dir = aimPoint.clone().sub(aimFrom).normalize();
    const speed = 30 + 45 * draw;
    const mesh = arrowMesh();
    D.scene.add(mesh);
    const arrow = { mesh, pos: aimFrom.clone(), vel: dir.multiplyScalar(speed), flying: true, age: 0, power: draw, stuck: null, rope };
    if (rope && D.east) D.east.ropeShot(arrow);
    combat.arrows.push(arrow);
    combat.stats.shot++;
    if (D.audio) D.audio.bowRelease(draw);
    if (D.story) D.story.on('shot');
  }

  const ARROW_GRAVITY = 5.5; // gentler than the real thing, so a full draw flies near flat to 40 m
  const step = new THREE.Vector3();
  const look = new THREE.Vector3();
  function updateArrows(dt) {
    for (const a of combat.arrows) {
      if (a.flying) {
        const sub = 4;
        for (let s = 0; s < sub && a.flying; s++) {
          const h = dt / sub;
          a.vel.y -= ARROW_GRAVITY * h;
          step.copy(a.vel).multiplyScalar(h);
          a.pos.add(step);
          a.age += h;
          const head = a.pos.clone().addScaledVector(a.vel.clone().normalize(), 0.4);
          // the tiger
          const t = combat.tiger;
          if (t && !t.dead) {
            const hit = hitTiger(head, 0.04);
            if (hit) {
              a.flying = false;
              a.stuck = { beast: t, bone: hit.bone, local: hit.bone.worldToLocal(a.pos.clone()), dir: a.vel.clone().normalize() };
              a.localQ = hit.bone.getWorldQuaternion(new THREE.Quaternion()).invert();
              combat.stats.hit++;
              hurtTiger(t, (hit.head ? 95 : 42) * (0.55 + 0.45 * a.power), a.vel, hit.head);
              if (D.audio) D.audio.arrowHit(true);
              if (D.ui) D.ui.hitMarker(hit.head);
              continue;
            }
          }
          // the bear, on the second night (chapter2.js drives it): a hit turns it away
          const bear = combat.bear;
          if (bear && bear.raid && bear.group.visible && !bear.dead) {
            const bx = head.x - bear.x;
            const bz = head.z - bear.z;
            const fwd = bx * Math.sin(bear.h) + bz * Math.cos(bear.h);
            const side = bx * Math.cos(bear.h) - bz * Math.sin(bear.h);
            const up = head.y - bear.y;
            if ((fwd / 1.25) ** 2 + (side / 0.62) ** 2 < 1 && up > 0.15 && up < 1.6) {
              a.flying = false;
              a.stuck = { ground: true };
              a.pos.y = T.height(a.pos.x, a.pos.z) + 0.1;
              combat.stats.hit++;
              if (D.audio) D.audio.arrowHit(true);
              if (D.ui) D.ui.hitMarker(fwd > 0.7);
              if (combat.onBearHit) combat.onBearHit(bear, (fwd > 0.7 ? 80 : 45) * (0.55 + 0.45 * a.power));
              continue;
            }
          }
          // whatever else has asked to be hit
          if (combat.arrowTargets.some((fn) => fn(head, a))) {
            a.flying = false;
            a.stuck = a.stuck || { ground: true };
            continue;
          }
          // the ground, trees, rock
          const ground = T.height(head.x, head.z);
          const tree = D.flora.trunkHit(head.x, head.y, head.z);
          const rock = D.cave && D.cave.sdf(head.x, head.y, head.z) < 0;
          if (head.y < ground || tree || rock || a.age > 6) {
            a.flying = false;
            a.stuck = { ground: true };
            if (a.rope && D.east) D.east.ropeMissed(a);
            if (head.y < ground) a.pos.y = ground - 0.05 + (a.pos.y - head.y);
            if (D.audio) D.audio.arrowHit(false);
          }
        }
        a.mesh.position.copy(a.pos);
        look.copy(a.pos).add(a.vel);
        a.mesh.lookAt(look);
      } else if (a.stuck && a.stuck.beast) {
        // riding along in the tiger
        const bone = a.stuck.bone;
        a.mesh.position.copy(bone.localToWorld(a.stuck.local.clone()));
        const q = bone.getWorldQuaternion(new THREE.Quaternion()).multiply(a.localQ || new THREE.Quaternion());
        a.mesh.quaternion.copy(q.multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.stuck.dir)));
      }
    }
  }

  // An arrow on the ground or in a tree, near enough to pick up; or the arrows in the dead tiger.
  combat.target = (x, z) => {
    for (const a of combat.arrows) {
      if (a.flying || !a.stuck || a.stuck.beast || a.taken) continue;
      if (Math.hypot(a.pos.x - x, a.pos.z - z) < 1.8) {
        return { x: a.pos.x, z: a.pos.z, label: 'Pick up arrow', act: () => {
          a.taken = true;
          D.scene.remove(a.mesh);
          D.items.add('arrow', 1);
          if (D.audio) D.audio.pickup();
        } };
      }
    }
    const t = combat.tiger;
    if (t && t.dead) {
      const inIt = combat.arrows.filter((a) => a.stuck && a.stuck.beast === t && !a.taken);
      if (inIt.length && Math.hypot(t.x - x, t.z - z) < 2.8) {
        return { x: t.x, z: t.z, label: `Pull out your arrows (${inIt.length})`, act: () => {
          for (const a of inIt) {
            a.taken = true;
            D.scene.remove(a.mesh);
          }
          D.items.add('arrow', inIt.length);
        } };
      }
    }
    return null;
  };

  // ---------- The spear (Chapter 3) ----------

  let spear = null;
  function spearModel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0xd2b48a), roughness: 0.85 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 2.1, 7), wood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), new THREE.MeshStandardMaterial({ color: D.col(0x3a3f48), roughness: 0.35 }));
    tip.position.y = 1.15;
    const lash = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 7), new THREE.MeshStandardMaterial({ color: D.col(0x6f8a48), roughness: 0.85 }));
    lash.position.y = 1.02;
    g.add(shaft, tip, lash);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  combat.spearModel = spearModel;
  combat.showSpear = (on) => {
    if (on && !spear) {
      spear = spearModel();
      // along the forearm, point forward
      spear.position.set(0, 0.06, 0.02);
      spear.rotation.set(Math.PI / 2, 0, 0);
      D.hero.attach('spear', spear, 'handR');
    }
    if (spear) spear.visible = !!on;
  };
  let jab = null;
  function updateSpear() {
    const h = D.hero;
    const input = D.input;
    const can = D.state.mode === 'play' && !D.state.panel && h.control && !h.dead && h.knock <= 0;
    if (can && h.weapon === 'spear' && !h.action && input.clicked.has(0) && D.items.has('spear')) {
      if (h.useStamina(6 / ((h.stats.strength || 1)))) {
        if (h.startAction('Jab', 0.55, { pose: 'jab', fixed: true })) {
          h.action.face = h.yaw;
          jab = { hit: false };
          if (D.audio) D.audio.swish && D.audio.swish();
        }
      } else if (D.ui) D.ui.toast('Too tired', true);
    }
    if (jab && h.action && h.action.name === 'Jab' && !jab.hit && h.action.t > 0.22) {
      jab.hit = true;
      const dir = new THREE.Vector3(Math.sin(h.facing), 0, Math.cos(h.facing));
      const point = h.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(dir, 1.9);
      const damage = 34 * (h.stats.strength || 1);
      const hit = combat.meleeTargets.some((fn) => fn(point, dir, damage));
      if (hit) {
        D.env.shake = Math.max(D.env.shake, 0.2);
        if (D.audio) D.audio.arrowHit(true);
        if (D.ui) D.ui.hitMarker(false);
      }
    }
    if (!h.action || h.action.name !== 'Jab') jab = null;
  }

  function updateShooting(dt) {
    const h = D.hero;
    const input = D.input;
    const can = D.state.mode === 'play' && !D.state.panel && h.control && !h.dead && h.knock <= 0 && !h.action;
    const armed = can && h.weapon === 'bow' && D.items.has('bow');
    h.aiming = armed && (input.buttons & 4 || input.buttons & 1) > 0;
    if (armed && input.buttons & 1 && D.items.has('arrow')) {
      if (h.draw === 0 && D.audio) D.audio.bowDraw();
      h.draw = Math.min(1, h.draw + dt / 0.85);
      if (h.draw >= 1) {
        h.stats.stamina = Math.max(0, h.stats.stamina - dt * h.STAMINA.bow);
        h.staminaRest = 0;
        if (h.stats.stamina <= 0) {
          // the arm shakes and gives out: the arrow is let down, not loosed
          h.draw = 0.5;
        }
      }
    } else {
      if (armed && input.unclicked.has(0) && h.draw > 0.22) shoot(h.draw);
      h.draw = Math.max(0, h.draw - dt * 4);
      if (!armed) h.draw = 0;
    }
    if (armed && input.clicked.has(0) && !D.items.has('arrow') && D.ui) D.ui.toast('No arrows', true);
  }

  // ---------- Beasts ----------

  function boneNamed(root, pattern) {
    let found = null;
    root.traverse((o) => { if (!found && o.isBone && pattern.test(o.name)) found = o; });
    return found;
  }
  const GAIT_LEGS = {
    bear: [
      ['front_thighL', 'front_shinL', 'front_footL', 'front_toeL', 1, 1], ['front_thighR', 'front_shinR', 'front_footR', 'front_toeR', -1, 1],
      ['thighL', 'shinL', 'footL', 'toeL', 1, -1], ['thighR', 'shinR', 'footR', 'toeR', -1, -1],
    ],
    tiger: [
      ['Bip01_L_UpperArm', 'Bip01_L_Forearm', 'Bip01_L_Hand', 'Bip01_L_Finger0', 1, 1], ['Bip01_R_UpperArm', 'Bip01_R_Forearm', 'Bip01_R_Hand', 'Bip01_R_Finger0', -1, 1],
      ['Bip01_L_Thigh', 'Bip01_L_Calf', 'Bip01_L_HorseLink', 'Bip01_L_Foot', 1, -1], ['Bip01_R_Thigh', 'Bip01_R_Calf', 'Bip01_R_HorseLink', 'Bip01_R_Foot', -1, -1],
    ],
  };
  const TWITCH = {
    bear: [/^front_thighL/, /^front_thighR/, /^thighL/, /^thighR/, /^front_shinL/, /^shinR/, /^spine010/],
    tiger: [/^Bip01_L_UpperArm/, /^Bip01_R_UpperArm/, /^Bip01_L_Thigh/, /^Bip01_R_Thigh/, /^Bip01_L_Calf/, /^Bip01_Tail/, /^Bip01_Neck/],
  };
  const SPECIES = {
    tiger: { health: 150, walk: 1.6, run: 12.5, turn: 3.4, girth: 0.52, half: 1.35, damage: 26, reach: 3.0, scale: 1.3 },
    bear: { health: 300, walk: 1.2, run: 8, turn: 2.2, girth: 0.55, half: 1.0, damage: 24, reach: 2.4 },
  };

  // Two-bone reaching (from Car Drive): swings `bone` so it points from its joint toward its
  // `child` joint along `dir`, by `weight` of the way from where the animation has it.
  const aimFromV = new THREE.Vector3();
  const aimToV = new THREE.Vector3();
  const aimWant = new THREE.Vector3();
  const frameQ = new THREE.Quaternion();
  const jointTurn = new THREE.Quaternion();
  const jointParentQ = new THREE.Quaternion();
  const jointQ = new THREE.Quaternion();
  function aimTowards(bone, child, frame, dir, weight) {
    if (!bone || !child || weight <= 0) return;
    bone.getWorldPosition(aimFromV);
    child.getWorldPosition(aimToV);
    aimToV.sub(aimFromV).normalize();
    frame.getWorldQuaternion(frameQ);
    aimWant.copy(dir).applyQuaternion(frameQ);
    if (weight < 1) aimWant.lerp(aimToV, 1 - weight).normalize();
    jointTurn.setFromUnitVectors(aimToV, aimWant);
    // (a rig's joints can be a little skewed, so the rotation read back from a world matrix is
    // not quite of unit length: kept unnormalised, that creeps into the bone as scale)
    bone.parent.getWorldQuaternion(jointParentQ).normalize();
    jointQ.copy(jointParentQ).multiply(bone.quaternion).premultiply(jointTurn);
    bone.quaternion.copy(jointParentQ.invert()).multiply(jointQ).normalize();
  }
  const reachRoot = new THREE.Vector3();
  const reachMid = new THREE.Vector3();
  const reachEnd = new THREE.Vector3();
  const reachLine = new THREE.Vector3();
  const reachBend = new THREE.Vector3();
  const reachGoal = new THREE.Vector3();
  const reachDir = new THREE.Vector3();
  function reachFor(upper, mid, end, target, pole, weight = 1) {
    if (!upper || !mid || !end || weight <= 0) return;
    upper.getWorldPosition(reachRoot);
    mid.getWorldPosition(reachMid);
    end.getWorldPosition(reachEnd);
    const l1 = reachRoot.distanceTo(reachMid);
    const l2 = reachMid.distanceTo(reachEnd);
    reachLine.copy(target).sub(reachRoot);
    const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, reachLine.length()));
    reachLine.normalize();
    const along = (l1 * l1 + d * d - l2 * l2) / (2 * d);
    const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    reachBend.copy(pole).addScaledVector(reachLine, -pole.dot(reachLine));
    if (reachBend.lengthSq() < 1e-8) reachBend.set(0, 1, 0);
    reachBend.normalize();
    reachGoal.copy(reachRoot).addScaledVector(reachLine, d);
    reachDir.copy(reachLine).multiplyScalar(along).addScaledVector(reachBend, out).normalize();
    aimTowards(upper, mid, D.scene, reachDir, weight);
    mid.getWorldPosition(reachMid);
    reachDir.copy(reachGoal).sub(reachMid).normalize();
    aimTowards(mid, end, D.scene, reachDir, weight);
  }

  function makeBeast(species, x, z) {
    const sp = SPECIES[species];
    const template = D.models.list[species];
    if (!template) return null;
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const tilt = new THREE.Group();
    const body = THREE.SkeletonUtils.clone(template.root);
    body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    if (sp.scale) body.scale.multiplyScalar(sp.scale);
    tilt.add(body);
    group.add(tilt);
    D.scene.add(group);
    const b = {
      species, sp, group, tilt, body, x, z, y: T.height(x, z), h: 0, speed: 0, goal: 0,
      health: sp.health, state: 'rest', timer: 0, tx: x, tz: z, home: { x, z }, dodge: 0, stuck: 0,
      attackT: 0, roarT: rand(8, 20), dead: null, phase: 0, low: 0, rest: 1, hurt: 0, lunge: 0,
    };
    if (template.animations.length) {
      b.mixer = new THREE.AnimationMixer(body);
      b.actions = {};
      for (const clip of template.animations) {
        const action = b.mixer.clipAction(clip);
        action.play();
        action.setEffectiveWeight(0);
        b.actions[clip.name] = action;
      }
    }
    if (GAIT_LEGS[species]) {
      body.updateMatrixWorld(true);
      const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
      b.legs = GAIT_LEGS[species].map(([u, m, e, s, side, front]) => {
        const leg = { upper: boneNamed(body, new RegExp(`^${u}`)), mid: boneNamed(body, new RegExp(`^${m}`)), end: boneNamed(body, new RegExp(`^${e}`)), sole: boneNamed(body, new RegExp(`^${s}`)), side, front };
        if (!leg.upper || !leg.mid || !leg.end || !leg.sole) return null;
        leg.rest = leg.end.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
        leg.lift = leg.rest.y - leg.sole.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).y;
        return leg;
      });
      if (b.legs.some((leg) => !leg)) b.legs = null;
      else {
        // the bones the stepping turns, each with what the animation last gave it
        b.legBones = [...new Set(b.legs.flatMap((leg) => [leg.upper, leg.mid, leg.end]))].map((bone) => ({ bone, base: bone.quaternion.clone(), out: null }));
        for (const front of [1, -1]) {
          const pair = b.legs.filter((leg) => leg.front === front);
          const x0 = (Math.abs(pair[0].rest.x) + Math.abs(pair[1].rest.x)) / 2;
          const z0 = (pair[0].rest.z + pair[1].rest.z) / 2;
          for (const leg of pair) leg.rest.set(leg.side * x0, 0, z0);
        }
      }
    }
    b.twitch = TWITCH[species].map((p) => boneNamed(body, p)).filter(Boolean);
    if (species === 'tiger') {
      b.hitBones = [
        { bone: boneNamed(body, /^Bip01_Head/), r: 0.24, head: true },
        { bone: boneNamed(body, /^Bip01_Neck/), r: 0.26 },
        { bone: boneNamed(body, /^Bip01_Spine2/), r: 0.36 },
        { bone: boneNamed(body, /^Bip01_Spine1/), r: 0.36 },
        { bone: boneNamed(body, /^Bip01_Spine_/) || boneNamed(body, /^Bip01_Spine/), r: 0.36 },
        { bone: boneNamed(body, /^Bip01_Pelvis/), r: 0.34 },
      ].filter((e) => e.bone);
    }
    return b;
  }

  const hitAt = new THREE.Vector3();
  // Is p within `pad` of the tiger's body? Returns { bone, head }.
  function hitTiger(p, pad) {
    const t = combat.tiger;
    if (!t || !t.hitBones) return null;
    if (Math.abs(p.x - t.x) > 3 || Math.abs(p.z - t.z) > 3) return null;
    for (const e of t.hitBones) {
      e.bone.getWorldPosition(hitAt);
      if (hitAt.distanceToSquared(p) < (e.r + pad) ** 2) return e;
    }
    return null;
  }

  // ---------- The tiger ----------

  function hurtTiger(t, damage, vel, head) {
    if (t.dead) return;
    t.health -= damage;
    t.hurt = 4;
    t.flinch = 0.5;
    D.env.shake = Math.max(D.env.shake, 0.25);
    if (t.health <= 0) {
      killBeast(t, vel.x, vel.z);
      if (D.story) D.story.on('tigerDown');
      return;
    }
    if (D.audio) D.audio.roar('tiger', Math.hypot(t.x - D.hero.pos.x, t.z - D.hero.pos.z), 1.1);
    // wounded, it comes for you
    t.state = 'charge';
    t.timer = 7;
    if (t.health < SPECIES.tiger.health * 0.35) t.limp = 1;
    if (D.story) D.story.on('tigerHit', { head, left: t.health });
  }

  function killBeast(b, dx, dz) {
    const side = (dx * Math.cos(b.h) - dz * Math.sin(b.h)) > 0 ? 1 : -1;
    b.dead = { t: 0, side, base: b.twitch.map((bone) => bone.quaternion.clone()), seeds: b.twitch.map(() => [rand(9, 16), rand(0, 6), rand(0.4, 1)]) };
    b.speed = 0;
    if (D.audio) D.audio.roar(b.species, 6, 0.7);
  }

  // How the tiger thinks. It lives in the gorge and guards it.
  //   rest: lying at its den; alert: up, facing you, growling; charge: at you; retreat: back
  //   to the den; prowl: pacing the gorge
  combat.tigerAwake = false; // before the story sends you north it only watches
  function thinkTiger(t, dt) {
    const h = D.hero;
    const dx = h.pos.x - t.x;
    const dz = h.pos.z - t.z;
    const dist = Math.hypot(dx, dz) || 1;
    const fromDen = Math.hypot(h.pos.x - L.den.x, h.pos.z - L.den.z);
    const tigerFromDen = Math.hypot(t.x - L.den.x, t.z - L.den.z);
    const sp = t.sp;
    t.timer -= dt;
    t.attackT = Math.max(0, t.attackT - dt);
    t.roarT -= dt;
    t.hurt = Math.max(0, t.hurt - dt);
    const heroThere = !h.dead && D.state.mode === 'play' && h.pos.y - T.height(h.pos.x, h.pos.z) < 3;
    const speedLimp = t.limp ? 0.75 : 1;
    switch (t.state) {
      case 'rest':
      case 'prowl':
        t.goal = t.state === 'prowl' ? sp.walk : 0;
        if (t.state === 'prowl' && Math.hypot(t.tx - t.x, t.tz - t.z) < 1.5) {
          t.state = 'rest';
          t.timer = rand(6, 14);
        }
        if (t.state === 'rest' && t.timer <= 0) {
          t.state = 'prowl';
          const a = rand(0, Math.PI * 2);
          t.tx = L.den.x + Math.cos(a) * 3;
          t.tz = L.den.z + Math.sin(a) * 9;
        }
        if (heroThere && fromDen < 44 && (combat.tigerAwake || fromDen < 34)) {
          t.state = 'alert';
          t.timer = rand(2.8, 4.2); // it warns you once; linger and it comes
          if (D.audio) D.audio.roar('tiger', dist, 0.7);
          if (D.story) D.story.on('tigerAlert');
        }
        break;
      case 'alert':
        // up, side-on, watching; a growl now and then; close in and it comes
        t.goal = 0;
        t.tx = h.pos.x;
        t.tz = h.pos.z;
        if (t.roarT <= 0) {
          t.roarT = rand(3, 6);
          if (D.audio) D.audio.roar('tiger', dist, 0.6);
        }
        if (!heroThere || fromDen > 55) {
          t.state = 'retreat';
        } else if (dist < 16 || (fromDen < 30 && t.timer <= 0)) {
          t.state = 'charge';
          t.timer = 8;
          if (D.audio) D.audio.roar('tiger', dist, 1.2);
          if (D.story) D.story.on('tigerCharge');
        }
        break;
      case 'charge':
        t.tx = h.pos.x;
        t.tz = h.pos.z;
        t.goal = (dist > 6 ? sp.run : sp.run * 0.7) * speedLimp;
        if (dist < sp.reach && t.attackT <= 0 && heroThere) {
          t.attackT = 1.6;
          t.lunge = 0.45;
          if (D.audio) D.audio.roar('tiger', dist, 0.9);
          if (D.audio) D.audio.maul();
          let dmg = sp.damage * rand(0.85, 1.15);
          // the first time, it only means to drive him off
          if (D.story && D.story.firstMauling()) dmg = Math.min(dmg, Math.max(0, h.stats.health - 30));
          h.hurt(dmg, 'Mauled by the tiger', dx / dist, dz / dist, 1.6);
          t.mauled = (t.mauled || 0) + 1;
          if (D.story) D.story.on('mauled');
          // one blow, then it falls back to its den
          t.state = 'retreat';
          t.timer = 0;
        }
        if (t.timer <= 0 || !heroThere || tigerFromDen > 48) t.state = 'retreat';
        break;
      case 'retreat':
        t.tx = L.den.x;
        t.tz = L.den.z;
        t.goal = sp.walk * 2.2;
        if (tigerFromDen < 2.5) {
          t.state = 'rest';
          t.timer = rand(4, 8);
        }
        // a wounded tiger turns again quickly
        if (t.hurt > 0 && dist < 22 && heroThere && t.attackT <= 0) {
          t.state = 'charge';
          t.timer = 6;
        }
        break;
    }
  }

  function moveBeast(b, dt) {
    const sp = b.sp;
    let want = Math.atan2(b.tx - b.x, b.tz - b.z);
    const left = Math.hypot(b.tx - b.x, b.tz - b.z);
    let goal = left < 1.2 && b.state !== 'charge' ? 0 : b.goal;
    if (b.state === 'alert') {
      // side-on to you, shifting
      want = Math.atan2(D.hero.pos.x - b.x, D.hero.pos.z - b.z);
      goal = 0;
    }
    if (b.dodge) want += b.dodge * 1.1;
    b.h += clamp(wrapAngle(want - b.h), -sp.turn * dt, sp.turn * dt);
    b.speed = approach(b.speed, goal, (goal > b.speed ? 9 : 12) * dt);
    if (b.lunge > 0) {
      b.lunge -= dt;
      b.speed = Math.max(b.speed, sp.run * 0.6);
    }
    let px = b.x + Math.sin(b.h) * b.speed * dt;
    let pz = b.z + Math.cos(b.h) * b.speed * dt;
    const probe = { x: px, y: b.y, z: pz };
    D.flora.collide(probe, sp.girth);
    D.statues.collide(probe, sp.girth);
    if (D.shelter && D.shelter.collide) D.shelter.collide(probe, sp.girth);
    // it does not climb the cliffs either
    const n = T.normal(probe.x, probe.z);
    if (n.y < 0.62 && T.height(probe.x, probe.z) > b.y + 0.2) {
      probe.x = b.x;
      probe.z = b.z;
    }
    const blocked = Math.hypot(probe.x - px, probe.z - pz) > 0.02;
    if (blocked && b.speed > 0.3) {
      b.stuck += dt;
      if (b.stuck > 0.4 && !b.dodge) b.dodge = Math.random() < 0.5 ? 1 : -1;
    } else {
      b.stuck = Math.max(0, b.stuck - dt);
      if (b.stuck <= 0) b.dodge = 0;
    }
    px = probe.x;
    pz = probe.z;
    b.x = px;
    b.z = pz;
    b.y = T.height(b.x, b.z);
    b.group.position.set(b.x, b.y, b.z);
    b.group.rotation.y = b.h;
    const ahead = T.height(b.x + Math.sin(b.h) * sp.half, b.z + Math.cos(b.h) * sp.half) - T.height(b.x - Math.sin(b.h) * sp.half, b.z - Math.cos(b.h) * sp.half);
    b.tilt.rotation.x = -Math.atan2(ahead, sp.half * 2) * 0.8;
  }

  const gaitTarget = new THREE.Vector3();
  const gaitPole = new THREE.Vector3();
  const gaitDown = new THREE.Vector3();
  function animateBeast(b, dt) {
    const sp = b.sp;
    // lying at rest: the body low on the ground, legs folded under
    b.rest = approach(b.rest, b.state === 'rest' && b.speed < 0.1 ? 1 : 0, dt * 1.5);
    b.low = approach(b.low, b.state === 'alert' ? 1 : 0, dt * 3);
    b.body.position.y = (-0.38 * smooth(b.rest) - 0.1 * b.low) * (sp.scale || 1);
    if (b.mixer) {
      const a = b.actions;
      if (b.species === 'tiger' && a.run) {
        const run = smooth((b.speed - 4) / 3);
        a.run.setEffectiveWeight(run);
        a.run.timeScale = clamp(b.speed / 11, 0.6, 1.5);
      } else if (b.species === 'bear' && a.roar) {
        b.roaring = Math.max(0, (b.roaring || 0) - dt);
        a.roar.setEffectiveWeight(b.roaring > 0 ? 1 : 0);
      }
      b.mixer.update(dt);
    }
    // Each frame the legs reach from the animation's pose, never from last frame's reaching:
    // the mixer only writes a bone when its value changes, and reaching again and again from its
    // own result let the error pile up until, after a few minutes, a paw was kilometres away
    // (a giant smear of tiger across the sky)
    if (b.legBones) {
      for (const entry of b.legBones) {
        if (entry.out && entry.bone.quaternion.equals(entry.out)) entry.bone.quaternion.copy(entry.base);
        else entry.base.copy(entry.bone.quaternion);
      }
    }
    const stepping = b.legs && !(b.species === 'tiger' && b.speed > 5.5);
    const keep = () => {
      for (const entry of b.legBones) (entry.out || (entry.out = new THREE.Quaternion())).copy(entry.bone.quaternion);
    };
    if (!stepping) {
      if (b.legBones) keep();
      return;
    }
    const trot = b.speed > sp.walk * 1.8;
    const cycle = Math.min(trot ? 2.6 : 1.5, 0.7 + b.speed * (trot ? 0.36 : 0.6));
    const duty = trot ? 0.48 : 0.66;
    b.phase = (b.phase + (b.speed / cycle) * dt) % 1;
    const moving = smooth(b.speed / 0.35);
    b.body.position.y += b.speed > 0.1 ? -0.025 * Math.cos(b.phase * Math.PI * 4) : 0;
    b.group.updateMatrixWorld(true);
    const offsets = trot ? [0, 0.5, 0.5, 0] : [0.25, 0.75, 0, 0.5];
    const fold = smooth(b.rest);
    b.legs.forEach((leg, i) => {
      const phase = (b.phase + offsets[i]) % 1;
      const reach = cycle * duty * moving;
      let along;
      let lift = 0;
      if (phase < duty) along = reach * (0.5 - phase / duty);
      else {
        const t = (phase - duty) / (1 - duty);
        along = reach * (-0.5 + t);
        lift = Math.sin(t * Math.PI) * Math.min(0.16, 0.05 + b.speed * 0.03) * moving;
      }
      // folded: paws drawn in under the body, forelegs stretched out in front
      gaitTarget.set(leg.rest.x * (1 + 0.3 * fold), 0, leg.rest.z + along + (leg.front > 0 ? 0.32 : -0.05) * fold);
      b.group.localToWorld(gaitTarget);
      gaitTarget.y = T.height(gaitTarget.x, gaitTarget.z) + leg.lift + lift * (sp.scale || 1);
      gaitPole.set(Math.sin(b.h) * leg.front * -1, 0.2, Math.cos(b.h) * leg.front * -1);
      reachFor(leg.upper, leg.mid, leg.end, gaitTarget, gaitPole, 1);
      gaitDown.set(Math.sin(b.h) * 0.35, -1, Math.cos(b.h) * 0.35).normalize();
      aimTowards(leg.end, leg.sole, D.scene, gaitDown, 0.85);
    });
    keep();
  }

  const twitchQ = new THREE.Quaternion();
  const twitchAxis = new THREE.Vector3(1, 0, 0);
  function updateDeadBeast(b, dt) {
    const d = b.dead;
    d.t += dt;
    const roll = Math.min(1, d.t / 0.6) ** 2 * 1.42;
    const pivot = b.sp.girth * 1.05 * d.side;
    b.tilt.position.set(pivot, 0, 0);
    b.body.position.set(-pivot, 0, 0);
    b.tilt.rotation.set(0, 0, -d.side * roll);
    b.group.position.set(b.x, T.height(b.x, b.z) + Math.sin(roll) * 0.02, b.z);
    b.group.rotation.set(0, b.h, 0);
    if (b.mixer) b.mixer.update(0);
    if (d.t > 3.6) return;
    const u = Math.max(0, (d.t - 0.45) / 3);
    const strength = u <= 0 ? 0 : (1 - u) ** 1.6;
    b.twitch.forEach((bone, i) => {
      const [speed, offset, size] = d.seeds[i];
      const kick = Math.max(0, Math.sin(d.t * speed + offset)) ** 3 * Math.sin(d.t * speed * 0.37 + offset * 2);
      twitchQ.setFromAxisAngle(twitchAxis, kick * 0.7 * size * strength);
      bone.quaternion.copy(d.base[i]).multiply(twitchQ);
    });
  }

  // You cannot walk through the tiger (or the bear).
  combat.collide = (pos, r) => {
    for (const b of [combat.tiger, combat.bear]) {
      if (!b || !b.group.visible) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      const d = Math.hypot(dx, dz);
      const min = b.sp.girth + r + 0.25;
      if (d > 0.01 && d < min && Math.abs(pos.y - b.y) < 1.4) {
        pos.x = b.x + (dx / d) * min;
        pos.z = b.z + (dz / d) * min;
      }
    }
  };

  // ---------- The bear, at night ----------

  // It comes out of the dark to the foot of the Elder Tree, smells the shelter, roars up at
  // it, and wanders off: the shelter is out of its reach. (The story drives it.)
  combat.bearVisit = (on, from = null, to = null) => {
    if (!combat.bear) combat.bear = makeBeast('bear', L.tree.x + 30, L.tree.z - 25);
    const b = combat.bear;
    if (!b) return;
    b.visit = on ? { t: 0, to } : null;
    b.group.visible = on;
    b.state = 'prowl';
    b.x = from ? from.x : L.tree.x + 16;
    b.z = from ? from.z : L.tree.z + 12;
    b.h = Math.atan2((to ? to.x : L.tree.x) - b.x, (to ? to.z : L.tree.z) - b.z);
  };
  function updateBear(dt) {
    const b = combat.bear;
    if (!b || !b.visit) return;
    const v = b.visit;
    v.t += dt;
    const tree = D.shelter ? D.shelter.base : { x: L.tree.x, z: L.tree.z };
    if (v.t < 9) {
      b.tx = v.to ? v.to.x : tree.x + 2.5;
      b.tz = v.to ? v.to.z : tree.z + 3.5;
      b.goal = b.sp.walk * 1.5;
    } else if (v.t < 15) {
      b.goal = 0;
      b.tx = tree.x;
      b.tz = tree.z;
      if (!v.roared && v.t > 10.5) {
        v.roared = true;
        b.roaring = 3;
        if (D.audio) D.audio.roar('bear', 12, 1.2);
      }
    } else {
      b.tx = tree.x - 40;
      b.tz = tree.z - 30;
      b.goal = b.sp.walk * 1.6;
      if (v.t > 34) {
        b.visit = null;
        b.group.visible = false;
      }
    }
    moveBeast(b, dt);
    animateBeast(b, dt);
  }

  // ---------- Building and each frame ----------

  combat.build = () => {
    buildBow();
    combat.tiger = makeBeast('tiger', L.den.x, L.den.z);
    if (combat.tiger) {
      combat.tiger.h = Math.PI; // facing south, the way you come
      combat.tiger.state = 'rest';
      combat.tiger.timer = 5;
    }
    D.flora.reserved.push([L.den.x, L.den.z, 4]);
  };

  combat.resetTiger = (alive = true) => {
    const t = combat.tiger;
    if (!t) return;
    for (const a of combat.arrows) if (a.stuck && a.stuck.beast === t) {
      D.scene.remove(a.mesh);
      a.taken = true;
    }
    if (alive) {
      t.dead = null;
      t.health = t.sp.health;
      t.limp = 0;
      t.x = L.den.x;
      t.z = L.den.z;
      t.h = Math.PI;
      t.state = 'rest';
      t.timer = 6;
      t.speed = 0;
      t.tilt.position.set(0, 0, 0);
      t.tilt.rotation.set(0, 0, 0);
      t.body.position.set(0, 0, 0);
      t.group.visible = true;
    } else if (!t.dead) {
      t.dead = { t: 10, side: 1, base: t.twitch.map((bone) => bone.quaternion.clone()), seeds: t.twitch.map(() => [1, 1, 0]) };
    }
  };

  // ---------- For Chapter 2's night ----------

  combat.getBear = () => combat.bear || (combat.bear = makeBeast('bear', L.tree.x + 30, L.tree.z - 25));
  combat.moveBeast = (b, dt) => moveBeast(b, dt);
  combat.animateBeast = (b, dt) => animateBeast(b, dt);

  // ---------- Saving ----------

  // Arrows lying about (in the ground, in a tree) are kept where they are; any still in a beast
  // are counted, and given back to the quiver when the game is loaded.
  combat.saveArrows = () => ({
    lying: combat.arrows.filter((a) => !a.flying && a.stuck && a.stuck.ground && !a.taken)
      .map((a) => [a.pos.x, a.pos.y, a.pos.z, ...a.mesh.quaternion.toArray()].map((v) => +v.toFixed(3))),
    inBeasts: combat.arrows.filter((a) => a.stuck && a.stuck.beast && !a.taken).length,
  });
  combat.loadArrows = (s) => {
    for (const a of combat.arrows) {
      if (a.stuck && a.stuck.beast) continue; // resetTiger sees to these
      D.scene.remove(a.mesh);
      a.taken = true;
    }
    combat.arrows = combat.arrows.filter((a) => !a.taken);
    for (const [x, y, z, qx, qy, qz, qw] of (s && s.lying) || []) {
      const mesh = arrowMesh();
      mesh.position.set(x, y, z);
      mesh.quaternion.set(qx, qy, qz, qw);
      D.scene.add(mesh);
      combat.arrows.push({ mesh, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), flying: false, age: 0, power: 0, stuck: { ground: true } });
    }
    if (s && s.inBeasts) D.items.add('arrow', s.inBeasts, true);
  };

  combat.update = (dt) => {
    if (!combat.tiger && !bow.group) return;
    updateShooting(dt);
    updateSpear();
    placeBow();
    updateArrows(dt);
    const t = combat.tiger;
    if (t) {
      const near = Math.hypot(t.x - D.camera.position.x, t.z - D.camera.position.z) < 160;
      t.group.visible = near;
      if (t.dead) updateDeadBeast(t, dt);
      else if (near && dt > 0) {
        if (D.state.mode === 'play' || t.scripted) thinkTiger(t, dt);
        moveBeast(t, dt);
        animateBeast(t, dt);
      }
    }
    if (dt > 0) updateBear(dt);
    // the bear, dead (Chapter 3): it falls, and lies there
    if (combat.bear && combat.bear.dead && combat.bear.group.visible) updateDeadBeast(combat.bear, dt);
  };
  // (for the chapters' scenes)
  combat.kill = (b, dx = 1, dz = 0) => killBeast(b, dx, dz);
  combat.revive = (b) => {
    if (!b) return;
    b.dead = null;
    b.health = b.sp.health;
    b.tilt.position.set(0, 0, 0);
    b.body.position.set(0, 0, 0);
    b.tilt.rotation.set(0, 0, 0);
  };

  D.combat = combat;
})();
