"""Run only inside UE 5.7 after compiling WildlifeReserveEditor.
InputBundle/district.json is beside the .uproject. Creates owned generated assets
and a new LodgeDistrict map; refuses to overwrite an unrelated or changed map.
This is editor integration source until an actual UE execution receipt exists.
"""
import sys, json, math, hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from contract import validate,digest_file,safe_file
import unreal as ue

project=Path(ue.Paths.project_dir()).resolve()
root=project/'InputBundle'; manifest=root/'district.json'
report_path=project/'Saved'/'UnrealDistrictImport.json';report_path.parent.mkdir(exist_ok=True,parents=True)
data=json.loads(manifest.read_text()); integrity=validate(data,root)
engine=ue.SystemLibrary.get_engine_version()
if not engine.startswith('5.7.'):raise RuntimeError('Use the Frontline-aligned 5.7 target, not an unreviewed engine upgrade: '+engine)
if not hasattr(ue,'ReserveInstanceGroup'):raise RuntimeError('Compile WildlifeReserveEditor before import')
identity=digest_file(manifest);prefix='/Game/Reserve/Generated/D'+identity[:16]
map_path='/Game/Reserve/Maps/LodgeDistrict'
E=ue.EditorAssetLibrary;tools=ue.AssetToolsHelpers.get_asset_tools()
report={'schema':1,'unreal_executed':True,'engine':engine,'transport_sha256':identity,'source_blend_sha256':data['source_blend_sha256'],
 'import_completed':False,'windows_packaged':False,'walkthrough_verified':False,'visual_parity_verified':False,
 'material_warnings':data['material_reconstruction_warnings'],'instance_count':0,'asset_count':0}
# Import in a new dedicated project; do not replace a user's artist-edited map.
if E.does_asset_exist(map_path):
    old=json.loads(report_path.read_text()) if report_path.is_file() else {}
    if old.get('transport_sha256')==identity and old.get('import_completed'):
        ue.log('UNREAL_DISTRICT_ALREADY_IMPORTED '+json.dumps(old));raise SystemExit(0)
    raise RuntimeError('Existing map is not this completed import. Preserve it; use a fresh project copy.')

def run_task(filename,dest,name,options=None,factory=None):
    expected=dest+'/'+name
    if E.does_asset_exist(expected):
        obj=E.load_asset(expected)
        if E.get_metadata_tag(obj,'WildlifeTransport')!=identity:raise RuntimeError('Unowned existing asset '+expected)
        return obj
    task=ue.AssetImportTask()
    for key,value in {'filename':str(filename),'destination_path':dest,'destination_name':name,'automated':True,'save':False,'replace_existing':False,'async_':False}.items():task.set_editor_property(key,value)
    if options:task.set_editor_property('options',options)
    if factory:task.set_editor_property('factory',factory)
    tools.import_asset_tasks([task]);objects=list(task.get_objects())
    candidates=[o for o in objects if isinstance(o,ue.StaticMesh if options else ue.Texture2D)]
    if len(candidates)!=1:raise RuntimeError('Unexpected import results for '+str(filename))
    obj=candidates[0]
    E.set_metadata_tag(obj,'WildlifeTransport',identity);E.save_loaded_asset(obj)
    return obj

texture_info={t['id']:t for t in data['textures']};texture_cache={}
def texture(tid,mode):
    key=(tid,mode)
    if key not in texture_cache:
        t=texture_info[tid];name=tid+'_'+mode
        obj=run_task(safe_file(root,t['file']),prefix+'/Textures',name)
        obj.set_editor_property('srgb',mode=='color')
        if mode=='normal':
            obj.set_editor_property('compression_settings',ue.TextureCompressionSettings.TC_NORMALMAP)
            obj.set_editor_property('flip_green_channel',True)
        E.save_loaded_asset(obj);texture_cache[key]=obj
    return texture_cache[key]

materials={};ML=ue.MaterialEditingLibrary
properties={'base_color':ue.MaterialProperty.MP_BASE_COLOR,'roughness':ue.MaterialProperty.MP_ROUGHNESS,'metallic':ue.MaterialProperty.MP_METALLIC,'normal':ue.MaterialProperty.MP_NORMAL,'alpha':ue.MaterialProperty.MP_OPACITY_MASK}
for md in data['materials']:
    path=prefix+'/Materials/'+md['id']
    if E.does_asset_exist(path):
        mat=E.load_asset(path)
        if E.get_metadata_tag(mat,'WildlifeTransport')!=identity:raise RuntimeError('Unowned material')
    else:
        mat=tools.create_asset(md['id'],prefix+'/Materials',ue.Material,ue.MaterialFactoryNew())
        mat.set_editor_property('two_sided',md['two_sided'])
        for channel,desc in md['channels'].items():
            if channel=='alpha' and not desc.get('texture'):continue
            if desc.get('texture'):
                mode='normal' if channel=='normal' else ('color' if channel in ('base_color','alpha') else 'linear')
                node=ML.create_material_expression(mat,ue.MaterialExpressionTextureSample)
                node.set_editor_property('texture',texture(desc['texture'],mode))
                node.set_editor_property('sampler_type',ue.MaterialSamplerType.SAMPLERTYPE_NORMAL if mode=='normal' else (ue.MaterialSamplerType.SAMPLERTYPE_COLOR if mode=='color' else ue.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR))
                output='A' if desc.get('output')=='alpha' else ('RGB' if channel in ('base_color','normal') else 'R')
            elif channel=='normal':continue
            elif channel=='base_color':
                node=ML.create_material_expression(mat,ue.MaterialExpressionConstant3Vector)
                value=desc.get('constant',md['fallback_base_color'])
                node.set_editor_property('constant',ue.LinearColor(*value[:3],1.));output=''
            else:
                node=ML.create_material_expression(mat,ue.MaterialExpressionConstant)
                value=desc.get('constant',.8 if channel=='roughness' else 0.)
                node.set_editor_property('r',float(value));output=''
            ML.connect_material_property(node,output,properties[channel])
            if channel=='alpha':mat.set_editor_property('blend_mode',ue.BlendMode.BLEND_MASKED)
        E.set_metadata_tag(mat,'WildlifeTransport',identity)
        E.set_metadata_tag(mat,'NeedsNativeMaterialReview',json.dumps(md['warnings']))
        ML.recompile_material(mat);E.save_loaded_asset(mat)
    materials[md['id']]=mat

meshes={}
ue.SystemLibrary.execute_console_command(None,'Interchange.FeatureFlags.Import.FBX 0')
for ad in data['assets']:
    opts=ue.FbxImportUI()
    for key,value in {'import_mesh':True,'import_as_skeletal':False,'import_materials':False,'import_textures':False,'automated_import_should_detect_type':False,'mesh_type_to_import':ue.FBXImportType.FBXIT_STATIC_MESH}.items():opts.set_editor_property(key,value)
    info=opts.get_editor_property('static_mesh_import_data')
    for key,value in {**data['fbx_import_settings'],'combine_meshes':False,'transform_vertex_to_absolute':False,'auto_generate_collision':False,'generate_lightmap_u_vs':False,'build_nanite':False,'one_convex_hull_per_ucx':True,'normal_import_method':ue.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS}.items():info.set_editor_property(key,value)
    mesh=run_task(safe_file(root,ad['file']),prefix+'/Meshes',ad['id'],opts,ue.FbxFactory())
    bounds=mesh.get_bounding_box();actual=[[bounds.min.x,bounds.min.y,bounds.min.z],[bounds.max.x,bounds.max.y,bounds.max.z]]
    # Fail on axis/unit errors instead of visually hiding them with actor scale.
    if max(abs(actual[j][k]-ad['bounds_cm'][j][k]) for j in range(2) for k in range(3))>.1:
        raise RuntimeError('UE mesh coordinate/scale mismatch: '+ad['id'])
    for i,mid in enumerate(ad['material_ids']):mesh.set_material(i,materials[mid])
    if ad['collision']=='complex_static':
        body=mesh.get_editor_property('body_setup')
        if not body:raise RuntimeError('Missing collision body '+ad['id'])
        body.set_editor_property('collision_trace_flag',ue.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    if ad['collision']=='trunk_proxy':
        count=ue.get_editor_subsystem(ue.StaticMeshEditorSubsystem).get_simple_collision_count(mesh)
        if count<1:raise RuntimeError('Trunk collision hull not imported: '+ad['id'])
    E.save_loaded_asset(mesh);meshes[ad['id']]=mesh;report['asset_count']+=1

levels=ue.get_editor_subsystem(ue.LevelEditorSubsystem)
actors=ue.get_editor_subsystem(ue.EditorActorSubsystem)
if not levels.new_level(map_path):raise RuntimeError('Failed to create dedicated map')
for ad in data['assets']:
    cells={}
    for inst in ad['instances']:
        loc=inst['location_cm'];key=(math.floor(loc[0]/3200),math.floor(loc[1]/3200));cells.setdefault(key,[]).append(inst)
    for (cx,cy),items in cells.items():
        anchor=[cx*3200.,cy*3200.,0.]
        actor=actors.spawn_actor_from_class(ue.ReserveInstanceGroup,ue.Vector(*anchor))
        actor.set_actor_label(ad['id']+'_'+str(cx)+'_'+str(cy))
        actor.set_editor_property('source_asset_id',ad['id']);actor.set_editor_property('source_district_id',data['district_id'])
        actor.configure(meshes[ad['id']],ad['collision']!='none')
        transforms=[]
        for i in items:
            t=ue.Transform()
            t.set_editor_property('translation',ue.Vector(*(v-a for v,a in zip(i['location_cm'],anchor))))
            t.set_editor_property('rotation',ue.Quat(*i['rotation_xyzw']))
            t.set_editor_property('scale3d',ue.Vector(*i['scale']))
            transforms.append(t)
        comp=actor.get_editor_property('instances')
        comp.add_instances(transforms,False,False,False)
        if comp.get_instance_count()!=len(items):raise RuntimeError('Lost instances')
        report['instance_count']+=len(items)
start=data['player_start'];spawn=actors.spawn_actor_from_class(ue.PlayerStart,ue.Vector(*start['location_cm']),ue.Rotator(*start['rotation_pitch_yaw_roll']))
spawn.set_actor_label('Authored_Approach_PlayerStart')
sun=actors.spawn_actor_from_class(ue.DirectionalLight,ue.Vector(0,0,10000),ue.Rotator(-32,-35,0))
sun.get_component_by_class(ue.DirectionalLightComponent).set_editor_property('intensity',3.)
actors.spawn_actor_from_class(ue.SkyAtmosphere,ue.Vector(0,0,0))
sky=actors.spawn_actor_from_class(ue.SkyLight,ue.Vector(0,0,5000))
sky.get_component_by_class(ue.SkyLightComponent).set_editor_property('real_time_capture',True)
if report['instance_count']!=data['instance_count']:raise RuntimeError('Map instance accounting mismatch')
if not levels.save_current_level():raise RuntimeError('Could not save map')
report['map']=map_path;report['import_completed']=True
report_path.write_text(json.dumps(report,indent=2))
ue.log('UNREAL_DISTRICT_IMPORT_COMPLETE '+json.dumps(report))
