"""Correct the misleading source-first landing page; preserve the exact artifacts.
No native build, art render, asset export, launcher update or source-kit repack.
"""
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.request
from pathlib import Path

HOST = 'https://wildlife-reserve-world-preview.onrender.com'
RELEASE = '3c9f8809f4d994158aff3bf9e43909f2e243b814'
KIT_PATH = '/unreal01/releases/' + RELEASE + '/Wildlife_Windows_Build_02.zip'
KIT_SHA = '029797c3d2065bcdca67c7a6c7826061d6289588c14efee6c686303a63d6917b'
KIT_SIZE = 199873805
LAUNCHER_SHA = 'caa0ce7f823e13c53ab5cf4544a01fea29f48aeb8145c084cb7f54617db08ddf'

STATUS = '''<section id="build-status" class="notice" aria-labelledby="build-status-title">
<h2 id="build-status-title">No playable Windows build is available yet</h2>
<p>The Unreal game has <strong>not been compiled, imported, or tested in-engine</strong>.
The required next delivery is a Windows game you can open and walk through.</p>
<p>A <code>.blend</code> is scenery source, not the game. The existing
<code>.cmd</code> attempts a local build; it is not a verified game launcher.
There is no Play or game-download button because no executable has been delivered.</p>
<a href="delivery-status.json">Recorded delivery status</a></section>'''
TOOLS = '''<details id="build-tools"><summary>Unreal development files — not a playable game</summary>
<p>The following files are retained for development. They are not being offered as the completed game.
The local build script has not been run in Windows or Unreal by this project workflow,
and requires an existing Unreal 5.7 installation and C++ build tools.</p>
<p><a href="START-WILDLIFE.cmd" download>Existing local build script (.cmd, unverified in Unreal)</a></p>
<p><a href="''' + KIT_PATH.lstrip('/') + '''">Existing Unreal source and import assets (.zip, no executable)</a></p>
<p><a href="unreal01/windows-entry.json">Unchanged build-script record</a></p></details>'''
SOURCE_LINKS = '''<p><a href="art03/Wildlife_Lodge_Shore_03.blend">Blender scenery source (.blend, not playable)</a>
 · <a href="Wildlife_Environment_03.zip">Blender source archive (.zip, not the game)</a></p>'''


def correct_page(page):
    """Change only this known publisher's controls; fail on unexpected structure."""
    if page.count('<header>') != 1 or page.count('<main>') != 1:
        raise ValueError('Unrecognized existing page; refusing broad replacement')
    header = '''<header><div><div class="eyebrow">WILDLIFE RESERVE / DEVELOPMENT</div>
<h1>Unreal game — delivery status</h1></div><div class="tools">
<a href="#build-status">Build status</a> · <a href="#build-tools">Development files</a></div></header>'''
    page, count = re.subn(r'<header>.*?</header>', lambda _: header, page, count=1, flags=re.S)
    if count != 1:
        raise ValueError('Header replacement failed')
    for ident in ('windows-entry', 'unreal-transition', 'build-status'):
        page = re.sub(r'<section id="' + ident + r'"[^>]*>.*?</section>', '', page, flags=re.S)
    page = re.sub(r'<details id="build-tools">.*?</details>', '', page, flags=re.S)
    page = page.replace('<main>', '<main>' + STATUS + TOOLS, 1)
    old = '<details><summary>Native file, source and scope</summary>'
    revised = '<details id="source-files"><summary>Blender source files — not playable</summary>'
    if old in page:
        page = page.replace(old, revised + SOURCE_LINKS, 1)
    elif revised not in page:
        raise ValueError('Known source-file section missing')
    page = page.replace('<title>Wildlife Reserve | Environment 03</title>', '<title>Wildlife Reserve | Build status</title>')
    page = page.replace('The editable Blender download remains linked above.', 'Scenery sources remain in the Blender source section; no playable build is available.')
    if page.count('id="build-status"') != 1 or page.count('id="build-tools"') != 1:
        raise ValueError('Duplicate delivery controls')
    before_main = page.split('<main>', 1)[0]
    if '.blend' in before_main or '.cmd' in before_main:
        raise ValueError('Source file still promoted as the primary action')
    return page


def read_small(relative, limit=1000000):
    req = urllib.request.Request(HOST + relative, headers={'User-Agent': 'WildlifeReserve-DeliveryCorrection/1'})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Oversized published sidecar')
    return data


def main(out):
    # Reuse the existing owner of artifact staging instead of changing game assets.
    from publish_windows_entry import prepare
    from contract import digest_file
    prepare(out)
    entry_bytes = read_small('/unreal01/windows-entry.json')
    entry = json.loads(entry_bytes)
    if (entry['source_commit'], entry['kit_sha256'], entry['kit_bytes']) != (RELEASE, KIT_SHA, KIT_SIZE):
        raise ValueError('Published native-kit identity changed; review before continuing')
    if entry.get('native_compile') != 'not_run' or entry.get('windows_game') != 'not_built':
        raise ValueError('Native status advanced; do not overwrite it with an older status')
    launcher = read_small('/START-WILDLIFE.cmd', 20000)
    if hashlib.sha256(launcher).hexdigest() != LAUNCHER_SHA:
        raise ValueError('Published launcher changed')
    # Preserve the exact immutable release referenced by already-downloaded launchers.
    cache = Path.home() / '.cache/wildlife-delivery-correction'
    cache.mkdir(parents=True, exist_ok=True)
    cached = cache / (KIT_SHA + '.zip')
    if not cached.is_file() or cached.stat().st_size != KIT_SIZE or digest_file(cached) != KIT_SHA:
        temp = cached.with_suffix('.partial')
        request = urllib.request.Request(HOST + KIT_PATH, headers={'User-Agent': 'WildlifeReserve-DeliveryCorrection/1'})
        with urllib.request.urlopen(request, timeout=180) as response, temp.open('wb') as stream:
            size = 0
            for chunk in iter(lambda: response.read(1048576), b''):
                size += len(chunk)
                if size > KIT_SIZE:
                    raise ValueError('Unexpected native-kit download size')
                stream.write(chunk)
        if temp.stat().st_size != KIT_SIZE or digest_file(temp) != KIT_SHA:
            raise ValueError('Native-kit checksum mismatch')
        temp.replace(cached)
    target = out / KIT_PATH.lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cached, target)
    (out / 'START-WILDLIFE.cmd').write_bytes(launcher)
    (out / 'unreal01/windows-entry.json').write_bytes(entry_bytes)
    for relative in ('/unreal01/entry-tests/powershell.json', '/unreal01/entry-tests/launcher-payload.ps1'):
        payload = read_small(relative)
        (out / relative.lstrip('/')).write_bytes(payload)
    previous = (out / 'index.html').read_text()
    (out / 'index.html').write_text(correct_page(previous))
    result = {
        'source_commit': os.environ.get('RENDER_GIT_COMMIT'),
        'scope': 'Download-page correction only; no game build or art change',
        'primary_blender_download_removed': True,
        'native_compile': 'not_run', 'native_import': 'not_run',
        'windows_game': 'not_built', 'walkthrough': 'not_run',
        'visual_quality': 'not_accepted',
        'preserved_release': RELEASE, 'preserved_kit_sha256': digest_file(target),
        'preserved_launcher_sha256': hashlib.sha256(launcher).hexdigest(),
        'former_page_sha256': hashlib.sha256(previous.encode()).hexdigest(),
        'page_sha256': digest_file(out / 'index.html')
    }
    (out / 'delivery-status.json').write_text(json.dumps(result, indent=2))
    print('DELIVERY_PAGE_CORRECTED ' + json.dumps(result), flush=True)


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
