"""Pure, dependency-free transport validation; not Unreal execution proof."""
import hashlib, json, math, re
from pathlib import Path, PurePosixPath

SCHEMA = 'wildlife-unreal-district/1'
BASE_SHA = '6fdfe8d118d4ec8f9f009e397d771eea56bdf50986af99c3a6889405e16314e1'
ID = re.compile(r'^[A-Za-z][A-Za-z0-9_]{0,95}$')

def digest_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''): h.update(chunk)
    return h.hexdigest()

def safe_file(root, relative):
    if not isinstance(relative, str) or '\\' in relative or ':' in relative:
        raise ValueError('Invalid artifact path')
    p = PurePosixPath(relative)
    if p.is_absolute() or '..' in p.parts or not p.parts:
        raise ValueError('Artifact escapes package')
    result = (Path(root) / relative).resolve()
    if not result.is_relative_to(Path(root).resolve()):
        raise ValueError('Artifact escapes package')
    return result

def vector(v, size=3):
    if not isinstance(v, list) or len(v) != size or any(isinstance(x, bool) or not isinstance(x, (int,float)) or not math.isfinite(x) for x in v):
        raise ValueError('Invalid finite vector')
    return v

def point_to_unreal(xyz):
    x,y,z=vector(list(xyz)); return [100*x,-100*y,100*z]

def validate(data, root=None):
    if data.get('schema') != SCHEMA or data.get('source_blend_sha256') != BASE_SHA:
        raise ValueError('Unsupported source/schema')
    if data.get('units') != 'centimeters' or data.get('coordinates') != 'X=BlenderX,Y=-BlenderY,Z=BlenderZ':
        raise ValueError('Unspecified coordinate conversion')
    if data.get('engine_target') != '5.7': raise ValueError('Unreviewed engine target')
    if data.get('unreal_import_verified') is not False: raise ValueError('Exporter cannot claim Unreal acceptance')
    groups=data.get('assets'); mats=data.get('materials'); images=data.get('textures')
    if not isinstance(groups,list) or not groups or not isinstance(mats,list) or not isinstance(images,list): raise ValueError('Missing collections')
    ids=set(); placements=set(); total=0; mat_ids={m['id'] for m in mats}
    if len(mat_ids)!=len(mats): raise ValueError('Duplicate material')
    for a in groups:
        key=a['id']
        if not ID.fullmatch(key) or key in ids: raise ValueError('Duplicate/unsafe asset identity')
        ids.add(key)
        if a['collision'] not in ('complex_static','trunk_proxy','none'): raise ValueError('Unknown collision policy')
        bounds=a['bounds_cm']; vector(bounds[0]);vector(bounds[1])
        if any(x>y for x,y in zip(*bounds)): raise ValueError('Inverted bounds')
        if any(m not in mat_ids for m in a['material_ids']): raise ValueError('Unknown material')
        for i in a['instances']:
            if i['id'] in placements: raise ValueError('Duplicate placement identity')
            placements.add(i['id']); total+=1
            vector(i['location_cm']); vector(i['scale']);q=vector(i['rotation_xyzw'],4)
            if abs(sum(x*x for x in q)-1)>1e-5: raise ValueError('Non-unit quaternion')
            if any(abs(x)<1e-7 for x in i['scale']): raise ValueError('Degenerate scale')
        p=safe_file(root or '.',a['file'])
        if root and (not p.is_file() or digest_file(p)!=a['sha256']): raise ValueError('Mesh checksum mismatch: '+key)
    tex_ids=set()
    for t in images:
        if t['id'] in tex_ids: raise ValueError('Duplicate texture')
        tex_ids.add(t['id']);p=safe_file(root or '.',t['file'])
        if root and (not p.is_file() or digest_file(p)!=t['sha256']): raise ValueError('Texture checksum mismatch')
    if total != data['instance_count']: raise ValueError('Instance accounting mismatch')
    if data['source_visible_mesh_instances']!=total: raise ValueError('Dropped or added scene instances')
    for m in mats:
        for channel in m['channels'].values():
            if channel.get('texture') and channel['texture'] not in tex_ids: raise ValueError('Unknown texture')
    vector(data['player_start']['location_cm'])
    vector(data['player_start']['rotation_pitch_yaw_roll'])
    return {'assets':len(ids),'instances':total,'materials':len(mats),'textures':len(images),'scope':'transport integrity, not engine import'}

if __name__=='__main__':
    import sys
    root=Path(sys.argv[1]);print(json.dumps(validate(json.loads((root/'district.json').read_text()),root),indent=2))
