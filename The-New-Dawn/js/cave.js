// The New Dawn: the Awakening Cave (Zone 1).
//
// The cave is carved, not modelled: a mass of rock with a tunnel and a high chamber taken out
// of it, all described by one signed distance (negative inside the rock), and turned into a
// mesh with surface nets. The same distance keeps the hero out of the walls. Inside: the
// stalactites, the bat colony on the ceiling, guano heaped on the floor, a vein of glowing
// Revonite in the wall, and the drip that has fallen on the statue for a thousand years.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, lerp, smoothstep, fbm3, noise3, rand } = D;
  const C = D.CAVE;

  // ---------- The shape ----------

  const smin = (a, b, k) => {
    const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
    return lerp(b, a, h) - k * h * (1 - h);
  };

  // Chapter 2's galleries (shaders.js lays them out): their own mass of rock, and their hollow
  // as halls (ellipsoids) joined by ways (capsules). Signed distances, negative inside.
  const G = C.galleries;
  const ellipsoid = (x, y, z, e) => (Math.hypot((x - e.x) / e.rx, (y - e.y) / e.ry, (z - e.z) / e.rz) - 1) * Math.min(e.rx, e.ry, e.rz);
  function way(x, y, z, w) {
    const [ax, ay, az] = w.a;
    const bx = w.b[0] - ax;
    const by = w.b[1] - ay;
    const bz = w.b[2] - az;
    const t = clamp(((x - ax) * bx + (y - ay) * by + (z - az) * bz) / (bx * bx + by * by + bz * bz), 0, 1);
    return (Math.hypot((x - ax - bx * t) / w.hw, (y - ay - by * t) / w.hh, (z - az - bz * t) / w.hw) - 1) * Math.min(w.hw, w.hh);
  }
  const nearGalleries = (x, y, z) => Math.abs(x - G.mass.x) < G.mass.rx + 4 && Math.abs(z - G.mass.z) < G.mass.rz + 4 && y < G.mass.y + G.mass.ry + 2;
  function galleryHollow(x, y, z) {
    let d = 1e6;
    for (const hl of G.halls) d = Math.min(d, ellipsoid(x, y, z, hl));
    for (const w of G.ways) d = smin(d, way(x, y, z, w), 1.2);
    return d;
  }

  // Signed distance to the rock: negative inside it, positive in the air (and the hollow).
  function sdf(x, y, z) {
    const M = C.mass;
    const em = Math.hypot((x - M.x) / M.rx, (y - M.y) / M.ry, (z - M.z) / M.rz);
    let mass = (em - 1) * Math.min(M.rx, M.ry, M.rz);
    const near2 = nearGalleries(x, y, z);
    if (near2) mass = smin(mass, ellipsoid(x, y, z, G.mass), 6);
    // the hollow: the chamber and the tunnel, run together
    const H = C.chamber;
    const eh = Math.hypot((x - H.x) / H.rx, (y - H.y) / H.ry, (z - H.z) / H.rz);
    let chamber = (eh - 1) * Math.min(H.rx, H.ry);
    const T = C.tunnel;
    const tz = clamp(z, T.z0, T.z1);
    // the tunnel narrows a little toward the mouth, and its floor is flatter than its roof
    const widen = 1 + 0.15 * smoothstep(T.z0 + 8, T.z1, z);
    const ty = y - T.y;
    const et = Math.hypot((x - T.x) / (T.rx * widen), ty / ((ty < 0 ? T.ry * 0.8 : T.ry) * widen), (z - tz) / 3);
    let tunnel = (et - 1) * Math.min(T.rx, T.ry);
    // the far end of the tunnel is closed; the near end runs out into the air
    if (z > T.z1) tunnel = Math.max(tunnel, z - T.z1 - 2);
    let gal = near2 ? galleryHollow(x, y, z) : 1e6; // (finite: smin of Infinity is NaN)
    const base = Math.max(mass, -smin(smin(chamber, tunnel, 3.5), gal, 1.2));
    if (Math.abs(base) > 7) return base; // far from any surface: no need for the detail
    mass += (fbm3(x * 0.07, y * 0.07, z * 0.07, 3) - 0.5) * 9 + (noise3(x * 0.32, y * 0.32, z * 0.32) - 0.5) * 1.4;
    const wall = (fbm3(x * 0.16 + 9, y * 0.16, z * 0.16, 3) - 0.5) * 2.8 + (noise3(x * 0.55, y * 0.55, z * 0.55) - 0.5) * 0.7;
    chamber += wall;
    tunnel += wall * 0.8;
    gal += wall * 0.45;
    return Math.max(mass, -smin(smin(chamber, tunnel, 3.5), gal, 1.2));
  }

  // ---------- Surface nets ----------

  // Every grid cell the surface passes through gets one vertex (the average of where the
  // surface cuts its edges); every grid edge it crosses gets a quad joining the four cells round it.
  function surfaceNets(fn, x0, y0, z0, nx, ny, nz, step) {
    const values = new Float32Array(nx * ny * nz);
    const at = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) values[at(i, j, k)] = fn(x0 + i * step, y0 + j * step, z0 + k * step);
      }
    }
    const cx = nx - 1;
    const cy = ny - 1;
    const cellAt = (i, j, k) => i + cx * (j + cy * k);
    const cellVertex = new Int32Array(cx * cy * (nz - 1)).fill(-1);
    const positions = [];
    const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const v = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) {
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          let inside = 0;
          for (let c = 0; c < 8; c++) {
            v[c] = values[at(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
            if (v[c] < 0) inside++;
          }
          if (inside === 0 || inside === 8) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let n = 0;
          for (const [a, b] of edges) {
            if ((v[a] < 0) === (v[b] < 0)) continue;
            const t = v[a] / (v[a] - v[b]);
            sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
            sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
            sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
            n++;
          }
          cellVertex[cellAt(i, j, k)] = positions.length / 3;
          positions.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (k + sz / n) * step);
        }
      }
    }
    const index = [];
    const p = (q) => [positions[q * 3], positions[q * 3 + 1], positions[q * 3 + 2]];
    const quad = (a, b, c, d, axis, rockFirst) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      // the face must point from the rock into the air
      const [ax, ay, az] = p(a);
      const [bx, by, bz] = p(b);
      const [cx2, cy2, cz2] = p(c);
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const wx = cx2 - ax;
      const wy = cy2 - ay;
      const wz = cz2 - az;
      const nrm = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx][axis];
      const flip = (nrm > 0) !== rockFirst;
      const da = p(a);
      const dc = p(c);
      const db = p(b);
      const dd = p(d);
      const ac = (da[0] - dc[0]) ** 2 + (da[1] - dc[1]) ** 2 + (da[2] - dc[2]) ** 2;
      const bd = (db[0] - dd[0]) ** 2 + (db[1] - dd[1]) ** 2 + (db[2] - dd[2]) ** 2;
      let tris = ac < bd ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
      if (flip) tris = [tris[0], tris[2], tris[1], tris[3], tris[5], tris[4]];
      // each triangle on its own must face the air: where a bumpy wall folds a quad, its second
      // half can come out turned away, a hole seen from inside (the galleries showed them)
      for (let t = 0; t < 6; t += 3) {
        const [p0, p1, p2] = [p(tris[t]), p(tris[t + 1]), p(tris[t + 2])];
        const u0 = p1[0] - p0[0];
        const u1 = p1[1] - p0[1];
        const u2 = p1[2] - p0[2];
        const w0 = p2[0] - p0[0];
        const w1 = p2[1] - p0[1];
        const w2 = p2[2] - p0[2];
        const n = [u1 * w2 - u2 * w1, u2 * w0 - u0 * w2, u0 * w1 - u1 * w0][axis];
        if (n !== 0 && (n > 0) !== rockFirst) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
      }
      index.push(...tris);
    };
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const here = values[at(i, j, k)] < 0;
          // along x
          if (i < nx - 1 && here !== (values[at(i + 1, j, k)] < 0)) {
            quad(cellVertex[cellAt(i, j - 1, k - 1)], cellVertex[cellAt(i, j, k - 1)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j - 1, k)], 0, here);
          }
          if (j < ny - 1 && here !== (values[at(i, j + 1, k)] < 0)) {
            quad(cellVertex[cellAt(i - 1, j, k - 1)], cellVertex[cellAt(i, j, k - 1)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i - 1, j, k)], 1, here);
          }
          if (k < nz - 1 && here !== (values[at(i, j, k + 1)] < 0)) {
            quad(cellVertex[cellAt(i - 1, j - 1, k)], cellVertex[cellAt(i, j - 1, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i - 1, j, k)], 2, here);
          }
        }
      }
    }
    return { positions: new Float32Array(positions), index };
  }

  // ---------- Materials ----------

  // Wet limestone: the photo projected from three sides, dark and slick inside, mossy where
  // the outside faces the sky, streaked white with guano under the roost, and the Revonite
  // vein glowing green in the tunnel wall above the statue.
  const caveUniforms = {
    tRock: { value: null }, nRock: { value: null }, tMoss: { value: null }, tNoise: { value: null },
    veinGlow: { value: 1 }, time: { value: 0 },
  };
  function caveMaterial() {
    caveUniforms.tRock.value = D.photo('cave', 'color');
    caveUniforms.nRock.value = D.photo('cave', 'normal');
    caveUniforms.tMoss.value = D.photo('moss', 'color');
    caveUniforms.tNoise.value = D.noiseTexture;
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.5 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, caveUniforms, D.caveUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCPos;\nvarying vec3 vCNorm;')
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
          vec3 cn = objectNormal;
          #ifdef USE_INSTANCING
            cn = mat3(instanceMatrix) * cn;
          #endif
          vCNorm = normalize(mat3(modelMatrix) * cn);`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 cwp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cwp = instanceMatrix * cwp;
          #endif
          vCPos = (modelMatrix * cwp).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tRock, nRock, tMoss, tNoise;
          uniform float veinGlow;
          uniform float time;
          varying vec3 vCPos;
          varying vec3 vCNorm;
          ${D.GLSL_NOISE}
          ${D.GLSL_CAVE}
          vec3 cLin(vec4 c) { return c.rgb * (c.rgb * (c.rgb * 0.305306011 + 0.682171111) + 0.012522878); }`)
        .replace('#include <map_fragment>', `
          vec3 cN = normalize(vCNorm);
          vec3 cW = pow(abs(cN), vec3(4.0));
          cW /= cW.x + cW.y + cW.z;
          vec3 cP = vCPos / 6.0;
          // two scales, from whichever sides the wall faces
          vec3 rock = vec3(0.0);
          if (cW.x > 0.03) rock += mix(cLin(texture2D(tRock, cP.zy)), cLin(texture2D(tRock, cP.zy * 0.31 + 0.5)), 0.4) * cW.x;
          if (cW.y > 0.03) rock += mix(cLin(texture2D(tRock, cP.xz)), cLin(texture2D(tRock, cP.xz * 0.31 + 0.5)), 0.4) * cW.y;
          if (cW.z > 0.03) rock += mix(cLin(texture2D(tRock, cP.xy)), cLin(texture2D(tRock, cP.xy * 0.31 + 0.5)), 0.4) * cW.z;
          rock /= (cW.x > 0.03 ? cW.x : 0.0) + (cW.y > 0.03 ? cW.y : 0.0) + (cW.z > 0.03 ? cW.z : 0.0) + 1e-4;
          float lum = dot(rock, vec3(0.3, 0.59, 0.11));
          float inside = 1.0 - dawnCaveLight(vCPos);
          rock = mix(vec3(lum) * vec3(1.0, 0.95, 0.86), rock, mix(0.55, 0.2, inside)) * 1.15;
          // wet and dark inside
          rock *= mix(1.0, 0.62, inside);
          vec4 nA = texture2D(tNoise, vCPos.xz * (0.35 / 32.0));
          vec4 nB = texture2D(tNoise, vCPos.xz * (1.7 / 32.0));
          // moss outside, on what faces up
          if (inside < 0.99 && cN.y > -0.2) {
            float mn = nA.r * 0.6 + nB.g * 0.4;
            float mossy = smoothstep(0.45, 0.8, cN.y * 0.8 + mn * 0.5) * (1.0 - inside);
            if (mossy > 0.001) rock = mix(rock, cLin(texture2D(tMoss, cP.xz * 1.6)) * vec3(0.55, 0.8, 0.4), mossy);
          }
          // guano: pale streaks running down the walls inside, thickest low down
          float low = smoothstep(${(C.floor + 6).toFixed(1)}, ${C.floor.toFixed(1)}, vCPos.y);
          if (inside > 0.01 && low > 0.0) {
            float streak = texture2D(tNoise, vec2(vCPos.x * 2.3 + vCPos.z * 1.7, vCPos.y * 0.15) / 32.0).b * texture2D(tNoise, vCPos.xz * (0.7 / 32.0)).a;
            float guano = smoothstep(0.32, 0.55, streak) * inside * (1.0 - abs(cN.y)) * low;
            rock = mix(rock, vec3(0.62, 0.6, 0.52), guano * 0.7);
          }
          diffuseColor.rgb *= rock;
          // the Revonite vein: a seam of green in the tunnel wall, brightest near the statue
          vec3 vq = vCPos - vec3(${C.statue.x.toFixed(1)}, ${(C.floor + 4.5).toFixed(1)}, ${(C.statue.z + 1.0).toFixed(1)});
          vec3 veinGlowColor = vec3(0.0);
          if (inside > 0.01 && dot(vq, vq) < 64.0) {
            vec4 nV = texture2D(tNoise, vCPos.xz * (2.0 / 32.0));
            float seam = abs(vq.y + sin(vq.z * 0.9) * 0.6 + sin(vq.x * 1.3) * 0.4 + (nV.r - 0.5) * 0.8);
            float vein = (1.0 - smoothstep(0.02, 0.14, seam)) * smoothstep(8.0, 2.5, length(vq)) * inside;
            vein *= smoothstep(0.45, 0.7, texture2D(tNoise, (vCPos.xz * 1.3 + vCPos.y) / 32.0).g);
            float sparkle = smoothstep(0.6, 0.95, dawnNoise(vCPos.xy * 23.0 + vCPos.z * 11.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.14, 0.09), vein * 0.8);
            veinGlowColor = vec3(0.16, 1.0, 0.55) * (0.15 + 1.2 * sparkle) * vein * veinGlow * (0.85 + 0.15 * sin(time * 1.3));
          }
          // the great vein in the galleries: a broad seam of green across the far wall
          vec3 vq2 = vCPos - vec3(${G.vein.map((v) => v.toFixed(2)).join(', ')});
          if (dot(vq2, vq2) < 100.0) {
            vec4 nV2 = texture2D(tNoise, vCPos.xz * (1.6 / 32.0));
            float seam2 = abs(vq2.y * 0.7 + sin(vq2.z * 0.7) * 0.9 + sin(vq2.x * 1.1) * 0.6 + (nV2.r - 0.5) * 1.3);
            float vein2 = (1.0 - smoothstep(0.08, 0.5, seam2)) * smoothstep(10.0, 3.5, length(vq2));
            float sparkle2 = smoothstep(0.55, 0.95, dawnNoise(vCPos.xy * 19.0 + vCPos.z * 13.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.16, 0.1), vein2 * 0.85);
            veinGlowColor += vec3(0.16, 1.0, 0.55) * (0.3 + 1.5 * sparkle2) * vein2 * veinGlow * (0.85 + 0.15 * sin(time * 1.1 + 2.0));
          }
          // nitre: a white crust low on the walls of the first hall and the nook
          float nitreZone = 1.0 - smoothstep(0.95, 1.3, min(
            length((vCPos - vec3(${[G.halls[0].x, G.halls[0].y, G.halls[0].z].map((v) => v.toFixed(2)).join(', ')})) / vec3(${[G.halls[0].rx + 1.5, G.halls[0].ry + 1.5, G.halls[0].rz + 1.5].map((v) => v.toFixed(2)).join(', ')})),
            length((vCPos - vec3(${[G.halls[2].x, G.halls[2].y, G.halls[2].z].map((v) => v.toFixed(2)).join(', ')})) / vec3(${[G.halls[2].rx + 1.5, G.halls[2].ry + 1.5, G.halls[2].rz + 1.5].map((v) => v.toFixed(2)).join(', ')}))));
          if (nitreZone > 0.0) {
            float nn = texture2D(tNoise, (vCPos.xz * 1.1 + vCPos.y * 0.7) / 32.0).r * 0.6 + texture2D(tNoise, vCPos.zy * (3.0 / 32.0)).g * 0.4;
            float crust = smoothstep(0.42, 0.62, nn) * nitreZone * smoothstep(${(C.floor + 3.6).toFixed(1)}, ${(C.floor + 0.3).toFixed(1)}, vCPos.y) * (1.0 - abs(cN.y) * 0.6);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.78, 0.72), crust * 0.85);
          }`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = mix(0.9, 0.42, inside * (0.5 + 0.5 * nB.a));`)
        .replace('#include <normal_fragment_maps>', `
          vec3 cPert = vec3(0.0);
          if (cW.x > 0.03) { vec3 cn1 = texture2D(nRock, cP.zy).xyz * 2.0 - 1.0; cPert += vec3(0.0, cn1.y, cn1.x) * cW.x; }
          if (cW.y > 0.03) { vec3 cn2 = texture2D(nRock, cP.xz).xyz * 2.0 - 1.0; cPert += vec3(cn2.x, 0.0, cn2.y) * cW.y; }
          if (cW.z > 0.03) { vec3 cn3 = texture2D(nRock, cP.xy).xyz * 2.0 - 1.0; cPert += vec3(cn3.x, cn3.y, 0.0) * cW.z; }
          normal = normalize(normal + (viewMatrix * vec4(cPert, 0.0)).xyz * 1.2);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += veinGlowColor * 0.6;`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float caveShade = dawnCaveLight(vCPos);
          reflectedLight.indirectDiffuse *= caveShade;
          reflectedLight.indirectSpecular *= caveShade;
          reflectedLight.indirectDiffuse += dawnCaveGlow(vCPos) * material.diffuseColor;`);
    };
    material.customProgramCacheKey = () => 'dawn-cave';
    return material;
  }

  // ---------- Bats ----------

  // One small bat: a furry body, and two wings of thin membrane between long fingers, the
  // trailing edge scalloped. `wing` says how far out along a wing each vertex is (signed, for
  // the side), so the vertex shader can beat them.
  function batGeometry() {
    const pos = [];
    const wing = [];
    const idx = [];
    const add = (x, y, z, w) => {
      pos.push(x, y, z);
      wing.push(w);
      return pos.length / 3 - 1;
    };
    // body: a slim spindle along z (head forward, +z), with ears
    const ring = 6;
    const body = [];
    const bodyLen = [[-0.07, 0.005], [-0.04, 0.022], [0, 0.028], [0.04, 0.022], [0.065, 0.016], [0.085, 0.004]];
    bodyLen.forEach(([z, r]) => {
      const row = [];
      for (let s = 0; s < ring; s++) {
        const a = (s / ring) * Math.PI * 2;
        row.push(add(Math.cos(a) * r, Math.sin(a) * r * 0.85, z, 0));
      }
      body.push(row);
    });
    for (let r = 0; r < body.length - 1; r++) {
      for (let s = 0; s < ring; s++) {
        const a = body[r][s];
        const b = body[r][(s + 1) % ring];
        const c = body[r + 1][s];
        const d = body[r + 1][(s + 1) % ring];
        idx.push(a, c, b, b, c, d);
      }
    }
    for (const side of [-1, 1]) {
      const e0 = add(side * 0.008, 0.012, 0.07, 0);
      const e1 = add(side * 0.02, 0.04, 0.078, 0);
      const e2 = add(side * 0.016, 0.014, 0.082, 0);
      idx.push(e0, e1, e2);
      // the wing: arm along the leading edge, fingers fanning back, membrane between
      const lead = [[0.02, 0.03], [0.1, 0.05], [0.17, 0.025], [0.25, -0.01]];
      const trail = [[0.02, -0.06], [0.09, -0.1], [0.15, -0.075], [0.21, -0.07], [0.25, -0.01]];
      const L = lead.map(([x, z]) => add(side * x, 0, z, side * (x / 0.21)));
      const T = trail.map(([x, z]) => add(side * x, 0, z, side * (x / 0.21)));
      // the membrane between the fingers, its edge scalloped inward
      for (let k = 0; k < 3; k++) {
        const mx = (trail[k][0] + trail[k + 1][0]) / 2;
        const mz = (trail[k][1] + trail[k + 1][1]) / 2 + 0.018;
        const M = add(side * mx, 0, mz, side * (mx / 0.21));
        idx.push(L[k], T[k], M, L[k], M, L[k + 1], L[k + 1], M, T[k + 1]);
      }
      idx.push(L[3], T[3], T[4]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('wing', new THREE.Float32BufferAttribute(wing, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // A roosting bat: hanging head down with its wings wrapped round it.
  function roostGeometry() {
    const g = new THREE.SphereGeometry(0.045, 8, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      // a teardrop: narrow at the feet (top), round and wrapped at the head (bottom)
      const k = 0.55 + 0.45 * smoothstep(0.045, -0.03, y);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k * 0.8);
      p.setY(i, y * 1.7);
    }
    g.translate(0, -0.08, 0);
    g.computeVertexNormals();
    return g;
  }

  const batUniforms = { time: { value: 0 } };
  function batMaterial(flapping) {
    const material = new THREE.MeshStandardMaterial({ color: D.col(0x2b211b), roughness: 1, envMapIntensity: 0.15, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = batUniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float time;
          ${flapping ? 'attribute float wing;\nattribute float phase;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          ${flapping ? `
            float beat = sin(time * 22.0 + phase * 6.283);
            float a = beat * 1.05 * sign(wing);
            float r = abs(wing);
            vec2 xy = vec2(transformed.x, transformed.y);
            // the wing hinges at the shoulder, the tip lagging a little
            float ang = a * (0.85 + 0.25 * r);
            transformed.x = xy.x * cos(ang) - xy.y * sin(ang);
            transformed.y = xy.x * sin(ang) + xy.y * cos(ang) - r * r * 0.03 * beat;
          ` : `
            float sway = sin(time * 0.8 + instanceMatrix[3][0] * 3.1 + instanceMatrix[3][2] * 1.7) * 0.06;
            transformed.x += transformed.y * sway;
          `}`);
    };
    material.customProgramCacheKey = () => `dawn-bat:${flapping}`;
    return D.addCaveShade(material);
  }

  // ---------- Building it ----------

  const cave = {
    group: new THREE.Group(),
    roost: null, flyers: [], flyMesh: null, crystals: null, light: null, drip: null, burst: 0,
    veinGlow: 1,
  };
  D.scene.add(cave.group);

  // Where the ceiling is above (x, z), inside the hollow, or null.
  function ceilingAbove(x, z) {
    let y = C.floor + 0.5;
    if (sdf(x, y, z) < 0) return null;
    for (; y < C.floor + 14; y += 0.25) {
      if (sdf(x, y, z) < 0) return y;
    }
    return null;
  }

  cave.build = () => {
    const step = 0.8;
    const M = C.mass;
    const M2 = G.mass;
    const x0 = Math.min(M.x - M.rx, M2.x - M2.rx) - 7;
    const y0 = C.floor - 5;
    const z0 = Math.min(M.z - M.rz, M2.z - M2.rz) - 7;
    const nx = Math.ceil((Math.max(M.x + M.rx, M2.x + M2.rx) + 7 - x0) / step);
    const ny = Math.ceil((M.ry + 5 + (M.y - C.floor) + 8) / step);
    const nz = Math.ceil((Math.max(M.z + M.rz, M2.z + M2.rz) + 7 - z0) / step);
    const nets = surfaceNets(sdf, x0, y0, z0, nx, ny, nz, step);
    const normals = new Float32Array(nets.positions.length);
    const e = 0.4;
    for (let i = 0; i < nets.positions.length; i += 3) {
      const x = nets.positions[i];
      const y = nets.positions[i + 1];
      const z = nets.positions[i + 2];
      const gx = sdf(x + e, y, z) - sdf(x - e, y, z);
      const gy = sdf(x, y + e, z) - sdf(x, y - e, z);
      const gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const len = Math.hypot(gx, gy, gz) || 1;
      normals[i] = gx / len;
      normals[i + 1] = gy / len;
      normals[i + 2] = gz / len;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(nets.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(nets.index);
    geometry.computeBoundingSphere();
    const material = caveMaterial();
    cave.material = material;
    const rock = new THREE.Mesh(geometry, material);
    rock.castShadow = true;
    rock.receiveShadow = true;
    cave.group.add(rock);
    cave.rock = rock;

    const random = D.seeded(1000);

    // stalactites from the ceiling, stalagmites from the floor (clear of the way out)
    const spikes = [];
    const mites = [];
    for (let n = 0; n < 900 && spikes.length < 90; n++) {
      const x = C.chamber.x + (random() - 0.5) * C.chamber.rx * 2;
      const z = lerp(C.tunnel.z0 + 10, C.chamber.z + C.chamber.rz, random());
      const top = ceilingAbove(x, z);
      if (top === null) continue;
      const len = 0.4 + random() ** 2 * 2.6;
      spikes.push({ x, y: top + 0.25, z, len, r: 0.12 + len * 0.09 + random() * 0.08 });
    }
    for (let n = 0; n < 600 && mites.length < 26; n++) {
      const x = C.chamber.x + (random() - 0.5) * C.chamber.rx * 1.8;
      const z = lerp(C.tunnel.z1 - 6, C.chamber.z + C.chamber.rz, random());
      if (Math.abs(x - C.statue.x) < 3.5 && z < C.chamber.z) continue;
      if (sdf(x, C.floor + 0.6, z) < 0.6) continue;
      const len = 0.3 + random() ** 2 * 1.5;
      mites.push({ x, y: D.terrain.height(x, z) - 0.15, z, len, r: 0.18 + len * 0.13 });
    }
    const spikeGeo = new THREE.ConeGeometry(1, 1, 9, 6, true);
    {
      const p = spikeGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const wob = 1 + (D.noise2(p.getX(i) * 3 + y * 5, p.getZ(i) * 3) - 0.5) * 0.5;
        p.setX(i, p.getX(i) * wob);
        p.setZ(i, p.getZ(i) * wob);
      }
      spikeGeo.translate(0, -0.5, 0);
      spikeGeo.rotateX(Math.PI); // tip down, base at y = 0
      spikeGeo.computeVertexNormals();
    }
    const dummy = new THREE.Object3D();
    const place = (list, flip) => {
      const mesh = new THREE.InstancedMesh(spikeGeo, material, list.length);
      list.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(flip ? Math.PI : 0, random() * 6.3, 0);
        dummy.scale.set(s.r, s.len, s.r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cave.group.add(mesh);
    };
    place(spikes, false);
    place(mites, true);
    cave.stalagmites = mites;

    // the colony on the ceiling of the chamber
    const roosts = [];
    for (let n = 0; n < 6000 && roosts.length < 420; n++) {
      // clustered in patches, as a colony hangs
      const patch = Math.floor(random() * 9);
      const px = C.chamber.x + Math.sin(patch * 2.1) * C.chamber.rx * 0.55;
      const pz = lerp(C.tunnel.z1 - 12, C.chamber.z + C.chamber.rz * 0.7, (patch + 0.5) / 9);
      const x = px + (random() - 0.5) * 3.2;
      const z = pz + (random() - 0.5) * 3.2;
      const top = ceilingAbove(x, z);
      if (top === null || top < C.floor + 4.5) continue;
      roosts.push({ x, y: top + 0.02, z });
    }
    const roostMesh = new THREE.InstancedMesh(roostGeometry(), batMaterial(false), roosts.length);
    roosts.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(0, random() * 6.3, 0);
      dummy.scale.setScalar(1.5 + random() * 0.7);
      dummy.updateMatrix();
      roostMesh.setMatrixAt(i, dummy.matrix);
    });
    roostMesh.castShadow = false;
    roostMesh.receiveShadow = true;
    cave.group.add(roostMesh);
    cave.roost = { mesh: roostMesh, list: roosts };

    // flyers: a few always circling in the chamber; the rest burst out when he wakes
    const FLYERS = 90 + GALLERY_BATS;
    const geo = batGeometry();
    const phase = new Float32Array(FLYERS);
    for (let i = 0; i < FLYERS; i++) phase[i] = random();
    geo.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1));
    const flyMesh = new THREE.InstancedMesh(geo, batMaterial(true), FLYERS);
    flyMesh.frustumCulled = false;
    flyMesh.castShadow = true;
    flyMesh.receiveShadow = true;
    cave.group.add(flyMesh);
    cave.flyMesh = flyMesh;
    for (let i = 0; i < FLYERS - GALLERY_BATS; i++) {
      const home = roosts[Math.floor(random() * roosts.length)];
      cave.flyers.push({
        x: home.x, y: home.y - 0.3, z: home.z, vx: 0, vy: 0, vz: 0, home, circling: i < 10, out: false, t: random() * 10,
        seed: random() * 100, speed: 6 + random() * 4, gone: i >= 10,
      });
    }

    // the Revonite: a cluster of green crystals in the wall above and behind the statue
    const crystalMat = D.addCaveShade(new THREE.MeshStandardMaterial({
      color: D.col(0x0b4a30), emissive: D.col(0x22d488), emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.1,
    }));
    const crystalGeo = new THREE.CylinderGeometry(0.07, 0.09, 1, 6, 1);
    crystalGeo.translate(0, 0.5, 0);
    {
      // a pointed tip
      const p = crystalGeo.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.99) { p.setX(i, 0); p.setZ(i, 0); p.setY(i, 1.18); }
      crystalGeo.computeVertexNormals();
    }
    const clusters = [];
    const veinY = C.floor + 4.5;
    for (let n = 0; n < 400 && clusters.length < 10; n++) {
      // from above the statue, outward until the rock is met: the cluster sits in the wall there
      const a = random() * Math.PI * 2;
      const tilt = (random() - 0.3) * 0.9;
      const dir = new THREE.Vector3(Math.cos(a), tilt, Math.sin(a) * 0.8).normalize();
      const p = new THREE.Vector3(C.statue.x, veinY, C.statue.z + 1.5);
      let hit = false;
      for (let k = 0; k < 120; k++) {
        p.addScaledVector(dir, 0.1);
        if (sdf(p.x, p.y, p.z) < 0) {
          hit = true;
          break;
        }
      }
      if (!hit || p.y < C.floor + 1.5 || Math.hypot(p.x - C.statue.x, p.z - C.statue.z) > 8) continue;
      clusters.push({ x: p.x, y: p.y, z: p.z });
    }
    // and one cluster right in the roof above the statue, where the drip comes from
    const above = ceilingAbove(C.statue.x, C.statue.z + 0.2);
    if (above) clusters.push({ x: C.statue.x, y: above - 0.1, z: C.statue.z + 0.2, down: true });
    const shards = [];
    for (const c of clusters) {
      const count = 5 + Math.floor(random() * 6);
      const e2 = 0.25;
      const gx = sdf(c.x + e2, c.y, c.z) - sdf(c.x - e2, c.y, c.z);
      const gy = sdf(c.x, c.y + e2, c.z) - sdf(c.x, c.y - e2, c.z);
      const gz = sdf(c.x, c.y, c.z + e2) - sdf(c.x, c.y, c.z - e2);
      const out = c.down ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(gx, gy, gz).normalize();
      for (let k = 0; k < count; k++) {
        const dir = out.clone().add(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(1.1)).normalize();
        shards.push({ at: new THREE.Vector3(c.x, c.y, c.z).addScaledVector(out, -0.15), dir, len: 0.25 + random() * 0.75, w: 0.8 + random() * 1.4 });
      }
    }
    const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, shards.length);
    const up = new THREE.Vector3(0, 1, 0);
    shards.forEach((s, i) => {
      dummy.position.copy(s.at);
      dummy.quaternion.setFromUnitVectors(up, s.dir);
      dummy.scale.set(s.w, s.len, s.w);
      dummy.updateMatrix();
      crystals.setMatrixAt(i, dummy.matrix);
    });
    crystals.receiveShadow = true;
    cave.group.add(crystals);
    cave.crystals = crystals;
    cave.crystalMat = crystalMat;
    furnishGalleries(random, crystalGeo, crystalMat, spikeGeo, material);
    // (the green light it throws is worked out in the shaders: see D.caveUniforms)

    // guano heaped on the floor under the roost: dark, crusted white with nitre
    const guanoTex = D.canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#4a3a2b';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 5000; n++) {
        const v = Math.random();
        g.fillStyle = v < 0.05 ? `rgba(225,220,200,${0.25 + Math.random() * 0.4})` : `rgba(${30 + v * 70},${22 + v * 50},${14 + v * 32},0.5)`;
        const s = 1 + Math.random() * 2.5;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, s, 0, Math.PI * 2);
        g.fill();
      }
    });
    const guanoMat = D.addCaveShade(new THREE.MeshStandardMaterial({ map: guanoTex, roughness: 0.95 }));
    const moundGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    {
      const p = moundGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + (D.noise2(p.getX(i) * 2.5 + 3, p.getZ(i) * 2.5) - 0.5) * 0.5;
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
        moundGeo.attributes.uv.setXY(i, p.getX(i) * 1.5 + 0.5, p.getZ(i) * 1.5 + 0.5);
      }
      moundGeo.computeVertexNormals();
    }
    const mounds = [[C.statue.x + 0.6, C.statue.z + 0.9, 1.6, 0.32], [C.statue.x - 1.4, C.statue.z + 2.3, 1.2, 0.25]];
    for (let n = 0; n < 9; n++) mounds.push([C.chamber.x + (random() - 0.5) * 12, C.chamber.z + (random() - 0.6) * 16, 1 + random() * 2.2, 0.2 + random() * 0.45]);
    for (const [x, z, r, h] of mounds) {
      const m = new THREE.Mesh(moundGeo, guanoMat);
      m.position.set(x, D.terrain.height(x, z) - 0.05, z);
      m.scale.set(r, h, r * (0.7 + random() * 0.5));
      m.rotation.y = random() * 6;
      m.receiveShadow = true;
      cave.group.add(m);
    }

    buildDrip();
    buildShaft();
  };

  // ---------- The drip ----------

  // A drop gathers on the tip of the Revonite above the statue's head, falls, and bursts on
  // the stone. It has done this for a thousand years.
  function buildDrip() {
    const dropMat = new THREE.MeshStandardMaterial({ color: D.col(0xbfffe0), emissive: D.col(0x2a8a62), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85 });
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), dropMat);
    drop.scale.set(1, 1.4, 1);
    cave.group.add(drop);
    const splash = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), dropMat);
      s.visible = false;
      cave.group.add(s);
      splash.push({ mesh: s, vx: 0, vy: 0, vz: 0, t: 0 });
    }
    const top = ceilingAbove(C.statue.x, C.statue.z + 0.2) || C.floor + 6;
    cave.drip = { drop, splash, top: top - 0.35, y: top - 0.35, vy: 0, wait: 1, landY: C.floor + 1.86, on: true };
  }

  function updateDrip(dt) {
    const d = cave.drip;
    if (!d) return;
    const x = C.statue.x;
    const z = C.statue.z + 0.2;
    if (d.wait > 0) {
      d.wait -= dt;
      const grow = 1 - Math.max(0, d.wait) / 1.6;
      d.drop.scale.set(grow, grow * 1.4, grow);
      d.drop.position.set(x, d.top - grow * 0.02, z);
      d.drop.visible = d.on;
    } else {
      d.vy -= 9.8 * dt;
      d.y += d.vy * dt;
      d.drop.position.set(x, d.y, z);
      d.drop.scale.set(0.85, 1.7, 0.85);
      const land = D.hero && D.hero.dripTarget ? D.hero.dripTarget() : d.landY;
      if (d.y <= land) {
        // burst
        d.splash.forEach((s) => {
          const a = Math.random() * Math.PI * 2;
          const sp = rand(0.4, 1.1);
          s.mesh.position.set(x, land + 0.02, z);
          s.vx = Math.cos(a) * sp;
          s.vz = Math.sin(a) * sp;
          s.vy = rand(0.6, 1.4);
          s.t = 0.45;
          s.mesh.visible = d.on;
        });
        if (d.on && D.audio) D.audio.drip(D.camera.position.distanceTo(d.drop.position));
        d.y = d.top;
        d.vy = 0;
        d.wait = d.fast ? 0.35 : rand(1.6, 2.6);
      }
    }
    for (const s of d.splash) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.vy -= 9.8 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.t <= 0) s.mesh.visible = false;
    }
  }

  // ---------- Light in the mouth ----------

  // Shafts of sunlight slanting in at the mouth, with dust turning in them.
  function buildShaft() {
    const shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, strength: { value: 1 }, color: { value: new THREE.Color(1, 0.9, 0.7) } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float time;
        uniform float strength;
        uniform vec3 color;
        varying vec2 vUv;
        varying vec3 vPos;
        ${D.GLSL_NOISE}
        void main() {
          float across = sin(vUv.x * 3.14159);
          float rays = 0.55 + 0.45 * dawnNoise(vec2(vUv.x * 9.0 + time * 0.05, 0.5));
          float along = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          float a = across * across * rays * along * strength * 0.16;
          gl_FragColor = vec4(color * a, 1.0);
        }`,
    });
    const shafts = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shaftMat);
      plane.userData.offset = (i - 1) * 2.2;
      plane.userData.width = 3 + i * 0.8;
      shafts.add(plane);
    }
    shafts.frustumCulled = false;
    cave.group.add(shafts);
    cave.shafts = { group: shafts, material: shaftMat };

    const MOTES = 500;
    const pos = new Float32Array(MOTES * 3);
    const random = D.seeded(77);
    for (let i = 0; i < MOTES; i++) {
      pos[i * 3] = C.statue.x + (random() - 0.5) * 9;
      pos[i * 3 + 1] = C.floor + random() * 6.5;
      pos[i * 3 + 2] = C.mouthZ - 3 + random() * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const moteMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, sunDir: { value: new THREE.Vector3() }, strength: { value: 1 }, scale: { value: 300 } },
      vertexShader: `
        uniform float time;
        uniform float scale;
        varying float vA;
        ${D.GLSL_NOISE}
        void main() {
          vec3 p = position;
          float s = dawnHash(p.xz);
          p.x += sin(time * 0.17 + s * 40.0) * 0.6;
          p.y += mod(time * (0.03 + s * 0.05) + s * 7.0, 6.5) - 3.25;
          p.z += cos(time * 0.13 + s * 30.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, (0.012 + 0.022 * s) * scale / -mv.z);
          vA = 0.35 + 0.65 * sin(time * (0.5 + s) + s * 20.0) * 0.5 + 0.3;
        }`,
      fragmentShader: `
        uniform float strength;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * strength;
          gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, 1.0);
        }`,
    });
    const motes = new THREE.Points(geo, moteMat);
    motes.frustumCulled = false;
    cave.group.add(motes);
    cave.motes = motes;
  }

  const shaftDir = new THREE.Vector3();
  function updateShaft(time) {
    const s = cave.shafts;
    if (!s) return;
    // the light comes in along the sun, through the mouth, when the sun is to the north
    shaftDir.copy(D.sunDir);
    const facing = clamp(-shaftDir.z * 1.6, 0, 1) * D.env.day * (1 - D.env.overcast);
    const strength = facing * smoothstep(0.05, 0.25, shaftDir.y) * (1 - smoothstep(0.7, 0.95, shaftDir.y));
    s.material.uniforms.time.value = time;
    s.material.uniforms.strength.value = strength * (D.shaftBoost || 1);
    s.material.uniforms.color.value.copy(D.sun.color);
    s.group.visible = strength > 0.01 && D.camera.position.distanceTo(new THREE.Vector3(C.statue.x, C.floor, C.statue.z)) < 90;
    const mouth = new THREE.Vector3(C.statue.x, C.floor + 4.2, C.mouthZ + 1);
    const len = 16;
    s.group.children.forEach((plane) => {
      const along = shaftDir.clone().multiplyScalar(-1);
      const mid = mouth.clone().addScaledVector(along, len * 0.42);
      mid.x += plane.userData.offset;
      plane.position.copy(mid);
      // stretch along the beam, face the camera round it
      const toCam = D.camera.position.clone().sub(mid);
      const side = new THREE.Vector3().crossVectors(along, toCam).normalize();
      const normal = new THREE.Vector3().crossVectors(side, along).normalize();
      const m = new THREE.Matrix4().makeBasis(side, along, normal);
      plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(m));
      plane.scale.set(plane.userData.width, len, 1);
    });
    if (cave.motes) {
      cave.motes.material.uniforms.time.value = time;
      cave.motes.material.uniforms.strength.value = 0.25 + strength * 0.9;
      cave.motes.material.uniforms.scale.value = (window.innerHeight * D.pixelRatio) / (2 * Math.tan((D.camera.fov * Math.PI) / 360));
    }
  }

  // ---------- Bats in flight ----------


  // ---------- Chapter 2: what is in the galleries ----------

  const GALLERY_BATS = 40;
  // From `from` along `dir` to the first rock: { p, n } (a point just off the wall, its normal).
  function wallFrom(from, dir, max = 9) {
    const p = new THREE.Vector3();
    for (let d = 0.5; d < max; d += 0.08) {
      p.copy(from).addScaledVector(dir, d);
      if (sdf(p.x, p.y, p.z) < 0) {
        p.addScaledVector(dir, -0.05);
        const e = 0.15;
        const n = new THREE.Vector3(
          sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
          sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
          sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e),
        ).normalize();
        return { p, n, d };
      }
    }
    return null;
  }
  // Clusters of small shapes stuck to the walls at the given spots: one instanced mesh.
  function clusters(spots, geometry, material, perSpot, size, random) {
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length * perSpot);
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3();
    const lift = new THREE.Vector3();
    spots.forEach((s, k) => {
      s.from = k * perSpot;
      s.count = perSpot;
      s.mesh = mesh;
      side.crossVectors(s.n, up).normalize();
      lift.crossVectors(side, s.n).normalize();
      for (let i = 0; i < perSpot; i++) {
        const u = (random() - 0.5) * 0.7;
        const v = (random() - 0.5) * 0.55;
        dummy.position.copy(s.p).addScaledVector(side, u).addScaledVector(lift, v).addScaledVector(s.n, -0.04);
        const dir = s.n.clone().add(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(1.2)).normalize();
        dummy.quaternion.setFromUnitVectors(up, dir);
        const sc = size * (0.6 + random() * 0.8);
        dummy.scale.set(sc * (0.8 + random() * 0.6), sc * (1 + random() * 1.4), sc * (0.8 + random() * 0.6));
        dummy.updateMatrix();
        mesh.setMatrixAt(s.from + i, dummy.matrix);
      }
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    cave.group.add(mesh);
    return mesh;
  }
  function furnishGalleries(random, crystalGeo, crystalMat, spikeGeo, rockMaterial) {
    const [hallA, hallB, nook] = G.halls;
    const g = { nitre: [], revonite: [], scattered: false };
    const towards = (h, a, y) => wallFrom(new THREE.Vector3(h.x, y, h.z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
    // nitre: low on the walls of the first hall and the nook, clear of the ways in and out
    for (const [h, angles] of [[hallA, [1.3, 2.1, 2.9, 3.6, 5.2, 5.9]], [nook, [1.2, 2.4, 3.4]]]) {
      for (const a of angles) {
        const w = towards(h, a, C.floor + 0.9 + random() * 0.5);
        if (w && w.d < 8) g.nitre.push({ id: `nitre${g.nitre.length}`, x: w.p.x, y: w.p.y, z: w.p.z, p: w.p, n: w.n });
      }
    }
    const crustMat = D.addCaveShade(new THREE.MeshStandardMaterial({ color: D.col(0xebe7da), roughness: 0.5, metalness: 0 }));
    const crustGeo = new THREE.IcosahedronGeometry(1, 0);
    crustGeo.scale(1, 0.55, 1);
    g.nitreMesh = clusters(g.nitre, crustGeo, crustMat, 14, 0.06, random);
    // Revonite: clusters round the great seam, on the far wall of the vein hall
    const va = Math.atan2(G.vein[0] - hallB.x, G.vein[2] - hallB.z);
    for (const off of [-0.55, -0.2, 0.15, 0.5]) {
      const w = towards(hallB, va + off, C.floor + 0.9 + random() * 0.6);
      if (w && w.d < 9) g.revonite.push({ id: `revonite${g.revonite.length}`, x: w.p.x, y: w.p.y, z: w.p.z, p: w.p, n: w.n });
    }
    g.revMesh = clusters(g.revonite, crystalGeo, crystalMat, 8, 0.9, random);
    // stalactites
    const spikes = [];
    for (let n = 0; n < 400 && spikes.length < 46; n++) {
      const h = random() < 0.5 ? hallA : hallB;
      const x = h.x + (random() - 0.5) * h.rx * 1.6;
      const z = h.z + (random() - 0.5) * h.rz * 1.6;
      const top = ceilingAbove(x, z);
      if (top === null || top < C.floor + 3) continue;
      const len = 0.3 + random() ** 2 * 1.8;
      spikes.push({ x, y: top + 0.25, z, len, r: 0.1 + len * 0.09 });
    }
    const spikeMesh = new THREE.InstancedMesh(spikeGeo, rockMaterial, spikes.length);
    const dummy = new THREE.Object3D();
    spikes.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, random() * 6.3, 0);
      dummy.scale.set(s.r, s.len, s.r);
      dummy.updateMatrix();
      spikeMesh.setMatrixAt(i, dummy.matrix);
    });
    spikeMesh.castShadow = true;
    spikeMesh.receiveShadow = true;
    cave.group.add(spikeMesh);
    // the colony on the vein hall's roof: it takes flight when a torch comes in
    const roost = [];
    for (let n = 0; n < 1500 && roost.length < 70; n++) {
      const x = hallB.x + (random() - 0.5) * hallB.rx * 1.3;
      const z = hallB.z + (random() - 0.5) * hallB.rz * 1.3;
      const top = ceilingAbove(x, z);
      if (top === null || top < C.floor + 4.2) continue;
      roost.push({ x, y: top + 0.02, z });
    }
    const roostMesh = new THREE.InstancedMesh(roostGeometry(), batMaterial(false), Math.max(1, roost.length));
    roost.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(0, random() * 6.3, 0);
      dummy.scale.setScalar(1.4 + random() * 0.6);
      dummy.updateMatrix();
      roostMesh.setMatrixAt(i, dummy.matrix);
    });
    roostMesh.count = roost.length;
    roostMesh.receiveShadow = true;
    cave.group.add(roostMesh);
    g.roost = { mesh: roostMesh, list: roost };
    g.crack = { x: G.ways[0].a[0], y: C.floor, z: G.ways[0].a[2] };
    g.hallA = hallA;
    g.hallB = hallB;
    cave.galleries = g;
    chapter3Spots(g, crystalGeo, crystalMat, crustMat);
    galleryFlyers(random);
  }
  // Chapter 3's: the beds of guano under the roost (more nitre to a scrape than the walls), a
  // second, smaller vein in the nook, and the rich seam high on the vein wall, out of reach
  // without a ladder. (Their own dice, so nothing laid out before them moves.)
  function chapter3Spots(g, crystalGeo, crystalMat, crustMat) {
    const random = D.seeded(3303);
    const T = D.terrain;
    const [, hallB, nook] = G.halls;
    const towards = (h, a, y) => wallFrom(new THREE.Vector3(h.x, y, h.z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
    // guano: dark mounds on the floor under the roost
    g.guano = [];
    const guanoMat = D.addCaveShade(new THREE.MeshStandardMaterial({ color: D.col(0x3b2f24), roughness: 0.95 }));
    const guanoGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    guanoGeo.scale(0.8, 0.22, 0.65);
    const roost = g.roost.list;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const r = 1.6 + random() * 2.2;
      const x = hallB.x + Math.sin(a) * r;
      const z = hallB.z + Math.cos(a) * r;
      const y = T.height(x, z);
      g.guano.push({ id: `guano${k}`, x, y, z, p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(0, 1, 0) });
    }
    g.guanoMesh = new THREE.InstancedMesh(guanoGeo, guanoMat, g.guano.length * 3);
    const dummy = new THREE.Object3D();
    g.guano.forEach((s, k) => {
      s.from = k * 3;
      s.count = 3;
      s.mesh = g.guanoMesh;
      for (let i = 0; i < 3; i++) {
        dummy.position.set(s.x + (random() - 0.5) * 0.9, s.y - 0.03, s.z + (random() - 0.5) * 0.9);
        dummy.rotation.set(0, random() * 6.3, 0);
        dummy.scale.setScalar(0.6 + random() * 0.5);
        dummy.updateMatrix();
        g.guanoMesh.setMatrixAt(s.from + i, dummy.matrix);
      }
    });
    g.guanoMesh.receiveShadow = true;
    cave.group.add(g.guanoMesh);
    void roost;
    // a second vein, low in the nook: more Revonite where Chapter 2 left only a little
    const more = [];
    for (const a of [0.4, 4.6, 5.4]) {
      const w = towards(nook, a, C.floor + 0.8 + random() * 0.4);
      if (w && w.d < 6) more.push({ id: `revonite${g.revonite.length + more.length}`, x: w.p.x, y: w.p.y, z: w.p.z, p: w.p, n: w.n });
    }
    g.revonite.push(...more);
    g.revMesh2 = clusters(more, crystalGeo, crystalMat, 7, 0.75, random);
    // the high seam: rich, three good chippings, a ladder's climb up the vein wall
    g.seam = [];
    const va = Math.atan2(G.vein[0] - hallB.x, G.vein[2] - hallB.z);
    for (const off of [-0.3, 0, 0.3]) {
      const w = towards(hallB, va + off, C.floor + 4.3);
      if (w && w.d < 10) g.seam.push({ id: `seam${g.seam.length}`, x: w.p.x, y: w.p.y, z: w.p.z, p: w.p, n: w.n });
    }
    g.seamMesh = clusters(g.seam, crystalGeo, crystalMat, 12, 1.15, random);
    // where the ladder goes: at the foot of the wall, under the middle of the seam
    const mid = g.seam[Math.floor(g.seam.length / 2)] || g.seam[0];
    if (mid) {
      const flat = new THREE.Vector3(mid.n.x, 0, mid.n.z).normalize();
      const foot = mid.p.clone().addScaledVector(flat, 0.9);
      foot.y = T.height(foot.x, foot.z);
      g.ladderAt = { x: foot.x, y: foot.y, z: foot.z, top: mid.p.clone().addScaledVector(flat, 0.35), out: flat };
    }
  }
  // Their bats join the flyers (made after this): see the end of cave.build.
  function galleryFlyers(random) {
    const g = cave.galleries;
    if (!g || !g.roost.list.length) return;
    for (let i = 0; i < GALLERY_BATS; i++) {
      const home = g.roost.list[Math.floor(random() * g.roost.list.length)];
      cave.flyers.push({ x: home.x, y: home.y - 0.3, z: home.z, vx: 0, vy: 0, vz: 0, home, circling: false, out: false, t: random() * 10, seed: random() * 100, speed: 8, gone: true, gallery: true });
    }
  }
  // A torch comes into the vein hall: the colony pours out, past you, the way you came.
  cave.scatterGallery = () => {
    const g = cave.galleries;
    if (!g || g.scattered) return;
    g.scattered = true;
    g.roost.mesh.count = 0;
    const [crack, passage] = G.ways;
    for (const b of cave.flyers) {
      if (!b.gallery) continue;
      b.gone = false;
      b.out = false;
      b.x = b.home.x;
      b.y = b.home.y - 0.2;
      b.z = b.home.z;
      b.vx = (Math.random() - 0.5) * 2;
      b.vy = -1;
      b.vz = 0;
      b.speed = rand(7, 10);
      b.delay = Math.random() * 1.6;
      b.route = [[passage.b[0], passage.b[1] + 0.6, passage.b[2]], [passage.a[0], passage.a[1] + 0.6, passage.a[2]], [crack.b[0], crack.b[1] + 0.4, crack.b[2]], [crack.a[0], crack.a[1] + 0.6, crack.a[2]], [C.statue.x, C.floor + 3.6, crack.a[2] - 3]];
    }
    if (D.audio) D.audio.bats();
  };
  // Something taken: its crystals go.
  const gone = new THREE.Matrix4().makeScale(0, 0, 0);
  cave.takeSpot = (kind, id) => {
    const g = cave.galleries;
    const s = g && (g[kind] || []).find((q) => q.id === id);
    if (!s) return;
    s.taken = true;
    const mesh = s.mesh;
    if (!mesh) return;
    for (let i = s.from; i < s.from + s.count; i++) mesh.setMatrixAt(i, gone);
    mesh.instanceMatrix.needsUpdate = true;
  };
  cave.restoreGalleries = (taken, scattered) => {
    const g = cave.galleries;
    if (!g) return;
    for (const kind of ['nitre', 'revonite', 'guano', 'seam']) for (const s of g[kind] || []) if (taken.has(s.id)) cave.takeSpot(kind, s.id);
    if (scattered) {
      g.scattered = true;
      g.roost.mesh.count = 0;
    }
  };
  // Inside the galleries (not just near them)?
  cave.inGalleries = (p) => D.galleryReach(p.x, p.y + 1, p.z) < 0.72;

  const batDummy = new THREE.Object3D();
  const mouthOut = new THREE.Vector3(C.statue.x, C.floor + 4, C.mouthZ - 30);

  // The colony takes flight: every bat goes, streaming out of the mouth into the light.
  cave.scatter = () => {
    cave.burst = 1;
    cave.flyers.forEach((b, i) => {
      if (b.out) return;
      b.gone = false;
      b.circling = false;
      b.out = true;
      b.delay = Math.random() * 2.2 + (i % 7) * 0.05;
      b.x = b.home.x;
      b.y = b.home.y - 0.2;
      b.z = b.home.z;
      b.vx = (Math.random() - 0.5) * 2;
      b.vy = -1;
      b.vz = -2;
      b.speed = rand(8, 13);
    });
  };

  function updateBats(dt, time) {
    batUniforms.time.value = time;
    const mesh = cave.flyMesh;
    if (!mesh) return;
    let n = 0;
    for (const b of cave.flyers) {
      if (b.gone) continue;
      b.t += dt;
      let tx;
      let ty;
      let tz;
      if (b.route && b.route.length) {
        // out of the galleries: through the passage and the crack into the tunnel
        if (b.delay > 0) {
          b.delay -= dt;
          continue;
        }
        [tx, ty, tz] = b.route[0];
        if (Math.hypot(tx - b.x, ty - b.y, tz - b.z) < 1.6) {
          b.route.shift();
          if (!b.route.length) b.out = true;
        }
      } else if (b.out) {
        if (b.delay > 0) {
          b.delay -= dt;
          continue;
        }
        // out through the tunnel, then up and away
        const inTunnel = b.z > C.mouthZ - 2;
        if (inTunnel) {
          tx = C.statue.x + Math.sin(b.seed + b.t * 3) * 2.5;
          ty = C.floor + 3.8 + Math.sin(b.seed * 3 + b.t * 4) * 1.2;
          tz = b.z - 6;
        } else {
          tx = mouthOut.x + Math.sin(b.seed) * 40;
          ty = C.floor + 25 + (b.seed % 10) * 2;
          tz = mouthOut.z - 60;
        }
        if (b.z < C.mouthZ - 80) {
          b.gone = true;
          continue;
        }
      } else if (b.circling) {
        // loops round the chamber
        const a = b.t * (0.6 + (b.seed % 1) * 0.4) + b.seed;
        tx = C.chamber.x + Math.cos(a) * C.chamber.rx * 0.55;
        ty = C.chamber.y + 1.5 + Math.sin(a * 2.3) * 1.2;
        tz = C.chamber.z + Math.sin(a) * C.chamber.rz * 0.5;
      } else continue;
      // steer toward the target with a little flutter
      const dx = tx - b.x;
      const dy = ty - b.y;
      const dz = tz - b.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const turn = Math.min(1, dt * 3.5);
      b.vx += ((dx / d) * b.speed - b.vx) * turn + Math.sin(time * 9 + b.seed) * 0.6;
      b.vy += ((dy / d) * b.speed - b.vy) * turn + Math.cos(time * 11 + b.seed) * 0.6;
      b.vz += ((dz / d) * b.speed - b.vz) * turn;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      batDummy.position.set(b.x, b.y, b.z);
      batDummy.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      batDummy.scale.setScalar(1.3);
      batDummy.updateMatrix();
      mesh.setMatrixAt(n++, batDummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (cave.burst > 0) cave.burst = Math.max(0, cave.burst - dt * 0.25);
  }

  cave.update = (dt, time) => {
    if (!cave.rock) return;
    const near = D.camera.position.distanceTo(new THREE.Vector3(C.x, C.floor, C.z)) < 140;
    cave.group.visible = near;
    caveUniforms.time.value = time;
    caveUniforms.veinGlow.value = cave.veinGlow;
    if (!near) return;
    updateBats(dt, time);
    updateDrip(dt);
    updateShaft(time);
    D.caveUniforms.caveGlow.value = (0.85 + 0.15 * Math.sin(time * 1.3)) * cave.veinGlow;
    if (cave.crystalMat) cave.crystalMat.emissiveIntensity = (0.45 + 0.12 * Math.sin(time * 1.3)) * cave.veinGlow;
  };

  // ---------- For walking ----------

  // Pushes a body of radius r at (x, y..y+height, z) out of the rock. Returns true if it moved.
  cave.pushOut = (pos, r, height = 1.7) => {
    const M = C.mass;
    if (Math.hypot((pos.x - M.x) / (M.rx + 6), (pos.z - M.z) / (M.rz + 6)) > 1.1 && !nearGalleries(pos.x, pos.y, pos.z)) return false;
    let moved = false;
    for (const h of [0.35, height * 0.55, height - 0.15]) {
      const y = pos.y + h;
      const d = sdf(pos.x, y, pos.z);
      if (d < r) {
        const e = 0.2;
        let gx = sdf(pos.x + e, y, pos.z) - sdf(pos.x - e, y, pos.z);
        let gz = sdf(pos.x, y, pos.z + e) - sdf(pos.x, y, pos.z - e);
        const len = Math.hypot(gx, gz);
        if (len < 1e-4) continue;
        gx /= len;
        gz /= len;
        pos.x += gx * (r - d);
        pos.z += gz * (r - d);
        moved = true;
      }
    }
    return moved;
  };

  // Is the straight line a-b clear of the rock? Returns the fraction of the way it gets.
  cave.clearance = (a, b) => {
    const M = C.mass;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    if (Math.hypot((mid.x - M.x) / (M.rx + 20), (mid.z - M.z) / (M.rz + 20)) > 1.2 && !nearGalleries(mid.x, mid.y, mid.z)) return 1;
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (sdf(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t)) < 0.35) return Math.max(0, (i - 1) / steps);
    }
    return 1;
  };

  cave.sdf = sdf;
  D.cave = cave;
})();
