// The New Dawn: shader pieces shared by many materials: noise, the dark of the cave, plants
// swaying in the wind, and petrified stone (the statues, and the hero's shell at the start).
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, smoothstep } = D;

  // ---------- The cave's shape (cave.js carves it; the light fades inside it) ----------

  // The cave is a hollow in a mass of rock at the foot of the southern mountains: a tunnel
  // from the mouth (facing north) into a high chamber where the bats roost.
  const floor = 11;
  D.CAVE = {
    x: 18, z: 270, floor,
    mass: { x: 18, y: floor + 5, z: 273, rx: 31, ry: 21, rz: 28 },
    chamber: { x: 18, y: floor + 3.4, z: 279, rx: 11.5, ry: 7.5, rz: 13 },
    tunnel: { x: 18, y: floor + 2.6, z0: 236, z1: 270, rx: 5.6, ry: 4.6 },
    mouthZ: 246, // where the tunnel comes out of the rock
    statue: { x: 18, z: 254 }, // where the hero has stood for a thousand years
    // Chapter 2: the Nitre Galleries, through a crack in the tunnel's east wall beside the vein,
    // carved in a second mass of rock set into the mountain: a hall crusted with nitre, a
    // passage on to the hall of the great Revonite vein (and a colony of bats), and a nook.
    galleries: {
      mass: { x: 40, y: floor + 5, z: 272, rx: 22, ry: 18, rz: 29 },
      halls: [
        { name: 'nitre', x: 37.5, y: floor + 2.6, z: 265.5, rx: 6.5, ry: 4.0, rz: 7.0 },
        { name: 'vein', x: 45.5, y: floor + 3.6, z: 285, rx: 7.0, ry: 5.0, rz: 7.0 },
        { name: 'nook', x: 44.5, y: floor + 1.8, z: 254.5, rx: 3.0, ry: 2.4, rz: 3.0 },
      ],
      // capsules: from a to b, half-width hw, half-height hh
      ways: [
        { name: 'crack', a: [22.4, floor + 1.4, 259], b: [32.2, floor + 1.4, 262.8], hw: 0.95, hh: 1.4 },
        { name: 'passage', a: [41, floor + 1.9, 270.5], b: [44.8, floor + 1.9, 279.5], hw: 1.5, hh: 1.9 },
        { name: 'nookway', a: [40.5, floor + 1.6, 260.5], b: [43.5, floor + 1.6, 256.5], hw: 1.1, hh: 1.4 },
      ],
      vein: [51.2, floor + 2.0, 289.0], // the great seam, on the far wall of the vein hall
    },
  };

  // How far inside the cave a point is: 0 outside or at the mouth, 1 deep in the chamber.
  const C = D.CAVE;
  D.caveDarkness = (p) => {
    const ch = Math.hypot((p.x - C.chamber.x) / (C.chamber.rx + 3), (p.y - C.chamber.y) / (C.chamber.ry + 3), (p.z - C.chamber.z) / (C.chamber.rz + 3));
    const tz = clamp(p.z, C.tunnel.z0, C.tunnel.z1);
    const tu = Math.hypot((p.x - C.tunnel.x) / (C.tunnel.rx + 2.5), (p.y - C.tunnel.y) / (C.tunnel.ry + 2.5), (p.z - tz) / 6);
    const inside = 1 - smoothstep(0.85, 1.05, Math.min(ch, tu));
    return Math.max(inside * smoothstep(-1, 24, p.z - C.mouthZ), 1 - smoothstep(0.85, 1.05, D.galleryReach(p.x, p.y, p.z)));
  };
  // How far into the galleries a point is: below 1 within them (with 2.5 m to spare), more outside.
  const G = C.galleries;
  D.galleryReach = (x, y, z) => {
    let best = Infinity;
    for (const hl of G.halls) best = Math.min(best, Math.hypot((x - hl.x) / (hl.rx + 2.5), (y - hl.y) / (hl.ry + 2.5), (z - hl.z) / (hl.rz + 2.5)));
    for (const w of G.ways) {
      const [ax, ay, az] = w.a;
      const bx = w.b[0] - ax;
      const by = w.b[1] - ay;
      const bz = w.b[2] - az;
      const t = clamp(((x - ax) * bx + (y - ay) * by + (z - az) * bz) / (bx * bx + by * by + bz * bz), 0, 1);
      best = Math.min(best, Math.hypot((x - ax - bx * t) / (w.hw + 2.5), (y - ay - by * t) / (w.hh + 2.5), (z - az - bz * t) / (w.hw + 2.5)));
    }
    return best;
  };

  // The cave's own light is worked out in the shaders that need it rather than by real lights
  // (a light costs every pixel of every surface, wherever it is): caveGlow, the Revonite's
  // green, falls off round the vein; caveLift brightens the dark inside for the opening scenes.
  D.caveUniforms = {
    caveGlow: { value: 1 }, caveLift: { value: 0 },
    // Chapter 2's fires and torch (camp.js moves them): where (xyz) and how strong (w)
    fireA: { value: new THREE.Vector4(0, -999, 0, 0) }, fireB: { value: new THREE.Vector4(0, -999, 0, 0) },
    torchL: { value: new THREE.Vector4(0, -999, 0, 0) }, localOn: { value: 0 },
  };
  const f = (v) => v.toFixed(2);
  D.GLSL_CAVE = `
    uniform float caveGlow;
    uniform float caveLift;
    uniform vec4 fireA;
    uniform vec4 fireB;
    uniform vec4 torchL;
    uniform float localOn;
    // a fire's (or a torch's) warm light: xyz where, w how strong; falls off over range metres
    vec3 dawnFireLight(vec3 p, vec4 f, float range) {
      vec3 d = p - f.xyz;
      float k = clamp(1.0 - dot(d, d) / (range * range), 0.0, 1.0);
      return vec3(1.0, 0.56, 0.24) * k * k * f.w;
    }
    // how far from a capsule's axis, in its radii
    float dawnWay(vec3 p, vec3 a, vec3 b, vec3 r) {
      vec3 ab = b - a;
      float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
      return length((p - (a + ab * t)) / r);
    }
    vec3 dawnCaveGlow(vec3 p) {
      vec3 d = p - vec3(${f(C.statue.x)}, ${f(C.floor + 4.5)}, ${f(C.statue.z + 1.5)});
      float k = clamp(1.0 - length(d) / 10.0, 0.0, 1.0);
      // as the green point light it replaces: its colour, 0.8 strong, falling off over 10 m, about half facing it
      vec3 glow = vec3(0.33, 1.0, 0.69) * k * k * caveGlow * 0.4;
      // the great vein in the galleries
      vec3 d2 = p - vec3(${C.galleries.vein.map(f).join(', ')});
      float k2 = clamp(1.0 - length(d2) / 11.0, 0.0, 1.0);
      glow += vec3(0.33, 1.0, 0.69) * k2 * k2 * caveGlow * 0.55;
      if (localOn > 0.5) glow += dawnFireLight(p, fireA, 12.0) + dawnFireLight(p, fireB, 12.0) + dawnFireLight(p, torchL, 9.0);
      return glow;
    }
    float dawnCaveLight(vec3 p) {
      float ch = length((p - vec3(${f(C.chamber.x)}, ${f(C.chamber.y)}, ${f(C.chamber.z)})) / vec3(${f(C.chamber.rx + 3)}, ${f(C.chamber.ry + 3)}, ${f(C.chamber.rz + 3)}));
      float tz = clamp(p.z, ${f(C.tunnel.z0)}, ${f(C.tunnel.z1)});
      float tu = length((p - vec3(${f(C.tunnel.x)}, ${f(C.tunnel.y)}, tz)) / vec3(${f(C.tunnel.rx + 2.5)}, ${f(C.tunnel.ry + 2.5)}, 6.0));
      float inside = 1.0 - smoothstep(0.85, 1.05, min(ch, tu)) * 1.0;
      inside *= smoothstep(-1.0, 24.0, p.z - ${f(C.mouthZ)});
      // the galleries beyond the crack: wholly dark
      float gal = 9.0;
      ${C.galleries.halls.map((hl) => `gal = min(gal, length((p - vec3(${f(hl.x)}, ${f(hl.y)}, ${f(hl.z)})) / vec3(${f(hl.rx + 2.5)}, ${f(hl.ry + 2.5)}, ${f(hl.rz + 2.5)})));`).join('\n      ')}
      ${C.galleries.ways.map((w) => `gal = min(gal, dawnWay(p, vec3(${w.a.map(f).join(', ')}), vec3(${w.b.map(f).join(', ')}), vec3(${f(w.hw + 2.5)}, ${f(w.hh + 2.5)}, ${f(w.hw + 2.5)})));`).join('\n      ')}
      inside = max(inside, 1.0 - smoothstep(0.85, 1.05, gal));
      return mix(1.0, mix(0.035, 0.3, caveLift), inside);
    }`;

  // ---------- Noise ----------

  D.GLSL_NOISE = `
    float dawnHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float dawnNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(dawnHash(i), dawnHash(i + vec2(1.0, 0.0)), f.x), mix(dawnHash(i + vec2(0.0, 1.0)), dawnHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float dawnHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float dawnNoise3(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(dawnHash3(i), dawnHash3(i + vec3(1, 0, 0)), f.x), mix(dawnHash3(i + vec3(0, 1, 0)), dawnHash3(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(dawnHash3(i + vec3(0, 0, 1)), dawnHash3(i + vec3(1, 0, 1)), f.x), mix(dawnHash3(i + vec3(0, 1, 1)), dawnHash3(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }`;

  // ---------- Wind ----------

  // Plants sway: the higher a vertex is above the plant's foot, the further it moves, each
  // plant out of step with its neighbours, with a quicker flutter on top of the slow bend.
  D.windUniforms = { windTime: { value: 0 }, windStrength: { value: 1 } };
  D.onFrame((dt, time) => {
    D.windUniforms.windTime.value = time;
  });
  D.addWind = (material, amount = 0.02, flutter = 0.006) => {
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      if (before) before(shader, renderer);
      shader.uniforms.windTime = D.windUniforms.windTime;
      shader.uniforms.windStrength = D.windUniforms.windStrength;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float windTime;\nuniform float windStrength;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 windAt = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          #else
            vec2 windAt = vec2(modelMatrix[3][0], modelMatrix[3][2]);
          #endif
          float windPhase = windAt.x * 0.21 + windAt.y * 0.17;
          float windH = pow(max(position.y, 0.0), 1.4);
          float gust = 0.65 + 0.35 * sin(windTime * 0.31 + windAt.x * 0.02);
          transformed.x += (sin(windTime * 1.25 + windPhase) * ${amount.toFixed(4)} * gust + sin(windTime * 4.1 + windPhase * 3.0 + position.z * 2.0) * ${flutter.toFixed(4)}) * windH * windStrength;
          transformed.z += (cos(windTime * 1.05 + windPhase * 1.3) * ${(amount * 0.7).toFixed(4)} * gust + cos(windTime * 3.7 + windPhase * 2.0 + position.x * 2.0) * ${flutter.toFixed(4)}) * windH * windStrength;`);
    };
    const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
    material.customProgramCacheKey = () => `${key()}|wind:${amount}:${flutter}`;
    return material;
  };

  // ---------- Foliage ----------

  // Leaves, grass and ferns: lit at their corners (Lambert, as in Car Drive) rather than at every
  // pixel, which matters where layer on layer of them overlap, and given the soft fill from
  // the sky that the other surfaces take from the captured sky (engine.js sets foliageSky).
  D.foliageUniforms = { foliageSky: { value: new THREE.Color() } };
  D.foliageMaterial = (options) => {
    const material = new THREE.MeshLambertMaterial(options);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.foliageSky = D.foliageUniforms.foliageSky;
      Object.assign(shader.uniforms, D.caveUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform vec3 foliageSky;\n${D.GLSL_CAVE}`)
        .replace('#include <lights_lambert_vertex>', `#include <lights_lambert_vertex>
          vec3 fireLit = vec3(0.0);
          if (localOn > 0.5) {
            #ifdef USE_INSTANCING
              vec3 fwp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
            #else
              vec3 fwp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            #endif
            fireLit = dawnFireLight(fwp, fireA, 12.0) + dawnFireLight(fwp, fireB, 12.0) + dawnFireLight(fwp, torchL, 9.0);
          }
          vIndirectFront += foliageSky + fireLit;
          #ifdef DOUBLE_SIDED
            vIndirectBack += foliageSky + fireLit;
          #endif`);
    };
    material.customProgramCacheKey = () => 'dawn-foliage';
    material.userData.cutOut = true;
    material.userData.foliage = true;
    return material;
  };

  // ---------- Stone ----------

  // Petrified flesh and cloth: grey stone (a photo, projected from three sides), keeping a
  // ghost of what it was (the original picture's light and dark: seams, eyes, folds), with
  // moss creeping over whatever faces the sky, hairline cracks, and on broken edges the
  // rougher inside of the stone. For the hero, `petrify` dissolves it away (1 = all stone)
  // and `crack` lights the cracks from inside, green.
  //   options.space: 'world' (statues: moss grows on what faces up) or 'object' (the hero,
  //   whose stone must stay put on him as he moves)
  D.stoneUniforms = () => ({
    tStone: { value: D.photo('stone', 'color') },
    nStone: { value: D.photo('stone', 'normal') },
    tMoss: { value: D.photo('moss', 'color') },
    petrify: { value: 1 },
    crack: { value: 0 },
    crackColor: { value: new THREE.Color(0x63ffb4) },
  });

  D.addStone = (material, uniforms, { space = 'world', moss = true, scale = 1.6 } = {}) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, D.caveUniforms);
      const objectSpace = space === 'object';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vSPos;
          varying vec3 vSNorm;
          varying vec3 vSObj;
          varying vec3 vSAxisX;
          varying vec3 vSAxisY;
          varying vec3 vSAxisZ;
          ${moss ? 'attribute float moss;' : ''}
          varying float vMoss;`)
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
          vSNorm = ${objectSpace ? 'objectNormal' : 'normalize(mat3(modelMatrix) * objectNormal)'};`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vSObj = position;
          vSAxisX = normalize(mat3(modelMatrix)[0]);
          vSAxisY = normalize(mat3(modelMatrix)[1]);
          vSAxisZ = normalize(mat3(modelMatrix)[2]);
          vMoss = ${moss ? 'moss' : '0.0'};`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vSPos = ${objectSpace ? 'position' : '(modelMatrix * vec4(transformed, 1.0)).xyz'};`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tStone;
          uniform sampler2D nStone;
          uniform sampler2D tMoss;
          uniform float petrify;
          uniform float crack;
          uniform vec3 crackColor;
          varying vec3 vSPos;
          varying vec3 vSNorm;
          varying vec3 vSObj;
          varying vec3 vSAxisX;
          varying vec3 vSAxisY;
          varying vec3 vSAxisZ;
          varying float vMoss;
          ${D.GLSL_NOISE}
          ${D.GLSL_CAVE}
          vec3 sLin(vec4 c) { return pow(c.rgb, vec3(2.2)); }
          vec3 triTex(sampler2D t, vec3 p, vec3 w) {
            return sLin(texture2D(t, p.zy)) * w.x + sLin(texture2D(t, p.xz)) * w.y + sLin(texture2D(t, p.xy)) * w.z;
          }`)
        .replace('#include <map_fragment>', `
          vec3 sN = normalize(vSNorm);
          vec3 sW = vec3(0.0);
          vec3 sP = vSPos * ${scale.toFixed(2)};
          vec3 original = diffuse;
          #ifdef USE_MAP
            vec4 texelColor = mapTexelToLinear(texture2D(map, vUv));
            original = texelColor.rgb * diffuse;
            diffuseColor.a *= texelColor.a;
          #endif
          // how much of it is stone: all of a statue; the hero's shell as it flakes away (and
          // none of him at all once it has gone, when none of the work below is done)
          float shell = 0.0;
          if (petrify >= 0.999) shell = 1.0;
          else if (petrify > 0.001) {
            float dn = dawnNoise3(vSObj * 6.0) * 0.7 + dawnNoise3(vSObj * 17.0) * 0.3;
            shell = smoothstep(dn - 0.04, dn + 0.04, petrify * 1.08 - 0.04);
          }
          float lines = 0.0;
          float fine = 0.0;
          vec3 stoneC = vec3(0.0);
          if (shell > 0.0) {
            sW = pow(abs(sN), vec3(3.0));
            sW /= sW.x + sW.y + sW.z;
            stoneC = triTex(tStone, sP, sW);
            float sLum = dot(stoneC, vec3(0.3, 0.59, 0.11));
            stoneC = mix(vec3(sLum), stoneC, 0.3) * vec3(0.98, 0.97, 0.94) * 1.3;
            float ghost = dot(original, vec3(0.3, 0.59, 0.11));
            stoneC *= 0.66 + 0.75 * sqrt(clamp(ghost, 0.0, 1.0));
            // hairline cracks: the ridges of a wandering noise
            vec3 cp = vSObj * 3.2;
            float cn = dawnNoise3(cp) * 0.65 + dawnNoise3(cp * 2.3 + 7.0) * 0.35;
            lines = 1.0 - smoothstep(0.0, 0.022, abs(cn - 0.5));
            fine = 1.0 - smoothstep(0.0, 0.012, abs(dawnNoise3(cp * 3.7 + 3.0) - 0.5));
            lines = max(lines, fine * 0.6);
            // moss, on what faces the sky
            float mossAmount = 0.0;
            if (vMoss > 0.001) {
              float mn = dawnNoise3(vSPos * 2.2) * 0.6 + dawnNoise3(vSPos * 7.0) * 0.4;
              mossAmount = smoothstep(0.35, 0.75, sN.y * 0.55 + mn * 0.65 + vMoss * 0.9 - 0.55) * min(1.0, vMoss * 1.6);
            }
            vec3 stoneFinal = stoneC;
            if (mossAmount > 0.001) stoneFinal = mix(stoneC, triTex(tMoss, vSPos * 0.9, sW) * vec3(0.55, 0.85, 0.42), mossAmount);
            stoneFinal *= 1.0 - lines * 0.55 * (1.0 - mossAmount);
            original = mix(original, stoneFinal, shell);
          }
          diffuseColor.rgb = gl_FrontFacing ? original : stoneC * 0.62;`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = mix(roughness, 0.93, shell);`)
        .replace('#include <normal_fragment_maps>', `
          if (shell > 0.01) {
            vec3 n1 = texture2D(nStone, sP.zy).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(nStone, sP.xz).xyz * 2.0 - 1.0;
            vec3 n3 = texture2D(nStone, sP.xy).xyz * 2.0 - 1.0;
            vec3 pert = vec3(0.0, n1.y, n1.x) * sW.x + vec3(n2.x, 0.0, n2.y) * sW.y + vec3(n3.x, n3.y, 0.0) * sW.z;
            ${objectSpace ? 'pert = vSAxisX * pert.x + vSAxisY * pert.y + vSAxisZ * pert.z;' : ''}
            normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz * 0.9 * shell);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += crackColor * (lines * 0.8 + fine * 0.2) * crack * shell * 0.9;`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float sCave = dawnCaveLight(vWorldPosForCave);
          reflectedLight.indirectDiffuse *= sCave;
          reflectedLight.indirectSpecular *= sCave;
          reflectedLight.indirectDiffuse += dawnCaveGlow(vWorldPosForCave) * material.diffuseColor;`);
      // the world position, for the cave's dark (worldpos_vertex only makes it when needed)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosForCave;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWorldPosForCave = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosForCave;');
    };
    material.customProgramCacheKey = () => `dawn-stone:${space}:${moss}:${scale}:${!!material.map}`;
    return material;
  };

  // The cave's dark for any standard material (the hero, the bats, the crystals' rock...).
  D.addCaveShade = (material) => {
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      if (before) before(shader, renderer);
      Object.assign(shader.uniforms, D.caveUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosForCave;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWorldPosForCave = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPosForCave;\n${D.GLSL_CAVE}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float cShade = dawnCaveLight(vWorldPosForCave);
          reflectedLight.indirectDiffuse *= cShade;
          reflectedLight.indirectSpecular *= cShade;
          reflectedLight.indirectDiffuse += dawnCaveGlow(vWorldPosForCave) * material.diffuseColor;`);
    };
    const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
    material.customProgramCacheKey = () => `${key()}|cave`;
    return material;
  };
})();
