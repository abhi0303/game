// The New Dawn: building the world, the frame loop, and the keyboard and mouse.
(() => {
  'use strict';
  const D = window.Dawn;
  const { $ } = D;

  // ---------- Input ----------

  // Keys held (by KeyboardEvent.code), keys pressed this frame, mouse movement this frame.
  const input = {
    held: new Set(), pressed: new Set(), released: new Set(),
    dx: 0, dy: 0, buttons: 0, clicked: new Set(), unclicked: new Set(), locked: false,
  };
  D.input = input;
  const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    const field = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
    // Escape is dealt with here, at once and once per press (never by a later frame, where it
    // could meet the browser letting go of the mouse and undo what that just did), even from a
    // slider or a list in the settings
    if (e.code === 'Escape') {
      if (field) e.target.blur();
      if (!e.repeat && D.ui) D.ui.escape();
      return;
    }
    if (field) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!input.held.has(e.code)) input.pressed.add(e.code);
    input.held.add(e.code);
    D.audio && D.audio.unlock();
  });
  window.addEventListener('keyup', (e) => {
    input.held.delete(e.code);
    input.released.add(e.code);
  });
  window.addEventListener('blur', () => {
    input.held.clear();
    input.buttons = 0;
  });
  const canvas = $('scene');
  // (the browser may refuse the pointer outside a click; that is fine, the next click asks again)
  const askLock = () => {
    try {
      const p = canvas.requestPointerLock && canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (error) {
      // not now
    }
  };
  canvas.addEventListener('mousedown', (e) => {
    D.audio && D.audio.unlock();
    if (D.state.mode === 'play' && !input.locked && !D.state.panel) {
      askLock();
      return;
    }
    input.buttons |= 1 << e.button;
    input.clicked.add(e.button);
  });
  window.addEventListener('mouseup', (e) => {
    input.buttons &= ~(1 << e.button);
    input.unclicked.add(e.button);
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  // The mouse turns the view only while playing with nothing open over the game. Just after the
  // browser takes the mouse back (closing the map or another panel, or a click), its first moves
  // can carry a jump, where the free cursor wandered off to (Chrome on the Mac above all): those
  // are dropped, so the view is just as it was before the panel opened.
  let lockedAt = -1e9;
  input.clearLook = () => {
    input.dx = 0;
    input.dy = 0;
  };
  window.addEventListener('mousemove', (e) => {
    if (!input.locked || D.state.panel || D.state.mode !== 'play') return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    const since = performance.now() - lockedAt;
    if (since < 150) return;
    if (since < 800 && (Math.abs(dx) > 120 || Math.abs(dy) > 120)) return;
    input.dx += dx;
    input.dy += dy;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (input.locked) lockedAt = performance.now();
    input.clearLook();
    // the mouse let go while playing (Escape, or another window): pause; but not just after
    // Escape closed a panel (a second press, or the key repeating, would only bring one back)
    if (!input.locked && D.state.mode === 'play' && !D.state.panel && D.ui && performance.now() - D.ui.escClosedAt > 700) D.ui.openPause();
  });
  D.lockPointer = () => {
    if (!input.locked) askLock();
  };
  // Under memory pressure (many tabs, other programs) the browser can take the graphics
  // context away and give it back. three.js rebuilds what it can; what was drawn into
  // textures (the distant plants' pictures, the light from the sky) is drawn again here.
  canvas.addEventListener('webglcontextlost', () => {
    D.contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    D.contextLost = false;
    setTimeout(() => {
      if (D.flora && D.flora.repaint) D.flora.repaint();
      D.forceSkyCapture();
    }, 0);
  });
  D.unlockPointer = () => {
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const endInputFrame = () => {
    input.pressed.clear();
    input.released.clear();
    input.clicked.clear();
    input.unclicked.clear();
    input.dx = 0;
    input.dy = 0;
  };

  // ---------- State ----------

  // mode: 'loading', 'title', 'cinematic', 'play', 'dead', 'complete'. `panel` is the open
  // overlay while playing (kit, map, pause), which stops the clock.
  D.state = { mode: 'loading', panel: null, time: 0, playTime: 0 };

  // ---------- Building the world ----------

  const loadFill = $('load-fill');
  const loadText = $('load-text');
  const setLoad = (fraction, text) => {
    loadFill.style.width = `${45 + fraction * 55}%`;
    if (text) loadText.textContent = `${text}…`;
  };
  const nextFrame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));

  async function init() {
    setLoad(0, 'Raising the land');
    await nextFrame();
    D.terrain.build();
    setLoad(0.12, 'Carving the cave');
    await nextFrame();
    if (D.cave) D.cave.build();
    setLoad(0.2, 'Waking the jungle');
    await nextFrame();
    if (D.models) await D.models.load((f) => setLoad(0.2 + f * 0.4, 'Waking the jungle'));
    setLoad(0.6, 'Growing the jungle');
    await nextFrame();
    if (D.flora) D.flora.build();
    setLoad(0.72, 'Placing the people of stone');
    await nextFrame();
    if (D.statues) D.statues.build();
    setLoad(0.82, 'Finding the survivor');
    await nextFrame();
    if (D.hero) D.hero.build();
    if (D.items) D.items.build();
    if (D.combat) D.combat.build();
    if (D.shelter) D.shelter.build();
    if (D.lab) D.lab.build();
    if (D.east) D.east.build();
    setLoad(0.9, 'Settling the light');
    await nextFrame();
    if (D.ui) D.ui.init();
    if (D.story) D.story.init();
    // wait for the photos to be decoded, then draw once so the shaders are compiled now
    await Promise.all(D.madeTextures.map((t) => t.ready).filter(Boolean));
    if (D.params.has('hour')) D.env.hour = parseFloat(D.params.get('hour'));
    D.updateEnvironment(0, 0);
    D.renderer.compile(D.scene, D.camera);
    setLoad(0.96, 'Drawing the field notes');
    await nextFrame();
    if (D.book) D.book.prepare();
    setLoad(1, 'Ready');
    D.ready = true;
    if (D.story && !D.params.has('cam')) D.story.showTitle();
    else {
      D.state.mode = 'dev';
      $('title').hidden = true;
      $('fade').style.opacity = 0;
    }
    if (D.params.has('cam')) {
      // heights are above the ground under each point
      const [x, y, z, tx, ty, tz] = D.params.get('cam').split(',').map(Number);
      D.devCam = { x, y: y + D.terrain.height(x, z), z, tx, ty: ty + D.terrain.height(tx, tz), tz };
    }
    requestAnimationFrame(loop);
  }

  // ---------- The frame ----------

  // Frames are drawn no faster than the limit (60 by default: on a 120 Hz screen the browser
  // would otherwise ask for every picture twice as often, for nothing you can see), and slowly
  // while nothing much moves: 30 a second on the title and end screens, a few behind a menu.
  let last = performance.now();
  let time = 0;
  const frameLimit = () => {
    const mode = D.state.mode;
    if (D.state.panel) return 12;
    if (mode === 'title' || mode === 'dead' || mode === 'complete' || mode === 'loading') return 30;
    return D.settings.fps || 0;
  };
  const perf = D.params.has('perf') ? document.createElement('div') : null;
  if (perf) {
    perf.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#cfe;font:12px/1.4 monospace;pointer-events:none';
    document.body.appendChild(perf);
  }
  let perfFrames = 0;
  let perfAt = performance.now();
  // How often the screen refreshes (the median gap between the browser's frames), so the
  // limit only skips frames on screens faster than it: on a 60 Hz screen at the 60 limit,
  // nothing is ever skipped, whatever the browser's timing wobble.
  const gaps = [];
  let screenMs = 1000 / 60;
  let lastTick = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (lastTick) {
      gaps.push(now - lastTick);
      if (gaps.length > 60) gaps.shift();
      if (gaps.length >= 20) screenMs = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
    }
    lastTick = now;
    const limit = D.fixedStep ? 0 : frameLimit();
    const limitMs = limit ? 1000 / limit : 0;
    // (a third of a screen refresh of slack, so a frame a touch early is not skipped)
    if (limitMs > screenMs * 1.2 && now - last < limitMs - screenMs / 3) return;
    const rawDt = (now - last) / 1000;
    let dt = Math.min(0.05, rawDt);
    last = now;
    if (D.fixedStep) dt = D.fixedStep;
    // any change of resolution comes before the frame is drawn, never just after it (that
    // leaves the picture blank until the next one: a flicker)
    if (!D.fixedStep) D.adaptResolution(rawDt, now / 1000);
    const state = D.state;
    const paused = !!state.panel || state.mode === 'loading';
    if (!paused) time += dt;
    state.time = time;
    const step = paused ? 0 : dt;

    if (D.devCam) {
      const c = D.devCam;
      D.camera.position.set(c.x, c.y, c.z);
      D.camera.lookAt(c.tx, c.ty, c.tz);
    } else if (D.story) {
      D.story.update(step, time);
    }
    if (state.mode === 'play' && !paused) state.playTime += dt;
    if (D.hero && !D.devCam) D.hero.update(step, time);
    if (D.combat) D.combat.update(step, time);
    if (D.items) D.items.update(step, time);
    if (D.camp) D.camp.update(step, time);
    if (D.shelter) D.shelter.update(step, time);
    if (D.lab) D.lab.update(step, time);
    if (D.east) D.east.update(step, time);
    if (D.statues) D.statues.update(step, time);
    if (D.cave) D.cave.update(step, time);
    if (D.hero && !D.devCam) D.hero.updateCamera(step, time);
    for (const fn of D.frameHooks) fn(step, time);
    if (D.flora) D.flora.update(step);
    D.updateEnvironment(step, time);
    D.updateShadow(D.hero && D.hero.focus ? D.hero.focus() : D.camera.position);
    D.render();
    if (D.ui) D.ui.update(dt, time);
    if (D.audio) D.audio.update(step, time);
    endInputFrame();
    if (perf) {
      perfFrames++;
      if (now - perfAt > 500) {
        const info = D.renderer.info.render;
        perf.textContent = `${Math.round((perfFrames * 1000) / (now - perfAt))} fps \u00b7 GPU ${D.gpuMs ? D.gpuMs.toFixed(1) : '?'} ms \u00b7 ${D.pixelRatio.toFixed(2)}x \u00b7 ${info.calls} calls \u00b7 ${Math.round(info.triangles / 1000)}k tris`;
        perfFrames = 0;
        perfAt = now;
      }
    }
  }

  init().catch((error) => {
    console.error(String((error && error.stack) || error));
    loadText.textContent = `Something went wrong: ${error.message}`;
  });
})();
