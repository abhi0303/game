// The New Dawn: renderer, graphics quality, textures, the sky, the sun and the time of day.
(() => {
  'use strict';
  const D = window.Dawn;
  const { $, clamp, smooth, lerp } = D;

  // ---------- Graphics quality ----------

  // Three presets, picked in the pause menu and remembered. High is the full picture; Medium
  // and Low trade resolution, shadow detail and how far plants are drawn as models.
  //   ratio        most pixels per screen pixel
  //   shadow       the sun's shadow map size, and half the width of ground it covers
  //   flora        how far plants are drawn as full models (1 = the full distance)
  //   grass        how thickly the near grass and undergrowth is drawn
  D.QUALITY = {
    low: { ratio: 1, minRatio: 0.75, shadow: 1024, shadowHalf: 38, soft: false, flora: 0.6, grass: 0.55, aniso: 2, far: 900 },
    medium: { ratio: 1.5, minRatio: 1, shadow: 2048, shadowHalf: 48, soft: true, flora: 0.8, grass: 0.8, aniso: 4, far: 1200 },
    high: { ratio: 2, minRatio: 1.3, shadow: 2048, shadowHalf: 56, soft: true, flora: 1, grass: 1, aniso: 8, far: 1500 },
  };
  D.settings = { quality: 'high', sensitivity: 1, invertY: false, volume: 0.8, music: 0.5, fov: 62, fps: 60, adaptive: true, waypoint: true };
  try {
    Object.assign(D.settings, JSON.parse(localStorage.getItem('new-dawn-settings') || '{}'));
  } catch (error) {
    // storage unavailable: the defaults stand
  }
  if (D.params.get('quality')) D.settings.quality = D.params.get('quality');
  if (!D.QUALITY[D.settings.quality]) D.settings.quality = 'high';
  D.gq = D.QUALITY[D.settings.quality];
  D.saveSettings = () => {
    try {
      localStorage.setItem('new-dawn-settings', JSON.stringify(D.settings));
    } catch (error) {
      // not kept, but the game goes on
    }
  };

  // ---------- Renderer, scene, camera ----------

  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: D.params.get('aa') !== '0', powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = D.gq.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const deviceRatio = window.devicePixelRatio || 1;
  D.pixelRatio = Math.min(deviceRatio, D.gq.ratio); // eased to D.bestRatio() as soon as the game runs
  renderer.setPixelRatio(D.pixelRatio);
  D.renderer = renderer;
  D.maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc4dc);
  scene.fog = new THREE.FogExp2(0x9fc4dc, 0.0032);
  D.scene = scene;

  const camera = new THREE.PerspectiveCamera(D.settings.fov, 1, 0.08, D.gq.far);
  camera.position.set(0, 20, 0);
  D.camera = camera;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Textures ----------

  const madeTextures = [];
  D.madeTextures = madeTextures;
  const aniso = () => Math.min(D.maxAniso, D.gq.aniso);

  // A photo texture from dawn-textures.js: kind is 'color' (shown as painted) or 'normal'.
  const photoCache = {};
  D.photo = (key, kind = 'color') => {
    const id = `${key}/${kind}`;
    if (photoCache[id]) return photoCache[id];
    const set = (window.DAWN_TEXTURES || {})[key];
    const tex = new THREE.Texture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = aniso();
    tex.encoding = kind === 'color' ? THREE.sRGBEncoding : THREE.LinearEncoding;
    madeTextures.push(tex);
    photoCache[id] = tex;
    if (set && set[kind]) {
      const image = new Image();
      tex.ready = new Promise((done) => {
        image.onload = () => {
          tex.image = image;
          tex.needsUpdate = true;
          done();
        };
        image.onerror = done;
      });
      image.src = set[kind];
    } else {
      // no photo: a flat stand-in (mid grey, or a flat normal)
      const data = kind === 'color' ? new Uint8Array([128, 128, 128, 255]) : new Uint8Array([128, 128, 255, 255]);
      tex.image = { data, width: 1, height: 1 };
      tex.isDataTexture = true;
      tex.needsUpdate = true;
      tex.ready = Promise.resolve();
    }
    return tex;
  };

  // A texture painted on a canvas by `draw(g, w, h)`.
  D.canvasTexture = (w, h, draw, { srgb = true, repeat = true } = {}) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = aniso();
    tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
    madeTextures.push(tex);
    return tex;
  };

  // Cut-out pictures (leaves, blades of grass) come with black in their see-through parts, and
  // as the picture is shrunk for distance that black bleeds into the edges as a dark fringe.
  // This fills the see-through parts with the picture's own average colour instead, keeping
  // the alpha, and hands back a texture made from the result. `flip` turns it upside down
  // (a canvas counts its rows from the top).
  D.cleanCutout = (source, { srgb = true, flip = false } = {}) => {
    const image = source.image || source;
    const w = image.width;
    const h = image.height;
    if (!w || !h) return source;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(image, 0, 0);
    const pixels = g.getImageData(0, 0, w, h).data;
    // a picture with no see-through parts at all (a JPEG): its black background is the cut
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 250) {
        opaque = false;
        break;
      }
    }
    if (opaque) {
      for (let i = 0; i < pixels.length; i += 4) {
        const bright = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        pixels[i + 3] = Math.max(0, Math.min(255, (bright - 16) * 7));
      }
    }
    let r = 0;
    let gr = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 160) {
        r += pixels[i];
        gr += pixels[i + 1];
        b += pixels[i + 2];
        n++;
      }
    }
    if (!n) return source;
    r /= n;
    gr /= n;
    b /= n;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const from = (flip ? h - 1 - y : y) * w * 4;
      const to = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        const a = pixels[from + x + 3];
        const k = a / 255;
        // part-covered pixels lean toward the average too, so the edge is never dark
        data[to + x] = pixels[from + x] * k + r * (1 - k);
        data[to + x + 1] = pixels[from + x + 1] * k + gr * (1 - k);
        data[to + x + 2] = pixels[from + x + 2] * k + b * (1 - k);
        data[to + x + 3] = a;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.wrapS = source.wrapS !== undefined ? source.wrapS : THREE.ClampToEdgeWrapping;
    tex.wrapT = source.wrapT !== undefined ? source.wrapT : THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = aniso();
    tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
    tex.flipY = false;
    tex.needsUpdate = true;
    madeTextures.push(tex);
    return tex;
  };

  // ---------- Sky ----------

  // One shader on a dome: a gradient from the horizon colour to the zenith colour, the sun
  // and its glow, the moon and stars at night, and drifting clouds lit from the sun's side.
  // (Ported from Car Drive.) Its colours are final screen colours; for the light it gives the
  // scene (see captureSky) it is asked for them in linear light instead.
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      time: { value: 0 },
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunGlow: { value: new THREE.Color() },
      cloudLit: { value: new THREE.Color() },
      cloudShade: { value: new THREE.Color() },
      cover: { value: 0.56 },
      night: { value: 0 },
      linearOut: { value: 0 },
      ringReveal: { value: 0 }, // Chapter 2's last sight: the ring over the eastern mountains
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // a hair inside the far plane, behind everything: exactly on it, rounding can clip it
        gl_Position = vec4(p.xy, p.w * 0.99998, p.w);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sunDir;
      uniform float time;
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 sunGlow;
      uniform vec3 cloudLit;
      uniform vec3 cloudShade;
      uniform float cover;
      uniform float night;
      uniform float linearOut;
      uniform float ringReveal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(17.0, 9.0);
          a *= 0.5;
        }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(up, 0.55));
        // below the horizon: the haze, darkening a little
        col = mix(col, horizon * 0.82, smoothstep(0.0, -0.25, d.y));

        float s = max(dot(d, sunDir), 0.0);
        col += sunGlow * (pow(s, 8.0) * 0.25 + pow(s, 90.0) * 0.45);
        col = mix(col, sunGlow + vec3(0.3), smoothstep(0.9993, 0.9997, s) * step(0.0, sunDir.y + 0.03));

        if (night > 0.01 && d.y > 0.0) {
          vec3 cell = floor(d * 280.0);
          float star = step(0.9972, hash(cell.xy + cell.z * 37.0));
          float twinkle = 0.65 + 0.35 * sin(time * 2.3 + hash(cell.xz) * 40.0);
          col += vec3(0.9, 0.93, 1.0) * star * twinkle * night * smoothstep(0.0, 0.25, d.y);
          // the milky band
          float bandX = dot(d, normalize(vec3(0.3, 0.5, 0.8))) * 3.2; // (pow of a negative is undefined in GLSL)
          float band = exp(-bandX * bandX);
          col += vec3(0.16, 0.17, 0.24) * band * night * fbm(d.xz * 9.0) * smoothstep(0.0, 0.3, d.y);
          float m = max(dot(d, -sunDir), 0.0);
          col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.9989, 0.9993, m) * night);
          col += vec3(0.35, 0.42, 0.6) * pow(m, 50.0) * 0.3 * night;
        }

        // the ring: a thin circle of green fire standing far off in the north-east, tilted
        if (ringReveal > 0.001) {
          vec3 rc = normalize(vec3(0.68, 0.66, -0.52)); // high over the north-eastern ridge (the Lookout sees it whole)
          vec3 rr = normalize(cross(rc, vec3(0.0, 1.0, 0.0)));
          vec3 ru = cross(rr, rc);
          float rk = dot(d, rc);
          if (rk > 0.8) {
            vec2 q = vec2(dot(d, rr), dot(d, ru) * 1.45) / rk;
            float e = length(q) - 0.27;
            float line = exp(-(e * e) / 0.000012) + exp(-(e * e) / 0.0009) * 0.28;
            float shimmer = 0.75 + 0.25 * sin(atan(q.y, q.x) * 9.0 + time * 0.7);
            col += vec3(0.32, 1.0, 0.62) * line * shimmer * ringReveal * (0.55 + 0.45 * night);
          }
        }

        if (d.y > 0.01) {
          vec2 uv = d.xz / (d.y + 0.1) * 1.5 + time * vec2(0.006, 0.003);
          float density = fbm(uv) + fbm(uv * 2.9 + 4.0) * 0.28;
          float amount = smoothstep(cover, cover + 0.34, density);
          vec2 toSun = uv + sunDir.xz * 0.16;
          float towardSun = fbm(toSun) + fbm(toSun * 2.9 + 4.0) * 0.28;
          float lit = clamp(0.55 + (density - towardSun) * 2.4, 0.0, 1.0);
          vec3 cloud = mix(cloudShade, cloudLit, lit);
          cloud = mix(cloud, cloudShade * 0.85, smoothstep(cover + 0.34, cover + 0.63, density) * 0.6);
          cloud += sunGlow * pow(s, 6.0) * 0.3;
          cloud = mix(horizon, cloud, smoothstep(0.01, 0.2, d.y));
          col = mix(col, cloud, amount * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
        // Captured for the reflections: in linear light, encoded the way the capture stores
        // it (RGBE: the alpha holds a shared exponent; a shader of our own must do that
        // itself). Never darker than 0.002, where half precision would lose the exponent.
        if (linearOut > 0.5) gl_FragColor = linearToOutputTexel(vec4(max(pow(max(col, vec3(0.0)), vec3(2.2)), vec3(0.002)), 1.0));
      }`,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMaterial);
  // drawn last of the solid things, only where nothing else is (its depth is the far plane)
  skyDome.renderOrder = 30;
  skyDome.frustumCulled = false;
  skyDome.onBeforeRender = () => skyDome.position.copy(camera.position);
  scene.add(skyDome);
  D.skyDome = skyDome;

  // ---------- Light ----------

  // Daylight: soft light from the whole sky (the hemisphere, and the sky itself captured for
  // reflections), and a warm sun that throws long shadows. At night the moon takes the sun's
  // place, cold and dim.
  D.sunDir = new THREE.Vector3(0.4, 0.7, -0.5).normalize();
  const hemi = new THREE.HemisphereLight(0xcfe3f5, 0x5d5a3f, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  D.sun = sun;
  D.hemi = hemi;

  function applyShadowQuality() {
    const half = D.gq.shadowHalf;
    sun.shadow.mapSize.set(D.gq.shadow, D.gq.shadow);
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 420 });
    sun.shadow.camera.updateProjectionMatrix();
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  applyShadowQuality();

  // The shadow box follows `focus`, moved in whole shadow-map texels so the edges do not crawl:
  // snapped along the shadow camera's own axes (it looks down the light from above, as
  // three.js aims it: its x across the light, level; its y up the picture). The light's own
  // direction follows the sun in small steps rather than every frame, for the same reason.
  const shadowSnap = new THREE.Vector3();
  const shadowDir = new THREE.Vector3(0, 1, 0);
  const shadowX = new THREE.Vector3();
  const shadowY = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  D.updateShadow = (focus) => {
    if (shadowDir.angleTo(D.sunDir) > 0.004) shadowDir.copy(D.sunDir);
    const half = D.gq.shadowHalf;
    const texel = (half * 2) / D.gq.shadow;
    shadowX.crossVectors(worldUp, shadowDir).normalize();
    shadowY.crossVectors(shadowDir, shadowX);
    const sx = Math.round(focus.dot(shadowX) / texel) * texel;
    const sy = Math.round(focus.dot(shadowY) / texel) * texel;
    const sz = focus.dot(shadowDir);
    shadowSnap.copy(shadowX).multiplyScalar(sx).addScaledVector(shadowY, sy).addScaledVector(shadowDir, sz);
    sun.target.position.copy(shadowSnap);
    sun.position.copy(shadowSnap).addScaledVector(shadowDir, 200);
    sun.target.updateMatrixWorld();
  };

  D.setQuality = (name) => {
    if (!D.QUALITY[name]) return;
    D.settings.quality = name;
    D.gq = D.QUALITY[name];
    D.pixelRatio = D.bestRatio();
    renderer.setPixelRatio(D.pixelRatio);
    renderer.shadowMap.type = D.gq.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    applyShadowQuality();
    for (const tex of madeTextures) {
      tex.anisotropy = aniso();
      tex.needsUpdate = !!tex.image;
    }
    camera.far = D.gq.far;
    camera.updateProjectionMatrix();
    resize();
    scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
    D.saveSettings();
    if (D.flora) D.flora.refresh();
  };

  // ---------- Time of day ----------

  // The sun rises at 6 in the east and sets at 18 in the west, passing a little to the north,
  // so in the morning it shines into the mouth of the cave and the jungle to the north is
  // lit from behind. env.hour is moved by the story (see story.js), not by a fixed clock.
  D.FOLIAGE_FILL = 0.9;
  const env = {
    hour: 7.5, rate: 0, // game hours per real second
    day: 1, night: 0, low: 0, overcast: 0, rain: 0, cover: 0.58,
    shake: 0, // camera shake from roars and blows, eased away
  };
  D.env = env;
  const tone = (hex) => new THREE.Color(hex);
  const SKY = {
    zenithDay: tone(0x2f6cc0), zenithDusk: tone(0x2b3a70), zenithNight: tone(0x02040b),
    horizonDay: tone(0xbdd6ea), horizonDusk: tone(0xf2a066), horizonNight: tone(0x080d1a),
    grey: tone(0x8d949c),
    sunHigh: tone(0xfff0d8), sunLow: tone(0xff9445), moon: tone(0x9db8f0),
    hemiDay: tone(0xcfe3f5), hemiNight: tone(0x5a74b4), groundDay: tone(0x5d5a3f), groundNight: tone(0x1a1f2c),
    cloudDay: tone(0xfffaf2), cloudDusk: tone(0xffb487), cloudShadeDay: tone(0x9aa3b2),
  };
  const mix = (out, a, b, t) => out.copy(a).lerp(b, clamp(t, 0, 1));
  const scratch = new THREE.Color();

  D.updateEnvironment = (dt, time) => {
    env.hour = (env.hour + env.rate * dt) % 24;
    const arc = ((env.hour - 6) / 12) * Math.PI; // 0 at sunrise, pi at sunset
    const height = Math.sin(arc);
    const sunDir = skyMaterial.uniforms.sunDir.value;
    sunDir.set(Math.cos(arc) * 0.78, height, -0.62).normalize();
    const day = smooth((height + 0.1) / 0.3);
    const low = (1 - smooth(height / 0.45)) * day;
    env.day = day;
    env.night = 1 - day;
    env.low = low;
    // the scene is lit by the sun by day and the moon (opposite) by night
    D.sunDir.copy(sunDir);
    if (height < 0.02) D.sunDir.set(-sunDir.x, -sunDir.y, -sunDir.z);
    if (D.sunDir.y < 0.14) {
      D.sunDir.y = 0.14;
      D.sunDir.normalize();
    }
    const dim = 1 - 0.65 * env.overcast;
    mix(sun.color, SKY.sunHigh, SKY.sunLow, low);
    if (height < 0.02) sun.color.copy(SKY.moon);
    sun.intensity = height < 0.02 ? 0.3 * (1 - 0.6 * env.overcast) : 1.7 * day * dim;
    mix(hemi.color, SKY.hemiNight, SKY.hemiDay, day);
    mix(hemi.groundColor, SKY.groundNight, SKY.groundDay, day);
    hemi.intensity = (0.36 + 0.3 * env.night * (D.nightFill || 0)) * (1 - 0.25 * env.overcast);
    // the sky's soft fill for the foliage (which does not sample the captured sky)
    D.foliageUniforms.foliageSky.value.copy(hemi.color).multiplyScalar(hemi.intensity * D.FOLIAGE_FILL * Math.PI);

    const u = skyMaterial.uniforms;
    u.time.value = time;
    u.ringReveal.value = D.ringReveal || 0;
    mix(u.zenith.value, SKY.zenithNight, SKY.zenithDay, day).lerp(SKY.zenithDusk, low * 0.6);
    mix(u.horizon.value, SKY.horizonNight, SKY.horizonDay, day).lerp(SKY.horizonDusk, low * 0.7);
    scratch.copy(SKY.grey).multiplyScalar(0.12 + 0.88 * day);
    u.zenith.value.lerp(scratch, env.overcast * 0.85);
    u.horizon.value.lerp(scratch, env.overcast * 0.8);
    mix(u.sunGlow.value, SKY.sunHigh, SKY.sunLow, low).multiplyScalar(day * (1 - 0.8 * env.overcast));
    mix(u.cloudLit.value, SKY.cloudDay, SKY.cloudDusk, low).multiplyScalar((0.08 + 0.92 * day) * (1 - 0.45 * env.overcast));
    u.cloudShade.value.copy(SKY.cloudShadeDay).multiplyScalar((0.06 + 0.94 * day) * (1 - 0.55 * env.overcast));
    u.cover.value = lerp(env.cover, 0.12, env.overcast);
    u.night.value = env.night * (1 - env.overcast);

    // haze: the colour of the horizon, thicker at dawn and dusk, in rain and in the jungle
    scene.fog.color.copy(u.horizon.value);
    scene.background.copy(u.horizon.value);
    const jungle = D.terrain ? D.terrain.jungleAmount(camera.position.x, camera.position.z) : 0;
    scene.fog.density = 0.0016 + 0.0014 * low + 0.0022 * env.night + 0.004 * env.rain + 0.0018 * jungle + (D.fogBoost || 0);

    // exposure: eyes adjust a little to the dark (and to the inside of the cave)
    const cave = D.caveDarkness ? D.caveDarkness(camera.position) : 0;
    renderer.toneMappingExposure = lerp(1.0, 1.25, env.night) * lerp(1, 1.65, cave) * (D.exposureBoost || 1);

    updateCapture();
    env.shake = Math.max(0, env.shake - dt * 1.6);
    // night: the picture graded down and toward blue (an overlay multiplied over the canvas)
    const grade = env.night * 0.5 * (1 - cave * 0.6);
    if (Math.abs(grade - (D.gradeShown || 0)) > 0.005) {
      D.gradeShown = grade;
      $('night-grade').style.opacity = grade.toFixed(3);
    }
  };

  // ---------- Light from the sky ----------

  // The sky dome is photographed into a blurred reflection map now and then (it changes
  // slowly), which every standard surface uses for its soft fill light and reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const skyCopy = new THREE.Mesh(skyDome.geometry, skyMaterial);
  skyScene.add(skyCopy);
  let captured = null;
  let capturedHour = -99;
  let capturedOvercast = -1;
  function captureSky() {
    skyMaterial.uniforms.linearOut.value = 1;
    const rt = pmrem.fromScene(skyScene, 0.02, 0.1, 2000);
    skyMaterial.uniforms.linearOut.value = 0;
    if (captured) captured.dispose();
    captured = rt;
    scene.environment = rt.texture;
  }
  let capturedAt = -99;
  function updateCapture() {
    const dh = Math.abs(env.hour - capturedHour);
    const now = performance.now() / 1000;
    const due = capturedHour < -50 || now - capturedAt > 1.5; // at most every second and a half
    if (due && (dh > 0.25 && dh < 23.75 || Math.abs(env.overcast - capturedOvercast) > 0.1)) {
      capturedAt = now;
      capturedHour = env.hour;
      capturedOvercast = env.overcast;
      captureSky();
    }
  }
  D.forceSkyCapture = () => {
    capturedHour = -99;
  };

  // ---------- Drawing, and keeping the machine cool ----------

  // With ?perf the GPU time of each frame is shown (a timer query, read back a frame or two
  // later). It is not used to steer anything: on Apple chips the GPU slows its clock when there
  // is less to do, so the time per frame stays much the same whatever the load.
  const gl = renderer.getContext();
  const timer = D.params.has('perf') ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const queries = [];
  D.gpuMs = 0;
  D.render = () => {
    let query = null;
    if (timer && queries.length < 4) {
      query = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    }
    renderer.render(scene, camera);
    if (query) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      queries.push(query);
    }
    while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const ns = gl.getQueryParameter(queries[0], gl.QUERY_RESULT);
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
      gl.deleteQuery(queries.shift());
      if (!disjoint && ns > 0) D.gpuMs = D.gpuMs ? D.gpuMs + (ns / 1e6 - D.gpuMs) * 0.1 : ns / 1e6;
    }
  };

  function setRatio(ratio) {
    if (Math.abs(ratio - D.pixelRatio) < 0.001) return;
    D.pixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    resize();
  }

  // The most pixels each preset draws while keeping cool. Past about this many, a sharper
  // picture is hard to see on a laptop screen but the graphics chip works far harder (and
  // hotter) for it. Without keeping cool, the preset's full resolution.
  const PIXEL_BUDGET = { high: 3.4e6, medium: 2.2e6, low: 1.3e6 };
  D.bestRatio = () => {
    const max = Math.min(deviceRatio, D.gq.ratio);
    if (!D.settings.adaptive) return max;
    const css = window.innerWidth * window.innerHeight;
    return Math.max(Math.min(max, D.gq.minRatio), Math.min(max, Math.floor(Math.sqrt(PIXEL_BUDGET[D.settings.quality] / css) * 20) / 20));
  };

  // And should frames keep coming late (the picture missing the screen's refresh) the
  // resolution eases down a step. Only steady lateness counts: three windows in a row of more
  // than one frame in six late; a single hitch, a tab switch, the window in the background
  // (gaps of a tenth of a second or more) are not the game being too heavy and are ignored.
  // Back up only after a long while (half a minute) with every frame on time, a small step at
  // a time, and never again past a step that was late. Each change resizes the picture, so
  // they are kept rare.
  let late = 0;
  let onTime = 0;
  let badWindows = 0;
  let goodFor = 0;
  let windowAt = 0;
  let lastChange = -1e9;
  let ceiling = Infinity;
  let lastBest = 0;
  D.adaptResolution = (dt, now) => {
    const best = D.bestRatio();
    // the window resized, or the settings changed: straight to the new best
    if (Math.abs(best - lastBest) > 0.001) {
      lastBest = best;
      setRatio(Math.min(best, ceiling));
      late = onTime = badWindows = goodFor = 0;
      return;
    }
    if (!D.settings.adaptive || D.state.mode !== 'play' || D.state.panel) return;
    if (dt > 0.1) return; // a stall, not a slow frame
    const frameMs = 1000 / (D.settings.fps || 60);
    if (dt * 1000 > frameMs * 1.5) late += 1;
    else onTime += 1;
    if (now - windowAt < 1.5) return;
    windowAt = now;
    const share = late / Math.max(1, late + onTime);
    late = 0;
    onTime = 0;
    if (share > 0.16) {
      badWindows++;
      goodFor = 0;
    } else {
      badWindows = 0;
      goodFor = share < 0.02 ? goodFor + 1.5 : 0;
    }
    const min = Math.min(best, D.gq.minRatio);
    if (badWindows >= 3 && D.pixelRatio > min + 0.001) {
      ceiling = Math.round((D.pixelRatio - 0.05) * 20) / 20; // that was too much, for good
      setRatio(Math.max(min, Math.round((D.pixelRatio - 0.15) * 20) / 20));
      badWindows = 0;
      lastChange = now;
    } else if (goodFor >= 30 && now - lastChange > 30 && D.pixelRatio < Math.min(best, ceiling) - 0.001) {
      setRatio(Math.min(best, ceiling, Math.round((D.pixelRatio + 0.05) * 20) / 20));
      goodFor = 0;
      lastChange = now;
    }
  };
  setRatio(D.bestRatio());
})();
