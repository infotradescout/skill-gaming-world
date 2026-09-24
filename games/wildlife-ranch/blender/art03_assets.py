"""Bounded CC0 downloads from Poly Haven's public API with attribution and hashes."""
import concurrent.futures, hashlib, json, os, time, urllib.request, urllib.parse
from pathlib import Path, PurePosixPath
ROOT=Path(os.environ.get('WILDLIFE_ASSET_CACHE',str(Path.home()/'.cache/wildlife-art03'))).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
UA='WildlifeReserve-BlenderAuthoring/0.3 (infotradescout/skill-gaming-world)'
MODEL_IDS=['pine_tree_01','grass_medium_01','fern_02','rock_moss_set_01','dead_tree_trunk_02']
TEXTURE_IDS=['forest_floor','leafy_grass','gravel_road']
MAX_FILE=1500*1024*1024

def request(url):
 u=urllib.parse.urlsplit(url)
 if u.scheme!='https' or u.hostname not in {'api.polyhaven.com','dl.polyhaven.org','dl.polyhaven.com','wildlife-reserve-world-preview.onrender.com'}:raise ValueError('Asset host not approved: '+url)
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=180)

def get_json(url):
 with request(url) as r:return json.load(r)

def download(url,path,md5=None,sha256=None,size=None):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 def valid(p):
  if not p.is_file():return False
  if size is not None and p.stat().st_size!=size:return False
  if md5 and hashlib.md5(p.read_bytes()).hexdigest()!=md5:return False
  if sha256 and hashlib.sha256(p.read_bytes()).hexdigest()!=sha256:return False
  return p.stat().st_size>0
 if not valid(path):
  tmp=path.with_suffix(path.suffix+'.part')
  for attempt in range(3):
   try:
    with request(url) as response,tmp.open('wb') as f:
     total=0
     while True:
      block=response.read(1024*1024)
      if not block:break
      total+=len(block)
      if total>MAX_FILE:raise ValueError('Asset exceeds bounded download budget')
      f.write(block)
    if not valid(tmp):raise ValueError('Downloaded asset fingerprint mismatch: '+path.name)
    tmp.replace(path);break
   except Exception:
    if attempt==2:raise
    time.sleep(1+attempt)
 return {'path':str(path.relative_to(ROOT)),'url':url,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'upstream_md5':md5}

def safe_path(base,name):
 p=PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe include path')
 return base.joinpath(*p.parts)

def variant(table,res,fmt):
 for resolution in [res,'2k','1k','4k']:
  if resolution in table and fmt in table[resolution]:return table[resolution][fmt],resolution
 raise ValueError('Expected format unavailable: '+repr(list(table)))

def channel_table(files,channel):
 aliases={'diff':['diff','diffuse','albedo','basecolor'],'nor_gl':['nor_gl','normal_gl','normal'],'rough':['rough','roughness'],'disp':['disp','displacement','height']}
 keys={k.lower():k for k in files}
 for key in aliases[channel]:
  if key in keys:return files[keys[key]]
 raise ValueError('Missing '+channel+' in '+repr(list(files)))

def prepare():
 registry={'schema':1,'provider':'Poly Haven','credit':'Assets from Poly Haven (CC0); authors retained in metadata','license':'https://polyhaven.com/license','api_terms':'https://polyhaven.com/our-api','biome_validation':False,'models':{},'textures':{},'files':[]}
 tasks=[]
 for slug in MODEL_IDS+TEXTURE_IDS:
  metadata=get_json('https://api.polyhaven.com/info/'+slug)
  files=get_json('https://api.polyhaven.com/files/'+slug)
  folder=ROOT/slug;folder.mkdir(exist_ok=True)
  (folder/'api_metadata.json').write_text(json.dumps(metadata,indent=2));(folder/'api_files.json').write_text(json.dumps(files,indent=2))
  if slug in MODEL_IDS:
   item,res=variant(files['blend'],'1k' if slug in ['pine_tree_01','grass_medium_01'] else '2k','blend')
   name=urllib.parse.unquote(Path(urllib.parse.urlsplit(item['url']).path).name)
   tasks.append((item['url'],folder/name,item.get('md5'),None,item.get('size')))
   for rel,entry in item.get('include',{}).items():tasks.append((entry['url'],safe_path(folder,rel),entry.get('md5'),None,entry.get('size')))
   registry['models'][slug]={'file':str((folder/name).relative_to(ROOT)),'resolution':res,'authors':metadata.get('authors'),'name':metadata.get('name'),'source':'https://polyhaven.com/a/'+slug,'include_files':list(item.get('include',{}))}
   print('PH_NATIVE_DESCRIPTOR',slug,json.dumps({'blend_bytes':item.get('size'),'includes':len(item.get('include',{})),'resolution':res}),flush=True)
  else:
   maps={};print('PH_TEXTURE_CHANNELS',slug,json.dumps(list(files)),flush=True)
   for channel in ['diff','nor_gl','rough','disp']:
    item,res=variant(channel_table(files,channel),'2k','jpg')
    name=urllib.parse.unquote(Path(urllib.parse.urlsplit(item['url']).path).name)
    tasks.append((item['url'],folder/name,item.get('md5'),None,item.get('size')));maps[channel]=str((folder/name).relative_to(ROOT))
   registry['textures'][slug]={'maps':maps,'authors':metadata.get('authors'),'source':'https://polyhaven.com/a/'+slug,'physical_size':metadata.get('dimensions')}
 total=sum(t[4] or 0 for t in tasks)
 print('PH_BOUNDED_DOWNLOAD_PLAN',json.dumps({'files':len(tasks),'bytes':total}),flush=True)
 if total>2300*1024*1024:raise ValueError('Asset plan exceeds 2.3 GiB; review before downloading')
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for record in pool.map(lambda args:download(*args),tasks):registry['files'].append(record)
 previous=ROOT/'input'/'Wildlife_Lodge_Shore_02.blend'
 registry['previous']=download('https://wildlife-reserve-world-preview.onrender.com/district/Wildlife_Lodge_Shore_02.blend',previous,sha256='6f282ac04ae9282596eaa855cc2606f2e6bd559af609d7d67078c8e3009901f7',size=69623697)
 registry['previous_image']=download('https://wildlife-reserve-world-preview.onrender.com/district/approach_eye.png',ROOT/'input'/'rejected_02.png',sha256='3852b5b69db3d49fd5e1a6bac18c5c60775446bc398cdff07c5868aa79f5885b')
 (ROOT/'asset_registry.json').write_text(json.dumps(registry,indent=2))
 print('PH_ASSETS_READY',json.dumps({'root':str(ROOT),'models':list(registry['models']),'textures':list(registry['textures']),'downloaded_files':len(registry['files'])}),flush=True)
 return registry

if __name__=='__main__':prepare()
