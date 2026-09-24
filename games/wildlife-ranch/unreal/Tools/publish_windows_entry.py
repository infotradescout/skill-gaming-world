"""Add a one-file Windows build entry point without rerendering or re-exporting.
Only source/launcher and non-native tests are new. Existing art stays byte-identical.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from contract import digest_file, validate

HERE = Path(__file__).resolve().parents[1]
HOST = 'https://wildlife-reserve-world-preview.onrender.com'
BASE_SIZE = 199854283
BASE_SHA = 'b4eb2495a9fedb375c76f6b04147771aed73bd3b0f89b55d19a1ffe233cd7fff'
BASE_PATH = '/unreal01/base_4a056f3.zip'
MARKER = '# WILDLIFE_POWERSHELL_START'

def launcher_text(template, url, sha, size):
    if not re.fullmatch(r'[a-f0-9]{64}', sha) or size < 1: raise ValueError('Bad kit fingerprint')
    body = template.replace('@@KIT_URL@@', url).replace('@@KIT_SHA@@', sha).replace('@@KIT_BYTES@@', str(size))
    if '@@KIT_' in body: raise ValueError('Unresolved release descriptor')
    header = '''@echo off
setlocal
set "WILDLIFE_LAUNCHER=%~f0"
powershell.exe -NoLogo -NoProfile -Command "$text=[IO.File]::ReadAllText($env:WILDLIFE_LAUNCHER); $marker='# WILDLIFE_POWERSHELL_START'; & ([scriptblock]::Create($text.Substring($text.LastIndexOf($marker)+$marker.Length)))"
set "buildExit=%errorlevel%"
echo.
pause
exit /b %buildExit%
'''
    return (header + MARKER + '\n' + body).replace('\r\n', '\n').replace('\n', '\r\n')

def parent_kit():
    cache = Path.home()/'.cache/wildlife-windows-entry'
    cache.mkdir(parents=True, exist_ok=True)
    p = cache/'base_4a056f3.zip'
    if p.is_file() and p.stat().st_size == BASE_SIZE and digest_file(p) == BASE_SHA: return p
    for relative in (BASE_PATH, '/Wildlife_Unreal_57_Transition_01.zip'):
        try:
            req = urllib.request.Request(HOST+relative, headers={'User-Agent':'WildlifeReserve-WindowsEntry/2'})
            with urllib.request.urlopen(req, timeout=120) as response, p.with_suffix('.partial').open('wb') as f:
                total = 0
                for chunk in iter(lambda:response.read(1048576), b''):
                    total += len(chunk)
                    if total > BASE_SIZE: raise RuntimeError('Oversized source kit')
                    f.write(chunk)
            q = p.with_suffix('.partial')
            if q.stat().st_size != BASE_SIZE or digest_file(q) != BASE_SHA: raise RuntimeError('Source-kit checksum changed')
            q.replace(p);return p
        except urllib.error.HTTPError as e:
            if e.code != 404: raise
    raise RuntimeError('Pinned Unreal input kit unavailable')

def prepare(out):
    subprocess.run([sys.executable, str(HERE/'Tools/stage_handoff.py'), 'prepare', str(out)], check=True)
    parent = parent_kit()
    shutil.copy2(parent, out/BASE_PATH.lstrip('/'))
    shutil.copy2(parent, out/'Wildlife_Unreal_57_Transition_01.zip')
    for relative in ('/unreal01/status.json', '/unreal01/transport_receipt.json'):
        with urllib.request.urlopen(HOST+relative, timeout=60) as response:
            (out/relative.lstrip('/')).write_bytes(response.read(1000000))
    stage = out/'unreal01/project'
    with zipfile.ZipFile(parent) as z:
        for entry in z.infolist():
            p = PurePosixPath(entry.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in entry.filename: raise ValueError('Unsafe parent kit')
            if (entry.external_attr >> 16) & 0o170000 == 0o120000: raise ValueError('Symlink in parent kit')
            if p.parts[:2] == ('WildlifeReserve', 'InputBundle') or p.parts[:1] == ('AssetProvenance',):
                z.extract(entry, stage)
    bundle = stage/'WildlifeReserve/InputBundle'
    validate(json.loads((bundle/'district.json').read_text()), bundle)
    (out/'unreal01/entry-tests').mkdir(exist_ok=True)
    print('WINDOWS_ENTRY_PARENT_VERIFIED', BASE_SHA, flush=True)

def finish(out):
    sha = os.environ.get('RENDER_GIT_COMMIT','')
    if not re.fullmatch('[a-f0-9]{40}',sha): raise RuntimeError('Missing exact source revision')
    stage = out/'unreal01/project'
    bundle = stage/'WildlifeReserve/InputBundle'
    data = json.loads((bundle/'district.json').read_text())
    metrics = validate(data, bundle)
    release = out/'unreal01/releases'/sha
    release.mkdir(parents=True)
    package = release/'Wildlife_Windows_Build_02.zip'
    with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
        for p in sorted(stage.rglob('*')):
            if not p.is_file() or '__pycache__' in p.parts or p.suffix.lower() in ('.pyc','.ttf','.otf','.woff','.woff2'): continue
            z.write(p,p.relative_to(stage))
    kit_sha = digest_file(package)
    url = HOST+'/'+package.relative_to(out).as_posix()
    launcher = launcher_text((HERE/'Start-Wildlife.ps1.in').read_text(), url, kit_sha, package.stat().st_size)
    (out/'START-WILDLIFE.cmd').write_bytes(launcher.encode('utf-8'))
    (out/'unreal01/entry-tests/launcher-payload.ps1').write_text(launcher.split(MARKER)[-1])
    state = {'source_commit':sha,'input_export_commit':data['source_commit'],'input_export_unchanged':True,
             'parent_kit_sha256':BASE_SHA,'kit_url':url,'kit_sha256':kit_sha,'kit_bytes':package.stat().st_size,
             'launcher_sha256':digest_file(out/'START-WILDLIFE.cmd'),'transport':metrics,
             'native_compile':'not_run','native_import':'not_run','windows_game':'not_built',
             'walkthrough':'not_run','visual_quality':'not_accepted',
             'requires':'One launch on a Windows PC with an authorized UE5.7 installation and C++ tools',
             'scope':'Source repair, verified asset reuse and automatic local build launcher; not remote Windows execution'}
    (out/'unreal01/windows-entry.json').write_text(json.dumps(state,indent=2))
    page = (out/'index.html').read_text()
    note = '<section id="windows-entry" class="notice"><strong>Build on your Unreal Windows PC</strong><p><a class="button" href="START-WILDLIFE.cmd" download>Download START-WILDLIFE.cmd</a></p><p>Run this file on the PC with Unreal 5.7 and C++ tools. It downloads the verified kit, builds/imports/packages, and starts the game only after success. No remote-control agent or automatic engine installation. This is a build launcher, not an already compiled game.</p><a href="unreal01/windows-entry.json">Current build-access status</a></section>'
    if 'id="windows-entry"' in page: page=re.sub(r'<section id="windows-entry".*?</section>',lambda _:note,page,count=1,flags=re.S)
    else: page=page.replace('<main>','<main>'+note,1)
    (out/'index.html').write_text(page)
    print('WINDOWS_ENTRY_READY',json.dumps(state),flush=True)

if __name__ == '__main__':
    action, out = sys.argv[1], Path(sys.argv[2]).resolve()
    if action=='prepare':prepare(out)
    elif action=='finish':finish(out)
    else:raise ValueError('Unknown publishing stage')
