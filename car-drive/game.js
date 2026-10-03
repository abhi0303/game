(() => {
  'use strict';

  // ---------- Tuning ----------

  const BLOCKS = 7; // city is BLOCKS x BLOCKS
  const BLOCK_SIZE = 60;
  const ROAD_WIDTH = 16;
  const CELL = BLOCK_SIZE + ROAD_WIDTH;
  const WORLD = BLOCKS * CELL + ROAD_WIDTH;
  const HALF = WORLD / 2;
  const PARKING_LOTS = [[3, 3], [5, 1], [1, 5]]; // block coordinates

  const BAY_W = 3;
  const BAY_L = 6;

  const TOP_SPEED = 38; // m/s
  const NITRO_SPEED = 56;
  const REVERSE_SPEED = 12;
  const ENGINE = 16;
  const NITRO_ENGINE = 34;
  const BRAKE = 32;
  const HANDBRAKE = 14;
  const COAST = 4;
  const GRIP = 16;
  const HANDBRAKE_GRIP = 2.4;
  const TYRE_HOLD = 14; // the hardest the tyres can corner, in m/s2
  const TURN_RATE = 2.4;
  const NITRO_DRAIN = 0.33;
  const NITRO_REFILL = 0.12;

  const CAR_RADIUS = 1.15;
  const CAR_CIRCLE_OFFSET = 1.3;
  const START = { x: -44, z: -20, heading: 0 };

  const SKY = 0xc6d8e7; // haze at the horizon; the sky shader uses the same colour there
  const KERB = 0.16; // footpaths stand this far above the road
  const PODIUM = 4; // height of the shop-front storey at the foot of each building

  // Each road has two lanes a side. Traffic keeps to the outer one; this is its centre,
  // measured from the middle of the road.
  const LANE = (ROAD_WIDTH * 3) / 8;
  const JUNCTION = ROAD_WIDTH / 2; // half-size of an intersection
  const LIGHT_CYCLE = 20; // seconds: 8 green + 2 yellow for each axis
  const TRAFFIC_CARS = 64;
  const PEOPLE = 130;
  const DOGS = 18;
  const BIRDS = 30;

  const MAX_WANTED = 5;
  const MAX_POLICE = 4;
  const POLICE_BASE_SPEED = 34; // m/s, plus POLICE_SPEED_PER_STAR for each star
  const POLICE_SPEED_PER_STAR = 3;
  const ESCAPE_DISTANCE = 110; // stay this far from every police car...
  const ESCAPE_SECONDS = 10; // ...for this long to lose the wanted level
  const BUST_SECONDS = 2.5;
  const KNOCKED_SECONDS = 12;
  const MAP_SIZE = 190;

  const GRAVITY = 25;
  const STEP_UP = 0.7; // tallest ledge that still counts as the same surface
  const FLYOVER_ROW = 2; // the flyover runs along this east-west road...
  const FLYOVER_FROM = 1; // ...between these two intersections
  const FLYOVER_TO = 5;
  const FLYOVER_HEIGHT = 6;
  const PARKADE = [4, 3]; // block holding the multi-level car park
  const LEVEL_HEIGHT = 5;
  const WALK_SPEED = 2.2; // m/s, matched to the hero model's walk and run animations
  const RUN_SPEED = 6.5;
  const ARROW_SPEED = 55;
  const CLIMB_REACH = 2.6; // tallest ledge the hero can pull himself onto
  const CLIMB_SECONDS = 0.75;
  const MAX_ALTITUDE = 160;
  const HELI_SPEED = 32;
  const HELI_LIFT = 11; // m/s climb and descent
  const JETPACK_SPEED = 16;
  const JETPACK_LIFT = 10;

  // What the player can adjust on the settings page; kept between visits.
  const SETTING_DEFAULTS = { steering: 1, grip: 1, power: 1, brakes: 1, volume: 0.7 };
  const settings = { ...SETTING_DEFAULTS };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem('car-drive-settings') || '{}'));
  } catch (error) {
    // storage unavailable: the defaults stand
  }

  const blockCenter = (i) => -HALF + ROAD_WIDTH + i * CELL + BLOCK_SIZE / 2;
  const roadCenter = (i) => -HALF + ROAD_WIDTH / 2 + i * CELL;
  const inGrid = (i, j) => i >= 0 && i <= BLOCKS && j >= 0 && j <= BLOCKS;
  // travel directions as [dx, dz]; index + 1 is a right turn, index + 3 a left turn
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const rightOf = ([dx, dz]) => [-dz, dx];
  // can traffic leave intersection (i, j) in direction d? The road under the flyover is closed to it
  const segmentOpen = (i, j, d) => {
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1])) return false;
    if (j !== FLYOVER_ROW) return true;
    if (d === 0) return i < FLYOVER_FROM || i >= FLYOVER_TO;
    if (d === 2) return i <= FLYOVER_FROM || i > FLYOVER_TO;
    return true;
  };

  // ---------- Scene ----------

  const $ = (id) => document.getElementById(id);
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 260, 1300); // far enough to see the city from the hills

  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1900);

  // Daylight: soft blue light from the whole sky, bounced warm light from the ground, and a
  // slightly warm sun low enough to throw long shadows. Kept well under full strength so
  // sunlit surfaces keep their colour instead of washing out.
  const SUN_DIR = new THREE.Vector3(0.55, 0.6, 0.42).normalize();
  const skyLight = new THREE.HemisphereLight(0xc9dcf2, 0x6f6957, 0.6);
  scene.add(skyLight);
  const sun = new THREE.DirectionalLight(0xfff0da, 0.78);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // ---------- City ----------

  // axis-aligned boxes: { minX, maxX, minZ, maxZ } plus optional minY / maxY, the height band they block
  const colliders = [];
  const bays = []; // { x, z, taken }
  const marks = []; // white paint: { x, z, sx, sz }
  const cityBlocks = []; // centres of blocks that have footpaths
  const signals = []; // one traffic light per road approach: { i, j, d }
  const trafficBoxes = []; // moving colliders, same shape as `colliders`
  const policeBoxes = [];

  // --- procedural textures ---

  function canvasTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function speckle(g, w, h, count, alpha) {
    for (let n = 0; n < count; n++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }

  // near-white maps, so the material colour still decides the tint
  const grainTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2200, 0.1);
  });
  const paverTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ececec';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, 0.06);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 32, 0, 2, h);
      g.fillRect(0, i * 32, w, 2);
    }
  });

  // `tile` is how many metres one repeat of `map` covers
  // --- photographic ground textures (road-textures.js) ---

  function photoTexture(uri) {
    if (!uri) return null;
    const tex = new THREE.Texture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const image = new Image();
    image.onload = () => {
      tex.image = image;
      tex.needsUpdate = true;
    };
    image.src = uri;
    return tex;
  }

  // What each kind of ground is surfaced with: colour tint, colour map, how many metres one
  // repeat covers, and a normal map. Without the photos it falls back to the tinted grain.
  const photos = window.ROAD_TEXTURES || {};
  const GROUND = photos.asphalt ? {
    road: [0xa9abb0, photoTexture(photos.asphalt), 5, photoTexture(photos.asphaltNormal)], // tinted darker than the pale photo
    tarmac: [0xffffff, photoTexture(photos.tarmac), 3, photoTexture(photos.tarmacNormal)],
    paving: [0xf4f1ea, photoTexture(photos.paving), 3.6, photoTexture(photos.pavingNormal)],
  } : {
    road: [0x50555e, grainTex, 5, null],
    tarmac: [0x3a3f47, grainTex, 5, null],
    paving: [0xa9adb4, paverTex, 3, null],
  };

  // grass keeps its tint colours; the photo only adds the texture of the blades
  const grassTex = photoTexture(photos.grass) || grainTex;
  const GRASS_TILE = photos.grass ? 4 : 6;

  // Shiny things pick up a reflection of the city once it has been captured (see
  // captureReflections); until then, and for anything made later, they are registered here.
  let reflection = null;
  const reflective = [];
  function reflect(material, amount) {
    material.reflectivity = amount;
    material.userData.reflect = amount; // its strength in full daylight
    material.combine = THREE.MixOperation;
    if (reflection) material.envMap = reflection;
    reflective.push(material);
    return material;
  }

  // galvanised steel for poles: pale grey with faint vertical streaks
  const steelMat = reflect(new THREE.MeshPhongMaterial({
    color: 0xa3a8ae,
    shininess: 45,
    specular: 0x555555,
    map: canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#d9dbdd';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 70; n++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)';
        g.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h);
      }
      speckle(g, w, h, 400, 0.06);
    }),
  }), 0.1);

  // A matte surface; with a normal map it is lit per pixel so the relief shows.
  function groundMaterial(color, map, normalMap, extra = {}) {
    if (!normalMap) return new THREE.MeshLambertMaterial({ color, map, ...extra });
    const material = new THREE.MeshPhongMaterial({ color, map, normalMap, shininess: 8, specular: 0x161616, ...extra });
    // rain changes how it looks, and a wet surface reflects the sky
    material.combine = THREE.MixOperation;
    material.reflectivity = 0;
    reflective.push(material);
    wetSurfaces.push({ material, color: new THREE.Color(color) });
    return material;
  }

  // Makes a box's faces repeat a texture every `tile` metres.
  // Box faces come in the order +x -x +y -y +z -z.
  function tileBoxFaces(geo, w, h, d, tile) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const [across, up] = face < 2 ? [d, h] : face < 4 ? [w, d] : [w, h];
      uv.setXY(i, (uv.getX(i) * across) / tile, (uv.getY(i) * up) / tile);
    }
    return geo;
  }

  function flatPlane(w, d, color, x, z, y, map = null, tile = 1, normalMap = null) {
    const geo = new THREE.PlaneGeometry(w, d);
    if (map) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
    }
    const mesh = new THREE.Mesh(geo, groundMaterial(color, map, normalMap));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // One facade tile is 4 floors by 4 bays (12 m x 12 m), 64 px per window cell.
  function facadeMaterial(style, wall) {
    const map = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      if (style === 'brick') {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        for (let y = 0; y < h; y += 8) {
          g.fillRect(0, y, w, 1);
          for (let x = ((y / 8) % 2) * 8; x < w; x += 16) g.fillRect(x, y, 1, 8);
        }
      }
      speckle(g, w, h, 1500, 0.05);

      const glass = (x, y, gw, gh, lit) => {
        const grad = g.createLinearGradient(0, y, 0, y + gh);
        grad.addColorStop(0, lit ? '#ffeab0' : '#6a8aa6');
        grad.addColorStop(1, lit ? '#e9b95c' : '#1f2c3a');
        g.fillStyle = grad;
        g.fillRect(x, y, gw, gh);
      };

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const x = c * 64;
          const y = r * 64;
          const lit = Math.random() < 0.2;
          if (style === 'glass') {
            // curtain wall: full-width panes, a dark band at each floor, pale mullions
            glass(x, y, 64, 48, lit);
            g.fillStyle = 'rgba(255,255,255,0.1)';
            g.beginPath();
            g.moveTo(x + 8, y + 48);
            g.lineTo(x + 28, y);
            g.lineTo(x + 40, y);
            g.lineTo(x + 20, y + 48);
            g.fill();
            g.fillStyle = 'rgba(10,18,28,0.75)';
            g.fillRect(x, y + 48, 64, 16);
            g.fillStyle = '#c3ccd6';
            g.fillRect(x, y, 64, 2);
            g.fillRect(x, y, 2, 64);
          } else if (style === 'ribbon') {
            // concrete office: one long strip of window per floor
            glass(x, y + 14, 64, 28, lit);
            g.fillStyle = 'rgba(255,255,255,0.3)';
            g.fillRect(x, y + 11, 64, 3);
            g.fillStyle = 'rgba(0,0,0,0.3)';
            g.fillRect(x, y + 42, 64, 3);
            g.fillRect(x + 31, y + 14, 2, 28);
          } else {
            // brick and plaster: framed sash windows with sills
            g.fillStyle = '#f1eee6';
            g.fillRect(x + 15, y + 9, 34, 42);
            glass(x + 18, y + 12, 28, 36, lit);
            g.fillStyle = '#f1eee6';
            g.fillRect(x + 31, y + 12, 2, 36);
            g.fillRect(x + 18, y + 29, 28, 2);
            g.fillStyle = 'rgba(0,0,0,0.3)';
            g.fillRect(x + 12, y + 51, 40, 3);
            if (style === 'plaster' && c % 2 === 0) {
              // balcony railing
              g.fillStyle = 'rgba(38,42,50,0.9)';
              g.fillRect(x + 7, y + 42, 50, 2);
              g.fillRect(x + 7, y + 59, 50, 4);
              for (let b = x + 7; b <= x + 56; b += 6) g.fillRect(b, y + 42, 1.5, 18);
            }
          }
        }
      }
    });
    return new THREE.MeshLambertMaterial({ map });
  }

  // Shop fronts: one tile is 6 m wide and the full podium height.
  function shopMaterial(wall, awning) {
    const map = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, 0.05);
      g.fillStyle = '#f3efe4'; // sign board
      g.fillRect(6, 6, w - 12, 16);
      const grad = g.createLinearGradient(0, 44, 0, 108);
      grad.addColorStop(0, '#7f9db5');
      grad.addColorStop(1, '#1d2a36');
      g.fillStyle = grad;
      g.fillRect(8, 44, 74, 64); // display window
      g.fillRect(90, 44, 30, 78); // door
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.moveTo(14, 108);
      g.lineTo(40, 44);
      g.lineTo(54, 44);
      g.lineTo(28, 108);
      g.fill();
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = (x / 16) % 2 ? '#f3efe4' : awning; // striped awning
        g.fillRect(x, 26, 16, 16);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, 42, w, 2);
      g.fillRect(0, 122, w, 6);
    });
    return new THREE.MeshLambertMaterial({ map });
  }

  const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x5c6470, map: grainTex });
  const trimMaterial = new THREE.MeshLambertMaterial({ color: 0xcfd2d6 });
  const unitMaterial = new THREE.MeshLambertMaterial({ color: 0x9a9fa6 });
  const facadeMaterials = [
    ['brick', '#9c4a36'], ['brick', '#7d5a48'], ['brick', '#b56548'],
    ['plaster', '#e6d5b8'], ['plaster', '#c9d6df'], ['plaster', '#e8c9b0'],
    ['glass', '#2f4f6f'], ['glass', '#3a6b7c'],
    ['ribbon', '#b9bcc0'], ['ribbon', '#a7a39b'],
  ].map(([style, wall]) => facadeMaterial(style, wall));
  const shopMaterials = [
    ['#6b6f76', '#c0392b'], ['#8a7f72', '#1f7a5c'], ['#5b6470', '#2c5fa8'], ['#7a6a5c', '#d98e04'],
  ].map(([wall, awning]) => shopMaterial(wall, awning));

  // Box whose side faces repeat a texture every tileU x tileV metres.
  // Box faces come in the order +x -x +y -y +z -z.
  function tiledBox(w, h, d, tileU, tileV) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const span = Math.floor(i / 4) < 2 ? d : w;
      uv.setXY(i, (uv.getX(i) * span) / tileU, (uv.getY(i) * h) / tileV);
    }
    return geo;
  }

  const tankGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12);
  const mastGeo = new THREE.CylinderGeometry(0.06, 0.06, 7, 5);

  // A shop-front podium, the main block, a roof ledge, sometimes a set-back upper tier,
  // and plant on the roof. Widths and heights are whole window bays and floors.
  function addBuilding(x, z, w, d, h) {
    const part = (geo, material, px, py, pz) => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    };
    const sides = (m) => [m, m, roofMaterial, roofMaterial, m, m];
    const wall = pick(facadeMaterials);

    part(tiledBox(w + 0.5, PODIUM, d + 0.5, 6, PODIUM), sides(pick(shopMaterials)), x, PODIUM / 2, z);
    part(tiledBox(w, h - PODIUM, d, 12, 12), sides(wall), x, (h + PODIUM) / 2, z);
    part(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), trimMaterial, x, h + 0.1, z);

    let top = h + 0.4;
    let rw = w;
    let rd = d;
    // the roof is somewhere to land or stand
    const roof = (hw, hd, y) => surfaces.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h0: y, h1: y });
    roof(w / 2 + 0.3, d / 2 + 0.3, top);
    if (h > 24 && Math.random() < 0.6) {
      rw = Math.round((w * 0.6) / 3) * 3;
      rd = Math.round((d * 0.6) / 3) * 3;
      const th = pick([6, 9, 12]);
      part(tiledBox(rw, th, rd, 12, 12), sides(wall), x, top + th / 2, z);
      part(new THREE.BoxGeometry(rw + 0.6, 0.5, rd + 0.6), trimMaterial, x, top + th + 0.1, z);
      colliders.push({ minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2, minY: top, maxY: top + th });
      top += th + 0.35;
      roof(rw / 2 + 0.3, rd / 2 + 0.3, top);
    }

    // air-conditioning units, a water tank, an antenna
    const spot = () => [x + rand(-rw / 2 + 2, rw / 2 - 2), z + rand(-rd / 2 + 2, rd / 2 - 2)];
    for (let n = Math.floor(rand(1, 3)); n > 0; n--) {
      const [ux, uz] = spot();
      part(new THREE.BoxGeometry(rand(1.6, 3), 1.1, rand(1.4, 2.4)), unitMaterial, ux, top + 0.55, uz);
    }
    if (Math.random() < 0.35) {
      const [tx, tz] = spot();
      part(tankGeo, unitMaterial, tx, top + 1.1, tz);
    }
    if (h > 30 && Math.random() < 0.6) part(mastGeo, unitMaterial, x, top + 3.5, z);

    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: h });
  }

  // --- trees, bushes and grass ---

  // Plants are only noted down while the city and hills are laid out; buildVegetation then
  // draws them all at once. A tree is a trunk with a few boughs and a crown of leaf cards:
  // small flat pieces, each printed with a spray of little leaves, set at every angle so
  // the crown reads as foliage instead of a solid shape.
  const plants = []; // { type: 'tree' | 'pine' | 'bush', x, y, z, s }
  const lawns = []; // { x, y, z, size }: park grass, planted with tufts

  function addTree(x, z) {
    plants.push({ type: Math.random() < 0.3 ? 'pine' : 'tree', x, y: KERB + 0.08, z, s: rand(0.8, 1.25) });
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, maxY: 8 });
  }

  function addBush(x, z) {
    plants.push({ type: 'bush', x, y: KERB + 0.08, z, s: rand(0.8, 1.3) });
  }

  function buildVegetation() {
    // near-white pictures: each card is tinted its own green
    const leafTex = canvasTexture(256, 256, (g, w) => {
      for (let n = 0; n < 520; n++) {
        const a = Math.random() * Math.PI * 2;
        const r = 118 * Math.sqrt(Math.random()) * (0.75 + 0.25 * Math.random());
        const shade = 45 + (n / 520) * 50; // the back ones darker, the front ones lighter
        g.fillStyle = `hsl(${rand(80, 105)}, 22%, ${shade}%)`;
        g.beginPath();
        g.ellipse(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, rand(4, 7.5), rand(2, 3.6), Math.random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    });
    const pineTex = canvasTexture(128, 256, (g, w, h) => {
      g.lineCap = 'round';
      const needles = (x0, y0, x1, y1, length) => {
        g.strokeStyle = '#5f5248';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        for (let t = 0; t <= 1; t += 0.035) {
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t;
          for (const side of [-1, 1]) {
            g.strokeStyle = `hsl(110, 14%, ${rand(55, 95)}%)`;
            g.lineWidth = 1.3;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + side * length * rand(0.6, 1) + (x1 - x0) * 0.06, y + rand(4, 12));
            g.stroke();
          }
        }
      };
      needles(w / 2, 6, w / 2, h - 8, 13); // the bough, tip at the bottom of the picture
      for (let y = 26; y < h - 30; y += 30) {
        for (const side of [-1, 1]) needles(w / 2, y, w / 2 + side * rand(34, 52), y + rand(26, 40), 9);
      }
    });
    const tuftTex = canvasTexture(64, 64, (g, w, h) => {
      for (let n = 0; n < 26; n++) {
        const x = rand(8, w - 8);
        const lean = rand(-10, 10);
        const top = rand(4, 34);
        g.fillStyle = `hsl(${rand(80, 105)}, 20%, ${rand(55, 95)}%)`;
        g.beginPath();
        g.moveTo(x - 2, h);
        g.quadraticCurveTo(x + lean * 0.3, h * 0.5, x + lean, top);
        g.quadraticCurveTo(x + lean * 0.5, h * 0.5, x + 2, h);
        g.fill();
      }
    });
    const bark = new THREE.MeshLambertMaterial({
      color: 0x8a6a4c,
      map: canvasTexture(64, 128, (g, w, h) => {
        g.fillStyle = '#b9b0a4';
        g.fillRect(0, 0, w, h);
        for (let n = 0; n < 90; n++) {
          g.fillStyle = Math.random() < 0.6 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.14)';
          g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 8 + Math.random() * 30);
        }
      }),
    });

    const cards = { leaf: [], pine: [], tuft: [] }; // each: [x, y, z, rx, ry, rz, width, height, r, g, b]
    const wood = []; // trunks and boughs: [x, y, z, tiltX, turnY, radius, length]
    const GREENS = [[0.3, 0.46, 0.16], [0.38, 0.55, 0.2], [0.22, 0.38, 0.14], [0.46, 0.6, 0.22], [0.26, 0.42, 0.2]];

    for (const p of plants) {
      const s = p.s;
      if (p.type === 'tree') {
        const green = pick(GREENS);
        wood.push([p.x, p.y, p.z, 0, 0, 0.24 * s, 3.4 * s]);
        for (let n = 0; n < 4; n++) {
          wood.push([p.x, p.y + rand(2.2, 3.1) * s, p.z, rand(0.5, 0.95), n * 1.6 + rand(0, 0.8), 0.1 * s, 2.3 * s]);
        }
        for (let n = 0; n < 130; n++) {
          // a point in the crown, more of them toward the outside
          const a = Math.random() * Math.PI * 2;
          const up = rand(-0.4, 1);
          const flat = Math.sqrt(1 - up * up * 0.8);
          const out = 0.5 + 0.5 * Math.sqrt(Math.random());
          const light = (0.62 + 0.38 * (up * 0.5 + 0.5)) * rand(0.85, 1.15); // darker underneath
          cards.leaf.push([
            p.x + Math.cos(a) * flat * 2.4 * s * out, p.y + (4.7 + up * 1.9 * out) * s, p.z + Math.sin(a) * flat * 2.4 * s * out,
            rand(-1.2, 1.2), Math.random() * 6.3, rand(-1.2, 1.2), rand(1.7, 2.6) * s, rand(1.7, 2.6) * s,
            green[0] * light, green[1] * light, green[2] * light,
          ]);
        }
      } else if (p.type === 'pine') {
        wood.push([p.x, p.y, p.z, 0, 0, 0.2 * s, 7.6 * s]);
        for (let tier = 0; tier < 9; tier++) {
          const reach = (2.5 - tier * 0.26) * s;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + tier * 0.7 + rand(-0.15, 0.15);
            const light = rand(0.75, 1.1) * (0.7 + tier * 0.04);
            // a bough lying out from the trunk, drooping toward its tip
            cards.pine.push([
              p.x + Math.sin(a) * reach * 0.5, p.y + (1.7 + tier * 0.68) * s, p.z + Math.cos(a) * reach * 0.5,
              -(Math.PI / 2 - rand(0.35, 0.6)), a, 0, reach * 0.95, reach * 1.15,
              0.15 * light, 0.34 * light, 0.2 * light,
            ]);
          }
        }
        for (const turn of [0, Math.PI / 2]) { // the tip
          cards.pine.push([p.x, p.y + 7.9 * s, p.z, Math.PI, turn, 0, 1.0 * s, 1.5 * s, 0.16, 0.36, 0.2]);
        }
      } else {
        const green = pick(GREENS);
        for (let n = 0; n < 14; n++) {
          const a = Math.random() * Math.PI * 2;
          const out = rand(0.2, 0.75) * s;
          const light = rand(0.75, 1.2);
          cards.leaf.push([
            p.x + Math.cos(a) * out, p.y + rand(0.3, 0.8) * s, p.z + Math.sin(a) * out,
            rand(-1, 1), Math.random() * 6.3, rand(-1, 1), rand(0.9, 1.4) * s, rand(0.9, 1.4) * s,
            green[0] * light * 1.1, green[1] * light * 1.1, green[2] * light,
          ]);
        }
      }
    }
    for (const lawn of lawns) {
      for (let n = 0; n < 380; n++) {
        const x = lawn.x + rand(-0.5, 0.5) * lawn.size;
        const z = lawn.z + rand(-0.5, 0.5) * lawn.size;
        const turn = Math.random() * Math.PI;
        const size = rand(0.4, 0.75);
        const light = rand(0.8, 1.25);
        for (const quarter of [0, Math.PI / 2]) {
          cards.tuft.push([x, lawn.y + size * 0.3, z, 0, turn + quarter, 0, size, size * 0.6, 0.3 * light, 0.5 * light, 0.17 * light]);
        }
      }
    }

    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YXZ';
    const tint = new THREE.Color();
    const plane = new THREE.PlaneGeometry(1, 1);
    for (const [name, map, shadows] of [['leaf', leafTex, true], ['pine', pineTex, true], ['tuft', tuftTex, false]]) {
      const list = cards[name];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(plane, new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide }), list.length);
      list.forEach((c, i) => {
        dummy.position.set(c[0], c[1], c[2]);
        dummy.rotation.set(c[3], c[4], c[5]);
        dummy.scale.set(c[6], c[7], 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint.setRGB(c[8], c[9], c[10]));
      });
      if (shadows) {
        mesh.castShadow = true;
        // the shadow follows the leaves' outline, not the square card
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
      }
      scene.add(mesh);
    }
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 1, 1, 8).translate(0, 0.5, 0), bark, wood.length);
    wood.forEach((t, i) => {
      dummy.position.set(t[0], t[1], t[2]);
      dummy.rotation.set(t[3], t[4], 0);
      dummy.scale.set(t[5], t[6], t[5]);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true;
    scene.add(trunks);
  }

  function addBayRow(cx, cz, count) {
    const startX = cx - ((count - 1) * BAY_W) / 2;
    for (let i = 0; i <= count; i++) {
      marks.push({ x: startX - BAY_W / 2 + i * BAY_W, z: cz, sx: 0.15, sz: BAY_L });
    }
    for (let i = 0; i < count; i++) {
      bays.push({ x: startX + i * BAY_W, z: cz, taken: false });
    }
  }

  function addParkingLot(cx, cz) {
    flatPlane(BLOCK_SIZE, BLOCK_SIZE, GROUND.tarmac[0], cx, cz, 0.06, ...GROUND.tarmac.slice(1));
    addBayRow(cx, cz - 26, 17);
    addBayRow(cx, cz + 26, 17);
    addBayRow(cx, cz - 3.1, 13);
    addBayRow(cx, cz + 3.1, 13);
    // back lines along the edges and the spine of the double row
    marks.push({ x: cx, z: cz - 29, sx: 17 * BAY_W, sz: 0.15 });
    marks.push({ x: cx, z: cz + 29, sx: 17 * BAY_W, sz: 0.15 });
    marks.push({ x: cx, z: cz, sx: 13 * BAY_W, sz: 0.15 });
  }

  const kerbMat = new THREE.MeshLambertMaterial({ color: 0x8b9098 });

  function addCityBlock(cx, cz) {
    cityBlocks.push({ x: cx, z: cz, y: KERB });
    // a raised kerb that cars and people step up onto
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_SIZE, KERB - 0.04, BLOCK_SIZE), kerbMat);
    kerb.position.set(cx, (KERB - 0.04) / 2, cz);
    scene.add(kerb);
    flatPlane(BLOCK_SIZE, BLOCK_SIZE, GROUND.paving[0], cx, cz, KERB + 0.01, ...GROUND.paving.slice(1));
    const half = BLOCK_SIZE / 2;
    surfaces.push({ minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half, h0: KERB, h1: KERB });

    for (const ox of [-15, 15]) {
      for (const oz of [-15, 15]) {
        if (Math.random() < 0.15) {
          // pocket park
          flatPlane(24, 24, 0x6fb56a, cx + ox, cz + oz, KERB + 0.08, grassTex, GRASS_TILE);
          lawns.push({ x: cx + ox, y: KERB + 0.08, z: cz + oz, size: 23 });
          for (let i = 0; i < 4; i++) addTree(cx + ox + rand(-9, 9), cz + oz + rand(-9, 9));
          for (let i = 0; i < 4; i++) addBush(cx + ox + rand(-10, 10), cz + oz + rand(-10, 10));
        } else {
          const bays = () => 3 * Math.floor(rand(6, 9)); // 18, 21 or 24 m
          addBuilding(cx + ox, cz + oz, bays(), bays(), PODIUM + 3 * Math.floor(rand(2, 15)));
        }
      }
    }
  }

  // Lamp posts along every footpath, arms reaching out over the road.
  function addStreetLamps() {
    const spots = [];
    for (let bx = 0; bx < BLOCKS; bx++) {
      for (let bz = 0; bz < BLOCKS; bz++) {
        DIRS.forEach(([dx, dz]) => {
          for (const t of [-14, 14]) {
            spots.push({
              x: blockCenter(bx) + dx * 29.3 - dz * t,
              z: blockCenter(bz) + dz * 29.3 + dx * t,
              turn: Math.atan2(dx, dz),
            });
          }
        });
      }
    }
    let parts;
    // the lantern's glass and bulb are dull by day and lit after dark (see updateEnvironment)
    const glass = new THREE.MeshPhongMaterial({
      color: 0xe6eef2, transparent: true, opacity: 0.4, shininess: 110, depthWrite: false,
    });
    const bulb = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
    const model = rideTemplates.lamp;
    if (model) {
      // the loaded lamp: a cast-iron post with a glazed lantern, drawn with its photo texture
      model.updateMatrixWorld(true);
      const skin = photoTexture(window.LAMP_TEXTURE);
      skin.flipY = false; // the model's texture coordinates count from the top
      const iron = new THREE.MeshPhongMaterial({ map: skin, shininess: 30, specular: 0x333333 });
      parts = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).scale(1.3, 1.3, 1.3); // about 5 m tall
        const name = o.material.name;
        const mesh = new THREE.InstancedMesh(geo, name.endsWith('glass') ? glass : name.endsWith('bulb') ? bulb : iron, spots.length);
        mesh.castShadow = !name.endsWith('glass');
        parts.push(mesh);
      });
    } else {
      const metal = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
      parts = [
        [new THREE.CylinderGeometry(0.07, 0.11, 7, 6).translate(0, 3.5, 0), metal],
        [new THREE.BoxGeometry(0.1, 0.1, 1.9).translate(0, 7, 0.9), metal],
        [new THREE.BoxGeometry(0.34, 0.12, 0.75).translate(0, 6.92, 1.6), bulb],
      ].map(([geo, mat]) => new THREE.InstancedMesh(geo, mat, spots.length));
    }
    const dummy = new THREE.Object3D();
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x, KERB, spot.z);
      dummy.rotation.y = spot.turn;
      dummy.updateMatrix();
      for (const mesh of parts) mesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(...parts);

    // the pool of light under each lamp: a soft glowing disc on the ground, shown after dark
    const pool = new THREE.PlaneGeometry(1, 1);
    pool.rotateX(-Math.PI / 2);
    const glow = new THREE.InstancedMesh(pool, new THREE.MeshBasicMaterial({
      color: 0xffd48a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      map: canvasTexture(64, 64, (g, w) => {
        g.fillStyle = '#000';
        g.fillRect(0, 0, w, w);
        const fade = g.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
        fade.addColorStop(0, 'rgba(255,255,255,0.95)');
        fade.addColorStop(0.35, 'rgba(255,255,255,0.4)');
        fade.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = fade;
        g.fillRect(0, 0, w, w);
      }),
    }), spots.length);
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x, KERB + 0.05, spot.z);
      dummy.rotation.y = 0;
      dummy.scale.set(17, 1, 17);
      dummy.updateMatrix();
      glow.setMatrixAt(i, dummy.matrix);
    });
    glow.renderOrder = 0.85;
    glow.visible = false;
    scene.add(glow);
    streetLights = { bulb, glass, glow };
  }

  let skyDome;

  // The sky is one shader on a dome: a gradient from the horizon colour to the zenith
  // colour, the sun with its glow, the moon and stars at night, and drifting clouds made
  // from layered noise, lit from the sun's side. Everything that changes with the time of
  // day or the weather comes in through the uniforms, set by updateEnvironment below.
  function addSky() {
    skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1700, 32, 16),
      new THREE.ShaderMaterial({
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
          cover: { value: 0.52 }, // lower means more of the sky is cloud
          night: { value: 0 },
          flash: { value: 0 },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
          uniform float flash;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
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
            vec3 col = mix(horizon, zenith, pow(up, 0.6));

            float s = max(dot(d, sunDir), 0.0);
            col += sunGlow * (pow(s, 10.0) * 0.2 + pow(s, 120.0) * 0.4);
            col = mix(col, sunGlow + vec3(0.25), smoothstep(0.9992, 0.9996, s) * step(0.0, sunDir.y + 0.02));

            // night: stars, and the moon opposite the sun
            if (night > 0.01 && d.y > 0.0) {
              vec3 cell = floor(d * 260.0);
              float star = step(0.9975, hash(cell.xy + cell.z * 37.0));
              float twinkle = 0.7 + 0.3 * sin(time * 2.0 + hash(cell.xz) * 40.0);
              col += vec3(0.9, 0.92, 1.0) * star * twinkle * night * smoothstep(0.0, 0.25, d.y);
              float m = max(dot(d, -sunDir), 0.0);
              col = mix(col, vec3(0.92, 0.94, 1.0), smoothstep(0.9990, 0.9994, m) * night);
              col += vec3(0.35, 0.4, 0.55) * pow(m, 60.0) * 0.25 * night;
            }

            if (d.y > 0.01) {
              // look up at a flat cloud layer; it drifts slowly on the wind
              vec2 uv = d.xz / (d.y + 0.1) * 1.5 + time * vec2(0.008, 0.004);
              float density = fbm(uv) + fbm(uv * 2.9 + 4.0) * 0.28;
              float amount = smoothstep(cover, cover + 0.34, density);
              // a second sample a step toward the sun: where it is thinner, light gets through
              vec2 toSun = uv + sunDir.xz * 0.16;
              float towardSun = fbm(toSun) + fbm(toSun * 2.9 + 4.0) * 0.28;
              float lit = clamp(0.55 + (density - towardSun) * 2.4, 0.0, 1.0);
              vec3 cloud = mix(cloudShade, cloudLit, lit);
              cloud = mix(cloud, cloudShade * 0.85, smoothstep(cover + 0.34, cover + 0.63, density) * 0.6); // thick middles
              cloud += sunGlow * pow(s, 6.0) * 0.25;
              cloud += vec3(0.8, 0.85, 1.0) * flash; // lit from inside by lightning
              cloud = mix(horizon, cloud, smoothstep(0.01, 0.2, d.y)); // they fade into the haze
              col = mix(col, cloud, amount * 0.95);
            }
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    skyDome.renderOrder = -1;
    scene.add(skyDome);
  }

  // ---------- Time of day and weather ----------

  // A day lasts forty minutes: morning, afternoon, evening and night are about ten each.
  // The sun rises at 6 and sets at 18; its height sets the colour and strength of the
  // light, the colour of the sky, and whether lamps and headlights are on.
  const DAY_SECONDS = 2400;
  const WEATHERS = {
    clear: { cover: 0.56, overcast: 0, rain: 0 },
    cloudy: { cover: 0.36, overcast: 0.5, rain: 0 },
    rain: { cover: 0.2, overcast: 0.85, rain: 0.65 },
    storm: { cover: 0.08, overcast: 1, rain: 1 },
  };
  const env = {
    hour: 8, weather: 'clear', timer: rand(150, 240),
    cover: 0.56, overcast: 0, rain: 0, wet: 0, // eased toward the weather's values
    night: 0, flash: 0, nextFlash: 6,
  };
  const tone = (hex) => new THREE.Color(hex);
  const SKY_TONES = {
    zenithDay: tone(0x2b61b3), zenithDusk: tone(0x2d3f73), zenithNight: tone(0x03050d),
    horizonDay: tone(SKY), horizonDusk: tone(0xf0a368), horizonNight: tone(0x0a0f1c),
    grey: tone(0x8d949c),
    sunHigh: tone(0xfff0da), sunLow: tone(0xff9a4a), moon: tone(0x8fa6dc),
    skyLightDay: tone(0xc9dcf2), skyLightNight: tone(0x3a4c78),
    cloudDay: tone(0xfffaf2), cloudDusk: tone(0xffb98a), cloudShadeDay: tone(0x9aa3b2), black: tone(0x000000),
  };
  const mixTone = (out, a, b, t) => out.copy(a).lerp(b, Math.max(0, Math.min(1, t)));
  const scratchTone = new THREE.Color();
  const wetSurfaces = []; // ground materials that darken and shine when it rains
  let streetLights = null; // { bulb, glass, glow } once the lamps are built
  let rainLines = null;
  let headBeam = null; // the one real light: the player's own headlamps after dark

  function setWeather(name) {
    env.weather = name;
    env.timer = rand(150, 260);
  }

  function updateEnvironment(dt) {
    env.hour = (env.hour + (dt * 24) / DAY_SECONDS) % 24;
    env.timer -= dt;
    if (env.timer <= 0) {
      // mostly fair, sometimes overcast, now and then rain or a storm
      const roll = Math.random();
      setWeather(roll < 0.45 ? 'clear' : roll < 0.7 ? 'cloudy' : roll < 0.9 ? 'rain' : 'storm');
    }
    const goal = WEATHERS[env.weather];
    for (const key of ['cover', 'overcast', 'rain']) env[key] = approach(env[key], goal[key], 0.035 * dt);
    env.wet = approach(env.wet, env.rain > 0.1 ? 1 : 0, (env.rain > 0.1 ? 0.04 : 0.012) * dt);

    // --- where the sun is
    const arc = ((env.hour - 6) / 12) * Math.PI; // 0 at sunrise, pi at sunset
    const height = Math.sin(arc);
    const sunDir = skyDome.material.uniforms.sunDir.value;
    sunDir.set(Math.cos(arc) * 0.85, height, 0.4).normalize();
    const day = smooth((height + 0.1) / 0.3); // 0 in the dark, 1 in daylight
    const low = (1 - smooth(height / 0.45)) * day; // 1 around sunrise and sunset
    env.night = 1 - day;
    // the light in the scene comes from the sun by day and the moon by night
    SUN_DIR.copy(sunDir);
    if (height < 0.02) SUN_DIR.multiplyScalar(-1);
    if (SUN_DIR.y < 0.12) {
      SUN_DIR.y = 0.12; // never quite flat along the ground
      SUN_DIR.normalize();
    }

    // --- lightning
    env.flash = Math.max(0, env.flash - 5 * dt);
    if (env.weather === 'storm' && env.rain > 0.7) {
      env.nextFlash -= dt;
      if (env.nextFlash <= 0) {
        env.flash = 1;
        env.nextFlash = Math.random() < 0.3 ? 0.18 : rand(4, 11); // sometimes a double strike
        playThunder();
      }
    }

    // --- light
    const dim = 1 - 0.6 * env.overcast;
    mixTone(sun.color, SKY_TONES.sunHigh, SKY_TONES.sunLow, low);
    if (height < 0.02) sun.color.copy(SKY_TONES.moon);
    sun.intensity = height < 0.02 ? 0.22 * (1 - 0.7 * env.overcast) : 0.8 * day * dim;
    mixTone(skyLight.color, SKY_TONES.skyLightNight, SKY_TONES.skyLightDay, day);
    skyLight.intensity = (0.27 + 0.33 * day) * (1 - 0.2 * env.overcast) + env.flash * 0.9;

    // --- sky
    const u = skyDome.material.uniforms;
    mixTone(u.zenith.value, SKY_TONES.zenithNight, SKY_TONES.zenithDay, day).lerp(SKY_TONES.zenithDusk, low * 0.6);
    mixTone(u.horizon.value, SKY_TONES.horizonNight, SKY_TONES.horizonDay, day).lerp(SKY_TONES.horizonDusk, low * 0.75);
    // under cloud everything greys out, darker at night
    scratchTone.copy(SKY_TONES.grey).multiplyScalar(0.12 + 0.88 * day);
    u.zenith.value.lerp(scratchTone, env.overcast * 0.85);
    u.horizon.value.lerp(scratchTone, env.overcast * 0.8);
    mixTone(u.sunGlow.value, SKY_TONES.sunHigh, SKY_TONES.sunLow, low).multiplyScalar(day * (1 - 0.8 * env.overcast));
    mixTone(u.cloudLit.value, SKY_TONES.cloudDay, SKY_TONES.cloudDusk, low).multiplyScalar((0.1 + 0.9 * day) * (1 - 0.45 * env.overcast));
    u.cloudShade.value.copy(SKY_TONES.cloudShadeDay).multiplyScalar((0.07 + 0.93 * day) * (1 - 0.55 * env.overcast));
    u.cover.value = env.cover;
    u.night.value = env.night * (1 - env.overcast);
    u.flash.value = env.flash;
    scene.fog.color.copy(u.horizon.value);
    scene.background.copy(u.horizon.value);
    scene.fog.near = 260 - 170 * env.rain; // rain closes the view in
    scene.fog.far = 1300 - 800 * env.rain;

    // --- lamps: street lights and vehicle lights come on as it gets dark
    const lampsOn = smooth((env.night + env.overcast * 0.35 - 0.25) / 0.3);
    headlightMat.color.setRGB(0.72 + 0.28 * lampsOn, 0.7 + 0.27 * lampsOn, 0.62 + 0.23 * lampsOn);
    tailIdle = lampsOn > 0.5 ? 0xc01a1a : 0x7a1010;
    beamMat.opacity = lampsOn * 0.7;
    if (streetLights) {
      streetLights.bulb.color.setRGB(0.55 + 0.45 * lampsOn, 0.52 + 0.4 * lampsOn, 0.45 + 0.2 * lampsOn);
      streetLights.glass.emissive.setRGB(1.0 * lampsOn, 0.8 * lampsOn, 0.42 * lampsOn);
      streetLights.glow.material.opacity = lampsOn * 0.55;
      streetLights.glow.visible = lampsOn > 0.02;
    }
    if (headBeam) {
      const driving = mode === 'car' && player;
      headBeam.intensity = driving ? lampsOn * 1.5 : 0;
      if (driving) {
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        headBeam.position.set(car.x + fx * player.dims.hl, car.y + 0.8, car.z + fz * player.dims.hl);
        headBeam.target.position.set(car.x + fx * 30, car.y, car.z + fz * 30);
      }
    }

    // --- wet ground: darker, glossier, and it picks up the sky
    for (const surface of wetSurfaces) {
      surface.material.color.copy(surface.color).multiplyScalar(1 - 0.38 * env.wet);
      surface.material.shininess = 8 + 90 * env.wet;
      surface.material.specular.setScalar(0.09 + 0.45 * env.wet);
      surface.material.reflectivity = 0.22 * env.wet * (0.15 + 0.85 * day);
    }
    // reflections were photographed by day; fade them as the light goes
    for (const material of reflective) {
      if (material.userData.reflect !== undefined) material.reflectivity = material.userData.reflect * (0.12 + 0.88 * day);
    }

    updateRain(dt);
    updateAudio();
    $('clock').textContent = `${String(Math.floor(env.hour)).padStart(2, '0')}:${String(Math.floor((env.hour % 1) * 60)).padStart(2, '0')}`;
  }

  // --- rain ---

  const RAIN_DROPS = 1800;
  const RAIN_BOX = [56, 34, 56]; // the box of air round the camera that the drops live in
  const rainDrops = new Float32Array(RAIN_DROPS * 4); // x, y, z in the world, and the height of whatever is above that spot

  // The top of whatever stands at (x, z): the ground, a roof, a bridge deck. Rain stops there.
  function coverAt(x, z) {
    let h = terrain(x, z);
    for (const s of surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const sh = s.h0 + ((s.h1 - s.h0) * (x - s.minX)) / (s.maxX - s.minX);
      if (sh > h) h = sh;
    }
    return h;
  }

  function updateRain(dt) {
    if (env.rain < 0.02) {
      if (rainLines) rainLines.visible = false;
      return;
    }
    const eye = camera.position;
    const [bx, by, bz] = RAIN_BOX;
    if (!rainLines) {
      for (let n = 0; n < RAIN_DROPS; n++) {
        rainDrops[n * 4] = eye.x + rand(-0.5, 0.5) * bx;
        rainDrops[n * 4 + 1] = eye.y + rand(-0.5, 0.5) * by;
        rainDrops[n * 4 + 2] = eye.z + rand(-0.5, 0.5) * bz;
        rainDrops[n * 4 + 3] = coverAt(rainDrops[n * 4], rainDrops[n * 4 + 2]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
      rainLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0xb6c6d6, transparent: true, opacity: 0.4, depthWrite: false,
      }));
      rainLines.frustumCulled = false;
      rainLines.renderOrder = 5;
      scene.add(rainLines);
    }
    rainLines.visible = true;
    rainLines.material.opacity = 0.16 + 0.3 * env.rain;
    rainLines.geometry.setDrawRange(0, Math.floor(RAIN_DROPS * Math.min(1, env.rain * 1.2)) * 2);
    const points = rainLines.geometry.attributes.position.array;
    const fall = 26 * dt;
    const slant = 5 * dt; // blown along on the wind
    for (let n = 0; n < RAIN_DROPS; n++) {
      const d = n * 4;
      let x = rainDrops[d] + slant;
      let y = rainDrops[d + 1] - fall;
      let z = rainDrops[d + 2];
      // The drops stay where they are in the world; one that leaves the box round the
      // camera comes back in on the far side. Wherever it lands it is a new place, so
      // look up again what it is falling toward there.
      let moved = false;
      if (y < eye.y - by / 2) {
        y += by;
        x = eye.x + rand(-0.5, 0.5) * bx;
        z = eye.z + rand(-0.5, 0.5) * bz;
        moved = true;
      }
      if (x - eye.x > bx / 2) { x -= bx; moved = true; } else if (x - eye.x < -bx / 2) { x += bx; moved = true; }
      if (z - eye.z > bz / 2) { z -= bz; moved = true; } else if (z - eye.z < -bz / 2) { z += bz; moved = true; }
      if (moved) rainDrops[d + 3] = coverAt(x, z);
      rainDrops[d] = x;
      rainDrops[d + 1] = y;
      rainDrops[d + 2] = z;

      const k = n * 6;
      if (y > rainDrops[d + 3]) {
        // a short streak along the way it falls
        points[k] = x;
        points[k + 1] = y;
        points[k + 2] = z;
        points[k + 3] = x - 0.13;
        points[k + 4] = y + 0.7;
        points[k + 5] = z;
      } else {
        // it has reached a roof, a deck or the ground: nothing falls below that
        points[k + 3] = points[k] = x;
        points[k + 4] = points[k + 1] = y;
        points[k + 5] = points[k + 2] = z;
      }
    }
    rainLines.geometry.attributes.position.needsUpdate = true;
  }

  // --- sound ---

  // Every sound is made here from oscillators and filtered noise: there are no recordings.
  // Engines are a pair of buzzing tones through a filter, pitched by speed; rain, wind and
  // the helicopter are shaped noise; footsteps, shots and crashes are short bursts of it.
  let audio = null;
  // how each kind of vehicle sounds: the pitch it idles at, and how bright and loud it is
  const ENGINE_VOICES = {
    sports: { pitch: 72, bright: 1.5, gain: 1.15 }, sedan: { pitch: 55, bright: 1, gain: 1 },
    hatch: { pitch: 62, bright: 1, gain: 0.9 }, suv: { pitch: 47, bright: 0.85, gain: 1.05 },
    pickup: { pitch: 43, bright: 0.8, gain: 1.1 }, bus: { pitch: 30, bright: 0.55, gain: 1.5 },
    moto: { pitch: 98, bright: 1.9, gain: 1.1 },
  };
  const OTHER_ENGINES = 4; // how many nearby vehicles are heard at once

  // Browsers only allow sound after a click or key press, so this is called from the first one.
  function startAudio() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (audio || !Context) return;
    const context = new Context();
    const master = context.createGain();
    master.gain.value = settings.volume;
    master.connect(context.destination);
    const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    // a loop of noise through a filter, silent until its gain is raised
    const wash = (type, frequency, q) => {
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(master);
      source.start();
      return { filter, gain };
    };
    const engine = () => {
      const saw = context.createOscillator();
      saw.type = 'sawtooth';
      const sub = context.createOscillator();
      sub.type = 'square';
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      const gain = context.createGain();
      gain.gain.value = 0;
      const pan = context.createStereoPanner ? context.createStereoPanner() : null;
      saw.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      if (pan) gain.connect(pan).connect(master);
      else gain.connect(master);
      saw.start();
      sub.start();
      return { saw, sub, filter, gain, pan };
    };

    // the helicopter: blade noise chopped on and off by a slow oscillator, over a turbine whine
    const blades = wash('bandpass', 190, 0.8);
    const chop = context.createOscillator();
    chop.type = 'square';
    chop.frequency.value = 18;
    const chopDepth = context.createGain();
    chopDepth.gain.value = 0;
    chop.connect(chopDepth).connect(blades.gain.gain);
    chop.start();
    const whine = context.createOscillator();
    whine.type = 'sawtooth';
    const whineGain = context.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain).connect(master);
    whine.start();

    audio = {
      context, master, noise,
      rain: wash('bandpass', 2600, 0.4),
      road: wash('lowpass', 420, 0.3), // tyres and wind at speed
      own: engine(),
      others: Array.from({ length: OTHER_ENGINES }, engine),
      heli: { blades, chop, chopDepth, whine, whineGain },
    };
  }

  const glide = (param, value, time = 0.06) => param.setTargetAtTime(value, audio.context.currentTime, time);

  // Sets one engine voice from a vehicle kind, its speed and how hard it is being driven.
  function setEngine(voice, kind, speed, throttle, volume, pan) {
    const tone = ENGINE_VOICES[kind] || ENGINE_VOICES.sedan;
    const top = (KINDS[kind] ? KINDS[kind].stats.top : SPORTS.top);
    // climbing through five gears: the revs rise through each, then drop back for the next
    const gear = Math.min(4, Math.floor((speed / top) * 5));
    const inGear = Math.min(1, (speed / top) * 5 - gear);
    const revs = speed < 0.5 ? 0.12 + 0.2 * throttle : 0.3 + 0.7 * inGear;
    const pitch = tone.pitch * (1 + 1.9 * revs);
    glide(voice.saw.frequency, pitch);
    glide(voice.sub.frequency, pitch / 2);
    glide(voice.filter.frequency, (350 + 1900 * revs + 900 * throttle) * tone.bright);
    glide(voice.gain.gain, volume * tone.gain * (0.045 + 0.05 * revs + 0.06 * throttle));
    if (voice.pan) glide(voice.pan.pan, pan);
  }

  const earRight = new THREE.Vector3();

  function updateAudio() {
    if (!audio) return;
    const driving = mode === 'car' && player;
    const speed = Math.hypot(car.vx, car.vz);
    glide(audio.rain.gain.gain, env.rain * 0.16);
    glide(audio.road.gain.gain, driving ? Math.min(0.2, speed * 0.004) : 0);

    if (driving) {
      const throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
      setEngine(audio.own, player.kind, speed, throttle, 1, 0);
    } else {
      glide(audio.own.gain.gain, 0);
    }

    // the nearest few vehicles round the camera, each louder the closer it is, and placed left or right
    earRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const near = [];
    const hear = (x, z, kind, v) => {
      const d = Math.hypot(x - camera.position.x, z - camera.position.z);
      if (d < 60) near.push({ x, z, kind, v, d });
    };
    for (const c of traffic) hear(c.x, c.z, c.model.kind, Math.abs(c.speed));
    for (const p of police) if (p.active) hear(p.x, p.z, 'sedan', Math.abs(p.speed));
    near.sort((a, b) => a.d - b.d);
    audio.others.forEach((voice, i) => {
      const n = near[i];
      if (!n) {
        glide(voice.gain.gain, 0);
        return;
      }
      const loud = (1 - n.d / 60) ** 2;
      const side = ((n.x - camera.position.x) * earRight.x + (n.z - camera.position.z) * earRight.z) / Math.max(1, n.d);
      setEngine(voice, n.kind, n.v, n.v > 2 ? 0.5 : 0, loud * 0.8, Math.max(-0.9, Math.min(0.9, side)));
    });

    const h = audio.heli;
    const spin = heli ? heli.rotor : 0;
    const away = heli ? Math.hypot(heli.x - camera.position.x, heli.y - camera.position.y, heli.z - camera.position.z) : 0;
    const reach = spin / (1 + away / 30);
    glide(h.chop.frequency, 5 + 15 * spin);
    glide(h.chopDepth.gain, 0.22 * reach);
    glide(h.blades.gain.gain, 0.24 * reach);
    glide(h.whine.frequency, 180 + 420 * spin);
    glide(h.whineGain.gain, 0.018 * reach);
  }

  // A short burst of filtered noise: the building block for steps, shots, bangs and pops.
  function burst(type, frequency, volume, length, delay = 0, q = 0.7) {
    if (!audio) return;
    const { context, noise, master } = audio;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    const at = context.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(gain).connect(master);
    source.start(at, Math.random() * 2);
    source.stop(at + length + 0.05);
  }

  function playThunder() {
    burst('lowpass', 170, 0.9, 2.8, rand(0.3, 1.6)); // the sound arrives after the flash
  }

  // A footfall: a soft thud walking, a sharper slap running, with a splash on wet ground.
  function playStep(running, wet) {
    burst('lowpass', running ? 520 : 330, running ? 0.2 : 0.11, running ? 0.09 : 0.12);
    if (wet) burst('highpass', 2400, 0.05, 0.14);
  }

  function playShot() {
    burst('bandpass', 1500, 0.5, 0.16, 0, 0.5);
    burst('lowpass', 260, 0.5, 0.22);
  }

  function playCrash(strength) {
    burst('lowpass', 700, 0.3 + 0.6 * strength, 0.4);
    burst('bandpass', 2600, 0.25 * strength, 0.25); // glass and trim
  }

  function playPop() {
    burst('bandpass', 900, 0.5, 0.08);
    burst('highpass', 3200, 0.14, 0.7, 0.05); // the air going out
  }

  // --- vehicle lights ---

  // The pool of light a vehicle's headlamps throw on the road: a glowing patch, not a real
  // light, so every vehicle can have one. Each lamp's beam starts narrow at the bumper and
  // fans out as it goes, brightest along its middle and fading with distance.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    map: canvasTexture(128, 256, (g, w, h) => {
      const picture = g.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const d = 1 - y / (h - 1); // 0 at the bumper (the bottom of the picture), 1 at the far end
        const reach = Math.min(1, d / 0.05) * (1 - d) ** 1.5;
        for (let x = 0; x < w; x++) {
          const across = x / (w - 1) - 0.5;
          let light = 0;
          for (const lamp of [-0.055, 0.055]) {
            const spread = 0.03 + d * 0.3;
            const off = (across - lamp) / spread;
            light += Math.exp(-off * off * 1.8);
          }
          const v = Math.round(255 * Math.min(1, light * 0.62) * reach);
          const i = (y * w + x) * 4;
          picture.data[i] = picture.data[i + 1] = picture.data[i + 2] = v;
          picture.data[i + 3] = 255;
        }
      }
      g.putImageData(picture, 0, 0);
    }),
  });
  const beamGeo = new THREE.PlaneGeometry(13, 24).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0, 12);

  function addBeam(model) {
    if (model.beam) return;
    model.beam = new THREE.Mesh(beamGeo, beamMat);
    model.beam.position.set(0, 0.14, model.dims.hl - 0.3);
    model.beam.renderOrder = 0.9;
    model.group.add(model.beam);
  }

  // ---------- Hills ----------

  // Rounded hills north of the city (+z), each flat on top: { x, z, r: radius, h: height }.
  const HILLS = [
    { x: 0, z: 600, r: 230, h: 75 }, // the main hill, with the road and the lookout
    { x: -300, z: 560, r: 170, h: 45 },
    { x: 310, z: 620, r: 190, h: 55 },
  ];
  const HILL_BOUNDS = { minX: -500, maxX: 520, minZ: 280, maxZ: 860 };
  const WORLD_LIMITS = { minX: -HALF - 240, maxX: HALF + 250, minZ: -HALF - 120, maxZ: 870 };
  const ROAD_FLAT = 8; // the ground is levelled this far either side of the road's centre line
  const ROAD_BLEND = 24; // and has returned to the natural slope by here
  const ROAD_HALF = 5.5; // half the width of the tarmac itself
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  // The hills with no road cut into them.
  function naturalHeight(x, z) {
    let h = 0;
    for (const hill of HILLS) {
      const d = Math.hypot(x - hill.x, z - hill.z);
      if (d >= hill.r) continue;
      const u = Math.min(1, (1 - d / hill.r) / 0.82); // 1 across the flat summit
      const lumps = Math.sin(x * 0.031) * Math.cos(z * 0.027) * 5 + Math.sin(x * 0.071 + 1) * Math.sin(z * 0.063) * 2.5;
      h += hill.h * smooth(u) + lumps * 4 * u * (1 - u);
    }
    return Math.max(0, h);
  }

  // The road leaves the city's north edge and spirals up the main hill to its summit.
  // Stored as points about 5 m apart, each with the height the road has there.
  const hillRoad = (() => {
    const main = HILLS[0];
    const ctrl = [[38, 262], [38, 300], [38, 340], [42, 372]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const start = -1.393; // angle at which the spiral meets the approach road
    const sweep = 3.3 * Math.PI;
    for (let a = 0.12; a <= sweep; a += 0.22) {
      const r = 215 - 185 * (a / sweep);
      ctrl.push(new THREE.Vector3(main.x + r * Math.cos(start + a), 0, main.z + r * Math.sin(start + a)));
    }
    ctrl.push(new THREE.Vector3(main.x + 14 * Math.cos(start + sweep + 0.5), 0, main.z + 14 * Math.sin(start + sweep + 0.5)));
    const curve = new THREE.CatmullRomCurve3(ctrl);
    const points = curve.getSpacedPoints(Math.round(curve.getLength() / 5))
      .map((p) => ({ x: p.x, z: p.z, h: naturalHeight(p.x, p.z) }));
    // The raw hillside is far too steep in places to drive along, so average the road's
    // height over a long stretch: it becomes a steady climb, cut into the slope or built
    // up on an embankment where the ground does not match.
    const last = points.length - 1;
    for (let pass = 0; pass < 4; pass++) {
      const heights = points.map((p) => p.h);
      for (let i = 1; i < last; i++) {
        let sum = 0;
        for (let k = -10; k <= 10; k++) sum += heights[Math.max(0, Math.min(last, i + k))];
        points[i].h = sum / 21;
      }
    }
    return points;
  })();

  // Nearest point on the hill road: sets roadDist and the road's height there.
  let roadDist = Infinity;
  let roadHeight = 0;
  function nearestRoad(x, z) {
    let best = Infinity;
    for (let i = 0; i < hillRoad.length - 1; i++) {
      const a = hillRoad[i];
      const b = hillRoad[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const ex = a.x + dx * t - x;
      const ez = a.z + dz * t - z;
      const d = ex * ex + ez * ez;
      if (d < best) {
        best = d;
        roadHeight = a.h + (b.h - a.h) * t;
      }
    }
    roadDist = Math.sqrt(best);
  }

  // Height of the bare ground at (x, z): flat in and around the city, hills to the north,
  // with a level shelf cut across the slope wherever the road runs.
  function terrain(x, z) {
    const b = HILL_BOUNDS;
    if (z < b.minZ || z > b.maxZ || x < b.minX || x > b.maxX) return 0;
    const natural = naturalHeight(x, z);
    nearestRoad(x, z);
    if (roadDist >= ROAD_BLEND) return natural;
    return roadHeight + (natural - roadHeight) * smooth((roadDist - ROAD_FLAT) / (ROAD_BLEND - ROAD_FLAT));
  }

  function clampToWorld() {
    const w = WORLD_LIMITS;
    if (car.x < w.minX || car.x > w.maxX) {
      car.x = Math.max(w.minX, Math.min(w.maxX, car.x));
      car.vx = 0;
    }
    if (car.z < w.minZ || car.z > w.maxZ) {
      car.z = Math.max(w.minZ, Math.min(w.maxZ, car.z));
      car.vz = 0;
    }
  }

  function buildHills() {
    const b = HILL_BOUNDS;
    const width = b.maxX - b.minX;
    const depth = b.maxZ - b.minZ;

    // --- ground: a 4 m grid draped over the terrain, tinted by height, steepness and the road verge
    const geo = new THREE.PlaneGeometry(width, depth, Math.round(width / 4), Math.round(depth / 4));
    geo.rotateX(-Math.PI / 2);
    geo.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const tint = new THREE.Color();
    const grass = new THREE.Color(0x7fb86e);
    const upland = new THREE.Color(0x5c8f52);
    const rock = new THREE.Color(0x8a857c);
    const dirt = new THREE.Color(0x8c7a5c);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrain(x, z);
      const nearRoad = roadDist; // terrain() has just measured it for this point
      // sink the mesh a little under the tarmac so the road surface always covers it
      pos.setY(i, h - 0.16 * (1 - smooth((nearRoad - ROAD_FLAT) / 2)));
      const steep = Math.hypot(
        naturalHeight(x + 2, z) - naturalHeight(x - 2, z),
        naturalHeight(x, z + 2) - naturalHeight(x, z - 2)
      ) / 4;
      tint.copy(grass).lerp(upland, Math.min(1, h / 45));
      tint.lerp(rock, smooth((steep - 0.55) / 0.3));
      if (nearRoad < ROAD_BLEND && z > 300) tint.lerp(dirt, 1 - smooth((nearRoad - ROAD_HALF) / 6));
      colors.set([tint.r, tint.g, tint.b], i * 3);
      uv.setXY(i, x / GRASS_TILE, z / GRASS_TILE);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTex }));
    ground.receiveShadow = true;
    scene.add(ground);

    // --- road: strips that follow the path, each a band between two offsets from the centre line
    const strip = (from, to, lift, material, dashed = false) => {
      const points = [];
      const index = [];
      const uvs = [];
      let travelled = 0;
      hillRoad.forEach((p, i) => {
        if (i) travelled += Math.hypot(p.x - hillRoad[i - 1].x, p.z - hillRoad[i - 1].z);
        for (const side of [from, to]) uvs.push(side / GROUND.tarmac[2], travelled / GROUND.tarmac[2]);
        const a = hillRoad[Math.max(0, i - 1)];
        const c = hillRoad[Math.min(hillRoad.length - 1, i + 1)];
        const len = Math.hypot(c.x - a.x, c.z - a.z);
        const nx = -(c.z - a.z) / len; // sideways, level across the road
        const nz = (c.x - a.x) / len;
        for (const side of [from, to]) points.push(p.x + nx * side, p.h + lift, p.z + nz * side);
        if (i < hillRoad.length - 1 && !(dashed && i % 4 > 1)) {
          index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(points.map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(index);
      const mesh = new THREE.Mesh(g, material);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    const tarmac = photos.asphalt
      ? groundMaterial(GROUND.tarmac[0], GROUND.tarmac[1], GROUND.tarmac[3], { side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ color: 0x4b5058, side: THREE.DoubleSide });
    const line = new THREE.MeshLambertMaterial({ color: 0xe9e9e4, side: THREE.DoubleSide });
    strip(-ROAD_HALF, ROAD_HALF, 0.06, tarmac);
    strip(-0.14, 0.14, 0.1, line, true);
    strip(ROAD_HALF - 0.55, ROAD_HALF - 0.35, 0.1, line);
    strip(-ROAD_HALF + 0.35, -ROAD_HALF + 0.55, 0.1, line);

    // --- pines and boulders scattered over the slopes, clear of the road and the summit
    const main = HILLS[0];
    const onSlope = (minHeight) => {
      for (let tries = 0; tries < 40; tries++) {
        const x = rand(b.minX, b.maxX);
        const z = rand(b.minZ, b.maxZ);
        if (naturalHeight(x, z) < minHeight || Math.hypot(x - main.x, z - main.z) < 46) continue;
        const y = terrain(x, z);
        if (roadDist > 11) return { x, y, z };
      }
      return null;
    };
    const dummy = new THREE.Object3D();
    const scatter = (parts, spots, place) => {
      const meshes = parts.map(([geo2, mat]) => {
        const mesh = new THREE.InstancedMesh(geo2, mat, spots.length);
        mesh.castShadow = true;
        scene.add(mesh);
        return mesh;
      });
      spots.forEach((spot, i) => place(spot).forEach(([y, sx, sy], part) => {
        dummy.position.set(spot.x, spot.y + y, spot.z);
        dummy.scale.set(sx, sy, sx);
        dummy.rotation.y = spot.turn;
        dummy.updateMatrix();
        meshes[part].setMatrixAt(i, dummy.matrix);
      }));
    };
    const spots = (count, minHeight) => Array.from({ length: count }, () => onSlope(minHeight))
      .filter(Boolean)
      .map((spot) => ({ ...spot, s: rand(0.8, 1.5), turn: Math.random() * 6 }));

    const pines = spots(320, 3);
    for (const t of pines) plants.push({ type: 'pine', x: t.x, y: t.y, z: t.z, s: t.s });
    for (const t of pines) {
      colliders.push({ minX: t.x - 0.45, maxX: t.x + 0.45, minZ: t.z - 0.45, maxZ: t.z + 0.45, minY: t.y - 1, maxY: t.y + 8 });
    }
    const stone = new THREE.MeshPhongMaterial({ color: 0x8d8a84, flatShading: true, shininess: 0 });
    scatter([[new THREE.IcosahedronGeometry(1, 0), stone]], spots(110, 6), ({ s }) => [[0.2 * s, 1.3 * s, 0.9 * s]]);

    // --- summit lookout: a gravel pad, a shelter and a flag
    const top = terrain(main.x, main.z);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(22, 40), new THREE.MeshLambertMaterial({ color: 0xa39a8a, map: grainTex }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(main.x, top + 0.05, main.z);
    pad.receiveShadow = true;
    scene.add(pad);
    const wood = lambert(0x7a5230);
    const piece = (geo2, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo2, mat);
      mesh.position.set(main.x + x, top + y, main.z + z);
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    };
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      piece(new THREE.CylinderGeometry(0.14, 0.14, 3, 8), wood, x, 1.5, z);
      colliders.push({ minX: main.x + x - 0.2, maxX: main.x + x + 0.2, minZ: main.z + z - 0.2, maxZ: main.z + z + 0.2, minY: top, maxY: top + 3 });
    }
    piece(new THREE.ConeGeometry(5.4, 2.2, 4), lambert(0x8a2f2a), 0, 4.1, 0).rotation.y = Math.PI / 4;
    piece(new THREE.BoxGeometry(4, 0.12, 0.7), wood, 0, 0.55, 1.6);
    piece(new THREE.BoxGeometry(4, 0.12, 0.7), wood, 0, 0.55, -1.6);
    piece(new THREE.CylinderGeometry(0.06, 0.06, 9, 6), lambert(0xd0d3d8), 9, 4.5, 4);
    piece(new THREE.BoxGeometry(1.8, 1.1, 0.05), lambert(0xe63946), 9.95, 8.3, 4);
  }

  // ---------- Raised structures ----------

  // Drivable surfaces above the ground: { minX, maxX, minZ, maxZ, h0, h1 }, sloping along x
  // from h0 at minX to h1 at maxX (flat when equal).
  const surfaces = [];
  const concrete = new THREE.MeshLambertMaterial({ color: 0x8d929b });
  const deckMat = photos.asphalt
    ? groundMaterial(GROUND.tarmac[0], GROUND.tarmac[1], GROUND.tarmac[3])
    : new THREE.MeshLambertMaterial({ color: 0x565b64 });
  const DECK_TILE = GROUND.tarmac[2];
  const kickerMat = new THREE.MeshLambertMaterial({ color: 0xf2b705 });

  // Height of whatever is under (x, z) for something currently at height y. Surfaces well
  // above y are overhead, not underfoot, which is what lets you drive beneath a deck.
  function groundAt(x, z, y) {
    let h = terrain(x, z);
    for (const s of surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const sh = s.h0 + ((s.h1 - s.h0) * (x - s.minX)) / (s.maxX - s.minX);
      if (sh <= y + STEP_UP && sh > h) h = sh;
    }
    // solid things with a flat top (walls, parked cars) can be stood on too
    for (const b of colliders) {
      if (b.top === undefined || b.top <= h || b.top > y + STEP_UP) continue;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) h = b.top;
    }
    return h;
  }

  function slab(x0, x1, y0, y1, z0, z1, mat = concrete) {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    if (mat.map) tileBoxFaces(geo, x1 - x0, y1 - y0, z1 - z0, DECK_TILE);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function addDeck(x0, x1, z0, z1, y, mat = deckMat) {
    slab(x0, x1, y - 0.4, y, z0, z1, mat);
    surfaces.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h0: y, h1: y });
  }

  function addRamp(x0, x1, z0, z1, hA, hB, mat = deckMat) {
    const length = Math.hypot(x1 - x0, hB - hA);
    const geo = new THREE.BoxGeometry(length, 0.4, z1 - z0);
    if (mat.map) tileBoxFaces(geo, length, 0.4, z1 - z0, DECK_TILE);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x0 + x1) / 2, (hA + hB) / 2 - 0.2, (z0 + z1) / 2);
    mesh.rotation.z = Math.atan2(hB - hA, x1 - x0);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    surfaces.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h0: hA, h1: hB });
  }

  // A wall that only blocks things standing between y0 and y1.
  function addWall(x0, x1, z0, z1, y0, y1, visible = true) {
    if (visible) slab(x0, x1, y0, y1, z0, z1);
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: y0, maxY: y1 + 0.6, top: y1 });
  }

  // Stops ground-level things from driving into the underside of a ramp. It must only
  // cover the tall half: near the foot, a car climbing the ramp is still low enough to hit it.
  function addBlocker(x0, x1, z0, z1) {
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxY: 0.45 });
  }

  function addFlyover() {
    const z = roadCenter(FLYOVER_ROW);
    const half = ROAD_WIDTH / 2 - 1;
    const H = FLYOVER_HEIGHT;
    const x0 = roadCenter(FLYOVER_FROM) + JUNCTION;
    const x1 = roadCenter(FLYOVER_FROM + 1) - JUNCTION;
    const x2 = roadCenter(FLYOVER_TO - 1) + JUNCTION;
    const x3 = roadCenter(FLYOVER_TO) - JUNCTION;

    // solid wedge ramps at both ends
    const wedge = (x, points) => {
      const shape = new THREE.Shape();
      shape.moveTo(points[0][0], points[0][1]);
      shape.lineTo(points[1][0], points[1][1]);
      shape.lineTo(points[2][0], points[2][1]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: half * 2, bevelEnabled: false });
      const uv = geo.attributes.uv; // generated in metres; make the texture repeat at its own size
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / DECK_TILE, uv.getY(i) / DECK_TILE);
      const mesh = new THREE.Mesh(geo, deckMat);
      mesh.position.set(x, 0, z - half);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    };
    wedge(x0, [[0, 0], [x1 - x0, 0], [x1 - x0, H]]);
    wedge(x2, [[0, 0], [x3 - x2, 0], [0, H]]);
    surfaces.push({ minX: x0, maxX: x1, minZ: z - half, maxZ: z + half, h0: 0, h1: H });
    surfaces.push({ minX: x2, maxX: x3, minZ: z - half, maxZ: z + half, h0: H, h1: 0 });
    addBlocker((x0 + x1) / 2, x1, z - half, z + half);
    addBlocker(x2, (x2 + x3) / 2, z - half, z + half);

    addDeck(x1, x2, z - half, z + half, H);
    for (let x = x1 + 2; x < x2; x += 8) marks.push({ x, z, sx: 3, sz: 0.25, y: H });

    // guard rails: full height beside the ramps, deck height only over the cross streets
    for (const side of [-1, 1]) {
      const zr = z + side * (half - 0.15);
      slab(x1, x2, H, H + 0.8, zr - 0.15, zr + 0.15);
      colliders.push({ minX: x1, maxX: x2, minZ: zr - 0.15, maxZ: zr + 0.15, minY: H - 0.5, maxY: H + 2 });
      colliders.push({ minX: x0, maxX: x1, minZ: zr - 0.15, maxZ: zr + 0.15, maxY: H + 2 });
      colliders.push({ minX: x2, maxX: x3, minZ: zr - 0.15, maxZ: zr + 0.15, maxY: H + 2 });
      for (const [a, b, rise] of [[x0, x1, 1], [x2, x3, -1]]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(b - a, H), 0.8, 0.3), concrete);
        rail.position.set((a + b) / 2, H / 2 + 0.4, zr);
        rail.rotation.z = Math.atan2(H * rise, b - a);
        scene.add(rail);
      }
    }

    // pillars stand mid-block so the cross streets underneath stay clear
    for (let i = FLYOVER_FROM + 1; i < FLYOVER_TO - 1; i++) {
      const x = (roadCenter(i) + roadCenter(i + 1)) / 2;
      addWall(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 0, H - 0.6);
    }
  }

  // Four floors joined by ramps on the north and south sides; the roof is open on the
  // west edge, with a kicker ramp for jumping off.
  function addParkade(cx, cz) {
    cityBlocks.push({ x: cx, z: cz, y: 0.06 });
    flatPlane(BLOCK_SIZE, BLOCK_SIZE, GROUND.tarmac[0], cx, cz, 0.06, ...GROUND.tarmac.slice(1));
    const H = 26; // half-width of the building
    const S = 16; // the ramp strips are the outer z bands beyond this
    const R = 13; // ramps span x from -R to R
    const L = LEVEL_HEIGHT;
    const T = 0.15; // half wall thickness

    const deck = (x0, x1, z0, z1, y) => addDeck(cx + x0, cx + x1, cz + z0, cz + z1, y);
    const ramp = (z0, z1, hA, hB) => addRamp(cx - R, cx + R, cz + z0, cz + z1, hA, hB);
    const wall = (x0, x1, z0, z1, y0, y1) => addWall(cx + x0, cx + x1, cz + z0, cz + z1, y0, y1);
    // a kerb across a ramp strip where the floor ends in a drop
    const kerb = (x, z0, z1, y) => wall(x - T, x + T, z0, z1, y, y + 1);

    for (let level = 1; level <= 3; level++) {
      const y = level * L;
      deck(-H, H, -S, S, y);
      for (const [z0, z1] of [[-H, -S], [S, H]]) {
        deck(-H, -R, z0, z1, y);
        deck(R, H, z0, z1, y);
      }
      // edge walls; the roof is left open on the west side
      wall(-H, H, -H - T, -H + T, y, y + 1);
      wall(-H, H, H - T, H + T, y, y + 1);
      wall(H - T, H + T, -H, H, y, y + 1);
      if (level < 3) wall(-H - T, -H + T, -H, H, y, y + 1);
    }
    deck(-R, R, S, H, 3 * L); // the roof covers the north ramp

    ramp(-H, -S, 0, L); // ground -> 1, driving east on the south side
    ramp(S, H, 2 * L, L); // 1 -> 2, driving west on the north side
    ramp(-H, -S, 2 * L, 3 * L); // 2 -> roof, driving east on the south side
    addBlocker(cx, cx + R, cz - H, cz - S);

    // walls beside the ramps
    wall(-R, R, -S - T, -S + T, 0, 3 * L + 1);
    wall(-R, R, -H - T, -H + T, 0, 3 * L + 1);
    wall(-R, R, S - T, S + T, L, 2 * L + 1);
    wall(-R, R, H - T, H + T, L, 2 * L + 1);
    kerb(-R, -H, -S, L);
    kerb(-R, -H, -S, 3 * L);
    kerb(R, -H, -S, 2 * L);
    kerb(-R, S, H, L);
    kerb(R, S, H, 2 * L);

    for (const x of [-H, -R, R, H]) {
      for (const z of [-H, H]) wall(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0, 3 * L - 0.6);
    }
    for (const z of [-S, S]) wall(H - 0.4, H + 0.4, z - 0.4, z + 0.4, 0, 3 * L - 0.6);

    // roof kicker pointing west, toward the open parking lot
    addRamp(cx - H, cx - H + 8, cz - 5, cz + 5, 3 * L + 2, 3 * L, kickerMat);

    // painted bays along both sides of every floor
    for (let level = 0; level <= 3; level++) {
      for (let x = -21; x <= 21; x += BAY_W) {
        for (const z of [-S + 3.2, S - 3.2]) {
          marks.push({ x: cx + x, z: cz + z, sx: 0.15, sz: BAY_L, y: level * L });
        }
      }
    }
  }

  function buildCity() {
    // The grass and the road surface are huge and only centimetres apart, which is too
    // close for the depth buffer far from the camera. They are the lowest things in the
    // scene, so draw them first, in order, without writing depth.
    [
      flatPlane(2400, 2400, 0x7fb86e, 0, 0, 0, grassTex, GRASS_TILE),
      flatPlane(WORLD, WORLD, GROUND.road[0], 0, 0, 0.03, ...GROUND.road.slice(1)),
    ].forEach((ground, i) => {
      ground.material.depthWrite = false;
      ground.renderOrder = -0.6 + i * 0.1;
    });

    for (let bx = 0; bx < BLOCKS; bx++) {
      for (let bz = 0; bz < BLOCKS; bz++) {
        const isLot = PARKING_LOTS.some(([x, z]) => x === bx && z === bz);
        const isParkade = bx === PARKADE[0] && bz === PARKADE[1];
        if (isLot) addParkingLot(blockCenter(bx), blockCenter(bz));
        else if (isParkade) addParkade(blockCenter(bx), blockCenter(bz));
        else addCityBlock(blockCenter(bx), blockCenter(bz));
      }
    }

    // Lines along every road between crossings: a double yellow down the middle, white
    // edge lines by the kerbs, and dashes dividing the two lanes each side.
    const YELLOW = 0xe0b020;
    const clear = JUNCTION + 5.4; // the lines stop short of the pedestrian crossings
    for (let i = 0; i <= BLOCKS; i++) {
      const c = roadCenter(i);
      for (let k = 0; k < BLOCKS; k++) {
        const from = roadCenter(k) + clear;
        const to = roadCenter(k + 1) - clear;
        const mid = (from + to) / 2;
        const line = (offset, width, color) => {
          marks.push({ x: c + offset, z: mid, sx: width, sz: to - from, color }); // on the north-south road
          marks.push({ x: mid, z: c + offset, sx: to - from, sz: width, color }); // on the east-west road
        };
        line(-0.2, 0.14, YELLOW);
        line(0.2, 0.14, YELLOW);
        line(-ROAD_WIDTH / 2 + 0.55, 0.15);
        line(ROAD_WIDTH / 2 - 0.55, 0.15);
        for (let t = from + 1.5; t + 3 < to; t += 9) {
          for (const offset of [-ROAD_WIDTH / 4, ROAD_WIDTH / 4]) {
            marks.push({ x: c + offset, z: t + 1.5, sx: 0.14, sz: 3 });
            marks.push({ x: t + 1.5, z: c + offset, sx: 3, sz: 0.14 });
          }
        }
      }
    }

    addFlyover();

    // a zebra crossing, a stop line behind it, and a signal for every road that enters an intersection
    for (let i = 0; i <= BLOCKS; i++) {
      for (let j = 0; j <= BLOCKS; j++) {
        DIRS.forEach(([dx, dz], d) => {
          if (!inGrid(i - dx, j - dz)) return;
          const [rx, rz] = rightOf([dx, dz]);
          const at = (back, across) => ({
            x: roadCenter(i) - dx * (JUNCTION + back) + rx * across,
            z: roadCenter(j) - dz * (JUNCTION + back) + rz * across,
          });
          for (let across = -ROAD_WIDTH / 2 + 0.75; across < ROAD_WIDTH / 2; across += 1) {
            marks.push({ ...at(2.3, across), sx: dx ? 3 : 0.5, sz: dx ? 0.5 : 3 });
          }
          marks.push({ ...at(4.6, ROAD_WIDTH / 4), sx: dx ? 0.45 : ROAD_WIDTH / 2 - 1, sz: dx ? ROAD_WIDTH / 2 - 1 : 0.45 });
          signals.push({ i, j, d });
        });
      }
    }

    // all paint in one instanced mesh
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    // road paint is lit like the road (so it darkens in shade) and a little scuffed
    const scuffed = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, 0.12);
    });
    const paint = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: scuffed }), marks.length);
    const m = new THREE.Matrix4();
    const tint = new THREE.Color();
    marks.forEach((mark, i) => {
      m.makeScale(mark.sx, 1, mark.sz);
      m.setPosition(mark.x, (mark.y || 0) + 0.1, mark.z);
      paint.setMatrixAt(i, m);
      paint.setColorAt(i, tint.setHex(mark.color || 0xe9e9e4));
    });
    paint.receiveShadow = true;
    scene.add(paint);
  }

  // ---------- Road details ----------

  // A random spot on a stretch of road between two crossings, `lateral` metres either side
  // of the centre line. `turn` lines a decal up with the road.
  function roadSpot(minLateral, maxLateral) {
    for (;;) {
      const i = Math.floor(Math.random() * (BLOCKS + 1));
      const k = Math.floor(Math.random() * BLOCKS);
      const alongZ = Math.random() < 0.5;
      // nothing under the flyover: its ramps sit on that road
      if (!alongZ && i === FLYOVER_ROW && k >= FLYOVER_FROM && k < FLYOVER_TO) continue;
      const t = rand(roadCenter(k) + JUNCTION + 7, roadCenter(k + 1) - JUNCTION - 7);
      const side = (Math.random() < 0.5 ? -1 : 1) * rand(minLateral, maxLateral);
      const c = roadCenter(i);
      return alongZ ? { x: c + side, z: t, turn: 0 } : { x: t, z: c + side, turn: Math.PI / 2 };
    }
  }

  // Lays `count` flat decals on the roads in one instanced mesh. `size` gives each one its
  // width across the road and length along it.
  function roadDecals(material, count, y, lateral, size, order) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, material, count);
    const dummy = new THREE.Object3D();
    const placed = [];
    for (let n = 0; n < count; n++) {
      const spot = roadSpot(lateral[0], lateral[1]);
      const [across, along, spin] = size();
      placed.push({ x: spot.x, z: spot.z, turn: spot.turn + (spin || 0), across, along });
      dummy.position.set(spot.x, y, spot.z);
      dummy.rotation.y = spot.turn + (spin || 0);
      dummy.scale.set(across, 1, along);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
    }
    mesh.renderOrder = order; // drawn after the road, lowest first, since none of them write depth
    mesh.receiveShadow = true;
    scene.add(mesh);
    return placed;
  }

  let puddles = [];
  let potholes = [];

  // The decal from `list` that (x, z) lies on, treating each as an ellipse `fill` of its size.
  function insideDecal(list, x, z, fill) {
    for (const d of list) {
      const ex = x - d.x;
      const ez = z - d.z;
      if (Math.abs(ex) > 3 || Math.abs(ez) > 3) continue;
      const c = Math.cos(d.turn);
      const s = Math.sin(d.turn);
      const across = (ex * c - ez * s) / (d.across * 0.5 * fill);
      const along = (ex * s + ez * c) / (d.along * 0.5 * fill);
      if (across * across + along * along < 1) return d;
    }
    return null;
  }

  // --- wet footprints ---

  const WET_STEPS = 10; // prints left after walking through a puddle, each fainter than the last
  const footprints = [];
  let nextFootprint = 0;

  function stampFootprint(strength) {
    if (!footprints.length) {
      const sole = canvasTexture(32, 64, (g) => {
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(16, 22, 11, 20, 0, 0, Math.PI * 2); // ball of the foot and toe
        g.fill();
        g.beginPath();
        g.ellipse(16, 53, 8, 9, 0, 0, Math.PI * 2); // heel
        g.fill();
      });
      const geo = new THREE.PlaneGeometry(0.13, 0.3);
      geo.rotateX(-Math.PI / 2); // flat on the ground, toe toward +z
      geo.rotateY(Math.PI);
      for (let n = 0; n < 90; n++) {
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0x0f1317, alphaMap: sole, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        }));
        mesh.renderOrder = 0.7;
        mesh.visible = false;
        scene.add(mesh);
        footprints.push({ mesh, life: 0, strength: 0 });
      }
    }
    const print = footprints[nextFootprint++ % footprints.length];
    const side = hero.foot * 0.11; // left foot is +, toward the hero's left
    print.mesh.position.set(car.x + Math.cos(hero.facing) * side, car.y + 0.105, car.z - Math.sin(hero.facing) * side);
    print.mesh.rotation.y = hero.facing;
    print.mesh.scale.x = hero.foot;
    print.mesh.visible = true;
    print.strength = 0.8 * strength;
    print.life = 14;
  }

  // Called with the distance the hero has just walked on the ground.
  function trackFootsteps(walked) {
    if (walked <= 0) return;
    const wading = car.y < 0.5 && insideDecal(puddles, car.x, car.z, 0.8);
    // out in the rain the ground itself is wet, and stays so until it has dried off;
    // under a roof or a bridge it is dry, and wet shoes mark it for a few steps
    const soaked = coverAt(car.x, car.z) < car.y + 1.5 ? env.wet : 0;
    if (wading || soaked > 0.3) hero.wet = WET_STEPS;
    hero.strideLeft -= walked;
    if (hero.strideLeft > 0) return;
    hero.strideLeft = 0.7 + 0.35 * hero.run;
    hero.foot = -hero.foot;
    playStep(hero.run > 0.5, wading || soaked > 0.1);
    if (soaked > 0.08) {
      stampFootprint(0.35 + 0.45 * soaked);
    } else if (hero.wet > 0 && !wading) {
      stampFootprint(hero.wet / WET_STEPS);
      hero.wet--;
    }
  }

  // Prints dry out over their last few seconds.
  function dryFootprints(dt) {
    for (const print of footprints) {
      if (print.life <= 0) continue;
      print.life -= dt * (env.wet > 0.08 ? 0.3 : 1); // on wet ground they stay until it dries
      print.mesh.material.opacity = print.strength * Math.min(1, print.life / 6);
      if (print.life <= 0) print.mesh.visible = false;
    }
  }

  // --- pothole bumps ---

  let bump = 0; // how hard the camera is still shaking from the last pothole, 0 to 1

  // Jolts the car when a wheel drops into a pothole: a hop, a kick to the nose or tail, a
  // little speed lost. The front and rear wheels each set it off as they reach the hole.
  function hitPotholes(fx, fz, speed) {
    let found = null;
    let frontWheel = false;
    const { hw, wb } = player.dims;
    for (const end of [wb / 2, -wb / 2]) {
      for (const side of [hw - 0.14, 0.14 - hw]) {
        const hole = insideDecal(potholes, car.x + fx * end + fz * side, car.z + fz * end - fx * side, 0.85);
        if (hole && !found) {
          found = hole;
          frontWheel = end > 0;
        }
      }
    }
    if (found && found !== car.inHole && speed > 2) {
      const jolt = Math.min(1, speed / 25);
      car.vy = 1.3 + 1.6 * jolt;
      car.y += 0.03;
      car.pitch += (frontWheel ? -1 : 1) * (0.04 + 0.05 * jolt);
      car.vx *= 0.94;
      car.vz *= 0.94;
      bump = 0.5 + 0.5 * jolt;
    }
    car.inHole = found;
  }

  function addRoadDetails() {
    const jagged = (g, cx, cy, radius, points, wobble) => {
      g.beginPath();
      for (let n = 0; n <= points; n++) {
        const a = (n / points) * Math.PI * 2;
        const r = radius * (1 - wobble + Math.random() * wobble * 2);
        g[n ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
    };
    const decal = (map, extra = {}) =>
      new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, ...extra });

    // --- repaired patches: rectangles of newer, darker tarmac
    roadDecals(
      groundMaterial(0xc4c6ca, GROUND.tarmac[1], GROUND.tarmac[3], { depthWrite: false }),
      45, 0.045, [1, 6], () => [rand(1.6, 3.4), rand(2.5, 7)], 0.1
    );

    // --- cracks: thin wandering lines
    const crack = canvasTexture(64, 256, (g, w, h) => {
      g.strokeStyle = 'rgba(18,18,20,0.85)';
      g.lineCap = 'round';
      const wander = (x, y, width, steps) => {
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
        for (let n = 0; n < steps; n++) {
          x += rand(-9, 9);
          y += rand(8, 20);
          g.lineTo(x, y);
          if (width > 1.5 && Math.random() < 0.25) {
            g.stroke();
            wander(x, y, 1.2, 4); // a side branch
            g.lineWidth = width;
            g.beginPath();
            g.moveTo(x, y);
          }
        }
        g.stroke();
      };
      wander(w / 2, 4, 2.4, 16);
    });
    roadDecals(decal(crack), 70, 0.05, [0.8, 7], () => [rand(0.8, 1.4), rand(3, 7), rand(-0.5, 0.5)], 0.2);

    // --- potholes: a broken-edged hole with rubble in it
    const pothole = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = 'rgba(70,72,76,0.75)';
      jagged(g, w / 2, h / 2, 56, 14, 0.14); // the crumbling rim
      g.fill();
      g.fillStyle = '#17181a';
      jagged(g, w / 2, h / 2, 44, 14, 0.2);
      g.fill();
      g.fillStyle = '#0d0e0f';
      jagged(g, w / 2 + 4, h / 2 + 3, 28, 10, 0.25);
      g.fill();
      for (let n = 0; n < 40; n++) {
        g.fillStyle = Math.random() < 0.5 ? '#3a3c40' : '#26272a';
        g.fillRect(w / 2 + rand(-34, 34), h / 2 + rand(-34, 34), rand(2, 5), rand(2, 5));
      }
    });
    potholes = roadDecals(decal(pothole), 40, 0.055, [1, 6.6], () => {
      const s = rand(0.8, 1.7);
      return [s, s * rand(0.8, 1.4), rand(0, 3)];
    }, 0.3);

    // --- puddles: dark, glossy and reflective, mostly toward the kerbs where water collects
    const pool = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 9; n++) {
        const x = w / 2 + rand(-26, 26);
        const y = h / 2 + rand(-26, 26);
        const r = rand(16, 34);
        const fade = g.createRadialGradient(x, y, r * 0.55, x, y, r);
        fade.addColorStop(0, '#fff');
        fade.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = fade;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    });
    const water = reflect(new THREE.MeshPhongMaterial({
      color: 0x1c2126, alphaMap: pool, transparent: true, opacity: 0.88, depthWrite: false,
      shininess: 160, specular: 0xffffff,
    }), 0.6); // dark water with the sky and buildings showing in it
    puddles = roadDecals(water, 70, 0.06, [3.5, 7.2], () => [rand(1.4, 3), rand(2, 5.5), rand(-0.3, 0.3)], 0.4);

    // --- manhole covers
    const cover = canvasTexture(128, 128, (g, w, h) => {
      const c = w / 2;
      g.fillStyle = '#4a4c50';
      g.beginPath();
      g.arc(c, c, 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2c2f';
      g.beginPath();
      g.arc(c, c, 54, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#3d3f43';
      g.lineWidth = 4;
      for (const r of [44, 30, 16]) {
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.stroke();
      }
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * 16, c + Math.sin(a) * 16);
        g.lineTo(c + Math.cos(a) * 44, c + Math.sin(a) * 44);
        g.stroke();
      }
      g.fillStyle = '#17181a';
      for (const a of [0.6, 3.74]) g.fillRect(c + Math.cos(a) * 36 - 4, c + Math.sin(a) * 36 - 4, 8, 8); // lifting holes
    });
    roadDecals(decal(cover), 60, 0.065, [1.5, 6.5], () => [0.85, 0.85, rand(0, 3)], 0.5);

    // --- storm drains along the kerbs
    const grate = canvasTexture(128, 64, (g, w, h) => {
      g.fillStyle = '#3c3e42';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0c0d0e';
      for (let x = 10; x < w - 8; x += 14) g.fillRect(x, 8, 7, h - 16);
    });
    roadDecals(new THREE.MeshLambertMaterial({ map: grate, depthWrite: false }), 110, 0.065,
      [ROAD_WIDTH / 2 - 0.42, ROAD_WIDTH / 2 - 0.38], () => [0.5, 0.95], 0.5);
  }

  // Signs on poles along the pavements, facing the traffic they are for.
  function addRoadSigns() {
    // Each sign is a printed front and a bare metal back of the same outline.
    const face = (w, h, draw) => {
      const sheet = (map) => new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.5 });
      const front = canvasTexture(w, h, (g) => {
        draw(g);
        g.globalCompositeOperation = 'source-atop'; // weathering, only where the sign is
        speckle(g, w, h, w * h / 40, 0.06);
        const grime = g.createLinearGradient(0, 0, 0, h);
        grime.addColorStop(0, 'rgba(0,0,0,0)');
        grime.addColorStop(1, 'rgba(40,30,20,0.16)');
        g.fillStyle = grime;
        g.fillRect(0, 0, w, h);
      });
      const back = canvasTexture(w, h, (g) => {
        draw(g);
        g.globalCompositeOperation = 'source-in'; // keep the outline, replace the print
        g.fillStyle = '#9aa0a6';
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = '#6f757b'; // the two rails the clamps hold
        g.fillRect(0, h * 0.28, w, h * 0.07);
        g.fillRect(0, h * 0.65, w, h * 0.07);
        speckle(g, w, h, w * h / 30, 0.07);
      });
      return { front: sheet(front), back: sheet(back) };
    };
    const text = (g, label, x, y, size, color) => {
      g.fillStyle = color;
      g.font = `bold ${size}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, x, y);
    };
    const limit = face(128, 128, (g) => {
      g.fillStyle = '#d42020';
      g.beginPath();
      g.arc(64, 64, 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(64, 64, 46, 0, Math.PI * 2);
      g.fill();
      text(g, '50', 64, 68, 58, '#111');
    });
    const parking = face(128, 128, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#1f55b0';
      g.fillRect(6, 6, 116, 116);
      text(g, 'P', 64, 70, 96, '#fff');
    });
    const crossing = face(128, 128, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#1f55b0';
      g.fillRect(6, 6, 116, 116);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(64, 16);
      g.lineTo(114, 106);
      g.lineTo(14, 106);
      g.closePath();
      g.fill();
      // a walking figure on stripes
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(64, 44, 8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(60, 52, 8, 24);
      g.lineWidth = 6;
      g.strokeStyle = '#111';
      g.beginPath();
      g.moveTo(64, 74);
      g.lineTo(52, 96);
      g.moveTo(64, 74);
      g.lineTo(78, 94);
      g.moveTo(62, 58);
      g.lineTo(50, 70);
      g.moveTo(66, 58);
      g.lineTo(80, 66);
      g.stroke();
      for (let x = 30; x < 100; x += 14) g.fillRect(x, 99, 8, 6);
    });
    const hills = face(256, 96, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = '#1b6e3c';
      g.fillRect(5, 5, 246, 86);
      text(g, 'HILLS  ↑', 128, 50, 50, '#fff');
    });

    const signs = []; // { x, z, turn, material, width, height, top }
    const beside = ROAD_WIDTH / 2 + 0.9; // a pole's distance from the middle of the road
    // For traffic heading in direction d along road `line`, a spot `along` the road on its right.
    const place = (d, line, along, material, width, height, top) => {
      const [dx, dz] = DIRS[d];
      const [rx, rz] = rightOf(DIRS[d]);
      signs.push({
        x: dx ? along : line + rx * beside,
        z: dz ? along : line + rz * beside,
        turn: Math.atan2(-dx, -dz), // facing back down the road, toward the drivers
        material, width, height, top,
      });
    };
    for (let i = 0; i <= BLOCKS; i++) {
      for (let k = 0; k < BLOCKS; k++) {
        for (let d = 0; d < 4; d++) {
          const forward = d < 2; // +x or +z
          const start = forward ? roadCenter(k) + JUNCTION : roadCenter(k + 1) - JUNCTION;
          const end = forward ? roadCenter(k + 1) - JUNCTION : roadCenter(k) + JUNCTION;
          const step = forward ? 1 : -1;
          if (Math.random() < 0.3) place(d, roadCenter(i), start + step * 11, limit, 0.75, 0.75, 2.75);
          if (Math.random() < 0.22) place(d, roadCenter(i), end - step * 13, crossing, 0.7, 0.7, 2.7);
        }
      }
    }
    // a P at each side of every car park, by its edge
    for (const [bx, bz] of [...PARKING_LOTS, PARKADE]) {
      const half = BLOCK_SIZE / 2 - 1;
      for (const [ox, oz, turn] of [[-half, -half, Math.PI], [half, half, 0], [-half, half, -Math.PI / 2], [half, -half, Math.PI / 2]]) {
        signs.push({ x: blockCenter(bx) + ox, z: blockCenter(bz) + oz, turn, material: parking, width: 0.8, height: 0.8, top: 3 });
      }
    }
    // the way out to the hills, on the road that leads there
    place(1, 38, HALF - 60, hills, 2.6, 1, 4.2);
    place(1, 38, roadCenter(3) + JUNCTION + 14, hills, 2.6, 1, 4.2);

    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), steelMat, signs.length);
    const dummy = new THREE.Object3D();
    const plate = new THREE.PlaneGeometry(1, 1);
    signs.forEach((sign, n) => {
      const y = groundAt(sign.x, sign.z, 1);
      dummy.position.set(sign.x, y + sign.top / 2, sign.z);
      dummy.scale.set(1, sign.top, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(n, dummy.matrix);
      for (const [material, turn, gap] of [[sign.material.front, sign.turn, 0.062], [sign.material.back, sign.turn + Math.PI, 0.056]]) {
        const board = new THREE.Mesh(plate, material);
        board.scale.set(sign.width, sign.height, 1);
        board.position.set(sign.x + Math.sin(sign.turn) * gap, y + sign.top - sign.height / 2, sign.z + Math.cos(sign.turn) * gap);
        board.rotation.y = turn;
        scene.add(board);
      }
    });
    scene.add(poles);
  }

  // Takes one all-round picture of the city from above a crossing and hands it to every
  // shiny material as its reflection. It is a still, so reflections do not move with you,
  // but paint, glass and puddles pick up the sky and the buildings.
  function captureReflections() {
    const target = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
    });
    const probe = new THREE.CubeCamera(1, 1800, target);
    probe.position.set(roadCenter(3), 9, roadCenter(4));
    scene.add(probe);
    const heroShown = hero.model.group.visible;
    hero.model.group.visible = false;
    skyDome.position.copy(probe.position);
    probe.update(renderer, scene);
    hero.model.group.visible = heroShown;
    scene.remove(probe);
    reflection = target.texture;
    for (const material of reflective) {
      material.envMap = reflection;
      material.needsUpdate = true;
    }
  }

  // ---------- Cars ----------

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1f });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x1b2836, shininess: 90, specular: 0x8fa3b8 });
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10).rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
  const underMat = new THREE.MeshLambertMaterial({ color: 0x121316 });

  // Car bodywork is drawn as a side profile (x = length, y = height) and extruded across
  // the car, with bevelled ends so the flanks round over instead of ending in sharp edges.
  function extrudeAcross(shape, width, bevel) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel, // keep the outline the size it was drawn
      bevelSegments: 4,
      curveSegments: 12,
    });
    geo.rotateY(-Math.PI / 2); // profile x becomes the car's length, the extrusion its width
    geo.translate(width / 2 - bevel, 0, 0);
    return geo;
  }

  const underGeo = new THREE.BoxGeometry(1, 1, 1);
  const headlightGeo = new THREE.BoxGeometry(0.42, 0.14, 0.1);
  // lit parts shared by every vehicle, so they can all be switched on together after dark
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  let tailIdle = 0x7a1010; // tail lamps when not braking; brighter after dark

  // How each kind of car drives, and how high its driver's eyes sit.
  const SALOON = {
    top: TOP_SPEED, nitroTop: NITRO_SPEED, engine: ENGINE, nitroEngine: NITRO_ENGINE,
    brake: BRAKE, grip: GRIP, eye: 1.27,
  };
  const SPORTS = { top: 62, nitroTop: 86, engine: 30, nitroEngine: 56, brake: 46, grip: 20, eye: 1.02 };
  const SPORTS_COLORS = [0xff5a00, 0xffd000, 0xd40000, 0x00a8e8, 0x39d353, 0xf5f5f5];

  // --- the car model ---

  // Every car is a copy of one loaded model (car-model.js) when it is available; the
  // shapes built above are the fallback. Copies share geometry, so only the paint and the
  // tail lights are per-car. The model's own materials are physically based and need an
  // environment to reflect, which this scene does not have, so each is swapped for a plain
  // material of the same colour.
  let carTemplate = null;
  const CAR_EXTERIOR = new Set(['body', 'glass', 'trim', 'lights_red', 'lights', 'leds', 'grills', 'chrome', 'metal',
    'plastic_gray', 'carbon_fibre']);
  const CAR_INTERIOR = new Set(['leather', 'carpet', 'interior_dark', 'interior_light', 'carbon_fibre_trim', 'blue',
    'yellow_trim']);
  const CAR_WHEEL_PARTS = /^(tire|wheel|rim_)/;
  const glassClear = new THREE.MeshPhongMaterial({
    color: 0x9fb4c8, transparent: true, opacity: 0.18, shininess: 90, depthWrite: false, side: THREE.DoubleSide,
  });
  const trimColors = {
    Tires: 0x141518, plastic_gray: 0x26282c, Carbon_Fiber: 0x18191c, Leather_red: 0x7d1a1a, Leather: 0x2a2a2d,
    Interior_dark: 0x1b1c20, Interior_light: 0x8d9096, Carpet: 0x1f2023, _0098_DodgerBlue: 0x1e90ff,
    Ferrari_Yellow: 0xffd100,
  };

  // Decodes the embedded model, then calls `done` whether or not it worked.
  function loadCarModel(done) {
    if (!THREE.GLTFLoader || !window.CAR_GLB) {
      done();
      return;
    }
    const text = atob(window.CAR_GLB);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);

    // Every surface is drawn two-sided: the model's panels are single sheets, and a few
    // small parts face inward.
    const side = THREE.DoubleSide;
    const shared = {
      Glass_Gray: reflect(new THREE.MeshPhongMaterial({ color: 0x1b2836, shininess: 90, specular: 0x8fa3b8, side }), 0.55),
      Projector_Glass: new THREE.MeshBasicMaterial({ color: 0xfff6cf, side }),
      Turn_Signal_LED: new THREE.MeshBasicMaterial({ color: 0xffe9b0, side }),
      metal_chrome: reflect(new THREE.MeshPhongMaterial({ color: 0xd9dde2, shininess: 120, specular: 0xffffff, side }), 0.6),
      metal_gray: new THREE.MeshPhongMaterial({ color: 0x8a8f96, shininess: 60, side }),
    };
    for (const [name, color] of Object.entries(trimColors)) {
      shared[name] = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    }
    const fallback = new THREE.MeshLambertMaterial({ color: 0x55585e });

    new THREE.GLTFLoader().parse(bytes.buffer, '', (gltf) => {
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.source = o.material.name;
        o.material = shared[o.material.name] || fallback;
      });
      carTemplate = gltf.scene;
      done();
    }, (error) => {
      console.warn('Car model failed to load; using the built-in cars.', error);
      done();
    });
  }

  // Copies the named child meshes of a template node into a new node with the same placement.
  function copyParts(source, wanted, materialFor) {
    const node = source.clone(false);
    for (const child of source.children) {
      if (!child.isMesh || !wanted(child.name)) continue;
      const mesh = new THREE.Mesh(child.geometry, materialFor(child));
      mesh.position.copy(child.position);
      mesh.quaternion.copy(child.quaternion);
      mesh.scale.copy(child.scale);
      mesh.name = child.name;
      node.add(mesh);
    }
    return node;
  }

  function createModelCar(color, sports) {
    const group = new THREE.Group();
    const paint = reflect(new THREE.MeshPhongMaterial({
      color, shininess: sports ? 140 : 90, specular: sports ? 0xaaaaaa : 0x777777, side: THREE.DoubleSide,
    }), sports ? 0.3 : 0.2);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x7a1010, side: THREE.DoubleSide });

    // The model faces -z and sits a little rear of centre; cars in the game face +z.
    const rig = new THREE.Group();
    rig.rotation.y = Math.PI;
    rig.position.z = 0.17;
    group.add(rig);

    // the seats, dash and trim are always there, so the cabin looks finished from outside too
    const main = copyParts(carTemplate.getObjectByName('main'), (name) => CAR_EXTERIOR.has(name) || CAR_INTERIOR.has(name), (part) => {
      if (part.name === 'body') return paint;
      if (part.name === 'lights_red') return tailMat;
      return part.material;
    });
    main.getObjectByName('body').castShadow = true;
    rig.add(main);

    const wheels = [];
    const frontPivots = [];
    for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      const source = carTemplate.getObjectByName(name);
      const wheel = copyParts(source, (part) => CAR_WHEEL_PARTS.test(part), (part) => part.material);
      wheels.push(wheel);
      if (name[6] === 'f') {
        // front wheels hang from a pivot so they can steer as well as spin
        const pivot = new THREE.Group();
        pivot.position.copy(source.position);
        wheel.position.set(0, 0, 0);
        pivot.add(wheel);
        rig.add(pivot);
        frontPivots.push(pivot);
      } else {
        rig.add(wheel);
      }
    }

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.6, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.85 })
    );
    flame.rotation.x = -Math.PI / 2; // tip points backwards
    flame.position.set(0, 0.45, -3);
    flame.visible = false;
    group.add(flame);

    // the steering wheel, on its tilted column
    const wheelSource = carTemplate.getObjectByName('steering_wheel');
    const column = wheelSource.clone(false);
    const steeringWheel = copyParts(wheelSource, () => true, (part) => part.material);
    steeringWheel.position.set(0, 0, 0);
    steeringWheel.quaternion.identity();
    column.add(steeringWheel);
    rig.add(column);

    scene.add(group);
    return {
      group, rig, wheels, frontPivots, tailMat, flame, sports: true, kind: 'sports',
      dims: { hl: 2.3, hw: 1.0, wb: 2.65 }, seatY: 0.36,
      deform: [main.getObjectByName('body')], glassParts: [main.getObjectByName('glass')],
      interior: new THREE.Group(), interiorAlways: true, steeringWheel,
      cabin: new THREE.Group(), // nothing to hide in the inside view: you sit in the real cabin
      glass: main.getObjectByName('glass'),
      glassMaterial: main.getObjectByName('glass').material,
      stats: { ...(sports ? SPORTS : SALOON), eye: 1.02 },
      seat: [0.02, 0.36], // driver's head: metres ahead of centre, metres to the left
      spin: -1, // the rig is turned round, so its wheels roll the other way
      steerAxis: 'y', // the model's steering column runs along its own y axis
      steerTurn: 1,
      roof: 1.2,
    };
  }

  // --- built vehicles: saloon, hatchback, SUV, pickup, bus and motorbike ---

  // Each kind is described by a side profile and a few sizes; the shapes are made once
  // and shared by every vehicle of that kind. All lengths are metres; x runs forward.
  const KINDS = {
    sedan: {
      len: 4.6, width: 1.84, wb: 2.7, r: 0.36, g: 0.28, waist: 0.95,
      upper: [[2.3, 0.45], [2.28, 0.68], [2.0, 0.82], [1.1, 0.93], [0, 0.97], [-1.3, 0.97], [-2.05, 0.93], [-2.28, 0.78], [-2.3, 0.5], [-2.2, 0.33]],
      glass: [[1.02, 0.93], [0.32, 1.38], [-0.8, 1.4], [-1.55, 0.97]],
      seat: [0.0, 0.4], seatY: 0.44, eye: 1.2,
      stats: { top: 40, nitroTop: 58, engine: 15, nitroEngine: 32, brake: 34, grip: 18 },
    },
    hatch: {
      len: 4.0, width: 1.76, wb: 2.5, r: 0.34, g: 0.27, waist: 0.96,
      upper: [[2.0, 0.45], [1.98, 0.7], [1.7, 0.84], [0.95, 0.95], [0, 0.98], [-1.5, 0.98], [-1.95, 0.9], [-2.0, 0.55], [-1.9, 0.32]],
      glass: [[0.97, 0.95], [0.32, 1.42], [-1.3, 1.45], [-1.88, 1.0]],
      seat: [0.0, 0.38], seatY: 0.46, eye: 1.24,
      stats: { top: 37, nitroTop: 54, engine: 14, nitroEngine: 30, brake: 34, grip: 18 },
    },
    suv: {
      len: 4.7, width: 1.94, wb: 2.8, r: 0.42, g: 0.36, waist: 1.15,
      upper: [[2.35, 0.6], [2.33, 0.9], [2.05, 1.06], [1.1, 1.14], [0, 1.16], [-1.8, 1.16], [-2.3, 1.1], [-2.35, 0.7], [-2.25, 0.41]],
      glass: [[1.07, 1.14], [0.47, 1.68], [-1.85, 1.72], [-2.26, 1.18]],
      seat: [0.1, 0.42], seatY: 0.64, eye: 1.48,
      stats: { top: 36, nitroTop: 52, engine: 13, nitroEngine: 28, brake: 31, grip: 16 },
    },
    pickup: {
      len: 5.3, width: 1.96, wb: 3.3, r: 0.42, g: 0.36, waist: 1.17,
      upper: [[2.65, 0.62], [2.62, 0.95], [2.3, 1.1], [1.4, 1.17], [0.2, 1.18], [-0.5, 1.12], [-2.5, 1.12], [-2.65, 1.05], [-2.65, 0.6], [-2.55, 0.41]],
      glass: [[1.37, 1.17], [0.82, 1.72], [-0.22, 1.74], [-0.42, 1.18]],
      bed: [-2.5, -0.6], seat: [0.5, 0.42], seatY: 0.68, eye: 1.52,
      stats: { top: 34, nitroTop: 50, engine: 12, nitroEngine: 26, brake: 29, grip: 15 },
    },
    bus: {
      len: 10.5, width: 2.5, wb: 5.6, r: 0.5, g: 0.4, waist: 3.0, bus: true,
      upper: [[5.25, 0.7], [5.25, 2.75], [5.0, 3.0], [0, 3.02], [-5.0, 3.0], [-5.25, 2.75], [-5.25, 0.7], [-5.15, 0.45]],
      seat: [4.3, 0.72], seatY: 1.2, eye: 2.1,
      stats: { top: 24, nitroTop: 32, engine: 6, nitroEngine: 12, brake: 22, grip: 14 },
    },
    moto: {
      len: 2.1, width: 0.8, wb: 1.44, r: 0.32, moto: true,
      seat: [-0.3, 0], seatY: 0.86, eye: 1.5,
      stats: { top: 46, nitroTop: 66, engine: 22, nitroEngine: 40, brake: 32, grip: 20 },
    },
  };
  const TRAFFIC_COLORS = [0xf2f2f2, 0xd9dcdf, 0x1d1f24, 0x2b2f38, 0x8b9096, 0x9aa0a8, 0x1f3f7a, 0x7a1d1d, 0x2f5d44, 0xb8a27a, 0x5a6b7d];
  const cabinGlass = reflect(new THREE.MeshPhongMaterial({
    color: 0x1f2b38, transparent: true, opacity: 0.55, shininess: 100, specular: 0x9fb4c8, depthWrite: false,
  }), 0.4);
  const darkGlass = reflect(new THREE.MeshPhongMaterial({ color: 0x18222d, shininess: 100, specular: 0x9fb4c8 }), 0.45);
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x24262b });
  const bedMat = new THREE.MeshLambertMaterial({ color: 0x1a1b1e });
  const steeringGeo = new THREE.TorusGeometry(0.17, 0.022, 8, 20);

  for (const kind of Object.values(KINDS)) {
    kind.dims = { hl: kind.len / 2, hw: kind.width / 2, wb: kind.wb };
    kind.stats.eye = kind.eye;
    if (kind.moto) continue;
    const h = kind.len / 2;
    const arch = 2 * kind.r + 0.06 - kind.g; // an arch clears the top of its wheel
    const body = new THREE.Shape();
    body.moveTo(-h + 0.1, kind.g + 0.05);
    body.lineTo(-kind.wb / 2 - arch, kind.g);
    body.absarc(-kind.wb / 2, kind.g, arch, Math.PI, 0, true);
    body.lineTo(kind.wb / 2 - arch, kind.g);
    body.absarc(kind.wb / 2, kind.g, arch, Math.PI, 0, true);
    body.lineTo(h - 0.1, kind.g + 0.05);
    body.splineThru(kind.upper.map(([x, y]) => new THREE.Vector2(x, y)));
    kind.bodyGeo = extrudeAcross(body, kind.width, kind.bus ? 0.14 : 0.12);
    if (kind.glass) {
      const [front, roofFront, roofRear, rear] = kind.glass;
      const glass = new THREE.Shape();
      glass.moveTo(front[0], front[1]);
      glass.lineTo(roofFront[0], roofFront[1]);
      glass.lineTo(roofRear[0], roofRear[1]);
      glass.lineTo(rear[0], rear[1]);
      kind.glassGeo = extrudeAcross(glass, kind.width - 0.2, 0.15);
      const roof = new THREE.Shape();
      roof.moveTo(roofFront[0] + 0.06, roofFront[1] - 0.03);
      roof.quadraticCurveTo((roofFront[0] + roofRear[0]) / 2, roofFront[1] + 0.09, roofRear[0] - 0.06, roofRear[1] - 0.03);
      roof.lineTo(roofRear[0] + 0.02, roofRear[1] - 0.06);
      roof.lineTo(roofFront[0] - 0.02, roofFront[1] - 0.06);
      kind.roofGeo = extrudeAcross(roof, kind.width - 0.36, 0.06);
      kind.roof = roofFront[1] + 0.05;
    } else {
      kind.roof = kind.waist;
    }
  }

  function createBuiltCar(color, name) {
    const kind = KINDS[name];
    const { hl, hw } = kind.dims;
    const group = new THREE.Group();
    const paint = reflect(new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x777777 }), 0.2);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x7a1010 });
    // `cabin` is everything above the waistline, hidden as one in the inside view
    const cabin = new THREE.Group();
    group.add(cabin);
    const add = (geo, mat, x, y, z, parent = group) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const box = (w, hgt, d, mat, x, y, z, parent = group) => {
      const mesh = add(underGeo, mat, x, y, z, parent);
      mesh.scale.set(w, hgt, d);
      return mesh;
    };

    const body = add(kind.bodyGeo, paint, 0, 0, 0);
    body.castShadow = true;
    const deform = [body];
    const glassParts = [];
    let doors = [];
    box(kind.width - 0.24, 0.3, kind.wb + 1, underMat, 0, kind.g + 0.18, 0); // closes off the wheel arches
    const noseY = kind.upper[2][1] - 0.2;
    for (const end of [1, -1]) {
      box(kind.width - 0.1, 0.16, 0.14, underMat, 0, kind.g + 0.14, end * (hl - 0.03)); // bumper
      box(0.5, 0.11, 0.03, hubMat, 0, kind.g + 0.32, end * (hl + 0.045)); // number plate
      for (const side of [-1, 1]) {
        const lamp = add(headlightGeo, end > 0 ? headlightMat : tailMat, side * (hw - 0.36), noseY, end * (hl - 0.02));
        if (kind.bus) lamp.position.y = 0.95;
      }
    }
    box(kind.bus ? 1.6 : 0.8, 0.12, 0.06, underMat, 0, noseY - 0.17, hl - 0.02); // grille

    if (kind.bus) {
      // dark window bands down both sides, a deep windscreen, a rear window, the door, the sign
      for (const side of [-1, 1]) glassParts.push(box(0.05, 0.95, 8.9, darkGlass, side * hw, 2.05, -0.3));
      glassParts.push(box(2.2, 1.25, 0.05, darkGlass, 0, 1.95, hl - 0.005));
      glassParts.push(box(2.0, 0.8, 0.05, darkGlass, 0, 2.1, -hl + 0.005));
      box(0.05, 2.0, 1.1, underMat, -hw, 1.45, 3.6);
      box(1.7, 0.26, 0.05, new THREE.MeshBasicMaterial({ color: 0xffa321 }), 0, 2.78, hl);
      box(kind.width + 0.02, 0.1, kind.len - 0.6, hubMat, 0, 1.1, 0); // waist stripe
    } else {
      const [front, roofFront, roofRear, rear] = kind.glass;
      const glass = add(kind.glassGeo, cabinGlass, 0, 0, 0, cabin);
      glass.renderOrder = 2; // after what is inside the car
      glassParts.push(glass);
      deform.push(add(kind.roofGeo, paint, 0, 0, 0, cabin));
      const pillarX = (roofFront[0] + roofRear[0]) / 2 - 0.1; // the post between the doors
      box(kind.width - 0.17, roofFront[1] - kind.waist, 0.09, paint, 0, (roofFront[1] + kind.waist) / 2, pillarX, cabin);
      // what shows through the glass: seat backs, the dash and the wheel
      const seatZ = kind.seat[0] - 0.3;
      for (const side of [-1, 1]) {
        box(0.46, 0.5, 0.12, seatMat, side * 0.4, kind.waist + 0.08, seatZ, cabin);
        box(0.26, 0.16, 0.1, seatMat, side * 0.4, kind.waist + 0.4, seatZ, cabin);
        box(0.14, 0.1, 0.16, paint, side * (hw + 0.06), kind.waist + 0.08, front[0] - 0.25); // door mirror
      }
      if (rear[0] < seatZ - 1.2) box(kind.width - 0.5, 0.42, 0.12, seatMat, 0, kind.waist + 0.04, seatZ - 0.95, cabin);
      // front doors: panels standing just proud of the body, hinged at the front edge so they can swing open
      const doorTop = kind.waist - 0.03;
      const doorBottom = kind.g + 0.16;
      doors = [1, -1].map((side) => {
        const hinge = new THREE.Group();
        hinge.position.set(side * (hw + 0.012), 0, front[0] - 0.3);
        box(0.03, doorTop - doorBottom, 1.02, paint, 0, (doorTop + doorBottom) / 2, -0.53, hinge);
        group.add(hinge);
        return hinge;
      });
      box(kind.width - 0.4, 0.1, 0.42, seatMat, 0, kind.waist + 0.01, front[0] - 0.3, cabin);
      const wheel = add(steeringGeo, seatMat, kind.seat[1], kind.waist + 0.1, front[0] - 0.55, cabin);
      wheel.rotation.x = -0.45;
      if (kind.bed) {
        // the load bed: a dark floor let into the top of the body
        box(kind.width - 0.3, 0.02, kind.bed[1] - kind.bed[0], bedMat, 0, kind.waist - 0.04, (kind.bed[0] + kind.bed[1]) / 2);
      }
    }

    const wheels = [];
    const frontPivots = [];
    const size = kind.r / 0.38;
    for (const zSide of [1, -1]) {
      for (const xSide of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(xSide * (hw - 0.14 - (kind.bus ? 0.08 : 0)), kind.r, zSide * kind.wb / 2);
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.scale.set(kind.bus ? 1.3 : 1, size, size);
        wheel.add(new THREE.Mesh(hubGeo, hubMat));
        pivot.add(wheel);
        group.add(pivot);
        wheels.push(wheel);
        if (zSide === 1) frontPivots.push(pivot);
      }
    }

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.6, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.85 })
    );
    flame.rotation.x = -Math.PI / 2; // tip points backwards
    flame.position.set(0, kind.g + 0.2, -hl - 0.75);
    flame.visible = false;
    group.add(flame);

    scene.add(group);
    return {
      group, wheels, frontPivots, tailMat, flame, cabin, kind: name, dims: kind.dims, stats: kind.stats,
      seat: kind.seat, seatY: kind.seatY, roof: kind.roof, deform, glassParts, door: doors[0],
    };
  }

  // A motorbike: two wheels, forks that steer, tank, seat, engine and exhaust.
  function createMotorbike(color) {
    const kind = KINDS.moto;
    const group = new THREE.Group();
    const paint = reflect(new THREE.MeshPhongMaterial({ color, shininess: 110, specular: 0x999999 }), 0.25);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x7a1010 });
    const add = (geo, mat, x, y, z, parent = group) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (w, hgt, d, mat, x, y, z, parent = group) => {
      const mesh = add(underGeo, mat, x, y, z, parent);
      mesh.scale.set(w, hgt, d);
      return mesh;
    };
    const tyre = new THREE.TorusGeometry(kind.r - 0.07, 0.07, 10, 24).rotateY(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(kind.r - 0.12, kind.r - 0.12, 0.04, 14).rotateZ(Math.PI / 2);
    const half = kind.wb / 2;

    // the fork, front wheel, bars and headlamp all turn together about the steering head
    const fork = new THREE.Group();
    fork.position.set(0, 0, half - 0.12);
    group.add(fork);
    const frontWheel = add(tyre, wheelMat, 0, kind.r, 0.12, fork);
    frontWheel.add(new THREE.Mesh(rim, hubMat));
    for (const side of [-1, 1]) {
      const leg = add(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 8), hubMat, side * 0.1, 0.68, -0.02, fork);
      leg.rotation.x = -0.36;
    }
    box(0.66, 0.035, 0.035, underMat, 0, 1.06, -0.17, fork); // bars
    add(new THREE.SphereGeometry(0.09, 12, 8), headlightMat, 0, 0.9, 0.02, fork);
    box(0.2, 0.05, 0.4, paint, 0, kind.r * 2 + 0.03, 0.12, fork); // front mudguard

    const rearWheel = add(tyre, wheelMat, 0, kind.r, -half);
    rearWheel.add(new THREE.Mesh(rim, hubMat));
    const tank = add(new THREE.SphereGeometry(0.2, 14, 10), paint, 0, 0.84, 0.18);
    tank.scale.set(0.85, 0.75, 1.6);
    box(0.26, 0.09, 0.62, seatMat, 0, 0.82, -0.36); // seat
    box(0.24, 0.1, 0.3, paint, 0, 0.82, -0.72); // tail
    box(0.28, 0.34, 0.42, underMat, 0, 0.5, 0.08); // engine
    box(0.06, 0.06, 0.9, hubMat, 0, 0.5, -0.32).rotation.x = 0.12; // frame rail
    const pipe = add(new THREE.CylinderGeometry(0.045, 0.055, 0.8, 10).rotateX(Math.PI / 2), hubMat, 0.17, 0.4, -0.5);
    pipe.rotation.x = -0.12;
    box(0.12, 0.05, 0.03, tailMat, 0, 0.84, -0.88);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.85 })
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0.17, 0.42, -1.4);
    flame.visible = false;
    group.add(flame);

    scene.add(group);
    return {
      group, wheels: [frontWheel, rearWheel], frontPivots: [fork], tailMat, flame, cabin: new THREE.Group(),
      kind: 'moto', moto: true, dims: kind.dims, stats: kind.stats, seat: kind.seat, seatY: kind.seatY, roof: 0.9,
      deform: [], glassParts: [], interior: new THREE.Group(), interiorAlways: true, steeringWheel: new THREE.Group(),
    };
  }

  // Makes a vehicle of the named kind, facing +z. 'sports' is the loaded sports car model.
  function createCar(color, kind = 'sedan') {
    if (kind === true) kind = 'sports';
    if (kind === 'moto') return createMotorbike(color);
    if (kind === 'sports' && carTemplate) return createModelCar(color, true);
    return createBuiltCar(color, kind === 'sports' ? 'sedan' : kind);
  }

  // Half the size of a car's footprint along the world's x and z axes, given its heading.
  function footprint(model, h) {
    const { hl, hw } = model.dims;
    const s = Math.abs(Math.sin(h));
    const c = Math.abs(Math.cos(h));
    return [hl * s + hw * c, hl * c + hw * s];
  }

  // Cockpit shown only in the inside view, where the outer cabin box is hidden.
  function addInterior(model) {
    const interior = new THREE.Group();
    const trim = new THREE.MeshLambertMaterial({ color: 0x15171c });
    const part = (w, h, d, x, y, z, mat = trim) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      interior.add(mesh);
      return mesh;
    };

    // the cockpit is roomier than the outer cabin box so the windscreen gives a wide view
    part(1.84, 0.02, 2.3, 0, 1.065, -0.25); // floor
    part(1.9, 0.1, 0.5, 0, 1.04, 0.72); // dashboard
    part(0.3, 0.05, 0.06, 0.38, 1.1, 0.6, new THREE.MeshBasicMaterial({ color: 0x1f6f8b })); // instrument glow
    part(1.9, 0.05, 2, 0, 1.76, -0.4); // roof
    part(0.18, 0.06, 0.04, 0, 1.64, 0.5); // mirror
    interior.position.z = (model.seat ? model.seat[0] : -0.2) + 0.2; // the cockpit sits round the driver
    for (const side of [-1, 1]) {
      part(0.07, 0.75, 0.07, side * 0.9, 1.4, 0.78).rotation.x = -0.45; // windscreen pillar
      part(0.07, 0.7, 0.1, side * 0.9, 1.4, -0.55); // door pillar
      part(0.06, 0.12, 2.3, side * 0.93, 1.04, -0.25); // door top
    }

    // steering wheel sits in front of the driver (left-hand drive; left is +x)
    const column = new THREE.Group();
    column.position.set(model.seat ? model.seat[1] : 0.38, 1.03, 0.36);
    column.rotation.x = -0.35;
    const wheel = new THREE.Group();
    const grip = new THREE.MeshLambertMaterial({ color: 0x30343c });
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 28), grip));
    wheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.02), grip));
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.02), grip);
    lower.position.y = -0.08;
    wheel.add(lower);
    column.add(wheel);
    interior.add(column);

    interior.visible = false;
    interior.position.y = model.stats.eye - SALOON.eye; // the cockpit is built for a saloon's seat height
    model.group.add(interior);
    model.interior = interior;
    model.steeringWheel = wheel;
  }

  function addPoliceLook(model) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2060ff });
    [[0.35, red], [-0.35, blue]].forEach(([x, mat]) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), mat);
      lamp.position.set(x, model.roof + 0.1, -0.25);
      model.group.add(lamp);
    });
    model.bar = [red, blue];
    // black-and-white livery: a dark band along the doors
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(model.dims.hw * 2 + 0.03, 0.3, 2.3),
      new THREE.MeshLambertMaterial({ color: 0x14181f })
    );
    stripe.position.set(0, 0.68, -0.2);
    model.group.add(stripe);
  }

  // Cars nobody is driving: parked ones, and any car the player has left somewhere.
  const idleCars = [];

  function addIdleCar(model, x, y, z, h) {
    model.group.position.set(x, y, z);
    model.group.rotation.set(0, h, 0);
    const [hx, hz] = footprint(model, h);
    const top = y + model.roof + 0.1; // roof height, for climbing onto it
    const box = {
      minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, minY: y - 0.5, maxY: y + model.roof + 0.2, top, owner: model,
      car: { x, z, h, hl: model.dims.hl, hw: model.dims.hw }, // its true outline, for walking and driving round it
    };
    colliders.push(box);
    idleCars.push({ model, x, y, z, h, box });
  }

  function addParkedCars() {
    const kinds = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'hatch', 'suv', 'suv', 'pickup', 'sports'];
    for (const bay of bays) {
      if (Math.random() > 0.3) continue;
      bay.taken = true;
      const kind = pick(kinds);
      const parked = createCar(pick(kind === 'sports' ? SPORTS_COLORS : TRAFFIC_COLORS), kind);
      addIdleCar(parked, bay.x, 0, bay.z, Math.random() < 0.5 ? 0 : Math.PI);
    }
  }

  // ---------- Traffic lights ----------

  let clock = 0;
  let lamps;
  const lightOffsets = [];
  for (let i = 0; i <= BLOCKS; i++) {
    lightOffsets.push(Array.from({ length: BLOCKS + 1 }, () => Math.random() * LIGHT_CYCLE));
  }

  // 'g' | 'y' | 'r' for a car travelling in direction d into intersection (i, j)
  function lightState(i, j, d) {
    const t = (clock + lightOffsets[i][j]) % LIGHT_CYCLE;
    const half = LIGHT_CYCLE / 2;
    const alongZ = d % 2 === 1;
    const local = alongZ ? t : (t + half) % LIGHT_CYCLE;
    if (local < half - 2) return 'g';
    if (local < half) return 'y';
    return 'r';
  }

  // A signal is a steel post carrying a three-lamp head with a backplate, hooded LED
  // lenses and a push-button box. Its parts are given in the signal's own frame, where +z
  // points at the drivers it faces; each part may appear at several places.
  const signalDark = new THREE.MeshPhongMaterial({ color: 0x1b1d20, shininess: 30, specular: 0x333333, side: THREE.DoubleSide });
  const LENS_HEIGHTS = [4.02, 3.68, 3.34]; // red, yellow, green
  const SIGNAL_PARTS = [
    { geo: new THREE.CylinderGeometry(0.06, 0.085, 4.4, 10).translate(0, 2.2, 0), mat: steelMat, at: [[0, 0, 0]] },
    { geo: new THREE.CylinderGeometry(0.13, 0.16, 0.24, 10).translate(0, 0.12, 0), mat: steelMat, at: [[0, 0, 0]] },
    { geo: new THREE.BoxGeometry(0.4, 1.16, 0.3), mat: signalDark, at: [[0, 3.68, 0.24]] },
    {
      // backplate: black with a reflective yellow border
      geo: new THREE.BoxGeometry(0.68, 1.44, 0.03),
      mat: new THREE.MeshLambertMaterial({
        map: canvasTexture(64, 128, (g, w, h) => {
          g.fillStyle = '#e0b020';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#141518';
          g.fillRect(5, 5, w - 10, h - 10);
        }),
      }),
      at: [[0, 3.68, 0.09]],
    },
    {
      // a hood over each lens: the top half of a tube
      geo: new THREE.CylinderGeometry(0.15, 0.15, 0.24, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
      mat: signalDark,
      at: LENS_HEIGHTS.map((y) => [0, y, 0.51]),
    },
    {
      // the lenses: clusters of LEDs, tinted per lamp by the light's state
      geo: new THREE.CircleGeometry(0.115, 22),
      mat: new THREE.MeshBasicMaterial({
        map: canvasTexture(64, 64, (g, w, h) => {
          g.fillStyle = '#8f8f8f';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#ffffff';
          for (let y = 3; y < h; y += 6) {
            for (let x = 3 + ((y / 6) % 2) * 3; x < w; x += 6) {
              g.beginPath();
              g.arc(x, y, 1.9, 0, Math.PI * 2);
              g.fill();
            }
          }
        }),
      }),
      at: LENS_HEIGHTS.map((y) => [0, y, 0.397]),
      lens: true,
    },
    { geo: new THREE.BoxGeometry(0.15, 0.22, 0.1), mat: new THREE.MeshLambertMaterial({ color: 0xe0b020 }), at: [[0, 1.15, 0.1]] },
  ];
  let signalMeshes;

  function buildTrafficLights() {
    const n = signals.length;
    signalMeshes = SIGNAL_PARTS.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, n * part.at.length);
      if (part.lens) lamps = mesh;
      return mesh;
    });
    const post = new THREE.Object3D();
    const piece = new THREE.Object3D();
    post.add(piece);
    signals.forEach((signal, k) => {
      const [dx, dz] = DIRS[signal.d];
      const [rx, rz] = rightOf(DIRS[signal.d]);
      // on the footpath corner to the driver's right, lamps facing the oncoming lane
      signal.x = roadCenter(signal.i) + (rx - dx) * (JUNCTION + 0.7);
      signal.z = roadCenter(signal.j) + (rz - dz) * (JUNCTION + 0.7);
      signal.turn = Math.atan2(-dx, -dz);
      post.position.set(signal.x, KERB, signal.z);
      post.rotation.y = signal.turn;
      SIGNAL_PARTS.forEach((part, p) => part.at.forEach((at, a) => {
        piece.position.set(at[0], at[1], at[2]);
        post.updateMatrixWorld(true);
        signalMeshes[p].setMatrixAt(k * part.at.length + a, piece.matrixWorld);
      }));
    });
    scene.add(...signalMeshes);
    updateLights();
  }

  const LAMP_ON = { r: new THREE.Color(0xff2b2b), y: new THREE.Color(0xffc21a), g: new THREE.Color(0x2bff6a) };
  const LAMP_OFF = { r: new THREE.Color(0x3a0c0c), y: new THREE.Color(0x3a2e08), g: new THREE.Color(0x0a3316) };
  const LAMP_ORDER = ['r', 'y', 'g'];

  function updateLights() {
    signals.forEach(({ i, j, d, broken }, k) => {
      if (broken) return;
      const state = lightState(i, j, d);
      LAMP_ORDER.forEach((name, lamp) => {
        lamps.setColorAt(k * 3 + lamp, state === name ? LAMP_ON[name] : LAMP_OFF[name]);
      });
    });
    lamps.instanceColor.needsUpdate = true;
  }

  // --- knocking signals over ---

  const toppling = []; // masts still falling: { mast, angle, speed }
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const deadLampMat = new THREE.MeshLambertMaterial({ color: 0x15171a });
  const shardGeo = new THREE.BoxGeometry(1, 1, 1);
  const shardMats = [0x8a1010, 0x8a6a08, 0x0c5a26, 0x2a2d33, 0x2a2d33, 0xbfc7cf].map(
    (color) => new THREE.MeshLambertMaterial({ color })
  );

  // Swap the standing signal for a loose mast that falls the way the car was going,
  // and scatter broken lens and casing on the road.
  function breakSignal(k, dirX, dirZ) {
    const signal = signals[k];
    signal.broken = true;
    SIGNAL_PARTS.forEach((part, p) => {
      part.at.forEach((at, a) => signalMeshes[p].setMatrixAt(k * part.at.length + a, hidden));
      signalMeshes[p].instanceMatrix.needsUpdate = true;
    });

    const fall = Math.atan2(dirX, dirZ);
    const base = new THREE.Group();
    base.position.set(signal.x, KERB, signal.z);
    base.rotation.y = fall;
    const mast = new THREE.Group(); // tips over about the foot of the post
    const head = new THREE.Group(); // keeps the signal facing the way it stood
    head.rotation.y = signal.turn - fall;
    mast.add(head);
    for (const part of SIGNAL_PARTS) {
      for (const at of part.at) {
        const mesh = new THREE.Mesh(part.geo, part.lens ? deadLampMat : part.mat);
        mesh.position.set(at[0], at[1], at[2]);
        head.add(mesh);
      }
    }
    mast.traverse((o) => { o.castShadow = true; });
    base.add(mast);
    scene.add(base);
    toppling.push({ mast, angle: 0, speed: 1.5 });

    for (let n = 0; n < 12; n++) {
      const shard = new THREE.Mesh(shardGeo, pick(shardMats));
      const along = rand(1, 7.5);
      const across = rand(-1.3, 1.3);
      shard.position.set(signal.x + dirX * along + dirZ * across, 0.06, signal.z + dirZ * along - dirX * across);
      shard.scale.set(rand(0.08, 0.3), 0.05, rand(0.08, 0.3));
      shard.rotation.y = Math.random() * 3;
      scene.add(shard);
    }
  }

  function updateToppling(dt) {
    for (let n = toppling.length - 1; n >= 0; n--) {
      const t = toppling[n];
      t.speed += 7 * dt;
      t.angle = Math.min(Math.PI / 2, t.angle + t.speed * dt);
      t.mast.rotation.x = t.angle; // tips forward, away from the car
      if (t.angle >= Math.PI / 2) toppling.splice(n, 1);
    }
  }

  // Driving into a signal at speed breaks it.
  function checkSignalHits(speed) {
    if (speed < 4 || car.y > 1) return;
    const fx = Math.sin(car.heading) * (player.dims.hl - player.dims.hw);
    const fz = Math.cos(car.heading) * (player.dims.hl - player.dims.hw);
    signals.forEach((signal, k) => {
      if (signal.broken || Math.abs(signal.x - car.x) > 4 || Math.abs(signal.z - car.z) > 4) return;
      const front = Math.hypot(signal.x - car.x - fx, signal.z - car.z - fz);
      const rear = Math.hypot(signal.x - car.x + fx, signal.z - car.z + fz);
      if (Math.min(front, rear) > player.dims.hw + 0.3) return;
      breakSignal(k, car.vx / speed, car.vz / speed);
      car.vx *= 0.8;
      car.vz *= 0.8;
    });
  }

  // ---------- Traffic ----------

  // Each traffic vehicle is steered, not slid along a rail. Its route is still the lane
  // (a stretch of road `t` metres from the last junction, then a curve through the next
  // one), but only a "carrot" point follows that route exactly. The vehicle itself has a
  // position, a heading and a speed, and steers its front wheels toward the carrot a few
  // lengths ahead, so every turn and lane change is a real arc the wheels could make.
  const traffic = [];
  const STOP_LINE = CELL - JUNCTION - 5.2; // where a vehicle's nose stops for a red light
  const PASSING_LANE = -ROAD_WIDTH / 4; // the inner lane, as an offset from the outer one
  const TRAFFIC_MIX = [['sedan', 30], ['hatch', 24], ['suv', 18], ['pickup', 10], ['moto', 9], ['bus', 5], ['sports', 4]];

  function carrotPoint(c) {
    if (c.phase === 'road') {
      const [dx, dz] = DIRS[c.d];
      const [rx, rz] = rightOf(DIRS[c.d]);
      c.cx = roadCenter(c.i) + dx * c.t + rx * (LANE + c.side);
      c.cz = roadCenter(c.j) + dz * c.t + rz * (LANE + c.side);
    } else {
      const u = c.u;
      const v = 1 - u;
      c.cx = v * v * c.p0[0] + 2 * v * u * c.p1[0] + u * u * c.p2[0];
      c.cz = v * v * c.p0[1] + 2 * v * u * c.p1[1] + u * u * c.p2[1];
    }
  }

  function pickKind() {
    let roll = Math.random() * TRAFFIC_MIX.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [kind, weight] of TRAFFIC_MIX) {
      roll -= weight;
      if (roll <= 0) return kind;
    }
    return 'sedan';
  }

  function spawnTraffic() {
    for (let tries = 0; traffic.length < TRAFFIC_CARS && tries < 4000; tries++) {
      const c = {
        i: Math.floor(Math.random() * (BLOCKS + 1)),
        j: Math.floor(Math.random() * (BLOCKS + 1)),
        d: Math.floor(Math.random() * 4),
        t: rand(JUNCTION + 4, CELL - JUNCTION - 8),
        phase: 'road', speed: 0, cruise: rand(9, 13), steer: 0,
        side: 0, laneTimer: 0, wait: 0, reverse: 0, hold: null, id: tries,
      };
      if (!segmentOpen(c.i, c.j, c.d)) continue;
      carrotPoint(c);
      if (Math.hypot(c.cx - START.x, c.cz - START.z) < 30) continue;
      if (traffic.some((o) => Math.hypot(o.x - c.cx, o.z - c.cz) < 16)) continue;
      const kind = pickKind();
      c.model = createCar(pick(kind === 'sports' ? SPORTS_COLORS : TRAFFIC_COLORS), kind);
      if (kind === 'bus') c.cruise = rand(7, 9);
      Object.assign(c, { x: c.cx, z: c.cz, h: Math.atan2(DIRS[c.d][0], DIRS[c.d][1]) });
      c.driver = addDriver(c.model);
      addBeam(c.model);
      c.box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: c.model.roof + 0.2, owner: c.model, car: { x: 0, z: 0, h: 0, ...c.model.dims } };
      trafficBoxes.push(c.box);
      traffic.push(c);
    }
  }

  function startTurn(c) {
    const [dx, dz] = DIRS[c.d];
    c.ni = c.i + dx;
    c.nj = c.j + dz;
    let exits = [c.d, (c.d + 1) % 4, (c.d + 3) % 4].filter((d) => segmentOpen(c.ni, c.nj, d));
    if (!exits.length) exits = [(c.d + 2) % 4];
    c.d2 = exits[0] === c.d && Math.random() < 0.55 ? c.d : pick(exits);

    const nx = roadCenter(c.ni);
    const nz = roadCenter(c.nj);
    const [rx, rz] = rightOf(DIRS[c.d]);
    const [ex, ez] = DIRS[c.d2];
    const [erx, erz] = rightOf(DIRS[c.d2]);
    const lane = LANE + c.side; // it may enter from the passing lane
    c.p0 = [nx - dx * JUNCTION + rx * lane, nz - dz * JUNCTION + rz * lane];
    // a right turn is too tight to make into the near lane: it swings into the inner one, then moves over
    const right = c.d2 === (c.d + 1) % 4;
    const exit = right ? LANE + PASSING_LANE : LANE;
    c.p2 = [nx + ex * JUNCTION + erx * exit, nz + ez * JUNCTION + erz * exit];
    if (c.d2 === c.d) {
      c.p1 = [(c.p0[0] + c.p2[0]) / 2, (c.p0[1] + c.p2[1]) / 2];
      c.len = JUNCTION * 2;
    } else {
      // the two lane lines cross here, which makes the curve leave and arrive straight
      c.p1 = [nx + rx * lane + erx * exit, nz + rz * lane + erz * exit];
      c.len = right ? 7 : 22; // a short right, a wide left
    }
    c.u = 0;
    c.side = right ? PASSING_LANE : 0;
    c.phase = 'turn';
  }

  // Only one vehicle crosses a junction at a time, so paths never cross inside one. The
  // one holding a junction is recorded here by the junction's grid position.
  const junctionHolder = {};
  const junctionBusy = (key, c) => {
    const holder = junctionHolder[key];
    return !!holder && holder !== c && holder.hold === key && traffic.includes(holder);
  };

  // How far along its stretch of road a vehicle really is (its carrot is further on).
  function roadProgress(c) {
    const [dx, dz] = DIRS[c.d];
    return (c.x - roadCenter(c.i)) * dx + (c.z - roadCenter(c.j)) * dz;
  }

  // May the carrot go on into the junction ahead? Not on red, and not while another
  // vehicle is crossing. A vehicle already over the stop line is committed and goes on.
  function mayEnter(c) {
    const [dx, dz] = DIRS[c.d];
    if (junctionBusy(`${c.i + dx},${c.j + dz}`, c)) return false;
    const state = lightState(c.i + dx, c.j + dz, c.d);
    return state === 'g' || roadProgress(c) + c.model.dims.hl > STOP_LINE + 1.5;
  }

  // Moves the carrot `amount` metres along the route, as far as it is allowed to go.
  function advanceCarrot(c, amount) {
    while (amount > 1e-4) {
      if (c.phase === 'road') {
        const end = CELL - JUNCTION;
        const to = Math.min(end, c.t + amount);
        amount -= to - c.t;
        c.t = to;
        if (c.t < end - 1e-6) break;
        if (!mayEnter(c)) break; // held at the edge
        const [dx, dz] = DIRS[c.d];
        c.hold = `${c.i + dx},${c.j + dz}`;
        junctionHolder[c.hold] = c;
        startTurn(c);
      } else {
        const du = Math.min(1 - c.u, amount / c.len);
        c.u += du;
        amount -= du * c.len;
        if (c.u >= 1 - 1e-6) Object.assign(c, { i: c.ni, j: c.nj, d: c.d2, t: JUNCTION, phase: 'road' });
        else break;
      }
    }
    carrotPoint(c);
  }

  // Everything a traffic vehicle must not drive into, gathered once a frame: where it is,
  // which way it points, half its length and width, and how fast it is going.
  function trafficObstacles() {
    const list = traffic.map((o) => ({ x: o.x, z: o.z, h: o.h, speed: Math.abs(o.speed), car: o, ...o.model.dims }));
    for (const v of idleCars) if ((v.y || 0) < 1) list.push({ x: v.x, z: v.z, h: v.h, speed: 0, ...v.model.dims });
    for (const p of police) if (p.active) list.push({ x: p.x, z: p.z, h: p.h, speed: Math.abs(p.speed), ...p.model.dims });
    if (heli && mode !== 'heli' && heli.y < 1) list.push({ x: heli.x, z: heli.z, h: heli.h, speed: 0, hl: 3, hw: 1.6 });
    if (car.y < 1.5 && mode !== 'heli') {
      const dims = mode === 'car' ? player.dims : { hl: 0.5, hw: 0.4 }; // on foot, bike or horse: something narrow
      list.push({ x: car.x, z: car.z, h: car.heading, speed: Math.hypot(car.vx, car.vz), ...dims });
    }
    return list;
  }

  // The gap between vehicle `c` and the nearest thing in a strip of road along its heading,
  // `shift` metres to its right: ahead of it, or (`behind` true) at its back. With `wide`
  // the strip also takes in anything alongside, for checking a lane is free to pull into.
  function gapAlong(c, obstacles, shift, behind, wide) {
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    const { hl, hw } = c.model.dims;
    const found = { gap: Infinity, still: false };
    for (const o of obstacles) {
      if (o.car === c) continue;
      const ox = o.x - c.x;
      const oz = o.z - c.z;
      if (Math.abs(ox) > 40 || Math.abs(oz) > 40) continue;
      // how long and wide the other thing is as seen along this vehicle's heading
      const turn = o.h - c.h;
      const along = Math.abs(Math.cos(turn)) * o.hl + Math.abs(Math.sin(turn)) * o.hw;
      const across = Math.abs(Math.sin(turn)) * o.hl + Math.abs(Math.cos(turn)) * o.hw;
      if (Math.abs(oz * fx - ox * fz - shift) > hw + across + 0.35) continue;
      let ahead = ox * fx + oz * fz;
      if (wide && ahead > -(hl + along + 6) && ahead < hl + along) return { gap: -1, still: o.speed < 1.2 };
      if (behind) ahead = -ahead;
      if (ahead <= 0) continue;
      const gap = ahead - hl - along;
      if (gap < found.gap) Object.assign(found, { gap, still: o.speed < 1.2, car: o.car || null });
    }
    return found;
  }

  // Is a lane of this vehicle's road free to move into: nothing in it from a little behind
  // the vehicle to a good way ahead? `lane` is the offset from the outer lane's centre.
  // Measured along the road, not along the vehicle, which may be at an angle.
  function laneClear(c, obstacles, lane) {
    const [dx, dz] = DIRS[c.d];
    const [rx, rz] = rightOf(DIRS[c.d]);
    const road = Math.atan2(dx, dz);
    const { hl, hw } = c.model.dims;
    for (const o of obstacles) {
      if (o.car === c) continue;
      const ox = o.x - c.x;
      const oz = o.z - c.z;
      if (Math.abs(ox) > 40 || Math.abs(oz) > 40) continue;
      const turn = o.h - road;
      const along = Math.abs(Math.cos(turn)) * o.hl + Math.abs(Math.sin(turn)) * o.hw;
      const across = Math.abs(Math.sin(turn)) * o.hl + Math.abs(Math.cos(turn)) * o.hw;
      const offset = (o.x - roadCenter(c.i)) * rx + (o.z - roadCenter(c.j)) * rz - LANE;
      if (Math.abs(offset - lane) > hw + across + 0.35) continue;
      const ahead = ox * dx + oz * dz;
      if (ahead > -(hl + along + 6) && ahead < hl + along + 14) return false;
    }
    return true;
  }

  // Do two rectangles overlap? Each is a centre, a heading, and half its length and width.
  function boxesTouch(ax, az, ah, ahl, ahw, bx, bz, bh, bhl, bhw) {
    const dx = bx - ax;
    const dz = bz - az;
    for (const [h, own, ownAcross] of [[ah, ahl, ahw], [bh, bhl, bhw]]) {
      for (const quarter of [0, Math.PI / 2]) {
        // project both onto this side's direction: they are apart if the gap exceeds both reaches
        const ux = Math.sin(h + quarter);
        const uz = Math.cos(h + quarter);
        const reachA = Math.abs(Math.sin(ah) * ux + Math.cos(ah) * uz) * ahl + Math.abs(Math.cos(ah) * ux - Math.sin(ah) * uz) * ahw;
        const reachB = Math.abs(Math.sin(bh) * ux + Math.cos(bh) * uz) * bhl + Math.abs(Math.cos(bh) * ux - Math.sin(bh) * uz) * bhw;
        if (Math.abs(dx * ux + dz * uz) > reachA + reachB) return false;
      }
    }
    return true;
  }

  // Close to something, what matters is whether the next couple of metres are really clear.
  function pathClear(c, obstacles) {
    const { hl, hw } = c.model.dims;
    for (const step of [1.2, 2.4]) {
      const x = c.x + Math.sin(c.h) * step;
      const z = c.z + Math.cos(c.h) * step;
      for (const o of obstacles) {
        if (o.car === c || Math.abs(o.x - x) > 14 || Math.abs(o.z - z) > 14) continue;
        if (boxesTouch(x, z, c.h, hl + 0.2, hw + 0.3, o.x, o.z, o.h, o.hl, o.hw)) return false;
      }
    }
    return true;
  }

  function updateTraffic(dt) {
    const obstacles = trafficObstacles();
    for (const c of traffic) {
      const { hl, wb } = c.model.dims;
      c.laneTimer = Math.max(0, c.laneTimer - dt);

      // keep the carrot a few lengths ahead
      const look = 5 + hl + Math.abs(c.speed) * 0.7;
      const lead = Math.hypot(c.cx - c.x, c.cz - c.z);
      if (lead < look) advanceCarrot(c, Math.min(look - lead, 45 * dt + 0.2));
      const progress = c.phase === 'road' ? roadProgress(c) : 0;
      // the junction is free again once this vehicle's tail has left it
      if (c.hold && c.phase === 'road' && progress - hl > JUNCTION) {
        if (junctionHolder[c.hold] === c) delete junctionHolder[c.hold];
        c.hold = null;
      }

      const ahead = gapAlong(c, obstacles, 0, false);
      // A vehicle is "stuck" when what blocks it is not ordinary waiting traffic: something
      // parked in the road, or another vehicle that is itself stuck or backing up. Whoever
      // comes up behind a stuck vehicle hangs well back, so it has room to work its way out.
      const leadStuck = !!ahead.car && (ahead.car.stuck || ahead.car.reverse > 0);
      c.stuck = ahead.still && ahead.gap < 5 && (!ahead.car || leadStuck);
      let room = ahead.gap - (leadStuck ? 6 : 1.4); // metres it may still roll before it has to be stopped
      // nose to tail in a queue that margin is right; squeezing past at an angle, test the real shapes
      if (ahead.gap < 4.5 && !leadStuck) room = pathClear(c, obstacles) ? Math.max(room, 2) : Math.min(room, 0);
      if (c.phase === 'road' && c.t >= CELL - JUNCTION - 1e-3 && !mayEnter(c)) {
        // the carrot is held at the junction: stop at the line (or, if over it, at the edge)
        const line = progress + hl > STOP_LINE + 1.5 ? CELL - JUNCTION - 0.4 : STOP_LINE;
        room = Math.min(room, line - hl - progress);
      }

      // Lane choice, on a road only. A lane blocked by something that is not moving sends
      // the carrot to the other lane when that is clear alongside and ahead; from the
      // passing lane it comes back as soon as the outer lane is clear.
      if (c.phase === 'road' && c.reverse <= 0) {
        const [rx, rz] = rightOf(DIRS[c.d]);
        const drift = (c.x - roadCenter(c.i)) * rx + (c.z - roadCenter(c.j)) * rz - LANE; // where it really is
        // Stuck nose-in behind something while trying to reach the other lane: back up and
        // have another go at the angle, like a three-point turn. With no room behind
        // either, it stays put until whatever is boxing it in moves.
        if (c.wait > 1 && ahead.still && ahead.gap < 4.5 && Math.abs(drift - c.side) > 1.2
          && gapAlong(c, obstacles, 0, true).gap > 2.5) c.reverse = 1.8;
        // sitting on the tail of a vehicle that is trying to manoeuvre: back off and give it room
        if (c.wait > 0.5 && leadStuck && ahead.gap < 5 && gapAlong(c, obstacles, 0, true).gap > 2.5) {
          c.reverse = 1.5;
          c.yielding = true;
        }
      }
      if (c.phase === 'road' && c.laneTimer <= 0 && c.reverse <= 0) {
        const [rx, rz] = rightOf(DIRS[c.d]);
        const drift = (c.x - roadCenter(c.i)) * rx + (c.z - roadCenter(c.j)) * rz - LANE;
        const other = c.side === 0 ? PASSING_LANE : 0;
        const blocked = ahead.still && ahead.gap < 16;
        if ((blocked || c.side !== 0) && laneClear(c, obstacles, other)) {
          c.side = other;
          c.laneTimer = 2.5;
          carrotPoint(c);
          // too close behind the obstruction to swing out: back up first, if there is room to
          if (blocked && ahead.gap < 5 && gapAlong(c, obstacles, 0, true).gap > 2.5) c.reverse = 2.2;
        }
      }

      // Where to steer: at the carrot, except while still well out of its lane, when it aims
      // at the lane just ahead of its own nose so it gets across before it gets along.
      let aimX = c.cx;
      let aimZ = c.cz;
      if (c.phase === 'road') {
        const [dx, dz] = DIRS[c.d];
        const [rx, rz] = rightOf(DIRS[c.d]);
        const drift = (c.x - roadCenter(c.i)) * rx + (c.z - roadCenter(c.j)) * rz - LANE;
        if (Math.abs(drift - c.side) > 1) {
          const along = Math.min(c.t, progress + hl + 3);
          aimX = roadCenter(c.i) + dx * along + rx * (LANE + c.side);
          aimZ = roadCenter(c.j) + dz * along + rz * (LANE + c.side);
        }
      }
      const target = wrapAngle(Math.atan2(aimX - c.x, aimZ - c.z) - c.h);
      let want;
      if (c.reverse > 0) {
        // backing away from the obstruction, nose swinging toward the lane it will take
        c.reverse -= dt;
        const back = gapAlong(c, obstacles, 0, true).gap;
        want = back > 2 ? -2.4 : 0; // boxed in from behind: it just has to wait
        if (ahead.gap > 6.5 || (back <= 2 && Math.abs(c.speed) < 0.1)) c.reverse = 0;
        // swing the nose toward the lane it wants; when only making room, back straight
        c.steer = approach(c.steer, c.yielding ? 0 : Math.max(-0.6, Math.min(0.6, -target * 2.5)), 2.5 * dt);
        if (c.reverse <= 0) c.yielding = false;
      } else {
        const cornering = 1 - 0.55 * Math.min(1, Math.abs(target) / 0.7);
        const cruise = (c.phase === 'road' ? c.cruise : Math.min(c.cruise, 7)) * cornering;
        want = Math.min(cruise, Math.sqrt(10 * Math.max(0, room)));
        c.steer = approach(c.steer, Math.max(-0.6, Math.min(0.6, target * 1.8)), 2.5 * dt);
      }
      if (c.jacked) want = 0; // someone has hold of the door
      if (c.model.flats && c.model.flats.length) want *= 0.45; // limping on a flat tyre
      c.speed = approach(c.speed, want, (Math.abs(want) < Math.abs(c.speed) ? 12 : 4) * dt);
      // Never off the road. Backing up, or out in the middle of a block, a vehicle whose
      // leading end would mount the kerb stops short of it (and, nose to the kerb, backs
      // off to line itself up again).
      const leading = Math.sign(c.speed) * (hl + 0.4);
      const midBlock = c.phase === 'road' && progress > JUNCTION + 6 && progress < CELL - JUNCTION - 6;
      if (c.speed !== 0 && (c.speed < 0 || midBlock)
        && !onStreet(c.x + Math.sin(c.h) * leading, c.z + Math.cos(c.h) * leading, c.model.dims.hw * 0.6)) {
        const nosing = c.speed > 0;
        c.speed = 0;
        if (!nosing) c.reverse = 0;
        else if (c.wait > 1 && c.reverse <= 0 && gapAlong(c, obstacles, 0, true).gap > 2.5) c.reverse = 1.4;
      }
      c.wait = Math.abs(c.speed) < 0.3 ? c.wait + dt : 0;

      // the front wheels steer; the vehicle follows the arc they make
      c.h += (c.speed / wb) * Math.tan(c.steer) * dt;
      c.x += Math.sin(c.h) * c.speed * dt;
      c.z += Math.cos(c.h) * c.speed * dt;

      const m = c.model;
      m.group.position.set(c.x, 0, c.z);
      m.group.rotation.set(0, c.h, flatLean(m) + (m.moto ? -c.steer * 0.6 * Math.min(1, Math.abs(c.speed) / 8) : 0));
      for (const pivot of m.frontPivots) pivot.rotation.y = c.steer;
      for (const wheel of m.wheels) wheel.rotation.x += (m.spin || 1) * (c.speed / 0.38) * dt;
      m.tailMat.color.setHex(want < c.speed - 0.1 || Math.abs(c.speed) < 0.1 ? 0xff2a2a : tailIdle);
      if (c.driver) c.driver.visible = Math.abs(c.x - car.x) < 110 && Math.abs(c.z - car.z) < 110;

      const [hx, hz] = footprint(m, c.h);
      c.box.minX = c.x - hx;
      c.box.maxX = c.x + hx;
      c.box.minZ = c.z - hz;
      c.box.maxZ = c.z + hz;
      if (c.box.car) Object.assign(c.box.car, { x: c.x, z: c.z, h: c.h });
    }
  }

  // --- drivers ---

  const frameQ = new THREE.Quaternion();
  const jointParentQ = new THREE.Quaternion();
  const jointQ = new THREE.Quaternion();
  const jointTurn = new THREE.Quaternion();
  const jointAxis = new THREE.Vector3();

  // Turns a bone by `angle` about an axis given in the frame of `frame` (x is its left,
  // y up, z forward). About x, a negative angle swings a hanging limb forward.
  function turnJoint(bone, frame, ax, ay, az, angle) {
    frame.getWorldQuaternion(frameQ);
    jointAxis.set(ax, ay, az).applyQuaternion(frameQ);
    jointTurn.setFromAxisAngle(jointAxis, angle);
    bone.parent.getWorldQuaternion(jointParentQ);
    jointQ.copy(jointParentQ).multiply(bone.quaternion).premultiply(jointTurn);
    bone.quaternion.copy(jointParentQ.invert()).multiply(jointQ);
  }

  const aimFrom = new THREE.Vector3();
  const aimTo = new THREE.Vector3();
  const aimWant = new THREE.Vector3();

  // Swings a bone so that it points from its own joint toward its `child` joint along
  // (x, y, z), a direction in the frame of `frame`.
  function aimBone(bone, child, frame, x, y, z) {
    if (!bone || !child) return;
    frame.updateWorldMatrix(true, true);
    bone.getWorldPosition(aimFrom);
    child.getWorldPosition(aimTo);
    aimTo.sub(aimFrom).normalize();
    frame.getWorldQuaternion(frameQ);
    aimWant.set(x, y, z).normalize().applyQuaternion(frameQ);
    jointTurn.setFromUnitVectors(aimTo, aimWant);
    bone.parent.getWorldQuaternion(jointParentQ);
    jointQ.copy(jointParentQ).multiply(bone.quaternion).premultiply(jointTurn);
    bone.quaternion.copy(jointParentQ.invert()).multiply(jointQ);
  }

  // Someone at the wheel (or on the saddle): one of the pedestrian avatars, seated, or a
  // plain figure if those did not load. A bus's driver is hidden behind its dark glass.
  function addDriver(model) {
    if (model.kind === 'bus') return null;
    const figure = new THREE.Group();
    const seat = model.seat || [-0.2, 0.38];
    model.group.add(figure);
    if (npcTemplates.length) {
      const template = pick(npcTemplates);
      const body = THREE.SkeletonUtils.clone(template.scene);
      figure.userData.template = template; // so the same person can be turned out onto the road
      figure.add(body);
      figure.position.set(seat[1], model.seatY - 0.9, seat[0] - 0.12);
      const bone = (name) => body.getObjectByName(name);
      const moto = !!model.moto;
      model.group.updateMatrixWorld(true);
      turnJoint(bone('Bip01_Spine'), figure, 1, 0, 0, moto ? 0.4 : -0.16);
      for (const [side, out] of [['L', 1], ['R', -1]]) {
        const joint = (name) => bone(`Bip01_${side}_${name}`);
        if (moto) {
          // astride: knees out round the tank, feet down on the pegs, hands out to the bars
          aimBone(joint('Thigh'), joint('Calf'), figure, out * 0.3, -0.32, 0.9);
          aimBone(joint('Calf'), joint('Foot'), figure, 0, -0.95, -0.3);
          aimBone(joint('UpperArm'), joint('Forearm'), figure, out * 0.1, -0.45, 0.88);
          aimBone(joint('Forearm'), joint('Hand'), figure, out * 0.05, -0.2, 0.97);
        } else {
          // Below the window line nothing shows, so the legs are tucked away out of sight;
          // the arms come forward and in to the wheel, inside the doors.
          if (joint('Thigh')) joint('Thigh').scale.setScalar(0.01);
          aimBone(joint('UpperArm'), joint('Forearm'), figure, -out * 0.28, -0.52, 0.8);
          aimBone(joint('Forearm'), joint('Hand'), figure, -out * 0.5, 0.06, 0.86);
        }
      }
      return figure;
    }
    const shirt = pick(shirtMats);
    const skin = pick(skinMats);
    const add = (geo, mat, x, y, z, parent = figure) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    add(humanGeo.torso, shirt, 0, 0.5, -0.04).scale.z = 0.62;
    add(humanGeo.head, skin, 0, 0.97, 0).scale.set(0.95, 1.1, 1);
    add(humanGeo.neck, skin, 0, 0.82, -0.02);
    for (const side of [-1, 1]) {
      const upper = add(humanGeo.upperArm, shirt, side * 0.25, 0.72, 0);
      upper.rotation.x = -1.0;
      upper.rotation.z = side * 0.25;
      add(humanGeo.forearm, shirt, 0, -0.3, 0, upper).rotation.x = -0.45;
    }
    figure.position.set(seat[1], model.stats.eye - 1.0, seat[0] - 0.14);
    return figure;
  }

  // ---------- People and dogs ----------

  const walkers = [];
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const skinMats = [0xf1c9a5, 0xd9a47a, 0xa8714a, 0x6f4a32].map(lambert);
  const shirtMats = [0xe63946, 0x3d8bfd, 0xf2b705, 0x2f8f4e, 0xf2f2f2, 0x8e44ad, 0xff7f11, 0x1d3557].map(lambert);
  const trouserMats = [0x23272e, 0x3b4a6b, 0x6b5b4a, 0x4a4f58].map(lambert);
  const furMats = [0x8a5a2b, 0xd9c7a8, 0x2b2620, 0xf2efe8, 0xb5763a].map(lambert);

  const hairMats = [0x1c1612, 0x4a2f1b, 0x8a6a3a, 0xb8b2a8, 0x2b2b2b].map(lambert);
  const shoeMat = lambert(0x18191c);
  // limb shapes hang down from their joint (hip, knee, shoulder, elbow) so they can swing
  const humanGeo = {
    thigh: new THREE.CylinderGeometry(0.092, 0.07, 0.44, 8).translate(0, -0.22, 0),
    shin: new THREE.CylinderGeometry(0.066, 0.05, 0.42, 8).translate(0, -0.21, 0),
    shoe: new THREE.BoxGeometry(0.12, 0.09, 0.27).translate(0, -0.42, 0.05),
    hips: new THREE.CylinderGeometry(0.17, 0.16, 0.2, 10),
    torso: new THREE.CylinderGeometry(0.21, 0.155, 0.58, 10),
    shoulder: new THREE.SphereGeometry(0.08, 8, 6),
    upperArm: new THREE.CylinderGeometry(0.062, 0.052, 0.3, 8).translate(0, -0.15, 0),
    forearm: new THREE.CylinderGeometry(0.05, 0.042, 0.3, 8).translate(0, -0.15, 0),
    hand: new THREE.SphereGeometry(0.055, 8, 6).translate(0, -0.32, 0),
    neck: new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8),
    head: new THREE.SphereGeometry(0.15, 14, 10),
    hair: new THREE.SphereGeometry(0.16, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    eye: new THREE.SphereGeometry(0.018, 6, 4),
  };

  // A rounded figure facing +z (its right side is -x) with knees and elbows. `body` holds
  // everything, so the whole figure can bob and lean. `detail` adds shoes, hands, a neck,
  // shoulders and eyes, which the hero gets and the crowd does without.
  function buildHuman({ shirt, trousers, skin, hair, detail }) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    const add = (geo, mat, x, y, z, parent = body) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const limb = (x, y, upperGeo, lowerGeo, mat, length) => {
      const upper = add(upperGeo, mat, x, y, 0);
      return { upper, lower: add(lowerGeo, mat, 0, -length, 0, upper) };
    };

    // each pair is listed right, then left
    const legs = [-0.1, 0.1].map((x) => limb(x, 0.9, humanGeo.thigh, humanGeo.shin, trousers, 0.44));
    const arms = [-0.25, 0.25].map((x) => limb(x, 1.52, humanGeo.upperArm, humanGeo.forearm, shirt, 0.3));
    add(humanGeo.hips, trousers, 0, 0.94, 0).scale.z = 0.68;
    add(humanGeo.torso, shirt, 0, 1.3, 0).scale.z = 0.62;
    add(humanGeo.head, skin, 0, 1.79, 0).scale.set(0.95, 1.1, 1);
    const cap = add(humanGeo.hair, hair, 0, 1.8, -0.005);
    cap.scale.set(0.97, 1.1, 1.02);
    cap.rotation.x = -0.25;

    if (detail) {
      add(humanGeo.neck, skin, 0, 1.63, 0);
      for (const leg of legs) add(humanGeo.shoe, shoeMat, 0, 0, 0, leg.lower);
      for (const arm of arms) {
        add(humanGeo.shoulder, shirt, 0, 0, 0, arm.upper);
        add(humanGeo.hand, skin, 0, 0, 0, arm.lower);
      }
      for (const x of [-0.055, 0.055]) add(humanGeo.eye, shoeMat, x, 1.81, 0.137);
    }
    return { group, body, legs, arms };
  }

  // Poses a figure for one instant of a walk or run cycle and eases toward it, so starting,
  // stopping and changing pace blend rather than snap. `move` is 0 standing to 1 moving,
  // `run` is 0 walking to 1 sprinting. An arm with `locked` set is left for the caller.
  function animateGait(m, phase, move, run, dt, airborne = false) {
    const ease = Math.min(1, 14 * dt);
    const to = (part, axis, value) => { part.rotation[axis] += (value - part.rotation[axis]) * ease; };
    const stride = (0.55 + 0.45 * run) * move;

    m.legs.forEach((leg, i) => {
      const t = phase + i * Math.PI;
      // the knee folds while the leg swings forward, then straightens to meet the ground
      let hip = -Math.sin(t) * stride;
      let knee = (0.12 + Math.max(0, Math.cos(t)) * (0.9 + 0.9 * run)) * move;
      if (airborne) {
        hip = i ? 0.25 : -0.6;
        knee = i ? 0.9 : 1.1;
      }
      to(leg.upper, 'x', hip);
      to(leg.lower, 'x', knee);
    });
    m.arms.forEach((arm, i) => {
      if (arm.locked) return;
      const t = phase + i * Math.PI;
      // each arm swings against the leg on its own side; runners carry their elbows bent
      to(arm.upper, 'x', airborne ? -0.5 : Math.sin(t) * (0.45 + 0.5 * run) * move);
      to(arm.lower, 'x', -0.06 - (0.15 + 1.25 * run) * move);
    });

    // the body rises and falls twice a stride, leans into a run and twists with the arms
    const bob = (Math.cos(phase * 2) * (0.02 + 0.035 * run) - 0.012 * run) * move;
    m.body.position.y += (bob - m.body.position.y) * ease;
    to(m.body, 'x', (0.04 + 0.2 * run) * move);
    to(m.body, 'y', Math.sin(phase) * (0.06 + 0.08 * run) * move);
  }

  const dogLegGeo = new THREE.BoxGeometry(0.08, 0.3, 0.08).translate(0, -0.15, 0);
  const dogBodyGeo = new THREE.BoxGeometry(0.26, 0.26, 0.75);
  const dogHeadGeo = new THREE.BoxGeometry(0.22, 0.22, 0.26);
  const dogTailGeo = new THREE.BoxGeometry(0.06, 0.06, 0.3);

  // Models face +z. Legs are returned so they can swing.
  // --- pedestrian models ---

  // Pedestrians are drawn with rigged, textured avatars (npc-models.js) when those load;
  // the built-in figure is the fallback. Each template holds the loaded model and its own
  // idle and walk clips; every pedestrian is a clone with its own skeleton and mixer.
  const npcTemplates = [];

  function loadNpcModels() {
    const list = (THREE.GLTFLoader && THREE.SkeletonUtils && window.NPC_MODELS) || [];
    return Promise.all(list.map((entry) => new Promise((ready) => {
      const text = atob(entry.glb);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      new THREE.GLTFLoader().parse(bytes.buffer, '', (gltf) => {
        const skin = (uri, extra = {}) => {
          const map = photoTexture(uri);
          map.flipY = false; // the model's texture coordinates count from the top
          return new THREE.MeshLambertMaterial({ map, skinning: true, ...extra });
        };
        const materials = {
          body: skin(entry.body),
          head: skin(entry.head),
          opacity: skin(entry.opacity, { alphaTest: 0.5, side: THREE.DoubleSide }), // hair and lashes
        };
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.material = materials[o.material.name.split('_').pop()] || materials.body;
          o.castShadow = true;
          o.frustumCulled = false; // its bounds do not follow the animation
        });
        const clips = {};
        for (const [name, clip] of Object.entries(entry.clips)) {
          clips[name] = new THREE.AnimationClip(name, clip.duration, clip.tracks.map((t) => (t.path === 'q'
            ? new THREE.QuaternionKeyframeTrack(`${t.bone}.quaternion`, clip.times, t.values)
            : new THREE.VectorKeyframeTrack(`${t.bone}.position`, clip.times, t.values))));
        }
        npcTemplates.push({ scene: gltf.scene, clips });
        ready();
      }, (error) => {
        console.warn(`Pedestrian model ${entry.name} failed to load.`, error);
        ready();
      });
    })));
  }

  function createPerson(template = npcTemplates.length ? pick(npcTemplates) : null) {
    if (template) {
      const group = new THREE.Group();
      const body = THREE.SkeletonUtils.clone(template.scene);
      group.add(body);
      group.scale.setScalar(rand(0.95, 1.03));
      const mixer = new THREE.AnimationMixer(body);
      const walk = mixer.clipAction(template.clips.walk);
      const idle = mixer.clipAction(template.clips.idle);
      walk.play();
      idle.play();
      walk.time = Math.random(); // out of step with one another
      return { group, skin: { mixer, walk, idle }, stride: 4.2, isPerson: true };
    }
    const model = buildHuman({
      shirt: pick(shirtMats),
      trousers: pick(trouserMats),
      skin: pick(skinMats),
      hair: pick(hairMats),
      detail: false,
    });
    model.group.scale.setScalar(rand(0.86, 1.0));
    return { ...model, stride: 4.2, isPerson: true };
  }

  function createDog() {
    const group = new THREE.Group();
    const fur = pick(furMats);
    const legs = [[-0.1, 0.27], [0.1, 0.27], [-0.1, -0.27], [0.1, -0.27]].map(([x, z]) => {
      const leg = new THREE.Mesh(dogLegGeo, fur);
      leg.position.set(x, 0.3, z);
      return leg;
    });
    const body = new THREE.Mesh(dogBodyGeo, fur);
    body.position.y = 0.42;
    const head = new THREE.Mesh(dogHeadGeo, fur);
    head.position.set(0, 0.6, 0.46);
    const tail = new THREE.Mesh(dogTailGeo, fur);
    tail.position.set(0, 0.6, -0.48);
    tail.rotation.x = 0.8;
    group.add(...legs, body, head, tail);
    group.scale.setScalar(rand(0.9, 1.3));
    // diagonal legs move together: swap so index parity matches the swing sign
    return { group, legs: [legs[0], legs[1], legs[3], legs[2]], stride: 9 };
  }

  // Walkers loop around the edge of a block, between the buildings and the kerb.
  function spawnWalkers(count, create, minSpeed, maxSpeed) {
    for (let n = 0; n < count; n++) {
      const block = pick(cityBlocks);
      const half = rand(27.7, 29.4);
      const w = create();
      Object.assign(w, {
        cx: block.x,
        gy: block.y,
        cz: block.z,
        half,
        s: Math.random() * half * 8,
        speed: rand(minSpeed, maxSpeed) * (Math.random() < 0.5 ? 1 : -1),
        phase: Math.random() * 6,
        // health and what it is doing: 'walk', 'stagger', 'fall', 'down', 'rise' or 'dead'
        health: 100, state: 'walk', timer: 0, tip: 0, tipSign: 1, dying: false, moving: 1,
      });
      w.group.rotation.order = 'YXZ'; // turn to face, then tip over forwards or backwards
      scene.add(w.group);
      walkers.push(w);
    }
  }

  const onFeet = (w) => w.state === 'walk' || w.state === 'stagger' || w.state === 'goto';

  // Hurts a pedestrian or dog. (dirX, dirZ) is the way the blow was travelling. Light hits
  // make them stagger; a hard knock or low health puts them on the ground, and they get
  // back up and limp on if they still have health left. Returns true if they went down.
  function hurtWalker(w, damage, dirX, dirZ, knockDown = false) {
    if (!onFeet(w)) return false;
    w.health -= w.isPerson ? damage : 0; // dogs are only ever bowled over
    const facing = w.group.rotation.y;
    // pushed along the way they face: they pitch forward; otherwise they go over backwards
    w.tipSign = dirX * Math.sin(facing) + dirZ * Math.cos(facing) >= 0 ? 1 : -1;
    w.dying = w.health <= 0;
    if (w.dying || knockDown || w.health < 40 || !w.isPerson) {
      w.state = 'fall';
      return true;
    }
    w.state = 'stagger';
    w.timer = 0.7;
    return false;
  }

  function updateWalkers(dt) {
    for (const w of walkers) {
      const g = w.group;
      if (w.state === 'walk') {
        const side = w.half * 2;
        const lap = side * 4;
        w.s = (((w.s + w.speed * dt) % lap) + lap) % lap;
        const edge = Math.floor(w.s / side);
        const r = (w.s % side) - w.half;
        const [dx, dz] = DIRS[edge];
        // edge 0 runs +x along the block's -z side, then each edge turns right
        const sign = Math.sign(w.speed);
        g.position.set(w.cx + dx * r + dz * w.half, w.gy, w.cz + dz * r - dx * w.half);
        g.rotation.set(0, Math.atan2(dx * sign, dz * sign), 0);
        w.phase += Math.abs(w.speed) * w.stride * dt;
      } else {
        w.timer -= dt;
        if (w.state === 'stagger') {
          // a flinch away from the blow, then carry on
          g.rotation.x = w.tipSign * Math.sin((1 - Math.max(0, w.timer) / 0.7) * Math.PI) * 0.22;
          if (w.timer <= 0) w.state = w.away ? 'goto' : 'walk';
        } else if (w.state === 'goto') {
          // off its pavement (turned out of a car): walk back to it, then carry on round
          const dx = w.tx - g.position.x;
          const dz = w.tz - g.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3) {
            w.away = false;
            w.state = 'walk';
          } else {
            const step = Math.min(d, 2.3 * dt);
            g.position.x += (dx / d) * step;
            g.position.z += (dz / d) * step;
            g.position.y = w.gy - (w.gy - w.baseY) * Math.min(1, d / 2); // up the kerb at the end
            g.rotation.set(0, Math.atan2(dx, dz), 0);
          }
        } else if (w.state === 'fall') {
          w.tip = Math.min(1, w.tip + (0.9 + 4 * w.tip) * dt); // slow to start, then drops
          if (w.tip >= 1) {
            w.state = w.dying ? 'dead' : 'down';
            w.timer = w.dying ? 30 : rand(4, 7);
          }
        } else if (w.state === 'down') {
          if (w.timer <= 0) w.state = 'rise';
        } else if (w.state === 'rise') {
          w.tip = Math.max(0, w.tip - 0.8 * dt);
          if (w.tip <= 0) {
            w.state = w.away ? 'goto' : 'walk';
            if (w.isPerson && !w.limping) {
              w.limping = true; // hurt: slower from now on
              w.speed *= 0.6;
            }
          }
        } else if (w.timer <= 0) {
          // 'dead': after a while the body is cleared and someone new walks another street
          const block = pick(cityBlocks);
          Object.assign(w, { cx: block.x, gy: block.y, cz: block.z, s: Math.random() * w.half * 8,
            health: 100, state: 'walk', tip: 0, dying: false, limping: false, away: false });
          w.speed = rand(1.1, 1.8) * Math.sign(w.speed);
        }
        if (w.state !== 'stagger' && w.state !== 'goto') {
          g.rotation.x = w.tipSign * w.tip * Math.PI / 2;
          g.position.y = (w.away ? w.baseY : w.gy) + 0.14 * w.tip; // lying on the ground, not sunk into it
        }
      }

      const walking = w.state === 'walk' || w.state === 'goto';
      w.moving += ((walking ? 1 : 0) - w.moving) * Math.min(1, 8 * dt);
      if (w.skin) {
        // only people near the player are drawn and animated
        g.visible = Math.abs(g.position.x - car.x) < 140 && Math.abs(g.position.z - car.z) < 140;
        if (g.visible) {
          w.skin.walk.setEffectiveWeight(w.moving);
          w.skin.idle.setEffectiveWeight(1 - w.moving);
          w.skin.walk.timeScale = (w.state === 'goto' ? 2.3 : Math.abs(w.speed)) / 1.45; // feet in step with the ground
          w.skin.mixer.update(dt);
        }
      } else if (w.isPerson) {
        animateGait(w, w.phase, w.moving, 0, dt);
      } else if (walking) {
        const swing = Math.sin(w.phase) * 0.6;
        w.legs.forEach((leg, i) => {
          leg.rotation.x = i % 2 ? -swing : swing;
        });
      }
    }
  }

  // ---------- Birds ----------

  const birds = [];
  const birdBodyGeo = new THREE.BoxGeometry(0.3, 0.25, 1.1);
  const wingGeo = new THREE.BoxGeometry(1.5, 0.05, 0.6).translate(0.75, 0, 0);
  const birdMats = [0x2b2f38, 0xf2f2f2, 0x5a6470].map(lambert);

  function spawnBirds() {
    for (let n = 0; n < BIRDS; n++) {
      const mat = pick(birdMats);
      const group = new THREE.Group();
      const wings = [1, -1].map((side) => {
        const wing = new THREE.Mesh(wingGeo, mat);
        wing.scale.x = side;
        return wing;
      });
      group.add(new THREE.Mesh(birdBodyGeo, mat), ...wings);
      scene.add(group);
      const radius = rand(25, 90);
      birds.push({
        group,
        wings,
        cx: rand(-HALF, HALF),
        cz: rand(-HALF, HALF),
        radius,
        height: rand(50, 80),
        angle: Math.random() * Math.PI * 2,
        spin: (rand(8, 13) / radius) * (Math.random() < 0.5 ? 1 : -1),
        flap: rand(7, 10),
        phase: Math.random() * 6,
      });
    }
  }

  function updateBirds(dt) {
    for (const b of birds) {
      if (b.falling) {
        // shot down: drops, lies on the ground for a while, then takes off again
        const pos = b.group.position;
        if (pos.y > 0.3) {
          b.vy -= GRAVITY * dt;
          pos.y = Math.max(0.3, pos.y + b.vy * dt);
          b.group.rotation.z += 7 * dt;
        } else {
          b.rest += dt;
          if (b.rest > 6) {
            b.falling = false;
            b.group.rotation.z = 0;
          }
        }
        continue;
      }
      b.angle += b.spin * dt;
      b.phase += b.flap * dt;
      const cos = Math.cos(b.angle);
      const sin = Math.sin(b.angle);
      b.group.position.set(
        b.cx + cos * b.radius,
        b.height + Math.sin(b.phase * 0.13) * 3,
        b.cz + sin * b.radius
      );
      b.group.rotation.y = Math.atan2(-sin * b.spin, cos * b.spin);
      const flap = Math.sin(b.phase) * 0.7;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
  }

  // ---------- Hill animals ----------

  const animals = [];
  // girth and length of the body, leg length and thickness, neck [length, lean forward],
  // head size, then how it moves: walk and run speeds, and how close you get before it bolts
  const SPECIES = [
    { name: 'deer', count: 9, girth: 0.29, length: 1.15, leg: 0.85, legR: 0.05, neck: [0.6, 0.5], head: 0.16,
      color: 0x9a6a3c, tail: [0.16, 0.05, 0.9], ears: 'point', horns: 'antlers', graze: true, walk: 1.4, run: 11, flee: 24 },
    { name: 'goat', count: 7, girth: 0.27, length: 0.9, leg: 0.58, legR: 0.05, neck: [0.34, 0.45], head: 0.15,
      color: 0xe6e1d6, tail: [0.12, 0.04, -0.6], ears: 'point', horns: 'horns', graze: true, walk: 1.2, run: 8, flee: 17 },
    { name: 'bear', count: 3, girth: 0.56, length: 1.45, leg: 0.68, legR: 0.14, neck: [0.3, 1.15], head: 0.3,
      color: 0x4a2f1b, tail: [0.1, 0.07, 0.4], ears: 'round', horns: null, graze: false, walk: 1.1, run: 0, flee: 0 },
    { name: 'wolf', count: 5, girth: 0.23, length: 0.95, leg: 0.58, legR: 0.045, neck: [0.3, 0.85], head: 0.16,
      color: 0x7d8087, tail: [0.5, 0.08, 1.0], ears: 'point', horns: null, graze: false, walk: 1.8, run: 10, flee: 13 },
  ];

  // A four-legged animal facing +z, built from the species' proportions.
  function createAnimal(sp) {
    const coat = lambert(sp.color);
    const dark = lambert(0x1c1612);
    const group = new THREE.Group();
    const add = (geo, mat, x, y, z, parent = group) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const g = sp.girth;
    const half = sp.length / 2;
    const back = sp.leg + g * 0.85; // height of the middle of the body

    add(new THREE.CylinderGeometry(g, g * 0.94, sp.length, 12).rotateX(Math.PI / 2), coat, 0, back, 0);
    add(new THREE.SphereGeometry(g * 1.03, 12, 9), coat, 0, back, half * 0.95);
    add(new THREE.SphereGeometry(g * 1.0, 12, 9), coat, 0, back, -half * 0.95);

    const [neckLength, lean] = sp.neck;
    const neck = new THREE.Group();
    neck.position.set(0, back + g * 0.35, half);
    neck.rotation.x = lean;
    group.add(neck);
    add(new THREE.CylinderGeometry(sp.head * 0.75, g * 0.62, neckLength, 10).translate(0, neckLength / 2, 0), coat, 0, 0, 0, neck);

    // the head's own +y runs forward along the muzzle; its -z is the top of the skull
    const head = new THREE.Group();
    head.position.y = neckLength;
    head.rotation.x = Math.PI / 2 - lean + 0.35;
    neck.add(head);
    const s = sp.head;
    add(new THREE.SphereGeometry(s, 12, 9), coat, 0, s * 0.5, 0, head).scale.set(0.9, 1.2, 0.95);
    add(new THREE.CylinderGeometry(s * 0.5, s * 0.36, s * 1.1, 10).translate(0, s * 1.6, 0), coat, 0, 0, s * 0.12, head);
    add(new THREE.SphereGeometry(s * 0.2, 8, 6), dark, 0, s * 2.15, s * 0.1, head); // nose
    for (const side of [-1, 1]) {
      add(new THREE.SphereGeometry(s * 0.13, 8, 6), dark, side * s * 0.72, s * 0.75, -s * 0.2, head); // eye
      if (sp.ears === 'round') {
        add(new THREE.SphereGeometry(s * 0.3, 8, 6), coat, side * s * 0.62, s * 0.1, -s * 0.72, head);
      } else {
        add(new THREE.ConeGeometry(s * 0.26, s * 0.85, 6).rotateX(-Math.PI / 2), coat, side * s * 0.6, s * 0.05, -s * 0.95, head)
          .rotation.y = -side * 0.4;
      }
      if (sp.horns === 'horns') {
        // short horns sweeping back
        add(new THREE.ConeGeometry(0.035, 0.36, 6).rotateX(-Math.PI / 2 - 0.7), dark, side * 0.06, s * 0.15, -s * 1.15, head);
      } else if (sp.horns === 'antlers') {
        const beam = new THREE.Group();
        beam.position.set(side * 0.06, s * 0.2, -s * 0.8);
        beam.rotation.y = -side * 0.5; // splayed outward
        head.add(beam);
        const bone = lambert(0xcbb894);
        const spike = (length, y, z, tilt) => {
          const tine = add(new THREE.CylinderGeometry(0.012, 0.022, length, 5).translate(0, length / 2, 0), bone, 0, y, z, beam);
          tine.rotation.x = tilt;
        };
        spike(0.6, 0, 0, -Math.PI / 2 + 0.25); // main beam, rising from the skull
        spike(0.22, 0.06, -0.2, -0.5);
        spike(0.24, 0.12, -0.4, -0.7);
      }
    }

    // legs hang from the shoulder and hip so they can swing: fore left, fore right, hind left, hind right
    const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z]) =>
      add(new THREE.CylinderGeometry(sp.legR * 1.5, sp.legR, sp.leg, 8).translate(0, -sp.leg / 2, 0), coat,
        x * g * 0.55, sp.leg + g * 0.2, z * half * 0.85));

    const [tailLength, tailR, droop] = sp.tail;
    const tail = add(new THREE.CylinderGeometry(tailR, tailR * 0.4, tailLength, 8).translate(0, -tailLength / 2, 0), coat,
      0, back + g * 0.5, -half - g * 0.7);
    tail.rotation.x = droop;

    group.scale.setScalar(rand(0.9, 1.15));
    scene.add(group);
    return { group, neck, legs, tail, restLean: lean };
  }

  // Somewhere to wander to: on a slope, off the road, not too far from the animal's home.
  function roam(a) {
    for (let tries = 0; tries < 12; tries++) {
      const x = a.homeX + rand(-40, 40);
      const z = a.homeZ + rand(-40, 40);
      if (naturalHeight(x, z) < 3) continue;
      terrain(x, z);
      if (roadDist < 10) continue;
      a.tx = x;
      a.tz = z;
      return;
    }
    a.tx = a.homeX;
    a.tz = a.homeZ;
  }

  function spawnAnimals() {
    const b = HILL_BOUNDS;
    for (const sp of SPECIES) {
      for (let n = 0; n < sp.count; n++) {
        let x;
        let z;
        do {
          x = rand(b.minX, b.maxX);
          z = rand(b.minZ, b.maxZ);
        } while (naturalHeight(x, z) < 6 || (terrain(x, z), roadDist < 12));
        const a = {
          ...createAnimal(sp), sp, x, z, y: 0, homeX: x, homeZ: z, h: Math.random() * 6,
          speed: 0, phase: 0, pause: rand(0, 5), fleeing: 0, down: 0,
        };
        roam(a);
        animals.push(a);
      }
    }
  }

  function updateAnimals(dt) {
    const playerSpeed = Math.hypot(car.vx, car.vz);
    for (const a of animals) {
      if (a.down > 0) {
        a.down -= dt;
        if (a.down <= 0) a.group.rotation.z = 0; // back on its feet
        continue;
      }
      const sp = a.sp;
      const dx = car.x - a.x;
      const dz = car.z - a.z;
      const dist = Math.hypot(dx, dz) || 1;

      // run straight away from anything that comes too close
      if (sp.flee && dist < sp.flee && Math.abs(car.y - a.y) < 15) {
        a.tx = a.x - (dx / dist) * 30;
        a.tz = a.z - (dz / dist) * 30;
        a.pause = 0;
        a.fleeing = 1.5;
      }
      a.fleeing = Math.max(0, a.fleeing - dt);
      // ...but not off the hills: turn for home at the foot of the slope
      if (naturalHeight(a.x, a.z) < 1.5) {
        a.tx = a.homeX;
        a.tz = a.homeZ;
      }

      let goal = 0;
      if (a.pause > 0) {
        a.pause -= dt;
      } else {
        const ex = a.tx - a.x;
        const ez = a.tz - a.z;
        if (Math.hypot(ex, ez) < 1.5) {
          a.pause = rand(2, 7); // stop to graze or look around
          roam(a);
        } else {
          goal = a.fleeing > 0 ? sp.run : sp.walk;
          const turn = wrapAngle(Math.atan2(ex, ez) - a.h);
          a.h += Math.max(-3.5 * dt, Math.min(3.5 * dt, turn));
        }
      }
      a.speed = approach(a.speed, goal, 9 * dt);
      a.x += Math.sin(a.h) * a.speed * dt;
      a.z += Math.cos(a.h) * a.speed * dt;
      a.y = terrain(a.x, a.z);
      a.group.position.set(a.x, a.y, a.z);
      a.group.rotation.y = a.h;

      // diagonal legs move together; the stride lengthens with speed
      a.phase += (a.speed / sp.leg) * 2.6 * dt;
      const swing = a.speed > 0.1 ? Math.sin(a.phase) * Math.min(0.75, 0.3 + a.speed * 0.045) : 0;
      a.legs.forEach((leg, i) => {
        leg.rotation.x = i === 0 || i === 3 ? swing : -swing;
      });
      const lean = a.restLean + (sp.graze && a.pause > 0 ? 1.25 : 0) + (a.fleeing > 0 ? 0.3 : 0);
      a.neck.rotation.x += (lean - a.neck.rotation.x) * Math.min(1, 3 * dt);

      // knocked over by a car
      if (mode === 'car' && dist < 2 && playerSpeed > 3 && Math.abs(car.y - a.y) < 1.5) {
        a.down = KNOCKED_SECONDS;
        a.group.rotation.z = Math.PI / 2;
      }
    }
  }

  // ---------- Player state ----------

  const keys = new Set();
  // `car` is the player's body in the world: the vehicle being driven, or the hero on foot.
  const car = {
    x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0, steer: 0, pitch: 0,
    nitro: 1, nitroLocked: false, boosting: false,
  };
  let mode = 'foot'; // 'foot' | 'car'
  let player;
  let target = null;
  let targetPad;
  let targetBeacon;
  let parkedCount = 0;
  let parkTimer = 0;
  let toastTimer = 0;
  let insideView = false;

  function setInsideView(on) {
    insideView = on;
    player.cabin.visible = !on;
    if (!player.interiorAlways) player.interior.visible = on;
    hero.model.group.visible = !on; // the camera sits where his head is
    if (player.glass) player.glass.material = on ? glassClear : player.glassMaterial; // see out from the driver's seat
    camera.near = on ? 0.15 : 0.5;
    camera.updateProjectionMatrix();
    updateCamera(0, Math.hypot(car.vx, car.vz), true);
  }

  function resetCar() {
    Object.assign(car, START, { y: 0, vx: 0, vy: 0, vz: 0, steer: 0, pitch: 0 });
    if (mode === 'foot') {
      car.x += 3; // stand beside the starting car rather than inside it
      hero.yaw = hero.facing = START.heading;
      hero.pitch = 0;
    }
  }

  function chooseTarget() {
    const free = bays.filter((b) => !b.taken && b !== target);
    target = pick(free);
    targetPad.position.set(target.x, 0.12, target.z);
    targetBeacon.position.set(target.x, 20, target.z);
  }

  function showToast(text, bad = false) {
    $('toast').textContent = text;
    $('toast').classList.toggle('bad', bad);
    $('toast').hidden = false;
    toastTimer = 1.8;
  }

  // ---------- Wanted level and police ----------

  const police = [];
  let wanted = 0;
  let escapeTimer = 0;
  let bustTimer = 0;

  const roadIndex = (v) => Math.max(0, Math.min(BLOCKS, Math.round((v + HALF - ROAD_WIDTH / 2) / CELL)));
  const onRoad = (v) => Math.abs(v - roadCenter(roadIndex(v))) < ROAD_WIDTH / 2;
  // is (x, z) on the tarmac of some street, at least `margin` in from the kerb?
  const onStreet = (x, z, margin) => Math.abs(x - roadCenter(roadIndex(x))) < ROAD_WIDTH / 2 - margin
    || Math.abs(z - roadCenter(roadIndex(z))) < ROAD_WIDTH / 2 - margin;
  // how far a vehicle sags to one side on flat tyres
  const flatLean = (model) => (model.flats || []).reduce((lean, f) => lean - f.side * 0.028, 0);
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function setWanted(level) {
    wanted = Math.max(0, Math.min(MAX_WANTED, level));
    escapeTimer = 0;
    bustTimer = 0;
    $('stars').hidden = wanted === 0;
    $('stars').textContent = '★'.repeat(wanted) + '☆'.repeat(MAX_WANTED - wanted);

    const needed = Math.min(wanted, MAX_POLICE);
    police.forEach((p, i) => {
      if (i < needed && !p.active) deployPolice(p);
      if (i >= needed && p.active) parkPolice(p);
    });
  }

  function buildPolice() {
    for (let n = 0; n < MAX_POLICE; n++) {
      const model = createCar(0xf4f6f8, 'sedan');
      addPoliceLook(model);
      addDriver(model);
      addBeam(model);
      const p = { model, box: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 1.6, owner: model }, x: 0, z: 0, h: 0, speed: 0 };
      policeBoxes.push(p.box);
      police.push(p);
      parkPolice(p);
    }
  }

  function parkPolice(p) {
    p.active = false;
    p.model.group.visible = false;
    p.box.minX = p.box.maxX = p.box.minZ = p.box.maxZ = 1e9;
  }

  // Police arrive from an intersection a few blocks away from the player.
  function deployPolice(p) {
    const spots = [];
    for (let i = 0; i <= BLOCKS; i++) {
      for (let j = 0; j <= BLOCKS; j++) {
        const dist = Math.hypot(roadCenter(i) - car.x, roadCenter(j) - car.z);
        if (dist > 100 && dist < 230) spots.push([roadCenter(i), roadCenter(j)]);
      }
    }
    const [x, z] = pick(spots);
    Object.assign(p, { x, z, speed: 0, stuck: 0, reverse: 0, active: true });
    p.h = Math.atan2(car.x - x, car.z - z);
    p.model.group.visible = true;
  }

  // Where a police car should steer: straight at the player when close or on the same
  // road, otherwise at the intersection that brings it nearer along the street grid.
  function chasePoint(p, dist) {
    const sameRoad =
      (onRoad(p.x) && onRoad(car.x) && roadIndex(p.x) === roadIndex(car.x)) ||
      (onRoad(p.z) && onRoad(car.z) && roadIndex(p.z) === roadIndex(car.z));
    if (dist < 45 || sameRoad) return [car.x, car.z];

    const ni = roadIndex(p.x);
    const nj = roadIndex(p.z);
    const fi = (p.x + HALF - ROAD_WIDTH / 2) / CELL;
    const fj = (p.z + HALF - ROAD_WIDTH / 2) / CELL;
    let nodes;
    if (Math.hypot(p.x - roadCenter(ni), p.z - roadCenter(nj)) < 7) {
      nodes = DIRS.map(([dx, dz]) => [ni + dx, nj + dz]);
    } else if (onRoad(p.x)) {
      nodes = [[ni, Math.floor(fj)], [ni, Math.ceil(fj)]];
    } else if (onRoad(p.z)) {
      nodes = [[Math.floor(fi), nj], [Math.ceil(fi), nj]];
    } else {
      nodes = [[Math.floor(fi), Math.floor(fj)], [Math.ceil(fi), Math.floor(fj)],
        [Math.floor(fi), Math.ceil(fj)], [Math.ceil(fi), Math.ceil(fj)]];
    }

    let best = [car.x, car.z];
    let bestDist = Infinity;
    for (const [i, j] of nodes) {
      if (!inGrid(i, j)) continue;
      const d = Math.hypot(roadCenter(i) - car.x, roadCenter(j) - car.z);
      if (d < bestDist) {
        bestDist = d;
        best = [roadCenter(i), roadCenter(j)];
      }
    }
    return best;
  }

  function updatePolice(dt, playerSpeed) {
    if (wanted === 0) return;
    const top = POLICE_BASE_SPEED + POLICE_SPEED_PER_STAR * wanted;
    const flash = Math.floor(clock * 5) % 2 === 0;
    let nearest = Infinity;

    for (const p of police) {
      if (!p.active) continue;
      const dist = Math.hypot(car.x - p.x, car.z - p.z);
      nearest = Math.min(nearest, dist);

      const [tx, tz] = chasePoint(p, dist);
      const error = wrapAngle(Math.atan2(tx - p.x, tz - p.z) - p.h);

      if (p.reverse > 0) {
        // back away from whatever it got stuck on, swinging the nose toward the target
        p.reverse -= dt;
        p.speed = approach(p.speed, -8, 30 * dt);
        p.h -= Math.sign(error) * 1.2 * dt;
      } else {
        let goal = Math.abs(error) > 0.6 ? top * 0.45 : top;
        if (dist < 9) goal = Math.min(goal, playerSpeed + 4);
        if (dist < 4.6) goal = 0;
        p.speed = approach(p.speed, goal, (goal < p.speed ? 30 : 14) * dt);
        const maxTurn = 2.6 * Math.min(1, Math.abs(p.speed) / 5) * dt;
        p.h += Math.max(-maxTurn, Math.min(maxTurn, error));
      }

      p.x += Math.sin(p.h) * p.speed * dt;
      p.z += Math.cos(p.h) * p.speed * dt;

      // one circle against buildings, trees, parked cars and traffic
      let touching = false;
      for (const box of colliders.concat(trafficBoxes)) {
        if ((box.minY ?? -Infinity) > 1.5) continue; // overhead, police stay on the ground
        const touch = boxContact(box, p.x, p.z, 1.4);
        if (!touch) continue;
        p.x += touch.nx * (1.4 - touch.dist);
        p.z += touch.nz * (1.4 - touch.dist);
        touching = true;
      }
      if (touching) p.speed *= Math.exp(-2 * dt);

      const crawling = Math.abs(p.speed) < 2 && dist > 6 && p.reverse <= 0;
      p.stuck = crawling ? p.stuck + dt : 0;
      if (p.stuck > 1.2) {
        p.stuck = 0;
        p.reverse = 1;
      }

      p.model.group.position.set(p.x, terrain(p.x, p.z), p.z);
      p.model.group.rotation.y = p.h;
      p.model.bar[0].color.setHex(flash ? 0xff2020 : 0x400808);
      p.model.bar[1].color.setHex(flash ? 0x081040 : 0x2060ff);
      const [hx, hz] = footprint(p.model, p.h);
      p.box.minX = p.x - hx;
      p.box.maxX = p.x + hx;
      p.box.minZ = p.z - hz;
      p.box.maxZ = p.z + hz;
      p.box.car = { x: p.x, z: p.z, h: p.h, ...p.model.dims };
    }

    // stopped next to a police car for too long: arrested
    bustTimer = nearest < 8 && playerSpeed < 2 ? bustTimer + dt : 0;
    if (bustTimer > BUST_SECONDS) {
      setWanted(0);
      resetCar();
      updateCamera(0, 0, true);
      showToast('BUSTED!', true);
      return;
    }

    escapeTimer = nearest > ESCAPE_DISTANCE ? escapeTimer + dt : 0;
    if (escapeTimer > ESCAPE_SECONDS) {
      setWanted(0);
      showToast('You lost the police');
    }
  }

  // Running into a pedestrian knocks them down and adds a star.
  function checkPedestrianHits(playerSpeed) {
    if (playerSpeed < 3) return;
    const fx = Math.sin(car.heading) * (player.dims.hl - player.dims.hw);
    const fz = Math.cos(car.heading) * (player.dims.hl - player.dims.hw);
    for (const w of walkers) {
      if (!onFeet(w)) continue;
      const px = w.group.position.x;
      const pz = w.group.position.z;
      if (Math.abs(px - car.x) > 4 || Math.abs(pz - car.z) > 4) continue;
      const front = Math.hypot(px - car.x - fx, pz - car.z - fz);
      const rear = Math.hypot(px - car.x + fx, pz - car.z + fz);
      if (Math.min(front, rear) > player.dims.hw + 0.4) continue;
      // a tap staggers them; any real speed throws them down, and a fast hit kills
      hurtWalker(w, playerSpeed * 7, car.vx, car.vz, playerSpeed > 5);
      if (!w.isPerson) continue;
      setWanted(wanted + 1);
      showToast(wanted === 1 ? 'Wanted! Police are coming' : 'Wanted level up', true);
    }
  }

  // ---------- Map, waypoint and route ----------

  // One picture of the whole world (city and hills) is drawn once at a pixel per metre.
  // The round minimap shows the part around the player; the full map shows all of it and
  // takes clicks to set a waypoint. Seen from above with +z up the screen, +x runs left.
  const MAP_WORLD = { minX: -520, maxX: 540, minZ: -300, maxZ: 880 };
  const MAP_VIEW = 240; // metres across the minimap
  const mapCanvas = $('map');
  const mapCtx = mapCanvas.getContext('2d');
  const mapBase = document.createElement('canvas');
  const bigCanvas = $('bigmap');
  const bigCtx = bigCanvas.getContext('2d');
  const baseX = (x) => MAP_WORLD.maxX - x;
  const baseY = (z) => MAP_WORLD.maxZ - z;
  let mapOpen = false;

  function buildMap() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mapCanvas.width = mapCanvas.height = MAP_SIZE * dpr;
    mapCtx.scale(dpr, dpr);
    mapBase.width = MAP_WORLD.maxX - MAP_WORLD.minX;
    mapBase.height = MAP_WORLD.maxZ - MAP_WORLD.minZ;
    const g = mapBase.getContext('2d');
    g.fillStyle = '#5f9a55';
    g.fillRect(0, 0, mapBase.width, mapBase.height);

    // hills: paler toward each summit
    for (const hill of HILLS) {
      const shade = g.createRadialGradient(baseX(hill.x), baseY(hill.z), hill.r * 0.1, baseX(hill.x), baseY(hill.z), hill.r);
      shade.addColorStop(0, 'rgba(196,186,140,0.9)');
      shade.addColorStop(1, 'rgba(120,150,95,0)');
      g.fillStyle = shade;
      g.beginPath();
      g.arc(baseX(hill.x), baseY(hill.z), hill.r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#3d424b';
    g.lineWidth = 11;
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    g.moveTo(baseX(hillRoad[0].x), baseY(HALF - 2));
    for (const p of hillRoad) g.lineTo(baseX(p.x), baseY(p.z));
    g.stroke();

    g.fillStyle = '#3d424b';
    g.fillRect(baseX(HALF), baseY(HALF), WORLD, WORLD);
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let bx = 0; bx < BLOCKS; bx++) {
      for (let bz = 0; bz < BLOCKS; bz++) {
        const x = baseX(blockCenter(bx));
        const y = baseY(blockCenter(bz));
        const isLot = PARKING_LOTS.some(([lx, lz]) => lx === bx && lz === bz);
        const isParkade = bx === PARKADE[0] && bz === PARKADE[1];
        g.fillStyle = isLot ? '#2c5fa8' : isParkade ? '#1b3f73' : '#a9aeb6';
        g.fillRect(x - BLOCK_SIZE / 2, y - BLOCK_SIZE / 2, BLOCK_SIZE, BLOCK_SIZE);
        if (isLot || isParkade) {
          g.fillStyle = '#fff';
          g.fillText('P', x, y + 2);
        }
      }
    }
    // flyover
    g.fillStyle = '#e9c46a';
    g.fillRect(baseX(roadCenter(FLYOVER_TO) - JUNCTION), baseY(roadCenter(FLYOVER_ROW)) - 4,
      roadCenter(FLYOVER_TO) - roadCenter(FLYOVER_FROM) - JUNCTION * 2, 8);
    g.fillStyle = '#fff';
    g.font = 'bold 22px system-ui, sans-serif';
    g.fillText('LOOKOUT', baseX(HILLS[0].x), baseY(HILLS[0].z) - 34);
  }

  // --- waypoint and route ---

  let waypoint = null; // { x, z } once set from the full map
  let route = []; // [x, y, z] points from the player to the waypoint, along the roads
  let routeTimer = 0;
  let wayBeacon = null;
  const HILL_GATE = { x: roadCenter(4), z: roadCenter(BLOCKS) }; // where the hill road leaves the city
  const inHills = (z) => z > HALF + 6;

  function nearestOnHillRoad(x, z) {
    let best = 0;
    let bestDist = Infinity;
    hillRoad.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  // Works out the way from the player to the waypoint: along the street grid in the city
  // (to the nearest crossing, along one street, then along the other) and up or down the
  // hill road when either end is out in the hills.
  function planRoute() {
    const points = [[car.x, car.y, car.z]];
    const street = (x, z) => points.push([x, 0, z]);
    const cityLeg = (from, to) => {
      const ax = roadCenter(roadIndex(from.x));
      const az = roadCenter(roadIndex(from.z));
      const bx = roadCenter(roadIndex(to.x));
      const bz = roadCenter(roadIndex(to.z));
      street(ax, az);
      if (ax !== bx && az !== bz) street(bx, az);
      street(bx, bz);
    };
    const hillLeg = (from, to) => {
      const step = from <= to ? 1 : -1;
      for (let i = from; i !== to + step; i += step) points.push([hillRoad[i].x, hillRoad[i].h, hillRoad[i].z]);
    };
    const here = { x: car.x, z: car.z };
    const startInHills = inHills(car.z);
    const endInHills = inHills(waypoint.z);
    if (startInHills && endInHills) {
      hillLeg(nearestOnHillRoad(car.x, car.z), nearestOnHillRoad(waypoint.x, waypoint.z));
    } else if (endInHills) {
      cityLeg(here, HILL_GATE);
      hillLeg(0, nearestOnHillRoad(waypoint.x, waypoint.z));
    } else if (startInHills) {
      hillLeg(nearestOnHillRoad(car.x, car.z), 0);
      cityLeg(HILL_GATE, waypoint);
    } else {
      cityLeg(here, waypoint);
    }
    points.push([waypoint.x, groundAt(waypoint.x, waypoint.z, 200), waypoint.z]);
    route = points;

    if (!wayBeacon) {
      wayBeacon = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xc04dff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
      );
      scene.add(wayBeacon);
    }
    wayBeacon.visible = true;
    const end = points[points.length - 1];
    wayBeacon.position.set(end[0], end[1] + 20, end[2]);
  }

  function setWaypoint(point) {
    waypoint = point;
    routeTimer = 0;
    if (point) {
      planRoute();
    } else {
      route = [];
      if (wayBeacon) wayBeacon.visible = false;
    }
  }

  function updateRoute(dt) {
    if (!waypoint) return;
    if (Math.hypot(waypoint.x - car.x, waypoint.z - car.z) < 7) {
      setWaypoint(null);
      showToast('You have arrived');
      return;
    }
    routeTimer -= dt;
    if (routeTimer <= 0) {
      routeTimer = 0.5;
      planRoute();
    }
  }

  // --- drawing ---

  // Draws the moving things onto a map through `at`, which turns world x, z into canvas
  // coordinates (and may pin far-off markers to the rim).
  function drawMarkers(g, at, size) {
    if (route.length) {
      g.strokeStyle = '#c04dff';
      g.lineWidth = 3.5 * size;
      g.lineJoin = g.lineCap = 'round';
      g.beginPath();
      route.forEach((p, i) => {
        const [x, y] = at(p[0], p[2], false);
        g[i ? 'lineTo' : 'moveTo'](x, y);
      });
      g.stroke();
    }
    const dot = (x, z, radius, color, pin = true) => {
      const [px, py] = at(x, z, pin);
      g.fillStyle = color;
      g.beginPath();
      g.arc(px, py, radius * size, 0, Math.PI * 2);
      g.fill();
    };
    for (const c of traffic) dot(c.x, c.z, 2, '#e8eaee', false);
    dot(target.x, target.z, 5.5, '#10141f');
    dot(target.x, target.z, 4, '#ffcc00');
    if (waypoint) {
      dot(waypoint.x, waypoint.z, 6.5, '#fff');
      dot(waypoint.x, waypoint.z, 5, '#c04dff');
    }
    const flash = Math.floor(clock * 5) % 2 === 0;
    for (const p of police) {
      if (!p.active) continue;
      dot(p.x, p.z, 6, '#fff');
      dot(p.x, p.z, 4.5, flash ? '#ff2020' : '#2060ff');
    }
    // the player: an arrow pointing the way they face
    const [px, py] = at(car.x, car.z, false);
    g.save();
    g.translate(px, py);
    g.rotate(-car.heading);
    g.scale(size, size);
    g.fillStyle = '#e63946';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 7);
    g.lineTo(0, 3.5);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function drawMap() {
    const half = MAP_SIZE / 2;
    const k = MAP_SIZE / MAP_VIEW;
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.arc(half, half, half, 0, Math.PI * 2);
    mapCtx.clip();
    mapCtx.fillStyle = '#5f9a55';
    mapCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    mapCtx.drawImage(mapBase, baseX(car.x) - MAP_VIEW / 2, baseY(car.z) - MAP_VIEW / 2, MAP_VIEW, MAP_VIEW, 0, 0, MAP_SIZE, MAP_SIZE);
    drawMarkers(mapCtx, (x, z, pin) => {
      let dx = -(x - car.x) * k;
      let dy = -(z - car.z) * k;
      const d = Math.hypot(dx, dy);
      if (pin && d > half - 9) { // off the edge: sit on the rim, in its direction
        dx *= (half - 9) / d;
        dy *= (half - 9) / d;
      }
      return [half + dx, half + dy];
    }, 1);
    mapCtx.restore();
    if (mapOpen) drawBigMap();
  }

  function drawBigMap() {
    const scale = bigCanvas.width / mapBase.width;
    bigCtx.drawImage(mapBase, 0, 0, bigCanvas.width, bigCanvas.height);
    drawMarkers(bigCtx, (x, z) => [baseX(x) * scale, baseY(z) * scale], Math.max(1.2, scale * 2.2));
  }

  function toggleBigMap(open) {
    mapOpen = open;
    $('bigmap-wrap').hidden = !open;
    if (!open) return;
    keys.clear();
    if (document.exitPointerLock) document.exitPointerLock();
    // as large as fits the window, at the world's proportions
    const fit = Math.min((window.innerHeight * 0.84) / mapBase.height, (window.innerWidth * 0.9) / mapBase.width);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bigCanvas.style.width = `${mapBase.width * fit}px`;
    bigCanvas.style.height = `${mapBase.height * fit}px`;
    bigCanvas.width = mapBase.width * fit * dpr;
    bigCanvas.height = mapBase.height * fit * dpr;
  }

  mapCanvas.addEventListener('click', () => toggleBigMap(!mapOpen));
  $('gear-button').addEventListener('click', () => toggleSettings(!settingsOpen));
  bigCanvas.addEventListener('click', (e) => {
    const box = bigCanvas.getBoundingClientRect();
    const x = MAP_WORLD.maxX - ((e.clientX - box.left) / box.width) * mapBase.width;
    const z = MAP_WORLD.maxZ - ((e.clientY - box.top) / box.height) * mapBase.height;
    // clicking the waypoint again removes it
    if (waypoint && Math.hypot(waypoint.x - x, waypoint.z - z) < 14) setWaypoint(null);
    else setWaypoint({ x, z });
  });
  $('bigmap-wrap').addEventListener('click', (e) => {
    if (e.target === $('bigmap-wrap')) toggleBigMap(false); // a click outside the map closes it
  });

  // ---------- On foot: hero, vehicles and weapons ----------

  const hero = {
    yaw: 0, pitch: 0, weapon: 'fist', cooldown: 0, punch: 0, phase: 0, run: 0, model: null,
    climb: null, jetpack: false,
    facing: 0, // which way the body is turned; `yaw` is where the camera looks
    wet: 0, strideLeft: 0, foot: 1, // footprints: prints still to leave, distance to the next step, which foot
  };
  const PUNCH_SECONDS = 0.28;
  const arrows = [];
  let tracer;
  let tracerTimer = 0;

  function createHero() {
    const model = buildHuman({
      shirt: lambert(0x20242c), // dark jacket
      trousers: lambert(0x2f4a7a),
      skin: skinMats[1],
      hair: hairMats[0],
      detail: true,
    });
    const [rightArm] = model.arms;

    // Weapons sit in the right hand. The arm hangs along its own -y, so raising it to
    // point forward points them forward too.
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.06), lambert(0x111317));
    barrel.position.set(0, -0.46, 0.07);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.13), lambert(0x111317));
    grip.position.set(0, -0.34, 0.02);
    gun.add(barrel, grip);

    const bowGeo = new THREE.TorusGeometry(0.42, 0.02, 6, 18, Math.PI);
    bowGeo.rotateY(Math.PI / 2); // limbs along the arm's z, which is vertical once raised...
    bowGeo.rotateZ(Math.PI); // ...curving away from the archer
    const bow = new THREE.Mesh(bowGeo, lambert(0x8a5a2b));
    bow.position.y = -0.02;
    rightArm.lower.add(gun, bow);

    // rocket pack: twin tanks on the back with a flame under each
    const pack = new THREE.Group();
    const steel = new THREE.MeshPhongMaterial({ color: 0xb9bec6, shininess: 90 });
    const flames = [];
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.46, 10), steel);
      tank.position.set(side * 0.1, 1.33, -0.21);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 6), lambert(0xc0392b));
      cap.position.set(side * 0.1, 1.56, -0.21);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.1, 10), lambert(0x2a2d33));
      nozzle.position.set(side * 0.1, 1.06, -0.21);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.5, 8).rotateX(Math.PI).translate(0, -0.25, 0),
        new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.9 })
      );
      flame.position.set(side * 0.1, 1.02, -0.21);
      flames.push(flame);
      pack.add(tank, cap, nozzle, flame);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.05), lambert(0x2a2d33));
    plate.position.set(0, 1.33, -0.15);
    pack.add(plate);
    pack.visible = false;
    model.body.add(pack);

    model.group.traverse((o) => { o.castShadow = true; });
    for (const flame of flames) flame.castShadow = false;
    scene.add(model.group);
    return { ...model, gun, bow, pack, flames };
  }

  // ---------- Skinned hero ----------

  // The hero is drawn with a rigged human model when it loads (hero-model.js); the built-in
  // figure above stays as the fallback and as the frame everything hangs on. The model has
  // no motion of its own: idle, walk and run clips come from hero-animations.js, recorded on
  // the same standard skeleton, and are blended by speed. Poses the clips do not cover
  // (aiming, punching, jumping, climbing, riding) are added by turning bones on top.

  const OVERLAY_BONES = {
    spine: 'Spine', armR: 'RightArm', foreR: 'RightForeArm', armL: 'LeftArm', foreL: 'LeftForeArm',
    legR: 'RightUpLeg', kneeR: 'RightLeg', legL: 'LeftUpLeg', kneeL: 'LeftLeg', handR: 'RightHand',
  };
  const POSE_KEYS = ['spine', 'armR', 'foreR', 'armL', 'foreL', 'legR', 'kneeR', 'legL', 'kneeL', 'legSplay', 'armSplay'];

  function loadHeroSkin() {
    if (!THREE.GLTFLoader || !window.HERO_GLB || !window.HERO_CLIPS) return;
    const text = atob(window.HERO_GLB);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);

    new THREE.GLTFLoader().parse(bytes.buffer, '', (gltf) => {
      const root = gltf.scene; // faces +z, like everything else in the game
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.frustumCulled = false; // its bounds do not follow the animation
        // there is no environment to reflect, so treat every surface as matte
        o.material.metalness = 0;
        o.material.metalnessMap = null;
        o.material.roughness = 0.85;
        o.material.roughnessMap = null;
        if (o.material.map) {
          // the renderer does no colour management, so show the texture as painted
          o.material.map.encoding = THREE.LinearEncoding;
          o.material.map.needsUpdate = true;
        }
        o.material.needsUpdate = true;
      });

      const mixer = new THREE.AnimationMixer(root);
      const actions = {};
      for (const [name, clip] of Object.entries(window.HERO_CLIPS)) {
        // keep only the tracks for bones this model actually has
        const tracks = clip.tracks.filter((t) => root.getObjectByName(t.bone)).map((t) => (t.path === 'q'
          ? new THREE.QuaternionKeyframeTrack(`${t.bone}.quaternion`, t.times || clip.times, t.values)
          : new THREE.VectorKeyframeTrack(`${t.bone}.position`, t.times || clip.times, t.values)));
        const action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
        action.play();
        action.setEffectiveWeight(name === 'idle' ? 1 : 0);
        actions[name] = action;
      }

      const bones = {};
      for (const [key, name] of Object.entries(OVERLAY_BONES)) {
        const bone = root.getObjectByName(name);
        bones[key] = { bone, base: new THREE.Quaternion(), out: null };
      }

      // weapons float at the right hand, pointing along the aim (+z is forward)
      const steel = lambert(0x111317);
      const gun = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.28), steel);
      barrel.position.set(0, 0.05, 0.1);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.07), steel);
      grip.position.set(0, -0.02, 0);
      gun.add(barrel, grip);
      const bowGeo = new THREE.TorusGeometry(0.45, 0.02, 6, 18, Math.PI);
      bowGeo.rotateZ(-Math.PI / 2); // limbs vertical...
      bowGeo.rotateY(-Math.PI / 2); // ...curving away from the archer
      const bow = new THREE.Mesh(bowGeo, lambert(0x8a5a2b));

      const m = hero.model;
      m.group.add(root, gun, bow, m.pack);
      m.body.visible = false; // the built-in figure steps aside
      hero.skin = {
        root, mixer, actions, bones, gun, bow,
        weights: { idle: 1, walk: 0, run: 0 },
        pose: Object.fromEntries(POSE_KEYS.map((key) => [key, 0])),
      };
    }, (error) => console.warn('Hero model failed to load; using the built-in figure.', error));
  }

  const heroQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();
  const turnAxis = new THREE.Vector3();
  const handPos = new THREE.Vector3();

  // Turns a bone by `angle` about an axis given in the hero's own frame: x is his left,
  // y is up, z is forward. About x, a negative angle swings a hanging limb forward.
  function turnBone(entry, ax, ay, az, angle) {
    if (Math.abs(angle) < 1e-4) return;
    const bone = entry.bone;
    turnAxis.set(ax, ay, az).applyQuaternion(heroQ);
    turnQ.setFromAxisAngle(turnAxis, angle);
    bone.parent.getWorldQuaternion(parentQ);
    worldQ.copy(parentQ).multiply(bone.quaternion).premultiply(turnQ);
    bone.quaternion.copy(parentQ.invert()).multiply(worldQ);
  }

  function updateHeroSkin(dt) {
    const k = hero.skin;
    if (!k || mode === 'heli' || (mode === 'car' && insideView)) return;
    const m = hero.model;
    const onFoot = mode === 'foot';
    const speed = Math.hypot(car.vx, car.vz);
    const airborne = onFoot && !hero.climb && car.y > groundAt(car.x, car.z, car.y) + 0.05;
    const moving = onFoot && !hero.climb && !airborne && speed > 0.3;

    // --- base clips: stand and breathe, walk, or run, cross-faded by speed
    const run = moving ? Math.max(0, Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED))) : 0;
    const goal = { idle: moving ? 0 : 1, walk: moving ? 1 - run : 0, run: moving ? run : 0 };
    const fade = Math.min(1, 9 * dt);
    for (const name of ['idle', 'walk', 'run']) {
      k.weights[name] += (goal[name] - k.weights[name]) * fade;
      k.actions[name].setEffectiveWeight(k.weights[name]);
    }
    // keep the feet in step with the ground speed
    k.actions.walk.timeScale = Math.max(0.8, Math.min(1.7, speed / 1.55));
    k.actions.run.timeScale = Math.max(0.8, Math.min(1.6, speed / 4.6));
    k.mixer.update(dt);

    // --- extra pose on top of the clip
    const want = Object.fromEntries(POSE_KEYS.map((key) => [key, 0]));
    if (mode === 'car' && player.moto) {
      // astride the motorbike, leaning to the bars
      Object.assign(want, { spine: 0.45, armR: -1.0, armL: -1.0, foreR: -0.3, foreL: -0.3,
        legR: -1.0, legL: -1.0, kneeR: 1.25, kneeL: 1.25, legSplay: 0.28 });
    } else if (mode === 'car') {
      // seated: legs out to the pedals, hands on the wheel and moving with it
      Object.assign(want, { legR: -1.4, legL: -1.4, kneeR: 1.3, kneeL: 1.3, spine: -0.1,
        armR: -1.1 - car.steer * 0.2, armL: -1.1 + car.steer * 0.2, foreR: -0.4, foreL: -0.4 });
    } else if (mode === 'bike') {
      // leaning to the bars, legs turning the pedals half a turn apart
      const push = Math.sin(bike.crank);
      Object.assign(want, { spine: 0.5, armR: -1.05, armL: -1.05, foreR: -0.25, foreL: -0.25,
        legR: -0.95 + 0.4 * push, kneeR: 1.25 - 0.45 * push, legL: -0.95 - 0.4 * push, kneeL: 1.25 + 0.45 * push });
    } else if (mode === 'horse') {
      // seated: thighs forward and round the horse, shins down, hands to the reins
      Object.assign(want, { legR: -1.2, legL: -1.2, legSplay: 0.45, kneeR: 1.3, kneeL: 1.3,
        armR: -0.75, armL: -0.75, foreR: -0.6, foreL: -0.6, spine: 0.08 + 0.25 * horse.gallop });
    } else if (hero.climb) {
      // arms overhead pulling down; one knee up to mount the edge
      const t = hero.climb.t;
      const up = Math.min(1, t / 0.6);
      const lift = Math.sin(t * Math.PI);
      Object.assign(want, { armR: -2.9 + 2.3 * up, armL: -2.9 + 2.3 * up, foreR: -1.2 * lift, foreL: -1.2 * lift,
        legR: -1.3 * lift, kneeR: 1.5 * lift, legL: -0.4 * lift, kneeL: 0.6 * lift, spine: 0.25 * lift });
    } else if (airborne && hero.jetpack) {
      Object.assign(want, { legR: 0.3, legL: 0.2, kneeR: 0.35, kneeL: 0.5, armSplay: 0.35, spine: 0.15 });
    } else if (airborne) {
      // a leap: one knee driven up, the other leg trailing, arms thrown forward
      Object.assign(want, { legR: -0.9, kneeR: 1.3, legL: 0.3, kneeL: 0.7, armR: -0.5, armL: -0.9, foreL: -0.5 });
    }
    if (onFoot && !hero.climb) {
      if (hero.weapon !== 'fist') {
        want.armR = -Math.PI / 2 - hero.pitch + 0.12; // straight out along the aim
        want.foreR = 0;
      } else if (hero.punch > 0) {
        const reach = Math.sin((1 - hero.punch / PUNCH_SECONDS) * Math.PI);
        want.armR = -1.5 * reach;
        want.foreR = -1.3 * (1 - reach);
        want.spine = 0.12 * reach;
      }
    }
    const ease = Math.min(1, 16 * dt);
    for (const key of POSE_KEYS) k.pose[key] += (want[key] - k.pose[key]) * ease;
    k.root.position.y = mode === 'horse' && !horse.model.morph ? 0.14 : 0; // the built-in saddle sits higher than his hips

    // The mixer only rewrites a bone when its clip value changes, so a bone we turned last
    // frame may still hold our result. Start again from what the clip last gave it.
    for (const entry of Object.values(k.bones)) {
      if (entry.out && entry.bone.quaternion.equals(entry.out)) entry.bone.quaternion.copy(entry.base);
      else entry.base.copy(entry.bone.quaternion);
    }
    m.group.getWorldQuaternion(heroQ);
    const p = k.pose;
    const b = k.bones;
    turnBone(b.spine, 1, 0, 0, p.spine);
    turnBone(b.legR, 1, 0, 0, p.legR);
    turnBone(b.legR, 0, 0, 1, -p.legSplay);
    turnBone(b.kneeR, 1, 0, 0, p.kneeR);
    turnBone(b.legL, 1, 0, 0, p.legL);
    turnBone(b.legL, 0, 0, 1, p.legSplay);
    turnBone(b.kneeL, 1, 0, 0, p.kneeL);
    turnBone(b.armR, 1, 0, 0, p.armR);
    turnBone(b.armR, 0, 0, 1, -p.armSplay);
    turnBone(b.foreR, 1, 0, 0, p.foreR);
    turnBone(b.armL, 1, 0, 0, p.armL);
    turnBone(b.armL, 0, 0, 1, p.armSplay);
    turnBone(b.foreL, 1, 0, 0, p.foreL);
    // in a car nothing shows below the window line, so the legs are tucked out of sight
    const tucked = mode === 'car' && !player.moto ? 0.01 : 1;
    b.legR.bone.scale.setScalar(tucked);
    b.legL.bone.scale.setScalar(tucked);
    for (const entry of Object.values(k.bones)) {
      if (!entry.out) entry.out = new THREE.Quaternion();
      entry.out.copy(entry.bone.quaternion);
    }

    // --- weapon in the right hand
    k.gun.visible = onFoot && hero.weapon === 'gun';
    k.bow.visible = onFoot && hero.weapon === 'bow';
    if (k.gun.visible || k.bow.visible) {
      const held = k.gun.visible ? k.gun : k.bow;
      m.group.updateWorldMatrix(true, false);
      b.handR.bone.getWorldPosition(handPos);
      m.group.worldToLocal(handPos);
      held.position.copy(handPos);
      held.rotation.x = -hero.pitch;
    }
  }

  // Gravity and ground-following for the player's body. Returns true while in the air.
  function settle(dt) {
    const ground = groundAt(car.x, car.z, car.y);
    if (car.y > ground + 0.02) {
      // ground falling gently away (a downhill slope, a kerb): stay on it rather than fall
      if (car.vy <= 0.5 && car.y - ground < 0.3) {
        car.y = ground;
        car.vy = 0;
        return false;
      }
      car.vy -= GRAVITY * dt;
      car.y += car.vy * dt;
      if (car.y <= ground) {
        car.y = ground;
        car.vy = 0;
      }
      return true;
    }
    // remember how fast the surface is carrying us upward, so a ramp launches us off its end
    car.vy = dt > 0 ? Math.max(0, Math.min(14, (ground - car.y) / dt)) : 0;
    car.y = ground;
    return false;
  }

  // a box with a `top` stops blocking once the player is standing on it
  const blocksPlayer = (box) =>
    car.y < (box.top ?? box.maxY ?? Infinity) && car.y + 1.5 > (box.minY ?? -Infinity);

  // Where a circle touches a collision box, if it does: the direction (nx, nz) that pushes
  // the circle out, and how far its centre is from the box (negative when inside it). A
  // vehicle's box carries its real outline at whatever angle it stands (`box.car`), so an
  // askew car blocks only where its body is; everything else is square to the world.
  function boxContact(box, cx, cz, r) {
    if (cx < box.minX - r || cx > box.maxX + r || cz < box.minZ - r || cz > box.maxZ + r) return null;
    const o = box.car;
    if (!o) {
      const nx = cx - Math.max(box.minX, Math.min(box.maxX, cx));
      const nz = cz - Math.max(box.minZ, Math.min(box.maxZ, cz));
      const dist = Math.hypot(nx, nz);
      if (dist >= r) return null;
      if (dist > 1e-4) return { nx: nx / dist, nz: nz / dist, dist };
      // the centre is inside: out through the nearest face
      const faces = [[cx - box.minX, -1, 0], [box.maxX - cx, 1, 0], [cz - box.minZ, 0, -1], [box.maxZ - cz, 0, 1]];
      const [depth, fx, fz] = faces.sort((a, b) => a[0] - b[0])[0];
      return { nx: fx, nz: fz, dist: -depth };
    }
    const fx = Math.sin(o.h);
    const fz = Math.cos(o.h);
    const along = (cx - o.x) * fx + (cz - o.z) * fz;
    const side = (cx - o.x) * fz - (cz - o.z) * fx; // to the vehicle's left
    let da = along - Math.max(-o.hl, Math.min(o.hl, along));
    let ds = side - Math.max(-o.hw, Math.min(o.hw, side));
    let dist = Math.hypot(da, ds);
    if (dist >= r) return null;
    if (dist > 1e-4) {
      da /= dist;
      ds /= dist;
    } else if (o.hl - Math.abs(along) < o.hw - Math.abs(side)) {
      dist = Math.abs(along) - o.hl; // inside: out through the nearer end...
      da = Math.sign(along) || 1;
      ds = 0;
    } else {
      dist = Math.abs(side) - o.hw; // ...or the nearer flank
      da = 0;
      ds = Math.sign(side) || 1;
    }
    return { nx: da * fx + ds * fz, nz: da * fz - ds * fx, dist };
  }

  function pushHeroOut(radius) {
    for (const box of colliders.concat(trafficBoxes, policeBoxes)) {
      if (!blocksPlayer(box)) continue;
      const touch = boxContact(box, car.x, car.z, radius);
      if (!touch) continue;
      car.x += touch.nx * (radius - touch.dist);
      car.z += touch.nz * (radius - touch.dist);
    }
  }

  function updateHero(dt) {
    const held = (...codes) => codes.some((c) => keys.has(c));
    hero.yaw += ((held('ArrowLeft') ? 1 : 0) - (held('ArrowRight') ? 1 : 0)) * 2.2 * dt;
    hero.cooldown = Math.max(0, hero.cooldown - dt);

    if (hero.climb) {
      updateClimb(dt);
      return;
    }

    const ahead = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);
    const fx = Math.sin(hero.yaw);
    const fz = Math.cos(hero.yaw);
    let mx = fx * ahead - fz * strafe; // the hero's right is (-fz, fx)
    let mz = fz * ahead + fx * strafe;
    const length = Math.hypot(mx, mz);
    const shift = held('ShiftLeft', 'ShiftRight');
    const flying = hero.jetpack && car.y > groundAt(car.x, car.z, car.y) + 0.02;
    const pace = flying ? JETPACK_SPEED : shift ? RUN_SPEED : WALK_SPEED;
    if (length > 0) {
      mx = (mx / length) * pace;
      mz = (mz / length) * pace;
    }
    car.vx = mx;
    car.vz = mz;
    car.x += mx * dt;
    car.z += mz * dt;
    pushHeroOut(0.4);

    clampToWorld();

    let airborne;
    if (hero.jetpack) {
      // rocket pack: Space climbs, Shift sinks, neither hovers
      const lift = held('Space') ? 1 : flying && shift ? -1 : 0;
      airborne = hoverStep(dt, lift, JETPACK_LIFT);
      for (const flame of hero.model.flames) {
        flame.visible = airborne;
        flame.scale.y = (lift > 0 ? 1.5 : 0.7) + Math.random() * 0.4;
      }
    } else {
      airborne = settle(dt);
      if (!airborne && held('Space')) {
        // Space climbs onto a ledge in front if there is one, otherwise jumps
        const ledge = findLedge(Math.sin(hero.facing), Math.cos(hero.facing)); // climbs what he faces
        if (ledge) {
          startClimb(ledge);
        } else {
          car.vy = 7;
          car.y += 0.05;
        }
      }
    }
    car.heading = hero.yaw;
    trackFootsteps(airborne || flying ? 0 : length > 0 ? pace * dt : 0);

    // The body turns to face the way it is moving, whichever way the camera looks. With a
    // weapon out, or mid-punch, it squares up to the crosshair instead.
    const aiming = hero.weapon !== 'fist' || hero.punch > 0;
    const heading = aiming ? hero.yaw : length > 0 ? Math.atan2(mx, mz) : hero.facing;
    hero.facing += wrapAngle(heading - hero.facing) * Math.min(1, 12 * dt);

    const m = hero.model;
    m.group.position.set(car.x, car.y, car.z);
    m.group.rotation.y = hero.facing;
    const moving = length > 0 ? 1 : 0;
    hero.run += ((pace === RUN_SPEED ? 1 : 0) - hero.run) * Math.min(1, 7 * dt);
    hero.phase += moving * (9 + 4 * hero.run) * dt;
    hero.punch = Math.max(0, hero.punch - dt);
    const [rightArm] = m.arms;
    rightArm.locked = hero.weapon !== 'fist' || hero.punch > 0;
    animateGait(m, hero.phase, moving, hero.run, dt, airborne);
    if (hero.weapon !== 'fist') {
      rightArm.upper.rotation.x = -Math.PI / 2 - hero.pitch; // held out straight along the aim
      rightArm.lower.rotation.x = 0;
    } else if (hero.punch > 0) {
      // a jab: the arm drives forward as the elbow straightens, then comes back
      const reach = Math.sin((1 - hero.punch / PUNCH_SECONDS) * Math.PI);
      rightArm.upper.rotation.x = -1.55 * reach;
      rightArm.lower.rotation.x = -1.3 * (1 - reach);
    }

    const ride = nearestRide();
    $('prompt').innerHTML = `Press <kbd>F</kbd> to ${ride === 'heli' ? 'fly' : ride ? 'ride' : 'drive'}`;
    if (ride) {
      $('prompt').hidden = false;
      return;
    }
    $('prompt').hidden = !nearestVehicle();
  }

  function nearestVehicle() {
    let best = null;
    let bestDist = 4.5;
    const consider = (v, kind) => {
      if (Math.abs((v.y || 0) - car.y) > 2) return;
      const d = Math.hypot(v.x - car.x, v.z - car.z);
      if (d < bestDist) {
        bestDist = d;
        best = { v, kind };
      }
    };
    idleCars.forEach((v) => consider(v, 'idle'));
    traffic.forEach((v) => consider(v, 'traffic'));
    return best;
  }

  function setMode(next) {
    mode = next;
    hero.model.group.visible = next !== 'heli';
    $('crosshair').hidden = next !== 'foot';
    $('prompt').hidden = true;
    $('weapon').parentElement.hidden = next !== 'foot';
  }

  // --- getting in ---

  // Taking a vehicle is a short sequence, not an instant swap: it is made to stop, the
  // hero steps to the driver's door, the door swings open, whoever is driving is pulled out
  // and shoved clear, and only then does the hero get in and the door close behind him.
  let entering = null; // { v, kind, t, wait, fromX, fromZ, total, cleared } while it is happening
  const swingingDoors = []; // vehicles whose door is on its way shut

  function doorSpot(v, out) {
    const { hw } = v.model.dims;
    const ahead = (v.model.seat ? v.model.seat[0] : 0) - 0.15;
    return [
      v.x + Math.cos(v.h) * (hw + out) + Math.sin(v.h) * ahead,
      v.z - Math.sin(v.h) * (hw + out) + Math.cos(v.h) * ahead,
    ];
  }

  function setDoor(model, open) {
    model.doorOpen = open;
    if (model.door) model.door.rotation.y = -1.2 * open;
  }

  // Take the nearest car: parked, abandoned, or one driving past.
  function enterVehicle() {
    const found = nearestVehicle();
    if (!found || entering) return;
    const hasDriver = found.kind === 'traffic' && !!found.v.driver;
    entering = { ...found, t: 0, wait: 0, fromX: car.x, fromZ: car.z, total: hasDriver ? 1.15 : 0.6, cleared: !hasDriver };
    if (found.kind === 'traffic') found.v.jacked = true; // it brakes to a stop
    car.vx = car.vz = 0;
  }

  function updateEntering(dt) {
    const e = entering;
    const { v, kind } = e;
    const model = v.model;
    if (kind === 'traffic' && Math.abs(v.speed) > 1.2) {
      // still rolling: wait for it, and give up if it gets away
      e.wait += dt;
      if (e.wait > 3 || Math.hypot(v.x - car.x, v.z - car.z) > 13) {
        v.jacked = false;
        entering = null;
      }
      return;
    }
    if (e.t === 0) {
      e.fromX = car.x;
      e.fromZ = car.z;
    }
    e.t += dt;
    // step to the door and face the vehicle
    const [dx, dz] = doorSpot(v, 0.55);
    const k = Math.min(1, e.t / 0.3);
    car.x = e.fromX + (dx - e.fromX) * k;
    car.z = e.fromZ + (dz - e.fromZ) * k;
    hero.facing = hero.yaw = Math.atan2(v.x - car.x, v.z - car.z);
    hero.model.group.position.set(car.x, car.y, car.z);
    hero.model.group.rotation.y = hero.facing;
    setDoor(model, Math.max(0, Math.min(1, (e.t - 0.15) / 0.3)));
    if (!e.cleared && e.t > 0.5) {
      e.cleared = true;
      throwOutDriver(v);
    }
    if (e.t < e.total) return;

    entering = null;
    if (kind === 'idle') {
      idleCars.splice(idleCars.indexOf(v), 1);
      colliders.splice(colliders.indexOf(v.box), 1);
    } else {
      traffic.splice(traffic.indexOf(v), 1);
      trafficBoxes.splice(trafficBoxes.indexOf(v.box), 1);
      if (v.driver) model.group.remove(v.driver);
    }
    swingingDoors.push(model);
    drive(model, v.x, v.y || 0, v.z, v.h);
  }

  function updateDoors(dt) {
    for (let n = swingingDoors.length - 1; n >= 0; n--) {
      const model = swingingDoors[n];
      setDoor(model, Math.max(0, (model.doorOpen || 0) - 3.5 * dt));
      if (model.doorOpen <= 0) swingingDoors.splice(n, 1);
    }
  }

  // The nearest point of a pavement loop to (x, z): the block, the place, and how far round.
  function nearestPavement(x, z) {
    let block = cityBlocks[0];
    for (const b of cityBlocks) {
      if (Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) < Math.max(Math.abs(x - block.x), Math.abs(z - block.z))) block = b;
    }
    const half = 28.6;
    const clamp = (v) => Math.max(-half, Math.min(half, v));
    const lx = x - block.x;
    const lz = z - block.z;
    // edge 0 is the block's -z side walked toward +x; each next edge turns right
    const [edge, r, px, pz] = Math.abs(lx) > Math.abs(lz)
      ? (lx > 0 ? [1, clamp(lz), half, clamp(lz)] : [3, -clamp(lz), -half, clamp(lz)])
      : (lz > 0 ? [2, -clamp(lx), clamp(lx), half] : [0, clamp(lx), clamp(lx), -half]);
    return { block, half, tx: block.x + px, tz: block.z + pz, s: edge * half * 2 + r + half };
  }

  // The driver comes out of the door, is shoved over, and once back up walks off to the
  // nearest pavement as one more pedestrian.
  function throwOutDriver(v) {
    const figure = v.driver;
    v.model.group.remove(figure);
    v.driver = null;
    const template = figure.userData.template;
    if (!template) return;
    const w = createPerson(template);
    const [x, z] = doorSpot(v, 1.5);
    const to = nearestPavement(x, z);
    Object.assign(w, {
      cx: to.block.x, gy: to.block.y, cz: to.block.z, half: to.half, s: to.s, tx: to.tx, tz: to.tz,
      speed: rand(1.3, 1.7), phase: 0, health: 85, state: 'fall', timer: 0, tip: 0, tipSign: -1, dying: false, moving: 0,
      away: true, baseY: v.y || 0, // not on its pavement yet
    });
    w.group.rotation.order = 'YXZ';
    w.group.position.set(x, w.baseY, z);
    w.group.rotation.y = v.h - Math.PI / 2; // facing the car he was pulled from, so he goes over backwards away from it
    scene.add(w.group);
    walkers.push(w);
  }

  function drive(model, x, y, z, h) {
    player = model;
    if (!player.interior) addInterior(player);
    player.group.rotation.order = 'YXZ';
    addBeam(player);
    // seat the hero at the wheel
    const m = hero.model;
    const seat = player.seat || [-0.2, 0.38];
    player.group.add(m.group);
    m.group.position.set(seat[1], player.stats.eye - 1.66, seat[0] - 0.1);
    m.group.rotation.set(0, 0, 0);
    m.gun.visible = m.bow.visible = false;
    Object.assign(car, { x, y, z, heading: h, vx: 0, vy: 0, vz: 0, steer: 0, pitch: 0 });
    setMode('car');
    updateCamera(0, 0, true);
  }

  function exitVehicle() {
    const moving = Math.hypot(car.vx, car.vz) > 3;
    if (moving || car.y > groundAt(car.x, car.z, car.y) + 0.02) {
      showToast('Stop the car to get out', true);
      return;
    }
    if (insideView) setInsideView(false);
    player.flame.visible = false;
    player.tailMat.color.setHex(0x7a1010);
    scene.add(hero.model.group);
    player.group.rotation.set(0, car.heading, 0);
    addIdleCar(player, car.x, car.y, car.z, car.heading);
    setDoor(player, 1); // he gets out, and the door swings shut behind him
    swingingDoors.push(player);
    const stepOut = player.dims.hw + 1.1;
    player = null;
    car.boosting = false;

    // step out on the driver's side
    hero.yaw = hero.facing = car.heading;
    hero.pitch = 0;
    car.x += Math.cos(car.heading) * stepOut;
    car.z -= Math.sin(car.heading) * stepOut;
    car.vx = car.vz = 0;
    setMode('foot');
    updateCamera(0, 0, true);
  }

  function setWeapon(name) {
    hero.weapon = name;
    hero.model.gun.visible = name === 'gun';
    hero.model.bow.visible = name === 'bow';
    $('weapon').textContent = { fist: 'Fist', gun: 'Gun', bow: 'Bow' }[name];
  }

  // Hits the nearest person or dog within arm's reach in front of the hero.
  function punch() {
    hero.cooldown = 0.45;
    hero.punch = PUNCH_SECONDS;
    const fx = Math.sin(hero.yaw);
    const fz = Math.cos(hero.yaw);
    for (const t of shootables()) {
      if (!t.walker) continue;
      const dx = t.x - car.x;
      const dz = t.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.9 || dx * fx + dz * fz < dist * 0.4) continue;
      applyHit(t, 25, fx, fz);
      break;
    }
  }

  // --- aiming and hits ---

  // Things that can be shot: people, dogs and birds, as spheres.
  function* shootables() {
    for (const w of walkers) {
      if (!onFeet(w)) continue;
      const p = w.group.position;
      if (w.isPerson) {
        yield { x: p.x, y: p.y + 1.62, z: p.z, r: 0.19, walker: w, head: true };
        yield { x: p.x, y: p.y + 0.95, z: p.z, r: 0.45, walker: w };
      } else {
        yield { x: p.x, y: p.y + 0.45, z: p.z, r: 0.5, walker: w };
      }
    }
    for (const b of birds) {
      if (b.falling) continue;
      const p = b.group.position;
      yield { x: p.x, y: p.y, z: p.z, r: 1.4, bird: b };
    }
    // the tyres of any vehicle close enough to hit
    const models = [...traffic.map((c) => c.model), ...idleCars.map((v) => v.model), ...police.filter((p) => p.active).map((p) => p.model)];
    for (const model of models) {
      const at = model.group.position;
      if (Math.abs(at.x - car.x) > 60 || Math.abs(at.z - car.z) > 60) continue;
      for (let i = 0; i < model.wheels.length; i++) {
        model.wheels[i].getWorldPosition(wheelPoint);
        yield { x: wheelPoint.x, y: wheelPoint.y, z: wheelPoint.z, r: 0.4, wheel: { model, index: i } };
      }
    }
    for (const a of animals) {
      if (a.down > 0) continue;
      const size = a.sp.girth + 0.45;
      yield { x: a.x, y: a.y + a.sp.leg + a.sp.girth * 0.8, z: a.z, r: size, animal: a };
    }
  }

  // `damage` is out of a person's 100 health; a hit to the head always kills.
  function applyHit(t, damage = 34, dirX = 0, dirZ = 1) {
    if (t.wheel) {
      punctureTyre(t.wheel.model, t.wheel.index);
      return;
    }
    if (t.bird) {
      Object.assign(t.bird, { falling: true, vy: 0, rest: 0 });
      showToast('Bird down');
      return;
    }
    if (t.animal) {
      t.animal.down = KNOCKED_SECONDS;
      t.animal.group.rotation.z = Math.PI / 2;
      return;
    }
    const w = t.walker;
    const wentDown = hurtWalker(w, t.head ? 100 : damage, dirX, dirZ);
    // the police come for the first blow, and again each time someone is put on the ground
    if (w.isPerson && (wentDown || wanted === 0)) {
      setWanted(wanted + 1);
      showToast(wanted === 1 ? 'Wanted! Police are coming' : 'Wanted level up', true);
    }
  }

  // Distance along a ray to the first wall, car or the ground (capped at `max`).
  function rayToWorld(o, d, max) {
    let best = d.y < -1e-4 ? Math.min(max, -o.y / d.y) : max;
    for (const box of colliders.concat(trafficBoxes, policeBoxes)) {
      const lo = [box.minX, box.minY ?? 0, box.minZ];
      const hi = [box.maxX, Math.min(box.maxY ?? 3, 80), box.maxZ];
      const from = [o.x, o.y, o.z];
      const dir = [d.x, d.y, d.z];
      let near = 0;
      let far = best;
      for (let a = 0; a < 3 && near <= far; a++) {
        if (Math.abs(dir[a]) < 1e-6) {
          if (from[a] < lo[a] || from[a] > hi[a]) near = Infinity;
          continue;
        }
        const t1 = (lo[a] - from[a]) / dir[a];
        const t2 = (hi[a] - from[a]) / dir[a];
        near = Math.max(near, Math.min(t1, t2));
        far = Math.min(far, Math.max(t1, t2));
      }
      if (near <= far && near < best) best = near;
    }
    return best;
  }

  function raySphere(o, d, t) {
    const ox = t.x - o.x;
    const oy = t.y - o.y;
    const oz = t.z - o.z;
    const along = ox * d.x + oy * d.y + oz * d.z;
    if (along < 0) return Infinity;
    const missSq = ox * ox + oy * oy + oz * oz - along * along;
    return missSq > t.r * t.r ? Infinity : along - Math.sqrt(t.r * t.r - missSq);
  }

  const aimDir = new THREE.Vector3();
  const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6).rotateX(Math.PI / 2);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x3a2a18 });

  function fire() {
    if (mode !== 'foot' || hero.cooldown > 0) return;
    if (hero.weapon === 'fist') {
      punch();
      return;
    }
    const origin = camera.position;
    camera.getWorldDirection(aimDir);
    const muzzle = new THREE.Vector3(car.x + aimDir.x * 0.7, car.y + 1.5, car.z + aimDir.z * 0.7);

    if (hero.weapon === 'gun') {
      hero.cooldown = 0.25;
      playShot();
      let reach = rayToWorld(origin, aimDir, 300);
      let hit = null;
      for (const t of shootables()) {
        const dist = raySphere(origin, aimDir, t);
        if (dist < reach) {
          reach = dist;
          hit = t;
        }
      }
      const end = origin.clone().addScaledVector(aimDir, reach);
      tracer.geometry.setFromPoints([muzzle, end]);
      tracer.visible = true;
      tracerTimer = 0.07;
      if (hit) applyHit(hit, 34, aimDir.x, aimDir.z);
    } else {
      // loose an arrow toward whatever the crosshair is on; it drops with gravity on the way
      hero.cooldown = 0.7;
      const aimAt = origin.clone().addScaledVector(aimDir, rayToWorld(origin, aimDir, 120));
      const velocity = aimAt.sub(muzzle).normalize().multiplyScalar(ARROW_SPEED);
      const mesh = new THREE.Mesh(arrowGeo, arrowMat);
      mesh.position.copy(muzzle);
      scene.add(mesh);
      arrows.push({ mesh, velocity, life: 6, stuck: false });
    }
  }

  function updateShots(dt) {
    if (tracerTimer > 0) {
      tracerTimer -= dt;
      if (tracerTimer <= 0) tracer.visible = false;
    }

    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.life -= dt;
      if (a.life <= 0) {
        scene.remove(a.mesh);
        arrows.splice(i, 1);
        continue;
      }
      if (a.stuck) continue;

      const p = a.mesh.position;
      a.velocity.y -= GRAVITY * 0.5 * dt;
      p.addScaledVector(a.velocity, dt);
      a.mesh.lookAt(p.x + a.velocity.x, p.y + a.velocity.y, p.z + a.velocity.z);

      let hit = null;
      for (const t of shootables()) {
        if (Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) < t.r + 0.4) {
          hit = t;
          break;
        }
      }
      if (hit) {
        applyHit(hit, 60, a.velocity.x, a.velocity.z);
        a.life = 0;
        continue;
      }
      const inWall = colliders.some((b) =>
        p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ &&
        p.y > (b.minY ?? 0) && p.y < (b.maxY ?? 3));
      if (inWall || p.y <= terrain(p.x, p.z) + 0.05) {
        a.stuck = true;
        a.life = Math.min(a.life, 5);
      }
    }
  }

  // ---------- Ride models ----------

  // The horse, helicopter and bike are drawn with loaded models (ride-models.js) when
  // they are available; the shapes built in code further down are the fallback.
  const rideTemplates = { horse: null, heli: null, bike: null, lamp: null };

  function loadRideModels() {
    const load = (name, base64, prepare) => new Promise((ready) => {
      if (!THREE.GLTFLoader || !base64) {
        ready();
        return;
      }
      const text = atob(base64);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      new THREE.GLTFLoader().parse(bytes.buffer, '', (gltf) => {
        rideTemplates[name] = prepare ? prepare(gltf) : gltf.scene;
        ready();
      }, (error) => {
        console.warn(`The ${name} model failed to load; using the built-in one.`, error);
        ready();
      });
    });
    return Promise.all([
      // the horse is one mesh whose gallop is stored as a sequence of shapes to blend between
      load('horse', window.HORSE_GLB, (gltf) => {
        let mesh = null;
        gltf.scene.traverse((o) => { if (o.isMesh) mesh = o; });
        return { geometry: mesh.geometry, clip: gltf.animations[0] };
      }),
      load('heli', window.HELI_GLB),
      load('bike', window.BIKE_GLB),
      load('lamp', window.LAMP_GLB),
    ]);
  }

  // Copies every mesh of the named template parts into `parent`, with plain materials
  // chosen by the model's material names (see the car model for why).
  function copyRideParts(template, wanted, materials, parent) {
    template.traverse((o) => {
      if (!o.isMesh) return;
      // a part with several materials loads as a group of meshes under the part's name
      const part = o.parent && o.parent !== template && o.parent.type === 'Group' ? o.parent.name : o.name;
      if (!wanted(part)) return;
      const mesh = new THREE.Mesh(o.geometry, materials[o.material.name] || materials.other);
      mesh.castShadow = true;
      parent.add(mesh);
    });
  }

  // A pivot at `at` holding the given parts, so they can spin about that point.
  function ridePivot(template, names, materials, at, parent) {
    const pivot = new THREE.Group();
    pivot.position.set(at[0], at[1], at[2]);
    const hold = new THREE.Group();
    hold.position.set(-at[0], -at[1], -at[2]); // the parts stay where the model put them
    pivot.add(hold);
    copyRideParts(template, (name) => names.includes(name), materials, hold);
    parent.add(pivot);
    return pivot;
  }

  // ---------- Horse ----------

  let horse = null; // { model, x, y, z, h, speed, phase, ... } once summoned
  const HORSE_TROT = 6;
  const HORSE_GALLOP = 15;
  const REAR_SECONDS = 1.1;
  // where in the stride each leg lands (left fore, right fore, left hind, right hind), per gait
  const GAITS = [
    { offsets: [0, 0, 0, 0], stride: 1, swing: 0, bend: 0, bob: 0 }, // standing
    { offsets: [0.25, 0.75, 0, 0.5], stride: 1.7, swing: 0.32, bend: 0.7, bob: 0.012 }, // walk: four beats
    { offsets: [0, 0.5, 0.5, 0], stride: 2.6, swing: 0.5, bend: 1.05, bob: 0.045 }, // trot: diagonal pairs
    { offsets: [0.5, 0.62, 0.1, 0], stride: 4.6, swing: 0.74, bend: 1.45, bob: 0.07 }, // gallop: hinds, then fores
  ];

  // The loaded horse: one smooth-shaded mesh whose shapes are blended. Fifteen of them are
  // the frames of a recorded gallop, and the last is a standing pose. Its legs cannot be
  // posed freely, so the gaits are the same recording played slower or faster, and rearing
  // tips the whole animal.
  function createModelHorse() {
    const t = rideTemplates.horse;
    const group = new THREE.Group();
    const rig = new THREE.Group(); // pivots at the hind feet, for rearing
    rig.position.set(0, 0, -0.75);
    group.add(rig);
    const coat = new THREE.MeshPhongMaterial({
      vertexColors: true, // the coat, mane, tail and hooves are painted per vertex
      morphTargets: true,
      morphNormals: true, // so the shading follows the legs as they move
      shininess: 14,
      specular: 0x2a2520, // a slight sheen
    });
    coat.color.setRGB(1.15, 1.02, 0.95); // the painted colours are a little dark and orange
    const mesh = new THREE.Mesh(t.geometry, coat);
    mesh.scale.setScalar(0.0092); // the model is in centimetres
    mesh.position.set(0, 0, 0.95);
    mesh.castShadow = true;
    mesh.frustumCulled = false; // its bounds do not follow the animation
    rig.add(mesh);

    const leather = lambert(0x4a2c17);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.5), leather);
    saddle.position.set(0, 1.36, 0.72);
    rig.add(saddle);
    // the rider's feet-level origin, placed so their hips rest on the saddle
    const seat = new THREE.Group();
    seat.position.set(0, 0.42, 0.72);
    rig.add(seat);

    scene.add(group);
    return { group, rig, seat, mesh, gallop: t.clip.tracks[0], morph: true };
  }

  function animateModelHorse(dt) {
    const h = horse;
    const m = h.model;
    const v = Math.abs(h.speed);
    // the recording is a gallop; slowed right down it reads as a walk
    h.pace += ((v < 0.15 ? 0 : 0.3 + Math.min(1, v / HORSE_GALLOP) * 0.9) - h.pace) * Math.min(1, 5 * dt);
    // standing still, the gallop fades out and the standing pose fades in
    h.stand += ((v < 0.15 ? 1 : 0) - h.stand) * Math.min(1, 5 * dt);

    // The gallop is a row of blend weights per keyframe: read off the row for the current
    // moment, between the two keyframes either side of it.
    const { times, values } = m.gallop;
    const length = times[times.length - 1];
    h.clock = (((h.clock + dt * h.pace * Math.sign(h.speed || 1)) % length) + length) % length;
    let key = 0;
    while (key < times.length - 2 && times[key + 1] <= h.clock) key++;
    const part = (h.clock - times[key]) / (times[key + 1] - times[key]);
    const weights = m.mesh.morphTargetInfluences;
    const shapes = weights.length;
    for (let i = 0; i < shapes - 1; i++) {
      const moving = values[key * shapes + i] * (1 - part) + values[(key + 1) * shapes + i] * part;
      weights[i] = moving * (1 - h.stand);
    }
    weights[shapes - 1] = h.stand;
    h.gallop += ((v > 9 ? 1 : 0) - h.gallop) * Math.min(1, 5 * dt);

    const rear = h.rear > 0 ? Math.sin((1 - h.rear / REAR_SECONDS) * Math.PI) : 0;
    const tip = -rear * 0.6 - (h.airborne ? 0.15 : 0);
    m.rig.rotation.x += (tip - m.rig.rotation.x) * Math.min(1, 14 * dt);
    m.group.position.set(h.x, h.y, h.z);
    m.group.rotation.y = h.h;
  }

  function createHorse() {
    if (rideTemplates.horse) return createModelHorse();
    const coat = lambert(0x7a4a26);
    const dark = lambert(0x24160d);
    const hoofMat = lambert(0x16120f);
    const leather = lambert(0x4a2c17);
    const cloth = lambert(0x8a1c1c);
    const muzzleMat = lambert(0x5a3519);

    const group = new THREE.Group(); // origin on the ground under the middle of the horse
    // Everything hangs off `rig`, whose origin is the hindquarters, so the horse can rear
    // by tipping the rig back while its hind legs stay planted.
    const rig = new THREE.Group();
    rig.position.set(0, 1.2, -0.55);
    group.add(rig);
    const add = (geo, mat, x, y, z, parent = rig) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    add(new THREE.CylinderGeometry(0.36, 0.35, 1.1, 14).rotateX(Math.PI / 2), coat, 0, 0.1, 0.55); // barrel
    add(new THREE.SphereGeometry(0.37, 14, 10), coat, 0, 0.1, 1.06).scale.set(1, 1.06, 0.9); // chest
    add(new THREE.SphereGeometry(0.39, 14, 10), coat, 0, 0.13, 0.03).scale.set(1, 1, 0.95); // rump
    add(new THREE.SphereGeometry(0.2, 10, 8), coat, 0, 0.42, 0.98).scale.set(0.8, 0.7, 1.3); // withers

    const neck = new THREE.Group();
    neck.position.set(0, 0.3, 1.12);
    rig.add(neck);
    add(new THREE.CylinderGeometry(0.15, 0.25, 0.9, 12).translate(0, 0.4, 0), coat, 0, 0, 0, neck);
    add(new THREE.BoxGeometry(0.06, 0.88, 0.16), dark, 0, 0.42, -0.2, neck); // mane

    // the head hangs from the top of the neck; its own +y runs down the face to the muzzle
    const head = new THREE.Group();
    head.position.set(0, 0.84, 0.02);
    neck.add(head);
    add(new THREE.CylinderGeometry(0.155, 0.1, 0.5, 10).translate(0, 0.22, 0), coat, 0, 0, 0, head);
    add(new THREE.SphereGeometry(0.105, 10, 8), muzzleMat, 0, 0.5, 0, head).scale.set(1, 1.15, 1);
    add(new THREE.BoxGeometry(0.07, 0.2, 0.07), dark, 0, 0.08, -0.15, head); // forelock
    for (const side of [-1, 1]) {
      add(new THREE.SphereGeometry(0.03, 8, 6), dark, side * 0.125, 0.13, -0.04, head); // eye
      add(new THREE.SphereGeometry(0.02, 6, 4), dark, side * 0.05, 0.56, -0.04, head); // nostril
      add(new THREE.ConeGeometry(0.05, 0.17, 6).rotateX(-Math.PI / 2), coat, side * 0.085, -0.02, -0.18, head); // ear
    }

    const tail = new THREE.Group();
    tail.position.set(0, 0.32, -0.32);
    rig.add(tail);
    add(new THREE.CylinderGeometry(0.085, 0.02, 0.95, 8).translate(0, -0.47, 0), dark, 0, 0, 0, tail);

    add(new THREE.BoxGeometry(0.66, 0.04, 0.82), cloth, 0, 0.47, 0.5); // saddle blanket
    add(new THREE.BoxGeometry(0.46, 0.09, 0.56), leather, 0, 0.52, 0.5); // saddle
    add(new THREE.BoxGeometry(0.2, 0.1, 0.1), leather, 0, 0.6, 0.76); // pommel

    // legs: left fore, right fore, left hind, right hind (left is +x); each has a knee or hock
    const legs = [[0.17, 1.04, true], [-0.17, 1.04, true], [0.18, 0, false], [-0.18, 0, false]]
      .map(([x, z, fore]) => {
        const upper = new THREE.Group();
        upper.position.set(x, -0.08, z);
        rig.add(upper);
        add(new THREE.CylinderGeometry(fore ? 0.105 : 0.14, 0.065, 0.55, 8).translate(0, -0.275, 0), coat, 0, 0, 0, upper);
        const lower = new THREE.Group();
        lower.position.y = -0.55;
        upper.add(lower);
        add(new THREE.CylinderGeometry(0.058, 0.045, 0.5, 8).translate(0, -0.25, 0), coat, 0, 0, 0, lower);
        add(new THREE.CylinderGeometry(0.06, 0.075, 0.09, 8).translate(0, -0.54, 0), hoofMat, 0, 0, 0, lower);
        return { upper, lower, fore };
      });

    // the rider's feet-level origin, placed so their hips rest on the saddle
    const seat = new THREE.Group();
    seat.position.set(0, -0.32, 0.5);
    rig.add(seat);

    scene.add(group);
    return { group, rig, neck, head, tail, legs, seat };
  }

  function summonHorse() {
    if (!horse) {
      horse = {
        model: createHorse(), x: 0, y: 0, z: 0, h: 0, speed: 0, phase: 0, rear: 0, rearReady: true, pace: 0,
        clock: 0, stand: 1,
        offsets: [0, 0, 0, 0], stride: 1, swing: 0, bend: 0, bob: 0, gallop: 0,
      };
    }
    Object.assign(horse, { x: car.x, y: car.y, z: car.z, h: car.heading, speed: 0 });
    mountHorse();
  }

  function mountHorse() {
    const m = hero.model;
    horse.model.seat.add(m.group);
    m.group.position.set(0, 0, 0);
    m.group.rotation.set(0, 0, 0);
    m.gun.visible = m.bow.visible = false;
    Object.assign(car, { x: horse.x, y: horse.y, z: horse.z, heading: horse.h, vx: 0, vy: 0, vz: 0 });
    setMode('horse');
    updateCamera(0, 0, true);
  }

  function dismountHorse() {
    if (Math.abs(horse.speed) > 3 || car.y > groundAt(car.x, car.z, car.y) + 0.02) {
      showToast('Slow the horse to get off', true);
      return;
    }
    const m = hero.model;
    scene.add(m.group);
    for (const leg of m.legs) leg.upper.rotation.z = 0;
    for (const arm of m.arms) arm.upper.rotation.z = 0;
    horse.speed = 0;
    hero.yaw = hero.facing = car.heading;
    hero.pitch = 0;
    car.x += Math.cos(car.heading) * 1.4; // step down on the left
    car.z -= Math.sin(car.heading) * 1.4;
    car.vx = car.vz = 0;
    setMode('foot');
    setWeapon(hero.weapon);
    updateCamera(0, 0, true);
  }

  // Riding: W trots, Shift gallops, S reins in, A / D steer, Space jumps.
  function updateRiding(dt) {
    const held = (...codes) => codes.some((c) => keys.has(c));
    const forward = held('KeyW', 'ArrowUp');
    const sprint = held('ShiftLeft', 'ShiftRight');
    const h = horse;

    // spurred from a standstill, the horse rears before it bolts
    if (!(forward && sprint)) h.rearReady = true;
    if (forward && sprint && Math.abs(h.speed) < 0.3 && h.rear <= 0 && h.rearReady) {
      h.rear = REAR_SECONDS;
      h.rearReady = false;
    }
    h.rear = Math.max(0, h.rear - dt);

    let goal = 0;
    if (h.rear > 0) goal = 0;
    else if (forward) goal = sprint ? HORSE_GALLOP : HORSE_TROT;
    else if (held('KeyS', 'ArrowDown')) goal = -1.6;
    h.speed = approach(h.speed, goal, (goal > h.speed ? (sprint ? 6.5 : 4) : 9) * dt);

    const steer = (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0);
    car.heading += steer * (2.3 - 1.1 * Math.min(1, Math.abs(h.speed) / HORSE_GALLOP)) * dt;

    const fromX = car.x;
    const fromZ = car.z;
    car.vx = Math.sin(car.heading) * h.speed;
    car.vz = Math.cos(car.heading) * h.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    pushHeroOut(0.9);
    // pulled up short by a wall
    const expected = Math.abs(h.speed) * dt;
    if (expected > 1e-4 && Math.hypot(car.x - fromX, car.z - fromZ) < expected * 0.4) h.speed *= 0.6;

    clampToWorld();

    const airborne = settle(dt);
    if (!airborne && held('Space') && h.rear <= 0) {
      car.vy = 8.5;
      car.y += 0.05;
    }
    Object.assign(h, { x: car.x, y: car.y, z: car.z, h: car.heading, airborne });
  }

  // Runs every frame, ridden or not: gait, breathing, tail, and the rider's seat.
  function animateHorse(dt) {
    if (horse.model.morph) {
      animateModelHorse(dt);
      return;
    }
    const h = horse;
    const m = h.model;
    const v = Math.abs(h.speed);
    const gait = GAITS[v < 0.15 ? 0 : v < 3.2 ? 1 : v < 9 ? 2 : 3];
    const blend = Math.min(1, 5 * dt);
    for (const key of ['stride', 'swing', 'bend', 'bob']) h[key] += (gait[key] - h[key]) * blend;
    h.offsets.forEach((o, i) => { h.offsets[i] += (gait.offsets[i] - o) * blend; });
    h.gallop += ((gait === GAITS[3] ? 1 : 0) - h.gallop) * blend;
    h.phase += (h.speed / h.stride) * Math.PI * 2 * dt;

    const ease = Math.min(1, 16 * dt);
    const to = (part, axis, value) => { part.rotation[axis] += (value - part.rotation[axis]) * ease; };
    const rear = h.rear > 0 ? Math.sin((1 - h.rear / REAR_SECONDS) * Math.PI) : 0;
    const tip = rear * 0.55; // how far the body is tipped back
    const leap = h.airborne ? 1 : 0;

    m.legs.forEach((leg, i) => {
      const t = h.phase + h.offsets[i] * Math.PI * 2;
      // the leg swings from the shoulder or hip; the lower leg folds as it comes forward
      let upper = -Math.sin(t) * h.swing;
      let lower = Math.max(0, Math.cos(t)) * h.bend * (leg.fore ? 1 : 0.8);
      if (leap) {
        upper = leg.fore ? -0.9 : 0.7; // forelegs tucked forward, hind legs trailing
        lower = leg.fore ? 1.5 : 0.5;
      }
      if (leg.fore) {
        // rearing: forelegs lift and paw at the air
        upper += (-1.0 + 0.35 * Math.sin(clock * 11 + i * 2.2) - upper) * rear;
        lower += (1.5 - lower) * rear;
      } else {
        upper += tip; // hind legs stay under the horse as the body tips
      }
      to(leg.upper, 'x', upper);
      to(leg.lower, 'x', lower);
    });

    const breath = Math.sin(clock * 1.6) * 0.006;
    m.rig.position.y = 1.2 + breath + Math.cos(h.phase * 2) * h.bob * (1 - h.gallop) + Math.sin(h.phase) * h.bob * h.gallop;
    to(m.rig, 'x', -tip - leap * 0.18 + Math.sin(h.phase + 1.2) * 0.07 * h.gallop); // a gallop rocks the body
    // the neck nods with each stride and stretches out at a gallop
    const nod = Math.sin(h.phase * 2) * 0.07 * (1 - h.gallop) + Math.sin(h.phase) * 0.11 * h.gallop;
    to(m.neck, 'x', 0.72 + nod * Math.min(1, v) + 0.22 * h.gallop + 0.2 * rear + Math.sin(clock * 0.7) * 0.03);
    to(m.head, 'x', 1.45 - 0.25 * h.gallop + 0.25 * rear);
    // the tail swishes at rest and streams out behind at speed
    to(m.tail, 'x', 0.3 + Math.min(1, v / HORSE_GALLOP) * 0.75 + Math.sin(h.phase * 2) * 0.06);
    to(m.tail, 'z', Math.sin(clock * 1.9) * 0.28 * (1 - Math.min(1, v / 3)));

    m.group.position.set(h.x, h.y, h.z);
    m.group.rotation.y = h.h;

    if (mode !== 'horse') return;
    // rider: knees bent round the horse's sides, hands forward on the reins, rising with the gait
    const r = hero.model;
    r.legs.forEach((leg, i) => {
      to(leg.upper, 'x', -1.15);
      leg.upper.rotation.z = i ? 0.5 : -0.5;
      to(leg.lower, 'x', 1.25);
    });
    r.arms.forEach((arm, i) => {
      to(arm.upper, 'x', -0.7 - 0.25 * h.gallop);
      arm.upper.rotation.z = i ? -0.2 : 0.2;
      to(arm.lower, 'x', -0.75);
    });
    r.body.position.y = Math.max(0, Math.sin(h.phase * 2 + 0.6)) * h.bob * 1.3 * (1 - h.gallop) + 0.03 * h.gallop;
    to(r.body, 'x', 0.06 + 0.3 * h.gallop + rear * 0.3); // leans in to stay on when it rears
    to(r.body, 'y', 0);
  }

  // ---------- Climbing ----------

  // Looks a step or so ahead for something taller than a normal stride but within reach.
  function findLedge(fx, fz) {
    for (const d of [0.6, 0.9, 1.3]) {
      const x = car.x + fx * d;
      const z = car.z + fz * d;
      const top = groundAt(x, z, car.y + CLIMB_REACH - STEP_UP);
      if (top > car.y + STEP_UP) return { x, z, y: top };
    }
    return null;
  }

  function startClimb(ledge) {
    hero.climb = { t: 0, fromX: car.x, fromY: car.y, fromZ: car.z, to: ledge };
    car.vx = car.vy = car.vz = 0;
  }

  // Hauls the hero straight up the face, then over the edge onto the top.
  function updateClimb(dt) {
    const c = hero.climb;
    c.t = Math.min(1, c.t + dt / CLIMB_SECONDS);
    const up = Math.min(1, c.t / 0.6);
    const over = Math.max(0, (c.t - 0.6) / 0.4);
    car.x = c.fromX + (c.to.x - c.fromX) * over;
    car.z = c.fromZ + (c.to.z - c.fromZ) * over;
    car.y = c.fromY + (c.to.y - c.fromY) * up;

    const m = hero.model;
    m.group.position.set(car.x, car.y, car.z);
    m.group.rotation.y = hero.facing;
    // arms reach overhead and pull down past the chest; knees come up to mount the edge
    for (const arm of m.arms) {
      arm.upper.rotation.x = -2.9 + 2.3 * up;
      arm.lower.rotation.x = -1.2 * Math.sin(up * Math.PI);
    }
    m.legs.forEach((leg, i) => {
      leg.upper.rotation.x = -(i ? 0.5 : 1.3) * Math.sin(c.t * Math.PI);
      leg.lower.rotation.x = (i ? 0.6 : 1.5) * Math.sin(c.t * Math.PI);
    });
    m.body.rotation.x = 0.25 * Math.sin(c.t * Math.PI);
    if (c.t >= 1) hero.climb = null;
  }

  // ---------- Flying: helicopter and rocket pack ----------

  // Vertical motion for anything that hovers. `lift` is 1 to climb, -1 to sink, 0 to hold
  // height. Returns true while off the ground.
  function hoverStep(dt, lift, rate) {
    const ground = groundAt(car.x, car.z, car.y);
    if (car.y <= ground + 0.02 && lift <= 0) {
      car.y = ground;
      car.vy = 0;
      return false;
    }
    car.vy = approach(car.vy, lift * rate, 28 * dt);
    car.y = Math.min(MAX_ALTITUDE, car.y + car.vy * dt);
    if (car.y <= ground) {
      car.y = ground;
      car.vy = 0;
      return false;
    }
    return true;
  }

  let heli = null; // { model, x, y, z, h, speed, rotor, flown } once summoned

  // The loaded helicopter is about half the size the game flies, sits off-centre, and has
  // its parts in one frame: scale it up, centre the rotor mast, and re-pivot both rotors.
  function createModelHelicopter() {
    const t = rideTemplates.heli;
    const side = THREE.DoubleSide;
    const paint = reflect(new THREE.MeshPhongMaterial({ color: 0xc8200a, shininess: 80, specular: 0x666666, side }), 0.22);
    const dark = new THREE.MeshPhongMaterial({ color: 0x1a1b1e, shininess: 40, side });
    const materials = {
      HelicopterBody: paint,
      'HelicopterBody.001': paint,
      Metal: dark,
      WindsheildGasket: dark,
      'WindsheildGasket.001': dark,
      Stand: dark,
      Interior: new THREE.MeshLambertMaterial({ color: 0x2a2c30, side }),
      Windsheild: new THREE.MeshPhongMaterial({ color: 0x9fc4e0, transparent: true, opacity: 0.45, shininess: 100, side, depthWrite: false }),
      WindSheildDark: new THREE.MeshPhongMaterial({ color: 0x1b2836, shininess: 90, side }),
      other: dark,
    };
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const mast = [0.29, 2.2, -0.355]; // where the main rotor turns, in the model's own frame
    const body = new THREE.Group();
    body.scale.setScalar(1.9);
    body.position.set(-mast[0] * 1.9, -0.25 * 1.9, -mast[2] * 1.9); // mast over the origin, skids on the ground
    group.add(body);

    const spinning = ['TopFin', 'HelicopterBackWings'];
    copyRideParts(t, (name) => !spinning.includes(name), materials, body);
    const rotor = ridePivot(t, ['TopFin'], materials, mast, body);
    const tailRotor = ridePivot(t, ['HelicopterBackWings'], materials, [-0.225, 1.145, -3.095], body);
    scene.add(group);
    return { group, rotor, tailRotor };
  }

  function createHelicopter() {
    if (rideTemplates.heli) return createModelHelicopter();
    const paint = new THREE.MeshPhongMaterial({ color: 0x1d4e89, shininess: 80, specular: 0x666666 });
    const trim = new THREE.MeshPhongMaterial({ color: 0xf2f2f2, shininess: 60 });
    const metal = lambert(0x2a2d33);
    const group = new THREE.Group(); // origin on the ground between the skids
    group.rotation.order = 'YXZ';
    const add = (geo, mat, x, y, z, parent = group) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const ball = new THREE.SphereGeometry(1, 20, 14);
    add(ball, paint, 0, 1.5, 0.1).scale.set(1.05, 0.98, 1.75); // cabin
    add(ball, glassMat, 0, 1.56, 1.02).scale.set(0.96, 0.84, 1.05); // bubble canopy
    add(new THREE.BoxGeometry(0.7, 0.4, 1.5), paint, 0, 2.42, -0.2); // engine cowl
    add(new THREE.BoxGeometry(2.14, 0.12, 2.4), trim, 0, 1.3, 0.1); // stripe
    // tail boom tapering backwards, with fin, stabiliser and tail rotor
    add(new THREE.CylinderGeometry(0.3, 0.1, 3.8, 12).rotateX(Math.PI / 2), paint, 0, 1.75, -3.2);
    add(new THREE.BoxGeometry(0.08, 1.2, 0.7), paint, 0, 2.2, -4.85).rotation.x = -0.3;
    add(new THREE.BoxGeometry(1.3, 0.06, 0.45), trim, 0, 1.78, -4.4);
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.17, 2.05, -4.95);
    group.add(tailRotor);
    add(new THREE.BoxGeometry(0.03, 1.3, 0.12), metal, 0, 0, 0, tailRotor);
    add(new THREE.BoxGeometry(0.03, 0.12, 1.3), metal, 0, 0, 0, tailRotor);

    add(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), metal, 0, 2.8, -0.2); // mast
    const rotor = new THREE.Group();
    rotor.position.set(0, 3.05, -0.2);
    group.add(rotor);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), metal, 0, 0, 0, rotor);
    add(new THREE.BoxGeometry(9.4, 0.04, 0.3), metal, 0, 0, 0, rotor);
    add(new THREE.BoxGeometry(0.3, 0.04, 9.4), metal, 0, 0, 0, rotor);

    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8).rotateX(Math.PI / 2), metal, side * 0.95, 0.06, 0.2); // skid
      for (const z of [-0.7, 1.0]) {
        add(new THREE.BoxGeometry(0.07, 0.75, 0.07), metal, side * 0.82, 0.4, z).rotation.z = side * 0.35;
      }
    }
    scene.add(group);
    return { group, rotor, tailRotor };
  }

  function summonHeli() {
    if (!heli) heli = { model: createHelicopter(), x: 0, y: 0, z: 0, h: 0, speed: 0, rotor: 0, flown: false, tilt: 0, roll: 0 };
    Object.assign(heli, { x: car.x, y: car.y, z: car.z, h: car.heading, speed: 0 });
    boardHeli();
  }

  function boardHeli() {
    heli.flown = true;
    Object.assign(car, { x: heli.x, y: heli.y, z: heli.z, heading: heli.h, vx: 0, vy: 0, vz: 0 });
    setMode('heli');
    updateCamera(0, 0, true);
  }

  function leaveHeli() {
    if (car.y > groundAt(car.x, car.z, car.y) + 0.02 || Math.abs(heli.speed) > 2) {
      showToast('Land the helicopter to get out', true);
      return;
    }
    heli.flown = false;
    heli.speed = 0;
    hero.yaw = hero.facing = car.heading;
    hero.pitch = 0;
    car.x += Math.cos(car.heading) * 2.4; // climb out on the left
    car.z -= Math.sin(car.heading) * 2.4;
    car.vx = car.vz = 0;
    setMode('foot');
    updateCamera(0, 0, true);
  }

  // W / S fly forward and back, A / D turn, Space climbs, Shift descends; it hovers by itself.
  function updateHeli(dt) {
    const held = (...codes) => codes.some((c) => keys.has(c));
    const h = heli;
    const ready = h.rotor > 0.85; // the blades have to spin up before it will lift
    const flying = car.y > groundAt(car.x, car.z, car.y) + 0.02;

    const steer = (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0);
    if (flying) car.heading += steer * 1.5 * dt;
    let goal = 0;
    if (flying && held('KeyW', 'ArrowUp')) goal = HELI_SPEED;
    else if (flying && held('KeyS', 'ArrowDown')) goal = -10;
    h.speed = approach(h.speed, goal, (flying ? 11 : 40) * dt);

    const fromX = car.x;
    const fromZ = car.z;
    car.vx = Math.sin(car.heading) * h.speed;
    car.vz = Math.cos(car.heading) * h.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    pushHeroOut(2.2);
    const expected = Math.abs(h.speed) * dt;
    if (expected > 1e-4 && Math.hypot(car.x - fromX, car.z - fromZ) < expected * 0.4) h.speed *= 0.5;

    clampToWorld();

    const lift = !ready ? 0 : held('Space') ? 1 : held('ShiftLeft', 'ShiftRight') ? -1 : 0;
    hoverStep(dt, lift, HELI_LIFT);

    // nose dips into forward flight and the body banks into turns
    const ease = Math.min(1, 4 * dt);
    h.tilt += ((h.speed / HELI_SPEED) * 0.3 - h.tilt) * ease;
    h.roll += ((flying ? -steer * 0.28 * Math.min(1, Math.abs(h.speed) / 12) : 0) - h.roll) * ease;
    Object.assign(h, { x: car.x, y: car.y, z: car.z, h: car.heading });
  }

  // Runs every frame so the blades spin up when boarded and wind down after landing.
  function animateHeli(dt) {
    const h = heli;
    h.rotor = approach(h.rotor, h.flown ? 1 : 0, (h.flown ? 0.6 : 0.25) * dt);
    h.model.rotor.rotation.y += h.rotor * 34 * dt;
    h.model.tailRotor.rotation.x += h.rotor * 50 * dt;
    if (!h.flown) {
      h.tilt += (0 - h.tilt) * Math.min(1, 4 * dt);
      h.roll += (0 - h.roll) * Math.min(1, 4 * dt);
    }
    h.model.group.position.set(h.x, h.y, h.z);
    h.model.group.rotation.set(h.tilt, h.h, h.roll);
  }

  // ---------- Bike ----------

  let bike = null; // { model, x, y, z, h, speed, lean, crank } once summoned
  const BIKE_SPEED = 9; // m/s at an easy pedal
  const BIKE_SPRINT = 14;
  const BIKE_SCALE = 0.38; // the model is drawn several times life size

  // The model lies along its own x axis with the ground at y = -2.06. `frame` holds it in
  // the game's terms: scaled, facing +z, wheels on the ground, centred between the axles.
  function createBike() {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const seat = new THREE.Group(); // the rider's feet-level origin, hips on the saddle
    seat.position.set(0, 0.0, -0.17);
    group.add(seat);
    const t = rideTemplates.bike;
    if (!t) {
      // fallback: a plain frame and two wheels
      const metal = lambert(0xc8200a);
      const tyre = lambert(0x18191c);
      const bar = (w, h, d, x, y, z, mat = metal) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        group.add(mesh);
        return mesh;
      };
      bar(0.05, 0.05, 1.1, 0, 0.62, 0);
      bar(0.05, 0.5, 0.05, 0, 0.75, -0.2);
      bar(0.22, 0.05, 0.3, 0, 0.98, -0.2, tyre);
      bar(0.5, 0.05, 0.05, 0, 0.98, 0.42, tyre);
      const wheels = [-0.56, 0.56].map((z) => {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 8, 24).rotateY(Math.PI / 2), tyre);
        wheel.position.set(0, 0.34, z);
        group.add(wheel);
        return wheel;
      });
      scene.add(group);
      return { group, seat, wheels, crank: new THREE.Group(), axis: 'x', turn: 1 };
    }

    const side = THREE.DoubleSide;
    const black = new THREE.MeshLambertMaterial({ color: 0x15161a, side });
    const materials = {
      Quadro: new THREE.MeshPhongMaterial({ color: 0xc8200a, shininess: 90, specular: 0x777777, side }), // frame
      Roda: new THREE.MeshPhongMaterial({ color: 0xc9cdd3, shininess: 80, side }), // rims
      Pneu: black, // tyres, grips, saddle
      Faixa: new THREE.MeshLambertMaterial({ color: 0xf2f2f2, side }),
      Raio: new THREE.MeshPhongMaterial({ color: 0x8d9299, shininess: 60, side }), // spokes, chain
      Eixo: black,
      PedalInterno: new THREE.MeshPhongMaterial({ color: 0xb9bec6, shininess: 70, side }),
      PedalExterno: black,
      other: black,
    };
    const frame = new THREE.Group();
    frame.scale.setScalar(BIKE_SCALE);
    frame.rotation.y = -Math.PI / 2;
    const shift = new THREE.Group();
    shift.position.set(-0.425, 2.06, 0);
    frame.add(shift);
    group.add(frame);

    const rear = ['B_Pneu', 'B_Raios', 'B_Eixo'];
    const front = ['F_Pneu', 'F_Raios', 'F_Eixo'];
    const pedals = ['Cylinder', 'Pedal_E', 'Pedal_E.001'].map((n) => n.replace('.', '')); // the loader strips dots from names
    const moving = [...rear, ...front, ...pedals];
    copyRideParts(t, (name) => !moving.includes(name), materials, shift);
    const wheels = [
      ridePivot(t, rear, materials, [-1.05, -1.18, 0], shift),
      ridePivot(t, front, materials, [1.9, -1.18, 0], shift),
    ];
    const crank = ridePivot(t, pedals, materials, [0.27, -1.17, 0], shift);
    scene.add(group);
    // in the model's frame the axles run along z, and rolling forward is a negative turn
    return { group, seat, wheels, crank, axis: 'z', turn: -1 };
  }

  function summonBike() {
    if (!bike) bike = { model: createBike(), x: 0, y: 0, z: 0, h: 0, speed: 0, lean: 0, crank: 0, pedalling: 0 };
    Object.assign(bike, { x: car.x, y: car.y, z: car.z, h: car.heading, speed: 0 });
    mountBike();
  }

  function mountBike() {
    const m = hero.model;
    bike.model.seat.add(m.group);
    m.group.position.set(0, 0, 0);
    m.group.rotation.set(0, 0, 0);
    m.gun.visible = m.bow.visible = false;
    Object.assign(car, { x: bike.x, y: bike.y, z: bike.z, heading: bike.h, vx: 0, vy: 0, vz: 0 });
    setMode('bike');
    updateCamera(0, 0, true);
  }

  function dismountBike() {
    if (Math.abs(bike.speed) > 3 || car.y > groundAt(car.x, car.z, car.y) + 0.02) {
      showToast('Slow down to get off', true);
      return;
    }
    const m = hero.model;
    scene.add(m.group);
    for (const leg of m.legs) leg.upper.rotation.z = 0;
    bike.speed = 0;
    hero.yaw = hero.facing = car.heading;
    hero.pitch = 0;
    car.x += Math.cos(car.heading) * 0.9; // step off to the left
    car.z -= Math.sin(car.heading) * 0.9;
    car.vx = car.vz = 0;
    setMode('foot');
    setWeapon(hero.weapon);
    updateCamera(0, 0, true);
  }

  // W pedals, Shift sprints, S brakes, A / D steer (the bike leans into the turn), Space hops.
  function updateBiking(dt) {
    const held = (...codes) => codes.some((c) => keys.has(c));
    const b = bike;
    const forward = held('KeyW', 'ArrowUp');
    let goal = 0;
    if (forward) goal = held('ShiftLeft', 'ShiftRight') ? BIKE_SPRINT : BIKE_SPEED;
    else if (held('KeyS', 'ArrowDown')) goal = b.speed > 0.5 ? 0 : -1.5;
    // pedalling builds speed slowly, braking sheds it fast, and it coasts a long way
    const rate = goal > b.speed ? 4.5 : held('KeyS', 'ArrowDown') ? 12 : 1.2;
    b.speed = approach(b.speed, goal, rate * dt);
    b.pedalling = forward ? 1 : 0;

    const steer = (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0);
    const rolling = Math.max(-1, Math.min(1, b.speed / 3));
    car.heading += steer * (2.4 - 1.2 * Math.min(1, Math.abs(b.speed) / BIKE_SPRINT)) * rolling * dt;
    b.lean += (-steer * 0.38 * Math.min(1, Math.abs(b.speed) / 6) - b.lean) * Math.min(1, 6 * dt);

    const fromX = car.x;
    const fromZ = car.z;
    car.vx = Math.sin(car.heading) * b.speed;
    car.vz = Math.cos(car.heading) * b.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    pushHeroOut(0.5);
    const expected = Math.abs(b.speed) * dt;
    if (expected > 1e-4 && Math.hypot(car.x - fromX, car.z - fromZ) < expected * 0.4) b.speed *= 0.5;
    clampToWorld();

    const airborne = settle(dt);
    if (!airborne && held('Space')) {
      car.vy = 5;
      car.y += 0.05;
    }
    Object.assign(b, { x: car.x, y: car.y, z: car.z, h: car.heading });
  }

  // Runs every frame: wheels turn with the ground speed, the cranks with the pedalling.
  function animateBike(dt) {
    const b = bike;
    const m = b.model;
    if (mode !== 'bike') {
      b.speed = approach(b.speed, 0, 6 * dt);
      b.lean += (0 - b.lean) * Math.min(1, 6 * dt);
    }
    const roll = (b.speed / 0.33) * dt * m.turn;
    for (const wheel of m.wheels) wheel.rotation[m.axis] += roll;
    const cadence = mode === 'bike' && b.pedalling ? Math.max(3, Math.abs(b.speed) * 0.9) : 0;
    b.crank += cadence * dt;
    m.crank.rotation[m.axis] = b.crank * m.turn;
    m.group.position.set(b.x, b.y, b.z);
    m.group.rotation.set(0, b.h, b.lean);
  }

  // Gets the hero back on his own feet from whatever he is in or on, if it will let him.
  function backOnFoot() {
    if (mode === 'car') exitVehicle();
    else if (mode === 'horse') dismountHorse();
    else if (mode === 'heli') leaveHeli();
    else if (mode === 'bike') dismountBike();
    return mode === 'foot';
  }

  // Which of the horse or the helicopter is within reach on foot, if either.
  function nearestRide() {
    const reach = (thing, dist) =>
      thing && Math.abs(thing.y - car.y) < 2 && Math.hypot(thing.x - car.x, thing.z - car.z) < dist;
    if (reach(heli, 4)) return 'heli';
    if (reach(horse, 3)) return 'horse';
    if (reach(bike, 2.2)) return 'bike';
    return null;
  }

  function setJetpack(on) {
    hero.jetpack = on;
    hero.model.pack.visible = on;
    for (const flame of hero.model.flames) flame.visible = false;
  }

  // ---------- Cheat console ----------

  let cheatOpen = false;

  function toggleCheats(open) {
    cheatOpen = open;
    $('cheat').hidden = !open;
    keys.clear();
    if (open) {
      $('cheat-input').value = '';
      $('cheat-input').focus();
    } else {
      $('cheat-input').blur();
    }
  }

  function runCheat(text) {
    const code = text.trim().toLowerCase().replace(/\s+/g, '');
    const kinds = { car: 'sports', sportscar: 'sports', supercar: 'sports', sedan: 'sedan', hatchback: 'hatch',
      suv: 'suv', truck: 'pickup', pickup: 'pickup', bus: 'bus', motorbike: 'moto', motorcycle: 'moto' };
    if (kinds[code]) {
      // swap into a new sports car on the spot
      if (mode !== 'car' && !backOnFoot()) return; // still moving too fast to get off
      const at = { x: car.x, y: car.y, z: car.z, h: car.heading };
      if (mode === 'car') {
        scene.remove(player.group);
        if (insideView) setInsideView(false);
      }
      const model = createCar(pick(kinds[code] === 'sports' ? SPORTS_COLORS : TRAFFIC_COLORS), kinds[code]);
      model.group.position.set(at.x, at.y, at.z);
      drive(model, at.x, at.y, at.z, at.h);
      showToast('Vehicle delivered');
    } else if (code === 'horse') {
      if (mode === 'horse') {
        showToast('Already riding', true);
        return;
      }
      if (!backOnFoot()) return; // whatever he is in has to be stopped first
      summonHorse();
      showToast('Horse summoned');
    } else if (code === 'bike' || code === 'cycle' || code === 'bicycle') {
      if (mode === 'bike') {
        showToast('Already riding', true);
        return;
      }
      if (!backOnFoot()) return; // still moving too fast to get out
      summonBike();
      showToast('Bike delivered');
    } else if (code === 'heli' || code === 'helicopter') {
      if (mode === 'heli') {
        showToast('Already flying', true);
        return;
      }
      if (!backOnFoot()) return; // still moving too fast to get out
      summonHeli();
      showToast('Helicopter delivered: hold Space to take off');
    } else if (code === 'rocketman' || code === 'jetpack') {
      setJetpack(!hero.jetpack);
      showToast(hero.jetpack ? 'Rocket pack on: hold Space to fly' : 'Rocket pack off');
    } else if (WEATHERS[code]) {
      setWeather(code);
      showToast(`Weather: ${code}`);
    } else if ({ morning: 7.5, noon: 12, afternoon: 14.5, evening: 17.5, night: 22 }[code] !== undefined) {
      env.hour = { morning: 7.5, noon: 12, afternoon: 14.5, evening: 17.5, night: 22 }[code];
      showToast(`Time: ${code}`);
    } else if (code === 'nocops') {
      setWanted(0);
      showToast('Wanted level cleared');
    } else if (code) {
      showToast(`Unknown cheat "${text.trim()}"`, true);
    }
  }

  // ---------- Simulation ----------

  const approach = (value, goal, step) =>
    value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step);

  // The circles a vehicle is made of for collisions: spaced along its length, each as wide
  // as it is. Offsets are metres ahead of its centre.
  function bodyCircles(model) {
    if (!model.circles) {
      const { hl, hw } = model.dims;
      const r = hw + 0.15;
      const reach = Math.max(0, hl - r);
      const count = Math.max(2, Math.ceil(hl / r));
      model.circles = { r, offsets: Array.from({ length: count }, (_, i) => -reach + (2 * reach * i) / (count - 1)) };
    }
    return model.circles;
  }

  function updateCar(dt) {
    const forward = keys.has('KeyW') || keys.has('ArrowUp');
    const back = keys.has('KeyS') || keys.has('ArrowDown');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const handbrake = keys.has('Space');
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const grounded = car.y <= groundAt(car.x, car.z, car.y) + 0.02;
    const stats = player.stats;
    const { hl, hw, wb } = player.dims;

    // split velocity into forward and sideways parts (at heading 0 the car faces +z, left is +x)
    let fx = Math.sin(car.heading);
    let fz = Math.cos(car.heading);
    let vf = car.vx * fx + car.vz * fz;
    let vl = car.vx * fz - car.vz * fx;
    const before = vf;

    // nitro
    if (car.nitro <= 0) car.nitroLocked = true;
    if (car.nitro > 0.15) car.nitroLocked = false;
    car.boosting = shift && forward && !car.nitroLocked;
    car.nitro = car.boosting
      ? Math.max(0, car.nitro - NITRO_DRAIN * dt)
      : Math.min(1, car.nitro + NITRO_REFILL * dt);

    // the wheel turns at a steady rate and centres itself a little faster
    const input = (left ? 1 : 0) - (right ? 1 : 0);
    car.steer = approach(car.steer, input, (input === 0 ? 6 : 4) * settings.steering * dt);
    // flat tyres: less grip, less speed, and a pull toward the flat corner
    const flats = player.flats || [];
    const lame = Math.max(0.35, 1 - 0.2 * flats.length);

    let yaw = 0;
    // the wheels only do anything while they touch something
    if (grounded) {
      if (forward) {
        if (vf < -0.5) vf += stats.brake * settings.brakes * dt;
        else {
          const top = (car.boosting ? stats.nitroTop : stats.top) * lame;
          vf += (car.boosting ? stats.nitroEngine : stats.engine) * settings.power * (1 - vf / top) * dt;
        }
      } else if (back) {
        if (vf > 0.5) vf -= stats.brake * settings.brakes * dt;
        else vf -= stats.engine * 0.6 * (1 + vf / REVERSE_SPEED) * dt;
      } else {
        vf = approach(vf, 0, (COAST + Math.abs(vf) * 0.06) * dt); // engine braking and drag
      }
      if (handbrake) vf = approach(vf, 0, HANDBRAKE * dt);

      // tyres: sideways speed is scrubbed off at once with grip, slowly when the handbrake locks the rear
      vl *= Math.exp(-(handbrake ? HANDBRAKE_GRIP : stats.grip * settings.grip * Math.max(0.3, 1 - 0.3 * flats.length)) * dt);

      // Steering turns the front wheels, and the car follows the arc they make: tight at
      // walking pace, and at speed only as tight as the tyres can hold. So a corner has to
      // be slowed for, and the car goes where it is pointed instead of pivoting on the spot.
      const lock = (Math.tan(0.6) / wb) * Math.abs(vf);
      const hold = ((handbrake ? TYRE_HOLD * 1.5 : TYRE_HOLD) * settings.grip) / Math.max(1, Math.abs(vf));
      yaw = car.steer * Math.sign(vf) * Math.min(lock, hold) * settings.steering;
      // a flat drags the car toward its corner (the front ones hardest) and sets it weaving
      const pull = flats.reduce((sum, f) => sum + f.side * (f.front ? 1 : 0.5), 0);
      const weave = flats.length * Math.sin(clock * 11) * 0.05 * Math.min(1, Math.abs(vf) / 10);
      car.heading += (yaw + pull * 0.009 * vf + weave) * dt; // hard work to hold straight, but it can be held
    }

    fx = Math.sin(car.heading);
    fz = Math.cos(car.heading);
    car.vx = fx * vf + fz * vl;
    car.vz = fz * vf - fx * vl;
    car.x += car.vx * dt;
    car.z += car.vz * dt;

    car.hitTimer = Math.max(0, (car.hitTimer || 0) - dt);
    collide(fx, fz);
    if (grounded && car.y < 0.5) hitPotholes(fx, fz, Math.abs(vf));
    const airborne = settle(dt);

    // keep the car on the map
    clampToWorld();

    // nose follows the slope on a ramp, and dips as the car falls
    let pitch;
    if (airborne) {
      pitch = Math.max(-0.35, Math.min(0.5, -car.vy * 0.02));
    } else {
      const front = groundAt(car.x + fx * wb / 2, car.z + fz * wb / 2, car.y);
      const rear = groundAt(car.x - fx * wb / 2, car.z - fz * wb / 2, car.y);
      pitch = -Math.atan(Math.max(-0.4, Math.min(0.4, (front - rear) / wb)));
      // the body squats under power and dives under braking
      const surge = dt > 0 ? (vf - before) / dt : 0;
      pitch -= Math.max(-0.035, Math.min(0.035, surge * 0.0022));
    }
    car.pitch += (pitch - car.pitch) * Math.min(1, 10 * dt);
    // it leans out of a corner; a motorbike leans into it
    const cornering = yaw * vf; // sideways acceleration, positive turning left
    const roll = player.moto
      ? -Math.max(-0.7, Math.min(0.7, cornering * 0.07))
      : Math.max(-0.06, Math.min(0.06, cornering * 0.005));
    car.roll = (car.roll || 0) + (roll - (car.roll || 0)) * Math.min(1, 8 * dt);

    layTyreMarks(fx, fz, grounded, handbrake && Math.abs(vf) > 6 ? 0.45 : Math.abs(vl) > 5 ? 0.35 : 0);

    // visuals
    player.group.position.set(car.x, car.y, car.z);
    player.group.rotation.set(car.pitch, car.heading, car.roll + flatLean(player));
    for (const pivot of player.frontPivots) pivot.rotation.y = car.steer * 0.5;
    // seen from the driver's seat, a left turn spins the wheel anticlockwise
    player.steeringWheel.rotation[player.steerAxis || 'z'] = -car.steer * 1.6 * (player.steerTurn || 1);
    for (const wheel of player.wheels) wheel.rotation.x += (player.spin || 1) * (vf / 0.38) * dt;
    player.tailMat.color.setHex(back || handbrake ? 0xff2a2a : tailIdle);
    player.flame.visible = car.boosting;
    player.flame.scale.y = 0.8 + Math.random() * 0.5;

    return vf;
  }

  // The car is a row of circles tested against every box. A hard enough knock dents both
  // the car and, if the box belongs to another vehicle, that vehicle too.
  function collide(fx, fz) {
    const { r, offsets } = bodyCircles(player);
    for (const offset of offsets) {
      for (const box of colliders.concat(trafficBoxes, policeBoxes)) {
        if (!blocksPlayer(box)) continue;
        const cx = car.x + fx * offset;
        const cz = car.z + fz * offset;
        const touch = boxContact(box, cx, cz, r);
        if (!touch) continue;
        const { nx, nz } = touch;
        const push = r - touch.dist;
        car.x += nx * push;
        car.z += nz * push;
        const into = car.vx * nx + car.vz * nz;
        if (into < 0) {
          if (into < -2.5 && car.hitTimer <= 0) {
            car.hitTimer = 0.3;
            const y = car.y + 0.6;
            damageCar(player, cx - nx * r, y, cz - nz * r, nx, nz, -into);
            if (box.owner) damageCar(box.owner, cx - nx * r, y, cz - nz * r, -nx, -nz, -into * 0.8);
            bump = Math.max(bump, Math.min(1, -into / 14));
            playCrash(Math.min(1, -into / 18));
          }
          car.vx -= nx * into * 1.2;
          car.vz -= nz * into * 1.2;
          car.vx *= 0.9;
          car.vz *= 0.9;
        }
      }
    }
  }

  // --- damage ---

  const dentPoint = new THREE.Vector3();
  const dentPush = new THREE.Vector3();
  const dentInverse = new THREE.Matrix4();
  const brokenGlass = new THREE.MeshPhongMaterial({
    color: 0xd9e1e8, transparent: true, opacity: 0.78, shininess: 30, side: THREE.DoubleSide,
    map: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#9fb0bd';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      // cracks running out from a few impact points, with rings between them
      for (let n = 0; n < 5; n++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2 + Math.random() * 0.3;
          g.lineWidth = 0.6 + Math.random();
          g.beginPath();
          g.moveTo(cx, cy);
          let x = cx;
          let y = cy;
          for (let s = 0; s < 6; s++) {
            x += Math.cos(a + (Math.random() - 0.5) * 0.5) * 22;
            y += Math.sin(a + (Math.random() - 0.5) * 0.5) * 22;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        for (const ring of [14, 30, 52]) {
          g.lineWidth = 0.6;
          g.beginPath();
          g.arc(cx, cy, ring + Math.random() * 6, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }),
  });

  // Dents a vehicle where it was struck. (px, py, pz) is the point of contact and (nx, nz)
  // the way the blow pushed. A light knock leaves a shallow dent; a hard one caves the
  // panel in over a wide area, and a very hard one, or several, breaks the glass.
  function damageCar(model, px, py, pz, nx, nz, speed) {
    if (!model.deform || speed < 2.5) return;
    const depth = Math.min(0.42, 0.03 + speed * 0.015);
    const radius = Math.min(1.4, 0.45 + speed * 0.04);
    model.damage = (model.damage || 0) + speed / 30;

    for (const mesh of model.deform) {
      if (!mesh.userData.pristine) {
        // every vehicle of a kind shares one shape: this one now needs its own copy
        mesh.userData.pristine = mesh.geometry;
        mesh.geometry = mesh.geometry.clone();
      }
      mesh.updateWorldMatrix(true, false);
      dentInverse.copy(mesh.matrixWorld).invert();
      dentPoint.set(px, py, pz).applyMatrix4(dentInverse);
      dentPush.set(nx, 0, nz).transformDirection(dentInverse);
      const position = mesh.geometry.attributes.position;
      const normal = mesh.geometry.attributes.normal;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const d = Math.hypot(x - dentPoint.x, y - dentPoint.y, z - dentPoint.z);
        if (d >= radius) continue;
        const fall = (1 - d / radius) ** 2;
        // the same wobble for every corner at a point, so triangles stay joined
        const wobble = Math.sin(x * 37.1 + y * 17.3 + z * 29.7);
        const move = depth * fall * (0.8 + 0.35 * wobble);
        position.setXYZ(i, x + dentPush.x * move, y + dentPush.y * move + wobble * depth * fall * 0.25, z + dentPush.z * move);
        if (normal) {
          // crumpled metal catches the light unevenly
          const k = fall * 0.9;
          normal.setXYZ(i,
            normal.getX(i) + Math.sin(x * 51 + z * 13) * k,
            normal.getY(i) + Math.sin(y * 47 + x * 19) * k,
            normal.getZ(i) + Math.sin(z * 43 + y * 23) * k);
        }
      }
      position.needsUpdate = true;
      if (normal) {
        for (let i = 0; i < normal.count; i++) {
          const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) || 1;
          normal.setXYZ(i, normal.getX(i) / len, normal.getY(i) / len, normal.getZ(i) / len);
        }
        normal.needsUpdate = true;
      }
    }

    // glass: crazed by a hard hit or a run of smaller ones, gone altogether after worse
    const shatter = speed > 22 || model.damage > 2.4;
    const crack = speed > 13 || model.damage > 1.2;
    for (const glass of model.glassParts) {
      if (!glass.userData.material) glass.userData.material = glass.material;
      if (shatter) glass.visible = false;
      else if (crack) glass.material = brokenGlass;
    }

    // a hard enough knock, or one too many, bursts the nearest tyre
    if (speed > 16 ? Math.random() < 0.6 : model.damage > 1.6 && Math.random() < 0.4) {
      const wheel = nearestWheel(model, px, pz);
      if (wheel >= 0) punctureTyre(model, wheel);
    }
  }

  // Makes a vehicle as new: panels back in shape, glass replaced, tyres pumped up.
  function repairCar(model) {
    for (const mesh of model.deform || []) {
      if (!mesh.userData.pristine) continue;
      mesh.geometry.dispose();
      mesh.geometry = mesh.userData.pristine;
      mesh.userData.pristine = null;
    }
    for (const glass of model.glassParts || []) {
      glass.visible = true;
      if (glass.userData.material) glass.material = glass.userData.material;
    }
    for (const flat of model.flats || []) model.wheels[flat.index].position.y = model.wheels[flat.index].userData.y0;
    model.flats = [];
    model.damage = 0;
  }

  // --- tyres ---

  const wheelPoint = new THREE.Vector3();

  // Lets the air out of one of a vehicle's tyres: the wheel sits down on its rim, and the
  // vehicle pulls toward that corner and grips less until it is repaired.
  function punctureTyre(model, index) {
    model.flats = model.flats || [];
    if (model.flats.some((f) => f.index === index)) return;
    const wheel = model.wheels[index];
    wheel.getWorldPosition(wheelPoint);
    model.group.worldToLocal(wheelPoint); // where the wheel is on the vehicle: +x left, +z front
    if (wheel.userData.y0 === undefined) wheel.userData.y0 = wheel.position.y;
    wheel.position.y = wheel.userData.y0 - 0.07;
    model.flats.push({ index, side: Math.sign(wheelPoint.x), front: wheelPoint.z > 0 });
    playPop();
    if (model === player) showToast('Tyre punctured: press R to repair', true);
  }

  // The wheel nearest a point in the world, for a knock or a bullet that lands near one.
  function nearestWheel(model, x, z) {
    let best = -1;
    let bestDist = Infinity;
    model.wheels.forEach((wheel, i) => {
      wheel.getWorldPosition(wheelPoint);
      const d = Math.hypot(wheelPoint.x - x, wheelPoint.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  // --- tyre marks ---

  // Dark streaks on the road: wet tracks after driving through a puddle, and rubber laid
  // down by a locked or sliding tyre. All the marks are quads in one mesh that darkens
  // whatever is under it; each fades as it dries or wears away.
  const MARKS = 500;
  const MARK_LIFE = 22;
  let markMesh = null;
  let nextMark = 0;
  const markInfo = Array.from({ length: MARKS }, () => ({ life: 0, strength: 0 }));
  const wheelTrack = [null, null]; // where each rear wheel last left a mark

  function layTyreMarks(fx, fz, grounded, skid) {
    const { hw, wb } = player.dims;
    const spots = (player.moto ? [0] : [1, -1]).map((side) => [
      car.x - fx * wb / 2 + fz * side * (hw - 0.16),
      car.z - fz * wb / 2 - fx * side * (hw - 0.16),
    ]);
    // a wheel through standing water wets the tyres for the next thirty metres or so
    if (grounded && car.y < 0.5 && spots.some(([x, z]) => insideDecal(puddles, x, z, 0.85))) car.wet = 1;
    const strength = Math.max(skid, (car.wet || 0) * 0.5);
    if (!grounded || strength < 0.04) {
      wheelTrack[0] = wheelTrack[1] = null;
      return;
    }
    if (!markMesh) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MARKS * 18), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MARKS * 18).fill(1), 3));
      markMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      markMesh.frustumCulled = false;
      markMesh.renderOrder = 0.75;
      scene.add(markMesh);
    }
    const position = markMesh.geometry.attributes.position;
    spots.forEach(([x, z], w) => {
      const last = wheelTrack[w];
      if (!last) {
        wheelTrack[w] = [x, z];
        return;
      }
      const length = Math.hypot(x - last[0], z - last[1]);
      if (length < 0.5) return;
      if (length < 4) {
        const nx = (-(z - last[1]) / length) * 0.11;
        const nz = ((x - last[0]) / length) * 0.11;
        const y = car.y + 0.115;
        const k = nextMark++ % MARKS;
        position.array.set([
          last[0] + nx, y, last[1] + nz, last[0] - nx, y, last[1] - nz, x + nx, y, z + nz,
          last[0] - nx, y, last[1] - nz, x - nx, y, z - nz, x + nx, y, z + nz,
        ], k * 18);
        position.needsUpdate = true;
        markInfo[k].life = MARK_LIFE;
        markInfo[k].strength = strength;
        car.wet = Math.max(0, (car.wet || 0) - length / 30);
      }
      wheelTrack[w] = [x, z];
    });
  }

  function fadeTyreMarks(dt) {
    if (!markMesh) return;
    const color = markMesh.geometry.attributes.color;
    for (let k = 0; k < MARKS; k++) {
      const mark = markInfo[k];
      if (mark.life <= 0) continue;
      mark.life -= dt;
      const shade = 1 - mark.strength * Math.max(0, Math.min(1, mark.life / 8));
      for (let v = 0; v < 6; v++) color.setXYZ(k * 6 + v, shade, shade, shade);
    }
    color.needsUpdate = true;
  }

  function updateParking(dt, speed) {
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const inside = Math.abs(dx) < 0.7 && Math.abs(dz) < 1.1;
    const aligned = Math.abs(Math.sin(car.heading)) < 0.25;

    parkTimer = mode === 'car' && car.y < 0.5 && inside && aligned && speed < 0.4 ? parkTimer + dt : 0;
    if (parkTimer > 0.5) {
      parkedCount++;
      parkTimer = 0;
      showToast('Parked! Next bay marked');
      chooseTarget();
    }

    const pulse = 0.45 + Math.sin(performance.now() / 250) * 0.2;
    targetPad.material.opacity = pulse;
    targetPad.material.color.setHex(inside ? 0x39d98a : 0xffcc00);

    // arrow points to the target relative to where the car is facing
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const ahead = dx * fx + dz * fz;
    const toLeft = dx * fz - dz * fx;
    $('arrow').style.transform = `rotate(${-Math.atan2(toLeft, ahead)}rad)`;
    $('distance').textContent = Math.round(Math.hypot(dx, dz));
    $('parked').textContent = parkedCount;
  }

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function updateCamera(dt, speed, snap) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let fov = 60;

    if (mode === 'foot') {
      // over the right shoulder, looking exactly along the aim so the crosshair is true
      const flat = Math.cos(hero.pitch);
      const dx = fx * flat;
      const dy = Math.sin(hero.pitch);
      const dz = fz * flat;
      camera.position.set(
        car.x - dx * 4.2 - fz * 0.7,
        Math.max(car.y + 0.4, car.y + 1.9 - dy * 4.2),
        car.z - dz * 4.2 + fx * 0.7
      );
      camLook.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
    } else if (insideView) {
      // driver's eye: left seat, looking down the bonnet and slightly into the turn
      const lx = fz;
      const lz = -fx;
      const lean = car.steer * 1.2;
      const eye = player.stats.eye;
      const [ahead, across] = player.seat || [-0.2, 0.38];
      camera.position.set(car.x + fx * ahead + lx * across, car.y + eye, car.z + fz * ahead + lz * across);
      camLook.set(car.x + fx * 14 + lx * (0.38 + lean), car.y + eye - 0.12 - Math.tan(car.pitch) * 14, car.z + fz * 14 + lz * (0.38 + lean));
      fov = 72 + (car.boosting ? 12 : 0);
    } else {
      // chase camera: closer and lower behind a horse, further back behind the helicopter
      const [back, up, look] = { horse: [6.5, 3.3, 1.8], heli: [15, 6.5, 2], bike: [5.5, 2.7, 1.3] }[mode]
        || [5.5 + player.dims.hl * 1.5, 2.9 + player.roof, 1.2]; // further back behind something long
      const distance = back + speed * 0.08;
      camPos.set(car.x - fx * distance, car.y + up + speed * 0.03, car.z - fz * distance);
      camLook.set(car.x + fx * 4, car.y + look, car.z + fz * 4);
      camera.position.lerp(camPos, snap ? 1 : 1 - Math.exp(-7 * dt));
      fov = 60 + (car.boosting ? 12 : 0);
    }
    if (bump > 0) camera.position.y += Math.sin(clock * 75) * 0.05 * bump; // rattled by a pothole
    const floor = terrain(camera.position.x, camera.position.z) + 0.5;
    if (camera.position.y < floor) {
      camLook.y += floor - camera.position.y;
      camera.position.y = floor;
    }
    camera.lookAt(camLook);

    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }

    skyDome.position.copy(camera.position);
    skyDome.material.uniforms.time.value = clock;
    sun.position.set(car.x + SUN_DIR.x * 150, SUN_DIR.y * 150, car.z + SUN_DIR.z * 150);
    sun.target.position.set(car.x, 0, car.z);
  }

  function updateHud(vf, speed) {
    $('speed').textContent = Math.round(speed * 3.6);
    $('gear').textContent = speed < 0.3 ? 'N' : vf < 0 ? 'R' : 'D';
    $('nitro').style.width = `${car.nitro * 100}%`;
    $('nitro').classList.toggle('active', car.boosting);
  }

  // ---------- Loop & input ----------

  let last = 0;

  let settingsOpen = false;

  function toggleSettings(open) {
    settingsOpen = open;
    $('settings').hidden = !open;
    keys.clear();
    if (open && document.exitPointerLock) document.exitPointerLock();
  }

  // the sliders on the settings page
  const sliders = [...document.querySelectorAll('[data-setting]')];
  for (const slider of sliders) {
    const name = slider.dataset.setting;
    slider.value = settings[name];
    const show = () => { slider.nextElementSibling.textContent = `${Math.round(settings[name] * 100)}%`; };
    show();
    slider.addEventListener('input', () => {
      settings[name] = Number(slider.value);
      show();
      if (audio) audio.master.gain.value = settings.volume;
      try {
        localStorage.setItem('car-drive-settings', JSON.stringify(settings));
      } catch (error) {
        // storage unavailable: the change lasts for this visit only
      }
    });
  }
  $('settings-reset').addEventListener('click', () => {
    for (const slider of sliders) {
      slider.value = SETTING_DEFAULTS[slider.dataset.setting];
      slider.dispatchEvent(new Event('input'));
    }
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!settingsOpen) tick(dt); // the settings page pauses the game
    if (!reflection && clock > 0.6) captureReflections(); // once the textures have decoded
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // One simulation step.
  function tick(dt) {
    clock += dt;
    updateEnvironment(dt);
    updateTraffic(dt);
    updateWalkers(dt);
    updateBirds(dt);
    updateAnimals(dt);
    updateLights();

    let vf = 0;
    if (mode === 'car') vf = updateCar(dt);
    else if (mode === 'horse') updateRiding(dt);
    else if (mode === 'heli') updateHeli(dt);
    else if (mode === 'bike') updateBiking(dt);
    else if (entering) updateEntering(dt);
    else updateHero(dt);
    updateDoors(dt);
    if (horse) animateHorse(dt);
    if (heli) animateHeli(dt);
    if (bike) animateBike(dt);
    updateHeroSkin(dt);
    const speed = Math.hypot(car.vx, car.vz);
    if (mode === 'car' && car.y < 1) checkPedestrianHits(speed);
    if (mode === 'car') checkSignalHits(speed);
    updateToppling(dt);
    dryFootprints(dt);
    fadeTyreMarks(dt);
    bump = Math.max(0, bump - 3 * dt);
    updateShots(dt);
    updatePolice(dt, speed);
    updateParking(dt, speed);
    updateCamera(dt, speed, false);
    updateHud(vf, speed);
    updateRoute(dt);
    drawMap();

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) $('toast').hidden = true;
    }
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      toggleCheats(!cheatOpen);
      return;
    }
    if (cheatOpen) {
      // typing a cheat: Enter runs it, Escape cancels, and nothing reaches the game
      if (e.code === 'Enter') {
        const text = $('cheat-input').value;
        toggleCheats(false);
        runCheat(text);
      } else if (e.code === 'Escape') {
        toggleCheats(false);
      }
      return;
    }
    if (BLOCKED.has(e.code)) e.preventDefault();
    startAudio();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyF') {
      if (mode === 'car') exitVehicle();
      else if (mode === 'horse') dismountHorse();
      else if (mode === 'heli') leaveHeli();
      else if (mode === 'bike') dismountBike();
      else if (hero.climb) return;
      else if (nearestRide() === 'heli') boardHeli();
      else if (nearestRide() === 'horse') mountHorse();
      else if (nearestRide() === 'bike') mountBike();
      else enterVehicle();
    }
    if (e.code === 'KeyC' && mode === 'car' && !player.moto) setInsideView(!insideView);
    if (e.code === 'Digit0') setWeapon('fist');
    if (e.code === 'Digit1') setWeapon('gun');
    if (e.code === 'Digit2') setWeapon('bow');
    if (e.code === 'KeyP') toggleSettings(!settingsOpen);
    if (e.code === 'KeyM') toggleBigMap(!mapOpen);
    if (e.code === 'Escape' && mapOpen) toggleBigMap(false);
    if (e.code === 'KeyR' && mode === 'car') {
      repairCar(player);
      showToast('Repaired: good as new');
    }
    if (e.code === 'Backspace') {
      resetCar();
      updateCamera(0, 0, true);
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // mouse look and shooting work once the pointer is captured by clicking the game
  const canvas = renderer.domElement;
  canvas.addEventListener('mousedown', (e) => {
    startAudio();
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    else if (e.button === 0) fire();
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || mode !== 'foot') return;
    hero.yaw -= e.movementX * 0.0025;
    hero.pitch = Math.max(-0.7, Math.min(1.1, hero.pitch - e.movementY * 0.002));
  });
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', resize);

  // ---------- Start ----------

  // Everything is built once the embedded models have been decoded (or have failed to),
  // because the cars and the things you can ride are made from them.
  function start() {
    buildCity();
    addStreetLamps();
    addRoadDetails();
    addRoadSigns();
    addSky();
    headBeam = new THREE.SpotLight(0xfff0d0, 0, 75, 0.55, 0.6, 1.2);
    scene.add(headBeam, headBeam.target);
    buildHills();
    buildVegetation();
    spawnAnimals();
    addParkedCars();
    buildTrafficLights();
    spawnTraffic();
    spawnWalkers(PEOPLE, createPerson, 1.1, 1.8);
    spawnWalkers(DOGS, createDog, 1.6, 2.8);
    spawnBirds();
    addIdleCar(createCar(0xe63946, 'sports'), START.x, 0, START.z, START.heading);
    hero.model = createHero();
    loadHeroSkin();
    tracer = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xfff2a8 })
    );
    tracer.visible = false;
    tracer.frustumCulled = false;
    scene.add(tracer);
    setMode('foot');
    setWeapon('fist');
    buildPolice();
    buildMap();

    targetPad = flatPlane(BAY_W - 0.3, BAY_L - 0.3, 0xffcc00, 0, 0, 0.12);
    targetPad.material = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.5 });
    targetBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    scene.add(targetBeacon);

    // An instanced mesh is culled as if all its copies sat at the origin, so never cull them.
    scene.traverse((o) => {
      if (o.isInstancedMesh) o.frustumCulled = false;
    });

    resetCar();
    chooseTarget();
    resize();
    updateCamera(0, 0, true);
    requestAnimationFrame((now) => {
      last = now;
      frame(now);
    });
  }

  Promise.all([
    new Promise((ready) => loadCarModel(ready)),
    loadRideModels(),
    loadNpcModels(),
  ]).then(start);
})();
