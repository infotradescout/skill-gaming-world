"""Replace assets in the exact existing native district; preserve its cameras.
Poly Haven CC0 assets and original lodge/layout. No AI image or game extraction.
"""
import bpy,json,math,os,random,sys,time,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
START=time.monotonic()
ROOT=Path(os.environ.get('WILDLIFE_ASSET_CACHE',str(Path.home()/'.cache/wildlife-art03')))
OUT=Path(sys.argv[sys.argv.index('--')+1]).resolve();OUT.mkdir(parents=True,exist_ok=True)
REG=json.loads((ROOT/'asset_registry.json').read_text());BASE=ROOT/REG['previous']['path']
assert hashlib.sha256(BASE.read_bytes()).hexdigest()==REG['previous']['sha256']
bpy.ops.wm.open_mainfile(filepath=str(BASE),load_ui=False,use_scripts=False)
S=bpy.context.scene
before_camera={o.name:{'matrix':[list(row) for row in o.matrix_world],'lens':o.data.lens} for o in S.objects if o.type=='CAMERA'}
S['template_revision']='0.3.0-sourced-environment'
S['visual_acceptance']='Owner rejected 0.2.1; 0.3 is a candidate, NOT approved COTW quality'
S['asset_credit']='Environment assets from Poly Haven, CC0. Lodge/layout original project authoring.'
S['biome_validation']='Look development only; botanical species and region not yet locked.'
removed=[]
for name in ['Forest','Understory','GroundCover','Rocks']:
 c=bpy.data.collections.get(name)
 if not c:continue
 for ob in list(c.objects):
  if ob.name in ['Winding gravel access trail','Lodge entry footpath']:continue
  removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)
for ob in list(bpy.data.collections['Authoring'].objects):
 if ob.type=='MESH':bpy.data.objects.remove(ob,do_unlink=True)
for ob in list(bpy.data.collections['Props'].objects):
 if ob.name.startswith('Stacked firewood'):bpy.data.objects.remove(ob,do_unlink=True)
terrain=bpy.data.objects['Lodge_Shore_Terrain']
bvh=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in terrain.data.vertices],[list(p.vertices) for p in terrain.data.polygons],all_triangles=False)
def height(x,y):
 hit=bvh.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)),2000)[0]
 if hit is None:raise ValueError('Placement outside authored terrain')
 return hit.z

def shore(y):return -21+3.6*math.sin(y/20)+1.8*math.sin(y/7)
def trail_y(x):return -21+3.8*math.sin(x/29)
def lodge(x,y,pad=0):return 19-pad<x<41+pad and 2-pad<y<25+pad
def on_path(x,y,pad=0):return abs(y-trail_y(x))<1.6+pad or (-18-pad<y<3+pad and abs(x-(30.5+.11*(3-y)))<1.15+pad)
def collection(name):
 c=bpy.data.collections.new(name);S.collection.children.link(c);return c
LIB=bpy.data.collections.new('Poly Haven | native specimen library')
REPL=collection('03 | sourced vegetation');GEO=collection('03 | sourced ground detail')

def import_specimens(slug,lod_preference):
 path=ROOT/REG['models'][slug]['file']
 with bpy.data.libraries.load(str(path),link=False) as (src,dst):
  names=src.collections
  selected=next((n for suffix in lod_preference for n in names if n.lower()==(slug+suffix).lower()),None)
  if not selected:selected=next((n for n in names if n.lower()==slug.lower()),None)
  if not selected:raise ValueError('No static asset collection '+slug)
  dst.collections=[selected]
 c=dst.collections[0];S.collection.children.link(c);bpy.context.view_layer.update();specs=[]
 for ob in list(c.all_objects):
  if ob.type!='MESH' or any(m.type=='NODES' for m in ob.modifiers) or len(ob.data.vertices)<3:continue
  dg=bpy.context.evaluated_depsgraph_get();me=bpy.data.meshes.new_from_object(ob.evaluated_get(dg),depsgraph=dg);me.transform(ob.matrix_world)
  xs=[v.co.x for v in me.vertices];ys=[v.co.y for v in me.vertices];zs=[v.co.z for v in me.vertices]
  if max(zs)-min(zs)<.015:bpy.data.meshes.remove(me);continue
  off=Vector(((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,min(zs)));me.transform(Matrix.Translation(-off))
  specimen=bpy.data.objects.new('PH | '+slug+' | '+ob.name,me);LIB.objects.link(specimen)
  specimen['source_asset']=slug;specimen['source_license']='CC0';specimen['native_lod']=selected;specs.append(specimen)
 for ob in list(c.all_objects):bpy.data.objects.remove(ob,do_unlink=True)
 bpy.data.collections.remove(c)
 if not specs:raise ValueError('No static specimens '+slug)
 print('ART03_SPECIMENS',slug,json.dumps([{'name':o.name,'vertices':len(o.data.vertices),'height':round(max(v.co.z for v in o.data.vertices),3)} for o in specs]),flush=True)
 return specs
TREES=import_specimens('pine_tree_01',['_LOD2','_LOD1','_static','_LOD0'])
GRASS=import_specimens('grass_medium_01',['_LOD1','_LOD2','_static','_LOD0'])
FERNS=import_specimens('fern_02',['_LOD1','_LOD2','_static','_LOD0'])
ROCKS=import_specimens('rock_moss_set_01',['_LOD0','_static','_LOD1'])
LOGS=import_specimens('dead_tree_trunk_02',['_LOD0','_static','_LOD1'])
for img in bpy.data.images:
 if img.source!='FILE' or img.packed_file:continue
 if not Path(bpy.path.abspath(img.filepath)).is_file():
  matches=list(ROOT.rglob(Path(img.filepath).name))
  if len(matches)==1:img.filepath=str(matches[0]);img.reload()
uv=terrain.data.uv_layers.new(name='PBR_metres')
for loop in terrain.data.loops:
 p=terrain.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x/2.1,p.y/2.1)
def image(path,noncolor=False):
 im=bpy.data.images.load(str(ROOT/path),check_existing=True);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';return im

def texture_set(nodes,links,slug,vector):
 result={}
 for channel,path in REG['textures'][slug]['maps'].items():
  tex=nodes.new('ShaderNodeTexImage');tex.image=image(path,channel!='diff');tex.interpolation='Linear';tex.extension='REPEAT';links.new(vector,tex.inputs['Vector']);result[channel]=tex.outputs['Color']
 return result

def scanned_material(name,slug,blend_slug=None):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
 out=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');l.new(p.outputs['BSDF'],out.inputs['Surface']);uvn=n.new('ShaderNodeUVMap');uvn.uv_map='PBR_metres'
 a=texture_set(n,l,slug,uvn.outputs['UV']);fields=a
 if blend_slug:
  b=texture_set(n,l,blend_slug,uvn.outputs['UV']);coords=n.new('ShaderNodeTexCoord');no=n.new('ShaderNodeTexNoise');no.inputs['Scale'].default_value=.13;no.inputs['Detail'].default_value=3;l.new(coords.outputs['Object'],no.inputs['Vector'])
  ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.40;ramp.color_ramp.elements[1].position=.62;l.new(no.outputs['Fac'],ramp.inputs['Fac']);fields={}
  for channel in a:
   mix=n.new('ShaderNodeMixRGB');l.new(ramp.outputs['Color'],mix.inputs[0]);l.new(a[channel],mix.inputs[1]);l.new(b[channel],mix.inputs[2]);fields[channel]=mix.outputs['Color']
 l.new(fields['diff'],p.inputs['Base Color']);l.new(fields['rough'],p.inputs['Roughness']);normal=n.new('ShaderNodeNormalMap');normal.uv_map='PBR_metres';normal.inputs['Strength'].default_value=.75;l.new(fields['nor_gl'],normal.inputs['Color'])
 bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.035;l.new(fields['disp'],bump.inputs['Height']);l.new(normal.outputs['Normal'],bump.inputs['Normal']);l.new(bump.outputs['Normal'],p.inputs['Normal']);mat['source_assets']=slug+((', '+blend_slug) if blend_slug else '');mat['source_license']='CC0';return mat
terrain.data.materials.clear();terrain.data.materials.append(scanned_material('PH | Forest floor and leafy ground | metre scale','forest_floor','leafy_grass'))
for p in terrain.data.polygons:p.material_index=0
roadmat=scanned_material('PH | Worn gravel and soil','gravel_road')
for name in ['Winding gravel access trail','Lodge entry footpath']:
 ob=bpy.data.objects.get(name)
 if not ob:continue
 uv=ob.data.uv_layers.new(name='PBR_metres')
 for loop in ob.data.loops:
  v=ob.matrix_world@ob.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(v.x/2,v.y/2)
 ob.data.materials.clear();ob.data.materials.append(roadmat)
sub=terrain.modifiers.new('Microtopography subdivision','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1;sub.render_levels=1
tex=bpy.data.textures.new('PH forest floor displacement','IMAGE');tex.image=image(REG['textures']['forest_floor']['maps']['disp'],True)
dis=terrain.modifiers.new('Scanned shallow ground relief','DISPLACE');dis.texture=tex;dis.texture_coords='UV';dis.uv_layer='PBR_metres';dis.strength=.045;dis.mid_level=.5
rng=random.Random(623190);placement={'trees':0,'grass_points':0,'fern_points':0,'rocks':0,'deadwood':0}
def instance(proto,x,y,scale,angle,col,label,tilt=0):
 ob=bpy.data.objects.new(label,proto.data);col.objects.link(ob);ob.location=(x,y,height(x,y)-.02);ob.rotation_euler=(tilt,tilt*.43,angle);ob.scale=(scale,scale,scale);ob['source_asset']=proto['source_asset'];return ob
positions=[]
for i in range(2000):
 x,y=rng.uniform(-10,165),rng.uniform(-115,160)
 if x<shore(y)+10 or lodge(x,y,14) or on_path(x,y,3) or (-16<x<46 and -38<y<0) or math.hypot(x-2,y+22)<9:continue
 if any((x-a)**2+(y-b)**2<30 for a,b in positions):continue
 if math.sin(x*.08)+math.cos(y*.057)<-1.0:continue
 positions.append((x,y))
 if len(positions)>=190:break
for i,(x,y) in enumerate(positions):
 proto=TREES[i%len(TREES)];h=max(v.co.z for v in proto.data.vertices);desired=rng.uniform(16,25) if i%6 else rng.uniform(10,16)
 instance(proto,x,y,desired/h,rng.uniform(0,math.tau),REPL,'Pine stand | %03d'%i,rng.uniform(-.025,.025));placement['trees']+=1

def point_instances(proto,points,scales,rotations,name,col):
 if not points:return
 me=bpy.data.meshes.new(name);me.from_pydata(points,[],[]);me.update();a=me.attributes.new('plant_scale','FLOAT_VECTOR','POINT');a.data.foreach_set('vector',[v for s in scales for v in (s,s,s)]);a=me.attributes.new('plant_rotation','FLOAT_VECTOR','POINT');a.data.foreach_set('vector',[v for r in rotations for v in (0,0,r)])
 ob=bpy.data.objects.new(name,me);col.objects.link(ob);ng=bpy.data.node_groups.new(name,'GeometryNodeTree');ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
 n=ng.nodes;l=ng.links;gin=n.new('NodeGroupInput');gout=n.new('NodeGroupOutput');ins=n.new('GeometryNodeInstanceOnPoints');oi=n.new('GeometryNodeObjectInfo');oi.inputs['Object'].default_value=proto;oi.inputs['As Instance'].default_value=True;oi.transform_space='ORIGINAL';l.new(gin.outputs['Geometry'],ins.inputs['Points']);l.new(oi.outputs['Geometry'],ins.inputs['Instance']);l.new(ins.outputs['Instances'],gout.inputs['Geometry'])
 for attr,socket in [('plant_scale','Scale'),('plant_rotation','Rotation')]:
  node=n.new('GeometryNodeInputNamedAttribute');node.data_type='FLOAT_VECTOR';node.inputs['Name'].default_value=attr;l.new(node.outputs['Attribute'],ins.inputs[socket])
 mod=ob.modifiers.new('Linked textured plant scatter','NODES');mod.node_group=ng;ob['source_asset']=proto['source_asset'];ob['plant_count']=len(points)

def scatter_plants(specs,kind,count,bounds):
 buckets=[([],[],[]) for _ in specs]
 for i in range(count):
  x,y=rng.uniform(bounds[0],bounds[1]),rng.uniform(bounds[2],bounds[3])
  if x<shore(y)+4 or lodge(x,y,1.4) or on_path(x,y,.35):continue
  if math.hypot(x-2,y+22)>65 and rng.random()>.22:continue
  pattern=.55+.35*math.sin(x*.20+math.sin(y*.11))*.9+.10*math.cos(y*.34)
  if rng.random()>pattern:continue
  j=i%len(specs);h=max(v.co.z for v in specs[j].data.vertices);desired=rng.uniform(.12,.34) if kind=='grass' else rng.uniform(.32,.7)
  buckets[j][0].append((x,y,height(x,y)-.025));buckets[j][1].append(desired/h);buckets[j][2].append(rng.random()*math.tau)
 for j,(points,scales,rots) in enumerate(buckets):point_instances(specs[j],points,scales,rots,'Textured '+kind+' | variant '+str(j),GEO);placement[kind+'_points']+=len(points)
scatter_plants(GRASS,'grass',36000,(-14,105,-70,92));scatter_plants(FERNS,'fern',2300,(-10,120,-65,105))
def width(proto):return max(max(v.co.x for v in proto.data.vertices)-min(v.co.x for v in proto.data.vertices),max(v.co.y for v in proto.data.vertices)-min(v.co.y for v in proto.data.vertices))
for i in range(130):
 x,y=rng.uniform(-12,98),rng.uniform(-55,100)
 if lodge(x,y,3) or on_path(x,y,1) or x<shore(y)+3:continue
 proto=ROCKS[i%len(ROCKS)];ob=instance(proto,x,y,rng.uniform(.15,.85)/width(proto),rng.random()*math.tau,GEO,'Mossy stone | %03d'%i);ob.location.z-=.05;placement['rocks']+=1
for i,(x,y) in enumerate([(-2,-9),(43,-9),(4,33),(65,28),(12,-51)]):
 proto=LOGS[i%len(LOGS)];ob=instance(proto,x,y,rng.uniform(.7,1.1),rng.random()*math.tau,GEO,'Fallen timber | %02d'%i);ob.location.z-=.07;placement['deadwood']+=1
for i,(x,y,diameter) in enumerate([(11,-7,1.6),(-8,-31,1.1),(45,1,1.25)]):
 proto=ROCKS[i%len(ROCKS)];ob=instance(proto,x,y,diameter/width(proto),.7+i,GEO,'Embedded hero stone '+str(i));ob.location.z-=.12;placement['rocks']+=1
board=bpy.data.objects.get('Information board')
if board:
 curve=bpy.data.curves.new('Field station lettering','FONT');curve.body='FIELD STATION';curve.align_x='CENTER';curve.size=.18;curve.extrude=.0005;ob=bpy.data.objects.new('Field station lettering',curve);bpy.data.collections['Props'].objects.link(ob);ob.location=(15.05,-13.085,height(15,-13)+1.8);ob.rotation_euler=(math.pi/2,0,0);mat=bpy.data.materials.new('Pale engraved lettering');mat.diffuse_color=(.75,.72,.60,1);curve.materials.append(mat)
for name in ['Weathered cedar siding','Sun-worn decking']:
 mat=bpy.data.materials.get(name)
 if not mat or not mat.use_nodes:continue
 n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF');existing=p.inputs['Base Color'].links
 if existing:
  source=existing[0].from_socket;info=n.new('ShaderNodeObjectInfo');ramp=n.new('ShaderNodeMapRange');ramp.inputs['To Min'].default_value=.72;ramp.inputs['To Max'].default_value=1.13;l.new(info.outputs['Random'],ramp.inputs['Value']);mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;l.new(source,mix.inputs[1]);l.new(ramp.outputs['Result'],mix.inputs[2]);l.new(mix.outputs['Color'],p.inputs['Base Color'])
for node in S.world.node_tree.nodes:
 if node.type=='TEX_SKY':node.sun_disc=False;node.sun_elevation=math.radians(38);node.sun_rotation=math.radians(215);node.dust_density=.5
 if node.type=='BACKGROUND':node.inputs['Strength'].default_value=.38
sun=bpy.data.objects.get('Afternoon sun');sun.data.energy=2.3;sun.data.angle=math.radians(3);sun.rotation_euler=Vector((.6,.8,-1.1)).to_track_quat('-Z','Y').to_euler()
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.15
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=int(os.environ.get('WILDLIFE_ART03_SAMPLES','32'));S.cycles.use_denoising=True;S.cycles.max_bounces=6;S.cycles.transparent_max_bounces=12;S.render.resolution_x=1280;S.render.resolution_y=720;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG'
bpy.data.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
missing=[i.filepath for i in bpy.data.images if i.source=='FILE' and i.users and not i.packed_file and not Path(bpy.path.abspath(i.filepath)).is_file()]
assert not missing,'Missing textures: '+repr(missing)
bpy.ops.file.pack_all();assert all(i.packed_file for i in bpy.data.images if i.source=='FILE' and i.users)
views=[('Approach eye level','approach_eye'),('Shore eye level','shore_eye'),('Porch to lake','porch_eye'),('District overview','district_overview')]
for name,data in before_camera.items():
 ob=bpy.data.objects[name];assert all(abs(ob.matrix_world[i][j]-data['matrix'][i][j])<1e-7 for i in range(4) for j in range(4)) and abs(ob.data.lens-data['lens'])<1e-7
S.camera=bpy.data.objects[views[0][0]];BLEND=OUT/'Wildlife_Lodge_Shore_03.blend';bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
receipt={'schema':1,'source_commit':os.environ.get('RENDER_GIT_COMMIT'),'base_sha256':REG['previous']['sha256'],'blender_version':bpy.app.version_string,'revision':S['template_revision'],'same_camera_verified':True,'camera_baseline':before_camera,'native_file':BLEND.name,'placement':placement,'removed_placeholder_objects':len(removed),'asset_credit':REG['credit'],'native_reopen_verified':False,'rendered_views':[],'visual_approval':False,'limitations':['New art candidate; owner quality approval remains open','No claim of COTW parity or calibrated biome','Detailed district not yet stitched to macro world','No gameplay/biology/companion/commerce change','No live-game performance or responsive 3D viewer claim']}
print('ART03_SCENE_READY',json.dumps({'placement':placement,'objects':len(S.objects),'packed_images':len([i for i in bpy.data.images if i.packed_file])}),flush=True)
for camera,name in views:
 S.camera=bpy.data.objects[camera];S.render.filepath=str(OUT/(name+'.png'));print('ART03_RENDER_START',name,flush=True);bpy.ops.render.render(write_still=True);receipt['rendered_views'].append(name+'.png');print('ART03_RENDER_DONE',name,flush=True)
S.camera=bpy.data.objects[views[0][0]];bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND),load_ui=False,use_scripts=False)
assert bpy.context.scene['template_revision']=='0.3.0-sourced-environment';assert bpy.data.objects.get('Lodge_Shore_Terrain') and bpy.data.objects.get('Lake_Surface');assert len(bpy.data.collections['03 | sourced vegetation'].objects)==placement['trees'];assert all(i.packed_file for i in bpy.data.images if i.source=='FILE' and i.users)
receipt['native_reopen_verified']=True;receipt['elapsed_seconds']=round(time.monotonic()-START,2);receipt['files']={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.suffix in ['.blend','.png']}
(OUT/'art_receipt.json').write_text(json.dumps(receipt,indent=2));(OUT/'asset_registry.json').write_text(json.dumps(REG,indent=2));print('ART03_NATIVE_COMPLETE',json.dumps(receipt),flush=True)
