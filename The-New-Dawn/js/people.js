// The New Dawn: the people who wake (Chapters 2 and 3).
//
// A person is a living copy of one of the avatars: a statue that woke (Teo, Mira, Garron) or
// one made for a scene. Each one walks on the clips (idle, walk, run), with a statue pose laid
// over them when sitting, kneeling, working or carrying, and can be told to follow the hero, to
// go somewhere, to sit, or to stand and face something. Stone at first, if it was a statue: the
// same stone, so the moment one becomes the other doesn't show.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, smoothstep, wrapAngle } = D;
  const T = D.terrain;

  const people = { list: [], byId: {} };

  // Poses for living people, beyond the statues' own (statues.js): the same form.
  const MORE_POSES = {
    // bent to the ground, hands busy: digging, shaping clay, gathering
    work: {
      clip: 'idle', t: 0.3, drop: true,
      turns: [['thighL', 'x', -1.2], ['calfL', 'x', 1.9], ['thighR', 'x', -0.35], ['calfR', 'x', 1.6], ['footR', 'x', 0.5],
        ['spine', 'x', 0.45], ['spine1', 'x', 0.3], ['armL', 'x', -1.0], ['foreL', 'x', -0.6], ['armR', 'x', -1.2], ['foreR', 'x', -0.5], ['head', 'x', 0.3]],
    },
    // a pole across the shoulders, a load at each end
    carry: {
      clip: 'walk', t: 0.25,
      turns: [['armL', 'x', -2.4], ['armL', 'z', 0.5], ['foreL', 'x', -1.6], ['armR', 'x', -2.4], ['armR', 'z', -0.5], ['foreR', 'x', -1.6], ['head', 'x', 0.1]],
    },
    // dragging: leaning forward into a rope over the shoulder
    drag: {
      clip: 'walk', t: 0.25,
      turns: [['spine', 'x', 0.35], ['spine1', 'x', 0.2], ['armR', 'x', -2.6], ['armR', 'z', -0.2], ['foreR', 'x', -1.2], ['armL', 'x', -0.6], ['foreL', 'x', -0.9], ['head', 'x', -0.35]],
    },
    // arms folded, weight on one leg
    folded: {
      clip: 'idle', t: 0.5,
      turns: [['armL', 'x', -0.55], ['armL', 'z', -0.25], ['foreL', 'y', -1.6], ['foreL', 'x', -0.6], ['armR', 'x', -0.6], ['armR', 'z', 0.25], ['foreR', 'y', 1.6], ['foreR', 'x', -0.5], ['head', 'x', -0.08]],
    },
    // pointing ahead with the right arm
    point: {
      clip: 'idle', t: 0.4,
      turns: [['armR', 'x', -1.45], ['armR', 'z', -0.1], ['foreR', 'x', -0.1], ['head', 'x', -0.1]],
    },
    // painting: one arm raised to a surface in front, the other holding a pot
    paint: {
      clip: 'idle', t: 0.4,
      turns: [['armR', 'x', -1.6], ['armR', 'z', -0.05], ['foreR', 'x', -0.7], ['armL', 'x', -0.6], ['foreL', 'x', -1.4], ['head', 'x', 0.15]],
    },
    // flat on the back, asleep (the body is laid down by `lie`)
    sleep: { clip: 'idle', t: 0.5, lie: true, turns: [['armL', 'x', -0.2], ['armR', 'x', -0.2], ['head', 'y', 0.4]] },
    // braced, both arms forward: lifting, pushing, fighting
    brace: {
      clip: 'idle', t: 0.35,
      turns: [['thighL', 'x', -0.5], ['calfL', 'x', 0.6], ['thighR', 'x', 0.3], ['spine', 'x', 0.3], ['armL', 'x', -1.4], ['armL', 'z', -0.15], ['foreL', 'x', -0.5], ['armR', 'x', -1.4], ['armR', 'z', 0.15], ['foreR', 'x', -0.5], ['head', 'x', -0.25]],
    },
    // a big man's stance: arms out from the sides, chin up
    stance: {
      clip: 'idle', t: 0.6,
      turns: [['armL', 'z', 0.32], ['armR', 'z', -0.32], ['foreL', 'x', -0.3], ['foreR', 'x', -0.3], ['head', 'x', -0.12], ['spine1', 'x', -0.08]],
    },
    // archer: a bow drawn
    archer: {
      clip: 'idle', t: 0.4,
      turns: [['spine1', 'y', 0.6], ['armL', 'x', -1.55], ['armL', 'z', 0.1], ['armR', 'x', -1.5], ['armR', 'z', -0.2], ['foreR', 'y', 1.9], ['head', 'y', -0.7]],
    },
    // a fighter crouched low, one hand forward
    ninja: {
      clip: 'idle', t: 0.3, drop: true,
      turns: [['thighL', 'x', -1.6], ['calfL', 'x', 1.9], ['thighR', 'x', 0.4], ['calfR', 'x', 1.4], ['spine', 'x', 0.45],
        ['armL', 'x', -1.3], ['foreL', 'x', -0.2], ['armR', 'x', 0.4], ['armR', 'z', -0.4], ['foreR', 'x', -1.0], ['head', 'x', -0.4]],
    },
  };
  const POSES = () => D.statues.POSES;
  for (const [k, v] of Object.entries(MORE_POSES)) if (!D.statues.POSES[k]) D.statues.POSES[k] = v;

  // Sits the person somewhere the clips can't see: how far the body drops for each pose.
  const DROP = { sit: 0.42, kneel: 0.5, drink: 0.45, crouch: 0.55, work: 0.35, sitlean: 0.42, ninja: 0.35 };

  // ---------- Making one ----------

  // opts: { id, name, statue (a statues.list entry) or tpl (an avatar index), x, z, h,
  //         scale (all over), bulk (wider, for a big man), stone (start as stone) }
  people.make = (opts) => {
    if (opts.id && people.byId[opts.id]) return people.byId[opts.id];
    const s = opts.statue || null;
    const tplIndex = (s ? s.spot.tpl : opts.tpl || 0) % D.models.npc.length;
    const tpl = D.models.npc[tplIndex];
    const body = THREE.SkeletonUtils.clone(tpl.scene);
    const uniforms = D.stoneUniforms();
    uniforms.petrify.value = opts.stone === false ? 0 : 1;
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = D.statues.livingMaterial(tplIndex, o.material.name.split('_').pop(), uniforms);
    });
    const mixer = new THREE.AnimationMixer(body);
    const actions = {};
    for (const name of ['idle', 'walk', 'run']) {
      const clip = tpl.clips[name];
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      actions[name] = a;
    }
    // which way the figure faces at rest (from its hips), so it can be turned to face +z
    mixer.update(0);
    body.updateMatrixWorld(true);
    const bone = (key) => body.getObjectByName(D.statues.BONES[key]);
    const left = bone('thighL').getWorldPosition(new THREE.Vector3()).sub(bone('thighR').getWorldPosition(new THREE.Vector3()));
    left.y = 0;
    left.normalize();
    const forward = new THREE.Vector3().crossVectors(left, new THREE.Vector3(0, 1, 0)).normalize();
    const facing0 = Math.atan2(forward.x, forward.z);
    const inner = new THREE.Group();
    inner.rotation.y = -facing0;
    inner.add(body);
    const body2 = new THREE.Group(); // lowered when kneeling or sitting, tipped over to lie down
    body2.add(inner);
    const group = new THREE.Group();
    group.add(body2);
    const scale = opts.scale || 1;
    const bulk = opts.bulk || 1;
    group.scale.set(scale * bulk, scale, scale * bulk);
    D.scene.add(group);
    const bones = {};
    for (const key of Object.keys(D.statues.BONES)) {
      const b = bone(key);
      if (b) bones[key] = { bone: b, base: new THREE.Quaternion(), out: null };
    }
    const x = s ? s.x : opts.x;
    const z = s ? s.z : opts.z;
    const p = {
      id: opts.id || null, name: opts.name || '', group, body2, inner, body, mixer, actions, bones, uniforms, statue: s, tpl: tplIndex, scale,
      x, z, y: T.height(x, z), h: s ? s.h : opts.h || 0, speed: 0, mode: opts.stone === false ? 'idle' : 'stone',
      pose: s ? s.spot.pose : null, poseW: s ? 1 : 0, drop: 0, lie: 0, weights: { idle: 1, walk: 0, run: 0 },
      goal: null, weak: false, slot: 0, props: [], face: null,
    };
    people.list.push(p);
    if (p.id) people.byId[p.id] = p;
    people.place(p);
    return p;
  };
  people.get = (id) => people.byId[id] || null;

  people.place = (p) => {
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.h;
  };

  // Hold something: a mesh fixed to a bone (hand, spine), or to the body.
  people.hold = (p, mesh, boneKey = 'handR', offset = null) => {
    const b = p.bones[boneKey];
    const parent = b ? b.bone : p.body2;
    if (offset) {
      if (offset.pos) mesh.position.copy(offset.pos);
      if (offset.rot) mesh.rotation.copy(offset.rot);
    }
    parent.add(mesh);
    p.props.push(mesh);
    return mesh;
  };
  people.drop = (p) => {
    for (const m of p.props) if (m.parent) m.parent.remove(m);
    p.props = [];
  };

  // ---------- Telling them what to do ----------

  // Sit, kneel, work...: a pose held where they are (or at x, z facing h).
  people.setPose = (p, pose, at = null) => {
    if (at) {
      p.x = at.x;
      p.z = at.z;
      if (at.h !== undefined) p.h = at.h;
      p.y = at.y !== undefined ? at.y : T.height(p.x, p.z);
    }
    p.mode = pose ? 'pose' : 'idle';
    p.pose = pose;
    p.poseW = pose ? 1 : 0;
    p.drop = pose ? DROP[pose] || 0 : 0;
    p.lie = pose && POSES()[pose] && POSES()[pose].lie ? 1 : 0;
    p.speed = 0;
    p.goal = null;
    people.place(p);
  };
  // Walk (or run) to x, z, then call onArrive; `pose` is held while walking (carry, drag).
  people.goTo = (p, x, z, { speed = 1.5, onArrive = null, pose = null, face = null, near = 0.8 } = {}) => {
    p.mode = 'goto';
    p.goal = { x, z, speed, onArrive, near, face };
    p.pose = pose;
    p.poseW = pose ? 1 : 0;
    p.drop = 0;
    p.lie = 0;
  };
  people.follow = (p, slot = 0) => {
    p.mode = 'follow';
    p.slot = slot;
    p.pose = null;
    p.poseW = 0;
    p.drop = 0;
    p.lie = 0;
    p.goal = null;
  };
  // Stand still, turned toward a point (or the hero, if none).
  people.stand = (p, face = null) => {
    p.mode = 'idle';
    p.face = face;
    p.pose = null;
    p.poseW = 0;
    p.drop = 0;
    p.lie = 0;
    p.goal = null;
  };
  people.hide = (p) => {
    p.mode = 'hidden';
    p.group.visible = false;
  };
  people.show = (p) => {
    p.group.visible = true;
    if (p.mode === 'hidden') p.mode = 'idle';
  };
  // Put down somewhere at once (on the ground, unless y is given).
  people.teleport = (p, x, z, h = p.h, y = null) => {
    p.x = x;
    p.z = z;
    p.h = h;
    p.y = y !== null ? y : T.height(x, z);
    people.place(p);
  };
  // The stone gives way (the shader's two uniforms; the waking scenes drive them).
  people.alive = (p) => {
    p.uniforms.petrify.value = 0;
    p.uniforms.crack.value = 0;
    if (p.statue) D.statues.wake(p.statue);
    p.group.visible = true;
    if (p.mode === 'stone' || p.mode === 'waking') p.mode = 'idle';
  };

  // ---------- Each frame ----------

  const pQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();
  const axisV = new THREE.Vector3();

  // The clips (frozen at the pose's moment while stone), then the pose's turns on top.
  people.pose = (p, dt) => {
    const P = POSES()[p.pose];
    if (p.mode === 'stone' || p.mode === 'waking') {
      for (const [name, a] of Object.entries(p.actions)) a.setEffectiveWeight(P && name === P.clip ? 1 : 0);
      const a = P && p.actions[P.clip];
      if (a) a.time = P.t * a.getClip().duration;
      p.mixer.update(0);
    } else {
      const run = clamp((p.speed - 2.2) / 2.2, 0, 1);
      const moving = p.speed >= 0.15;
      // a held pose that is not for walking freezes the clips at its moment
      const still = P && !moving && p.poseW > 0.5;
      const goal = still ? { idle: P.clip === 'idle' ? 1 : 0, walk: P.clip === 'walk' ? 1 : 0, run: P.clip === 'run' ? 1 : 0 }
        : { idle: moving ? 0 : 1, walk: moving ? 1 - run : 0, run: moving ? run : 0 };
      const fade = Math.min(1, dt * 8);
      for (const name of ['idle', 'walk', 'run']) {
        if (!p.actions[name]) continue;
        p.weights[name] += (goal[name] - p.weights[name]) * fade;
        p.actions[name].setEffectiveWeight(p.weights[name]);
      }
      if (p.actions.walk) p.actions.walk.timeScale = clamp(p.speed / 1.4, 0.5, 1.6);
      if (p.actions.run) p.actions.run.timeScale = clamp(p.speed / 4.2, 0.8, 1.4);
      if (still && P.clip !== 'idle') {
        const a = p.actions[P.clip];
        if (a) a.time = P.t * a.getClip().duration;
        p.mixer.update(0);
      } else p.mixer.update(dt);
    }
    // start again from what the clips gave each bone this frame
    for (const e of Object.values(p.bones)) {
      if (e.out && e.bone.quaternion.equals(e.out)) e.bone.quaternion.copy(e.base);
      else e.base.copy(e.bone.quaternion);
    }
    p.group.updateMatrixWorld(true);
    p.group.getWorldQuaternion(pQ);
    if (P && p.poseW > 0.001) {
      for (const [key, axis, angle] of P.turns) {
        const e = p.bones[key];
        if (!e) continue;
        axisV.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(pQ);
        turnQ.setFromAxisAngle(axisV, angle * p.poseW);
        e.bone.parent.getWorldQuaternion(parentQ).normalize();
        worldQ.copy(parentQ).multiply(e.bone.quaternion).premultiply(turnQ);
        e.bone.quaternion.copy(parentQ.invert()).multiply(worldQ).normalize();
        e.bone.updateMatrixWorld(true);
      }
    }
    for (const e of Object.values(p.bones)) (e.out || (e.out = new THREE.Quaternion())).copy(e.bone.quaternion);
    // dropped to sit or kneel; tipped onto the back to lie down (feet where they stood)
    p.body2.position.y = -p.drop + 0.16 * p.lie;
    p.body2.rotation.x = -1.5 * p.lie;
    p.body2.position.z = -0.9 * p.lie;
  };

  // A step toward (tx, tz) at `speed`, round trees, stones, statues and the shelter's trunk.
  function stepTo(p, tx, tz, want, dt) {
    p.speed += (want - p.speed) * Math.min(1, dt * 4);
    if (p.speed > 0.05) {
      const dir = Math.atan2(tx - p.x, tz - p.z);
      p.h += clamp(wrapAngle(dir - p.h), -dt * 4, dt * 4);
      const probe = { x: p.x + Math.sin(p.h) * p.speed * dt, y: p.y, z: p.z + Math.cos(p.h) * p.speed * dt };
      D.flora.collide(probe, 0.32);
      D.statues.collide(probe, 0.32);
      if (D.shelter.collide) D.shelter.collide(probe, 0.32);
      if (D.lab && D.lab.collide) D.lab.collide(probe, 0.32);
      if (D.east) D.east.collide(probe, 0.32);
      if (D.cave) D.cave.pushOut(probe, 0.32);
      p.x = probe.x;
      p.z = probe.z;
    }
    p.y += (groundAt(p) - p.y) * Math.min(1, dt * 12);
  }
  const groundAt = (p) => {
    const g = T.height(p.x, p.z);
    const deck = D.shelter.floorAt && D.shelter.floorAt(p.x, p.z, p.y + 0.3);
    const floor = D.lab ? D.lab.floorAt(p.x, p.z, p.y + 0.3) : null;
    return Math.max(g, deck !== null && deck !== undefined ? deck : -Infinity, floor !== null ? floor : -Infinity);
  };
  const turnToward = (p, x, z, dt, rate = 2) => {
    const want = Math.atan2(x - p.x, z - p.z);
    p.h += clamp(wrapAngle(want - p.h), -dt * rate, dt * rate);
  };

  // Following: a pace or two behind, each in their own place (slot 0 on the right, 1 on the left,
  // 2 further back), catching up when far behind and out of sight.
  const SLOTS = [[2.4, 1.1], [2.4, -1.2], [3.8, 0.2]];
  function follow(p, dt) {
    const h = D.hero;
    const [back, side] = SLOTS[p.slot % SLOTS.length];
    const fx = Math.sin(h.facing);
    const fz = Math.cos(h.facing);
    const tx = h.pos.x - fx * back + fz * side;
    const tz = h.pos.z - fz * back - fx * side;
    const d = Math.hypot(tx - p.x, tz - p.z);
    const toHero = Math.hypot(h.pos.x - p.x, h.pos.z - p.z);
    const cam = D.camera.position;
    const behindCam = (p.x - cam.x) * Math.sin(h.yaw) + (p.z - cam.z) * Math.cos(h.yaw) < 0;
    if (toHero > (p.weak ? 45 : 50) && behindCam && !h.platform) {
      const gap = p.weak ? 16 : 4 + p.slot * 1.5;
      p.x = h.pos.x - fx * gap + fz * side;
      p.z = h.pos.z - fz * gap - fx * side;
      const probe = { x: p.x, y: p.y, z: p.z };
      D.flora.collide(probe, 0.4);
      if (D.cave) D.cave.pushOut(probe, 0.4);
      p.x = probe.x;
      p.z = probe.z;
      p.y = T.height(p.x, p.z);
      people.place(p);
      return;
    }
    const want = d < 1 ? 0 : p.weak ? Math.min(2.2, d * 0.8) : clamp(d * 0.9, 0, toHero > 10 ? 4.6 : 1.6);
    if (want > 0.05 || p.speed > 0.05) stepTo(p, tx, tz, want, dt);
    if (p.speed <= 0.05) turnToward(p, h.pos.x, h.pos.z, dt);
    people.place(p);
  }

  function goTo(p, dt) {
    const g = p.goal;
    const d = Math.hypot(g.x - p.x, g.z - p.z);
    if (d < g.near) {
      p.speed = 0;
      const done = g.onArrive;
      p.goal = null;
      p.mode = p.pose ? 'pose' : 'idle';
      if (g.face) p.face = g.face;
      if (done) done(p);
      return;
    }
    stepTo(p, g.x, g.z, Math.min(g.speed, d * 1.2 + 0.3), dt);
    people.place(p);
  }

  people.update = (dt) => {
    for (const p of people.list) {
      if (!p.group.visible) continue;
      if (D.state.mode === 'play' && dt > 0) {
        if (p.mode === 'follow') follow(p, dt);
        else if (p.mode === 'goto') goTo(p, dt);
        else if (p.mode === 'idle') {
          p.speed = 0;
          const f = p.face || (Math.hypot(D.hero.pos.x - p.x, D.hero.pos.z - p.z) < 9 ? D.hero.pos : null);
          if (f) turnToward(p, f.x, f.z, dt);
          p.y += (groundAt(p) - p.y) * Math.min(1, dt * 12);
          people.place(p);
        }
      }
      people.pose(p, dt);
    }
  };

  // The waking: four shots, cracks, the stone falling away, a slump to the knees, and (in the
  // last) whatever is said. `lines`: [who, text, seconds]; onEnd once it is over.
  people.wakeShots = (p, lines, { kneelTo = 'kneel' } = {}) => {
    const head = () => new THREE.Vector3(p.x, p.y + 1.55 * p.scale, p.z);
    const side = new THREE.Vector3(Math.cos(p.h), 0, -Math.sin(p.h));
    const front = new THREE.Vector3(Math.sin(p.h), 0, Math.cos(p.h));
    const pose0 = p.pose;
    const talk = lines.reduce((s, l) => s + l[2] + 0.3, 0);
    return [
      {
        dur: 4.5, caption: '',
        enter: () => {
          p.mode = 'stone';
          p.uniforms.petrify.value = 1;
          p.uniforms.crack.value = 0;
          p.group.visible = true;
          if (p.statue) D.statues.wake(p.statue);
          if (D.audio) D.audio.crack();
        },
        update: (k) => {
          p.uniforms.crack.value = smoothstep(0, 0.8, k);
        },
        cam: (k) => ({ pos: head().addScaledVector(front, 2.2 - k * 0.5).addScaledVector(side, 1.1).add(new THREE.Vector3(0, 0.1, 0)), look: head().add(new THREE.Vector3(0, -0.2, 0)), fov: 42 }),
      },
      {
        dur: 4, caption: '',
        enter: () => {
          if (D.audio) D.audio.shatter();
          p.mode = 'waking';
        },
        update: (k) => {
          p.uniforms.petrify.value = 1 - smoothstep(0, 0.85, k);
          p.uniforms.crack.value = 1 - smoothstep(0.5, 1, k);
        },
        cam: (k) => ({ pos: head().addScaledVector(front, 2.6).addScaledVector(side, -0.6 - k * 0.4).add(new THREE.Vector3(0, 0.3 - k * 0.3, 0)), look: head().add(new THREE.Vector3(0, -0.4, 0)), fov: 46 }),
      },
      {
        dur: 4, caption: '',
        enter: () => {
          p.uniforms.petrify.value = 0;
          p.uniforms.crack.value = 0;
          p.mode = 'pose';
          if (D.audio) D.audio.breath();
        },
        update: (k) => {
          p.pose = k < 0.35 ? pose0 : kneelTo;
          p.poseW = k < 0.35 ? 1 - (k / 0.35) * 0.6 : smoothstep(0.35, 0.8, k);
          p.drop = (DROP[kneelTo] || 0) * smoothstep(0.4, 0.9, k);
        },
        cam: (k) => ({ pos: head().addScaledVector(front, 3.2).addScaledVector(side, -1.4).add(new THREE.Vector3(0, -0.2 - k * 0.3, 0)), look: head().add(new THREE.Vector3(0, -0.7 - k * 0.3, 0)), fov: 48 }),
      },
      {
        dur: Math.max(6, talk + 1), caption: '',
        enter: () => {
          lines.forEach(([who, text, s], i) => D.ui.say(who, text, s, i === 0));
        },
        update: (k) => {
          const end = clamp(1 - 3 / Math.max(6, talk + 1), 0.4, 0.85);
          p.pose = kneelTo;
          p.poseW = 1 - smoothstep(end, 1, k);
          p.drop = (DROP[kneelTo] || 0) * (1 - smoothstep(end, 1, k));
        },
        cam: (k) => {
          const mid = head().lerp(D.hero.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0.5);
          return { pos: mid.clone().addScaledVector(side, 3.4 + k * 0.4).addScaledVector(front, 1.2).add(new THREE.Vector3(0, 0.2, 0)), look: mid, fov: 50 };
        },
      },
    ];
  };

  // ---------- Saving ----------

  people.save = () => people.list.filter((p) => p.id).map((p) => ({
    id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), h: +p.h.toFixed(3), mode: p.mode, pose: p.pose, visible: p.group.visible,
  }));
  people.find = (saved, id) => (saved || []).find((s) => s.id === id) || null;

  D.people = people;
})();
