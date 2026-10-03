"""Smooths the three.js sample horse so it stops looking faceted.

    python3 horse-model-build.py <Horse.glb from three.js> <out.glb> [levels]

The source is a 984-triangle mesh whose gallop is stored as 15 morph targets. The recording
has no standing pose, so one is assembled first and added as a 16th target: each leg is taken
from the frame of the gallop in which it is planted and upright, and joined to the body of a
single frame. Then this welds the mesh,
applies Loop subdivision (each level quadruples the triangles and rounds the surface), and
writes smooth normals for the base shape and for every morph target, so the lighting follows
the legs as they move. Subdivision is linear in the vertex positions, so the same weights
are applied to the base, to each target's offsets and to the vertex colours.
"""
import json, math, struct, sys

src, out = sys.argv[1], sys.argv[2]
levels = int(sys.argv[3]) if len(sys.argv) > 3 else 2

data = open(src, 'rb').read()
jlen = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20 + jlen])
blob = data[20 + jlen + 8:]

def read(index):
    acc = gltf['accessors'][index]
    view = gltf['bufferViews'][acc['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    code = {5126: 'f', 5123: 'H', 5125: 'I'}[acc['componentType']]
    flat = struct.unpack_from('<%d%s' % (acc['count'] * width, code), blob, view.get('byteOffset', 0) + acc.get('byteOffset', 0))
    return [list(flat[i:i + width]) for i in range(0, len(flat), width)] if width > 1 else list(flat)

prim = gltf['meshes'][0]['primitives'][0]
pos = read(prim['attributes']['POSITION'])
col = read(prim['attributes']['COLOR_0'])
idx = read(prim['indices'])
targets = [read(t['POSITION']) for t in prim['targets']]   # offsets from the base shape

# --- a standing pose, built from the gallop
def standing():
    shapes = [[[b[k] + o[k] for k in range(3)] for b, o in zip(pos, t)] for t in targets]
    frames = range(len(shapes))
    lowest = [min(shapes[f][i][1] for f in frames) for i in range(len(pos))]   # how near the ground a vertex ever gets
    centre = lambda rows: [sum(r[k] for r in rows) / len(rows) for k in range(3)]
    smooth = lambda t: 0.0 if t <= 0 else 1.0 if t >= 1 else t * t * (3 - 2 * t)
    # the trunk: vertices that stay high and near the middle of the body
    trunk = [i for i in range(len(pos)) if lowest[i] > 105 and -110 < pos[i][2] < 40]
    trunk_at = [centre([shapes[f][i] for i in trunk]) for f in frames]
    # legs: vertices that come down toward the ground, split fore/hind and left/right by where they average
    mean = [centre([shapes[f][i] for f in frames]) for i in range(len(pos))]
    legs = {}
    for i in range(len(pos)):
        if lowest[i] < 75:
            rel_z = mean[i][2] - sum(t[2] for t in trunk_at) / len(trunk_at)
            legs.setdefault((rel_z > 0, mean[i][0] > 0), []).append(i)
    body = 0   # the frame the trunk, neck, head and tail are taken from
    stand = [list(v) for v in shapes[body]]
    for which, members in sorted(legs.items()):
        hoof = [i for i in members if lowest[i] < 8]
        top = [i for i in members if lowest[i] > 55]
        best, best_score = None, None
        for f in frames:
            h, t = centre([shapes[f][i] for i in hoof]), centre([shapes[f][i] for i in top])
            # planted (hoof low), upright (hoof under the top of the leg) and long (not folded)
            score = abs(h[2] - t[2]) + 2.5 * max(0.0, h[1] - 4) - 0.6 * (t[1] - h[1])
            if best_score is None or score < best_score: best, best_score = f, score
        f = best
        shift = [trunk_at[body][k] - trunk_at[f][k] for k in range(3)]   # carry the leg across with its own body
        placed = {i: [shapes[f][i][k] + shift[k] for k in range(3)] for i in members}
        drop = min(placed[i][1] for i in hoof) - min(shapes[body][i][1] for i in range(len(pos)))
        print('leg', 'fore' if which[0] else 'hind', 'left' if which[1] else 'right', 'from frame', f, 'vertices', len(members), 'lifted by', round(drop, 1))
        for i in members:
            w = smooth((95 - lowest[i]) / 40)   # fully the leg's own frame low down, the body's frame at the top
            placed[i][1] -= drop
            stand[i] = [stand[i][k] + (placed[i][k] - stand[i][k]) * w for k in range(3)]
    return [[s[k] - b[k] for k in range(3)] for s, b in zip(stand, pos)]

targets.append(standing())

# --- weld vertices that share a position (the source splits them along texture seams)
ids, order = {}, []
remap = []
for i, p in enumerate(pos):
    key = tuple(round(v, 3) for v in p)
    if key not in ids:
        ids[key] = len(order)
        order.append([i])
    else:
        order[ids[key]].append(i)
    remap.append(ids[key])
mean = lambda rows: [sum(r[k] for r in rows) / len(rows) for k in range(len(rows[0]))]
# every per-vertex quantity travels together as one row of "channels"
channels = [pos, col] + targets
verts = [[mean([ch[i] for i in group]) for ch in channels] for group in order]
tris = [(remap[idx[t]], remap[idx[t + 1]], remap[idx[t + 2]]) for t in range(0, len(idx), 3)]
tris = [t for t in tris if len(set(t)) == 3]

def combine(parts):
    # weighted sum of vertex rows: parts is [(vertex, weight), ...]
    row = []
    for c in range(len(channels)):
        width = len(verts[parts[0][0]][c])
        row.append([sum(verts[v][c][k] * w for v, w in parts) for k in range(width)])
    return row

def subdivide():
    global verts, tris
    edges = {}      # (a, b) sorted -> opposite vertices
    around = [set() for _ in verts]
    for a, b, c in tris:
        for u, v, w in ((a, b, c), (b, c, a), (c, a, b)):
            edges.setdefault((min(u, v), max(u, v)), []).append(w)
            around[u].add(v); around[v].add(u)
    border = [set() for _ in verts]
    for (a, b), opposite in edges.items():
        if len(opposite) != 2:
            border[a].add(b); border[b].add(a)

    new = []
    for v in range(len(verts)):
        if border[v]:
            # an open edge keeps its outline: only its neighbours along the edge pull on it
            near = list(border[v])
            new.append(combine([(v, 0.75), (near[0], 0.125), (near[1], 0.125)]) if len(near) == 2 else verts[v])
        else:
            n = len(around[v])
            beta = 3 / 16 if n == 3 else 3 / (8 * n)
            new.append(combine([(v, 1 - n * beta)] + [(u, beta) for u in around[v]]))
    mid = {}
    for (a, b), opposite in edges.items():
        mid[(a, b)] = len(new)
        if len(opposite) == 2:
            new.append(combine([(a, 0.375), (b, 0.375), (opposite[0], 0.125), (opposite[1], 0.125)]))
        else:
            new.append(combine([(a, 0.5), (b, 0.5)]))
    m = lambda u, v: mid[(min(u, v), max(u, v))]
    out_tris = []
    for a, b, c in tris:
        ab, bc, ca = m(a, b), m(b, c), m(c, a)
        out_tris += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    verts, tris = new, out_tris

for _ in range(levels):
    subdivide()

def normals(points):
    acc = [[0.0, 0.0, 0.0] for _ in points]
    for a, b, c in tris:
        pa, pb, pc = points[a], points[b], points[c]
        u = [pb[k] - pa[k] for k in range(3)]
        v = [pc[k] - pa[k] for k in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]  # area-weighted
        for i in (a, b, c):
            for k in range(3): acc[i][k] += n[k]
    result = []
    for n in acc:
        length = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
        result.append([n[0] / length, n[1] / length, n[2] / length])
    return result

base = [v[0] for v in verts]
colour = [[min(1.0, max(0.0, c)) for c in v[1]] for v in verts]
base_normal = normals(base)
offsets = [[v[2 + t] for v in verts] for t in range(len(targets))]
normal_offsets = []
for off in offsets:
    shape = [[b[k] + o[k] for k in range(3)] for b, o in zip(base, off)]
    n = normals(shape)
    normal_offsets.append([[a[k] - b[k] for k in range(3)] for a, b in zip(n, base_normal)])

# --- write the GLB
chunks, views, accessors = [], [], []
def add(rows, kind, code, component, bounds=False, target=None):
    flat = [x for row in rows for x in row] if kind != 'SCALAR' else rows
    raw = struct.pack('<%d%s' % (len(flat), code), *flat)
    raw += b'\0' * (-len(raw) % 4)
    offset = sum(len(c) for c in chunks)
    chunks.append(raw)
    view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw)}
    if target: view['target'] = target
    views.append(view)
    acc = {'bufferView': len(views) - 1, 'componentType': component, 'count': len(rows), 'type': kind}
    if bounds:
        acc['min'] = [min(r[k] for r in rows) for k in range(3)]
        acc['max'] = [max(r[k] for r in rows) for k in range(3)]
    accessors.append(acc)
    return len(accessors) - 1

big = len(verts) > 65535
attributes = {
    'POSITION': add(base, 'VEC3', 'f', 5126, True, 34962),
    'NORMAL': add(base_normal, 'VEC3', 'f', 5126, False, 34962),
    'COLOR_0': add(colour, 'VEC3', 'f', 5126, False, 34962),
}
indices = add([i for t in tris for i in t], 'SCALAR', 'I' if big else 'H', 5125 if big else 5123, False, 34963)
morphs = [{'POSITION': add(o, 'VEC3', 'f', 5126, True), 'NORMAL': add(n, 'VEC3', 'f', 5126)} for o, n in zip(offsets, normal_offsets)]
sampler = gltf['animations'][0]['samplers'][0]
times, weights = read(sampler['input']), read(sampler['output'])
recorded = len(targets) - 1   # the recording has no column for the standing pose; it stays at zero
weights = [w for key in range(len(times)) for w in weights[key * recorded:(key + 1) * recorded] + [0.0]]
t_acc = add(times, 'SCALAR', 'f', 5126)
accessors[t_acc]['min'], accessors[t_acc]['max'] = [min(times)], [max(times)]
w_acc = add(weights, 'SCALAR', 'f', 5126)

doc = {
    'asset': {'version': '2.0', 'generator': 'horse-model-build.py'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'Horse'}],
    'meshes': [{'primitives': [{'attributes': attributes, 'indices': indices, 'targets': morphs, 'mode': 4}],
                'weights': [0] * len(morphs)}],
    'animations': [{'name': 'gallop', 'channels': [{'sampler': 0, 'target': {'node': 0, 'path': 'weights'}}],
                    'samplers': [{'input': t_acc, 'output': w_acc, 'interpolation': 'LINEAR'}]}],
    'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': sum(len(c) for c in chunks)}],
}
text = json.dumps(doc, separators=(',', ':')).encode()
text += b' ' * (-len(text) % 4)
binary = b''.join(chunks)
with open(out, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(binary)))
    f.write(struct.pack('<I4s', len(text), b'JSON') + text)
    f.write(struct.pack('<I4s', len(binary), b'BIN\0') + binary)
print(out, 'vertices', len(verts), 'triangles', len(tris), 'bytes', 28 + len(text) + len(binary))
