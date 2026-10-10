# Downloads the photo textures The New Dawn is surfaced with from Poly Haven (polyhaven.com,
# all CC0) and packs them into assets/dawn-textures.js as data URIs, so the game still runs
# straight from the file system.
#   python3 tools/build-textures.py [download folder]     (run from The-New-Dawn/)
# Each set gets its colour picture and its OpenGL normal map, shrunk to SIZE.
import base64, io, json, os, sys, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'dawn-textures.js')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.texture-cache')

# key in the game -> (Poly Haven id, what it surfaces, colour size, normal size)
SETS = {
    'grass': ('forrest_ground_01', 'meadow ground in the clearings', 1024, 512),
    'jungle': ('forest_leaves_02', 'leaf litter and moss on the jungle floor', 1024, 512),
    'dirt': ('dirt_floor', 'worn trails', 1024, 512),
    'cliff': ('rock_face_03', 'cliffs and mountain sides', 1024, 1024),
    'cave': ('rock_wall_02', 'the cave walls', 1024, 1024),
    'pebbles': ('river_small_rocks', 'river and pond beds', 1024, 512),
    'mud': ('brown_mud_02', 'the cave floor, guano and river banks', 1024, 512),
    'stone': ('rock_surface', 'the petrified people', 1024, 1024),
    'moss': ('mossy_rock', 'moss and lichen on stone', 1024, 512),
    'bark': ('bark_brown_02', 'branches, the bow and the shelter', 1024, 512),
}


def fetch(asset, kind):
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, f'{asset}_{kind}_1k.jpg')
    if not os.path.exists(local):
        with urllib.request.urlopen(f'https://api.polyhaven.com/files/{asset}') as r:
            files = json.load(r)
        url = files['Diffuse' if kind == 'diffuse' else 'nor_gl']['1k']['jpg']['url']
        urllib.request.urlretrieve(url, local)
    return local


def uri(path, size, quality):
    image = Image.open(path).convert('RGB')
    if image.size != (size, size):
        image = image.resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=quality, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()


packed = {}
credits = []
for key, (asset, use, color_size, normal_size) in SETS.items():
    packed[key] = {
        'color': uri(fetch(asset, 'diffuse'), color_size, 80),
        'normal': uri(fetch(asset, 'nor_gl'), normal_size, 88),
    }
    credits.append(f'//   {key:<8} "{asset}"  {use}')

with open(OUT, 'w') as f:
    f.write('// Photographic surface textures from Poly Haven (polyhaven.com, CC0), each a colour picture\n')
    f.write('// and an OpenGL normal map, embedded as data URIs so they load when index.html is opened\n')
    f.write('// straight from disk. Made by tools/build-textures.py:\n')
    f.write('\n'.join(credits) + '\n')
    f.write('window.DAWN_TEXTURES = ' + json.dumps(packed) + ';\n')
print(f'Wrote {OUT} ({os.path.getsize(OUT) / 1048576:.1f} MB)')
