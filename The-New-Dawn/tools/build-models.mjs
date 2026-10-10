// Packs the 3D models Chapter 1 needs into assets/dawn-models.js, taken from car-drive's
// picnic-models.js (already shrunk and base64-encoded there), so the game opens straight
// from disk without a server.
//   node tools/build-models.mjs            (run from The-New-Dawn/)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../car-drive/picnic-models.js');
const target = path.resolve(here, '../assets/dawn-models.js');

// model name -> credit line (all CC BY 4.0, from Sketchfab)
const WANTED = {
  tiger: '"Running Tiger" by Amil (francescolima74), https://sketchfab.com/3d-models/fc2c7fd74dd04e39935803b884c77258',
  bear: '"Bear" by Nyilonelycompany, https://sketchfab.com/3d-models/ce0d5eb86cf5459bb6bd20244cb44b27',
  rocks: '"Stone Pack" by ashkan.fancy, https://sketchfab.com/3d-models/f3e0a67b9ca243b09119177649f21e17',
  fern: '"Realistic Beech Fern Plant" by 3D Environment Artist Shop, https://sketchfab.com/3d-models/adf1e8832cf74a8a94c98792fa1d9088',
  foliage: '"Some Foliage" by soidev, https://sketchfab.com/3d-models/5e806681504a4642a16a59c057d34e8d',
  banana: '"Banana Plant" by evolveduk, https://sketchfab.com/3d-models/85695b82c7ba4b3497a663616cc3bf25',
  palm: '"Coconut Palm" by evolveduk, https://sketchfab.com/3d-models/26e787f2ff2e4c0fb004c3b0210805a3',
  jungletree: '"Jungle Tree" by kobaltsecond, https://sketchfab.com/3d-models/46f83ec5f6c04abf9d509c1070f67d1e',
  monstera: '"Tropical Plant" by alint, https://sketchfab.com/3d-models/3ee280726f1f496e9b2377d43b4cbb2d',
  mango: '"Mango" by Meerschaum Digital, https://sketchfab.com/3d-models/e5fd174d7a2e4ac894e3e69a4550d1e2',
  bananas: '"Banana (Game Ready / 2K PBR)" by Meerschaum Digital, https://sketchfab.com/3d-models/55180008229841a9a6af3a35528ccdc6',
  firewood: '"Firewood_HP" by ta.holovan, https://sketchfab.com/3d-models/b94b159be8c8480690a2ae40c8bd3a4a',
};

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox);
const all = sandbox.window.PICNIC_MODELS;
if (!all) throw new Error(`No PICNIC_MODELS in ${source}`);

const lines = [
  '// The 3D models for The New Dawn, Chapter 1: the tiger and the bear, the rocks, the jungle\'s',
  '// plants and the fruit. Base64-encoded GLB, so the game loads them when index.html is opened',
  '// straight from disk. Made by tools/build-models.mjs from these models, all CC BY 4.0, from Sketchfab:',
  ...Object.values(WANTED).map((credit) => `//   ${credit}`),
  'window.DAWN_MODELS = {',
];
let bytes = 0;
for (const name of Object.keys(WANTED)) {
  if (!all[name]) throw new Error(`picnic-models.js has no model "${name}"`);
  lines.push(`  ${name}: '${all[name]}',`);
  bytes += all[name].length;
}
lines.push('};', '');
fs.writeFileSync(target, lines.join('\n'));
console.log(`Wrote ${target} (${(bytes / 1048576).toFixed(1)} MB of model data)`);
