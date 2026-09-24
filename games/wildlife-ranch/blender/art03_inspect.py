"""Read native asset topology, without running embedded scripts or rendering."""
import bpy,json,os
from pathlib import Path
ROOT=Path(os.environ.get('WILDLIFE_ASSET_CACHE',str(Path.home()/'.cache/wildlife-art03')))
r=json.loads((ROOT/'asset_registry.json').read_text())
for slug,record in r['models'].items():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 filename=ROOT/record['file']
 with bpy.data.libraries.load(str(filename),link=False) as (source,dest):
  names=source.collections
  print('ASSET_COLLECTIONS',slug,json.dumps(names),flush=True)
  selected=next((n for suffix in ['_LOD2','_LOD1','_static','_LOD0'] for n in names if n.lower()==(slug+suffix).lower()),None)
  if not selected:selected=next((n for n in names if n.lower()==slug.lower()),None)
  if not selected:raise RuntimeError('Cannot select native static collection for '+slug)
  dest.collections=[selected]
 collection=dest.collections[0]
 bpy.context.scene.collection.children.link(collection)
 bpy.context.view_layer.update()
 data={'selected':selected,'children':[c.name for c in collection.children],'objects':[{'name':o.name,'type':o.type,'vertices':len(o.data.vertices) if o.type=='MESH' else None,'dimensions':list(o.dimensions),'location':list(o.location),'parent':o.parent.name if o.parent else None,'modifiers':[(m.name,m.type) for m in o.modifiers]} for o in collection.all_objects]}
 print('ASSET_LAYOUT',slug,json.dumps(data),flush=True)
 (ROOT/slug/'native_layout.json').write_text(json.dumps(data,indent=2))
print('NATIVE_ASSET_INSPECTION_COMPLETE',flush=True)
