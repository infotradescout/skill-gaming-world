"""Export the EXISTING packed Blender district for UE 5.7; never render/rebuild art.
Run in a disposable Blender process with --disable-autoexec.
Usage: blender -b --python-exit-code 17 -P export_district.py -- INPUT.blend OUTPUT
Geometry Nodes placements are retained as shared assets plus transforms, not flattened.
"""
import sys, os, json, math, hashlib, struct, array
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from contract import SCHEMA,BASE_SHA,digest_file,validate,point_to_unreal
import bpy, bmesh
import numpy as np
from mathutils import Matrix,Vector

args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2: raise SystemExit('Expected INPUT.blend OUTPUT')
source,out=Path(args[0]).resolve(),Path(args[1]).resolve()
if digest_file(source)!=BASE_SHA: raise RuntimeError('Native scene identity changed; refuse unreviewed input')
if out.exists() and any(out.iterdir()): raise RuntimeError('Export directory must be new/empty')
(out/'meshes').mkdir(parents=True);(out/'textures').mkdir()
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
scene=bpy.context.scene
if scene.unit_settings.scale_length!=1:raise RuntimeError('Source is not meter-scaled')
if scene.get('template_revision')!='0.3.1-forest-composition':raise RuntimeError('Wrong art revision')
receipt={'schema':SCHEMA,'source_blend_sha256':BASE_SHA,'source_art_revision':scene['template_revision'],
 'source_commit':os.environ.get('RENDER_GIT_COMMIT','local-unpublished'),'engine_target':'5.7',
 'units':'centimeters','coordinates':'X=BlenderX,Y=-BlenderY,Z=BlenderZ',
 'assets':[],'textures':[],'materials':[],'unreal_import_verified':False,
 'limitations':['No Unreal editor execution or Windows package in this export receipt',
 'Complex-static collision is a transitional walk-test policy, not optimized game collision',
 'Trunk collision proxies are approximate; foliage does not block walking',
 'Blender procedural material nodes require native reconstruction; see material warnings',
 'Detailed district remains separate from the macro reserve; no gameplay or biology is added']}
C=Matrix.Diagonal((1.,-1.,1.,1.));CM=Matrix.Diagonal((100.,100.,100.,1.))
camera=bpy.data.objects.get('Approach eye level')
if not camera:raise RuntimeError('Source comparison camera missing')
eye=camera.matrix_world.translation;direction=camera.matrix_world.to_3x3()@Vector((0,0,-1));direction=Vector((direction.x,-direction.y,direction.z))
receipt['player_start']={'location_cm':point_to_unreal((eye.x,eye.y,eye.z-.80)),
 'rotation_pitch_yaw_roll':[math.degrees(math.atan2(direction.z,math.hypot(direction.x,direction.y))),math.degrees(math.atan2(direction.y,direction.x)),0.],
 'eye_above_capsule_center_cm':80,'capsule_half_height_cm':92,
 'basis':'same authored approach eye position, not a verified capsule clearance'}
receipt['world_template_id']=scene.get('world_template_id','wildlife-reserve.template.001')
receipt['district_id']=scene.get('district_id','district-lodge-shore')

# Snapshot evaluated geometry and transforms before mutating the scene/selection.
dg=bpy.context.evaluated_depsgraph_get();mesh_cache={};instances=[];skipped={}
for inst in dg.object_instances:
    ob=inst.object
    if ob.type not in ('MESH','CURVE','FONT','SURFACE') or not inst.show_self:continue
    original=ob.original
    owner=inst.parent.original if inst.is_instance and inst.parent else original
    if owner.hide_render or (not inst.is_instance and original.hide_render):continue
    if any(c.name=='Authoring' for c in owner.users_collection):continue
    key=(ob.data.as_pointer(), tuple(m.name if m else '' for m in ob.data.materials))
    # Objects with modifiers can share source data but differ in evaluated geometry.
    if original.modifiers:key+=(original.name,)
    if key not in mesh_cache:
        me=bpy.data.meshes.new_from_object(ob,preserve_all_data_layers=True,depsgraph=dg)
        if not me or not len(me.polygons):
            if me:bpy.data.meshes.remove(me)
            mesh_cache[key]=None
        else:mesh_cache[key]=me
    if mesh_cache[key] is None:continue
    matrix=inst.matrix_world.copy()
    stamp={'owner':owner.name,'object':original.name,'persistent_id':list(inst.persistent_id) if inst.is_instance else [],'matrix':[list(r) for r in matrix]}
    ident='P_'+hashlib.sha256(json.dumps(stamp,sort_keys=True).encode()).hexdigest()[:24]
    role=str(owner.get('source_asset',original.get('source_asset','')))
    cols={c.name for c in owner.users_collection}
    if not role:
        role=next((c for c in ['Terrain','Lodge','Dock','Water','Props'] if c in cols),'ground_detail')
    instances.append((key,matrix,ident,role,original.name))
print('UE_SNAPSHOT',json.dumps({'visible_mesh_instances':len(instances),'evaluated_meshes':len(mesh_cache)}),flush=True)
if len(instances)<65000:raise RuntimeError('Expected complete authored grass/fern scatter; export appears incomplete')

# Preserve original packed texture bytes, not screenshots or color-managed rewrites.
texture_ids={}
for im in bpy.data.images:
    if im.source!='FILE' or not im.packed_file:continue
    payload=bytes(im.packed_file.data);sha=hashlib.sha256(payload).hexdigest()
    ext=Path(im.filepath).suffix.lower()
    if ext not in ('.png','.jpg','.jpeg','.exr','.tif','.tiff','.tga','.bmp'):ext='.png'
    tid='T_'+sha[:20];rel='textures/'+tid+ext
    if tid not in {t['id'] for t in receipt['textures']}:
        (out/rel).write_bytes(payload);receipt['textures'].append({'id':tid,'file':rel,'sha256':sha,'source_image':im.name})
    texture_ids[im.name]=tid;im.filepath=str(out/rel)

used_materials={}
for me in mesh_cache.values():
    if not me:continue
    if not me.materials or any(m is None for m in me.materials):
        default=bpy.data.materials.get('UE_ExplicitMissingMaterial') or bpy.data.materials.new('UE_ExplicitMissingMaterial')
        if not me.materials:me.materials.append(default)
        else:
            for j,m in enumerate(me.materials):
                if m is None:me.materials[j]=default
    for m in me.materials:used_materials[m.name]=m
mat_ids={name:'M_'+hashlib.sha256(name.encode()).hexdigest()[:20] for name in sorted(used_materials)}

def input_value(sock):
    if sock is None:return {'constant':0.0,'warning':'missing socket'}
    if not sock.is_linked:
        v=sock.default_value
        return {'constant':list(v) if hasattr(v,'__iter__') else float(v)}
    node=sock.links[0].from_node;output=sock.links[0].from_socket
    if node.type=='TEX_IMAGE' and node.image and node.image.name in texture_ids:
        result={'texture':texture_ids[node.image.name],'output':'alpha' if output.name=='Alpha' else 'rgb'}
        if node.inputs['Vector'].is_linked:
            coord=node.inputs['Vector'].links[0].from_node
            if coord.type=='UVMAP':result['uv_map']=coord.uv_map
            elif coord.type!='TEX_COORD':result['warning']='Nontrivial source texture mapping: '+coord.type
        return result
    if node.type=='NORMAL_MAP':
        result=input_value(node.inputs['Color']);result['normal_strength']=float(node.inputs['Strength'].default_value)
        if node.space!='TANGENT':result['warning']='Non-tangent source normal'
        return result
    return {'warning':'Native shader reconstruction required: '+node.type,'source_node':node.name}

for name,m in sorted(used_materials.items()):
    principals=[n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'] if m.use_nodes and m.node_tree else []
    p=principals[0] if len(principals)==1 else None
    channels={};warnings=[]
    for target,socket in [('base_color','Base Color'),('roughness','Roughness'),('metallic','Metallic'),('normal','Normal'),('alpha','Alpha')]:
        if p:
            value=input_value(p.inputs.get(socket))
            if target=='normal' and not p.inputs[socket].is_linked:continue
            channels[target]=value
            if value.get('warning'):warnings.append(target+': '+value['warning'])
        elif target=='base_color':channels[target]={'constant':list(m.diffuse_color),'warning':'No unique Principled shader'};warnings.append('No unique Principled shader')
    if p and p.inputs.get('Transmission Weight') and p.inputs['Transmission Weight'].default_value>0:
        warnings.append('Transmission/water requires native material review')
    receipt['materials'].append({'id':mat_ids[name],'source_name':name,'channels':channels,'fallback_base_color':list(m.diffuse_color),
       'two_sided':not m.use_backface_culling,'warnings':warnings})

# Content deduplication includes UVs, face topology and material-slot identity.
unique={};key_assets={}
for key,me in mesh_cache.items():
    if me is None:continue
    h=hashlib.sha256();h.update(json.dumps([mat_ids[m.name] for m in me.materials]).encode())
    for attr,seq,n in [('co',me.vertices,3),('vertex_index',me.loops,1)]:
        a=np.empty(len(seq)*n,dtype=np.float32 if attr=='co' else np.int32);seq.foreach_get(attr,a);h.update(a.tobytes())
    h.update(json.dumps([p.loop_total for p in me.polygons]).encode())
    h.update(bytes(int(p.use_smooth) for p in me.polygons))
    for uv in me.uv_layers:
        a=np.empty(len(me.loops)*2,dtype=np.float32);uv.data.foreach_get('uv',a);h.update(uv.name.encode());h.update(a.tobytes())
    digest=h.hexdigest();asset_id='SM_'+digest[:20];key_assets[key]=asset_id
    if asset_id not in unique:
        unique[asset_id]={'mesh':me,'hash':digest,'instances':[],'roles':set()}
for key,matrix,ident,role,name in instances:
    a=unique[key_assets[key]];u=C@matrix@C;u.translation*=100
    loc,rot,scale=u.decompose();reconstructed=Matrix.LocRotScale(loc,rot,scale)
    if max(abs(u[r][c]-reconstructed[r][c]) for r in range(4) for c in range(4))>1e-3:raise RuntimeError('Sheared transform needs explicit bake: '+name)
    a['instances'].append({'id':ident,'location_cm':list(loc),'rotation_xyzw':[rot.x,rot.y,rot.z,rot.w],'scale':list(scale),'source_object':name})
    a['roles'].add(role)

# Isolated centimeter-native FBX payloads. UE import MUST disable automatic axes/units.
# FBX remains right-handed Z-up. The legacy importer performs its handedness
# conversion; expected Unreal bounds below explicitly require Y reflection once.
bpy.ops.object.select_all(action='DESELECT')
exports=bpy.data.collections.new('UE_EXPORT_TEMP');scene.collection.children.link(exports)
scene.unit_settings.scale_length=.01
from io_scene_fbx import parse_fbx as parse

def fbx_geometry_bounds(filename):
    tree,_=parse.parse(str(filename))
    objects=next(e for e in tree.elems if e.id==b'Objects')
    geom=next(e for e in objects.elems if e.id==b'Geometry' and not bytes(e.props[1]).startswith(b'UCX_'))
    values=next(e.props[0] for e in geom.elems if e.id==b'Vertices')
    v=np.asarray(values).reshape(-1,3)
    return [v.min(axis=0).tolist(),v.max(axis=0).tolist()]

for number,(aid,a) in enumerate(sorted(unique.items())):
    me=a['mesh'];me.transform(CM);me.update()
    roles=a['roles'];collision='none'
    if roles & {'Terrain','Lodge','Dock','Props','rock_moss_set_01','dead_tree_trunk_02'}:collision='complex_static'
    if 'pine_tree_01' in roles:collision='trunk_proxy'
    ob=bpy.data.objects.new(aid,me);exports.objects.link(ob);ob.select_set(True);bpy.context.view_layer.objects.active=ob
    if not me.uv_layers:
        uv=me.uv_layers.new(name='UE_ProvisionalPlanarUV')
        for loop in me.loops:
            v=me.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(v.x/200,v.y/200)
    xyz=np.empty(len(me.vertices)*3,dtype=np.float32);me.vertices.foreach_get('co',xyz);xyz=xyz.reshape(-1,3)
    bounds=[xyz.min(axis=0).tolist(),xyz.max(axis=0).tolist()]
    proxy=None
    if collision=='trunk_proxy':
        # Short trunk only: NEVER a collision hull around the whole canopy.
        radius=25.;z0=bounds[0][2];z1=min(bounds[1][2],z0+300.)
        coords=[(radius*math.cos(j*math.tau/8),radius*math.sin(j*math.tau/8),z) for z in [z0,z1] for j in range(8)]
        faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)]
        pm=bpy.data.meshes.new('UCX_'+aid+'_00');pm.from_pydata(coords,[],faces);pm.update()
        proxy=bpy.data.objects.new(pm.name,pm);exports.objects.link(proxy);proxy.select_set(True)
    filepath=out/'meshes'/(aid+'.fbx')
    bpy.ops.export_scene.fbx(filepath=str(filepath),use_selection=True,object_types={'MESH'},global_scale=1.0,apply_unit_scale=False,
       apply_scale_options='FBX_SCALE_NONE',use_space_transform=False,axis_forward='-Y',axis_up='Z',bake_space_transform=False,
       use_mesh_modifiers=False,mesh_smooth_type='FACE',use_triangles=True,add_leaf_bones=False,bake_anim=False,path_mode='RELATIVE',embed_textures=False)
    parsed=fbx_geometry_bounds(filepath)
    if max(abs(parsed[j][k]-bounds[j][k]) for j in range(2) for k in range(3))>.02:raise RuntimeError('FBX altered numeric bounds '+aid)
    engine_bounds=[[bounds[0][0],-bounds[1][1],bounds[0][2]],[bounds[1][0],-bounds[0][1],bounds[1][2]]]
    aout={'id':aid,'file':str(filepath.relative_to(out)),'sha256':digest_file(filepath),'bounds_cm':engine_bounds,'fbx_bounds_cm':bounds,'vertices':len(me.vertices),
       'collision':collision,'roles':sorted(roles),'material_ids':[mat_ids[m.name] for m in me.materials],
       'uv_layers':[u.name for u in me.uv_layers],'instances':a['instances']}
    receipt['assets'].append(aout);bpy.data.objects.remove(ob,do_unlink=True)
    if proxy:bpy.data.objects.remove(proxy,do_unlink=True)
    if number%50==0:print('UE_MESH_EXPORT',number,len(unique),flush=True)
receipt['instance_count']=len(instances);receipt['source_visible_mesh_instances']=len(instances)
receipt['fbx_numeric_bounds_verified']=True
receipt['material_reconstruction_warnings']=[{'material':m['id'],'source_name':m['source_name'],'warnings':m['warnings']} for m in receipt['materials'] if m['warnings']]
receipt['fbx_import_settings']={'convert_scene':False,'convert_scene_unit':False,'force_front_x_axis':False,'import_uniform_scale':1.0}
(out/'district.json').write_text(json.dumps(receipt,separators=(',',':')))
verified=validate(receipt,out)
# Read source again: exporting must never mutate the editable master on disk.
if digest_file(source)!=BASE_SHA:raise RuntimeError('Source file changed during export')
summary={**verified,'source_blend_sha256':BASE_SHA,'blender_version':bpy.app.version_string,'fbx_numeric_bounds_verified':True,
 'material_warning_count':len(receipt['material_reconstruction_warnings']),'source_unchanged':True,'unreal_import_verified':False}
(out/'transport_receipt.json').write_text(json.dumps(summary,indent=2))
print('UNREAL_TRANSPORT_COMPLETE',json.dumps(summary),flush=True)
