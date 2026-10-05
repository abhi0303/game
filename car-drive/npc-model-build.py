"""Builds npc-models.js from Microsoft Rocketbox avatars (MIT licence).

    python3 npc-model-build.py <folder of avatars> <Xbot.glb from three.js> <out.js>

Each avatar folder holds `raw.glb` (its FBX run through FBX2glTF) and its *_color.tga
textures. For every avatar this:
  * retargets the idle, walk and run clips of the three.js "Xbot" model (Mixamo motion capture)
    onto the avatar's 3ds Max Biped skeleton. The two rigs rest differently (T-pose against
    A-pose, different bone axes), so each bone's rotation away from rest is measured in world
    space on the source and re-applied to the avatar's rest pose, after first swinging that
    rest pose onto the source's;
  * shrinks the textures (body 1024 px, head 512 px, hair with its transparency 512 px);
  * strips the placeholder images out of the GLB.
"""
import base64, io, json, math, os, struct, sys
from PIL import Image

folder, xbot, out_path = sys.argv[1:4]
AVATARS = ['Female_Adult_01', 'Female_Adult_04', 'Female_Adult_08', 'Male_Adult_01', 'Male_Adult_04', 'Male_Adult_08']

BONES = {'Bip01 Pelvis': 'Hips', 'Bip01 Spine': 'Spine', 'Bip01 Spine1': 'Spine1', 'Bip01 Spine2': 'Spine2',
         'Bip01 Neck': 'Neck', 'Bip01 Head': 'Head'}
for side, name in (('L', 'Left'), ('R', 'Right')):
    BONES.update({f'Bip01 {side} Clavicle': f'{name}Shoulder', f'Bip01 {side} UpperArm': f'{name}Arm',
                  f'Bip01 {side} Forearm': f'{name}ForeArm', f'Bip01 {side} Hand': f'{name}Hand',
                  f'Bip01 {side} Thigh': f'{name}UpLeg', f'Bip01 {side} Calf': f'{name}Leg',
                  f'Bip01 {side} Foot': f'{name}Foot', f'Bip01 {side} Toe0': f'{name}ToeBase'})
# the bone each one points at, for lining the two rest poses up (target name -> target child, source child)
AIM = {'Bip01 Spine': ('Bip01 Spine1', 'Spine1'), 'Bip01 Spine1': ('Bip01 Spine2', 'Spine2'),
       'Bip01 Spine2': ('Bip01 Neck', 'Neck'), 'Bip01 Neck': ('Bip01 Head', 'Head')}
for side, name in (('L', 'Left'), ('R', 'Right')):
    AIM.update({f'Bip01 {side} Clavicle': (f'Bip01 {side} UpperArm', f'{name}Arm'),
                f'Bip01 {side} UpperArm': (f'Bip01 {side} Forearm', f'{name}ForeArm'),
                f'Bip01 {side} Forearm': (f'Bip01 {side} Hand', f'{name}Hand'),
                f'Bip01 {side} Hand': (f'Bip01 {side} Finger2', f'{name}HandMiddle1'),
                f'Bip01 {side} Thigh': (f'Bip01 {side} Calf', f'{name}Leg'),
                f'Bip01 {side} Calf': (f'Bip01 {side} Foot', f'{name}Foot'),
                f'Bip01 {side} Foot': (f'Bip01 {side} Toe0', f'{name}ToeBase')})

ID = (0.0, 0.0, 0.0, 1.0)
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx,
            aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz)
def qinv(q): return (-q[0], -q[1], -q[2], q[3])
def qnorm(q):
    n = math.sqrt(sum(v * v for v in q)); return tuple(v / n for v in q)
def qrot(q, v): return qmul(qmul(q, (v[0], v[1], v[2], 0.0)), qinv(q))[:3]
def unit(v):
    n = math.sqrt(sum(c * c for c in v)) or 1.0
    return [c / n for c in v]
def between(a, b):  # shortest rotation taking direction a to direction b
    d = sum(x * y for x, y in zip(a, b))
    if d > 0.999999: return ID
    axis = (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
    return qnorm((axis[0], axis[1], axis[2], 1.0 + d))

def load(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + n]), d[20 + n + 8:], d

class Rig:
    def __init__(self, gltf, strip=''):
        self.nodes = gltf['nodes']
        self.name = [n.get('name', '').replace(strip, '') for n in self.nodes]
        self.index = {n: i for i, n in enumerate(self.name)}
        self.parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get('children', []): self.parent[c] = i
        self.rest = [tuple(n.get('rotation', ID)) for n in self.nodes]
        self.order = []
        def visit(i):
            self.order.append(i)
            for c in self.nodes[i].get('children', []): visit(c)
        for r in gltf['scenes'][0]['nodes']: visit(r)
    def world(self, local):
        w = {}
        for i in self.order:
            w[i] = qmul(w[self.parent[i]], local[i]) if i in self.parent else local[i]
        return w
    def aim(self, world, bone, child):  # world direction from a bone to one of its children
        return unit(qrot(world[bone], self.nodes[child].get('translation', [0, 1, 0])))

src_gltf, src_bin, _ = load(xbot)
src = Rig(src_gltf, 'mixamorig:')
src_rest = src.world(dict(enumerate(src.rest)))
def accessor(i):
    a = src_gltf['accessors'][i]; v = src_gltf['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    flat = struct.unpack_from('<%df' % (a['count'] * n), src_bin, v.get('byteOffset', 0) + a.get('byteOffset', 0))
    return [flat[k:k + n] for k in range(0, len(flat), n)] if n > 1 else list(flat)
src_hips = src.index['Hips']
src_hip_height = src.nodes[src_hips]['translation'][1] * 0.01  # the source armature is in centimetres

def retarget(rig):
    rest_world = rig.world(dict(enumerate(rig.rest)))
    mapped = [(rig.index[t], src.index[s]) for t, s in BONES.items()]
    posed = {}
    for t_name, (t_child, s_child) in AIM.items():
        t, s = rig.index[t_name], src.index[BONES[t_name]]
        swing = between(rig.aim(rest_world, t, rig.index[t_child]), src.aim(src_rest, s, src.index[s_child]))
        posed[t] = qnorm(qmul(swing, rest_world[t]))
    for t, s in mapped:  # the pelvis, head and toes keep the rest they have
        posed.setdefault(t, rest_world[t])
    source_of = dict(mapped)
    pelvis = rig.index['Bip01 Pelvis']
    carrier = rig.parent[pelvis]  # Bip01: fixed, and the frame the pelvis's position is given in
    carrier_q = rest_world[carrier]
    hip_scale = rig.nodes[carrier]['translation'][1] / src_hip_height

    clips = {}
    for anim in src_gltf['animations']:
        if anim['name'] not in ('idle', 'walk', 'run'): continue
        rotation, hips, times = {}, None, None
        for ch in anim['channels']:
            sampler = anim['samplers'][ch['sampler']]
            node, path = ch['target']['node'], ch['target']['path']
            if path == 'rotation':
                rotation[node] = accessor(sampler['output']); times = accessor(sampler['input'])
            elif path == 'translation' and node == src_hips:
                hips = accessor(sampler['output'])
        tracks = {t: [] for t, _ in mapped}
        place = []
        for f in range(len(times)):
            local = dict(enumerate(src.rest))
            for node, values in rotation.items(): local[node] = qnorm(values[f])
            sw = src.world(local)
            tw = {}
            for t in rig.order:
                above = tw[rig.parent[t]] if t in rig.parent else ID
                if t in source_of:
                    s = source_of[t]
                    tw[t] = qnorm(qmul(qmul(sw[s], qinv(src_rest[s])), posed[t]))
                    q = qmul(qinv(above), tw[t])
                    last = tracks[t][-1] if tracks[t] else None
                    if last and sum(a * b for a, b in zip(last, q)) < 0: q = tuple(-v for v in q)
                    tracks[t].append(q)
                else:
                    tw[t] = qmul(above, rig.rest[t])  # unmapped bones ride along at rest
            # where the pelvis should be, as an offset from standing, in its parent's frame
            h = hips[f]
            offset = [h[0] * 0.01 * hip_scale, (h[1] * 0.01 - src_hip_height) * hip_scale, 0.0]
            place.append(qrot(qinv(carrier_q), offset))
        r4 = lambda v: round(v, 4)
        safe = lambda n: n.replace(' ', '_')  # three.js renames nodes this way on load
        clip = [{'bone': safe(rig.name[t]), 'path': 'q', 'values': [r4(v) for q in tracks[t] for v in q]} for t, _ in mapped]
        clip.append({'bone': safe(rig.name[pelvis]), 'path': 'p', 'values': [r4(v) for p in place for v in p]})
        clips[anim['name']] = {'duration': r4(times[-1]), 'times': [r4(t) for t in times], 'tracks': clip}
    return clips

def stripped_glb(gltf, binary):
    # drop the 1-pixel placeholder images FBX2glTF leaves when it cannot find the textures
    for key in ('images', 'textures', 'samplers'): gltf.pop(key, None)
    for m in gltf['materials']:
        m.get('pbrMetallicRoughness', {}).pop('baseColorTexture', None)
        for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture'): m.pop(key, None)
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    return struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(binary)) + struct.pack('<I4s', len(text), b'JSON') + text + struct.pack('<I4s', len(binary), b'BIN\0') + binary

def image_uri(path, size, alpha=False):
    im = Image.open(path)
    buf = io.BytesIO()
    if alpha:
        im.convert('RGBA').resize((size, size), Image.LANCZOS).save(buf, 'PNG', optimize=True)
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    im.convert('RGB').resize((size, size), Image.LANCZOS).save(buf, 'JPEG', quality=84)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

models = []
for name in AVATARS:
    base = os.path.join(folder, name)
    gltf, binary, _ = load(os.path.join(base, 'raw.glb'))
    clips = retarget(Rig(gltf))
    textures = {}
    for f in os.listdir(base):
        for part, size, alpha in (('body', 1024, False), ('head', 512, False), ('opacity', 512, True)):
            if f.endswith(f'_{part}_color.tga'): textures[part] = image_uri(os.path.join(base, f), size, alpha)
    assert len(textures) == 3, (name, list(textures))
    models.append({'name': name, 'female': name.startswith('Female'), 'clips': clips,
                   'glb': base64.b64encode(stripped_glb(gltf, binary)).decode(), **textures})
    print(name, 'glb', len(models[-1]['glb']) // 1024, 'KB  textures', sum(len(v) for v in textures.values()) // 1024, 'KB')

with open(out_path, 'w') as f:
    f.write('// Pedestrians: six avatars from the Microsoft Rocketbox library (MIT licence), each\n'
            '// with its model, shrunken textures, and idle, walk and run clips retargeted onto its\n'
            '// skeleton. Built by npc-model-build.py; embedded so the game opens straight from disk.\n'
            'window.NPC_MODELS = ' + json.dumps(models, separators=(',', ':')) + ';\n')
print(out_path, os.path.getsize(out_path) // 1024, 'KB')
