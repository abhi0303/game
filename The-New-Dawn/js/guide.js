// The New Dawn: where to go next.
//
// The objective card says what to do; the guide says where. For anything you are short of it
// finds the nearest place to get it (a stone lying on the ground, a clump of yellow grass, a
// clay pit, the crust on the gallery walls), and that is where the waypoint on screen and the
// diamond on the map point. Chapter 2 adds its own sources (guide.sources).
(() => {
  'use strict';
  const D = window.Dawn;
  const L = D.LAYOUT;

  const guide = { sources: {} };
  const name = (key, n = 2) => {
    const def = D.items.ITEMS[key];
    return def ? (n > 1 ? def.plural : def.name) : key;
  };

  // Things that grow (and give) rather than lie about.
  const GROWING = { fiber: 'fibre', vine: 'vine', stave: 'sapling', berries: 'bush' };
  const PLANTS = { leaves: ['fern', 'fernA', 'fernB'], big_leaf: ['banana', 'monstera'] };
  // Where to look when nothing nearer is known: [x, z, label]
  const AREAS = {
    big_leaf: [-18, -100, 'Banana plants (jungle)'],
    leaves: [-4, 168, 'Ferns (forest floor)'],
    mango: [-34, 100, 'Mango trees (clearing)'],
    flint: [120, 78, 'Flint Rise'],
    fiber: [128, 92, 'Yellow grass (Flint Rise)'],
    stick: [-12, 125, 'Sticks (forest)'],
    stone: [-6, 140, 'Stones (forest)'],
  };

  // The nearest place to get `key`: { x, z, label, r } or null.
  guide.source = (key, from = D.hero.pos) => {
    const custom = guide.sources[key];
    if (custom) {
      const m = custom(from);
      if (m) return m;
    }
    const it = D.items;
    const p = it.nearestPickup(key, from.x, from.z);
    if (p) return { x: p.x, z: p.z, label: name(key), r: 1.8 };
    const kind = GROWING[key];
    if (kind) {
      const g = it.nearestGrowing(kind, from.x, from.z);
      if (g) return { x: g.x, z: g.z, label: key === 'stave' ? 'A young sapling' : key === 'fiber' ? 'Yellow grass (fibre)' : name(key), r: 2.2 };
    }
    // plants that give it: ferns (leaves), banana and elephant-ear plants (big leaves)
    const plants = PLANTS[key];
    if (plants && D.flora && D.flora.plantsNear) {
      for (const r of [14, 30, 55]) {
        let best = null;
        let bd = Infinity;
        for (const kind of plants) {
          for (const p of D.flora.plantsNear(kind, from.x, from.z, r)) {
            const d = Math.hypot(p.x - from.x, p.z - from.z);
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
        }
        if (best) return { x: best.x, z: best.z, label: key === 'leaves' ? 'Ferns (leaves)' : 'A banana plant (big leaves)', r: 2.2 };
      }
    }
    if (key === 'mango') {
      const tree = it.nearestGrowing('mangotree', from.x, from.z);
      if (tree) return { x: tree.x, z: tree.z, label: 'A mango tree (shake it)', r: 2.6 };
    }
    const a = AREAS[key];
    return a ? { x: a[0], z: a[1], label: a[2], r: 12 } : null;
  };

  // The first of `needs` ({ key: n }) you have too few of, as [key, n], or null.
  guide.short = (needs) => Object.entries(needs).find(([k, n]) => !D.items.has(k, n)) || null;

  // Where to go for the first thing short in `needs`, labelled with how many more.
  guide.forNeeds = (needs, from = D.hero.pos) => {
    const s = guide.short(needs);
    if (!s) return null;
    const [key, n] = s;
    const m = guide.source(key, from);
    if (!m) return null;
    const more = n - D.items.count(key);
    return { ...m, label: `${m.label}${more > 1 ? ` (${more} more)` : ''}`, key };
  };

  // The edge of the pond nearest you: where to drink, or fill a pot.
  guide.water = (from = D.hero.pos, label = 'The pond') => {
    const dx = from.x - L.pond.x;
    const dz = from.z - L.pond.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: L.pond.x + (dx / d) * (L.pond.r - 1), z: L.pond.z + (dz / d) * (L.pond.r - 1), label, r: 2.5 };
  };

  D.guide = guide;
})();
