// The New Dawn: the lab (Chapter 3).
//
// A storeroom at the foot of the Elder Tree, beside the shelter: corner posts, walls of woven
// sticks with clay pressed in (wattle and daub), a roof of big leaves, racks inside. Tall enough
// to walk into and stand up in (the walls 2.5 m, the ridge 3.4 m, the doorway 2.25 m: the hero is
// 1.8 m), so it never looks too small for the people in it. Mira's twelve clay pots stand on the
// racks, each with its name painted on, and what you store in them stays there; a clay hearth by
// the door is where the doses are brewed, three at a time.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, seeded, smooth } = D;
  const T = D.terrain;
  const L = D.LAYOUT;

  const W = 6; // along the shelter's length
  const DEPTH = 4.5; // out from the tree
  const WALL = 2.5;
  const RIDGE = 3.4;
  const DOOR_W = 1.25;
  const DOOR_H = 2.25;
  const DOOR_U = -0.9; // the doorway, in the front wall, a little toward the shelter

  const STAGES = [
    { name: 'posts', title: 'Posts and beams', label: 'Raise the posts', needs: { pole: 4, vine: 2 }, time: 6,
      desc: 'Four poles sunk at the corners and two for the doorway, beams lashed along the tops with vine.' },
    { name: 'walls', title: 'Woven walls', label: 'Weave the walls', needs: { stick: 14, vine: 2 }, time: 7,
      desc: 'Thin sticks woven in and out between upright stakes, all round: wattle.' },
    { name: 'daub', title: 'Clay walls and a hearth', label: 'Press clay into the walls', needs: { clay: 6, stone: 4 }, time: 7,
      desc: 'Wet clay pressed into the weave and smoothed by hand (daub): it dries hard and keeps out wind and damp. Stones and clay for a hearth by the door.' },
    { name: 'roof', title: 'Roof', label: 'Raise the roof', needs: { pole: 4, big_leaf: 14, vine: 3 }, time: 8,
      desc: 'A ridge pole, rafters, and big leaves overlapped like tiles: high enough inside to stand, and the rain runs off.' },
    { name: 'racks', title: 'Racks', label: 'Build the racks', needs: { pole: 2, stick: 6, vine: 2 }, time: 6,
      desc: 'Shelves of poles and sticks along the back wall, for the pots.' },
  ];

  // The pots, left to right, top shelf first: what Mira paints on each, and what goes in it.
  const POTS = [
    ['FLUID', 'fluid'], ['FLUID', 'fluid'], ['FLUID', 'fluid'], ['REVONITE', 'revonite'],
    ['NITRE', 'nitre'], ['SALTPETRE', 'saltpetre'], ['ASH', 'ash'], ['RESIN', 'resin'],
    ['WATER', 'pot_water'], ['FIBRE', 'fiber'], ['CLAY', 'clay'], ['SEEDS', null],
  ];

  const lab = { STAGES, POTS, stage: 0, group: new THREE.Group(), pieces: STAGES.map(() => []), building: null, store: {}, potsShown: 0, plannedFlag: false };
  D.scene.add(lab.group);

  // Where it stands: beside the shelter, worked out the way the shelter's own place is (from the
  // trail's end), so the jungle can be kept off it before anything is built.
  const frame = (() => {
    const end = L.paths[2][L.paths[2].length - 1];
    let ox = end[0] - L.tree.x;
    let oz = end[1] - L.tree.z;
    const len = Math.hypot(ox, oz) || 1;
    ox /= len;
    oz /= len;
    const ax = oz;
    const az = -ox;
    // the shelter's middle is 4.25 m out from the trunk; the lab, 9 m along from it and 1.5 m out
    const px = L.tree.x + ox * 4.25;
    const pz = L.tree.z + oz * 4.25;
    return { cx: px + ax * 9 + ox * 1.5, cz: pz + az * 9 + oz * 1.5, ax, az, ox, oz, y: 0 };
  })();
  lab.frame = frame;
  D.flora.reserved.push([frame.cx, frame.cz, 6.5]);
  const at = (u, v, up = 0) => new THREE.Vector3(frame.cx + frame.ax * u + frame.ox * v, frame.y + up, frame.cz + frame.az * u + frame.oz * v);
  lab.at = at;
  const turn = () => Math.atan2(frame.ox, frame.oz); // a mesh turned by this: its x along, its z out
  // where a point is in the lab's own terms
  const local = (x, z) => {
    const dx = x - frame.cx;
    const dz = z - frame.cz;
    return { u: dx * frame.ax + dz * frame.az, v: dx * frame.ox + dz * frame.oz };
  };
  lab.local = local;

  // ---------- Looks ----------

  // Wattle: upright stakes with withies woven between, gaps of daylight.
  function wattleTexture() {
    return D.canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let row = 0; row < 10; row++) {
        const y = row * 25.6 + 6;
        for (let col = 0; col < 8; col++) {
          const x = col * 32;
          const over = (row + col) % 2 === 0;
          g.fillStyle = over ? '#8a6a44' : '#6e5232';
          g.beginPath();
          g.ellipse(x + 16, y + 6, 18, 7.5, (Math.random() - 0.5) * 0.08, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(40,26,12,0.45)';
          g.lineWidth = 1.5;
          g.stroke();
        }
      }
      for (let col = 0; col < 8; col++) {
        const x = col * 32 + 1;
        g.fillStyle = '#5a412a';
        g.fillRect(x - 3, 0, 6, h);
      }
    }, { repeat: true });
  }
  // Daub: clay smoothed by hand, finger marks and cracks as it dried.
  function daubTexture() {
    return D.canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#a58c6c';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 90; n++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 10 + Math.random() * 26;
        const v = Math.random();
        g.strokeStyle = `rgba(${120 + v * 50},${100 + v * 40},${74 + v * 30},0.16)`;
        g.lineWidth = 3 + Math.random() * 4;
        g.beginPath();
        g.arc(x, y, r, Math.random() * 6, Math.random() * 6 + 1.6);
        g.stroke();
      }
      for (let n = 0; n < 900; n++) {
        const v = Math.random();
        g.fillStyle = `rgba(${90 + v * 70},${74 + v * 56},${52 + v * 40},0.3)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      g.strokeStyle = 'rgba(70,52,34,0.5)';
      g.lineWidth = 1;
      for (let n = 0; n < 12; n++) {
        let x = Math.random() * w;
        let y = Math.random() * h;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (Math.random() - 0.5) * 22;
          y += Math.random() * 16;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }, { repeat: true });
  }
  // Thatch, under the leaves: a dense mat of dry grass and leaf, so no daylight shows through.
  function thatchTexture() {
    return D.canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#4a4a26';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 1400; n++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const v = Math.random();
        g.strokeStyle = `rgba(${90 + v * 70},${86 + v * 60},${40 + v * 30},0.55)`;
        g.lineWidth = 1 + Math.random() * 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 6, y + 14 + Math.random() * 20);
        g.stroke();
      }
    }, { repeat: true });
  }
  // A painted name, for a pot: ochre on clay, a brush's ragged edge.
  function labelTexture(text) {
    const tex = D.canvasTexture(256, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(232,214,178,0.92)';
      g.beginPath();
      g.ellipse(w / 2, h / 2, w * 0.47, h * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      const size = text.length > 7 ? 30 : 38;
      g.font = `700 ${size}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = text === 'FLUID' ? '#1d7a52' : text === 'REVONITE' ? '#1f6e4c' : '#7a2e14';
      g.save();
      g.translate(w / 2, h / 2 + 2);
      g.rotate((Math.random() - 0.5) * 0.06);
      g.fillText(text, 0, 0);
      g.globalAlpha = 0.35;
      g.fillText(text, 1.5, 1);
      g.restore();
    }, { repeat: false });
    return tex;
  }

  let mats = null;
  function materials() {
    if (mats) return mats;
    const wattleMap = wattleTexture();
    const daubMap = daubTexture();
    mats = {
      wood: new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), normalMap: D.photo('bark', 'normal'), color: D.col(0xd8c4a4), roughness: 0.9 }),
      wattle: new THREE.MeshStandardMaterial({ map: wattleMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 }),
      daub: new THREE.MeshStandardMaterial({ map: daubMap, roughness: 0.96, color: D.col(0xe6d7c0) }),
      vine: new THREE.MeshStandardMaterial({ color: D.col(0x6f8a48), roughness: 0.85 }),
      leaf: D.shelter.leafMat || new THREE.MeshStandardMaterial({ color: D.col(0x3d6626), side: THREE.DoubleSide }),
      floor: new THREE.MeshStandardMaterial({ map: daubMap, color: D.col(0x9c8a72), roughness: 1 }),
      thatch: new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.3 }),
      pot: new THREE.MeshStandardMaterial({ color: D.col(0xb4704a), roughness: 0.85 }),
      potDark: new THREE.MeshStandardMaterial({ color: D.col(0x8a5236), roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: D.col(0x8f8a80), roughness: 0.96 }),
    };
    return mats;
  }

  // ---------- Building it ----------

  function pole(a, b, r, material) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r * 0.85, r, len, 7);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * len * 0.7);
    const m = new THREE.Mesh(g, material);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  // A flat panel (wall) from u0 to u1 along a side, from up0 to up1: along the front/back walls
  // (side 'v', at v) or the end walls (side 'u', at u), `thick` deep.
  function panel(side, at0, a0, a1, up0, up1, thick, material, uScale = 1) {
    const len = a1 - a0;
    const g = new THREE.BoxGeometry(len, up1 - up0, thick);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 0.75 * uScale, uv.getY(i) * (up1 - up0) * 0.75);
    const m = new THREE.Mesh(g, material);
    const mid = (a0 + a1) / 2;
    m.position.copy(side === 'v' ? at(mid, at0, (up0 + up1) / 2) : at(at0, mid, (up0 + up1) / 2));
    m.rotation.y = turn() + (side === 'v' ? 0 : Math.PI / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  // A gable's triangle, at the end wall u, from the wall top to the ridge.
  function gable(u, material, inset = 0) {
    const shape = new THREE.Shape();
    const hw = DEPTH / 2 - inset;
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(0, RIDGE - WALL - inset * 0.4);
    shape.lineTo(-hw, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    g.translate(0, 0, -0.05);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.75, uv.getY(i) * 0.75);
    const m = new THREE.Mesh(g, material);
    m.position.copy(at(u, 0, WALL));
    // local x along v (out), local z along -u: turned a quarter from the front walls
    m.rotation.y = turn() + Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function bundle(meshes) {
    const m = new THREE.Mesh(D.models.joinGeometries(meshes.map((p) => {
      p.updateMatrix();
      return p.geometry.clone().applyMatrix4(p.matrix);
    })), meshes[0].material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function cards(list, material) {
    const g = D.models.joinGeometries(list.map(({ w, h, matrix }) => new THREE.PlaneGeometry(w, h).applyMatrix4(matrix)));
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function buildPieces() {
    const M = materials();
    const random = seeded(4811);
    const add = (stage, mesh) => {
      mesh.userData.final = { pos: mesh.position.clone(), quat: mesh.quaternion.clone(), scale: mesh.scale.clone() };
      mesh.userData.from = mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      mesh.visible = false;
      lab.group.add(mesh);
      lab.pieces[stage].push(mesh);
    };
    const hu = W / 2;
    const hv = DEPTH / 2;
    const sink = (u, v) => {
      const p = at(u, v);
      return new THREE.Vector3(p.x, Math.min(frame.y, T.height(p.x, p.z)) - 0.25, p.z);
    };
    // the floor: packed earth, flat, so it is always there under the walls
    const floorGeo = new THREE.PlaneGeometry(W + 0.2, DEPTH + 0.2);
    const uv = floorGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2.2);
    const floor = new THREE.Mesh(floorGeo, M.floor);
    floor.rotation.set(-Math.PI / 2, 0, turn());
    floor.position.copy(at(0, 0, 0.02));
    floor.receiveShadow = true;
    lab.floorMesh = floor;
    lab.group.add(floor);

    // 1. posts at the corners, two at the doorway, two to hold the ridge, beams along the tops
    for (const [u, v] of [[-hu, -hv], [hu, -hv], [-hu, hv], [hu, hv]]) add(0, pole(sink(u, v), at(u, v, WALL + 0.1), 0.1, M.wood));
    for (const u of [DOOR_U - DOOR_W / 2 - 0.06, DOOR_U + DOOR_W / 2 + 0.06]) add(0, pole(sink(u, hv), at(u, hv, WALL), 0.075, M.wood));
    for (const u of [-hu, hu]) add(0, pole(sink(u, 0), at(u, 0, RIDGE + 0.1), 0.09, M.wood));
    for (const v of [-hv, hv]) add(0, pole(at(-hu - 0.25, v, WALL), at(hu + 0.25, v, WALL), 0.07, M.wood));
    for (const u of [-hu, hu]) add(0, pole(at(u, -hv - 0.2, WALL - 0.05), at(u, hv + 0.2, WALL - 0.05), 0.065, M.wood));
    add(0, pole(at(DOOR_U - DOOR_W / 2 - 0.1, hv, DOOR_H), at(DOOR_U + DOOR_W / 2 + 0.1, hv, DOOR_H), 0.06, M.wood));
    // 2. wattle all round (a doorway left in the front), and the gables
    const walls = (stage, material, thick, out) => {
      const list = [];
      list.push(panel('v', -hv - out, -hu, hu, 0, WALL, thick, material));
      list.push(panel('v', hv + out, -hu, DOOR_U - DOOR_W / 2, 0, WALL, thick, material));
      list.push(panel('v', hv + out, DOOR_U + DOOR_W / 2, hu, 0, WALL, thick, material));
      list.push(panel('v', hv + out, DOOR_U - DOOR_W / 2, DOOR_U + DOOR_W / 2, DOOR_H, WALL, thick, material));
      list.push(panel('u', -hu - out, -hv, hv, 0, WALL, thick, material));
      list.push(panel('u', hu + out, -hv, hv, 0, WALL, thick, material));
      list.forEach((m) => add(stage, m));
      for (const u of [-hu - out, hu + out]) add(stage, gable(u, material, out > 0 ? 0.02 : 0));
    };
    walls(1, M.wattle, 0.06, 0);
    // 3. daub over it, inside and out (a clay skin each side of the weave), and the hearth
    walls(2, M.daub, 0.05, 0.05);
    walls(2, M.daub, 0.05, -0.05);
    // 4. the roof: ridge, rafters, and overlapping rows of leaves down each side
    add(3, pole(at(-hu - 0.5, 0, RIDGE), at(hu + 0.5, 0, RIDGE), 0.075, M.wood));
    for (const u of [-hu, -hu / 2, 0, hu / 2, hu]) {
      for (const s of [-1, 1]) add(3, pole(at(u, 0, RIDGE + 0.02), at(u, s * (hv + 0.55), WALL - 0.22), 0.05, M.wood));
    }
    const along = new THREE.Vector3(frame.ax, 0, frame.az);
    for (const s of [-1, 1]) {
      // the mat under the leaves, ridge to eave
      const top = at(0, 0, RIDGE + 0.01);
      const eave = at(0, s * (hv + 0.6), WALL - 0.2);
      const slope = top.distanceTo(eave);
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.0, slope), M.thatch);
      const uvs = mat.geometry.attributes.uv;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 4, uvs.getY(i) * 2);
      mat.position.copy(top).lerp(eave, 0.5);
      const down = eave.clone().sub(top).normalize();
      const up = new THREE.Vector3().crossVectors(down, along).normalize();
      if (up.y < 0) up.negate();
      const x = new THREE.Vector3().crossVectors(up, down).normalize();
      mat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, down.clone().negate(), up));
      mat.castShadow = true;
      mat.receiveShadow = true;
      add(3, mat);
      for (let row = 0; row < 4; row++) {
        const list = [];
        for (let k = 0; k < 9; k++) {
          const u = -hu - 0.45 + (k / 8) * (W + 0.9) + (random() - 0.5) * 0.12;
          const top = at(u, 0, RIDGE + 0.06);
          const eave = at(u, s * (hv + 0.6), WALL - 0.18);
          const down = eave.clone().sub(top);
          const slope = down.length();
          down.normalize();
          const up = new THREE.Vector3().crossVectors(down, along).normalize();
          if (up.y < 0) up.negate();
          const dist = Math.min(slope - 0.85, 0.9 + row * 0.62);
          const pos = top.clone().addScaledVector(down, dist).addScaledVector(up, 0.05 + 0.025 * (3 - row));
          const x = new THREE.Vector3().crossVectors(up, down).normalize();
          const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, down.clone().negate(), up));
          quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (random() - 0.5) * 0.2));
          list.push({ w: 1.05, h: 1.95, matrix: new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1)) });
        }
        add(3, cards(list, M.leaf));
      }
    }
    // 5. the racks: along the back wall, three shelves; a smaller one on the far end wall
    const rack = [];
    const shelves = [0.42, 0.98, 1.54];
    for (const u of [-2.3, -0.75, 0.75, 2.3]) rack.push(pole(at(u, -hv + 0.45, 0), at(u, -hv + 0.45, 2.0), 0.045, M.wood));
    for (const y of shelves) {
      for (const dv of [0.2, 0.45, 0.7]) rack.push(pole(at(-2.45, -hv + dv, y), at(2.45, -hv + dv, y), 0.03, M.wood));
    }
    add(4, bundle(rack));
    const side = [];
    for (const v of [-1.2, 0.6]) side.push(pole(at(hu - 0.45, v, 0), at(hu - 0.45, v, 1.5), 0.04, M.wood));
    for (const y of [0.45, 1.05]) for (const du of [0.25, 0.5]) side.push(pole(at(hu - du, -1.35, y), at(hu - du, 0.75, y), 0.028, M.wood));
    add(4, bundle(side));
    // a bench, by the end wall near the door
    const bench = [];
    for (const [u, v] of [[-2.55, 0.2], [-2.55, 1.4], [-2.05, 0.2], [-2.05, 1.4]]) bench.push(pole(at(u, v, 0), at(u, v, 0.78), 0.035, M.wood));
    for (const v of [0.15, 0.4, 0.65, 0.9, 1.15, 1.4]) bench.push(pole(at(-2.65, v, 0.8), at(-1.95, v, 0.8), 0.035, M.wood));
    add(4, bundle(bench));
    lab.shelves = shelves;
  }

  // The pots: twelve on the back rack, labelled, and a row of spares on the side rack.
  function buildPots() {
    const M = materials();
    const profile = [[0, 0], [0.1, 0], [0.15, 0.04], [0.185, 0.13], [0.18, 0.22], [0.13, 0.3], [0.095, 0.33], [0.105, 0.36], [0.098, 0.375]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const potGeo = new THREE.LatheGeometry(profile, 16);
    const lidGeo = new THREE.CylinderGeometry(0.105, 0.11, 0.025, 14);
    lidGeo.translate(0, 0.385, 0);
    const knob = new THREE.SphereGeometry(0.025, 8, 6);
    knob.translate(0, 0.405, 0);
    const lidAll = D.models.joinGeometries([lidGeo, knob]);
    lab.pots = POTS.map(([text, key], i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const u = -1.95 + col * 1.3;
      const y = lab.shelves[row] + 0.03;
      const p = at(u, -DEPTH / 2 + 0.45, y);
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = turn();
      const body = new THREE.Mesh(potGeo, i % 3 === 1 ? M.potDark : M.pot);
      body.castShadow = true;
      body.receiveShadow = true;
      const lid = new THREE.Mesh(lidAll, M.potDark);
      lid.castShadow = true;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), new THREE.MeshStandardMaterial({ map: labelTexture(text), transparent: true, alphaTest: 0.2, roughness: 0.9 }));
      label.position.set(0, 0.19, 0.188);
      label.visible = false;
      g.add(body, lid, label);
      g.visible = false;
      lab.group.add(g);
      return { text, key, group: g, label, lid, x: p.x, z: p.z, y: p.y, u, row };
    });
    // spares, unlabelled, on the side rack
    const spare = [];
    for (let k = 0; k < 8; k++) {
      const y = k < 4 ? 0.48 : 1.08;
      const v = -1.1 + (k % 4) * 0.55;
      const m = new THREE.Mesh(potGeo, k % 2 ? M.pot : M.potDark);
      m.position.copy(at(W / 2 - 0.38, v, y));
      m.scale.setScalar(0.8 + ((k * 37) % 10) / 40);
      spare.push(m);
    }
    lab.spares = bundle(spare);
    lab.spares.visible = false;
    lab.group.add(lab.spares);
  }

  // The mural Mira paints on the outside of the end wall, by the fire: a man waking in a cave.
  function muralTexture() {
    return D.canvasTexture(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // the cave's arch, in charcoal
      g.strokeStyle = 'rgba(30,22,16,0.85)';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(40, 230);
      g.bezierCurveTo(60, 40, 300, 20, 330, 230);
      g.stroke();
      // the green glow behind him
      const glow = g.createRadialGradient(190, 150, 10, 190, 150, 110);
      glow.addColorStop(0, 'rgba(70,200,130,0.75)');
      glow.addColorStop(1, 'rgba(70,200,130,0)');
      g.fillStyle = glow;
      g.fillRect(60, 40, 260, 190);
      // the man, in red ochre: rising, one arm up
      g.strokeStyle = 'rgba(150,52,22,0.95)';
      g.lineWidth = 9;
      g.beginPath();
      g.arc(190, 92, 15, 0, Math.PI * 2);
      g.moveTo(190, 108);
      g.lineTo(186, 165);
      g.moveTo(188, 122);
      g.lineTo(222, 92);
      g.moveTo(188, 124);
      g.lineTo(160, 148);
      g.moveTo(186, 165);
      g.lineTo(168, 214);
      g.moveTo(186, 165);
      g.lineTo(208, 212);
      g.stroke();
      // the ring, in the sky to the right
      g.strokeStyle = 'rgba(60,170,110,0.9)';
      g.lineWidth = 7;
      g.beginPath();
      g.ellipse(420, 80, 46, 30, -0.3, 0, Math.PI * 2);
      g.stroke();
      // the three of them, small, walking toward it
      g.strokeStyle = 'rgba(70,46,24,0.9)';
      g.lineWidth = 5;
      for (const [x, s] of [[380, 1], [410, 0.9], [440, 1.05]]) {
        g.beginPath();
        g.arc(x, 186 - 34 * s, 6 * s, 0, Math.PI * 2);
        g.moveTo(x, 186 - 27 * s);
        g.lineTo(x, 186);
        g.moveTo(x, 186);
        g.lineTo(x - 7, 214);
        g.moveTo(x, 186);
        g.lineTo(x + 7, 214);
        g.stroke();
      }
    }, { repeat: false });
  }
  function buildMural() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: muralTexture(), transparent: true, alphaTest: 0.05, roughness: 0.95 }));
    // on the outside of the end wall nearer the shelter (the fire side)
    m.position.copy(at(-W / 2 - 0.11, 0.1, 1.45));
    m.rotation.y = turn() - Math.PI / 2;
    m.visible = false;
    lab.group.add(m);
    lab.mural = m;
  }

  lab.build = () => {
    // a flat floor, at the highest ground under it
    let top = -Infinity;
    for (const [u, v] of [[-3, -2.25], [3, -2.25], [-3, 2.25], [3, 2.25], [0, 0]]) {
      const p = at(u, v);
      top = Math.max(top, T.height(p.x, p.z));
    }
    frame.y = top + 0.05;
    const h = at(DOOR_U + 2.3, DEPTH / 2 + 1.7);
    lab.hearth = { x: h.x, z: h.z };
    if (D.camp) D.camp.addSpot('lab', { x: h.x, z: h.z, label: 'The lab\'s hearth' });
    buildPieces();
    buildPots();
    buildMural();
    lab.site = at(-2.4, DEPTH / 2 + 2.4); // (clear of the hearth, so E there builds)
    lab.door = at(DOOR_U, DEPTH / 2 + 0.2);
    lab.setStage(0);
  };

  lab.setStage = (n) => {
    lab.stage = n;
    lab.pieces.forEach((list, s) => list.forEach((m) => {
      m.visible = s < n;
      if (m.visible) {
        m.position.copy(m.userData.final.pos);
        m.quaternion.copy(m.userData.final.quat);
        m.scale.copy(m.userData.final.scale);
      }
    }));
    lab.floorMesh.visible = n >= 1;
    lab.showPots(lab.potsShown);
  };
  // the first n pots on the racks (and their labels, once painted)
  lab.showPots = (n, labelled = lab.labelled) => {
    lab.potsShown = n;
    lab.labelled = labelled;
    (lab.pots || []).forEach((p, i) => {
      p.group.visible = i < n && lab.stage >= 5;
      p.label.visible = labelled;
    });
    if (lab.spares) lab.spares.visible = n >= POTS.length && lab.stage >= 5;
  };
  lab.planned = () => !!(D.story && D.story.flags.labPlanned);
  lab.done = () => lab.stage >= STAGES.length;

  // ---------- Walking in it ----------

  // The walls, as segments in the lab's own terms (u, v), a gap where the door is.
  const SEGS = (() => {
    const hu = W / 2;
    const hv = DEPTH / 2;
    return [
      [[-hu, -hv], [hu, -hv]], [[-hu, -hv], [-hu, hv]], [[hu, -hv], [hu, hv]],
      [[-hu, hv], [DOOR_U - DOOR_W / 2, hv]], [[DOOR_U + DOOR_W / 2, hv], [hu, hv]],
    ];
  })();
  lab.collide = (pos, r) => {
    if (lab.stage < 2) {
      // just posts
      if (lab.stage < 1) return;
    }
    const { u, v } = local(pos.x, pos.z);
    if (Math.abs(u) > W / 2 + 1.5 || Math.abs(v) > DEPTH / 2 + 1.5) return;
    let pu = u;
    let pv = v;
    const segs = lab.stage >= 2 ? SEGS : [];
    const thick = 0.12;
    for (const [[u0, v0], [u1, v1]] of segs) {
      const du = u1 - u0;
      const dv = v1 - v0;
      const len2 = du * du + dv * dv;
      const t = clamp(((pu - u0) * du + (pv - v0) * dv) / len2, 0, 1);
      const cu = u0 + du * t;
      const cv = v0 + dv * t;
      const eu = pu - cu;
      const ev = pv - cv;
      const d = Math.hypot(eu, ev);
      const min = r + thick;
      if (d < min && d > 1e-5) {
        pu = cu + (eu / d) * min;
        pv = cv + (ev / d) * min;
      }
    }
    // the posts (and, once built, the racks' ends)
    const posts = [[-W / 2, -DEPTH / 2], [W / 2, -DEPTH / 2], [-W / 2, DEPTH / 2], [W / 2, DEPTH / 2], [DOOR_U - DOOR_W / 2 - 0.06, DEPTH / 2], [DOOR_U + DOOR_W / 2 + 0.06, DEPTH / 2]];
    for (const [qu, qv] of posts) {
      const eu = pu - qu;
      const ev = pv - qv;
      const d = Math.hypot(eu, ev);
      const min = r + 0.12;
      if (d < min && d > 1e-5) {
        pu = qu + (eu / d) * min;
        pv = qv + (ev / d) * min;
      }
    }
    // the racks and the bench, once there: keep off them
    if (lab.stage >= 5) {
      pv = Math.max(pv, -DEPTH / 2 + 0.85 + r * 0.3);
      if (pu > W / 2 - 0.9 && pv < 0.85) pu = Math.min(pu, W / 2 - 0.75 - r * 0.3);
      if (pu < -W / 2 + 1.25 && pv > 0.05 && pv < 1.55) pu = Math.max(pu, -W / 2 + 1.1 + r * 0.3);
    }
    if (pu !== u || pv !== v) {
      pos.x = frame.cx + frame.ax * pu + frame.ox * pv;
      pos.z = frame.cz + frame.az * pu + frame.oz * pv;
    }
  };
  lab.inside = (x, z) => {
    const { u, v } = local(x, z);
    return lab.stage >= 2 && Math.abs(u) < W / 2 && Math.abs(v) < DEPTH / 2;
  };
  // the floor (flat, a little above the ground under it)
  lab.floorAt = (x, z, y) => {
    if (lab.stage < 1) return null;
    const { u, v } = local(x, z);
    if (Math.abs(u) > W / 2 + 0.05 || Math.abs(v) > DEPTH / 2 + 0.05) return null;
    return y > frame.y - 0.6 ? frame.y : null;
  };
  // The camera, between the hero (from) and where it would be (to): how far it can go (0..1)
  // before a wall or the roof is in the way.
  lab.clearance = (from, to) => {
    if (lab.stage < 2) return 1;
    const a = local(from.x, from.z);
    if (Math.abs(a.u) > W / 2 + 4 || Math.abs(a.v) > DEPTH / 2 + 4) return 1;
    const b = local(to.x, to.z);
    const inside = Math.abs(a.u) < W / 2 && Math.abs(a.v) < DEPTH / 2;
    let best = 1;
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = a.u + (b.u - a.u) * t;
      const v = a.v + (b.v - a.v) * t;
      const y = from.y + (to.y - from.y) * t;
      const inNow = Math.abs(u) < W / 2 - 0.25 && Math.abs(v) < DEPTH / 2 - 0.25;
      // from inside: stop short of the walls and under the roof
      if (inside && (!inNow || y > frame.y + WALL - 0.15)) {
        best = Math.max(0, (i - 1.5) / steps);
        break;
      }
      // from outside: not into the walls
      if (!inside && Math.abs(u) < W / 2 + 0.15 && Math.abs(v) < DEPTH / 2 + 0.15 && y < frame.y + RIDGE) {
        best = Math.max(0, (i - 1.5) / steps);
        break;
      }
    }
    return best;
  };

  // ---------- What E does here ----------

  const name = (k, n) => (n > 1 ? D.items.ITEMS[k].plural : D.items.ITEMS[k].name).toLowerCase();
  lab.missing = (stage) => {
    const s = STAGES[stage];
    if (!s) return null;
    const lacking = Object.entries(s.needs).filter(([k, n]) => !D.items.has(k, n)).map(([k, n]) => `${n - D.items.count(k)} ${name(k, n - D.items.count(k))}`);
    return lacking.length ? lacking : null;
  };
  lab.canBuild = () => !!(D.ch3 && D.ch3.canBuildLab && D.ch3.canBuildLab());

  const viewDir = new THREE.Vector3();
  const centre = new THREE.Vector3();
  lab.target = (x, z) => {
    if (!lab.site) return null;
    const out = [];
    const near = Math.hypot(x - lab.site.x, z - lab.site.z) < 6.5 || lab.inside(x, z);
    if (near && lab.canBuild() && lab.stage < STAGES.length) {
      const s = STAGES[lab.stage];
      const missing = lab.missing(lab.stage);
      out.push({ x: lab.site.x, z: lab.site.z, reach: 7, bias: -0.6, label: `${s.label} (${lab.stage + 1} of ${STAGES.length})`, cannot: missing ? `Still need ${missing.join(', ')}` : null, act: () => buildStage() });
    }
    // the pots: the one you are looking at (they stand one above another on the shelves, so
    // where you stand is not enough to tell them apart: where the view points is)
    if (lab.stage >= 5 && lab.potsShown > 0 && lab.inside(x, z)) {
      const cam = D.camera;
      const dir = cam.getWorldDirection(viewDir);
      let best = null;
      let bestD = Infinity;
      for (const p of lab.pots) {
        if (!p.group.visible || Math.hypot(p.x - x, p.z - z) > 2.6) continue;
        centre.set(p.x, p.y + 0.2, p.z).sub(cam.position);
        const along = centre.dot(dir);
        if (along < 0.3) continue;
        const off = Math.sqrt(Math.max(0, centre.lengthSq() - along * along));
        if (off < bestD) {
          bestD = off;
          best = p;
        }
      }
      lab.aimed = best && bestD < 0.9 ? best : null;
      if (best && bestD < 0.9) {
        const t = potAction(best);
        if (t) out.push({ x: best.x, z: best.z, y: best.y + 0.2, reach: 2.6, bias: -0.6, ...t });
      }
    }
    return out.length ? out : null;
  };
  D.items.extraTargets.push((x, z) => lab.target(x, z));

  // What E does at a pot: put in what you carry of its kind, or take some out.
  function potAction(p) {
    const ch = D.ch3;
    const custom = ch && ch.potAction && ch.potAction(p);
    if (custom !== undefined) return custom;
    if (!p.key) return { label: `${p.text}: seeds, when we find some`, cannot: 'Nothing in it yet', act: () => {} };
    const held = D.items.count(p.key);
    const stored = lab.store[p.key] || 0;
    if (p.key === 'fluid') {
      // a dose a pot
      const doses = stored;
      if (held > 0) return { label: 'Store a dose of revival fluid in a FLUID pot', act: () => put(p, 'fluid', 1) };
      if (doses > 0) return { label: `Take a dose of revival fluid (${doses} stored)`, act: () => take(p, 'fluid', 1) };
      return { label: 'FLUID: empty', cannot: 'Nothing in it yet', act: () => {} };
    }
    if (held > 0) return { label: `Store your ${name(p.key, held)} (${held}) in the ${p.text} pot${stored ? `: ${stored} in it` : ''}`, act: () => put(p, p.key, held) };
    if (stored > 0) return { label: `Take the ${name(p.key, stored)} (${stored}) from the ${p.text} pot`, act: () => take(p, p.key, stored) };
    return { label: `${p.text}: empty`, cannot: 'Nothing in it yet', act: () => {} };
  }
  function put(p, key, n) {
    const h = D.hero;
    if (!h.startAction('Storing', 0.8, { pose: 'gather', onDone: () => {
      D.items.remove(key, n);
      lab.store[key] = (lab.store[key] || 0) + n;
      if (D.audio) D.audio.pickup();
      if (D.story) D.story.on('stored', { key, n });
    } })) return;
    h.action.face = Math.atan2(p.x - h.pos.x, p.z - h.pos.z);
  }
  function take(p, key, n) {
    const h = D.hero;
    if (!h.startAction('Taking', 0.8, { pose: 'gather', onDone: () => {
      lab.store[key] = Math.max(0, (lab.store[key] || 0) - n);
      D.items.add(key, n);
      if (D.audio) D.audio.pickup();
      if (D.story) D.story.on('took', { key, n });
    } })) return;
    h.action.face = Math.atan2(p.x - h.pos.x, p.z - h.pos.z);
  }
  lab.put = put;
  lab.take = take;
  lab.potFor = (key) => (lab.pots || []).find((p) => p.key === key) || null;

  function buildStage() {
    const n = lab.stage;
    const s = STAGES[n];
    const h = D.hero;
    if (!h.startAction(s.label, s.time, { pose: 'build', fixed: true, onDone: () => {
      for (const [k, c] of Object.entries(s.needs)) D.items.remove(k, c);
      lab.building = null;
      lab.setStage(n + 1);
      if (n + 1 === 3 && D.camp) D.camp.build('lab');
      if (D.audio) D.audio.craft();
      if (D.story) D.story.on('labBuilt', s.name);
    }, sound: () => D.audio && D.audio.knock() })) return;
    h.action.face = Math.atan2(frame.cx - h.pos.x, frame.cz - h.pos.z);
    lab.building = { stage: n };
  }

  // the kit's tab: how it is built, and where each thing comes from
  lab.kitInfo = () => ({
    page: 'lab',
    wherePage: 'lab',
    keys: ['pole', 'stick', 'vine', 'clay', 'stone', 'big_leaf'],
    how: lab.done()
      ? '<b>The lab is built.</b> Walk in (the doorway faces the clearing). E at a pot on the racks stores what you carry of its kind, or takes it out.'
      : '<b>Built beside the shelter, not in your hands.</b> Go to the marked spot beside the Elder Tree and press <kbd>E</kbd>: the parts go up in order, each with what it lists. Poles need the stone axe.',
  });

  // ---------- Each frame ----------

  lab.update = () => {
    const h = D.hero;
    // the pot you are looking at: its label lit a little
    const aimed = D.items.target && lab.aimed && lab.inside(h.pos.x, h.pos.z) ? lab.aimed : null;
    for (const p of lab.pots || []) {
      const m = p.label.material;
      const on = p === aimed;
      if (m.userData.on !== on) {
        m.userData.on = on;
        m.emissive.setHex(on ? 0x8a6a3a : 0x000000);
        m.emissiveMap = on ? m.map : null;
        m.needsUpdate = true;
      }
    }
    if (!aimed) lab.aimed = null;
    if (lab.building && h.action) {
      const list = lab.pieces[lab.building.stage];
      const t = h.action.t / h.action.dur;
      list.forEach((m, i) => {
        const start = (i / list.length) * 0.85;
        const k = clamp((t - start) / 0.15, 0, 1);
        m.visible = k > 0;
        const e = smooth(k);
        m.position.lerpVectors(m.userData.from, m.userData.final.pos, e);
        m.quaternion.copy(m.userData.final.quat);
        m.scale.copy(m.userData.final.scale).multiplyScalar(0.3 + 0.7 * e);
      });
      if (lab.building.stage === 0) lab.floorMesh.visible = true;
    } else if (lab.building && !h.action) {
      lab.building = null;
      lab.setStage(lab.stage);
    }
  };

  // ---------- Saving ----------

  lab.save = () => ({ stage: lab.stage, pots: lab.potsShown, labelled: !!lab.labelled, store: { ...lab.store }, mural: !!(lab.mural && lab.mural.visible) });
  lab.load = (s) => {
    lab.store = { ...((s && s.store) || {}) };
    lab.setStage((s && s.stage) || 0);
    lab.showPots((s && s.pots) || 0, !!(s && s.labelled));
    if (lab.mural) lab.mural.visible = !!(s && s.mural);
  };

  D.lab = lab;
})();
