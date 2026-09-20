"""Blender-native lodge/shore art refinement. Original geometry, not game runtime.
Run in a dedicated Blender process: blender -b -t 4 --python build_district.py -- OUTPUT
The macro reserve remains a separate editable scene; this is a replacement-area
look-development study. Its edges are NOT claimed stitched to the macro heightfield.
"""
import bpy, math, random, json, sys, os, hashlib, time
from pathlib import Path
from mathutils import Vector
import numpy as np

OUT=Path(sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'district-output').resolve()
OUT.mkdir(parents=True,exist_ok=True)
START=time.monotonic(); R=random.Random(20260920)
bpy.ops.wm.read_factory_settings(use_empty=True)
S=bpy.context.scene; S.name='Wildlife Reserve | Lodge and Shore 02'
S.unit_settings.system='METRIC'; S.unit_settings.scale_length=1.0
S['world_template_id']='wildlife-reserve.template.001'
S['template_revision']='0.2.0-art-study'
S['district_id']='district-lodge-shore'
S['status']='Blender art development; not gameplay or COTW-quality acceptance'
S['placement_status']='Local authored replacement study; NOT yet stitched into the 20 km macro terrain'
S['runtime_ownership']='No player/account ownership or lease authority in editable geometry'
S['local_units']='meters; Z up; water level Z=0'
COL={}
for n in ['Terrain','Water','Lodge','Dock','Forest','Understory','GroundCover','Rocks','Props','Cameras','Authoring']:
 c=bpy.data.collections.new(n); S.collection.children.link(c); COL[n]=c

def mat(name,c,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m

def texture(m,scale=5,detail=3,bump=.15,stretch=(1,1,1),variation=.22):
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
 t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale;t.inputs['Detail'].default_value=detail;t.inputs['Roughness'].default_value=.72
 co=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=stretch
 l.new(co.outputs['Generated'],mapping.inputs[0]);l.new(mapping.outputs['Vector'],t.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB');base=m.diffuse_color[:3]
 ramp.color_ramp.elements[0].position=.14;ramp.color_ramp.elements[0].color=tuple(v*(1-variation) for v in base)+(1,)
 ramp.color_ramp.elements[1].position=.84;ramp.color_ramp.elements[1].color=tuple(min(1,v*(1+variation)) for v in base)+(1,)
 l.new(t.outputs['Fac'],ramp.inputs['Fac']);l.new(ramp.outputs['Color'],p.inputs['Base Color'])
 b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.55;b.inputs['Distance'].default_value=bump;l.new(t.outputs['Fac'],b.inputs['Height']);l.new(b.outputs['Normal'],p.inputs['Normal'])
 return m

M={}
M['timber']=texture(mat('Weathered cedar siding',(.22,.115,.053)),7,3,.025,(1,1,20),.55)
M['trim']=texture(mat('Dark oil-finished timber',(.065,.042,.026)),4,3,.016,(1,1,12),.48)
M['deck']=texture(mat('Sun-worn decking',(.25,.215,.155)),6,3,.015,(1,20,1),.5)
M['roof']=texture(mat('Graphite standing-seam steel',(.048,.066,.061),.42,.65),5,2,.01,variation=.12)
M['stone']=texture(mat('Rough foundation stone',(.27,.27,.235)),9,5,.06,variation=.65)
M['mortar']=mat('Mortar shadow joints',(.105,.107,.095))
M['glass']=mat('Window glass',(.23,.36,.37),.12,.1)
M['glass'].node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.7
M['interior']=mat('Dark interior beyond glazing',(.009,.014,.011))
M['bark']=texture(mat('Fissured bark',(.105,.067,.033)),7,4,.055,(5,5,.3),.75)
M['birch']=texture(mat('Pale bark',(.45,.45,.37)),15,3,.018,(1,1,20),.7)
M['cutwood']=texture(mat('Cut log end grain',(.30,.21,.095)),12,3,.01,variation=.5)
M['soil']=texture(mat('Exposed root soil',(.092,.055,.029)),15,4,.06,variation=.8)
M['path']=texture(mat('Gravel and earth trail',(.255,.213,.145)),55,4,.03,variation=.7)
M['metal']=mat('Blackened metal fittings',(.02,.025,.026),.32,.75)
M['reed']=mat('Reed stems',(.31,.28,.10))
M['glow']=mat('Porch lamp amber',(.78,.42,.13))
p=M['glow'].node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.42,.12,1);p.inputs['Emission Strength'].default_value=1.5
NEEDLES=[mat('Needles '+str(i),c,.88) for i,c in enumerate([(.035,.077,.032),(.054,.11,.042),(.079,.15,.056),(.12,.17,.064),(.032,.067,.025)])]
LEAVES=[mat('Broadleaf '+str(i),c,.82) for i,c in enumerate([(.13,.205,.045),(.095,.16,.036),(.22,.28,.064),(.065,.12,.029),(.20,.195,.055)])]
GRASS=[mat('Ground plant '+str(i),c) for i,c in enumerate([(.18,.22,.056),(.11,.17,.04),(.28,.29,.088),(.32,.255,.115),(.09,.14,.04)])]
LITTER=[mat('Leaf litter '+str(i),c) for i,c in enumerate([(.17,.105,.034),(.23,.16,.066),(.115,.072,.025),(.29,.19,.07)])]
for m in LEAVES+GRASS:
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Subsurface Weight'].default_value=.08

class Geo:
 def __init__(self):self.v=[];self.f=[];self.mi=[]
 def face(self,pts,mi=0):
  st=len(self.v);self.v.extend([tuple(p) for p in pts]);self.f.append(tuple(range(st,st+len(pts))));self.mi.append(mi)
 def tube(self,a,b,r1,r2=None,mi=0,sides=7):
  a=Vector(a);b=Vector(b);d=b-a
  if d.length<1e-7:return
  w=d.normalized();u=w.cross(Vector((0,0,1)))
  if u.length<.01:u=w.cross(Vector((0,1,0)))
  u.normalize();v=w.cross(u);base=len(self.v);r2=r1 if r2 is None else r2
  for pt,rad in [(a,r1),(b,r2)]:
   for j in range(sides):self.v.append(tuple(pt+rad*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides))))
  for j in range(sides):self.f.append((base+j,base+(j+1)%sides,base+sides+(j+1)%sides,base+sides+j));self.mi.append(mi)
  self.f.extend([tuple(base+j for j in reversed(range(sides))),tuple(base+sides+j for j in range(sides))]);self.mi.extend([mi,mi])
 def leaf(self,center,direction,length,width,mi):
  c=Vector(center);d=Vector(direction).normalized();side=d.cross(Vector((0,0,1)))
  if side.length<.01:side=Vector((1,0,0))
  side.normalize();n=side.cross(d).normalized();base=c-d*length*.45;tip=c+d*length*.55
  mid=c+n*width*.2;left=c-side*width*.5;right=c+side*width*.5
  self.face([base,left,mid],mi);self.face([base,mid,right],mi);self.face([left,tip,mid],mi);self.face([mid,tip,right],mi)
 def obj(self,name,mats,col,smooth=True):
  me=bpy.data.meshes.new(name);me.from_pydata(self.v,[],self.f);me.update()
  for m in mats:me.materials.append(m)
  for p,idx in zip(me.polygons,self.mi):p.material_index=idx;p.use_smooth=smooth
  ob=bpy.data.objects.new(name,me);COL[col].objects.link(ob);return ob

def cube(name,loc,size,m,col='Lodge',bevel=0):
 x,y,z=(v/2 for v in size);g=Geo();vs=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
 for f in [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]:g.face([vs[i] for i in f])
 ob=g.obj(name,[m],col,False);ob.location=loc
 if bevel:
  mod=ob.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=2
 return ob

def beam(name,a,b,width,m,col='Lodge'):
 a,b=Vector(a),Vector(b);ob=cube(name,(a+b)/2,(width,width,(b-a).length),m,col,.015)
 ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return ob

def shore(y):return -21+3.6*math.sin(y/20)+1.8*math.sin(y/7)
def path_y(x):return -21+3.8*math.sin(x/29)
def height(x,y):
 bank=x-shore(y)
 z=-2.2+2.9/(1+math.exp(-max(-60,min(60,bank/4))))+max(bank-2,0)*.040
 z+=.20*math.sin(x*.19+y*.11)+.16*math.sin(x*.07-y*.17)+.08*math.sin(x*1.3+y*.97)
 z+=2.4*math.exp(-((x-90)/52)**2-((y-70)/38)**2)+1.9*math.exp(-((x-60)/40)**2-((y+90)/40)**2)
 d=math.hypot((x-30)/1.4,(y-12))
 w=max(0,min(1,(d-13)/12));w=w*w*(3-2*w)
 return 3.05*(1-w)+z*w

def path_distance(x,y):return abs(y-path_y(x))
def in_lodge(x,y,pad=0):return 19-pad<x<41+pad and 3-pad<y<24+pad

# Terrain: genuine fine-scale geometry, layered vertex colours and microdetail.
axis=np.linspace(-145,185,331);vs=[(float(x),float(y),height(float(x),float(y))) for y in axis for x in axis]
faces=[];n=len(axis)
for j in range(n-1):
 for i in range(n-1):a=j*n+i;faces.append((a,a+1,a+n+1,a+n))
g=Geo();g.v=vs;g.f=faces;g.mi=[0]*len(faces)
groundmat=mat('Forest floor - elevation, paths, litter',(.12,.105,.059));nt=groundmat.node_tree;p=nt.nodes.get('Principled BSDF')
vc=nt.nodes.new('ShaderNodeVertexColor');vc.layer_name='HabitatColour';nt.links.new(vc.outputs['Color'],p.inputs['Base Color'])
tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=7;tex.inputs['Detail'].default_value=5
co=nt.nodes.new('ShaderNodeTexCoord');nt.links.new(co.outputs['Object'],tex.inputs['Vector'])
bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.48;bump.inputs['Distance'].default_value=.065;nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],p.inputs['Normal'])
terrain=g.obj('Lodge_Shore_Terrain',[groundmat],'Terrain');terrain['district_id']='district-lodge-shore'
attr=terrain.data.color_attributes.new(name='HabitatColour',type='FLOAT_COLOR',domain='POINT')
for q,(x,y,z) in zip(attr.data,vs):
 bank=x-shore(y);v=.84+.16*math.sin(x*.5+y*.7)*math.sin(y*.43-x*.22)
 c=(.10,.11,.045)
 if bank<6:c=(.23,.197,.128)
 elif bank<15:c=(.13,.132,.063)
 elif path_distance(x,y)<2.2:c=(.235,.205,.155)
 elif math.sin(x/13)+math.cos(y/16)>.4:c=(.14,.106,.050)
 q.color=(*[i*v for i in c],1)
# Genuine water surface has waves, transmission, coloured depth and reflected sky.
water=mat('Lake water - physically shaded',(.065,.18,.175),.13)
p=water.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.82;p.inputs['IOR'].default_value=1.333
nodes=water.node_tree.nodes;links=water.node_tree.links
co=nodes.new('ShaderNodeTexCoord');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.4;noise.inputs['Detail'].default_value=3;links.new(co.outputs['Object'],noise.inputs['Vector'])
b=nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.22;b.inputs['Distance'].default_value=.08;links.new(noise.outputs['Fac'],b.inputs['Height']);links.new(b.outputs['Normal'],p.inputs['Normal'])
wg=Geo()
for yi in range(140):
 y=-165+yi*2.5
 for xi in range(58):
  x=-164+xi*2.5
  if x+2.5>min(shore(y),shore(y+2.5))+1.8:continue
  pts=[(xx,yy,.02+.012*math.sin(xx*1.8+yy*.41)) for xx,yy in [(x,y),(x+2.5,y),(x+2.5,y+2.5),(x,y+2.5)]];wg.face(pts)
wg.obj('Lake_Surface',[water],'Water')

# Lodge shell: siding boards, stone plinth, visible individual roof seams,
# porch framing, glazing, window trim, stairs, chimney and railings.
CX,CY=30,12;floor=3.55;W,D=18,10;eave=floor+4.1;ridge=eave+3.1
cube('Foundation',(CX,CY,3.15),(W+1,D+1,.8),M['mortar'])
for row in range(3):
 for i in range(24):
  x=CX-W/2-.2+i*.79+(row%2)*.2
  for y in [CY-D/2-.18,CY+D/2+.18]:cube('Foundation masonry',(x,y,2.84+row*.28),(.75,.3,.245),M['stone'],bevel=.04)
cube('Interior shadow',(CX,CY,floor+2),(W-.2,D-.2,4),M['interior'])
# Horizontal timber boards all walls. Windows project out with real recess/frame.
for k in range(18):
 z=floor+.12+k*.226
 for y in [CY-D/2,CY+D/2]:cube('Cedar horizontal siding',(CX,y,z),(W,.13,.214),M['timber'],bevel=.012)
 for x in [CX-W/2,CX+W/2]:cube('Cedar gable siding',(x,CY,z),(.13,D,.214),M['timber'],bevel=.012)
for k in range(13):
 z=eave+.12+k*.225;dd=D*(1-(z-eave)/(ridge-eave))
 if dd>0:
  for x in [CX-W/2,CX+W/2]:cube('Gable upper boards',(x,CY,z),(.14,dd,.215),M['timber'],bevel=.01)
# roof runs along X with pitches down Y
for side in [-1,1]:
 yedge=CY+side*(D/2+.85);zl=eave-.40
 a=(CX-W/2-1,CY,ridge);bb=(CX+W/2+1,CY,ridge);cc=(CX+W/2+1,yedge,zl);dd=(CX-W/2-1,yedge,zl)
 rg=Geo();rg.face([a,bb,cc,dd]);rg.obj('Roof sheet',[M['roof']],'Lodge',False)
 for i in range(40):
  x=CX-W/2-.9+i*.51;beam('Standing roof seam',(x,CY,ridge+.035),(x,yedge,zl+.035),.045,M['roof'])
 beam('Eave fascia',(CX-W/2-1,yedge,zl),(CX+W/2+1,yedge,zl),.22,M['trim'])
 for x in [CX-W/2-1,CX+W/2+1]:beam('Gable fascia',(x,CY,ridge),(x,yedge,zl),.22,M['trim'])
beam('Ridge cap',(CX-W/2-1.1,CY,ridge+.07),(CX+W/2+1.1,CY,ridge+.07),.20,M['roof'])
for x in [CX-W/2+.08,CX+W/2-.08]:
 for y in [CY-D/2-.1,CY+D/2+.1]:cube('Corner post',(x,y,floor+2),(.22,.22,4.25),M['trim'],bevel=.025)
# Broad view of south facade from approach
for x in [23.1,27.1,34.4,38.3]:
 y=CY-D/2-.11;z=floor+2.05
 cube('Window recess',(x,y,z),(2.18,.11,2.00),M['trim'])
 cube('Window glass',(x,y-.075,z),(1.88,.05,1.7),M['glass'])
 for xx in [x-1.04,x+1.04]:cube('Window side frame',(xx,y-.13,z),(.14,.15,2),M['trim'],bevel=.01)
 for zz in [z-.94,z+.94,z]:cube('Window cross frame',(x,y-.14,zz),(2.1,.16,.12),M['trim'],bevel=.008)
 cube('Window mullion',(x,y-.16,z),(.08,.17,1.85),M['trim']);cube('Window sill',(x,y-.23,z-1.03),(2.32,.38,.13),M['deck'],bevel=.01)
# Door center facade
cube('Entry door',(30.6,6.79,floor+1.27),(1.23,.16,2.55),M['trim'],bevel=.02)
cube('Entry glass',(30.6,6.685,floor+1.70),(.91,.04,1.18),M['glass'])
cube('Door handle',(31.02,6.57,floor+1.0),(.045,.13,.22),M['metal'],bevel=.012)
# Porch 3.6m deep, deck individual boards
for i in range(84):cube('Porch decking',(20.45+i*.23,4.98,floor-.08),(.218,3.85,.12),M['deck'],bevel=.007)
for x in [20.5,24.5,32.5,36.5,39.6]:
 cube('Porch post stone foot',(x,3.2,3.32),(.6,.6,.9),M['stone'],bevel=.07)
 cube('Porch timber post',(x,3.2,floor+1.7),(.22,.22,3.4),M['trim'],bevel=.022)
 for off in [-.65,.65]:beam('Porch knee brace',(x,3.2,floor+2.48),(x+off,3.2,floor+3.16),.14,M['trim'])
beam('Porch header',(20,3.2,floor+3.24),(40.2,3.2,floor+3.24),.27,M['trim'])
pg=Geo();pg.face([(19.8,2.65,floor+3.36),(40.3,2.65,floor+3.36),(40.3,7,eave-.25),(19.8,7,eave-.25)]);pg.obj('Porch roof',[M['roof']],'Lodge',False)
for i in range(42):beam('Porch roof seam',(20+i*.48,2.65,floor+3.39),(20+i*.48,7,eave-.22),.035,M['roof'])
for a,bb in [(20.5,27.7),(33.1,39.6)]:
 for z in [floor+.27,floor+1.0]:beam('Porch railing',(a,3.2,z),(bb,3.2,z),.11,M['trim'])
 for i in range(int((bb-a)/.22)):
  x=a+i*.22;cube('Porch baluster',(x,3.2,floor+.64),(.045,.065,.70),M['deck'],bevel=.005)
for i in range(4):cube('Entry stair',(30.5,2.8-i*.34,3.49-i*.17),(2.1,.36,.14),M['deck'],bevel=.018)
# Chimney stone and metal cap
cube('Chimney',(36.8,14.2,8.35),(1.1,1.1,5.2),M['mortar'])
for k in range(18):
 for a in [-1,1]:cube('Chimney stone',(36.8,14.2+a*.57,5.9+k*.28),(1.18,.16,.25),M['stone'],bevel=.035)
cube('Chimney cap',(36.8,14.2,11.02),(1.4,1.4,.19),M['metal'],bevel=.03)
# Lake-facing deck bench and firewood
for x in [23.5,37]:
 cube('Bench seat',(x,4.85,floor+.48),(2.2,.55,.10),M['deck'],bevel=.02)
 for off in [-.8,.8]:cube('Bench leg',(x+off,4.85,floor+.22),(.12,.4,.5),M['trim'])
 for k in range(2):cube('Bench back',(x,5.13,floor+.9+k*.22),(2.2,.08,.15),M['deck'],bevel=.015)
for i in range(40):
 x=38+(i%8)*.24;z=3.36+(i//8)*.21;gg=Geo();gg.tube((x,17.45,z),(x,18.45,z),.11,.095,0,9);gg.obj('Stacked firewood',[M['bark']],'Props')
# Trail winds from road to lodge and down toward dock.
trail=Geo()
for i in range(270):
 x=-35+i*.72;y=path_y(x);x2=x+.72;y2=path_y(x2)
 trail.face([(x,y-1.45,height(x,y-1.45)+.035),(x2,y2-1.45,height(x2,y2-1.45)+.035),(x2,y2+1.45,height(x2,y2+1.45)+.035),(x,y+1.45,height(x,y+1.45)+.035)])
trail.obj('Winding gravel access trail',[M['path']],'GroundCover')
# Dock follows west into lake, real boards, piles, ladder and bench.
dy=-20;dz=.92
for i in range(100):
 x=-13-i*.24;cube('Dock planks',(x,dy,dz),(.225,2.5,.12),M['deck'],'Dock',.007)
for y in [dy-.95,dy+.95]:
 beam('Dock stringer',(-13,y,dz-.22),(-37,y,dz-.22),.20,M['trim'],'Dock')
 for x in [-15,-20,-25,-30,-36]:
  gg=Geo();gg.tube((x,y,-1.5),(x,y,1.44),.115,.10);gg.obj('Dock support pile',[M['bark']],'Dock')
for k in range(7):beam('Dock ladder rung',(-35.7,dy+1.35,.70-k*.28),(-35.05,dy+1.35,.70-k*.28),.035,M['metal'],'Dock')
for x in [-35.75,-35]:beam('Dock ladder rail',(x,dy+1.35,-1.0),(x,dy+1.35,1.75),.045,M['metal'],'Dock')

# Tree prototypes are real branching meshes with individually curved leaves.
# Instances share mesh data and remain separately editable named objects.
TREE=[]
def tree_mesh(seed,conifer=True):
 rng=random.Random(seed);g=Geo();h=rng.uniform(15,23) if conifer else rng.uniform(12,19);rad=rng.uniform(.22,.40)
 trunk=[]
 for k in range(17):
  z=h*k/16;trunk.append(Vector((math.sin(k*.23)*z*.009,math.sin(k*.34+seed)*z*.007,z)))
 for k in range(16):g.tube(trunk[k],trunk[k+1],rad*(1-k/17)**1.35,rad*(1-(k+1)/17)**1.35,0,10)
 for j in range(7):
  a=j*math.tau/7;g.tube((math.cos(a)*1.0,math.sin(a)*1.0,.02),(0,0,.9),.04,rad*.56,0,6)
 mats=[M['bark']]+(NEEDLES if conifer else LEAVES)
 if conifer:
  for k in range(54):
   z=h*(.24+.70*k/54)+rng.uniform(-.25,.25);a=k*2.39996+rng.uniform(-.2,.2)
   reach=(1-z/h)**.78*6.0*rng.uniform(.8,1.18)+.3
   start=Vector((0,0,z));mid=Vector((math.cos(a)*reach*.53,math.sin(a)*reach*.53,z-.3));end=Vector((math.cos(a)*reach,math.sin(a)*reach,z+.3))
   g.tube(start,mid,.055*(1-z/h)+.012,.027,0,6);g.tube(mid,end,.027,.004,0,5)
   for j in range(12):
    f=.2+j*.068;base=mid.lerp(end,f);angle=a+(-1 if j%2 else 1)*rng.uniform(.65,1.05)
    length=.6*(1-f)+.20;tip=base+Vector((math.cos(angle)*length,math.sin(angle)*length,.10))
    g.tube(base,tip,.010,.0018,0,4)
    for q in range(10):
     pos=base.lerp(tip,q/10);direction=Vector((math.cos(angle),math.sin(angle),.12))
     cross=Vector((-math.sin(angle),math.cos(angle),.5))
     for sign in [-1,1]:
      d=(direction*.28+cross*sign).normalized();g.leaf(pos+d*.10,d,rng.uniform(.16,.30),rng.uniform(.045,.09),1+rng.randrange(len(NEEDLES)))
 else:
  for branch in range(13):
   a=branch*2.4;z=h*rng.uniform(.30,.72);start=Vector((0,0,z));end=Vector((math.cos(a)*rng.uniform(2.3,4.6),math.sin(a)*rng.uniform(2.3,4.6),min(h,z+rng.uniform(3,5))))
   mid=start.lerp(end,.55)+Vector((0,0,.5));g.tube(start,mid,.09,.04,0,8);g.tube(mid,end,.04,.009,0,6)
   for t in range(7):
    center=mid.lerp(end,.35+t*.13)+Vector((rng.uniform(-1.2,1.2),rng.uniform(-1.2,1.2),rng.uniform(-.7,.7)))
    g.tube(mid,center,.015,.004,0,5)
    for q in range(32):
     p=center+Vector((rng.gauss(0,.7),rng.gauss(0,.7),rng.gauss(0,.35)))
     d=(rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-.2,.7));g.leaf(p,d,rng.uniform(.16,.30),rng.uniform(.09,.16),1+rng.randrange(len(LEAVES)))
 ob=g.obj(('Pine' if conifer else 'Broadleaf')+'_prototype_'+str(seed),mats,'Authoring');ob.hide_render=True;ob.hide_set(True)
 return ob
for seed in range(8):TREE.append(tree_mesh(100+seed,seed<5))
for i in range(460):
 x=R.uniform(-8,180);y=R.uniform(-135,180)
 if x<shore(y)+12 or in_lodge(x,y,12) or path_distance(x,y)<4:continue
 if math.hypot(x-10,y+1)<14:continue
 proto=R.choice(TREE);ob=bpy.data.objects.new('Living canopy %03d'%i,proto.data);COL['Forest'].objects.link(ob)
 ob.location=(x,y,height(x,y)-.03);sc=R.uniform(.75,1.2);ob.scale=(sc,sc,sc);ob.rotation_euler=(R.uniform(-.015,.015),R.uniform(-.02,.02),R.uniform(0,math.tau));ob['asset_role']='original procedural tree; unanimated'
# Sparse lake-side trees, selected to frame camera without blocking lodge.
for i,(x,y) in enumerate([(-4,-38),(4,-52),(0,48),(12,57),(51,-2),(61,35),(-4,80)]):
 ob=bpy.data.objects.new('Shore framing tree '+str(i),TREE[i%8].data);COL['Forest'].objects.link(ob);ob.location=(x,y,height(x,y));ob.rotation_euler.z=i

# Ferns with individually curved fronds and paired leaflets; ground clutter grouped
# into meshes so object count does not hide thousands of expensive operators.
FERN=Geo();gr=Geo();reed=Geo();litter=Geo()
for i in range(540):
 x=R.uniform(-7,125);y=R.uniform(-100,125)
 if x<shore(y)+7 or in_lodge(x,y,4) or path_distance(x,y)<2.5:continue
 z=height(x,y)
 for a in [j*math.tau/7+R.random() for j in range(7)]:
  length=R.uniform(.6,1.15);base=Vector((x,y,z));end=base+Vector((math.cos(a)*length,math.sin(a)*length,length*.4))
  for k in range(9):
   f=k/10;center=base.lerp(end,f)+Vector((0,0,math.sin(f*math.pi)*length*.47));sz=.21*math.sin((f+.1)*math.pi)
   for sign in [-1,1]:FERN.leaf(center,(math.cos(a+sign*1.0),math.sin(a+sign*1.0),.2),sz,.067,R.randrange(len(GRASS)))
for i in range(7000):
 x=R.uniform(-20,150);y=R.uniform(-110,140)
 if x<shore(y)+1.5 or in_lodge(x,y,2) or path_distance(x,y)<1.6:continue
 z=height(x,y);h=R.uniform(.13,.55)
 for k in range(8):
  a=R.random()*math.tau;dx=R.uniform(-.15,.15);dy2=R.uniform(-.15,.15);gwidth=R.uniform(.012,.03)
  p=Vector((x+dx,y+dy2,z));tip=p+Vector((math.cos(a)*h*.4,math.sin(a)*h*.4,h));side=Vector((-math.sin(a)*gwidth,math.cos(a)*gwidth,0))
  gr.face([p-side,p+side,tip],R.randrange(len(GRASS)))
for i in range(1800):
 y=R.uniform(-130,135);x=shore(y)+R.uniform(.4,5)
 if abs(y+20)<3:continue
 z=height(x,y);h=R.uniform(.5,1.45)
 reed.tube((x,y,z),(x+.10,y+.08,z+h),.009,.004,0,4)
 if i%3==0:reed.tube((x+.10,y+.08,z+h-.2),(x+.10,y+.08,z+h+.05),.035,.025,1,6)
 for j in range(2):reed.leaf((x,y,z+h*.5),(R.uniform(-1,1),R.uniform(-1,1),.9),.65,.045,0)
for i in range(12000):
 x=R.uniform(-4,120);y=R.uniform(-85,115)
 if in_lodge(x,y,2) or x<shore(y)+8:continue
 litter.leaf((x,y,height(x,y)+.025),(R.uniform(-1,1),R.uniform(-1,1),.015),R.uniform(.06,.19),R.uniform(.03,.075),R.randrange(len(LITTER)))
FERN.obj('Fern understory',GRASS,'Understory');gr.obj('Grass and sedge layer',GRASS,'GroundCover');reed.obj('Wetland reeds',[M['reed'],M['bark']],'Understory');litter.obj('Fallen leaf litter',LITTER,'GroundCover')
# Irregular rock prototypes and well-seated instances
ROCK=[]
for k in range(6):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1)
 ob=bpy.context.object;ob.name='Rock prototype '+str(k)
 for c in list(ob.users_collection):c.objects.unlink(ob)
 COL['Authoring'].objects.link(ob)
 for v in ob.data.vertices:
  f=1+.18*math.sin(v.co.x*7+k)+.10*math.sin(v.co.y*11);v.co*=f
 ob.data.materials.append(M['stone']);ob.hide_render=True;ob.hide_set(True);ROCK.append(ob)
for i in range(1100):
 y=R.uniform(-115,140);x=shore(y)+R.uniform(-2.5,14) if i<650 else R.uniform(-2,130)
 if in_lodge(x,y,2) or abs(y+20)<2 and x<0:continue
 ob=bpy.data.objects.new('Shore rock %04d'%i,R.choice(ROCK).data);COL['Rocks'].objects.link(ob);r=R.uniform(.09,.55) if i%17 else R.uniform(.8,1.55)
 ob.scale=(r*R.uniform(.8,1.3),r,r*.55);ob.location=(x,y,height(x,y)-r*.17);ob.rotation_euler=(0,R.uniform(-.3,.3),R.random()*math.tau)
# Fallen logs, root fans, broken branches and a ranger information board.
for i,(x,y) in enumerate([(1,28),(47,-12),(64,58),(9,-59),(-2,68)]):
 z=height(x,y);g=Geo();g.tube((x,y,z+.23),(x+5,y+1,z+.34),.27,.18,0,12)
 for j in range(7):g.tube((x+j*.65,y+j*.13,z+.24),(x+j*.65+.6,y+j*.13+(-1)**j*.8,z+.5),.07,.008,0,6)
 ob=g.obj('Fallen deadwood '+str(i),[M['bark']],'GroundCover')
for x in [14,16.1]:beam('Information board post',(x,-13,height(x,-13)),(x,-13,height(x,-13)+2.1),.13,M['trim'],'Props')
cube('Information board',(15.05,-13, height(15,-13)+1.5),(2.4,.13,1.2),M['timber'],'Props',.04)
# No invented public claims, game title, owner account or values in scene metadata.
marker=bpy.data.objects.new('District boundary / nonphysical authoring metadata',None);COL['Authoring'].objects.link(marker);marker['district_id']='district-lodge-shore';marker['facility_id']='lodge-main';marker['extent_m']=[330,330]

world=bpy.data.worlds.new('Temperate daylight');world.use_nodes=True;S.world=world
nt=world.node_tree;sky=nt.nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_elevation=math.radians(31);sky.sun_rotation=math.radians(225);sky.air_density=1.05;sky.dust_density=.5
nt.links.new(sky.outputs['Color'],nt.nodes.get('Background').inputs['Color']);nt.nodes.get('Background').inputs['Strength'].default_value=.32
ld=bpy.data.lights.new('Afternoon sun','SUN');ld.energy=2.4;ld.angle=math.radians(2)
lo=bpy.data.objects.new('Afternoon sun',ld);COL['Cameras'].objects.link(lo);lo.rotation_euler=(math.radians(39),math.radians(-18),math.radians(-35))

def camera(name,loc,target,lens=31):
 data=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,data);COL['Cameras'].objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector(target)-Vector(loc)).to_track_quat('-Z','Y').to_euler();data.lens=lens;data.clip_end=2500;return ob
cams=[camera('Approach eye level',(2,-22,height(2,-22)+1.72),(30,12,6.15),30),camera('Shore eye level',(-28,-38,1.75),(28,10,5.3),32),camera('Porch to lake',(25,4.5,floor+1.72),(-40,-18,.6),28),camera('District overview',(-102,-137,85),(30,12,6),37)]
S.camera=cams[0];S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=24;S.cycles.use_denoising=True;S.cycles.max_bounces=5;S.cycles.transparent_max_bounces=4
S.render.resolution_x=1280;S.render.resolution_y=720;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=.1
# Native file saved before render; camera, textures and materials are editable.
BLEND=OUT/'Wildlife_Lodge_Shore_02.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
receipt={'schema':1,'source_commit':os.environ.get('RENDER_GIT_COMMIT'),'blender_version':bpy.app.version_string,'native_file':BLEND.name,'world_template_id':S['world_template_id'],'revision':S['template_revision'],'native_build':True,'native_reopen_verified':False,'objects':len(S.objects),'mesh_datablocks':len(bpy.data.meshes),'original_geometry':True,'rendered_views':[],'limitations':['Art-development district, not final COTW quality','Macro terrain and district not yet stitched','No gameplay, wildlife AI, leases or companion runtime','GLB preview approximates native procedural materials','Eye-level captures are still images, not measured game performance']}
for cam,name in zip(cams,['approach_eye','shore_eye','porch_eye','district_overview']):
 S.camera=cam;S.render.filepath=str(OUT/(name+'.png'));print('NATIVE_RENDER_START',name,flush=True);bpy.ops.render.render(write_still=True);receipt['rendered_views'].append(name+'.png');print('NATIVE_RENDER_DONE',name,flush=True)
S.camera=cams[0]
# Export only actual visible meshes, not hidden original prototypes/cameras.
bpy.ops.object.select_all(action='DESELECT')
for ob in S.objects:
 if ob.type=='MESH' and not ob.hide_render and not ob.hide_get():ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Wildlife_Lodge_Shore_02.glb'),export_format='GLB',use_selection=True,export_apply=False,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
# Save inspection-friendly viewport as well as the camera.
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.clip_end=3000;area.spaces.active.region_3d.view_distance=85;area.spaces.active.region_3d.view_location=(20,0,5)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
assert bpy.context.scene['world_template_id']=='wildlife-reserve.template.001'
assert bpy.context.scene.unit_settings.scale_length==1 and len(bpy.context.scene.objects)==receipt['objects']
assert bpy.data.objects.get('Lodge_Shore_Terrain') and bpy.data.objects.get('Lake_Surface')
assert len(list(OUT.glob('*_eye.png')))==3
receipt['native_reopen_verified']=True;receipt['elapsed_seconds']=round(time.monotonic()-START,2)
receipt['files']={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.suffix in ['.blend','.glb','.png']}
(OUT/'district_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print('DISTRICT_NATIVE_COMPLETE',json.dumps(receipt),flush=True)
