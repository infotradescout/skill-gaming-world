"""UE5.7-only editor import. Execute through Build-Windows.ps1.
Receipts identify this invocation. A past successful run cannot mask a new failure.
"""
import json
import math
import os
import sys
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract import validate, digest_file, safe_file
from import_safety import IMPORT_REVISION, rotator_fields, content_digest, reusable_receipt
import unreal as ue


def execute(project, run_id, importer_sha):
    root = project / 'InputBundle'
    manifest = root / 'district.json'
    data = json.loads(manifest.read_text())
    validate(data, root)
    engine = ue.SystemLibrary.get_engine_version()
    if not engine.startswith('5.7.') or not hasattr(ue, 'ReserveInstanceGroup'):
        raise RuntimeError('Expected UE5.7 with WildlifeReserveEditor compiled')
    identity = digest_file(manifest)
    prefix = '/Game/Reserve/Generated/D' + identity[:16]
    map_path = '/Game/Reserve/Maps/LodgeDistrict'
    receipt_path = project / 'Saved/UnrealDistrictImport.json'
    content_root = project / 'Content/Reserve'
    E = ue.EditorAssetLibrary
    tools = ue.AssetToolsHelpers.get_asset_tools()
    levels = ue.get_editor_subsystem(ue.LevelEditorSubsystem)
    actors = ue.get_editor_subsystem(ue.EditorActorSubsystem)
    report = {
        'schema': 2, 'run_id': run_id, 'import_revision': IMPORT_REVISION,
        'unreal_executed': True, 'engine': engine, 'transport_sha256': identity,
        'importer_sha256': importer_sha,
        'support_sha256': {n: digest_file(Path(__file__).with_name(n)) for n in ('contract.py', 'import_safety.py')},
        'source_blend_sha256': data['source_blend_sha256'], 'import_completed': False,
        'windows_packaged': False, 'walkthrough_verified': False,
        'visual_parity_verified': False, 'map_reopened_verified': False,
        'material_warnings': data['material_reconstruction_warnings'],
        'instance_count': 0, 'asset_count': 0, 'map': map_path,
    }

    def verify_loaded_map():
        groups = [a for a in actors.get_all_level_actors() if isinstance(a, ue.ReserveInstanceGroup)]
        total = sum(a.get_editor_property('instances').get_instance_count() for a in groups)
        if total != data['instance_count']:
            raise RuntimeError('Saved map lost scene instances')
        starts = [a for a in actors.get_all_level_actors() if isinstance(a, ue.PlayerStart)]
        if len(starts) != 1:
            raise RuntimeError('Map must have exactly one authored player start')
        expected = data['player_start']['rotation_pitch_yaw_roll']
        rotation = starts[0].get_actor_rotation()
        def delta(a, b): return abs((a-b+180) % 360-180)
        if max(delta(rotation.pitch, expected[0]), delta(rotation.yaw, expected[1]), delta(rotation.roll, expected[2])) > .01:
            raise RuntimeError('Saved player orientation differs from the authored camera')
        return total

    # Verify an existing map and every owned package before reusing it. No overwrite.
    if E.does_asset_exist(map_path):
        old = json.loads(receipt_path.read_text()) if receipt_path.is_file() else {}
        if not reusable_receipt(old, identity, importer_sha, content_digest(content_root)) or old.get('support_sha256') != report['support_sha256']:
            raise RuntimeError('Existing map was changed or belongs to an incomplete import. Preserve this folder; START-WILDLIFE creates a fresh isolated attempt.')
        if not levels.load_level(map_path):
            raise RuntimeError('Saved map could not be reopened')
        report.update(instance_count=verify_loaded_map(), asset_count=len(data['assets']),
                      map_reopened_verified=True, import_completed=True, reused_verified_map=True,
                      content_sha256=old['content_sha256'])
        return report

    def run_task(filename, dest, name, options=None, factory=None):
        expected = dest + '/' + name
        if E.does_asset_exist(expected):
            obj = E.load_asset(expected)
            if E.get_metadata_tag(obj, 'WildlifeTransport') != identity:
                raise RuntimeError('Unowned existing asset ' + expected)
            return obj
        task = ue.AssetImportTask()
        for key, value in {'filename': str(filename), 'destination_path': dest, 'destination_name': name,
                           'automated': True, 'save': False, 'replace_existing': False, 'async_': False}.items():
            task.set_editor_property(key, value)
        if options: task.set_editor_property('options', options)
        if factory: task.set_editor_property('factory', factory)
        tools.import_asset_tasks([task])
        expected_type = ue.StaticMesh if options else ue.Texture2D
        candidates = [o for o in task.get_objects() if isinstance(o, expected_type)]
        if len(candidates) != 1:
            raise RuntimeError('Unexpected import result: ' + str(filename))
        obj = candidates[0]
        E.set_metadata_tag(obj, 'WildlifeTransport', identity)
        if not E.save_loaded_asset(obj): raise RuntimeError('Could not save imported asset')
        return obj

    texture_info = {t['id']: t for t in data['textures']}
    texture_cache = {}
    def texture(tid, mode):
        key = (tid, mode)
        if key not in texture_cache:
            obj = run_task(safe_file(root, texture_info[tid]['file']), prefix + '/Textures', tid + '_' + mode)
            obj.set_editor_property('srgb', mode == 'color')
            if mode == 'normal':
                obj.set_editor_property('compression_settings', ue.TextureCompressionSettings.TC_NORMALMAP)
                obj.set_editor_property('flip_green_channel', True)
            if not E.save_loaded_asset(obj): raise RuntimeError('Could not save texture')
            texture_cache[key] = obj
        return texture_cache[key]

    materials = {}
    ML = ue.MaterialEditingLibrary
    properties = {'base_color': ue.MaterialProperty.MP_BASE_COLOR, 'roughness': ue.MaterialProperty.MP_ROUGHNESS,
                  'metallic': ue.MaterialProperty.MP_METALLIC, 'normal': ue.MaterialProperty.MP_NORMAL,
                  'alpha': ue.MaterialProperty.MP_OPACITY_MASK}
    for md in data['materials']:
        path = prefix + '/Materials/' + md['id']
        if E.does_asset_exist(path):
            mat = E.load_asset(path)
            if E.get_metadata_tag(mat, 'WildlifeTransport') != identity:
                raise RuntimeError('Unowned existing material')
        else:
            mat = tools.create_asset(md['id'], prefix + '/Materials', ue.Material, ue.MaterialFactoryNew())
            if not mat: raise RuntimeError('Material creation failed')
            mat.set_editor_property('two_sided', md['two_sided'])
            # These are explicit provisional mappings, not Blender visual parity.
            for channel, desc in md['channels'].items():
                if channel == 'alpha' and not desc.get('texture'): continue
                if desc.get('texture'):
                    mode = 'normal' if channel == 'normal' else ('color' if channel in ('base_color', 'alpha') else 'linear')
                    node = ML.create_material_expression(mat, ue.MaterialExpressionTextureSample)
                    node.set_editor_property('texture', texture(desc['texture'], mode))
                    sampler = ue.MaterialSamplerType.SAMPLERTYPE_NORMAL if mode == 'normal' else (ue.MaterialSamplerType.SAMPLERTYPE_COLOR if mode == 'color' else ue.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
                    node.set_editor_property('sampler_type', sampler)
                    output = 'A' if desc.get('output') == 'alpha' else ('RGB' if channel in ('base_color', 'normal') else 'R')
                elif channel == 'normal': continue
                elif channel == 'base_color':
                    node = ML.create_material_expression(mat, ue.MaterialExpressionConstant3Vector)
                    value = desc.get('constant', md['fallback_base_color'])
                    node.set_editor_property('constant', ue.LinearColor(*value[:3], 1.))
                    output = ''
                else:
                    node = ML.create_material_expression(mat, ue.MaterialExpressionConstant)
                    node.set_editor_property('r', float(desc.get('constant', .8 if channel == 'roughness' else 0.)))
                    output = ''
                if not ML.connect_material_property(node, output, properties[channel]):
                    raise RuntimeError('Material connection failed: ' + md['id'] + '/' + channel)
                if channel == 'alpha': mat.set_editor_property('blend_mode', ue.BlendMode.BLEND_MASKED)
            E.set_metadata_tag(mat, 'WildlifeTransport', identity)
            E.set_metadata_tag(mat, 'NeedsNativeMaterialReview', json.dumps(md['warnings']))
            ML.recompile_material(mat)
            if not E.save_loaded_asset(mat): raise RuntimeError('Could not save material')
        materials[md['id']] = mat

    meshes = {}
    ue.SystemLibrary.execute_console_command(None, 'Interchange.FeatureFlags.Import.FBX 0')
    for ad in data['assets']:
        opts = ue.FbxImportUI()
        for key, value in {'import_mesh': True, 'import_as_skeletal': False, 'import_materials': False,
                           'import_textures': False, 'automated_import_should_detect_type': False,
                           'mesh_type_to_import': ue.FBXImportType.FBXIT_STATIC_MESH}.items():
            opts.set_editor_property(key, value)
        info = opts.get_editor_property('static_mesh_import_data')
        for key, value in {**data['fbx_import_settings'], 'combine_meshes': False,
                           'transform_vertex_to_absolute': False, 'auto_generate_collision': False,
                           'generate_lightmap_u_vs': False, 'build_nanite': False,
                           'one_convex_hull_per_ucx': True,
                           'normal_import_method': ue.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS}.items():
            info.set_editor_property(key, value)
        mesh = run_task(safe_file(root, ad['file']), prefix + '/Meshes', ad['id'], opts, ue.FbxFactory())
        bounds = mesh.get_bounding_box()
        actual = [[bounds.min.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.max.z]]
        if max(abs(actual[j][k] - ad['bounds_cm'][j][k]) for j in range(2) for k in range(3)) > .1:
            raise RuntimeError('UE mesh coordinate/scale mismatch: ' + ad['id'])
        for i, mid in enumerate(ad['material_ids']): mesh.set_material(i, materials[mid])
        if ad['collision'] == 'complex_static':
            body = mesh.get_editor_property('body_setup')
            if not body: raise RuntimeError('Missing collision body')
            body.set_editor_property('collision_trace_flag', ue.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        if ad['collision'] == 'trunk_proxy':
            if ue.get_editor_subsystem(ue.StaticMeshEditorSubsystem).get_simple_collision_count(mesh) < 1:
                raise RuntimeError('Trunk collision hull not imported')
        if not E.save_loaded_asset(mesh): raise RuntimeError('Could not save mesh')
        meshes[ad['id']] = mesh
        report['asset_count'] += 1

    if not levels.new_level(map_path): raise RuntimeError('Failed to create dedicated map')
    for ad in data['assets']:
        cells = {}
        for inst in ad['instances']:
            loc = inst['location_cm']
            key = (math.floor(loc[0]/3200), math.floor(loc[1]/3200))
            cells.setdefault(key, []).append(inst)
        for (cx, cy), items in cells.items():
            anchor = [cx*3200., cy*3200., 0.]
            actor = actors.spawn_actor_from_class(ue.ReserveInstanceGroup, ue.Vector(*anchor))
            if not actor: raise RuntimeError('Instance-group spawn failed')
            actor.set_actor_label(ad['id'] + '_' + str(cx) + '_' + str(cy))
            actor.set_editor_property('source_asset_id', ad['id'])
            actor.set_editor_property('source_district_id', data['district_id'])
            actor.configure(meshes[ad['id']], ad['collision'] != 'none')
            transforms = []
            for i in items:
                t = ue.Transform()
                t.set_editor_property('translation', ue.Vector(*(v-a for v, a in zip(i['location_cm'], anchor))))
                t.set_editor_property('rotation', ue.Quat(*i['rotation_xyzw']))
                t.set_editor_property('scale3d', ue.Vector(*i['scale']))
                transforms.append(t)
            comp = actor.get_editor_property('instances')
            comp.add_instances(transforms, False, False, False)
            if comp.get_instance_count() != len(items): raise RuntimeError('Lost instances')
            report['instance_count'] += len(items)

    start = data['player_start']
    # Epic Python Rotator's positional signature is roll,pitch,yaw, not C++ order.
    spawn = actors.spawn_actor_from_class(ue.PlayerStart, ue.Vector(*start['location_cm']),
                                         ue.Rotator(**rotator_fields(start['rotation_pitch_yaw_roll'])))
    if not spawn: raise RuntimeError('Player start creation failed')
    spawn.set_actor_label('Authored_Approach_PlayerStart')
    sun = actors.spawn_actor_from_class(ue.DirectionalLight, ue.Vector(0, 0, 10000), ue.Rotator(pitch=-32, yaw=-35, roll=0))
    sun.get_component_by_class(ue.DirectionalLightComponent).set_editor_property('intensity', 3.)
    actors.spawn_actor_from_class(ue.SkyAtmosphere, ue.Vector(0, 0, 0))
    sky = actors.spawn_actor_from_class(ue.SkyLight, ue.Vector(0, 0, 5000))
    sky.get_component_by_class(ue.SkyLightComponent).set_editor_property('real_time_capture', True)
    if report['instance_count'] != data['instance_count']: raise RuntimeError('Map instance accounting mismatch')
    if not levels.save_current_level(): raise RuntimeError('Could not save map')
    if not levels.load_level(map_path): raise RuntimeError('Could not reopen saved map')
    report['instance_count'] = verify_loaded_map()
    report.update(map_reopened_verified=True, import_completed=True, reused_verified_map=False,
                  content_sha256=content_digest(content_root))
    return report


if __name__ == '__main__':
    project = Path(ue.Paths.project_dir()).resolve()
    run_id = os.environ.get('WILDLIFE_BUILD_RUN_ID', '')
    if not run_id or uuid.UUID(run_id).hex != run_id:
        raise RuntimeError('Start through Build-Windows.ps1 to bind the execution receipt')
    saved = project / 'Saved'
    saved.mkdir(exist_ok=True)
    target = saved / 'UnrealDistrictImport.json'
    try:
        result = execute(project, run_id, digest_file(__file__))
    except Exception as error:
        # Keep the last successful receipt for diagnosis, but do not let it satisfy
        # the current process. This new failed result carries the current run ID.
        if target.is_file():
            (saved / ('UnrealDistrictImport.previous-' + run_id + '.json')).write_bytes(target.read_bytes())
        target.write_text(json.dumps({'run_id': run_id, 'import_revision': IMPORT_REVISION,
                                     'unreal_executed': True, 'import_completed': False,
                                     'error': str(error)}, indent=2))
        raise
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(result, indent=2))
    temp.replace(target)
    ue.log('UNREAL_DISTRICT_IMPORT_COMPLETE ' + json.dumps(result))
