// The New Dawn: fire (Chapter 2).
//
// A fire pit is built at a camp spot (stones and sticks), lit with a bow drill (A and D in
// turn, sawing the bow, until an ember glows; E blows it into flame), and has to be fed. It
// lights what is round it (worked out in the shaders, like the cave's green glow: no real
// lights, which cost every pixel), leaves wood ash, and is where the chapter's slow work
// happens: pots bake in it, nitre water boils down, the revival fluid warms. A torch, lit at
// it, is the only light in the Nitre Galleries.
(() => {
  'use strict';
  const D = window.Dawn;
  const { $, clamp, lerp, smoothstep } = D;
  const T = D.terrain;

  const camp = { fires: [], processes: [], torch: { lit: false, left: 0 }, drill: null };
  const TORCH_TIME = 180; // seconds a torch burns
  const FUEL_MAX = 420;

  // ---------- The fire's light, in every shader that takes the cave's glow ----------

  const U = D.caveUniforms; // fireA, fireB, torchL, localOn: see shaders.js

  // ---------- The spots ----------

  const SPOTS = {
    day: { x: -24.5, z: 95.5, label: 'Camp by the pond' },
    night: null, // at the foot of the Elder Tree's ladder, once the shelter stands (see spot())
  };
  // more places for a fire (Chapter 3: the lab's hearth, the cave mouth, the overhang)
  camp.addSpot = (id, spot) => {
    SPOTS[id] = spot;
  };
  // which chapter's fire work is on (the fires belong to Chapters 2 and 3)
  const chap = () => (D.story && D.story.chap ? D.story.chap() : null);
  camp.spot = (id) => {
    if (id === 'night' && !SPOTS.night && D.shelter && D.shelter.ladder) {
      const lad = D.shelter.ladder.bottom;
      const P = D.shelter.P;
      const ox = P ? P.ox : 0;
      const oz = P ? P.oz : 1;
      SPOTS.night = { x: lad.x + ox * 3.2 + oz * 1.4, z: lad.z + oz * 3.2 - ox * 1.4, label: 'Fire under the Elder Tree' };
    }
    return SPOTS[id] || null;
  };

  // ---------- Looks ----------

  let flameMaterial = null;
  function flameMat() {
    if (flameMaterial) return flameMaterial;
    flameMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `
        uniform float time;
        attribute float seed;
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          vUv = uv;
          vSeed = seed;
          // upright, turned to the camera round the vertical
          vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 scale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
          vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(1e-4, 0.0, 0.0));
          vec3 p = centre + right * position.x * scale.x + vec3(0.0, position.y * scale.y, 0.0) + right * position.z * scale.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vSeed;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fn(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float y = vUv.y;
          float x = (vUv.x - 0.5) * 2.0;
          float t = time * 2.4 + vSeed * 7.0;
          float turb = fn(vec2(vUv.x * 4.0 + vSeed * 3.0, y * 3.0 - t * 1.7)) * 0.6 + fn(vec2(vUv.x * 9.0, y * 7.0 - t * 3.3)) * 0.4;
          float width = (1.0 - y * 0.92) * (0.72 + 0.4 * turb);
          float bend = (turb - 0.5) * 0.45 * y;
          float shape = 1.0 - smoothstep(width * 0.45, width, abs(x + bend));
          shape *= smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.45, 1.0, y + (turb - 0.5) * 0.35));
          vec3 col = mix(vec3(0.95, 0.26, 0.04), vec3(1.0, 0.7, 0.3), smoothstep(0.3, 0.98, shape) * (1.0 - y * 0.85));
          gl_FragColor = vec4(col * shape * 1.15, shape);
        }`,
    });
    return flameMaterial;
  }
  // a pair of flame cards (one inside the other), feet at y = 0, 1 wide and 1 high
  function flameMesh() {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    const g2 = g.clone();
    g2.scale(0.62, 0.78, 1);
    g2.translate(0, 0, 0.001);
    const joined = D.models.joinGeometries([g, g2]);
    const seed = new Float32Array(joined.attributes.position.count);
    for (let i = 0; i < seed.length; i++) seed[i] = i < 4 ? Math.random() : Math.random() + 3;
    joined.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.Mesh(joined, flameMat());
    m.frustumCulled = false;
    m.renderOrder = 20;
    return m;
  }

  // sparks rising out of a fire, and its smoke
  let sparkMaterial = null;
  function sparks(count, smoke) {
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, amount: { value: 1 }, scale: { value: 600 } },
      transparent: true, depthWrite: false, blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: `
        uniform float time;
        uniform float amount;
        uniform float scale;
        attribute float seed;
        varying float vA;
        void main() {
          float life = ${smoke ? '5.0' : '1.6'};
          float t = fract(time / life + seed);
          vec3 p = position;
          p.y += t * ${smoke ? '3.2' : '2.4'} * (0.7 + seed * 0.6);
          p.x += sin(time * 1.7 + seed * 40.0) * ${smoke ? '0.6' : '0.18'} * t + ${smoke ? 't * 0.5' : '0.0'};
          p.z += cos(time * 1.3 + seed * 30.0) * ${smoke ? '0.5' : '0.18'} * t;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = ${smoke ? '(0.5 + t * 1.6)' : '0.045'} * scale / -mv.z;
          vA = amount * ${smoke ? '(1.0 - t) * smoothstep(0.0, 0.15, t) * 0.32' : '(1.0 - t) * step(seed, amount)'};
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, ${smoke ? '0.0' : '0.2'}, d) * vA;
          gl_FragColor = vec4(${smoke ? 'vec3(0.62, 0.6, 0.57) * a, a' : 'vec3(1.0, 0.6, 0.2) * a, a'});
        }`,
    });
    if (!smoke) sparkMaterial = mat;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 21;
    return pts;
  }

  // the stones round a fire and the wood in it
  let woodMat = null;
  let ringMat = null;
  function pitMeshes(fire) {
    const group = new THREE.Group();
    const stone = D.items.modelOf('stone');
    if (!ringMat) ringMat = D.addCaveShade(new THREE.MeshStandardMaterial({ map: stone.material.map || null, color: D.col(0x8f8a80), roughness: 0.96, metalness: 0, envMapIntensity: 0.25 }));
    const ring = new THREE.InstancedMesh(stone.geometry, ringMat, 10);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.2;
      const r = 0.68 + Math.random() * 0.06;
      dummy.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
      dummy.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
      dummy.scale.setScalar(stone.scale.x * (1.15 + Math.random() * 0.4));
      dummy.updateMatrix();
      ring.setMatrixAt(i, dummy.matrix);
    }
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
    if (!woodMat) {
      woodMat = D.addCaveShade(new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), color: D.col(0x8a6a4a), roughness: 0.9, emissive: new THREE.Color(0xff5a14), emissiveIntensity: 0 }));
    }
    const logs = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.95, 7), woodMat);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      log.position.set(Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2);
      log.rotation.set(0, -a, 0);
      log.rotateZ(0.95);
      log.castShadow = true;
      logs.add(log);
    }
    group.add(logs);
    const flames = flameMesh();
    flames.scale.set(0.9, 1.25, 1);
    flames.position.y = 0.06;
    group.add(flames);
    const spk = sparks(26, false);
    spk.position.y = 0.3;
    const smoke = sparks(14, true);
    smoke.position.y = 0.6;
    group.add(spk, smoke);
    group.position.set(fire.x, fire.y, fire.z);
    D.scene.add(group);
    Object.assign(fire, { group, ring, logs, flames, spk, smoke });
  }

  // ---------- The fires ----------

  function fireAt(id) {
    let f = camp.fires.find((q) => q.id === id);
    if (!f) {
      const s = camp.spot(id);
      if (!s) return null;
      f = { id, x: s.x, z: s.z, y: T.height(s.x, s.z), built: false, lit: false, fuel: 0, ash: 0, burnt: 0, out: 0 };
      camp.fires.push(f);
    }
    return f;
  }
  camp.fire = (id) => camp.fires.find((f) => f.id === id) || null;
  camp.ensure = (id) => fireAt(id);
  const showFire = (f) => {
    if (!f.built) return;
    if (!f.group) pitMeshes(f);
    f.group.visible = true;
  };

  camp.build = (id) => {
    const f = fireAt(id);
    if (!f) return;
    f.built = true;
    showFire(f);
  };
  camp.light = (id, fuel = 240) => {
    const f = fireAt(id);
    if (!f) return;
    f.built = true;
    showFire(f);
    f.lit = true;
    f.fuel = Math.max(f.fuel, fuel);
    f.out = 0;
  };
  camp.nearFire = (x, z, r = 5) => camp.fires.find((f) => f.lit && Math.hypot(f.x - x, f.z - z) < r) || null;
  camp.nearestLit = (x, z) => {
    let best = null;
    let bd = Infinity;
    for (const f of camp.fires) {
      if (!f.lit) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  };
  // how hard a fire burns at night: the night fire eats wood faster (it is kept high)
  const burnRate = (f) => (f.id === 'night' && D.env.night > 0.5 ? 1.6 : 1);

  function addWood(f) {
    const h = D.hero;
    const useBranch = !D.items.has('stick') && D.items.has('branch');
    const key = useBranch ? 'branch' : 'stick';
    if (!D.items.has(key)) return;
    const face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
    if (h.startAction('Feeding the fire', 0.9, { pose: 'gather', onDone: () => {
      D.items.remove(key, 1);
      f.fuel = Math.min(FUEL_MAX, f.fuel + (useBranch ? 150 : 80));
      if (D.audio) D.audio.rustle();
      if (D.story) D.story.on('fed', f.id);
    } })) h.action.face = face;
  }
  function scoopAsh(f) {
    const h = D.hero;
    const face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
    if (h.startAction('Scooping out ash', 1.4, { pose: 'gather', onDone: () => {
      const n = Math.floor(f.ash);
      f.ash -= n;
      D.items.add('ash', n);
      if (D.story) D.story.on('gained', { key: 'ash', n });
    } })) h.action.face = face;
  }
  function lightTorch(f) {
    if (!D.items.has('torch')) return;
    const h = D.hero;
    const face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
    if (h.startAction('Lighting a torch', 1.2, { pose: 'gather', onDone: () => {
      camp.torch.lit = true;
      camp.torch.left = TORCH_TIME;
      D.items.remove('torch', 1);
      D.items.setWeapon('torch');
      if (D.audio) D.audio.flare();
      if (D.story) D.story.on('torchLit');
    } })) h.action.face = face;
  }

  // ---------- The bow drill ----------

  // A and D in turn saw the bow; the right pace heats the spindle, too slow or the wrong key and
  // it cools. Hot enough, an ember: E blows it into flame.
  function startDrill(f) {
    const h = D.hero;
    if (!h.startAction('Saw the bow: A, D, A, D...', 100, { pose: 'build', fixed: true })) return;
    h.action.face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
    h.action.drill = true;
    camp.drill = { fire: f, heat: 0, next: 'KeyA', last: performance.now(), ember: false, emberT: 0, strokes: 0 };
    $('drill').hidden = false;
    $('tutorial').hidden = true; // (the drill shows its own keys, where the tip would cover them)
    if (D.story) D.story.on('drillStart');
  }
  function endDrill(lit) {
    const d = camp.drill;
    camp.drill = null;
    $('drill').hidden = true;
    const h = D.hero;
    if (h.action && h.action.drill) h.cancelAction();
    if (!d) return;
    if (lit) {
      D.items.remove('stick', 1);
      D.items.remove('fiber', 2);
      camp.light(d.fire.id, d.fire.id === 'night' ? 150 : 260);
      if (D.audio) D.audio.flare();
      if (D.story) D.story.on('fireLit', d.fire.id);
    }
  }
  function updateDrill(dt) {
    const d = camp.drill;
    if (!d) return;
    const h = D.hero;
    const input = D.input;
    if (!h.action || !h.action.drill || h.dead || D.state.mode !== 'play') {
      endDrill(false);
      return;
    }
    // walking away (W, S, Space) gives up
    if (['KeyW', 'KeyS', 'Space', 'ArrowUp', 'ArrowDown'].some((k) => input.pressed.has(k))) {
      endDrill(false);
      if (D.ui) D.ui.toast('Stopped sawing. E at the fire pit to try again.');
      return;
    }
    const now = performance.now();
    for (const key of ['KeyA', 'KeyD']) {
      if (!input.pressed.has(key) || d.ember) continue;
      const gap = (now - d.last) / 1000;
      if (key === d.next) {
        // a steady stroke: neither frantic nor slow
        const good = gap > 0.12 && gap < 0.8;
        const sweet = gap > 0.2 && gap < 0.5;
        d.heat += good ? (sweet ? 8.5 : 5.5) : 2;
        d.next = key === 'KeyA' ? 'KeyD' : 'KeyA';
        d.last = now;
        d.strokes++;
        if (D.audio) D.audio.saw(d.heat / 100);
      } else d.heat -= 4;
    }
    if (!d.ember) {
      d.heat = clamp(d.heat - dt * 7, 0, 100);
      if (d.heat >= 100) {
        d.ember = true;
        d.emberT = 4;
        if (D.audio) D.audio.chime();
      }
    } else {
      d.emberT -= dt;
      if (input.pressed.has('KeyE')) {
        endDrill(true);
        return;
      }
      if (d.emberT <= 0) {
        d.ember = false;
        d.heat = 55;
        if (D.ui) D.ui.toast('The ember died. Saw again, and press E as soon as it glows.', true);
      }
    }
    // the action bar shows the heat; the keys show which to press
    h.action.t = d.ember ? 99.9 : d.heat;
    h.action.label = d.ember ? 'An ember! Press E to blow on it' : d.heat > 60 ? 'Smoke! Keep sawing...' : 'Saw the bow: A, D, A, D...';
    $('drill-a').classList.toggle('next', !d.ember && d.next === 'KeyA');
    $('drill-d').classList.toggle('next', !d.ember && d.next === 'KeyD');
    $('drill-e').classList.toggle('next', d.ember);
    $('drill-note').textContent = d.ember ? 'Blow on it now: E' : d.heat < 15 ? 'A, then D, then A... a steady rhythm, about two a second' : d.heat < 60 ? 'Good. Keep the rhythm going' : 'It smokes. Nearly there';
    // smoke from the spindle as it heats
    const f = d.fire;
    if (f.smoke) {
      f.group.visible = true;
      f.smoke.material.uniforms.amount.value = smoothstep(20, 90, d.heat);
    }
  }

  // ---------- What E does at a fire pit ----------

  const TINDER = { stick: 1, fiber: 2 };
  const PIT = { stone: 8, stick: 4 };
  const missing = (needs) => Object.entries(needs).filter(([k, n]) => !D.items.has(k, n))
    .map(([k, n]) => `${n - D.items.count(k)} ${(n - D.items.count(k) > 1 ? D.items.ITEMS[k].plural : D.items.ITEMS[k].name).toLowerCase()}`);
  camp.pitNeeds = PIT;
  camp.tinderNeeds = TINDER;

  function target(x, z) {
    const c = chap();
    if (!c || !c.campSpots) return null;
    for (const id of c.campSpots()) {
      const s = camp.spot(id);
      if (!s || Math.hypot(s.x - x, s.z - z) > 4) continue;
      const f = fireAt(id);
      if (!f.built) {
        const lack = missing(PIT);
        return { x: f.x, z: f.z, reach: 3.2, bias: -0.4, label: 'Build a fire pit here', cannot: lack.length ? `Still need ${lack.join(', ')}` : null,
          act: () => {
            const h = D.hero;
            if (h.startAction('Building the fire pit', 3.5, { pose: 'build', fixed: true, onDone: () => {
              for (const [k, n] of Object.entries(PIT)) D.items.remove(k, n);
              camp.build(id);
              if (D.audio) D.audio.craft();
              if (D.story) D.story.on('pitBuilt', id);
            }, sound: () => D.audio && D.audio.knock() })) h.action.face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
          } };
      }
      if (!f.lit) {
        // embers still warm: a puff brings it back
        if (f.out > 0 && f.out < 25) {
          return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: 'Blow on the embers', act: () => camp.light(id, 60) };
        }
        // a burning torch lights it at once (no need for the drill)
        if (camp.torchLit()) {
          return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: 'Light the fire with your torch', act: () => {
            const h = D.hero;
            if (h.startAction('Lighting the fire', 1.2, { pose: 'gather', onDone: () => {
              camp.light(id, 90);
              if (D.audio) D.audio.flare();
              if (D.story) D.story.on('fireLit', id);
            } })) h.action.face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
          } };
        }
        const lack = [];
        if (!D.items.has('bow')) lack.push('the bow');
        lack.push(...missing(TINDER));
        return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: 'Light the fire with the bow drill', cannot: lack.length ? `Needs ${lack.join(', ')} (tinder)` : null, act: () => startDrill(f) };
      }
      // lit: the most useful thing first
      const story = c.fireWants();
      if (D.items.has('torch') && !camp.torch.lit && (story === 'torch' || D.hero.weapon === 'torch')) {
        return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: 'Light a torch', act: () => lightTorch(f) };
      }
      if (f.ash >= 1 && (story === 'ash' || f.fuel < 1)) {
        return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: `Scoop out wood ash (${Math.floor(f.ash)})`, act: () => scoopAsh(f) };
      }
      const wood = D.items.has('stick') || D.items.has('branch');
      if (f.fuel < FUEL_MAX * 0.8 && wood) {
        return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: `Add wood to the fire (${fuelText(f)} left)`, act: () => addWood(f) };
      }
      if (D.items.has('torch') && !camp.torch.lit) return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: 'Light a torch', act: () => lightTorch(f) };
      if (f.ash >= 1) return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: `Scoop out wood ash (${Math.floor(f.ash)})`, act: () => scoopAsh(f) };
      return { x: f.x, z: f.z, reach: 3, bias: -0.4, label: `The fire: ${fuelText(f)} of wood left. Tab, At the fire`, cannot: null, act: () => D.ui.openPanel('kit') };
    }
    return null;
  }
  D.items.extraTargets.push(target);
  const fuelText = (f) => {
    const s = Math.max(0, f.fuel / burnRate(f));
    return s > 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`;
  };
  camp.fuelText = fuelText;

  // ---------- Work at the fire ----------

  const RECIPES = [
    { id: 'pots', name: 'Clay pots (3)', needs: { clay: 6 }, makes: { pot: 3 }, shape: 4, cook: 45, verb: 'baking', page: 'clay',
      desc: 'Roll the clay into coils, build three pots, and stand them in the embers to bake hard.' },
    { id: 'saltpetre', name: 'Saltpetre', needs: { nitre: 6, ash: 1, pot_water: 1 }, makes: { saltpetre: 2, pot: 1 }, shape: 3, cook: 30, verb: 'boiling down', page: 'saltpetre',
      desc: 'Soak the nitre crust, pour the water through the ash, and boil it down until white crystals are left.' },
    { id: 'fluid', name: 'Revival fluid', needs: { saltpetre: 2, revonite: 3, pot_water: 1 }, makes: { fluid: 1 }, shape: 3.5, cook: 25, verb: 'warming', page: 'fluid',
      desc: 'Grind the Revonite with a stone, stir it into the saltpetre water, and warm it by the fire. One dose.' },
    // Chapter 3: the lab, with its pots and its water, makes three at a time, both steps in one
    { id: 'doses', name: 'Revival fluid, three doses', needs: { nitre: 9, revonite: 9, ash: 2 }, makes: { fluid: 3 }, shape: 5, cook: 60, verb: 'brewing', page: 'lab', fire: 'lab',
      desc: 'At the lab\'s hearth: leach the nitre through the ash in the lab\'s pots, boil it down to saltpetre, and warm it with the ground Revonite. Three doses.' },
  ];
  camp.RECIPES = RECIPES;
  const recipe = (id) => RECIPES.find((r) => r.id === id);
  camp.busyWith = (id) => camp.processes.find((p) => p.recipe === id) || null;

  camp.startRecipe = (id) => {
    const h = D.hero;
    const f = camp.nearFire(h.pos.x, h.pos.z, 5);
    if (id === 'wood' || id === 'ash' || id === 'torch') {
      if (!f) return false;
      if (id === 'wood') addWood(f);
      if (id === 'ash') scoopAsh(f);
      if (id === 'torch') lightTorch(f);
      return true;
    }
    const r = recipe(id);
    if (!r || !f || camp.busyWith(id)) return false;
    if (r.fire && f.id !== r.fire) {
      if (D.ui) D.ui.toast('Only at the lab\'s hearth, by its door', true);
      return false;
    }
    if (Object.entries(r.needs).some(([k, n]) => !D.items.has(k, n))) return false;
    if (!h.startAction(`${r.name.replace(/ \(.*\)/, '')}: getting it ready`, r.shape, { pose: 'build', fixed: true, onDone: () => {
      for (const [k, n] of Object.entries(r.needs)) D.items.remove(k, n);
      camp.processes.push({ recipe: id, fire: f.id, t: 0 });
      if (D.audio) D.audio.craft();
      if (D.story) D.story.on('cooking', id);
    }, sound: () => D.audio && D.audio.knock() })) return false;
    h.action.face = Math.atan2(f.x - h.pos.x, f.z - h.pos.z);
    return true;
  };

  function updateProcesses(dt) {
    const h = D.hero;
    for (const p of [...camp.processes]) {
      const r = recipe(p.recipe);
      const f = camp.fire(p.fire);
      if (!r || !f) continue;
      if (f.lit) p.t = Math.min(r.cook, p.t + dt);
      else if (!p.warned) {
        p.warned = true;
        if (D.ui) D.ui.think('The fire\'s gone out. Nothing will cook without it.', 3.5);
      }
      if (f.lit) p.warned = false;
      // done: taken up as soon as you are back by the fire
      if (p.t >= r.cook && Math.hypot(f.x - h.pos.x, f.z - h.pos.z) < 30) {
        camp.processes.splice(camp.processes.indexOf(p), 1);
        for (const [k, n] of Object.entries(r.makes)) D.items.add(k, n, k === 'pot' && p.recipe !== 'pots');
        if (D.audio) D.audio.chime();
        if (D.story) D.story.on('cooked', p.recipe);
      }
    }
  }
  camp.progress = (id) => {
    const p = camp.busyWith(id);
    const r = recipe(id);
    if (!p || !r) return null;
    return { left: Math.max(0, r.cook - p.t), done: p.t >= r.cook, verb: r.verb, fire: p.fire };
  };

  // The kit's "At the fire" tab.
  camp.kitTab = () => {
    const it = D.items;
    const h = D.hero;
    const f = camp.nearFire(h.pos.x, h.pos.z, 5);
    const nearest = camp.nearestLit(h.pos.x, h.pos.z);
    const name = (k, n) => (n > 1 ? it.ITEMS[k].plural : it.ITEMS[k].name).toLowerCase();
    let head;
    if (f) {
      head = `<p class="build-how"><b>At your fire.</b> ${fuelText(f)} of wood left${f.ash >= 1 ? `, ${Math.floor(f.ash)} wood ash to scoop out` : ''}. Feed it sticks or branches to keep it going.</p>
        <div class="fire-acts">
          <button data-fire="wood" ${it.has('stick') || it.has('branch') ? '' : 'disabled'}>Add wood</button>
          <button data-fire="ash" ${f.ash >= 1 ? '' : 'disabled'}>Scoop ash${f.ash >= 1 ? ` (${Math.floor(f.ash)})` : ''}</button>
          <button data-fire="torch" ${it.has('torch') && !camp.torch.lit ? '' : 'disabled'}>Light a torch${it.has('torch') ? ` (${it.count('torch')})` : ''}</button>
        </div>`;
    } else {
      const where = nearest ? 'Walk back to your fire' : camp.fires.some((q) => q.built) ? 'Your fire is out: light it again (a burning torch, or the bow drill)' : 'You have no fire yet: build a fire pit at the camp by the pond';
      head = `<p class="build-how"><b>Not at a fire.</b> ${where} (the marker on your map, <kbd>M</kbd>). Everything here is done beside a burning fire.</p>`;
    }
    const c = chap();
    const cards = RECIPES.filter((r) => c && c.recipeOpen(r.id)).map((r) => {
      const prog = camp.progress(r.id);
      const needs = Object.entries(r.needs).map(([k, n]) => `<span class="${it.has(k, n) ? '' : 'short'}">${n} ${name(k, n)} (${it.count(k)})</span>`);
      const here = !r.fire || (f && f.id === r.fire);
      const can = !prog && f && here && Object.entries(r.needs).every(([k, n]) => it.has(k, n));
      const state = prog ? `<span class="state ready">${prog.done ? 'Ready' : `${Math.ceil(prog.left)} s`}</span>` : `<button data-fire="${r.id}" ${can ? '' : 'disabled'}>Make</button>`;
      const note = !prog && !here ? '<p class="cooking">Only at the lab\'s hearth, by its door.</p>' : prog ? `<p class="cooking">${prog.done ? 'Done: it is yours when you are back by the fire.' : `In the fire, ${r.verb}: ${Math.ceil(prog.left)} s more. You need not wait here.`}</p>` : '';
      return `<div class="recipe part"><h4>${r.name} <button class="how" data-read="${r.page}">How?</button></h4><p>${r.desc}</p><div class="needs">${needs.join('')}</div>${note}${state}</div>`;
    });
    return head + (cards.length ? cards.join('') : '<p class="kit-note">Nothing to make at the fire yet.</p>');
  };
  camp.kitWhere = () => {
    const it = D.items;
    const c = chap();
    const keys = [];
    for (const r of RECIPES) {
      if (!(c && c.recipeOpen(r.id)) || camp.busyWith(r.id)) continue;
      for (const [k, n] of Object.entries(r.needs)) if (!it.has(k, n) && !keys.includes(k)) keys.push(k);
    }
    if (!keys.length) return '';
    return `<h5>Where to find them</h5>${keys.map((k) => {
      const def = it.ITEMS[k];
      return `<div class="where"><i style="background:${def.color}"></i><b>${def.plural}</b><em class="short">${it.count(k)}</em><span>${def.where || ''}</span></div>`;
    }).join('')}`;
  };

  // ---------- The torch ----------

  let torchMesh = null;
  let torchFlame = null;
  function buildTorch() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.55, 6), D.addCaveShade(new THREE.MeshStandardMaterial({ color: D.col(0x7a5a3a), roughness: 0.9 })));
    stick.position.y = 0.12;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.032, 0.13, 7), D.addCaveShade(new THREE.MeshStandardMaterial({ color: D.col(0x5a4126), roughness: 1, emissive: new THREE.Color(0xff6a1a), emissiveIntensity: 0 })));
    head.position.y = 0.42;
    torchFlame = flameMesh();
    torchFlame.scale.set(0.18, 0.34, 1);
    torchFlame.position.y = 0.45;
    g.add(stick, head, torchFlame);
    g.userData.head = head;
    return g;
  }
  camp.showTorch = (on) => {
    if (!torchMesh) {
      torchMesh = buildTorch();
      torchMesh.position.set(0.02, 0.06, 0.03);
      torchMesh.rotation.set(0.25, 0, Math.PI - 0.15);
      D.hero.attach('torch', torchMesh, 'handR');
    }
    torchMesh.visible = on;
  };
  camp.torchLit = () => camp.torch.lit && camp.torch.left > 0;
  camp.torchBadge = () => {
    const n = D.items.count('torch');
    if (camp.torchLit()) return `${Math.ceil(camp.torch.left)}s`;
    return n ? `${n}` : '';
  };
  // is there light to see by here (a lit torch in hand)?
  camp.holdingLight = () => camp.torchLit() && D.hero.weapon === 'torch';

  const torchAt = new THREE.Vector3();
  function updateTorch(dt, time) {
    const t = camp.torch;
    const held = D.hero.weapon === 'torch';
    if (t.lit && held && D.state.mode === 'play' && !D.state.panel) {
      t.left -= dt;
      if (t.left <= 0) {
        if (D.items.has('torch')) {
          D.items.remove('torch', 1);
          t.left = TORCH_TIME;
          if (D.ui) D.ui.toast('The torch burned down. You light the next from its last flame.');
        } else {
          t.lit = false;
          t.left = 0;
          if (D.ui) D.ui.think('The torch is out. I need another, lit at the fire.', 3.5, true);
          if (D.story) D.story.on('torchOut');
        }
        if (D.ui) D.ui.hotbar();
      }
    }
    const shown = !!torchMesh && torchMesh.visible;
    const burning = t.lit && shown;
    if (torchFlame) torchFlame.visible = burning;
    if (torchMesh) torchMesh.userData.head.material.emissiveIntensity = burning ? 0.8 : 0;
    if (burning) {
      torchFlame.getWorldPosition(torchAt);
      const flick = 0.85 + 0.15 * Math.sin(time * 17.3) * Math.sin(time * 7.1 + 1.3);
      U.torchL.value.set(torchAt.x, torchAt.y + 0.15, torchAt.z, (1.3 + 1.4 * D.env.night) * flick * (camp.torchDim || 1));
    } else U.torchL.value.set(0, -999, 0, 0);
  }

  // ---------- Each frame ----------

  let hudDue = 0;
  camp.update = (dt, time) => {
    if (!chap() || !chap().campSpots) {
      U.fireA.value.w = 0;
      U.fireB.value.w = 0;
      U.torchL.value.w = 0;
      U.localOn.value = 0;
      return;
    }
    updateDrill(dt);
    const slots = [U.fireA, U.fireB];
    let n = 0;
    let glow = 0; // the embers in the logs
    // (the two lit fires nearest the camera are the ones that light things)
    const cam = D.camera.position;
    const lit = camp.fires.filter((f) => f.lit).sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z)).slice(0, 2);
    for (const f of camp.fires) {
      if (f.lit && dt > 0) {
        f.fuel -= dt * burnRate(f);
        f.burnt += dt;
        if (f.burnt > 20) {
          f.burnt = 0;
          f.ash = Math.min(4, f.ash + 1);
        }
        if (f.fuel <= 0) {
          f.fuel = 0;
          f.lit = false;
          f.out = 0.01;
          if (D.story) D.story.on('fireOut', f.id);
        }
      } else if (f.out > 0) f.out += dt;
      if (!f.group) continue;
      const k = f.lit ? clamp(0.45 + 0.55 * (f.fuel / 200), 0.45, 1) : 0;
      f.flames.visible = f.lit;
      f.flames.scale.set(0.75 * k + 0.2, 1.25 * k, 1);
      f.spk.material.uniforms.amount.value = f.lit ? k : 0;
      if (!camp.drill || camp.drill.fire !== f) f.smoke.material.uniforms.amount.value = f.lit ? 0.5 + 0.5 * k : f.out > 0 && f.out < 40 ? 0.35 : 0;
      // green ferns on it: a thick, choking smoke (Chapter 3, at the cave mouth)
      if (f.smoky && f.lit) {
        f.smoke.material.uniforms.amount.value = 1;
        f.smoke.scale.setScalar(2.4);
      } else if (f.smoke.scale.x !== 1) f.smoke.scale.setScalar(1);
      f.spk.material.uniforms.time.value = time;
      f.smoke.material.uniforms.time.value = time;
      const scale = (window.innerHeight * D.pixelRatio) / (2 * Math.tan((D.camera.fov * Math.PI) / 360));
      f.spk.material.uniforms.scale.value = scale;
      f.smoke.material.uniforms.scale.value = scale;
      glow = Math.max(glow, f.lit ? 0.35 + 0.25 * k : f.out > 0 && f.out < 25 ? 0.25 : 0);
      if (f.lit && n < 2 && lit.includes(f)) {
        const flick = 0.82 + 0.1 * Math.sin(time * 11.7 + f.x) + 0.08 * Math.sin(time * 23.1);
        slots[n++].value.set(f.x, f.y + 0.9, f.z, (0.55 + 2.4 * D.env.night) * (0.6 + 0.4 * k) * flick);
      }
    }
    for (; n < 2; n++) slots[n].value.set(0, -999, 0, 0);
    if (woodMat) woodMat.emissiveIntensity = glow;
    if (flameMaterial) flameMaterial.uniforms.time.value = time;
    updateTorch(dt, time);
    U.localOn.value = U.fireA.value.w > 0 || U.fireB.value.w > 0 || U.torchL.value.w > 0 ? 1 : 0;
    if (dt > 0) updateProcesses(dt);
    // the fire's crackle, when near one
    hudDue -= dt;
    if (hudDue <= 0 && D.audio) {
      hudDue = 0.5;
      const h = D.hero.pos;
      const near = camp.nearestLit(h.x, h.z);
      const d = near ? Math.hypot(near.x - h.x, near.z - h.z) : 99;
      D.audio.fireLevel(smoothstep(22, 2, d) + (camp.holdingLight() ? 0.25 : 0));
    }
  };

  // ---------- Saving ----------

  camp.save = () => ({
    fires: camp.fires.map((f) => ({ id: f.id, built: f.built, lit: f.lit, fuel: Math.round(f.fuel), ash: f.ash })),
    processes: camp.processes.map((p) => ({ recipe: p.recipe, fire: p.fire, t: Math.round(p.t) })),
    torch: { lit: camp.torch.lit, left: Math.round(camp.torch.left) },
  });
  camp.load = (s) => {
    for (const f of camp.fires) if (f.group) f.group.visible = false;
    camp.fires.length = 0;
    camp.processes.length = 0;
    if (camp.drill) endDrill(false);
    for (const q of (s && s.fires) || []) {
      const f = fireAt(q.id);
      if (!f) continue;
      Object.assign(f, { built: q.built, lit: q.lit, fuel: q.fuel || 0, ash: q.ash || 0, out: 0 });
      if (f.built) showFire(f);
    }
    for (const p of (s && s.processes) || []) camp.processes.push({ recipe: p.recipe, fire: p.fire, t: p.t || 0 });
    camp.torch.lit = !!(s && s.torch && s.torch.lit);
    camp.torch.left = (s && s.torch && s.torch.left) || 0;
  };

  D.camp = camp;
})();
