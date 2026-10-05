(() => {
  'use strict';

  // ---------- Tuning ----------

  const BLOCKS = 7; // city is BLOCKS x BLOCKS
  const BLOCK_SIZE = 60;
  const ROAD_WIDTH = 16;
  const CELL = BLOCK_SIZE + ROAD_WIDTH;
  const WORLD = BLOCKS * CELL + ROAD_WIDTH;
  const HALF = WORLD / 2;
  const PARKING_LOTS = [[5, 1], [1, 5]]; // block coordinates

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
  const MAP_SIZE = 150;

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
    if (reflection) material.envMap = reflectionNow || reflection;
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

  // --- building materials ---

  // Facades are photographs of real buildings (city-textures.js): the wall by day, which
  // parts are glass (those reflect the sky), the relief, and pictures of which windows are
  // lit at night. A tile is square, `tile` metres across, with `floors` floors and `bays`
  // windows across, so heights and widths can be whole floors and bays.
  const cityTex = window.CITY_TEXTURES || null;
  const litMaterials = []; // materials that glow after dark, each with userData.glow
  const FACADE_GRID = {
    brick: [6, 6], office: [6, 6], loft: [6, 6], tower: [12, 12], highrise: [32, 32], block: [32, 32],
    glass: [10, 16], ribbon: [8, 14],
  };

  function loadedTexture(uri, repeat = true) {
    const tex = photoTexture(uri);
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  const FACADES = {};
  if (cityTex) {
    for (const [name, f] of Object.entries(cityTex.facades)) {
      const [floors, bays] = FACADE_GRID[name];
      const color = loadedTexture(f.color);
      const normal = loadedTexture(f.normal);
      const glass = loadedTexture(f.glass);
      FACADES[name] = {
        tile: f.tile, floor: f.tile / floors, bay: f.tile / bays, floors, bays,
        // one material per night picture, so neighbouring buildings light different windows
        materials: f.night.map((night) => {
          const material = reflect(new THREE.MeshPhongMaterial({
            map: color, normalMap: normal, normalScale: new THREE.Vector2(0.7, 0.7), specularMap: glass,
            specular: 0x8a9098, shininess: 70, emissiveMap: loadedTexture(night), emissive: 0x000000,
          }), 0.55);
          material.userData.glow = name === 'highrise' || name === 'block' ? 0.62 : name === 'office' || name === 'ribbon' ? 0.7 : 0.8;
          litMaterials.push(material);
          return material;
        }),
      };
    }
  } else {
    // without the photographs: the drawn facades, one tile per 4 floors by 4 bays
    const drawn = { brick: ['brick', '#9c4a36'], office: ['ribbon', '#b9bcc0'], loft: ['plaster', '#e6d5b8'],
      tower: ['glass', '#2f4f6f'], highrise: ['glass', '#3a6b7c'], block: ['ribbon', '#a7a39b'],
      glass: ['glass', '#2f4f6f'], ribbon: ['ribbon', '#b9bcc0'] };
    for (const [name, [style, wall]] of Object.entries(drawn)) {
      FACADES[name] = { tile: 12, floor: 3, bay: 3, floors: 4, bays: 4, materials: [facadeMaterial(style, wall)] };
    }
  }

  const cityMaterial = (name, color = 0xffffff, extra = {}) => {
    const m = cityTex && cityTex.materials[name];
    if (!m) return new THREE.MeshLambertMaterial({ color, map: grainTex, ...extra });
    const material = new THREE.MeshPhongMaterial({
      color, map: loadedTexture(m.color), shininess: 12, specular: 0x1a1a1a, ...extra,
    });
    if (m.normal) material.normalMap = loadedTexture(m.normal);
    material.userData.tile = m.tile;
    return material;
  };
  const tileOf = (material) => material.userData.tile || 4;

  const roofGravel = cityMaterial('gravel', 0x8c8f94);
  const roofConcrete = cityMaterial('concrete', 0xb5b8bc);
  const parapetMat = cityMaterial('concrete', 0xd5d6d8);
  const plantMat = cityMaterial('concrete', 0x9da2a8);
  const roofTileMats = [cityMaterial('roofTiles', 0xffffff), cityMaterial('roofTiles', 0xd9b8a8), cityMaterial('roofSlate', 0xffffff)];
  const steelSheets = [cityMaterial('steel', 0xc9ced3), cityMaterial('steel', 0x9fb3c4), cityMaterial('steel', 0xd8d2c4)];
  const brickWall = cityMaterial('brickWall', 0xffffff);
  const glassBalustrade = reflect(new THREE.MeshPhongMaterial({
    color: 0x6d8394, transparent: true, opacity: 0.45, shininess: 90, specular: 0x99aabb, depthWrite: false,
  }), 0.4);
  const darkMetal = new THREE.MeshLambertMaterial({ color: 0x34383e });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x400808 }); // aircraft warning lamps, blinking at night

  // --- shop fronts ---

  // The ground floor of most buildings is shops: 16 different fronts, each 6 m wide and
  // 4.5 m high, drawn into one picture with a matching night picture of the lit windows
  // and signs.
  const SHOPS = ['CAFÉ', 'BAKERY', 'PHARMACY', 'BOOKS', 'MARKET', 'FLOWERS', 'DELI', 'SALON',
    'BANK', 'SHOES', 'OPTICIAN', 'PIZZA', 'NOODLES', 'HARDWARE', 'GALLERY', 'FITNESS'];
  const SHOP_STOREY = 4.5;
  const shopFronts = (() => {
    const cw = 256;
    const ch = 192;
    const fronts = [];
    const palette = ['#2f3a45', '#5a2e2a', '#24453a', '#3b3550', '#6b5a3a', '#2c4a63', '#4a4a4a', '#6e3b2f'];
    for (let n = 0; n < 16; n++) {
      fronts.push({ name: SHOPS[n], sign: palette[n % palette.length], awning: Math.random() < 0.45, tone: rand(0.7, 1) });
    }
    const draw = (night) => canvasTexture(cw * 4, ch * 4, (g) => {
      fronts.forEach((f, n) => {
        const x0 = (n % 4) * cw;
        const y0 = Math.floor(n / 4) * ch;
        const wall = night ? '#000' : ['#d9d4c8', '#bfb8ab', '#8f8a84', '#e8e2d6'][n % 4];
        g.fillStyle = wall;
        g.fillRect(x0, y0, cw, ch);
        if (!night) speckle(g, cw, ch, 300, 0.04);
        // sign band
        g.fillStyle = night ? '#000' : f.sign;
        g.fillRect(x0 + 10, y0 + 10, cw - 20, 34);
        g.font = 'bold 24px Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = night ? 'rgba(255,236,200,0.95)' : '#f2ede2';
        g.fillText(f.name, x0 + cw / 2, y0 + 28);
        // the window and door, with a hint of the shop inside
        const winTop = y0 + 58;
        const winBottom = y0 + ch - 14;
        const inside = g.createLinearGradient(0, winTop, 0, winBottom);
        if (night) {
          inside.addColorStop(0, `rgba(255,226,180,${0.6 * f.tone})`);
          inside.addColorStop(1, `rgba(220,170,120,${0.35 * f.tone})`);
        } else {
          inside.addColorStop(0, '#5d6e7c');
          inside.addColorStop(0.55, '#2c3640');
          inside.addColorStop(1, '#1c232a');
        }
        g.fillStyle = inside;
        g.fillRect(x0 + 14, winTop, 150, winBottom - winTop);
        g.fillRect(x0 + 178, winTop, 64, ch - 58);
        if (!night) {
          // shelves and goods behind the glass, and the sky caught in it
          for (let s = 0; s < 3; s++) {
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.fillRect(x0 + 18, winTop + 22 + s * 30, 142, 3);
            for (let k = 0; k < 9; k++) {
              g.fillStyle = `hsla(${rand(20, 60)}, 18%, ${rand(30, 60)}%, 0.4)`;
              g.fillRect(x0 + 22 + k * 15, winTop + 8 + s * 30, 10, 13);
            }
          }
          g.fillStyle = 'rgba(255,255,255,0.13)';
          g.beginPath();
          g.moveTo(x0 + 30, winBottom);
          g.lineTo(x0 + 80, winTop);
          g.lineTo(x0 + 105, winTop);
          g.lineTo(x0 + 55, winBottom);
          g.fill();
          g.fillStyle = '#2a2d31';
          g.fillRect(x0 + 12, winTop - 2, 154, 3); // frame
          g.fillRect(x0 + 176, winTop - 2, 68, 3);
          g.fillRect(x0 + 208, winTop, 2, ch - 58); // the door's two leaves
        }
        if (f.awning && !night) {
          for (let k = 0; k < 10; k++) {
            g.fillStyle = k % 2 ? '#efe9dc' : f.sign;
            g.fillRect(x0 + 10 + k * 15.6, y0 + 46, 15.6, 12);
          }
        }
        // pilasters between shops
        g.fillStyle = night ? '#000' : 'rgba(0,0,0,0.2)';
        g.fillRect(x0, y0, 4, ch);
        g.fillRect(x0 + cw - 4, y0, 4, ch);
      });
    });
    const day = draw(false);
    const glow = draw(true);
    const material = new THREE.MeshPhongMaterial({ map: day, emissiveMap: glow, emissive: 0x000000, shininess: 30, specular: 0x333333 });
    material.userData.glow = 1;
    litMaterials.push(material);
    return material;
  })();

  // --- houses ---

  // A house wall is one storey of plaster round a window, 4 m wide by 3 m; the picture has
  // the same wall twice, the second with its curtains drawn and the lamp on at night.
  const houseWall = (() => {
    const draw = (night) => canvasTexture(256, 96, (g, w, h) => {
      for (const half of [0, 1]) {
        const x0 = half * 128;
        g.fillStyle = night ? '#000' : '#f4f1ea';
        g.fillRect(x0, 0, 128, h);
        if (!night) speckle(g, 128, h, 200, 0.05);
        // window with a stone sill and a frame
        if (night) {
          if (half === 1) {
            const lamp = g.createRadialGradient(x0 + 64, 44, 4, x0 + 64, 44, 34);
            lamp.addColorStop(0, 'rgba(255,214,150,1)');
            lamp.addColorStop(1, 'rgba(230,160,90,0.55)');
            g.fillStyle = lamp;
            g.fillRect(x0 + 42, 22, 44, 46);
          }
        } else {
          g.fillStyle = '#ffffff';
          g.fillRect(x0 + 38, 18, 52, 54);
          const pane = g.createLinearGradient(0, 22, 0, 68);
          pane.addColorStop(0, '#8fa5b6');
          pane.addColorStop(1, '#2f3c48');
          g.fillStyle = pane;
          g.fillRect(x0 + 42, 22, 44, 46);
          g.fillStyle = '#ffffff';
          g.fillRect(x0 + 63, 22, 2, 46);
          g.fillRect(x0 + 42, 42, 44, 2);
          if (half === 1) {
            g.fillStyle = 'rgba(214,196,160,0.85)'; // curtains
            g.fillRect(x0 + 42, 22, 9, 46);
            g.fillRect(x0 + 77, 22, 9, 46);
          }
          g.fillStyle = '#c9c4ba';
          g.fillRect(x0 + 34, 72, 60, 5);
        }
      }
    });
    return { day: draw(false), night: draw(true) };
  })();
  const houseColors = [0xffffff, 0xf3e6c8, 0xe6ece9, 0xf1d9c2, 0xdfe6ef, 0xe9e4da];
  const houseMats = houseColors.map((color) => {
    const material = new THREE.MeshPhongMaterial({ color, map: houseWall.day, emissiveMap: houseWall.night, emissive: 0x000000, shininess: 8, specular: 0x111111 });
    material.userData.glow = 0.75;
    litMaterials.push(material);
    return material;
  });
  const doorMat = new THREE.MeshLambertMaterial({
    map: canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#5b3a24';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(8, 10, w - 16, 48);
      g.fillRect(8, 68, w - 16, 50);
      g.fillStyle = '#c9a65a';
      g.fillRect(w - 16, 64, 5, 5);
    }),
  });
  const garageMat = new THREE.MeshLambertMaterial({
    map: canvasTexture(128, 64, (g, w, h) => {
      g.fillStyle = '#e4e4e0';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = 6; y < h; y += 8) g.fillRect(0, y, w, 2);
    }),
  });
  const rollerMat = new THREE.MeshLambertMaterial({
    map: canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#9aa1a8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1.5);
    }),
  });
  const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x3f6b35, map: grainTex });
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0xece9e2 });

  // --- merged geometry ---

  // A building is many small parts. Each city block gathers its parts by material and
  // merges them, so the whole city draws in a few hundred calls instead of thousands.
  function makeBatch() {
    return new Map(); // material -> { positions, normals, uvs, index }
  }

  function batchPart(batch, material) {
    let part = batch.get(material);
    if (!part) batch.set(material, (part = { positions: [], normals: [], uvs: [], index: [] }));
    return part;
  }

  // A flat four-cornered face; corners go round anticlockwise seen from the front.
  function batchQuad(batch, material, corners, uvs) {
    const part = batchPart(batch, material);
    const base = part.positions.length / 3;
    const [a, b, c] = corners;
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      .cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    corners.forEach((p, i) => {
      part.positions.push(p[0], p[1], p[2]);
      part.normals.push(n.x, n.y, n.z);
      part.uvs.push(uvs[i][0], uvs[i][1]);
    });
    part.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // A triangle, for gable ends.
  function batchTriangle(batch, material, corners, uvs) {
    const part = batchPart(batch, material);
    const base = part.positions.length / 3;
    const [a, b, c] = corners;
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      .cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    corners.forEach((p, i) => {
      part.positions.push(p[0], p[1], p[2]);
      part.normals.push(n.x, n.y, n.z);
      part.uvs.push(uvs[i][0], uvs[i][1]);
    });
    part.index.push(base, base + 1, base + 2);
  }

  const batchMatrix = new THREE.Matrix4();
  const batchNormal = new THREE.Matrix3();
  const batchVec = new THREE.Vector3();
  // Any geometry, placed by `matrix`.
  function batchGeometry(batch, material, geo, matrix) {
    const part = batchPart(batch, material);
    const base = part.positions.length / 3;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    batchNormal.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      batchVec.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      part.positions.push(batchVec.x, batchVec.y, batchVec.z);
      batchVec.fromBufferAttribute(nor, i).applyMatrix3(batchNormal).normalize();
      part.normals.push(batchVec.x, batchVec.y, batchVec.z);
      part.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) part.index.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) part.index.push(base + i);
  }

  // A box from its centre and size, its faces textured `tile` metres per repeat.
  function batchBox(batch, material, x, y, z, w, h, d, turn = 0, tile = tileOf(material)) {
    const geo = tileBoxFaces(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
    batchMatrix.makeRotationY(turn).setPosition(x, y, z);
    batchGeometry(batch, material, geo, batchMatrix);
  }

  function flushBatch(batch, shadows = true) {
    for (const [material, part] of batch) {
      if (!part.index.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(part.uvs, 2));
      geo.setIndex(part.index);
      if (material.normalMap) computeTangentsSafe(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    batch.clear();
  }
  // (normal maps in three.js work from the uv layout alone; nothing more is needed)
  const computeTangentsSafe = () => {};

  // --- walls ---

  // Walls round a footprint polygon (corners anticlockwise from above) from y0 to y1, the
  // facade picture running continuously round the corners. `u0`, `v0` shift the picture by
  // whole bays and floors, so no two buildings show the same lit windows.
  function batchWalls(batch, material, corners, y0, y1, tile, u0 = 0, v0 = 0) {
    let run = 0;
    corners.forEach(([ax, az], i) => {
      const [bx, bz] = corners[(i + 1) % corners.length];
      const len = Math.hypot(bx - ax, bz - az);
      const ua = u0 + run / tile;
      const ub = u0 + (run + len) / tile;
      batchQuad(batch, material,
        [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]],
        [[ua, v0], [ub, v0], [ub, v0 + (y1 - y0) / tile], [ua, v0 + (y1 - y0) / tile]]);
      run += len;
    });
  }

  // A flat lid over a footprint polygon at height y (a fan from its first corner).
  function batchLid(batch, material, corners, y, tile = tileOf(material)) {
    for (let i = 1; i < corners.length - 1; i++) {
      const [a, b, c] = [corners[0], corners[i], corners[i + 1]];
      batchTriangle(batch, material, [[a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]]],
        [[a[0] / tile, a[1] / tile], [b[0] / tile, b[1] / tile], [c[0] / tile, c[1] / tile]]);
    }
  }

  // Footprint corners of a w x d rectangle round (x, z), anticlockwise from above
  // (+x left on the map, so this runs -x,-z → -x,+z → +x,+z → +x,-z ... in world terms
  // the order that makes the walls face outward). `cut` chamfers the corners.
  function footprintCorners(x, z, w, d, cut = 0) {
    const hw = w / 2;
    const hd = d / 2;
    if (!cut) return [[x - hw, z - hd], [x - hw, z + hd], [x + hw, z + hd], [x + hw, z - hd]];
    return [
      [x - hw, z - hd + cut], [x - hw, z + hd - cut], [x - hw + cut, z + hd], [x + hw - cut, z + hd],
      [x + hw, z + hd - cut], [x + hw, z - hd + cut], [x + hw - cut, z - hd], [x - hw + cut, z - hd],
    ];
  }

  const shrink = (corners, by) => {
    const cx = corners.reduce((s, c) => s + c[0], 0) / corners.length;
    const cz = corners.reduce((s, c) => s + c[1], 0) / corners.length;
    return corners.map(([x, z]) => [x + Math.sign(cx - x) * by, z + Math.sign(cz - z) * by]);
  };

  // A low wall round the roof's edge.
  function batchParapet(batch, corners, y, height = 1) {
    batchWalls(batch, parapetMat, corners, y, y + height, 4);
    const inner = shrink(corners, 0.3);
    batchWalls(batch, parapetMat, [...inner].reverse(), y, y + height, 4);
    // the coping along its top
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      const ia = inner[i];
      const ib = inner[(i + 1) % corners.length];
      batchQuad(batch, parapetMat, [[a[0], y + height, a[1]], [b[0], y + height, b[1]], [ib[0], y + height, ib[1]], [ia[0], y + height, ia[1]]],
        [[0, 0], [0, 1], [0.1, 1], [0.1, 0]]);
    });
  }

  // Air-conditioning plant, water tanks, a stair house and perhaps a mast on a flat roof.
  function batchRoofPlant(batch, x, z, w, d, y, tall) {
    const spot = (m) => [x + rand(-w / 2 + m, w / 2 - m), z + rand(-d / 2 + m, d / 2 - m)];
    if (w > 10 && d > 10) {
      const [sx, sz] = spot(5);
      batchBox(batch, plantMat, sx, y + 1.6, sz, 4.5, 3.2, 4.5);
    }
    for (let n = Math.floor(rand(2, 5)); n > 0; n--) {
      const [ux, uz] = spot(3);
      batchBox(batch, darkMetal, ux, y + 0.6, uz, rand(1.6, 3), 1.2, rand(1.4, 2.4));
    }
    if (Math.random() < 0.4) {
      const [tx, tz] = spot(4);
      batchMatrix.makeTranslation(tx, y + 1.3, tz);
      batchGeometry(batch, plantMat, new THREE.CylinderGeometry(1.3, 1.3, 2.6, 14), batchMatrix);
    }
    if (tall) {
      batchMatrix.makeTranslation(x, y + 6, z);
      batchGeometry(batch, darkMetal, new THREE.CylinderGeometry(0.12, 0.2, 12, 6), batchMatrix);
      batchMatrix.makeTranslation(x, y + 12.2, z);
      batchGeometry(batch, beaconMat, new THREE.SphereGeometry(0.35, 8, 6), batchMatrix);
    }
  }

  let standY = 0; // the ground the buildings being made stand on (the pavement, in the city)

  const facadeFor = (name) => {
    const f = FACADES[name];
    return { f, material: pick(f.materials), u0: Math.floor(rand(0, f.bays)) / f.bays, v0: Math.floor(rand(0, f.floors)) / f.floors };
  };
  // a length rounded to whole bays of the facade
  const toBays = (f, length) => Math.max(2, Math.round(length / f.bay)) * f.bay;

  // Shop fronts all round the foot of a building: each 6 m stretch is a different shop.
  function batchShops(batch, corners, height = SHOP_STOREY) {
    corners.forEach(([ax, az], i) => {
      const [bx, bz] = corners[(i + 1) % corners.length];
      const len = Math.hypot(bx - ax, bz - az);
      const count = Math.max(1, Math.round(len / 6));
      for (let k = 0; k < count; k++) {
        const t0 = k / count;
        const t1 = (k + 1) / count;
        const shop = Math.floor(Math.random() * 16);
        const u = (shop % 4) / 4;
        const v = 1 - (Math.floor(shop / 4) + 1) / 4;
        batchQuad(batch, shopFronts,
          [[ax + (bx - ax) * t0, 0, az + (bz - az) * t0], [ax + (bx - ax) * t1, 0, az + (bz - az) * t1],
            [ax + (bx - ax) * t1, height, az + (bz - az) * t1], [ax + (bx - ax) * t0, height, az + (bz - az) * t0]],
          [[u, v], [u + 0.25, v], [u + 0.25, v + 0.25], [u, v + 0.25]]);
      }
    });
  }

  // A canopy slab over the shop fronts.
  function batchCanopy(batch, corners, y) {
    const outer = shrink(corners, -1.4);
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      const oa = outer[i];
      const ob = outer[(i + 1) % corners.length];
      batchQuad(batch, parapetMat, [[a[0], y, a[1]], [oa[0], y, oa[1]], [ob[0], y, ob[1]], [b[0], y, b[1]]], [[0, 0], [0, 0.3], [1, 0.3], [1, 0]]);
      batchQuad(batch, parapetMat, [[oa[0], y - 0.35, oa[1]], [ob[0], y - 0.35, ob[1]], [ob[0], y, ob[1]], [oa[0], y, oa[1]]], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
      batchQuad(batch, darkMetal, [[a[0], y - 0.35, a[1]], [b[0], y - 0.35, b[1]], [ob[0], y - 0.35, ob[1]], [oa[0], y - 0.35, oa[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    });
  }

  // --- building types ---

  // An office or apartment block, a hotel, or a tower: shops at the foot (unless `homes`),
  // the facade above in whole floors, perhaps a set-back upper part, and a roof to stand on.
  function addBuilding(batch, x, z, w, d, floors, kind = 'office', opts = {}) {
    const { f, material, u0, v0 } = facadeFor(kind);
    w = toBays(f, w);
    d = toBays(f, d);
    const shops = !opts.homes;
    const base = shops ? SHOP_STOREY : 0;
    const top = base + floors * f.floor;
    const cut = opts.chamfer ? f.bay : 0;
    const corners = footprintCorners(x, z, w, d, cut);
    if (shops) {
      batchShops(batch, shrink(corners, 0.4));
      batchCanopy(batch, shrink(corners, 0.4), SHOP_STOREY - 0.2);
      batchWalls(batch, parapetMat, corners, SHOP_STOREY - 0.2, SHOP_STOREY, 4);
    }
    batchWalls(batch, material, corners, base, top, f.tile, u0, v0);
    let roofY = top;
    let roofCorners = corners;
    let rw = w;
    let rd = d;
    // the tallest step back for a crown or a slimmer upper tier
    if (opts.setback && floors > 14) {
      batchLid(batch, roofGravel, corners, top + 0.02);
      batchParapet(batch, corners, top, 1.1);
      addSurface({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h0: standY + top, h1: standY + top });
      rw = toBays(f, w * 0.68);
      rd = toBays(f, d * 0.68);
      const upper = Math.max(4, Math.round(floors * rand(0.15, 0.35)));
      roofCorners = footprintCorners(x, z, rw, rd, cut);
      roofY = top + upper * f.floor;
      batchWalls(batch, material, roofCorners, top, roofY, f.tile, u0 + 0.5, v0);
      addCollider({ minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2, minY: standY + top, maxY: standY + roofY });
    }
    batchLid(batch, roofGravel, roofCorners, roofY + 0.02);
    batchParapet(batch, roofCorners, roofY, 1.1);
    batchRoofPlant(batch, x, z, rw - 2, rd - 2, roofY, roofY > 80);
    addSurface({ minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2, h0: standY + roofY, h1: standY + roofY });
    addCollider({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4, maxY: standY + top });

    // apartments: balconies with glass fronts on some bays of the two long sides
    if (opts.balconies) {
      for (let fl = 1; fl < floors; fl++) {
        const y = base + fl * f.floor;
        for (const side of [-1, 1]) {
          for (let b = 1; b < Math.round(w / f.bay) - 1; b += 2) {
            const bx = x - w / 2 + (b + 0.5) * f.bay;
            const bz = z + side * (d / 2 + 0.7);
            batchBox(batch, parapetMat, bx, y - 0.1, bz, f.bay * 0.9, 0.2, 1.4);
            batchQuad(batch, glassBalustrade, side > 0
              ? [[bx - f.bay * 0.45, y, bz + 0.7], [bx + f.bay * 0.45, y, bz + 0.7], [bx + f.bay * 0.45, y + 1.05, bz + 0.7], [bx - f.bay * 0.45, y + 1.05, bz + 0.7]]
              : [[bx + f.bay * 0.45, y, bz - 0.7], [bx - f.bay * 0.45, y, bz - 0.7], [bx - f.bay * 0.45, y + 1.05, bz - 0.7], [bx + f.bay * 0.45, y + 1.05, bz - 0.7]],
            [[0, 0], [1, 0], [1, 1], [0, 1]]);
          }
        }
      }
    }
    // a hotel's name down one corner, lit at night
    if (opts.hotel) addHotelSign(batch, x - w / 2 - 0.15, z - d / 2 + 4, top);
    return { w, d, top: roofY };
  }

  const hotelSignMat = (() => {
    const draw = (night) => canvasTexture(64, 384, (g, w, h) => {
      g.fillStyle = night ? '#000' : '#e9e4d6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = night ? '#ffe2b0' : '#7a2d1f';
      g.font = 'bold 54px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      'HOTEL'.split('').forEach((ch, i) => g.fillText(ch, w / 2, 44 + i * 74));
    });
    const material = new THREE.MeshPhongMaterial({ map: draw(false), emissiveMap: draw(true), emissive: 0x000000 });
    material.userData.glow = 1.2;
    litMaterials.push(material);
    return material;
  })();

  function addHotelSign(batch, x, z, top) {
    const y1 = top - 2;
    const y0 = y1 - 14;
    batchQuad(batch, hotelSignMat, [[x - 0.01, y0, z - 1.2], [x - 0.01, y0, z + 1.2], [x - 0.01, y1, z + 1.2], [x - 0.01, y1, z - 1.2]],
      [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  // A house on a plot: walls of painted plaster with windows, a pitched roof of tiles, a
  // front door and a garage door facing the street, a chimney, and a hedge-lined garden.
  // `face` is the way the front looks: 0 means toward +z.
  function addHouse(batch, x, z, face, opts = {}) {
    const storeys = opts.storeys || (Math.random() < 0.7 ? 2 : 1);
    const w = opts.w || pick([9, 10, 11, 12]);
    const d = opts.d || pick([8, 9, 10]);
    const wallH = storeys * 3;
    const wallMat = pick(houseMats);
    const roofMat = pick(roofTileMats);
    const rise = d * rand(0.32, 0.45);
    const hip = Math.random() < 0.4;
    // local frame: front along +z
    const c = Math.cos(face);
    const s = Math.sin(face);
    const at = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const hw = w / 2;
    const hd = d / 2;
    const base = 0.25; // on a low plinth
    // walls: each 4 m of wall is one window tile, lit or not at random
    const wall = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const count = Math.max(1, Math.round(len / 4));
      for (let st = 0; st < storeys; st++) {
        for (let k = 0; k < count; k++) {
          const t0 = k / count;
          const t1 = (k + 1) / count;
          const u = Math.random() < 0.45 ? 0.5 : 0;
          const y0 = base + st * 3;
          batchQuad(batch, wallMat, [
            at(ax + (bx - ax) * t0, y0, az + (bz - az) * t0), at(ax + (bx - ax) * t1, y0, az + (bz - az) * t1),
            at(ax + (bx - ax) * t1, y0 + 3, az + (bz - az) * t1), at(ax + (bx - ax) * t0, y0 + 3, az + (bz - az) * t0),
          ], [[u, 0], [u + 0.5, 0], [u + 0.5, 1], [u, 1]]);
        }
      }
    };
    wall(-hw, hd, hw, hd); // front
    wall(hw, hd, hw, -hd);
    wall(hw, -hd, -hw, -hd);
    wall(-hw, -hd, -hw, hd);
    const plinth = (ax, az, bx, bz) => batchQuad(batch, parapetMat, [at(ax, 0, az), at(bx, 0, bz), at(bx, base, bz), at(ax, base, az)], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
    plinth(-hw, hd, hw, hd);
    plinth(hw, hd, hw, -hd);
    plinth(hw, -hd, -hw, -hd);
    plinth(-hw, -hd, -hw, hd);

    // roof: ridge along the width, eaves overhanging 0.5 m
    const eave = base + wallH;
    const o = 0.5;
    const ridgeY = eave + rise;
    const t = tileOf(roofMat);
    const slope = Math.hypot(hd + o, rise);
    const inset = hip ? Math.min(hw - 0.5, hd + o) : 0;
    // front and back slopes
    for (const side of [1, -1]) {
      const e0 = at(-hw - o, eave - 0.25, side * (hd + o));
      const e1 = at(hw + o, eave - 0.25, side * (hd + o));
      const r1 = at(hw + o - inset, ridgeY, 0);
      const r0 = at(-hw - o + inset, ridgeY, 0);
      const quad = side > 0 ? [e0, e1, r1, r0] : [e1, e0, r0, r1];
      batchQuad(batch, roofMat, quad, [[0, 0], [(w + 2 * o) / t, 0], [(w + 2 * o - inset) / t, slope / t], [inset / t, slope / t]]);
    }
    if (hip) {
      for (const side of [1, -1]) {
        const a = at(side * (hw + o), eave - 0.25, hd + o);
        const b = at(side * (hw + o), eave - 0.25, -hd - o);
        const r = at(side * (hw + o - inset), ridgeY, 0);
        batchTriangle(batch, roofMat, side > 0 ? [b, r, a] : [a, r, b], [[0, 0], [0.5 * (d + 2 * o) / t, slope / t], [(d + 2 * o) / t, 0]]);
      }
    } else {
      for (const side of [1, -1]) {
        const a = at(side * hw, eave, hd);
        const b = at(side * hw, eave, -hd);
        const r = at(side * hw, ridgeY - 0.1, 0);
        batchTriangle(batch, wallMat, side > 0 ? [b, r, a] : [a, r, b], [[0, 0], [0.25, 0.3], [0.5, 0]]);
      }
    }
    // soffits under the eaves, so the roof does not look paper thin from below
    batchQuad(batch, fenceMat, [at(-hw - o, eave - 0.25, hd + o), at(-hw - o, eave - 0.25, -hd - o), at(hw + o, eave - 0.25, -hd - o), at(hw + o, eave - 0.25, hd + o)],
      [[0, 0], [1, 0], [1, 1], [0, 1]]);

    // front door, garage, chimney
    const door = (lx, width, height, material) => batchQuad(batch, material,
      [at(lx - width / 2, base, hd + 0.03), at(lx + width / 2, base, hd + 0.03), at(lx + width / 2, base + height, hd + 0.03), at(lx - width / 2, base + height, hd + 0.03)],
      [[0, 0], [1, 0], [1, 1], [0, 1]]);
    door(-hw + 2, 1.1, 2.2, doorMat);
    if (opts.garage !== false && w >= 10) door(hw - 2.2, 2.8, 2.3, garageMat);
    const chimneyAt = at(-hw * 0.5, ridgeY - 0.4, -hd * 0.3);
    batchBox(batch, brickWall, chimneyAt[0], chimneyAt[1], chimneyAt[2], 0.8, 2.4, 0.8, face, 1.5);

    addCollider({
      minX: x - Math.abs(hw * c) - Math.abs(hd * s), maxX: x + Math.abs(hw * c) + Math.abs(hd * s),
      minZ: z - Math.abs(hw * s) - Math.abs(hd * c), maxZ: z + Math.abs(hw * s) + Math.abs(hd * c), maxY: standY + ridgeY,
      car: { x, z, h: face + Math.PI / 2, hl: hw, hw: hd },
    });
    addSurface({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, h0: standY + ridgeY, h1: standY + ridgeY });
  }

  // A warehouse: corrugated steel walls, roller doors along one side, a shallow roof.
  function addWarehouse(batch, x, z, w, d, h, face = 0) {
    const sheet = pick(steelSheets);
    const corners = footprintCorners(x, z, w, d);
    batchWalls(batch, sheet, corners, 0, h, tileOf(sheet));
    batchParapet(batch, corners, h, 0.6);
    batchLid(batch, roofConcrete, corners, h + 0.02);
    // roller doors on the side facing `face` (+1: toward +z, -1: toward -z)
    const zf = z + face * (d / 2 + 0.03);
    for (let dx = -w / 2 + 6; dx < w / 2 - 4; dx += 9) {
      const quad = face > 0
        ? [[x + dx, 0, zf], [x + dx + 4.5, 0, zf], [x + dx + 4.5, 5, zf], [x + dx, 5, zf]]
        : [[x + dx + 4.5, 0, zf], [x + dx, 0, zf], [x + dx, 5, zf], [x + dx + 4.5, 5, zf]];
      batchQuad(batch, rollerMat, quad, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    batchRoofPlant(batch, x, z, w - 4, d - 4, h, false);
    addCollider({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: standY + h });
    addSurface({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h0: standY + h, h1: standY + h });
  }

  // --- tiles of instances ---

  // Things there are hundreds or thousands of (trees, lamps) are split into square tiles of
  // the world, each its own instanced mesh, so a tile that is out of view or too far away is
  // skipped whole, shadows included.
  const cullTiles = []; // { mesh, sphere, reach, owner }
  const tileFrustum = new THREE.Frustum();
  const tileMatrix = new THREE.Matrix4();
  function tiledInstances(geometry, material, matrices, { tile = 160, reach = 650, colors = null, owner = null, setup = null } = {}) {
    const groups = new Map();
    const v = new THREE.Vector3();
    matrices.forEach((m, i) => {
      v.setFromMatrixPosition(m);
      const key = `${Math.floor(v.x / tile)},${Math.floor(v.z / tile)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const meshes = [];
    for (const list of groups.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const box = new THREE.Box3();
      list.forEach((i, n) => {
        mesh.setMatrixAt(n, matrices[i]);
        if (colors) mesh.setColorAt(n, colors[i]);
        box.expandByPoint(v.setFromMatrixPosition(matrices[i]));
      });
      mesh.frustumCulled = false;
      mesh.userData.tiled = true;
      if (setup) setup(mesh);
      scene.add(mesh);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      sphere.radius += 12; // the things themselves reach out from their centres
      cullTiles.push({ mesh, sphere, reach, owner });
      meshes.push(mesh);
    }
    return meshes;
  }

  function cullTilesFor(view) {
    tileFrustum.setFromProjectionMatrix(tileMatrix.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
    const eye = view.position;
    for (const t of cullTiles) {
      const far = t.sphere.center.distanceTo(eye) - t.sphere.radius > t.reach;
      t.mesh.visible = (!t.owner || t.owner.visible) && !far && tileFrustum.intersectsSphere(t.sphere);
    }
  }
  scene.onBeforeRender = (r, s, view) => {
    if (view.isPerspectiveCamera && view === camera) cullTilesFor(view);
  };

  // --- trees, bushes and grass ---

  // Plants are only noted down while the city and hills are laid out; buildVegetation then
  // draws them all at once. A tree is a trunk with a few boughs and a crown of leaf cards:
  // small flat pieces, each printed with a spray of little leaves, set at every angle so
  // the crown reads as foliage instead of a solid shape.
  const plants = []; // { type: 'tree' | 'pine' | 'bush', x, y, z, s }
  const lawns = []; // { x, y, z, size }: park grass, planted with tufts

  function addTree(x, z) {
    plants.push({ type: Math.random() < 0.3 ? 'pine' : 'tree', x, y: KERB + 0.08, z, s: rand(0.8, 1.25) });
    addCollider({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, maxY: 8 });
  }

  function addBush(x, z) {
    const s = rand(0.8, 1.3);
    plants.push({ type: 'bush', x, y: KERB + 0.08, z, s });
    addCollider({ minX: x - 0.5 * s, maxX: x + 0.5 * s, minZ: z - 0.5 * s, maxZ: z + 0.5 * s, maxY: KERB + 1.1 * s, soft: true });
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
        for (let n = 0; n < 72; n++) {
          // a point in the crown, more of them toward the outside
          const a = Math.random() * Math.PI * 2;
          const up = rand(-0.4, 1);
          const flat = Math.sqrt(1 - up * up * 0.8);
          const out = 0.5 + 0.5 * Math.sqrt(Math.random());
          const light = (0.62 + 0.38 * (up * 0.5 + 0.5)) * rand(0.85, 1.15); // darker underneath
          cards.leaf.push([
            p.x + Math.cos(a) * flat * 2.4 * s * out, p.y + (4.7 + up * 1.9 * out) * s, p.z + Math.sin(a) * flat * 2.4 * s * out,
            rand(-1.2, 1.2), Math.random() * 6.3, rand(-1.2, 1.2), rand(2.1, 3.1) * s, rand(2.1, 3.1) * s,
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
      const material = new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide });
      material.userData.snow = 'foliage';
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
      const matrices = [];
      const colors = [];
      for (const c of list) {
        dummy.position.set(c[0], c[1], c[2]);
        dummy.rotation.set(c[3], c[4], c[5]);
        dummy.scale.set(c[6], c[7], 1);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(new THREE.Color(c[8], c[9], c[10]));
      }
      tiledInstances(plane, material, matrices, {
        colors, reach: name === 'tuft' ? 160 : 700,
        setup: (mesh) => {
          if (!shadows) return;
          mesh.castShadow = true;
          mesh.customDepthMaterial = depth; // the shadow follows the leaves' outline, not the square card
        },
      });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 8).translate(0, 0.5, 0);
    const trunks = wood.map((t) => {
      dummy.position.set(t[0], t[1], t[2]);
      dummy.rotation.set(t[3], t[4], 0);
      dummy.scale.set(t[5], t[6], t[5]);
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    tiledInstances(trunkGeo, bark, trunks, { reach: 600, setup: (mesh) => { mesh.castShadow = true; } });
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

  // ---------- City blocks ----------

  // What each block of the grid holds, by its column bx (0 on the -x side) and row bz (0 on
  // the south side). The north rows are homes, houses toward the hills and flats toward
  // the lake; the middle is the business district with the towers; the rest is offices,
  // hotels and shops, with warehouses in the corner by the highway. The metro runs north to
  // south down the middle of column 3, so the buildings there keep clear of it.
  const STATION_BLOCK = [3, 3];
  const METRO_COLUMN = 3;
  function districtOf(bx, bz) {
    if (bz === 6) return bx <= 3 ? 'houses' : 'apartments';
    if (bz === 5) return bx <= 1 ? 'houses' : 'apartments';
    if (bz >= 2 && bz <= 4 && bx >= 2 && bx <= 5) return 'towers';
    if (bz === 0 && bx <= 1) return 'industrial';
    return 'commercial';
  }

  // A flat ground drawn like the road: first, writing no depth (see buildCity).
  function underfoot(mesh) {
    mesh.material.depthWrite = false;
    mesh.renderOrder = -0.45;
    return mesh;
  }

  function addParkingLot(cx, cz) {
    underfoot(flatPlane(BLOCK_SIZE, BLOCK_SIZE, GROUND.tarmac[0], cx, cz, 0.06, ...GROUND.tarmac.slice(1)));
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

  // Pavements, lawns and drives of every block go into one mesh per material.
  const groundBatch = makeBatch();
  let pavingMat = null;
  let lawnMat = null;
  function groundRect(material, x, z, w, d, y, tile) {
    batchQuad(groundBatch, material, [[x - w / 2, y, z + d / 2], [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2], [x - w / 2, y, z - d / 2]],
      [[(x - w / 2) / tile, (z + d / 2) / tile], [(x + w / 2) / tile, (z + d / 2) / tile], [(x + w / 2) / tile, (z - d / 2) / tile], [(x - w / 2) / tile, (z - d / 2) / tile]]);
  }

  // The raised pavement every block stands on.
  function addPavement(cx, cz) {
    cityBlocks.push({ x: cx, z: cz, y: KERB });
    if (!pavingMat) {
      pavingMat = groundMaterial(GROUND.paving[0], GROUND.paving[1], GROUND.paving[3]);
      lawnMat = groundMaterial(0x6fb56a, grassTex, null);
    }
    const half = BLOCK_SIZE / 2;
    groundRect(pavingMat, cx, cz, BLOCK_SIZE, BLOCK_SIZE, KERB + 0.003, GROUND.paving[2]);
    batchWalls(groundBatch, kerbMat, footprintCorners(cx, cz, BLOCK_SIZE, BLOCK_SIZE), 0, KERB + 0.01, 2);
    addSurface({ minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half, h0: KERB, h1: KERB });
  }

  function addLawn(x, z, w, d) {
    groundRect(lawnMat, x, z, w, d, KERB + 0.03, GRASS_TILE);
    lawns.push({ x, y: KERB + 0.03, z, size: Math.min(w, d) - 1 });
  }

  // Buildings are merged a 2 x 2 group of blocks at a time.
  const chunkBatches = new Map();
  const chunkBatch = (bx, bz) => {
    const key = `${bx >> 1},${bz >> 1}`;
    if (!chunkBatches.has(key)) chunkBatches.set(key, makeBatch());
    return chunkBatches.get(key);
  };

  function addCityBlock(cx, cz, bx, bz) {
    addPavement(cx, cz);
    const district = districtOf(bx, bz);
    const corridor = bx === METRO_COLUMN; // keep |x - cx| < 8 open for the metro's piers
    const batch = chunkBatch(bx, bz); // lifted onto the pavement when the chunk is finished
    standY = KERB; // what is built here stands on the pavement

    if (district === 'houses') {
      // a row of houses along each street side, front gardens to the pavement, a shared
      // green behind with trees
      addLawn(cx, cz, BLOCK_SIZE - 6, BLOCK_SIZE - 6);
      for (const side of [1, -1]) {
        for (const ox of [-20.25, -6.75, 6.75, 20.25]) {
          if (corridor && Math.abs(ox) < 9) continue;
          const z = cz + side * 15.5;
          const w = pick([9, 10, 11]);
          addHouse(batch, cx + ox, z, side > 0 ? 0 : Math.PI, { w, d: pick([8, 9]) });
          // a paved drive from the pavement up to the garage, and a hedge along the plot's edge
          if (w >= 10) groundRect(pavingMat, cx + ox + side * (w / 2 - 2.2), cz + side * 23.5, 3.2, 7, KERB + 0.05, GROUND.paving[2]);
          batchBox(batch, hedgeMat, cx + ox + 6.75, 0.6, cz + side * 15, 0.8, 1.2, 22, 0, 2);
          addBush(cx + ox - 3.5, cz + side * 24.6);
          if (Math.random() < 0.7) addTree(cx + ox + rand(-4, 4), cz + side * rand(3, 8));
        }
      }
      for (const ox of [-27, 27]) batchBox(batch, hedgeMat, cx + ox, 0.6, cz, 0.8, 1.2, 48, 0, 2);
    } else if (district === 'industrial') {
      addWarehouse(batch, cx, cz - 13, 52, 24, rand(9, 12), -1);
      addWarehouse(batch, cx, cz + 14, 48, 22, rand(8, 11), 1);
    } else if (district === 'towers' && !corridor && Math.random() < 0.55) {
      // one great tower on a plaza, with trees at the corners
      const kind = pick(['tower', 'glass', 'highrise', 'block', 'tower']);
      const f = FACADES[kind];
      const floors = Math.round(rand(80, 150) / f.floor);
      addBuilding(batch, cx, cz, rand(30, 36), rand(30, 36), floors, kind, { setback: Math.random() < 0.6, chamfer: Math.random() < 0.35 });
      for (const ox of [-24, 24]) for (const oz of [-24, 24]) addTree(cx + ox, cz + oz);
    } else {
      // four buildings, one in each quarter; a pocket park now and then
      const quarters = [[-15, -15], [15, -15], [-15, 15], [15, 15]];
      const hotel = district === 'commercial' && Math.random() < 0.3 ? Math.floor(Math.random() * 4) : -1;
      quarters.forEach(([ox, oz], q) => {
        const ax = corridor ? Math.sign(ox) * 17.5 : ox;
        if (Math.random() < (district === 'towers' ? 0.08 : 0.14)) {
          addLawn(cx + ax, cz + oz, corridor ? 18 : 24, 24);
          for (let i = 0; i < 4; i++) addTree(cx + ax + rand(-8, 8), cz + oz + rand(-9, 9));
          for (let i = 0; i < 4; i++) addBush(cx + ax + rand(-9, 9), cz + oz + rand(-10, 10));
          return;
        }
        const w = corridor ? rand(13, 17) : rand(18, 25);
        const d = rand(18, 25);
        if (district === 'apartments') {
          const kind = pick(['brick', 'loft', 'brick', 'office']);
          const f = FACADES[kind];
          addBuilding(batch, cx + ax, cz + oz, w, d, Math.round(rand(14, 34) / f.floor), kind, { homes: Math.random() < 0.6, balconies: kind !== 'office' && Math.random() < 0.6 });
        } else if (district === 'towers') {
          const kind = pick(['tower', 'glass', 'ribbon', 'office', 'block']);
          const f = FACADES[kind];
          addBuilding(batch, cx + ax, cz + oz, w, d, Math.round(rand(40, 95) / f.floor), kind, { setback: Math.random() < 0.4 });
        } else {
          const kind = q === hotel ? pick(['loft', 'brick']) : pick(['office', 'ribbon', 'glass', 'loft', 'brick']);
          const f = FACADES[kind];
          addBuilding(batch, cx + ax, cz + oz, w, d, Math.round(rand(16, 52) / f.floor), kind, { hotel: q === hotel, chamfer: Math.random() < 0.15 });
        }
      });
    }
    standY = 0;
  }

  // The plaza under Central station: paving, trees in planters, benches.
  function addStationPlaza(cx, cz) {
    addPavement(cx, cz);
    const batch = makeBatch();
    for (const ox of [-20, 20]) {
      for (const oz of [-20, -7, 7, 20]) {
        addTree(cx + ox, cz + oz);
        batchBox(batch, parapetMat, cx + ox, KERB + 0.25, cz + oz, 2.4, 0.5, 2.4);
        addCollider({ minX: cx + ox - 1.2, maxX: cx + ox + 1.2, minZ: cz + oz - 1.2, maxZ: cz + oz + 1.2, maxY: KERB + 0.5, top: KERB + 0.5, low: true });
      }
    }
    for (const ox of [-13, 13]) {
      for (const oz of [-14, 0, 14]) {
        batchBox(batch, fenceMat, cx + ox, KERB + 0.45, cz + oz, 0.5, 0.08, 1.8);
        batchBox(batch, darkMetal, cx + ox, KERB + 0.22, cz + oz, 0.4, 0.44, 0.1);
        addCollider({ minX: cx + ox - 0.27, maxX: cx + ox + 0.27, minZ: cz + oz - 0.92, maxZ: cz + oz + 0.92, maxY: KERB + 0.5, top: KERB + 0.5, low: true });
      }
    }
    flushBatch(batch);
  }

  function buildCity() {
    // The road surface is huge and only centimetres above the grass, which is too close
    // for the depth buffer far from the camera. Grass and road are the lowest things in the
    // scene, so draw them first, in order, without writing depth.
    const road = flatPlane(WORLD, WORLD, GROUND.road[0], 0, 0, 0.03, ...GROUND.road.slice(1));
    road.material.depthWrite = false;
    road.renderOrder = -0.5;

    for (let bx = 0; bx < BLOCKS; bx++) {
      for (let bz = 0; bz < BLOCKS; bz++) {
        const isLot = PARKING_LOTS.some(([x, z]) => x === bx && z === bz);
        const isParkade = bx === PARKADE[0] && bz === PARKADE[1];
        if (isLot) addParkingLot(blockCenter(bx), blockCenter(bz));
        else if (isParkade) addParkade(blockCenter(bx), blockCenter(bz));
        else if (bx === STATION_BLOCK[0] && bz === STATION_BLOCK[1]) addStationPlaza(blockCenter(bx), blockCenter(bz));
        else addCityBlock(blockCenter(bx), blockCenter(bz), bx, bz);
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

    // finish the merged meshes: the buildings stand on the pavement
    for (const batch of chunkBatches.values()) {
      for (const part of batch.values()) for (let i = 1; i < part.positions.length; i += 3) part.positions[i] += KERB;
      flushBatch(batch);
    }
    flushBatch(groundBatch, false);

    addFlyover();

    // a zebra crossing, a stop line behind it, and a signal for every road that enters an intersection
    for (let i = 0; i <= BLOCKS; i++) {
      for (let j = 0; j <= BLOCKS; j++) {
        DIRS.forEach(([dx, dz], d) => {
          if (!inGrid(i - dx, j - dz)) return;
          const [rx, rz] = rightOf([dx, dz]);
          const at = (back, across2) => ({
            x: roadCenter(i) - dx * (JUNCTION + back) + rx * across2,
            z: roadCenter(j) - dz * (JUNCTION + back) + rz * across2,
          });
          for (let across2 = -ROAD_WIDTH / 2 + 0.75; across2 < ROAD_WIDTH / 2; across2 += 1) {
            marks.push({ ...at(2.3, across2), sx: dx ? 3 : 0.5, sz: dx ? 0.5 : 3 });
          }
          marks.push({ ...at(4.6, ROAD_WIDTH / 4), sx: dx ? 0.45 : ROAD_WIDTH / 2 - 1, sz: dx ? ROAD_WIDTH / 2 - 1 : 0.45 });
          signals.push({ i, j, d });
        });
      }
    }
  }

  // All road paint in one instanced mesh, once every road has added its lines.
  function paintMarks() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    // road paint is lit like the road (so it darkens in shade) and a little scuffed
    const scuffed = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, 0.12);
    });
    // Paint is part of the surface it is on, never a strip on top of it: on the ground it is
    // drawn straight after the roads and car parks (which, like it, write no depth), at the
    // height feet and tyres stand at, so anyone standing on a line covers it. On a deck or a
    // parking level it lies a hair above the concrete and is drawn after it.
    const m = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (const raised of [false, true]) {
      const list = marks.filter((mark) => !!mark.y === raised);
      if (!list.length) continue;
      const material = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: scuffed, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      });
      const paint = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((mark, i) => {
        m.makeScale(mark.sx, 1, mark.sz);
        m.setPosition(mark.x, raised ? mark.y + 0.012 : 0.004, mark.z);
        paint.setMatrixAt(i, m);
        paint.setColorAt(i, tint.setHex(mark.color || 0xe9e9e4));
      });
      paint.renderOrder = raised ? 0.6 : -0.4;
      paint.receiveShadow = true;
      paint.userData.snow = 'road';
      scene.add(paint);
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
    for (const spot of lampSpots) {
      spots.push(spot);
      if (spot.both) spots.push({ ...spot, turn: spot.turn + Math.PI });
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
        parts.push([geo, name.endsWith('glass') ? glass : name.endsWith('bulb') ? bulb : iron, !name.endsWith('glass')]);
      });
    } else {
      const metal = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
      parts = [
        [new THREE.CylinderGeometry(0.07, 0.11, 7, 6).translate(0, 3.5, 0), metal, true],
        [new THREE.BoxGeometry(0.1, 0.1, 1.9).translate(0, 7, 0.9), metal, true],
        [new THREE.BoxGeometry(0.34, 0.12, 0.75).translate(0, 6.92, 1.6), bulb, false],
      ];
    }
    const dummy = new THREE.Object3D();
    for (const spot of spots) addPost(spot.x, spot.z, spot.tall ? 0.2 : 0.14, spot.y ?? KERB, spot.tall ? 9 : 5.5);
    const posts = spots.map((spot) => {
      dummy.position.set(spot.x, spot.y ?? KERB, spot.z);
      dummy.rotation.y = spot.turn;
      dummy.scale.setScalar(spot.tall ? 1.7 : 1); // taller poles over the highway and the car park
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    dummy.scale.setScalar(1);
    for (const [geo, material, shadow] of parts) {
      // the bulbs are seen from much further than the posts, after dark
      tiledInstances(geo, material, posts, { reach: material === bulb ? 900 : 260, setup: (mesh) => { mesh.castShadow = shadow; } });
    }

    // the pool of light under each lamp: a soft glowing disc on the ground, shown after dark
    const pool = new THREE.PlaneGeometry(1, 1);
    pool.rotateX(-Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({
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
    });
    const pools = spots.map((spot) => {
      const reach = spot.tall ? 2.6 : 1.4; // the pool lies under the lamp, out over the road
      dummy.position.set(spot.x + Math.sin(spot.turn) * reach, (spot.ground ?? spot.y ?? KERB) + 0.05, spot.z + Math.cos(spot.turn) * reach);
      dummy.rotation.y = 0;
      dummy.scale.set(spot.tall ? 26 : 17, 1, spot.tall ? 26 : 17);
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    // switched on and off together (see updateEnvironment) through this stand-in
    const glow = { material: glowMat, visible: false };
    tiledInstances(pool, glowMat, pools, { reach: 900, owner: glow, setup: (mesh) => { mesh.renderOrder = 0.85; } });
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
    snow: { cover: 0.12, overcast: 0.95, rain: 0, snow: 1 },
  };
  const env = {
    hour: 8, weather: 'clear', timer: rand(150, 240),
    cover: 0.56, overcast: 0, rain: 0, wet: 0, // eased toward the weather's values
    snow: 0, snowCover: 0, slush: 0, // snow falling; how much has settled; how slushy it has gone
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
      // mostly fair, sometimes overcast, now and then rain, a storm or snow
      const roll = Math.random();
      setWeather(roll < 0.42 ? 'clear' : roll < 0.64 ? 'cloudy' : roll < 0.82 ? 'rain' : roll < 0.91 ? 'storm' : 'snow');
    }
    const goal = WEATHERS[env.weather];
    for (const key of ['cover', 'overcast', 'rain']) env[key] = approach(env[key], goal[key], 0.035 * dt);
    env.snow = approach(env.snow, goal.snow || 0, 0.035 * dt);
    // snow settles slowly while it falls (about three minutes to cover everything), then
    // lies, turns to slush and melts, quicker by day
    if (env.snow > 0.05) env.snowCover = Math.min(1, env.snowCover + (env.snow * dt) / 170);
    else if (env.snowCover > 0) env.snowCover = Math.max(0, env.snowCover - dt / (env.night > 0.5 ? 700 : 320));
    env.slush = approach(env.slush, env.snow < 0.05 && env.snowCover > 0 ? 1 : 0, 0.02 * dt);
    const soaking = env.rain > 0.1 || env.slush > 0.3;
    env.wet = approach(env.wet, soaking ? 1 : 0, (soaking ? 0.04 : 0.012) * dt);

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
    // falling snow whitens the haze
    scratchTone.setRGB(0.8, 0.83, 0.87).multiplyScalar(0.12 + 0.88 * day);
    u.horizon.value.lerp(scratchTone, env.snow * 0.7);
    u.zenith.value.lerp(scratchTone, env.snow * 0.5);
    mixTone(u.sunGlow.value, SKY_TONES.sunHigh, SKY_TONES.sunLow, low).multiplyScalar(day * (1 - 0.8 * env.overcast));
    mixTone(u.cloudLit.value, SKY_TONES.cloudDay, SKY_TONES.cloudDusk, low).multiplyScalar((0.1 + 0.9 * day) * (1 - 0.45 * env.overcast));
    u.cloudShade.value.copy(SKY_TONES.cloudShadeDay).multiplyScalar((0.07 + 0.93 * day) * (1 - 0.55 * env.overcast));
    u.cover.value = env.cover;
    u.night.value = env.night * (1 - env.overcast);
    u.flash.value = env.flash;
    scene.fog.color.copy(u.horizon.value);
    scene.background.copy(u.horizon.value);
    scene.fog.near = 260 - 170 * env.rain - 170 * env.snow; // rain and snow close the view in
    scene.fog.far = 1300 - 800 * env.rain - 820 * env.snow;

    // --- lamps: street lights and vehicle lights come on as it gets dark
    const lampsOn = smooth((env.night + env.overcast * 0.35 - 0.25) / 0.3);
    headlightMat.color.setRGB(0.72 + 0.28 * lampsOn, 0.7 + 0.27 * lampsOn, 0.62 + 0.23 * lampsOn);
    tailIdle = lampsOn > 0.5 ? 0xc01a1a : 0x7a1010;
    beamMat.opacity = lampsOn * 0.7;
    lampsOnNow = lampsOn;
    for (const material of litMaterials) material.emissive.setScalar(lampsOn * material.userData.glow);
    beaconMat.color.setHex(lampsOn > 0.3 && Math.floor(clock * 1.3) % 2 === 0 ? 0xff2a1a : 0x400808);
    for (const material of metroLamps) material.color.setHex(lampsOn > 0.3 ? material.userData.lit : 0x606060);
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

    // after dark, reflections show the lit city (photographed the first night)
    const nightSky = lampsOn > 0.5 && !!reflectionNight;
    if (lampsOn > 0.6 && !reflectionNight && reflection && clock > 3) captureReflections(true);
    useReflection(nightSky ? reflectionNight : reflection);

    // --- wet ground: darker, glossier, and it picks up the sky
    for (const surface of wetSurfaces) {
      surface.material.color.copy(surface.color).multiplyScalar(1 - 0.38 * env.wet);
      surface.material.shininess = 8 + 90 * env.wet;
      surface.material.specular.setScalar(0.09 + 0.45 * env.wet);
      surface.material.reflectivity = 0.24 * env.wet * (nightSky ? 1 : 0.15 + 0.85 * day);
    }
    // reflections were photographed by day; fade them as the light goes
    for (const material of reflective) {
      if (material.userData.reflect !== undefined) material.reflectivity = material.userData.reflect * (nightSky ? 0.85 : 0.12 + 0.88 * day);
    }

    updateRain(dt);
    updateSnow(dt);
    updateAudio();
    $('clock').textContent = `${String(Math.floor(env.hour)).padStart(2, '0')}:${String(Math.floor((env.hour % 1) * 60)).padStart(2, '0')}`;
  }

  // --- snow ---

  // Snow is drawn by every lit surface in the scene: wherever a surface faces the sky, it
  // turns white in proportion to how much has settled (env.snowCover), first in patches,
  // then all over, on roofs, pavements, parked cars, trees, lamps and bridges alike. Where
  // vehicles drive, their wheels clear it: each frame they paint their tracks onto a map
  // of the city seen from above, and the ground reads that map, so busy lanes stay dark
  // and wet while quiet streets and verges fill up. When it stops snowing the snow lies a
  // while, goes grey and slushy, and melts away.
  const SNOW_AREA = 800; // the track map covers -800..800 m both ways
  const snowUniforms = {
    snowCover: { value: 0 },
    snowSlush: { value: 0 },
    snowTracks: { value: null },
  };
  const SNOW_TYPES = new Set(['MeshLambertMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial']);
  const snowMode = (material) => {
    if (!SNOW_TYPES.has(material.type) || material.userData.noSnow || material.transparent || material.skinning) return 'none';
    return material.userData.snow === 'foliage' ? 'foliage' : 'ground';
  };
  THREE.Material.prototype.customProgramCacheKey = function () {
    return `snow:${snowMode(this)}`;
  };
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    const kind = snowMode(this);
    if (kind === 'none' || !shader.fragmentShader.includes('#include <color_fragment>')) return;
    Object.assign(shader.uniforms, snowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowPos;\nvarying float vSnowUp;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 snowWorld = vec4(transformed, 1.0);
        vec3 snowNormal = objectNormal;
        #ifdef USE_INSTANCING
          snowWorld = instanceMatrix * snowWorld;
          snowNormal = mat3(instanceMatrix) * snowNormal;
        #endif
        snowWorld = modelMatrix * snowWorld;
        vSnowPos = snowWorld.xyz;
        vSnowUp = normalize(mat3(modelMatrix) * snowNormal).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${kind === 'foliage' ? '#define SNOW_FOLIAGE' : ''}
        uniform float snowCover;
        uniform float snowSlush;
        uniform sampler2D snowTracks;
        varying vec3 vSnowPos;
        varying float vSnowUp;
        float snowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float snowNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), f.x), mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float snowAmount = 0.0;
        float snowCleared = 0.0;
        if (snowCover > 0.001) {
          #ifdef SNOW_FOLIAGE
            float snowFacing = 0.25 + 0.6 * abs(vSnowUp);
          #else
            float snowFacing = smoothstep(0.3, 0.8, vSnowUp);
          #endif
          // it settles in patches first, then everywhere
          float n = snowNoise(vSnowPos.xz * 0.35) * 0.65 + snowNoise(vSnowPos.xz * 2.1) * 0.35;
          float settled = smoothstep(n - 0.22, n + 0.06, snowCover * 1.35 - 0.12);
          // wheels have cleared it where they run (only down at road level)
          vec2 snowUv = vec2(vSnowPos.x + ${SNOW_AREA.toFixed(1)}, ${SNOW_AREA.toFixed(1)} - vSnowPos.z) / ${(SNOW_AREA * 2).toFixed(1)};
          snowCleared = vSnowPos.y < 1.0 ? texture2D(snowTracks, snowUv).r : 0.0;
          snowAmount = snowFacing * settled * (1.0 - 0.85 * snowCleared);
          vec3 snowColor = mix(vec3(0.93, 0.95, 0.99), vec3(0.62, 0.63, 0.65), snowSlush);
          diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowAmount);
          // the cleared lanes are wet and dark
          diffuseColor.rgb *= 1.0 - 0.28 * snowCleared * snowFacing * min(1.0, snowCover * 4.0);
        }`);
    if (shader.fragmentShader.includes('#include <specularmap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
        specularStrength *= 1.0 - 0.8 * snowAmount;
        specularStrength = max(specularStrength, 0.6 * snowCleared * min(1.0, snowCover * 4.0));`);
    }
  };

  // The track map: what has been cleared, 0 to 1, painted by wheels and filled back in by
  // falling snow.
  let snowTarget = null;
  let snowScene = null;
  let snowCamera = null;
  let snowStrips = null;
  let snowRefill = null;
  let snowFlakes = null;
  const SNOW_FLAKES = 2600;
  const flakeData = new Float32Array(SNOW_FLAKES * 5); // x, y, z, the height of what is under it, a wobble phase

  function setupSnow() {
    snowTarget = new THREE.WebGLRenderTarget(2048, 2048, { depthBuffer: false, stencilBuffer: false });
    snowUniforms.snowTracks.value = snowTarget.texture;
    snowScene = new THREE.Scene();
    snowCamera = new THREE.OrthographicCamera(-SNOW_AREA, SNOW_AREA, SNOW_AREA, -SNOW_AREA, 1, 200);
    snowCamera.up.set(0, 0, -1); // so the map's v runs toward -z, as the shader reads it
    snowCamera.position.set(0, 100, 0);
    snowCamera.lookAt(0, 0, 0);
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    snowStrips = new THREE.InstancedMesh(strip, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    }), 420);
    snowStrips.frustumCulled = false;
    snowScene.add(snowStrips);
    // falling snow fills the tracks back in: a little is taken off everywhere each frame
    snowRefill = new THREE.Mesh(new THREE.PlaneGeometry(SNOW_AREA * 2, SNOW_AREA * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
      blendEquation: THREE.ReverseSubtractEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    }));
    snowRefill.frustumCulled = false;
    snowScene.add(snowRefill);
    clearSnowTracks();
  }

  function clearSnowTracks() {
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(snowTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(before);
  }

  const stripDummy = new THREE.Object3D();
  let tracksDirty = false;

  // Each moving vehicle lays two strips, one under each line of wheels.
  function paintSnowTracks(dt) {
    let n = 0;
    const lay = (x, z, h, dims, speed) => {
      if (speed < 0.6 || n > 410 || Math.abs(x) > SNOW_AREA || Math.abs(z) > SNOW_AREA) return;
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      for (const side of [-1, 1]) {
        const off = side * (dims.hw - 0.28);
        stripDummy.position.set(x + fz * off, 0, z - fx * off);
        stripDummy.rotation.set(0, h, 0);
        stripDummy.scale.set(0.75, 1, dims.hl * 1.7);
        stripDummy.updateMatrix();
        snowStrips.setMatrixAt(n++, stripDummy.matrix);
      }
    };
    for (const c of traffic) lay(c.x, c.z, c.h, c.model.dims, Math.abs(c.speed));
    for (const c of highwayTraffic) lay(c.x, c.z, c.h, c.model.dims, c.speed);
    for (const p of police) if (p.active) lay(p.x, p.z, p.h, p.model.dims, Math.abs(p.speed));
    if (mode === 'car' && player && car.y < 1) lay(car.x, car.z, car.heading, player.dims, Math.hypot(car.vx, car.vz));
    snowStrips.count = n;
    snowStrips.instanceMatrix.needsUpdate = true;
    snowStrips.material.opacity = Math.min(0.5, 0.14 * dt * 60);
    const refill = env.snow * dt * 0.012;
    snowRefill.material.color.setScalar(refill);
    snowRefill.visible = refill > 0;
    const before = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(snowTarget);
    renderer.render(snowScene, snowCamera);
    renderer.setRenderTarget(before);
    renderer.autoClear = autoClear;
    tracksDirty = true;
  }

  // The flakes: soft white points drifting down round the camera, stopping on whatever
  // they land on, just as the rain does.
  function updateSnow(dt) {
    snowUniforms.snowCover.value = env.snowCover;
    snowUniforms.snowSlush.value = env.slush;
    if (snowTarget && env.snowCover > 0.001) paintSnowTracks(dt);
    else if (tracksDirty && snowTarget) {
      clearSnowTracks();
      tracksDirty = false;
    }

    if (env.snow < 0.02) {
      if (snowFlakes) snowFlakes.visible = false;
      return;
    }
    const eye = camera.position;
    const [bx, by, bz] = [70, 36, 70];
    if (!snowFlakes) {
      for (let i = 0; i < SNOW_FLAKES; i++) {
        flakeData[i * 5] = eye.x + rand(-0.5, 0.5) * bx;
        flakeData[i * 5 + 1] = eye.y + rand(-0.5, 0.5) * by;
        flakeData[i * 5 + 2] = eye.z + rand(-0.5, 0.5) * bz;
        flakeData[i * 5 + 3] = coverAt(flakeData[i * 5], flakeData[i * 5 + 2]);
        flakeData[i * 5 + 4] = Math.random() * 6.3;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_FLAKES * 3), 3));
      snowFlakes = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.11, transparent: true, opacity: 0.9, depthWrite: false,
        map: canvasTexture(32, 32, (g, w) => {
          const fade = g.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
          fade.addColorStop(0, 'rgba(255,255,255,1)');
          fade.addColorStop(0.5, 'rgba(255,255,255,0.7)');
          fade.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = fade;
          g.fillRect(0, 0, w, w);
        }),
      }));
      snowFlakes.material.userData.noSnow = true;
      snowFlakes.frustumCulled = false;
      snowFlakes.renderOrder = 5;
      scene.add(snowFlakes);
    }
    snowFlakes.visible = true;
    snowFlakes.geometry.setDrawRange(0, Math.floor(SNOW_FLAKES * Math.min(1, env.snow * 1.1)));
    const points = snowFlakes.geometry.attributes.position.array;
    for (let i = 0; i < SNOW_FLAKES; i++) {
      const d = i * 5;
      let x = flakeData[d] + (1.2 + Math.sin(clock * 0.7 + flakeData[d + 4]) * 0.8) * dt;
      let y = flakeData[d + 1] - (1.1 + (i % 7) * 0.08) * dt;
      let z = flakeData[d + 2] + Math.cos(clock * 0.9 + flakeData[d + 4]) * 0.5 * dt;
      let moved = false;
      if (y < Math.max(eye.y - by / 2, flakeData[d + 3])) {
        y = eye.y + by / 2 - Math.random() * 2;
        x = eye.x + rand(-0.5, 0.5) * bx;
        z = eye.z + rand(-0.5, 0.5) * bz;
        moved = true;
      }
      if (x - eye.x > bx / 2) { x -= bx; moved = true; } else if (x - eye.x < -bx / 2) { x += bx; moved = true; }
      if (z - eye.z > bz / 2) { z -= bz; moved = true; } else if (z - eye.z < -bz / 2) { z += bz; moved = true; }
      if (moved) flakeData[d + 3] = coverAt(x, z);
      flakeData[d] = x;
      flakeData[d + 1] = y;
      flakeData[d + 2] = z;
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;
    }
    snowFlakes.geometry.attributes.position.needsUpdate = true;
  }

  // --- rain ---

  const RAIN_DROPS = 1800;
  const RAIN_BOX = [56, 34, 56]; // the box of air round the camera that the drops live in
  const rainDrops = new Float32Array(RAIN_DROPS * 4); // x, y, z in the world, and the height of whatever is above that spot

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
    truck: { pitch: 34, bright: 0.6, gain: 1.4 },
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
      siren: (() => {
        const tone = context.createOscillator();
        tone.type = 'triangle';
        const sweep = context.createOscillator();
        sweep.frequency.value = 0.35;
        const depth = context.createGain();
        depth.gain.value = 320;
        sweep.connect(depth).connect(tone.frequency);
        tone.frequency.value = 960;
        const gain = context.createGain();
        gain.gain.value = 0;
        tone.connect(gain).connect(master);
        tone.start();
        sweep.start();
        return { gain };
      })(),
      train: wash('lowpass', 210, 0.8),
      trainHiss: wash('bandpass', 1400, 1.2),
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
    for (const c of highwayTraffic) hear(c.x, c.z, c.model.kind, c.speed);
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

    // the nearest moving train: a deep rumble and the hiss of wheels on rails
    let rumble = 0;
    for (const train of trains) {
      for (const c of train.cars) {
        const d = Math.hypot(c.group.position.x - camera.position.x, METRO_Y - camera.position.y, c.group.position.z - camera.position.z);
        rumble = Math.max(rumble, Math.max(0, 1 - d / 140) ** 2 * Math.min(1, train.speed / 12));
      }
    }
    glide(audio.train.gain.gain, rumble * 0.5);
    // sirens: your own, or the nearest police car giving chase
    let wail = mode === 'car' && lights.emergency ? 0.6 : 0;
    for (const p of police) {
      if (!p.active) continue;
      const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      wail = Math.max(wail, Math.max(0, 1 - d / 220) ** 2 * 0.7);
    }
    glide(audio.siren.gain.gain, wail * 0.05);
    glide(audio.trainHiss.gain.gain, rumble * 0.06);

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

  // A fist landing: a dull thud with a slap on top; on a raised guard, a duller knock.
  function playPunch(blocked, strength = 0.6) {
    burst('lowpass', blocked ? 260 : 380, 0.35 + 0.35 * strength, 0.12);
    burst('bandpass', blocked ? 900 : 2200, 0.12 + 0.18 * strength, 0.05, 0, 1.2);
  }

  function playWhoosh() {
    burst('bandpass', 1200, 0.07, 0.18, 0, 0.6); // a swing that meets nothing
  }

  // A vehicle going up: a deep boom, a crack, and bits coming down after.
  function playBlast(power, distance) {
    const near = Math.max(0.15, 1 - distance / 400);
    burst('lowpass', 90, Math.min(1.2, 1.0 * near * power), 2.8);
    burst('lowpass', 420, Math.min(1, 0.7 * near * power), 1.1);
    for (let n = 0; n < 6; n++) burst('bandpass', rand(600, 2400), 0.12 * near, 0.15, rand(0.15, 1.3));
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

  // ---------- Spatial index ----------

  // Things that never move (walls, kerbs, decks, parked cars) are filed under the 16 m
  // squares they cover, so a question about one spot only looks at what stands nearby.
  const INDEX_CELL = 16;
  const makeIndex = () => ({ cells: new Map(), stamp: 0 });

  function indexCells(item, visit) {
    const x1 = Math.floor(item.maxX / INDEX_CELL);
    const z1 = Math.floor(item.maxZ / INDEX_CELL);
    for (let cx = Math.floor(item.minX / INDEX_CELL); cx <= x1; cx++) {
      for (let cz = Math.floor(item.minZ / INDEX_CELL); cz <= z1; cz++) visit(cx * 8192 + cz);
    }
  }

  function indexAdd(index, item) {
    indexCells(item, (key) => {
      let list = index.cells.get(key);
      if (!list) index.cells.set(key, (list = []));
      list.push(item);
    });
  }

  function indexRemove(index, item) {
    indexCells(item, (key) => {
      const list = index.cells.get(key);
      const at = list ? list.indexOf(item) : -1;
      if (at >= 0) list.splice(at, 1);
    });
  }

  // Everything filed under the squares that the rectangle x0..x1, z0..z1 touches.
  function indexQuery(index, x0, z0, x1, z1) {
    const out = [];
    const stamp = ++index.stamp;
    const cx1 = Math.floor(x1 / INDEX_CELL);
    const cz1 = Math.floor(z1 / INDEX_CELL);
    for (let cx = Math.floor(x0 / INDEX_CELL); cx <= cx1; cx++) {
      for (let cz = Math.floor(z0 / INDEX_CELL); cz <= cz1; cz++) {
        const list = index.cells.get(cx * 8192 + cz);
        if (!list) continue;
        for (const item of list) {
          if (item.seen === stamp) continue;
          item.seen = stamp;
          out.push(item);
        }
      }
    }
    return out;
  }

  const colliderIndex = makeIndex();
  const surfaceIndex = makeIndex();

  function addCollider(box) {
    colliders.push(box);
    indexAdd(colliderIndex, box);
    return box;
  }

  function removeCollider(box) {
    const at = colliders.indexOf(box);
    if (at >= 0) colliders.splice(at, 1);
    indexRemove(colliderIndex, box);
  }

  const collidersNear = (x, z, r) => indexQuery(colliderIndex, x - r, z - r, x + r, z + r);

  // Something slim and upright in the way (a lamp post, a signal mast, a sign pole): solid
  // to everyone from its foot at height y0 to `h` above it.
  function addPost(x, z, r, y0, h, extra = {}) {
    return addCollider({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, minY: y0 - 0.6, maxY: y0 + h, ...extra });
  }
  // every solid thing that could be within r of (x, z), moving vehicles included
  const solidsNear = (x, z, r) => collidersNear(x, z, r).concat(trafficBoxes, policeBoxes, trainBoxes);

  // A collision box for a straight piece of wall or rail running from (ax, az) to (bx, bz),
  // `half` thick either side, blocking between heights y0 and y1. Its true outline is kept
  // in `car` (see boxContact), so a wall at an angle blocks only where it is.
  function addSegmentCollider(ax, az, bx, bz, half, y0, y1, extra = {}) {
    const len = Math.hypot(bx - ax, bz - az) || 0.01;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const reach = len / 2 + half;
    return addCollider({
      minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach, minY: y0, maxY: y1,
      car: { x, z, h: Math.atan2(bx - ax, bz - az), hl: len / 2, hw: half }, ...extra,
    });
  }

  // ---------- Hills, lake and the shape of the land ----------

  // Rounded hills, each flat on top: { x, z, r: radius, h: height }. The main one, with the
  // road and the lookout, stands north of the city on its -x side; two more keep it company.
  // The last two are the mounds the highway tunnels through at either end.
  const HILLS = [
    { x: -430, z: 560, r: 230, h: 75 },
    { x: -680, z: 330, r: 170, h: 45 },
    { x: -200, z: 800, r: 170, h: 50 },
    { x: 800, z: -372, r: 200, h: 40 },
    { x: -800, z: -372, r: 200, h: 40 },
  ];
  const HILL_BOUNDS = { minX: -900, maxX: -100, minZ: 150, maxZ: 980 }; // where the wild animals live
  const WORLD_LIMITS = { minX: -790, maxX: 790, minZ: -600, maxZ: 940 };
  const ROAD_FLAT = 8; // the ground is levelled this far either side of the hill road's centre line
  const ROAD_BLEND = 24; // and has returned to the natural slope by here
  const ROAD_HALF = 5.5; // half the width of the tarmac itself
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  // The highway runs along the south of the city, 3 lanes each way, from tunnel to tunnel.
  const HIGHWAY = { z: -372, half: 15.5, lane: 3.6, end: 900, portal: 700 };

  // The lake north of the city on its +x side: overlapping round pools, with a channel
  // running south under the lake drive's bridge to a pond.
  const LAKE = [
    [420, 480, 125], [500, 550, 85], [340, 540, 75], [455, 400, 70],
    [432, 335, 30], [425, 300, 22], [422, 266, 21], [422, 232, 22], [425, 185, 50],
  ];
  const WATER_Y = -0.45;

  // How far (x, z) is from the water's edge: negative out on the lake.
  function lakeEdge(x, z) {
    if (x < 180 || x > 650 || z < 100 || z > 680) return 99;
    // a soft minimum, so where two pools meet the shore curves instead of making a corner
    let sum = 0;
    for (const [cx, cz, r] of LAKE) sum += Math.exp(-(Math.hypot(x - cx, z - cz) - r) / 9);
    return -9 * Math.log(sum);
  }

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

  // The road leaves the city's north edge on its -x side and spirals up the main hill to
  // its summit. Stored as points about 5 m apart, each with the height the road has there.
  const hillRoad = (() => {
    const main = HILLS[0];
    const ctrl = [[-190, 268], [-190, 300], [-198, 332], [-220, 362], [-248, 388]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const start = -0.83; // angle at which the spiral meets the approach road
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
    points[0].h = 0;
    return points;
  })();

  // The hill road's pieces filed by area, for finding the nearest one quickly.
  const hillRoadIndex = makeIndex();
  for (let i = 0; i < hillRoad.length - 1; i++) {
    const a = hillRoad[i];
    const b = hillRoad[i + 1];
    indexAdd(hillRoadIndex, {
      i, minX: Math.min(a.x, b.x) - ROAD_BLEND, maxX: Math.max(a.x, b.x) + ROAD_BLEND,
      minZ: Math.min(a.z, b.z) - ROAD_BLEND, maxZ: Math.max(a.z, b.z) + ROAD_BLEND,
    });
  }

  // Nearest point on the hill road: sets roadDist and the road's height there.
  let roadDist = Infinity;
  let roadHeight = 0;
  function nearestRoad(x, z) {
    let best = Infinity;
    for (const { i } of indexQuery(hillRoadIndex, x, z, x, z)) {
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

  // Height of the bare ground at (x, z), worked out in full: the hills with a level shelf
  // cut across the slope wherever the road runs, the lake bed and its beaches, and a
  // cutting through each tunnel mound for the highway.
  function terrainExact(x, z) {
    roadDist = Infinity;
    let h = naturalHeight(x, z);
    if (h > 0) {
      const cutting = Math.abs(z - HIGHWAY.z) - HIGHWAY.half - 3;
      if (Math.abs(x) > 560 && cutting < 8) h *= smooth(cutting / 8);
      nearestRoad(x, z);
      if (roadDist < ROAD_BLEND) h = roadHeight + (h - roadHeight) * smooth((roadDist - ROAD_FLAT) / (ROAD_BLEND - ROAD_FLAT));
    }
    const edge = lakeEdge(x, z);
    if (edge < 8) h = Math.max(-3.6, Math.min(h, WATER_Y + edge * 0.06)); // a gentle beach, then deeper water
    return h;
  }

  // The ground is measured once on a 4 m grid wherever it is not flat, and read back from
  // there afterwards; each of these patches also gets a ground mesh of its own (see
  // buildTerrain) with the same triangles, so what you stand on matches what you see.
  const TERRAIN_STEP = 4;
  const TERRAIN_REGIONS = [
    { minX: -1000, maxX: -300, minZ: 100, maxZ: 1000 }, // the hills
    { minX: -300, maxX: 0, minZ: 300, maxZ: 1000 },
    { minX: 200, maxX: 800, minZ: 300, maxZ: 800 }, // the lake
    { minX: 300, maxX: 600, minZ: 100, maxZ: 300 }, // the pond
    { minX: 600, maxX: 1000, minZ: -600, maxZ: -100 }, // the tunnel mounds
    { minX: -1000, maxX: -600, minZ: -600, maxZ: -100 },
  ];
  for (const r of TERRAIN_REGIONS) {
    r.nx = (r.maxX - r.minX) / TERRAIN_STEP + 1;
    r.nz = (r.maxZ - r.minZ) / TERRAIN_STEP + 1;
    r.heights = new Float32Array(r.nx * r.nz);
    for (let iz = 0; iz < r.nz; iz++) {
      for (let ix = 0; ix < r.nx; ix++) {
        r.heights[iz * r.nx + ix] = terrainExact(r.minX + ix * TERRAIN_STEP, r.minZ + iz * TERRAIN_STEP);
      }
    }
  }

  function terrain(x, z) {
    for (const r of TERRAIN_REGIONS) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const fx = (x - r.minX) / TERRAIN_STEP;
      const fz = (z - r.minZ) / TERRAIN_STEP;
      const ix = Math.min(r.nx - 2, Math.floor(fx));
      const iz = Math.min(r.nz - 2, Math.floor(fz));
      const tx = fx - ix;
      const tz = fz - iz;
      const H = r.heights;
      const a = H[iz * r.nx + ix];
      const b = H[iz * r.nx + ix + 1];
      const c = H[(iz + 1) * r.nx + ix];
      const d = H[(iz + 1) * r.nx + ix + 1];
      // each square is two triangles split from (ix + 1, iz) to (ix, iz + 1)
      return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    }
    return 0;
  }

  const inWater = (x, z) => terrain(x, z) < WATER_Y - 0.05;

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

  // The ground everywhere: a flat field of grass in 100 m tiles, except where one of the
  // terrain patches has its own shaped mesh, tinted by height, steepness, beach and verge.
  function buildTerrain() {
    const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTex });
    const grass = new THREE.Color(0x7fb86e);
    const upland = new THREE.Color(0x5c8f52);
    const rock = new THREE.Color(0x8a857c);
    const dirt = new THREE.Color(0x8c7a5c);
    const sand = new THREE.Color(0xd8c49a);
    const wetSand = new THREE.Color(0x9a8a6a);
    const lakeBed = new THREE.Color(0x6b6a55);
    const tint = new THREE.Color();
    for (const r of TERRAIN_REGIONS) {
      const positions = new Float32Array(r.nx * r.nz * 3);
      const colors = new Float32Array(r.nx * r.nz * 3);
      const uvs = new Float32Array(r.nx * r.nz * 2);
      for (let iz = 0; iz < r.nz; iz++) {
        for (let ix = 0; ix < r.nx; ix++) {
          const n = iz * r.nx + ix;
          const x = r.minX + ix * TERRAIN_STEP;
          const z = r.minZ + iz * TERRAIN_STEP;
          const h = r.heights[n];
          nearestRoad(x, z);
          const nearRoad = roadDist;
          // tuck the mesh a little under the hill road so the tarmac always covers it
          positions.set([x, h - 0.16 * (1 - smooth((nearRoad - ROAD_FLAT) / 2)), z], n * 3);
          const steep = Math.hypot(
            naturalHeight(x + 2, z) - naturalHeight(x - 2, z),
            naturalHeight(x, z + 2) - naturalHeight(x, z - 2)
          ) / 4;
          tint.copy(grass).lerp(upland, Math.min(1, Math.max(0, h) / 45));
          tint.lerp(rock, smooth((steep - 0.55) / 0.3));
          if (nearRoad < ROAD_BLEND) tint.lerp(dirt, 1 - smooth((nearRoad - ROAD_HALF) / 6));
          const edge = lakeEdge(x, z);
          if (edge < 16) tint.lerp(sand, 1 - smooth((edge - 9) / 7));
          if (edge < 1) tint.copy(wetSand).lerp(lakeBed, smooth(-edge / 12));
          colors.set([tint.r, tint.g, tint.b], n * 3);
          uvs.set([x / GRASS_TILE, z / GRASS_TILE], n * 2);
        }
      }
      const index = [];
      for (let iz = 0; iz < r.nz - 1; iz++) {
        for (let ix = 0; ix < r.nx - 1; ix++) {
          const a = iz * r.nx + ix;
          const b = a + 1;
          const c = a + r.nx;
          const d = c + 1;
          index.push(a, c, b, b, c, d); // split from b to c, as terrain() assumes
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, grassMat);
      ground.receiveShadow = true;
      ground.userData.snow = 'ground';
      scene.add(ground);
    }

    // the flat grass, in tiles, leaving room for the shaped patches
    const covered = (x, z) => TERRAIN_REGIONS.some((r) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ);
    const tiles = [];
    for (let x = -1200; x < 1200; x += 100) {
      for (let z = -1200; z < 1200; z += 100) {
        if (!covered(x + 50, z + 50)) tiles.push([x + 50, z + 50]);
      }
    }
    const tileGeo = new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2);
    const uv = tileGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 100) / GRASS_TILE, (uv.getY(i) * 100) / GRASS_TILE);
    const field = new THREE.InstancedMesh(tileGeo, groundMaterial(0x7fb86e, grassTex, null), tiles.length);
    const m = new THREE.Matrix4();
    tiles.forEach(([x, z], i) => field.setMatrixAt(i, m.makeTranslation(x, 0, z)));
    field.receiveShadow = true;
    field.userData.snow = 'ground';
    // flat and only centimetres below the roads: drawn first, without writing depth
    field.material.depthWrite = false;
    field.renderOrder = -0.6;
    scene.add(field);

    buildWater();
    buildHillDetails();
  }

  // The lake's surface: dark, rippled water that mirrors the sky.
  function buildWater() {
    const ripples = canvasTexture(256, 256, (g, w, h) => {
      // a normal map of soft overlapping ripples
      const picture = g.createImageData(w, h);
      const height = (x, y) => {
        let v = 0;
        for (let k = 1; k <= 4; k++) {
          const f = (k * 2 * Math.PI) / w;
          v += Math.sin(x * f * (k % 2 ? 1 : 2) + y * f * 0.7 + k * 1.7) / k + Math.sin(y * f * 1.3 - x * f * 0.4 + k) / (k + 1);
        }
        return v;
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = height(x + 1, y) - height(x - 1, y);
          const dy = height(x, y + 1) - height(x, y - 1);
          const i = (y * w + x) * 4;
          picture.data[i] = 128 + dx * 60;
          picture.data[i + 1] = 128 + dy * 60;
          picture.data[i + 2] = 255;
          picture.data[i + 3] = 255;
        }
      }
      g.putImageData(picture, 0, 0);
    });
    ripples.repeat.set(40, 40);
    waterMat = reflect(new THREE.MeshPhongMaterial({
      color: 0x24414f, normalMap: ripples, normalScale: new THREE.Vector2(0.5, 0.5), shininess: 120, specular: 0x8899aa,
      transparent: true, opacity: 0.9,
    }), 0.55);
    waterMat.userData.noSnow = true;
    for (const r of TERRAIN_REGIONS.slice(2, 4)) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ).rotateX(-Math.PI / 2), waterMat);
      water.position.set((r.minX + r.maxX) / 2, WATER_Y, (r.minZ + r.maxZ) / 2);
      water.receiveShadow = true;
      scene.add(water);
    }
  }
  let waterMat = null;

  // Pines and boulders over the slopes, clear of the roads and the summit, and the lookout.
  function buildHillDetails() {
    const b = HILL_BOUNDS;
    const main = HILLS[0];
    const onSlope = (minHeight) => {
      for (let tries = 0; tries < 40; tries++) {
        const x = rand(b.minX, b.maxX);
        const z = rand(b.minZ, b.maxZ);
        if (naturalHeight(x, z) < minHeight || Math.hypot(x - main.x, z - main.z) < 46) continue;
        const y = terrainExact(x, z);
        if (roadDist > 11) return { x, y: terrain(x, z), z };
      }
      return null;
    };
    const dummy = new THREE.Object3D();
    const spots = (count, minHeight) => Array.from({ length: count }, () => onSlope(minHeight))
      .filter(Boolean)
      .map((spot) => ({ ...spot, s: rand(0.8, 1.5), turn: Math.random() * 6 }));

    const pines = spots(420, 3);
    for (const t of pines) plants.push({ type: Math.random() < 0.75 ? 'pine' : 'tree', x: t.x, y: t.y, z: t.z, s: t.s });
    for (const t of pines) {
      addCollider({ minX: t.x - 0.45, maxX: t.x + 0.45, minZ: t.z - 0.45, maxZ: t.z + 0.45, minY: t.y - 1, maxY: t.y + 8 });
    }
    const stone = new THREE.MeshPhongMaterial({ color: 0x8d8a84, flatShading: true, shininess: 0 });
    const rocks = spots(140, 6);
    const boulders = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), stone, rocks.length);
    rocks.forEach((spot, i) => {
      const r = 1.0 * spot.s;
      addCollider({ minX: spot.x - r, maxX: spot.x + r, minZ: spot.z - r, maxZ: spot.z + r, minY: spot.y - 1, maxY: spot.y + 1.05 * spot.s, top: spot.y + 0.95 * spot.s });
      dummy.position.set(spot.x, spot.y + 0.2 * spot.s, spot.z);
      dummy.scale.set(1.3 * spot.s, 0.9 * spot.s, 1.1 * spot.s);
      dummy.rotation.set(0, spot.turn, 0);
      dummy.updateMatrix();
      boulders.setMatrixAt(i, dummy.matrix);
    });
    boulders.castShadow = true;
    scene.add(boulders);

    // --- villas on shelves beside the hill road, on stone foundations where the ground falls away
    const villas = makeBatch();
    const stoneMat = cityMaterial('concrete', 0x9a948a);
    let placedVillas = 0;
    for (let i = 30; i < hillRoad.length - 30 && placedVillas < 14; i += 9) {
      const p = hillRoad[i];
      const [nx, nz] = across(hillRoad, i);
      for (const side of [1, -1]) {
        const x = p.x + nx * side * 19;
        const z = p.z + nz * side * 19;
        terrainExact(x, z);
        if (roadDist < 15) continue;
        const corners = [[-6, -6], [6, -6], [6, 6], [-6, 6]].map(([dx, dz]) => terrain(x + dx, z + dz));
        const lowest = Math.min(...corners);
        const highest = Math.max(...corners);
        if (highest - lowest > 3.2 || Math.random() < 0.3) continue;
        const before = new Map([...villas].map(([m, part]) => [m, part.positions.length]));
        standY = highest;
        addHouse(villas, x, z, Math.atan2(-nx * side, -nz * side), { storeys: 2, garage: Math.random() < 0.5 });
        standY = 0;
        // lift what was just added onto its shelf
        for (const [m, part] of villas) {
          for (let k = (before.get(m) || 0) + 1; k < part.positions.length; k += 3) part.positions[k] += highest;
        }
        batchBox(villas, stoneMat, x, (lowest + highest) / 2 - 0.4, z, 13, highest - lowest + 0.8, 13, 0, 3);
        addCollider({ minX: x - 6.5, maxX: x + 6.5, minZ: z - 6.5, maxZ: z + 6.5, minY: lowest - 1, maxY: highest + 0.2, top: highest + 0.2 });
        addSurface({ minX: x - 6.5, maxX: x + 6.5, minZ: z - 6.5, maxZ: z + 6.5, h0: highest + 0.2, h1: highest + 0.2 });
        placedVillas++;
        break;
      }
    }
    flushBatch(villas);

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
      addCollider({ minX: main.x + x - 0.2, maxX: main.x + x + 0.2, minZ: main.z + z - 0.2, maxZ: main.z + z + 0.2, minY: top, maxY: top + 3 });
    }
    piece(new THREE.ConeGeometry(5.4, 2.2, 4), lambert(0x8a2f2a), 0, 4.1, 0).rotation.y = Math.PI / 4;
    piece(new THREE.BoxGeometry(4, 0.12, 0.7), wood, 0, 0.55, 1.6);
    piece(new THREE.BoxGeometry(4, 0.12, 0.7), wood, 0, 0.55, -1.6);
    piece(new THREE.CylinderGeometry(0.06, 0.06, 9, 6), lambert(0xd0d3d8), 9, 4.5, 4);
    piece(new THREE.BoxGeometry(1.8, 1.1, 0.05), lambert(0xe63946), 9.95, 8.3, 4);
  }

  // ---------- Raised structures ----------

  // Surfaces to stand or drive on above the bare ground: decks, ramps, roofs, pavements.
  // A box { minX, maxX, minZ, maxZ, h0, h1 } slopes from h0 to h1 along x (along z when
  // `alongZ`); a strip { ax, az, bx, bz, ha, hb, half } is one piece of a curving deck,
  // `half` wide either side of the line from a to b, rising from ha to hb.
  const surfaces = [];
  const concrete = new THREE.MeshLambertMaterial({ color: 0x8d929b });
  const deckMat = photos.asphalt
    ? groundMaterial(GROUND.tarmac[0], GROUND.tarmac[1], GROUND.tarmac[3])
    : new THREE.MeshLambertMaterial({ color: 0x565b64 });
  const DECK_TILE = GROUND.tarmac[2];
  const kickerMat = new THREE.MeshLambertMaterial({ color: 0xf2b705 });

  function addSurface(s) {
    if (s.half !== undefined) {
      s.minX = Math.min(s.ax, s.bx) - s.half;
      s.maxX = Math.max(s.ax, s.bx) + s.half;
      s.minZ = Math.min(s.az, s.bz) - s.half;
      s.maxZ = Math.max(s.az, s.bz) + s.half;
    }
    surfaces.push(s);
    indexAdd(surfaceIndex, s);
    return s;
  }

  // The height of surface s at (x, z), or null where it does not reach.
  function surfaceHeight(s, x, z) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) return null;
    if (s.half === undefined) {
      if (s.h0 === s.h1) return s.h0;
      return s.alongZ
        ? s.h0 + ((s.h1 - s.h0) * (z - s.minZ)) / (s.maxZ - s.minZ)
        : s.h0 + ((s.h1 - s.h0) * (x - s.minX)) / (s.maxX - s.minX);
    }
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz;
    const t = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
    if (t < -0.03 || t > 1.03) return null;
    if (Math.abs((x - s.ax) * dz - (z - s.az) * dx) / Math.sqrt(len2) > s.half) return null;
    return s.ha + (s.hb - s.ha) * Math.max(0, Math.min(1, t));
  }

  // Height of whatever is under (x, z) for something currently at height y. Surfaces well
  // above y are overhead, not underfoot, which is what lets you drive beneath a deck.
  function groundAt(x, z, y) {
    let h = terrain(x, z);
    for (const s of indexQuery(surfaceIndex, x, z, x, z)) {
      const sh = surfaceHeight(s, x, z);
      if (sh !== null && sh <= y + STEP_UP && sh > h) h = sh;
    }
    // solid things with a flat top (walls, parked cars) can be stood on too
    for (const b of collidersNear(x, z, 0)) {
      if (b.top === undefined || b.top <= h || b.top > y + STEP_UP) continue;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) h = b.top;
    }
    return h;
  }

  // The top of whatever stands at (x, z): the ground, a roof, a deck. Rain stops there.
  function coverAt(x, z) {
    let h = Math.max(terrain(x, z), WATER_Y);
    for (const s of indexQuery(surfaceIndex, x, z, x, z)) {
      const sh = surfaceHeight(s, x, z);
      if (sh !== null && sh > h) h = sh;
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
    addSurface({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h0: y, h1: y });
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
    addSurface({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h0: hA, h1: hB });
  }

  // A wall that only blocks things standing between y0 and y1.
  function addWall(x0, x1, z0, z1, y0, y1, visible = true) {
    if (visible) slab(x0, x1, y0, y1, z0, z1);
    addCollider({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: y0, maxY: y1 + 0.6, top: y1 });
  }

  // Stops ground-level things from driving into the underside of a ramp. It must only
  // cover the tall half: near the foot, a car climbing the ramp is still low enough to hit it.
  function addBlocker(x0, x1, z0, z1) {
    addCollider({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxY: 0.45 });
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
    addSurface({ minX: x0, maxX: x1, minZ: z - half, maxZ: z + half, h0: 0, h1: H });
    addSurface({ minX: x2, maxX: x3, minZ: z - half, maxZ: z + half, h0: H, h1: 0 });
    addBlocker((x0 + x1) / 2, x1, z - half, z + half);
    addBlocker(x2, (x2 + x3) / 2, z - half, z + half);

    addDeck(x1, x2, z - half, z + half, H);
    for (let x = x1 + 2; x < x2; x += 8) marks.push({ x, z, sx: 3, sz: 0.25, y: H });

    // guard rails: full height beside the ramps, deck height only over the cross streets
    for (const side of [-1, 1]) {
      const zr = z + side * (half - 0.15);
      slab(x1, x2, H, H + 0.8, zr - 0.15, zr + 0.15);
      addCollider({ minX: x1, maxX: x2, minZ: zr - 0.15, maxZ: zr + 0.15, minY: H - 0.5, maxY: H + 2 });
      addCollider({ minX: x0, maxX: x1, minZ: zr - 0.15, maxZ: zr + 0.15, maxY: H + 2 });
      addCollider({ minX: x2, maxX: x3, minZ: zr - 0.15, maxZ: zr + 0.15, maxY: H + 2 });
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

  // ---------- Roads beyond the grid ----------

  // Every road off the street grid is a ribbon laid along a line of points { x, z, h }
  // about 5 m apart: the hill road, the lake drive and its bridge, the highway's link road
  // and slip roads, and the streets out to the mall, the houses and the south side. Where a
  // ribbon is raised off the ground it gets a deck, parapets and piers, and becomes a
  // surface to drive on.
  const ribbons = []; // { name, points, half, lift }
  const ribbonIndex = makeIndex(); // every piece of every ribbon, for "is this spot on a road?"
  const lampSpots = []; // street lamps along the ribbons: { x, y, z, turn }

  // A smooth line through control points [x, z], as points `spacing` metres apart.
  function smoothPath(ctrl, spacing = 5) {
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    return curve.getSpacedPoints(Math.max(1, Math.round(curve.getLength() / spacing))).map((p) => ({ x: p.x, z: p.z, h: 0 }));
  }

  // Evens out a height profile into ramps: a moving average `reach` points either way.
  function easeHeights(points, reach, passes = 3) {
    const last = points.length - 1;
    for (let pass = 0; pass < passes; pass++) {
      const heights = points.map((p) => p.h);
      for (let i = 0; i <= last; i++) {
        let sum = 0;
        for (let k = -reach; k <= reach; k++) sum += heights[Math.max(0, Math.min(last, i + k))];
        points[i].h = sum / (reach * 2 + 1);
      }
    }
  }

  // Sideways unit vector (to the left of travel) at point i of a ribbon.
  function across(points, i) {
    const a = points[Math.max(0, i - 1)];
    const c = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    return [-(c.z - a.z) / len, (c.x - a.x) / len];
  }

  // Distance from (x, z) to the nearest ribbon road, ignoring `except`.
  function ribbonDistance(x, z, except = null) {
    let best = Infinity;
    for (const piece of indexQuery(ribbonIndex, x, z, x, z)) {
      if (piece.road === except) continue;
      const { ax, az, bx, bz } = piece;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - piece.road.half;
      if (d < best) best = d;
    }
    return best;
  }

  // A band of the ribbon from `from` to `to` metres off its centre line (left is +), `lift`
  // above the road surface, drawn in `material`; `dash` leaves gaps (on, off in points).
  function ribbonStrip(road, from, to, lift, material, dash = null, order = 0) {
    const { points } = road;
    const positions = [];
    const uvs = [];
    const index = [];
    let travelled = 0;
    points.forEach((p, i) => {
      if (i) travelled += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      const [nx, nz] = across(points, i);
      for (const side of [from, to]) {
        positions.push(p.x + nx * side, p.h + road.lift + lift, p.z + nz * side);
        uvs.push(side / GROUND.road[2], travelled / GROUND.road[2]);
      }
      if (i < points.length - 1 && !(dash && i % (dash[0] + dash[1]) >= dash[0])) {
        index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  }

  // A solid band swept along the ribbon's points i0..i1: its cross-section runs from `from`
  // to `to` metres across, and from top(p) down to bottom(p) in height.
  function ribbonSweep(points, i0, i1, from, to, top, bottom, material) {
    const positions = [];
    const index = [];
    const ring = 8; // four corners, each twice so the faces have their own normals
    for (let i = i0; i <= i1; i++) {
      const p = points[i];
      const [nx, nz] = across(points, i);
      const t = top(p, i);
      const b = bottom(p, i);
      const corner = (side, y) => [p.x + nx * side, y, p.z + nz * side];
      // top-left, top-right, bottom-right, bottom-left, each twice
      for (const c of [corner(from, t), corner(to, t), corner(to, t), corner(to, b), corner(to, b), corner(from, b), corner(from, b), corner(from, t)]) {
        positions.push(...c);
      }
      if (i < i1) {
        const k = (i - i0) * ring;
        for (let f = 0; f < 4; f++) {
          const a = k + f * 2;
          const b2 = a + 1;
          index.push(a, b2, a + ring, b2, b2 + ring, a + ring);
        }
      }
    }
    // close both ends
    for (const [k, flip] of [[0, false], [(i1 - i0) * ring, true]]) {
      const quad = [k, k + 2, k + 4, k + 6];
      index.push(...(flip ? [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]] : [quad[0], quad[2], quad[1], quad[0], quad[3], quad[2]]));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const roadTarmac = () => (photos.asphalt
    ? groundMaterial(GROUND.road[0], GROUND.road[1], GROUND.road[3], { side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ color: 0x4b5058, side: THREE.DoubleSide }));
  const onTarmac = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
  const lineWhite = new THREE.MeshLambertMaterial({ color: 0xe9e9e4, ...onTarmac });
  const lineYellow = new THREE.MeshLambertMaterial({ color: 0xe0b020, ...onTarmac });
  const bridgeConcrete = new THREE.MeshLambertMaterial({ color: 0xa4a7ab });

  // Lays a road along `points`. Options: half (half its width), center ('double', 'dashed'
  // or none), lanes (2 for two lanes each way), lamps (metres between street lamps).
  function addRibbon(name, points, opts = {}) {
    const road = { name, points, half: opts.half || 6, lift: opts.lift ?? 0.05, center: opts.center };
    ribbons.push(road);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      indexAdd(ribbonIndex, {
        road, ax: a.x, az: a.z, bx: b.x, bz: b.z,
        minX: Math.min(a.x, b.x) - road.half - 2, maxX: Math.max(a.x, b.x) + road.half + 2,
        minZ: Math.min(a.z, b.z) - road.half - 2, maxZ: Math.max(a.z, b.z) + road.half + 2,
      });
    }
    if (opts.noDraw) return road;

    const half = road.half;
    // feet and tyres stand on the tarmac as it is drawn, not on the line it was laid along
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k];
      const b = points[k + 1];
      addSurface({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ha: a.h + road.lift, hb: b.h + road.lift, half: half + 0.05 });
    }
    ribbonStrip(road, -half, half, 0, opts.material || roadTarmac(), null, 0.05);
    ribbonStrip(road, half - 0.55, half - 0.4, 0.004, lineWhite);
    ribbonStrip(road, -half + 0.4, -half + 0.55, 0.004, lineWhite);
    if (road.center === 'double') {
      ribbonStrip(road, 0.12, 0.27, 0.004, lineYellow);
      ribbonStrip(road, -0.27, -0.12, 0.004, lineYellow);
    } else if (road.center === 'dashed') {
      ribbonStrip(road, -0.08, 0.08, 0.004, lineWhite, [1, 1]);
    }
    if (opts.lanes === 2) {
      for (const side of [-1, 1]) ribbonStrip(road, side * half / 2 - 0.07, side * half / 2 + 0.07, 0.004, lineWhite, [1, 1]);
    }

    // --- raised: a deck under the road, parapets either side, piers down to the ground
    const raised = points.map((p) => p.h > terrain(p.x, p.z) + 0.3);
    let i = 0;
    while (i < points.length) {
      if (!raised[i]) {
        i++;
        continue;
      }
      const i0 = Math.max(0, i - 1);
      while (i < points.length && raised[i]) i++;
      const i1 = Math.min(points.length - 1, i);
      const ground = (p) => terrain(p.x, p.z) - 0.2;
      // the deck: a slab 1.3 m deep, solid to the ground while it is that low (an embankment)
      ribbonSweep(points, i0, i1, -half - 0.6, half + 0.6, (p) => p.h + road.lift - 0.01, (p) => Math.max(ground(p), p.h - 1.3), bridgeConcrete);
      for (const side of [-1, 1]) {
        const inner = side * (half + 0.15);
        const outer = side * (half + 0.55);
        ribbonSweep(points, i0, i1, Math.min(inner, outer), Math.max(inner, outer), (p) => p.h + 0.95, (p) => p.h, bridgeConcrete);
      }
      for (let k = i0; k < i1; k++) {
        const a = points[k];
        const b = points[k + 1];
        addSurface({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ha: a.h + road.lift, hb: b.h + road.lift, half: half + 0.6 });
        const low = Math.min(a.h, b.h);
        const high = Math.max(a.h, b.h);
        for (const side of [-1, 1]) {
          const [anx, anz] = across(points, k);
          const [bnx, bnz] = across(points, k + 1);
          const off = side * (half + 0.35);
          addSegmentCollider(a.x + anx * off, a.z + anz * off, b.x + bnx * off, b.z + bnz * off, 0.2, low - 0.8, high + 1.2);
        }
        // too low to pass under, but too high to drive up onto from the side: the space
        // beneath is closed to anything on the ground (the sides keep it from the ramp's foot)
        if (low > 1.2 && low < 4.2) addSegmentCollider(a.x, a.z, b.x, b.z, half + 0.6, -2, low - 0.4);
      }
      // piers every 25 m or so, kept off any road below
      for (let k = i0 + 2; k < i1 - 1; k += 5) {
        const p = points[k];
        const floor = terrain(p.x, p.z);
        if (p.h - 1.3 - floor < 0.8 || !pierFits(p.x, p.z, road)) continue;
        const [nx, nz] = across(points, k);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.3, p.h - 1.3 - floor + 0.3, half * 1.4), bridgeConcrete);
        pier.position.set(p.x, floor + (p.h - 1.3 - floor) / 2 - 0.15, p.z);
        pier.rotation.y = Math.atan2(nx, nz);
        pier.castShadow = true;
        scene.add(pier);
        addSegmentCollider(p.x - nx * half * 0.7, p.z - nz * half * 0.7, p.x + nx * half * 0.7, p.z + nz * half * 0.7, 0.65, floor - 1, p.h - 1.3);
      }
    }

    // --- street lamps along it
    if (opts.lamps) {
      let next = 0;
      let travelled = 0;
      points.forEach((p, k) => {
        if (k) travelled += Math.hypot(p.x - points[k - 1].x, p.z - points[k - 1].z);
        if (travelled < next || k === 0 || k === points.length - 1) return;
        next = travelled + opts.lamps;
        const side = Math.round(travelled / opts.lamps) % 2 ? 1 : -1;
        const [nx, nz] = across(points, k);
        const off = side * (half + (raised[k] ? 0.35 : 1.1));
        // the lamp's arm reaches back over the road
        lampSpots.push({ x: p.x + nx * off, y: p.h + (raised[k] ? 0.95 : 0.05), ground: p.h + 0.06, z: p.z + nz * off, turn: Math.atan2(-nx * side, -nz * side) });
      });
    }
    return road;
  }

  // Can a pier stand at (x, z) without blocking a road, the highway or a lane of the grid?
  function pierFits(x, z, self) {
    if (Math.abs(z - HIGHWAY.z) < 1.2 && Math.abs(x) < HIGHWAY.end) return true; // the median
    if (Math.abs(z - HIGHWAY.z) < HIGHWAY.half + 1.5 && Math.abs(x) < HIGHWAY.end) return false;
    if (Math.abs(x) < HALF + 1 && Math.abs(z) < HALF + 1) {
      if (Math.abs(x - roadCenter(roadIndex(x))) < ROAD_WIDTH / 2 + 1) return false;
      if (Math.abs(z - roadCenter(roadIndex(z))) < ROAD_WIDTH / 2 + 1) return false;
    }
    return ribbonDistance(x, z, self) > 1.5;
  }

  // The streets beyond the grid. Hill and lake roads leave from the north edge of the city;
  // the link road leaves from its south edge and crosses the highway on a bridge, with a
  // slip road on and off each carriageway; spurs lead out to the mall and its car park.
  function buildRoads() {
    const lakeDrive = smoothPath([
      [274, 266], [330, 266], [380, 266], [430, 266], [480, 266], [540, 272], [590, 300], [625, 350],
      [640, 420], [635, 500], [610, 570], [565, 625], [500, 660], [420, 675], [340, 668], [270, 645],
      [210, 605], [165, 555], [135, 495], [118, 430], [114, 360], [114, 300], [114, 274],
    ]);
    // a low bridge where it crosses the water, eased into ramps at either end
    for (const p of lakeDrive) p.h = lakeEdge(p.x, p.z) < 12 ? 2.6 : 0;
    easeHeights(lakeDrive, 6);
    addRibbon('lake', lakeDrive, { half: 6.5, center: 'double', lamps: 38 });

    addRibbon('hill', hillRoad.filter((p) => p.z >= 274), { half: ROAD_HALF, center: 'dashed', lift: 0.06 });

    // the link road: up over the highway and down again
    const link = smoothPath([[-114, -274], [-114, -488]]);
    for (const p of link) {
      const z = -p.z;
      p.h = z < 288 ? 0 : z < 346 ? (7.6 * (z - 288)) / 58 : z < 398 ? 7.6 : z < 456 ? (7.6 * (456 - z)) / 58 : 0;
    }
    easeHeights(link, 2, 2);
    addRibbon('link', link, { half: 7, center: 'double', lanes: 2, lamps: 30 });

    const slip = (name, ctrl) => addRibbon(name, smoothPath(ctrl), { half: 4, lift: 0.09 });
    slip('ramp-a', [[-330, -359], [-262, -354], [-205, -343], [-168, -325], [-142, -304], [-126, -289], [-118, -279]]);
    slip('ramp-b', [[-110, -279], [-102, -289], [-86, -304], [-60, -325], [-20, -343], [35, -353], [110, -359]]);
    slip('ramp-c', [[100, -385], [30, -391], [-25, -401], [-64, -421], [-90, -445], [-104, -462], [-110, -472]]);
    slip('ramp-d', [[-118, -472], [-124, -462], [-138, -445], [-164, -421], [-203, -401], [-253, -391], [-330, -385]]);

    addRibbon('south', smoothPath([[-520, -488], [-300, -488], [-114, -488], [100, -488], [330, -488]]), { half: 6, center: 'double', lamps: 40 });
    addRibbon('mall-north', smoothPath([[-274, -38], [-334, -38]]), { half: 7, center: 'double' });
    addRibbon('mall-south', smoothPath([[-274, -190], [-334, -190]]), { half: 7, center: 'double' });
    addRibbon('houses', smoothPath([[-38, 274], [-38, 400], [-38, 500]]), { half: 5, center: 'dashed', lamps: 36 });
    // a turning circle at the end of the street of houses
    const circle = new THREE.Mesh(new THREE.CircleGeometry(13, 40).rotateX(-Math.PI / 2), roadTarmac());
    circle.position.set(-38, 0.045, 510);
    circle.receiveShadow = true;
    scene.add(circle);

    buildHighway();
    buildRoadGraph();
  }

  // Trees beyond the city: avenues along the roads, rows beside the highway, and copses
  // scattered over the open ground, all kept off roads, water and the car park.
  function plantCountryside() {
    const open = (x, z, clear) => {
      if (Math.abs(x) < HALF + 6 && Math.abs(z) < HALF + 6) return false;
      if (Math.abs(x) > WORLD_LIMITS.maxX - 5 || z < WORLD_LIMITS.minZ + 5 || z > WORLD_LIMITS.maxZ - 5) return false;
      if (lakeEdge(x, z) < 4 || terrain(x, z) > 30) return false;
      if (Math.abs(z - HIGHWAY.z) < HIGHWAY.half + 4) return false;
      if (x > MALL_LOT.minX - 8 && x < MALL.maxX + 8 && z > MALL_LOT.minZ - 8 && z < MALL.maxZ + 8) return false;
      if (Math.hypot(x + 38, z - 510) < 18) return false;
      return ribbonDistance(x, z) > clear;
    };
    const plant = (x, z, bushy) => {
      const y = terrain(x, z);
      if (bushy) plants.push({ type: 'bush', x, y: y + 0.05, z, s: rand(0.9, 1.5) });
      else {
        plants.push({ type: Math.random() < 0.2 ? 'pine' : 'tree', x, y: y + 0.05, z, s: rand(0.85, 1.3) });
        addCollider({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, minY: y - 1, maxY: y + 8 });
      }
    };
    for (const road of ribbons) {
      if (!['lake', 'link', 'south', 'houses', 'mall-north', 'mall-south'].includes(road.name)) continue;
      road.points.forEach((p, k) => {
        if (k % 4) return;
        const [nx, nz] = across(road.points, k);
        for (const side of [-1, 1]) {
          const x = p.x + nx * side * (road.half + 4);
          const z = p.z + nz * side * (road.half + 4);
          if (p.h < 0.5 && open(x, z, 2.5)) plant(x, z, false);
        }
      });
    }
    for (let x = -HIGHWAY.portal + 20; x < HIGHWAY.portal - 20; x += 18) {
      for (const side of [-1, 1]) {
        const z = HIGHWAY.z + side * (HIGHWAY.half + 9 + rand(-1, 1));
        if (open(x, z, 3)) plant(x + rand(-3, 3), z, Math.random() < 0.35);
      }
    }
    for (let n = 0; n < 100; n++) {
      const cx = rand(-760, 760);
      const cz = rand(-580, 900);
      if (!open(cx, cz, 10)) continue;
      const count = Math.floor(rand(3, 10));
      for (let k = 0; k < count; k++) {
        const x = cx + rand(-16, 16);
        const z = cz + rand(-16, 16);
        if (open(x, z, 5)) plant(x, z, Math.random() < 0.3);
      }
    }
  }

  // ---------- The highway ----------

  // Three lanes each way, the +x carriageway on the north side, the -x one on the south,
  // with a concrete barrier down the middle, rails along the edges (open where the slip
  // roads join), tall lamps in the median and a tunnel at each end.
  const highwayLanes = []; // { dir: +1 | -1, z }: the centre of each lane
  for (let k = 0; k < 3; k++) {
    highwayLanes.push({ dir: 1, z: HIGHWAY.z + 2.2 + HIGHWAY.lane * (k + 0.5) });
    highwayLanes.push({ dir: -1, z: HIGHWAY.z - 2.2 - HIGHWAY.lane * (k + 0.5) });
  }

  function buildHighway() {
    const { z: hz, half, end, portal } = HIGHWAY;
    const len = end * 2;
    const deck = flatPlane(len, half * 2, GROUND.road[0], 0, hz, 0.04, ...GROUND.road.slice(1));
    deck.renderOrder = -0.45;
    deck.material.depthWrite = false;

    // paint: dashed lane lines, a yellow edge by the barrier, a white edge by the shoulder
    for (const dir of [1, -1]) {
      const at = (offset) => hz + dir * offset;
      marks.push({ x: 0, z: at(1.5), sx: len, sz: 0.15, color: 0xe0b020 });
      marks.push({ x: 0, z: at(2.2 + HIGHWAY.lane * 3 + 0.1), sx: len, sz: 0.18 });
      for (const k of [1, 2]) {
        for (let x = -end; x < end; x += 12) marks.push({ x: x + 2, z: at(2.2 + HIGHWAY.lane * k), sx: 4, sz: 0.15 });
      }
    }

    // the median barrier: a sloped concrete wall
    const barrier = new THREE.Shape();
    barrier.moveTo(-0.4, 0);
    barrier.lineTo(0.4, 0);
    barrier.lineTo(0.2, 0.3);
    barrier.lineTo(0.12, 0.85);
    barrier.lineTo(-0.12, 0.85);
    barrier.lineTo(-0.2, 0.3);
    barrier.closePath();
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(barrier, { depth: len, bevelEnabled: false }), bridgeConcrete);
    wall.rotation.y = Math.PI / 2;
    wall.position.set(-end, 0.04, hz);
    wall.castShadow = wall.receiveShadow = true;
    scene.add(wall);
    addCollider({ minX: -end, maxX: end, minZ: hz - 0.4, maxZ: hz + 0.4, maxY: 0.9, top: 0.9 });

    // steel guard rails along both outer edges, with gaps where the slip roads join
    const gaps = { 1: [[-335, 112]], [-1]: [[-335, 102]] };
    const railMat = reflect(new THREE.MeshPhongMaterial({ color: 0xb9bec4, shininess: 60, specular: 0x666666 }), 0.2);
    const railGeo = new THREE.BoxGeometry(1, 0.32, 0.08);
    const postGeo = new THREE.BoxGeometry(0.12, 0.75, 0.12);
    const runs = [];
    for (const dir of [1, -1]) {
      const z = hz + dir * (half - 0.3);
      let from = -portal;
      for (const [g0, g1] of [...gaps[dir], [portal, portal]]) {
        if (g0 > from) runs.push({ x0: from, x1: g0, z });
        from = g1;
      }
    }
    const posts = [];
    for (const run of runs) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.scale.x = run.x1 - run.x0;
      rail.position.set((run.x0 + run.x1) / 2, 0.62, run.z);
      rail.castShadow = true;
      scene.add(rail);
      addCollider({ minX: run.x0, maxX: run.x1, minZ: run.z - 0.12, maxZ: run.z + 0.12, maxY: 1 });
      for (let x = run.x0; x <= run.x1; x += 4) posts.push([x, run.z + Math.sign(run.z - hz) * 0.1]);
    }
    const postMesh = new THREE.InstancedMesh(postGeo, steelMat, posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, m.makeTranslation(x, 0.4, z)));
    scene.add(postMesh);

    // tall lamps in the median, an arm over each carriageway
    for (let x = -portal + 30; x < portal; x += 60) {
      for (const dir of [1, -1]) lampSpots.push({ x, y: 0.9, ground: 0.06, z: hz + dir * 0.2, turn: dir > 0 ? 0 : Math.PI, tall: true });
    }

    // overhead signs on gantries before the interchange, one for each direction
    const signFace = canvasTexture(512, 160, (g, w, h) => {
      g.fillStyle = '#0f5f37';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff';
      g.lineWidth = 6;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#fff';
      g.font = 'bold 54px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('City Centre', 36, 58);
      g.font = 'bold 40px system-ui, sans-serif';
      g.fillText('Mall · Metro  EXIT ↗', 36, 116);
    });
    const signMat = new THREE.MeshLambertMaterial({ map: signFace });
    for (const dir of [1, -1]) {
      const x = -114 - dir * 330;
      const z0 = hz + dir * 1;
      const z1 = hz + dir * (half + 0.5);
      for (const z of [z0, z1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.4, 0.35), steelMat);
        leg.position.set(x, 3.7, z);
        scene.add(leg);
        addCollider({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, maxY: 7.4 });
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, Math.abs(z1 - z0)), steelMat);
      beam.position.set(x, 7.2, (z0 + z1) / 2);
      scene.add(beam);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.1), signMat);
      board.position.set(x - dir * 0.25, 5.8, (z0 + z1) / 2 + dir * 1.2);
      board.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(board);
    }

    // --- tunnels: a portal in each mound and a dark bore beyond it
    const tunnelMat = new THREE.MeshLambertMaterial({ color: 0x55585d, side: THREE.DoubleSide });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    for (const side of [1, -1]) {
      const x0 = side * portal;
      const depth = 260;
      const cx = x0 + side * depth / 2;
      const height = 8;
      for (const [w, h, d, y, z] of [[depth, 0.6, half * 2 + 2, height + 0.3, hz], [depth, height, 0.6, height / 2, hz - half - 0.6], [depth, height, 0.6, height / 2, hz + half + 0.6]]) {
        const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tunnelMat);
        piece.position.set(cx, y, z);
        scene.add(piece);
      }
      // the face round the opening
      const face = new THREE.Mesh(new THREE.BoxGeometry(2, 22, half * 2 + 30), bridgeConcrete);
      face.position.set(x0, height + 11 - 0.01, hz);
      face.castShadow = true;
      scene.add(face);
      for (const dz of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2, height, 14), bridgeConcrete);
        wing.position.set(x0, height / 2, hz + dz * (half + 7.5));
        scene.add(wing);
      }
      // a row of lamps down the bore, so it reads as a tunnel and not a hole
      for (let d = 10; d < depth; d += 14) {
        for (const dz of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.3), lampMat);
          lamp.position.set(x0 + side * d, height - 0.6, hz + dz * (half - 1));
          scene.add(lamp);
        }
      }
      for (const dz of [-1, 1]) addCollider({ minX: Math.min(x0, x0 + side * depth), maxX: Math.max(x0, x0 + side * depth), minZ: hz + dz * (half + 0.3) - 0.3, maxZ: hz + dz * (half + 0.3) + 0.3, maxY: height });
    }

    // the highway as a line, for finding routes along it
    addRibbon('highway', smoothPath([[-portal, hz], [portal, hz]], 10), { half, noDraw: true });
  }

  // ---------- Route finding ----------

  // The road network as a graph: every crossing of the street grid, and every point along
  // the ribbons, joined to its neighbours; ribbon ends join whatever they touch.
  const roadNodes = []; // { x, y, z, links: [[node, length]] }

  function buildRoadGraph() {
    const join = (a, b) => {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      a.links.push([b, d]);
      b.links.push([a, d]);
    };
    const grid = [];
    for (let i = 0; i <= BLOCKS; i++) {
      grid.push([]);
      for (let j = 0; j <= BLOCKS; j++) {
        const node = { x: roadCenter(i), y: 0, z: roadCenter(j), links: [] };
        grid[i].push(node);
        roadNodes.push(node);
        if (i) join(node, grid[i - 1][j]);
        if (j) join(node, grid[i][j - 1]);
      }
    }
    const ends = [];
    for (const road of ribbons) {
      let prev = null;
      road.points.forEach((p, k) => {
        if (k % 2 && k !== road.points.length - 1) return; // every other point is plenty
        const node = { x: p.x, y: p.h, z: p.z, links: [] };
        roadNodes.push(node);
        if (prev) join(node, prev);
        prev = node;
        if (k === 0 || k === road.points.length - 1) ends.push(node);
      });
    }
    // each ribbon end joins the nearest node of anything else within reach
    for (const end of ends) {
      let best = null;
      let bestDist = 26;
      for (const node of roadNodes) {
        if (node === end || end.links.some(([n]) => n === node)) continue;
        const d = Math.hypot(node.x - end.x, node.z - end.z);
        if (d < bestDist && Math.abs(node.y - end.y) < 2) {
          best = node;
          bestDist = d;
        }
      }
      if (best) join(end, best);
    }
  }

  function nearestNode(x, z) {
    let best = roadNodes[0];
    let bestDist = Infinity;
    for (const node of roadNodes) {
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    return best;
  }

  // The shortest way along the roads between two nodes, as a list of nodes.
  function findPath(from, to) {
    const dist = new Map([[from, 0]]);
    const back = new Map();
    const open = [from];
    while (open.length) {
      let at = 0;
      for (let k = 1; k < open.length; k++) if (dist.get(open[k]) < dist.get(open[at])) at = k;
      const node = open[at];
      open[at] = open[open.length - 1];
      open.pop();
      if (node === to) break;
      const base = dist.get(node);
      for (const [next, len] of node.links) {
        const d = base + len;
        if (d < (dist.get(next) ?? Infinity)) {
          if (!dist.has(next)) open.push(next);
          dist.set(next, d);
          back.set(next, node);
        }
      }
    }
    const path = [to];
    while (path[0] !== from && back.has(path[0])) path.unshift(back.get(path[0]));
    return path;
  }

  // ---------- Metro ----------

  // An elevated line runs north to south down the middle of the city, then curves over the
  // highway to the south side. Two tracks on a concrete viaduct, three stations under
  // curved glass roofs (North, Central over the station plaza, and South), and two trains
  // shuttling end to end, each on its own track, stopping at every station.
  const METRO_Y = 11; // rail level
  const PLATFORM = 1.05; // platform height above the rails
  const TRACK = 2.1; // each track's centre from the line's centre
  const CAR_LENGTH = 15;
  const metroLine = smoothPath([
    [0, 520], [0, 300], [0, 0], [0, -150], [6, -200], [25, -245], [55, -288], [95, -330],
    [140, -372], [185, -414], [230, -450], [280, -484], [330, -515],
  ], 4);
  for (const p of metroLine) p.h = METRO_Y;
  // distance along the line to each point, for placing trains
  const metroAlong = [0];
  for (let i = 1; i < metroLine.length; i++) {
    metroAlong.push(metroAlong[i - 1] + Math.hypot(metroLine[i].x - metroLine[i - 1].x, metroLine[i].z - metroLine[i - 1].z));
  }
  const METRO_LENGTH = metroAlong[metroAlong.length - 1];
  const nearestAlong = (x, z) => {
    let best = 0;
    let bestDist = Infinity;
    metroLine.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = metroAlong[i];
      }
    });
    return best;
  };
  const STATIONS = [
    { name: 'North', s: nearestAlong(0, 440) },
    { name: 'Central', s: nearestAlong(0, 0) },
    { name: 'South', s: METRO_LENGTH - 32 },
  ];
  const trains = [];
  const trainBoxes = []; // solid while you are up at track level

  // The point `s` metres along the line, `off` metres to its left: { x, z, h: heading }.
  function metroPoint(s, off = 0) {
    s = Math.max(0, Math.min(METRO_LENGTH, s));
    let i = 1;
    while (i < metroAlong.length - 1 && metroAlong[i] < s) i++;
    const a = metroLine[i - 1];
    const b = metroLine[i];
    const t = (s - metroAlong[i - 1]) / (metroAlong[i] - metroAlong[i - 1] || 1);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: a.x + dx * t - (dz / len) * off, z: a.z + dz * t + (dx / len) * off, h: Math.atan2(dx, dz) };
  }

  function buildMetro() {
    const line = { points: metroLine, lift: 0, half: 4.8 };
    const n = metroLine.length - 1;
    const stationAt = (i) => STATIONS.some((st) => Math.abs(metroAlong[i] - st.s) < 36);

    // --- the viaduct: a box girder with walls along both edges, wider at the stations
    const wide = (p, i) => (stationAt(i) ? 8.6 : 4.8);
    const sweepVar = (from, to, top, bottom, material) => {
      // like ribbonSweep, but the width may change along the line
      const positions = [];
      const index = [];
      metroLine.forEach((p, i) => {
        const [nx, nz] = across(metroLine, i);
        const f = from(p, i);
        const t2 = to(p, i);
        const corner = (side, y) => [p.x + nx * side, y, p.z + nz * side];
        for (const c of [corner(f, top(p, i)), corner(t2, top(p, i)), corner(t2, top(p, i)), corner(t2, bottom(p, i)),
          corner(t2, bottom(p, i)), corner(f, bottom(p, i)), corner(f, bottom(p, i)), corner(f, top(p, i))]) positions.push(...c);
        if (i < n) {
          const k = i * 8;
          for (let face = 0; face < 4; face++) {
            const a = k + face * 2;
            index.push(a, a + 1, a + 8, a + 1, a + 9, a + 8);
          }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    sweepVar((p, i) => -wide(p, i), (p, i) => wide(p, i), () => METRO_Y - 0.35, () => METRO_Y - 2.2, bridgeConcrete);
    for (const side of [-1, 1]) {
      const inner = (p, i) => side * (wide(p, i) - 0.3);
      const outer = (p, i) => side * wide(p, i);
      sweepVar(side > 0 ? inner : outer, side > 0 ? outer : inner, () => METRO_Y + 1.1, () => METRO_Y - 0.4, bridgeConcrete);
    }
    // the track beds: concrete slabs with sleepers, and the rails on them
    const sleepers = new THREE.MeshLambertMaterial({
      map: canvasTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#7d7a74';
        g.fillRect(0, 0, w, h);
        speckle(g, w, h, 600, 0.15);
        g.fillStyle = '#a9a59c';
        for (let y = 4; y < h; y += 32) g.fillRect(6, y, w - 12, 12);
      }),
    });
    const railSteel = reflect(new THREE.MeshPhongMaterial({ color: 0x8e9196, shininess: 90, specular: 0xbbbbbb }), 0.3);
    const bed = { points: metroLine, lift: 0 };
    for (const t of [-TRACK, TRACK]) {
      const strip = ribbonStrip(bed, t - 1.4, t + 1.4, -0.33, sleepers);
      strip.geometry.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = (v * 5) / 2.8; });
      for (const r of [-0.72, 0.72]) {
        ribbonSweep(metroLine, 0, n, t + r - 0.04, t + r + 0.04, () => METRO_Y, () => METRO_Y - 0.2, railSteel);
      }
    }
    // the deck, walls and buffer stops are solid at track level
    for (let i = 0; i < n; i++) {
      const a = metroLine[i];
      const b = metroLine[i + 1];
      addSurface({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ha: METRO_Y - 0.3, hb: METRO_Y - 0.3, half: wide(a, i) });
      for (const side of [-1, 1]) {
        const [anx, anz] = across(metroLine, i);
        const [bnx, bnz] = across(metroLine, i + 1);
        const off = side * (wide(a, i) - 0.15);
        // low enough to step over from a platform, a wall to anyone down on the tracks
        addSegmentCollider(a.x + anx * off, a.z + anz * off, b.x + bnx * off, b.z + bnz * off, 0.2, METRO_Y - 1, METRO_Y + 1.2, { top: METRO_Y + 1 });
      }
    }

    // --- piers: a round column with a hammerhead, about every 30 m, never on a road
    const pierMat = cityMaterial('concrete', 0xc4c6c9);
    const batch = makeBatch();
    for (let i = 4; i < n - 2; i += 7) {
      const p = metroLine[i];
      if (!pierFits(p.x, p.z, null)) {
        // try a little either way along the line
        const alt = [i - 2, i + 2, i - 3, i + 3].find((k) => pierFits(metroLine[k].x, metroLine[k].z, null));
        if (alt === undefined) continue;
        i = alt;
      }
      const q = metroLine[i];
      const floor = groundAt(q.x, q.z, 1);
      const [nx, nz] = across(metroLine, i);
      const turn = Math.atan2(nx, nz);
      batchMatrix.makeTranslation(q.x, (floor + METRO_Y - 3.6) / 2, q.z);
      batchGeometry(batch, pierMat, new THREE.CylinderGeometry(0.85, 0.95, METRO_Y - 3.6 - floor, 16), batchMatrix);
      batchBox(batch, pierMat, q.x, METRO_Y - 2.9, q.z, 2.4, 1.4, 7.5, turn + Math.PI / 2, 3);
      addCollider({ minX: q.x - 0.95, maxX: q.x + 0.95, minZ: q.z - 0.95, maxZ: q.z + 0.95, minY: floor - 1, maxY: METRO_Y - 3 });
    }

    // --- catenary: a portal over the tracks every 40 m, and the wires
    const wires = [];
    for (let i = 2; i < n; i += 10) {
      const p = metroLine[i];
      const [nx, nz] = across(metroLine, i);
      const w = wide(p, i) - 0.5;
      for (const side of [-1, 1]) {
        batchMatrix.makeTranslation(p.x + nx * side * w, METRO_Y + 3.2, p.z + nz * side * w);
        batchGeometry(batch, steelMat, new THREE.CylinderGeometry(0.1, 0.12, 6.4, 8), batchMatrix);
      }
      batchBox(batch, steelMat, p.x, METRO_Y + 6.3, p.z, 0.16, 0.25, w * 2, Math.atan2(nx, nz), 1);
    }
    for (const t of [-TRACK, TRACK]) {
      for (let i = 0; i < n; i++) {
        const a = metroPoint(metroAlong[i], t);
        const b = metroPoint(metroAlong[i + 1], t);
        wires.push(a.x, METRO_Y + 5.6, a.z, b.x, METRO_Y + 5.6, b.z);
      }
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2c30 })));

    // --- stations: side platforms, a curved glass roof on steel arches, lamps, and stairs
    // down to the street
    const roofGlass = reflect(new THREE.MeshPhongMaterial({
      color: 0x6f9fd0, transparent: true, opacity: 0.55, shininess: 100, specular: 0xaabbcc, side: THREE.DoubleSide, depthWrite: false,
    }), 0.5);
    const platformMat = cityMaterial('concrete', 0xd9d9d6);
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0xe8c33a });
    const stationLamp = new THREE.MeshBasicMaterial({ color: 0x606060 });
    stationLamp.userData.lit = 0xfff4dc;
    metroLamps.push(stationLamp);
    for (const st of STATIONS) {
      const c = metroPoint(st.s);
      const turn = c.h;
      const along = (d, off, y) => {
        const p = metroPoint(st.s + d, off);
        return [p.x, y, p.z];
      };
      for (const side of [-1, 1]) {
        const p0 = metroPoint(st.s - 32, side * 6);
        const p1 = metroPoint(st.s + 32, side * 6);
        addSurface({ ax: p0.x, az: p0.z, bx: p1.x, bz: p1.z, ha: METRO_Y + PLATFORM, hb: METRO_Y + PLATFORM, half: 2.25 });
        // platform: from just outside the train's sweep to the viaduct wall
        for (let d = -32; d < 32; d += 4) {
          const a0 = along(d, side * 3.75, 0);
          const a1 = along(d + 4, side * 3.75, 0);
          const mx = (a0[0] + a1[0]) / 2;
          const mz = (a0[2] + a1[2]) / 2;
          const [nx, nz] = [-Math.cos(turn), Math.sin(turn)];
          batchBox(batch, platformMat, mx + nx * side * 2.25, METRO_Y + PLATFORM / 2 - 0.3, mz + nz * side * 2.25, 4.5, PLATFORM + 0.3, 4.05, turn, 3);
          batchBox(batch, edgeMat, mx + nx * side * 0.25, METRO_Y + PLATFORM + 0.005, mz + nz * side * 0.25, 0.5, 0.02, 4.05, turn, 1);
        }
      }
      // the roof: a shallow barrel vault of glass on steel arches
      const arch = new THREE.CylinderGeometry(11, 11, 70, 24, 1, true, -Math.PI * 0.32, Math.PI * 0.64);
      const vault = new THREE.Mesh(arch, roofGlass);
      vault.rotation.x = -Math.PI / 2; // the curve's axis along the track, its crown on top
      vault.position.y = -0.8;
      const holder = new THREE.Group();
      holder.add(vault);
      holder.position.set(c.x, METRO_Y + 0.5, c.z);
      holder.rotation.y = turn;
      scene.add(holder);
      holder.updateMatrix();
      // the station's steelwork, lamps and boards are merged in with the rest of the line
      const fixed = (geo, material, x, y, z, rz = 0, ry = 0) => {
        const local = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, ry, rz)).setPosition(x, y, z);
        batchGeometry(batch, material, geo, new THREE.Matrix4().multiplyMatrices(holder.matrix, local));
      };
      for (let d = -35; d <= 35; d += 7) {
        fixed(new THREE.TorusGeometry(11, 0.12, 6, 24, Math.PI * 0.64), steelMat, 0, -0.8, d, Math.PI * 0.18);
        for (const side of [-1, 1]) {
          fixed(new THREE.BoxGeometry(0.25, 5.8, 0.25), steelMat, side * 9.3, 2.3, d);
          fixed(new THREE.BoxGeometry(0.4, 0.12, 2.4), stationLamp, side * 5.6, 4.6, d); // lamps hung under the roof
        }
      }
      // name boards
      const board = new THREE.MeshLambertMaterial({
        map: canvasTexture(256, 64, (g, w, h) => {
          g.fillStyle = '#123f7a';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#fff';
          g.font = 'bold 34px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(`Ⓜ ${st.name}`, w / 2, h / 2 + 2);
        }),
      });
      for (const d of [-18, 18]) {
        for (const side of [-1, 1]) fixed(new THREE.PlaneGeometry(3.2, 0.8), board, side * 7.9, 3.4, d, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      // stairs from the street to each platform, at the station's ends
      for (const side of [-1, 1]) {
        const end = st.name === 'South' ? -1 : 1;
        const top = metroPoint(st.s + end * 24, side * 10.6);
        const foot = metroPoint(st.s + end * 24 - end * 19, side * 10.6);
        const base = groundAt(foot.x, foot.z, 1);
        const rise = METRO_Y + PLATFORM - base;
        const run = Math.hypot(top.x - foot.x, top.z - foot.z);
        const steps = 34;
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          const y = base + rise * ((k + 1) / steps);
          batchBox(batch, platformMat, foot.x + (top.x - foot.x) * t, y - 0.12, foot.z + (top.z - foot.z) * t, 2.4, 0.24, run / steps + 0.04, turn, 2);
        }
        const slope = Math.hypot(run, rise);
        batchMatrix.makeRotationFromEuler(new THREE.Euler(-end * Math.atan2(rise, run), turn, 0, 'YXZ'));
        batchMatrix.setPosition((foot.x + top.x) / 2, (base + METRO_Y + PLATFORM) / 2 - 0.45, (foot.z + top.z) / 2);
        batchGeometry(batch, pierMat, tileBoxFaces(new THREE.BoxGeometry(2.2, 0.45, slope), 2.2, 0.45, slope, 3), batchMatrix);
        for (const rail of [-1.15, 1.15]) {
          const [nx, nz] = [-Math.cos(turn), Math.sin(turn)];
          batchMatrix.setPosition((foot.x + top.x) / 2 + nx * rail, (base + METRO_Y + PLATFORM) / 2 + 0.9, (foot.z + top.z) / 2 + nz * rail);
          batchGeometry(batch, steelMat, new THREE.BoxGeometry(0.06, 0.06, slope), batchMatrix);
        }
        // the landing between the stairs and the platform
        const land = metroPoint(st.s + end * 26.5, side * 8.1);
        batchBox(batch, platformMat, land.x, METRO_Y + PLATFORM / 2, land.z, 7.4, PLATFORM + 0.3, 5, turn, 3);
        addSurface({ ax: foot.x, az: foot.z, bx: top.x, bz: top.z, ha: base, hb: METRO_Y + PLATFORM, half: 1.2 });
        addSurface({ ax: land.x - (top.x - foot.x) / run * 2.5, az: land.z - (top.z - foot.z) / run * 2.5, bx: land.x + (top.x - foot.x) / run * 2.5, bz: land.z + (top.z - foot.z) / run * 2.5, ha: METRO_Y + PLATFORM, hb: METRO_Y + PLATFORM, half: 3.7 });
        // a support under the stair's top
        batchBox(batch, pierMat, top.x, (base + METRO_Y) / 2, top.z, 1, METRO_Y - base, 1, turn, 3);
      }
    }
    flushBatch(batch);

    // --- the trains
    for (const [off, s, dir] of [[TRACK, STATIONS[0].s, 1], [-TRACK, STATIONS[2].s, -1]]) {
      const cars = [];
      for (let k = 0; k < 4; k++) cars.push(createMetroCar(k === 0, k === 3));
      trains.push({ off, s, dir, speed: 0, dwell: rand(4, 12), cars });
    }
    for (const train of trains) {
      for (const car2 of train.cars) {
        const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: METRO_Y - 0.5, maxY: METRO_Y + 4.3, car: { x: 0, z: 0, h: 0, hl: CAR_LENGTH / 2, hw: 1.5 } };
        car2.box = box;
        trainBoxes.push(box);
      }
    }
    void line;
  }
  const metroLamps = []; // materials lit after dark: station lamps, train windows

  // One car of a train: a white body with a blue stripe and a band of windows, rounded at
  // the roof, with a sloping cab at each end of the train. Faces +z.
  const trainLivery = (() => {
    const draw = (night) => canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = night ? '#000' : '#eef1f4';
      g.fillRect(0, 0, w, h);
      if (!night) {
        g.fillStyle = '#1f5fbf';
        g.fillRect(0, 92, w, 12);
        g.fillStyle = '#9fb7d8';
        g.fillRect(0, 106, w, 4);
      }
      // windows, with doors between them
      for (let x = 10; x < w; x += 128) {
        for (const [wx, ww] of [[0, 52], [64, 52]]) {
          if (night) {
            g.fillStyle = 'rgba(235,245,255,0.9)';
          } else {
            const glass = g.createLinearGradient(0, 30, 0, 74);
            glass.addColorStop(0, '#5d7387');
            glass.addColorStop(1, '#1b2632');
            g.fillStyle = glass;
          }
          g.fillRect(x + wx, 30, ww, 44);
        }
        // a door
        g.fillStyle = night ? 'rgba(200,215,230,0.5)' : '#c9ced4';
        g.fillRect(x + 118, 22, 2, 82);
      }
    });
    const material = new THREE.MeshPhongMaterial({ map: draw(false), emissiveMap: draw(true), emissive: 0x000000, shininess: 60, specular: 0x666666 });
    material.userData.glow = 0.9;
    litMaterials.push(material);
    return reflect(material, 0.15);
  })();
  const trainDark = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const trainWhite = reflect(new THREE.MeshPhongMaterial({ color: 0xeef1f4, shininess: 60, specular: 0x666666 }), 0.15);
  const trainHead = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
  const trainTail = new THREE.MeshBasicMaterial({ color: 0x5a0a0a });

  function createMetroCar(front, back) {
    const group = new THREE.Group();
    const w = 2.9;
    const h = 3.5;
    // the body's cross-section, rounded at the roof, extruded along the car
    const section = new THREE.Shape();
    section.moveTo(-w / 2, 0.4);
    section.lineTo(w / 2, 0.4);
    section.lineTo(w / 2, h - 0.7);
    section.quadraticCurveTo(w / 2, h, 0, h);
    section.quadraticCurveTo(-w / 2, h, -w / 2, h - 0.7);
    section.closePath();
    const body = new THREE.ExtrudeGeometry(section, { depth: CAR_LENGTH - 0.6, bevelEnabled: false, curveSegments: 6 });
    body.translate(0, PLATFORM - 0.4, -(CAR_LENGTH - 0.6) / 2);
    // stretch the livery along the sides: x across, y up → u along the car, v up
    const pos = body.attributes.position;
    const uv = body.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getZ(i) + CAR_LENGTH / 2) / CAR_LENGTH * 2, (pos.getY(i) - PLATFORM + 0.4) / h);
    const shell = new THREE.Mesh(body, trainLivery);
    shell.castShadow = true;
    group.add(shell);
    // under-frame and bogies
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.6, CAR_LENGTH - 1.2), trainDark);
    frame.position.y = PLATFORM - 0.5;
    group.add(frame);
    for (const z of [-CAR_LENGTH / 2 + 2.6, CAR_LENGTH / 2 - 2.6]) {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 2.8), trainDark);
      bogie.position.set(0, 0.45, z);
      group.add(bogie);
    }
    // the cab ends: a sloping nose with a dark windscreen and lamps
    const ends = [];
    for (const [is, dir] of [[front, 1], [back, -1]]) {
      if (!is) continue;
      const nose = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.6, 1.6), trainWhite);
      nose.position.set(0, PLATFORM + (h - 0.6) / 2 - 0.4, dir * (CAR_LENGTH / 2 - 0.2));
      nose.scale.set(1, 1, 1);
      group.add(nose);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 1.3), darkGlass);
      screen.position.set(0, PLATFORM + 2.0, dir * (CAR_LENGTH / 2 + 0.61));
      screen.rotation.set(dir > 0 ? -0.35 : 0.35, dir > 0 ? 0 : Math.PI, 0);
      group.add(screen);
      const lamps = [];
      for (const side of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.05), trainHead);
        lamp.position.set(side * 0.95, PLATFORM + 0.55, dir * (CAR_LENGTH / 2 + 0.62));
        group.add(lamp);
        lamps.push(lamp);
      }
      ends.push({ dir, lamps });
    }
    // a pantograph on the leading car
    if (front) {
      const pan = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), steelMat);
      pan.position.set(0, PLATFORM + h + 1.4, -2);
      group.add(pan);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), steelMat);
      arm.position.set(0, PLATFORM + h + 0.6, -2.3);
      arm.rotation.x = 0.4;
      group.add(arm);
    }
    scene.add(group);
    return { group, ends };
  }

  // Each train runs to the next station, waits there with its doors open, and turns round
  // at the end of the line.
  function updateTrains(dt) {
    for (const train of trains) {
      if (train.dwell > 0) {
        train.dwell -= dt;
        train.speed = 0;
      } else {
        // the next stop ahead in the direction of travel
        const ahead = STATIONS.map((st) => st.s).filter((s) => (s - train.s) * train.dir > 0.5);
        const stop = ahead.length ? (train.dir > 0 ? Math.min(...ahead) : Math.max(...ahead)) : null;
        const left = stop === null ? 0 : Math.abs(stop - train.s);
        const braking = (train.speed * train.speed) / (2 * 0.9);
        train.speed = left <= braking + 0.5 ? Math.max(0.6, Math.sqrt(2 * 0.9 * Math.max(0, left))) : Math.min(19, train.speed + 0.8 * dt);
        train.s += train.dir * train.speed * dt;
        if (stop === null || (stop - train.s) * train.dir <= 0.05) {
          if (stop !== null) train.s = stop;
          train.speed = 0;
          train.dwell = 16;
          // at the end of the line, set off back the other way
          if (!STATIONS.some((st) => (st.s - train.s) * train.dir > 0.5)) train.dir = -train.dir;
        }
      }
      const night = lampsOnNow > 0.5;
      train.cars.forEach((c, k) => {
        // the cars follow on behind the front, whichever way it is going
        const s = train.s - train.dir * (k - 1.5) * (CAR_LENGTH + 0.5);
        const p = metroPoint(s, train.off);
        c.group.position.set(p.x, METRO_Y, p.z);
        c.group.rotation.y = p.h;
        for (const end of c.ends) {
          const leading = end.dir * train.dir > 0;
          for (const lamp of end.lamps) lamp.material = leading ? trainHead : night ? trainTail : trainDark;
        }
        const box = c.box;
        Object.assign(box.car, { x: p.x, z: p.z, h: p.h });
        box.minX = p.x - 8;
        box.maxX = p.x + 8;
        box.minZ = p.z - 8;
        box.maxZ = p.z + 8;
      });
    }
  }
  let lampsOnNow = 0;

  // ---------- The mall ----------

  // A shopping centre out past the city's -x edge: a long two-storey block with a glass
  // entrance hall and a curved roof, shop signs along its front, loading bays behind, and
  // a big car park in front, reached along two streets from the city.
  const MALL = { minX: -490, maxX: -350, minZ: -10, maxZ: 70, h: 20 };
  const MALL_LOT = { minX: -497, maxX: -337, minZ: -208, maxZ: -26 };

  function buildMall() {
    const batch = makeBatch();
    const { minX, maxX, minZ, maxZ, h } = MALL;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const wallMat = cityMaterial('concrete', 0xe3dfd6);
    const bandMat = cityMaterial('concrete', 0xb9b4aa);
    const glass = FACADES.glass;
    const glassMat = glass.materials[1] || glass.materials[0];

    // walls: concrete, with a two-storey band of glass along the front
    batchWalls(batch, wallMat, footprintCorners(cx, cz, w, d), 0, h, 6);
    batchQuad(batch, glassMat, [[maxX - 2, 1, minZ - 0.05], [minX + 2, 1, minZ - 0.05], [minX + 2, 13, minZ - 0.05], [maxX - 2, 13, minZ - 0.05]],
      [[0, 0], [w / glass.tile, 0], [w / glass.tile, 12 / glass.tile], [0, 12 / glass.tile]]);
    for (const y of [0.9, 7, 13]) batchBox(batch, bandMat, cx, y, minZ - 0.3, w - 3, 0.6, 0.6, 0, 4);
    // the entrance hall: a tall glass box standing out from the middle of the front
    const hallW = 36;
    const hall = footprintCorners(cx, minZ - 6, hallW, 12);
    batchWalls(batch, glassMat, hall, 0, 17, glass.tile);
    batchLid(batch, roofConcrete, hall, 17.02);
    batchParapet(batch, hall, 17, 0.8);
    // a canopy over the doors
    batchBox(batch, bandMat, cx, 5.2, minZ - 14, hallW + 6, 0.5, 5, 0, 4);
    for (const ox of [-hallW / 2 - 2, hallW / 2 + 2]) batchBox(batch, darkMetal, cx + ox, 2.6, minZ - 15.8, 0.35, 5.2, 0.35, 0, 1);
    // roof: flat, with a long glass vault down the middle
    batchLid(batch, roofConcrete, footprintCorners(cx, cz, w, d), h + 0.02);
    batchParapet(batch, footprintCorners(cx, cz, w, d), h, 1.2);
    batchRoofPlant(batch, cx - 45, cz, 30, 50, h, false);
    batchRoofPlant(batch, cx + 45, cz, 30, 50, h, false);
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, w - 30, 24, 1, true, -Math.PI * 0.4, Math.PI * 0.8), reflect(new THREE.MeshPhongMaterial({
      color: 0x86a9c6, transparent: true, opacity: 0.6, shininess: 100, specular: 0xaabbcc, side: THREE.DoubleSide, depthWrite: false,
    }), 0.5));
    vault.rotation.z = Math.PI / 2;
    vault.position.set(cx, h - 5, cz);
    scene.add(vault);
    // loading bays at the back
    for (let x = minX + 20; x < maxX - 20; x += 14) {
      batchQuad(batch, rollerMat, [[x, 0, maxZ + 0.03], [x + 6, 0, maxZ + 0.03], [x + 6, 5.5, maxZ + 0.03], [x, 5.5, maxZ + 0.03]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }

    // signs: the mall's name over the entrance, and shop names along the front, lit at night
    const signs = ['CITY MALL', 'FASHION', 'CINEMA', 'FOOD HALL', 'SPORTS', 'HOME & GARDEN', 'ELECTRONICS', 'BOOKSHOP'];
    const signMat = (() => {
      const draw = (night) => canvasTexture(512, 512, (g, sw, sh) => {
        signs.forEach((text, n) => {
          const y0 = n * 64;
          g.fillStyle = night ? '#000' : n ? '#2b2f36' : '#f4f1ea';
          g.fillRect(0, y0, sw, 64);
          g.fillStyle = night ? (n ? '#ffe9c4' : '#fff6e6') : n ? '#f2ede2' : '#b3261e';
          g.font = `bold ${n ? 40 : 50}px Georgia, serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(text, sw / 2, y0 + 34);
        });
      });
      const material = new THREE.MeshPhongMaterial({ map: draw(false), emissiveMap: draw(true), emissive: 0x000000 });
      material.userData.glow = 1.1;
      litMaterials.push(material);
      return material;
    })();
    const sign = (n, x, y, z, sw, sh) => {
      const v0 = 1 - (n + 1) / 8;
      batchQuad(batch, signMat, [[x + sw / 2, y, z], [x - sw / 2, y, z], [x - sw / 2, y + sh, z], [x + sw / 2, y + sh, z]],
        [[0, v0], [1, v0], [1, v0 + 1 / 8], [0, v0 + 1 / 8]]);
    };
    sign(0, cx, 17.6, minZ - 12.1, 30, 3.75);
    [-58, -36, 36, 58].forEach((ox, k) => sign(k + 1, cx + ox, 14.2, minZ - 0.4, 16, 2));

    addCollider({ minX, maxX, minZ, maxZ, maxY: h });
    addCollider({ minX: cx - hallW / 2, maxX: cx + hallW / 2, minZ: minZ - 12, maxZ: minZ, maxY: 17 });
    addSurface({ minX, maxX, minZ, maxZ, h0: h, h1: h });
    addSurface({ minX: cx - hallW / 2, maxX: cx + hallW / 2, minZ: minZ - 12, maxZ: minZ, h0: 17, h1: 17 });

    // --- forecourt: a paved walk along the front, with trees and benches
    const fore = { minZ: MALL_LOT.maxZ, maxZ: minZ };
    underfoot(flatPlane(w + 20, fore.maxZ - fore.minZ + 14, GROUND.paving[0], cx, (fore.minZ + fore.maxZ) / 2 + 7, 0.07, ...GROUND.paving.slice(1))).userData.snow = 'ground';
    for (let x = minX + 6; x < maxX; x += 16) {
      if (Math.abs(x - cx) < hallW / 2 + 4) continue;
      addTree(x, fore.minZ + 6);
    }

    // --- the car park: rows of bays both sides of each aisle, lamps down the middle
    const lot = MALL_LOT;
    const lotW = lot.maxX - lot.minX;
    const lotD = lot.maxZ - lot.minZ;
    underfoot(flatPlane(lotW, lotD, GROUND.tarmac[0], (lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, 0.06, ...GROUND.tarmac.slice(1)));
    for (let z = lot.maxZ - 16; z > lot.minZ + 10; z -= 26) {
      for (const half of [-1, 1]) {
        const x0 = half < 0 ? lot.minX + 8 : (lot.minX + lot.maxX) / 2 + 5;
        const count = 20;
        const mid = x0 + (count * BAY_W) / 2;
        addBayRow(mid, z - 3.1, count);
        addBayRow(mid, z + 3.1, count);
        marks.push({ x: mid, z, sx: count * BAY_W, sz: 0.15 });
        // islands with a tree at each end of the double row
        for (const end of [-1, 1]) {
          const ix = mid + end * ((count * BAY_W) / 2 + 2);
          batchBox(batch, kerbMat, ix, 0.12, z, 3, 0.24, 11.5, 0, 2);
          addTree(ix, z);
        }
      }
      for (let x = lot.minX + 30; x < lot.maxX - 10; x += 34) lampSpots.push({ x, y: 0.06, z, turn: 0, tall: true, both: true });
    }
    // the lot's edge: a kerb with a gap at each entrance
    const edge = (x0, z0, x1, z1) => {
      batchBox(batch, kerbMat, (x0 + x1) / 2, 0.12, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.3, 0.24, Math.abs(z1 - z0) + 0.3, 0, 2);
      addCollider({ minX: Math.min(x0, x1) - 0.15, maxX: Math.max(x0, x1) + 0.15, minZ: Math.min(z0, z1) - 0.15, maxZ: Math.max(z0, z1) + 0.15, maxY: 0.24, top: 0.24 });
    };
    edge(lot.minX, lot.minZ, lot.maxX, lot.minZ);
    edge(lot.minX, lot.minZ, lot.minX, lot.maxZ);
    edge(lot.maxX, lot.minZ, lot.maxX, -198);
    edge(lot.maxX, -182, lot.maxX, -46);
    flushBatch(batch);
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

  function stampFootprint(strength, snow = false) {
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
    print.mesh.position.set(car.x + Math.cos(hero.facing) * side, car.y + (car.y < 0.05 ? 0.005 : 0.014), car.z - Math.sin(hero.facing) * side);
    print.mesh.rotation.y = hero.facing;
    print.mesh.scale.x = hero.foot;
    print.mesh.visible = true;
    print.strength = 0.8 * strength;
    print.life = snow ? 90 : 14;
    print.snow = snow;
    print.mesh.material.color.setHex(snow ? 0x7c8796 : 0x0f1317); // pressed snow is blue-grey
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
    const snowy = env.snowCover > 0.15 && car.y < 1 && coverAt(car.x, car.z) < car.y + 1.5;
    if (snowy) {
      stampFootprint(0.45 + 0.4 * env.snowCover, true);
    } else if (soaked > 0.08) {
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
      // on wet ground they stay until it dries, in snow until it melts
      print.life -= dt * (print.snow ? (env.snowCover > 0.1 ? 0.05 : 1) : env.wet > 0.08 ? 0.3 : 1);
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
      45, 0.0025, [1, 6], () => [rand(1.6, 3.4), rand(2.5, 7)], 0.1
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
    roadDecals(decal(crack), 70, 0.003, [0.8, 7], () => [rand(0.8, 1.4), rand(3, 7), rand(-0.5, 0.5)], 0.2);

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
    potholes = roadDecals(decal(pothole), 40, 0.0035, [1, 6.6], () => {
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
    puddles = roadDecals(water, 70, 0.004, [3.5, 7.2], () => [rand(1.4, 3), rand(2, 5.5), rand(-0.3, 0.3)], 0.4);

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
    roadDecals(decal(cover), 60, 0.0045, [1.5, 6.5], () => [0.85, 0.85, rand(0, 3)], 0.5);

    // --- storm drains along the kerbs
    const grate = canvasTexture(128, 64, (g, w, h) => {
      g.fillStyle = '#3c3e42';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0c0d0e';
      for (let x = 10; x < w - 8; x += 14) g.fillRect(x, 8, 7, h - 16);
    });
    roadDecals(new THREE.MeshLambertMaterial({ map: grate, depthWrite: false }), 110, 0.0045,
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
    place(1, roadCenter(1), HALF - 60, hills, 2.6, 1, 4.2);
    place(1, roadCenter(1), roadCenter(3) + JUNCTION + 14, hills, 2.6, 1, 4.2);

    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), steelMat, signs.length);
    const dummy = new THREE.Object3D();
    const plate = new THREE.PlaneGeometry(1, 1);
    const boards = new Map(); // material -> matrices: every board of a kind is one instanced mesh
    signs.forEach((sign, n) => {
      const y = groundAt(sign.x, sign.z, 1);
      addPost(sign.x, sign.z, 0.09, y, sign.top);
      dummy.position.set(sign.x, y + sign.top / 2, sign.z);
      dummy.scale.set(1, sign.top, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(n, dummy.matrix);
      for (const [material, turn, gap] of [[sign.material.front, sign.turn, 0.062], [sign.material.back, sign.turn + Math.PI, 0.056]]) {
        dummy.scale.set(sign.width, sign.height, 1);
        dummy.position.set(sign.x + Math.sin(sign.turn) * gap, y + sign.top - sign.height / 2, sign.z + Math.cos(sign.turn) * gap);
        dummy.rotation.set(0, turn, 0);
        dummy.updateMatrix();
        if (!boards.has(material)) boards.set(material, []);
        boards.get(material).push(dummy.matrix.clone());
      }
    });
    for (const [material, list] of boards) {
      const mesh = new THREE.InstancedMesh(plate, material, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      scene.add(mesh);
    }
    scene.add(poles);
  }

  // Takes one all-round picture of the city from above a crossing and hands it to every
  // shiny material as its reflection. It is a still, so reflections do not move with you,
  // but paint, glass and puddles pick up the sky and the buildings.
  // A second picture is taken the first time night falls, with every window and lamp lit,
  // and swapped in after dark, so wet streets and glass mirror the city's lights.
  let reflectionNight = null;
  let reflectionNow = null;
  function useReflection(texture) {
    if (!texture || texture === reflectionNow) return;
    reflectionNow = texture;
    for (const material of reflective) material.envMap = texture;
  }

  function captureReflections(night = false) {
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
    if (night) {
      reflectionNight = target.texture;
      return;
    }
    reflection = target.texture;
    for (const material of reflective) {
      material.envMap = reflection;
      material.needsUpdate = true;
    }
    reflectionNow = reflection;
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

  // --- the bus and the truck: loaded models ---

  // A city bus and a DAF CF tractor unit (vehicle-models.js, made by vehicle-model-build.mjs),
  // each already in the game's frame: metres, facing +z with its left toward +x, wheels on
  // the ground. Every part is named "role|name": wheels to spin (the front pair steer as
  // well), the driver's door to swing, lamps to light. The rest is merged by material, so a
  // whole bus is a couple of dozen draw calls. Materials become plain lit ones that keep the
  // model's own pictures; the glass is properly clear (you sit behind it); and each vehicle
  // has its own paint and livery, to tint and, if it burns, to char.
  const VEHICLE_MODELS = {
    bus: {
      source: 'BUS_GLB',
      paint: ['standard'], // its white sides
      livery: { standard21: 1, standard111: 0.78, standard2: 'light' }, // roof, lower band, upper band
      glass: ['glass'],
      chrome: ['chrome', 'standard11111', 'metall'],
      inside: ['seat', 'light', 'wood'],
      // lamp glows [x, y, z, width, height], mirrored for the other side
      glows: {
        head: [0.81, 0.77, 5.515, 0.36, 0.15],
        tail: [0.84, 0.93, -5.46, 0.15, 0.12],
        amberRear: [0.84, 0.8, -5.46, 0.15, 0.09],
        amberFront: [1.1, 1.08, 5.4, 0.04, 0.1],
      },
      seat: [3.95, 0.6], eye: 1.9, roof: 2.72, stats: { top: 24, nitroTop: 32, engine: 6, nitroEngine: 12, brake: 22, grip: 14 },
    },
    truck: {
      source: 'TRUCK_GLB',
      paint: ['Cr_Exterieur'], // the cab, white under its tint
      glass: ['Vitre'],
      chrome: ['Retro'],
      inside: ['Interieur_2', 'Interieur_3', 'Interieur_4', 'Sige', 'Cr_Interieur'],
      seat: [1.82, 0.58], eye: 2.36, roof: 3.0, stats: { top: 28, nitroTop: 36, engine: 8, nitroEngine: 15, brake: 25, grip: 15 },
    },
  };
  const vehicleTemplates = {};
  const modelGlass = reflect(new THREE.MeshPhongMaterial({
    color: 0x9db2c4, transparent: true, opacity: 0.16, shininess: 110, specular: 0xb8c8d8, depthWrite: false, side: THREE.DoubleSide,
  }), 0.22);

  // Joins geometries (position, normal, uv) into one indexed geometry.
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
    // element by element: the loader may hand over interleaved attributes
    const copy = (attribute, out, at, size) => {
      if (!attribute) return;
      for (let k = 0; k < attribute.count; k++) {
        out[(at + k) * size] = attribute.getX(k);
        out[(at + k) * size + 1] = attribute.getY(k);
        if (size === 3) out[(at + k) * size + 2] = attribute.getZ(k);
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

  // The triangles of `geo` whose middles pass `keep(x, y, z)`, as a geometry of their own.
  function pickTriangles(geo, keep) {
    const p = geo.attributes.position;
    const source = geo.index ? geo.index.array : Array.from({ length: p.count }, (_, k) => k);
    const kept = [];
    for (let t = 0; t < source.length; t += 3) {
      const [a, b, c] = [source[t], source[t + 1], source[t + 2]];
      if (keep((p.getX(a) + p.getX(b) + p.getX(c)) / 3, (p.getY(a) + p.getY(b) + p.getY(c)) / 3, (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3)) kept.push(a, b, c);
    }
    const out = geo.clone();
    out.setIndex(kept);
    return out;
  }

  function loadVehicleModels(done) {
    const kinds = Object.keys(VEHICLE_MODELS).filter((kind) => window[VEHICLE_MODELS[kind].source]);
    if (!THREE.GLTFLoader || !kinds.length) {
      done();
      return;
    }
    let left = kinds.length;
    const finished = () => {
      left -= 1;
      if (!left) done();
    };
    for (const kind of kinds) {
      const text = atob(window[VEHICLE_MODELS[kind].source]);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      new THREE.GLTFLoader().parse(bytes.buffer, '', (gltf) => {
        vehicleTemplates[kind] = prepareVehicle(kind, gltf.scene);
        finished();
      }, (error) => {
        console.warn(`The ${kind} model failed to load; using the built one.`, error);
        finished();
      });
    }
  }

  // Sorts a loaded vehicle into what each copy of it needs.
  function prepareVehicle(kind, root) {
    const spec = VEHICLE_MODELS[kind];
    root.updateMatrixWorld(true);
    const materials = {}; // name -> the plain material copies are made from
    const roles = {}; // role -> [{ geometry, name }]
    root.traverse((o) => {
      if (!o.isMesh) return;
      let named = o;
      while (named && !named.name.includes('|')) named = named.parent;
      const role = named ? named.name.split('|')[0] : 'part';
      const source = o.material;
      const name = source.name;
      if (!materials[name]) {
        if (source.map) source.map.encoding = THREE.LinearEncoding; // the scene's other pictures are linear too
        const shiny = spec.chrome.includes(name);
        const material = new THREE.MeshPhongMaterial({
          color: source.color, map: source.map, side: THREE.DoubleSide,
          shininess: shiny ? 110 : spec.paint.includes(name) ? 70 : 18, specular: shiny ? 0xdddddd : spec.paint.includes(name) ? 0x666666 : 0x151515,
          transparent: source.transparent && !spec.glass.includes(name), opacity: source.opacity, alphaTest: source.alphaTest,
        });
        if (spec.inside.includes(name)) material.userData.noSnow = true;
        materials[name] = { material, reflect: shiny ? 0.45 : spec.paint.includes(name) ? 0.18 : 0 };
      }
      roles[role] = roles[role] || [];
      roles[role].push({ geometry: joinGeometries([o.geometry]).applyMatrix4(o.matrixWorld), name });
    });

    // the body: one mesh per material
    const byMaterial = new Map();
    for (const part of [...(roles.part || []), ...(roles.door_r || []), ...(roles.lamp_tail || [])]) {
      if (!byMaterial.has(part.name)) byMaterial.set(part.name, []);
      byMaterial.get(part.name).push(part.geometry);
    }
    const chunks = [...byMaterial].map(([name, list]) => ({ name, geometry: joinGeometries(list) }));

    // wheels round their own middles: the front pair each on its own, the back axle as one
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    const wheels = {};
    for (const role of ['wheel_fl', 'wheel_fr', 'wheel_r']) {
      const list = roles[role] || [];
      box.makeEmpty();
      for (const part of list) box.expandByObject(new THREE.Mesh(part.geometry));
      box.getCenter(centre);
      if (role === 'wheel_r') centre.x = 0;
      // one mesh per material: tyres together, rims together
      const same = new Map();
      for (const part of list) {
        if (!same.has(part.name)) same.set(part.name, []);
        same.get(part.name).push(part.geometry.translate(-centre.x, -centre.y, -centre.z));
      }
      wheels[role] = {
        at: centre.clone(),
        radius: (box.max.y - box.min.y) / 2,
        parts: [...same].map(([name, geometries]) => ({ name, geometry: joinGeometries(geometries) })),
      };
    }

    // the driver's door hangs on its front edge
    let door = null;
    if (roles.door_l) {
      box.makeEmpty();
      for (const part of roles.door_l) box.expandByObject(new THREE.Mesh(part.geometry));
      const hinge = new THREE.Vector3(box.max.x - 0.03, 0, box.max.z - 0.04);
      door = { at: hinge, parts: roles.door_l.map((part) => ({ name: part.name, geometry: part.geometry.translate(-hinge.x, 0, -hinge.z) })) };
    }

    // the lamp lenses: those at the front are the headlamps, those at the back the tail lamps
    let lamps = null;
    if (roles.lamps) {
      const lens = roles.lamps[0];
      const front = pickTriangles(lens.geometry, (x, y, z) => z > 0);
      const back = pickTriangles(lens.geometry, (x, y, z) => z < 0);
      front.computeBoundingBox();
      lamps = { name: lens.name, front, back, frontBox: front.boundingBox.clone() };
    }

    const all = new THREE.Box3().setFromObject(root);
    const wb = wheels.wheel_fl.at.z - wheels.wheel_r.at.z;
    return {
      materials, chunks, wheels, door, lamps,
      dims: { hl: (all.max.z - all.min.z) / 2, hw: Math.min(1.3, (all.max.x - all.min.x) / 2 - 0.1), wb },
    };
  }

  // A glow on a lamp: a small flat shape that adds its light, set each frame from the stand-in
  // the lighting code works through (see lampMaterial) by `bright`.
  function lampGlow(w, h, x, y, z, back, standIn, bright) {
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    glow.position.set(x, y, z);
    if (back) glow.rotation.y = Math.PI;
    glow.renderOrder = 3;
    glow.onBeforeRender = () => bright(standIn.color, material.color);
    return glow;
  }
  // how the stand-ins' colours turn to light: headlamps are dark by day and white at night
  // (or when you switch them on), tail lamps glow faintly and flare when braking, and
  // indicators blink
  const headGlow = (c, out) => out.setRGB(1, 0.95, 0.82).multiplyScalar(Math.max(0, Math.min(1, (c.r - 0.74) / 0.25)));
  const tailGlow = (c, out) => out.setRGB(c.r, c.g * 0.6, c.b * 0.6).multiplyScalar(c.r > 0.7 ? 1 : 0.35);
  const amberGlow = (c, out) => out.setRGB(1, 0.6, 0.1).multiplyScalar(c.r > 0.6 ? 1 : 0);

  function createModelVehicle(color, kind) {
    const t = vehicleTemplates[kind];
    const spec = VEHICLE_MODELS[kind];
    const group = new THREE.Group();
    const detail = new THREE.Group(); // inside, and small: dropped far off (see updateVehicleDetail)
    group.add(detail);

    // this vehicle's own copy of each material, to tint and to char
    const own = new Map();
    const mine = (name) => {
      if (!own.has(name)) {
        const base = t.materials[name];
        const copy = base.material.clone();
        if (base.reflect) reflect(copy, base.reflect);
        own.set(name, copy);
      }
      return own.get(name);
    };
    const paint = mine(spec.paint[0]);
    if (kind === 'truck') paint.color.setHex(color); // the cab: white, so it takes the tint
    if (spec.livery && color !== BUS_COLORS[0]) {
      // the bands and roof in this bus company's colours (the first colour keeps the red and orange)
      const tint = new THREE.Color(color);
      for (const [name, how] of Object.entries(spec.livery)) {
        const c = mine(name).color;
        if (how === 'light') c.copy(tint).lerp(new THREE.Color(0xffffff), 0.45);
        else c.copy(tint).multiplyScalar(how);
      }
    }

    const meshFor = (geometry, name, parent) => {
      const glass = spec.glass.includes(name);
      const mesh = new THREE.Mesh(geometry, glass ? modelGlass : mine(name));
      if (glass) mesh.renderOrder = 2;
      else mesh.castShadow = !spec.inside.includes(name);
      parent.add(mesh);
      return mesh;
    };
    const deform = [];
    const glassParts = [];
    for (const chunk of t.chunks) {
      const mesh = meshFor(chunk.geometry, chunk.name, spec.inside.includes(chunk.name) ? detail : group);
      if (spec.paint.includes(chunk.name) || (spec.livery && chunk.name in spec.livery)) deform.push(mesh);
      if (spec.glass.includes(chunk.name)) glassParts.push(mesh);
    }

    // wheels
    const wheels = [];
    const frontPivots = [];
    for (const role of ['wheel_fl', 'wheel_fr', 'wheel_r']) {
      const w = t.wheels[role];
      const wheel = new THREE.Group();
      for (const part of w.parts) meshFor(part.geometry, part.name, wheel);
      if (role === 'wheel_r') {
        wheel.position.copy(w.at);
        group.add(wheel);
      } else {
        const pivot = new THREE.Group();
        pivot.position.copy(w.at);
        pivot.add(wheel);
        group.add(pivot);
        frontPivots.push(pivot);
      }
      wheels.push(wheel);
    }

    // the driver's door
    let door = null;
    if (t.door) {
      door = new THREE.Group();
      door.position.copy(t.door.at);
      for (const part of t.door.parts) {
        const mesh = meshFor(part.geometry, part.name, door);
        if (spec.glass.includes(part.name)) glassParts.push(mesh);
        else if (spec.paint.includes(part.name)) deform.push(mesh);
      }
      group.add(door);
    }

    // lamps, worked through stand-ins like every other vehicle's
    const headMat = { color: new THREE.Color(headlightMat.color.getHex()), userData: {} };
    const tailMat = { color: new THREE.Color(tailIdle), userData: {} };
    const amberL = { color: new THREE.Color(AMBER_OFF), userData: {} };
    const amberR = { color: new THREE.Color(AMBER_OFF), userData: {} };
    headMats.push(headMat);
    if (t.lamps) {
      // the model's own lenses, lit from within
      for (const [geometry, standIn, bright] of [[t.lamps.front, headMat, headGlow], [t.lamps.back, tailMat, tailGlow]]) {
        const lens = mine(t.lamps.name).clone();
        lens.emissive = new THREE.Color(0);
        own.set(`lens ${standIn === headMat ? 'front' : 'back'}`, lens); // scorched with the rest if it burns
        const mesh = new THREE.Mesh(geometry, lens);
        mesh.onBeforeRender = () => bright(standIn.color, lens.emissive);
        group.add(mesh);
      }
      const b = t.lamps.frontBox;
      for (const side of [1, -1]) group.add(lampGlow(0.1, 0.09, side * (b.max.x - 0.07), (b.min.y + b.max.y) / 2, b.max.z + 0.012, false, side > 0 ? amberL : amberR, amberGlow));
      for (const side of [1, -1]) group.add(lampGlow(0.12, 0.1, side * 0.95, 0.72, -t.dims.hl + 0.06, true, side > 0 ? amberL : amberR, amberGlow));
    }
    if (spec.glows) {
      const add = ([x, y, z, w, h], standIn, bright, both = true) => {
        for (const side of both ? [1, -1] : [1]) {
          const which = typeof standIn === 'function' ? standIn(side) : standIn;
          group.add(lampGlow(w, h, side * x, y, z, z < 0, which, bright));
        }
      };
      add(spec.glows.head, headMat, headGlow);
      add(spec.glows.tail, tailMat, tailGlow);
      add(spec.glows.amberFront, (side) => (side > 0 ? amberL : amberR), amberGlow);
      add(spec.glows.amberRear, (side) => (side > 0 ? amberL : amberR), amberGlow);
    }

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.6, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.85 })
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0.6, 0.5, -t.dims.hl - 0.75);
    flame.visible = false;
    group.add(flame);

    scene.add(group);
    return {
      steeringWheel: new THREE.Group(), // the model's own wheel is part of its dashboard
      group, detail, wheels, frontPivots, tailMat, headMat, amberL, amberR, flame, kind, paint, door, deform, glassParts,
      dims: { ...t.dims }, stats: { ...spec.stats, eye: spec.eye }, seat: spec.seat, seatY: spec.eye - 0.76, roof: spec.roof,
      spin: 1, steerAxis: 'z', steerTurn: 1,
      // you sit in the real cab: nothing to add for the inside view, nothing to hide
      interior: new THREE.Group(), interiorAlways: true, cabin: new THREE.Group(),
      materials: [...own.values()], // everything of its own, charred if it burns
      model: true,
    };
  }

  // --- built vehicles: saloon, hatchback, SUV, pickup, bus, box truck and motorbike ---

  // A car's body is a smooth surface swept along its length. At each point along the car
  // its cross-section is a rounded box: from the sill to the top of the bonnet, boot or
  // waistline, its width eased in toward the nose and tail so the corners are rounded in
  // plan, and pinched up over each wheel to make the arches. The glasshouse on top is a
  // second, narrower sweep from the windscreen's foot to the rear window's. Paint, glass,
  // pillars, shut lines, trim and lamps are all patches of those two surfaces, or small
  // parts set onto them, built once for each kind and shared by every car of that kind.
  //
  // Lengths are metres; z runs forward from the middle of the car, x to its left.
  const KINDS = {
    sedan: {
      len: 4.78, width: 1.84, wb: 2.8, r: 0.33, clear: 0.17, nose: 0.68, hood: 0.94, belt: 0.99, deck: 1.02, tail: 0.92,
      hoodLen: 1.42, shield: 0.82, roofLen: 1.02, rearGlass: 0.66, roof: 1.45, roofW: 0.62, beltW: 0.75, quarter: 0.3,
      doors: 4, seat: [0.02, 0.38], seatY: 0.44, eye: 1.2,
      stats: { top: 40, nitroTop: 58, engine: 15, nitroEngine: 32, brake: 34, grip: 18 },
    },
    hatch: {
      len: 4.1, width: 1.78, wb: 2.56, r: 0.31, clear: 0.16, nose: 0.7, hood: 0.92, belt: 0.98, deck: 1.0, tail: 0.99,
      hoodLen: 1.12, shield: 0.8, roofLen: 1.45, rearGlass: 0.34, roof: 1.48, roofW: 0.62, beltW: 0.73, quarter: 0.16,
      doors: 4, seat: [0.0, 0.37], seatY: 0.46, eye: 1.24,
      stats: { top: 37, nitroTop: 54, engine: 14, nitroEngine: 30, brake: 34, grip: 18 },
    },
    suv: {
      len: 4.78, width: 1.94, wb: 2.86, r: 0.38, clear: 0.24, nose: 0.9, hood: 1.11, belt: 1.17, deck: 1.19, tail: 1.17,
      hoodLen: 1.28, shield: 0.8, roofLen: 1.98, rearGlass: 0.3, roof: 1.76, roofW: 0.72, beltW: 0.8, quarter: 0.2,
      doors: 4, rails: true, seat: [0.1, 0.42], seatY: 0.64, eye: 1.48,
      stats: { top: 36, nitroTop: 52, engine: 13, nitroEngine: 28, brake: 31, grip: 16 },
    },
    pickup: {
      len: 5.36, width: 1.98, wb: 3.4, r: 0.39, clear: 0.26, nose: 0.96, hood: 1.15, belt: 1.21, deck: 1.21, tail: 1.18,
      hoodLen: 1.36, shield: 0.72, roofLen: 1.0, rearGlass: 0.06, roof: 1.84, roofW: 0.74, beltW: 0.81, quarter: 0.05,
      doors: 4, bed: true, seat: [0.5, 0.42], seatY: 0.68, eye: 1.52,
      stats: { top: 34, nitroTop: 50, engine: 12, nitroEngine: 26, brake: 29, grip: 15 },
    },
    bus: {
      len: 11, width: 2.55, wb: 5.9, r: 0.5, clear: 0.34, roof: 3.12, bus: true, front: 2.45,
      seat: [4.45, 0.72], seatY: 1.2, eye: 2.1,
      stats: { top: 24, nitroTop: 32, engine: 6, nitroEngine: 12, brake: 22, grip: 14 },
    },
    truck: {
      len: 7.4, width: 2.42, wb: 4.3, r: 0.48, clear: 0.42, roof: 3.55, truck: true, front: 1.45,
      seat: [2.75, 0.55], seatY: 1.35, eye: 2.25,
      stats: { top: 27, nitroTop: 36, engine: 7, nitroEngine: 14, brake: 24, grip: 14 },
    },
    moto: {
      len: 2.1, width: 0.8, wb: 1.44, r: 0.32, moto: true,
      seat: [-0.3, 0], seatY: 0.86, eye: 1.5,
      stats: { top: 46, nitroTop: 66, engine: 22, nitroEngine: 40, brake: 32, grip: 20 },
    },
  };
  const TRAFFIC_COLORS = [0xf2f2f2, 0xd9dcdf, 0x1d1f24, 0x2b2f38, 0x8b9096, 0x9aa0a8, 0x1f3f7a, 0x7a1d1d, 0x2f5d44, 0xb8a27a, 0x5a6b7d, 0x3c4e63, 0x9a2f2f];
  const BUS_COLORS = [0xd8dde2, 0x1f5fbf, 0xc0392b, 0x2c8a57];
  const TRUCK_COLORS = [0xf2f2f2, 0xe6e1d3, 0x2b5d8a, 0xb03a2e];
  const cabinGlass = reflect(new THREE.MeshPhongMaterial({
    color: 0x1f2b38, transparent: true, opacity: 0.62, shininess: 110, specular: 0xb0c4d8, depthWrite: false,
  }), 0.45);
  const darkGlass = reflect(new THREE.MeshPhongMaterial({ color: 0x18222d, shininess: 100, specular: 0x9fb4c8 }), 0.45);
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x24262b });
  seatMat.userData.noSnow = true; // inside the car
  const bedMat = new THREE.MeshLambertMaterial({ color: 0x1a1b1e });
  const steeringGeo = new THREE.TorusGeometry(0.17, 0.022, 8, 20);
  // black plastic, rubber, chrome, number plates, grilles: one material, coloured per corner
  const trimMat = reflect(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x555555, side: THREE.DoubleSide }), 0.25);
  const wheelMat2 = reflect(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, specular: 0x666666, side: THREE.DoubleSide }), 0.3);
  const TRIM = { black: 0x141517, plastic: 0x23252a, chrome: 0xd6dade, plate: 0xeeeeea, grille: 0x0c0d0f, liner: 0x0a0a0b, steel: 0x6d7177, red: 0xa01818 };

  for (const kind of Object.values(KINDS)) {
    kind.dims = { hl: kind.len / 2, hw: kind.width / 2, wb: kind.wb };
    kind.stats.eye = kind.eye;
  }

  // --- shaping ---

  const smoothBetween = (a, b, v) => smooth((v - a) / (b - a));

  // Where the stations of a car's shape lie along it, and its outline from the side.
  function carProfile(k) {
    const zF = k.len / 2;
    const zT = -k.len / 2;
    const zA = zF - k.hoodLen; // foot of the windscreen
    const zR1 = zA - k.shield; // top of the windscreen
    const zR2 = zR1 - k.roofLen; // top of the rear window
    const zC = zR2 - k.rearGlass; // foot of the rear window
    const zB = zA - (zA - zC) * (k.doors === 4 ? 0.47 : 0.62); // the pillar between the doors
    const wheelZ = [k.wb / 2, -k.wb / 2];
    // the top of the lower body: bumper up to bonnet, waistline, boot lid down to the tail
    const top = (z) => {
      if (z > zA) {
        const bonnet = k.hood + (k.belt - k.hood) * smooth((zF - 0.4 - z) / (k.hoodLen - 0.4));
        return k.nose + (bonnet - k.nose) * smoothBetween(zF, zF - 0.42, z);
      }
      if (z > zC) return k.belt + (k.deck - k.belt) * (zA - z) / (zA - zC);
      return k.tail + (k.deck - k.tail) * smoothBetween(zT, Math.min(zC, zT + 0.45), z);
    };
    // the bottom: the sill, lifted toward the bumpers and arched over each wheel
    const arch = k.r + 0.07;
    const bottom = (z) => {
      let y = k.clear + 0.13 * smoothBetween(k.len / 2 - 0.55, k.len / 2, Math.abs(z));
      for (const wz of wheelZ) {
        const d = z - wz;
        if (Math.abs(d) < arch) y = Math.max(y, k.r + Math.sqrt(arch * arch - d * d) * 0.97);
      }
      return y;
    };
    // the glasshouse: the windscreen rising to the roof, the roof, the rear window falling to the boot
    const roofAt = (z) => {
      if (z >= zA || z <= zC) return null;
      const crown = k.roof + 0.018 * (1 - ((z - (zR1 + zR2) / 2) / (k.roofLen / 2 + 0.01)) ** 2);
      if (z > zR1) {
        const t = (zA - z) / k.shield;
        return top(z) + (crown - top(z)) * (1 - (1 - t) ** 1.6);
      }
      if (z < zR2) {
        const t = (z - zC) / Math.max(0.05, k.rearGlass);
        return top(z) + (crown - top(z)) * (1 - (1 - t) ** 1.4);
      }
      return crown;
    };
    // half the width at z, rounded off toward each end in plan
    const half = (z, w) => {
      const u = Math.min(1, Math.abs(z) / (k.len / 2));
      const e = z > 0 ? 7 : 8;
      return w * Math.pow(Math.max(0, 1 - Math.pow(u, e)), 1 / e);
    };
    return { k, zF, zT, zA, zR1, zR2, zC, zB, wheelZ, top, bottom, roofAt, half };
  }

  // A point on the lower body at (z, t): t runs from the middle of the underside (0) out
  // round the sill (0.12-0.2), up the side (0.2-0.7), over the shoulder (0.7-0.85) and in
  // across the bonnet, waist or boot to the middle of the top (1). Returns [x, y] on the
  // left side. `n` gives the boxy, evenly rounded section used for buses and trucks.
  function lowerPoint(p, z, t, n = 0) {
    const y0 = p.bottom(z);
    const y1 = p.top(z);
    const w = p.half(z, p.k.width / 2);
    if (n) {
      const phi = -Math.PI / 2 + Math.PI * t;
      const c = Math.max(0, Math.cos(phi));
      const s = Math.sin(phi);
      const x = w * Math.pow(c, 2 / n) * (1 - 0.03 * Math.max(0, s) ** 1.5);
      return [x, (y0 + y1) / 2 + ((y1 - y0) / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
    }
    const h = Math.max(0.01, y1 - y0);
    const rb = Math.min(0.08, h * 0.3, w * 0.45);
    // the shoulder keeps its size over the wheel arches, where the side is cut short
    const rs = Math.max(0.01, Math.min(0.12, (y1 - p.k.clear) * 0.38, w * 0.5, h - rb - 0.01));
    const lean = Math.min(0.045, w * 0.08); // the sides lean in a little toward the top
    const crown = Math.min(0.03, h * 0.1);
    if (t < 0.12) return [(w - rb) * (t / 0.12), y0];
    if (t < 0.2) {
      const a = -Math.PI / 2 + (Math.PI / 2) * ((t - 0.12) / 0.08);
      return [w - rb + rb * Math.cos(a), y0 + rb + rb * Math.sin(a)];
    }
    if (t < 0.7) {
      const u = (t - 0.2) / 0.5;
      // a gentle bulge at the middle of the side, where the wheels sit
      return [w - lean * u * u + 0.012 * Math.sin(u * Math.PI), y0 + rb + (h - rb - rs) * u];
    }
    if (t < 0.85) {
      const a = (Math.PI / 2) * ((t - 0.7) / 0.15);
      const cx = w - lean - rs;
      return [cx + rs * Math.cos(a), y1 - rs + rs * Math.sin(a)];
    }
    const u = (t - 0.85) / 0.15;
    return [(w - lean - rs) * (1 - u), y1 + crown * Math.sin((u * Math.PI) / 2)];
  }

  // A point on the glasshouse at (z, t): the side glass leaning in from its foot on the
  // shoulder (0) to the roof's edge (0.6), round the edge (0.6-0.8), across the roof (1).
  function upperPoint(p, z, t) {
    const yb = p.top(z) - 0.01;
    const yr = p.roofAt(z) ?? yb;
    const wb = p.half(z, p.k.beltW);
    const wr = Math.min(wb, p.half(z, p.k.roofW) + 0.02);
    const h = Math.max(0.001, yr - yb);
    const rr = Math.min(0.1, h * 0.45, wr * 0.4);
    if (t < 0.6) {
      const u = t / 0.6;
      return [wb + (wr - wb) * u, yb + (h - rr) * u];
    }
    if (t < 0.8) {
      const a = (Math.PI / 2) * ((t - 0.6) / 0.2);
      return [wr - rr + rr * Math.cos(a), yr - rr + rr * Math.sin(a)];
    }
    const u = (t - 0.8) / 0.2;
    return [(wr - rr) * (1 - u), yr + 0.012 * Math.sin((u * Math.PI) / 2)];
  }

  // A patch of a swept surface over z0..z1 and t0..t1, both sides of the car (or `sides`),
  // pushed `offset` metres out along its normal. Returns a BufferGeometry.
  function surfacePatch(point, z0, z1, t0, t1, nz, nt, offset = 0, sides = [1, -1]) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const index = [];
    const e = 1e-3;
    const pos = (z, t) => {
      const [x, y] = point(z, t);
      return [x, y, z];
    };
    for (const side of sides) {
      const base = positions.length / 3;
      for (let i = 0; i <= nz; i++) {
        // closer together toward the ends of the patch, where a body curves round fastest
        const z = z0 + (z1 - z0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / nz));
        for (let j = 0; j <= nt; j++) {
          const t = t0 + ((t1 - t0) * j) / nt;
          const p = pos(z, t);
          const a = pos(z + e, t);
          const b = pos(z - e, t);
          const c = pos(z, Math.min(1, t + e));
          const d = pos(z, Math.max(0, t - e));
          // outward: (along t) x (along z)
          const tz = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
          const tt = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
          let nx = tt[1] * tz[2] - tt[2] * tz[1];
          let ny = tt[2] * tz[0] - tt[0] * tz[2];
          let nzz = tt[0] * tz[1] - tt[1] * tz[0];
          const len = Math.hypot(nx, ny, nzz);
          if (len < 1e-9) {
            nx = 0;
            ny = t > 0.5 ? 1 : -1;
            nzz = 0;
          } else {
            nx /= len;
            ny /= len;
            nzz /= len;
          }
          positions.push(side * (p[0] + nx * offset), p[1] + ny * offset, p[2] + nzz * offset);
          normals.push(side * nx, ny, nzz);
          // u runs front to back on the left side and back to front on the right, so a
          // picture on the panel reads left to right from either side
          uvs.push(side > 0 ? 1 - i / nz : i / nz, j / nt);
        }
      }
      for (let i = 0; i < nz; i++) {
        for (let j = 0; j < nt; j++) {
          const a = base + i * (nt + 1) + j;
          const b = a + nt + 1;
          const c = b + 1;
          const d = a + 1;
          if (side > 0) index.push(a, c, b, a, d, c);
          else index.push(a, b, c, a, c, d);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    return geo;
  }

  // Joins geometries into one, painting each with a colour if given (for the trim).
  function mergeParts(list) {
    const positions = [];
    const normals = [];
    const colors = [];
    const uvs = [];
    const tint = new THREE.Color();
    for (const [geo0, color] of list) {
      const geo = geo0.index ? geo0.toNonIndexed() : geo0;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      positions.push(...geo.attributes.position.array);
      normals.push(...geo.attributes.normal.array);
      if (geo.attributes.uv) uvs.push(...geo.attributes.uv.array);
      else for (let i = 0; i < geo.attributes.position.count; i++) uvs.push(0, 0);
      tint.setHex(color ?? 0xffffff);
      for (let i = 0; i < geo.attributes.position.count; i++) colors.push(tint.r, tint.g, tint.b);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return out;
  }

  // A box, rounded box or ellipsoid placed at (x, y, z) and turned, as a geometry.
  const placed = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => geo.applyMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
  const boxAt = (w, h, d, x, y, z, rx, ry, rz) => placed(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const blobAt = (w, h, d, x, y, z, rx, ry, rz) => placed(new THREE.SphereGeometry(0.5, 10, 6).scale(w, h, d), x, y, z, rx, ry, rz);
  const both = (make) => [make(1), make(-1)];

  // How far forward (or back, with front false) the body reaches at a side offset x and
  // height y: where to set lamps and grilles so they sit on its face.
  function faceZ(p, x, y, front) {
    const section = p.section || ((z, t) => lowerPoint(p, z, t));
    const reachAt = (z) => {
      let prev = section(z, 0);
      for (let i = 1; i <= 48; i++) {
        const cur = section(z, i / 48);
        if ((prev[1] - y) * (cur[1] - y) <= 0 && cur[1] !== prev[1]) {
          const f = (y - prev[1]) / (cur[1] - prev[1]);
          return prev[0] + (cur[0] - prev[0]) * f;
        }
        prev = cur;
      }
      return 0;
    };
    let lo = 0;
    let hi = p.k.len / 2;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (reachAt(front ? mid : -mid) >= Math.abs(x)) lo = mid;
      else hi = mid;
    }
    return front ? lo : -lo;
  }

  // --- wheels ---

  // A tyre with rounded shoulders and a tread, on a five-spoke alloy with a brake disc
  // behind it: one geometry per size, coloured per part. Its axle runs along x.
  const wheelShapes = new Map();
  function wheelGeometry(r, width, style = 'alloy') {
    const key = `${r}|${width}|${style}`;
    if (wheelShapes.has(key)) return wheelShapes.get(key);
    const parts = [];
    // tyre: a lathe of its cross-section round the axle
    const rim = r * 0.64;
    const profile = [];
    const hw = width / 2;
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      profile.push(new THREE.Vector2(rim + (r - rim) * Math.sin(a) ** 0.35, -hw * Math.cos(a)));
    }
    const tyre = new THREE.LatheGeometry(profile, 20).rotateZ(Math.PI / 2);
    parts.push([tyre, TRIM.black]);
    if (style === 'steel') {
      parts.push([new THREE.CylinderGeometry(rim, rim, width * 0.7, 20).rotateZ(Math.PI / 2), TRIM.steel]);
      parts.push([new THREE.CylinderGeometry(rim * 0.35, rim * 0.35, width * 0.8, 10).rotateZ(Math.PI / 2), TRIM.chrome]);
    } else {
      // the barrel, dark inside, and the brake disc
      parts.push([new THREE.CylinderGeometry(rim, rim, width * 0.85, 14, 1, true).rotateZ(Math.PI / 2), TRIM.plastic]);
      parts.push([new THREE.CylinderGeometry(rim * 0.82, rim * 0.82, 0.03, 14).rotateZ(Math.PI / 2).translate(-width * 0.1, 0, 0), TRIM.steel]);
      // the face: a ring, five spokes and a hub
      const face = new THREE.Shape();
      face.absarc(0, 0, rim, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, rim * 0.86, 0, Math.PI * 2, true);
      face.holes.push(hole);
      const ring = new THREE.ExtrudeGeometry(face, { depth: 0.035, bevelEnabled: false, curveSegments: 14 });
      ring.rotateY(Math.PI / 2).translate(width * 0.34, 0, 0);
      parts.push([ring, TRIM.chrome]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.BoxGeometry(0.03, rim * 0.78, rim * 0.22);
        spoke.translate(0, rim * 0.46, 0);
        spoke.rotateX(a);
        spoke.translate(width * 0.35, 0, 0);
        parts.push([spoke, TRIM.chrome]);
      }
      parts.push([new THREE.CylinderGeometry(rim * 0.22, rim * 0.24, 0.06, 12).rotateZ(Math.PI / 2).translate(width * 0.36, 0, 0), TRIM.chrome]);
    }
    const geo = mergeParts(parts);
    wheelShapes.set(key, geo);
    return geo;
  }

  // --- the parts of each kind, made once ---

  function carParts(name) {
    const k = KINDS[name];
    if (k.parts) return k.parts;
    if (k.bus) return (k.parts = busParts(k));
    if (k.truck) return (k.parts = truckParts(k));
    const p = carProfile(k);
    const { zF, zT, zA, zR1, zR2, zC, zB } = p;
    const L = (z, t) => lowerPoint(p, z, t);
    const U = (z, t) => upperPoint(p, z, t);
    const steps = (a, b, per) => Math.max(2, Math.round(Math.abs(b - a) / per));
    const lower = (z0, z1, t0, t1, off = 0, sides) => surfacePatch(L, z0, z1, t0, t1, steps(z0, z1, 0.085), steps(t0, t1, 0.06), off, sides);
    const upper = (z0, z1, t0, t1, off = 0, sides) => surfacePatch(U, z0, z1, t0, t1, steps(z0, z1, 0.1), steps(t0, t1, 0.07), off, sides);

    // where the front doors are (the left one opens), and the rear doors' back edge
    const doorFront = zA - 0.06;
    const doorBack = zB;
    const rearEnd = zC + (k.quarter || 0.2);
    const doorTop = 0.8; // the lower body's t just over the shoulder, where the window starts
    const doorLow = 0.2;

    // --- paint: the whole lower body except the left front door, the roof and pillars
    const paint = [
      lower(zT, zF, 0, doorLow, 0, [1, -1]),
      lower(zT, zF, doorTop, 1, 0, [1, -1]),
      lower(zT, doorBack, doorLow, doorTop, 0, [1, -1]),
      lower(doorFront, zF, doorLow, doorTop, 0, [1, -1]),
      lower(doorBack, doorFront, doorLow, doorTop, 0, [-1]),
      // the roof panel, slightly proud of the glass, with the windscreen header and rear edge
      upper(zR2 - 0.05, zR1 + 0.06, 0.7, 1, 0.006),
      // A pillars down the sides of the windscreen
      upper(zR1, zA - 0.01, 0.56, 0.72, 0.005),
    ];
    if (k.rearGlass > 0.2) paint.push(upper(zC + 0.01, zR2, 0.56, 0.72, 0.005)); // C pillars
    // the panel behind the rear side window
    paint.push(upper(zC, rearEnd, 0, 0.62, 0.004));
    // door mirrors on stalks, the housings in body colour
    paint.push(...both((s) => blobAt(0.2, 0.11, 0.13, s * (k.beltW + 0.16), k.belt + 0.1, zA - 0.12)));
    const paintGeo = mergeParts(paint.map((g) => [g]));
    const leftDoor = mergeParts([[lower(doorBack, doorFront, doorLow, doorTop, 0, [1])]]);

    // --- glass: the whole glasshouse, a little inside the pillars; the left front window opens with its door
    const glassGeo = mergeParts([
      [upper(zC, zA, 0.035, 1, -0.003, [-1])],
      [upper(zC, doorBack, 0.035, 1, -0.003, [1])],
      [upper(doorBack, zA, 0.6, 1, -0.003, [1])],
    ].map(([g]) => [g]));
    const doorGlass = mergeParts([[upper(doorBack + 0.03, zA - 0.02, 0.035, 0.6, -0.003, [1])]]);
    // seen from far off: the same shape in a fraction of the triangles, roof and pillars painted
    const coarse = (point, z0, z1, t0, t1, off = 0) => surfacePatch(point, z0, z1, t0, t1, steps(z0, z1, 0.4), steps(t0, t1, 0.17), off);
    const paintFar = mergeParts([[coarse(L, zT, zF, 0, 1)], [coarse(U, zR2 - 0.05, zR1 + 0.06, 0.7, 1, 0.006)]]);
    const glassFar = mergeParts([[coarse(U, zC, zA, 0, 1, -0.003)]]);

    // --- trim: B pillar, window seals, shut lines, sills, bumpers, grille, plates, arch liners
    const trim = [];
    trim.push([upper(zB - 0.055, zB + 0.055, 0.02, 0.72, 0.006), TRIM.black]);
    trim.push([upper(zC, zA, 0, 0.035, 0.004), TRIM.black]); // the seal along the foot of the windows
    if (k.doors === 4) trim.push([upper(rearEnd - 0.04, rearEnd + 0.01, 0.02, 0.62, 0.007), TRIM.black]);
    const seam = (z) => trim.push([lower(z - 0.006, z + 0.006, doorLow + 0.02, doorTop - 0.01, 0.003), TRIM.black]);
    seam(doorFront + 0.01);
    seam(doorBack);
    if (k.doors === 4) seam(rearEnd - 0.02);
    // bonnet and boot shut lines across the top
    trim.push([lower(zF - 0.42, zF - 0.41, 0.72, 1, 0.003), TRIM.black]);
    if (!k.bed && k.deck > 0) trim.push([lower(zC - 0.04, zC - 0.03, 0.72, 1, 0.003), TRIM.black]);
    trim.push([lower(zT, zF, 0, 0.17, 0.004), TRIM.plastic]); // sills and under-bumpers in black plastic
    trim.push([lower(zT, zT + 0.2, 0.17, 0.3, 0.004), TRIM.plastic]);
    trim.push([lower(zF - 0.2, zF, 0.17, 0.27, 0.004), TRIM.plastic]);
    // door handles
    for (const z of k.doors === 4 ? [doorBack - 0.22, rearEnd - 0.25] : [doorBack - 0.22]) {
      trim.push(...both((s) => [boxAt(0.03, 0.03, 0.16, s * (p.half(z, k.width / 2) - 0.02), k.belt - 0.12, z), TRIM.chrome]));
    }
    // front: grille with a chrome surround, lower intake, number plate, fog lamps
    const grilleY = k.nose - 0.14;
    const zFront = faceZ(p, 0, grilleY, true);
    trim.push([boxAt(k.width * 0.4, 0.17, 0.06, 0, grilleY, zFront - 0.02), TRIM.grille]);
    trim.push([boxAt(k.width * 0.42, 0.02, 0.07, 0, grilleY + 0.095, zFront - 0.02), TRIM.chrome]);
    const lowY = k.clear + 0.24;
    trim.push([boxAt(k.width * 0.5, 0.1, 0.06, 0, lowY, faceZ(p, 0, lowY, true) - 0.02), TRIM.grille]);
    trim.push([boxAt(0.52, 0.12, 0.02, 0, lowY + 0.13, faceZ(p, 0, lowY + 0.13, true) + 0.005), TRIM.plate]);
    // rear: plate, reflectors, exhaust
    const plateY = k.bed ? k.tail - 0.42 : Math.min(k.tail, k.deck) - 0.3;
    trim.push([boxAt(0.52, 0.12, 0.02, 0, plateY, faceZ(p, 0, plateY, false) - 0.005), TRIM.plate]);
    trim.push([placed(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).rotateX(Math.PI / 2), -k.width * 0.3, k.clear + 0.12, zT + 0.12), TRIM.chrome]);
    // dark wheel-arch liners, so you cannot see in under the wings, and an undertray
    for (const wz of p.wheelZ) {
      trim.push(...both((s) => [placed(new THREE.CylinderGeometry(k.r + 0.07, k.r + 0.07, 0.36, 16, 1, true, -Math.PI / 2, Math.PI)
        .rotateZ(Math.PI / 2), s * (k.width / 2 - 0.22), k.r, wz), TRIM.liner]));
    }
    trim.push([boxAt(k.width - 0.3, 0.06, k.wb - 0.3, 0, k.clear + 0.05, 0), TRIM.liner]);
    // mirror stalks
    trim.push(...both((s) => [boxAt(0.12, 0.04, 0.05, s * (k.beltW + 0.05), k.belt + 0.06, zA - 0.12), TRIM.black]));
    if (k.rails) trim.push(...both((s) => [boxAt(0.05, 0.05, k.roofLen * 0.95, s * (k.roofW - 0.08), k.roof + 0.04, (zR1 + zR2) / 2), TRIM.plastic]));

    // --- the pickup's load bed: inner walls and floor, a tailgate
    if (k.bed) {
      const bedFront = zC - 0.12;
      const bedBack = zT + 0.06;
      const inner = k.width / 2 - 0.1;
      trim.push([boxAt(inner * 2, 0.04, bedFront - bedBack, 0, k.belt - 0.48, (bedFront + bedBack) / 2), TRIM.plastic]);
      trim.push(...both((s) => [boxAt(0.04, 0.46, bedFront - bedBack, s * inner, k.belt - 0.25, (bedFront + bedBack) / 2), TRIM.plastic]));
      trim.push([boxAt(inner * 2, 0.46, 0.04, 0, k.belt - 0.25, bedFront), TRIM.plastic]);
    }

    // --- lamps: headlamp lenses at the front corners, tail lamps wrapping the rear ones
    const headY = p.top(zF - 0.3) - 0.07;
    const headX = k.width * 0.32;
    for (const s of [1, -1]) {
      const z = faceZ(p, headX, headY, true);
      trim.push([blobAt(0.42, 0.115, 0.18, s * headX, headY, z - 0.075, 0, s * 0.4, 0), 0x2b2f34]); // smoked lens over the lamps
    }
    const head = both((s) => blobAt(0.14, 0.075, 0.06, s * (headX - 0.06), headY, faceZ(p, headX - 0.06, headY, true) + 0.005));
    head.push(...both((s) => blobAt(0.13, 0.075, 0.06, s * (headX + 0.09), headY + 0.005, faceZ(p, headX + 0.09, headY + 0.005, true) - 0.004)));
    head.push(...both((s) => boxAt(0.3, 0.012, 0.03, s * headX, headY - 0.05, faceZ(p, headX, headY - 0.05, true) + 0.002, 0, s * 0.35, 0)));
    head.push(...both((s) => blobAt(0.1, 0.07, 0.05, s * k.width * 0.36, lowY, faceZ(p, k.width * 0.36, lowY, true) - 0.005)));
    const tailY = (k.bed ? k.tail : Math.min(k.tail, k.deck)) - 0.12;
    const tailX = k.width * 0.36;
    const tail = both((s) => blobAt(0.46, 0.12, 0.16, s * tailX, tailY, faceZ(p, tailX, tailY, false) + 0.05, 0, -s * 0.45, 0));
    tail.push(...both((s) => boxAt(0.1, 0.04, 0.02, s * k.width * 0.33, k.clear + 0.24, faceZ(p, k.width * 0.33, k.clear + 0.24, false) - 0.006)));
    // indicators: amber at the outer edge of each lamp cluster, front and back
    const amber = (s) => [
      blobAt(0.1, 0.07, 0.12, s * (headX + 0.25), headY - 0.02, faceZ(p, headX + 0.25, headY - 0.02, true) - 0.05, 0, s * 0.8, 0),
      blobAt(0.1, 0.07, 0.12, s * (tailX + 0.23), tailY + 0.02, faceZ(p, tailX + 0.23, tailY + 0.02, false) + 0.05, 0, -s * 0.8, 0),
      boxAt(0.02, 0.04, 0.12, s * (p.half(zA - 0.4, k.width / 2) + 0.005), k.nose - 0.05, zA - 0.4), // the repeater on the wing
    ];

    // --- inside: seats, dashboard, steering wheel
    const seats = [];
    const seatZ = k.seat[0] - 0.28;
    for (const s of [1, -1]) {
      seats.push(boxAt(0.5, 0.12, 0.5, s * 0.38, k.seatY, seatZ + 0.05));
      seats.push(boxAt(0.48, 0.66, 0.12, s * 0.38, k.seatY + 0.36, seatZ - 0.22, -0.18));
      seats.push(boxAt(0.26, 0.18, 0.1, s * 0.38, k.seatY + 0.78, seatZ - 0.27, -0.12));
    }
    if (k.doors === 4 && zB - zC > 0.7) {
      seats.push(boxAt(k.width - 0.42, 0.12, 0.5, 0, k.seatY + 0.02, seatZ - 0.85));
      seats.push(boxAt(k.width - 0.42, 0.62, 0.12, 0, k.seatY + 0.36, seatZ - 1.1, -0.15));
    }
    seats.push(boxAt(k.width - 0.3, 0.16, 0.36, 0, k.belt - 0.05, zA - 0.22));
    const wheel = new THREE.TorusGeometry(0.17, 0.022, 8, 22).rotateX(-0.45);
    seats.push(wheel.translate(k.seat[1], k.belt + 0.05, zA - 0.5));
    const interiorGeo = mergeParts(seats.map((g) => [g, 0x2a2c31]));

    return (k.parts = {
      profile: p, paint: paintGeo, leftDoor, glass: glassGeo, doorGlass, trim: mergeParts(trim), paintFar, glassFar,
      head: mergeParts(head.map((g) => [g])), tail: mergeParts(tail.map((g) => [g])),
      amberL: mergeParts(amber(1).map((g) => [g])), amberR: mergeParts(amber(-1).map((g) => [g])),
      doorBand: mergeParts([[lower(rearEnd, doorFront, 0.3, 0.62, 0.004)]]),
      interior: interiorGeo, hinge: [p.half(doorFront, k.width / 2), doorFront],
      wheel: wheelGeometry(k.r, k.r * 0.68, name === 'pickup' ? 'steel' : 'alloy'),
      wheelX: k.width / 2 - k.r * 0.45, roofTop: k.roof,
    });
  }

  // A city bus: a long rounded box on big wheels, a deep windscreen, a band of windows
  // down each side, doors on the kerb side, and its destination lit up over the windscreen.
  function busParts(k) {
    const p = {
      k, half: (z, w) => w * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(z) / (k.len / 2)), 14)), 1 / 14),
      bottom: (z) => {
        let y = k.clear;
        for (const wz of [k.len / 2 - k.front, k.len / 2 - k.front - k.wb]) {
          const d = z - wz;
          const arch = k.r + 0.08;
          if (Math.abs(d) < arch) y = Math.max(y, k.r + Math.sqrt(arch * arch - d * d));
        }
        return y;
      },
      top: () => k.roof,
    };
    p.wheelZ = [k.len / 2 - k.front, k.len / 2 - k.front - k.wb];
    const S = (z, t) => lowerPoint(p, z, t, 9);
    p.section = S;
    const patch = (z0, z1, t0, t1, off = 0, sides) => surfacePatch(S, z0, z1, t0, t1, Math.max(2, Math.round((z1 - z0) / 0.2)), Math.max(2, Math.round((t1 - t0) / 0.04)), off, sides);
    const zF = k.len / 2;
    const zT = -k.len / 2;
    // the t at a height on the side of this boxy section
    const tAt = (y) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (S(0, mid)[1] < y) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const tLow = tAt(1.3);
    const tHigh = tAt(2.62);
    const paint = [patch(zT, zF, 0, tLow), patch(zT, zF, tHigh, 1), patch(zT, zT + 0.5, tLow, tHigh), patch(zF - 0.25, zF, tLow, tHigh)];
    const glass = [];
    const trim = [];
    // windows down both sides, in panes with black frames between
    for (let z = zT + 0.5; z < zF - 0.35; z += 1.45) {
      const z1 = Math.min(z + 1.45, zF - 0.25);
      glass.push(patch(z + 0.07, z1 - 0.07, tLow + 0.01, tHigh - 0.01, 0.002));
      trim.push([patch(z - 0.07, z + 0.07, tLow, tHigh, 0.004), TRIM.black]);
    }
    trim.push([patch(zT, zF, tLow - 0.012, tLow, 0.005), TRIM.black]);
    trim.push([patch(zT, zF, 0, tAt(0.75), 0.004), TRIM.plastic]); // a dark skirt along the bottom
    // the windscreen, the destination sign, the rear window
    glass.push(boxAt(k.width - 0.22, 1.55, 0.04, 0, 1.92, zF - 0.005));
    trim.push([boxAt(k.width - 0.1, 0.06, 0.06, 0, 1.13, zF), TRIM.black]);
    const sign = [boxAt(1.7, 0.26, 0.04, 0, 2.86, zF + 0.002)];
    glass.push(boxAt(k.width - 0.6, 0.7, 0.04, 0, 2.2, zT + 0.005));
    // doors on the kerb side (-x): glass leaves in black frames
    for (const z of [zF - 1.35, 0.4]) {
      glass.push(boxAt(0.04, 2.15, 1.1, -k.width / 2 - 0.004, 1.42, z));
      trim.push([boxAt(0.05, 2.25, 0.07, -k.width / 2 - 0.006, 1.42, z), TRIM.black]);
      trim.push([boxAt(0.05, 0.07, 1.2, -k.width / 2 - 0.006, 2.52, z), TRIM.black]);
    }
    // a roof pod for the air conditioning, wheel liners, bumpers
    paint.push(boxAt(1.6, 0.28, 3.2, 0, k.roof + 0.14, -1));
    for (const wz of p.wheelZ) {
      trim.push(...both((s) => [placed(new THREE.CylinderGeometry(k.r + 0.08, k.r + 0.08, 0.45, 16, 1, true, -Math.PI / 2, Math.PI)
        .rotateZ(Math.PI / 2), s * (k.width / 2 - 0.26), k.r, wz), TRIM.liner]));
    }
    trim.push([boxAt(k.width, 0.32, 0.14, 0, 0.5, zF + 0.02), TRIM.plastic]);
    trim.push([boxAt(k.width, 0.32, 0.14, 0, 0.5, zT - 0.02), TRIM.plastic]);
    trim.push([boxAt(0.6, 0.14, 0.02, 0, 0.42, zF + 0.1), TRIM.plate]);
    trim.push([boxAt(0.6, 0.14, 0.02, 0, 0.9, zT - 0.01), TRIM.plate]);
    const head = both((s) => blobAt(0.3, 0.16, 0.08, s * (k.width / 2 - 0.3), 0.85, zF + 0.01));
    const tail = both((s) => boxAt(0.18, 0.6, 0.05, s * (k.width / 2 - 0.15), 1.05, zT - 0.01));
    const amber = (s) => [boxAt(0.14, 0.1, 0.05, s * (k.width / 2 - 0.12), 1.05, zF + 0.01), boxAt(0.18, 0.12, 0.05, s * (k.width / 2 - 0.15), 1.45, zT - 0.01)];
    // seats in rows, seen through the windows
    const seats = [];
    for (let z = zF - 2.6; z > zT + 1; z -= 0.85) {
      for (const s of [1, -1]) {
        seats.push(boxAt(0.95, 0.12, 0.45, s * 0.7, 0.95, z));
        seats.push(boxAt(0.95, 0.65, 0.1, s * 0.7, 1.3, z - 0.22));
      }
    }
    seats.push(boxAt(0.5, 0.6, 0.5, k.seat[1], 1.0, k.seat[0] - 0.3));
    return {
      profile: p, paint: mergeParts(paint.map((g) => [g])), glass: mergeParts(glass.map((g) => [g])), trim: mergeParts(trim),
      head: mergeParts(head.map((g) => [g])), tail: mergeParts(tail.map((g) => [g])),
      amberL: mergeParts(amber(1).map((g) => [g])), amberR: mergeParts(amber(-1).map((g) => [g])),
      sign: mergeParts(sign.map((g) => [g])), interior: mergeParts(seats.map((g) => [g, 0x2f3a4a])),
      wheel: wheelGeometry(k.r, 0.34, 'steel'), wheelX: k.width / 2 - 0.3, roofTop: k.roof + 0.28, wheelZ: p.wheelZ,
    };
  }

  // A box truck: a cab with a big windscreen, and a tall cargo box behind it on a chassis.
  function truckParts(k) {
    const zF = k.len / 2;
    const zT = -k.len / 2;
    const cabBack = zF - 2.25;
    const wheelZ = [zF - k.front, zF - k.front - k.wb];
    // the cab: its own small rounded box
    const cab = {
      k: { ...k, width: k.width - 0.06 },
      half: (z, w) => w * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, z - (cabBack + zF) / 2) / ((zF - cabBack) / 2), 6)), 1 / 6),
      bottom: (z) => {
        const d = z - wheelZ[0];
        const arch = k.r + 0.08;
        return Math.abs(d) < arch ? Math.max(0.55, k.r + Math.sqrt(arch * arch - d * d)) : 0.55;
      },
      top: (z) => 2.75 - 0.25 * smoothBetween(zF - 0.6, zF, z),
    };
    const C = (z, t) => lowerPoint(cab, z, t, 6);
    cab.section = C;
    const cabPatch = (z0, z1, t0, t1, off = 0, sides) => surfacePatch(C, z0, z1, t0, t1, Math.max(2, Math.round((z1 - z0) / 0.08)), Math.max(2, Math.round((t1 - t0) / 0.04)), off, sides);
    const tAt = (z, y) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (C(z, mid)[1] < y) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const tWin = tAt(cabBack + 1, 1.62);
    const tRoof = tAt(cabBack + 1, 2.55);
    const paint = [cabPatch(cabBack, zF, 0, tWin), cabPatch(cabBack, zF, tRoof, 1), cabPatch(cabBack, cabBack + 0.45, tWin, tRoof)];
    const glass = [cabPatch(cabBack + 0.48, zF - 0.02, tWin, tRoof, 0.002)];
    glass.push(boxAt(k.width - 0.3, 0.95, 0.04, 0, 2.08, faceZ(cab, 0, 2.08, true) + 0.01, -0.08));
    // the cargo box: tall, square-edged, on a dark chassis
    const boxLen = cabBack - 0.15 - (zT + 0.1);
    const boxZ = (cabBack - 0.15 + zT + 0.1) / 2;
    const cargo = [boxAt(k.width, 2.55, boxLen, 0, 2.38, boxZ)];
    const trim = [];
    trim.push([boxAt(k.width + 0.02, 0.08, boxLen + 0.02, 0, 1.08, boxZ), TRIM.steel]);
    trim.push([boxAt(k.width + 0.02, 0.08, boxLen + 0.02, 0, 3.66, boxZ), TRIM.steel]);
    for (let z = zT + 0.1; z < cabBack - 0.15; z += 0.9) trim.push(...both((s) => [boxAt(0.02, 2.55, 0.04, s * (k.width / 2 + 0.005), 2.38, z), 0xc9ccd0]));
    trim.push([boxAt(k.width - 0.1, 2.3, 0.03, 0, 2.3, zT + 0.09), 0xa9adb2]); // the roller door at the back
    trim.push([boxAt(1.0, 0.35, k.len - 1.2, 0, 0.75, -0.2), TRIM.liner]); // chassis rails
    trim.push([boxAt(k.width, 0.22, 0.15, 0, 0.6, zF + 0.04), TRIM.plastic]);
    trim.push([boxAt(k.width * 0.55, 0.5, 0.04, 0, 1.2, faceZ(cab, 0, 1.2, true) + 0.005), TRIM.grille]);
    trim.push([boxAt(0.52, 0.12, 0.02, 0, 0.6, zF + 0.13), TRIM.plate]);
    trim.push([boxAt(0.52, 0.12, 0.02, 0, 0.75, zT - 0.02), TRIM.plate]);
    trim.push(...both((s) => [boxAt(0.06, 0.38, 0.22, s * (k.width / 2 + 0.22), 2.0, zF - 0.55), TRIM.black])); // big mirrors
    trim.push(...both((s) => [boxAt(0.26, 0.04, 0.04, s * (k.width / 2 + 0.1), 2.0, zF - 0.55), TRIM.black]));
    for (const wz of wheelZ) {
      trim.push(...both((s) => [placed(new THREE.CylinderGeometry(k.r + 0.08, k.r + 0.08, 0.4, 16, 1, true, -Math.PI / 2, Math.PI)
        .rotateZ(Math.PI / 2), s * (k.width / 2 - 0.24), k.r, wz), TRIM.liner]));
    }
    trim.push([cabPatch(cabBack + 0.45, cabBack + 0.5, tWin, tRoof, 0.005), TRIM.black]);
    trim.push([boxAt(k.width - 0.1, 2.2, 0.04, 0, 1.65, cabBack + 0.01), TRIM.black]); // the cab's back wall
    trim.push([cabPatch(cabBack, zF, tWin - 0.01, tWin, 0.004), TRIM.black]);
    const head = both((s) => blobAt(0.3, 0.16, 0.1, s * (k.width / 2 - 0.32), 0.95, faceZ(cab, k.width / 2 - 0.32, 0.95, true) - 0.02));
    const tail = both((s) => boxAt(0.2, 0.14, 0.05, s * (k.width / 2 - 0.2), 0.95, zT - 0.03));
    const amber = (s) => [boxAt(0.12, 0.1, 0.06, s * (k.width / 2 - 0.08), 0.95, faceZ(cab, k.width / 2 - 0.1, 0.95, true) - 0.02),
      boxAt(0.14, 0.1, 0.05, s * (k.width / 2 - 0.45), 0.95, zT - 0.03)];
    const seats = [boxAt(0.5, 0.6, 0.5, k.seat[1], 1.55, k.seat[0] - 0.3), boxAt(0.5, 0.6, 0.5, -k.seat[1], 1.55, k.seat[0] - 0.3), boxAt(k.width - 0.3, 0.2, 0.4, 0, 1.75, zF - 0.4)];
    return {
      profile: cab, paint: mergeParts(paint.map((g) => [g])), cargo: mergeParts(cargo.map((g) => [g])), glass: mergeParts(glass.map((g) => [g])),
      trim: mergeParts(trim), head: mergeParts(head.map((g) => [g])), tail: mergeParts(tail.map((g) => [g])),
      amberL: mergeParts(amber(1).map((g) => [g])), amberR: mergeParts(amber(-1).map((g) => [g])),
      interior: mergeParts(seats.map((g) => [g, 0x2a2c31])), wheel: wheelGeometry(k.r, 0.3, 'steel'), wheelX: k.width / 2 - 0.3,
      roofTop: 3.7, wheelZ, dual: true,
    };
  }

  // --- assembling one vehicle ---

  // All of a vehicle's lamps are one mesh. Each corner knows which lamp it belongs to (0 head,
  // 1 tail, 2 left indicator, 3 right indicator), and the material colours it from that
  // lamp's colour, so switching a lamp is changing one colour.
  function lampGeometry(parts) {
    if (parts.lamps) return parts.lamps;
    const list = [parts.head, parts.tail, parts.amberL, parts.amberR];
    const geo = mergeParts(list.map((g) => [g]));
    const which = [];
    list.forEach((g, n) => {
      const count = g.index ? g.index.count : g.attributes.position.count;
      for (let i = 0; i < count; i++) which.push(n);
    });
    geo.setAttribute('lamp', new THREE.Float32BufferAttribute(which, 1));
    return (parts.lamps = geo);
  }

  function lampMaterial() {
    const colors = [new THREE.Color(headlightMat.color.getHex()), new THREE.Color(tailIdle), new THREE.Color(AMBER_OFF), new THREE.Color(AMBER_OFF)];
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      ['lampHead', 'lampTail', 'lampLeft', 'lampRight'].forEach((name, n) => { shader.uniforms[name] = { value: colors[n] }; });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float lamp;\nvarying float vLamp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = lamp;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 lampHead;\nuniform vec3 lampTail;\nuniform vec3 lampLeft;\nuniform vec3 lampRight;\nvarying float vLamp;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vLamp < 0.5 ? lampHead : vLamp < 1.5 ? lampTail : vLamp < 2.5 ? lampLeft : lampRight;');
    };
    material.customProgramCacheKey = () => 'vehicle-lamps';
    // stand-ins with a colour, so the lamps can be set like separate materials
    const lamp = (color) => ({ color, userData: {} });
    return { material, head: lamp(colors[0]), tail: lamp(colors[1]), left: lamp(colors[2]), right: lamp(colors[3]) };
  }

  // Wheels are drawn all together: one instanced mesh per wheel shape, filled each frame
  // from the wheels of every vehicle near enough to see them.
  const wheelPools = new Map(); // geometry -> { mesh, wheels }
  function wheelSlot(geometry, holder, model) {
    let pool = wheelPools.get(geometry);
    if (!pool) {
      const mesh = new THREE.InstancedMesh(geometry, wheelMat2, 900);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      wheelPools.set(geometry, (pool = { mesh, wheels: [] }));
    }
    pool.wheels.push({ holder, model });
  }

  function updateWheelInstances() {
    for (const pool of wheelPools.values()) {
      let n = 0;
      for (const { holder, model } of pool.wheels) {
        const g = model.group;
        if (!g.parent || !g.visible || (model.detail && !model.detail.visible) || n >= 900) continue;
        holder.updateWorldMatrix(true, false);
        pool.mesh.setMatrixAt(n++, holder.matrixWorld);
      }
      pool.mesh.count = n;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  const cargoMat = new THREE.MeshPhongMaterial({ color: 0xf4f4f2, shininess: 30, specular: 0x333333 });
  const busSignMat = new THREE.MeshBasicMaterial({ color: 0xffa321 });
  const headMats = []; // each vehicle's own headlamp material, lit with the lamps after dark
  const AMBER_OFF = 0x5a3a08;
  const AMBER_ON = 0xffa21a;

  function createBuiltCar(color, name) {
    const k = KINDS[name];
    const parts = carParts(name);
    const { hl } = k.dims;
    const group = new THREE.Group();
    const paint = reflect(new THREE.MeshPhongMaterial({ color, shininess: 95, specular: 0x8a8a8a }), 0.28);
    const lamps = lampMaterial();
    const { tail: tailMat, left: amberL, right: amberR, head: headMat } = lamps;
    headMats.push(headMat);
    const cabin = new THREE.Group(); // the glasshouse and roof, hidden for the view from the driver's seat
    group.add(cabin);
    // the small things (wheels, seats, indicators) are left out when the vehicle is far away
    const detail = new THREE.Group();
    group.add(detail);
    const mesh = (geo, material, parent = group, shadow = false) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };
    const body = mesh(parts.paint, paint, group, true);
    const trim = mesh(parts.trim, trimMat, parts.paintFar ? detail : group);
    const glass = mesh(parts.glass, cabinGlass, k.bus || k.truck ? group : cabin);
    glass.renderOrder = 2; // after what is inside the car
    mesh(lampGeometry(parts), lamps.material);
    mesh(parts.interior, seatMat, detail);
    const deform = [body, trim];
    const glassParts = [glass];
    if (parts.cargo) deform.push(mesh(parts.cargo, cargoMat, group, true));
    if (parts.sign) mesh(parts.sign, busSignMat);

    // the driver's door, hinged at its front edge so it can swing open
    let door = null;
    if (parts.leftDoor) {
      const [hx, hz] = parts.hinge;
      door = new THREE.Group();
      door.position.set(hx, 0, hz);
      const panel = mesh(parts.leftDoor.clone().translate(-hx, 0, -hz), paint, door);
      const pane = mesh(parts.doorGlass.clone().translate(-hx, 0, -hz), cabinGlass, door);
      pane.renderOrder = 2;
      deform.push(panel);
      glassParts.push(pane);
      group.add(door);
    }

    // wheels: the front pair hang from pivots so they can steer as well as spin
    const wheels = [];
    const frontPivots = [];
    const model = { group, detail };
    const wheelZ = parts.wheelZ || [k.wb / 2, -k.wb / 2];
    wheelZ.forEach((z, axle) => {
      for (const side of [1, -1]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * parts.wheelX, k.r, z);
        const wheel = new THREE.Object3D(); // drawn by the shared wheel mesh, see updateWheelInstances
        pivot.add(wheel);
        if (side < 0) wheel.rotation.y = Math.PI; // the rim faces outward on both sides
        wheelSlot(parts.wheel, wheel, model);
        if (parts.dual && axle === 1) {
          const inner = new THREE.Object3D();
          inner.position.x = -0.32;
          wheel.add(inner);
          wheelSlot(parts.wheel, inner, model);
        }
        detail.add(pivot);
        wheels.push(wheel);
        if (axle === 0) frontPivots.push(pivot);
      }
    });

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.6, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.85 })
    );
    flame.rotation.x = -Math.PI / 2; // tip points backwards
    flame.position.set(0, k.clear + 0.2, -hl - 0.75);
    flame.visible = false;
    group.add(flame);

    scene.add(group);
    model.body = body;
    model.glassMesh = glass;
    return Object.assign(model, {
      wheels, frontPivots, tailMat, amberL, amberR, headMat, flame, cabin, kind: name, dims: k.dims, stats: k.stats,
      seat: k.seat, seatY: k.seatY, roof: parts.roofTop, deform, glassParts, door, paint, parts,
    });
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
    if (vehicleTemplates[kind]) return createModelVehicle(color, kind); // the bus and the truck
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

  // ---------- Vehicle lights ----------

  // Your own vehicle's lights are yours to work, by key or by typing a command in the
  // console: headlamps (automatic, on, full beam or off), the indicators and hazard lights,
  // emergency lights with a siren, and the brake lamps. Traffic signals its own turns and
  // lane changes.
  const lights = { head: 'auto', indicator: null, emergency: false, brakes: false };
  const HEAD_MODES = ['auto', 'on', 'high', 'off'];
  let flashers = null; // red and blue lamps behind the grille, for a car with no light bar

  function setLights(change, quiet = false) {
    Object.assign(lights, change);
    if (quiet) return;
    const parts = [];
    parts.push(`Headlights ${lights.head === 'high' ? 'full beam' : lights.head}`);
    if (lights.indicator) parts.push(lights.indicator === 'hazard' ? 'hazards on' : `${lights.indicator} indicator`);
    if (lights.emergency) parts.push('emergency lights');
    if (lights.brakes) parts.push('brake lamps held on');
    showToast(parts.join(' · '));
  }

  function toggleIndicator(which) {
    setLights({ indicator: lights.indicator === which ? null : which });
  }

  // Red and blue strobes for any car without a police light bar: a pair behind the grille
  // and a pair on the dashboard.
  function addFlashers(model) {
    const red = new THREE.MeshBasicMaterial({ color: 0x400808 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x081040 });
    const group = new THREE.Group();
    const { hl } = model.dims;
    for (const [x, mat] of [[0.22, red], [-0.22, blue]]) {
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), mat);
      grille.position.set(x, (model.stats.eye || 1.2) - 0.62, hl + 0.01);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.08), mat);
      dash.position.set(x, (model.stats.eye || 1.2) - 0.22, (model.seat ? model.seat[0] : 0) + 0.62);
      group.add(grille, dash);
    }
    model.group.add(group);
    return { group, red, blue, model };
  }

  // Far-off vehicles drop their small parts: wheels, seats and indicators are a few pixels
  // at that distance, and leaving them out saves hundreds of draw calls.
  function updateVehicleDetail() {
    const eye = camera.position;
    const near = (m) => {
      if (!m.detail) return;
      const p = m.group.position;
      const d2 = (p.x - eye.x) ** 2 + (p.z - eye.z) ** 2;
      m.detail.visible = d2 < 150 * 150;
      // past 70 m the body is the coarse shell, doors and all (unless it is dented: that shape is its own)
      const parts = m.parts;
      if (!parts || !parts.paintFar || m.body.userData.pristine || m.doorOpen) return;
      const far = d2 > 70 * 70;
      m.body.geometry = far ? parts.paintFar : parts.paint;
      m.glassMesh.geometry = far ? parts.glassFar : parts.glass;
      if (m.door) m.door.visible = !far;
    };
    for (const c of traffic) near(c.model);
    for (const c of highwayTraffic) near(c.model);
    for (const v of idleCars) near(v.model);
    for (const p of police) near(p.model);
    if (player && player.detail) {
      player.detail.visible = true;
      if (player.paintFar !== undefined || (player.parts && player.parts.paintFar && !player.body.userData.pristine)) {
        player.body.geometry = player.parts.paint;
        player.glassMesh.geometry = player.parts.glass;
        if (player.door) player.door.visible = true;
      }
    }
  }

  // Every frame: blink the indicators, flash the emergency lights, set the headlamps.
  function updateVehicleLights(dt) {
    updateVehicleDetail();
    const blink = Math.floor(clock * 2.6) % 2 === 0;
    const signal = (model, indicator) => {
      if (!model.amberL) return;
      const left = blink && (indicator === 'left' || indicator === 'hazard');
      const right = blink && (indicator === 'right' || indicator === 'hazard');
      model.amberL.color.setHex(left ? AMBER_ON : AMBER_OFF);
      model.amberR.color.setHex(right ? AMBER_ON : AMBER_OFF);
    };
    for (const c of traffic) signal(c.model, c.model.indicator);
    for (const c of highwayTraffic) signal(c.model, c.target !== c.lane ? 'right' : null);
    for (const v of idleCars) if (v.model.indicator) signal(v.model, v.model.indicator);

    // headlamps on every vehicle follow the daylight
    const lit = headlightMat.color.getHex();
    for (const material of headMats) if (!material.userData.mine) material.color.setHex(lit);

    const driving = mode === 'car' && player;
    if (!driving) {
      if (flashers) flashers.group.visible = false;
      return;
    }
    signal(player, lights.indicator);
    if (player.headMat) {
      player.headMat.userData.mine = true;
      const on = lights.head === 'on' || lights.head === 'high' || (lights.head === 'auto' && lampsOnNow > 0.5);
      let color = lights.head === 'off' ? 0x6d6d66 : on ? (lights.head === 'high' ? 0xffffff : 0xfff6dc) : lit;
      // emergency: the headlamps flash in turn
      if (lights.emergency && Math.floor(clock * 6) % 2 === 0) color = 0x6d6d66;
      player.headMat.color.setHex(color);
    }
    if (headBeam) {
      const beam = lights.head === 'off' ? 0 : lights.head === 'high' ? 2.8 : lights.head === 'on' ? 1.5 : lampsOnNow * 1.5;
      headBeam.intensity = beam;
      headBeam.angle = lights.head === 'high' ? 0.42 : 0.55;
      headBeam.distance = lights.head === 'high' ? 140 : 75;
      if (player.beam) {
        player.beam.material = playerBeamMat;
        playerBeamMat.opacity = Math.min(1, beam / 1.5) * 0.7;
        player.beam.scale.set(1, 1, lights.head === 'high' ? 1.6 : 1);
      }
    }
    if (lights.brakes) player.tailMat.color.setHex(0xff2a2a);

    // emergency lights: the light bar if it has one, strobes if not
    const strobe = Math.floor(clock * 7) % 2 === 0;
    if (player.bar) {
      player.bar[0].color.setHex(lights.emergency && strobe ? 0xff2020 : 0x400808);
      player.bar[1].color.setHex(lights.emergency && !strobe ? 0x2060ff : 0x081040);
    } else if (lights.emergency) {
      if (!flashers || flashers.model !== player) {
        if (flashers) flashers.group.parent.remove(flashers.group);
        flashers = addFlashers(player);
      }
      flashers.group.visible = true;
      flashers.red.color.setHex(strobe ? 0xff2020 : 0x400808);
      flashers.blue.color.setHex(strobe ? 0x081040 : 0x2060ff);
    } else if (flashers) {
      flashers.group.visible = false;
    }
    void dt;
  }
  const playerBeamMat = beamMat.clone();

  // The police look: a light bar on the roof, a dark band with POLICE along the doors,
  // and a push bar on the front.
  const policeBand = new THREE.MeshPhongMaterial({
    shininess: 80, specular: 0x666666,
    map: canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = '#0f1724';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a64d8';
      g.fillRect(0, h - 22, w, 10);
      g.fillStyle = '#ffffff';
      g.font = 'bold 72px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('POLICE', w / 2, h / 2 - 8);
    }),
  });
  function addPoliceLook(model) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2060ff });
    const roof = model.roof;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 0.32), trimMat);
    base.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(base.geometry.attributes.position.count * 3).fill(0.08), 3));
    base.position.set(0, roof + 0.05, -0.2);
    model.group.add(base);
    [[0.33, red], [-0.33, blue]].forEach(([x, mat]) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.26), mat);
      lamp.position.set(x, roof + 0.14, -0.2);
      model.group.add(lamp);
    });
    const white = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), new THREE.MeshBasicMaterial({ color: 0xf4f4f4 }));
    white.position.set(0, roof + 0.13, -0.2);
    model.group.add(white);
    model.bar = [red, blue];
    if (model.parts && model.parts.doorBand) {
      const band = new THREE.Mesh(model.parts.doorBand, policeBand);
      model.group.add(band);
    }
    // a push bar on the nose
    const { hl } = model.dims;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.06), new THREE.MeshLambertMaterial({ color: 0x15171a }));
    bar.position.set(0, 0.62, hl + 0.06);
    model.group.add(bar);
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
    addCollider(box);
    idleCars.push({ model, x, y, z, h, box });
  }

  function addParkedCars() {
    const kinds = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'hatch', 'suv', 'suv', 'pickup', 'sports'];
    for (const bay of bays) {
      if (Math.random() > (bay.x < -300 ? 0.08 : 0.3)) continue;
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
      signal.box = addPost(signal.x, signal.z, 0.16, KERB, 6, { signal: k });
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
    if (signal.box) removeCollider(signal.box);
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
  const TRAFFIC_MIX = [['sedan', 28], ['hatch', 22], ['suv', 18], ['pickup', 9], ['moto', 8], ['bus', 5], ['truck', 5], ['sports', 4]];
  const colorFor = (kind) => pick(kind === 'sports' ? SPORTS_COLORS : kind === 'bus' ? BUS_COLORS : kind === 'truck' ? TRUCK_COLORS : TRAFFIC_COLORS);

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
      c.model = createCar(colorFor(kind), kind);
      if (kind === 'bus' || kind === 'truck') c.cruise = rand(7, 9);
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
    c.model.indicator = c.d2 === c.d ? null : right ? 'right' : 'left';
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
        if (c.u >= 1 - 1e-6) {
          Object.assign(c, { i: c.ni, j: c.nj, d: c.d2, t: JUNCTION, phase: 'road' });
          c.model.indicator = null;
        }
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
    // people off the pavement: fighting, running, walking back, or lying in the road
    for (const w of walkers) {
      if (w.state === 'walk') continue;
      const p = w.group.position;
      if (p.y > 0.6) continue;
      const lying = !onFeet(w);
      list.push({ x: p.x, z: p.z, h: w.group.rotation.y, speed: 0, hl: lying ? 1 : 0.35, hw: lying ? 0.45 : 0.35 });
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

  // ---------- Highway traffic ----------

  // Traffic on the highway keeps to its lanes at highway speed, closes up behind slower
  // vehicles and pulls out to pass them when the next lane is clear, and stops for
  // anything in the way, you included. Each one drives into a tunnel at one end and comes
  // back out of the tunnel at the other.
  const HIGHWAY_CARS = 30;
  const highwayTraffic = [];

  function spawnHighwayTraffic() {
    const spacing = (HIGHWAY.end * 2) / (HIGHWAY_CARS / 6);
    for (let n = 0; n < HIGHWAY_CARS; n++) addHighwayCar(n % 6, -HIGHWAY.end + (Math.floor(n / 6) + rand(0.1, 0.9)) * spacing);
  }

  // One vehicle on the highway, in lane `index` at x.
  function addHighwayCar(index, x) {
    {
      const lane = highwayLanes[index];
      const kind = pickKind();
      const model = createCar(colorFor(kind), kind);
      const slow = kind === 'bus' || kind === 'truck';
      const c = {
        model, lane: index, x, z: lane.z, dir: lane.dir,
        speed: 22, cruise: slow ? rand(18, 22) : rand(24, 33), shift: 0, target: index, stunned: 0,
      };
      c.h = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.driver = addDriver(model);
      addBeam(model);
      c.box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: model.roof + 0.2, owner: model, highway: c, car: { x: 0, z: 0, h: 0, ...model.dims } };
      trafficBoxes.push(c.box);
      highwayTraffic.push(c);
    }
  }

  // The gap ahead of a vehicle in lane `lane`: to the next vehicle there, or to you.
  function highwayGap(c, lane) {
    const z = highwayLanes[lane].z;
    let gap = 200;
    let speed = 99;
    for (const o of highwayTraffic) {
      if (o === c || Math.abs(o.z - z) > 2.6) continue;
      const d = (o.x - c.x) * c.dir - (o.model.dims.hl + c.model.dims.hl);
      if (d > -1 && d < gap) {
        gap = d;
        speed = o.speed;
      }
    }
    // the player, on foot or on wheels, standing or driving in the lane
    if (car.y < 2 && Math.abs(car.z - z) < 2.6 && Math.abs(car.x) < HIGHWAY.end) {
      const d = (car.x - c.x) * c.dir - c.model.dims.hl - (mode === 'car' ? player.dims.hl : 0.5);
      if (d > -1.5 && d < gap) {
        gap = d;
        speed = Math.max(0, (car.vx || 0) * c.dir);
      }
    }
    return { gap, speed };
  }

  // Is lane `lane` free from `back` metres behind to `front` metres ahead of c?
  function laneFree(c, lane, back, front) {
    const z = highwayLanes[lane].z;
    for (const o of highwayTraffic) {
      if (o === c || Math.abs(o.z - z) > 2.8) continue;
      const d = (o.x - c.x) * c.dir;
      if (d > -back && d < front) return false;
    }
    return !(car.y < 2 && Math.abs(car.z - z) < 3 && (car.x - c.x) * c.dir > -back && (car.x - c.x) * c.dir < front);
  }

  function updateHighwayTraffic(dt) {
    for (const c of highwayTraffic) {
      const m = c.model;
      c.stunned = Math.max(0, c.stunned - dt);
      const { gap, speed: lead } = highwayGap(c, c.target);
      // keep two seconds back from whatever is ahead, closing up gently
      const safe = 6 + c.speed * 1.6;
      let want = c.cruise;
      if (gap < safe) want = Math.min(want, lead + (gap - 6) * 0.6);
      if (gap < 4) want = 0;
      if (c.stunned > 0 || c.jacked) want = 0;
      if (m.flats && m.flats.length) want = Math.min(want, 9);
      want = Math.max(0, want);
      c.speed = approach(c.speed, want, (want < c.speed ? 9 : 2.5) * dt);

      // stuck behind something slower: look for a clear lane alongside, the faster one first
      c.laneTimer = (c.laneTimer || 0) - dt;
      if (c.laneTimer <= 0 && c.target === c.lane && gap < safe + 15 && lead < c.cruise - 3) {
        c.laneTimer = 2;
        const options = [c.lane - 2, c.lane + 2].filter((k) => k >= 0 && k < 6);
        for (const k of options.sort((a, b) => a - b)) {
          if (laneFree(c, k, 14, 30)) {
            c.target = k;
            break;
          }
        }
      }
      // ease across into the target lane, and drift back toward the slow lane when it is clear
      const goalZ = highwayLanes[c.target].z;
      const dz = goalZ - c.z;
      const sideways = Math.max(-1.6, Math.min(1.6, dz * 1.2)) * Math.min(1, c.speed / 6);
      c.z += sideways * dt;
      if (Math.abs(dz) < 0.05) {
        c.z = goalZ;
        c.lane = c.target;
        if (c.laneTimer <= 0 && c.lane + 2 < 6 && laneFree(c, c.lane + 2, 20, 50) && Math.random() < 0.01) c.target = c.lane + 2;
      }
      c.x += c.dir * c.speed * dt;
      // through the tunnel at one end and out of the other
      if (c.x * c.dir > HIGHWAY.end) c.x -= c.dir * HIGHWAY.end * 2;

      c.h = Math.atan2(c.dir * c.speed, sideways) || c.h;
      if (c.speed < 0.5) c.h = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.group.position.set(c.x, 0.04, c.z);
      m.group.rotation.set(0, c.h, flatLean(m));
      for (const wheel of m.wheels) wheel.rotation.x += (m.spin || 1) * (c.speed / 0.38) * dt;
      m.tailMat.color.setHex(want < c.speed - 0.3 || c.speed < 0.1 ? 0xff2a2a : tailIdle);
      const near = Math.abs(c.x - car.x) < 140 && Math.abs(c.z - car.z) < 140;
      if (c.driver) c.driver.visible = near;
      m.group.visible = Math.abs(c.x) < HIGHWAY.portal + 230;

      const [hx, hz] = footprint(m, c.h);
      Object.assign(c.box, { minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz });
      Object.assign(c.box.car, { x: c.x, z: c.z, h: c.h });
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
  function addDriver(model, chosen = null) {
    const figure = new THREE.Group();
    const seat = model.seat || [-0.2, 0.38];
    model.group.add(figure);
    if (npcTemplates.length) {
      const template = chosen || pick(npcTemplates);
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
        npcTemplates.push({ scene: gltf.scene, clips, female: !!entry.female });
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
      const run = template.clips.run ? mixer.clipAction(template.clips.run) : null;
      walk.play();
      idle.play();
      if (run) {
        run.play();
        run.setEffectiveWeight(0);
      }
      walk.time = Math.random(); // out of step with one another
      return { group, skin: { mixer, walk, idle, run }, stride: 4.2, isPerson: true, running: 0, female: template.female };
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
      const half = rand(28, 28.7); // the middle of the footpath, clear of shop fronts and posts
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

  const onFeet = (w) => ['walk', 'stagger', 'goto', 'stumble', 'stunned', 'chase', 'fight', 'flee'].includes(w.state);

  // Hurts a pedestrian or dog. (dirX, dirZ) is the way the blow was travelling. Light hits
  // make them stagger; a hard knock or low health puts them on the ground, and they get
  // back up and limp on if they still have health left. Returns true if they went down.
  function hurtWalker(w, damage, dirX, dirZ, knockDown = false) {
    if (!onFeet(w)) return false;
    if (w.away) setPavementGoal(w, w.group.position.x, w.group.position.z); // once up, home from here
    w.group.rotation.x = w.group.rotation.z = 0;
    w.pose = null;
    w.actMove = 0;
    w.fight = null;
    w.health -= w.isPerson ? damage : 0; // dogs are only ever bowled over
    const facing = w.group.rotation.y;
    // pushed along the way they face: they pitch forward; otherwise they go over backwards
    w.tipSign = dirX * Math.sin(facing) + dirZ * Math.cos(facing) >= 0 ? 1 : -1;
    w.dying = w.health <= 0;
    if (w.dying || knockDown || w.health < 40 || !w.isPerson) {
      startFall(w, dirX, dirZ, knockDown ? 1.35 : 1); // bowled over goes down quicker
      return true;
    }
    w.state = 'stagger';
    w.timer = 0.7;
    return false;
  }

  // --- going down like a person, not a plank ---

  // Shot, knocked out or killed, nobody tips over stiff. The knees go first and the body
  // drops onto them (or, knocked backwards, down onto its seat as the feet slide out),
  // slumps, and then goes over: face down past the knees, or back flat on the ground, the
  // head lolling to one side and the arms flopping where they land. Each moment says
  // where the hips, knees and feet are; the limbs are pointed to join them up and the
  // body pitched and placed to put the hips there. Played backwards it gets them up again.
  const COLLAPSE = { 1: [0.42, 0.6, 1.18, 1.5], [-1]: [0.48, 0.62, 1.12, 1.45] }; // knees gone, slumped, down, settled
  const collapseEnd = (dir) => COLLAPSE[dir][3];
  const limp = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  // where the arms come to rest, face down (1) or on the back (-1); x is the body's left
  const LIMP = {
    1: { armL: limp(0.3, -0.93, 0.1), foreL: limp(0.12, -0.95, 0.1), armR: limp(-0.42, -0.88, 0.06), foreR: limp(-0.05, -0.85, 0.12) },
    [-1]: { armL: limp(0.85, -0.42, -0.05), foreL: limp(0.62, 0.25, 0.02), armR: limp(-0.8, -0.5, -0.05), foreR: limp(-0.75, -0.2, 0.02) },
  };
  const legFrom = new THREE.Vector3();
  const legTo = new THREE.Vector3();

  // Thigh, shin and foot lengths, the ankle's height and so the hip's, in metres, from the bones.
  function measureLegs(group, thigh, knee, foot, otherFoot, toe) {
    group.updateMatrixWorld(true);
    thigh.getWorldPosition(legFrom);
    knee.getWorldPosition(legTo);
    const upper = legFrom.distanceTo(legTo);
    foot.getWorldPosition(legFrom);
    const lower = legFrom.distanceTo(legTo);
    const low = legFrom.y;
    otherFoot.getWorldPosition(legFrom);
    group.getWorldPosition(legTo);
    const ankle = Math.max(0.05, Math.min(0.13, Math.min(low, legFrom.y) - legTo.y));
    let toeLength = 0.12;
    if (toe) {
      foot.getWorldPosition(legFrom);
      toe.getWorldPosition(legTo);
      toeLength = legFrom.distanceTo(legTo);
    }
    // standing, the ball of the foot is on the ground: the line from ankle to it slopes down
    const flat = Math.acos(Math.max(0, Math.min(1, (ankle - 0.03) / toeLength)));
    return { upper, lower, ankle, flat, foot: toeLength + 0.04, hip: ankle + upper + lower };
  }

  // The body `t` seconds into going down: over forwards (`dir` 1) or backwards (-1), the
  // head turning to `side` (±1). Gives the pose (trunk and head turns, and each limb's
  // direction in the body's own frame), the pitch of the whole body, and where its feet
  // (its origin) are, ahead of and above where it stood.
  function collapseAt(t, dir, side, legs) {
    const [t1, t2, t3, t4] = COLLAPSE[dir];
    const { upper, lower, ankle, hip } = legs;
    let pitch; let spine; let neck; let turn = 0; let lean = 0; let flop = 0;
    let hf; let hy; let thighA; let shinA; // the hips ahead and up; thigh and shin from straight down, forward +
    let footA; // the feet: flat to begin with, then pointed back along the shins under the body
    if (dir > 0) {
      let s; // the shins folding forward about the ankles till the knees meet the ground
      let a; // the thighs, leaning forward as the hips sink
      if (t < t1) {
        const e = smooth(t / t1);
        s = (Math.PI / 2) * e;
        a = 0.15 * e + 0.45 * Math.sin(Math.PI * e);
        pitch = 0.12 * e;
        spine = 0.35 * e;
        neck = 0.45 * e;
      } else if (t < t2) {
        // on the knees, the head and shoulders sagging
        const e = smooth((t - t1) / (t2 - t1));
        s = Math.PI / 2;
        a = 0.15 - 0.1 * e;
        pitch = 0.12 + 0.13 * e;
        spine = 0.35 + 0.2 * e;
        neck = 0.45 + 0.15 * e;
      } else {
        // over the knees and down on the face, gathering speed
        const v = Math.min(1, (t - t2) / (t3 - t2));
        const g = v * v;
        s = Math.PI / 2;
        a = 0.05 - 1.5 * g;
        pitch = 0.25 + 1.3 * v ** 1.7;
        spine = 0.55 * (1 - g);
        neck = 0.6 - 0.75 * g;
        turn = side * 1.1 * g;
        lean = side * 0.12 * g;
        flop = g;
        if (t > t3) spine -= 0.08 * Math.sin(Math.PI * Math.min(1, (t - t3) / (t4 - t3))); // the thump
      }
      // the feet roll from flat to pointed back under him, up on the toes as they go over
      const flat = legs.flat || Math.PI / 2;
      footA = -s + flat - (flat - 0.4) * smooth((s / (Math.PI / 2) - 0.3) / 0.7);
      const heel = Math.max(ankle, (legs.foot || 0.15) * Math.cos(footA) + 0.03);
      const kf = lower * Math.sin(s);
      const ky = heel + lower * Math.cos(s);
      hf = kf - upper * Math.sin(a);
      hy = ky + upper * Math.cos(a);
      thighA = a;
      shinA = -s;
    } else {
      let af; // the feet, sliding out in front
      if (t < t1) {
        const e = smooth(t / t1);
        af = 0.5 * e * e;
        hf = -0.1 * e - 0.06 * Math.sin(Math.PI * e);
        hy = hip + (0.13 - hip) * e;
        pitch = -0.25 * e;
        spine = 0.3 * e;
        neck = 0.5 * e;
      } else if (t < t2) {
        // sat on the ground, slumped
        const e = smooth((t - t1) / (t2 - t1));
        af = 0.5 + 0.04 * e;
        hf = -0.1;
        hy = 0.13;
        pitch = -0.25 - 0.15 * e;
        spine = 0.3 - 0.05 * e;
        neck = 0.5;
      } else {
        // back over and flat, the legs sliding straight
        const v = Math.min(1, (t - t2) / (t3 - t2));
        const g = v * v;
        af = 0.54 + 0.3 * smooth(v);
        hf = -0.1;
        hy = 0.13 + 0.01 * g;
        pitch = -0.4 - 1.15 * g;
        spine = 0.25 * (1 - g);
        neck = 0.5 - 0.62 * g;
        turn = side * 0.9 * g;
        lean = side * 0.1 * g;
        flop = g;
        if (t > t3) neck += 0.12 * Math.sin(Math.PI * Math.min(1, (t - t3) / (t4 - t3))); // the head knocks the ground
      }
      // the knee where thigh and shin meet, bent forward of the line from hip to ankle
      const dx = af - hf;
      const dy = ankle - hy;
      const d = Math.min(upper + lower - 1e-3, Math.hypot(dx, dy));
      const bend = Math.acos(Math.max(-1, Math.min(1, (upper * upper + d * d - lower * lower) / (2 * upper * d))));
      thighA = Math.atan2(dx, -dy) + bend;
      const kf = hf + upper * Math.sin(thighA);
      const ky = hy - upper * Math.cos(thighA);
      shinA = Math.atan2(af - kf, ky - ankle);
      footA = shinA + (legs.flat || Math.PI / 2) - 0.35 * flop; // on the heels, toes up, falling slack at the end
    }
    const trail = dir > 0 ? -0.45 * Math.min(1, pitch / 0.5) : 0.15;
    const elbow = dir > 0 ? trail * 0.4 : 0.9; // sat down, the hands fall in the lap
    // a limb at `angle` from straight down in the world is at angle + pitch in the body
    const limb = (angle, x) => new THREE.Vector3(x, -Math.cos(angle + pitch), Math.sin(angle + pitch)).normalize();
    const rest = LIMP[dir];
    const flopped = (key, hang) => {
      // mirrored when the head goes the other way
      const mirror = side < 0 ? { armL: 'armR', armR: 'armL', foreL: 'foreR', foreR: 'foreL' }[key] : key;
      const to = rest[mirror].clone();
      if (side < 0) to.x = -to.x;
      return hang.lerp(to, flop).normalize();
    };
    return {
      pitch,
      hf: hf - hip * Math.sin(pitch), // where the origin (the feet, standing) ends up
      hy: hy - hip * Math.cos(pitch),
      keys: { spine, neck, headTurn: turn, lean, twist: -lean },
      aim: {
        legL: limb(thighA, 0.06), kneeL: limb(shinA, 0.04), legR: limb(thighA, -0.06), kneeR: limb(shinA, -0.04),
        // limp: hanging, and trailing a little behind as the body pitches forward (nobody
        // out cold puts a hand out to save himself)
        armL: flopped('armL', limb(trail, dir > 0 ? 0.2 : 0.3)), foreL: flopped('foreL', limb(elbow, 0.12)),
        armR: flopped('armR', limb(trail, dir > 0 ? -0.2 : -0.3)), foreR: flopped('foreR', limb(elbow, -0.12)),
        footL: limb(footA, 0.05), footR: limb(footA, -0.05),
      },
    };
  }

  // A pedestrian starts going down where it stands, the way the blow sends it.
  function startFall(w, dirX, dirZ, rate = 1) {
    const g = w.group;
    const facing = g.rotation.y;
    w.tipSign = dirX * Math.sin(facing) + dirZ * Math.cos(facing) >= 0 ? 1 : -1;
    w.state = 'fall';
    w.tip = 0;
    w.ct = 0;
    w.fallRate = rate;
    w.side = Math.random() < 0.5 ? 1 : -1;
    w.pose = null;
    g.rotation.x = g.rotation.z = 0;
    const y = w.away ? groundAt(g.position.x, g.position.z, g.position.y + 0.5) : w.gy;
    w.fallAt = { x: g.position.x, y, z: g.position.z, h: facing };
    w.placed = null;
    if (w.skin && !w.legs) {
      const r = walkerRig(w);
      w.legs = measureBody(g, (key) => r[key] && r[key].bone);
    }
    w.plan = null;
  }

  // Places a falling, lying or rising pedestrian `w.ct` seconds into its collapse.
  function placeCollapse(w) {
    const at = w.fallAt;
    if (w.placed && w.placed.ct === w.ct && w.placed.x === at.x && w.placed.z === at.z) return; // lying still
    w.placed = { ct: w.ct, x: at.x, z: at.z };
    const c = collapseAt(w.ct, w.tipSign, w.side, w.legs);
    w.group.position.set(at.x + Math.sin(at.h) * c.hf, at.y + c.hy, at.z + Math.cos(at.h) * c.hf);
    w.group.rotation.set(c.pitch, at.h, 0);
    w.pose = { keys: c.keys, aim: c.aim, weight: 1, lying: true, brace: w.dying ? 0 : w.tipSign, at };
  }

  // Middle of a body lying on the ground (where a kick lands), or of one standing.
  function bodyCentre(w) {
    const g = w.group;
    const up = w.legs ? w.legs.hip + 0.2 : 1.1;
    return { x: g.position.x + Math.sin(g.rotation.y) * Math.sin(g.rotation.x) * up, z: g.position.z + Math.cos(g.rotation.y) * Math.sin(g.rotation.x) * up };
  }

  // --- getting up again ---

  // Bends a two-bone limb (thigh, shin and ankle; or upper arm, forearm and wrist) so its
  // end gets to `target` in the world, the knee or elbow out toward `pole`.
  const reachRoot = new THREE.Vector3();
  const reachMid = new THREE.Vector3();
  const reachEnd = new THREE.Vector3();
  const reachLine = new THREE.Vector3();
  const reachBend = new THREE.Vector3();
  const reachGoal = new THREE.Vector3();
  const reachDir = new THREE.Vector3();
  function reachFor(upper, mid, end, target, pole, weight = 1) {
    if (!upper || !mid || !end || weight <= 0) return;
    upper.getWorldPosition(reachRoot);
    mid.getWorldPosition(reachMid);
    end.getWorldPosition(reachEnd);
    const l1 = reachRoot.distanceTo(reachMid);
    const l2 = reachMid.distanceTo(reachEnd);
    reachLine.copy(target).sub(reachRoot);
    const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, reachLine.length()));
    reachLine.normalize();
    const along = (l1 * l1 + d * d - l2 * l2) / (2 * d);
    const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    reachBend.copy(pole).addScaledVector(reachLine, -pole.dot(reachLine));
    if (reachBend.lengthSq() < 1e-8) reachBend.set(0, 1, 0);
    reachBend.normalize();
    reachGoal.copy(reachRoot).addScaledVector(reachLine, d); // as near the target as the limb reaches
    reachDir.copy(reachLine).multiplyScalar(along).addScaledVector(reachBend, out).normalize();
    aimTowards(upper, mid, scene, reachDir, weight);
    mid.getWorldPosition(reachMid);
    reachDir.copy(reachGoal).sub(reachMid).normalize();
    aimTowards(mid, end, scene, reachDir, weight);
  }

  // Points about someone down at `at` ({ x, y, z, h }): x to their left, f ahead, y up.
  function fromFacing(at, x, f, y, out) {
    const s = Math.sin(at.h);
    const c = Math.cos(at.h);
    return out.set(at.x + c * x + s * f, at.y + y, at.z - s * x + c * f);
  }
  function toFacing(at, v) {
    const s = Math.sin(at.h);
    const c = Math.cos(at.h);
    const dx = v.x - at.x;
    const dz = v.z - at.z;
    return [dx * c - dz * s, dx * s + dz * c, v.y - at.y];
  }

  // How a body is built, in metres: legs (see measureLegs), the trunk from hips to
  // shoulders, and the arm to the wrist.
  function measureBody(group, bone) {
    const need = ['legL', 'legR', 'kneeL', 'footL', 'footR', 'armL', 'armR', 'foreL', 'handL'];
    if (need.some((key) => !bone(key))) return null;
    const body = measureLegs(group, bone('legL'), bone('kneeL'), bone('footL'), bone('footR'), bone('toeL'));
    const at = (key) => bone(key).getWorldPosition(new THREE.Vector3());
    const hips = at('legL').add(at('legR')).multiplyScalar(0.5);
    const shoulders = at('armL').add(at('armR')).multiplyScalar(0.5);
    body.torso = hips.distanceTo(shoulders);
    body.arm = at('armL').distanceTo(at('foreL')) + at('foreL').distanceTo(at('handL'));
    return body;
  }

  // Where a body lying (or going down) at `at` is now: its hips and pitch from how it is
  // placed, its feet and hands from the bones; the get-up starts from exactly there.
  const sampled = new THREE.Vector3();
  function sampleBody(group, bone, at, legs, keys) {
    group.updateMatrixWorld(true);
    const origin = toFacing(at, group.position);
    const pitch = group.rotation.x;
    const p = (key) => toFacing(at, bone(key).getWorldPosition(sampled));
    const footA = ['L', 'R'].map((s) => {
      const foot = p(`foot${s}`);
      const toe = bone(`toe${s}`) ? p(`toe${s}`) : [foot[0], foot[1] + 0.1, foot[2]];
      return Math.atan2(toe[1] - foot[1], foot[2] - toe[2]);
    });
    return {
      hip: [origin[1] + legs.hip * Math.sin(pitch), origin[2] + legs.hip * Math.cos(pitch)],
      pitch,
      feet: [p('footL'), p('footR')],
      footA,
      hands: [p('handL'), p('handR')],
      keys: { spine: 0, neck: 0, headTurn: 0, lean: 0, twist: 0, ...keys },
      w: 1,
    };
  }

  // The way up, as a list of moments eased one into the next. Each places the hips (and
  // the pitch of the body), both feet (and which way the toes point), both hands, and the
  // trunk and head. Face down (`dir` 1) he gets his hands under his shoulders, pushes up,
  // draws his knees in onto all fours, brings one foot through to kneel on the other
  // knee, pushes up off that knee with a hand on it, and stands. On his back (-1) he sits
  // up leaning on his hands, draws his feet in, rocks forward onto hands and feet, pushes
  // up off his knees, and stands. Then he looks himself over and brushes the dust off his
  // legs and shoulder before he walks on.
  function getUpPlan(dir, start, b) {
    const { upper: U, lower: L, ankle: A, hip: H, torso: T, arm: R } = b;
    const F = b.flat || Math.PI / 2; // a foot flat on the ground
    const keys = [{ t: 0, ...start }];
    const zero = { spine: 0, neck: 0, headTurn: 0, lean: 0, twist: 0 };
    const at = (t, change) => {
      const last = keys[keys.length - 1];
      keys.push({ ...last, ...change, keys: { ...last.keys, ...(change.keys || {}) }, t });
    };
    const hang = (f, hipY) => [[0.21, f + 0.05, hipY + T - R * 0.97], [-0.21, f + 0.05, hipY + T - R * 0.97]];
    let stand; // where he ends up on his feet
    let t;
    if (dir > 0) {
      const hf = start.hip[0];
      const plant = hf + T - 0.04; // hands flat under the shoulders
      const hq = A + U * 0.96; // the hips on all fours
      const pq = Math.acos(Math.max(-0.3, Math.min(0.3, (R * 0.9 + 0.06 - hq) / T))); // trunk about level, shoulders over the hands
      const kq = plant - 0.06 - T * Math.sin(pq); // knees, and hips, under that
      stand = kq + U * 0.95; // where the front foot goes down
      const kneelY = A + U;
      at(0.4, { hands: [[0.26, plant, 0.075], [-0.26, plant, 0.075]], keys: { ...zero, neck: -0.35 } }); // comes to: hands under him, head up
      at(0.9, { hip: [hf, 0.19], pitch: 1.08, keys: { spine: -0.12, neck: -0.25 } }); // pushes up on his arms
      at(1.45, { hip: [kq, hq], pitch: pq, feet: [[0.1, kq - L, A], [-0.1, kq - L, A]], footA: [-1.17, -1.17], keys: { spine: 0.1, neck: -0.15 } }); // knees in: all fours
      at(1.85, { hip: [kq - 0.03, hq], pitch: pq - 0.25, feet: [[0.1, kq - L, A], [-0.13, kq + 0.08, 0.28]], footA: [-1.17, 0.9] }); // one knee drawn up under him
      at(2.3, { hip: [kq + 0.02, kneelY], pitch: 0.32, feet: [[0.1, kq - L + 0.02, A], [-0.13, stand, A]], footA: [-1.17, F],
        hands: [[0.16, kq + 0.1, A + U * 0.6], [-0.13, stand - 0.04, A + L + 0.07]], keys: { spine: 0.2, neck: 0.1 } }); // on one knee, a hand on the other
      at(2.9, { hip: [kq + U * 0.5, H * 0.78], pitch: 0.42, feet: [[0.1, kq - L + 0.12, A + 0.04], [-0.13, stand, A]], footA: [-0.75, F],
        hands: [[0.2, kq + U * 0.5 + 0.05, H * 0.55], [-0.12, stand - 0.1, A + L + 0.12]], keys: { spine: 0.25, neck: 0.15 } }); // pushing up off the knee
      at(3.35, { hip: [stand - 0.06, H * 0.96], pitch: 0.12, feet: [[0.11, stand - 0.18, A + 0.1], [-0.12, stand, A]], footA: [F - 0.3, F],
        hands: hang(stand - 0.06, H * 0.96), keys: { spine: 0.08, neck: 0.05 } }); // up, the back foot coming through
      t = 3.7;
    } else {
      const hb = start.hip[0];
      stand = hb + 0.36;
      at(0.45, { hands: [[0.34, hb - 0.08, 0.075], [-0.34, hb - 0.08, 0.075]], keys: { ...zero, neck: 0.35 } }); // head up, hands to the ground beside him
      at(1.05, { hip: [hb, 0.14], pitch: -0.3, feet: [[0.11, hb + 0.62, A], [-0.11, hb + 0.62, A]], footA: [2.4, 2.4],
        hands: [[0.27, hb - 0.24, 0.075], [-0.27, hb - 0.24, 0.075]], keys: { spine: 0.3, neck: 0.2 } }); // sits up, leaning back on his hands
      at(1.6, { hip: [hb + 0.02, 0.14], pitch: 0.4, feet: [[0.12, stand, A], [-0.12, stand, A]], footA: [F, F],
        hands: [[0.3, hb + 0.3, 0.075], [-0.3, hb + 0.3, 0.075]], keys: { spine: 0.35, neck: 0.2 } }); // feet drawn in, hands down in front
      at(2.2, { hip: [hb + 0.18, 0.35], pitch: 1.05, hands: [[0.24, hb + 0.6, 0.075], [-0.24, hb + 0.6, 0.075]], keys: { spine: 0.3, neck: 0.1 } }); // rocks forward onto hands and feet
      at(2.75, { hip: [hb + 0.3, H * 0.66], pitch: 0.55, hands: [[0.13, hb + 0.5, A + L * 0.9], [-0.13, hb + 0.5, A + L * 0.9]], keys: { spine: 0.25, neck: 0.15 } }); // hands on his knees, pushing up
      t = 3.25;
    }
    // standing
    at(t, { hip: [stand, H], pitch: 0, feet: [[0.11, stand, A], [-0.11, stand, A]], footA: [F, F], hands: hang(stand, H), keys: zero });
    const dustFrom = t;
    // looks himself over and brushes the dust off: the thighs, a hand and then the other,
    // then the chest and shoulder
    const top = H * 0.97; // the wrists (the fingers reach further down the thighs)
    const low = H * 0.8;
    const front = stand + 0.2;
    const loose = hang(stand, H)[0];
    at(t + 0.3, { pitch: 0.12, hands: [[0.12, front, top], [-0.12, front, top]], keys: { spine: 0.45, neck: 0.5 } });
    at(t + 0.55, { hands: [[0.12, front + 0.03, low], [-0.12, front, top]] });
    at(t + 0.8, { hands: [[0.12, front, top], [-0.12, front + 0.03, low]] });
    at(t + 1.05, { hands: [[0.12, front + 0.03, low], [-0.12, front, top]] });
    at(t + 1.3, { pitch: 0.03, hands: [loose, [0.1, stand + 0.17, H + T * 0.78]], keys: { spine: 0.1, neck: 0.35, twist: 0.25, headTurn: 0.35 } });
    at(t + 1.5, { hands: [loose, [0.2, stand + 0.12, H + T * 0.88]] });
    at(t + 1.7, { hands: [loose, [0.08, stand + 0.18, H + T * 0.72]] });
    at(t + 2.15, { pitch: 0, hands: hang(stand, H), keys: zero });
    at(t + 2.45, { w: 0 }); // and back to himself
    return { keys, stand, dustFrom, end: t + 2.45 };
  }

  // The plan at `g` seconds: each moment eased into the next.
  function getUpAt(plan, g) {
    const ks = plan.keys;
    let i = 1;
    while (i < ks.length - 1 && ks[i].t < g) i++;
    const a = ks[i - 1];
    const b = ks[i];
    const k = smooth((g - a.t) / Math.max(1e-3, b.t - a.t));
    const mix = (x, y) => x + (y - x) * k;
    const mix3 = (p, q) => [mix(p[0], q[0]), mix(p[1], q[1]), mix(p[2], q[2])];
    const keys = {};
    for (const key of Object.keys(b.keys)) keys[key] = mix(a.keys[key] || 0, b.keys[key]);
    return {
      hip: [mix(a.hip[0], b.hip[0]), mix(a.hip[1], b.hip[1])],
      pitch: mix(a.pitch, b.pitch),
      feet: [mix3(a.feet[0], b.feet[0]), mix3(a.feet[1], b.feet[1])],
      footA: [mix(a.footA[0], b.footA[0]), mix(a.footA[1], b.footA[1])],
      hands: [mix3(a.hands[0], b.hands[0]), mix3(a.hands[1], b.hands[1])],
      keys,
      w: mix(a.w, b.w),
    };
  }

  // Sets a body getting up: where it is placed and pitched, and its pose (trunk and head
  // turns, and feet and hands reached for).
  function getUpPose(plan, g, at, legs, group) {
    const s = getUpAt(plan, g);
    fromFacing(at, 0, s.hip[0] - legs.hip * Math.sin(s.pitch), s.hip[1] - legs.hip * Math.cos(s.pitch), group.position);
    group.rotation.set(s.pitch, at.h, 0);
    return { keys: s.keys, ik: { at, feet: s.feet, footA: s.footA, hands: s.hands, w: s.w }, weight: s.w, lying: true, hipF: s.hip[0] };
  }

  // Reaches the feet and hands of a pose to where it wants them, and points the toes.
  const reachTarget = new THREE.Vector3();
  const reachPole = new THREE.Vector3();
  const reachQ = new THREE.Quaternion();
  const toeDir = new THREE.Vector3();
  function applyReach(group, bone, ik) {
    const w = ik.w;
    if (w <= 0.001) return;
    group.getWorldQuaternion(reachQ);
    const pole = (x, y, z) => reachPole.set(x, y, z).applyQuaternion(reachQ);
    const s = Math.sin(ik.at.h);
    const c = Math.cos(ik.at.h);
    // knees bend forward and up whichever way the body lies: forward when standing or
    // kneeling, up when sitting or flat
    const knee = (sign) => reachPole.set(c * sign * 0.12 + s, 0.4, -s * sign * 0.12 + c);
    ['L', 'R'].forEach((side, i) => {
      const sign = i ? -1 : 1;
      const [x, f, y] = ik.feet[i];
      reachFor(bone(`leg${side}`), bone(`knee${side}`), bone(`foot${side}`), fromFacing(ik.at, x, f, y, reachTarget), knee(sign), w);
      if (bone(`toe${side}`)) {
        const a = ik.footA[i];
        const lx = sign * 0.04;
        toeDir.set(c * lx + s * Math.sin(a), -Math.cos(a), -s * lx + c * Math.sin(a)).normalize();
        aimTowards(bone(`foot${side}`), bone(`toe${side}`), scene, toeDir, w);
      }
    });
    ['L', 'R'].forEach((side, i) => {
      const sign = i ? -1 : 1;
      const [x, f, y] = ik.hands[i];
      reachFor(bone(`arm${side}`), bone(`fore${side}`), bone(`hand${side}`), fromFacing(ik.at, x, f, y, reachTarget), pole(sign * 0.8, -0.15, -0.55), w);
      // a hand on the ground lies flat, fingers forward and a little out
      if (y < 0.2 && bone(`finger${side}`)) {
        const lx = sign * 0.35;
        toeDir.set(c * lx + s, -0.12, -s * lx + c).normalize();
        aimTowards(bone(`hand${side}`), bone(`finger${side}`), scene, toeDir, w * smooth((0.2 - y) / 0.1));
      }
    });
  }

  // Going down conscious, the hands go out to break the fall: each reaches for the
  // ground just ahead of (or, going over backwards, behind) its shoulder once it can.
  const braceAt = new THREE.Vector3();
  function braceHands(group, bone, at, dir) {
    group.getWorldQuaternion(reachQ);
    const s = Math.sin(at.h);
    const c = Math.cos(at.h);
    ['L', 'R'].forEach((side, i) => {
      const sign = i ? -1 : 1;
      const shoulder = bone(`arm${side}`);
      const fore = bone(`fore${side}`);
      const hand = bone(`hand${side}`);
      if (!shoulder || !fore || !hand) return;
      shoulder.getWorldPosition(braceAt);
      const arm = braceAt.distanceTo(fore.getWorldPosition(reachMid)) + reachMid.distanceTo(hand.getWorldPosition(reachEnd));
      const height = braceAt.y - at.y;
      const k = smooth((arm * 1.3 - height) / (arm * 0.5));
      if (k <= 0) return;
      const ahead = dir * 0.2;
      const lx = sign * 0.1;
      braceAt.x += c * lx + s * ahead;
      braceAt.z += -s * lx + c * ahead;
      braceAt.y = at.y + 0.075;
      reachFor(shoulder, fore, hand, braceAt, reachPole.set(sign * 0.8, -0.15, -0.55).applyQuaternion(reachQ), k);
      if (bone(`finger${side}`)) {
        const fx = sign * 0.35;
        toeDir.set(c * fx + s * dir, -0.12, -s * fx + c * dir).normalize();
        aimTowards(hand, bone(`finger${side}`), scene, toeDir, k);
      }
    });
  }

  // A pose on top of a pedestrian's clips, in the same terms as the hero's: each limb
  // turned about an axis of the body's own frame (x its left, y up, z forward).
  const WALKER_BONES = {
    spine: 'Bip01_Spine', legL: 'Bip01_L_Thigh', kneeL: 'Bip01_L_Calf', legR: 'Bip01_R_Thigh', kneeR: 'Bip01_R_Calf',
    armL: 'Bip01_L_UpperArm', foreL: 'Bip01_L_Forearm', armR: 'Bip01_R_UpperArm', foreR: 'Bip01_R_Forearm',
    spine2: 'Bip01_Spine2', neck: 'Bip01_Neck', handL: 'Bip01_L_Hand', handR: 'Bip01_R_Hand', footL: 'Bip01_L_Foot', footR: 'Bip01_R_Foot',
    toeL: 'Bip01_L_Toe0', toeR: 'Bip01_R_Toe0', fingerL: 'Bip01_L_Finger2', fingerR: 'Bip01_R_Finger2',
  };
  function walkerRig(w) {
    if (!w.rig) {
      w.rig = {};
      for (const [key, name] of Object.entries(WALKER_BONES)) {
        const bone = w.group.getObjectByName(name);
        if (bone) w.rig[key] = { bone, base: new THREE.Quaternion(), out: null };
      }
    }
    return w.rig;
  }

  function poseWalker(w, pose) {
    walkerRig(w);
    // as for the hero: start each frame from what the clip last gave each bone
    for (const e of Object.values(w.rig)) {
      if (e.out && e.bone.quaternion.equals(e.out)) e.bone.quaternion.copy(e.base);
      else e.base.copy(e.bone.quaternion);
    }
    if (pose) {
      const r = w.rig;
      const g = w.group;
      const turn = (e, ax, ay, az, angle) => {
        if (e && angle && Math.abs(angle) > 1e-4) turnJoint(e.bone, g, ax, ay, az, angle);
      };
      turn(r.spine, 1, 0, 0, pose.spine);
      turn(r.legR, 1, 0, 0, pose.legR);
      turn(r.legR, 0, 0, 1, -(pose.legSplay || 0));
      turn(r.kneeR, 1, 0, 0, pose.kneeR);
      turn(r.legL, 1, 0, 0, pose.legL);
      turn(r.legL, 0, 0, 1, pose.legSplay || 0);
      turn(r.kneeL, 1, 0, 0, pose.kneeL);
      turn(r.armR, 1, 0, 0, pose.armR);
      turn(r.armR, 0, 0, 1, -(pose.armSplay || 0));
      turn(r.foreR, 1, 0, 0, pose.foreR);
      turn(r.armL, 1, 0, 0, pose.armL);
      turn(r.armL, 0, 0, 1, pose.armSplay || 0);
      turn(r.foreL, 1, 0, 0, pose.foreL);
      // a fight pose: keys for the body, and limbs pointed
      if (pose.keys) {
        const k = pose.keys;
        const wgt = pose.weight ?? 1;
        const moving = !pose.lying && (w.actMove || 0) > 0.3;
        const legs = moving ? 0.25 : 1;
        turn(r.spine, 1, 0, 0, (k.spine || 0) * wgt);
        turn(r.spine2, 0, 1, 0, (k.twist || 0) * wgt);
        turn(r.spine, 0, 0, 1, (k.lean || 0) * wgt);
        turn(r.neck, 1, 0, 0, (k.neck || 0) * wgt);
        turn(r.neck, 0, 1, 0, (k.headTurn || 0) * wgt);
        turn(r.legL, 1, 0, 0, (k.legL || 0) * wgt * legs);
        turn(r.kneeL, 1, 0, 0, (k.kneeL || 0) * wgt * legs);
        turn(r.legR, 1, 0, 0, (k.legR || 0) * wgt * legs);
        turn(r.kneeR, 1, 0, 0, (k.kneeR || 0) * wgt * legs);
        turn(r.legL, 0, 0, 1, (k.legSplay || 0) * wgt * legs);
        turn(r.legR, 0, 0, 1, -(k.legSplay || 0) * wgt * legs);
        for (const [key, child] of AIMED) {
          const dir = pose.aim && pose.aim[key];
          if (!dir || !r[key] || !r[child] || ((key.startsWith('leg') || key.startsWith('knee')) && moving)) continue;
          aimTowards(r[key].bone, r[child].bone, g, dir, wgt);
        }
        const bone = (key) => r[key] && r[key].bone;
        if (pose.ik) applyReach(g, bone, pose.ik);
        if (pose.brace) braceHands(g, bone, pose.at, pose.brace);
      }
    }
    for (const e of Object.values(w.rig)) {
      if (!e.out) e.out = new THREE.Quaternion();
      e.out.copy(e.bone.quaternion);
    }
  }

  // A point on a walker's round of the block, `s` metres along it, `h` out from the
  // middle of the block (the round grows or shrinks as a whole, so corners stay joined).
  const loopAt = { x: 0, z: 0, edge: 0 };
  const loopAhead = { x: 0, z: 0, edge: 0 };
  function loopPoint(w, s, h, out) {
    const side = w.half * 2;
    const lap = side * 4;
    s = ((s % lap) + lap) % lap;
    const edge = Math.floor(s / side);
    const r = ((s % side) - w.half) * (h / w.half);
    const [dx, dz] = DIRS[edge];
    out.x = w.cx + dx * r + dz * h;
    out.z = w.cz + dz * r - dx * h;
    out.edge = edge;
    return out;
  }

  // Is there something solid at (x, z) a person standing at height y would walk into?
  function walkerBlocked(x, z, y) {
    for (const box of collidersNear(x, z, 0.4)) {
      if ((box.minY ?? -Infinity) > y + 1.5 || (box.top ?? box.maxY ?? Infinity) <= y + STEP_UP) continue;
      if (boxContact(box, x, z, 0.32)) return true;
    }
    if (mode === 'car' && player && Math.abs(car.y - y) < 1.5) {
      const { hl, hw } = player.dims;
      const reach = hl + hw;
      const box = { minX: car.x - reach, maxX: car.x + reach, minZ: car.z - reach, maxZ: car.z + reach, car: { x: car.x, z: car.z, h: car.heading, hl, hw } };
      if (boxContact(box, x, z, 0.32)) return true;
    }
    return false;
  }

  // How far in or out of its usual line a walker should be: to the right of anyone in
  // its way ahead (they do the same, so people pass each other), and wherever the next
  // half metre is clear of anything solid. Null when there is no way past at all.
  function walkerWay(w) {
    const sign = Math.sign(w.speed) || 1;
    const base = loopPoint(w, w.s, w.half, loopAt);
    const [dx, dz] = DIRS[base.edge];
    const fx = dx * sign;
    const fz = dz * sign;
    const nx = dz; // outward, toward the road
    const nz = -dx;
    const me = w.group.position;
    let want = 0;
    let nearest = 3.4;
    const consider = (x, z) => {
      const along = (x - me.x) * fx + (z - me.z) * fz;
      if (along < 0.05 || along > nearest) return;
      const lat = (x - base.x) * nx + (z - base.z) * nz;
      if (Math.abs(lat - (w.dodge || 0)) > 0.8) return;
      nearest = along;
      want = lat - sign * 0.72; // pass them on this walker's right
    };
    for (const o of walkers) {
      if (o === w || !onFeet(o)) continue;
      const q = o.group.position;
      if (Math.abs(q.x - me.x) > 3.6 || Math.abs(q.z - me.z) > 3.6 || Math.abs(q.y - me.y) > 1) continue;
      consider(q.x, q.z);
    }
    if (mode === 'foot' && !hero.dead) consider(car.x, car.z);
    for (const t of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.8, -0.8, 1]) {
      const lat = Math.max(-0.9, Math.min(1, want + t));
      const at = loopPoint(w, w.s + sign * 0.5, w.half + lat, loopAhead);
      if (!walkerBlocked(at.x, at.z, w.gy)) return lat;
    }
    return null;
  }

  function updateWalkers(dt) {
    for (const w of walkers) {
      const g = w.group;
      if (w.state === 'walk') {
        // Round the block, keeping clear of posts, trees, benches and the like and stepping
        // aside for people (see walkerWay); with the way shut, it waits.
        let step = w.speed * dt;
        if (g.visible) {
          w.lookT = (w.lookT || 0) - dt;
          if (w.lookT <= 0) {
            w.lookT = rand(0.12, 0.22);
            w.want = walkerWay(w);
          }
          if (w.want === null) step = 0;
        } else {
          w.want = 0;
        }
        w.dodge = approach(w.dodge || 0, w.want ?? w.dodge ?? 0, 1.6 * dt);
        const side = w.half * 2;
        const lap = side * 4;
        w.s = (((w.s + step) % lap) + lap) % lap;
        // edge 0 runs +x along the block's -z side, then each edge turns right
        const p = loopPoint(w, w.s, w.half + w.dodge, loopAt);
        const [dx, dz] = DIRS[p.edge];
        const sign = Math.sign(w.speed);
        g.position.set(p.x, w.gy, p.z);
        g.rotation.set(0, Math.atan2(dx * sign, dz * sign), 0);
        w.paused = step === 0;
        w.phase += Math.abs(step) * w.stride;
      } else if (updateFighter(w, dt)) {
        // squared up to the hero, or running from him (see updateFighter)
      } else if (updateJacked(w, dt)) {
        // the driver whose car was taken (see updateJacked)
      } else {
        w.timer -= dt;
        if (w.state === 'stagger') {
          // a flinch away from the blow, then carry on
          g.rotation.x = w.tipSign * Math.sin((1 - Math.max(0, w.timer) / 0.7) * Math.PI) * 0.22;
          if (w.timer <= 0) {
            w.state = w.afterStagger || (w.away ? 'goto' : 'walk');
            if (w.state === 'flee') w.timer = rand(7, 11);
            w.afterStagger = null;
          }
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
            if (d > 2) stepWalker(w, (dx / d) * step, (dz / d) * step);
            else {
              g.position.x += (dx / d) * step;
              g.position.z += (dz / d) * step;
              g.position.y = w.gy - (w.gy - w.baseY) * Math.min(1, d / 2); // up the kerb at the end
            }
            g.rotation.set(0, Math.atan2(dx, dz), 0);
          }
        } else if (w.state === 'fall') {
          if (w.legs) {
            // knees, then the ground (see collapseAt)
            w.ct += dt * (w.fallRate || 1);
            w.tip = Math.min(1, w.ct / collapseEnd(w.tipSign));
          } else {
            w.tip = Math.min(1, w.tip + (0.9 + 4 * w.tip) * dt); // slow to start, then drops
          }
          if (w.tip >= 1) {
            w.state = w.dying ? 'dead' : 'down';
            w.timer = w.dying ? 30 : rand(4, 7);
          }
        } else if (w.state === 'down') {
          if (w.timer <= 0) {
            w.state = 'rise';
            if (w.legs && w.legs.torso && w.fallAt) {
              // up step by step from just as they lie (see getUpPlan)
              const r = walkerRig(w);
              w.plan = getUpPlan(w.tipSign, sampleBody(g, (key) => r[key] && r[key].bone, w.fallAt, w.legs, w.pose && w.pose.keys), w.legs);
              w.g = 0;
            }
          }
        } else if (w.state === 'rise') {
          let up;
          if (w.plan) {
            w.g += dt;
            up = w.g >= w.plan.end;
            if (!up) w.pose = getUpPose(w.plan, w.g, w.fallAt, w.legs, g);
          } else {
            // up the way they went down
            if (w.legs) w.ct = Math.max(0, w.ct - dt * 0.75);
            w.tip = w.legs ? w.ct / collapseEnd(w.tipSign) : Math.max(0, w.tip - 0.8 * dt);
            up = w.tip <= 0;
          }
          if (up) {
            w.state = w.away ? 'goto' : 'walk';
            if (w.legs && w.fallAt) {
              const stand = fromFacing(w.fallAt, 0, w.plan ? w.plan.stand : 0, 0, new THREE.Vector3());
              g.position.copy(stand);
              g.rotation.set(0, w.fallAt.h, 0);
              w.pose = null;
              w.baseY = w.fallAt.y;
              if (w.plan) {
                // a step or so from their path: back to it
                w.away = true;
                setPavementGoal(w, stand.x, stand.z);
                w.state = 'goto';
              }
              w.plan = null;
            }
            if (w.isPerson && !w.limping) {
              w.limping = true; // hurt: slower from now on
              w.speed *= 0.6;
            }
          }
        } else if (w.timer <= 0) {
          // 'dead': after a while the body is cleared and someone new walks another street
          const block = pick(cityBlocks);
          Object.assign(w, { cx: block.x, gy: block.y, cz: block.z, s: Math.random() * w.half * 8,
            health: 100, state: 'walk', tip: 0, ct: 0, dying: false, limping: false, away: false, pose: null, fallAt: null });
          w.speed = rand(1.1, 1.8) * Math.sign(w.speed);
        }
        if (w.state !== 'stagger' && w.state !== 'goto' && w.state !== 'walk') {
          if (w.plan) {
            // placed by its get-up (above)
          } else if (w.legs && w.fallAt) {
            placeCollapse(w);
          } else {
            g.rotation.x = w.tipSign * w.tip * Math.PI / 2;
            g.position.y = (w.away ? w.baseY : w.gy) + 0.14 * w.tip; // lying on the ground, not sunk into it
          }
        }
      }

      // in a scene or after a car they move as they are moved, legs at the pace they really go
      const scripted = ['act', 'stumble', 'stunned', 'chase', 'fight', 'flee'].includes(w.state);
      const walking = w.state === 'walk' || w.state === 'goto';
      const pace = scripted ? w.actSpeed || 0 : w.state === 'goto' ? 2.3 : Math.abs(w.speed);
      w.moving += ((scripted ? w.actMove || 0 : walking && !(w.state === 'walk' && w.paused) ? 1 : 0) - w.moving) * Math.min(1, 10 * dt);
      w.running = (w.running || 0) + ((Math.abs(pace) > 3 ? 1 : 0) - (w.running || 0)) * Math.min(1, 6 * dt);
      if (w.skin) {
        // only people near the player are drawn and animated
        g.visible = Math.abs(g.position.x - car.x) < 140 && Math.abs(g.position.z - car.z) < 140;
        if (g.visible) {
          const run = w.skin.run ? w.running : 0;
          w.skin.walk.setEffectiveWeight(w.moving * (1 - run));
          if (w.skin.run) {
            w.skin.run.setEffectiveWeight(w.moving * run);
            w.skin.run.timeScale = Math.max(0.6, Math.abs(pace) / 4.3); // the run clip covers about 4.3 m/s at this size
          }
          w.skin.idle.setEffectiveWeight(1 - w.moving);
          // feet in step with the ground (a negative pace steps backwards)
          w.skin.walk.timeScale = Math.sign(pace || 1) * Math.max(0.45, Math.abs(pace) / 1.45);
          if (!((w.state === 'dead' || w.state === 'down') && w.legs)) w.skin.mixer.update(dt); // lying still
          if (w.pose || w.rig) poseWalker(w, w.pose);
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
      terrainExact(x, z);
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
        } while (naturalHeight(x, z) < 6 || (terrainExact(x, z), roadDist < 12));
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
      a.group.visible = (a.x - camera.position.x) ** 2 + (a.z - camera.position.z) ** 2 < 230 * 230;
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
      for (const box of collidersNear(p.x, p.z, 1.4).concat(trafficBoxes)) {
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

  // Everyone on their feet near the player's car, as a small box it bumps against when it
  // only creeps into them (faster, it knocks them down: see checkPedestrianHits).
  function peopleBoxes() {
    if (mode !== 'car' || Math.hypot(car.vx, car.vz) >= 3) return [];
    const list = [];
    for (const w of walkers) {
      if (!onFeet(w)) continue;
      const p = w.group.position;
      if (Math.abs(p.x - car.x) > 6 || Math.abs(p.z - car.z) > 6 || Math.abs(p.y - car.y) > 1.5) continue;
      list.push({ minX: p.x - 0.3, maxX: p.x + 0.3, minZ: p.z - 0.3, maxZ: p.z + 0.3, maxY: p.y + 1.8 });
    }
    return list;
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

  // One picture of the whole world is drawn once at a pixel per metre. The round minimap
  // shows the part around the player; the full map shows all of it and takes clicks to set
  // a waypoint. Seen from above with +z up the screen, +x runs left.
  const MAP_WORLD = { minX: -800, maxX: 800, minZ: -620, maxZ: 940 };
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

    // the land: hills paler toward their tops, the lake and its beaches
    const picture = g.getImageData(0, 0, mapBase.width, mapBase.height);
    const px = picture.data;
    for (let y = 0; y < mapBase.height; y += 2) {
      for (let x = 0; x < mapBase.width; x += 2) {
        const wx = MAP_WORLD.maxX - x;
        const wz = MAP_WORLD.maxZ - y;
        const h = terrain(wx, wz);
        const edge = lakeEdge(wx, wz);
        let c = null;
        if (edge < 0) c = [62, 120, 168];
        else if (edge < 9) c = [214, 196, 150];
        else if (h > 1) {
          const k = Math.min(1, h / 70);
          c = [95 + 110 * k, 154 + 32 * k, 85 + 60 * k];
        }
        if (!c) continue;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((y + dy) * mapBase.width + x + dx) * 4;
            px[i] = c[0];
            px[i + 1] = c[1];
            px[i + 2] = c[2];
          }
        }
      }
    }
    g.putImageData(picture, 0, 0);

    // roads beyond the grid, and the highway
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = '#3d424b';
    for (const road of ribbons) {
      g.lineWidth = road.half * 2;
      g.beginPath();
      road.points.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](baseX(p.x), baseY(p.z)));
      g.stroke();
    }
    g.fillStyle = '#3d424b';
    g.fillRect(baseX(HIGHWAY.end), baseY(HIGHWAY.z + HIGHWAY.half), HIGHWAY.end * 2, HIGHWAY.half * 2);
    g.fillStyle = '#e9c46a';
    g.fillRect(baseX(HIGHWAY.end), baseY(HIGHWAY.z) - 1, HIGHWAY.end * 2, 2);
    g.beginPath();
    g.arc(baseX(-38), baseY(510), 13, 0, Math.PI * 2);
    g.fill();

    // the city: its roads, and each block coloured by what it holds
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
        const district = districtOf(bx, bz);
        g.fillStyle = isLot ? '#2c5fa8' : isParkade ? '#1b3f73'
          : bx === STATION_BLOCK[0] && bz === STATION_BLOCK[1] ? '#b9bec6'
            : district === 'houses' ? '#9cc28a' : district === 'towers' ? '#9097a2' : district === 'industrial' ? '#b3aa98' : '#a9aeb6';
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

    // the mall and its car park
    g.fillStyle = '#2c5fa8';
    g.fillRect(baseX(MALL_LOT.maxX), baseY(MALL_LOT.maxZ), MALL_LOT.maxX - MALL_LOT.minX, MALL_LOT.maxZ - MALL_LOT.minZ);
    g.fillStyle = '#c9b48a';
    g.fillRect(baseX(MALL.maxX), baseY(MALL.maxZ), MALL.maxX - MALL.minX, MALL.maxZ - MALL.minZ);
    g.fillStyle = '#fff';
    g.fillText('P', baseX((MALL_LOT.minX + MALL_LOT.maxX) / 2), baseY((MALL_LOT.minZ + MALL_LOT.maxZ) / 2));

    // the metro: a blue line with its stations
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.beginPath();
    metroLine.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](baseX(p.x), baseY(p.z)));
    g.stroke();
    g.strokeStyle = '#1f6fd6';
    g.lineWidth = 5;
    g.stroke();
    for (const st of STATIONS) {
      const p = metroPoint(st.s);
      g.fillStyle = '#1f6fd6';
      g.beginPath();
      g.arc(baseX(p.x), baseY(p.z), 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 14px system-ui, sans-serif';
      g.fillText('M', baseX(p.x), baseY(p.z) + 1);
    }

    g.fillStyle = '#fff';
    g.font = 'bold 22px system-ui, sans-serif';
    g.fillText('LOOKOUT', baseX(HILLS[0].x), baseY(HILLS[0].z) - 34);
    g.fillText('LAKE', baseX(430), baseY(480));
    g.fillText('MALL', baseX(-420), baseY(30));
    g.fillText('HIGHWAY', baseX(-420), baseY(HIGHWAY.z + 26));
  }

  // --- waypoint and route ---

  let waypoint = null; // { x, z } once set from the full map
  let route = []; // [x, y, z] points from the player to the waypoint, along the roads
  let routeTimer = 0;
  let wayBeacon = null;

  // Works out the way from the player to the waypoint along the roads: the shortest path
  // through the road network from the nearest point on it to the one nearest the waypoint.
  function planRoute() {
    const path = findPath(nearestNode(car.x, car.z), nearestNode(waypoint.x, waypoint.z));
    const points = [[car.x, car.y, car.z]];
    for (const node of path) points.push([node.x, node.y, node.z]);
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
    spine2: 'Spine2', neck: 'Neck', handL: 'LeftHand', footR: 'RightFoot', footL: 'LeftFoot',
    toeR: 'RightToeBase', toeL: 'LeftToeBase', fingerL: 'LeftHandMiddle1', fingerR: 'RightHandMiddle1',
  };
  const POSE_KEYS = ['spine', 'armR', 'foreR', 'armL', 'foreL', 'legR', 'kneeR', 'legL', 'kneeL', 'legSplay', 'armSplay',
    'twist', 'neck', 'headTurn', 'lean', 'crouch'];
  // limbs that a fight pose points, each with the joint it points at
  const AIMED = [['armL', 'foreL'], ['foreL', 'handL'], ['armR', 'foreR'], ['foreR', 'handR'], ['legR', 'kneeR'], ['kneeR', 'footR'], ['legL', 'kneeL'], ['kneeL', 'footL'],
    ['footR', 'toeR'], ['footL', 'toeL']];

  // Swings `bone` so it points from its joint toward its `child` joint along `dir` (in the
  // frame of `frame`), by `weight` of the way from where the animation has it.
  function aimTowards(bone, child, frame, dir, weight) {
    if (!bone || !child || weight <= 0) return;
    bone.getWorldPosition(aimFrom);
    child.getWorldPosition(aimTo);
    aimTo.sub(aimFrom).normalize();
    frame.getWorldQuaternion(frameQ);
    aimWant.copy(dir).applyQuaternion(frameQ);
    if (weight < 1) aimWant.lerp(aimTo, 1 - weight).normalize();
    jointTurn.setFromUnitVectors(aimTo, aimWant);
    bone.parent.getWorldQuaternion(jointParentQ);
    jointQ.copy(jointParentQ).multiply(bone.quaternion).premultiply(jointTurn);
    bone.quaternion.copy(jointParentQ.invert()).multiply(jointQ);
  }

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
        if (bone) bones[key] = { bone, base: new THREE.Quaternion(), out: null };
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
    const airborne = onFoot && !hero.climb && !act && car.y > groundAt(car.x, car.z, car.y) + 0.05;
    const moving = onFoot && !hero.climb && !airborne && speed > 0.3;

    // --- base clips: stand and breathe, walk, or run, cross-faded by speed
    const run = moving ? Math.max(0, Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED))) : 0;
    const goal = { idle: moving ? 0 : 1, walk: moving ? 1 - run : 0, run: moving ? run : 0 };
    if (hero.shuffle && !moving) Object.assign(goal, { idle: 0.6, walk: 0.4 }); // small steps round on the spot
    const fade = Math.min(1, 9 * dt);
    for (const name of ['idle', 'walk', 'run']) {
      k.weights[name] += (goal[name] - k.weights[name]) * fade;
      k.actions[name].setEffectiveWeight(k.weights[name]);
    }
    // keep the feet in step with the ground speed
    // (backwards when he backs off or reels back from a shove)
    const backwards = hero.backward && moving ? -1 : 1;
    k.actions.walk.timeScale = (hero.shuffle && !moving ? 0.7 : Math.max(0.6, Math.min(1.7, speed / 1.55))) * backwards;
    k.actions.run.timeScale = Math.max(0.8, Math.min(1.6, speed / 4.6)) * backwards;
    if (!(hero.dead && hero.ct >= collapseEnd(hero.fallDir || 1))) k.mixer.update(dt); // a body lies still

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
      // a leap: one knee driven up, the other leg trailing, arms thrown forward; dropping
      // from high up, he flails, arms wheeling over his head and legs running on air
      const leap = { legR: -0.9, kneeR: 1.3, legL: 0.3, kneeL: 0.7, armR: -0.5, armL: -0.9, foreL: -0.5 };
      const f = clock * 8.5;
      const flail = {
        armR: -2.3 + 0.8 * Math.sin(f), armL: -2.3 + 0.8 * Math.sin(f + 2.6), armSplay: 0.75 + 0.3 * Math.sin(f * 0.6),
        foreR: -0.5 - 0.4 * Math.sin(f + 1), foreL: -0.5 - 0.4 * Math.sin(f + 3.6),
        legR: -0.6 + 0.55 * Math.sin(f * 0.9), kneeR: 0.8 + 0.5 * Math.sin(f * 0.9 + 1.3),
        legL: -0.6 + 0.55 * Math.sin(f * 0.9 + Math.PI), kneeL: 0.8 + 0.5 * Math.sin(f * 0.9 + Math.PI + 1.3),
        legSplay: 0.15, spine: -0.15, neck: 0.3,
      };
      const falling = hero.jetpack ? 0 : smooth((-car.vy - 5) / 5);
      for (const key of new Set([...Object.keys(leap), ...Object.keys(flail)])) want[key] = (leap[key] || 0) * (1 - falling) + (flail[key] || 0) * falling;
    }
    const fighting = hero.fightPose && onFoot && !act && !hero.dead && !hero.down && !hero.climb;
    const fallen = onFoot && !act && hero.collapse && (hero.dead || hero.down);
    if (hero.fade && (fallen || !onFoot)) hero.fade = null;
    if (hero.fade) {
      hero.fade.w -= dt / 0.35;
      if (hero.fade.w <= 0) hero.fade = null;
    }
    if (fallen) {
      // going down, lying, or getting up (the limbs are pointed below)
      Object.assign(want, hero.collapse.keys);
    } else if (hero.fade) {
      for (const [key, v] of Object.entries(hero.fade.keys)) want[key] = v * hero.fade.w;
    } else if (act && act.heroPose) {
      // in a scene at a vehicle: sitting, climbing in or out, hauling, shoving, reeling
      Object.assign(want, act.heroPose);
    } else if (fighting) {
      // squared up: the guard and the moves (legs only while standing his ground)
      const g = hero.fight.guard;
      const legs = moving ? 0.25 : 1;
      for (const [key, v] of Object.entries(hero.fightPose.keys)) {
        want[key] = v * g * (key.startsWith('leg') || key.startsWith('knee') || key === 'crouch' ? legs : 1);
      }
    } else if (onFoot && !hero.climb) {
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
    if (hero.landing > 0 && onFoot && !fallen) {
      // taking a hard landing on bent knees
      const l = Math.min(1, hero.landing / 0.35);
      Object.assign(want, { kneeL: want.kneeL + 1.1 * l, kneeR: want.kneeR + 1.1 * l, legL: want.legL - 0.7 * l, legR: want.legR - 0.7 * l, spine: want.spine + 0.45 * l, crouch: want.crouch + 0.3 * l, armSplay: 0.3 * l });
    }
    const ease = fallen ? Math.min(1, 25 * dt) : Math.min(1, (fighting ? 30 : 16) * dt);
    for (const key of POSE_KEYS) k.pose[key] += ((want[key] || 0) - k.pose[key]) * ease;
    k.root.position.y = (mode === 'horse' && !horse.model.morph ? 0.14 : 0) - k.pose.crouch; // the built-in saddle sits higher than his hips

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
    // shoulders turning, a lean to the side, the head
    turnBone(b.spine2, 0, 1, 0, p.twist);
    turnBone(b.spine, 0, 0, 1, p.lean);
    turnBone(b.neck, 1, 0, 0, p.neck);
    turnBone(b.neck, 0, 1, 0, p.headTurn);
    if (fallen) {
      const c = hero.collapse;
      if (c.ik) {
        applyReach(m.group, heroBone, c.ik); // getting up: feet and hands where they go
      } else {
        // going down: a moment's blend from whatever he was doing (flailing in the air, say)
        const since = hero.down ? hero.down.t : hero.dead ? hero.dead.t : 1;
        const w = Math.min(1, since / 0.15);
        for (const [key, child] of AIMED) {
          const dir = c.aim[key];
          if (dir && b[key].bone && b[child].bone) aimTowards(b[key].bone, b[child].bone, m.group, dir, w);
        }
        if (c.brace) braceHands(m.group, heroBone, c.at, c.brace);
      }
    } else if (hero.fade) {
      for (const [key, child, dir] of hero.fade.arms) aimTowards(b[key].bone, b[child].bone, m.group, dir, hero.fade.w);
    }
    // a fight pose points the arms (and for a kick, the legs) where the move needs them
    if (fighting && hero.fight.guard > 0.01) {
      for (const [key, child] of AIMED) {
        const dir = hero.fightPose.aim[key];
        if (!dir || ((key.startsWith('leg') || key.startsWith('knee')) && moving)) continue;
        aimTowards(b[key].bone, b[child].bone, m.group, dir, hero.fight.guard);
      }
    }
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
      // (but not the last few centimetres of a real fall)
      if (car.vy <= 0.5 && car.vy > -3 && car.y - ground < 0.3) {
        car.y = ground;
        car.vy = 0;
        car.fallTop = null;
        return false;
      }
      car.fallTop = Math.max(car.fallTop ?? car.y, car.y);
      car.vy -= GRAVITY * dt;
      car.y += car.vy * dt;
      if (car.y <= ground) {
        car.y = ground;
        car.vy = 0;
        const drop = car.fallTop - ground;
        car.fallTop = null;
        landed(drop);
      }
      return true;
    }
    car.fallTop = null;
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
    for (const box of solidsNear(car.x, car.z, radius)) {
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
    // running costs breath, and out of it he walks. Breaking into a run ends a fight at
    // once (only a blow already on its way is let finish); squared up, he steps lighter.
    const swinging = hero.fight.move && !hero.fight.move.landed;
    const canRun = shift && length > 0 && !hero.exhausted && hero.landing <= 0 && !swinging && !hero.fight.react;
    const fighting = !canRun && hero.fight.guard > 0.6;
    const busy = !canRun && (hero.fight.move || hero.fight.react) ? 0.35 : 1; // little ground covered mid-punch
    const pace = (flying ? JETPACK_SPEED : canRun ? RUN_SPEED : fighting ? WALK_SPEED * 0.8 : WALK_SPEED) * busy;
    hero.sprinting = canRun && length > 0 && !flying;
    if (length > 0) {
      mx = (mx / length) * pace;
      mz = (mz / length) * pace;
    }
    car.vx = mx;
    car.vz = mz;
    car.x += mx * dt;
    car.z += mz * dt;
    pushHeroOut(0.4);
    // people, dogs and animals are solid: he cannot walk through them
    const shove = (x, z, y, reach) => {
      const dx = car.x - x;
      const dz = car.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < reach && Math.abs(y - car.y) < 1.2) {
        car.x += (dx / d) * (reach - d);
        car.z += (dz / d) * (reach - d);
      }
    };
    for (const w of walkers) {
      if (!onFeet(w)) continue;
      const p = w.group.position;
      shove(p.x, p.z, p.y, w.isPerson ? 0.6 : 0.55);
    }
    for (const a of animals) if (a.down <= 0) shove(a.x, a.z, a.y, 0.45 + a.sp.girth);

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
    updateHeroFight(dt, length > 0, canRun);
    const aiming = hero.weapon !== 'fist' || hero.punch > 0;
    // squared up for a fight he keeps facing his man (updateHeroFight turns him)
    const squared = hero.fight.guard > 0.4 && (hero.fight.move || hero.fight.react || length === 0);
    const heading = aiming ? hero.yaw : squared ? hero.facing : length > 0 ? Math.atan2(mx, mz) : hero.facing;
    hero.facing += wrapAngle(heading - hero.facing) * Math.min(1, 12 * dt);

    const m = hero.model;
    m.group.position.set(car.x, car.y, car.z);
    m.group.rotation.set(0, hero.facing, 0); // upright, whatever came before
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
      if (v.busy || Math.abs((v.y || 0) - car.y) > 2) return;
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

  // --- getting in and out ---

  // Getting into a vehicle, getting out, and being dragged out are short animated scenes,
  // not instant swaps. Everyone moves the way a person does: they walk where they go with
  // their feet in step with the ground (backwards when they back off), turn on the seat
  // with their legs swinging over the sill, put a hand up to the roof, duck under it and
  // stand up, and stagger back on their feet when shoved. Places are worked out in the
  // vehicle's own frame (x to its left, z forward), so the same moves fit every kind.
  let act = null; // the hero's scene at a vehicle, while it lasts
  const swingingDoors = []; // vehicles whose door is on its way shut
  const WALK_PACE = 1.6; // m/s: an unhurried walk, which the walk clip matches step for step
  const CHASE_SECONDS = 20;
  const CHASE_SPEED = 5.4; // m/s: a flat-out sprint
  const STUNNED_SECONDS = 2;
  const SLOW_ENOUGH = 2.2; // m/s: a car crawling this slowly can be caught and opened
  let nextTrafficId = 100000;

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

  function updateDoors(dt) {
    for (let n = swingingDoors.length - 1; n >= 0; n--) {
      const model = swingingDoors[n];
      setDoor(model, Math.max(0, (model.doorOpen || 0) - 3.5 * dt));
      if (model.doorOpen <= 0) swingingDoors.splice(n, 1);
    }
  }

  // A point in a vehicle's frame, in the world: [x, z].
  const toWorld = (v, lx, lz) => [v.x + lx * Math.cos(v.h) + lz * Math.sin(v.h), v.z - lx * Math.sin(v.h) + lz * Math.cos(v.h)];
  const toLocal = (v, x, z) => {
    const dx = x - v.x;
    const dz = z - v.z;
    return [dx * Math.cos(v.h) - dz * Math.sin(v.h), dx * Math.sin(v.h) + dz * Math.cos(v.h)];
  };
  const between = (u, a, b) => smooth((u - a) / (b - a));
  const bell = (u, a, b) => Math.sin(Math.max(0, Math.min(1, (u - a) / (b - a))) * Math.PI);

  // Where someone sits at the wheel: the place of their feet-level root in the vehicle's
  // frame. The hero and the drivers are built a little differently.
  function seatedAt(model, isHero) {
    const seat = model.seat || [-0.2, 0.38];
    return isHero
      ? { x: seat[1], y: model.stats.eye - 1.66, z: seat[0] - 0.1 }
      : { x: seat[1], y: (model.seatY || 0.44) - 0.9, z: seat[0] - 0.12 };
  }
  // the road just outside the driver's door, where you stand to get in or out
  const besideDoor = (model, isHero) => ({ x: model.dims.hw + 0.42, z: seatedAt(model, isHero).z + 0.05 });
  // where someone stands to open the door and haul out whoever is inside: by its rear edge
  const atDoorEdge = (model) => ({ x: model.dims.hw + 0.62, z: seatedAt(model, true).z - 0.85 });
  // The haul and the shove. Whoever is hauling steps back as the other climbs out, then
  // the two swap places, the one hauled out swung round to the outside and the one hauling
  // into the doorway, so the shove sends him out into the road, clear of the car and the
  // open door (which stands forward of the doorway).
  const HAUL = {
    back: (model) => ({ x: model.dims.hw + 0.95, z: seatedAt(model, true).z - 1.05 }), // the hauler, a step back
    out: (model) => ({ x: model.dims.hw + 1.45, z: seatedAt(model, true).z - 0.35 }), // where the hauled one is swung to
    inside: (model) => ({ x: model.dims.hw + 0.47, z: seatedAt(model, true).z - 0.3 }), // the hauler, in the doorway
  };

  // A body between the seat (u = 0: sitting at the wheel, facing forward) and the road
  // outside the door (u = 1: standing, facing out). On the way he turns on the seat, the
  // legs swing out over the sill, one foot then the other goes down to the road, a hand goes
  // up to the roof's edge, he ducks under it, and stands.
  function seatMove(model, u, isHero) {
    const seated = seatedAt(model, isHero);
    const outside = besideDoor(model, isHero);
    const slide = between(u, 0.22, 0.7);
    const rise = between(u, 0.42, 0.92);
    const hands = 1 - between(u, 0, 0.22); // off the wheel
    return {
      x: seated.x + (outside.x - seated.x) * slide,
      y: seated.y * (1 - rise),
      z: seated.z + (outside.z - seated.z) * slide,
      yaw: (Math.PI / 2) * between(u, 0, 0.36),
      pose: {
        legL: -1.45 * (1 - between(u, 0.4, 0.86)), kneeL: 1.35 * (1 - between(u, 0.45, 0.9)),
        legR: -1.45 * (1 - between(u, 0.5, 0.94)), kneeR: 1.35 * (1 - between(u, 0.55, 0.97)),
        spine: -0.1 * hands + 0.5 * bell(u, 0.28, 0.95),
        armL: -1.1 * hands - 1.8 * bell(u, 0.25, 0.85), foreL: -0.4 * hands - 0.6 * bell(u, 0.25, 0.85),
        armR: -1.1 * hands + 0.3 * bell(u, 0.3, 0.8), foreR: -0.4 * hands - 0.3 * bell(u, 0.3, 0.8),
        legSplay: 0.12 * bell(u, 0.3, 0.9),
      },
    };
  }

  // Places the hero at a point of seatMove, in the world.
  function heroAtSeat(v, u) {
    const m = seatMove(v.model, u, true);
    const [x, z] = toWorld(v, m.x, m.z);
    car.x = x;
    car.z = z;
    car.y = (v.y || 0) + m.y;
    hero.facing = v.h + m.yaw;
    act.heroPose = m.pose;
  }

  // ... and a driver.
  function npcAtSeat(w, v, u) {
    const m = seatMove(v.model, u, false);
    const [x, z] = toWorld(v, m.x, m.z);
    w.group.position.set(x, (v.y || 0) + m.y, z);
    w.group.rotation.set(0, v.h + m.yaw, 0);
    w.pose = m.pose;
    w.actMove = 0;
    w.baseY = v.y || 0;
  }

  // Walks the hero toward (x, z), turning to face the way he goes, or backing up facing
  // `face`. His feet keep pace with the ground. True once he is there.
  function heroWalk(dt, x, z, pace = WALK_PACE, back = false, face = 0) {
    const dx = x - car.x;
    const dz = z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.04) return true;
    const step = Math.min(d, pace * dt);
    car.x += (dx / d) * step;
    car.z += (dz / d) * step;
    car.vx = ((dx / d) * step) / dt;
    car.vz = ((dz / d) * step) / dt;
    car.y = groundAt(car.x, car.z, car.y + 0.3);
    hero.backward = back;
    turnHero(back ? face : Math.atan2(dx, dz), dt);
    return false;
  }
  const turnHero = (heading, dt, rate = 10) => {
    hero.facing += wrapAngle(heading - hero.facing) * Math.min(1, rate * dt);
  };

  // The same for a pedestrian, kept out of walls; `pace` below zero walks backwards.
  function npcWalk(w, dt, x, z, pace = WALK_PACE, back = false, face = 0) {
    const g = w.group;
    const dx = x - g.position.x;
    const dz = z - g.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      w.actMove = 0;
      return true;
    }
    const step = Math.min(d, pace * dt);
    stepWalker(w, (dx / d) * step, (dz / d) * step);
    w.actMove = 1;
    w.actSpeed = back ? -step / dt : step / dt;
    const want = back ? face : Math.atan2(dx, dz);
    g.rotation.set(0, g.rotation.y + wrapAngle(want - g.rotation.y) * Math.min(1, 10 * dt), 0);
    return false;
  }

  // Turning on the spot: small shuffling steps, not a glide.
  function npcTurn(w, dt, heading) {
    const g = w.group;
    const left = wrapAngle(heading - g.rotation.y);
    g.rotation.set(0, g.rotation.y + left * Math.min(1, 8 * dt), 0);
    w.actMove = Math.min(0.45, Math.abs(left) * 1.5);
    w.actSpeed = 0.8;
  }

  // A way round to a spot beside the driver's door: straight there if he is already on that
  // side, otherwise by way of the nearer corner, so he never walks through the vehicle.
  function routeToDoor(v, spot) {
    const [lx, lz] = toLocal(v, car.x, car.z);
    const { hl, hw } = v.model.dims;
    const route = [];
    if (lx < hw + 0.2) {
      const end = lz >= 0 ? hl + 0.9 : -hl - 0.9;
      if (lx < -hw - 0.2) route.push([-hw - 0.9, end]); // from the far side: along it first
      route.push([hw + 0.9, end]);
    }
    route.push([spot.x, spot.z]);
    return route;
  }

  // The driver of a vehicle the hero is taking: no longer a figure at the wheel but a
  // pedestrian, starting from the seat.
  function driverOut(v) {
    const figure = v.driver;
    v.model.group.remove(figure);
    v.driver = null;
    const template = figure.userData.template;
    if (!template) return null;
    const w = createPerson(template);
    w.template = template;
    setPavementGoal(w, v.x, v.z);
    Object.assign(w, {
      speed: rand(1.3, 1.7), phase: 0, health: 85, state: 'act', timer: 0, tip: 0, tipSign: -1, dying: false, moving: 0,
      away: true, baseY: v.y || 0, stolen: v.model, actMove: 0, actSpeed: 0, pose: null,
    });
    w.group.rotation.order = 'YXZ';
    scene.add(w.group);
    walkers.push(w);
    npcAtSeat(w, v, 0);
    return w;
  }

  // Take the nearest vehicle: parked, abandoned, or one driving past.
  function enterVehicle() {
    const found = nearestVehicle();
    if (!found || act) return;
    const { v, kind } = found;
    if (kind === 'traffic') v.jacked = true; // it brakes to a stop
    v.busy = true;
    car.vx = car.vz = 0;
    act = { kind: 'in', v, vkind: kind, phase: 'wait', t: 0, heroPose: null, npc: null, driver: !!v.driver };
    if (v.model.moto) act.phase = 'mount'; // a motorbike is simply straddled
  }

  // Getting out: the door opens, he turns on the seat and climbs out, and walks clear as
  // it swings shut. A motorbike is just stepped off.
  function exitVehicle() {
    const moving = Math.hypot(car.vx, car.vz) > 3;
    if (moving || car.y > groundAt(car.x, car.z, car.y) + 0.02) {
      showToast('Stop the car to get out', true);
      return;
    }
    if (player.moto) {
      const parked = releasePlayerCar();
      parked.busy = false;
      const stepOut = parked.model.dims.hw + 1.1;
      car.x += Math.cos(car.heading) * stepOut;
      car.z -= Math.sin(car.heading) * stepOut;
      hero.yaw = hero.facing = car.heading;
      hero.model.group.position.set(car.x, car.y, car.z);
      updateCamera(0, 0, true);
      return;
    }
    const parked = releasePlayerCar();
    act = { kind: 'out', v: parked, phase: 'open', t: 0, heroPose: null };
    heroAtSeat(parked, 0);
  }

  // The car the hero was driving becomes a parked car, its lamps back to normal; the hero
  // is on foot (though a scene may still be moving him). Returns its parked entry.
  function releasePlayerCar() {
    if (insideView) setInsideView(false);
    player.flame.visible = false;
    player.tailMat.color.setHex(0x7a1010);
    if (player.headMat) player.headMat.userData.mine = false;
    if (player.beam) {
      player.beam.material = beamMat;
      player.beam.scale.set(1, 1, 1);
    }
    player.indicator = lights.indicator === 'hazard' ? 'hazard' : null;
    if (player.bar) {
      player.bar[0].color.setHex(0x400808);
      player.bar[1].color.setHex(0x081040);
    }
    if (player.amberL && !player.indicator) {
      player.amberL.color.setHex(AMBER_OFF);
      player.amberR.color.setHex(AMBER_OFF);
    }
    setLights({ indicator: null, emergency: false, brakes: false }, true);
    scene.add(hero.model.group);
    player.group.rotation.set(0, car.heading, 0);
    addIdleCar(player, car.x, car.y, car.z, car.heading);
    const parked = idleCars[idleCars.length - 1];
    parked.busy = true;
    player = null;
    car.boosting = false;
    hero.yaw = car.heading;
    hero.pitch = 0;
    car.vx = car.vz = 0;
    setMode('foot');
    updateCamera(0, 0, true);
    return parked;
  }

  // The hero's scene, a step at a time.
  function updateAct(dt) {
    const a = act;
    const v = a.v;
    const model = v.model;
    a.t += dt;
    hero.backward = false;
    hero.shuffle = false;
    car.vx = car.vz = 0;
    const next = (phase) => {
      a.phase = phase;
      a.t = 0;
    };
    const npc = a.npc;

    if (a.kind === 'in') {
      if (a.phase === 'mount') {
        if (v.driver) {
          // the rider is pulled off and shoved away from the bike
          const w = driverOut(v);
          if (w) {
            const [x, z] = toWorld(v, 0.8, 0);
            w.group.position.set(x, v.y || 0, z);
            w.pose = null;
            shoveWalker(w, Math.cos(v.h), -Math.sin(v.h), 3);
          }
        }
        finishGettingIn();
        return;
      }
      if (a.phase === 'wait') {
        a.heroPose = null;
        if (a.vkind === 'traffic' && Math.abs(v.speed) > 0.4) {
          // still rolling: wait for it to stop, and give up if it gets away
          if (a.t > 3 || Math.hypot(v.x - car.x, v.z - car.z) > 13) {
            v.jacked = false;
            v.busy = false;
            act = null;
          }
          return;
        }
        a.route = routeToDoor(v, a.driver ? atDoorEdge(model) : besideDoor(model, true));
        next('walk');
      }
      if (a.phase === 'walk') {
        const [x, z] = toWorld(v, ...a.route[0]);
        // a jog for the way round, a walk for the last few steps to the door
        let left = Math.hypot(x - car.x, z - car.z);
        for (let k = 1; k < a.route.length; k++) left += Math.hypot(a.route[k][0] - a.route[k - 1][0], a.route[k][1] - a.route[k - 1][1]);
        if (heroWalk(dt, x, z, left > 2.2 ? 3.6 : WALK_PACE)) {
          a.route.shift();
          if (!a.route.length) next('open');
        }
      } else if (a.phase === 'open') {
        // reach for the handle and swing the door wide
        const [hx, hz] = toWorld(v, model.dims.hw, seatedAt(model, true).z + 0.3);
        turnHero(Math.atan2(hx - car.x, hz - car.z), dt, 12);
        const reach = between(a.t, 0, 0.2) * (1 - between(a.t, 0.45, 0.6));
        a.heroPose = { armR: -1.2 * reach, foreR: -0.3 * reach, spine: 0.08 * reach };
        setDoor(model, between(a.t, 0.15, 0.55));
        if (a.t >= 0.6) next(a.driver ? 'pull' : 'toSeat');
      } else if (a.phase === 'pull') {
        // reach in, take hold, and haul: he climbs out as he is pulled, the hero backing off
        if (!a.npc) a.npc = driverOut(v);
        const u = smooth(Math.min(1, a.t / 1.2));
        if (a.npc && a.npc.state === 'act') npcAtSeat(a.npc, v, u);
        const grip = between(a.t, 0, 0.3);
        const haul = between(a.t, 0.35, 1.0);
        a.heroPose = { armR: -1.35 * grip + 0.35 * haul, armL: -1.2 * grip + 0.3 * haul, foreR: -0.2 - 0.8 * haul, foreL: -0.2 - 0.8 * haul, spine: 0.2 * grip - 0.1 * haul };
        if (a.t > 0.35) {
          const back = HAUL.back(model);
          const [x, z] = toWorld(v, back.x, back.z);
          const [fx, fz] = toWorld(v, besideDoor(model, false).x, besideDoor(model, false).z);
          heroWalk(dt, x, z, 0.8, true, Math.atan2(fx - car.x, fz - car.z));
        }
        if (a.t >= 1.25) next(a.npc && a.npc.state === 'act' ? 'swing' : 'toSeat');
      } else if (a.phase === 'swing') {
        // still holding him, the hero swings him round to the outside and takes the doorway
        const out = HAUL.out(model);
        const inside = HAUL.inside(model);
        const [nx, nz] = toWorld(v, out.x, out.z);
        const [hx, hz] = toWorld(v, inside.x, inside.z);
        const npcThere = npc.state !== 'act' || npcWalk(npc, dt, nx, nz, 1.5);
        npc.pose = { armR: -0.5, armL: -0.3, foreR: -0.5, foreL: -0.4 }; // arms up against the hands on him
        const heroThere = heroWalk(dt, hx, hz, 1.5);
        a.heroPose = { armR: -0.9, armL: -0.9, foreR: -0.7, foreL: -0.7 };
        if ((npcThere && heroThere) || a.t > 1.6) next('face');
      } else if (a.phase === 'face') {
        // he turns on the hero; the hero squares up
        const p = npc.group.position;
        if (npc.state === 'act') {
          npcTurn(npc, dt, Math.atan2(car.x - p.x, car.z - p.z));
          npc.pose = { armR: -0.35, armL: -0.35, foreR: -0.9, foreL: -0.9 };
        }
        turnHero(Math.atan2(p.x - car.x, p.z - car.z), dt, 12);
        a.heroPose = { armR: -0.4, armL: -0.4, foreR: -0.6, foreL: -0.6 };
        if (a.t >= 0.35) next('shove');
      } else if (a.phase === 'shove') {
        // a step in and a two-handed shove out into the road: he goes staggering back
        const p = npc.group.position;
        const d = Math.hypot(p.x - car.x, p.z - car.z) || 1;
        const lunge = bell(a.t, 0, 0.5);
        a.heroPose = { armR: -0.5 - 1.0 * lunge, armL: -0.5 - 1.0 * lunge, foreR: -0.6 * (1 - lunge), foreL: -0.6 * (1 - lunge), spine: 0.25 * lunge };
        if (a.t < 0.3) heroWalk(dt, car.x + ((p.x - car.x) / d) * 0.2, car.z + ((p.z - car.z) / d) * 0.2, 1.2);
        if (a.t >= 0.18 && npc.state === 'act') shoveWalker(npc, (p.x - car.x) / d, (p.z - car.z) / d, 3.3);
        if (a.t >= 0.5) next('toSeat');
      } else if (a.phase === 'toSeat') {
        a.heroPose = null;
        const spot = besideDoor(model, true);
        const [x, z] = toWorld(v, spot.x, spot.z);
        if (heroWalk(dt, x, z, 1.3)) next('turn');
      } else if (a.phase === 'turn') {
        // his back to the seat, ready to sit
        turnHero(v.h + Math.PI / 2, dt, 9);
        hero.shuffle = true;
        if (a.t >= 0.4) next('sit');
      } else if (a.phase === 'sit') {
        heroAtSeat(v, 1 - smooth(Math.min(1, a.t / 1.15)));
        if (a.t >= 1.15) next('close');
      } else if (a.phase === 'close') {
        heroAtSeat(v, 0);
        setDoor(model, 1 - between(a.t, 0, 0.35));
        if (a.t >= 0.4) finishGettingIn();
      }
    } else if (a.kind === 'out') {
      if (a.phase === 'open') {
        heroAtSeat(v, 0);
        setDoor(model, between(a.t, 0, 0.4));
        if (a.t >= 0.4) next('climb');
      } else if (a.phase === 'climb') {
        heroAtSeat(v, smooth(Math.min(1, a.t / 1.1)));
        if (a.t >= 1.1) {
          a.heroPose = null;
          swingingDoors.push(model); // it swings shut behind him
          next('clear');
        }
      } else if (a.phase === 'clear') {
        const [x, z] = toWorld(v, model.dims.hw + 1.3, seatedAt(model, true).z - 0.2);
        if (heroWalk(dt, x, z) || a.t > 1.5) {
          v.busy = false;
          hero.yaw = hero.facing;
          act = null;
        }
      }
    } else if (a.kind === 'dragged') {
      // the owner has caught up with his car: he opens the door, hauls the hero out and
      // shoves him away, then gets in and drives off
      const p = npc.group.position;
      if (npc.state !== 'act') {
        // something stopped him (a shot, say): the hero is let go
        if (a.phase === 'open' || a.phase === 'pull') heroAtSeat(v, 1);
        a.heroPose = null;
        v.busy = false;
        setDoor(model, 1);
        swingingDoors.push(model);
        act = null;
        return;
      }
      if (a.phase === 'open') {
        heroAtSeat(v, 0);
        const [hx, hz] = toWorld(v, model.dims.hw, seatedAt(model, true).z + 0.3);
        npcTurn(npc, dt, Math.atan2(hx - p.x, hz - p.z));
        const reach = between(a.t, 0, 0.2) * (1 - between(a.t, 0.45, 0.6));
        npc.pose = { armR: -1.2 * reach, foreR: -0.3 * reach };
        setDoor(model, between(a.t, 0.15, 0.55));
        if (a.t >= 0.6) next('pull');
      } else if (a.phase === 'pull') {
        heroAtSeat(v, smooth(Math.min(1, a.t / 1.0)));
        const grip = between(a.t, 0, 0.25);
        const haul = between(a.t, 0.3, 0.9);
        npc.pose = { armR: -1.35 * grip + 0.35 * haul, armL: -1.2 * grip + 0.3 * haul, foreR: -0.2 - 0.8 * haul, foreL: -0.2 - 0.8 * haul, spine: 0.2 * grip - 0.1 * haul };
        if (a.t > 0.3) {
          const back = HAUL.back(model);
          const [x, z] = toWorld(v, back.x, back.z);
          npcWalk(npc, dt, x, z, 0.8, true, Math.atan2(car.x - p.x, car.z - p.z));
        } else npc.actMove = 0;
        if (a.t >= 1.05) next('swing');
      } else if (a.phase === 'swing') {
        // swung round to the outside, the owner taking the doorway
        const out = HAUL.out(model);
        const inside = HAUL.inside(model);
        const [hx, hz] = toWorld(v, out.x, out.z);
        const [nx, nz] = toWorld(v, inside.x, inside.z);
        a.heroPose = { armR: -0.5, armL: -0.3, foreR: -0.5, foreL: -0.4 };
        npc.pose = { armR: -0.9, armL: -0.9, foreR: -0.7, foreL: -0.7 };
        const heroThere = heroWalk(dt, hx, hz, 1.5);
        const npcThere = npcWalk(npc, dt, nx, nz, 1.5);
        if ((heroThere && npcThere) || a.t > 1.6) next('face');
      } else if (a.phase === 'face') {
        a.heroPose = null;
        turnHero(Math.atan2(p.x - car.x, p.z - car.z), dt, 9);
        hero.shuffle = true;
        npcTurn(npc, dt, Math.atan2(car.x - p.x, car.z - p.z));
        npc.pose = { armR: -0.4, armL: -0.4, foreR: -0.6, foreL: -0.6 };
        if (a.t >= 0.4) next('shove');
      } else if (a.phase === 'shove') {
        const d = Math.hypot(car.x - p.x, car.z - p.z) || 1;
        const lunge = bell(a.t, 0, 0.5);
        npc.pose = { armR: -0.5 - 1.0 * lunge, armL: -0.5 - 1.0 * lunge, foreR: -0.6 * (1 - lunge), foreL: -0.6 * (1 - lunge), spine: 0.25 * lunge };
        if (a.t < 0.3) npcWalk(npc, dt, p.x + ((car.x - p.x) / d) * 0.2, p.z + ((car.z - p.z) / d) * 0.2, 1.2);
        else npc.actMove = 0;
        if (a.t >= 0.18 && !a.stumble) a.stumble = { dx: (car.x - p.x) / d, dz: (car.z - p.z) / d, t: 0 };
        if (a.t >= 0.5) {
          // he gets in on his own from here; the hero is still reeling
          npc.pose = null;
          npc.script = { phase: 'toSeat', t: 0, v };
          next('reel');
        }
      }
      if (a.stumble) {
        // staggering back on his feet, slowing, arms out for balance
        const s = a.stumble;
        s.t += dt;
        const k = Math.min(1, s.t / 1.1);
        const speed = 3.1 * (1 - k) ** 1.5;
        car.x += s.dx * speed * dt;
        car.z += s.dz * speed * dt;
        pushHeroOut(0.4);
        car.y = groundAt(car.x, car.z, car.y + 0.3);
        car.vx = s.dx * speed;
        car.vz = s.dz * speed;
        hero.backward = true;
        turnHero(Math.atan2(-s.dx, -s.dz), dt, 12);
        a.heroPose = { spine: -0.3 * (1 - k), armR: -0.5 * (1 - k), armL: -0.7 * (1 - k), armSplay: 0.6 * (1 - k), foreR: -0.4 * (1 - k), foreL: -0.4 * (1 - k) };
        if (k >= 1 && a.phase === 'reel') {
          hero.yaw = hero.facing;
          act = null;
        }
      }
    }
    if (act) {
      const m = hero.model;
      m.group.position.set(car.x, car.y, car.z);
      m.group.rotation.set(0, hero.facing, 0);
      car.heading = hero.yaw;
    }
  }

  // The hero is at the wheel: the vehicle is his to drive.
  function finishGettingIn() {
    const { v, vkind } = act;
    const model = v.model;
    act = null;
    v.busy = false;
    if (vkind === 'idle') {
      idleCars.splice(idleCars.indexOf(v), 1);
      removeCollider(v.box);
    } else {
      traffic.splice(traffic.indexOf(v), 1);
      trafficBoxes.splice(trafficBoxes.indexOf(v.box), 1);
    }
    if (v.driver) {
      model.group.remove(v.driver);
      v.driver = null;
    }
    setDoor(model, 0);
    drive(model, v.x, v.y || 0, v.z, v.h);
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

  // Points a pedestrian who is off the pavements at the nearest one to walk back to.
  function setPavementGoal(w, x, z) {
    const to = nearestPavement(x, z);
    Object.assign(w, { cx: to.block.x, gy: to.block.y, cz: to.block.z, half: to.half, s: to.s, tx: to.tx, tz: to.tz });
  }

  // A pedestrian moving on the ground: kept out of walls and vehicles, on whatever is underfoot.
  function stepWalker(w, dx, dz) {
    const g = w.group.position;
    g.x += dx;
    g.z += dz;
    const boxes = collidersNear(g.x, g.z, 0.4).concat(trafficBoxes, policeBoxes);
    if (mode === 'car' && player) {
      // the vehicle you are driving is solid to him too
      const { hl, hw } = player.dims;
      const reach = hl + hw;
      boxes.push({ minX: car.x - reach, maxX: car.x + reach, minZ: car.z - reach, maxZ: car.z + reach, car: { x: car.x, z: car.z, h: car.heading, hl, hw } });
    }
    for (const box of boxes) {
      if ((box.minY ?? -Infinity) > g.y + 1.5 || (box.top ?? box.maxY ?? Infinity) <= g.y + STEP_UP) continue;
      const touch = boxContact(box, g.x, g.z, 0.35);
      if (!touch) continue;
      g.x += touch.nx * (0.35 - touch.dist);
      g.z += touch.nz * (0.35 - touch.dist);
    }
    g.y = groundAt(g.x, g.z, g.y + 0.3);
    w.baseY = g.y;
  }

  // How far a point is from the outside of a vehicle's body.
  function gapToVehicle(model, x, z) {
    const p = model.group.position;
    const h = model.group.rotation.y;
    const along = (x - p.x) * Math.sin(h) + (z - p.z) * Math.cos(h);
    const side = (x - p.x) * Math.cos(h) - (z - p.z) * Math.sin(h);
    const { hl, hw } = model.dims || { hl: 2, hw: 1 };
    return Math.hypot(Math.max(0, Math.abs(along) - hl), Math.max(0, Math.abs(side) - hw));
  }

  // Sends a pedestrian staggering backwards from a shove along (dx, dz).
  function shoveWalker(w, dx, dz, speed) {
    w.state = 'stumble';
    w.timer = 0;
    w.push = { dx, dz, speed, seconds: 1.15 };
    w.pose = null;
  }

  // The states of a driver who has had his car taken: 'act' (moved by a scene),
  // 'stumble' (reeling back from a shove), 'stunned' (staring after it), 'chase' (running
  // after it). Returns false for any other state.
  function updateJacked(w, dt) {
    const g = w.group;
    if (w.state === 'act') {
      if (w.script) updateNpcScript(w, dt);
      return true;
    }
    if (w.state === 'stumble') {
      // backwards on his feet, slowing, arms out for balance, nearly over and then not
      w.timer += dt;
      const s = w.push;
      const k = Math.min(1, w.timer / s.seconds);
      const speed = s.speed * (1 - k) ** 1.5;
      stepWalker(w, s.dx * speed * dt, s.dz * speed * dt);
      g.rotation.set(0, Math.atan2(-s.dx, -s.dz), 0);
      w.actMove = Math.min(1, speed / 0.5);
      w.actSpeed = -speed;
      w.pose = { spine: -0.35 * (1 - k), armR: -0.5 * (1 - k), armL: -0.8 * (1 - k), armSplay: 0.7 * (1 - k), foreR: -0.4 * (1 - k), foreL: -0.5 * (1 - k) };
      if (k >= 1) {
        w.pose = null;
        w.actMove = 0;
        w.state = 'stunned';
        w.timer = STUNNED_SECONDS;
      }
      return true;
    }
    if (w.state === 'stunned') {
      // watching his car go, turning to follow it
      w.timer -= dt;
      const p = w.stolen.group.position;
      npcTurn(w, dt, Math.atan2(p.x - g.position.x, p.z - g.position.z));
      if (w.timer <= 0) {
        w.actMove = 0;
        w.state = 'chase';
        w.timer = CHASE_SECONDS;
      }
      return true;
    }
    if (w.state === 'chase') {
      w.timer -= dt;
      if (mode === 'foot' && !act && !hero.dead && Math.hypot(car.x - g.position.x, car.z - g.position.z) < 2.5) {
        w.state = 'fight';
        w.fight = newFight();
        w.fight.cooldown = 0.2;
        return true;
      }
      const model = w.stolen;
      const parked = idleCars.find((e) => e.model === model);
      const driven = mode === 'car' && player === model;
      if (w.timer <= 0 || (!driven && !parked) || Math.hypot(model.group.position.x - g.position.x, model.group.position.z - g.position.z) > 400) {
        // twenty seconds flat out and he is spent, or the car is long gone: back to the pavement
        setPavementGoal(w, g.position.x, g.position.z);
        w.state = 'goto';
        return true;
      }
      // the car standing still (or near enough, or parked): make for its driver's door
      const v = driven ? { x: car.x, z: car.z, h: car.heading, model } : parked;
      const slow = !driven || Math.hypot(car.vx, car.vz) < SLOW_ENOUGH;
      let tx = v.x;
      let tz = v.z;
      if (slow) {
        const edge = atDoorEdge(model);
        [tx, tz] = toWorld(v, edge.x, edge.z);
      }
      const dx = tx - g.position.x;
      const dz = tz - g.position.z;
      const d = Math.hypot(dx, dz) || 1;
      if (slow && d < 0.3 && !(parked && parked.busy) && !(driven && act)) {
        if (driven) startDragged(w);
        else {
          // nobody in it: he simply gets back in and drives off
          parked.busy = true;
          w.state = 'act';
          w.script = { phase: 'open', t: 0, v: parked };
        }
        return true;
      }
      // sprinting, then a walk for the last few steps to the door
      const pace = slow && d < 2.5 ? WALK_PACE : CHASE_SPEED;
      const room = slow ? d : gapToVehicle(model, g.position.x, g.position.z) - 0.8;
      const step = Math.max(0, Math.min(room, pace * dt));
      stepWalker(w, (dx / d) * step, (dz / d) * step);
      g.rotation.set(step / dt > 3 ? 0.12 : 0, Math.atan2(dx, dz), 0); // leaning into the run
      // legs at the pace he really covers ground, so his feet never skate
      w.actSpeed = step / dt;
      w.actMove = Math.min(1, w.actSpeed / 0.6);
      return true;
    }
    return false;
  }

  // What a pedestrian does on his own in a scene: back into his car and away.
  function updateNpcScript(w, dt) {
    const s = w.script;
    const v = s.v;
    const model = v.model;
    s.t += dt;
    const next = (phase) => {
      s.phase = phase;
      s.t = 0;
    };
    const p = w.group.position;
    if (s.phase === 'open') {
      const [hx, hz] = toWorld(v, model.dims.hw, seatedAt(model, false).z + 0.3);
      npcTurn(w, dt, Math.atan2(hx - p.x, hz - p.z));
      const reach = between(s.t, 0, 0.2) * (1 - between(s.t, 0.45, 0.6));
      w.pose = { armR: -1.2 * reach, foreR: -0.3 * reach };
      setDoor(model, between(s.t, 0.15, 0.55));
      if (s.t >= 0.6) next('toSeat');
    } else if (s.phase === 'toSeat') {
      w.pose = null;
      setDoor(model, 1);
      const spot = besideDoor(model, false);
      const [x, z] = toWorld(v, spot.x, spot.z);
      if (npcWalk(w, dt, x, z, 1.3) || s.t > 4) next('turn');
    } else if (s.phase === 'turn') {
      npcTurn(w, dt, v.h + Math.PI / 2);
      if (s.t >= 0.45) next('sit');
    } else if (s.phase === 'sit') {
      npcAtSeat(w, v, 1 - smooth(Math.min(1, s.t / 1.15)));
      if (s.t >= 1.15) next('close');
    } else if (s.phase === 'close') {
      npcAtSeat(w, v, 0);
      setDoor(model, 1 - between(s.t, 0, 0.35));
      if (s.t >= 0.4) driveAway(w, v);
    }
  }

  // He is at the wheel again: the figure at the wheel takes his place, and the car rejoins
  // the traffic if it is on a city street (or stays parked with him in it if it is not).
  function driveAway(w, v) {
    const model = v.model;
    setDoor(model, 0);
    scene.remove(w.group);
    walkers.splice(walkers.indexOf(w), 1);
    idleCars.splice(idleCars.indexOf(v), 1);
    removeCollider(v.box);
    const figure = addDriver(model, w.template);
    if (!rejoinTraffic(model, v.x, v.z, v.h, figure)) {
      addIdleCar(model, v.x, v.y || 0, v.z, v.h);
      idleCars[idleCars.length - 1].driver = figure;
    }
  }

  // Puts a vehicle back into the traffic from where it stands: on the street it is on,
  // heading the way along it that it faces. False if it is not on a city street.
  function rejoinTraffic(model, x, z, h, driver) {
    if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return false;
    const i = roadIndex(x);
    const j = roadIndex(z);
    const onNS = Math.abs(x - roadCenter(i)) < ROAD_WIDTH / 2;
    const onEW = Math.abs(z - roadCenter(j)) < ROAD_WIDTH / 2;
    if (!onNS && !onEW) return false;
    const alongZ = onNS && (!onEW || Math.abs(Math.cos(h)) > Math.abs(Math.sin(h)));
    const d = alongZ ? (Math.cos(h) >= 0 ? 1 : 3) : (Math.sin(h) >= 0 ? 0 : 2);
    const forward = d < 2; // toward +x or +z
    // the stretch of street it is on, the crossing behind it, and how far past that it is
    const along = alongZ ? z : x;
    const k = Math.max(0, Math.min(BLOCKS - 1, Math.floor((along - roadCenter(0)) / CELL)));
    const start = forward ? k : k + 1;
    const ci = alongZ ? i : start;
    const cj = alongZ ? start : j;
    if (!segmentOpen(ci, cj, d)) return false;
    const t = forward ? along - roadCenter(k) : roadCenter(k + 1) - along;
    const c = {
      i: ci, j: cj, d, t: Math.max(JUNCTION + 1, Math.min(CELL - JUNCTION - 2, t)), phase: 'road', speed: 0, cruise: rand(9, 13), steer: 0,
      side: 0, laneTimer: 0, wait: 0, reverse: 0, hold: null, id: nextTrafficId++, model, x, z, h, driver,
    };
    carrotPoint(c);
    c.box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: model.roof + 0.2, owner: model, car: { x, z, h, ...model.dims } };
    trafficBoxes.push(c.box);
    traffic.push(c);
    return true;
  }

  // The owner has caught the hero in his car: the hero's side of that scene.
  function startDragged(w) {
    const parked = releasePlayerCar();
    w.state = 'act';
    w.script = null;
    act = { kind: 'dragged', v: parked, npc: w, phase: 'open', t: 0, heroPose: null };
    heroAtSeat(parked, 0);
    showToast('The owner wants his car back!', true);
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

  function setWeapon(name) {
    hero.weapon = name;
    hero.model.gun.visible = name === 'gun';
    hero.model.bow.visible = name === 'bow';
    $('weapon').textContent = { fist: 'Fist', gun: 'Gun', bow: 'Bow' }[name];
    $('weapon').parentElement.dataset.kind = name; // its icon
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
    // the tyres and bodies of any vehicle close enough to hit
    const models = [...traffic.map((c) => c.model), ...highwayTraffic.map((c) => c.model), ...idleCars.map((v) => v.model), ...police.filter((p) => p.active).map((p) => p.model)];
    for (const model of models) {
      const at = model.group.position;
      if (Math.abs(at.x - car.x) > 60 || Math.abs(at.z - car.z) > 60) continue;
      if (!model.wrecked) {
        const h = model.group.rotation.y;
        const half = model.dims.hl * 0.5;
        for (const end of [-1, 1]) {
          yield { x: at.x + Math.sin(h) * half * end, y: at.y + 0.85, z: at.z + Math.cos(h) * half * end, r: model.dims.hw + 0.1, vehicle: model };
        }
      }
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
    if (t.vehicle) {
      hurtVehicle(t.vehicle, damage * 1.6);
      return;
    }
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
    if (!wentDown && w.isPerson && w.state === 'stagger') {
      w.afterStagger = 'flee';
      w.away = true;
      w.baseY = w.group.position.y;
    }
    // the police come for the first blow, and again each time someone is put on the ground
    if (w.isPerson && (wentDown || wanted === 0)) {
      setWanted(wanted + 1);
      showToast(wanted === 1 ? 'Wanted! Police are coming' : 'Wanted level up', true);
    }
  }

  // Distance along a ray to the first wall, car or the ground (capped at `max`).
  function rayToWorld(o, d, max) {
    let best = d.y < -1e-4 ? Math.min(max, -o.y / d.y) : max;
    const ex = o.x + d.x * best;
    const ez = o.z + d.z * best;
    const boxes = indexQuery(colliderIndex, Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez))
      .concat(trafficBoxes, policeBoxes, trainBoxes);
    for (const box of boxes) {
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
    if (mode !== 'foot' || hero.dead || hero.down || act) return;
    if (hero.weapon === 'fist') {
      heroAttack();
      return;
    }
    if (hero.cooldown > 0) return;
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
      const inWall = collidersNear(p.x, p.z, 0).some((b) =>
        p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ &&
        p.y > (b.minY ?? 0) && p.y < (b.maxY ?? 3));
      if (inWall || p.y <= terrain(p.x, p.z) + 0.05) {
        a.stuck = true;
        a.life = Math.min(a.life, 5);
      }
    }
  }

  // ---------- Fire, smoke and explosions ----------

  // Smoke and flames are soft round sprites, hundreds at a time in two point clouds: smoke
  // drawn normally (grey to black), flames added onto what is behind them (red through
  // orange to white-hot). Each puff rises, spreads and fades over its life.
  function particleCloud(count, additive) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('shade', new THREE.BufferAttribute(new Float32Array(count), 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute float shade;
        uniform float scale;
        varying float vAlpha;
        varying float vShade;
        varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
          vAlpha = alpha;
          vShade = shade;
          vSeed = fract(position.x * 1.3 + position.z * 0.7);
        }`,
      fragmentShader: additive ? `
        varying float vAlpha;
        varying float vShade;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          // licks of flame: brighter in the middle, ragged at the edge
          float rag = 0.85 + 0.15 * sin(atan(c.y, c.x) * 5.0 + vSeed * 30.0);
          float a = smoothstep(0.5 * rag, 0.08, d) * vAlpha;
          vec3 hot = mix(vec3(0.9, 0.22, 0.04), vec3(1.0, 0.75, 0.3), vShade);
          hot = mix(hot, vec3(1.0, 0.95, 0.8), smoothstep(0.25, 0.0, d) * vShade);
          gl_FragColor = vec4(hot * a, a);
        }` : `
        varying float vAlpha;
        varying float vShade;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float lump = 0.8 + 0.2 * sin(c.x * 11.0 + vSeed * 20.0) * sin(c.y * 9.0 + vSeed * 13.0);
          float a = smoothstep(0.5, 0.12, d) * vAlpha * lump;
          gl_FragColor = vec4(vec3(vShade), a);
        }`,
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    points.renderOrder = additive ? 6 : 5;
    scene.add(points);
    const list = Array.from({ length: count }, () => ({ life: 0 }));
    return { points, list, next: 0 };
  }

  let smokeCloud = null;
  let flameCloud = null;

  function puff(cloud, x, y, z, o) {
    const p = cloud.list[cloud.next];
    cloud.next = (cloud.next + 1) % cloud.list.length;
    Object.assign(p, {
      x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life, max: o.life,
      s0: o.size, s1: o.grow ?? o.size * 2, a: o.alpha ?? 1, shade: o.shade ?? 0.5, rise: o.rise ?? 0, drag: o.drag ?? 1.2,
    });
  }
  const smoke = (x, y, z, o) => puff(smokeCloud, x, y, z, o);
  const flame = (x, y, z, o) => puff(flameCloud, x, y, z, o);

  function updateClouds(dt) {
    for (const cloud of [smokeCloud, flameCloud]) {
      const geo = cloud.points.geometry;
      const pos = geo.attributes.position.array;
      const size = geo.attributes.size.array;
      const alpha = geo.attributes.alpha.array;
      const shade = geo.attributes.shade.array;
      cloud.list.forEach((p, i) => {
        if (p.life <= 0) {
          alpha[i] = 0;
          return;
        }
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.max; // 0 new, 1 gone
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag;
        p.vz *= drag;
        p.vy = p.vy * drag + p.rise * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        size[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
        alpha[i] = p.a * Math.min(1, k * 6) * (1 - k) * (1 - k * 0.3);
        shade[i] = cloud === flameCloud ? p.shade * (1 - k * 0.8) : p.shade;
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      geo.attributes.shade.needsUpdate = true;
      cloud.points.material.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
  }

  // --- vehicle damage that ends in fire ---

  // Every vehicle can take so much: crashes, bullets and blasts wear its health down. A
  // good crash takes at most a third of it, so the first big hit leaves it smoking grey,
  // the second smoking thick and black out of the bonnet and the cabin, and the third sets
  // it on fire; the fire takes a few seconds to grow, and then it explodes.
  const VEHICLE_HEALTH = { bus: 1700, truck: 1500, moto: 550, sports: 950 };
  const vehicleHealth = (model) => VEHICLE_HEALTH[model.kind] || 1000;
  const CRASH_SHARE = 0.36; // the most one crash can take
  const FUSE = 5.5; // seconds from catching fire to going up
  const hurtVehicles = new Set(); // vehicles smoking, burning or burnt out
  const wrecks = []; // { model, vy, spin, rest, timer }

  // `crash`: the blow of a collision. One crash is one blow, however many times the bodies
  // touch while it lasts, and no one blow can finish a vehicle off.
  function hurtVehicle(model, amount, crash = false) {
    if (!model || model.wrecked) return;
    const max = vehicleHealth(model);
    if (model.health === undefined) model.health = max;
    if (crash) {
      amount = Math.min(amount, max * CRASH_SHARE);
      if (clock - (model.crashAt ?? -9) < 1) {
        const more = Math.max(0, amount - model.crashHit);
        model.crashHit += more;
        amount = more;
      } else {
        model.crashAt = clock;
        model.crashHit = amount;
      }
    }
    model.health -= amount;
    if (model.health < max * 0.97) hurtVehicles.add(model);
    if (model.health <= 0 && model.fuse === undefined) model.fuse = FUSE; // it catches
    else if (model.fuse !== undefined) model.fuse -= amount / max; // more hits hurry it along
  }

  // Where the engine is, for the smoke and the first flames: under the front of the bonnet.
  const enginePoint = new THREE.Vector3();
  function engineAt(model) {
    const { hl } = model.dims;
    enginePoint.set(0, model.kind === 'bus' || model.kind === 'truck' ? 1.2 : 0.85, hl - (model.moto ? 0.4 : 0.75));
    model.group.updateWorldMatrix(true, false);
    return enginePoint.applyMatrix4(model.group.matrixWorld);
  }

  function updateVehicleFires(dt) {
    for (const model of hurtVehicles) {
      const max = vehicleHealth(model);
      const share = model.wrecked ? 0 : Math.max(0, model.health) / max;
      const p = engineAt(model);
      if (model.wrecked) {
        // a burnt-out shell: the fire dies down, then a thin smoke for a while
        model.afterburn = (model.afterburn ?? 1) - dt / 30;
        if (model.afterburn <= -1.2) {
          hurtVehicles.delete(model);
          continue;
        }
        const heat = Math.max(0, model.afterburn);
        if (Math.random() < heat * 0.9) flame(p.x + rand(-1, 1), p.y - 0.2 + rand(0, 0.6), p.z + rand(-1, 1), { vy: rand(1.5, 3), life: rand(0.5, 1), size: rand(0.8, 1.8) * (0.4 + heat), grow: 0.4, shade: rand(0.3, 0.9), rise: 1.5 });
        if (Math.random() < 0.35) smoke(p.x + rand(-0.8, 0.8), p.y + 0.6, p.z + rand(-0.8, 0.8), { vy: rand(1.5, 2.5), life: rand(4, 7), size: 1.6, grow: 6, shade: 0.08 + 0.1 * (1 - heat), alpha: 0.5, rise: 0.4 });
        continue;
      }
      // after one big hit a thin grey smoke from under the bonnet; after two it pours out
      // thick and dark, and seeps from the cabin too
      const heavy = share < 0.45;
      const rate = share < 0.97 ? (heavy ? 22 : 10 + (1 - share) * 8) : 0;
      if (Math.random() < rate * dt) {
        smoke(p.x + rand(-0.3, 0.3), p.y + 0.1, p.z + rand(-0.3, 0.3), {
          vx: rand(-0.3, 0.3), vy: rand(1.2, 2.2), vz: rand(-0.3, 0.3), life: rand(2.5, 4.5), size: heavy ? 0.8 : 0.6, grow: rand(3.5, 5.5) * (heavy ? 1.2 : 0.9),
          shade: heavy ? 0.13 : 0.55, alpha: heavy ? 0.62 : 0.45, rise: 0.5,
        });
      }
      if (heavy && Math.random() < 6 * dt) {
        const c = cabinAt(model);
        smoke(c.x + rand(-0.4, 0.4), c.y, c.z + rand(-0.4, 0.4), {
          vx: rand(-0.2, 0.2), vy: rand(0.6, 1.2), vz: rand(-0.2, 0.2), life: rand(2, 3.5), size: 0.45, grow: 3, shade: 0.22, alpha: 0.4, rise: 0.4,
        });
      }
      // caught: the fire takes hold under the bonnet, grows, and then it goes up
      if (model.fuse !== undefined) {
        model.fuse -= dt;
        const hold = Math.min(1, 1.15 - model.fuse / FUSE); // 0.15 at first, 1 at the end
        for (let n = 0; n < 3; n++) {
          if (Math.random() < 0.35 + 0.6 * hold) {
            flame(p.x + rand(-0.5, 0.5) * (0.4 + hold), p.y + rand(-0.1, 0.25), p.z + rand(-0.5, 0.5) * (0.4 + hold), {
              vx: rand(-0.4, 0.4), vy: rand(1.5, 3.2), vz: rand(-0.4, 0.4), life: rand(0.35, 0.8), size: rand(0.5, 1.1) * (0.5 + hold), grow: 0.3, shade: rand(0.4, 1), rise: 2,
            });
          }
        }
        if (model.fuse <= 0) explodeVehicle(model);
      }
    }
  }

  // Middle of the cabin roof, where smoke escapes round the doors and the glass.
  const cabinPoint = new THREE.Vector3();
  function cabinAt(model) {
    const top = { bus: 2.6, truck: 2.4, suv: 1.55, pickup: 1.55, moto: 1.0 }[model.kind] || 1.25;
    cabinPoint.set(0, top, -0.2);
    return cabinPoint.applyMatrix4(model.group.matrixWorld);
  }

  // --- explosions ---

  const blastLight = new THREE.PointLight(0xffa04a, 0, 45, 1.6);
  scene.add(blastLight);
  let blastGlow = 0;
  const debris = []; // { mesh, vx, vy, vz, spin, life }
  const debrisGeo = new THREE.BoxGeometry(0.35, 0.12, 0.5);
  const debrisMat = new THREE.MeshLambertMaterial({ color: 0x1c1b1a });
  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false,
    alphaMap: canvasTexture(128, 128, (g, w) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, w);
      const fade = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2);
      fade.addColorStop(0, '#fff');
      fade.addColorStop(0.55, '#aaa');
      fade.addColorStop(1, '#000');
      g.fillStyle = fade;
      g.fillRect(0, 0, w, w);
    }),
  });

  // A blast at (x, y, z): a fireball, a column of black smoke, pieces flung out, a flash, a
  // boom, and everything near it hurt, knocked flat or set burning in turn.
  function explosion(x, y, z, power = 1, source = null) {
    for (let n = 0; n < 70 * power; n++) {
      const a = Math.random() * Math.PI * 2;
      const up = rand(-0.2, 1);
      const speed = rand(3, 11) * power;
      flame(x + rand(-0.6, 0.6), y + rand(0, 0.8), z + rand(-0.6, 0.6), {
        vx: Math.cos(a) * speed * (1 - up * 0.5), vy: up * speed + 2, vz: Math.sin(a) * speed * (1 - up * 0.5),
        life: rand(0.5, 1.3), size: rand(1.6, 3.6) * power, grow: rand(3, 6) * power, shade: rand(0.5, 1), rise: 3, drag: 3,
      });
    }
    for (let n = 0; n < 45 * power; n++) {
      const a = Math.random() * Math.PI * 2;
      const speed = rand(1, 5);
      smoke(x + rand(-1, 1), y + rand(0.5, 2.5), z + rand(-1, 1), {
        vx: Math.cos(a) * speed, vy: rand(3, 8), vz: Math.sin(a) * speed, life: rand(4, 8), size: rand(2.5, 4), grow: rand(8, 13),
        shade: rand(0.04, 0.14), alpha: 0.85, rise: 0.6, drag: 1.5,
      });
    }
    for (let n = 0; n < 9 * power; n++) {
      const mesh = new THREE.Mesh(debrisGeo, debrisMat);
      mesh.position.set(x, y + 0.8, z);
      mesh.scale.set(rand(0.5, 1.6), rand(0.5, 1.4), rand(0.5, 1.6));
      mesh.castShadow = true;
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const speed = rand(5, 13) * power;
      debris.push({ mesh, vx: Math.cos(a) * speed, vy: rand(6, 14) * power, vz: Math.sin(a) * speed, spin: rand(-9, 9), life: 20 });
    }
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(7 * power, 7 * power).rotateX(-Math.PI / 2), scorchMat);
    const floor = groundAt(x, z, y + 1);
    scorch.position.set(x, floor + (floor < 0.05 ? 0.007 : 0.016), z);
    scorch.renderOrder = 0.8;
    scene.add(scorch);
    blastLight.position.set(x, y + 2, z);
    blastGlow = 1.4 * power;
    playBlast(power, Math.hypot(x - camera.position.x, z - camera.position.z));
    const near = Math.hypot(x - car.x, z - car.z);
    bump = Math.max(bump, Math.min(1, (power * 30) / Math.max(10, near)));

    // what the blast does around it
    const reach = 9 * power;
    for (const w of walkers) {
      const p = w.group.position;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > reach || Math.abs(p.y - y) > 6) continue;
      if (w.state === 'dead' || w.state === 'act') continue;
      const dx = (p.x - x) / (d || 1);
      const dz = (p.z - z) / (d || 1);
      if (onFeet(w) || w.state === 'fight' || w.state === 'flee') hurtWalker(w, d < reach * 0.55 ? 200 : 60, dx, dz, true);
      else if (d < reach * 0.55) w.dying = true;
    }
    for (const a of animals) {
      if (Math.hypot(a.x - x, a.z - z) < reach) {
        a.down = KNOCKED_SECONDS * 2;
        a.group.rotation.z = Math.PI / 2;
      }
    }
    const vehicles = [...traffic.map((c) => c.model), ...highwayTraffic.map((c) => c.model), ...idleCars.map((v) => v.model), ...police.filter((p) => p.active).map((p) => p.model)];
    if (player) vehicles.push(player);
    for (const model of vehicles) {
      if (model === source || model.wrecked) continue;
      const p = model.group.position;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < reach) hurtVehicle(model, 1300 * power * (1 - d / reach) ** 1.3); // close by, it goes up too
    }
    // the hero: on foot he is thrown down and hurt, or killed if right beside it
    if (!hero.dead) {
      const d = Math.hypot(car.x - x, car.z - z);
      const inside = mode === 'car' ? player === source : mode === 'heli' ? heli && heli.model === source : false;
      if (inside) killHero('Blown up');
      else if (d < reach && Math.abs(car.y - y) < 6) {
        hurtHero(130 * power * (1 - d / reach) ** 1.2, 'explosion', car.x - x, car.z - z);
        if (mode === 'foot' && !hero.dead) knockHeroDown(car.x - x, car.z - z, 1.5);
      }
    }
  }

  // A vehicle goes up: the blast, then a charred shell that jumps and drops back, burns out
  // and smoulders. It cannot be driven again.
  function explodeVehicle(model) {
    if (model.wrecked) return;
    model.wrecked = true;
    model.health = 0;
    model.afterburn = 1;
    const p = model.group.position;
    // charred paint, the glass gone, the lamps dead
    for (const material of model.materials || []) {
      material.color.multiplyScalar(0.13); // a loaded model's every surface is scorched
      if (material.specular) material.specular.setHex(0x111111);
    }
    if (model.paint) {
      model.paint.color.setHex(0x1d1c1b);
      model.paint.specular && model.paint.specular.setHex(0x111111);
      model.paint.userData.reflect = 0.02;
    }
    for (const glass of model.glassParts || []) glass.visible = false;
    for (const lamp of [model.headMat, model.tailMat, model.amberL, model.amberR]) {
      if (!lamp) continue;
      lamp.color.setHex(0x0b0b0b);
      if (lamp.userData) lamp.userData.mine = true;
    }
    if (model.beam) model.beam.visible = false;
    if (model.bar) model.bar.forEach((m) => m.color.setHex(0x0b0b0b));
    if (model.flame) model.flame.visible = false;
    hurtVehicles.add(model);

    // whoever was driving does not survive it
    const traffic0 = traffic.find((c) => c.model === model);
    const highway0 = highwayTraffic.find((c) => c.model === model);
    const police0 = police.find((q) => q.model === model);
    const idle0 = idleCars.find((v) => v.model === model);
    for (const owner of [traffic0, highway0]) {
      if (!owner) continue;
      if (owner.driver) model.group.remove(owner.driver);
      if (owner === traffic0) traffic.splice(traffic.indexOf(owner), 1);
      else highwayTraffic.splice(highwayTraffic.indexOf(owner), 1);
      trafficBoxes.splice(trafficBoxes.indexOf(owner.box), 1);
    }
    if (idle0 && idle0.driver) {
      model.group.remove(idle0.driver);
      idle0.driver = null;
    }
    if (police0) {
      // the force sends another car; this one stays where it burnt
      policeBoxes.splice(policeBoxes.indexOf(police0.box), 1);
      police.splice(police.indexOf(police0), 1);
    }
    const h = model.group.rotation.y;
    const y = p.y;
    if (model === player) {
      // he was at the wheel
      killHero('Blown up');
    }
    if (!idle0 && model !== player) addIdleCar(model, p.x, y, p.z, h);
    const entry = idleCars.find((v) => v.model === model);
    if (entry) entry.busy = true; // nobody gets in a burnt-out car
    explosion(p.x, y + 0.6, p.z, model.kind === 'moto' ? 0.6 : model.kind === 'bus' || model.kind === 'truck' ? 1.3 : 1, model);
    // it jumps on the blast and comes down again, turned
    wrecks.push({ model, vy: model.moto ? 4 : 6.5, spin: rand(-1.2, 1.2), roll: rand(-0.25, 0.25), timer: 0 });
    if (traffic0) setTimeout(() => spawnTraffic(), 4000); // traffic carries on, a car short for a moment
    // on the highway a new one comes out of the tunnel behind
    if (highway0) setTimeout(() => addHighwayCar(highway0.lane, -highway0.dir * (HIGHWAY.end - 5)), 5000);
  }

  function updateWrecks(dt) {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i];
      const g = w.model.group;
      w.timer += dt;
      if (w.vy !== null) {
        w.vy -= GRAVITY * dt;
        g.position.y += w.vy * dt;
        g.rotation.y += w.spin * dt;
        g.rotation.z += (w.roll - g.rotation.z) * Math.min(1, 3 * dt);
        let floor = terrain(g.position.x, g.position.z);
        for (const s of indexQuery(surfaceIndex, g.position.x, g.position.z, g.position.x, g.position.z)) {
          const sh = surfaceHeight(s, g.position.x, g.position.z);
          if (sh !== null && sh <= g.position.y + 0.5 && sh > floor) floor = sh;
        }
        if (g.position.y <= floor && w.vy < 0) {
          g.position.y = floor;
          w.vy = Math.abs(w.vy) > 4 ? -w.vy * 0.25 : null; // one small bounce, then it settles
          const entry = idleCars.find((v) => v.model === w.model);
          if (entry && entry.box.car) {
            Object.assign(entry, { x: g.position.x, z: g.position.z, h: g.rotation.y });
            Object.assign(entry.box.car, { x: g.position.x, z: g.position.z, h: g.rotation.y });
          }
        }
      }
      // long burnt out and far from anyone: the wreck is towed away
      if (w.timer > 120 && Math.hypot(g.position.x - car.x, g.position.z - car.z) > 220) {
        scene.remove(g);
        const entry = idleCars.find((v) => v.model === w.model);
        if (entry) {
          idleCars.splice(idleCars.indexOf(entry), 1);
          removeCollider(entry.box);
        }
        hurtVehicles.delete(w.model);
        wrecks.splice(i, 1);
      }
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      const m = d.mesh;
      if (d.vy !== null) {
        d.vy -= GRAVITY * dt;
        m.position.x += d.vx * dt;
        m.position.y += d.vy * dt;
        m.position.z += d.vz * dt;
        m.rotation.x += d.spin * dt;
        m.rotation.z += d.spin * 0.7 * dt;
        const floor = groundAt(m.position.x, m.position.z, m.position.y + 0.3);
        if (m.position.y <= floor + 0.06) {
          m.position.y = floor + 0.06;
          if (Math.abs(d.vy) > 3) {
            d.vy = -d.vy * 0.3;
            d.vx *= 0.5;
            d.vz *= 0.5;
          } else d.vy = null;
        }
      }
      if (d.life <= 0) {
        scene.remove(m);
        debris.splice(i, 1);
      }
    }
    blastGlow = Math.max(0, blastGlow - dt * 3);
    blastLight.intensity = blastGlow * 6;
  }

  // --- the helicopter on fire ---

  // A hard enough knock against a building or a vehicle sets it alight: the fire takes a
  // while to grow, the engine falters, and then it explodes, with anyone still aboard.
  function igniteHeli(force) {
    if (!heli || heli.burning !== undefined) return;
    heli.burning = 0;
    showToast(mode === 'heli' ? 'The helicopter is on fire! Get down and get out (F)' : 'The helicopter is on fire', true);
    playCrash(Math.min(1, force / 18));
    bump = Math.max(bump, 0.6);
  }

  function updateHeliFire(dt) {
    const h = heli;
    if (!h || h.burning === undefined) return;
    h.burning = Math.min(1, h.burning + dt / 11); // about eleven seconds from the first flames to the blast
    const g = h.model.group;
    g.updateWorldMatrix(true, false);
    const at = new THREE.Vector3(0, 2.3, -0.6).applyMatrix4(g.matrixWorld); // the engine, behind the cabin
    const heat = h.burning;
    for (let n = 0; n < 1 + Math.floor(heat * 4); n++) {
      if (Math.random() < 0.35 + heat * 0.6) {
        flame(at.x + rand(-0.5, 0.5), at.y + rand(-0.3, 0.3), at.z + rand(-0.5, 0.5), {
          vx: rand(-0.5, 0.5), vy: rand(1.5, 3), vz: rand(-0.5, 0.5), life: rand(0.3, 0.7), size: rand(0.5, 1.2) * (0.5 + heat * 1.6), grow: 0.3, shade: rand(0.4, 1), rise: 2,
        });
      }
    }
    if (Math.random() < 6 * dt * (0.4 + heat)) {
      smoke(at.x, at.y + 0.5, at.z, { vy: rand(1, 2.5), life: rand(3, 6), size: 0.8, grow: 4 + heat * 5, shade: 0.1, alpha: 0.6 + heat * 0.3, rise: 0.4 });
    }
    if (heat >= 1) explodeHeli();
  }

  function explodeHeli() {
    const h = heli;
    const g = h.model.group;
    const aboard = mode === 'heli';
    // the shell, charred, falls to the ground and lies there
    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) {
        o.material = o.material.clone();
        o.material.color.setHex(0x1b1a19);
        if (o.material.transparent) o.visible = false;
      }
    });
    const shell = { model: { group: g, dims: { hl: 4, hw: 1.3 }, kind: 'heli' }, vy: 0, spin: rand(-0.8, 0.8), roll: rand(-0.6, 0.6), timer: 0 };
    wrecks.push(shell);
    heli = null; // the next call brings a new one
    if (aboard) {
      hero.model.group.visible = false;
      killHero('Blown up in the helicopter');
    }
    explosion(g.position.x, g.position.y + 1.5, g.position.z, 1.2, g);
  }

  // ---------- Health and stamina ----------

  // The hero has 100 health and 100 stamina. Running and fighting tire him, rest brings it
  // back; run dry and he can only walk until he has his breath back. Health comes back by
  // itself up to 60 if nothing hurts him for a while. Falls, punches, crashes and blasts
  // take it away; at nothing he is dead, and starts again where the game began.
  Object.assign(hero, {
    health: 100, stamina: 100, exhausted: false, lastHurt: -99, dead: null, down: null, sprinting: false, landing: 0,
  });
  const STAMINA_RUN = 15; // per second spent running
  const STAMINA_BACK = 22; // per second recovered standing still (less when walking)

  function hurtHero(amount, cause, dx = 0, dz = 0) {
    if (hero.dead || amount <= 0) return;
    hero.health -= amount;
    hero.lastHurt = clock;
    const pain = $('pain');
    pain.style.opacity = Math.min(0.85, 0.25 + amount / 60);
    if (hero.health <= 0) killHero(cause, dx, dz);
  }

  // (dx, dz): the way the blow that killed him was going, if it pushed him
  function killHero(cause, dx = 0, dz = 0) {
    if (hero.dead) return;
    hero.health = 0;
    hero.dead = { t: 0, cause };
    startHeroFall(dx, dz);
    keys.clear();
    $('wasted').hidden = false;
    $('wasted-cause').textContent = cause;
    if (document.exitPointerLock) document.exitPointerLock();
  }

  // Thrown off his feet by a blast or a heavy blow: flat on his back, then up again.
  // `rate`: how fast he goes down (a fall from high up is over at once).
  function knockHeroDown(dx, dz, rate = 1.2) {
    if (hero.dead || mode !== 'foot') return;
    const d = Math.hypot(dx, dz) || 1;
    hero.down = { t: 0, dx: dx / d, dz: dz / d, rate };
    hero.fight.move = null;
    startHeroFall(dx, dz);
  }

  // He starts going down where he stands: forwards, unless the blow sends him back.
  function startHeroFall(dx, dz) {
    if (hero.fallAt) return; // already on his way down
    const ahead = dx * Math.sin(hero.facing) + dz * Math.cos(hero.facing);
    hero.fallDir = (dx || dz) && ahead < 0 ? -1 : 1;
    hero.fallSide = Math.random() < 0.5 ? 1 : -1;
    hero.ct = 0;
    hero.fallAt = { x: car.x, y: groundAt(car.x, car.z, car.y + 0.3), z: car.z, h: hero.facing };
    const k = hero.skin;
    if (k && !hero.legs && mode === 'foot') hero.legs = measureBody(hero.model.group, heroBone);
  }

  // Landing from a fall of `drop` metres: a jolt, then more and more hurt past about 4 m,
  // and a fall from very high (about 15 m and up) is usually the end of him.
  function landed(drop) {
    if (hero.dead || drop < 2) return;
    if (mode === 'foot') {
      hero.landing = Math.min(0.7, 0.2 + drop * 0.04); // knees bend to take it
      bump = Math.max(bump, Math.min(1, drop / 12));
      if (drop > 4) {
        const harm = (drop - 4) * 8 * rand(0.85, 1.25) + Math.max(0, drop - 13) * 14;
        hurtHero(harm, 'Fell to his death');
        if (!hero.dead && drop > 7) knockHeroDown(Math.sin(hero.facing), Math.cos(hero.facing), 1.9); // thrown flat by it
      }
      if (drop > 3) playCrash(Math.min(0.5, drop / 30));
    } else if (mode === 'car' && player) {
      // a car dropped from a height: the car takes most of it, the driver some
      if (drop > 2.5) {
        hurtVehicle(player, (drop - 2.5) * 140, true);
        damageCar(player, car.x, car.y, car.z, 0, 0, Math.min(25, drop * 2.2));
        playCrash(Math.min(1, drop / 15));
      }
      if (drop > 8) hurtHero((drop - 8) * 5, 'Crashed');
    } else if (drop > 3) {
      hurtHero((drop - 3) * 6, 'Fell to his death');
    }
  }

  function updateVitals(dt) {
    // stamina: drained by running, recovered at rest, faster standing still
    const still = Math.hypot(car.vx, car.vz) < 0.3 || mode !== 'foot';
    if (hero.sprinting) hero.stamina = Math.max(0, hero.stamina - STAMINA_RUN * dt);
    else hero.stamina = Math.min(100, hero.stamina + (still ? STAMINA_BACK : STAMINA_BACK * 0.55) * dt);
    if (hero.stamina <= 0) hero.exhausted = true;
    if (hero.stamina >= 35) hero.exhausted = false;
    // health creeps back to 60 after eight quiet seconds
    if (!hero.dead && clock - hero.lastHurt > 8 && hero.health < 60) hero.health = Math.min(60, hero.health + 1.5 * dt);
    hero.landing = Math.max(0, hero.landing - dt);

    const health = Math.max(0, hero.health);
    $('health-bar').style.width = `${health}%`;
    $('health-bar').parentElement.classList.toggle('low', health < 25);
    $('stamina-bar').style.width = `${hero.stamina}%`;
    $('stamina-bar').parentElement.classList.toggle('low', hero.exhausted);
    const pain = $('pain');
    const fade = Math.max(health < 25 ? 0.3 : 0, Number(pain.style.opacity || 0) - dt * 1.2);
    pain.style.opacity = fade;

    if (hero.dead) {
      hero.dead.t += dt;
      if (hero.dead.t > 5) respawn();
    }
  }

  // Back on his feet where the game began, the slate wiped clean.
  function respawn() {
    if (mode === 'car' && player) {
      const model = player;
      const at = model.group.position.clone();
      const turn = model.group.rotation.y;
      const parked = releasePlayerCar();
      parked.busy = !!model.wrecked;
      if (model.wrecked) {
        // leave the shell where it came to rest
        model.group.position.copy(at);
        model.group.rotation.y = turn;
        Object.assign(parked, { x: at.x, y: at.y, z: at.z, h: turn });
        Object.assign(parked.box.car, { x: at.x, z: at.z, h: turn });
      }
    } else if (mode === 'horse' && horse) {
      horse.speed = 0;
      car.y = groundAt(car.x, car.z, car.y);
      dismountHorse();
    } else if (mode === 'bike' && bike) {
      bike.speed = 0;
      car.y = groundAt(car.x, car.z, car.y);
      dismountBike();
    } else if (mode === 'heli') {
      if (heli) heli.flown = false;
    }
    act = null;
    scene.add(hero.model.group);
    setMode('foot');
    hero.model.group.visible = true;
    Object.assign(car, { x: START.x + 3, y: 0, z: START.z, vx: 0, vy: 0, vz: 0, heading: START.heading });
    Object.assign(hero, { health: 100, stamina: 100, exhausted: false, dead: null, down: null, landing: 0, yaw: START.heading, facing: START.heading, pitch: 0,
      fallAt: null, collapse: null, ct: 0, fade: null });
    hero.fight = newFight();
    hero.model.group.rotation.set(0, hero.facing, 0);
    setWanted(0);
    $('wasted').hidden = true;
    updateCamera(0, 0, true);
  }

  const heroBone = (key) => hero.skin && hero.skin.bones[key] && hero.skin.bones[key].bone;
  const heroAt = new THREE.Vector3();

  // The hero dead or knocked flat: his knees go and he drops onto them (or onto his seat)
  // and over (see collapseAt), hands out to save himself unless he is dead. Knocked down,
  // he lies a moment, comes to, and gets up step by step and dusts himself off (see
  // getUpPlan); the keys can cut the dusting short.
  function updateHeroDown(dt) {
    const m = hero.model;
    if (!hero.fallAt) startHeroFall(0, 0);
    const at = hero.fallAt;
    const end = collapseEnd(hero.fallDir);
    const full = hero.skin && hero.legs && hero.legs.torso;
    car.vx = car.vz = 0;
    m.group.rotation.order = 'YXZ';
    if (hero.down && !hero.dead) {
      const d = hero.down;
      d.t += dt;
      // shoved along the blow as he goes
      if (d.t < 0.5) {
        const push = 6 * (0.5 - d.t) * dt;
        at.x += d.dx * push;
        at.z += d.dz * push;
      }
      if (d.plan) {
        d.g += dt;
        const walking = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].some((code) => keys.has(code));
        if (d.g >= d.plan.end || (walking && d.g > d.plan.dustFrom + 0.15)) {
          finishGettingUp(d.plan, d.g < d.plan.end);
          return;
        }
        hero.collapse = getUpPose(d.plan, d.g, at, hero.legs, m.group);
        fromFacing(at, 0, hero.collapse.hipF, 0, heroAt); // the camera stays with him
        Object.assign(car, { x: heroAt.x, y: at.y, z: heroAt.z });
        return;
      }
      if (d.lie === undefined) {
        hero.ct = Math.min(end, hero.ct + dt * d.rate);
        if (hero.ct >= end) d.lie = 0;
      } else {
        d.lie += dt;
      }
      if (d.lie > 0.9) {
        if (full) {
          d.plan = getUpPlan(hero.fallDir, sampleBody(m.group, heroBone, at, hero.legs, hero.collapse && hero.collapse.keys), hero.legs);
          d.g = 0;
        } else {
          // the built-in figure: up the way it went down
          hero.ct = Math.max(0, hero.ct - dt * 0.9);
          if (hero.ct <= 0) {
            finishGettingUp(null, false);
            return;
          }
        }
      }
    } else {
      hero.ct = Math.min(end, hero.ct + dt);
    }
    if (full) {
      const c = collapseAt(hero.ct, hero.fallDir, hero.fallSide, hero.legs);
      m.group.position.set(at.x + Math.sin(at.h) * c.hf, at.y + c.hy, at.z + Math.cos(at.h) * c.hf);
      m.group.rotation.set(c.pitch, at.h, 0);
      hero.collapse = { ...c, brace: hero.dead ? 0 : hero.fallDir, at };
      fromFacing(at, 0, c.hf + hero.legs.hip * Math.sin(c.pitch), 0, heroAt); // the camera follows the hips
      Object.assign(car, { x: heroAt.x, y: at.y, z: heroAt.z });
    } else {
      // the built-in figure: simply over
      const tip = smooth(hero.ct / end);
      Object.assign(car, { x: at.x, y: at.y, z: at.z });
      m.group.position.set(at.x, at.y + 0.12 * tip, at.z);
      m.group.rotation.set(-hero.fallDir * tip * Math.PI / 2 * 0.96, at.h, 0);
    }
  }

  // On his feet again, where the get-up left him; if he walked off mid-dusting, his arms
  // and trunk ease back over a moment rather than snapping.
  function finishGettingUp(plan, cutShort) {
    const m = hero.model;
    const at = hero.fallAt;
    const spot = fromFacing(at, 0, plan ? plan.stand : 0, 0, new THREE.Vector3());
    if (cutShort && hero.skin && hero.collapse) {
      m.group.updateMatrixWorld(true);
      const inverse = m.group.getWorldQuaternion(new THREE.Quaternion()).invert();
      const arms = [['armL', 'foreL'], ['foreL', 'handL'], ['armR', 'foreR'], ['foreR', 'handR']].map(([key, child]) => {
        const from = heroBone(key).getWorldPosition(new THREE.Vector3());
        return [key, child, heroBone(child).getWorldPosition(new THREE.Vector3()).sub(from).normalize().applyQuaternion(inverse)];
      });
      hero.fade = { arms, keys: { ...hero.collapse.keys }, w: 1 };
    }
    Object.assign(car, { x: spot.x, y: at.y, z: spot.z, vx: 0, vz: 0 });
    hero.facing = at.h;
    hero.down = null;
    hero.fallAt = null;
    hero.collapse = null;
    m.group.position.set(spot.x, at.y, spot.z);
    m.group.rotation.set(0, at.h, 0);
  }

  // ---------- Fighting ----------

  // Fist fights, for the hero and for the people he picks on. A fighter stands in a guard:
  // left foot forward, knees soft, chin down, hands up by the face. From it come the jab
  // (lead hand straight), the cross (rear hand, the hips and shoulders turning through),
  // the hook (lead hand round in an arc, elbow up) and the uppercut (dip, then rear hand
  // driven upward); a kick for someone already on the ground; a block with both forearms
  // up; and the jolt of being hit, head snapped back or round. Each pose says where each
  // arm and forearm points in the body's own frame (x to its left, y up, z forward), how
  // the shoulders turn, the lean, the head, and the bend in the knees.
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const GUARD = {
    aim: { armL: V3(0.12, -0.6, 0.72), foreL: V3(-0.22, 0.74, 0.6), armR: V3(-0.18, -0.72, 0.48), foreR: V3(0.34, 0.84, 0.34) },
    keys: { twist: -0.3, spine: 0.13, neck: 0.16, crouch: 0.07, legL: -0.22, kneeL: 0.3, legR: 0.2, kneeR: 0.38, legSplay: 0.1, headTurn: 0, lean: 0 },
  };
  const FIGHT_MOVES = {
    jab: {
      dur: 0.42, hit: 0.14, reach: 1.35, damage: 9, stamina: 4, step: 0.14,
      strike: { aim: { armL: V3(0.04, 0.1, 1), foreL: V3(-0.03, 0.08, 1) }, keys: { twist: -0.6, spine: 0.2, neck: 0.2, legL: -0.32, kneeL: 0.36 } },
    },
    cross: {
      dur: 0.5, hit: 0.19, reach: 1.42, damage: 15, stamina: 6, step: 0.1,
      wind: { at: 0.07, keys: { twist: -0.42 } },
      strike: { aim: { armR: V3(0.25, 0.1, 1), foreR: V3(0.2, 0.08, 1) }, keys: { twist: 0.48, spine: 0.24, neck: 0.15, legR: 0.07, kneeR: 0.2, crouch: 0.09, lean: -0.04 } },
    },
    hook: {
      dur: 0.58, hit: 0.27, reach: 1.15, damage: 18, stamina: 7, step: 0.06,
      wind: { at: 0.12, aim: { armL: V3(0.55, -0.2, 0.75), foreL: V3(-0.3, 0.55, 0.75) }, keys: { twist: -0.62, crouch: 0.11, lean: 0.06 } },
      strike: { aim: { armL: V3(0.85, 0.14, 0.5), foreL: V3(-0.9, 0.06, 0.42) }, keys: { twist: 0.42, spine: 0.17, crouch: 0.1, lean: -0.05 } },
    },
    uppercut: {
      dur: 0.64, hit: 0.32, reach: 1.05, damage: 23, stamina: 8, step: 0.08,
      wind: { at: 0.17, aim: { armR: V3(-0.12, -0.86, 0.4), foreR: V3(0.25, 0.22, 0.95) }, keys: { crouch: 0.18, spine: 0.32, twist: -0.18, lean: -0.1 } },
      strike: { aim: { armR: V3(0.16, -0.45, 0.88), foreR: V3(0.12, 0.72, 0.68) }, keys: { crouch: 0.0, spine: 0.06, twist: 0.32, neck: -0.04 } },
    },
    kick: {
      dur: 0.82, hit: 0.44, reach: 1.7, damage: 14, stamina: 8, step: 0.16,
      wind: {
        at: 0.26,
        aim: { legR: V3(-0.04, -0.78, -0.62), kneeR: V3(-0.04, -0.3, -0.95), armL: V3(0.5, -0.65, 0.45), foreL: V3(0.2, -0.05, 1), armR: V3(-0.55, -0.8, 0.0), foreR: V3(-0.25, -0.6, 0.6) },
        keys: { spine: 0.1, neck: 0.38, twist: 0.12, crouch: 0.05, kneeL: 0.25 },
      },
      strike: {
        aim: { legR: V3(0.02, -0.68, 0.73), kneeR: V3(0.02, -0.92, 0.38), armL: V3(0.62, -0.62, 0.1), foreL: V3(0.35, -0.3, 0.85), armR: V3(-0.6, -0.55, 0.45), foreR: V3(-0.2, -0.2, 0.95) },
        keys: { spine: -0.16, neck: 0.46, twist: -0.1, crouch: 0.03, kneeL: 0.22 },
      },
    },
  };
  const BLOCK = {
    aim: { armL: V3(0.06, -0.12, 0.99), foreL: V3(-0.22, 0.96, 0.14), armR: V3(-0.06, -0.12, 0.99), foreR: V3(0.22, 0.96, 0.14) },
    keys: { crouch: 0.11, neck: 0.34, spine: 0.22, twist: -0.08 },
  };
  const HURT = {
    aim: { armL: V3(0.28, -0.92, 0.2), foreL: V3(0.05, -0.25, 0.97), armR: V3(-0.28, -0.92, 0.16), foreR: V3(-0.05, -0.25, 0.97) },
    keys: { neck: -0.48, spine: -0.22, crouch: 0.03 },
  };
  const COMBO = ['jab', 'cross', 'hook', 'uppercut'];

  const newFight = () => ({ guard: 0, move: null, react: null, block: 0, combo: -1, comboAt: -9, lastAction: -9, cooldown: rand(0.4, 1), circle: Math.random() < 0.5 ? 1 : -1, circleT: 0, timer: 0, target: null, closing: null });
  hero.fight = newFight();

  // Mixes pose `b` into pose `a` by k (aim directions and keys), returning a new pose.
  function mixPose(a, b, k) {
    if (!b || k <= 0) return a;
    const aim = { ...a.aim };
    for (const [key, dir] of Object.entries(b.aim || {})) aim[key] = aim[key] ? aim[key].clone().lerp(dir, k).normalize() : dir;
    const keys = { ...a.keys };
    for (const [key, v] of Object.entries(b.keys || {})) keys[key] = (keys[key] || 0) + (v - (keys[key] || 0)) * k;
    return { aim, keys };
  }

  // The pose of a fighter now: the guard, through whatever move or block or hurt is on.
  function fightPose(f) {
    let pose = GUARD;
    const m = f.move;
    if (m) {
      const spec = FIGHT_MOVES[m.type];
      const t = m.t;
      const windAt = spec.wind ? spec.wind.at : 0;
      // drawing back, then fast out to the target, a beat there, and home to the guard
      const wind = spec.wind ? smooth(t / windAt) : 0;
      const out = t < windAt ? 0 : 1 - (1 - Math.min(1, (t - windAt) / Math.max(0.01, spec.hit - windAt))) ** 2.2;
      const home = smooth((t - spec.hit - 0.06) / (spec.dur - spec.hit - 0.06));
      if (spec.wind) pose = mixPose(pose, spec.wind, wind * (1 - out));
      pose = mixPose(pose, spec.strike, out * (1 - home));
    }
    if (f.block > 0.01) pose = mixPose(pose, BLOCK, f.block);
    if (f.react) {
      const r = f.react;
      const k = Math.min(1, r.t / 0.07) * (1 - smooth((r.t - 0.12) / (r.dur - 0.12)));
      // a hook turns the head round, a straight punch snaps it back
      const hurt = { aim: HURT.aim, keys: { ...HURT.keys } };
      if (r.blocked) {
        pose = mixPose(pose, BLOCK, k);
        pose = mixPose(pose, { keys: { neck: 0.1, spine: 0.05, crouch: 0.12 } }, k);
      } else {
        if (r.kind === 'hook') {
          hurt.keys.headTurn = r.side * 0.6;
          hurt.keys.neck = -0.18;
          hurt.keys.twist = r.side * 0.3;
        } else if (r.kind === 'uppercut') {
          hurt.keys.neck = -0.7;
          hurt.keys.spine = -0.3;
        }
        pose = mixPose(pose, hurt, k);
      }
    }
    return pose;
  }

  // --- the hero's fists ---

  // Clicking with the fists: the next punch of a combination (jab, cross, hook, uppercut)
  // if the last one landed lately, a kick if someone is down in front of him.
  function heroAttack() {
    const f = hero.fight;
    if (hero.down || hero.dead) return;
    if (f.move || f.closing) {
      if (f.closing || f.move.t > FIGHT_MOVES[f.move.type].hit * 0.6) f.queued = true; // the next one follows on
      return;
    }
    if (f.react && f.react.t < f.react.dur * 0.6) return;
    // whoever he means: someone standing where he looks (or faces), else someone down
    const target = pickTarget();
    const downed = target ? null : findDowned();
    let type;
    if (downed) type = 'kick';
    else {
      f.combo = clock - f.comboAt < 1.0 ? (f.combo + 1) % COMBO.length : 0;
      type = COMBO[f.combo];
    }
    f.target = target;
    f.lastAction = clock;
    if (target) {
      provoke(target); // he stops and squares up (or cowers) as the hero comes at him
      const p = target.group.position;
      const d = Math.hypot(p.x - car.x, p.z - car.z);
      hero.facing = Math.atan2(p.x - car.x, p.z - car.z);
      if (d > FIGHT_MOVES[type].reach + 0.1) {
        // out of reach: a couple of quick steps in, and the blow follows
        f.closing = { type, t: 0 };
        return;
      }
    }
    startHeroMove(type, downed);
  }

  function startHeroMove(type, downed = null) {
    const f = hero.fight;
    const spec = FIGHT_MOVES[type];
    const tired = hero.stamina < spec.stamina;
    hero.stamina = Math.max(0, hero.stamina - spec.stamina);
    f.move = { type, t: 0, landed: false, downed, slow: tired ? 1.35 : 1, stepped: 0, lunge: 0 };
    f.lastAction = clock;
    f.queued = false;
    f.closing = null;
    // square up to whoever he is after, and step in if the boot will not reach
    const target = downed || (f.target && onFeet(f.target) ? f.target : nearestOpponent(3));
    if (target) {
      const p = downed ? downed.at : target.group.position;
      const d = Math.hypot(p.x - car.x, p.z - car.z);
      hero.facing = Math.atan2(p.x - car.x, p.z - car.z);
      if (downed) f.move.lunge = Math.max(0, Math.min(0.6, d - 1.15));
    }
  }

  // Who the hero means to hit: someone on their feet close by, the way the camera looks
  // or the way he faces, the nearest and most squarely in front first.
  function pickTarget(range = 3.4) {
    const lx = Math.sin(hero.yaw);
    const lz = Math.cos(hero.yaw);
    const fx = Math.sin(hero.facing);
    const fz = Math.cos(hero.facing);
    let best = null;
    let bestScore = Infinity;
    for (const w of walkers) {
      if (!onFeet(w) || w.state === 'act') continue;
      const p = w.group.position;
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > range || Math.abs(p.y - car.y) > 1.2) continue;
      const ahead = d > 0.3 ? Math.max((dx * lx + dz * lz) / d, (dx * fx + dz * fz) / d) : 1;
      if (ahead < 0.25) continue;
      const score = d - 1.5 * ahead;
      if (score < bestScore) {
        best = w;
        bestScore = score;
      }
    }
    return best;
  }

  // The nearest person (or dog) on their feet in front of the hero within `reach`.
  function nearestOpponent(reach, cone = 0.55) {
    const fx = Math.sin(hero.facing);
    const fz = Math.cos(hero.facing);
    let best = null;
    let bestDist = reach;
    for (const w of walkers) {
      if (!onFeet(w)) continue;
      const p = w.group.position;
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > bestDist || Math.abs(p.y - car.y) > 1.2) continue;
      if (d > 0.4 && (dx * fx + dz * fz) / d < cone) continue;
      best = w;
      bestDist = d;
    }
    return best;
  }

  // Someone lying in front of him: a person knocked down or dead, or a downed animal.
  function findDowned() {
    const fx = Math.sin(hero.yaw);
    const fz = Math.cos(hero.yaw);
    const inFront = (x, z, y) => {
      const dx = x - car.x;
      const dz = z - car.z;
      const d = Math.hypot(dx, dz);
      return d < 2.1 && Math.abs(y - car.y) < 1 && (d < 0.5 || (dx * fx + dz * fz) / d > 0.3) ? d : Infinity;
    };
    let best = null;
    let bestDist = Infinity;
    for (const w of walkers) {
      if (!['down', 'dead', 'fall'].includes(w.state)) continue;
      const at = bodyCentre(w);
      const d = inFront(at.x, at.z, w.group.position.y);
      if (d < bestDist) {
        best = { walker: w, group: w.group, at };
        bestDist = d;
      }
    }
    for (const a of animals) {
      if (a.down <= 0) continue;
      const d = inFront(a.x, a.z, a.y);
      if (d < bestDist) {
        best = { animal: a, group: a.group, at: a.group.position };
        bestDist = d;
      }
    }
    return best;
  }

  // The hero's fight, each frame on foot: the guard comes up when there is trouble near,
  // moves play out (with a step in behind each), and blows land when the fist arrives.
  function updateHeroFight(dt, moving, running = false) {
    const f = hero.fight;
    const fists = hero.weapon === 'fist';
    if (running) {
      // breaking into a run drops the fight at once: no guard, no follow-up, and the
      // last blow's recovery cut short
      if (f.move && f.move.landed) f.move = null;
      f.closing = null;
      f.queued = false;
      f.target = null;
      f.lastAction = -9;
    }
    const foes = walkers.some((w) => w.state === 'fight' && !w.fight.timid && Math.hypot(w.group.position.x - car.x, w.group.position.z - car.z) < 9);
    const engaged = fists && !hero.down && !running && (f.move || f.react || f.closing || clock - f.lastAction < (moving ? 1.2 : 3) || foes);
    f.guard = approach(f.guard, engaged ? 1 : 0, (engaged ? 6 : running ? 12 : 3) * dt);
    if (f.closing) {
      // stepping in on his man, quick and light, before the blow
      const c = f.closing;
      c.t += dt;
      const target = f.target;
      if (!target || !onFeet(target) || c.t > 0.7) {
        f.closing = null;
        if (target && onFeet(target)) startHeroMove(c.type);
      } else {
        const p = target.group.position;
        const dx = p.x - car.x;
        const dz = p.z - car.z;
        const d = Math.hypot(dx, dz);
        hero.facing = Math.atan2(dx, dz);
        if (d <= FIGHT_MOVES[c.type].reach - 0.05) startHeroMove(c.type);
        else {
          const step = Math.min(d - FIGHT_MOVES[c.type].reach + 0.1, 3.6 * dt);
          car.x += (dx / d) * step;
          car.z += (dz / d) * step;
          car.vx = (dx / d) * 3.6;
          car.vz = (dz / d) * 3.6;
          pushHeroOut(0.4);
        }
      }
    }
    if (f.react) {
      f.react.t += dt;
      // knocked back a step by the blow
      if (f.react.t < 0.22) {
        car.x += f.react.dx * 1.1 * dt;
        car.z += f.react.dz * 1.1 * dt;
        pushHeroOut(0.4);
      }
      if (f.react.t >= f.react.dur) f.react = null;
    }
    const m = f.move;
    if (m) {
      const spec = FIGHT_MOVES[m.type];
      m.t += dt / m.slow;
      // the step in behind the punch
      const want = (spec.step + (m.lunge || 0)) * smooth(m.t / spec.hit);
      const step = want - m.stepped;
      m.stepped = want;
      car.x += Math.sin(hero.facing) * step;
      car.z += Math.cos(hero.facing) * step;
      pushHeroOut(0.4);
      if (!m.landed && m.t >= spec.hit) {
        m.landed = true;
        landBlow(m);
      }
      if (m.t >= spec.dur) {
        f.move = null;
        f.comboAt = clock;
        if (f.queued) heroAttack();
      }
    }
    // keep facing whoever he is fighting
    if (f.target && (!onFeet(f.target) || Math.hypot(f.target.group.position.x - car.x, f.target.group.position.z - car.z) > 6)) f.target = null;
    const foe = f.guard > 0.4 ? f.target || nearestOpponent(4, -1) : null;
    if (foe && !moving && !f.closing) {
      const p = foe.group.position;
      hero.facing += wrapAngle(Math.atan2(p.x - car.x, p.z - car.z) - hero.facing) * Math.min(1, 8 * dt);
    }
    hero.fightPose = f.guard > 0.01 ? fightPose(f) : null;
  }

  // The moment the fist (or the boot) arrives: whoever is there is hit.
  function landBlow(m) {
    const spec = FIGHT_MOVES[m.type];
    const fx = Math.sin(hero.facing);
    const fz = Math.cos(hero.facing);
    if (m.type === 'kick') {
      const target = m.downed;
      if (!target) return;
      const p = target.at;
      if (Math.hypot(p.x - car.x, p.z - car.z) > spec.reach) return;
      playPunch(false, 0.9);
      if (target.animal) {
        target.animal.down = Math.max(target.animal.down, KNOCKED_SECONDS);
        return;
      }
      const w = target.walker;
      w.health -= spec.damage;
      w.timer = Math.max(w.timer || 0, 2.5); // keeps him down
      g2push(w.fallAt || w.group.position, fx, fz, 0.18);
      if (w.health < -45 && w.state !== 'dead') {
        w.dying = true;
        if (w.state === 'down') {
          w.state = 'dead';
          w.timer = 30;
        }
      }
      return;
    }
    // the man he is squared up to, if the fist can get there, else whoever is in front
    let target = null;
    const locked = hero.fight.target;
    if (locked && onFeet(locked)) {
      const dx = locked.group.position.x - car.x;
      const dz = locked.group.position.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < spec.reach + 0.35 && (d < 0.4 || (dx * fx + dz * fz) / d > 0.3)) target = locked;
    }
    target = target || nearestOpponent(spec.reach + 0.15, 0.4);
    if (!target) {
      playWhoosh();
      return;
    }
    strikeWalker(target, m.type, fx, fz);
  }
  const g2push = (pos, fx, fz, d) => {
    pos.x += fx * d;
    pos.z += fz * d;
  };

  // A punch from the hero landing on a pedestrian.
  function strikeWalker(w, type, dx, dz) {
    const spec = FIGHT_MOVES[type];
    if (!w.isPerson) {
      // a dog is simply bowled over
      playPunch(false, 0.8);
      hurtWalker(w, 20, dx, dz, true);
      return;
    }
    if (!w.fight) w.fight = newFight();
    const f = w.fight;
    const p = w.group.position;
    // a block only stops what comes at him from in front
    const facing = Math.sin(w.group.rotation.y) * -dx + Math.cos(w.group.rotation.y) * -dz;
    const blocked = w.state === 'fight' && f.block > 0.5 && facing > 0.5;
    const damage = spec.damage * (blocked ? (f.timid ? 0.6 : 0.2) : 1) * (hero.exhausted ? 0.6 : 1); // a coward's arms keep little out
    w.health -= damage;
    playPunch(blocked, Math.min(1, damage / 20));
    if (w.health <= 0) {
      // out cold: the knees go and he drops the way the blow sends him
      w.fight = null;
      w.actMove = 0;
      w.dying = w.health < -35;
      if (w.stolen === undefined || w.away) setPavementGoal(w, p.x, p.z);
      w.away = true;
      w.baseY = p.y;
      startFall(w, dx, dz);
      if (hero.fight.target === w) hero.fight.target = null;
      setWanted(wanted + 1);
      showToast(wanted === 1 ? 'Wanted! Police are coming' : 'Wanted level up', true);
      return;
    }
    f.move = null;
    f.react = { t: 0, dur: blocked ? 0.3 : 0.48, dx, dz, kind: type, blocked, side: type === 'hook' ? -1 : 1 };
    if (w.state === 'fight' && f.timid) f.scared = true; // he has had enough: he runs once he can
    else if (w.state !== 'fight' && w.state !== 'flee') {
      // caught off guard: he squares up to fight, or runs for it
      provoke(w);
      if (w.fight.timid) w.fight.scared = true;
    }
  }

  // Picked on by the hero: a person stops what he is doing and turns to face him, fists
  // up if he means to fight (most men, a good many women), forearms up to shield his
  // face if not, and he runs at the first blow.
  function provoke(w) {
    if (!w.isPerson || !onFeet(w) || ['fight', 'flee', 'stagger', 'act'].includes(w.state)) return;
    if (w.brave === undefined) w.brave = Math.random() < (w.female ? 0.6 : 0.85);
    const p = w.group.position;
    w.away = true;
    w.baseY = p.y;
    w.pose = null;
    w.actMove = 0;
    w.group.rotation.x = w.group.rotation.z = 0;
    const react = w.fight && w.fight.react;
    w.fight = newFight();
    w.fight.react = react;
    w.fight.timid = !w.brave;
    w.fight.cooldown = rand(0.45, 0.9);
    w.state = 'fight';
  }

  // --- pedestrians who fight back, or run ---

  function updateFighter(w, dt) {
    const g = w.group;
    if (w.state === 'flee') {
      // running flat out away from the hero, then back to some pavement
      w.timer -= dt;
      const dx = g.position.x - car.x;
      const dz = g.position.z - car.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = 4.6 * dt;
      stepWalker(w, (dx / d) * step, (dz / d) * step);
      g.rotation.set(0.1, Math.atan2(dx, dz), 0);
      w.actMove = 1;
      w.actSpeed = 4.6;
      w.pose = null;
      if (w.timer <= 0 || d > 45) {
        g.rotation.x = 0;
        setPavementGoal(w, g.position.x, g.position.z);
        w.state = 'goto';
      }
      return true;
    }
    if (w.state !== 'fight') return false;
    const f = w.fight;
    f.timer += dt;
    const dx = car.x - g.position.x;
    const dz = car.z - g.position.z;
    const d = Math.hypot(dx, dz) || 1;
    // the hero gone (into a car, too far, or dead): the fight is over
    if (mode !== 'foot' || hero.dead || d > 14 || f.timer > 45) {
      w.state = 'goto';
      w.pose = null;
      w.actMove = 0;
      setPavementGoal(w, g.position.x, g.position.z);
      return true;
    }
    const toHero = Math.atan2(dx, dz);
    g.rotation.set(0, g.rotation.y + wrapAngle(toHero - g.rotation.y) * Math.min(1, (f.react ? 2 : 8) * dt), 0);
    w.actMove = 0;
    w.actSpeed = 0;
    f.guard = approach(f.guard, 1, 5 * dt);
    if (f.timid) {
      // no fighter: hands up over his face, backing off; hit (or given a moment) he runs
      if (f.react) {
        f.react.t += dt;
        if (f.react.t < 0.25) stepWalker(w, f.react.dx * 1.2 * dt, f.react.dz * 1.2 * dt);
        if (f.react.t >= f.react.dur) f.react = null;
      } else if (d < 2.2) {
        stepWalker(w, (-dx / d) * 0.7 * dt, (-dz / d) * 0.7 * dt);
        w.actMove = 0.6;
        w.actSpeed = -0.7;
      }
      f.block = approach(f.block, 1, 8 * dt);
      if ((f.scared && !f.react) || f.timer > 2.2) {
        w.state = 'flee';
        w.timer = rand(7, 11);
        w.pose = null;
        return true;
      }
      w.pose = fightPose(f);
      w.pose.weight = f.guard;
      g.position.y = groundAt(g.position.x, g.position.z, g.position.y + 0.3) - (w.pose.keys.crouch || 0) * 0.6;
      return true;
    }
    if (f.react) {
      f.react.t += dt;
      if (f.react.t < 0.25) stepWalker(w, f.react.dx * 1.2 * dt, f.react.dz * 1.2 * dt);
      if (f.react.t >= f.react.dur) {
        f.react = null;
        // stung: often he hits straight back
        f.cooldown = Math.min(f.cooldown, rand(0.1, 0.5));
      }
    } else if (f.move) {
      const spec = FIGHT_MOVES[f.move.type];
      f.move.t += dt;
      const want = spec.step * smooth(f.move.t / spec.hit);
      const step = want - f.move.stepped;
      f.move.stepped = want;
      stepWalker(w, Math.sin(g.rotation.y) * step, Math.cos(g.rotation.y) * step);
      if (!f.move.landed && f.move.t >= spec.hit) {
        f.move.landed = true;
        // it lands if the hero is in reach and in front of him
        const ahead = (dx * Math.sin(g.rotation.y) + dz * Math.cos(g.rotation.y)) / d;
        if (d < spec.reach + 0.1 && ahead > 0.6 && !hero.down && mode === 'foot') punchHero(f.move.type, -dx / d, -dz / d);
        else playWhoosh();
      }
      if (f.move.t >= spec.dur) {
        f.move = null;
        f.cooldown = rand(0.6, 1.5);
      }
    } else {
      // footwork: in to just beyond arm's length, back off if crowded, circle now and then
      f.cooldown -= dt;
      f.circleT -= dt;
      if (f.circleT <= 0) {
        f.circle = Math.random() < 0.5 ? 1 : -1;
        f.circleT = rand(1, 2.5);
      }
      let mx = 0;
      let mz = 0;
      let pace = 0;
      if (d > 1.3) {
        mx = dx / d;
        mz = dz / d;
        pace = d > 4 ? 2.6 : 1.3;
      } else if (d < 0.8) {
        mx = -dx / d;
        mz = -dz / d;
        pace = -1.0;
      } else if (f.circleT > 1) {
        mx = (-dz / d) * f.circle;
        mz = (dx / d) * f.circle;
        pace = 0.55;
      }
      if (pace) {
        stepWalker(w, mx * Math.abs(pace) * dt, mz * Math.abs(pace) * dt);
        w.actMove = Math.min(1, Math.abs(pace) / 1.2);
        w.actSpeed = pace;
      }
      // when the hero throws a punch at him, he may get his guard up in time
      const heroSwinging = hero.fight.move && hero.fight.move.t < FIGHT_MOVES[hero.fight.move.type].hit && d < 1.8;
      if (heroSwinging && f.willBlock === undefined) f.willBlock = Math.random() < 0.35;
      if (!heroSwinging) f.willBlock = undefined;
      f.block = approach(f.block, heroSwinging && f.willBlock ? 1 : 0, 12 * dt);
      if (f.cooldown <= 0 && d < 1.4 && f.block < 0.3) {
        const roll = Math.random();
        const type = roll < 0.45 ? 'jab' : roll < 0.75 ? 'cross' : roll < 0.93 ? 'hook' : 'uppercut';
        f.move = { type, t: 0, landed: false, stepped: 0 };
      }
    }
    w.pose = fightPose(f);
    w.pose.weight = f.guard;
    // knees bent: a little lower to the ground
    g.position.y = groundAt(g.position.x, g.position.z, g.position.y + 0.3) - (w.pose.keys.crouch || 0) * 0.6;
    return true;
  }

  // A pedestrian's punch landing on the hero.
  function punchHero(type, dx, dz) {
    const damage = { jab: 6, cross: 9, hook: 10, uppercut: 13 }[type] * rand(0.85, 1.15);
    playPunch(false, damage / 14);
    hurtHero(damage, 'Beaten to death', dx, dz);
    if (hero.dead) {
      knockHeroDown(dx, dz);
      return;
    }
    hero.fight.move = null;
    hero.fight.react = { t: 0, dur: 0.42, dx, dz, kind: type, blocked: false, side: type === 'hook' ? 1 : -1 };
    hero.fight.lastAction = clock;
    bump = Math.max(bump, 0.25);
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
    if (heli.burning === undefined && (car.y > groundAt(car.x, car.z, car.y) + 0.02 || Math.abs(heli.speed) > 2)) {
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
    const freeX = car.x;
    const freeZ = car.z;
    pushHeroOut(2.2);
    // how hard it was driven into whatever pushed it back (only what pushes against the way
    // it was flying counts): hard enough, and it catches fire
    const flown = Math.hypot(car.vx, car.vz);
    const against = flown > 3 ? -((car.x - freeX) * car.vx + (car.z - freeZ) * car.vz) / flown : 0;
    const impact = dt > 0 ? Math.min(flown + 2, Math.max(0, against) / dt) : 0;
    if (impact > 7) igniteHeli(impact);
    if (impact > 2) h.speed *= Math.max(0.3, 1 - impact / 25);
    const expected = Math.abs(h.speed) * dt;
    if (expected > 1e-4 && Math.hypot(car.x - fromX, car.z - fromZ) < expected * 0.4) h.speed *= 0.5;

    clampToWorld();

    const lift = !ready ? 0 : held('Space') ? 1 : held('ShiftLeft', 'ShiftRight') ? -1 : 0;
    // on fire the engine falters: less lift, and past half way it sinks unless held up
    const burning = h.burning || 0;
    hoverStep(dt, burning > 0.5 && lift >= 0 ? lift - (burning - 0.5) * 1.6 : lift, HELI_LIFT * (1 - 0.45 * burning));

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
      // nobody at the controls: if it is in the air, it falls; a hard landing finishes it
      const floor = groundAt(h.x, h.z, h.y);
      if (h.y > floor + 0.02) {
        h.fallV = (h.fallV || 0) - GRAVITY * dt;
        h.y = Math.max(floor, h.y + h.fallV * dt);
        if (h.y <= floor && h.fallV < -9) h.burning = 1;
      } else h.fallV = 0;
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
      suv: 'suv', truck: 'truck', lorry: 'truck', pickup: 'pickup', bus: 'bus', motorbike: 'moto', motorcycle: 'moto', police: 'police' };
    const lightCommands = {
      lights: () => setLights({ head: HEAD_MODES[(HEAD_MODES.indexOf(lights.head) + 1) % HEAD_MODES.length] }),
      lightson: () => setLights({ head: 'on' }), headlights: () => setLights({ head: 'on' }),
      lightsoff: () => setLights({ head: 'off' }), lightsauto: () => setLights({ head: 'auto' }),
      lightshigh: () => setLights({ head: 'high' }), highbeam: () => setLights({ head: 'high' }), fullbeam: () => setLights({ head: 'high' }),
      left: () => toggleIndicator('left'), indicatorleft: () => toggleIndicator('left'),
      right: () => toggleIndicator('right'), indicatorright: () => toggleIndicator('right'),
      indicatoroff: () => setLights({ indicator: null }), indicatorsoff: () => setLights({ indicator: null }),
      hazard: () => toggleIndicator('hazard'), hazards: () => toggleIndicator('hazard'),
      siren: () => setLights({ emergency: !lights.emergency }), emergency: () => setLights({ emergency: !lights.emergency }),
      sirens: () => setLights({ emergency: !lights.emergency }),
      brakes: () => setLights({ brakes: !lights.brakes }), brakelights: () => setLights({ brakes: !lights.brakes }),
    };
    if (lightCommands[code]) {
      if (mode !== 'car') showToast('Get in a vehicle first', true);
      else lightCommands[code]();
      return;
    }
    if (kinds[code]) {
      // swap into a new sports car on the spot
      if (mode !== 'car' && !backOnFoot()) return; // still moving too fast to get off
      const at = { x: car.x, y: car.y, z: car.z, h: car.heading };
      if (mode === 'car') {
        scene.remove(player.group);
        if (insideView) setInsideView(false);
      }
      const police = kinds[code] === 'police';
      const model = createCar(police ? 0xf4f6f8 : colorFor(kinds[code]), police ? 'sedan' : kinds[code]);
      if (police) addPoliceLook(model);
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
    } else if (code === 'deepsnow') {
      setWeather('snow');
      env.snow = 1;
      env.snowCover = 1;
      showToast('Deep snow');
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
      const icy = 1 - 0.4 * env.snowCover; // snow on the road: less grip
      vl *= Math.exp(-(handbrake ? HANDBRAKE_GRIP : stats.grip * settings.grip * icy * Math.max(0.3, 1 - 0.3 * flats.length)) * dt);

      // Steering turns the front wheels, and the car follows the arc they make: tight at
      // walking pace, and at speed only as tight as the tyres can hold. So a corner has to
      // be slowed for, and the car goes where it is pointed instead of pivoting on the spot.
      const lock = (Math.tan(0.6) / wb) * Math.abs(vf);
      const hold = ((handbrake ? TYRE_HOLD * 1.5 : TYRE_HOLD) * settings.grip * icy) / Math.max(1, Math.abs(vf));
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
      for (const box of solidsNear(car.x + fx * offset, car.z + fz * offset, r).concat(peopleBoxes())) {
        if (!blocksPlayer(box) || box.soft) continue;
        if (box.signal !== undefined && Math.hypot(car.vx, car.vz) >= 4) continue; // it goes over (see checkSignalHits)
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
            if (box.highway) box.highway.stunned = 4; // the other driver stops, shaken
            bump = Math.max(bump, Math.min(1, -into / 14));
            playCrash(Math.min(1, -into / 18));
            if (-into > 12) hurtHero((-into - 12) * 2.2, 'Killed in a crash'); // the driver is thrown about too
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
    if (model.wrecked || !model.deform || speed < 2.5) return;
    hurtVehicle(model, speed * speed * 0.9, true); // hard knocks wear it down toward fire
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
    if (model.wrecked) return;
    model.health = vehicleHealth(model);
    model.fuse = undefined;
    hurtVehicles.delete(model);
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
        const y = car.y + (car.y < 0.05 ? 0.006 : 0.015); // on the road (or a deck), under the tyres
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
      camLook.set(car.x + fx * 14 + lx * (across + lean), car.y + eye - 0.12 - Math.tan(car.pitch) * 14, car.z + fz * 14 + lz * (across + lean));
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

  // The dial shows only when there is something to drive: its ring fills with the speed
  // (to about 220 km/h) and turns orange on nitro.
  const dash = $('dash');
  const gauge = $('gauge');
  function updateHud(vf, speed) {
    dash.hidden = mode === 'foot';
    if (dash.hidden) return;
    const kmh = Math.round(speed * 3.6);
    $('speed').textContent = kmh;
    $('gear').textContent = speed < 0.3 ? 'N' : vf < 0 ? 'R' : 'D';
    gauge.style.setProperty('--v', Math.min(1, kmh / 220).toFixed(3));
    gauge.classList.toggle('boost', !!car.boosting);
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
    updateHighwayTraffic(dt);
    updateTrains(dt);
    updateWalkers(dt);
    updateBirds(dt);
    updateAnimals(dt);
    updateLights();

    let vf = 0;
    if (hero.dead || hero.down) {
      // dead or flat on his back: nothing answers the keys; a car rolls on to a stop
      if (mode === 'car' && player && !player.wrecked) vf = updateCar(dt);
      else if (mode === 'foot') updateHeroDown(dt);
    } else if (mode === 'car') vf = updateCar(dt);
    else if (mode === 'horse') updateRiding(dt);
    else if (mode === 'heli') updateHeli(dt);
    else if (mode === 'bike') updateBiking(dt);
    else if (act) updateAct(dt);
    else updateHero(dt);
    updateDoors(dt);
    if (horse) animateHorse(dt);
    if (heli) animateHeli(dt);
    if (bike) animateBike(dt);
    updateHeroSkin(dt);
    updateVehicleLights(dt);
    updateVehicleFires(dt);
    updateHeliFire(dt);
    updateWrecks(dt);
    updateClouds(dt);
    updateVitals(dt);
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
    updateWheelInstances();
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
    if (hero.dead) return;
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
    if (mode === 'car') {
      if (e.code === 'KeyL') setLights({ head: HEAD_MODES[(HEAD_MODES.indexOf(lights.head) + 1) % HEAD_MODES.length] });
      if (e.code === 'KeyZ') toggleIndicator('left');
      if (e.code === 'KeyX') toggleIndicator('right');
      if (e.code === 'KeyH') toggleIndicator('hazard');
      if (e.code === 'KeyK') setLights({ emergency: !lights.emergency });
    }
    if (e.code === 'KeyM') toggleBigMap(!mapOpen);
    if (e.code === 'Escape' && mapOpen) toggleBigMap(false);
    if (e.code === 'KeyR' && mode === 'car' && !player.wrecked) {
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
    buildTerrain();
    buildCity();
    buildRoads();
    buildMetro();
    buildMall();
    plantCountryside();
    paintMarks();
    addStreetLamps();
    addRoadDetails();
    addRoadSigns();
    addSky();
    headBeam = new THREE.SpotLight(0xfff0d0, 0, 75, 0.55, 0.6, 1.2);
    scene.add(headBeam, headBeam.target);
    buildVegetation();
    spawnAnimals();
    addParkedCars();
    buildTrafficLights();
    spawnTraffic();
    spawnHighwayTraffic();
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
    setupSnow();
    smokeCloud = particleCloud(1200, false);
    flameCloud = particleCloud(1000, true);

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
    new Promise((ready) => loadVehicleModels(ready)),
    loadRideModels(),
    loadNpcModels(),
  ]).then(start);
})();
