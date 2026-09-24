import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'Tools'))
from publish_delivery_status import correct_page

FIXTURE = '''<html><head><title>Wildlife Reserve | Environment 03</title></head><body>
<header><h1>Environment</h1><a href="art03/Wildlife_Lodge_Shore_03.blend">Open native .blend</a></header>
<main><section id="windows-entry" class="notice">Old launcher prompt</section>
<section id="unreal-transition" class="notice">Old source kit prompt</section>
<figure><img id="view" src="art03/approach_eye.png"></figure>
<details><summary>Native file, source and scope</summary><a href="macro/World.blend">Macro</a></details>
</main></body></html>'''

class DeliveryPageTests(unittest.TestCase):
    def test_source_is_not_primary_action(self):
        page=correct_page(FIXTURE)
        self.assertNotIn('.blend',page.split('<main>')[0])
        self.assertNotIn('.cmd',page.split('<main>')[0])
        self.assertIn('No playable Windows build is available yet',page)
    def test_source_files_are_preserved_and_labeled(self):
        page=correct_page(FIXTURE)
        self.assertIn('Blender scenery source (.blend, not playable)',page)
        self.assertIn('macro/World.blend',page)
        self.assertIn('local build script (.cmd, unverified in Unreal)',page)
    def test_no_playable_executable_link(self):
        self.assertNotIn('.exe',correct_page(FIXTURE))
    def test_existing_art_is_unchanged(self):
        self.assertIn('<figure><img id="view" src="art03/approach_eye.png"></figure>',correct_page(FIXTURE))
    def test_repeat_does_not_duplicate_controls(self):
        page=correct_page(correct_page(FIXTURE))
        self.assertEqual(page.count('id="build-status"'),1)
        self.assertEqual(page.count('id="source-files"'),1)
        self.assertEqual(page.count('id="build-tools"'),1)
        self.assertNotIn('Old launcher prompt',page)
    def test_unknown_page_fails_closed(self):
        for page in ('<html></html>',FIXTURE.replace('<main>','<div>'),FIXTURE.replace('Native file, source and scope','Changed source section')):
            with self.subTest(page=page),self.assertRaises(ValueError): correct_page(page)

if __name__=='__main__':unittest.main()
