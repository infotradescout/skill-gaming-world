"""Composition correction of the exact sourced scene, retaining its camera.
This is an environment art pass, not a model of tree growth or wildlife ecology.
"""
import bpy,json,math,os,random,sys,hashlib,time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from art03_assets import ROOT,download
START=time.monotonic();OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve();OUT.mkdir(parents=True,exist_ok=True)
BASE=ROOT/'input/Environment03_source.blend';HASH='0754f9db70d016be60c7aa5b249036bbc9a110af26722b212dfe3d95644cb7f6'
origin='https://wildlife-reserve-world-preview.onrender.com'
if not BASE.is_file() or hashlib.sha256(BASE.read_bytes()).hexdigest()!=HASH:
 for suffix in ['/art03_base/Wildlife_Lodge_Shore_03.blend','/art03/Wildlife_Lodge_Shore_03.blend']:
  try:download(origin+suffix,BASE,sha256=HASH,size=168970705);break
  except Exception:
   if suffix.endswith('/art03/Wildlife_Lodge_Shore_03.blend'):raise
assert hashlib.sha256(BASE.read_bytes()).hexdigest()==HASH
bpy.ops.wm.open_mainfile(filepath=str(BASE),load_ui=False,use_scripts=False)
S=bpy.context.scene;assert S['template_revision']=='0.3.0-sourced-environment'
cameras={o.name:{'matrix':[list(row) for row in o.matrix_world],'lens':o.data.lens} for o in S.objects if o.type=='CAMERA'}
S['template_revision']='0.3.1-forest-composition';S['visual_acceptance']='Candidate only; COTW quality not approved'
terrain=bpy.data.objects['Lodge_Shore_Terrain']
bvh=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in terrain.data.vertices],[list(p.vertices) for p in terrain.data.polygons],all_triangles=False)
def height(x,y):
 hit=bvh.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)),2000)[0]
 if hit is None:raise ValueError('Placement outside terrain')
 return hit.z

def shore(y):return -21+3.6*math.sin(y/20)+1.8*math.sin(y/7)
def path(x,y,pad=.25):return abs(y-(-21+3.8*math.sin(x/29)))<1.6+pad or (-18-pad<y<3+pad and abs(x-(30.5+.11*(3-y)))<1.15+pad)
def lodge(x,y,pad=0):return 19-pad<x<41+pad and 2-pad<y<25+pad
rng=random.Random(849327)
forest=bpy.data.collections['03 | sourced vegetation'];detail=bpy.data.collections['03 | sourced ground detail']
tree_meshes=list({o.data.name:o.data for o in forest.objects if o.type=='MESH'}.values())
heights={m.name:max(v.co.z for v in m.vertices) for m in tree_meshes}
existing=[(o.location.x,o.location.y) for o in forest.objects]
def tree(x,y,h,name):
 m=tree_meshes[rng.randrange(len(tree_meshes))];o=bpy.data.objects.new(name,m);forest.objects.link(o);o.location=(x,y,height(x,y)-.06);s=h/heights[m.name];o.scale=(s,s,s);o.rotation_euler=(rng.uniform(-.018,.018),rng.uniform(-.018,.018),rng.random()*math.tau);o['source_asset']='pine_tree_01';o['source_license']='CC0';o['art_role']='Stand-composition instance, not age-calibrated tree';existing.append((x,y))
# Dense overlapping canopy behind the lodge, not a uniform grid of distant trunks.
added=0
for _ in range(5500):
 x,y=rng.uniform(-7,100),rng.uniform(29,100)
 if lodge(x,y,5) or x<shore(y)+7 or path(x,y,1.2):continue
 spacing=3.7 if y<66 else 4.7
 if any((x-a)**2+(y-b)**2<spacing*spacing for a,b in existing):continue
 tree(x,y,rng.uniform(18,28),'Connected canopy | %03d'%added);added+=1
 if added>=250:break
# Framing trees stand outside the central approach instead of screening the house.
for i,(x,y,h) in enumerate([(-2,-4,23),(-7,11,24),(0,18,22),(31,-11,24),(48,-7,25),(53,8,23)]):
 if not lodge(x,y,2) and not path(x,y,.6):tree(x,y,h,'Glade framing | %02d'%i);added+=1
# Low tree silhouettes fill parts of the bare trunk layer. Scaling here is an art
# proxy only, explicitly not a scientifically valid juvenile growth model.
for i in range(85):
 x,y=rng.uniform(-9,106),rng.uniform(29,94)
 if lodge(x,y,6) or path(x,y,1) or x<shore(y)+6:continue
 tree(x,y,rng.uniform(3.8,8.5),'Understory visual proxy | %02d'%i);added+=1
# Retain texture detail but lower the exposed soil albedo; it is not a green flat
# material. Dense ground vegetation provides the actual green coverage.
mat=terrain.data.materials[0];n=mat.node_tree.nodes;l=mat.node_tree.links;p=next(v for v in n if v.type=='BSDF_PRINCIPLED');source=p.inputs['Base Color'].links[0].from_socket
mix=n.new('ShaderNodeMixRGB');mix.name='Forest floor tonal balance';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.57,.66,.48,1);l.new(source,mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Base Color'])
# Mesh point locations are authored data; every plant still instances the actual
# native textured specimen through the original Geometry Nodes group.
def reset_points(ob,points,scales,angles):
 old=ob.data;me=bpy.data.meshes.new(ob.name+' | composition');me.from_pydata(points,[],[]);me.update();a=me.attributes.new('plant_scale','FLOAT_VECTOR','POINT');a.data.foreach_set('vector',[c for s in scales for c in (s,s,s)]);a=me.attributes.new('plant_rotation','FLOAT_VECTOR','POINT');a.data.foreach_set('vector',[c for r in angles for c in (0,0,r)]);ob.data=me
 if old.users==0:bpy.data.meshes.remove(old)
 ob['plant_count']=len(points)

def densify(kind,candidates,bounds):
 objects=sorted([o for o in detail.objects if o.name.startswith('Textured '+kind+' |')],key=lambda o:o.name)
 if not objects:raise ValueError('No existing textured '+kind+' instance groups')
 buckets=[];specimen_heights=[]
 for ob in objects:
  points=[tuple(v.co) for v in ob.data.vertices];scales=[a.vector.x for a in ob.data.attributes['plant_scale'].data];angles=[a.vector.z for a in ob.data.attributes['plant_rotation'].data]
  buckets.append((points,scales,angles));mod=next(m for m in ob.modifiers if m.type=='NODES');info=next(n for n in mod.node_group.nodes if n.type=='OBJECT_INFO');specimen=info.inputs['Object'].default_value;specimen_heights.append(max(v.co.z for v in specimen.data.vertices))
 added_points=0
 for i in range(candidates):
  x,y=rng.uniform(bounds[0],bounds[1]),rng.uniform(bounds[2],bounds[3])
  if lodge(x,y,1.25) or path(x,y,.22) or x<shore(y)+3.5:continue
  # Visible glade is largely continuous ground cover with gentle height variation.
  patch=.80+.12*math.sin(x*.13+math.sin(y*.09))*.7
  if rng.random()>patch:continue
  j=i%len(objects);h=rng.uniform(.13,.28) if kind=='grass' else rng.uniform(.35,.68)
  if kind=='grass' and math.hypot(x-2,y+22)<12:h*=.8
  scale=h/specimen_heights[j]
  buckets[j][0].append((x,y,height(x,y)-.025));buckets[j][1].append(scale);buckets[j][2].append(rng.random()*math.tau);added_points+=1
 for ob,(points,scales,angles) in zip(objects,buckets):reset_points(ob,points,scales,angles)
 return {'added':added_points,'total':sum(len(b[0]) for b in buckets)}
grass=densify('grass',85000,(-11, sixty:=60,-46,32))
fern=densify('fern',3400,(-7, eighty:=80,-30,58))
# Remove the artificial evenly scattered stone field near the path; keep large
# embedded features and edge clusters. Native scanned geometry is unchanged.
removed_stones=0
for ob in list(detail.objects):
 if ob.name.startswith('Mossy stone |') and ob.location.y<29 and -4<ob.location.x<54:
  if rng.random()<.68:bpy.data.objects.remove(ob,do_unlink=True);removed_stones+=1
# Slightly softer daylight exposes materials without the washed-out clearing.
for node in S.world.node_tree.nodes:
 if node.type=='BACKGROUND':node.inputs['Strength'].default_value=.31
sun=bpy.data.objects.get('Afternoon sun');sun.data.energy=1.75;sun.data.angle=math.radians(4)
S.view_settings.exposure=-.20;S.cycles.samples=32;S.cycles.use_denoising=True;S.cycles.transparent_max_bounces=12
S.render.resolution_x=1280;S.render.resolution_y=720;S.render.resolution_percentage=100
for name,old in cameras.items():
 ob=bpy.data.objects[name];assert all(abs(ob.matrix_world[i][j]-old['matrix'][i][j])<1e-7 for i in range(4) for j in range(4)) and ob.data.lens==old['lens']
bpy.ops.file.pack_all();assert all(i.packed_file for i in bpy.data.images if i.source=='FILE' and i.users)
views=[('Approach eye level','approach_eye'),('Shore eye level','shore_eye'),('Porch to lake','porch_eye'),('District overview','district_overview')]
BLEND=OUT/'Wildlife_Lodge_Shore_03.blend';S.camera=bpy.data.objects[views[0][0]];bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
receipt={'schema':1,'source_commit':os.environ.get('RENDER_GIT_COMMIT'),'base_sha256':HASH,'comparison_baseline_02_sha256':'6f282ac04ae9282596eaa855cc2606f2e6bd559af609d7d67078c8e3009901f7','blender_version':bpy.app.version_string,'revision':S['template_revision'],'same_camera_verified':True,'camera_baseline':cameras,'native_file':BLEND.name,'composition':{'added_trees':added,'grass':grass,'fern':fern,'removed_scattered_stones':removed_stones},'asset_credit':'Poly Haven CC0 environment assets; original lodge/layout. See asset registry.','native_reopen_verified':False,'rendered_views':[],'visual_approval':False,'limitations':['New art candidate, not COTW parity or approved final quality','Understory tree scales are art proxies, not biologically valid growth','Detailed district remains separate from macro terrain','No gameplay, wildlife biology, companion or commerce runtime changes','No responsive 3D viewer or game-performance claim']}
print('ART031_COMPOSITION_READY',json.dumps(receipt['composition']),flush=True)
for cam,name in views:
 S.camera=bpy.data.objects[cam];S.render.filepath=str(OUT/(name+'.png'));print('ART031_RENDER_START',name,flush=True);bpy.ops.render.render(write_still=True);receipt['rendered_views'].append(name+'.png');print('ART031_RENDER_DONE',name,flush=True)
S.camera=bpy.data.objects[views[0][0]];bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND),load_ui=False,use_scripts=False)
assert bpy.context.scene['template_revision']=='0.3.1-forest-composition';assert bpy.data.objects.get('Lodge_Shore_Terrain');assert all(i.packed_file for i in bpy.data.images if i.source=='FILE' and i.users)
receipt['native_reopen_verified']=True;receipt['elapsed_seconds']=round(time.monotonic()-START,2);receipt['files']={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.suffix in ['.blend','.png']}
(OUT/'art_receipt.json').write_text(json.dumps(receipt,indent=2));(OUT/'asset_registry.json').write_text((ROOT/'asset_registry.json').read_text())
print('ART031_NATIVE_COMPLETE',json.dumps(receipt),flush=True)
