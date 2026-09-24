import ast
import copy
import math
import sys
import tempfile
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'Tools'))
from import_safety import IMPORT_REVISION, rotator_fields, content_digest, reusable_receipt

class ImportSafetyTests(unittest.TestCase):
    def test_camera_pitch_yaw_roll_are_named(self):
        self.assertEqual(rotator_fields([-3.9, 50.5, 0]), {'pitch':-3.9,'yaw':50.5,'roll':0})
    def test_sun_pitch_not_roll(self):
        self.assertEqual(rotator_fields([-32, -35, 0])['pitch'], -32)
    def test_invalid_rotation(self):
        for v in ([0,0], [True,1,2], [math.nan,0,0], [0,math.inf,0]):
            with self.subTest(value=v), self.assertRaises(ValueError): rotator_fields(v)
    def test_importer_uses_no_positional_rotators(self):
        tree=ast.parse((ROOT/'Tools/import_district.py').read_text())
        calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='Rotator']
        self.assertGreaterEqual(len(calls),2)
        self.assertTrue(all(not n.args for n in calls))
    def test_content_change_invalidates_digest(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'map.umap';p.write_bytes(b'fixture-only-not-a-map')
            a=content_digest(d);p.write_bytes(b'changed-fixture')
            self.assertNotEqual(a,content_digest(d))
    def test_empty_or_missing_content_refused(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):content_digest(d)
            with self.assertRaises(ValueError):content_digest(Path(d)/'absent')
    def test_content_rename_invalidates_digest(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'one.umap';p.write_bytes(b'fixture')
            a=content_digest(d);p.rename(Path(d)/'two.umap')
            self.assertNotEqual(a,content_digest(d))
    def test_reuse_requires_exact_source_and_content(self):
        old={'import_completed':True,'unreal_executed':True,'import_revision':IMPORT_REVISION,
             'transport_sha256':'manifest','importer_sha256':'importer','content_sha256':'content'}
        self.assertTrue(reusable_receipt(old,'manifest','importer','content'))
        for field in old:
            bad=copy.deepcopy(old);bad[field]='different'
            with self.subTest(field=field):self.assertFalse(reusable_receipt(bad,'manifest','importer','content'))
    def test_old_receipt_not_accepted(self):
        self.assertFalse(reusable_receipt({'import_completed':True},'m','i','c'))
    def test_native_receipt_written_after_reopen(self):
        s=(ROOT/'Tools/import_district.py').read_text()
        self.assertIn('levels.load_level(map_path)',s)
        self.assertIn('uuid.UUID(run_id)',s)
        self.assertIn("'import_completed': False",s)

if __name__=='__main__':unittest.main()
