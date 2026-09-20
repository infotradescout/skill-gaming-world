"""Reuse exact already-built native artifacts for UI inspection; no fake rebuild receipt."""
from pathlib import Path,PurePosixPath
import urllib.request,zipfile,io,json,hashlib,shutil,sys
out=Path(sys.argv[1]).resolve();url='https://wildlife-reserve-world-preview.onrender.com'
r=json.load(urllib.request.urlopen(url+'/district/district_receipt.json',timeout=60))
assert r['source_commit']=='9f92ad7f5aaa5946827e61f9137d63f74af8d4e7' and r['native_reopen_verified']
blob=urllib.request.urlopen(url+'/Wildlife_Blender_World_02.zip',timeout=180).read()
assert len(blob)==87947029,'Unexpected original native bundle size'
with zipfile.ZipFile(io.BytesIO(blob)) as z:
 for item in z.infolist():
  p=PurePosixPath(item.filename)
  if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] not in ['district','macro','source']:raise ValueError('Unexpected archive path')
  if item.file_size>150000000:raise ValueError('Unexpected artifact size')
 z.extractall(out)
for name,meta in r['files'].items():
 p=out/'district'/name
 assert p.stat().st_size==meta['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256'],name
(out/'Wildlife_Blender_World_02.zip').write_bytes(blob)
(out/'native_artifact_reuse.json').write_text(json.dumps({'verified_source_commit':r['source_commit'],'sha256_checked_files':list(r['files']),'scope':'Reused exact native .blend/GLB/renders from first successful build; no claim of rerendering'},indent=2))
print('EXACT_NATIVE_ARTIFACTS_REUSED',r['source_commit'],flush=True)
