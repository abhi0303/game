// The New Dawn: the field notes (B). A picture book of what he knows: each page a thing to
// understand (flint, the bow, the tiger, the shelter...), with a picture of it from the game
// itself, a drawing of how it works, him explaining it out loud, the real science behind it,
// and exactly what to do in the game. Pages open up as the story reaches them; the one for
// what you are doing now is where the book falls open.
(() => {
  'use strict';
  const D = window.Dawn;
  const { $ } = D;

  const ORDER = ['title', 'exit', 'explore', 'sustain', 'plan', 'weapon', 'hunt', 'shelter', 'dusk', 'night', 'dawn',
    'c2wake', 'c2fire', 'c2clay', 'c2torch', 'c2cave', 'c2salt', 'c2fluid', 'c2revive', 'c2escort', 'c2night', 'c2dawn', 'c2end',
    'c3talk', 'c3bear', 'c3dose', 'c3mira', 'c3home', 'c3axe', 'c3lab', 'c3minerals', 'c3labelled', 'c3brew', 'c3night', 'c3giant', 'c3garron', 'c3strong',
    'c3argue', 'c3jungle', 'c3pack', 'c3pass', 'c3ravine', 'c3meadow', 'c3wolves', 'c3river', 'c3end'];
  const reached = (stage) => ORDER.indexOf(D.story.stage) >= ORDER.indexOf(stage);
  const flag = (name) => !!(D.story && D.story.flags[name]);
  const k = (key) => `<kbd>${key}</kbd>`;

  // ---------- Drawings ----------

  // Ink on paper: every drawing is run through a faint wobble, so it looks drawn by hand.
  const INK = '#3b2a1a';
  const DEFS = `<defs>
      <filter id="ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/></filter>
      <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${INK}"/></marker>
      <marker id="ahr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#a8432e"/></marker>
    </defs>`;
  const sketch = (body, vb = '0 0 480 300') => `<svg class="sketch" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${DEFS}<g filter="url(#ink)" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}</g></svg>`;
  const label = (x, y, text, { size = 19, anchor = 'start', color = INK, rotate = 0 } = {}) =>
    `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}" stroke="none" class="lbl"${rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : ''}>${text}</text>`;
  const arrow = (d, red = false, w = 2) => `<path d="${d}" stroke="${red ? '#a8432e' : INK}" stroke-width="${w}" marker-end="url(#${red ? 'ahr' : 'ah'})"/>`;
  const WASH = {
    stone: 'rgba(70,75,85,0.55)', light: 'rgba(160,140,110,0.35)', wood: 'rgba(160,110,60,0.45)', leaf: 'rgba(80,140,70,0.4)',
    water: 'rgba(70,130,190,0.35)', red: 'rgba(200,80,60,0.28)', amber: 'rgba(220,150,60,0.35)', green: 'rgba(60,200,140,0.45)', cream: 'rgba(235,225,200,0.9)',
  };

  const DRAW = {
    // knapping flint: a hammerstone strikes the edge of a core; flakes fly
    knap: () => sketch(`
      <ellipse cx="105" cy="92" rx="44" ry="35" fill="${WASH.light}" stroke-width="2.6"/>
      <path d="M78 84 q12 -14 28 -7 M90 110 q14 6 30 -2" stroke-width="1.4"/>
      <path d="M52 68 l-24 -10 M54 92 l-28 -2 M58 116 l-24 9" stroke-width="2"/>
      ${arrow('M146 110 Q176 128 196 148', true, 2.6)}
      <path d="M200 150 L262 118 L332 126 L374 170 L362 232 L302 262 L232 250 L196 206 Z" fill="${WASH.stone}" stroke-width="2.6"/>
      <path d="M302 262 L362 232 L352 252 Z M332 126 L374 170 L360 150 Z" fill="${WASH.cream}" stroke-width="1.6"/>
      <path d="M212 160 q26 20 18 52 M226 154 q30 22 22 60 M242 150 q32 24 24 66" stroke="#e9e3d5" stroke-width="1.6"/>
      <path d="M160 196 l18 -10 l8 16 z M138 236 l22 -6 l2 16 z M178 264 l16 -14 l10 12 z" fill="${WASH.stone}" stroke-width="2"/>
      <path d="M150 186 l-14 -6 M128 232 l-16 2 M168 270 l-12 8" stroke-width="1.5" stroke-dasharray="3 4"/>
      ${label(36, 34, 'hammerstone (round, hard)')}
      ${label(300, 290, 'flint core', { anchor: 'middle' })}
      ${label(30, 290, 'flakes fly off')}
      ${label(250, 104, 'strike near the edge,')}
      ${label(258, 84, 'glancing, not square on')}
      <rect x="388" y="22" width="84" height="94" rx="6" fill="${WASH.cream}" stroke-width="1.5"/>
      <path d="M400 104 L432 30 L462 104 Z" fill="${WASH.stone}" stroke-width="1.8"/>
      <path d="M410 98 q22 -16 44 0 M416 86 q16 -12 32 0 M422 72 q10 -8 20 0" stroke="#e9e3d5" stroke-width="1.4"/>
      ${label(418, 140, 'shell-shaped break:', { size: 16, anchor: 'middle' })}
      ${label(418, 158, 'a razor edge', { size: 16, anchor: 'middle' })}`),

    // the blade: flake + grip + fibre = a knife
    blade: () => sketch(`
      ${label(14, 30, 'Bind the flake into the split grip; wrap it tight with fibre.', { size: 17 })}
      <path d="M18 128 L72 98 L94 154 L48 174 Z" fill="${WASH.stone}" stroke-width="2.4"/>
      <path d="M34 140 q22 -8 32 12 M42 132 q20 -6 28 14" stroke="#e9e3d5" stroke-width="1.3"/>
      ${label(56, 204, 'sharp flake', { anchor: 'middle', size: 17 })}
      ${label(104, 148, '+', { size: 30 })}
      <rect x="128" y="128" width="86" height="24" rx="9" fill="${WASH.wood}" stroke-width="2.4"/>
      <path d="M142 134 l18 0 M168 146 l22 0 M196 136 l12 0" stroke-width="1.3"/>
      <path d="M214 128 l9 -6 M214 152 l9 6" stroke-width="2"/>
      ${label(172, 186, 'wooden grip', { anchor: 'middle', size: 17 })}
      ${label(232, 148, '+', { size: 30 })}
      <path d="M262 108 c16 -10 28 10 14 20 s-28 10 -14 20 s28 10 14 20" stroke="#8a6d2e" stroke-width="3"/>
      ${label(272, 204, 'fibre', { anchor: 'middle', size: 17 })}
      ${label(302, 148, '=', { size: 30 })}
      <g transform="translate(372 56) rotate(24) scale(0.9)">
        <rect x="0" y="40" width="22" height="104" rx="8" fill="${WASH.wood}" stroke-width="2.4"/>
        <path d="M-6 -30 L28 -30 L22 44 L0 44 Z" fill="${WASH.stone}" stroke-width="2.4"/>
        <path d="M-2 40 l26 8 M-2 50 l26 8 M-2 60 l26 8" stroke="#8a6d2e" stroke-width="2.4"/>
      </g>
      ${label(392, 250, 'a knife!', { anchor: 'middle', size: 24 })}`),

    // two-ply cord: twist each strand one way, wrap them together the other
    cord: () => sketch(`
      <path d="M30 70 C80 60 120 80 170 70 S250 60 290 70" stroke="#b48a3a" stroke-width="7"/>
      <path d="M30 120 C80 110 120 130 170 120 S250 110 290 120" stroke="#6f8a3a" stroke-width="7"/>
      <path d="M50 64 l8 12 M80 64 l8 12 M110 66 l8 12 M140 66 l8 12 M170 64 l8 12 M200 62 l8 12 M230 62 l8 12 M260 64 l8 12" stroke-width="1.6"/>
      <path d="M50 114 l8 12 M80 114 l8 12 M110 116 l8 12 M140 116 l8 12 M170 114 l8 12 M200 112 l8 12 M230 112 l8 12 M260 114 l8 12" stroke-width="1.6"/>
      <path d="M318 58 a14 14 0 1 1 -4 22" stroke-width="2.2" marker-end="url(#ah)"/>
      <path d="M318 108 a14 14 0 1 1 -4 22" stroke-width="2.2" marker-end="url(#ah)"/>
      ${label(350, 76, 'twist each strand')}
      ${label(350, 126, 'the same way')}
      <g transform="translate(40 220)">
        ${Array.from({ length: 9 }, (_, i) => `<ellipse cx="${i * 36}" cy="0" rx="20" ry="11" transform="rotate(-28 ${i * 36} 0)" fill="${i % 2 ? 'rgba(111,138,58,0.55)' : 'rgba(180,138,58,0.55)'}" stroke-width="2"/>`).join('')}
      </g>
      <path d="M380 176 a16 16 0 1 0 4 26" stroke-width="2.2" marker-end="url(#ah)"/>
      ${label(344, 168, 'wrap them together')}
      ${label(352, 248, 'the other way')}
      ${label(20, 284, 'The two twists push against each other and lock: it never unravels.', { size: 17 })}`),

    // the bow as a spring: back stretched, belly squeezed
    bow: () => sketch(`
      <path d="M150 30 C76 74 76 226 150 270" stroke="#7a5228" stroke-width="10"/>
      <path d="M150 30 C88 74 88 226 150 270" stroke="${WASH.amber}" stroke-width="3"/>
      <path d="M150 30 L262 150 L150 270" stroke-width="1.8"/>
      <path d="M26 150 L270 150" stroke-width="3"/>
      <path d="M16 150 l18 -8 l0 16 z" fill="${INK}"/>
      <circle cx="270" cy="150" r="9" fill="${WASH.red}" stroke-width="2"/>
      ${arrow('M312 150 L284 150', true, 2.4)}
      ${label(318, 156, 'your pull', { size: 18 })}
      ${arrow('M90 92 l-14 -14', false, 1.8)} ${arrow('M82 150 l-18 0', false, 1.8)} ${arrow('M90 208 l-14 14', false, 1.8)}
      ${label(10, 34, 'back (faces the target):', { size: 16 })}
      ${label(10, 52, 'stretched = tension', { size: 16, color: '#a8432e' })}
      ${arrow('M124 104 l10 10', false, 1.6)} ${arrow('M124 196 l10 -10', false, 1.6)}
      ${label(178, 104, 'belly (faces you):', { size: 16 })}
      ${label(178, 122, 'squeezed = compression', { size: 16, color: '#2e5f84' })}
      ${label(300, 212, 'Bending stores', { size: 17 })}
      ${label(300, 232, 'the work you put in.', { size: 17 })}
      ${label(300, 256, 'Letting go gives it', { size: 17 })}
      ${label(300, 276, 'all to the arrow.', { size: 17 })}`),

    // the parts of an arrow, and how it falls
    arrows: () => sketch(`
      <path d="M70 64 L410 64" stroke="#7a5228" stroke-width="5"/>
      <path d="M40 64 L72 52 L72 76 Z" fill="${WASH.stone}" stroke-width="2.2"/>
      <path d="M360 64 C370 40 392 38 402 44 C392 56 376 62 360 64 Z M360 64 C370 88 392 90 402 84 C392 72 376 66 360 64 Z" fill="${WASH.leaf}" stroke-width="2"/>
      <path d="M410 56 L418 64 L410 72" stroke-width="2"/>
      <path d="M52 76 L52 98 M220 70 L220 98 M384 88 L384 104 M414 70 L432 30" stroke-width="1.3" stroke-dasharray="3 3"/>
      ${label(20, 116, 'flint point:', { size: 17 })}
      ${label(20, 134, 'heavy, in front', { size: 17 })}
      ${label(220, 116, 'shaft: one straight stick', { size: 17, anchor: 'middle' })}
      ${label(470, 120, 'fletching: steers it', { size: 17, anchor: 'end' })}
      ${label(436, 26, 'nock', { size: 17 })}
      <path d="M10 286 L470 286" stroke-width="2"/>
      <path d="M38 286 l0 -30 m-10 10 l10 -6 l12 4 m-12 -14 a6 6 0 1 0 0.1 0" stroke-width="2"/>
      <path d="M58 248 Q250 200 440 240" stroke-width="2.2" stroke-dasharray="7 5" marker-end="url(#ah)"/>
      <path d="M58 250 Q160 222 280 284" stroke="#a8432e" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#ahr)"/>
      <circle cx="452" cy="244" r="12" fill="${WASH.red}" stroke-width="2"/>
      ${label(190, 196, 'full draw: fast, almost flat', { size: 17 })}
      ${label(294, 278, 'half draw: drops short', { size: 17, color: '#a8432e' })}
      ${label(300, 160, 'far away? aim a little high', { size: 18 })}`),

    // the shelter in the tree
    shelter: () => sketch(`
      <path d="M8 286 L472 286" stroke-width="2.4"/>
      <path d="M210 0 L206 250 Q200 278 168 286 M262 0 L266 250 Q272 278 304 286" fill="${WASH.wood}" stroke-width="2.6"/>
      <path d="M222 30 l0 40 M240 90 l0 50 M228 170 l0 40 M248 200 l0 30" stroke-width="1.2"/>
      <path d="M266 150 L430 150 L430 162 L266 162 Z" fill="${WASH.wood}" stroke-width="2.4"/>
      <path d="M290 150 l0 12 M314 150 l0 12 M338 150 l0 12 M362 150 l0 12 M386 150 l0 12 M410 150 l0 12" stroke-width="1.2"/>
      <path d="M424 162 L432 286 M300 162 L294 286" stroke-width="3"/>
      <path d="M266 72 L438 120" stroke-width="3"/>
      <path d="M424 120 L424 150" stroke-width="2.4"/>
      ${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="${292 + i * 32}" cy="${86 + i * 9}" rx="26" ry="9" transform="rotate(16 ${292 + i * 32} ${86 + i * 9})" fill="${WASH.leaf}" stroke-width="1.8"/>`).join('')}
      ${[0, 1, 2, 3].map((i) => `<ellipse cx="${308 + i * 32}" cy="${98 + i * 9}" rx="26" ry="9" transform="rotate(16 ${308 + i * 32} ${98 + i * 9})" fill="rgba(60,120,55,0.45)" stroke-width="1.8"/>`).join('')}
      <path d="M346 162 L352 286 M366 162 L372 286" stroke="#6f8a3a" stroke-width="2.2"/>
      <path d="M347 186 l20 0 M348 210 l20 0 M349 234 l20 0 M350 258 l20 0" stroke-width="2.2"/>
      <circle cx="268" cy="156" r="6" stroke="#6f8a3a" stroke-width="2.4"/>
      <circle cx="424" cy="156" r="6" stroke="#6f8a3a" stroke-width="2.4"/>
      ${arrow('M150 286 L150 162', false, 1.8)} ${arrow('M150 162 L150 286', false, 1.8)}
      ${label(52, 220, '3.4 m up:')}
      ${label(52, 240, 'out of reach')}
      <path d="M398 270 q10 -18 30 -14 q14 -12 30 0 l6 14 l-10 2 l-4 -8 l-30 2 l-4 10 l-12 0 z" fill="rgba(40,30,20,0.55)" stroke-width="1.5"/>
      ${label(382, 300, "can't climb up", { size: 16 })}
      ${label(282, 40, 'roof: big leaves, laid like tiles', { size: 17 })}
      ${label(282, 58, 'from the bottom row up', { size: 17 })}
      ${label(20, 130, 'frame: sturdy branches')}
      ${label(20, 150, 'lashed with vines')}
      ${label(380, 210, 'vine ladder', { size: 17 })}`, '0 0 480 308'),

    // why he woke: guano to nitrate, and the Revonite
    revival: () => sketch(`
      <path d="M22 70 q12 -20 26 -6 q6 -12 12 0 q6 -12 12 0 q14 -14 26 6 q-14 -2 -26 10 q-6 -8 -12 2 q-6 -10 -12 -2 q-12 -12 -26 -10 z" fill="rgba(40,30,25,0.6)" stroke-width="1.6"/>
      ${label(60, 112, 'bats', { anchor: 'middle' })}
      ${arrow('M104 74 L132 74')}
      <path d="M140 84 q20 -26 44 -10 q14 -10 22 10 z" fill="rgba(90,70,50,0.6)" stroke-width="2"/>
      ${label(173, 112, 'guano', { anchor: 'middle' })}
      ${arrow('M212 74 L240 74')}
      <circle cx="258" cy="70" r="6" stroke-width="1.6"/><circle cx="276" cy="80" r="5" stroke-width="1.6"/><circle cx="270" cy="62" r="4" stroke-width="1.6"/>
      ${label(268, 112, 'bacteria', { anchor: 'middle' })}
      ${arrow('M292 74 L320 74')}
      ${label(358, 80, 'NH₃', { anchor: 'middle', size: 26 })}
      ${label(358, 112, 'ammonia', { anchor: 'middle' })}
      ${arrow('M392 74 L414 74')}
      ${label(446, 80, 'NO₃⁻', { anchor: 'middle', size: 26 })}
      ${label(446, 112, 'nitrate', { anchor: 'middle' })}
      ${label(446, 130, '(nitre)', { anchor: 'middle', size: 16 })}
      ${arrow('M446 140 Q446 170 400 186')}
      <path d="M360 186 q10 -18 20 0 a10 10 0 1 1 -20 0 z" fill="${WASH.water}" stroke-width="1.8"/>
      ${label(378, 230, 'dissolved in dripping water', { anchor: 'middle', size: 17 })}
      ${label(282, 196, '+', { size: 30 })}
      <path d="M206 210 l10 -40 l10 40 z M222 210 l12 -30 l8 30 z M196 210 l6 -22 l8 22 z" fill="${WASH.green}" stroke="#1d6a4a" stroke-width="2"/>
      ${label(222, 236, 'Revonite', { anchor: 'middle', color: '#1d6a4a', size: 21 })}
      ${arrow('M180 196 L120 196', true, 2.4)}
      <path d="M58 166 q14 -10 24 0 l4 40 l-32 0 z" fill="${WASH.stone}" stroke-width="2"/>
      <path d="M62 178 l10 8 l-4 10 M78 170 l-6 14" stroke="#1d6a4a" stroke-width="1.6"/>
      ${label(70, 236, 'the stone gives way', { anchor: 'middle', size: 17 })}
      ${label(240, 286, 'Real: guano → nitrate.  Invented: Revonite, the catalyst.', { anchor: 'middle', size: 17 })}`),

    // the tiger's gorge from above
    tiger: () => sketch(`
      <path d="M10 40 Q120 22 240 44 T470 36" stroke-width="2.6"/>
      <path d="M10 262 Q120 280 240 258 T470 266" stroke-width="2.6"/>
      <path d="M30 40 l-8 -14 M80 34 l-6 -14 M140 32 l-4 -14 M200 38 l-4 -14 M260 44 l0 -14 M320 40 l2 -14 M380 34 l4 -14 M440 36 l6 -14" stroke-width="1.4"/>
      <path d="M30 262 l-8 14 M80 268 l-6 14 M140 270 l-4 14 M200 264 l-4 14 M260 258 l0 14 M320 262 l2 14 M380 268 l4 14 M440 266 l6 14" stroke-width="1.4"/>
      <circle cx="384" cy="152" r="112" stroke-width="2" stroke-dasharray="8 6"/>
      <circle cx="384" cy="152" r="54" stroke="#a8432e" stroke-width="2.2" stroke-dasharray="6 5"/>
      <circle cx="384" cy="152" r="12" fill="rgba(200,120,40,0.6)" stroke-width="2"/>
      ${label(384, 186, 'den', { anchor: 'middle', size: 17 })}
      ${label(300, 82, 'it rises and growls', { size: 17 })}
      ${label(334, 222, 'closer: it charges', { size: 17, color: '#a8432e' })}
      <path d="M150 152 l0 -22 m-10 8 l10 -4 l10 4 m-10 -14 a5 5 0 1 0 0.1 0" stroke-width="2"/>
      ${label(150, 188, 'you, out here', { anchor: 'middle', size: 17 })}
      <path d="M166 146 L366 150" stroke-width="1.6" stroke-dasharray="4 5" marker-end="url(#ah)"/>
      ${arrow('M370 168 Q250 236 200 178', true, 2.2)}
      ${arrow('M206 166 Q262 112 360 140', false, 2)}
      ${label(20, 66, 'It strikes once,', { size: 18 })}
      ${label(20, 86, 'then falls back to its den:', { size: 18 })}
      ${label(20, 106, 'shoot again as it goes.', { size: 18 })}`),

    // where to drink
    water: () => sketch(`
      <path d="M8 180 L120 180 Q150 180 160 200 Q200 250 260 248 Q310 246 330 200 Q340 180 370 180 L472 180" stroke-width="2.6"/>
      <path d="M160 200 Q200 250 260 248 Q310 246 330 200 Z" fill="${WASH.water}" stroke-width="0"/>
      <path d="M180 214 q10 -4 20 0 M230 226 q12 -4 24 0 M280 214 q10 -4 20 0" stroke="#3f6f98" stroke-width="1.6"/>
      <path d="M140 180 l0 -16 m0 0 l-12 14 m12 -14 l14 12 m-14 -12 l0 -20 m-12 6 l12 -4 l14 8 m-14 -18 a6 6 0 1 0 0.1 0" stroke-width="2"/>
      <rect x="108" y="96" width="30" height="26" rx="5" fill="${WASH.cream}" stroke-width="1.6"/>
      ${label(123, 116, 'E', { anchor: 'middle', size: 20 })}
      ${label(40, 76, 'Stand at the edge, press E to drink.', { size: 18 })}
      ${label(250, 280, 'the pond in the clearing', { anchor: 'middle', size: 17 })}
      ${arrow('M392 150 L460 150', true, 2.4)} ${arrow('M392 162 L470 162', true, 2.4)}
      ${label(472, 112, 'the river: too deep,', { anchor: 'end', size: 17, color: '#a8432e' })}
      ${label(472, 132, "too fast. Don't swim.", { anchor: 'end', size: 17, color: '#a8432e' })}`),

    berries: () => sketch(`
      <path d="M30 120 q-20 -50 30 -70 q30 -40 70 -10 q50 0 40 50 q20 40 -30 50 q-40 20 -70 0 q-50 10 -40 -20 z" fill="${WASH.leaf}" stroke-width="2.2"/>
      ${[[60, 70], [80, 90], [110, 66], [128, 98], [96, 112], [64, 104], [140, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="rgba(190,40,60,0.85)" stroke-width="1.2"/>`).join('')}
      ${label(100, 160, 'berry bush', { anchor: 'middle' })}`, '0 0 200 170'),

    vine: () => sketch(`
      <path d="M10 10 C80 40 40 90 90 130 S70 220 120 260" stroke="#6f6a3a" stroke-width="5"/>
      ${[[40, 34], [60, 70], [72, 110], [96, 150], [86, 196], [106, 236]].map(([x, y], i) => `<ellipse cx="${x + (i % 2 ? 14 : -14)}" cy="${y}" rx="14" ry="7" transform="rotate(${i % 2 ? 30 : -30} ${x} ${y})" fill="${WASH.leaf}" stroke-width="1.6"/>`).join('')}
      ${label(150, 140, 'vine (liana)')}
      ${label(150, 160, 'pull it down: E', { size: 17 })}`, '0 0 280 270'),
  };

  // ---------- Pictures from the game ----------

  // A model drawn alone into a picture (transparent around it), once, while the game loads.
  // It is drawn in the game's own scene, everything else hidden and the sun and sky set to a
  // fixed bright day for the picture, so the shaders the world already uses draw it too and
  // nothing new has to be compiled (that would freeze the game for a moment).
  const pictures = {};
  let book_prepare = () => {};
  const STUDIO = new THREE.Vector3(0, 900, 0); // high above the valley, nothing near
  function snapshot(object, { size = 300, angle = 0.65, rise = 0.32, zoom = 1, aim = null, keep = null } = {}) {
    const r = D.renderer;
    const scene = D.scene;
    const S = size * 2; // drawn at twice the size and shrunk, for smooth edges
    const target = new THREE.WebGLRenderTarget(S, S);
    target.texture.encoding = THREE.sRGBEncoding;
    // everything else away
    const hidden = [];
    for (const c of scene.children) {
      if (c.visible && !c.isLight && c !== keep) {
        hidden.push(c);
        c.visible = false;
      }
    }
    const holder = new THREE.Group();
    holder.position.copy(STUDIO);
    if (!keep) {
      holder.add(object);
      scene.add(holder);
    }
    const background = scene.background;
    scene.background = null;
    const density = scene.fog.density;
    scene.fog.density = 0;
    // a fixed bright day
    const sun = D.sun;
    const hemi = D.hemi;
    const saved = {
      sunPos: sun.position.clone(), targetPos: sun.target.position.clone(), sunColor: sun.color.clone(), sunI: sun.intensity,
      hemiColor: hemi.color.clone(), hemiGround: hemi.groundColor.clone(), hemiI: hemi.intensity,
      fill: D.foliageUniforms.foliageSky.value.clone(), exposure: r.toneMappingExposure, autoShadow: r.shadowMap.autoUpdate,
      glow: D.caveUniforms.caveGlow.value,
    };
    const place = keep ? keep.position : STUDIO;
    sun.position.copy(place).add(new THREE.Vector3(2.5, 3.5, 2.5).multiplyScalar(20));
    sun.target.position.copy(place);
    sun.target.updateMatrixWorld();
    sun.color.set(0xfff2dc);
    sun.intensity = 2.3;
    hemi.color.set(0xfff4e2);
    hemi.groundColor.set(0x6a5a46);
    hemi.intensity = 0.95;
    D.foliageUniforms.foliageSky.value.copy(hemi.color).multiplyScalar(hemi.intensity * D.FOLIAGE_FILL * Math.PI);
    D.caveUniforms.caveGlow.value = 0;
    r.toneMappingExposure = 1;
    r.shadowMap.autoUpdate = false; // (the subject is far outside the shadow's box: lit all over)
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(keep || object);
    const centre = aim || box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 200);
    const dist = ((radius / Math.sin((28 * Math.PI) / 360)) * 0.92) / zoom;
    cam.position.set(centre.x + Math.sin(angle) * Math.cos(rise) * dist, centre.y + Math.sin(rise) * dist, centre.z + Math.cos(angle) * Math.cos(rise) * dist);
    cam.lookAt(centre);
    const before = r.getRenderTarget();
    const clear = r.getClearColor(new THREE.Color());
    const alpha = r.getClearAlpha();
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, cam);
    const px = new Uint8Array(S * S * 4);
    r.readRenderTargetPixels(target, 0, 0, S, S, px);
    // and everything back as it was
    r.setRenderTarget(before);
    r.setClearColor(clear, alpha);
    r.toneMappingExposure = saved.exposure;
    r.shadowMap.autoUpdate = saved.autoShadow;
    sun.position.copy(saved.sunPos);
    sun.target.position.copy(saved.targetPos);
    sun.target.updateMatrixWorld();
    sun.color.copy(saved.sunColor);
    sun.intensity = saved.sunI;
    hemi.color.copy(saved.hemiColor);
    hemi.groundColor.copy(saved.hemiGround);
    hemi.intensity = saved.hemiI;
    D.foliageUniforms.foliageSky.value.copy(saved.fill);
    D.caveUniforms.caveGlow.value = saved.glow;
    scene.fog.density = density;
    scene.background = background;
    if (!keep) {
      scene.remove(holder);
      holder.remove(object);
    }
    for (const c of hidden) c.visible = true;
    target.dispose();
    // into a canvas the right way up, then shrunk
    const big = document.createElement('canvas');
    big.width = S;
    big.height = S;
    const g = big.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    out.getContext('2d').drawImage(big, 0, 0, size, size);
    return out.toDataURL('image/png');
  }

  const MAKE = {
    flint: () => D.items.modelOf('flint'),
    stone: () => D.items.modelOf('stone'),
    stick: () => D.items.modelOf('stick'),
    branch: () => D.items.modelOf('branch'),
    mango: () => D.items.modelOf('mango'),
    bananas: () => D.items.modelOf('banana'),
    coconut: () => D.items.modelOf('coconut'),
    blade: () => D.items.bladeModel(),
    fibre: () => D.items.fibreModel(),
    bow: () => D.combat.bowModel(),
    arrow: () => D.combat.arrowModel(),
    bananaPlant: () => D.models.mesh('banana'),
    elephantEar: () => D.models.mesh('monstera'),
    tiger: () => {
      const t = D.models.list.tiger;
      const body = THREE.SkeletonUtils.clone(t.root);
      if (t.animations[0]) {
        const mixer = new THREE.AnimationMixer(body);
        mixer.clipAction(t.animations[0]).play();
        mixer.setTime(0.12);
      }
      return body;
    },
    statue: () => {
      const s = D.statues.list.find((x) => x.spot.pose === 'shield' && !x.spot.lie) || D.statues.list[0];
      const g = s.group.clone();
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      return g;
    },
  };
  const SNAP = {
    stick: { angle: 1.4, rise: 0.5 }, branch: { angle: 1.3, rise: 0.5 }, arrow: { angle: 1.57, rise: 0.25 },
    bow: { angle: 1.3, rise: 0.1 }, blade: { angle: 0.3, rise: 0.15 }, tiger: { angle: 0.9, rise: 0.25 },
    statue: { angle: 0.4, rise: 0.15 }, fibre: { rise: 0.2 }, bananaPlant: { rise: 0.2 }, elephantEar: { rise: 0.45 },
  };
  function picture(name) {
    if (pictures[name]) return pictures[name];
    try {
      pictures[name] = snapshot(MAKE[name](), SNAP[name] || {});
    } catch (error) {
      console.warn(`No picture of ${name}`, error);
      pictures[name] = '';
    }
    return pictures[name];
  }

  // The hero's face, for his speech: drawn where he stands, the world hidden, the stone of
  // his waking gone for the picture.
  function portrait() {
    if (pictures.hero !== undefined) return pictures.hero;
    const h = D.hero;
    if (!h.group || !h.skin) return '';
    const petrify = h.stoneUniforms.petrify.value;
    const crack = h.stoneUniforms.crack.value;
    const visible = h.group.visible;
    h.stoneUniforms.petrify.value = 0;
    h.stoneUniforms.crack.value = 0;
    h.group.visible = true;
    h.group.updateMatrixWorld(true);
    const head = h.boneWorld('head', new THREE.Vector3());
    const facing = h.facing;
    try {
      pictures.hero = snapshot(null, { size: 220, angle: facing + 0.35, rise: 0.05, zoom: 8.5, aim: head.add(new THREE.Vector3(0, 0.04, 0)), keep: h.group });
    } catch (error) {
      console.warn('No portrait', error);
      pictures.hero = '';
    }
    h.stoneUniforms.petrify.value = petrify;
    h.stoneUniforms.crack.value = crack;
    h.group.visible = visible;
    return pictures.hero;
  }

  // Every picture the book uses, made while the game loads.
  book_prepare = () => {
    for (const name of Object.keys(MAKE)) picture(name);
    portrait();
  };

  const photo = (name, caption = '', cls = '') => {
    const src = picture(name);
    return src ? `<figure class="photo ${cls}"><img src="${src}" alt="${caption}"/>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>` : '';
  };

  // ---------- The pages ----------

  // ---------- Chapter 2's drawings ----------

  const DRAW3 = {
    // smoke: green ferns on a fire at the mouth; the draught carries the smoke in; out comes the bear
    smoke: () => sketch(`
      <path d="M250 270 Q250 70 380 60 Q470 70 470 270" fill="rgba(40,35,30,0.35)" stroke-width="3"/>
      <path d="M60 268 L470 268" stroke-width="2"/>
      <path d="M150 268 l16 -20 l14 20 M140 268 l40 -8 M136 262 l50 4" stroke="#7a5228" stroke-width="3"/>
      <path d="M146 250 q-8 -14 4 -22 q4 10 10 4 q8 -12 2 -24 q16 8 14 26 q6 -6 4 -14 q12 16 -2 30 z" fill="rgba(230,120,40,0.6)" stroke-width="1.4"/>
      <path d="M150 226 q-30 -30 0 -50 q30 -20 70 -6 q40 14 80 0 q30 -12 60 10" stroke="rgba(110,110,110,0.9)" stroke-width="7" opacity="0.6"/>
      <path d="M160 200 q30 -26 70 -14 q40 12 90 4" stroke="rgba(140,140,140,0.9)" stroke-width="5" opacity="0.5"/>
      ${arrow('M60 150 Q150 130 250 150', true, 2.2)}
      ${label(26, 132, 'the draught: into the cave', { size: 16, color: '#a8432e' })}
      ${label(110, 292, 'dead wood + green ferns', { size: 16 })}
      ${label(300, 110, 'smoke fills the tunnel', { size: 16 })}
      <path d="M330 230 q14 -22 40 -18 q24 -10 36 8 q6 18 -8 26 l-58 2 q-14 -6 -10 -18 z" fill="${WASH.wood}" stroke-width="2"/>
      ${arrow('M326 238 L280 244', false, 2)}
      ${label(300, 290, 'the bear comes out fast', { size: 16 })}`),

    // the stone axe: a wedge of flint, set in a split handle with resin, lashed with vine
    axe: () => sketch(`
      <path d="M90 60 L110 280" stroke="#7a5228" stroke-width="12"/>
      <path d="M84 70 L96 58 L108 64" stroke-width="1.6"/>
      <path d="M100 96 L40 92 L30 128 L104 134 Z" fill="${WASH.stone}" stroke-width="2.6"/>
      <path d="M40 92 L30 128" stroke="#e9e3d5" stroke-width="2"/>
      <path d="M96 104 q14 -2 18 8 q-2 10 -16 10" fill="rgba(217,154,43,0.6)" stroke-width="1.4"/>
      <path d="M92 140 l26 -6 M93 148 l26 -6 M94 156 l26 -6 M95 164 l26 -6" stroke="#4f6d2d" stroke-width="3"/>
      ${label(150, 80, 'flint, knocked to a wedge', { size: 17 })}
      ${label(150, 116, 'warm resin: the glue', { size: 17, color: '#a8642e' })}
      ${label(150, 154, 'vine, wound tight while wet', { size: 17 })}
      ${label(150, 196, 'a split stick for the handle', { size: 17 })}
      ${arrow('M146 112 L120 112', true, 1.6)}
      ${arrow('M146 150 L124 150', false, 1.6)}
      ${label(250, 270, 'Make: 1 flint, 1 stick, 1 vine, 1 resin', { size: 17, anchor: 'middle' })}`),

    // walls of sticks and mud: stakes, woven withies, clay pressed in; and the lab's heights
    wattle: () => sketch(`
      <path d="M30 60 L30 240 M70 60 L70 240 M110 60 L110 240 M150 60 L150 240" stroke="#5a412a" stroke-width="6"/>
      <path d="M22 80 Q50 90 70 76 Q90 62 110 78 Q130 92 160 78 M22 104 Q50 92 70 106 Q90 120 110 102 Q130 88 160 104 M22 128 Q50 138 70 124 Q90 110 110 126 Q130 140 160 126" stroke="#8a6a44" stroke-width="5"/>
      <path d="M22 150 L160 150 L160 240 L22 240 Z" fill="rgba(165,140,108,0.75)" stroke-width="2"/>
      ${label(20, 40, 'wattle: weave', { size: 16 })}
      ${label(20, 270, 'daub: clay pressed in', { size: 16 })}
      <path d="M220 240 L220 150 L330 104 L440 150 L440 240" stroke-width="2.4"/>
      <path d="M210 152 L330 100 L450 152" stroke="#4f6d2d" stroke-width="5"/>
      <path d="M200 240 L460 240" stroke-width="2"/>
      <circle cx="270" cy="168" r="7" fill="${WASH.light}" stroke-width="1.6"/>
      <path d="M270 175 L270 210 M270 210 L262 240 M270 210 L278 240 M258 186 L282 186" stroke-width="2"/>
      ${label(452, 196, '2.5 m', { size: 15 })}
      ${label(336, 96, '3.4 m', { size: 15 })}
      ${label(240, 262, 'you: 1.8 m', { size: 15 })}
      <path d="M380 240 L380 160" stroke-width="1" stroke-dasharray="4 4"/>`),

    // paint from the earth: four colours, a binder, a brush
    paint: () => sketch(`
      <ellipse cx="80" cy="200" rx="46" ry="16" fill="rgba(160,52,22,0.75)" stroke-width="2"/>
      <ellipse cx="190" cy="200" rx="46" ry="16" fill="rgba(200,150,40,0.75)" stroke-width="2"/>
      <ellipse cx="300" cy="200" rx="46" ry="16" fill="rgba(30,25,20,0.85)" stroke-width="2"/>
      <ellipse cx="410" cy="200" rx="46" ry="16" fill="rgba(235,232,222,0.95)" stroke-width="2"/>
      ${label(80, 246, 'red ochre', { anchor: 'middle', size: 16 })}
      ${label(80, 264, '(iron-rich clay)', { anchor: 'middle', size: 13 })}
      ${label(190, 246, 'yellow ochre', { anchor: 'middle', size: 16 })}
      ${label(300, 246, 'charcoal', { anchor: 'middle', size: 16 })}
      ${label(410, 246, 'ash, chalk', { anchor: 'middle', size: 16 })}
      <path d="M160 70 L300 130" stroke="#7a5228" stroke-width="6"/>
      <path d="M300 130 q16 8 24 22 q-18 -2 -30 -14 z" fill="rgba(160,52,22,0.75)" stroke-width="1.4"/>
      ${label(110, 60, 'a brush: chewed twig, or hair', { size: 16 })}
      <path d="M360 90 q20 -20 40 0 l-4 26 l-32 0 z" fill="rgba(217,154,43,0.6)" stroke-width="1.8"/>
      ${label(340, 140, 'resin: holds it on', { size: 16 })}`),

    // nitre from droppings: bats, the guano under them, nitrate growing out of it
    guano: () => sketch(`
      <path d="M20 40 Q240 10 460 40" stroke-width="3"/>
      <path d="M90 46 l-10 14 l10 -4 l10 4 z M150 42 l-10 14 l10 -4 l10 4 z M210 40 l-10 14 l10 -4 l10 4 z" fill="rgba(40,35,30,0.8)" stroke-width="1.2"/>
      <path d="M100 80 l0 20 M150 76 l0 30 M200 82 l0 18" stroke-dasharray="3 6" stroke-width="2"/>
      <path d="M60 220 q90 -60 180 0 z" fill="rgba(59,47,36,0.8)" stroke-width="2"/>
      ${label(70, 252, 'guano: centuries of droppings', { size: 16 })}
      ${arrow('M250 200 L300 200', true, 2)}
      ${label(250, 180, 'bacteria', { size: 15, color: '#a8432e' })}
      <path d="M320 216 l14 -30 l14 30 z M344 216 l10 -22 l10 22 z M362 216 l14 -36 l14 36 z" fill="${WASH.cream}" stroke-width="1.8"/>
      ${label(312, 252, 'nitrate: nitre', { size: 16 })}
      ${label(300, 120, '3 nitre a scrape', { size: 17 })}
      ${label(300, 140, '(the walls give 2)', { size: 14 })}`),

    // the spear: a long lever on your arm; reach, and your weight behind it
    spear: () => sketch(`
      <circle cx="100" cy="90" r="16" fill="${WASH.light}" stroke-width="2"/>
      <path d="M100 106 L96 180 M96 180 L76 262 M96 180 L122 262 M98 126 L150 140 L188 132 M98 128 L136 152" stroke-width="3"/>
      <path d="M120 150 L440 116" stroke="#7a5228" stroke-width="5"/>
      <path d="M440 116 l30 -6 l-26 14 z" fill="${WASH.stone}" stroke-width="2"/>
      ${arrow('M60 200 L120 200', true, 2.4)}
      ${label(20, 226, 'weight forward, from the legs', { size: 16, color: '#a8432e' })}
      ${label(260, 100, '2 m of reach', { size: 17 })}
      ${label(250, 180, 'stave + flint + vine', { size: 17 })}
      ${label(250, 200, 'Tab, Make; 5 holds it; left mouse jabs', { size: 15 })}`),

    // a lever: a long pole over a stone; a small push lifts a boulder
    lever: () => sketch(`
      <path d="M20 250 L460 250" stroke-width="2"/>
      <path d="M300 250 q10 -80 80 -86 q70 4 76 86 z" fill="${WASH.stone}" stroke-width="2.6"/>
      <path d="M60 196 L340 236" stroke="#7a5228" stroke-width="7"/>
      <path d="M262 250 l14 -26 l14 26 z" fill="${WASH.stone}" stroke-width="2"/>
      ${arrow('M60 150 L60 190', true, 2.6)}
      ${arrow('M330 230 L330 196', false, 2.2)}
      ${label(20, 136, 'a small push here...', { size: 16, color: '#a8432e' })}
      ${label(330, 150, '...a big lift here', { size: 16 })}
      ${label(250, 282, 'the stone: the fulcrum', { size: 15 })}
      <path d="M60 210 L276 210" stroke-width="1" stroke-dasharray="4 4"/>
      ${label(120, 226, 'long arm', { size: 14 })}
      <path d="M276 226 L330 226" stroke-width="1" stroke-dasharray="4 4"/>
      ${label(282, 242, 'short', { size: 13 })}`),

    // rope: fibres twisted one way into yarns, yarns twisted the other way into rope
    rope: () => sketch(`
      <path d="M30 70 L150 70 M30 80 L150 80 M30 90 L150 90" stroke="#cdb86c" stroke-width="2"/>
      ${label(30, 50, 'loose fibres', { size: 15 })}
      ${arrow('M160 80 L200 80', false, 2)}
      <path d="M210 70 q15 10 30 0 q15 10 30 0 q15 10 30 0 q15 10 30 0 M210 90 q15 -10 30 0 q15 -10 30 0 q15 -10 30 0 q15 -10 30 0" stroke="#bfa36a" stroke-width="3"/>
      ${label(210, 50, 'twisted: a yarn', { size: 15 })}
      <path d="M40 190 q30 30 60 0 q30 -30 60 0 q30 30 60 0 q30 -30 60 0 q30 30 60 0 q30 -30 60 0 q30 30 60 0" stroke="#a88c50" stroke-width="7"/>
      <path d="M40 190 q30 -30 60 0 q30 30 60 0 q30 -30 60 0 q30 30 60 0 q30 -30 60 0 q30 30 60 0 q30 -30 60 0" stroke="#c9a86a" stroke-width="7"/>
      ${label(40, 250, 'three yarns, twisted the other way: rope', { size: 16 })}
      ${label(40, 272, 'each twist locks the other; pulled, it tightens', { size: 14 })}`),

    // the compass: a magnetised needle on a pivot, lining up with the Earth's field
    compass: () => sketch(`
      <circle cx="160" cy="150" r="110" fill="${WASH.cream}" stroke-width="3"/>
      <path d="M160 60 L176 150 L160 240 L144 150 Z" stroke-width="1.6"/>
      <path d="M160 60 L176 150 L144 150 Z" fill="rgba(168,67,46,0.8)" stroke-width="1.6"/>
      <circle cx="160" cy="150" r="6" fill="${INK}"/>
      ${label(160, 34, 'N', { anchor: 'middle', size: 22 })}
      ${label(160, 286, 'S', { anchor: 'middle', size: 18 })}
      <path d="M330 60 Q420 150 330 240 M360 50 Q470 150 360 250 M300 70 Q370 150 300 230" stroke-width="1.4" stroke-dasharray="5 5"/>
      ${label(300, 290, 'the Earth is a great, weak magnet', { size: 15 })}`),

    // wolves: round and round, at the edge of the light
    wolves: () => sketch(`
      <circle cx="240" cy="160" r="60" fill="rgba(230,150,60,0.18)" stroke-width="1" stroke-dasharray="4 4"/>
      <path d="M232 176 l8 -14 l8 14 z" fill="rgba(230,120,40,0.7)" stroke-width="1.6"/>
      <circle cx="240" cy="160" r="120" stroke-width="1.6" stroke-dasharray="8 8"/>
      <path d="M110 120 l18 -6 l6 -8 l4 8 l-6 10 l-20 4 z M360 110 l-18 -6 l-6 -8 l-4 8 l6 10 l20 4 z M150 270 l16 -10 l8 -6 l2 8 l-8 10 l-18 2 z M330 270 l-16 -10 l-8 -6 l-2 8 l8 10 l18 2 z" fill="rgba(110,110,110,0.75)" stroke-width="1.6"/>
      ${arrow('M360 240 Q300 210 290 190', true, 2)}
      ${label(20, 40, 'the fire: they will not come close', { size: 16 })}
      ${label(300, 296, 'one darts in: spear, bow', { size: 16, color: '#a8432e' })}`),

    // the village: across the river, on the far bank
    village: () => sketch(`
      <path d="M20 200 L180 200 L200 290 M300 290 L320 200 L470 200" stroke-width="2"/>
      <path d="M200 280 Q250 300 300 280" stroke="#3f6f98" stroke-width="3"/>
      <path d="M180 200 Q250 240 320 200" stroke="#7a5228" stroke-width="3"/>
      <path d="M180 190 Q250 230 320 190" stroke="#bfa36a" stroke-width="1.4"/>
      <path d="M350 200 l0 -30 l26 0 l0 30 M346 172 l17 -16 l17 16 z M400 200 l0 -26 l24 0 l0 26 M396 176 l16 -14 l16 14 z M440 200 l0 -34 l22 0 l0 34 M436 168 l15 -14 l15 14 z" fill="${WASH.wood}" stroke-width="1.8"/>
      <path d="M412 156 q-8 -20 4 -36 q-10 -18 2 -34" stroke="rgba(120,120,120,0.8)" stroke-width="3"/>
      <circle cx="390" cy="210" r="4" fill="${INK}"/><circle cx="430" cy="214" r="4" fill="${INK}"/>
      ${label(330, 90, 'smoke: cooking fires', { size: 16 })}
      ${label(110, 250, 'a bridge of planks and rope', { size: 16 })}
      ${label(360, 250, 'people, alive', { size: 17, color: '#a8432e' })}`),
  };

  const DRAW2 = {
    // the bow drill: the bow saws, the spindle spins in the hearth board, dust in the notch glows
    drill: () => sketch(`
      <path d="M40 236 L330 236 L330 256 L40 256 Z" fill="${WASH.wood}" stroke-width="2.2"/>
      <path d="M176 236 l12 0 l-4 20 l-6 0 z" fill="rgba(40,30,20,0.7)" stroke-width="1.6"/>
      <path d="M182 236 L182 96" stroke="#7a5228" stroke-width="7"/>
      <path d="M160 92 L206 92 L206 76 L160 76 Z" fill="${WASH.stone}" stroke-width="2"/>
      <path d="M70 150 Q182 120 300 150" stroke-width="3"/>
      <path d="M70 150 L176 168 Q190 172 188 160 L300 150" stroke-width="1.4"/>
      ${arrow('M120 196 L84 196', false, 2)} ${arrow('M240 196 L276 196', false, 2)}
      ${label(180, 214, 'saw: A, D, A, D', { anchor: 'middle', size: 18 })}
      <path d="M150 262 q10 10 26 2 q14 8 24 -2" stroke="rgba(120,110,100,0.8)" stroke-width="1.6"/>
      <circle cx="182" cy="266" r="5" fill="rgba(230,90,30,0.85)" stroke-width="1.2"/>
      <path d="M360 230 q20 -26 50 -8 q24 -12 40 10 q-10 22 -46 22 q-36 2 -44 -24 z" fill="rgba(210,190,120,0.5)" stroke-width="1.8"/>
      <circle cx="400" cy="232" r="6" fill="rgba(230,90,30,0.85)" stroke-width="1.2"/>
      ${arrow('M196 270 Q300 300 384 246', true, 1.8)}
      ${label(14, 32, 'the bow: its string', { size: 17 })}
      ${label(14, 50, 'turns the spindle', { size: 17 })}
      ${label(222, 70, 'a stone holds it down', { size: 16 })}
      ${label(16, 284, 'hearth board', { size: 16 })}
      ${label(356, 200, 'tinder: dry fibre', { size: 16 })}
      ${label(470, 290, 'E: blow the ember into flame', { size: 16, anchor: 'end', color: '#a8432e' })}`),

    // clay: dug from the bank, coiled into pots, baked hard in the fire
    clay: () => sketch(`
      <path d="M10 120 Q60 112 110 130 L150 160 L150 210 L10 210 Z" fill="rgba(140,120,80,0.35)" stroke-width="2"/>
      <path d="M10 160 Q70 150 140 168 L150 172 L150 190 Q80 180 10 188 Z" fill="rgba(150,148,140,0.75)" stroke-width="1.6"/>
      <path d="M150 160 Q190 170 210 168" stroke="#3f6f98" stroke-width="2.2"/>
      <path d="M96 90 L124 168" stroke="#7a5228" stroke-width="4"/>
      ${label(12, 236, 'the grey layer in the bank:', { size: 16 })}
      ${label(12, 254, 'clay (the digging stick)', { size: 16 })}
      <path d="M250 200 q0 -46 26 -60 l40 0 q26 14 26 60 z" fill="rgba(180,112,74,0.45)" stroke-width="2"/>
      <path d="M254 186 q42 6 84 0 M252 170 q46 6 88 0 M258 154 q36 6 76 0" stroke-width="1.4"/>
      ${label(296, 230, 'coils, smoothed', { size: 16, anchor: 'middle' })}
      <path d="M390 210 q10 -30 22 -8 q6 -26 18 -4 q8 -22 18 6" fill="rgba(230,120,40,0.45)" stroke-width="1.6"/>
      <path d="M396 176 q0 -30 18 -40 l22 0 q18 10 18 40 z" fill="rgba(200,120,80,0.55)" stroke-width="2"/>
      <path d="M380 120 q8 -10 0 -20 M420 112 q8 -10 0 -20 M458 120 q8 -10 0 -20" stroke="#a8432e" stroke-width="1.6"/>
      ${label(424, 236, 'baked: hard,', { size: 16, anchor: 'middle' })}
      ${label(424, 254, 'it holds water', { size: 16, anchor: 'middle' })}
      ${arrow('M156 120 L236 120', false, 2)} ${arrow('M350 120 L378 120', false, 2)}
      ${label(240, 286, 'Dig (E) at the Clay Banks, shape at the fire (Tab), it bakes by itself.', { size: 16, anchor: 'middle' })}`),

    // a torch: fibre wrapped round a stick, soaked in resin
    torch: () => sketch(`
      <path d="M120 270 L196 80" stroke="#7a5228" stroke-width="9"/>
      <path d="M186 104 L214 114 L206 132 L176 122 Z M190 92 L218 102 L214 116 L186 106 Z" fill="rgba(200,180,110,0.55)" stroke-width="1.8"/>
      <path d="M196 92 q-14 -30 4 -60 q4 22 16 26 q6 -18 2 -30 q22 26 6 66 z" fill="rgba(240,130,40,0.5)" stroke="#a8432e" stroke-width="1.8"/>
      <circle cx="226" cy="132" r="5" fill="rgba(216,147,31,0.85)" stroke-width="1.2"/>
      <circle cx="236" cy="142" r="4" fill="rgba(216,147,31,0.85)" stroke-width="1.2"/>
      ${label(250, 60, 'resin: burns slow and bright', { size: 17 })}
      ${label(250, 112, 'fibre, wrapped tight', { size: 17 })}
      ${label(250, 160, 'resin smeared into it', { size: 17 })}
      ${label(250, 220, 'a straight stick', { size: 17 })}
      ${label(250, 250, 'about 3 minutes of light', { size: 17, color: '#a8432e' })}
      ${arrow('M248 108 L214 110', false, 1.6)} ${arrow('M248 156 L234 142', false, 1.6)} ${arrow('M248 216 L164 180', false, 1.6)}`),

    // the galleries, from above
    galleries: () => sketch(`
      <path d="M40 30 L80 30 L80 160 Q80 200 104 220 L150 250 L110 260 Q60 240 40 180 Z" fill="${WASH.light}" stroke-width="2"/>
      ${label(26, 22, 'the cave tunnel', { size: 16 })}
      ${label(52, 286, 'the mouth', { size: 16 })}
      ${arrow('M70 276 L70 250', false, 1.6)}
      <path d="M76 120 q6 6 0 14 q-6 8 0 14" stroke="#1d6a4a" stroke-width="3"/>
      ${label(8, 112, 'the vein', { size: 16, color: '#1d6a4a' })}
      <path d="M80 140 L170 128" stroke-width="2" stroke-dasharray="5 4"/>
      ${label(100, 154, 'the crack', { size: 16 })}
      <ellipse cx="220" cy="120" rx="54" ry="44" fill="rgba(235,225,200,0.6)" stroke-width="2"/>
      <path d="M180 92 l6 -4 M196 82 l7 -3 M246 84 l6 4 M262 102 l5 5 M176 140 l-5 5 M200 160 l2 6 M240 160 l3 6" stroke-width="2.2"/>
      ${label(220, 116, 'nitre hall', { size: 17, anchor: 'middle' })}
      ${label(220, 136, 'white crust', { size: 15, anchor: 'middle' })}
      <path d="M258 146 L318 196" stroke-width="2" stroke-dasharray="5 4"/>
      <ellipse cx="370" cy="210" rx="60" ry="48" fill="rgba(60,200,140,0.18)" stroke-width="2"/>
      <path d="M418 180 q8 14 0 28 q-8 14 0 28" stroke="#1d6a4a" stroke-width="5"/>
      <path d="M340 186 q4 -6 8 0 q4 -6 8 0 M364 196 q4 -6 8 0 q4 -6 8 0" stroke-width="1.6"/>
      ${label(366, 222, 'vein hall', { size: 17, anchor: 'middle' })}
      ${label(366, 240, 'bats on the roof', { size: 15, anchor: 'middle' })}
      ${label(474, 168, 'the great vein', { size: 15, anchor: 'end', color: '#1d6a4a' })}
      <ellipse cx="300" cy="44" rx="24" ry="18" fill="rgba(235,225,200,0.6)" stroke-width="1.6"/>
      <path d="M262 92 L286 58" stroke-width="1.6" stroke-dasharray="4 4"/>
      ${label(330, 40, 'a nook: more nitre', { size: 15 })}`),

    // saltpetre: soak, filter through ash, boil down
    leach: () => sketch(`
      <path d="M30 120 L110 120 L100 200 L40 200 Z" fill="${WASH.water}" stroke-width="2"/>
      <path d="M44 150 q10 -6 20 0 q10 -6 20 0" stroke="rgba(235,230,215,1)" stroke-width="3"/>
      ${label(70, 228, '1. soak the nitre', { size: 16, anchor: 'middle' })}
      ${label(70, 246, 'in a pot of water', { size: 16, anchor: 'middle' })}
      ${arrow('M116 150 L168 150', false, 2)}
      <path d="M180 100 L270 100 L240 160 L210 160 Z" fill="rgba(185,182,174,0.6)" stroke-width="2"/>
      <path d="M225 162 L225 186" stroke="#3f6f98" stroke-width="2.2" stroke-dasharray="3 3"/>
      <path d="M200 186 L250 186 L244 214 L206 214 Z" fill="${WASH.water}" stroke-width="1.8"/>
      ${label(225, 238, '2. pour it through', { size: 16, anchor: 'middle' })}
      ${label(225, 256, 'wood ash', { size: 16, anchor: 'middle' })}
      ${arrow('M276 160 L320 160', false, 2)}
      <path d="M340 130 L420 130 L412 190 L348 190 Z" fill="rgba(180,112,74,0.45)" stroke-width="2"/>
      <path d="M352 196 q8 -16 16 0 q8 -18 16 0 q8 -16 16 0" fill="rgba(230,120,40,0.45)" stroke-width="1.6"/>
      <path d="M358 120 q6 -10 0 -18 M380 116 q6 -10 0 -18 M402 120 q6 -10 0 -18" stroke="rgba(150,150,150,1)" stroke-width="1.6"/>
      <path d="M364 176 l6 -8 l6 8 z M382 178 l5 -9 l5 9 z M396 176 l5 -7 l5 7 z" fill="rgba(245,242,232,1)" stroke-width="1.2"/>
      ${label(380, 238, '3. boil it down:', { size: 16, anchor: 'middle' })}
      ${label(380, 256, 'white crystals', { size: 16, anchor: 'middle' })}
      ${label(240, 290, 'At your fire: 6 nitre + 1 wood ash + a pot of water = 2 saltpetre', { size: 16, anchor: 'middle' })}`),

    // the revival fluid
    fluid: () => sketch(`
      <path d="M40 150 L120 150 L112 210 L48 210 Z" fill="rgba(180,112,74,0.45)" stroke-width="2"/>
      <path d="M52 166 q28 -8 56 0" stroke="rgba(60,200,140,0.9)" stroke-width="3"/>
      <path d="M50 216 q8 -14 16 0 q8 -16 16 0 q8 -14 16 0" fill="rgba(230,120,40,0.45)" stroke-width="1.6"/>
      <path d="M150 120 l8 -18 l8 18 z M168 124 l6 -14 l6 14 z" fill="${WASH.green}" stroke="#1d6a4a" stroke-width="1.8"/>
      <path d="M156 80 l10 -6 l10 6 l-10 6 z" fill="rgba(245,242,232,1)" stroke-width="1.4"/>
      ${label(190, 84, 'saltpetre (2)', { size: 16 })}
      ${label(190, 122, 'Revonite, ground (3)', { size: 16, color: '#1d6a4a' })}
      ${arrow('M150 132 L122 156', false, 1.6)}
      ${label(80, 246, 'warm it by the fire', { size: 16, anchor: 'middle' })}
      ${arrow('M132 186 L300 186', false, 2)}
      <path d="M350 270 L344 210 Q340 180 356 168 L352 140 Q352 118 372 116 Q392 118 392 140 L388 168 Q404 180 400 210 L394 270 Z" fill="${WASH.stone}" stroke-width="2"/>
      <path d="M362 150 l10 14 l-6 12 M384 190 l-8 16" stroke="#1d6a4a" stroke-width="2"/>
      <path d="M318 120 q20 -10 30 6" stroke="rgba(60,200,140,0.9)" stroke-width="3"/>
      ${label(430, 140, 'pour (E)', { size: 17 })}
      ${label(430, 160, 'over the', { size: 17 })}
      ${label(430, 180, 'sleeper', { size: 17 })}
      ${label(240, 290, 'Real: nitrate water. Invented: Revonite, which makes stone give way.', { size: 16, anchor: 'middle' })}`),

    // the night: the fire keeps the bear at the edge of the light
    bear: () => sketch(`
      <circle cx="200" cy="170" r="110" fill="rgba(240,170,80,0.15)" stroke-width="1.6" stroke-dasharray="7 6"/>
      <path d="M186 186 q6 -24 14 -6 q4 -20 12 -2 q6 -16 10 8" fill="rgba(230,120,40,0.55)" stroke-width="1.8"/>
      <path d="M176 196 L230 196" stroke-width="3"/>
      ${label(200, 222, 'your fire', { size: 16, anchor: 'middle' })}
      <path d="M380 128 q12 -16 34 -12 q20 -10 34 6 l8 18 l-12 2 l-4 -10 l-36 2 l-6 12 l-14 0 z" fill="rgba(60,40,25,0.6)" stroke-width="1.6"/>
      ${label(414, 168, 'the bear', { size: 16, anchor: 'middle' })}
      ${label(414, 186, 'circles in the dark', { size: 15, anchor: 'middle' })}
      ${arrow('M372 140 Q330 150 318 160', true, 1.8)}
      ${label(250, 60, 'the light: it will not cross', { size: 16 })}
      ${label(250, 78, 'while the fire burns high', { size: 16 })}
      ${label(16, 270, 'Low fire: it comes in. Out too long: it climbs to the shelter.', { size: 16, color: '#a8432e' })}`),

    // the ring
    ring: () => sketch(`
      <path d="M10 250 L60 200 L100 226 L160 170 L220 214 L280 160 L330 204 L380 176 L430 220 L470 196 L470 300 L10 300 Z" fill="rgba(70,75,85,0.35)" stroke-width="2"/>
      <ellipse cx="320" cy="130" rx="110" ry="74" stroke="#1d6a4a" stroke-width="3"/>
      <ellipse cx="320" cy="130" rx="118" ry="80" stroke="rgba(60,200,140,0.6)" stroke-width="1.4"/>
      <path d="M40 270 l0 -16 m-6 6 l6 -4 l6 4 m-6 -10 a4 4 0 1 0 0.1 0" stroke-width="1.8"/>
      ${label(54, 286, 'the Lookout', { size: 16 })}
      ${label(320, 40, 'a ring of green, standing', { size: 17, anchor: 'middle', color: '#1d6a4a' })}
      ${label(320, 58, 'far beyond the mountains', { size: 17, anchor: 'middle', color: '#1d6a4a' })}`),
  };

  // Each page: where it is in the book, when it opens up, the picture side (left) and the
  // words side (right): what he says, the science, and what to do in the game.
  const PAGES = [
    {
      id: 'roadmap', title: 'The Road to Morning', kicker: 'Start here', unlock: () => true, wide: true,
    },
    {
      id: 'body', title: 'Staying Alive', kicker: 'The body', unlock: () => true,
      left: () => `<div class="bars-figure">
          <div><i class="bar health"></i><b>Health</b><span>falls when you are hurt, starving or parched; heals slowly when you are fed and watered</span></div>
          <div><i class="bar stamina"></i><b>Stamina</b><span>sprinting (Shift), jumping and holding the bow drawn use it up: a full bar is over half a minute of sprinting, and it fills again in a couple of seconds</span></div>
          <div><i class="bar hunger"></i><b>Hunger</b><span>eat to fill it: fruit, berries, coconut</span></div>
          <div><i class="bar thirst"></i><b>Thirst</b><span>drink to fill it: the pond, the stream</span></div>
        </div>
        <p class="pcap">The four bars, bottom left of the screen.</p>`,
      say: [
        'A thousand years as a statue, and the first thing my body wants is... breakfast.',
        'Four bars tell me how I\'m doing. Watch the blue and the orange ones: when they run dry, the red one starts to fall.',
      ],
      science: 'A person can go weeks without food, but only about three days without water: you lose water with every breath and every drop of sweat. That is why thirst falls faster than hunger here, and faster still when you run.',
      game: [
        `${k('Q')} eats the food you are carrying (or click it in your kit, ${k('Tab')}).`,
        `${k('E')} at the edge of the pond or the stream drinks.`,
        `Low on hunger and thirst, you tire sooner: less stamina, slower feet.`,
      ],
      remember: 'Keep both above half and your wounds heal by themselves.',
    },
    {
      id: 'petrification', title: 'Why I Woke Up', kicker: 'The mystery', unlock: () => reached('exit'),
      left: () => `${DRAW.revival()}<p class="pcap">From bat droppings to a man breathing again: the chain, as I understand it.</p>`,
      say: [
        'One day a ring of green light crossed the sky and every human being turned to stone. Me too.',
        'A thousand years later, in a cave full of bats, water dripping on my head the whole time... I woke up. That\'s not luck. That\'s chemistry.',
        'Nobody else woke. So the answer is in that cave.',
      ],
      science: 'Bat droppings (guano) are rich in nitrogen. Bacteria in the cave turn it into ammonia, then nitrite, then nitrate: the white crust called nitre or saltpetre. People really did dig it out of bat caves for centuries, to make gunpowder. Guano also reacts with limestone to form real cave minerals such as brushite. <em>Revonite</em> is not real: in this story it is the strange green mineral that let the nitrate water eat through the stone.',
      game: [
        'The green glow in the cave wall is the Revonite. Remember where it is.',
        'Every statue you find (top right) is one more person waiting.',
      ],
      remember: 'Nitrate from guano + Revonite + time = the stone gives way.',
    },
    {
      id: 'statues', title: 'The People of Stone', kicker: 'The forest', unlock: () => flag('sawStatue') || reached('sustain'),
      left: () => `${photo('statue', 'Arms up against the light. Every one of them was caught in the middle of a moment.')}`,
      say: [
        'They\'re not statues. They\'re people. Walking, talking, shielding their eyes from that green light.',
        'Some have fallen over and sunk into the ground. Some have broken. I can\'t help them yet. But I can remember them.',
      ],
      science: 'Stone left outside for a thousand years weathers: rain, frost and roots open hairline cracks, and moss grows on every surface that faces the sky. That is why the ones deep in the jungle are greener than those near the cave.',
      game: [
        `Walk up to one and press ${k('E')} to look closely.`,
        'The counter at the top right shows how many you have found, out of 28.',
        'Looking at three of them is your first goal after leaving the cave.',
      ],
      remember: 'There are 28 of them in this valley. Find them all.',
    },
    {
      id: 'food', title: 'Food', kicker: 'The clearing', unlock: () => reached('sustain'),
      left: () => `<div class="photo-row">${photo('mango', 'Mango')}${photo('bananas', 'Banana')}${photo('coconut', 'Coconut')}</div>
        <div class="food-table">
          <div><b>Mango</b><span>food ${D.items.ITEMS.mango.food} · water ${D.items.ITEMS.mango.water}</span></div>
          <div><b>Banana</b><span>food ${D.items.ITEMS.banana.food} · water ${D.items.ITEMS.banana.water}</span></div>
          <div><b>Coconut</b><span>food ${D.items.ITEMS.coconut.food} · water ${D.items.ITEMS.coconut.water}</span></div>
          <div><b>Berries</b><span>food ${D.items.ITEMS.berries.food} · water ${D.items.ITEMS.berries.water}</span></div>
        </div>`,
      say: [
        'Ripe fruit falls to the ground under its tree. No hunting, no cooking. Perfect for day one.',
        'If there\'s nothing on the ground, shake the tree.',
      ],
      science: 'Fruit is mostly water and sugar, and sugar is the fastest fuel a body can burn. Coconut water is so close to the salts in your own blood that it quenches thirst too. A warning for the real world: many wild berries are poisonous. Never eat one you can\'t name. (These red ones are safe.)',
      game: [
        `Mangoes lie under the broad fruit trees in the clearing. ${k('E')} picks one up; ${k('E')} at the trunk shakes down three more.`,
        'Coconuts lie under the palms; bananas grow by the river and in the jungle; berry bushes dot the clearing.',
        `${k('Q')} eats whatever you have.`,
      ],
      remember: 'Mango first: it fills the most.',
    },
    {
      id: 'water', title: 'Water', kicker: 'The clearing', unlock: () => reached('sustain'),
      left: () => `${DRAW.water()}<p class="pcap">The pond lies at the west side of the clearing, the stream runs from it to the river.</p>`,
      say: [
        'Water first, always. Then food. Then shelter.',
        'The pond is fed by a spring, and the stream keeps it moving. Good. The river... looks wonderful, and would sweep me away.',
      ],
      science: 'Moving water from a spring carries fewer germs than still, stagnant water, but in real life you should still boil it: heat kills almost everything that can make you sick. The river here is wide, deep and fast: a strong current can carry off an adult in water only knee-deep.',
      game: [
        `Walk to the water\'s edge and press ${k('E')} to drink. Each drink fills a big part of the blue bar.`,
        'You can wade into shallow water; deep water stops you.',
      ],
      remember: 'Thirst falls fastest. Drink whenever you pass water.',
    },
    {
      id: 'sticks', title: 'Sticks and Stones', kicker: 'First tools', unlock: () => reached('sustain'),
      left: () => `<div class="photo-row">${photo('stick', 'Stick')}${photo('stone', 'Stone')}${photo('branch', 'Sturdy branch')}</div>
        <p class="pcap">Sticks for arrows, stones for knocking things into shape, sturdy branches for building.</p>`,
      say: [
        'Sticks and stones. Laugh if you like, but these are where every tool humans ever made began.',
        'Grab what you pass. You\'ll need more than you think.',
      ],
      science: 'A straight stick is a lever, a pole, a shaft for an arrow. A hard, rounded stone is a hammer: the oldest stone tools ever found, over three million years old, are just stones used to strike other stones.',
      game: [
        `${k('E')} picks things up. Sticks and stones lie all over the forest and the clearing.`,
        'Sticks become arrows (2 sticks and 1 flint make 2).',
        'Sturdy branches are bigger and heavier: you need 13 for the shelter, and most lie in the jungle beyond the gorge.',
      ],
      remember: 'Carry spare sticks: every 2 sticks is 2 more arrows.',
    },
    {
      id: 'flint', title: 'Flint', kicker: 'Science lesson 1', unlock: () => reached('weapon') || D.items.has('flint'),
      left: () => `${photo('flint', 'Flint: dark, glassy, hard as steel', 'small')}${DRAW.knap()}`,
      say: [
        'See this dull, glassy, dark grey stone? That\'s flint. And it is the most important rock in human history.',
        'Hit it the right way and it breaks into an edge sharper than any steel knife. With flint I can cut. With cutting, I can make everything else.',
      ],
      science: 'Flint is a kind of quartz (silicon dioxide, SiO₂) made of crystals far too small to see. With no grain to follow, it breaks in smooth, curved, shell-like surfaces (a "conchoidal fracture"), and the edge of each break can be just a few molecules thick. People made flint tools for more than two million years.',
      game: [
        'Flint lies on Flint Rise, the rocky high ground east of the clearing: dark, almost black stones.',
        `${k('E')} picks it up. You need at least 2 for the blade, and 1 more for every 2 arrows.`,
      ],
      remember: 'Dark and glassy = flint. Grey and dull = ordinary stone.',
    },
    {
      id: 'blade', title: 'The Flint Blade', kicker: 'Science lesson 2', unlock: () => reached('weapon') || D.items.has('flint'),
      left: () => `${photo('blade', 'Your flint blade', 'small')}${DRAW.blade()}`,
      say: [
        'Strike one flint against another and a thin, razor-sharp flake splits off. That\'s it. That\'s the trick.',
        'Bind that flake into a wooden grip and you have a knife. Humanity\'s first real tool, and my first one too.',
        'With it I can cut a young tree for a bow, shave arrows, and trim big leaves. No blade, no bow.',
      ],
      science: 'Striking flint near its edge at a glancing angle sends a shock wave through the stone that pops off a flake ("knapping"). A fresh flint flake is so sharp that some surgeons still use blades of volcanic glass, which breaks the same way, for the finest cuts.',
      game: [
        `Pick up 2 flint, open your kit with ${k('Tab')}, and choose Make on <b>Flint blade</b>.`,
        `Press ${k('2')} to hold it (${k('1')} puts it away).`,
        'You need it to cut a sapling into a bow stave, and to make the bow and the arrows.',
      ],
      remember: 'Flint blade = 2 flint. It is the key to everything else.',
    },
    {
      id: 'cord', title: 'Fibre and Cord', kicker: 'Science lesson 3', unlock: () => reached('weapon'),
      left: () => `${photo('fibre', 'Fibre grass: tall, tough, yellow', 'small')}${DRAW.cord()}`,
      say: [
        'A bow needs a string, and a string needs fibre. That tough yellow grass up on the rise is full of it.',
        'One fibre snaps. Twist a few together the right way, and you get cord strong enough to hold a bow bent.',
      ],
      science: 'Grass and plant stems are full of long strands of cellulose. Twist each bundle one way, then wrap two bundles around each other the other way, and the two twists push against each other and lock. This is how rope has been made for at least 50,000 years.',
      game: [
        `Pull fibre from the tall yellow grass on Flint Rise with ${k('E')}: 2 fibres a clump.`,
        `In your kit (${k('Tab')}), <b>Cord</b> = 3 plant fibres.`,
      ],
      remember: 'Cord = 3 fibres. You need 1 for the bow.',
    },
    {
      id: 'bow', title: 'The Bow', kicker: 'Science lesson 4', unlock: () => reached('weapon'),
      left: () => `${photo('bow', 'Your bow: a sapling stave and a fibre string', 'small')}${DRAW.bow()}`,
      say: [
        'I can\'t outrun a tiger, and I can\'t out-punch one. So I won\'t be anywhere near it.',
        'A bow is a spring. I bend it slowly, with my own strength... and it lets all of that go in an instant, into the arrow.',
        'It needs a young, straight tree: springy, without knots. Old dead branches just snap.',
      ],
      science: 'When you draw a bow, the side facing the target (the back) is stretched and the side facing you (the belly) is squeezed. Wood resists both, and stores the energy of your pull like a spring. Bowyers have long used young, straight, springy wood such as yew, ash or hickory.',
      game: [
        'Find a young, thin tree (a sapling) on Flint Rise. With the flint blade, press <kbd>E</kbd> on it to cut a <b>bow stave</b>.',
        `In your kit, <b>Bow</b> = 1 stave + 1 cord (uses the blade).`,
        `${k('3')} holds the bow. Hold the <b>right</b> mouse button to aim, hold the <b>left</b> to draw, let go to shoot.`,
      ],
      remember: 'Bow = sapling stave + cord. A full draw shoots hardest.',
    },
    {
      id: 'arrows', title: 'Arrows', kicker: 'Science lesson 5', unlock: () => reached('weapon'),
      left: () => `${photo('arrow', 'An arrow: stick, flint point, leaf fletching', 'small wide strip')}${DRAW.arrows()}`,
      say: [
        'A straight stick, a sharp point, something at the back to keep it straight. Simple. But every part has a job.',
        'Gravity pulls every arrow down. Far away, I aim a little above what I want to hit.',
      ],
      science: 'A heavy point in front and light fletching behind keep an arrow pointing the way it flies, the way a weather vane turns into the wind. A harder draw sends it faster, so it has less time to fall: a full draw flies almost flat; a weak one drops short.',
      game: [
        `In your kit, <b>Arrows</b> = 2 sticks + 1 flint, for 2 arrows (uses the blade).`,
        'Missed arrows stick in the ground or in trees: walk up and press <kbd>E</kbd> to take them back.',
        'The number on the bow slot shows how many you have.',
      ],
      remember: 'Make at least 4. Pick them up after every fight.',
    },
    {
      id: 'tiger', title: 'The Tiger', kicker: 'Danger', unlock: () => flag('tigerSeen') || reached('weapon'),
      left: () => `${photo('tiger', 'It lairs in the gorge, the only way north', 'small wide')}${DRAW.tiger()}`,
      say: [
        'The gorge is the only way north, and something lives in it. Something big.',
        'It doesn\'t want to eat me. It wants me gone. It warns, it charges, and once it has made its point it goes back to its den.',
        'That\'s my chance: stay far away and shoot while it turns its back.',
      ],
      science: 'Tigers are territorial: a tiger defends the ground around its den and usually warns an intruder off (a growl, a mock charge) before it fights. A real tiger can run at 60 km/h for short bursts, faster than any human. Distance is your only armour.',
      game: [
        'Come close and it rises and growls; come closer and it charges.',
        'Bare hands are useless. Make the bow first.',
        'Shoot from the edge of its warning ring. When it strikes and falls back to its den, shoot again. A hit to the head counts for more.',
      ],
      remember: 'Distance. Shoot, step back, shoot again.',
    },
    {
      id: 'shelter', title: 'A Shelter in the Trees', kicker: 'Before nightfall', unlock: () => reached('plan'),
      left: () => `${DRAW.shelter()}<div class="needs-table">${D.shelter.STAGES.map((s) => `<div><b>${s.label}</b><span>${Object.entries(s.needs).map(([key, n]) => `${n} ${n > 1 ? D.items.ITEMS[key].plural.toLowerCase() : D.items.ITEMS[key].name.toLowerCase()}`).join(', ')}</span></div>`).join('')}</div>`,
      say: [
        'At night the big animals come out. I won\'t sleep on the ground.',
        'Up in a great tree, on a platform, under a roof of leaves: nothing on four legs can reach me, and the rain will run off.',
        'Nothing in the clearing is big enough. The jungle beyond the gorge has the vines, branches and huge leaves I need.',
      ],
      science: 'A raised platform keeps you away from prowling animals, from cold, wet ground, from crawling insects and from floodwater. A sloping roof sheds rain, and leaves laid from the bottom row up, each overlapping the one below like roof tiles, carry the water down and off.',
      game: [
        'Get past the tiger in the gorge, then gather in the jungle to the north.',
        `Find the Elder Tree (the marker on your map, ${k('M')}). Stand under it and press ${k('E')} to build each part: frame, floor and ladder, roof.`,
        `When it is done, climb up the ladder (${k('E')}) and lie down to rest until dawn.`,
      ],
      remember: '13 branches, 8 vines, 10 big leaves, 6 leaves.',
    },
    {
      id: 'jungle', title: 'Vines, Leaves and Branches', kicker: 'The jungle', unlock: () => reached('plan'),
      left: () => `<div class="photo-row">${photo('bananaPlant', 'Banana plant')}${photo('elephantEar', 'Elephant-ear')}${photo('branch', 'Sturdy branch')}</div>${DRAW.vine()}`,
      say: [
        'The jungle is a hardware store, if you know what you\'re looking at.',
        'Vines for rope. Banana and elephant-ear leaves for the roof. Fallen branches for the frame. Ferns for a bed.',
      ],
      science: 'Lianas (jungle vines) are woody stems that climb trees towards the light: strong and flexible, they make natural rope. Banana and elephant-ear leaves are huge and covered in a waxy layer that sheds water, which is why people across the tropics still thatch with them.',
      game: [
        `Vines hang from the big trees in the jungle: ${k('E')} pulls one down.`,
        `${k('E')} on a banana or elephant-ear plant cuts 2 big leaves; ${k('E')} on ferns gathers ordinary leaves.`,
        `Sturdy branches lie along the jungle trail: ${k('E')} picks them up.`,
      ],
      remember: 'Big leaves: banana and elephant-ear plants. Vines: hanging from tall trees.',
    },
    // ---------- Chapter 2 ----------
    {
      id: 'road2', title: 'The Road to Waking', kicker: 'Chapter 2', unlock: () => reached('c2wake'), wide: true, chapter2: true,
    },
    {
      id: 'fire', title: 'Fire', kicker: 'Science lesson 6', unlock: () => reached('c2fire'),
      left: () => DRAW2.drill(),
      say: [
        'Everything starts with fire: it lights the dark, bakes clay, boils water down to crystals.',
        'Rub wood on wood and it gets hot. A bow does the rubbing. Rhythm wins, not speed.',
      ],
      science: 'Friction turns the bow\'s motion into heat. Where the spindle grinds into the hearth board, the wood dust heats until, at about 400 °C, it smoulders: an ember. Given dry tinder and a breath of air (oxygen), it bursts into flame.',
      game: [
        'The fire pit: 8 stones and 4 sticks, E at the camp by the pond (the marker).',
        `Tinder: 1 stick, 2 plant fibre. E at the pit, then ${k('A')} ${k('D')} ${k('A')} ${k('D')}... about two a second. The ember glows: ${k('E')}.`,
        `Feed it sticks or branches (${k('E')}). A burning fire leaves wood ash.`,
      ],
      remember: 'A, D, A, D: steady, not frantic. Then E.',
    },
    {
      id: 'clay', title: 'Clay and Fire', kicker: 'Science lesson 7', unlock: () => reached('c2clay'),
      left: () => DRAW2.clay(),
      say: [
        'River clay. Wet, it takes any shape. Baked, it never goes back.',
        'Three pots: one to boil, one to brew in, one spare. Everything after this needs a pot.',
      ],
      science: 'Clay is made of tiny flat mineral flakes. Wet, water lets them slide over each other, so you can shape it. Dried and heated in a fire, the water leaves, and above about 600 °C the flakes start to fuse together: it has become ceramic, and it stays hard and holds water. People have made pots this way for about 20,000 years.',
      game: [
        `Make a digging stick in your kit (${k('Tab')}, Make): 1 stick, shaped with the blade.`,
        'The Clay Banks: follow the stream west from the pond to where it meets the river. The grey mounds in the bank are clay: E digs 2.',
        `Back at your fire: ${k('Tab')}, At the fire, Clay pots (6 clay). They bake for about 45 seconds while you do other things.`,
      ],
      remember: 'Dig at the river, shape at the fire. 6 clay = 3 pots.',
    },
    {
      id: 'torches', title: 'Torches', kicker: 'Science lesson 8', unlock: () => reached('c2torch'),
      left: () => DRAW2.torch(),
      say: [
        'The crack in the cave needs light I can carry.',
        'Fibre holds the flame; resin feeds it. The Elder Tree weeps resin from its bark.',
      ],
      science: 'Tree resin is full of oily compounds (terpenes) that burn slowly with a bright flame. Wrapped in fibre, which acts like a wick, it keeps a torch alight for minutes where bare wood would only smoulder.',
      game: [
        'Resin: amber beads on the Elder Tree\'s bark, at the end of the jungle trail. E with the flint blade cuts them (2 each).',
        `Each torch: 1 stick, 1 plant fibre, 1 resin (${k('Tab')}, Make). Make three.`,
        `Light one at your fire (${k('E')}); ${k('4')} holds it. It burns about three minutes; when it goes, the next lights from it.`,
      ],
      remember: 'Three torches before the galleries. 4 holds one.',
    },
    {
      id: 'galleries', title: 'The Nitre Galleries', kicker: 'The cave, deeper', unlock: () => reached('c2cave'),
      left: () => DRAW2.galleries(),
      say: [
        'Cold air was coming out of that crack. The cave goes on, behind the vein.',
        'The walls in there are white. Bats have roosted in these halls for a thousand years.',
      ],
      science: 'Bat guano is rich in nitrogen. Soaked by seeping water, it turns into nitrate salts, which creep up the cave walls and dry into a white crust: nitre. Real caves were mined for it; in 1812 Mammoth Cave in Kentucky was dug for nitre to make gunpowder.',
      game: [
        `Hold a lit torch (${k('4')}): in the galleries it is the only light.`,
        'The crack is in the tunnel wall beside the green vein, where you first woke. Squeeze through.',
        'Nitre: the white crust low on the walls of the first hall. E with the blade scrapes 2. You need 6.',
        'Through the passage: the hall of the great vein. E with a stone chips Revonite shards. You need 3.',
      ],
      remember: 'Torch, blade, stone. 6 nitre, 3 Revonite.',
    },
    {
      id: 'saltpetre', title: 'Saltpetre', kicker: 'Science lesson 9', unlock: () => reached('c2salt'),
      left: () => DRAW2.leach(),
      say: [
        'Nitre from a cave wall is dirty. I need it pure.',
        'Water to dissolve it, ash to change it, fire to boil it down. The old saltpetre men did exactly this.',
      ],
      science: 'Cave nitre is mostly calcium nitrate, which stays wet and sticky. Wood ash contains potash (potassium carbonate). Poured through ash, the calcium drops out as chalk and potassium nitrate is left in the water: saltpetre. Boiling it down concentrates it until white crystals form. For centuries, this was how saltpetre was made by hand.',
      game: [
        'A pot of water: E at the edge of the pond with an empty clay pot.',
        'Wood ash: a burning fire leaves it; E at the fire scoops it out.',
        `${k('Tab')}, At the fire, Saltpetre: 6 nitre, 1 ash and the pot of water. It boils down in about 30 seconds into 2 saltpetre (and you get the pot back).`,
      ],
      remember: 'Soak, filter through ash, boil.',
    },
    {
      id: 'fluid', title: 'The Revival Fluid', kicker: 'Science lesson 10', unlock: () => reached('c2fluid'),
      left: () => DRAW2.fluid(),
      say: [
        'Nitrate water and Revonite, given time, ate through my stone. Here it took a thousand years of dripping.',
        'Concentrated, warmed, with the Revonite ground fine... it should take minutes.',
      ],
      science: 'The real part: nitrates dissolve well in water and react with stone such as limestone. The invented part, as in Chapter 1: Revonite. In this story it is the catalyst that lets the nitrate water break the green light\'s stone shell. (Dr. Stone\'s own revival fluid is different: nitric acid with alcohol.)',
      game: [
        `${k('Tab')}, At the fire, Revival fluid: 2 saltpetre, 3 Revonite shards and a pot of water. It warms for about 25 seconds.`,
        'One dose wakes one person. Take it to the runner by the cave mouth and press E.',
      ],
      remember: 'One dose, one person.',
    },
    {
      id: 'teo', title: 'Teo', kicker: 'The second waking', unlock: () => reached('c2escort'),
      left: () => `${photo('statue', 'The runner, as he was for a thousand years')}<p class="pcap">He was running toward the cave when the light came.</p>`,
      say: [
        'His name is Teo. He was a geologist; he had mapped the cave, the nitre beds, the green mineral.',
        'He was running toward the cave when the light came. He knew something.',
      ],
      science: 'Waking takes a toll: after a thousand years, his muscles are weak and stiff. Like anyone after a long illness, he will walk slowly at first and grow stronger day by day.',
      game: [
        'Teo follows you. On the first evening he walks slowly: do not leave him far behind.',
        'At night he keeps watch from the shelter in the Elder Tree.',
      ],
      remember: 'Two of you now.',
    },
    {
      id: 'night2', title: 'The Second Night', kicker: 'Danger', unlock: () => reached('c2escort'),
      left: () => DRAW2.bear(),
      say: [
        'Something big comes to the Elder Tree at night. The bear.',
        'Animals fear fire. As long as mine burns high, it keeps its distance.',
      ],
      science: 'Most wild animals avoid fire: to them it means danger, and its light leaves them seen. A bear will test a camp, though, if it smells food and the fire burns low. An arrow, or a burning torch waved at it, sends it off.',
      game: [
        'Before dark: bring Teo to the Elder Tree, gather firewood (dead wood lies all round it), and build and light a fire pit by the ladder.',
        'All night: keep the fire burning (E adds wood). If it goes out for long, the bear goes for the shelter.',
        `If the bear comes close: shoot it (${k('3')}), or face it with a lit torch (${k('4')}).`,
      ],
      remember: 'Keep the fire high. Wood, wood, wood.',
    },
    {
      id: 'ring', title: 'The Ring', kicker: 'What they saw', unlock: () => reached('c2dawn'),
      left: () => DRAW2.ring(),
      say: [
        'Teo saw the light come from the north-east. A ring of green fire, he said.',
        'From the Lookout, over the ridge, you can see it still.',
      ],
      science: 'Nobody knows yet. That is the next chapter.',
      game: [
        'The Lookout: up the goat trail on the far side of Flint Rise, to the cairn on the ledge on the eastern slope.',
      ],
      remember: 'Whatever made the light is still out there.',
    },
    // ---------- Chapter 3 ----------
    {
      id: 'smoke', title: 'Smoke', kicker: 'Science lesson 11', unlock: () => reached('c3bear'),
      left: () => DRAW3.smoke(),
      say: [
        'The bear is in the tunnel, hurt and angry. I am not going in after it.',
        'Teo\'s idea: smoke. Green ferns on a fire at the mouth, and the cave breathes it in.',
      ],
      science: 'Dry wood burns cleanly, but green leaves are full of water and oils: they smoulder instead of burning, and give off thick smoke (steam, soot and gases). A cave with an opening further in draws air through it like a chimney, so smoke at the mouth is carried inside. Animals run from smoke: it stings the eyes and the lungs, and it means fire.',
      game: [
        'Gather 6 ferns (E on any fern: 3 a plant) and 4 sticks.',
        'Light a torch at a fire, then go to the cave mouth: E piles the wood and ferns, E again lights it.',
        'Then stand to one side: it comes out running.',
      ],
      remember: 'Green leaves smoke; dry wood burns.',
    },
    {
      id: 'mira', title: 'Mira', kicker: 'The third waking', unlock: () => reached('c3mira'),
      left: () => `${photo('statue', 'She was right behind Teo when he ran')}<p class="pcap">Arms over her face, a thousand years.</p>`,
      say: [
        'Teo\'s friend. She drew the pictures for his cave survey, and sewed their tents.',
        'Give her fibre and she braids rope. Cotton, and she makes bandages. A wall, and she paints our story on it.',
      ],
      science: 'Before printing, every map, every chart and every picture of a plant or a mineral was drawn by hand. Scientific illustrators like Mira were how discoveries were recorded and shared.',
      game: [
        'Mira follows you. When you need rope or bandages, the card says what to bring her: E by her gives it.',
      ],
      remember: 'Three of us now.',
    },
    {
      id: 'axe', title: 'The Stone Axe', kicker: 'Science lesson 12', unlock: () => reached('c3axe'),
      left: () => DRAW3.axe(),
      say: [
        'Poles for the lab: young trees, cut through. The blade is too small for that.',
        'A heavier edge, on a handle: swung, it does the work for me.',
      ],
      science: 'A handle turns your arm into a longer lever, so the head arrives much faster and hits much harder. Warm tree resin is sticky; cooled, it sets hard, a natural glue. People have hafted stone axes this way, glue and lashing, for over 40,000 years.',
      game: [
        'Kit (Tab), Make: the stone axe. 1 flint, 1 stick, 1 vine, 1 resin.',
        'Resin: the amber beads on the Elder Tree\'s bark (E with the blade).',
        'Young trees, thin and pale: E with the axe fells one for 2 poles.',
      ],
      remember: 'Flint, stick, vine, resin.',
    },
    {
      id: 'lab', title: 'Walls of Sticks and Mud', kicker: 'Science lesson 13', unlock: () => reached('c3home'),
      left: () => DRAW3.wattle(),
      say: [
        'A storeroom we can walk into: dry, safe, a name on every pot.',
        'Tall enough to stand up in. I am tired of crouching under leaves.',
      ],
      science: 'Wattle and daub: thin sticks woven between upright stakes, then wet clay (often mixed with straw or dung) pressed into the weave and smoothed. It dries hard, keeps out the wind and the rain, and has been used for at least 6,000 years. Some houses built like this are still standing.',
      game: [
        'Five parts, each built with E at the marked spot by the Elder Tree (Tab, Build the lab, shows what each needs):',
        'Posts (4 poles, 2 vines); walls (14 sticks, 2 vines); clay walls and hearth (6 clay, 4 stones); roof (4 poles, 14 big leaves, 3 vines); racks (2 poles, 6 sticks, 2 vines).',
        'Inside: E at a pot stores what you carry of its kind, or takes it out. Look at the pot you want.',
        'Its hearth, by the door, brews three doses at once (Tab, At the fire).',
      ],
      remember: 'Weave, then daub, then thatch.',
    },
    {
      id: 'paint', title: 'Paint from the Earth', kicker: 'Science lesson 14', unlock: () => reached('c3labelled'),
      left: () => DRAW3.paint(),
      say: [
        'Mira painted a name on every pot. Then she painted us, on the wall.',
        'Red from the earth, black from the fire.',
      ],
      science: 'The oldest paints are minerals ground to powder: red and yellow ochre (clay coloured by iron oxide, rust), black from charcoal, white from ash or chalk. Mixed with something sticky (resin, egg, plant gum, fat), they stay where you put them. Cave paintings made like this have lasted over 40,000 years.',
      game: [
        'The lab\'s pots: FLUID, REVONITE, NITRE, SALTPETRE, ASH, RESIN, WATER, FIBRE, CLAY, SEEDS.',
      ],
      remember: 'Every pot has its name.',
    },
    {
      id: 'nitre2', title: 'Nitre from Droppings', kicker: 'Science lesson 15', unlock: () => reached('c3dose'),
      left: () => DRAW3.guano(),
      say: [
        'Teo showed me the dark mounds under the bat roost. Richer than the walls.',
        'Three doses need nine nitre and nine Revonite. The best Revonite is high on the wall: a ladder.',
      ],
      science: 'Bat and bird droppings (guano) are full of nitrogen. Over years, bacteria in the soil turn it into nitrates, the salts we call nitre. For centuries people dug nitre from guano caves and dung heaps to make saltpetre; whole armies depended on it.',
      game: [
        'In the vein hall, under the roost: E with the blade scrapes a guano bed (3 nitre). The white crust on the walls gives 2.',
        'The high seam: build a ladder against the vein wall (6 sticks, 3 vines), then E chips it (3 Revonite a time, with a stone).',
        'Hold a lit torch (4): it is dark in there.',
      ],
      remember: 'Under the bats: nitre.',
    },
    {
      id: 'garron', title: 'Garron', kicker: 'The stone giant', unlock: () => reached('c3giant'),
      left: () => `${photo('statue', 'Teo found him by the Tiger\'s Gorge')}<p class="pcap">Strong enough to carry a log alone.</p>`,
      say: [
        'Teo brought him home on a sledge. A huge man, calm when he woke, as if he expected it.',
        'For one day he was the best thing that happened to us.',
      ],
      science: 'Strength is not the same as being right.',
      game: [
        'He teaches you the spear, and trains you: afterwards your stamina lasts longer and comes back faster.',
      ],
      remember: 'Wake people you can trust.',
    },
    {
      id: 'spear', title: 'The Spear', kicker: 'Science lesson 16', unlock: () => reached('c3strong'),
      left: () => DRAW3.spear(),
      say: [
        'Garron: "You fight with sticks and stones, little scientist."',
        'A long stave, a flint point, vine to bind it. Reach, and my weight behind it.',
      ],
      science: 'A spear keeps danger two metres away, and drives your whole body\'s weight into one sharp point: the force is spread over a tiny area, so it goes in deep. The longer the shaft, the more reach, but the harder it is to move quickly.',
      game: [
        'Kit (Tab), Make: the spear (1 stave, 1 flint, 1 vine; uses the blade). A stave: cut a young sapling.',
        `${k('5')} holds it; left mouse jabs. Five hits on Garron\'s post: stronger for good.`,
      ],
      remember: '5, then left mouse.',
    },
    {
      id: 'lever', title: 'Levers', kicker: 'Science lesson 17', unlock: () => reached('c3pass'),
      left: () => DRAW3.lever(),
      say: [
        'A rockslide in the pass. Nothing I can lift.',
        'But a long pole over a stone can: give me a place to stand.',
      ],
      science: 'A lever trades distance for force. Push down on the long end and the short end rises with as many times the force as the long arm is longer than the short one: a pole three times longer on your side lifts three times your push. Archimedes said: give me a place to stand, and I will move the Earth.',
      game: [
        'A long pole (fell a young tree with the axe) and a stone.',
        'E at the boulder sets the lever; E again: lean on it.',
      ],
      remember: 'Long arm, small push; short arm, big lift.',
    },
    {
      id: 'rope', title: 'Rope', kicker: 'Science lesson 18', unlock: () => reached('c3ravine'),
      left: () => DRAW3.rope(),
      say: [
        'The old bridge rusted through and fell. Mira braided a rope; an arrow carried it across.',
        'Then hand over hand, with nothing under me.',
      ],
      science: 'One fibre is weak and short. Twisted together, friction locks them: a yarn. Several yarns twisted the other way lock each other too, so pulling on the rope only squeezes it tighter. Rope like this has been made for at least 50,000 years.',
      game: [
        'Give Mira 8 plant fibre (E by her): a rope.',
        'Kit (Tab), Make: a rope arrow (1 arrow, 1 rope). With the bow (3), the rope arrow goes first: shoot it into the big tree across.',
        'E at the post, then hold W. Let go to rest your arms; S goes back.',
      ],
      remember: 'Rope arrow, the big tree, hand over hand.',
    },
    {
      id: 'compass', title: 'The Compass', kicker: 'Science lesson 19', unlock: () => reached('c3meadow'),
      left: () => DRAW3.compass(),
      say: [
        'A stone hiker on the old road, a compass in his hand. The needle still swings north.',
        'North... and the green ring is north-east.',
      ],
      science: 'The Earth is a giant, weak magnet. A magnetised needle, free to turn, lines up with its field and points (near enough) north. Magnetism does not wear out with time, so a thousand years later, the needle still knows the way.',
      game: [
        'The compass shows at the top of your screen once you have it.',
        'The High Meadow: the old road, the car under the moss, the sign; wild cotton (E) for Mira\'s bandages. Q binds one when you are hurt.',
      ],
      remember: 'North is up the strip at the top.',
    },
    {
      id: 'wolves', title: 'Wolves', kicker: 'Danger', unlock: () => reached('c3wolves'),
      left: () => DRAW3.wolves(),
      say: [
        'They followed us across the meadow. Not one animal, like the bear: a pack.',
        'Fire, and our backs to the rock.',
      ],
      science: 'Wolves hunt together: they circle, tire their prey, and dart in from different sides. Most wild animals fear fire. A pack facing a fire and people who fight back will usually give up and look for easier food.',
      game: [
        'Light the fire under the overhang (a torch, or the bow drill) and stay close to it.',
        'Spear (5) or bow (3) for any that dart in. Drive off three, or hold them off long enough, and they go.',
        'Hurt? Q binds a bandage.',
      ],
      remember: 'Stay by the fire.',
    },
    {
      id: 'village', title: 'The Village', kicker: 'What they found', unlock: () => reached('c3river'),
      left: () => DRAW3.village(),
      say: [
        'Smoke, rooftops, a bridge of planks and ropes. And people, moving.',
        'Someone else found the way back.',
      ],
      science: 'Who woke them? How? That is Chapter 4.',
      game: [
        'Down the road east from the overhang to the river gorge, and the bridge.',
      ],
      remember: 'Alive.',
    },
    {
      id: 'controls', title: 'Controls', kicker: 'How to play', unlock: () => true,
      left: () => `<div class="keys-figure">
          <div><em>${k('W')}${k('A')}${k('S')}${k('D')}</em><span>walk (${k('Shift')} sprints, ${k('Alt')} walks slowly)</span></div>
          <div><em>${k('Space')}</em><span>jump</span></div>
          <div>Mouse<span>look around (click the game first to capture the mouse)</span></div>
          <div><em>${k('E')}</em><span>pick up, use, examine, drink, build, climb</span></div>
          <div><em>${k('Q')}</em><span>eat</span></div>
          <div><em>${k('Tab')}</em><span>your kit: what you carry, and what you can make</span></div>
          <div><em>${k('B')}</em><span>these field notes</span></div>
          <div><em>${k('M')}</em><span>the map</span></div>
          <div><em>${k('1')}${k('2')}${k('3')}${k('4')}${k('5')}</em><span>hands, flint blade, bow, torch, spear</span></div>
          <div>Right / left mouse<span>with the bow: aim / draw and shoot</span></div>
          <div><em>${k('Esc')}</em><span>pause, settings, back to a checkpoint</span></div>
        </div>`,
      say: [
        'If you get lost, open these notes. The page for what I\'m doing right now is always the one the book opens at.',
      ],
      science: 'The game saves by itself: everything you pick up, make or build is kept the moment you have it, even if the page is reloaded (Continue, on the title). If you die, you wake where your current goal began, still carrying everything.',
      game: [
        `${k('←')} ${k('→')} or ${k('A')} ${k('D')} turn the pages here; ${k('B')} or ${k('Esc')} closes the book.`,
      ],
      remember: 'Lost? B, then read the page it opens at.',
    },
  ];

  // The page for what you are doing now.
  const PAGE_FOR = {
    exit: 'body', explore: 'petrification', sustain: 'food', plan: 'shelter', weapon: 'blade', hunt: 'tiger', shelter: 'jungle', dusk: 'shelter',
    c2wake: 'road2', c2fire: 'fire', c2clay: 'clay', c2torch: 'torches', c2cave: 'galleries', c2salt: 'saltpetre', c2fluid: 'fluid', c2revive: 'fluid',
    c2escort: 'night2', c2night: 'night2', c2dawn: 'ring',
    c3talk: 'mira', c3bear: 'smoke', c3dose: 'nitre2', c3mira: 'mira', c3home: 'lab', c3axe: 'axe', c3lab: 'lab', c3minerals: 'nitre2', c3labelled: 'paint', c3brew: 'lab',
    c3night: 'paint', c3giant: 'garron', c3garron: 'garron', c3strong: 'spear', c3argue: 'garron', c3jungle: 'garron', c3pack: 'lab', c3pass: 'lever', c3ravine: 'rope',
    c3meadow: 'compass', c3wolves: 'wolves', c3river: 'village',
  };
  const OBJECTIVE_PAGE = {
    exit: 'The body', explore: 'Why I woke up', sustain: 'Food and water', plan: 'The shelter', weapon: 'The flint blade and the bow', hunt: 'The tiger', shelter: 'Vines, leaves and branches', dusk: 'The shelter',
    c2wake: 'The road to waking', c2fire: 'Fire (the bow drill)', c2clay: 'Clay and fire', c2torch: 'Torches', c2cave: 'The Nitre Galleries', c2salt: 'Saltpetre', c2fluid: 'The revival fluid', c2revive: 'The revival fluid',
    c2escort: 'The second night', c2night: 'The second night', c2dawn: 'The ring',
    c3talk: 'Mira', c3bear: 'Smoke', c3dose: 'Nitre from droppings', c3mira: 'Mira', c3home: 'Walls of sticks and mud', c3axe: 'The stone axe', c3lab: 'Walls of sticks and mud',
    c3minerals: 'Nitre from droppings', c3labelled: 'Paint from the earth', c3brew: 'Walls of sticks and mud', c3night: 'Paint from the earth', c3giant: 'Garron', c3garron: 'Garron',
    c3strong: 'The spear', c3argue: 'Garron', c3jungle: 'Garron', c3pack: 'Walls of sticks and mud', c3pass: 'Levers', c3ravine: 'Rope', c3meadow: 'The compass', c3wolves: 'Wolves', c3river: 'The village',
  };

  // ---------- The roadmap ----------

  function roadmap() {
    const it = D.items;
    const done = {
      flint: it.has('flint', 2) || it.has('blade'), blade: it.has('blade'), sapling: it.has('stave') || it.has('bow'), stave: it.has('stave') || it.has('bow'),
      fibre: it.has('fiber', 3) || it.has('cord') || it.has('bow'), cord: it.has('cord') || it.has('bow'), bow: it.has('bow'),
      sticks: it.has('arrow', 1), arrows: it.has('arrow', 4) || flag('tigerDead'), tiger: flag('tigerDead'),
      jungle: D.shelter.stage >= 3 || (it.has('branch', 13) && it.has('vine', 8) && it.has('big_leaf', 10)), shelter: D.shelter.stage >= 3, night: reached('dawn'),
    };
    const next = ['flint', 'blade', 'sapling', 'fibre', 'cord', 'bow', 'sticks', 'arrows', 'tiger', 'jungle', 'shelter', 'night'].find((n) => !done[n]);
    const node = (id, x, y, title, sub, pic) => {
      const state = done[id] ? 'done' : id === next ? 'next' : '';
      const src = pic ? picture(pic) : '';
      return `<g class="node ${state}" transform="translate(${x} ${y})">
        <rect width="132" height="74" rx="10"/>
        ${src ? `<image href="${src}" x="3" y="10" width="54" height="54"/>` : ''}
        <text x="${src ? 60 : 12}" y="30" class="nt">${title}</text>
        <text x="${src ? 60 : 12}" y="54" class="ns">${sub}</text>
        ${state === 'done' ? '<path class="tick" d="M110 12 l6 8 l12 -16"/>' : ''}
      </g>`;
    };
    const line = (d) => `<path class="edge" d="${d}" marker-end="url(#ah)"/>`;
    // five columns of 132 wide, four rows of 74 high
    const X = [14, 176, 338, 500, 662];
    const Y = [14, 112, 210, 308];
    return `<svg class="roadmap" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">${DEFS}
      ${line(`M146 51 L172 51`)}
      ${line(`M146 149 L172 149`)}
      ${line(`M242 88 L242 108`)}
      ${line(`M146 247 L172 247`)}
      ${line(`M146 345 L172 345`)}
      ${line(`M308 149 L336 188`)}
      ${line(`M308 247 L336 208`)}
      ${line(`M470 198 L498 258`)}
      ${line(`M308 345 L498 290`)}
      ${line(`M632 272 L658 272`)}
      ${line(`M728 235 L728 190`)}
      ${line(`M728 112 L728 92`)}
      ${node('flint', X[0], Y[0], 'Flint \u00d7 2', 'Flint Rise', 'flint')}
      ${node('blade', X[1], Y[0], 'Flint blade', 'kit: 2 flint', 'blade')}
      ${node('sapling', X[0], Y[1], 'A sapling', 'young tree, Flint Rise', null)}
      ${node('stave', X[1], Y[1], 'Bow stave', 'cut it with the blade', null)}
      ${node('fibre', X[0], Y[2], 'Fibre \u00d7 3', 'yellow grass', 'fibre')}
      ${node('cord', X[1], Y[2], 'Cord', 'kit: 3 fibre', null)}
      ${node('sticks', X[0], Y[3], 'Sticks', '+ 1 flint', 'stick')}
      ${node('arrows', X[1], Y[3], 'Arrows', 'make 4+', 'arrow')}
      ${node('bow', X[2], 161, 'Bow', 'stave + cord', 'bow')}
      ${node('tiger', X[3], 235, 'Tiger', 'opens the way', 'tiger')}
      ${node('jungle', X[4], 235, 'Jungle', 'gather here', 'bananaPlant')}
      ${node('shelter', X[4], 112, 'Shelter', 'in the Elder Tree', null)}
      ${node('night', X[4], 14, 'Morning', 'you survived', null)}
      <text x="352" y="36" class="ns">The blade also shapes</text>
      <text x="352" y="56" class="ns">the bow and the arrows.</text>
      <text x="514" y="130" class="ns">Beyond the gorge:</text>
      <text x="514" y="150" class="ns">13 branches, 8 vines,</text>
      <text x="514" y="170" class="ns">10 big leaves, 6 leaves.</text>
    </svg>`;
  }

  // Chapter 2's road: from fire to a second waking.
  function roadmap2() {
    const it = D.items;
    const fire = D.camp && D.camp.fire('day');
    const done = {
      fire: !!(fire && (fire.lit || fire.ash > 0)) || reached('c2clay'), clay: it.has('pot', 3) || reached('c2torch'),
      torches: reached('c2cave'), ash: it.has('ash') || reached('c2fluid'),
      galleries: (it.has('nitre', 6) && it.has('revonite', 3)) || reached('c2salt'), saltpetre: it.has('saltpetre', 2) || reached('c2fluid'),
      fluid: it.has('fluid') || reached('c2revive'), teo: reached('c2escort'), night: reached('c2dawn'), ring: flag('c2lookout'),
    };
    const next = ['fire', 'clay', 'torches', 'galleries', 'ash', 'saltpetre', 'fluid', 'teo', 'night', 'ring'].find((n) => !done[n]);
    const node = (id, x, y, title, sub, pic) => {
      const state = done[id] ? 'done' : id === next ? 'next' : '';
      const src = pic ? picture(pic) : '';
      return `<g class="node ${state}" transform="translate(${x} ${y})">
        <rect width="132" height="74" rx="10"/>
        ${src ? `<image href="${src}" x="3" y="10" width="54" height="54"/>` : ''}
        <text x="${src ? 60 : 12}" y="30" class="nt">${title}</text>
        <text x="${src ? 60 : 12}" y="54" class="ns">${sub}</text>
        ${state === 'done' ? '<path class="tick" d="M110 12 l6 8 l12 -16"/>' : ''}
      </g>`;
    };
    const line = (d) => `<path class="edge" d="${d}" marker-end="url(#ah)"/>`;
    const X = [14, 176, 338, 500, 662];
    return `<svg class="roadmap" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">${DEFS}
      ${line('M146 51 L172 51')}
      ${line('M90 88 L196 108')}
      ${line('M60 88 Q60 345 172 345')}
      ${line('M308 51 L334 51')}
      ${line('M470 51 L496 51')}
      ${line('M308 149 L556 92')}
      ${line('M308 345 L576 92')}
      ${line('M632 51 L658 51')}
      ${line('M728 88 L728 108')}
      ${line('M728 186 L728 206')}
      ${line('M728 284 L728 304')}
      ${node('fire', X[0], 14, 'Fire', 'pit + bow drill', null)}
      ${node('torches', X[1], 14, 'Torches \u00d7 3', 'resin, fibre, stick', null)}
      ${node('clay', X[1], 112, 'Clay pots', 'Clay Banks, then fire', null)}
      ${node('ash', X[1], 308, 'Wood ash', 'from the fire (E)', null)}
      ${node('galleries', X[2], 14, 'The galleries', '6 nitre, 3 Revonite', null)}
      ${node('saltpetre', X[3], 14, 'Saltpetre', 'at the fire', null)}
      ${node('fluid', X[4], 14, 'Revival fluid', 'at the fire', null)}
      ${node('teo', X[4], 112, 'Wake him', 'the runner', 'statue')}
      ${node('night', X[4], 210, 'The night', 'keep the fire high', null)}
      ${node('ring', X[4], 308, 'The Lookout', 'what they saw', null)}
      <text x="352" y="250" class="ns">Saltpetre: 6 nitre,</text>
      <text x="352" y="270" class="ns">1 wood ash, a pot of water.</text>
      <text x="352" y="310" class="ns">Fluid: 2 saltpetre,</text>
      <text x="352" y="330" class="ns">3 Revonite, a pot of water.</text>
    </svg>`;
  }

  // ---------- The book ----------

  const book = { page: 0, newCount: 0 };
  book.reached = reached; // (the kit asks it too)
  book.prepare = () => book_prepare();
  const state = () => {
    const f = D.story.flags;
    if (!f.book) f.book = { unlocked: [], read: [] };
    return f.book;
  };
  const isOpen = (p) => state().unlocked.includes(p.id);
  const isRead = (p) => state().read.includes(p.id);

  // Which pages are open now; new ones are announced (one toast for several).
  let checkedOnce = true;
  book.check = () => {
    if (!D.story || !D.items) return;
    const s = state();
    const fresh = [];
    for (const p of PAGES) {
      if (s.unlocked.includes(p.id)) continue;
      let ok = false;
      try {
        ok = p.unlock();
      } catch (error) {
        ok = false;
      }
      if (ok) {
        s.unlocked.push(p.id);
        fresh.push(p);
      }
    }
    if (fresh.length && D.state.mode === 'play' && checkedOnce) {
      if (fresh.length === 1) D.ui.toast(`New page in your field notes: <b>${fresh[0].title}</b> · press B`);
      else D.ui.toast(`<b>${fresh.length} new pages</b> in your field notes · press B`);
      if (D.audio) D.audio.pickup();
    }
    checkedOnce = true;
    book.newCount = PAGES.filter((p) => isOpen(p) && !isRead(p)).length;
    const badge = $('book-new');
    if (badge) {
      badge.textContent = book.newCount;
      badge.hidden = book.newCount === 0;
    }
    // the objective card says which page to read
    const target = PAGE_FOR[D.story.stage];
    const hint = $('objective-book');
    if (hint) {
      hint.hidden = !target || D.state.mode !== 'play';
      if (target) $('objective-book-text').textContent = OBJECTIVE_PAGE[D.story.stage];
    }
  };

  function render() {
    const open = PAGES.filter(isOpen);
    if (!open.length) return;
    book.page = Math.max(0, Math.min(book.page, PAGES.length - 1));
    if (!isOpen(PAGES[book.page])) book.page = PAGES.indexOf(open[0]);
    const p = PAGES[book.page];
    if (!isRead(p)) state().read.push(p.id);
    // contents
    $('book-contents').innerHTML = PAGES.map((q, i) => {
      const unlocked = isOpen(q);
      const fresh = unlocked && !isRead(q);
      return `<button data-page="${i}" class="${i === book.page ? 'on' : ''} ${unlocked ? '' : 'locked'}" ${unlocked ? '' : 'disabled'}>
        <small>${unlocked ? q.kicker : '—'}</small>${unlocked ? q.title : '???'}${fresh ? '<em>new</em>' : ''}</button>`;
    }).join('');
    const number = String(book.page + 1).padStart(2, '0');
    let left;
    let right;
    if (p.wide) {
      left = p.chapter2
        ? `<p class="kicker">Field notes · ${number} · Chapter 2</p><h2>${p.title}</h2>
        <p class="lead">From fire to a second waking: what each thing needs, and what it leads to. Ticked boxes are done; the amber one is next.</p>
        ${roadmap2()}`
        : `<p class="kicker">Field notes · ${number}</p><h2>${p.title}</h2>
        <p class="lead">Everything I have to do before dark, and what each thing needs. Ticked boxes are done; the amber one is next.</p>
        ${roadmap()}`;
      right = null;
    } else {
      left = `<p class="kicker">Field notes · ${number} · ${p.kicker}</p><h2>${p.title}</h2>${p.left()}`;
      const face = portrait();
      right = `<div class="talk">
          ${face ? `<img class="face" src="${face}" alt=""/>` : '<span class="face blank"></span>'}
          <div class="bubbles">${p.say.map((line) => `<p class="bubble">${line}</p>`).join('')}</div>
        </div>
        <section class="science"><h4>The science</h4><p>${p.science}</p></section>
        <section class="ingame"><h4>In the game</h4><ul>${p.game.map((g) => `<li>${g}</li>`).join('')}</ul></section>
        ${p.remember ? `<p class="remember">${p.remember}</p>` : ''}`;
    }
    $('book-left').innerHTML = left;
    $('book-right').innerHTML = right || '';
    $('book-right').hidden = !right;
    $('book-spread').classList.toggle('wide', !right);
    $('book-pageno').textContent = `${open.indexOf(p) + 1} / ${open.length}`;
    book.check();
  }

  function turn(step) {
    const open = PAGES.map((p, i) => (isOpen(p) ? i : -1)).filter((i) => i >= 0);
    const at = open.indexOf(book.page);
    const next = open[Math.max(0, Math.min(open.length - 1, at + step))];
    if (next !== undefined && next !== book.page) {
      book.page = next;
      render();
      if (D.audio) D.audio.rustle();
    }
  }

  book.openAt = (id = null) => {
    book.check();
    const target = id || PAGE_FOR[D.story.stage];
    const index = PAGES.findIndex((p) => p.id === target);
    if (index >= 0 && isOpen(PAGES[index])) book.page = index;
    D.ui.openPanel('book');
    render();
    if (D.audio) D.audio.rustle();
  };

  $('book-contents').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    book.page = +b.dataset.page;
    render();
  });
  $('book-prev').addEventListener('click', () => turn(-1));
  $('book-next').addEventListener('click', () => turn(1));
  $('book').addEventListener('click', (e) => {
    if (e.target.id === 'book') D.ui.closePanel();
  });

  let checkDue = 0;
  book.update = (dt) => {
    const input = D.input;
    if (D.state.mode === 'play') {
      if (input.pressed.has('KeyB')) {
        if (D.state.panel === 'book') D.ui.closePanel();
        else if (!D.state.panel) book.openAt();
      }
      checkDue -= dt;
      if (checkDue <= 0) {
        checkDue = 0.5;
        book.check();
      }
    }
    if (D.state.panel === 'book') {
      if (input.pressed.has('ArrowRight') || input.pressed.has('KeyD')) turn(1);
      if (input.pressed.has('ArrowLeft') || input.pressed.has('KeyA')) turn(-1);
    }
  };

  // a new game, or a checkpoint: the announcements start afresh
  book.reset = () => {
    checkedOnce = false;
  };

  book.PAGES = PAGES;
  D.book = book;
})();
