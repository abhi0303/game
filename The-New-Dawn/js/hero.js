// The New Dawn: the survivor. Walking, running and jumping over the land, the third-person
// camera that follows him, his body (health, stamina, hunger, thirst), and how he moves:
// the idle, walk and run clips blended by speed, with poses turned on top of them for
// gathering, drinking, eating, building and drawing a bow. At the start he is stone.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, lerp, approach, wrapAngle, smoothstep } = D;
  const T = D.terrain;

  const WALK = 2.2; // m/s, matched to the walk clip
  const RUN = 5.6;
  const SPRINT = 7.2;
  // stamina per second sprinting (a full bar: about 40 s), per jump, and back per second after a
  // moment's rest (moving, or standing still)
  const STAMINA = { sprint: 2.5, jump: 4, bow: 2.5, restDelay: 0.5, regenMoving: 40, regenStill: 60 };
  const GRAVITY = 22;
  const JUMP = 6.4;
  const RADIUS = 0.34;
  const EYE = 1.6;

  // Overlay bones (Mixamo names on the hero's skeleton) and the pose keys that turn them.
  const BONES = {
    hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
    armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand', armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand',
    legL: 'LeftUpLeg', kneeL: 'LeftLeg', footL: 'LeftFoot', legR: 'RightUpLeg', kneeR: 'RightLeg', footR: 'RightFoot',
  };
  // each pose key: [bone, axis in his own frame (x left, y up, z forward)]
  const KEYS = {
    spine: ['spine', 'x'], spine1: ['spine1', 'x'], twist: ['spine1', 'y'], lean: ['spine', 'z'],
    neck: ['neck', 'x'], head: ['head', 'x'], headTurn: ['head', 'y'], headTilt: ['head', 'z'],
    armL: ['armL', 'x'], armLout: ['armL', 'z'], armLturn: ['armL', 'y'], foreL: ['foreL', 'x'], foreLturn: ['foreL', 'y'],
    armR: ['armR', 'x'], armRout: ['armR', 'z'], armRturn: ['armR', 'y'], foreR: ['foreR', 'x'], foreRturn: ['foreR', 'y'],
    legL: ['legL', 'x'], kneeL: ['kneeL', 'x'], footL: ['footL', 'x'], legR: ['legR', 'x'], kneeR: ['kneeR', 'x'], footR: ['footR', 'x'],
    legLout: ['legL', 'z'], legRout: ['legR', 'z'],
  };
  const KEY_NAMES = Object.keys(KEYS);

  // Named poses, as pose-key values; `crouch` lowers him (metres), `lie` lays him down.
  const POSES = {
    // the moment the light came: an arm thrown up against it, face turned half away
    statue: { armR: -2.15, armRout: -0.25, foreR: -1.55, armL: -0.55, armLout: 0.3, foreL: -0.9, head: -0.15, headTurn: -0.35, spine1: -0.08, legR: -0.25, kneeR: 0.35 },
    gather: { spine: 0.55, spine1: 0.35, legL: -0.95, kneeL: 1.55, legR: -0.35, kneeR: 1.6, footL: 0.3, armR: -1.15, foreR: -0.3, armL: -0.5, foreL: -0.6, head: 0.3, crouch: 0.48 },
    drink: { spine: 0.7, spine1: 0.45, legL: -0.15, kneeL: 1.85, legR: -0.1, kneeR: 1.85, footL: 0.7, footR: 0.7, armR: -1.3, foreR: -1.5, armL: -0.9, foreL: -0.4, head: -0.2, crouch: 0.62 },
    eat: { armR: -0.85, armRout: 0.25, foreR: -2.2, head: 0.1 },
    build: { spine: 0.45, spine1: 0.25, legL: -1.0, kneeL: 1.6, legR: -0.3, kneeR: 1.65, armR: -1.4, foreR: -0.8, armL: -1.1, foreL: -0.9, head: 0.35, crouch: 0.45 },
    cut: { spine: 0.35, spine1: 0.2, legL: -0.5, kneeL: 0.8, legR: -0.1, kneeR: 0.6, armR: -1.5, foreR: -0.6, armL: -0.9, foreL: -0.5, head: 0.4, crouch: 0.2 },
    pull: { spine1: -0.25, armR: -2.6, foreR: -0.4, armL: -2.4, foreL: -0.4, head: -0.4, legL: -0.3, kneeL: 0.3 },
    shake: { armR: -2.2, foreR: -0.3, armL: -2.1, foreL: -0.3, spine1: -0.1, head: -0.35 },
    sit: { legL: -1.45, kneeL: 1.2, legR: -1.4, kneeR: 1.3, spine: 0.1, armL: -0.6, foreL: -0.9, armR: -0.6, foreR: -0.9, head: 0.15, crouch: 0.85 },
    lie: { legL: -0.1, legR: -0.2, kneeR: 0.3, armL: -0.3, armLout: 0.4, armR: -0.2, armRout: -0.5, head: -0.2, lie: 1 },
    wake: { spine: 0.6, spine1: 0.3, legL: -0.4, kneeL: 1.0, legR: -0.1, kneeR: 0.5, armR: -0.9, foreR: -1.9, armL: -0.4, foreL: -0.6, head: 0.5, crouch: 0.25 },
    aim: { twist: 0.2 },
    // Chapter 3: a spear's jab, both hands driving it forward
    jab: { spine1: 0.15, twist: -0.35, armR: -1.35, foreR: -0.15, armL: -1.25, armLout: -0.2, foreL: -0.5, legL: -0.55, kneeL: 0.5, legR: 0.25, head: -0.05, crouch: 0.08 },
    // hanging from a rope, hand over hand
    hang: { armR: -2.9, foreR: -0.2, armL: -2.8, foreL: -0.3, legL: -0.35, kneeL: 0.5, legR: -0.1, kneeR: 0.3, head: -0.3 },
  };

  const hero = {
    group: new THREE.Group(), // where he is, turned to face
    model: null, skin: null,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    facing: Math.PI, yaw: Math.PI, pitch: -0.08,
    onGround: true, grounded: 0, airTime: 0,
    stats: { health: 100, stamina: 100, hunger: 30, thirst: 22 },
    staminaRest: 0, hurtT: 0, lastHurt: -99,
    weapon: 'hands', aiming: false, draw: 0,
    action: null, // { name, t, dur, pose, onDone, label }
    control: false, // can the player move him?
    dead: false, knock: 0, knockDir: 0,
    petrify: 0, crack: 0, pose: null, poseWeight: 0, cinematicPose: null,
    camera: { pos: new THREE.Vector3(), look: new THREE.Vector3(), override: null, dist: 3.6, shake: 0 },
    sprinting: false, moving: false, speed: 0,
    attachments: {},
    stepPhase: 0,
    noDecay: false,
  };
  D.scene.add(hero.group);

  // ---------- The model ----------

  const stoneUniforms = D.stoneUniforms();
  stoneUniforms.petrify.value = 1;
  hero.stoneUniforms = stoneUniforms;

  hero.build = () => {
    const src = D.models.hero;
    if (!src) return;
    const root = src.root;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      const m = o.material;
      const material = new THREE.MeshStandardMaterial({
        map: m.map, normalMap: m.normalMap, color: m.color, skinning: true,
        roughness: 0.82, metalness: 0, envMapIntensity: 0.6,
        transparent: m.transparent, alphaTest: m.alphaTest, side: m.side,
      });
      D.addStone(material, stoneUniforms, { space: 'object', moss: false, scale: 2.4 });
      o.material = material;
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const [name, clip] of Object.entries(src.clips)) {
      const tracks = clip.tracks.filter((t) => root.getObjectByName(t.bone)).map((t) => (t.path === 'q'
        ? new THREE.QuaternionKeyframeTrack(`${t.bone}.quaternion`, t.times || clip.times, t.values)
        : new THREE.VectorKeyframeTrack(`${t.bone}.position`, t.times || clip.times, t.values)));
      const action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
      action.play();
      action.setEffectiveWeight(name === 'idle' ? 1 : 0);
      actions[name] = action;
    }
    const bones = {};
    for (const [key, name] of Object.entries(BONES)) {
      const bone = root.getObjectByName(name);
      if (bone) bones[key] = { bone, base: new THREE.Quaternion(), out: null };
    }
    const body = new THREE.Group(); // lowered when he crouches, laid down when he lies
    body.add(root);
    hero.group.add(body);
    hero.body = body;
    hero.model = root;
    hero.skin = {
      mixer, actions, bones,
      weights: { idle: 1, walk: 0, run: 0 },
      pose: Object.fromEntries([...KEY_NAMES, 'crouch', 'lie'].map((k) => [k, 0])),
    };
    const C = D.CAVE;
    hero.teleport(C.statue.x, C.statue.z, Math.PI);
  };

  // ---------- Placing him ----------

  hero.teleport = (x, z, facing = hero.facing, y = null) => {
    hero.pos.set(x, y === null ? T.height(x, z) : y, z);
    hero.vel.set(0, 0, 0);
    hero.facing = facing;
    hero.yaw = facing;
    hero.group.position.copy(hero.pos);
    hero.group.rotation.y = facing;
    hero.camera.pos.set(x - Math.sin(facing) * 3.6, hero.pos.y + 2.2, z - Math.cos(facing) * 3.6);
    hero.platform = null;
  };

  hero.focus = () => hero.pos;
  hero.dripTarget = () => hero.pos.y + 1.84;

  // A bone's place in the world.
  hero.boneWorld = (key, out = new THREE.Vector3()) => {
    const b = hero.skin && hero.skin.bones[key];
    return b ? b.bone.getWorldPosition(out) : out.copy(hero.pos).setY(hero.pos.y + 1.2);
  };

  // Something held: hung off a bone, with its own offset.
  hero.attach = (name, object, boneKey) => {
    const b = hero.skin && hero.skin.bones[boneKey];
    if (!b) return;
    if (hero.attachments[name]) hero.attachments[name].object.parent.remove(hero.attachments[name].object);
    b.bone.add(object);
    hero.attachments[name] = { object, boneKey };
  };

  // ---------- Body ----------

  hero.hurt = (amount, cause, dirX = 0, dirZ = 0, knock = 0) => {
    if (hero.dead || D.state.mode !== 'play') return;
    hero.stats.health = Math.max(0, hero.stats.health - amount);
    hero.lastHurt = D.state.time;
    hero.hurtT = 1;
    D.env.shake = Math.max(D.env.shake, Math.min(1, amount / 30));
    if (D.audio) D.audio.hurt(amount);
    if (knock > 0 && hero.stats.health > 0) {
      hero.knock = knock;
      hero.knockDir = Math.atan2(dirX, dirZ);
      hero.vel.x += dirX * 6;
      hero.vel.z += dirZ * 6;
      hero.vel.y = 3.5;
      hero.cancelAction();
    }
    if (hero.stats.health <= 0) hero.die(cause);
  };

  hero.die = (cause) => {
    if (hero.dead) return;
    hero.dead = true;
    hero.deathT = 0;
    hero.cancelAction();
    if (D.story) D.story.onDeath(cause);
  };

  hero.revive = () => {
    hero.dead = false;
    hero.knock = 0;
    hero.deathT = 0;
    hero.stats.health = 100;
    hero.stats.stamina = 100;
    hero.stats.hunger = Math.max(hero.stats.hunger, 55);
    hero.stats.thirst = Math.max(hero.stats.thirst, 55);
    hero.vel.set(0, 0, 0);
  };

  function updateBody(dt) {
    const s = hero.stats;
    if (hero.noDecay || hero.dead || D.state.mode !== 'play') return;
    // hunger and thirst fall steadily; faster when running
    const effort = hero.sprinting ? 2.2 : hero.moving ? 1.2 : 1;
    s.hunger = Math.max(0, s.hunger - dt * 0.085 * effort);
    s.thirst = Math.max(0, s.thirst - dt * 0.12 * effort);
    // empty, they hurt; well fed and watered, wounds close
    if (s.hunger <= 0) s.health -= dt * 0.5;
    if (s.thirst <= 0) s.health -= dt * 0.7;
    if (s.hunger > 35 && s.thirst > 35 && D.state.time - hero.lastHurt > 6) s.health = Math.min(100, s.health + dt * 0.6);
    // stamina: used sprinting, jumping and holding the bow drawn, and soon back: a full bar is
    // over half a minute of sprinting (a little less when starving), refilled in a few seconds
    const maxStamina = 82 + 18 * smoothstep(5, 30, Math.min(s.hunger, s.thirst));
    hero.staminaRest += dt;
    if (hero.staminaRest > STAMINA.restDelay) s.stamina = Math.min(maxStamina, s.stamina + dt * (hero.moving ? STAMINA.regenMoving : STAMINA.regenStill) * (s.strength || 1));
    s.stamina = Math.min(s.stamina, maxStamina);
    if (s.health <= 0) hero.die(s.thirst <= 0 ? 'Thirst' : 'Hunger');
  }

  hero.STAMINA = STAMINA;
  hero.useStamina = (amount) => {
    if (hero.stats.stamina < amount) return false;
    hero.stats.stamina -= amount;
    hero.staminaRest = 0;
    return true;
  };

  // ---------- Actions: a moment's work ----------

  // `dur` seconds of `pose`, then `onDone`. Moving cancels it (unless `fixed`).
  hero.startAction = (name, dur, { pose = null, onDone = null, label = null, fixed = false, sound = null } = {}) => {
    if (hero.action || hero.dead) return false;
    hero.action = { name, t: 0, dur, pose, onDone, label: label || name, fixed, sound, nextSound: 0 };
    hero.vel.x = 0;
    hero.vel.z = 0;
    return true;
  };
  hero.cancelAction = () => {
    if (hero.action && D.ui) D.ui.action(null);
    hero.action = null;
  };
  function updateAction(dt) {
    const a = hero.action;
    if (!a) return;
    a.t += dt;
    if (a.sound && a.t >= a.nextSound) {
      a.sound();
      a.nextSound = a.t + 0.45;
    }
    if (D.ui) D.ui.action(a.label, a.t / a.dur);
    if (a.t >= a.dur) {
      hero.action = null;
      if (D.ui) D.ui.action(null);
      if (a.onDone) a.onDone();
    }
  }

  // ---------- Moving ----------

  const wish = new THREE.Vector3();
  const next = new THREE.Vector3();
  let waterWarned = 0;

  function groundAt(x, z, y) {
    let g = T.height(x, z);
    const probe = { x, y, z };
    const rock = D.flora ? D.flora.collide(probe, 0.01) : -Infinity;
    if (rock > -Infinity && rock < y + 0.6) g = Math.max(g, rock);
    if (D.shelter && D.shelter.floorAt) {
      const f = D.shelter.floorAt(x, z, y);
      if (f !== null) g = Math.max(g, f);
    }
    if (D.lab) {
      const f = D.lab.floorAt(x, z, y);
      if (f !== null) g = Math.max(g, f);
    }
    return g;
  }
  hero.groundAt = groundAt;

  function move(dt) {
    const input = D.input;
    const can = hero.control && !hero.dead && hero.knock <= 0 && D.state.mode === 'play';
    let fx = 0;
    let fz = 0;
    if (can) {
      if (input.held.has('KeyW') || input.held.has('ArrowUp')) fz += 1;
      if (input.held.has('KeyS') || input.held.has('ArrowDown')) fz -= 1;
      if (input.held.has('KeyA') || input.held.has('ArrowLeft')) fx += 1;
      if (input.held.has('KeyD') || input.held.has('ArrowRight')) fx -= 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0 && hero.action && !hero.action.fixed) hero.cancelAction();
    const busy = !!hero.action;
    // relative to where the camera looks
    const sy = Math.sin(hero.yaw);
    const cy = Math.cos(hero.yaw);
    wish.set(0, 0, 0);
    if (len > 0 && !busy) {
      fx /= len;
      fz /= len;
      wish.set(sy * fz + cy * fx, 0, cy * fz - sy * fx);
    }
    const s = hero.stats;
    const wantsSprint = can && (input.held.has('ShiftLeft') || input.held.has('ShiftRight'));
    hero.sprinting = wantsSprint && len > 0 && !busy && !hero.aiming && s.stamina > 2 && hero.onGround;
    if (hero.sprinting) {
      s.stamina = Math.max(0, s.stamina - (dt * STAMINA.sprint) / (s.strength || 1));
      hero.staminaRest = 0;
    }
    const tired = smoothstep(0, 18, s.stamina);
    // W jogs, Shift sprints (while there is stamina), Alt walks; aiming, he steps carefully
    let speed = hero.aiming ? WALK * 0.8 : hero.sprinting ? lerp(RUN, SPRINT, tired) : RUN * 0.62;
    if (input.held.has('AltLeft') || input.held.has('AltRight')) speed = WALK;
    // wading slows you down
    const water = T.waterAt(hero.pos.x, hero.pos.z);
    if (water && water.depth > 0.3) speed *= lerp(1, 0.45, smoothstep(0.3, 1.0, water.depth));
    // hungry and thirsty, you drag your feet
    speed *= lerp(0.7, 1, smoothstep(0, 15, Math.min(s.hunger, s.thirst)));
    const accel = hero.onGround ? 14 : 2.5;
    hero.vel.x = approach(hero.vel.x, wish.x * speed, accel * dt * Math.max(1, Math.abs(wish.x * speed - hero.vel.x)));
    hero.vel.z = approach(hero.vel.z, wish.z * speed, accel * dt * Math.max(1, Math.abs(wish.z * speed - hero.vel.z)));
    if (hero.knock > 0) {
      hero.vel.x *= Math.max(0, 1 - dt * 3);
      hero.vel.z *= Math.max(0, 1 - dt * 3);
    }
    // jump
    if (can && !busy && input.pressed.has('Space') && hero.onGround && hero.grounded > 0.05 && hero.useStamina(STAMINA.jump)) {
      hero.vel.y = JUMP;
      hero.onGround = false;
      if (D.audio) D.audio.jump();
    }
    hero.vel.y -= GRAVITY * dt;

    // where he would go
    next.copy(hero.pos).addScaledVector(hero.vel, dt);
    // too steep to climb: the cliffs and mountains are walls
    const here = T.height(hero.pos.x, hero.pos.z);
    const there = T.height(next.x, next.z);
    const step = Math.hypot(next.x - hero.pos.x, next.z - hero.pos.z);
    if (step > 1e-4 && there > here + 0.05 && !hero.platform) {
      const n = T.normal(next.x, next.z);
      if (n.y < 0.66 && there > hero.pos.y - 0.2) {
        // slide along the slope instead of up it
        const ux = n.x;
        const uz = n.z;
        const ul = Math.hypot(ux, uz) || 1;
        const into = ((next.x - hero.pos.x) * -ux + (next.z - hero.pos.z) * -uz) / ul;
        if (into > 0) {
          next.x += (ux / ul) * into;
          next.z += (uz / ul) * into;
        }
        const again = T.height(next.x, next.z);
        if (T.normal(next.x, next.z).y < 0.66 && again > here + 0.05) {
          next.x = hero.pos.x;
          next.z = hero.pos.z;
        }
      }
    }
    // deep water: the river's current is too strong; the pond too deep to cross
    const wet = T.waterAt(next.x, next.z);
    if (wet && wet.depth > 1.15) {
      next.x = hero.pos.x;
      next.z = hero.pos.z;
      if (D.state.time - waterWarned > 6 && D.ui) {
        waterWarned = D.state.time;
        D.ui.toast(wet.kind === 'river' ? 'The current is far too strong to swim' : 'Too deep to wade any further', true);
      }
    }
    // trunks, rocks, statues, the cave, the shelter tree, animals
    if (D.flora) D.flora.collide(next, RADIUS);
    if (D.statues) D.statues.collide(next, RADIUS);
    if (D.cave) D.cave.pushOut(next, RADIUS);
    if (D.shelter && D.shelter.collide) D.shelter.collide(next, RADIUS);
    if (D.lab) D.lab.collide(next, RADIUS);
    if (D.east) D.east.collide(next, RADIUS);
    if (D.combat && D.combat.collide) D.combat.collide(next, RADIUS);
    // the edge of the world, should anything else let him through
    // (the land beyond the eastern mountains opens in Chapter 3, once the pass is cleared)
    const B = D.LAYOUT.edge || D.LAYOUT.bounds;
    next.x = clamp(next.x, B.minX, B.maxX);
    next.z = clamp(next.z, B.minZ, B.maxZ);

    // the ground
    const ground = groundAt(next.x, next.z, hero.pos.y);
    if (next.y <= ground) {
      const fall = -hero.vel.y;
      if (!hero.onGround && hero.airTime > 0.25) {
        if (fall > 12) hero.hurt((fall - 12) * 7, 'A bad fall');
        if (D.audio) D.audio.land(fall);
      }
      next.y = ground;
      hero.vel.y = 0;
      hero.onGround = true;
      hero.grounded += dt;
      hero.airTime = 0;
    } else if (hero.onGround && next.y - ground < 0.45 && hero.vel.y <= 0) {
      // walking down a slope: keep to it
      next.y = ground;
      hero.vel.y = 0;
      hero.grounded += dt;
    } else {
      hero.onGround = false;
      hero.grounded = 0;
      hero.airTime += dt;
    }
    hero.pos.copy(next);
    hero.speed = Math.hypot(hero.vel.x, hero.vel.z);
    hero.moving = hero.speed > 0.3;

    // turn to face the way he goes, or the aim
    if (hero.aiming || (hero.action && hero.action.face !== undefined)) {
      const target = hero.aiming ? hero.yaw : hero.action.face;
      hero.facing += wrapAngle(target - hero.facing) * Math.min(1, dt * 14);
    } else if (hero.moving && len > 0) {
      const want = Math.atan2(hero.vel.x, hero.vel.z);
      hero.facing += wrapAngle(want - hero.facing) * Math.min(1, dt * 10);
    }
    hero.group.position.copy(hero.pos);
    hero.group.rotation.y = hero.facing;

    // footsteps
    if (hero.onGround && hero.moving) {
      const before = hero.stepPhase;
      hero.stepPhase += (hero.speed / (hero.sprinting ? 1.7 : 1.35)) * dt;
      if (Math.floor(before) !== Math.floor(hero.stepPhase) && D.audio) D.audio.step(T.groundKind(hero.pos.x, hero.pos.z), hero.sprinting ? 1 : 0.6);
    }
  }

  // ---------- The mouse and the keys ----------

  function look() {
    const input = D.input;
    if (!hero.control || D.state.mode !== 'play' || D.state.panel) return;
    const k = 0.0021 * D.settings.sensitivity * (hero.aiming ? 0.6 : 1);
    hero.yaw -= input.dx * k;
    hero.pitch -= input.dy * k * (D.settings.invertY ? -1 : 1);
    hero.pitch = clamp(hero.pitch, -1.15, 0.85);
  }

  // ---------- Animation ----------

  const heroQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();
  const turnAxis = new THREE.Vector3();
  function turnBone(entry, axis, angle) {
    if (!entry || Math.abs(angle) < 1e-4) return;
    const bone = entry.bone;
    turnAxis.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(heroQ);
    turnQ.setFromAxisAngle(turnAxis, angle);
    bone.parent.getWorldQuaternion(parentQ).normalize();
    worldQ.copy(parentQ).multiply(bone.quaternion).premultiply(turnQ);
    bone.quaternion.copy(parentQ.invert()).multiply(worldQ).normalize();
  }

  function animate(dt) {
    const k = hero.skin;
    if (!k) return;
    const frozen = hero.petrify > 0.98;
    const airborne = !hero.onGround && hero.airTime > 0.12;
    const moving = hero.moving && !airborne && !hero.action && hero.knock <= 0 && !hero.dead;
    const run = moving ? clamp((hero.speed - WALK) / (RUN - WALK), 0, 1) : 0;
    const goal = { idle: moving ? 0 : 1, walk: moving ? 1 - run : 0, run: moving ? run : 0 };
    const fade = Math.min(1, 9 * dt);
    for (const name of ['idle', 'walk', 'run']) {
      if (!k.actions[name]) continue;
      k.weights[name] += (goal[name] - k.weights[name]) * fade;
      k.actions[name].setEffectiveWeight(k.weights[name]);
    }
    if (k.actions.walk) k.actions.walk.timeScale = clamp(hero.speed / 1.55, 0.6, 1.8);
    if (k.actions.run) k.actions.run.timeScale = clamp(hero.speed / 4.8, 0.8, 1.5);
    if (!frozen) k.mixer.update(dt);
    else k.mixer.update(0);

    // the pose on top
    const want = {};
    const add = (pose, w = 1) => {
      for (const [key, v] of Object.entries(pose)) want[key] = (want[key] || 0) + v * w;
    };
    if (hero.cinematicPose) add(POSES[hero.cinematicPose] || hero.cinematicPose, hero.cinematicWeight === undefined ? 1 : hero.cinematicWeight);
    else if (hero.dead || hero.knock > 0) add(POSES.lie);
    else if (hero.action && hero.action.pose) {
      const p = POSES[hero.action.pose] || {};
      add(p);
      // a little life in it: the hands working
      const t = hero.action.t;
      if (hero.action.pose === 'build' || hero.action.pose === 'cut') {
        want.armR = (want.armR || 0) + Math.sin(t * 9) * 0.45;
        want.foreR = (want.foreR || 0) + Math.sin(t * 9 + 0.5) * 0.3;
      } else if (hero.action.pose === 'eat') {
        want.foreR = (want.foreR || 0) + Math.sin(t * 7) * 0.2;
        want.head = (want.head || 0) + Math.sin(t * 9) * 0.05;
      } else if (hero.action.pose === 'gather' || hero.action.pose === 'pull') {
        want.armR = (want.armR || 0) + Math.sin(t * 6) * 0.25;
        want.armL = (want.armL || 0) + Math.sin(t * 6 + 2) * 0.25;
      } else if (hero.action.pose === 'shake') {
        want.armR = (want.armR || 0) + Math.sin(t * 16) * 0.15;
        want.armL = (want.armL || 0) + Math.sin(t * 16 + 1) * 0.15;
      }
    } else if (D.combat && hero.weapon === 'bow' && (hero.aiming || hero.draw > 0)) {
      add(D.combat.bowPose(hero.pitch, hero.draw));
    } else if (airborne) {
      add({ legR: -0.9, kneeR: 1.2, legL: 0.25, kneeL: 0.6, armR: -0.5, armL: -0.9, foreL: -0.5 });
    }
    if (hero.hurtT > 0) add({ spine1: -0.25 * hero.hurtT, head: -0.2 * hero.hurtT });
    // weary: head down when starving
    const weak = 1 - smoothstep(5, 20, Math.min(hero.stats.hunger, hero.stats.thirst));
    if (weak > 0 && !hero.cinematicPose) add({ head: 0.25 * weak, spine1: 0.12 * weak });
    // look up and down with the camera when standing about
    if (!hero.cinematicPose && !hero.action && !hero.dead && hero.control) add({ head: -hero.pitch * 0.35, neck: -hero.pitch * 0.15 });

    const ease = Math.min(1, (hero.cinematicPose ? 4 : 12) * dt);
    for (const key of Object.keys(k.pose)) k.pose[key] += ((want[key] || 0) - k.pose[key]) * ease;

    // start again from what the clip gave each bone (the mixer only writes when it changes)
    for (const entry of Object.values(k.bones)) {
      if (entry.out && entry.bone.quaternion.equals(entry.out)) entry.bone.quaternion.copy(entry.base);
      else entry.base.copy(entry.bone.quaternion);
    }
    hero.group.updateMatrixWorld(true);
    hero.group.getWorldQuaternion(heroQ);
    const p = k.pose;
    const b = k.bones;
    for (const key of KEY_NAMES) {
      const [bone, axis] = KEYS[key];
      turnBone(b[bone], axis, p[key]);
    }
    for (const entry of Object.values(k.bones)) (entry.out || (entry.out = new THREE.Quaternion())).copy(entry.bone.quaternion);

    // crouching and lying down move the whole body
    hero.body.position.y = -p.crouch;
    if (p.lie > 0.01) {
      // over onto his back, away from whatever struck him
      const side = hero.dead || hero.knock > 0 ? 1 : 1;
      hero.body.rotation.x = -1.45 * p.lie * side;
      hero.body.position.y = 0.18 * p.lie;
      hero.body.position.z = -0.85 * p.lie;
    } else {
      hero.body.rotation.x = 0;
      hero.body.position.z = 0;
    }
  }

  // ---------- The camera ----------

  const camTarget = new THREE.Vector3();
  const camWant = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  hero.updateCamera = (dt, time) => {
    const cam = D.camera;
    const c = hero.camera;
    if (c.override) {
      // a scene in the story places the camera
      const o = c.override;
      cam.position.copy(o.pos);
      cam.lookAt(o.look);
      const fov = o.fov || D.settings.fov;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      applyShake(time);
      return;
    }
    const aiming = hero.aiming && !hero.dead;
    const dist = aiming ? 1.9 : hero.platform ? 3.2 : 3.7;
    c.dist += (dist - c.dist) * Math.min(1, dt * 8);
    const shoulder = aiming ? 0.62 : 0.42;
    const crouch = hero.skin ? hero.skin.pose.crouch : 0;
    camTarget.set(hero.pos.x, hero.pos.y + EYE - crouch * 0.6 - (hero.dead ? 1.1 : 0), hero.pos.z);
    const sy = Math.sin(hero.yaw);
    const cy = Math.cos(hero.yaw);
    const cp = Math.cos(hero.pitch);
    const sp = Math.sin(hero.pitch);
    // over the right shoulder (his right is -x in his frame; the camera looks along yaw)
    const rx = -cy;
    const rz = sy;
    camWant.set(
      camTarget.x - sy * cp * c.dist + rx * shoulder,
      camTarget.y - sp * c.dist + 0.25,
      camTarget.z - cy * cp * c.dist + rz * shoulder
    );
    // keep it out of the ground and the rock
    const minY = T.height(camWant.x, camWant.z) + 0.35;
    if (camWant.y < minY) camWant.y = minY;
    if (D.cave) {
      const f = D.cave.clearance(camTarget, camWant);
      if (f < 1) camWant.lerpVectors(camTarget, camWant, Math.max(0.15, f));
    }
    // and out of the lab's walls; under its roof, from inside
    if (D.lab) {
      const f = D.lab.clearance(camTarget, camWant);
      if (f < 1) camWant.lerpVectors(camTarget, camWant, Math.max(0.12, f));
    }
    const follow = Math.min(1, dt * (aiming ? 22 : 14));
    c.pos.lerp(camWant, follow);
    if (c.pos.distanceTo(camWant) > 6) c.pos.copy(camWant);
    cam.position.copy(c.pos);
    camLook.set(camTarget.x + sy * cp * 10 + rx * shoulder, camTarget.y + 0.25 + sp * 10, camTarget.z + cy * cp * 10 + rz * shoulder);
    cam.lookAt(camLook);
    const fov = D.settings.fov - (aiming ? 12 + 6 * hero.draw : 0) + (hero.sprinting ? 4 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
    }
    applyShake(time);
  };

  function applyShake(time) {
    const s = D.env.shake;
    if (s <= 0.001) return;
    const cam = D.camera;
    cam.position.x += Math.sin(time * 41) * 0.06 * s;
    cam.position.y += Math.sin(time * 37 + 1) * 0.05 * s;
    cam.rotation.z += Math.sin(time * 29) * 0.012 * s;
  }

  // ---------- Each frame ----------

  // (a guard: should anything ever put him at a non-number, he goes back where he last was)
  const lastGood = new THREE.Vector3();
  hero.update = (dt, time) => {
    if (!hero.skin) return;
    if (!Number.isFinite(hero.yaw)) hero.yaw = hero.facing || 0;
    if (!Number.isFinite(hero.pitch)) hero.pitch = 0;
    if (!Number.isFinite(hero.pos.x + hero.pos.y + hero.pos.z)) {
      console.error(`hero position went bad (${hero.pos.x}, ${hero.pos.y}, ${hero.pos.z}); action ${hero.action && hero.action.name}`);
      hero.pos.copy(lastGood);
      hero.vel.set(0, 0, 0);
    } else lastGood.copy(hero.pos);
    if (D.state.mode === 'play') look();
    if (hero.petrify < 0.99 && !hero.frozen) {
      move(dt);
      updateAction(dt);
      updateBody(dt);
    }
    hero.knock = Math.max(0, hero.knock - dt);
    hero.hurtT = Math.max(0, hero.hurtT - dt * 2);
    if (hero.dead) hero.deathT = (hero.deathT || 0) + dt;
    stoneUniforms.petrify.value = hero.petrify;
    stoneUniforms.crack.value = hero.crack;
    animate(dt);
  };

  D.hero = hero;
})();
