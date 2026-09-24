"""Second native art pass, applied to the existing authored district before save.
This fixes the observed sparse crowns, bleached lighting and disconnected entry.
It does not claim botanical calibration or final environment quality.
"""
import math, random
from mathutils import Vector
import bpy

rr = random.Random(279031)
S['template_revision'] = '0.2.1-native-art-refinement'
S['visual_review'] = 'First native pass rejected for sparse foliage and washed-out ground; corrected and rerendered.'
# Avoid two overlapping solar discs. Keep sky illumination and one deliberate sun.
sky.sun_disc = False
world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .24
ld.energy = 1.65
ld.angle = math.radians(1.15)
S.view_settings.exposure = -.85
S.cycles.samples = 32

# More natural, less bleached material response without replacing the geometry.
for key, factor in [('stone', .32), ('deck', .65), ('timber', .72), ('bark', .65)]:
    material = M[key]
    material.diffuse_color = tuple(c * factor for c in material.diffuse_color[:3]) + (1,)
    for node in material.node_tree.nodes:
        if node.type == 'VALTORGB':
            for el in node.color_ramp.elements:
                el.color = tuple(c * factor for c in el.color[:3]) + (1,)
# Woodland litter interspersed with moss/grass; the trail stays separately readable.
for color, (x, y, z) in zip(attr.data, vs):
    bank = x - shore(y)
    if bank < 5:
        base = (.098, .082, .046)
    elif path_distance(x, y) < 1.8:
        base = (.12, .097, .059)
    else:
        moss = .5 + .5 * math.sin(x * .34) * math.sin(y * .41 + x * .1)
        base = (.036 + moss * .02, .047 + moss * .04, .014 + moss * .017)
    color.color = (*base, 1)

# Foliage attached to real existing tree instances. Broad sprays distribute along
# the full branch length instead of tiny disconnected leaves at the very tips.
foliage_meshes = {}
for pi, proto in enumerate(TREE):
    rng = random.Random(301 + pi)
    g = Geo()
    h = max(v.co.z for v in proto.data.vertices)
    if pi < 5:
        mats = NEEDLES
        for branch in range(68):
            z = h * (.24 + .72 * branch / 68)
            angle = branch * 2.39996 + rng.uniform(-.22, .22)
            reach = (1 - z / h) ** .78 * 6.2 * rng.uniform(.9, 1.12) + .2
            radial = Vector((math.cos(angle), math.sin(angle), 0))
            lateral = Vector((-math.sin(angle), math.cos(angle), 0))
            for spray in range(8):
                t = .18 + spray * .102
                center = radial * reach * t + Vector((0, 0, z - .24 + .45 * t))
                for side in [-1, 1]:
                    direction = (radial * .32 + lateral * side + Vector((0, 0, .20))).normalized()
                    spray_length = (.40 + .66 * (1 - t)) * rng.uniform(.85, 1.2)
                    for needle in range(7):
                        f = needle / 7
                        pos = center + direction * f * spray_length
                        cross = Vector((-direction.y, direction.x, .3))
                        for s in [-1, 1]:
                            d = (direction * .25 + cross * s).normalized()
                            length = (.14 + .16 * math.sin((f + .1) * math.pi)) * rng.uniform(.8, 1.2)
                            g.leaf(pos, d, length, .042, rng.randrange(len(mats)))
    else:
        mats = LEAVES
        for cluster in range(38):
            theta = cluster * 2.39996
            z = h * rng.uniform(.52, .96)
            reach = 3.6 * math.sqrt(max(.03, 1 - ((z - h * .72) / (h * .35)) ** 2))
            center = Vector((math.cos(theta) * reach, math.sin(theta) * reach, z))
            for leaf in range(125):
                pos = center + Vector((rng.gauss(0, .7), rng.gauss(0, .7), rng.gauss(0, .50)))
                g.leaf(pos, (rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.35, .5)), rng.uniform(.22, .38), rng.uniform(.12, .20), rng.randrange(len(mats)))
    ob = g.obj('Canopy spray prototype %02d' % pi, mats, 'Authoring')
    ob.hide_render = True
    ob.hide_set(True)
    foliage_meshes[proto.data.name] = ob.data
for trunk in list(COL['Forest'].objects):
    if trunk.type == 'MESH' and trunk.data.name in foliage_meshes:
        crown = bpy.data.objects.new(trunk.name + ' | full crown', foliage_meshes[trunk.data.name])
        COL['Forest'].objects.link(crown)
        crown.location = trunk.location.copy()
        crown.rotation_euler = trunk.rotation_euler.copy()
        crown.scale = trunk.scale.copy()
        crown['asset_role'] = 'Original mesh foliage attached to existing tree, not a new tree population'

# Meadow and woodland-edge grass fills the approach rather than isolated tufts.
# Batches keep the scene editable without one Blender object per blade.
for batch in range(6):
    gg = Geo()
    for clump in range(1800):
        x, y = rr.uniform(-10, 95), rr.uniform(-65, 78)
        if x < shore(y) + 4 or in_lodge(x, y, 2) or path_distance(x, y) < 1.9:
            continue
        if -18 < y < 3 and abs(x - (30.5 + .11 * (3 - y))) < 1.3:
            continue
        z = height(x, y)
        h = rr.uniform(.14, .46)
        for k in range(15):
            ang = rr.uniform(0, math.tau)
            base = Vector((x + rr.uniform(-.20, .20), y + rr.uniform(-.20, .20), z - .01))
            width = rr.uniform(.015, .034)
            side = Vector((-math.sin(ang) * width, math.cos(ang) * width, 0))
            mid = base + Vector((math.cos(ang) * h * .14, math.sin(ang) * h * .14, h * .63))
            tip = base + Vector((math.cos(ang) * h * .50, math.sin(ang) * h * .50, h))
            idx = rr.randrange(len(GRASS))
            gg.face([base - side, base + side, mid + side * .6, mid - side * .6], idx)
            gg.face([mid - side * .6, mid + side * .6, tip], idx)
    gg.obj('Dense woodland-edge grasses %02d' % batch, GRASS, 'GroundCover', False)

# Entry spur connects the existing winding road to the actual porch steps.
spur = Geo()
for i in range(70):
    y = -18 + i * .30
    y2 = y + .30
    x = 30.5 + .11 * (3 - y)
    x2 = 30.5 + .11 * (3 - y2)
    spur.face([(x - 1.10, y, height(x - 1.10, y) + .05), (x + 1.10, y, height(x + 1.10, y) + .05), (x2 + 1.10, y2, height(x2 + 1.10, y2) + .05), (x2 - 1.10, y2, height(x2 - 1.10, y2) + .05)])
spur.obj('Lodge entry footpath', [M['path']], 'GroundCover')

# Lake-facing west gable gains modeled window openings in the visible siding.
for ob in list(COL['Lodge'].objects):
    if ob.name.startswith('Cedar gable siding') and abs(ob.location.x - 21) < .12:
        if floor + 1.05 < ob.location.z < floor + 3.2:
            bpy.data.objects.remove(ob, do_unlink=True)
# The full dark backing remains behind the glazing; these are exterior review assets.
for y in [9.8, 14.2]:
    x = 20.86
    z = floor + 2.05
    cube('West gable window recess', (x, y, z), (.16, 2.10, 2.12), M['trim'])
    cube('West gable glazing', (x - .11, y, z), (.03, 1.8, 1.79), M['glass'])
    for yy in [y - 1.0, y + 1.0, y]:
        cube('West gable window mullion', (x - .15, yy, z), (.15, .105, 2.0), M['trim'])
    for zz in [z - .99, z + .99, z]:
        cube('West gable window frame', (x - .15, y, zz), (.15, 2.12, .10), M['trim'])
    cube('West gable sill', (x - .23, y, z - 1.09), (.38, 2.28, .12), M['deck'], bevel=.02)
# Refill the removed board courses in non-window spans with the correct course Z.
# Preserve wall surfaces behind and between the two exterior openings.
for k in range(18):
    zz = floor + .12 + k * .226
    if floor + 1.05 < zz < floor + 3.2:
        for ya, yb in [(7, 8.8), (10.8, 13.2), (15.2, 17)]:
            cube('West opening board course', (21, (ya + yb) / 2, zz), (.13, yb - ya, .214), M['timber'], bevel=.012)

# Keep the original camera position for a true before/after comparison.
print('NATIVE_ART_REFINEMENT_APPLIED', S['template_revision'], flush=True)
