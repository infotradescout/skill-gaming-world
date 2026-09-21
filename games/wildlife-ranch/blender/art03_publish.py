"""Publish verified native art; preserve old artifact URLs without regenerating them."""
import hashlib,json,os,shutil,sys,zipfile
from pathlib import Path,PurePosixPath
from art03_assets import ROOT,download
OUT=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent
r=json.loads((OUT/'art03/art_receipt.json').read_text())
assert r['native_reopen_verified'] and r['same_camera_verified'] and len(r['rendered_views'])==4
for name,meta in r['files'].items():
 p=OUT/'art03'/name
 assert p.stat().st_size==meta['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256']
# Preserve previous immutable download links; do not present them as current art.
old=ROOT/'input/World02.zip'
download('https://wildlife-reserve-world-preview.onrender.com/Wildlife_Blender_World_02.zip',old,sha256='d8474a7a6782d89789a41730c7349ea8d3d661a185d088562b0fac607b38d2da',size=143763180)
with zipfile.ZipFile(old) as z:
 for f in z.infolist():
  p=PurePosixPath(f.filename)
  if p.is_absolute() or '..' in p.parts or not p.parts:raise ValueError('Unsafe previous bundle path')
  if p.parts[0] in ['district','macro']:z.extract(f,OUT)
shutil.copy2(old,OUT/'Wildlife_Blender_World_02.zip')
(OUT/'source03').mkdir(exist_ok=True)
for p in HERE.glob('art03_*'):shutil.copy2(p,OUT/'source03'/p.name)
(OUT/'art03/README.txt').write_text('Native Blender environment candidate 0.3.\nOpen Wildlife_Lodge_Shore_03.blend. Referenced image textures are packed.\nLodge and layout: original project. Environment assets: Poly Haven, CC0.\nThis is not an approved final environment, full connected reserve, or playable game.\nNo external standalone font files are included.\n')
for p in (OUT/'art03').glob('*.blend1'):p.unlink()
with zipfile.ZipFile(OUT/'Wildlife_Environment_03.zip','w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
 for folder in ['art03','source03']:
  for p in sorted((OUT/folder).rglob('*')):
   if p.is_file():z.write(p,p.relative_to(OUT))
(OUT/'index.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Wildlife Reserve | Environment 03</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#111513;color:#e3e8e2}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1500px;margin:auto;padding:20px}header{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}h1{font-size:24px;margin:0}p{line-height:1.5}a{color:#c9d8b6}.eyebrow{font-size:11px;letter-spacing:2px;color:#a8b9a4;margin-bottom:7px}.tools{display:flex;gap:8px;flex-wrap:wrap}button,.button{font:inherit;border:1px solid #596754;border-radius:5px;padding:10px 14px;background:#223023;color:#e3e8e2;text-decoration:none;cursor:pointer}button[aria-pressed=true]{background:#c9d8b6;color:#162019}.muted{color:#b3bdb0;font-size:13px}.notice{border-left:3px solid #859b74;padding:12px 16px;background:#1c251e;font-size:14px;margin-bottom:18px}img{width:100%;height:auto;display:block;background:#202820}figure{margin:16px 0}figcaption{padding:10px 0;font-size:13px;color:#b3bdb0}.tabs{margin:15px 0}.state{font-size:12px;color:#bbceb1}details{padding:15px 0}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}footer{border-top:1px solid #354134;font-size:13px;line-height:1.6}@media(max-width:600px){header,main,footer{padding:14px}h1{font-size:21px}button,.button{font-size:13px;padding:10px}.notice{font-size:13px}}
</style></head><body><header><div><div class="eyebrow">WILDLIFE RESERVE / BLENDER AUTHORING</div><h1>Environment 03</h1></div><div class="tools"><a class="button" href="art03/Wildlife_Lodge_Shore_03.blend">Open native .blend</a><a class="button" href="Wildlife_Environment_03.zip">Scene + source package</a></div></header><main>
<div class="notice">New environment candidate. Placeholder vegetation and flat ground materials have been replaced with textured assets. <strong>Not marked as final quality.</strong> The detailed area remains separate from the full-reserve layout; these images are native Blender renders, not gameplay.</div>
<div class="tools tabs" aria-label="Camera views"><button data-view="approach_eye" aria-pressed="true">Approach</button><button data-view="shore_eye" aria-pressed="false">Shore</button><button data-view="porch_eye" aria-pressed="false">Porch</button><button data-view="district_overview" aria-pressed="false">Overview</button></div>
<div class="tools"><button id="current" aria-pressed="true">Current candidate 03</button><button id="previous" aria-pressed="false">Rejected 02 · same camera</button></div><figure><img id="view" src="art03/approach_eye.png" width="1280" height="720" alt="New native Blender lodge approach render"><figcaption id="caption">Candidate 03. The approach camera position and lens are unchanged from the rejected scene.</figcaption></figure>
<p class="state" id="status" role="status">Native Blender view</p><p class="muted">Environment assets from <a href="https://polyhaven.com">Poly Haven</a> (CC0); lodge and terrain layout are original project authoring. The interactive 0.2 export is not evidence for this candidate. No heavy 3D model loads automatically.</p>
<details><summary>Native file, source and scope</summary><p class="muted">The Blender scene has packed image textures and was reopened after saving. Download the native file to inspect the editable geometry and materials. Biological simulation, wildlife animation, integrated GrindZone, game performance and the completed continuous reserve are not delivered by this art pass.</p><pre id="record">Loading exact build record…</pre><a href="art03/art_receipt.json">Native build record</a> · <a href="art03/asset_registry.json">Asset sources and fingerprints</a> · <a href="macro/Wildlife_Reserve_World_01.blend">Earlier macro layout</a> · <a href="Wildlife_Blender_World_02.zip">Earlier 02 package</a></details>
</main><footer>No claim of publisher affiliation or COTW asset reuse. This preview has no accounts, transactions or game-save access.</footer><script>
let selected='approach_eye',version='art03';const img=document.querySelector('#view');function update(){img.src=version+'/'+selected+'.png';img.alt=(version==='art03'?'New candidate':'Rejected prior version')+' native Blender '+selected+' view';document.querySelector('#caption').textContent=(version==='art03'?'Candidate 03.':'Rejected 02.')+' Camera position and lens are matched for comparison.';document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===selected)));document.querySelector('#current').setAttribute('aria-pressed',String(version==='art03'));document.querySelector('#previous').setAttribute('aria-pressed',String(version==='district'));document.querySelector('#status').textContent='Loading native image…'}document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{selected=b.dataset.view;update()});document.querySelector('#current').onclick=()=>{version='art03';update()};document.querySelector('#previous').onclick=()=>{version='district';update()};img.onload=()=>document.querySelector('#status').textContent='Native image loaded';img.onerror=()=>document.querySelector('#status').textContent='Image unavailable. The editable Blender download remains linked above.';fetch('art03/art_receipt.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(r=>document.querySelector('#record').textContent=JSON.stringify({source:r.source_commit,blender:r.blender_version,sameCamera:r.same_camera_verified,nativeReopened:r.native_reopen_verified,visualApproval:r.visual_approval,limitations:r.limitations},null,2)).catch(()=>document.querySelector('#record').textContent='Build record unavailable.');
</script></body></html>''')
(OUT/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
p=OUT/'Wildlife_Environment_03.zip'
receipt={'source_commit':r['source_commit'],'native_reopened':True,'visual_approval':False,'package_bytes':p.stat().st_size,'package_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(OUT/'art03_package.json').write_text(json.dumps(receipt,indent=2));print('ART03_PACKAGE_READY',json.dumps(receipt),flush=True)
