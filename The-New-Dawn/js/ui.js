// The New Dawn: what is on the screen. The objective, the clock, the body's four bars, the
// minimap and the big map (drawn only where you have been), the hotbar, prompts, the kit and
// crafting, pause and settings, the hero's thoughts, zone names, and the toasts.
(() => {
  'use strict';
  const D = window.Dawn;
  const { $, clamp, smoothstep } = D;
  const T = D.terrain;
  const L = D.LAYOUT;

  const ui = { mapImage: null, fog: null, seen: null };

  // ---------- The map ----------

  // The valley drawn once from above, in its colours, shaded by its slopes. The fog of war is
  // a second canvas: black, with a soft hole cut wherever you have been.
  // (out east as far as the land beyond the mountains, Chapter 3: the valley is the left part)
  const MAP = { minX: -270, maxX: 690, minZ: -320, maxZ: 310 };
  const MAP_PX = 512; // tall
  const mapScale = MAP_PX / (MAP.maxZ - MAP.minZ);
  const MAP_W = Math.ceil((MAP.maxX - MAP.minX) * mapScale); // wide
  const toMap = (x, z) => [(x - MAP.minX) * mapScale, (z - MAP.minZ) * mapScale];

  function drawMapImage() {
    const c = document.createElement('canvas');
    c.width = MAP_W;
    c.height = MAP_PX;
    const g = c.getContext('2d');
    const img = g.createImageData(MAP_W, MAP_PX);
    for (let j = 0; j < MAP_PX; j++) {
      for (let i = 0; i < MAP_W; i++) {
        const x = MAP.minX + i / mapScale;
        const z = MAP.minZ + j / mapScale;
        const h = T.height(x, z);
        const n = T.normal(x, z);
        const water = T.waterAt(x, z);
        let r;
        let gr;
        let b;
        if (water && water.depth > 0.05) {
          const d = clamp(water.depth / 3, 0, 1);
          r = 40 - 20 * d;
          gr = 82 - 30 * d;
          b = 92 - 20 * d;
        } else {
          const [, wD, wM] = T.surface(x, z, h);
          const jungle = T.jungleAmount(x, z);
          r = 92 - 40 * jungle + 60 * wD + 20 * wM;
          gr = 112 - 25 * jungle + 30 * wD + 8 * wM;
          b = 58 - 20 * jungle + 20 * wD;
          const rock = smoothstep(0.85, 0.6, n.y) + T.mountainous(x, z) * 0.6;
          r += (128 - r) * clamp(rock, 0, 1);
          gr += (118 - gr) * clamp(rock, 0, 1);
          b += (104 - b) * clamp(rock, 0, 1);
        }
        // light from the north-west
        const shade = clamp(0.75 + (-n.x * 0.6 - n.z * 0.6) * 1.2 + h * 0.002, 0.45, 1.25);
        const k = (j * MAP_W + i) * 4;
        img.data[k] = r * shade;
        img.data[k + 1] = gr * shade;
        img.data[k + 2] = b * shade;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // the trails
    g.strokeStyle = 'rgba(214,180,128,0.55)';
    g.lineWidth = 1.5;
    for (const p of L.paths) {
      g.beginPath();
      p.forEach(([x, z], i) => {
        const [mx, my] = toMap(x, z);
        if (i) g.lineTo(mx, my);
        else g.moveTo(mx, my);
      });
      g.stroke();
    }
    ui.mapImage = c;
    ui.fog = document.createElement('canvas');
    ui.fog.width = MAP_W;
    ui.fog.height = MAP_PX;
    const fg = ui.fog.getContext('2d');
    fg.fillStyle = '#0b0d09';
    fg.fillRect(0, 0, MAP_W, MAP_PX);
    ui.revealed = [];
  }

  // Clears the fog round (x, z).
  let lastReveal = null;
  function reveal(x, z, r = 55) {
    if (lastReveal && Math.hypot(x - lastReveal[0], z - lastReveal[1]) < 6) return;
    lastReveal = [x, z];
    ui.revealed.push([Math.round(x), Math.round(z)]);
    const g = ui.fog.getContext('2d');
    const [mx, my] = toMap(x, z);
    const rad = r * mapScale;
    const grad = g.createRadialGradient(mx, my, rad * 0.4, mx, my, rad);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = grad;
    g.beginPath();
    g.arc(mx, my, rad, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  ui.reveal = reveal;
  ui.restoreRevealed = (list) => {
    if (!ui.fog) return;
    const g = ui.fog.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#0b0d09';
    g.fillRect(0, 0, MAP_W, MAP_PX);
    ui.revealed = [];
    lastReveal = null;
    for (const [x, z] of list || []) {
      lastReveal = null;
      reveal(x, z);
    }
  };

  function drawMap(canvas, centre, radius, rotate) {
    const g = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    g.save();
    g.fillStyle = '#0b0d09';
    g.fillRect(0, 0, w, h);
    const k = w / (radius * 2 * mapScale);
    g.translate(w / 2, h / 2);
    if (rotate) g.rotate(Math.PI - D.hero.yaw);
    g.scale(k, k);
    const [cx, cy] = toMap(centre.x, centre.z);
    g.translate(-cx, -cy);
    g.drawImage(ui.mapImage, 0, 0);
    g.drawImage(ui.fog, 0, 0);
    // what matters now, and what has been found
    const target = D.story && D.story.marker();
    if (target) {
      // further off than the map shows: on its rim, in its direction
      let tx = target.x;
      let tz = target.z;
      const off = Math.hypot(tx - centre.x, tz - centre.z);
      if (!rotate && off > radius * 0.86) {
        tx = centre.x + ((tx - centre.x) / off) * radius * 0.86;
        tz = centre.z + ((tz - centre.z) / off) * radius * 0.86;
      }
      const [mx, my] = toMap(tx, tz);
      g.fillStyle = '#ffb547';
      g.strokeStyle = '#1a1206';
      g.lineWidth = 1.2 / k;
      g.beginPath();
      const s = 5 / k;
      g.moveTo(mx, my - s);
      g.lineTo(mx + s, my);
      g.lineTo(mx, my + s);
      g.lineTo(mx - s, my);
      g.closePath();
      g.fill();
      g.stroke();
    }
    if (D.statues) {
      g.fillStyle = 'rgba(205,200,190,0.85)';
      for (const s of D.statues.list) {
        if (!s.found) continue;
        const [mx, my] = toMap(s.x, s.z);
        g.beginPath();
        g.arc(mx, my, 1.8 / k, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the hero
    const [hx, hy] = toMap(D.hero.pos.x, D.hero.pos.z);
    g.translate(hx, hy);
    g.rotate(Math.PI - D.hero.facing);
    g.fillStyle = '#fff';
    g.strokeStyle = '#111';
    g.lineWidth = 1 / k;
    const s = 6 / k;
    g.beginPath();
    g.moveTo(0, -s);
    g.lineTo(s * 0.7, s * 0.8);
    g.lineTo(0, s * 0.4);
    g.lineTo(-s * 0.7, s * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  function drawBigMap() {
    const canvas = $('bigmap');
    const g = canvas.getContext('2d');
    const w = canvas.width;
    g.fillStyle = '#0b0d09';
    g.fillRect(0, 0, w, w);
    const seenEast = (D.story ? D.story.zonesSeen() : []).some((z) => z >= 11);
    const k = seenEast ? w / MAP_W : w / MAP_PX;
    const oy = seenEast ? (w - MAP_PX * k) / 2 : 0;
    g.save();
    g.translate(0, oy);
    g.scale(k, k);
    g.drawImage(ui.mapImage, 0, 0);
    g.drawImage(ui.fog, 0, 0);
    g.restore();
    g.save();
    g.translate(0, oy);
    // zone names where they have been seen
    g.font = '600 13px Rajdhani, sans-serif';
    g.textAlign = 'center';
    const seen = D.story ? D.story.zonesSeen() : [];
    const LABELS = { 1: [18, 262], 2: [5, 180], 3: [-20, 96], 4: [21, 2], 5: [120, 78], 6: [-10, -95], 7: [-48, -172], 11: [290, 62], 12: [340, 20], 13: [428, 4], 14: [600, -46] };
    for (const [z, [x, zz]] of Object.entries(LABELS)) {
      if (!seen.includes(+z)) continue;
      const [mx, my] = toMap(x, zz);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(L.zones[z].name.toUpperCase(), mx * k + 1, my * k - 9);
      g.fillStyle = '#f4efe4';
      g.fillText(L.zones[z].name.toUpperCase(), mx * k, my * k - 10);
    }
    // the marker and the hero, drawn over
    const target = D.story && D.story.marker();
    if (target) {
      const [mx, my] = toMap(target.x, target.z);
      g.fillStyle = '#ffb547';
      g.beginPath();
      g.moveTo(mx * k, my * k - 7);
      g.lineTo(mx * k + 7, my * k);
      g.lineTo(mx * k, my * k + 7);
      g.lineTo(mx * k - 7, my * k);
      g.closePath();
      g.fill();
    }
    const [hx, hy] = toMap(D.hero.pos.x, D.hero.pos.z);
    g.save();
    g.translate(hx * k, hy * k);
    g.rotate(Math.PI - D.hero.facing);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();
  }

  // ---------- Toasts, thoughts, banners ----------

  ui.toast = (html, bad = false) => {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast${bad ? ' bad' : ''}`;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  };

  // The hero's thoughts, one at a time, in italics at the foot of the screen.
  const thoughts = [];
  let thinking = null;
  ui.think = (text, seconds = 4.5, now = false, who = null) => {
    if (now) {
      thoughts.length = 0;
      thinking = null;
    }
    thoughts.push({ text, seconds, who });
  };
  // A line spoken aloud, by the hero (who = 'You') or someone else: upright, with the name.
  ui.say = (who, text, seconds = 4.5, now = false) => ui.think(text, seconds, now, who);
  ui.quiet = () => {
    thoughts.length = 0;
    if (thinking) thinking.t = thinking.seconds;
  };
  function updateThoughts(dt) {
    const el = $('subtitle');
    if (!thinking && thoughts.length) {
      thinking = { ...thoughts.shift(), t: 0 };
      el.textContent = thinking.text;
      el.classList.toggle('spoken', !!thinking.who);
      if (thinking.who) {
        const who = document.createElement('b');
        who.className = 'who';
        who.textContent = thinking.who;
        el.prepend(who);
      }
      el.hidden = false;
      el.classList.add('out');
      requestAnimationFrame(() => el.classList.remove('out'));
    }
    if (thinking) {
      thinking.t += dt;
      if (thinking.t > thinking.seconds) el.classList.add('out');
      if (thinking.t > thinking.seconds + 0.5) {
        thinking = null;
        if (!thoughts.length) el.hidden = true;
      }
    }
  }

  ui.zone = (n) => {
    const el = $('zone-banner');
    $('zone-tag').textContent = L.zones[n].tag;
    $('zone-name').textContent = L.zones[n].name;
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(ui.zoneTimer);
    ui.zoneTimer = setTimeout(() => (el.hidden = true), 5600);
  };

  ui.saved = (text = 'Checkpoint saved', ms = 3100) => {
    const el = $('saved');
    el.hidden = true;
    el.innerHTML = `<i></i>${text}`;
    el.style.animationDuration = `${ms - 100}ms`;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(ui.savedTimer);
    ui.savedTimer = setTimeout(() => (el.hidden = true), ms);
  };

  ui.tutorial = (html, seconds = 6) => {
    const el = $('tutorial');
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(ui.tutTimer);
    ui.tutTimer = setTimeout(() => (el.hidden = true), seconds * 1000);
  };

  ui.found = () => {
    const n = D.statues.list.filter((s) => s.found).length;
    $('found').textContent = n;
  };

  // ---------- Objective ----------

  // The compass (Chapter 3): the cardinal points sliding past as you turn. North is -z.
  let compassKey = '';
  ui.compass = (on, yaw = 0) => {
    const el = $('compass');
    if (el.hidden === on) el.hidden = !on;
    if (!on) return;
    const bearing = ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;
    const key = Math.round(bearing);
    if (key === compassKey) return;
    compassKey = key;
    const marks = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    $('compass-strip').innerHTML = marks.map(([t, a]) => {
      const d = ((a - bearing + 540) % 360) - 180;
      if (Math.abs(d) > 70) return '';
      return `<b class="${t === 'N' ? 'n' : ''}" style="left:${130 + d * 1.75}px">${t}</b>`;
    }).join('');
  };

  // A line under the objective: what someone else is doing meanwhile, and how far along.
  let trackerKey = '';
  ui.tracker = (html = null, frac = 0) => {
    const key = `${html}|${Math.round(frac * 50)}`;
    if (key === trackerKey) return;
    trackerKey = key;
    $('tracker').hidden = !html;
    if (!html) return;
    $('tracker-text').innerHTML = html;
    $('tracker-bar').style.width = `${Math.round(clamp(frac, 0, 1) * 100)}%`;
  };

  ui.objective = (title, list = [], hint = '', flash = false) => {
    $('objective-title').textContent = title;
    $('objective-list').innerHTML = list.map((i) => `<li class="${i.done ? 'done' : ''}">${i.text}${i.count ? `<em>${i.count}</em>` : ''}</li>`).join('');
    $('objective-hint').textContent = hint;
    if (flash) {
      const el = $('objective');
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  };

  // ---------- Prompt, action, hotbar ----------

  let promptShown = '';
  ui.prompt = (target) => {
    const el = $('prompt');
    if (!target) {
      if (promptShown) {
        el.hidden = true;
        promptShown = '';
      }
      return;
    }
    const text = target.cannot ? `${target.label} — ${target.cannot}` : target.label;
    if (text !== promptShown) {
      promptShown = text;
      $('prompt-text').textContent = text;
      el.classList.toggle('cannot', !!target.cannot);
      el.hidden = false;
    }
  };

  ui.action = (label, fraction = 0) => {
    const el = $('action-bar');
    if (!label) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    $('action-name').textContent = label;
    $('action-fill').style.width = `${clamp(fraction, 0, 1) * 100}%`;
  };

  const ICONS = {
    hands: '<svg viewBox="0 0 24 24"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V12m0-5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7S5 18.5 4.5 16L3 12.5a1.5 1.5 0 0 1 2.6-1.4L8 14"/></svg>',
    blade: '<svg viewBox="0 0 24 24"><path d="M14 3 21 10l-9 9-4-1-1-4Z M7 14l-4 7 7-4"/></svg>',
    bow: '<svg viewBox="0 0 24 24"><path d="M5 3c9 2 14 7 16 16M5 3l16 16M4 20l8-8M12 12l3-1-1 3"/></svg>',
    torch: '<svg viewBox="0 0 24 24"><path d="M9 22l4-10M13 12c-3-1.5-3.5-5-.5-9 .6 2.6 3.6 3.6 3 6.8-.3 1.5-1.3 2.2-2.5 2.2z"/></svg>',
    spear: '<svg viewBox="0 0 24 24"><path d="M4 20 17 7M17 7l1-4 3 3-4 1M14 6l4 4"/></svg>',
  };
  ui.hotbar = () => {
    const h = D.hero;
    const it = D.items;
    const slots = [
      ['hands', 'Hands', true, ''],
      ['blade', 'Blade', it.has('blade'), ''],
      ['bow', 'Bow', it.has('bow'), it.has('bow') ? `${it.count('arrow')}` : ''],
    ];
    // Chapter 2: the torch (lit or not, and how many)
    const torch = it.has('torch') || (D.camp && D.camp.torchLit());
    if (torch || D.story.chapterNo() >= 2) slots.push(['torch', 'Torch', torch, D.camp ? D.camp.torchBadge() : '']);
    // Chapter 3: the spear
    if (it.has('spear')) slots.push(['spear', 'Spear', true, '']);
    $('hotbar').innerHTML = slots.map(([key, name, owned, extra], i) =>
      `<div class="slot ${h.weapon === key ? 'on' : ''} ${owned ? '' : 'locked'}" title="${name}"><small>${i + 1}</small>${ICONS[key]}${extra ? `<em>${extra}</em>` : ''}</div>`).join('');
  };

  // ---------- The kit ----------

  function renderKit() {
    const it = D.items;
    const keys = Object.keys(it.ITEMS).filter((k) => it.count(k) > 0);
    $('kit-items').innerHTML = keys.length ? keys.map((k) => {
      const def = it.ITEMS[k];
      const food = def.food !== undefined || def.heal !== undefined;
      return `<button class="item ${food ? 'food' : ''}" data-food="${food ? k : ''}" title="${def.desc || ''}${def.where ? ` ${def.where}` : ''}" ${food ? '' : 'tabindex="-1"'}><i style="background:${def.color}"></i>${it.count(k) > 1 ? def.plural : def.name}<b>${def.tool ? '' : it.count(k)}</b></button>`;
    }).join('') : '<p class="kit-note">Nothing yet. Look on the ground: sticks, stones, fallen fruit.</p>';
    // the tabs: Make always; the shelter's parts once the shelter is a goal (Chapter 1); the
    // fire's work once Chapter 2 begins. Each opens on what the story needs now.
    const chap = D.story.chap();
    const no = D.story.chapterNo();
    const ch2 = no >= 2;
    const shelterKnown = !ch2 && !!(D.book && D.book.reached && D.book.reached('plan') && D.shelter);
    // Chapter 3: the lab, once it is planned
    const labKnown = no === 3 && !!(D.lab && D.lab.planned());
    const tabs = [['make', 'Make']];
    if (shelterKnown) tabs.push(['build', 'Build the shelter']);
    if (labKnown) tabs.push(['build', D.lab.stage >= D.lab.STAGES.length ? 'The lab' : 'Build the lab']);
    if (ch2 && D.camp) tabs.push(['fire', 'At the fire']);
    const ids = tabs.map((t) => t[0]);
    if (!ids.includes(ui.kitTab) || ui.kitTabStage !== D.story.stage) {
      const want = chap && chap.kitTab ? chap.kitTab() : ['shelter', 'dusk'].includes(D.story.stage) ? 'build' : 'make';
      ui.kitTab = ids.includes(want) ? want : 'make';
    }
    ui.kitTabStage = D.story.stage;
    $('kit-tabs').innerHTML = tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === ui.kitTab ? 'on' : ''}">${label}</button>`).join('');
    $('kit-tabs').hidden = tabs.length < 2;
    $('kit-make-title').hidden = tabs.length >= 2;
    $('kit-recipes').hidden = ui.kitTab !== 'make';
    $('kit-build').hidden = ui.kitTab !== 'build';
    $('kit-fire').hidden = ui.kitTab !== 'fire';
    $('kit-where').hidden = true;
    if (shelterKnown) renderBuild(D.shelter);
    if (labKnown) renderBuild(D.lab);
    if (ch2 && D.camp) {
      $('kit-fire').innerHTML = D.camp.kitTab();
      if (ui.kitTab === 'fire') {
        const where = D.camp.kitWhere();
        $('kit-where').innerHTML = where;
        $('kit-where').hidden = !where;
      }
    }
    $('kit-recipes').innerHTML = it.RECIPES.filter((r) => (!r.chapter || r.chapter <= no) && (!r.show || r.show())).map((r) => {
      const can = it.canMake(r);
      const needs = Object.entries(r.needs).map(([k, n]) => `<span class="${it.has(k, n) ? '' : 'short'}">${n} ${n > 1 ? it.ITEMS[k].plural.toLowerCase() : it.ITEMS[k].name.toLowerCase()} (${it.count(k)})</span>`);
      if (r.tool) needs.push(`<span class="${it.has(r.tool) ? '' : 'short'}">uses a ${it.ITEMS[r.tool].name.toLowerCase()}</span>`);
      return `<div class="recipe ${can.why === 'Made' ? 'made' : ''}"><h4>${r.name} <button class="how" data-read="${r.page || r.id}">How?</button></h4><p>${r.desc}</p><div class="needs">${needs.join('')}</div><button data-make="${r.id}" ${can.ok ? '' : 'disabled'}>${can.why === 'Made' ? 'Made' : 'Make'}</button></div>`;
    }).join('');
  }
  // The shelter: each part, what it takes (and what you have for it, after the parts before it
  // have had theirs), how far along it is; then where each thing is found.
  // (the shelter in Chapter 1, the lab in Chapter 3: a building says how it is built, with
  // kitInfo(), or it is the shelter)
  function renderBuild(sh = D.shelter) {
    const it = D.items;
    const info = sh.kitInfo ? sh.kitInfo() : null;
    const name = (k, n) => (n > 1 ? it.ITEMS[k].plural : it.ITEMS[k].name).toLowerCase();
    const left = {};
    const still = {};
    const parts = sh.STAGES.map((s, i) => {
      const built = sh.stage > i;
      let enough = true;
      const needs = Object.entries(s.needs).map(([k, n]) => {
        if (built) return `<span>${n} ${name(k, n)}</span>`;
        if (left[k] === undefined) left[k] = it.count(k);
        const avail = Math.max(0, left[k]);
        left[k] -= n;
        still[k] = (still[k] || 0) + n;
        if (avail < n) enough = false;
        return `<span class="${avail >= n ? '' : 'short'}">${n} ${name(k, n)} (${Math.min(avail, 99)})</span>`;
      });
      const next = sh.stage === i;
      const state = built ? ['built', 'Built'] : next ? (enough ? ['ready', 'Ready'] : ['', 'Gather']) : ['', i === sh.stage + 1 ? 'Then this' : 'Last'];
      return `<div class="recipe part ${built ? 'made' : ''}"><h4>${i + 1}. ${s.title} <button class="how" data-read="${info ? info.page : 'shelter'}">How?</button></h4><p>${s.desc}</p><div class="needs">${needs.join('')}</div><span class="state ${state[0]}">${state[1]}</span></div>`;
    });
    const atTree = D.story.flags.sawTree;
    const done = sh.stage >= sh.STAGES.length;
    const how = info ? info.how : done
      ? '<b>The shelter is finished.</b> Climb the ladder (E at its foot) and rest there when night comes.'
      : `<b>Built at the tree, not in your hands.</b> ${atTree ? 'Go back to the Elder Tree' : 'Find the Elder Tree, the giant at the end of the jungle trail north of the gorge'} (the marker on your map, <kbd>M</kbd>), stand under it and press <kbd>E</kbd>. The parts go up in order, each with what it lists: you need not gather everything first.`;
    const where = done ? '' : (info ? info.keys : ['branch', 'vine', 'big_leaf', 'leaves']).filter((k) => still[k]).map((k) => {
      const def = it.ITEMS[k];
      const have = it.count(k);
      // what you have enough of in one line; where to look, for what you are still short of
      const enough = have >= still[k];
      return `<div class="where" title="${def.where}"><i style="background:${def.color}"></i><b>${def.plural}</b><em class="${enough ? '' : 'short'}">${Math.min(have, still[k])} / ${still[k]}${enough ? ' \u2713' : ''}</em>${enough ? '' : `<span>${def.where}</span>`}</div>`;
    }).join('');
    $('kit-build').innerHTML = `${parts.join('')}<p class="build-how">${how}</p>`;
    // (beside it, under what you carry, where there is room)
    $('kit-where').innerHTML = where ? `<h5>Where to find them <button class="how" data-read="${info ? info.wherePage || info.page : 'jungle'}">How?</button></h5>${where}` : '';
    $('kit-where').hidden = !where || ui.kitTab !== 'build';
  }

  $('kit').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      ui.kitTab = tab.dataset.tab;
      renderKit();
      return;
    }
    const read = e.target.closest('[data-read]');
    if (read && D.book) {
      D.book.openAt(read.dataset.read);
      return;
    }
    const make = e.target.closest('[data-make]');
    const food = e.target.closest('[data-food]');
    const fire = e.target.closest('[data-fire]');
    if (fire && D.camp) {
      if (D.camp.startRecipe(fire.dataset.fire)) ui.closePanel();
      else renderKit();
      return;
    }
    if (make) {
      ui.closePanel();
      D.items.make(make.dataset.make);
    } else if (food && food.dataset.food) {
      ui.closePanel();
      D.items.eat(food.dataset.food);
    } else if (e.target.id === 'kit') ui.closePanel();
  });

  // ---------- Panels ----------

  ui.openPanel = (id) => {
    if (D.state.mode !== 'play') return;
    D.state.panel = id;
    for (const p of ['kit', 'map-screen', 'pause', 'book']) $(p).hidden = p !== id;
    if (id === 'kit') renderKit();
    if (id === 'map-screen') drawBigMap();
    if (id === 'pause') syncSettings();
    D.input.clearLook();
    D.unlockPointer();
  };
  ui.closePanel = () => {
    D.state.panel = null;
    D.input.clearLook();
    for (const p of ['kit', 'map-screen', 'pause', 'credits', 'book']) $(p).hidden = true;
    if (D.state.mode === 'play') D.lockPointer();
  };
  let pauseOpenedAt = -1e9;
  ui.openPause = () => {
    if (D.state.mode === 'play' && !D.state.panel) {
      ui.openPanel('pause');
      pauseOpenedAt = performance.now();
    }
  };

  // Escape, the moment it is pressed. With a panel open it closes it, except a pause this same
  // press has just opened (the browser letting go of the mouse and the key itself can come in
  // either order); playing with the mouse already free, it pauses; playing with the mouse held,
  // the browser lets go of it, and that pauses (main.js).
  ui.escClosedAt = -1e9;
  ui.escape = () => {
    const now = performance.now();
    const mode = D.state.mode;
    if (!$('credits').hidden) {
      $('credits').hidden = true;
      return;
    }
    if (mode === 'title') {
      if (!$('pause').hidden) ui.hideSettings();
      return;
    }
    if (mode !== 'play') return;
    if (D.state.panel) {
      if (D.state.panel === 'pause' && now - pauseOpenedAt < 400) return;
      ui.escClosedAt = now;
      ui.closePanel();
    } else if (!D.input.locked) {
      ui.openPause();
    }
  };

  // The settings, from the title screen: the pause panel without its game buttons.
  ui.showSettings = () => {
    $('pause-title').textContent = 'Settings';
    $('pause-menu').hidden = true;
    $('pause').hidden = false;
    syncSettings();
  };
  ui.hideSettings = () => {
    $('pause').hidden = true;
    $('pause-menu').hidden = false;
    $('pause-title').textContent = 'Paused';
  };
  $('pause').addEventListener('click', (e) => {
    if (e.target.id === 'pause' && D.state.mode === 'title') ui.hideSettings();
  });

  function syncSettings() {
    document.querySelectorAll('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      const v = D.settings[key];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
      const out = el.parentElement.querySelector('output');
      if (!out) return;
      if (key === 'adaptive') out.textContent = v ? `${D.pixelRatio.toFixed(2)}×` : 'off';
      else out.textContent = key === 'fov' ? `${v}°` : key === 'sensitivity' ? `${(+v).toFixed(2)}×` : `${Math.round(v * 100)}%`;
    });
  }
  document.querySelectorAll('[data-setting]').forEach((el) => {
    el.addEventListener('input', () => {
      const key = el.dataset.setting;
      if (key === 'quality') {
        D.setQuality(el.value);
        return;
      }
      D.settings[key] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
      if (key === 'fov') {
        D.camera.fov = D.settings.fov;
        D.camera.updateProjectionMatrix();
      }
      if (key === 'volume' || key === 'music') D.audio && D.audio.setVolume();
      if (key === 'adaptive' || key === 'fps') D.adaptResolution(0, performance.now() / 1000);
      D.saveSettings();
      syncSettings();
    });
  });
  $('btn-resume').addEventListener('click', () => ui.closePanel());
  $('btn-checkpoint').addEventListener('click', () => {
    ui.closePanel();
    D.story.loadCheckpoint();
  });
  $('btn-title').addEventListener('click', () => {
    ui.closePanel();
    D.story.toTitle();
  });

  // ---------- Each frame ----------

  let lastClock = '';
  let minimapDue = 0;
  ui.update = (dt) => {
    const input = D.input;
    const mode = D.state.mode;
    if (D.book) D.book.update(dt);
    // keys for the panels
    if (mode === 'play') {
      if (input.pressed.has('Tab') || input.pressed.has('KeyI')) {
        if (D.state.panel === 'kit') ui.closePanel();
        else if (!D.state.panel) ui.openPanel('kit');
      }
      if (input.pressed.has('KeyM')) {
        if (D.state.panel === 'map-screen') ui.closePanel();
        else if (!D.state.panel) ui.openPanel('map-screen');
      }
    }
    // the mouse is free while playing: say how to take it back
    $('resume-hint').hidden = !(mode === 'play' && !input.locked && !D.state.panel && !D.hero.dead);
    updateThoughts(dt);
    updateWaypoint();
    if (mode !== 'play' && mode !== 'dead') return;
    const h = D.hero;
    const s = h.stats;
    const bar = (id, v) => {
      const el = $(id);
      el.style.width = `${clamp(v, 0, 100)}%`;
      el.parentElement.parentElement.classList.toggle('low', v < 20);
    };
    bar('health-bar', s.health);
    bar('stamina-bar', s.stamina);
    bar('hunger-bar', s.hunger);
    bar('thirst-bar', s.thirst);
    // the clock
    const hr = D.env.hour;
    const text = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')}`;
    if (text !== lastClock) {
      lastClock = text;
      $('clock').textContent = text;
      $('sun-icon').classList.toggle('moon', D.env.night > 0.5);
    }
    // the crosshair, while the bow is up
    const ch = $('crosshair');
    const aiming = h.weapon === 'bow' && (h.aiming || h.draw > 0) && !h.dead;
    ch.hidden = !aiming;
    if (aiming) {
      $('draw-ring').style.transform = `scale(${1.6 - 0.9 * h.draw})`;
      $('draw-ring').style.opacity = 0.35 + 0.65 * h.draw;
      ch.classList.toggle('full', h.draw >= 0.99);
    }
    // the red of being hurt, the dark of being nearly gone
    $('hurt').style.opacity = Math.max(h.hurtT * 0.8, smoothstep(30, 5, s.health) * (0.35 + 0.15 * Math.sin(D.state.time * 4)));
    // the minimap, a few times a second
    reveal(h.pos.x, h.pos.z);
    minimapDue -= dt;
    if (minimapDue <= 0 && ui.mapImage) {
      minimapDue = 0.12;
      drawMap($('minimap'), h.pos, 70, false);
    }
    if (D.state.panel === 'map-screen') drawBigMap();
  };

  // ---------- The way to the next goal ----------

  // A mark over the place the story wants you next (or the nearest place to find what you are
  // short of), with its name and how far; off screen or behind, it waits at the edge, pointing.
  const wpV = new THREE.Vector3();
  function updateWaypoint() {
    const el = $('waypoint');
    const mode = D.state.mode;
    const target = D.settings.waypoint !== false && mode === 'play' && !D.state.panel && !D.hero.dead && D.story && D.story.marker();
    const h = D.hero;
    const dist = target ? Math.hypot(target.x - h.pos.x, target.z - h.pos.z) : 0;
    if (!target || !target.label || dist < (target.r || 3)) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    const cam = D.camera;
    wpV.set(target.x, target.y !== undefined ? target.y : D.terrain.height(target.x, target.z) + 1.6, target.z);
    wpV.applyMatrix4(cam.matrixWorldInverse);
    const W = window.innerWidth;
    const H = window.innerHeight;
    let px;
    let py;
    let edge = false;
    if (wpV.z < -0.2) {
      const vx = wpV.x;
      const vy = wpV.y;
      wpV.applyMatrix4(cam.projectionMatrix);
      px = (wpV.x * 0.5 + 0.5) * W;
      py = (-wpV.y * 0.5 + 0.5) * H;
      edge = px < 70 || px > W - 70 || py < 100 || py > H - 240;
      if (edge && !(vx === 0 && vy === 0)) {
        px -= W / 2;
        py -= H / 2;
      }
    } else {
      // behind: toward the side to turn to
      px = wpV.x;
      py = -Math.max(wpV.y, 0);
      edge = true;
    }
    if (edge) {
      // to the edge of a frame kept clear of the HUD (the map and the body are bottom left)
      const len = Math.hypot(px, py) || 1;
      const dx = px / len;
      const dy = py / len;
      const cx = W / 2;
      const cy = H / 2;
      const ks = [];
      if (dx > 1e-4) ks.push((W - 70 - cx) / dx);
      if (dx < -1e-4) ks.push((70 - cx) / dx);
      if (dy > 1e-4) ks.push((H - 240 - cy) / dy);
      if (dy < -1e-4) ks.push((100 - cy) / dy);
      const k = Math.max(0, Math.min(...ks));
      px = cx + dx * k;
      py = cy + dy * k;
      el.style.setProperty('--turn', `${Math.atan2(dy, dx)}rad`);
    }
    el.classList.toggle('edge', edge);
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    const text = `${Math.round(dist)} m`;
    if ($('wp-label').textContent !== target.label) $('wp-label').textContent = target.label;
    if ($('wp-dist').textContent !== text) $('wp-dist').textContent = text;
    if (el.hidden) el.hidden = false;
  }

  ui.hitMarker = (head) => {
    const ch = $('crosshair');
    ch.classList.add('hit');
    setTimeout(() => ch.classList.remove('hit'), 220);
    if (head) ui.toast('<b>Headshot</b>');
  };

  ui.init = () => {
    drawMapImage();
    ui.hotbar();
    $('found').nextElementSibling.textContent = `/${D.statues ? D.statues.total : 0}`;
  };

  D.ui = ui;
})();
