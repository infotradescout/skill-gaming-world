"""Execute the existing district author with one checked pre-save refinement hook.
The base stays canonical, with this correction maintained as an editable art pass.
A changed base must be explicitly reviewed before its fingerprint can be updated.
"""
import hashlib
from pathlib import Path
folder = Path(__file__).resolve().parent
base = folder / 'build_district.py'
source = base.read_text()
expected = '0387a37276704095888e6b6a838500ca96cb60c4e2e4821b652ace9229ab6b74'
assert hashlib.sha256(base.read_bytes()).hexdigest() == expected, 'Base author changed: review refinement compatibility'
marker = '# Native file saved before render; camera, textures and materials are editable.'
assert source.count(marker) == 1, 'Ambiguous native-save hook'
refinement = folder / 'refine_district.py'
source = source.replace(marker, "exec(compile(Path(__file__).with_name('refine_district.py').read_text(), 'refine_district.py', 'exec'), globals())\n" + marker)
namespace = {'__name__': '__main__', '__file__': str(base)}
exec(compile(source, str(base), 'exec'), namespace)
