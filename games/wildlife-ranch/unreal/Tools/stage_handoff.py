"""Preserve the existing static art; prepare/export a native import kit only."""
import os,sys,json,hashlib,shutil,urllib.request,zipfile,stat,re
from pathlib import Path,PurePosixPath
sys.path.insert(0,str(Path(__file__).resolve().parent))
from contract import BASE_SHA,digest_file,validate
HOST='https://wildlife-reserve-world-preview.onrender.com'
OUT=Path(sys.argv[2]).resolve();HERE=Path(__file__).resolve().parent.parent
CACHE=Path.home()/'.cache'/'wildlife-unreal-transition';CACHE.mkdir(parents=True,exist_ok=True)

def read_url(path):
    req=urllib.request.Request(HOST+path,headers={'User-Agent':'WildlifeReserve-UnrealTransition/0.1'})
    return urllib.request.urlopen(req,timeout=180)

def get(path,name,sha,size):
    p=CACHE/name
    if p.is_file() and p.stat().st_size==size and digest_file(p)==sha:return p
    temp=p.with_suffix(p.suffix+'.partial');written=0
    with read_url(path) as r,open(temp,'wb') as f:
        for chunk in iter(lambda:r.read(1048576),b''):
            written+=len(chunk)
            if written>size:raise RuntimeError('Unexpected source size')
            f.write(chunk)
    if written!=size or digest_file(temp)!=sha:raise RuntimeError('Unexpected source identity '+path)
    temp.replace(p);return p

def unpack(source,allowed):
    with zipfile.ZipFile(source) as z:
        if sum(i.file_size for i in z.infolist())>1500000000:raise RuntimeError('Oversized archive')
        for item in z.infolist():
            p=PurePosixPath(item.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in item.filename or not p.parts:raise RuntimeError('Invalid zip path')
            if stat.S_ISLNK(item.external_attr>>16):raise RuntimeError('Zip symlink disallowed')
            if p.suffix.lower() in ('.ttf','.otf','.woff','.woff2'):continue
            if p.parts[0] in allowed:z.extract(item,OUT)

if sys.argv[1]=='prepare':
    OUT.mkdir(parents=True,exist_ok=True)
    current=get('/Wildlife_Environment_03.zip','World03-0.3.1.zip','8aae38179dc6afb3eb1750d10230765fc23bc7062bdae2ce29b10488a00e0697',176181970)
    old=get('/Wildlife_Blender_World_02.zip','World02.zip','d8474a7a6782d89789a41730c7349ea8d3d661a185d088562b0fac607b38d2da',143763180)
    parent=get('/art03_base/Wildlife_Lodge_Shore_03.blend','World03-parent.blend','0754f9db70d016be60c7aa5b249036bbc9a110af26722b212dfe3d95644cb7f6',168970705)
    unpack(current,{'art03','source03'});unpack(old,{'district','macro'})
    shutil.copy2(current,OUT/'Wildlife_Environment_03.zip');shutil.copy2(old,OUT/'Wildlife_Blender_World_02.zip')
    (OUT/'art03_base').mkdir(exist_ok=True);shutil.copy2(parent,OUT/'art03_base/Wildlife_Lodge_Shore_03.blend')
    if digest_file(OUT/'art03/Wildlife_Lodge_Shore_03.blend')!=BASE_SHA:raise RuntimeError('Source mismatch')
    for path in ['/index.html','/robots.txt','/art03_package.json','/acceptance03/browser.json','/source03/build_preview.sh']:
        with read_url(path) as r:
            body=r.read(3000000)
            if len(body)>=3000000:raise RuntimeError('Oversized sidecar')
        dest=OUT/path.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(body)
    stage=OUT/'unreal01'/'project'
    if stage.exists():raise RuntimeError('Unexpected existing handoff staging')
    shutil.copytree(HERE,stage,ignore=shutil.ignore_patterns('__pycache__','*.pyc','InputBundle','Binaries','Intermediate','Saved'))
    print('UNREAL_ART_INPUT_PRESERVED',BASE_SHA,flush=True)
elif sys.argv[1]=='finish':
    stage=OUT/'unreal01'/'project';bundle=stage/'WildlifeReserve'/'InputBundle'
    d=json.loads((bundle/'district.json').read_text());v=validate(d,bundle)
    if digest_file(OUT/'art03/Wildlife_Lodge_Shore_03.blend')!=BASE_SHA:raise RuntimeError('Master .blend changed')
    package=OUT/'Wildlife_Unreal_57_Transition_01.zip'
    with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
        for p in sorted(stage.rglob('*')):
            if p.is_file() and p.suffix not in ('.pyc','.ttf','.otf'):z.write(p,p.relative_to(stage))
    report={'schema':1,'source_commit':os.environ.get('RENDER_GIT_COMMIT'),'source_blend_sha256':BASE_SHA,
     'transport':v,'transport_receipt':json.loads((bundle/'transport_receipt.json').read_text()),'engine_target':'5.7',
     'unreal_editor_compilation':'not_run','unreal_import':'not_run','windows_packaging':'not_run','walkthrough':'not_run','visual_quality':'not_accepted',
     'package_bytes':package.stat().st_size,'package_sha256':digest_file(package)}
    (OUT/'unreal01/status.json').write_text(json.dumps(report,indent=2))
    shutil.copy2(bundle/'transport_receipt.json',OUT/'unreal01/transport_receipt.json')
    page=(OUT/'index.html').read_text()
    note='<section id="unreal-transition" class="notice"><strong>Unreal 5.7 transition</strong><p><a class="button" href="Wildlife_Unreal_57_Transition_01.zip">Unreal project + import assets</a></p><p>Source/import kit, not a compiled game. Existing Blender art is unchanged. Native editor compilation, import, Windows packaging and walkthrough have not run.</p><a href="unreal01/status.json">Actual export status</a></section>'
    if 'id="unreal-transition"' in page:
        page,n=re.subn(r'<section id="unreal-transition" class="notice">.*?</section>',lambda _:note,page,count=1,flags=re.S)
        if n!=1:raise RuntimeError('Existing transition section is not the owned format')
    else:
        if page.count('<main>')!=1:raise RuntimeError('Ambiguous existing preview main')
        page=page.replace('<main>','<main>'+note,1)
    (OUT/'index.html').write_text(page)
    print('UNREAL_HANDOFF_PUBLISHED',json.dumps(report),flush=True)
else:raise SystemExit('Expected prepare or finish')
