"""Pure helpers for native import orientation and changed-content detection.
Passing these tests is not Unreal execution. UE Rotator uses roll,pitch,yaw
positionally; callers must use the named properties produced here.
"""
import hashlib
import json
import math
from pathlib import Path

IMPORT_REVISION = 'native-import-02'

def rotator_fields(pitch_yaw_roll):
    if len(pitch_yaw_roll) != 3 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in pitch_yaw_roll):
        raise ValueError('Expected finite pitch/yaw/roll values')
    pitch, yaw, roll = pitch_yaw_roll
    return {'pitch': pitch, 'yaw': yaw, 'roll': roll}

def content_digest(root):
    """Fingerprint authored packages, not Saved or DerivedDataCache contents."""
    root = Path(root)
    if not root.is_dir():
        raise ValueError('Imported content directory is missing')
    rows = []
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError('Linked content is not an owned import')
        if not p.is_file():
            continue
        digest = hashlib.sha256()
        with p.open('rb') as f:
            for chunk in iter(lambda: f.read(1048576), b''):
                digest.update(chunk)
        rows.append([p.relative_to(root).as_posix(), digest.hexdigest()])
    if not rows:
        raise ValueError('Imported content is empty')
    return hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()

def reusable_receipt(old, manifest_sha, importer_sha, current_content_sha):
    return (old.get('import_completed') is True and old.get('unreal_executed') is True
            and old.get('import_revision') == IMPORT_REVISION
            and old.get('transport_sha256') == manifest_sha
            and old.get('importer_sha256') == importer_sha
            and old.get('content_sha256') == current_content_sha)
