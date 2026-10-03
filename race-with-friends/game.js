(() => {
  'use strict';

  // ---------- Tuning ----------

  const VIEW_H = 420; // logical view height; canvas is scaled to fit
  const GROUND_Y = 330;
  const TRACK_LENGTH = 7000;
  const START_X = 120;

  const RUN_SPEED = 380;
  const BACK_SPEED = 160;
  const SLIDE_MIN_SPEED = 190;
  const ACCEL = 520;
  const BRAKE = 1100;
  const SLIDE_FRICTION = 160;
  const JUMP_VELOCITY = 620;
  const GRAVITY = 1800;

  const PLAYER_HALF_W = 13;
  const STAND_H = 60;
  const SLIDE_H = 28;

  const PENALTY_SECONDS = 2;
  const STUN_SECONDS = 0.6;

  // Hurdle shapes: `bottom`/`top` are heights above the ground.
  const HURDLE_TYPES = {
    low: { width: 16, bottom: 0, top: 44 }, // jump over
    crate: { width: 50, bottom: 0, top: 40 }, // jump over, needs better timing
    bar: { width: 30, bottom: 38, top: 400 }, // slide under
  };

  const CONTROLS = [
    { jump: 'KeyW', slide: 'KeyS', left: 'KeyA', right: 'KeyD' },
    { jump: 'ArrowUp', slide: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  ];
  const COLORS = ['#ff5a5f', '#3d8bfd'];

  // ---------- State ----------

  const $ = (id) => document.getElementById(id);

  let state = 'menu'; // menu | countdown | racing | done
  let hurdles = [];
  let raceTime = 0;
  let countdownLeft = 0;
  let lastFrame = 0;
  const keysDown = new Set();

  const players = [0, 1].map((i) => ({
    index: i,
    color: COLORS[i],
    controls: CONTROLS[i],
    canvas: $(`canvas${i + 1}`),
    ctx: $(`canvas${i + 1}`).getContext('2d'),
    el: {
      time: $(`time${i + 1}`),
      pen: $(`pen${i + 1}`),
      hits: $(`hits${i + 1}`),
      banner: $(`banner${i + 1}`),
      dot: $(`dot${i + 1}`),
    },
  }));

  function resetPlayer(p) {
    p.x = START_X;
    p.y = 0; // height of feet above ground
    p.vy = 0;
    p.speed = 0;
    p.sliding = false;
    p.stun = 0;
    p.hit = new Set(); // indices of hurdles this player has crashed into
    p.passed = new Set(); // hurdles already behind the player; no longer solid
    p.penalty = 0;
    p.finishTime = null;
    p.stride = 0;
    p.popup = 0;
    p.el.banner.hidden = true;
  }

  // ---------- Level ----------

  function generateHurdles() {
    const types = Object.keys(HURDLE_TYPES);
    const list = [];
    let x = 650;
    let lastType = null;
    let repeat = 0;
    while (x < TRACK_LENGTH - 450) {
      let type = types[Math.floor(Math.random() * types.length)];
      // avoid more than two of the same type in a row
      if (type === lastType && repeat >= 1) {
        type = types[(types.indexOf(type) + 1 + Math.floor(Math.random() * 2)) % types.length];
      }
      repeat = type === lastType ? repeat + 1 : 0;
      lastType = type;
      list.push({ x, type });
      x += 380 + Math.random() * 340;
    }
    return list;
  }

  // ---------- Flow ----------

  function startRace() {
    hurdles = generateHurdles();
    players.forEach(resetPlayer);
    raceTime = 0;
    countdownLeft = 3;
    state = 'countdown';
    $('menu').hidden = true;
    $('results').hidden = true;
    $('countdown').hidden = false;
    updateHud();
  }

  function finishRace() {
    state = 'done';
    const [a, b] = players;
    const finalA = a.finishTime + a.penalty;
    const finalB = b.finishTime + b.penalty;
    const fmt = (n) => `${n.toFixed(2)}s`;

    players.forEach((p, i) => {
      $(`rTime${i + 1}`).textContent = fmt(p.finishTime);
      $(`rHits${i + 1}`).textContent = p.hit.size;
      $(`rPen${i + 1}`).textContent = `+${fmt(p.penalty)}`;
      $(`rFinal${i + 1}`).textContent = fmt(p.finishTime + p.penalty);
    });

    const title = $('winnerText');
    if (Math.abs(finalA - finalB) < 0.005) {
      title.textContent = "It's a tie!";
      title.style.color = '';
    } else {
      const winner = finalA < finalB ? a : b;
      title.textContent = `Player ${winner.index + 1} wins!`;
      title.style.color = winner.color;
    }

    const first = a.finishTime <= b.finishTime ? a : b;
    const margin = Math.abs(finalA - finalB).toFixed(2);
    $('winnerSub').textContent =
      `Player ${first.index + 1} crossed the line first. Margin after penalties: ${margin}s.`;

    $('results').hidden = false;
  }

  // ---------- Simulation ----------

  function updatePlayer(p, dt) {
    if (p.finishTime !== null) return;

    const { jump, slide, left, right } = p.controls;
    const dir = (keysDown.has(right) ? 1 : 0) - (keysDown.has(left) ? 1 : 0);
    const grounded = p.y <= 0;
    p.popup = Math.max(0, p.popup - dt);

    if (p.stun > 0) {
      p.stun -= dt;
      p.speed = 0;
      p.sliding = false;
    } else {
      p.sliding = grounded && keysDown.has(slide);
      if (grounded && !p.sliding && keysDown.has(jump)) {
        p.vy = JUMP_VELOCITY;
      }

      if (p.sliding) {
        // a slide keeps momentum but bleeds speed; from a standstill you can only crawl
        const target = dir > 0 ? SLIDE_MIN_SPEED : 0;
        if (p.speed < target) p.speed = Math.min(target, p.speed + ACCEL * dt);
        else p.speed = Math.max(target, p.speed - (dir > 0 ? SLIDE_FRICTION : BRAKE) * dt);
      } else if (grounded) {
        const target = dir > 0 ? RUN_SPEED : dir < 0 ? -BACK_SPEED : 0;
        if (p.speed < target) p.speed = Math.min(target, p.speed + ACCEL * dt);
        else p.speed = Math.max(target, p.speed - BRAKE * dt);
      }
    }

    // vertical motion
    p.y += p.vy * dt;
    p.vy -= GRAVITY * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }

    p.x += p.speed * dt;
    if (p.x < START_X) {
      p.x = START_X;
      p.speed = Math.max(0, p.speed);
    }
    p.stride += p.speed * dt * 0.045;

    checkCollisions(p);

    if (p.x >= TRACK_LENGTH) {
      p.finishTime = raceTime;
      p.sliding = false;
      p.el.banner.textContent = 'Finished! Waiting for the other player…';
      p.el.banner.hidden = false;
    }
  }

  function checkCollisions(p) {
    const height = p.sliding ? SLIDE_H : STAND_H;
    const left = p.x - PLAYER_HALF_W;
    const right = p.x + PLAYER_HALF_W;

    for (let i = 0; i < hurdles.length; i++) {
      if (p.hit.has(i) || p.passed.has(i)) continue;
      const h = hurdles[i];
      const shape = HURDLE_TYPES[h.type];
      if (h.x > right) break; // hurdles are sorted by x
      if (h.x + shape.width < left) {
        p.passed.add(i);
        continue;
      }
      if (p.y < shape.top && p.y + height > shape.bottom) {
        p.hit.add(i);
        p.penalty += PENALTY_SECONDS;
        p.stun = STUN_SECONDS;
        p.speed = 0;
        p.vy = Math.min(p.vy, 0);
        p.popup = 1;
      }
    }
  }

  function update(dt) {
    if (state === 'countdown') {
      countdownLeft -= dt;
      const el = $('countdown');
      if (countdownLeft <= -0.6) {
        el.hidden = true;
      } else {
        el.textContent = countdownLeft > 0 ? Math.ceil(countdownLeft) : 'GO!';
      }
      if (countdownLeft <= 0 && state === 'countdown') state = 'racing';
    }

    if (state === 'racing') {
      // keep the "GO!" on screen briefly after the race starts
      if (!$('countdown').hidden) {
        countdownLeft -= dt;
        if (countdownLeft <= -0.6) $('countdown').hidden = true;
      }
      raceTime += dt;
      players.forEach((p) => updatePlayer(p, dt));
      updateHud();
      if (players.every((p) => p.finishTime !== null)) finishRace();
    }
  }

  function updateHud() {
    for (const p of players) {
      const t = p.finishTime !== null ? p.finishTime : raceTime;
      p.el.time.textContent = t.toFixed(2);
      p.el.pen.textContent = `+${p.penalty}`;
      p.el.hits.textContent = p.hit.size;
      const progress = Math.min(1, (p.x - START_X) / (TRACK_LENGTH - START_X));
      p.el.dot.style.left = `${progress * 100}%`;
    }
  }

  // ---------- Rendering ----------

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const p of players) {
      const rect = p.canvas.getBoundingClientRect();
      p.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      p.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }
  }

  function render(p) {
    const { ctx, canvas } = p;
    const scale = canvas.height / VIEW_H;
    const viewW = canvas.width / scale;
    const cam = p.x - viewW * 0.28;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#7cc6fe');
    sky.addColorStop(1, '#dff3ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, GROUND_Y);

    drawHills(ctx, cam * 0.2, viewW, 150, 70, '#b5dbc0');
    drawHills(ctx, cam * 0.45, viewW, 110, 45, '#8fc7a1');

    // track
    ctx.fillStyle = '#c8553d';
    ctx.fillRect(0, GROUND_Y, viewW, VIEW_H - GROUND_Y);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, GROUND_Y, viewW, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const dash = 80;
    for (let x = -((cam % dash) + dash) % dash; x < viewW; x += dash) {
      ctx.fillRect(x, GROUND_Y + 44, 40, 4);
    }

    drawLine(ctx, START_X - cam, '#fff');
    drawFinish(ctx, TRACK_LENGTH - cam);

    for (let i = 0; i < hurdles.length; i++) {
      const h = hurdles[i];
      const sx = h.x - cam;
      if (sx < -80 || sx > viewW + 20) continue;
      drawHurdle(ctx, sx, h.type, p.hit.has(i));
    }

    drawRunner(ctx, p, p.x - cam);

    if (p.popup > 0) {
      ctx.globalAlpha = p.popup;
      ctx.fillStyle = '#d92d20';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+${PENALTY_SECONDS}s`, p.x - cam, GROUND_Y - 90 - (1 - p.popup) * 40);
      ctx.globalAlpha = 1;
    }
  }

  function drawHills(ctx, offset, viewW, base, amp, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= viewW + 20; x += 20) {
      const wx = x + offset;
      const y = GROUND_Y - base - Math.sin(wx * 0.006) * amp * 0.6 - Math.sin(wx * 0.0023 + 1) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(viewW + 20, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawLine(ctx, sx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(sx - 3, GROUND_Y, 6, VIEW_H - GROUND_Y);
  }

  function drawFinish(ctx, sx) {
    const size = 10;
    for (let row = 0; row * size < VIEW_H - GROUND_Y; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#fff' : '#111';
        ctx.fillRect(sx + col * size, GROUND_Y + row * size, size, size);
      }
    }
    // banner posts
    ctx.fillStyle = '#444';
    ctx.fillRect(sx - 2, GROUND_Y - 150, 4, 150);
    ctx.fillStyle = '#111';
    ctx.fillRect(sx + 2, GROUND_Y - 150, 70, 26);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', sx + 37, GROUND_Y - 132);
  }

  function drawHurdle(ctx, sx, type, wasHit) {
    const shape = HURDLE_TYPES[type];
    ctx.save();
    ctx.globalAlpha = wasHit ? 0.4 : 1;

    if (type === 'low') {
      if (wasHit) {
        // knocked flat
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx, GROUND_Y - 8, shape.top, 8);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillRect(sx + 2, GROUND_Y - shape.top, 3, shape.top);
        ctx.fillRect(sx + shape.width - 5, GROUND_Y - shape.top, 3, shape.top);
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx - 2, GROUND_Y - shape.top, shape.width + 4, 10);
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 4, GROUND_Y - shape.top, 4, 10);
        ctx.fillRect(sx + 12, GROUND_Y - shape.top, 4, 10);
      }
    } else if (type === 'crate') {
      ctx.fillStyle = '#b07a3b';
      ctx.fillRect(sx, GROUND_Y - shape.top, shape.width, shape.top);
      ctx.strokeStyle = '#6e4a1f';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 1.5, GROUND_Y - shape.top + 1.5, shape.width - 3, shape.top - 3);
      ctx.beginPath();
      ctx.moveTo(sx + 3, GROUND_Y - shape.top + 3);
      ctx.lineTo(sx + shape.width - 3, GROUND_Y - 3);
      ctx.moveTo(sx + shape.width - 3, GROUND_Y - shape.top + 3);
      ctx.lineTo(sx + 3, GROUND_Y - 3);
      ctx.stroke();
    } else {
      // hanging bar: striped beam at head height, held from above
      const barTop = GROUND_Y - shape.bottom - 24;
      ctx.fillStyle = '#666';
      ctx.fillRect(sx + 5, 0, 4, barTop);
      ctx.fillRect(sx + shape.width - 9, 0, 4, barTop);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(sx - 4, barTop, shape.width + 8, 24);
      ctx.fillStyle = '#111';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const bx = sx - 4 + i * 10;
        ctx.moveTo(bx, barTop + 24);
        ctx.lineTo(bx + 8, barTop);
        ctx.lineTo(bx + 13, barTop);
        ctx.lineTo(bx + 5, barTop + 24);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRunner(ctx, p, sx) {
    const feetY = GROUND_Y - p.y;
    const stunned = p.stun > 0;
    if (stunned && Math.floor(p.stun * 20) % 2) return; // blink while stunned

    ctx.save();
    ctx.translate(sx, feetY);
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (p.sliding) {
      // lying back, feet first
      ctx.beginPath();
      ctx.moveTo(-18, -14);
      ctx.lineTo(4, -8);
      ctx.lineTo(22, -5);
      ctx.moveTo(4, -8);
      ctx.lineTo(16, -16);
      ctx.moveTo(-10, -12);
      ctx.lineTo(-20, -4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-22, -19, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const airborne = p.y > 0;
      const swing = airborne ? 0.9 : Math.sin(p.stride) * (Math.abs(p.speed) > 10 ? 0.8 : 0);
      const hipY = -28;
      const shoulderY = -48;
      const legLen = 28;
      const armLen = 18;

      ctx.beginPath();
      // legs
      ctx.moveTo(0, hipY);
      ctx.lineTo(Math.sin(swing) * legLen, hipY + Math.cos(swing) * legLen * (airborne ? 0.7 : 1));
      ctx.moveTo(0, hipY);
      ctx.lineTo(Math.sin(-swing) * legLen, hipY + Math.cos(swing) * legLen * (airborne ? 0.7 : 1));
      // torso
      ctx.moveTo(0, hipY);
      ctx.lineTo(3, shoulderY);
      // arms
      ctx.moveTo(3, shoulderY);
      ctx.lineTo(3 + Math.sin(-swing) * armLen, shoulderY + Math.cos(swing) * armLen * (airborne ? -0.6 : 1));
      ctx.moveTo(3, shoulderY);
      ctx.lineTo(3 + Math.sin(swing) * armLen, shoulderY + Math.cos(swing) * armLen * (airborne ? -0.6 : 1));
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(5, -56, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Loop & input ----------

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    update(dt);
    players.forEach(render);
    requestAnimationFrame(frame);
  }

  const GAME_KEYS = new Set(CONTROLS.flatMap((c) => Object.values(c)));

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code) || e.code === 'Space') e.preventDefault();
    keysDown.add(e.code);
    if (e.code === 'Enter' && (state === 'menu' || state === 'done')) startRace();
  });
  window.addEventListener('keyup', (e) => keysDown.delete(e.code));
  window.addEventListener('blur', () => keysDown.clear());
  window.addEventListener('resize', resize);

  $('startBtn').addEventListener('click', startRace);
  $('againBtn').addEventListener('click', startRace);

  hurdles = generateHurdles();
  players.forEach(resetPlayer);
  resize();
  requestAnimationFrame((now) => {
    lastFrame = now;
    frame(now);
  });
})();
