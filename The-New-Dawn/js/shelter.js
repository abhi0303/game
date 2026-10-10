// The New Dawn: the Elder Tree (Zone 7) and the shelter built in it for the first night.
//
// A giant of the jungle, its trunk flaring into buttresses and hung with aerial roots. Against
// its trunk, above the reach of anything that prowls at night, he lashes a platform: first a
// frame of sturdy branches bound with vines, then a floor and a vine ladder, then a roof of
// big leaves. Each part appears as he works.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, lerp, seeded, smooth } = D;
  const T = D.terrain;
  const L = D.LAYOUT;

  const STAGES = [
    { name: 'frame', title: 'Frame', label: 'Lash the frame to the tree', needs: { branch: 6, vine: 3 }, time: 6,
      desc: 'Sturdy branches lashed with vines to the trunk and its two low limbs: the bones of the platform.' },
    { name: 'floor', title: 'Floor and ladder', label: 'Lay the floor and hang a ladder', needs: { branch: 5, vine: 3, leaves: 6 }, time: 6,
      desc: 'Branches laid side by side across the frame, leaves on top to sleep on, and a vine ladder to climb up.' },
    { name: 'roof', title: 'Roof', label: 'Thatch the roof with big leaves', needs: { branch: 2, big_leaf: 10, vine: 2 }, time: 7,
      desc: 'Two branches for a sloping ridge, thatched with big leaves overlapping like tiles, so the rain runs off.' },
  ];
  const FLOOR = 3.4; // the platform's height above the ground at the trunk
  // Half its length (along the trunk) and half its depth (out from it): a deck 5.4 by 4 metres,
  // room for three to sleep, under a roof he can stand up under anywhere (2.2 m at the open
  // front, 3 m against the trunk; he is 1.8 m tall).
  const HU = 2.7;
  const HV = 2.0;
  const BACK = 2.25; // from the middle of the trunk to the back edge of the deck

  const shelter = { STAGES, HU, HV, stage: 0, group: new THREE.Group(), pieces: [[], [], []], building: null, base: { x: L.tree.x, z: L.tree.z } };
  D.scene.add(shelter.group);
  D.flora.reserved.push([L.tree.x, L.tree.z, 11]);

  // the frame of the platform: centre, along (its length) and out (away from the trunk)
  let P = null;

  // A painted banana leaf, for the roof.
  function leafTexture() {
    const tex = D.canvasTexture(128, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.save();
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#26411a');
      grad.addColorStop(0.5, '#3d6626');
      grad.addColorStop(1, '#253f19');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(w / 2, h * 0.02);
      g.bezierCurveTo(w * 1.02, h * 0.15, w * 0.98, h * 0.85, w / 2, h * 0.99);
      g.bezierCurveTo(w * 0.02, h * 0.85, -w * 0.02, h * 0.15, w / 2, h * 0.02);
      g.fill();
      g.globalCompositeOperation = 'source-atop';
      g.strokeStyle = 'rgba(190,220,150,0.35)';
      g.lineWidth = 1;
      for (let y = 10; y < h; y += 7) {
        g.beginPath();
        g.moveTo(w / 2, y);
        g.lineTo(0, y + 16);
        g.moveTo(w / 2, y);
        g.lineTo(w, y + 16);
        g.stroke();
      }
      // torn edges, dried tips
      const dry = g.createLinearGradient(0, 0, 0, h * 0.25);
      dry.addColorStop(0, 'rgba(140,112,58,0.85)');
      dry.addColorStop(1, 'rgba(140,112,58,0)');
      g.fillStyle = dry;
      g.fillRect(0, 0, w, h * 0.25);
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 9; k++) {
        const y = Math.random() * h;
        g.fillRect(Math.random() < 0.5 ? 0 : w * 0.82, y, w * 0.18, 2 + Math.random() * 3);
      }
      g.restore();
      g.strokeStyle = '#a9bb7c';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(w / 2, h * 0.02);
      g.lineTo(w / 2, h * 0.99);
      g.stroke();
    }, { repeat: false });
    return D.cleanCutout(tex.image, { flip: true });
  }

  // A length of sturdy branch from a to b.
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

  function lashing(at, material) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 10), material);
    m.position.copy(at);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.castShadow = true;
    return m;
  }

  // A point on the platform: u along it, v out from the trunk, up above the floor.
  const at = (u, v, up = 0) => new THREE.Vector3(P.cx + P.ax * u + P.ox * v, P.y + up, P.cz + P.az * u + P.oz * v);
  shelter.at = (u, v, up = 0) => at(u, v, up);
  const DECK = 0.44; // the top of the floor, above P.y

  // Where the sleepers lie: side by side, heads to the trunk, under the high part of the roof.
  // Lying down tips a body over backwards from where it stands, so each spot is where the feet
  // go and the facing is out from the trunk: the whole of him ends up on the boards.
  shelter.bed = (i = 0) => {
    const u = [0, -1.65, 1.65][i % 3];
    const p = at(u, 0.75, DECK);
    return { x: p.x, z: p.z, y: p.y, facing: Math.atan2(P.ox, P.oz) };
  };

  // A mesh of several flat cards (leaves), each placed by a matrix: one draw instead of many.
  function cards(list, material) {
    const g = D.models.joinGeometries(list.map(({ w, h, matrix }) => new THREE.PlaneGeometry(w, h).applyMatrix4(matrix)));
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  const place = (pos, quat) => new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
  // Several poles as one mesh.
  function bundle(meshes) {
    const m = new THREE.Mesh(D.models.joinGeometries(meshes.map((p) => {
      p.updateMatrix();
      return p.geometry.clone().applyMatrix4(p.matrix);
    })), meshes[0].material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // A tube along `curve` whose radius goes from r0 to r1 (bark repeats along it).
  function taperedTube(curve, r0, r1, segments = 20, sides = 8) {
    const tube = new THREE.TubeGeometry(curve, segments, 1, sides, false);
    const pos = tube.attributes.position;
    const uv = tube.attributes.uv;
    const len = curve.getLength();
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / (sides + 1)) / segments;
      const c = curve.getPoint(Math.min(1, ring));
      const r = lerp(r0, r1, ring);
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * r, c.y + (pos.getY(i) - c.y) * r, c.z + (pos.getZ(i) - c.z) * r);
      uv.setXY(i, uv.getX(i) * Math.max(1, r * 3), uv.getY(i) * len / 2);
    }
    tube.computeVertexNormals();
    return tube;
  }

  // The Elder Tree: a trunk two strides across flaring into buttress fins, six great limbs
  // reaching out and up, a crown thirty metres wide, aerial roots dropping from the limbs.
  function buildTree() {
    const random = seeded(31);
    const bark = new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), normalMap: D.photo('bark', 'normal'), color: D.col(0xcdbca2), roughness: 0.95 });
    const y0 = T.height(L.tree.x, L.tree.z) - 0.4;
    const base = new THREE.Vector3(L.tree.x, y0, L.tree.z);
    const parts = [];
    // the trunk
    const H = 23;
    const trunk = new THREE.CylinderGeometry(1, 1, H, 28, 24, true);
    trunk.translate(0, H / 2, 0);
    {
      const p = trunk.attributes.position;
      const uv = trunk.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const fins = Math.max(0, Math.cos(a * 6 + 0.4)) ** 5;
        const r = (1.05 + 0.85 * Math.exp(-y / 2.4)) * (1 + fins * Math.exp(-y / 1.9) * 1.7) * (1 + (D.noise2(a * 3, y * 0.4) - 0.5) * 0.18) * (1 - (y / H) * 0.72);
        p.setX(i, Math.cos(a) * r);
        p.setZ(i, Math.sin(a) * r);
        uv.setXY(i, uv.getX(i) * 6, y / 2.2);
      }
      trunk.computeVertexNormals();
    }
    trunk.translate(base.x, base.y, base.z);
    parts.push(trunk);
    // the limbs
    const ends = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + random() * 0.5;
      const h = 8 + random() * 6;
      const reach = 9 + random() * 6;
      const start = base.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, h, Math.sin(a) * 0.6));
      const mid = base.clone().add(new THREE.Vector3(Math.cos(a) * reach * 0.55, h + 2 + random() * 2, Math.sin(a) * reach * 0.55));
      const end = base.clone().add(new THREE.Vector3(Math.cos(a + 0.2) * reach, h + 5 + random() * 4, Math.sin(a + 0.2) * reach));
      parts.push(taperedTube(new THREE.CatmullRomCurve3([start, mid, end]), 0.75, 0.22, 20, 9));
      ends.push(end, mid);
      // a smaller branch off each
      const side = end.clone().add(new THREE.Vector3((random() - 0.5) * 6, 3 + random() * 3, (random() - 0.5) * 6));
      parts.push(taperedTube(new THREE.CatmullRomCurve3([mid, mid.clone().lerp(side, 0.5).add(new THREE.Vector3(0, 1, 0)), side]), 0.3, 0.1, 12, 7));
      ends.push(side);
      // aerial roots dropping from the limb to the ground
      if (k % 2 === 0) {
        const from = mid.clone().lerp(end, 0.3 + random() * 0.4);
        const g = T.height(from.x, from.z) - 0.3;
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          pts.push(new THREE.Vector3(from.x + Math.sin(t * 4 + k) * 0.25 + t * 0.8, lerp(from.y, g, t), from.z + Math.cos(t * 3 + k) * 0.25 - t * 0.5));
        }
        parts.push(taperedTube(new THREE.CatmullRomCurve3(pts), 0.1, 0.32, 16, 7));
      }
    }
    const wood = D.models.joinGeometries(parts);
    const tree = new THREE.Mesh(wood, bark);
    tree.castShadow = true;
    tree.receiveShadow = true;
    shelter.group.add(tree);
    // the crown: leaf clusters round the limb ends and over a broad dome
    const leafMat = D.flora.kinds.canopy ? D.flora.kinds.canopy.near[1].material : bark;
    const cards = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 340; i++) {
      let p;
      if (i < 200) {
        const e = ends[i % ends.length];
        p = e.clone().add(new THREE.Vector3((random() - 0.5) * 7, (random() - 0.3) * 3, (random() - 0.5) * 7));
      } else {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * 15;
        p = base.clone().add(new THREE.Vector3(Math.cos(a) * r, 17 + 6 * Math.sqrt(1 - (r / 15) ** 2) + random() * 2, Math.sin(a) * r));
      }
      dummy.position.copy(p);
      dummy.rotation.set(-Math.PI / 2 + (random() - 0.5) * 1.2, random() * 6.3, (random() - 0.5) * 1.2);
      const s = 3.5 + random() * 2.5;
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      const card = new THREE.PlaneGeometry(1, 1);
      card.applyMatrix4(dummy.matrix);
      const n = card.attributes.normal;
      for (let k = 0; k < n.count; k++) n.setXYZ(k, (random() - 0.5) * 0.3, 1, (random() - 0.5) * 0.3);
      cards.push(card);
    }
    const crown = new THREE.Mesh(D.models.joinGeometries(cards), leafMat);
    crown.castShadow = true;
    crown.receiveShadow = true;
    crown.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafMat.map, alphaTest: 0.45 });
    shelter.group.add(crown);
    shelter.tree = tree;
    shelter.trunkR = 2.05;
  }

  function buildPieces() {
    const wood = new THREE.MeshStandardMaterial({ map: D.photo('bark', 'color'), normalMap: D.photo('bark', 'normal'), color: D.col(0xe6d2b4), roughness: 0.9 });
    const vineMat = new THREE.MeshStandardMaterial({ color: D.col(0x6f8a48), roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
    shelter.leafMat = leafMat;
    const beddingMat = D.flora.kinds.canopy ? D.flora.kinds.canopy.near[1].material : leafMat;
    const random = seeded(77);
    const add = (stage, mesh, from = null) => {
      mesh.userData.final = { pos: mesh.position.clone(), quat: mesh.quaternion.clone(), scale: mesh.scale.clone() };
      mesh.userData.from = from || mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      mesh.visible = false;
      shelter.group.add(mesh);
      shelter.pieces[stage].push(mesh);
    };
    const hu = HU;
    const hv = HV;
    const ground = (u, v) => {
      const p = at(u, v);
      return new THREE.Vector3(p.x, T.height(p.x, p.z) - 0.2, p.z);
    };
    // 1. the frame: three posts along the front, two leaning in against the trunk, three long
    //    beams and five cross beams, all lashed
    const fl = at(-hu, hv, 0.25);
    const fr = at(hu, hv, 0.25);
    const bl = at(-hu, -hv, 0.25);
    const br = at(hu, -hv, 0.25);
    add(0, pole(ground(-hu, hv + 0.15), at(-hu, hv, 1.3), 0.085, wood));
    add(0, pole(ground(hu, hv + 0.15), at(hu, hv, 1.3), 0.085, wood));
    add(0, pole(ground(-1.4, hv + 0.15), at(-1.4, hv, 0.3), 0.08, wood));
    add(0, pole(ground(-hu - 0.2, -hv + 0.7), at(-hu, -hv, 0.4), 0.08, wood));
    add(0, pole(ground(hu + 0.2, -hv + 0.7), at(hu, -hv, 0.4), 0.08, wood));
    for (const v of [-hv, 0, hv]) add(0, pole(at(-hu - 0.3, v, 0.25), at(hu + 0.3, v, 0.25), 0.065, wood));
    for (const u of [-hu, -hu / 2, 0, hu / 2, hu]) add(0, pole(at(u, -hv - 0.2, 0.31), at(u, hv + 0.2, 0.31), 0.055, wood));
    for (const p of [fl, fr, bl, br]) add(0, lashing(p, vineMat));
    // 2. the floor: poles laid side by side across the beams, leaves for beds, and a ladder
    // (close together, three to a bundle, so they go down in handfuls as he builds)
    const COUNT = 24;
    for (let k = 0; k < COUNT; k += 3) {
      const three = [];
      for (let j = k; j < Math.min(COUNT, k + 3); j++) {
        const u = -hu + 0.12 + (j / (COUNT - 1)) * (hu * 2 - 0.24);
        three.push(pole(at(u, -hv - 0.05, 0.38), at(u + (random() - 0.5) * 0.06, hv + 0.05, 0.38), 0.055 + random() * 0.015, wood));
      }
      add(1, bundle(three));
    }
    for (const bedU of [0, -1.65, 1.65]) {
      const list = [];
      for (let k = 0; k < 6; k++) {
        const pos = at(bedU - 0.35 + random() * 0.7, -1.55 + k * 0.38 + random() * 0.1, 0.45 + k * 0.001);
        list.push({ w: 0.85, h: 0.85, matrix: place(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, random() * 6))) });
      }
      const bed = cards(list, beddingMat);
      bed.castShadow = false;
      add(1, bed);
    }
    // the ladder: two vines down from the front edge, sticks for rungs
    const lt = at(0.32, hv + 0.05, 0.35);
    const rt = at(-0.32, hv + 0.05, 0.35);
    const lb = ground(0.32, hv + 0.25);
    const rb = ground(-0.32, hv + 0.25);
    add(1, pole(lb, lt, 0.018, vineMat));
    add(1, pole(rb, rt, 0.018, vineMat));
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      add(1, pole(lb.clone().lerp(lt, t), rb.clone().lerp(rt, t), 0.022, wood));
    }
    shelter.ladder = { bottom: lb.clone().lerp(rb, 0.5), top: lt.clone().lerp(rt, 0.5) };
    // 3. the roof: a lean-to, high against the trunk and sloping down to an eave over the front
    //    edge, on posts at the corners and an eave pole; the front is left open. High enough to
    //    stand up under anywhere on the deck.
    const ridgeH = 3.55;
    const eaveH = 2.9;
    const ridgeV = -hv - 0.05;
    const eaveV = hv - 0.2;
    const ridgeL = at(-hu - 0.2, ridgeV, ridgeH);
    const ridgeR = at(hu + 0.2, ridgeV, ridgeH);
    const eaveL = at(-hu - 0.2, eaveV, eaveH);
    const eaveR = at(hu + 0.2, eaveV, eaveH);
    add(2, pole(at(-hu, eaveV, 0.38), at(-hu, eaveV, eaveH + 0.05), 0.06, wood));
    add(2, pole(at(hu, eaveV, 0.38), at(hu, eaveV, eaveH + 0.05), 0.06, wood));
    add(2, pole(at(-hu, -hv, 0.38), at(-hu, ridgeV, ridgeH), 0.06, wood));
    add(2, pole(at(hu, -hv, 0.38), at(hu, ridgeV, ridgeH), 0.06, wood));
    add(2, pole(ridgeL, ridgeR, 0.06, wood));
    add(2, pole(eaveL, eaveR, 0.06, wood));
    for (const u of [-hu, -hu / 2, 0, hu / 2, hu]) add(2, pole(at(u, ridgeV, ridgeH), at(u, eaveV + 0.15, eaveH - 0.06), 0.04, wood));
    // leaves laid down the slope from the ridge past the eave, in overlapping rows
    const along = new THREE.Vector3(P.ax, 0, P.az);
    for (let row = 0; row < 6; row++) {
      const list = [];
      for (let k = 0; k < 9; k++) {
        const u = -hu - 0.1 + (k / 8) * (hu * 2 + 0.2) + (random() - 0.5) * 0.15;
        const ridge = at(u, ridgeV, ridgeH + 0.05);
        const eave = at(u, eaveV + 0.3, eaveH - 0.08);
        const down = eave.clone().sub(ridge);
        const slopeLen = down.length();
        down.normalize();
        const up = new THREE.Vector3().crossVectors(down, along).normalize();
        if (up.y < 0) up.negate();
        const dist = Math.min(slopeLen - 0.8, 0.85 + row * 0.62);
        const pos = ridge.clone().addScaledVector(down, dist).addScaledVector(up, 0.05 + 0.03 * (5 - row) / 2.5);
        // (a right-handed frame: x = y cross z, with y up the slope and z out of the roof)
        const x = new THREE.Vector3().crossVectors(up, down).normalize();
        const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, down.clone().negate(), up));
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (random() - 0.5) * 0.2));
        list.push({ w: 1.0, h: 1.9, matrix: place(pos, quat) });
      }
      add(2, cards(list, leafMat));
    }
    // the back, against the trunk: two rows of leaves
    // (overlapping like the roof, each tipped a little, so it reads as thatch and not as paddles)
    for (const [up, back] of [[1.05, 0.08], [2.15, 0.02], [3.0, -0.02]]) {
      const list = [];
      for (let k = 0; k < 10; k++) {
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12 + (random() - 0.5) * 0.12, Math.atan2(P.ox, P.oz) + (random() - 0.5) * 0.25, (random() - 0.5) * 0.35, 'YXZ'));
        list.push({ w: 1.05, h: 1.55, matrix: place(at(-hu + 0.15 + k * 0.6 + (random() - 0.5) * 0.12, -hv + back, up + (random() - 0.5) * 0.12), quat) });
      }
      add(2, cards(list, leafMat));
    }
    for (const p of [ridgeL, ridgeR]) add(2, lashing(p, vineMat));
  }

  shelter.build = () => {
    // the platform goes on the side of the trunk the path comes from
    const end = L.paths[2][L.paths[2].length - 1];
    let ox = end[0] - L.tree.x;
    let oz = end[1] - L.tree.z;
    const len = Math.hypot(ox, oz) || 1;
    ox /= len;
    oz /= len;
    const trunk = BACK + HV;
    const cx = L.tree.x + ox * trunk;
    const cz = L.tree.z + oz * trunk;
    P = { cx, cz, ox, oz, ax: oz, az: -ox, y: T.height(L.tree.x, L.tree.z) + FLOOR };
    shelter.P = P;
    buildTree();
    buildPieces();
    shelter.base = { x: cx + ox * (HV + 1.5), z: cz + oz * (HV + 1.5) };
    shelter.setStage(0);
  };

  // Shows the parts of the stages already built.
  shelter.setStage = (n) => {
    shelter.stage = n;
    shelter.pieces.forEach((list, s) => list.forEach((m) => {
      m.visible = s < n;
      if (m.visible) {
        m.position.copy(m.userData.final.pos);
        m.quaternion.copy(m.userData.final.quat);
        m.scale.copy(m.userData.final.scale);
      }
    }));
  };

  // ---------- Standing on it, bumping into it ----------

  shelter.floorAt = (x, z, y) => {
    if (!P || shelter.stage < 2) return null;
    const dx = x - P.cx;
    const dz = z - P.cz;
    const u = dx * P.ax + dz * P.az;
    const v = dx * P.ox + dz * P.oz;
    if (Math.abs(u) > HU + 0.05 || Math.abs(v) > HV + 0.05) return null;
    const top = P.y + DECK;
    return y > top - 0.7 ? top : null;
  };

  shelter.collide = (pos, r) => {
    if (!P) return;
    const dx = pos.x - L.tree.x;
    const dz = pos.z - L.tree.z;
    const d = Math.hypot(dx, dz);
    const min = shelter.trunkR + r + 0.2;
    if (d < min && d > 0.01) {
      pos.x = L.tree.x + (dx / d) * min;
      pos.z = L.tree.z + (dz / d) * min;
    }
  };

  // ---------- What E does here ----------

  shelter.siteNear = (x, z) => P && Math.hypot(x - P.cx, z - P.cz) < 6.5;
  shelter.missing = (stage) => {
    const s = STAGES[stage];
    if (!s) return null;
    const lacking = Object.entries(s.needs).filter(([k, n]) => !D.items.has(k, n)).map(([k, n]) => `${n - D.items.count(k)} ${n - D.items.count(k) > 1 ? D.items.ITEMS[k].plural.toLowerCase() : D.items.ITEMS[k].name.toLowerCase()}`);
    return lacking.length ? lacking : null;
  };

  shelter.target = (x, z) => {
    if (!P || !D.story) return null;
    const h = D.hero;
    const onIt = h.platform;
    // up here at nightfall, the one thing to do is rest
    if (onIt && shelter.stage >= 3 && D.story.nightReady()) {
      return { x: P.cx, z: P.cz, reach: 4, label: 'Lie down and rest until dawn', act: () => D.story.rest() };
    }
    // climbing
    if (shelter.stage >= 2 && shelter.ladder) {
      const lad = onIt ? shelter.ladder.top : shelter.ladder.bottom;
      if (Math.hypot(x - lad.x, z - lad.z) < (onIt ? 1.0 : 1.6)) {
        return { x: lad.x, z: lad.z, reach: 1.8, label: onIt ? 'Climb down' : 'Climb up into the shelter', act: () => climb(!onIt) };
      }
    }
    // (the ladder works whenever it is there; building only while the story asks for it)
    if (onIt || shelter.stage >= STAGES.length || !D.story.canBuild()) return null;
    if (!shelter.siteNear(x, z)) return null;
    const s = STAGES[shelter.stage];
    const missing = shelter.missing(shelter.stage);
    return {
      x: P.cx, z: P.cz, reach: 7,
      label: `${s.label}`,
      cannot: missing ? `Still need ${missing.join(', ')}` : null,
      act: () => buildStage(),
    };
  };

  function buildStage() {
    const n = shelter.stage;
    const s = STAGES[n];
    const h = D.hero;
    const face = Math.atan2(P.cx - h.pos.x, P.cz - h.pos.z);
    if (!h.startAction(s.label, s.time, { pose: 'build', fixed: true, onDone: () => {
      for (const [k, c] of Object.entries(s.needs)) D.items.remove(k, c);
      shelter.building = null;
      shelter.setStage(n + 1);
      if (D.audio) D.audio.craft();
      if (D.story) D.story.on('built', s.name);
    }, sound: () => D.audio && D.audio.knock() })) return;
    h.action.face = face;
    shelter.building = { stage: n };
  }

  // Up the ladder (or down), over a second and a half.
  function climb(up) {
    const h = D.hero;
    const from = up ? shelter.ladder.bottom : shelter.ladder.top;
    const to = up ? at(0, 0.5, 0.44) : shelter.ladder.bottom.clone().add(new THREE.Vector3(P.ox * 0.8, 0, P.oz * 0.8));
    h.startAction(up ? 'Climbing' : 'Climbing down', 1.6, { pose: 'pull', fixed: true, onDone: () => {
      h.teleport(to.x, to.z, h.facing, up ? P.y + 0.44 : null);
      h.platform = up ? P : null;
      climbing = null;
      if (D.story) D.story.on(up ? 'climbedUp' : 'climbedDown');
    } });
    h.action.face = Math.atan2(-P.ox, -P.oz);
    climbing = { from: from.clone(), to: to.clone(), up };
  }
  let climbing = null;

  shelter.update = () => {
    if (!P) return;
    const h = D.hero;
    // pieces fly into place as he builds
    if (shelter.building && h.action) {
      const list = shelter.pieces[shelter.building.stage];
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
    } else if (shelter.building && !h.action) {
      // interrupted: what was put up comes down again
      shelter.building = null;
      shelter.setStage(shelter.stage);
    }
    // up or down the ladder
    if (climbing && h.action) {
      const t = h.action.t / h.action.dur;
      const p = climbing.from.clone().lerp(climbing.to, smooth(t));
      h.pos.copy(p);
      h.vel.set(0, 0, 0);
      h.group.position.copy(p);
    }
    // stepping off the edge
    if (h.platform && !h.action && h.pos.y < P.y + 0.2) h.platform = null;
  };

  shelter.save = () => ({ stage: shelter.stage });
  shelter.load = (s) => shelter.setStage((s && s.stage) || 0);

  D.shelter = shelter;
})();
