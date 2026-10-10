// The New Dawn: the people of stone.
//
// Everyone on Earth was turned to stone in an instant, a thousand years ago, wherever they
// were and whatever they were doing. Each statue here is one of the Rocketbox avatars, posed
// as they were caught (walking, running, shielding their eyes, looking up at the light,
// reaching for someone), then baked into a solid piece of stone: the skinning worked out
// once, so it is drawn like any rock. Moss creeps over what faces the sky; some have toppled
// and sunk into the earth; some have been broken apart by roots and time.
(() => {
  'use strict';
  const D = window.Dawn;
  const { seeded } = D;

  // ---------- Who is where ----------

  // tpl: which avatar (0-2 women, 3-5 men); h: the way they face (0 = south, PI = north);
  // moss: 0..1; sink: metres into the ground; lie: [about x, about z] if toppled;
  // broken: where they broke; tree: a tree to be placed behind them
  const F1 = 0;
  const F4 = 1;
  const F8 = 2;
  const M1 = 3;
  const M4 = 4;
  const M8 = 5;
  const SPOTS = [
    // the way out of the cave
    { tpl: M1, pose: 'reach', x: 6, z: 230, h: 0.15, moss: 0.25, thought: 'He was running for the cave. Toward me. He didn\'t make it.' },
    { tpl: F4, pose: 'shield', x: 31, z: 224, h: 2.6, moss: 0.3, thought: 'Arms over her face. She saw it coming, whatever it was.' },
    // the petrified forest
    { tpl: M4, pose: 'walk', x: 12, z: 201, h: -2.8, moss: 0.35, thought: 'Caught mid-stride. One foot still off the ground, after a thousand years.' },
    { tpl: F1, pose: 'walk', x: 14.2, z: 199.2, h: -2.75, moss: 0.35, thought: 'Walking beside him. Were they talking? Laughing?' },
    { tpl: F8, pose: 'lookup', x: -8, z: 192, h: 2.6, moss: 0.4, thought: 'She\'s pointing at the sky. They all looked up. What did they see?' },
    { tpl: M8, pose: 'phone', x: 25, z: 183, h: 1.2, moss: 0.4, thought: 'He\'s holding a phone. Stone, now, like the hand that holds it.' },
    { tpl: M1, pose: 'sit', x: -20, z: 176, h: -0.4, moss: 0.65, tree: [-20.6, 177.6], thought: 'Sitting under this tree, as if he were waiting for someone.' },
    { tpl: F4, pose: 'sitlean', x: -18.9, z: 175.5, h: -0.75, moss: 0.65, thought: 'Her head on his shoulder. They had a quiet moment, at least.' },
    { tpl: M4, pose: 'embrace', x: 36, z: 165, h: -1.57, moss: 0.45, thought: 'Holding each other. Even the stone couldn\'t pull them apart.' },
    { tpl: F1, pose: 'embrace', x: 35.3, z: 165, h: 1.57, moss: 0.45, thought: 'Holding each other. Even the stone couldn\'t pull them apart.', pair: true },
    { tpl: M8, pose: 'walk', x: 1, z: 158, h: 0.4, moss: 0.75, sink: 0.35, lie: [-1.45, 0.25], thought: 'Toppled over, half sunk in the earth. The ground is slowly swallowing them.' },
    { tpl: F8, pose: 'walk', x: 9, z: 149, h: -0.6, moss: 0.5, broken: 0.95, thought: 'Snapped at the waist. If I had been out here... this would be me.' },
    { tpl: M1, pose: 'kneel', x: -35, z: 150, h: 0.5, moss: 0.55, thought: 'Kneeling. Praying, maybe. It didn\'t matter.' },
    { tpl: F4, pose: 'parent', x: 30, z: 146, h: -2.4, moss: 0.4, thought: 'A mother and her child. Hand in hand.' },
    { tpl: F1, pose: 'child', x: 30.85, z: 146.75, h: -2.4, moss: 0.4, scale: 0.6, thought: 'A child. Just a child.', pair: true },
    { tpl: M4, pose: 'run', x: 47, z: 192, h: -2.3, moss: 0.35, thought: 'Running. Away from the light, I think. Nobody could outrun it.' },
    // the hill in the petrified forest
    { tpl: M8, pose: 'lookup', x: -58, z: 172, h: 2.2, moss: 0.5, thought: 'Up here he had the best view of it. I wonder what he saw.' },
    { tpl: F8, pose: 'crouch', x: -53.5, z: 176.5, h: -2.8, moss: 0.6, thought: 'Curled up, hugging her knees. Hiding from it.' },
    { tpl: M1, pose: 'walk', x: -63, z: 167, h: 1.0, moss: 0.55, broken: 0.55, thought: 'Shattered. Only his legs are still standing.' },
    // the clearing
    { tpl: F1, pose: 'drink', x: -36.5, z: 85.5, h: -2.25, moss: 0.5, thought: 'She knelt to drink from the pond. The water is still here. She isn\'t.' },
    { tpl: M8, pose: 'walk', x: 8, z: 110, h: 0.3, moss: 0.45, thought: 'Walking along this same path, a thousand years ago.' },
    { tpl: F8, pose: 'sit', x: -64, z: 118, h: 0.9, moss: 0.7, tree: [-65.4, 117.0], thought: 'Resting in the shade. The tree has grown around her a little.' },
    // Flint Rise
    { tpl: M4, pose: 'shield', x: 100, z: 66, h: -1.0, moss: 0.5, broken: 1.25, sink: 0.15, thought: 'Broken against the rocks. Whatever happened, it happened everywhere at once.' },
    { tpl: F4, pose: 'lookup', x: 127, z: 93, h: -2.0, moss: 0.5, thought: 'Out here alone among the rocks, looking up.' },
    // the gorge
    { tpl: F8, pose: 'shield', x: 17.5, z: 15, h: 2.5, moss: 0.6, sink: 0.3, lie: [1.5, -0.3], thought: 'Something has dragged this one about. There are claw marks on the stone.' },
    // the deep jungle
    { tpl: M1, pose: 'reach', x: -22, z: -118, h: 0.5, moss: 1, sink: 0.4, thought: 'The jungle has almost taken him. Moss in every fold of his clothes.' },
    { tpl: F4, pose: 'lookup', x: 12, z: -78, h: -2.9, moss: 0.95, thought: 'Even in here, under the trees, she was looking up.' },
    { tpl: M8, pose: 'sit', x: -63, z: -150, h: 1.2, moss: 1, tree: [-64.6, -150.6], thought: 'He made it to the great tree. He is part of it now.' },
  ];

  // keep the plants off them, and the tree for those who sit under one
  for (const s of SPOTS) {
    D.flora.reserved.push([s.x, s.z, s.lie ? 1.6 : 1.1]);
    if (s.tree) D.flora.fixed.push({ kind: 'canopy2', x: s.tree[0], z: s.tree[1], turn: s.x, s: 0.7 });
  }

  // ---------- Poses ----------

  // Each pose starts from a frame of one of the avatar's own clips, then turns bones about
  // axes in the figure's own frame: x is its left, y up, z forward. About x, a negative angle
  // swings a hanging limb forward (and a positive one bends the spine forward); about z, a
  // positive angle lifts a left limb out to the side; about y, a positive angle turns left.
  const POSES = {
    walk: { clip: 'walk', t: 0.32, turns: [['head', 'x', -0.25]] },
    run: { clip: 'run', t: 0.2, turns: [['spine1', 'x', 0.18], ['head', 'y', 0.6], ['head', 'x', -0.1]] },
    shield: {
      clip: 'idle', t: 0.4,
      turns: [['spine1', 'x', -0.12], ['armL', 'x', -2.0], ['armL', 'z', 0.15], ['foreL', 'x', -1.7], ['armR', 'x', -1.85], ['armR', 'z', -0.25], ['foreR', 'x', -1.6],
        ['head', 'x', 0.35], ['head', 'y', -0.4], ['thighR', 'x', 0.25], ['calfR', 'x', 0.35]],
    },
    lookup: {
      clip: 'idle', t: 0.1,
      turns: [['spine2', 'x', -0.15], ['neck', 'x', -0.25], ['head', 'x', -0.45], ['armR', 'x', -2.75], ['armR', 'z', -0.2], ['foreR', 'x', -0.15], ['armL', 'x', -0.35], ['foreL', 'x', -0.5]],
    },
    reach: {
      clip: 'walk', t: 0.6,
      turns: [['spine1', 'x', 0.28], ['armR', 'x', -1.55], ['armR', 'z', -0.12], ['foreR', 'x', -0.12], ['armL', 'x', 0.55], ['head', 'x', -0.35]],
    },
    phone: {
      clip: 'idle', t: 0.6,
      turns: [['armR', 'x', -0.75], ['armR', 'z', 0.12], ['foreR', 'x', -1.55], ['handR', 'x', -0.3], ['head', 'x', 0.5], ['neck', 'x', 0.2]],
      prop: 'phone',
    },
    kneel: {
      clip: 'idle', t: 0.3, drop: true,
      turns: [['thighL', 'x', -1.55], ['calfL', 'x', 1.5], ['thighR', 'x', 0.15], ['calfR', 'x', 1.75], ['footR', 'x', 0.6],
        ['spine1', 'x', 0.18], ['armL', 'x', -0.85], ['armL', 'z', -0.3], ['foreL', 'x', -1.45], ['armR', 'x', -0.85], ['armR', 'z', 0.3], ['foreR', 'x', -1.45], ['head', 'x', 0.45]],
    },
    drink: {
      clip: 'idle', t: 0.3, drop: true,
      turns: [['thighL', 'x', -0.25], ['calfL', 'x', 1.8], ['thighR', 'x', -0.15], ['calfR', 'x', 1.8], ['footL', 'x', 0.6], ['footR', 'x', 0.6],
        ['spine', 'x', 0.55], ['spine1', 'x', 0.35], ['armL', 'x', -1.1], ['foreL', 'x', -0.3], ['armR', 'x', -1.25], ['foreR', 'x', -0.2], ['head', 'x', -0.5]],
    },
    sit: {
      clip: 'idle', t: 0.5, drop: true,
      turns: [['thighL', 'x', -1.45], ['calfL', 'x', 0.35], ['thighR', 'x', -1.4], ['calfR', 'x', 0.6], ['thighL', 'z', 0.12], ['thighR', 'z', -0.15],
        ['spine', 'x', -0.12], ['armL', 'x', -0.4], ['armL', 'z', 0.15], ['foreL', 'x', -0.7], ['armR', 'x', -0.45], ['armR', 'z', -0.12], ['foreR', 'x', -0.6], ['head', 'x', 0.3], ['head', 'y', 0.25]],
    },
    sitlean: {
      clip: 'idle', t: 0.5, drop: true,
      turns: [['thighL', 'x', -1.45], ['calfL', 'x', 0.9], ['thighR', 'x', -1.4], ['calfR', 'x', 1.0],
        ['spine', 'x', -0.08], ['spine1', 'z', 0.18], ['armL', 'x', -0.5], ['foreL', 'x', -0.9], ['armR', 'x', -0.6], ['armR', 'z', 0.25], ['foreR', 'x', -1.1], ['head', 'z', 0.45], ['head', 'x', 0.15]],
    },
    crouch: {
      clip: 'idle', t: 0.5, drop: true,
      turns: [['thighL', 'x', -2.35], ['calfL', 'x', 2.35], ['thighR', 'x', -2.3], ['calfR', 'x', 2.35], ['spine', 'x', 0.5], ['spine1', 'x', 0.35],
        ['armL', 'x', -1.0], ['armL', 'z', -0.2], ['foreL', 'x', -1.3], ['armR', 'x', -1.0], ['armR', 'z', 0.2], ['foreR', 'x', -1.3], ['head', 'x', 0.7]],
    },
    embrace: {
      clip: 'idle', t: 0.4,
      turns: [['spine1', 'x', 0.12], ['armL', 'x', -1.3], ['armL', 'z', -0.35], ['foreL', 'y', -1.3], ['foreL', 'x', -0.2], ['armR', 'x', -1.3], ['armR', 'z', 0.35], ['foreR', 'y', 1.3], ['foreR', 'x', -0.2], ['head', 'y', 0.5], ['head', 'x', 0.15]],
    },
    parent: {
      clip: 'walk', t: 0.15,
      turns: [['armL', 'z', 0.32], ['armL', 'x', -0.2], ['foreL', 'x', -0.15], ['head', 'x', -0.3], ['head', 'y', 0.3]],
    },
    child: {
      clip: 'walk', t: 0.15,
      turns: [['armR', 'z', -0.6], ['armR', 'x', -0.35], ['foreR', 'x', -0.2], ['head', 'x', -0.55], ['head', 'y', -0.2]],
    },
  };
  const BONES = {
    pelvis: 'Bip01_Pelvis', spine: 'Bip01_Spine', spine1: 'Bip01_Spine1', spine2: 'Bip01_Spine2', neck: 'Bip01_Neck', head: 'Bip01_Head',
    armL: 'Bip01_L_UpperArm', foreL: 'Bip01_L_Forearm', handL: 'Bip01_L_Hand', armR: 'Bip01_R_UpperArm', foreR: 'Bip01_R_Forearm', handR: 'Bip01_R_Hand',
    thighL: 'Bip01_L_Thigh', calfL: 'Bip01_L_Calf', footL: 'Bip01_L_Foot', thighR: 'Bip01_R_Thigh', calfR: 'Bip01_R_Calf', footR: 'Bip01_R_Foot',
  };

  const figureQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();
  const axisV = new THREE.Vector3();
  function turnBone(bone, axis, angle) {
    if (!bone || Math.abs(angle) < 1e-5) return;
    axisV.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(figureQ);
    turnQ.setFromAxisAngle(axisV, angle);
    bone.parent.getWorldQuaternion(parentQ);
    worldQ.copy(parentQ).multiply(bone.quaternion).premultiply(turnQ);
    bone.quaternion.copy(parentQ.invert()).multiply(worldQ);
    bone.updateMatrixWorld(true);
  }

  // Poses a fresh copy of an avatar and bakes it: [{ geometry, part }] in the figure's frame
  // (feet at y = 0 before any lowering), plus where its right hand is.
  function bakePose(template, poseName) {
    const pose = POSES[poseName] || POSES.walk;
    const body = THREE.SkeletonUtils.clone(template.scene);
    const mixer = new THREE.AnimationMixer(body);
    const clip = template.clips[pose.clip] || template.clips.idle;
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(pose.t * clip.duration);
    body.updateMatrixWorld(true);
    const bone = (key) => body.getObjectByName(BONES[key]);
    // which way the figure faces, from its hips: x to its left, y up, z forward
    const left = bone('thighL').getWorldPosition(new THREE.Vector3()).sub(bone('thighR').getWorldPosition(new THREE.Vector3()));
    left.y = 0;
    left.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3().crossVectors(left, up).normalize();
    figureQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, forward));
    const facing = Math.atan2(forward.x, forward.z); // turned back to +z once baked
    for (const [key, axis, angle] of pose.turns) turnBone(bone(key), axis, angle);
    body.updateMatrixWorld(true);
    const out = [];
    const tmp = new THREE.Matrix4();
    const skinM = new THREE.Matrix4();
    const vec = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    body.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      const g = o.geometry;
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
      const bm = o.skeleton.boneMatrices;
      const count = pos.count;
      const outPos = new Float32Array(count * 3);
      const outNor = new Float32Array(count * 3);
      const e = skinM.elements;
      const world = o.matrixWorld;
      const normalM = new THREE.Matrix3();
      // (this three.js reads packed attributes raw: whole numbers standing for 0..1)
      const unit = (attr) => (attr.normalized ? 1 / ({ Uint8Array: 255, Uint16Array: 65535, Int8Array: 127, Int16Array: 32767 }[attr.array.constructor.name] || 1) : 1);
      const wUnit = unit(sw);
      const getters = ['getX', 'getY', 'getZ', 'getW'];
      for (let i = 0; i < count; i++) {
        e.fill(0);
        for (let k = 0; k < 4; k++) {
          const w = sw[getters[k]](i) * wUnit;
          if (w === 0) continue;
          const b = si[getters[k]](i) * 16;
          for (let m = 0; m < 16; m++) e[m] += bm[b + m] * w;
        }
        tmp.multiplyMatrices(o.bindMatrixInverse, skinM).multiply(o.bindMatrix);
        vec.fromBufferAttribute(pos, i).applyMatrix4(tmp).applyMatrix4(world);
        outPos[i * 3] = vec.x;
        outPos[i * 3 + 1] = vec.y;
        outPos[i * 3 + 2] = vec.z;
        normalM.getNormalMatrix(tmp.premultiply(world));
        nrm.fromBufferAttribute(nor, i).applyMatrix3(normalM).normalize();
        outNor[i * 3] = nrm.x;
        outNor[i * 3 + 1] = nrm.y;
        outNor[i * 3 + 2] = nrm.z;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
      if (g.attributes.uv) geometry.setAttribute('uv', g.attributes.uv);
      if (g.index) geometry.setIndex(g.index);
      out.push({ geometry, part: o.material.name.split('_').pop() });
    });
    const unturn = new THREE.Matrix4().makeRotationY(-facing);
    for (const { geometry } of out) geometry.applyMatrix4(unturn);
    const hand = bone('handR');
    const handAt = hand ? hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(unturn) : null;
    const handQ = hand ? hand.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(up, -facing)) : null;
    return { parts: out, handAt, handQ, drop: pose.drop, prop: pose.prop };
  }

  // ---------- Materials ----------

  const stoneUniforms = D.stoneUniforms();
  const materialCache = new Map();
  function stoneMaterial(tpl, part, doubleSided) {
    const key = `${tpl}/${part}/${doubleSided}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const t = D.models.npc[tpl];
    const maps = statues.maps[tpl] || (statues.maps[tpl] = {});
    const uri = t && t.maps[part === 'head' || part === 'opacity' ? part : 'body'];
    if (uri && !maps[part]) maps[part] = D.models.imageTexture(uri);
    const hair = part === 'opacity';
    const material = new THREE.MeshStandardMaterial({
      map: maps[part] || null, roughness: 0.92, metalness: 0, envMapIntensity: 0.6,
      alphaTest: hair ? 0.5 : 0, side: hair || doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    D.addStone(material, stoneUniforms, { space: 'world', moss: true });
    materialCache.set(key, material);
    return material;
  }
  const rubbleMat = () => {
    if (!statues.rubbleMaterial) {
      statues.rubbleMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, color: D.col(0xbdbab2) });
      D.addStone(statues.rubbleMaterial, stoneUniforms, { space: 'world', moss: true, scale: 2.2 });
    }
    return statues.rubbleMaterial;
  };

  // ---------- Building ----------

  const statues = { group: new THREE.Group(), list: [], maps: {}, spots: SPOTS };
  D.scene.add(statues.group);

  // Moss for every vertex of a statue: its amount, a little patchy.
  function addMoss(geometry, amount) {
    const count = geometry.attributes.position.count;
    const moss = new Float32Array(count).fill(amount);
    geometry.setAttribute('moss', new THREE.BufferAttribute(moss, 1));
  }

  // Splits a geometry's triangles by `keep(cx, cy, cz)` on their middles.
  function pickTriangles(geometry, keep) {
    const pos = geometry.attributes.position;
    const index = geometry.index ? geometry.index.array : [...Array(pos.count).keys()];
    const kept = [];
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t];
      const b = index[t + 1];
      const c = index[t + 2];
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (keep(cx, cy, cz)) kept.push(a, b, c);
    }
    const out = geometry.clone();
    out.setIndex(kept);
    return kept.length ? out : null;
  }

  function placeStatue(spot, index) {
    const random = seeded(500 + index * 31);
    const template = D.models.npc[spot.tpl % D.models.npc.length];
    if (!template) return;
    const baked = bakePose(template, spot.pose);
    const scale = spot.scale || 1;
    // the lowest point of the figure goes to the ground (so kneeling and sitting sit right)
    let minY = Infinity;
    for (const { geometry } of baked.parts) {
      geometry.computeBoundingBox();
      minY = Math.min(minY, geometry.boundingBox.min.y);
    }
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const inner = new THREE.Group(); // the figure, feet on its own floor
    inner.position.y = -minY * scale;
    inner.scale.setScalar(scale);
    group.add(inner);
    const ground = D.terrain.height(spot.x, spot.z);
    group.position.set(spot.x, ground - (spot.sink || 0), spot.z);
    group.rotation.y = spot.h;
    if (spot.lie) {
      group.rotation.x = spot.lie[0];
      group.rotation.z = spot.lie[1];
      group.position.y += 0.18; // its back on the ground, not its middle
    }
    const s = { spot, group, inner, x: spot.x, z: spot.z, h: spot.h, index, found: false, circles: [] };

    const cutY = spot.broken ? spot.broken : null;
    for (const { geometry, part } of baked.parts) {
      addMoss(geometry, spot.moss);
      if (cutY === null) {
        const mesh = new THREE.Mesh(geometry, stoneMaterial(spot.tpl, part, false));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        inner.add(mesh);
        continue;
      }
      // broken: the part below a ragged line stays standing; the rest lies in pieces about it
      const jag = (x, z) => (D.noise2(x * 9 + index, z * 9) - 0.5) * 0.16;
      const cut = cutY + minY;
      const base = pickTriangles(geometry, (x, y, z) => y < cut + jag(x, z));
      if (base) {
        const mesh = new THREE.Mesh(base, stoneMaterial(spot.tpl, part, true));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        inner.add(mesh);
      }
      const pieces = [
        pickTriangles(geometry, (x, y, z) => y >= cut + jag(x, z) && y > 1.45 + minY),
        pickTriangles(geometry, (x, y, z) => y >= cut + jag(x, z) && y <= 1.45 + minY && x > 0.12),
        pickTriangles(geometry, (x, y, z) => y >= cut + jag(x, z) && y <= 1.45 + minY && x <= 0.12),
      ];
      pieces.forEach((piece, k) => {
        if (!piece) return;
        piece.computeBoundingBox();
        const centre = piece.boundingBox.getCenter(new THREE.Vector3());
        piece.translate(-centre.x, -centre.y, -centre.z);
        const mesh = new THREE.Mesh(piece, stoneMaterial(spot.tpl, part, true));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // fallen beside the base, tipped over, half in the dirt
        const a = spot.h + 1.2 + k * 2.1 + random() * 0.8;
        const d = 0.7 + k * 0.45 + random() * 0.5;
        const px = spot.x + Math.sin(a) * d;
        const pz = spot.z + Math.cos(a) * d;
        mesh.position.set(px, D.terrain.height(px, pz) + 0.12 * scale, pz);
        mesh.rotation.set(Math.PI / 2 + (random() - 0.5) * 0.8, random() * 6.3, (random() - 0.5) * 1.2, 'YXZ');
        mesh.scale.setScalar(scale);
        statues.group.add(mesh);
        s.circles.push({ x: px, z: pz, r: 0.3, top: mesh.position.y + 0.25 });
      });
      // rubble
      if (part === 'body') {
        for (let n = 0; n < 9; n++) {
          const parts = D.models.part('rocks', n % 3 ? 'stone' : 'slab');
          if (!parts.length) break;
          const a = random() * Math.PI * 2;
          const d = 0.4 + random() * 1.6;
          const px = spot.x + Math.sin(a) * d;
          const pz = spot.z + Math.cos(a) * d;
          const r = new THREE.Mesh(parts[0].geometry, rubbleMat());
          r.geometry.attributes.moss || addMoss(r.geometry, 0.4);
          const k = n % 3 ? 0.5 + random() * 1.2 : 0.12 + random() * 0.2;
          r.scale.setScalar(k);
          r.position.set(px, D.terrain.height(px, pz) - 0.03, pz);
          r.rotation.set(random() * 3, random() * 6, random() * 3);
          r.castShadow = true;
          r.receiveShadow = true;
          statues.group.add(r);
        }
      }
    }

    // a phone in the hand, stone like the hand
    if (baked.prop === 'phone' && baked.handAt) {
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), rubbleMat());
      addMoss(phone.geometry, spot.moss * 0.5);
      phone.position.copy(baked.handAt);
      phone.quaternion.copy(baked.handQ);
      phone.translateX(0.03);
      phone.translateY(0.06);
      phone.castShadow = true;
      inner.add(phone);
    }

    statues.group.add(group);
    group.updateMatrixWorld(true);

    // what blocks you: a circle for an upright figure, a row of them for one lying down
    const box = new THREE.Box3().setFromObject(group);
    s.top = box.max.y;
    if (spot.lie) {
      for (const t of [0.25, 0.85, 1.45]) {
        const p = new THREE.Vector3(0, t * scale, 0).applyEuler(group.rotation).add(group.position);
        s.circles.push({ x: p.x, z: p.z, r: 0.38, top: s.top });
      }
    } else if (cutY === null || cutY > 0.4) {
      const sitting = POSES[spot.pose] && POSES[spot.pose].drop;
      s.circles.push({ x: spot.x, z: spot.z, r: sitting ? 0.45 : 0.3, top: s.top });
    }
    // where the eye is drawn when you look at it
    s.focus = new THREE.Vector3(spot.x, spot.lie ? ground + 0.3 : ground + (box.max.y - box.min.y) * 0.75, spot.z);
    statues.list.push(s);
  }

  statues.build = () => {
    if (!D.models.npc.length) return;
    SPOTS.forEach((spot, i) => placeStatue(spot, i));
    statues.total = statues.list.length;
  };

  statues.update = () => {
    statues.group.visible = true;
  };

  // Pushes a body out of the statues; returns the top of one it stands on, if any.
  statues.collide = (pos, r) => {
    let stand = -Infinity;
    for (const s of statues.list) {
      if (Math.abs(s.x - pos.x) > 5 || Math.abs(s.z - pos.z) > 5) continue;
      for (const c of s.circles) {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d >= c.r + r) continue;
        if (pos.y > c.top - 0.4) {
          stand = Math.max(stand, c.top);
          continue;
        }
        if (d < 1e-4) continue;
        pos.x = c.x + (dx / d) * (c.r + r);
        pos.z = c.z + (dz / d) * (c.r + r);
      }
    }
    return stand;
  };

  // The statue in front of (x, z) facing h within reach, for examining.
  statues.nearest = (x, z, h, reach = 3) => {
    let best = null;
    let bestScore = Infinity;
    for (const s of statues.list) {
      if (s.awake) continue;
      const dx = s.x - x;
      const dz = s.z - z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const ahead = d < 0.5 ? 1 : (dx * Math.sin(h) + dz * Math.cos(h)) / d;
      if (ahead < 0.1) continue;
      const score = d - ahead * 1.2;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  };

  // ---------- Chapter 2: one of them wakes ----------

  statues.POSES = POSES;
  statues.BONES = BONES;
  // The stone figure gives way to a living one (chapter2.js): gone from view, and from the way.
  statues.wake = (s) => {
    if (s.awake) return;
    s.awake = true;
    s.group.visible = false;
    s.sleepCircles = s.circles;
    s.circles = [];
  };
  statues.unwake = (s) => {
    if (!s.awake) return;
    s.awake = false;
    s.group.visible = true;
    s.circles = s.sleepCircles || s.circles;
  };
  // A material for a living copy of a template's part, like the statues' (same photos).
  statues.livingMaterial = (tpl, part, uniforms) => {
    const t = D.models.npc[tpl];
    const maps = statues.maps[tpl] || (statues.maps[tpl] = {});
    const key = part === 'head' || part === 'opacity' ? part : 'body';
    const uri = t && t.maps[key];
    if (uri && !maps[key]) maps[key] = D.models.imageTexture(uri);
    const hair = part === 'opacity';
    const material = new THREE.MeshStandardMaterial({
      map: maps[key] || null, roughness: 0.85, metalness: 0, envMapIntensity: 0.6, skinning: true,
      alphaTest: hair ? 0.5 : 0, side: hair ? THREE.DoubleSide : THREE.FrontSide,
    });
    // the same stone as the statues (in the world's frame: the figure stands still while it is
    // stone), so the statue and its living copy look alike at the moment one becomes the other
    D.addStone(material, uniforms, { space: 'world', moss: false, scale: 1.6 });
    return material;
  };

  D.statues = statues;
})();
