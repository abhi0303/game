// The New Dawn: every sound, made as it plays from noise and plain tones (WebAudio): the wind,
// the river, birds and insects by day, crickets by night, the echo of the cave, footsteps on
// each kind of ground, the bow, the tiger, the stone cracking, and a slow ambient score.
(() => {
  'use strict';
  const D = window.Dawn;
  const { clamp, smoothstep, rand } = D;

  const audio = { ctx: null, ready: false };
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let ambience = null;
  let reverb = null;
  let reverbSend = null;
  let noise = null;

  // The browser lets sound start only after a key or a click.
  audio.unlock = () => {
    if (audio.ready) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    audio.ctx = ctx;
    master = ctx.createGain();
    master.gain.value = D.settings.volume;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = D.settings.music * 0.5;
    music.connect(master);
    ambience = ctx.createGain();
    ambience.gain.value = 0.9;
    ambience.connect(master);
    // a long reverb, for the cave and for the score
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8;
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    reverb.buffer = impulse;
    reverb.connect(master);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.15;
    reverbSend.connect(reverb);
    sfx.connect(reverbSend);
    // noise, for everything that hisses, rustles, crunches and roars
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    startBeds();
    audio.ready = true;
  };

  audio.setVolume = () => {
    if (!ctx) return;
    master.gain.setTargetAtTime(D.settings.volume, ctx.currentTime, 0.1);
    music.gain.setTargetAtTime(D.settings.music * 0.5, ctx.currentTime, 0.3);
  };

  // ---------- Building blocks ----------

  // A burst of filtered noise.
  function burst(type, freq, volume, length, delay = 0, q = 1, dest = sfx, pan = 0) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + Math.min(0.02, length * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      out = p;
    }
    src.connect(f).connect(g);
    out.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + length + 0.05);
  }

  // A tone gliding from one pitch to another.
  function tone(from, to, length, volume, type = 'sine', delay = 0, dest = sfx, attack = 0.02) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  // A looping noise bed through a filter, its gain set each frame.
  function bed(type, freq, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(ambience);
    src.start();
    return { gain: g, filter: f };
  }

  const beds = {};
  function startBeds() {
    beds.wind = bed('lowpass', 420, 0.5);
    beds.windHigh = bed('bandpass', 1400, 0.6);
    beds.water = bed('bandpass', 900, 0.5);
    beds.waterLow = bed('lowpass', 320, 0.7);
    beds.cave = bed('lowpass', 140, 0.6);
    beds.insects = bed('bandpass', 5200, 8);
  }

  // ---------- One-off sounds ----------

  const STEP = {
    grass: ['bandpass', 2400, 0.05, 0.09, 1.2],
    leaves: ['highpass', 2600, 0.07, 0.11, 0.9],
    dirt: ['bandpass', 900, 0.08, 0.07, 1.4],
    mud: ['lowpass', 500, 0.1, 0.1, 1.6],
    rock: ['bandpass', 1700, 0.07, 0.05, 3],
    water: ['bandpass', 1100, 0.1, 0.16, 0.8],
  };
  audio.step = (kind, loud = 0.6) => {
    const s = STEP[kind] || STEP.dirt;
    burst(s[0], s[1] * rand(0.85, 1.15), s[2] * loud * 1.6, s[3], 0, s[4]);
    if (kind === 'water') burst('lowpass', 400, 0.08 * loud, 0.2, 0.03);
  };
  audio.jump = () => burst('bandpass', 700, 0.05, 0.08);
  audio.land = (speed) => burst('lowpass', 220, Math.min(0.5, 0.08 + speed * 0.02), 0.2);
  audio.pickup = () => {
    burst('bandpass', 1400, 0.08, 0.07);
    tone(520, 780, 0.12, 0.025, 'sine', 0.03);
  };
  audio.rustle = () => {
    for (let n = 0; n < 5; n++) burst('highpass', 2800 + Math.random() * 1500, 0.05, 0.12, n * 0.06);
  };
  audio.chop = () => {
    burst('lowpass', 500, 0.3, 0.1);
    burst('bandpass', 2000, 0.12, 0.05, 0, 2);
  };
  audio.knap = () => {
    burst('bandpass', 3200, 0.16, 0.04, 0, 6);
    tone(2600, 1900, 0.06, 0.03, 'triangle');
  };
  audio.knock = () => burst('bandpass', 600, 0.22, 0.08, 0, 3);
  audio.craft = () => {
    tone(392, 392, 0.4, 0.04, 'sine');
    tone(587, 587, 0.5, 0.035, 'sine', 0.1);
  };
  audio.eat = () => {
    for (let n = 0; n < 3; n++) burst('bandpass', 1500 + Math.random() * 600, 0.06, 0.05, n * 0.12);
  };
  audio.drink = () => {
    for (let n = 0; n < 3; n++) tone(300 + Math.random() * 100, 520, 0.12, 0.05, 'sine', n * 0.25);
    burst('bandpass', 1000, 0.05, 0.2);
  };
  audio.hurt = (amount) => {
    burst('lowpass', 300, Math.min(0.5, 0.1 + amount * 0.012), 0.25);
    tone(180, 120, 0.25, Math.min(0.1, amount * 0.003), 'sawtooth');
  };
  audio.maul = () => {
    burst('bandpass', 1200, 0.35, 0.18, 0, 1.5);
    burst('lowpass', 250, 0.45, 0.3, 0.05);
  };
  audio.roar = (species, dist, volume = 1) => {
    if (!ctx) return;
    const near = Math.max(0.04, 1 - dist / 220) * volume;
    if (species === 'tiger') {
      // a rasping growl that swells and falls, with a deep chest under it
      tone(110, 72, 1.6, 0.16 * near, 'sawtooth', 0, sfx, 0.25);
      tone(165, 96, 1.4, 0.07 * near, 'square', 0.05, sfx, 0.3);
      burst('bandpass', 420, 0.5 * near, 1.6, 0, 1.4);
      burst('lowpass', 180, 0.45 * near, 1.5, 0.05);
    } else {
      tone(78, 52, 1.9, 0.2 * near, 'sawtooth', 0, sfx, 0.3);
      burst('lowpass', 260, 0.55 * near, 1.9, 0, 1.2);
    }
  };
  audio.bowDraw = () => {
    tone(140, 210, 0.8, 0.025, 'sawtooth');
    burst('bandpass', 500, 0.03, 0.8, 0, 4);
  };
  audio.bowRelease = (power) => {
    tone(230, 140, 0.25, 0.08 + 0.08 * power, 'triangle');
    burst('highpass', 3000, 0.07 * power, 0.25);
    burst('bandpass', 900, 0.05, 0.35, 0.02, 1);
  };
  audio.arrowHit = (flesh) => {
    if (flesh) burst('lowpass', 400, 0.3, 0.12);
    else {
      burst('bandpass', 800, 0.2, 0.06, 0, 2);
      tone(420, 260, 0.08, 0.04, 'triangle');
    }
  };
  audio.drip = (dist) => {
    const v = Math.max(0, 1 - dist / 30);
    if (v <= 0) return;
    tone(1500 + Math.random() * 600, 700, 0.09, 0.08 * v, 'sine');
  };
  audio.heartbeat = (volume = 0.4) => {
    tone(62, 48, 0.18, volume * 0.5, 'sine');
    tone(58, 44, 0.16, volume * 0.35, 'sine', 0.24);
  };
  audio.breath = (volume = 0.3) => {
    burst('bandpass', 700, volume * 0.25, 0.9, 0, 0.6);
    burst('bandpass', 500, volume * 0.18, 1.1, 1.0, 0.5);
  };
  // the stone giving way: crackling, then the shell bursting
  audio.crack = (amount = 0.5) => {
    for (let n = 0; n < 3 + amount * 6; n++) burst('bandpass', 2000 + Math.random() * 3000, 0.04 + amount * 0.08, 0.04, n * rand(0.03, 0.09), 4);
  };
  audio.shatter = () => {
    burst('lowpass', 200, 0.7, 1.2);
    for (let n = 0; n < 24; n++) burst('bandpass', 1200 + Math.random() * 4000, 0.15, 0.06 + Math.random() * 0.1, n * 0.025 + Math.random() * 0.05, 3);
    burst('highpass', 2500, 0.2, 1.4, 0.1);
  };
  audio.bats = (amount = 1) => {
    for (let n = 0; n < 30 * amount; n++) {
      tone(6000 + Math.random() * 3000, 4000 + Math.random() * 2000, 0.05, 0.012, 'sine', Math.random() * 3);
      burst('highpass', 3500, 0.025, 0.05, Math.random() * 3);
    }
  };
  audio.chime = () => {
    tone(523, 523, 0.9, 0.045, 'sine', 0, sfx, 0.01);
    tone(784, 784, 1.1, 0.04, 'sine', 0.12, sfx, 0.01);
    tone(1046, 1046, 1.4, 0.03, 'sine', 0.24, sfx, 0.01);
  };
  audio.thud = () => burst('lowpass', 140, 0.5, 0.5);
  audio.thunder = () => {
    burst('lowpass', 120, 0.6, 3.5, 0, 0.8);
    burst('lowpass', 300, 0.25, 1.2, 0.1);
  };

  // ---------- Birds, insects, crickets ----------

  let nextBird = 2;
  let nextCricket = 0;
  let nextCaveDrip = 3;
  function birds(dt, x, z) {
    nextBird -= dt;
    if (nextBird > 0) return;
    const jungle = D.terrain.jungleAmount(x, z);
    nextBird = rand(1.5, 5) * (1.3 - jungle * 0.6);
    const kind = Math.floor(Math.random() * 4);
    const base = rand(1800, 3600);
    const v = rand(0.008, 0.02);
    if (kind === 0) {
      // a run of quick chirps
      for (let n = 0; n < 4 + Math.floor(Math.random() * 4); n++) tone(base, base * 1.3, 0.06, v, 'sine', n * 0.09);
    } else if (kind === 1) {
      // a falling whistle
      tone(base * 1.2, base * 0.6, 0.4, v, 'sine');
      tone(base * 1.1, base * 0.7, 0.35, v * 0.7, 'sine', 0.5);
    } else if (kind === 2) {
      // a two-note call
      tone(base, base, 0.18, v, 'triangle');
      tone(base * 0.75, base * 0.75, 0.25, v, 'triangle', 0.22);
    } else {
      // a trill
      for (let n = 0; n < 10; n++) tone(base * (n % 2 ? 1.1 : 1), base, 0.03, v * 0.7, 'sine', n * 0.035);
    }
  }
  function crickets(dt) {
    nextCricket -= dt;
    if (nextCricket > 0) return;
    nextCricket = rand(0.25, 0.9);
    const f = rand(4200, 4800);
    for (let n = 0; n < 3; n++) tone(f, f, 0.03, 0.006, 'sine', n * 0.05);
  }

  // ---------- The score ----------

  // Slow chords drifting over a drone, quiet; a little brighter when something is done.
  const CHORDS = [
    [57, 64, 69, 72], [53, 60, 65, 69], [55, 62, 67, 71], [52, 59, 64, 67],
  ];
  let chordAt = 0;
  let chordIndex = 0;
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  function score(time) {
    if (!ctx || D.settings.music <= 0) return;
    if (time < chordAt) return;
    chordAt = time + 9;
    const chord = CHORDS[chordIndex++ % CHORDS.length];
    const t0 = ctx.currentTime;
    chord.forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = midi(n - 12);
      osc.detune.value = rand(-6, 6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.018, t0 + 3.5);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 11);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      osc.connect(f).connect(g);
      g.connect(music);
      g.connect(reverb);
      osc.start(t0 + i * 0.4);
      osc.stop(t0 + 12);
    });
    // now and then a few notes of melody
    if (Math.random() < 0.45) {
      const notes = [chord[2] + 12, chord[3] + 12, chord[1] + 12, chord[2] + 12];
      notes.slice(0, 2 + Math.floor(Math.random() * 3)).forEach((n, i) => tone(midi(n), midi(n), 2.2, 0.012, 'sine', 2 + i * 1.1, music, 0.3));
    }
  }
  audio.sting = (kind = 'done') => {
    if (!ctx) return;
    const notes = kind === 'danger' ? [45, 46, 45] : kind === 'dawn' ? [57, 64, 69, 73, 76] : [64, 69, 73];
    notes.forEach((n, i) => tone(midi(n), midi(n), kind === 'danger' ? 1.4 : 2.4, kind === 'danger' ? 0.05 : 0.03, kind === 'danger' ? 'sawtooth' : 'sine', i * (kind === 'dawn' ? 0.45 : 0.18), music, 0.05));
  };

  // ---------- Each frame ----------

  // ---------- Chapter 2: fire, clay, the galleries ----------

  let fireLvl = 0;
  let nextPop = 0;
  // how near a fire you are (0..1): its crackle, in audio.update
  audio.fireLevel = (v) => {
    fireLvl = clamp(v, 0, 1);
  };
  audio.flare = () => {
    burst('lowpass', 700, 0.22, 0.7);
    burst('highpass', 2600, 0.06, 0.5, 0.05);
  };
  audio.saw = (heat) => burst('bandpass', 700 + heat * 7, 0.06 + heat * 0.0007, 0.14, 0, 4);
  audio.dig = () => {
    burst('lowpass', 300, 0.26, 0.16);
    burst('bandpass', 850, 0.07, 0.1, 0.05, 2);
  };
  audio.scrape = () => burst('highpass', 3400, 0.07, 0.22, 0, 1.4);
  // Chapter 3
  audio.swish = () => burst('bandpass', 1600, 0.12, 0.18, 0, 1.2);
  audio.howl = (dist = 60, delay = 0) => {
    if (!ctx) return;
    const near = Math.max(0.05, 1 - dist / 260);
    // a long rising and falling call, a little hoarse
    tone(330, 560, 0.9, 0.05 * near, 'triangle', delay, sfx, 0.4);
    tone(560, 380, 1.6, 0.05 * near, 'triangle', delay + 0.9, sfx, 0.1);
    burst('bandpass', 700, 0.04 * near, 2.2, delay, 6);
  };
  audio.growl = (dist = 10) => {
    if (!ctx) return;
    const near = Math.max(0.05, 1 - dist / 60);
    tone(120, 90, 0.7, 0.09 * near, 'sawtooth', 0, sfx, 0.15);
    burst('lowpass', 300, 0.25 * near, 0.7, 0, 2);
  };
  audio.yelp = () => tone(900, 520, 0.25, 0.06, 'triangle');
  audio.creak = () => {
    tone(180, 140, 0.35, 0.03, 'square');
    burst('bandpass', 400, 0.05, 0.3, 0, 5);
  };
  audio.rumble = () => {
    burst('lowpass', 120, 0.6, 2.2, 0, 1);
    tone(60, 35, 2, 0.12, 'sawtooth', 0, sfx, 0.3);
  };
  audio.pour = () => {
    for (let n = 0; n < 6; n++) burst('bandpass', 700 + Math.random() * 900, 0.045, 0.18, n * 0.09, 3);
  };

  audio.update = (dt, time) => {
    if (!audio.ready) return;
    const now = ctx.currentTime;
    const cam = D.camera.position;
    const T = D.terrain;
    const playing = D.state.mode === 'play' || D.state.mode === 'cinematic' || D.state.mode === 'title';
    const inCave = D.caveDarkness ? D.caveDarkness(cam) : 0;
    const day = D.env.day;
    const jungle = T.jungleAmount(cam.x, cam.z);
    const height = cam.y - T.height(cam.x, cam.z);
    // wind: stronger up high and in the open, muffled in the cave
    const open = (1 - jungle * 0.6) * (1 - inCave);
    beds.wind.gain.gain.setTargetAtTime(playing ? (0.05 + 0.05 * open + 0.03 * smoothstep(5, 40, height)) * (0.8 + 0.2 * Math.sin(time * 0.3)) : 0, now, 0.5);
    beds.windHigh.gain.gain.setTargetAtTime(playing ? 0.012 * open * (0.5 + 0.5 * Math.sin(time * 0.23 + 1)) : 0, now, 0.5);
    // water: the river, the stream and the pond
    const river = Math.abs(cam.x - T.riverX(cam.z)) - T.riverHalf(cam.z);
    const stream = T.streamNear(cam.x, cam.z).d;
    const pond = Math.hypot(cam.x - D.LAYOUT.pond.x, cam.z - D.LAYOUT.pond.z) - D.LAYOUT.pond.r;
    const waterNear = Math.max(smoothstep(90, 5, river) * 1.0, smoothstep(30, 2, stream) * 0.45, smoothstep(14, 1, pond) * 0.15);
    beds.water.gain.gain.setTargetAtTime(playing ? waterNear * 0.12 : 0, now, 0.4);
    beds.waterLow.gain.gain.setTargetAtTime(playing ? smoothstep(90, 5, river) * 0.14 : 0, now, 0.4);
    // the cave's hush and echo
    beds.cave.gain.gain.setTargetAtTime(playing ? inCave * 0.12 : 0, now, 0.4);
    reverbSend.gain.setTargetAtTime(0.08 + inCave * 0.7, now, 0.3);
    // insects: cicadas in the jungle by day, crickets at night
    beds.insects.gain.gain.setTargetAtTime(playing ? (0.006 * day * jungle * (0.6 + 0.4 * Math.sin(time * 0.7)) + 0.0) * (1 - inCave) : 0, now, 0.5);
    if (playing && dt > 0) {
      if (day > 0.4 && inCave < 0.3 && !D.silence) birds(dt, cam.x, cam.z);
      if (D.env.night > 0.5 && inCave < 0.3) crickets(dt);
      if (inCave > 0.3) {
        nextCaveDrip -= dt;
        if (nextCaveDrip <= 0) {
          nextCaveDrip = rand(0.6, 2.4);
          tone(rand(900, 2200), 600, 0.08, 0.02 * inCave, 'sine');
        }
      }
      score(time);
      // a fire nearby: it crackles and pops
      if (fireLvl > 0.02) {
        nextPop -= dt;
        if (nextPop <= 0) {
          nextPop = rand(0.04, 0.3) / (0.4 + fireLvl);
          burst('highpass', rand(1800, 5200), 0.035 * fireLvl, rand(0.02, 0.06), 0, 1.2);
          if (Math.random() < 0.25) burst('lowpass', 260, 0.05 * fireLvl, 0.2);
        }
      }
    }
  };

  D.audio = audio;
})();
