// The New Dawn: Chapter 1, The Long Night.
//
// The title, the prologue, the awakening in the cave; then the day, one goal at a time: get
// out of the cave, find out what happened, eat and drink, plan a shelter, meet the tiger in
// the gorge, make a bow, kill it, gather in the jungle, build in the Elder Tree, and live
// through the night. The sun moves with the story: each part of the day has an hour it
// cannot pass until its goal is done. Every goal reached is a checkpoint.
(() => {
  'use strict';
  const D = window.Dawn;
  const { $, clamp, lerp, smooth, smoothstep, ease, rand } = D;
  const T = D.terrain;
  const L = D.LAYOUT;
  const C = D.CAVE;

  const SAVE_KEY = 'new-dawn-save-v1';

  // What the shelter needs, all told (see shelter.js for each stage).
  const NEEDS = { branch: 13, vine: 8, big_leaf: 10, leaves: 6 };

  // the hours each part of the day runs between: [at least, at most]
  const HOURS = {
    exit: [7.3, 8.6], explore: [7.4, 9.4], sustain: [8.2, 11.4], plan: [11, 13.2], weapon: [12.4, 15.0],
    hunt: [13.2, 15.8], shelter: [14.8, 17.65], dusk: [17.9, 18.9], night: [19, 30], dawn: [5.5, 6.5],
  };

  const story = {
    stage: 'title', flags: {}, zones: new Set(), checkpoint: null, timers: {}, cine: null,
    stats: { deaths: 0 },
  };

  // ---------- The objectives ----------

  const have = (k) => D.items.count(k);
  const tick = (cond) => !!cond;
  const OBJECTIVES = {
    exit: () => ({
      title: 'Get out of the cave', list: [],
      hint: 'Walk toward the light.', marker: { x: C.statue.x, z: C.mouthZ - 8, label: 'Daylight: the way out', r: 4 },
    }),
    explore: () => {
      const n = D.statues ? D.statues.list.filter((s) => s.found).length : 0;
      return {
        title: 'Find out what happened',
        list: [{ text: 'Examine the figures among the trees', count: `${Math.min(3, n)}/3`, done: n >= 3 }],
        hint: 'Walk up to one and press E.', marker: nearestStatue() || { x: 8, z: 196, label: 'The stone figures', r: 6 },
      };
    },
    sustain: () => {
      const s = D.hero.stats;
      return {
        title: 'Eat and drink',
        list: [
          { text: 'Eat until you are fed', count: `${Math.round(s.hunger)}%`, done: s.hunger >= 60 },
          { text: 'Drink fresh water', count: `${Math.round(s.thirst)}%`, done: s.thirst >= 60 },
          { text: 'Gather sticks', count: `${Math.min(3, have('stick'))}/3`, done: story.flags.sticks || have('stick') >= 3 },
          { text: 'Gather stones', count: `${Math.min(3, have('stone'))}/3`, done: story.flags.stones || have('stone') >= 3 },
        ],
        hint: 'Mangoes lie under the fruit trees in the clearing; shake a tree for more. The pond has clean water. Q eats.',
        marker: sustainMarker(),
      };
    },
    plan: () => ({
      title: 'Prepare a shelter before nightfall',
      list: materialList(),
      hint: 'Nothing here is big enough to build in. The jungle north of the cliffs has what you need, through the gorge.',
      marker: { x: L.gorgeX, z: 26, label: 'The gorge: the way north', r: 8 },
    }),
    weapon: () => ({
      title: 'Make a bow and arrows',
      list: [
        { text: 'Flint blade (2 flint)', done: tick(have('blade')) },
        { text: 'Bow stave: cut a sapling', done: tick(have('stave') || have('bow')) },
        { text: 'Cord (3 plant fibres)', done: tick(have('cord') || have('bow')) },
        { text: 'Bow', done: tick(have('bow')) },
        { text: 'Arrows', count: `${Math.min(4, have('arrow'))}/4`, done: have('arrow') >= 4 },
      ],
      hint: 'Flint Rise, the rocky ground to the east, has flint, young saplings and tough fibrous grass. Tab opens your kit.',
      marker: weaponMarker(),
    }),
    hunt: () => ({
      title: 'Kill the tiger in the gorge',
      list: [{ text: 'Arrows', count: `${have('arrow')}`, done: false }],
      hint: have('arrow') ? 'Hold right mouse to aim, left to draw; let go to loose. A full draw flies truest. Aim for the head.' : 'Out of arrows: pick yours back up, or make more (2 sticks and 1 flint for two).',
      marker: { x: L.den.x, z: L.den.z + 8, label: 'The tiger\'s den', r: 14 },
    }),
    shelter: () => {
      const st = D.shelter ? D.shelter.stage : 0;
      const atTree = story.flags.sawTree;
      return {
        title: atTree ? 'Build a shelter in the Elder Tree' : 'Gather in the jungle, then find a great tree',
        list: [
          ...materialList(st),
          { text: 'Frame', done: st >= 1 }, { text: 'Floor and ladder', done: st >= 2 }, { text: 'Roof', done: st >= 3 },
        ],
        hint: atTree ? 'Stand under the tree and press E to build each part, in order: the frame first needs only 6 branches and 3 vines. Tab, then Build the shelter, shows what each part takes.' : 'Vines hang from the big trees. Banana and elephant-ear plants have big leaves. Branches lie along the trail. Tab, then Build the shelter, shows what each part takes.',
        marker: shelterMarker(st, atTree),
      };
    },
    dusk: () => ({
      title: 'Climb into the shelter and rest',
      list: [], hint: 'Use the ladder (E), then lie down.', marker: D.shelter.ladder ? { x: D.shelter.ladder.bottom.x, z: D.shelter.ladder.bottom.z, label: 'The ladder (E)', r: 1.5 } : null,
    }),
  };
  // Where to go next in Chapter 1 (for the waypoint and the map): the nearest place to get what
  // is still short.
  function nearestStatue() {
    const h = D.hero.pos;
    let best = null;
    let bd = Infinity;
    for (const s of D.statues.list) {
      if (s.found) continue;
      const d = Math.hypot(s.x - h.x, s.z - h.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best ? { x: best.x, z: best.z, label: 'A stone figure (E: examine)', r: 2.4 } : null;
  }
  function sustainMarker() {
    const s = D.hero.stats;
    if (s.hunger < 60) return D.guide.source('mango') || { x: -38, z: 88, label: 'Fruit trees', r: 6 };
    if (s.thirst < 60) return D.guide.water(D.hero.pos, 'Water: the pond');
    if (!story.flags.sticks && have('stick') < 3) return D.guide.source('stick');
    if (!story.flags.stones && have('stone') < 3) return D.guide.source('stone');
    return { x: -38, z: 88, label: 'The clearing', r: 8 };
  }
  function weaponMarker() {
    const g = D.guide;
    if (!have('blade') && have('flint') < 2) return g.forNeeds({ flint: 2 });
    if (!have('bow')) {
      if (!have('stave')) return have('blade') ? g.source('stave') : g.forNeeds({ flint: 2 });
      if (!have('cord') && have('fiber') < 3) return g.forNeeds({ fiber: 3 });
    }
    if (have('arrow') < 4) {
      const short = g.forNeeds({ stick: 2, flint: 1 });
      if (short) return short;
    }
    return { x: 118, z: 78, label: 'Flint Rise (Tab: make what you can)', r: 10 };
  }
  function shelterMarker(st, atTree) {
    const list = materialList(st);
    const short = list.find((e) => !e.done);
    if (short) {
      const key = Object.keys(NEEDS).find((k) => D.items.ITEMS[k].plural === short.text);
      const m = key && D.guide.source(key);
      if (m) return m;
    }
    return { x: L.tree.x + 3, z: L.tree.z + 4, label: atTree ? 'The Elder Tree: build (E)' : 'The Elder Tree', r: 4 };
  }

  // the materials still to gather, net of what is already built into the shelter
  function materialList(built = 0) {
    const used = { branch: 0, vine: 0, big_leaf: 0, leaves: 0 };
    D.shelter.STAGES.slice(0, built).forEach((s) => Object.entries(s.needs).forEach(([k, n]) => (used[k] += n)));
    return Object.entries(NEEDS).map(([k, n]) => {
      const need = n - used[k];
      const got = Math.min(need, have(k));
      return { text: D.items.ITEMS[k].plural, count: `${got}/${need}`, done: got >= need };
    }).filter((e, i) => built < 3 || i < 0);
  }

  let objectiveKey = '';
  // The later chapters (chapter2.js, chapter3.js): each has its own stages and says what to do in
  // them; the one whose stage it is runs things.
  const chapters = () => [D.ch2, D.ch3].filter(Boolean);
  const chapterOf = (s) => chapters().find((c) => c.STAGES.includes(s)) || null;
  story.chap = () => chapterOf(story.stage);
  story.chapterNo = () => (D.ch3 && D.ch3.started() ? 3 : D.ch2 && D.ch2.started() ? 2 : 1);
  const CHAPTER_NAMES = { 1: 'The Long Night', 2: 'The Second Waking', 3: 'Two Roads' };
  const objectiveFor = (s) => OBJECTIVES[s] || (chapterOf(s) ? () => chapterOf(s).objective(s) : null);
  function refreshObjective(flash = false) {
    const make = objectiveFor(story.stage);
    if (!make) return;
    const o = make();
    if (!o) return;
    const no = story.chapterNo();
    const chap = `Chapter ${no} &middot; <span>${CHAPTER_NAMES[no]}</span>`;
    const el = document.querySelector('#objective .chapter');
    if (el && el.innerHTML !== chap) el.innerHTML = chap;
    const key = JSON.stringify(o);
    if (key === objectiveKey && !flash) return;
    objectiveKey = key;
    D.ui.objective(o.title, o.list, o.hint, flash);
  }

  let markerCache = null;
  let markerAt = -1e9;
  let markerStage = '';
  story.marker = () => {
    const now = performance.now();
    if (now - markerAt > 250 || markerStage !== story.stage) {
      markerAt = now;
      markerStage = story.stage;
      const make = objectiveFor(story.stage);
      const o = make && make();
      markerCache = o ? o.marker || null : null;
    }
    return markerCache;
  };
  story.zonesSeen = () => [...story.zones];
  story.canBuild = () => ['shelter', 'plan', 'dusk'].includes(story.stage);
  // for Chapter 2 (chapter2.js)
  story.setStage = (s, opts) => setStage(s, opts);
  story.raiseHour = (h) => raiseHour(h);
  story.refresh = (flash) => refreshObjective(flash);
  story.startPlay = (fromCinematic) => startPlay(fromCinematic);
  story.fadeTo = (to, dur, done) => fadeTo(to, dur, done);
  story.saveNow = () => saveNow();
  // A scene: shots of { dur, caption, enter, update(t), cam(t) -> { pos, look, fov } }.
  story.playCine = (shots, onEnd) => {
    D.state.mode = 'cinematic';
    D.hero.control = false;
    D.hero.cancelAction();
    $('hud').classList.add('faded');
    $('letterbox').hidden = false;
    D.ui.prompt(null);
    story.cine = {
      shots, i: -1, t: 0, state: {}, skippable: true,
      onEnd: () => {
        $('letterbox').hidden = true;
        $('caption').hidden = true;
        onEnd();
      },
    };
    nextShot();
  };
  story.nightReady = () => story.stage === 'dusk';
  story.firstMauling = () => !story.flags.mauled;

  // ---------- Moving through the day ----------

  function setStage(stage, { save = true, flash = true } = {}) {
    story.stage = stage;
    objectiveKey = '';
    refreshObjective(flash);
    if (flash && D.audio) D.audio.chime();
    if (save) saveCheckpoint();
  }

  // ---------- Checkpoints ----------

  function snapshot() {
    const h = D.hero;
    return {
      v: 1, stage: story.stage, hour: D.env.hour,
      hero: { x: h.pos.x, z: h.pos.z, y: h.pos.y, facing: h.facing, stats: { ...h.stats }, platform: !!h.platform },
      items: D.items.save(), shelter: D.shelter.save(), flora: [...D.flora.taken],
      arrows: D.combat.saveArrows ? D.combat.saveArrows() : null, safe: story.safe || null,
      tigerDead: !!(D.combat.tiger && D.combat.tiger.dead),
      zones: [...story.zones], revealed: D.ui.revealed || [], flags: { ...story.flags },
      playTime: D.state.playTime, statsAll: { ...story.stats }, savedAt: Date.now(),
      ch2: D.ch2 && D.ch2.started() ? D.ch2.save() : null,
      ch3: D.ch3 && D.ch3.started() ? D.ch3.save() : null,
    };
  }
  function write() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(story.checkpoint));
    } catch (error) {
      // kept for this session only
    }
  }
  // A goal reached: the place it was reached becomes the safe spot to come back to after a death.
  function saveCheckpoint() {
    if (D.hero.dead) return;
    const h = D.hero;
    story.safe = { x: h.pos.x, z: h.pos.z, y: h.pos.y, facing: h.facing, platform: !!h.platform };
    story.checkpoint = snapshot();
    write();
    D.ui.saved();
    savedNoteAt = performance.now();
  }
  story.save = saveCheckpoint;

  // Progress in between: whatever is picked up, made, eaten or built is saved a moment later
  // (once the action has finished changing things), the rest every so often, and everything
  // when the page is left or reloaded. Death still brings you back to the safe spot.
  let saveAt = -1; // (real time: a panel stops the game's clock, not the saving)
  let saveNote = false;
  let savedNoteAt = -1e9;
  let sinceSave = 0;
  const SAVE_ON = { gained: 0.3, harvested: 0.3, made: 0.3, built: 0.3, ate: 0.3, drank: 0.6, examined: 0.6, shot: 7 };
  function autosave(note = false) {
    if (D.state.mode !== 'play' || D.hero.dead || !story.checkpoint || story.stage === 'title') return;
    story.checkpoint = snapshot();
    write();
    sinceSave = 0;
    // a quiet note, now and then: not one for every stick
    if (note && performance.now() - savedNoteAt > 8000) {
      savedNoteAt = performance.now();
      D.ui.saved('Progress saved', 1600);
    }
  }
  story.autosave = autosave;
  function updateAutosave(dt) {
    if (saveAt >= 0 && performance.now() >= saveAt) {
      saveAt = -1;
      autosave(saveNote);
      saveNote = false;
    }
    sinceSave += dt;
    if (sinceSave > 20) autosave(false);
  }
  const saveNow = () => {
    saveAt = -1;
    autosave(false);
  };
  window.addEventListener('pagehide', saveNow);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  // atSafe: after a death, back at the safe spot (and not starving); a game loaded from the title
  // goes back to the very spot, unless that is right by the tiger's den.
  function restore(s, { atSafe = false } = {}) {
    const h = D.hero;
    const den = L.den;
    const byTiger = !s.tigerDead && ['weapon', 'hunt'].includes(s.stage) && Math.hypot(s.hero.x - den.x, s.hero.z - den.z) < 55;
    const spot = (atSafe || byTiger) && s.safe ? s.safe : s.hero;
    story.safe = s.safe || { x: s.hero.x, z: s.hero.z, y: s.hero.y, facing: s.hero.facing, platform: s.hero.platform };
    story.flags = { ...(s.flags || {}) };
    story.zones = new Set(s.zones || []);
    story.stats = { deaths: 0, ...(s.statsAll || {}) };
    D.state.playTime = s.playTime || 0;
    D.items.load(s.items || {});
    D.shelter.load(s.shelter);
    D.flora.restoreTaken(s.flora || []);
    D.combat.resetTiger(!s.tigerDead);
    if (D.combat.loadArrows) D.combat.loadArrows(s.arrows);
    D.combat.tigerAwake = ['weapon', 'hunt'].includes(s.stage);
    D.ui.restoreRevealed(s.revealed);
    D.ui.found();
    h.revive();
    Object.assign(h.stats, s.hero.stats);
    h.stats.health = Math.max(h.stats.health, 70);
    if (atSafe) {
      h.stats.hunger = Math.max(h.stats.hunger, 35);
      h.stats.thirst = Math.max(h.stats.thirst, 35);
    }
    h.petrify = 0;
    h.crack = 0;
    h.frozen = false;
    h.cinematicPose = null;
    h.group.visible = true;
    h.teleport(spot.x, spot.z, spot.facing, spot.platform ? spot.y : null);
    if (spot.platform && D.shelter.P) h.platform = D.shelter.P;
    D.env.hour = s.hour;
    D.env.overcast = 0;
    D.env.rain = 0;
    D.forceSkyCapture();
    if (D.cave) {
      D.cave.drip.on = false;
      D.cave.flyers.forEach((b) => { if (!b.circling) b.gone = true; });
    }
    story.stage = s.stage;
    if (D.ch2) D.ch2.load(s.ch2 || null);
    if (D.ch3) D.ch3.load(s.ch3 || null);
    objectiveKey = '';
    refreshObjective(true);
    if (D.book) D.book.reset(); // its pages come back with the checkpoint, unannounced
  }

  story.loadCheckpoint = () => {
    const s = story.checkpoint;
    if (!s) {
      $('death').hidden = true;
      story.toTitle();
      return;
    }
    $('death').hidden = true;
    fadeTo(1, 0.5, () => {
      restore(s, { atSafe: true });
      startPlay(false);
      fadeTo(0, 1);
    });
  };

  // ---------- Dying ----------

  story.onDeath = (cause) => {
    story.stats.deaths++;
    D.state.mode = 'dead';
    D.hero.control = false;
    D.unlockPointer();
    setTimeout(() => {
      const armed = D.items.has('bow');
      const HINTS = {
        'Mauled by the tiger': armed
          ? 'Mauled by the tiger. Shoot from further off; after it strikes, it falls back to its den. Shoot it as it goes.'
          : 'Mauled by the tiger. Bare hands are no use against it.',
        Hunger: 'Starved. Fallen fruit lies under the trees in the clearing.',
        Thirst: 'Died of thirst. The pond and the river have clean water.',
        'A bad fall': 'A bad fall.',
      };
      $('death-cause').textContent = HINTS[cause] || cause || '';
      $('death').hidden = false;
      if (D.audio) D.audio.sting('danger');
    }, 1800);
  };
  $('btn-retry').addEventListener('click', () => story.loadCheckpoint());

  // ---------- Fades and the eyes ----------

  let fade = { from: 1, to: 1, t: 1, dur: 1, done: null };
  function fadeTo(to, dur, done = null) {
    fade = { from: parseFloat($('fade').style.opacity || 1), to, t: 0, dur, done };
  }
  function updateFade(dt) {
    if (fade.t >= fade.dur) return;
    fade.t += dt;
    const k = smooth(Math.min(1, fade.t / fade.dur));
    $('fade').style.opacity = lerp(fade.from, fade.to, k);
    if (fade.t >= fade.dur && fade.done) {
      const d = fade.done;
      fade.done = null;
      d();
    }
  }
  // eyelids: 0 open .. 1 shut
  function lids(shut) {
    $('lid-top').style.transform = `translateY(${-100 + shut * 100}%)`;
    $('lid-bottom').style.transform = `translateY(${100 - shut * 100}%)`;
  }
  function blur(px, bright = 1) {
    $('scene').style.filter = px > 0.05 || bright !== 1 ? `blur(${px}px) brightness(${bright})` : '';
  }

  // ---------- Title ----------

  // Behind the title: the petrified forest in the late afternoon, the camera drifting.
  story.showTitle = () => {
    D.state.mode = 'title';
    story.stage = 'title';
    $('title').hidden = false;
    $('title').classList.add('over-world');
    $('loading').hidden = true;
    $('menu').hidden = false;
    $('hud').hidden = true;
    D.env.hour = 16.9;
    D.forceSkyCapture();
    D.hero.group.visible = false;
    D.hero.control = false;
    fadeTo(0, 2.5);
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch (error) {
      saved = null;
    }
    const cont = $('btn-continue');
    cont.hidden = !saved || saved.v !== 1;
    $('new-confirm').hidden = true;
    $('menu').hidden = false;
    $('menu-note').hidden = true;
    cont.disabled = false;
    if (saved && saved.v === 1) {
      const titles = {
        exit: 'Leaving the cave', explore: 'The petrified forest', sustain: 'Eat and drink', plan: 'Before nightfall', weapon: 'A bow and arrows', hunt: 'The tiger', shelter: 'The Elder Tree', dusk: 'Nightfall',
        dawn: 'Chapter 2: The Second Waking', c2wake: 'Ch. 2: A new morning', c2fire: 'Ch. 2: Fire', c2clay: 'Ch. 2: Clay pots', c2torch: 'Ch. 2: Torches', c2cave: 'Ch. 2: The Nitre Galleries',
        c2salt: 'Ch. 2: Saltpetre', c2fluid: 'Ch. 2: The revival fluid', c2revive: 'Ch. 2: The runner', c2escort: 'Ch. 2: Before nightfall', c2night: 'Ch. 2: The second night', c2dawn: 'Ch. 2: What they saw',
        c2end: D.ch3 ? 'Chapter 3: Two Roads' : 'Chapter 3 · coming soon',
        ...(D.ch3 ? D.ch3.TITLES : {}),
        c3end: 'Chapter 4 · coming soon',
      };
      $('continue-detail').textContent = titles[saved.stage] || '';
      story.checkpoint = saved;
      // the last chapter there is, done: the save stays, Continue waits for the next one
      const last = (saved.stage === 'c2end' && !D.ch3) || saved.stage === 'c3end';
      if (last) {
        const no = saved.stage === 'c3end' ? 3 : 2;
        cont.disabled = true;
        $('menu-note').textContent = `Chapter ${no} complete. Your game is saved: when Chapter ${no + 1} arrives, Continue picks up from here.`;
        $('menu-note').hidden = false;
      }
    }
    // ?stage=... jumps straight into a part of the chapter (for testing), once: back on the
    // title afterwards it is the ordinary title, and the save is left alone
    const jump = D.params.get('stage');
    if (jump) {
      D.params.delete('stage');
      setTimeout(() => devStart(jump), 50);
    }
  };

  function titleCamera(time) {
    const a = time * 0.025;
    const pos = new THREE.Vector3(10 + Math.cos(a) * 26, 0, 178 + Math.sin(a) * 20);
    pos.y = T.height(pos.x, pos.z) + 3.2 + Math.sin(time * 0.1) * 0.4;
    const look = new THREE.Vector3(12, T.height(12, 192) + 1.4, 190);
    D.hero.camera.override = { pos, look, fov: 55 };
  }

  const SAVE_NAMES = { c3end: 'Chapter 3 complete', c2end: 'Chapter 2 complete', dawn: 'Chapter 1 complete' };
  $('btn-new').addEventListener('click', () => {
    D.audio && D.audio.unlock();
    const s = story.checkpoint;
    if (!s) {
      startNew();
      return;
    }
    // a saved game is never thrown away by one click
    $('new-confirm-save').textContent = SAVE_NAMES[s.stage] || $('continue-detail').textContent || 'in progress';
    $('menu').hidden = true;
    $('menu-note').hidden = true;
    $('new-confirm').hidden = false;
    $('btn-new-no').focus();
  });
  $('btn-new-no').addEventListener('click', () => {
    $('new-confirm').hidden = true;
    $('menu').hidden = false;
    $('menu-note').hidden = !$('btn-continue').disabled;
  });
  $('btn-new-yes').addEventListener('click', () => {
    $('new-confirm').hidden = true;
    $('menu').hidden = false;
    startNew();
  });
  function startNew() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      // nothing to remove
    }
    story.checkpoint = null;
    newGame();
  }
  $('btn-continue').addEventListener('click', () => {
    D.audio && D.audio.unlock();
    if (!story.checkpoint || story.checkpoint.stage === 'c3end' || (story.checkpoint.stage === 'c2end' && !D.ch3)) return;
    $('title').hidden = true;
    fadeTo(1, 0.6, () => {
      restore(story.checkpoint);
      // Chapter 1 done: on into Chapter 2
      if (story.checkpoint.stage === 'dawn' && D.ch2) D.ch2.start();
      else if (story.checkpoint.stage === 'c2end' && D.ch3) D.ch3.start();
      else startPlay(false);
      fadeTo(0, 1.2);
    });
  });
  $('btn-settings').addEventListener('click', () => D.ui.showSettings());
  $('btn-credits').addEventListener('click', () => {
    $('credits').hidden = false;
  });
  $('credits').addEventListener('click', (e) => {
    if (e.target.id === 'credits') $('credits').hidden = true;
  });
  $('btn-again').addEventListener('click', () => {
    $('complete').hidden = true;
    story.toTitle();
  });

  story.toTitle = () => {
    saveNow();
    // out of play first, or letting go of the mouse would pause the game (and the fade)
    D.state.mode = 'cinematic';
    D.state.panel = null;
    D.hero.control = false;
    D.unlockPointer();
    fadeTo(1, 0.6, () => {
      blur(0);
      lids(0);
      $('hud').hidden = true;
      $('letterbox').hidden = true;
      $('caption').hidden = true;
      $('death').hidden = true;
      D.hero.camera.override = null;
      story.showTitle();
    });
  };

  // ---------- A new game: the prologue and the awakening ----------

  function resetWorld() {
    const h = D.hero;
    D.items.load({ inv: {}, taken: [], found: [], weapon: 'hands' });
    D.flora.restoreTaken([]);
    D.shelter.setStage(0);
    D.combat.resetTiger(true);
    D.combat.tigerAwake = false;
    story.flags = {};
    story.zones = new Set();
    story.stats = { deaths: 0 };
    D.state.playTime = 0;
    D.ui.restoreRevealed([]);
    D.ui.found();
    h.revive();
    Object.assign(h.stats, { health: 82, stamina: 60, hunger: 26, thirst: 18 });
    h.teleport(C.statue.x, C.statue.z, Math.PI);
    h.petrify = 1;
    h.crack = 0;
    h.frozen = true;
    h.cinematicPose = 'statue';
    h.group.visible = true;
    D.cave.drip.on = true;
    D.cave.veinGlow = 1;
    D.cave.flyers.forEach((b, i) => {
      b.out = false;
      b.gone = i >= 10;
      b.circling = i < 10;
    });
    D.env.hour = 7.3;
    D.env.rate = 0;
    D.env.overcast = 0;
    D.env.rain = 0;
    D.forceSkyCapture();
    if (D.ch2) D.ch2.reset();
    if (D.ch3) D.ch3.reset();
  }

  function newGame() {
    $('title').hidden = true;
    D.state.mode = 'cinematic';
    fadeTo(1, 0.8, () => {
      resetWorld();
      runPrologue();
    });
  }

  const PROLOGUE = [
    ['year', 'Year One'],
    ['', 'Without warning, a ring of green light swept across the Earth.'],
    ['', 'In an instant, every human being was turned to stone.'],
    ['', 'Cities fell silent. Roads cracked. The forests came back.'],
    ['year', 'Year One Thousand'],
  ];
  function runPrologue() {
    const box = $('prologue');
    box.innerHTML = PROLOGUE.map(([cls, text]) => `<p class="${cls}">${text}</p>`).join('');
    box.hidden = false;
    $('letterbox').hidden = false;
    $('fade').style.opacity = 0;
    const lines = [...box.children];
    let i = 0;
    story.cine = { prologue: true, t: 0, next: 0.6, done: false, skippable: true, lines };
    story.cine.step = () => {
      if (i < lines.length) {
        if (i === 4) lines.slice(0, 4).forEach((l) => l.classList.remove('on'));
        lines[i].classList.add('on');
        i++;
        story.cine.next += i === 4 ? 2.4 : 3.0;
      } else {
        story.cine = null;
        lines.forEach((l) => l.classList.remove('on'));
        setTimeout(() => {
          box.hidden = true;
          runAwakening();
        }, 1200);
      }
    };
    D.audio && D.audio.sting('done');
  }

  // The shots in the cave. Each: how long, where the camera is (as a function of 0..1 through
  // the shot), the caption, and what happens.
  const statueHead = () => new THREE.Vector3(C.statue.x, C.floor + 1.72, C.statue.z);
  function caveShots() {
    const head = statueHead();
    const roofAbove = new THREE.Vector3(C.statue.x, C.floor + 5.2, C.statue.z + 0.2);
    return [
      {
        dur: 7.5,
        caption: 'In a cave at the edge of a forgotten valley, a colony of bats still roosts, as it has for a thousand years.',
        cam: (t) => ({
          pos: new THREE.Vector3(C.chamber.x - 2 + t * 3, C.floor + 3.4 + t * 0.4, C.chamber.z + 2 - t * 9),
          look: new THREE.Vector3(C.chamber.x + 1 - t * 2, C.floor + 8 - t * 4.5, C.chamber.z - 4 - t * 14),
          fov: 46,
        }),
      },
      {
        dur: 7.5,
        caption: 'Their guano soaked the cave floor: nitre, ammonia, phosphate. And water seeped through it, drop by drop.',
        enter: () => {
          D.cave.drip.fast = false;
        },
        cam: (t) => ({
          // his stone face, then up the line of the drip to where it gathers
          pos: new THREE.Vector3(head.x + 1.3 - t * 0.4, head.y + 0.1 + t * 0.3, head.z - 1.4 + t * 0.3),
          look: new THREE.Vector3(head.x, head.y + 0.05 + smooth(t) * 2.4, head.z + 0.15),
          fov: 44,
        }),
      },
      {
        dur: 6.5,
        caption: 'Through a vein of something no one had ever named. Call it <em>Revonite</em>: in the dripping water, a catalyst.',
        cam: (t) => {
          const a = 0.6 + t * 0.7;
          return {
            pos: new THREE.Vector3(roofAbove.x + Math.cos(a) * 2.6, roofAbove.y - 1.6, roofAbove.z + Math.sin(a) * 2.6 - 0.6),
            look: new THREE.Vector3(roofAbove.x, roofAbove.y - 0.4, roofAbove.z + 1),
            fov: 48,
          };
        },
      },
      {
        dur: 8,
        caption: 'For a thousand years it ate into the stone of one man.',
        enter: () => {
          D.cave.drip.fast = true;
        },
        update: (t) => {
          D.hero.crack = smoothstep(0.15, 0.95, t) * 1.2;
          if (Math.random() < t * 0.12 && D.audio) D.audio.crack(t * 0.6);
          D.env.shake = Math.max(D.env.shake, t > 0.7 ? (t - 0.7) * 0.8 : 0);
        },
        cam: (t) => ({
          pos: new THREE.Vector3(head.x + 0.4, head.y - 0.15 + t * 0.05, head.z - 3.6 + t * 1.6),
          look: new THREE.Vector3(head.x, head.y - 0.35 + t * 0.2, head.z),
          fov: 42 - t * 6,
        }),
      },
      {
        dur: 2.2,
        caption: '',
        enter: () => {
          burstShell();
          D.cave.scatter();
          if (D.audio) {
            D.audio.shatter();
            D.audio.bats(1.2);
          }
          D.env.shake = 1;
          D.cave.drip.fast = false;
        },
        update: (t) => {
          D.hero.petrify = lerp(1, 0, smooth(Math.min(1, t * 2.2)));
          D.hero.crack = (1 - t) * 1.2;
          D.exposureBoost = 1 + (1 - t) * 2.2;
          D.hero.cinematicPose = t > 0.25 ? 'wake' : 'statue';
        },
        cam: (t) => ({
          pos: new THREE.Vector3(head.x + 0.6, head.y - 0.1, head.z - 2.2 - t * 1.2),
          look: new THREE.Vector3(head.x, head.y - 0.5, head.z),
          fov: 40,
        }),
      },
      {
        // his eyes: blurred for two seconds, then clearing; he can move at the end
        dur: 5.2, caption: '', pov: true,
        enter: () => {
          D.hero.group.visible = false;
          $('letterbox').hidden = true;
          D.exposureBoost = 1;
        },
        update: (t, s) => {
          const sec = t * 5.2;
          const clear = smoothstep(2.0, 4.8, sec);
          blur(lerp(16, 0, clear), lerp(1.7, 1, smoothstep(0.5, 4.5, sec)));
          // the eyes open, blink, close again, open
          const lid = sec < 0.6 ? 1 : sec < 1.1 ? 1 - (sec - 0.6) / 0.5 * 0.7 : sec < 1.5 ? 0.3 + (sec - 1.1) / 0.4 * 0.7 : sec < 2.3 ? 1 - (sec - 1.5) / 0.8 : sec < 3.2 ? 0.08 * Math.sin((sec - 2.3) * 7) ** 2 : 0;
          lids(clamp(lid, 0, 1));
          $('vignette').style.opacity = lerp(1, 0.55, clear);
          if (!s.beats) s.beats = 0;
          if (sec > s.beats * 0.85 && s.beats < 6) {
            s.beats++;
            if (D.audio) D.audio.heartbeat(lerp(0.6, 0.2, clear));
            if (s.beats === 2 && D.audio) D.audio.breath(0.5);
          }
        },
        cam: (t) => {
          const sec = t * 5.2;
          const sway = Math.sin(sec * 1.3) * 0.04 * (1 - t);
          return {
            pos: new THREE.Vector3(head.x + sway, head.y - 0.32 + t * 0.12, head.z - 0.15),
            look: new THREE.Vector3(head.x + Math.sin(sec * 0.7) * 1.2 * (1 - t), head.y - 0.9 + t * 0.85, head.z - 10),
            fov: 70 - t * 6,
          };
        },
      },
    ];
  }

  // The shell bursts: chips of stone fly off him and fall about the cave floor.
  const chips = [];
  function burstShell() {
    const parts = D.models.part('rocks', 'stone');
    if (!parts.length) return;
    if (!story.chipMesh) {
      const mat = new THREE.MeshStandardMaterial({ color: D.col(0x8c887f), roughness: 0.95 });
      D.addCaveShade(mat);
      story.chipMesh = new THREE.InstancedMesh(parts[0].geometry, mat, 90);
      story.chipMesh.castShadow = true;
      story.chipMesh.receiveShadow = true;
      D.scene.add(story.chipMesh);
    }
    chips.length = 0;
    const keys = ['head', 'spine2', 'spine', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'kneeL', 'kneeR'];
    for (let i = 0; i < 90; i++) {
      const at = D.hero.boneWorld(keys[i % keys.length]).clone();
      at.x += rand(-0.12, 0.12);
      at.y += rand(-0.1, 0.12);
      at.z += rand(-0.12, 0.12);
      const out = at.clone().sub(new THREE.Vector3(C.statue.x, at.y, C.statue.z)).normalize();
      chips.push({
        p: at, v: new THREE.Vector3(out.x * rand(1.5, 4.5), rand(1, 4), out.z * rand(1.5, 4.5)),
        r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)), w: rand(-12, 12), s: rand(0.08, 0.3) * (i % 5 ? 1 : 1.6), rest: false,
      });
    }
  }
  const chipDummy = new THREE.Object3D();
  function updateChips(dt) {
    if (!story.chipMesh || !chips.length) return;
    let n = 0;
    for (const c of chips) {
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w * dt;
        c.r.z += c.w * 0.7 * dt;
        const ground = T.height(c.p.x, c.p.z) + 0.02;
        if (c.p.y < ground) {
          c.p.y = ground;
          c.v.y *= -0.3;
          c.v.x *= 0.5;
          c.v.z *= 0.5;
          c.w *= 0.5;
          if (Math.abs(c.v.y) < 0.4) c.rest = true;
        }
      }
      chipDummy.position.copy(c.p);
      chipDummy.rotation.copy(c.r);
      chipDummy.scale.setScalar(c.s);
      chipDummy.updateMatrix();
      story.chipMesh.setMatrixAt(n++, chipDummy.matrix);
    }
    story.chipMesh.count = n;
    story.chipMesh.instanceMatrix.needsUpdate = true;
  }

  // The opening scenes in the cave: its dark lifted enough to see by, and the light of the
  // morning lying in through the mouth.
  function caveLights(on) {
    D.caveUniforms.caveLift.value = on ? 1 : 0;
    D.shaftBoost = on ? 1.8 : 1;
  }
  function runAwakening() {
    caveLights(true);
    $('letterbox').hidden = false;
    lids(0);
    blur(0);
    D.hero.group.visible = true;
    const shots = caveShots();
    story.cine = { shots, i: -1, t: 0, state: {}, onEnd: endAwakening, skippable: true };
    nextShot();
    fadeTo(0, 2);
  }

  function nextShot() {
    const c = story.cine;
    c.i++;
    c.t = 0;
    c.state = {};
    const shot = c.shots[c.i];
    if (!shot) {
      story.cine = null;
      c.onEnd();
      return;
    }
    if (shot.enter) shot.enter();
    const cap = $('caption');
    if (shot.caption) {
      cap.innerHTML = shot.caption;
      cap.hidden = false;
      cap.classList.add('out');
      setTimeout(() => cap.classList.remove('out'), 300);
    } else cap.hidden = true;
  }

  function updateCine(dt) {
    const c = story.cine;
    if (!c) return;
    if (c.prologue) {
      c.t += dt;
      if (c.t >= c.next) c.step();
      return;
    }
    const shot = c.shots[c.i];
    c.t += dt;
    const t = Math.min(1, c.t / shot.dur);
    if (shot.update) shot.update(t, c.state);
    const cam = shot.cam(ease(t));
    D.hero.camera.override = cam;
    if (shot.caption && c.t > shot.dur - 0.8) $('caption').classList.add('out');
    if (c.t >= shot.dur) nextShot();
  }

  // Hold Space to skip a scene.
  let skipHeld = 0;
  function updateSkip(dt) {
    const c = story.cine;
    const fill = $('skip-fill');
    // (a skipped prologue skips the cave scenes behind it too)
    if (updateSkip.now && c && !c.prologue) {
      updateSkip.now = false;
      skipHeld = 1;
    } else if (!c || !c.skippable || !D.input.held.has('Space')) {
      skipHeld = 0;
      fill.style.width = '0';
      return;
    }
    skipHeld += dt;
    fill.style.width = `${Math.min(1, skipHeld / 0.9) * 150}px`;
    if (skipHeld > 0.9) {
      skipHeld = 0;
      fill.style.width = '0';
      // during the prologue: past it, and past the whole awakening
      if (c.prologue) {
        c.lines.forEach((l) => l.classList.remove('on'));
        $('prologue').hidden = true;
        story.cine = null;
        runAwakening();
        updateSkip.now = true;
        skipHeld = 1;
        return;
      }
      // run the rest of the scene's effects at once
      while (story.cine && story.cine === c) {
        const shot = c.shots[c.i];
        if (shot.update) shot.update(1, c.state);
        c.t = shot.dur;
        nextShot();
      }
    }
  }

  function endAwakening() {
    const h = D.hero;
    caveLights(false);
    blur(0);
    lids(0);
    $('caption').hidden = true;
    $('letterbox').hidden = true;
    $('vignette').style.opacity = 0.55;
    D.exposureBoost = 1;
    h.petrify = 0;
    h.crack = 0;
    h.group.visible = true;
    h.cinematicPose = null;
    h.frozen = false;
    h.yaw = Math.PI;
    h.pitch = -0.05;
    story.zones.add(1);
    D.ui.zone(1);
    startPlay(true);
    setStage('exit', { save: true });
    D.ui.think('Where... where am I?', 3.2);
    D.ui.think('I can move. I can... breathe.', 3.6);
    D.ui.tutorial('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &middot; Mouse to look &middot; <kbd>Shift</kbd> sprint &middot; <kbd>B</kbd> field notes: how everything works', 10);
  }

  // Hands over to the player.
  function startPlay(fromCinematic) {
    D.state.mode = 'play';
    $('hud').hidden = false;
    $('hud').classList.remove('faded');
    $('title').hidden = true;
    D.hero.control = true;
    D.hero.camera.override = null;
    D.hero.camera.pos.copy(D.camera.position);
    D.ui.hotbar();
    D.lockPointer();
    if (!fromCinematic) refreshObjective(true);
  }

  // ---------- The day ----------

  // Things that happen as you play, from the other parts of the game.
  story.on = (event, data) => {
    if (D.state.mode !== 'play') return;
    if (SAVE_ON[event] !== undefined) {
      const at = performance.now() + SAVE_ON[event] * 1000;
      saveAt = saveAt >= 0 ? Math.min(saveAt, at) : at;
      if (event !== 'shot' && event !== 'drank') saveNote = true;
    }
    switch (event) {
      case 'examined': {
        const n = D.statues.list.filter((s) => s.found).length;
        if (n === 1) D.ui.think('Stone. They\'re all stone... like I was.', 4);
        if (story.stage === 'explore' && n >= 3) {
          D.ui.think('Everyone. Everyone turned to stone, and only I woke up.', 4.5);
          D.ui.think('Why me? The cave... the water dripping on me...', 4.5);
          D.ui.think('Questions later. My body is screaming for food and water.', 4.5);
          setStage('sustain');
          raiseHour(HOURS.sustain[0]);
        }
        break;
      }
      case 'ate':
        if (!story.flags.ateOnce) {
          story.flags.ateOnce = true;
          D.ui.think(data === 'mango' ? 'Sweet... I\'d forgotten what food tastes like.' : 'Food. Real food.', 3.5);
        }
        break;
      case 'drank':
        if (!story.flags.drankOnce) {
          story.flags.drankOnce = true;
          D.ui.think('Cold, clean water. Never tasted anything better.', 3.5);
        }
        break;
      case 'gained':
        if (data.key === 'stick' && have('stick') >= 3) story.flags.sticks = true;
        if (data.key === 'stone' && have('stone') >= 3) story.flags.stones = true;
        if (data.key === 'flint' && !story.flags.flintSeen) {
          story.flags.flintSeen = true;
          D.ui.think('Flint. Strike two together and the edge comes up sharp.', 4);
        }
        break;
      case 'made':
        if (data === 'blade') D.ui.think('Sharp enough to cut a sapling... or a cord.', 3.5);
        if (data === 'bow') {
          D.ui.think('Not pretty. But it will throw an arrow.', 3.5);
          D.ui.tutorial('<kbd>3</kbd> bow &middot; hold <b>right</b> mouse to aim, hold <b>left</b> to draw, let go to loose', 8);
        }
        break;
      case 'tigerAlert':
        if (!story.flags.tigerSeen) {
          story.flags.tigerSeen = true;
          D.ui.think('Something is moving in the gorge...', 3, true);
          if (D.audio) D.audio.sting('danger');
          if (story.stage === 'plan') story.flags.gorgeAt = D.state.time;
        }
        break;
      case 'tigerCharge':
        if (!story.flags.tigerCharged) {
          story.flags.tigerCharged = true;
          D.ui.think('A tiger! It\'s coming for me!', 2.5, true);
        }
        break;
      case 'mauled':
        if (!story.flags.mauled) {
          story.flags.mauled = true;
          setTimeout(() => {
            if (story.stage === 'plan') {
              D.ui.think('I can\'t fight that with my bare hands.', 3.5, true);
              D.ui.think('I need to hit it from a distance. A bow... I could make a bow.', 4.5);
              D.combat.tigerAwake = true;
              setStage('weapon');
              raiseHour(HOURS.weapon[0]);
            }
          }, 1800);
        }
        break;
      case 'tigerHit':
        if (!story.flags.firstHit) {
          story.flags.firstHit = true;
          D.ui.think(data.head ? 'Right in the head! It\'s still standing!' : 'Hit! It\'s hurt... and angry.', 3, true);
        } else if (data.left < 60 && !story.flags.tigerWeak) {
          story.flags.tigerWeak = true;
          D.ui.think('It\'s limping. One more...', 3, true);
        }
        break;
      case 'tigerDown':
        D.ui.think('It\'s down. It\'s... over.', 3.5, true);
        D.ui.think('I\'m sorry. It was you or me.', 3.5);
        D.ui.think('The way north is open.', 3.5);
        if (D.audio) D.audio.sting('done');
        story.flags.tigerDead = true;
        setStage('shelter');
        raiseHour(HOURS.shelter[0]);
        break;
      case 'built':
        if (data === 'frame') D.ui.think('The frame holds. Now a floor to sleep on.', 3.5);
        if (data === 'floor') D.ui.think('Off the ground. Nothing on four legs can reach me up here.', 4);
        if (data === 'roof') {
          D.ui.think('Done. Just in time, too. The light is going.', 4);
          setStage('dusk');
          raiseHour(HOURS.dusk[0]);
        } else saveCheckpoint();
        break;
      case 'climbedUp':
        if (story.stage === 'dusk') D.ui.tutorial('<kbd>E</kbd> lie down and rest until dawn', 6);
        break;
      default:
        break;
    }
    if (D.ch2) D.ch2.on(event, data);
    if (D.ch3) D.ch3.on(event, data);
  };

  // Moves the clock on to at least `hour`, quickly, as the day passes.
  function raiseHour(hour) {
    story.hourGoal = Math.max(story.hourGoal || 0, hour);
  }

  // Each second or so: which zone, what to say, whether a goal is reached.
  let zoneCheck = 0;
  function updateDay(dt) {
    const h = D.hero;
    const range = HOURS[story.stage] || (story.chap() && story.chap().hours(story.stage));
    // the sun: slowly, never past the goal's last hour; quickly up to its first
    if (range) {
      const env = D.env;
      const goal = Math.max(range[0], story.hourGoal || 0);
      if (env.hour < goal - 0.01) env.hour = Math.min(goal, env.hour + dt * 0.35);
      else if (env.hour < range[1]) env.hour = Math.min(range[1], env.hour + dt / 160);
    }
    zoneCheck -= dt;
    if (zoneCheck > 0) return;
    zoneCheck = 0.5;
    refreshObjective();
    const zone = T.zoneAt(h.pos.x, h.pos.z);
    if (!story.zones.has(zone)) {
      story.zones.add(zone);
      D.ui.zone(zone);
      const SAY = {
        2: 'So many of them... a whole forest of stone people.',
        3: 'Water. Fruit trees. I could survive here.',
        4: 'The cliffs close in. This gorge is the only way north.',
        5: 'Sharp stones everywhere up here. Flint.',
        6: 'The jungle is thick here. Everything grows bigger.',
        7: 'That tree... it must be older than the stone itself.',
        8: 'The stream runs into the river here. And the bank... grey clay.',
        10: 'The whole valley, down there. And beyond the ridge...',
      };
      if (SAY[zone]) D.ui.think(SAY[zone], 4);
      if (zone === 7) story.flags.sawTree = true;
    }
    if (story.flags.sawTree === undefined && Math.hypot(h.pos.x - L.tree.x, h.pos.z - L.tree.z) < 30) story.flags.sawTree = true;
    // hunger and thirst, said aloud the first time
    if (h.stats.hunger < 18 && !story.flags.hungry) {
      story.flags.hungry = true;
      D.ui.think('My stomach... I need to eat something.', 3.5);
    }
    if (h.stats.thirst < 15 && !story.flags.thirsty) {
      story.flags.thirsty = true;
      D.ui.think('My throat is like dust. Water. I need water.', 3.5);
    }
    // the goals
    switch (story.stage) {
      case 'exit':
        if (h.pos.z < C.mouthZ - 3) {
          D.ui.think('Daylight... How long was I in there?', 3.5);
          D.ui.think('Who are those people down there?', 3.5);
          setStage('explore');
        }
        break;
      case 'explore': {
        // first sight of a statue
        if (!story.flags.sawStatue && D.statues.list.some((s) => Math.hypot(s.x - h.pos.x, s.z - h.pos.z) < 14)) {
          story.flags.sawStatue = true;
          D.ui.think('People? No... statues?', 3.2);
          D.ui.tutorial('<kbd>E</kbd> examine', 5);
        }
        break;
      }
      case 'sustain': {
        const s = h.stats;
        if (s.hunger >= 60 && s.thirst >= 60 && story.flags.sticks && story.flags.stones) {
          D.ui.think('Better. I can think again.', 3.5);
          D.ui.think('The sun is past its height. I can\'t spend the night on open ground.', 4.5);
          D.ui.think('I need a shelter. Somewhere high, out of reach.', 4);
          setStage('plan');
          raiseHour(HOURS.plan[0]);
        }
        if (!story.flags.foodHint && s.hunger < 50 && Math.hypot(h.pos.x + 20, h.pos.z - 100) < 60) {
          story.flags.foodHint = true;
          D.ui.tutorial('<kbd>E</kbd> pick up &middot; <kbd>Q</kbd> eat &middot; <kbd>E</kbd> at the water\'s edge to drink', 7);
        }
        break;
      }
      case 'plan':
        // into the gorge: the tiger
        if (Math.hypot(h.pos.x - L.den.x, h.pos.z - L.den.z) < 40 && !story.flags.gorgeAt) story.flags.gorgeAt = D.state.time;
        if (story.flags.gorgeAt && !story.flags.mauled && D.state.time - story.flags.gorgeAt > 14 && Math.hypot(h.pos.x - L.den.x, h.pos.z - L.den.z) > 30) {
          // it showed itself, and he backed away
          story.flags.mauled = true;
          D.ui.think('Not with bare hands. I need to hit it from a distance. A bow.', 4.5, true);
          D.combat.tigerAwake = true;
          setStage('weapon');
          raiseHour(HOURS.weapon[0]);
        }
        break;
      case 'weapon':
        if (have('bow') && have('arrow') >= 4) {
          D.ui.think('Now. Let\'s see who rules the gorge.', 3.5);
          setStage('hunt');
          raiseHour(HOURS.hunt[0]);
        }
        break;
      default:
        if (D.ch2) D.ch2.check();
        if (D.ch3) D.ch3.check();
        break;
    }
  }

  // ---------- The night ----------

  // Rain for the night: streaks falling round the camera.
  let rain = null;
  function buildRain() {
    const N = 2400;
    const pos = new Float32Array(N * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: D.col(0x9fb0c0), transparent: true, opacity: 0.35 });
    rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    rain.drops = Array.from({ length: N }, () => [rand(-25, 25), rand(0, 22), rand(-25, 25)]);
    D.scene.add(rain);
  }
  function updateRain(dt) {
    if (!rain) return;
    const amount = D.env.rain;
    rain.visible = amount > 0.02;
    if (!rain.visible) return;
    const cam = D.camera.position;
    const p = rain.geometry.attributes.position.array;
    const n = Math.floor(rain.drops.length * amount);
    rain.drops.forEach((d, i) => {
      d[1] -= dt * 16;
      if (d[1] < -2) d[1] += 24;
      const k = i * 6;
      if (i >= n) {
        p.fill(0, k, k + 6);
        return;
      }
      const x = cam.x + d[0];
      const y = cam.y + d[1] - 8;
      const z = cam.z + d[2];
      p[k] = x;
      p[k + 1] = y;
      p[k + 2] = z;
      p[k + 3] = x + 0.03;
      p[k + 4] = y + 0.5;
      p[k + 5] = z;
    });
    rain.geometry.attributes.position.needsUpdate = true;
    rain.material.opacity = 0.35 * amount * (0.3 + 0.7 * D.env.day + 0.3);
  }

  // Fireflies round the tree at night.
  let flies = null;
  function buildFireflies() {
    const N = 140;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = L.tree.x + rand(-22, 22);
      pos[i * 3 + 1] = T.height(L.tree.x, L.tree.z) + rand(0.4, 4);
      pos[i * 3 + 2] = L.tree.z + rand(-22, 22);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, amount: { value: 0 }, scale: { value: 400 } },
      vertexShader: `
        uniform float time;
        uniform float scale;
        varying float vA;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 p = position;
          float s = h(p.xz);
          p.x += sin(time * 0.4 + s * 30.0) * 1.5;
          p.y += sin(time * 0.6 + s * 20.0) * 0.5;
          p.z += cos(time * 0.35 + s * 40.0) * 1.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, 0.08 * scale / -mv.z);
          vA = pow(max(0.0, sin(time * (1.5 + s * 2.0) + s * 40.0)), 6.0);
        }`,
      fragmentShader: `
        uniform float amount;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * smoothstep(0.5, 0.0, d) * vA * amount, 1.0);
        }`,
    });
    flies = new THREE.Points(geo, mat);
    flies.frustumCulled = false;
    D.scene.add(flies);
  }

  story.rest = () => {
    if (story.stage !== 'dusk') return;
    story.stage = 'night';
    const h = D.hero;
    h.control = false;
    D.state.mode = 'cinematic';
    $('hud').classList.add('faded');
    $('letterbox').hidden = false;
    D.ui.prompt(null);
    fadeTo(1, 1.5, () => {
      // on his back on the bed of leaves, head to the trunk: lying down tips him backwards from
      // where he stands, so from just anywhere on the boards his head could hang out over the edge
      if (D.shelter.P && D.shelter.stage >= 2) {
        const bed = D.shelter.bed(0);
        h.teleport(bed.x, bed.z, bed.facing, bed.y);
        h.platform = D.shelter.P;
      }
      h.cinematicPose = 'lie';
      runNight();
      fadeTo(0, 2);
    });
  };

  // The night and the dawn: a little more of the moon's cold fill, so the shelter can be seen.
  function cineLights(moon) {
    D.nightFill = moon;
  }

  function nightShots() {
    const P = D.shelter.P;
    const tree = new THREE.Vector3(L.tree.x, T.height(L.tree.x, L.tree.z), L.tree.z);
    const shelterAt = new THREE.Vector3(P.cx, P.y + 0.8, P.cz);
    const out = new THREE.Vector3(P.ox, 0, P.oz);
    const side = new THREE.Vector3(P.ax, 0, P.az);
    return [
      {
        dur: 8, caption: 'Night fell on the valley of stone.',
        enter: () => {
          D.env.hour = 20.2;
          D.forceSkyCapture();
          cineLights(1);
        },
        update: (t) => {
          D.env.hour = 20.2 + t * 1.3;
          flies.material.uniforms.amount.value = smoothstep(0, 0.3, t);
        },
        cam: (t) => ({
          pos: shelterAt.clone().addScaledVector(out, 9 - t * 2).addScaledVector(side, 4 - t * 3).setY(shelterAt.y + 1.5 + t),
          look: shelterAt.clone(),
          fov: 50,
        }),
      },
      {
        dur: 13, caption: '',
        enter: () => {
          const ladder = D.shelter.ladder.bottom;
          D.combat.bearVisit(true, shelterAt.clone().addScaledVector(out, 15).addScaledVector(side, 9), ladder.clone().addScaledVector(out, 1.4));
          D.ui.think('Something is down there.', 3, true);
          D.ui.think('It can smell me... but it can\'t reach me.', 4);
          if (D.audio) D.audio.sting('danger');
        },
        update: (t) => {
          D.exposureBoost = 1.15;
          D.env.hour = 21.5 + t * 0.8;
          D.env.overcast = smoothstep(0.3, 1, t) * 0.7;
          D.env.rain = smoothstep(0.55, 1, t) * 0.7;
        },
        cam: (t) => {
          const b = D.combat.bear;
          const look = b ? new THREE.Vector3(b.x, b.y + 0.7, b.z).lerp(shelterAt, 0.2 + 0.25 * smoothstep(0.6, 1, t)) : tree;
          return {
            pos: shelterAt.clone().addScaledVector(out, 7).addScaledVector(side, -5 + t * 2).setY(T.height(shelterAt.x, shelterAt.z) + 1.4),
            look,
            fov: 50,
          };
        },
      },
      {
        dur: 9, caption: 'The rain came, and went. The shelter held.',
        enter: () => {
          if (D.audio) D.audio.thunder();
        },
        update: (t) => {
          D.exposureBoost = 1.15;
          D.env.hour = 22.3 + t * 8.3;
          if (D.env.hour >= 24) D.env.hour -= 24;
          D.env.overcast = 0.7 * (1 - smoothstep(0.4, 0.9, t));
          D.env.rain = 0.7 * (1 - smoothstep(0.3, 0.7, t));
          flies.material.uniforms.amount.value = 1 - smoothstep(0.7, 1, t);
        },
        cam: (t) => {
          const a = t * 1.4;
          return {
            pos: shelterAt.clone().addScaledVector(out, Math.cos(a) * 11).addScaledVector(side, Math.sin(a) * 11).setY(shelterAt.y + 4 + t * 4),
            look: shelterAt.clone(),
            fov: 50,
          };
        },
      },
      {
        // first light: he stands at the edge of the platform, looking out
        dur: 8, caption: 'Morning came. He was still alive.',
        enter: () => {
          cineLights(0);
          D.exposureBoost = 1.25;
          D.env.hour = 6.7;
          D.env.overcast = 0;
          D.env.rain = 0;
          D.forceSkyCapture();
          const h = D.hero;
          h.cinematicPose = null;
          h.teleport(P.cx + P.ox * 1.15, P.cz + P.oz * 1.15, Math.atan2(0.85, -0.5), P.y + 0.44);
          h.platform = P;
          D.combat.bearVisit(false);
          if (D.audio) D.audio.sting('dawn');
        },
        update: (t) => {
          D.env.hour = 6.7 + t * 0.35;
          flies.material.uniforms.amount.value = 0;
        },
        cam: (t) => {
          const h = D.hero;
          return {
            pos: h.pos.clone().addScaledVector(out, 5.5 - t * 1.2).addScaledVector(side, 2.4 - t).add(new THREE.Vector3(0, 0.9 + t * 0.4, 0)),
            look: h.pos.clone().add(new THREE.Vector3(0, 1.25, 0)),
            fov: 44,
          };
        },
      },
      {
        // up through the leaves and over the canopy: the sun rising on the valley of stone
        dur: 11, caption: '',
        enter: () => {
          showDawnTitle();
        },
        update: (t) => {
          D.env.hour = 7.05 + t * 0.5;
        },
        cam: (t) => {
          const k = smooth(t);
          const east = new THREE.Vector3(0.82, 0, -0.57).normalize();
          return {
            pos: shelterAt.clone().addScaledVector(out, 4 + k * 20).add(new THREE.Vector3(0, 2 + k * 34, 0)),
            look: shelterAt.clone().addScaledVector(east, 120).add(new THREE.Vector3(0, 10 + k * 26, 0)),
            fov: 55,
          };
        },
      },
    ];
  }

  function runNight() {
    if (!rain) buildRain();
    if (!flies) buildFireflies();
    story.cine = { shots: nightShots(), i: -1, t: 0, state: {}, onEnd: endChapter, skippable: true };
    nextShot();
  }

  function showDawnTitle() {
    const el = $('dawn-title');
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
  }

  function endChapter() {
    $('dawn-title').hidden = true;
    D.exposureBoost = 1;
    cineLights(0);
    story.stage = 'dawn';
    D.state.mode = 'complete';
    $('letterbox').hidden = true;
    $('caption').hidden = true;
    D.unlockPointer();
    const mins = Math.round(D.state.playTime / 60);
    const found = D.statues.list.filter((s) => s.found).length;
    $('stats').innerHTML = [
      ['Time', `${mins} min`], ['People of stone found', `${found} / ${D.statues.total}`],
      ['Arrows loosed', `${D.combat.stats.shot}`], ['Times you fell', `${story.stats.deaths}`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('complete-small').textContent = 'Chapter 1 complete';
    $('complete-title').textContent = 'The Long Night';
    $('complete-line').textContent = 'He survived his first night in a world of stone. The sun rises on a new dawn.';
    $('complete-next').innerHTML = 'Next: Chapter 2 &middot; <i>The Second Waking</i>';
    $('btn-ch2').textContent = 'Continue to Chapter 2';
    $('btn-ch2').hidden = !D.ch2;
    $('complete-saved').hidden = true;
    $('complete').hidden = false;
    // kept, so Continue on the title goes on into Chapter 2
    story.checkpoint = snapshot();
    write();
  }

  // Chapter 2's end (chapter2.js calls it, at the Lookout or by the fire).
  story.endChapter2 = ({ sawRing = false } = {}) => {
    if (D.ui.quiet) D.ui.quiet();
    $('subtitle').hidden = true;
    story.stage = 'c2end';
    D.state.mode = 'complete';
    $('letterbox').hidden = true;
    $('caption').hidden = true;
    $('hud').classList.add('faded');
    D.unlockPointer();
    const mins = Math.round(D.state.playTime / 60);
    const found = D.statues.list.filter((s) => s.found).length;
    $('stats').innerHTML = [
      ['Time, both chapters', `${mins} min`], ['People of stone found', `${found} / ${D.statues.total}`],
      ['Woken', '1 of 28'], ['Times you fell', `${story.stats.deaths}`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('complete-small').textContent = 'Chapter 2 complete';
    $('complete-title').textContent = 'The Second Waking';
    $('complete-line').textContent = sawRing
      ? 'Two people now, in a world of stone. And over the eastern mountains, a ring of green light.'
      : 'Two people now, in a world of stone. Somewhere beyond the mountains, the answers wait.';
    $('complete-next').innerHTML = D.ch3 ? 'Next: Chapter 3 &middot; <i>Two Roads</i>' : 'Chapter 3 &middot; <i>Two Roads</i> &middot; coming soon';
    $('btn-ch2').textContent = 'Continue to Chapter 3';
    $('btn-ch2').hidden = !D.ch3;
    $('complete-saved').hidden = !!D.ch3;
    $('complete').hidden = false;
    // kept: everything found, made and woken carries on into Chapter 3
    story.flags.sawRing = sawRing || !!story.flags.sawRing;
    story.checkpoint = snapshot();
    write();
  };
  $('btn-ch2').addEventListener('click', () => {
    $('complete').hidden = true;
    fadeTo(1, 0.6, () => {
      if (story.stage === 'c2end' && D.ch3) D.ch3.start();
      else if (D.ch2) D.ch2.start();
      fadeTo(0, 1.4);
    });
  });

  // Chapter 3's end (chapter3.js calls it, at the river).
  story.endChapter3 = () => {
    if (D.ui.quiet) D.ui.quiet();
    $('subtitle').hidden = true;
    story.stage = 'c3end';
    D.state.mode = 'complete';
    $('letterbox').hidden = true;
    $('caption').hidden = true;
    $('hud').classList.add('faded');
    D.unlockPointer();
    const mins = Math.round(D.state.playTime / 60);
    const found = D.statues.list.filter((s) => s.found).length;
    $('stats').innerHTML = [
      ['Time, all three chapters', `${mins} min`], ['People of stone found', `${found} / ${D.statues.total}`],
      ['Woken', '3'], ['Times you fell', `${story.stats.deaths}`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('complete-small').textContent = 'Chapter 3 complete';
    $('complete-title').textContent = 'Two Roads';
    $('complete-line').textContent = 'Three of them, at the edge of a river. And on the far side, smoke, and voices: people, alive.';
    $('complete-next').innerHTML = 'Chapter 4 &middot; <i>The Village</i> &middot; coming soon';
    $('btn-ch2').hidden = true;
    $('complete-saved').textContent = 'Your game is saved. When Chapter 4 arrives, Continue on the title screen picks up from here.';
    $('complete-saved').hidden = false;
    $('complete').hidden = false;
    story.checkpoint = snapshot();
    write();
  };

  // ---------- For testing: ?stage=hunt starts there with what that part needs ----------

  function devStart(stage) {
    resetWorld();
    const h = D.hero;
    h.petrify = 0;
    h.frozen = false;
    h.cinematicPose = null;
    D.cave.drip.on = false;
    if (chapterOf(stage)) {
      $('fade').style.opacity = 0;
      chapterOf(stage).devStart(stage);
      saveCheckpoint();
      return;
    }
    const give = (o) => Object.entries(o).forEach(([k, n]) => D.items.add(k, n, true));
    const at = {
      exit: [C.statue.x, C.statue.z, Math.PI], explore: [10, 215, Math.PI], sustain: [-20, 104, Math.PI], plan: [-10, 80, Math.PI],
      weapon: [100, 70, 0], hunt: [20, 40, Math.PI], shelter: [-40, -150, Math.PI], dusk: [D.shelter.ladder ? D.shelter.ladder.bottom.x : -45, D.shelter.ladder ? D.shelter.ladder.bottom.z + 1.5 : -165, Math.PI],
    }[stage] || [C.statue.x, C.statue.z, Math.PI];
    if (['plan', 'weapon', 'hunt', 'shelter', 'dusk'].includes(stage)) {
      Object.assign(h.stats, { hunger: 80, thirst: 80, health: 100, stamina: 100 });
      give({ stick: 3, stone: 3 });
    }
    if (['hunt', 'shelter', 'dusk'].includes(stage)) {
      give({ blade: 1, bow: 1, arrow: 6 });
      story.flags.mauled = true;
    }
    if (['shelter', 'dusk'].includes(stage)) {
      D.combat.resetTiger(false);
      story.flags.tigerDead = true;
      give({ branch: 13, vine: 8, big_leaf: 10, leaves: 6 });
    }
    if (stage === 'dusk') D.shelter.setStage(3);
    if (stage === 'hunt' || stage === 'weapon') D.combat.tigerAwake = true;
    h.teleport(at[0], at[1], at[2]);
    D.env.hour = (HOURS[stage] || HOURS.exit)[0];
    D.forceSkyCapture();
    $('fade').style.opacity = 0;
    startPlay(false);
    story.stage = stage;
    refreshObjective(true);
    if (D.items.has('bow')) D.items.setWeapon('bow');
    saveCheckpoint();
    if (D.params.has('night') && stage === 'dusk') setTimeout(() => story.rest(), 500);
  }
  story.devStart = devStart;

  // ---------- Each frame ----------

  story.update = (dt, time) => {
    updateFade(dt);
    updateSkip(dt);
    if (D.state.mode === 'title') titleCamera(time);
    updateCine(dt);
    updateChips(dt);
    if (D.ch2) D.ch2.frame(dt);
    if (D.ch3) D.ch3.frame(dt);
    if (D.people) D.people.update(dt);
    updateRain(dt);
    if (flies) {
      flies.material.uniforms.time.value = time;
      flies.material.uniforms.scale.value = (window.innerHeight * D.pixelRatio) / (2 * Math.tan((D.camera.fov * Math.PI) / 360));
    }
    if (D.state.mode === 'play' && !D.state.panel) updateDay(dt);
    if (D.state.mode === 'play') updateAutosave(dt);
    else saveNote = false;
    // Enter on the death screen
    if (D.state.mode === 'dead' && !$('death').hidden && D.input.pressed.has('Enter')) story.loadCheckpoint();
  };

  story.init = () => {
    lids(0);
  };

  D.story = story;
})();
