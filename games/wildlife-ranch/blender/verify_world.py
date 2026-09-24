"""Reopen generated native scene in a fresh Blender process; validate actual data."""
from pathlib import Path
import bpy, json, hashlib, sys
import numpy as np
args=sys.argv[sys.argv.index('--')+1:]; folder=Path(args[0]).resolve()
p=folder/'Wildlife_Reserve_World_01.blend'
bpy.ops.wm.open_mainfile(filepath=str(p))
s=bpy.context.scene
assert s['world_template_id']=='wildlife-reserve.template.001'
assert s.unit_settings.system=='METRIC' and s.unit_settings.scale_length==1
assert s['authoring_extent_m']==20000
terrains=[o for o in bpy.data.objects if 'tile_id' in o]
assert len(terrains)==64
assert len({o['tile_id'] for o in terrains})==64
vertices={}
for o in terrains:
    a=np.empty(len(o.data.vertices)*3,dtype=np.float32); o.data.vertices.foreach_get('co',a)
    assert np.isfinite(a).all(); vertices[o.name]=a.reshape(97,97,3)
    assert len(o.data.polygons)==96*96
seams=0
for y in range(8):
    for x in range(8):
        a=vertices[f'Terrain_{y:02}_{x:02}']
        if x<7:
            assert np.array_equal(a[:,-1,:],vertices[f'Terrain_{y:02}_{x+1:02}'][:,0,:]); seams+=1
        if y<7:
            assert np.array_equal(a[-1,:,:],vertices[f'Terrain_{y+1:02}_{x:02}'][0,:,:]); seams+=1
assert seams==112
ids=[o['district_id'] for o in bpy.data.objects if 'district_id' in o]
assert len(ids)==8 and len(set(ids))==8
facilities=[o['facility_id'] for o in bpy.data.objects if 'facility_id' in o]
assert len(facilities)>=7 and len(facilities)==len(set(facilities))
assert len([o for o in bpy.data.objects if o.type=='CAMERA'])==3
counts=[o['placement_count'] for o in bpy.data.objects if 'placement_count' in o]
assert sum(counts)>20000
assert len(bpy.data.libraries)==0
assert not any(img.filepath and img.source=='FILE' and not img.packed_file for img in bpy.data.images)
assert (folder/'terrain_height_769.r16').stat().st_size==769*769*2
# Force evaluation of the reopened Geometry Nodes forest, not just the source points.
deps=bpy.context.evaluated_depsgraph_get(); instance_count=sum(1 for i in deps.object_instances if i.is_instance)
assert instance_count>=sum(counts), (instance_count,sum(counts))
renders={}
for name in ['reserve_overview.png','reserve_map.png','lodge_and_lake.png']:
    pp=folder/name; assert pp.is_file() and pp.stat().st_size>20000
    img=bpy.data.images.load(str(pp)); assert img.size[0]>=1000 and img.size[1]>=900
    pix=np.empty(len(img.pixels),dtype=np.float32); img.pixels.foreach_get(pix)
    rgb=pix.reshape(-1,4)[:,:3]; assert np.isfinite(rgb).all() and float(rgb.std())>.015
    renders[name]={'width':img.size[0],'height':img.size[1],'rgb_std':float(rgb.std()),'sha256':hashlib.sha256(pp.read_bytes()).hexdigest()}
result={'passed':True,'native_reopen_verified':True,'blender_version':bpy.app.version_string,'scene_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_commit':json.loads((folder/'world_manifest.json').read_text())['source_commit'],'terrain_tiles':64,'matched_tile_seams':seams,'districts':len(ids),'facilities':len(facilities),'editable_tree_placements':sum(counts),'evaluated_tree_instances':instance_count,'renders':renders,'limits':['structure and render-data checks only','human visual review remains separate','no native game import/performance/biology validation']}
(folder/'verification.json').write_text(json.dumps(result,indent=2)); print('NATIVE_VERIFICATION',json.dumps(result),flush=True)
