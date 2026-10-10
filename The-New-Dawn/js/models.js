// The New Dawn: decoding the embedded 3D models (dawn-models.js, npc-models.js and the hero),
// giving them the world's materials, and cutting them into parts that can be drawn many times.
(() => {
  'use strict';
  const D = window.Dawn;

  const models = { list: {}, npc: [], hero: null };
  const partCache = new Map();
  const cleaned = new Map();

  const parseGlb = (buffer) => new Promise((done) => {
    new THREE.GLTFLoader().parse(buffer, '', done, (error) => {
      console.warn('A model failed to load.', error);
      done(null);
    });
  });
  const pause = () => new Promise((next) => setTimeout(next, 0));

  // Plain physically-based materials: matte, leaves cut out by their alpha (both sides
  // drawn), animals keeping their skinning.
  function prepare(name, gltf) {
    const root = gltf.scene;
    const made = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const source = o.material;
      if (!made.has(source)) {
        if (source.map) source.map.anisotropy = Math.min(D.maxAniso, D.gq.aniso);
        const cutOut = source.alphaTest > 0 || source.transparent;
        // leaves: no dark fringe (see cleanCutout); the textures are not flipped (glTF)
        if (cutOut && source.map && !o.isSkinnedMesh) {
          if (!cleaned.has(source.map)) cleaned.set(source.map, D.cleanCutout(source.map));
          source.map = cleaned.get(source.map);
        }
        // leaves and fronds are lit the cheap way (see D.foliageMaterial); the rest physically
        const material = cutOut && !o.isSkinnedMesh
          ? D.foliageMaterial({ color: source.color, map: source.map, vertexColors: !!o.geometry.attributes.color, side: THREE.DoubleSide, alphaTest: 0.45 })
          : new THREE.MeshStandardMaterial({
            color: source.color, map: source.map, normalMap: cutOut ? null : source.normalMap,
            vertexColors: !!o.geometry.attributes.color, skinning: !!o.isSkinnedMesh,
            side: cutOut || source.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
            alphaTest: cutOut ? 0.45 : 0, transparent: false,
            roughness: cutOut ? 0.8 : 0.88, metalness: 0, envMapIntensity: 0.6,
          });
        material.name = source.name;
        material.userData.cutOut = cutOut;
        made.set(source, material);
      }
      o.material = made.get(source);
      if (o.isSkinnedMesh) o.frustumCulled = false; // its bounds do not follow the animation
    });
    models.list[name] = { root, animations: gltf.animations };
  }

  models.load = async (progress = () => {}) => {
    const all = window.DAWN_MODELS || {};
    const names = Object.keys(all);
    const npcs = window.NPC_MODELS || [];
    const total = names.length + npcs.length + 1;
    let done = 0;
    for (const name of names) {
      await pause();
      const gltf = await parseGlb(D.base64Buffer(all[name]));
      if (gltf) prepare(name, gltf);
      progress(++done / total);
    }
    delete window.DAWN_MODELS; // decoded: the text is not needed again

    // the people of stone (see statues.js): Rocketbox avatars with their own clips
    for (const entry of npcs) {
      await pause();
      const gltf = await parseGlb(D.base64Buffer(entry.glb));
      if (gltf) {
        const clips = {};
        for (const [name, clip] of Object.entries(entry.clips)) {
          clips[name] = new THREE.AnimationClip(name, clip.duration, clip.tracks.map((t) => (t.path === 'q'
            ? new THREE.QuaternionKeyframeTrack(`${t.bone}.quaternion`, clip.times, t.values)
            : new THREE.VectorKeyframeTrack(`${t.bone}.position`, clip.times, t.values))));
        }
        models.npc.push({ name: entry.name, scene: gltf.scene, clips, female: !!entry.female, maps: { body: entry.body, head: entry.head, opacity: entry.opacity } });
      }
      progress(++done / total);
    }
    delete window.NPC_MODELS;

    // the hero
    if (window.HERO_GLB) {
      await pause();
      const gltf = await parseGlb(D.base64Buffer(window.HERO_GLB));
      if (gltf) models.hero = { root: gltf.scene, clips: window.HERO_CLIPS || {} };
    }
    progress(1);
  };

  // A picture for a model's texture from a data URI (the avatars keep theirs that way).
  models.imageTexture = (uri, srgb = true) => {
    const tex = new THREE.Texture();
    tex.flipY = false; // glTF texture coordinates count from the top
    tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
    tex.anisotropy = Math.min(D.maxAniso, D.gq.aniso);
    D.madeTextures.push(tex);
    const image = new Image();
    tex.ready = new Promise((done) => {
      image.onload = () => {
        tex.image = image;
        tex.needsUpdate = true;
        done();
      };
      image.onerror = done;
    });
    image.src = uri;
    return tex;
  };

  // Joins geometries into one (positions, normals, uvs; packed attributes unpacked).
  function joinGeometries(list) {
    let vertices = 0;
    let indices = 0;
    for (const g of list) {
      vertices += g.attributes.position.count;
      indices += g.index ? g.index.count : g.attributes.position.count;
    }
    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let v = 0;
    let i = 0;
    const copy = (attribute, out, at, size) => {
      if (!attribute) return;
      const unit = attribute.normalized ? 1 / ({ Int8Array: 127, Uint8Array: 255, Int16Array: 32767, Uint16Array: 65535 }[attribute.array.constructor.name] || 1) : 1;
      for (let k = 0; k < attribute.count; k++) {
        out[(at + k) * size] = attribute.getX(k) * unit;
        out[(at + k) * size + 1] = attribute.getY(k) * unit;
        if (size === 3) out[(at + k) * size + 2] = attribute.getZ(k) * unit;
      }
    };
    for (const g of list) {
      const n = g.attributes.position.count;
      copy(g.attributes.position, position, v, 3);
      copy(g.attributes.normal, normal, v, 3);
      copy(g.attributes.uv, uv, v, 2);
      if (g.index) for (let k = 0; k < g.index.count; k++) index[i++] = g.index.array[k] + v;
      else for (let k = 0; k < n; k++) index[i++] = v + k;
      v += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(position, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(index, 1));
    out.computeBoundingSphere();
    return out;
  }
  models.joinGeometries = joinGeometries;

  // One named part of a model (or all of it), baked into the part's own frame and joined by
  // material, ready to be drawn many times over: [{ geometry, material }].
  models.part = (model, part = null) => {
    const key = `${model}/${part || ''}`;
    if (partCache.has(key)) return partCache.get(key);
    const entry = models.list[model];
    const node = entry && (part ? entry.root.getObjectByName(part) : entry.root);
    if (!node) return [];
    entry.root.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const byMaterial = new Map();
    node.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const geometry = joinGeometries([o.geometry]).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
      byMaterial.get(o.material).push(geometry);
    });
    const parts = [...byMaterial].map(([material, list]) => {
      const geometry = list.length > 1 ? joinGeometries(list) : list[0];
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return { geometry, material };
    });
    partCache.set(key, parts);
    return parts;
  };

  // A copy of a part to place on its own (sharing the geometry and materials).
  models.mesh = (model, part = null) => {
    const group = new THREE.Group();
    for (const { geometry, material } of models.part(model, part)) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  };

  // The size of a part: a Box3 in its own frame.
  models.bounds = (model, part = null) => {
    const box = new THREE.Box3();
    for (const { geometry } of models.part(model, part)) box.union(geometry.boundingBox);
    return box;
  };

  D.models = models;
})();
