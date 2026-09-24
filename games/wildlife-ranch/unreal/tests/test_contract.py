import copy,json,math,sys,tempfile,unittest
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'Tools' if (root/'Tools').exists() else root/'src'/'Tools'))
from contract import *

def fixture():
 return {'schema':SCHEMA,'source_blend_sha256':BASE_SHA,'engine_target':'5.7','units':'centimeters','coordinates':'X=BlenderX,Y=-BlenderY,Z=BlenderZ','unreal_import_verified':False,'instance_count':1,'source_visible_mesh_instances':1,'materials':[{'id':'M_1','channels':{}}],'textures':[], 'player_start':{'location_cm':[0,0,92],'rotation_pitch_yaw_roll':[0,0,0]},'assets':[{'id':'SM_1','file':'meshes/SM_1.fbx','sha256':'0'*64,'collision':'none','bounds_cm':[[0,0,0],[100,100,100]],'material_ids':['M_1'],'instances':[{'id':'P_1','location_cm':[200,-500,400],'rotation_xyzw':[0,0,0,1],'scale':[1,1,1]}]}]}

class ContractTests(unittest.TestCase):
 def test_meters_to_centimeters(self):self.assertEqual(point_to_unreal([1,2,3]),[100,-200,300])
 def test_negative_coordinates(self):self.assertEqual(point_to_unreal([-1,-2,-3]),[-100,200,-300])
 def test_valid(self):self.assertEqual(validate(fixture())['instances'],1)
 def test_no_engine_claim(self):
  d=fixture();d['unreal_import_verified']=True
  with self.assertRaises(ValueError):validate(d)
 def test_wrong_source(self):
  d=fixture();d['source_blend_sha256']='new'
  with self.assertRaises(ValueError):validate(d)
 def test_duplicate_assets(self):
  d=fixture();d['assets']*=2
  with self.assertRaises(ValueError):validate(d)
 def test_duplicate_placements(self):
  d=fixture();d['assets'][0]['instances']*=2
  with self.assertRaises(ValueError):validate(d)
 def test_count_mismatch(self):
  d=fixture();d['source_visible_mesh_instances']=2
  with self.assertRaises(ValueError):validate(d)
 def test_invalid_rotation(self):
  d=fixture();d['assets'][0]['instances'][0]['rotation_xyzw']=[0,0,0,2]
  with self.assertRaises(ValueError):validate(d)
 def test_singular_scale(self):
  d=fixture();d['assets'][0]['instances'][0]['scale']=[0,1,1]
  with self.assertRaises(ValueError):validate(d)
 def test_nonfinite_rejected(self):
  for n in [math.nan,math.inf,-math.inf,True]:
   with self.subTest(n=n):
    with self.assertRaises(ValueError):vector([0,n,0])
 def test_path_traversal(self):
  for p in ['../secret','/etc/shadow','meshes/../../outside','C:/file','meshes\\file']:
   with self.subTest(p=p):
    with self.assertRaises(ValueError):safe_file('.',p)
 def test_checksum_not_claimed_on_missing_payload(self):
  with tempfile.TemporaryDirectory() as root:
   with self.assertRaises(ValueError):validate(fixture(),root)
 def test_material_reference(self):
  d=fixture();d['assets'][0]['material_ids']=['M_99']
  with self.assertRaises(ValueError):validate(d)
 def test_unknown_collision(self):
  d=fixture();d['assets'][0]['collision']='entire_tree_crown'
  with self.assertRaises(ValueError):validate(d)
 def test_inverted_bounds(self):
  d=fixture();d['assets'][0]['bounds_cm']=[[100,0,0],[0,0,0]]
  with self.assertRaises(ValueError):validate(d)
 def test_reflection_transform_consistency(self):
  # Same coordinate recipe for local meshes, instance rotations, and translations.
  import random
  r=random.Random(351)
  for _ in range(1000):
   x,y,z=[r.uniform(-200,200) for _ in range(3)];tx,ty,tz=[r.uniform(-10,10) for _ in range(3)];a=r.uniform(-math.pi,math.pi);s=r.uniform(.2,3)
   expected=point_to_unreal([s*(x*math.cos(a)-y*math.sin(a))+tx,s*(x*math.sin(a)+y*math.cos(a))+ty,s*z+tz])
   px,py,pz=point_to_unreal([x,y,z]);actual=[s*(px*math.cos(-a)-py*math.sin(-a))+100*tx,s*(px*math.sin(-a)+py*math.cos(-a))-100*ty,s*pz+100*tz]
   for p,q in zip(actual,expected):self.assertAlmostEqual(p,q,places=7)

if __name__=='__main__':unittest.main()
