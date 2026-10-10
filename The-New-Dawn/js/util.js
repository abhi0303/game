// The New Dawn: small helpers every other file uses. Everything hangs off window.Dawn (D).
(() => {
  'use strict';
  const D = (window.Dawn = window.Dawn || {});

  D.$ = (id) => document.getElementById(id);
  D.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  D.lerp = (a, b, t) => a + (b - a) * t;
  D.smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  D.smoothstep = (a, b, v) => D.smooth((v - a) / (b - a));
  D.approach = (v, goal, step) => (v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step));
  D.wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  D.rand = (a, b) => a + Math.random() * (b - a);
  D.pick = (list) => list[Math.floor(Math.random() * list.length)];
  D.ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // A repeatable random number from a seed (mulberry32), so the world grows the same each time.
  D.seeded = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // --- value noise, 0..1 ---

  const hash2 = (ix, iz) => {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const hash3 = (ix, iy, iz) => {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  D.hash2 = hash2;

  D.noise2 = (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    let fx = x - ix;
    let fz = z - iz;
    fx = fx * fx * (3 - 2 * fx);
    fz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };

  D.noise3 = (x, y, z) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    let fx = x - ix;
    let fy = y - iy;
    let fz = z - iz;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    fz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
      l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy),
      fz
    );
  };

  D.fbm2 = (x, z, octaves = 4) => {
    let v = 0;
    let a = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      v += a * D.noise2(x, z);
      norm += a;
      x = x * 2.03 + 17.1;
      z = z * 2.03 + 9.3;
      a *= 0.5;
    }
    return v / norm;
  };

  D.fbm3 = (x, y, z, octaves = 3) => {
    let v = 0;
    let a = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      v += a * D.noise3(x, y, z);
      norm += a;
      x = x * 2.03 + 17.1;
      y = y * 2.03 + 3.7;
      z = z * 2.03 + 9.3;
      a *= 0.5;
    }
    return v / norm;
  };

  // Sharp-crested noise for mountain ridges, 0..1.
  D.ridged2 = (x, z, octaves = 4) => {
    let v = 0;
    let a = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      v += a * (1 - Math.abs(D.noise2(x, z) * 2 - 1));
      norm += a;
      x = x * 2.07 + 5.3;
      z = z * 2.07 + 11.9;
      a *= 0.5;
    }
    return v / norm;
  };

  // Distance from (px, pz) to the segment a-b, and how far along it the nearest point lies.
  D.segment = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = D.clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
    return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
  };

  // Distance from (px, pz) to a polyline [[x, z], ...].
  D.polylineDistance = (px, pz, points) => {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const s = D.segment(px, pz, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
      if (s.d < best) best = s.d;
    }
    return best;
  };

  // A material colour given as it should look on screen (sRGB hex), in the linear light
  // three.js shades in. (This version of three.js takes hex colours as linear as they are.)
  D.col = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  // Decodes a base64 string to an ArrayBuffer.
  D.base64Buffer = (text) => {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  };

  // Query-string switches for testing: ?dev, ?stage=hunt, ?at=x,z, ?hour=8, ?quality=low ...
  D.params = new URLSearchParams(location.search);
  D.dev = D.params.has('dev');

  // Things to run every frame: D.onFrame((dt, time) => ...). Ordered by when they were added.
  D.frameHooks = [];
  D.onFrame = (fn) => D.frameHooks.push(fn);
})();
