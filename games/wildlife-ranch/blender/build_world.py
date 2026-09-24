"""Original Wildlife Reserve Blender authoring build. Not a playable/ecological runtime.
Run: blender --background --python build_world.py -- --output /path/to/output
A fresh factory scene is used only in the dedicated build process. Never run in
an unsaved working session. All generated art is original procedural geometry.
"""
from pathlib import Path
import argparse, hashlib, json, math, os, sys
import numpy as np

SEED = 20260920
WORLD_ID = 'wildlife-reserve.template.001'
VERSION = '0.1.0'
SIZE = 20000.0
LAKE = (-900.0, 1400.0, 1650.0, 2250.0, 260.0)

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)

def noise(x,y,scale=1000.,seed=0):
    x=np.asarray(x)/scale; y=np.asarray(y)/scale
    ix=np.floor(x); iy=np.floor(y); u=x-ix; v=y-iy
    u=u*u*(3-2*u); v=v*v*(3-2*v)
    def h(a,b):
        q=np.sin(a*127.1+b*311.7+seed*19.17)*43758.5453123
        return (q-np.floor(q))*2-1
    return ((1-u)*h(ix,iy)+u*h(ix+1,iy))*(1-v)+((1-u)*h(ix,iy+1)+u*h(ix+1,iy+1))*v

def river_x(y): return -600+460*np.sin(np.asarray(y)/1800)+170*np.sin(np.asarray(y)/640)
def river_z(y):
    y=np.asarray(y); return 260+np.maximum(y-3500,0)*.017+np.minimum(y+700,0)*.009

def lake_r(x,y):
    a=(np.asarray(x)-LAKE[0])/LAKE[2]; b=(np.asarray(y)-LAKE[1])/LAKE[3]
    th=np.arctan2(b,a); shape=1+.065*np.sin(5*th+.4)+.04*np.sin(9*th)
    return np.sqrt(a*a+b*b)/shape

def shore(theta,scale=1.):
    r=(1+.065*math.sin(5*theta+.4)+.04*math.sin(9*theta))*scale
    return (LAKE[0]+LAKE[2]*r*math.cos(theta), LAKE[1]+LAKE[3]*r*math.sin(theta))

FACILITIES=[]
def ground(x,y,pads=True):
    x=np.asarray(x,dtype=float); y=np.asarray(y,dtype=float)
    rx=river_x(y); rz=river_z(y); d=np.abs(x-rx)
    roll=52*noise(x,y,1800,2)+24*noise(x,y,720,5)+8*noise(x,y,210,8)
    h=rz+42+roll+135*(1-np.exp(-d/2800))
    for cx,cy,ax,ay,high in [(-6500,5900,3500,4300,830),(-3600,7600,1900,2700,620),(5100,5900,3300,4200,710),(7400,2100,2500,3000,470),(-6800,-3300,2600,3500,370)]:
        e=np.exp(-((x-cx)/ax)**2-((y-cy)/ay)**2)
        h+=high*e*(.73+.27*np.abs(noise(x+400,y,510,23)))
    h+=4*noise(x,y,70,41)
    bank=rz-3.8+10*smooth(32,105,d)+7*smooth(105,300,d)+3*noise(x,y,310,3)
    w=1-smooth(90,550,d); h=h*(1-w)+bank*w
    r=lake_r(x,y); basin=260-23*np.maximum(1-r*r,0)+19*smooth(1,1.38,r)
    w=1-smooth(1.04,1.40,r); h=h*(1-w)+basin*w
    marsh=np.exp(-((x-(river_x(y)+270))/650)**4-((y+2100)/1250)**4)
    h=h*(1-marsh*.90)+(rz+2+1.5*noise(x,y,110,3))*marsh*.90
    if pads:
        for f in FACILITIES:
            dd=np.sqrt((x-f['x'])**2+(y-f['y'])**2)
            w=1-smooth(f['radius'],f['radius']*1.7,dd)
            h=h*(1-w)+f['z']*w
    return h

def forest_mask(x,y):
    return np.clip(.57+.42*noise(x,y,1350,72)+.27*noise(x,y,390,77),0,1)

def build_layout():
    global FACILITIES
    FACILITIES=[]
    specs=[('lodge-main','Ranger Lodge',0.0,1.115,70),('cabin-north','North Shore Cabin',1.0,1.10,22),('cabin-west','West Bay Cabin',3.5,1.09,22),('cabin-south','South Shore Cabin',4.8,1.085,22)]
    for fid,name,angle,radius,flat in specs:
        x,y=shore(angle,radius)
        FACILITIES.append(dict(id=fid,name=name,x=x,y=y,z=float(ground(x,y,False)),radius=flat))
    return FACILITIES

def grid_data(n=769):
    axis=np.linspace(-SIZE/2,SIZE/2,n); x,y=np.meshgrid(axis,axis)
    z=ground(x,y); sy,sx=np.gradient(z,SIZE/(n-1)); slope=np.sqrt(sx*sx+sy*sy)
    return x,y,z,slope

def validate_layout():
    build_layout(); x,y,z,s=grid_data(257)
    assert np.isfinite(z).all() and float(z.min())>0
    assert float(z.max())-float(z.min())>500
    assert len({f['id'] for f in FACILITIES})==len(FACILITIES)
    for f in FACILITIES:
        assert abs(float(ground(f['x'],f['y']))-f['z'])<1e-6
    yy=np.linspace(-10000,10000,1001); zz=river_z(yy)
    assert np.all(np.diff(zz)>=0),'River must flow downhill towards south'
    q1=ground(np.array([0,100,-900]),np.array([0,100,1400]))
    q2=ground(np.array([0,100,-900]),np.array([0,100,1400]))
    assert np.array_equal(q1,q2)
    return {'world_template_id':WORLD_ID,'template_revision':VERSION,'seed':SEED,'extent_m':SIZE,'area_km2':SIZE*SIZE/1e6,'area_acres':SIZE*SIZE/4046.8564224,'geography':'fictional temperate foothill layout; not selected ecoregion','sizing_status':'provisional editable authoring extent, not final approved acreage','terrain_elevation_range_m':[float(z.min()),float(z.max())],'checks':['finite elevations','large terrain relief','unique authored facility IDs','flattened facility centers','non-uphill river profile','deterministic height function'],'facilities':FACILITIES}

def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    ap=argparse.ArgumentParser(); ap.add_argument('--output',default='output'); ap.add_argument('--validate-only',action='store_true'); ap.add_argument('--no-render',action='store_true')
    cfg=ap.parse_args(args); out=Path(cfg.output).resolve(); out.mkdir(parents=True,exist_ok=True)
    manifest=validate_layout()
    if cfg.validate_only:
        print(json.dumps(manifest,indent=2)); return
    import bpy
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene; scene.name='Wildlife Reserve | Editable World 01'
    scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
    scene['world_template_id']=WORLD_ID; scene['template_revision']=VERSION; scene['seed']=SEED
    scene['authoring_extent_m']=SIZE; scene['gameplay_status']='world blockout only; no runtime or simulated wildlife'
    scene['ownership_status']='template geometry only; no account, deed or transaction authority'
    C={}
    for name in ['01_Terrain_Tiles','02_Water_Catchment','03_Roads_Trails','04_Facilities','05_Forest_Instances','06_Rocks_Reeds','07_Management_Districts','08_Cameras_Lighting','90_Prototype_Library']:
        c=bpy.data.collections.new(name); scene.collection.children.link(c); C[name[:2]]=c
    def mesh(name,v,f,mat=None,col='04'):
        me=bpy.data.meshes.new(name+'_mesh'); me.from_pydata(v,[],f); me.update()
        ob=bpy.data.objects.new(name,me); C[col].objects.link(ob)
        if mat: me.materials.append(mat)
        return ob
    def mat(name,color,rough=.8,metal=0):
        m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
        return m
    terrain=mat('Ground | slope and habitat tint',(0.20,.24,.12))
    nt=terrain.node_tree; p=nt.nodes.get('Principled BSDF'); vc=nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name='ground_color'; nt.links.new(vc.outputs['Color'],p.inputs['Base Color'])
    tex=nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=1.8; tex.inputs['Detail'].default_value=3
    geo=nt.nodes.new('ShaderNodeNewGeometry'); nt.links.new(geo.outputs['Position'],tex.inputs['Vector'])
    bump=nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.24; bump.inputs['Distance'].default_value=.18; nt.links.new(tex.outputs['Fac'],bump.inputs['Height']); nt.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    water=mat('Water | opaque blockout, no simulated flow',(.035,.16,.19),.19,.25)
    gravel=mat('Gravel road',(.26,.23,.17)); pathmat=mat('Foot trail',(.38,.30,.20)); wood=mat('Lodge timber',(.19,.105,.053)); roof=mat('Standing seam roof',(.12,.17,.17),.48,.22)
    glass=mat('Glazing',(.12,.29,.32),.16,.35); stone=mat('Stone and bridge foundations',(.32,.34,.32)); sand=mat('Facility gravel',(.43,.40,.30)); reedmat=mat('Wetland reed',(.31,.33,.12)); bark=mat('Bark',(.14,.08,.038))
    leaves=[mat('Conifer needles',(.055,.13,.072)),mat('Pine needles light',(.11,.19,.085)),mat('Hardwood canopy',(.16,.24,.08)),mat('Hardwood canopy warm',(.27,.30,.085))]
    print('Building deterministic terrain tiles',flush=True)
    x,y,z,sl=grid_data(); n=x.shape[0]; step=96
    # One shared raster is sliced, so border vertices match exactly.
    forest=forest_mask(x,y); elev=smooth(700,1150,z); rock=np.clip(smooth(.32,.75,sl)+elev*.6,0,1)
    base=np.stack([.22-.08*forest,.29-.10*forest,.12-.045*forest],axis=-1)
    variation=(noise(x,y,240,4)*.035)[...,None]; base=np.clip(base+variation,0,1)
    rgb=base*(1-rock[...,None])+np.array([.39,.40,.37])*rock[...,None]
    nearwater=np.maximum(1-smooth(1.0,1.08,lake_r(x,y)),1-smooth(35,90,np.abs(x-river_x(y))))
    drybank=nearwater*(z>river_z(y))[...]; rgb=rgb*(1-drybank[...,None]*.32)+np.array([.43,.39,.26])*drybank[...,None]*.32
    for iy in range(8):
        for ix in range(8):
            xs=x[iy*step:iy*step+step+1,ix*step:ix*step+step+1]; ys=y[iy*step:iy*step+step+1,ix*step:ix*step+step+1]; zs=z[iy*step:iy*step+step+1,ix*step:ix*step+step+1]
            verts=np.column_stack((xs.ravel(),ys.ravel(),zs.ravel())); w=step+1
            a=(np.arange(step)[:,None]*w+np.arange(step)[None,:]).ravel(); faces=np.column_stack((a,a+1,a+w+1,a+w))
            o=mesh(f'Terrain_{iy:02}_{ix:02}',verts.tolist(),faces.tolist(),terrain,'01'); o['tile_id']=f'T{iy:02}{ix:02}'; o['world_template_id']=WORLD_ID
            at=o.data.color_attributes.new(name='ground_color',type='FLOAT_COLOR',domain='POINT'); cc=rgb[iy*step:iy*step+step+1,ix*step:ix*step+step+1].reshape(-1,3); rgba=np.column_stack((cc,np.ones(len(cc)))); at.data.foreach_set('color',rgba.ravel())
            for poly in o.data.polygons: poly.use_smooth=True
    # Flat lake surface uses the same shoreline function as its bed.
    verts=[(LAKE[0],LAKE[1],260.15)]+[(*shore(t),260.15) for t in np.linspace(0,math.tau,384,endpoint=False)]
    lake=mesh('Lake_01_Main',verts,[(0,i+1,(i+1)%384+1) for i in range(384)],water,'02'); lake['waterbody_id']='water.main-lake'; lake['water_level_m']=260.15
    ys=np.linspace(-SIZE/2,SIZE/2,1801); xs=river_x(ys); zs=river_z(ys)+.18
    rv=[]; rf=[]
    for j in range(len(ys)):
        width=29+7*math.sin(float(ys[j])/1100); rv.extend([(xs[j]-width,ys[j],zs[j]),(xs[j]+width,ys[j],zs[j])])
        if j and lake_r(xs[j],ys[j])>1.04 and lake_r(xs[j-1],ys[j-1])>1.04: rf.append((2*j-2,2*j-1,2*j+1,2*j))
    river=mesh('River_01_North_to_South',rv,rf,water,'02'); river['waterbody_id']='water.main-river'; river['flow_direction']='south; conceptual profile, not hydrodynamic simulation'
    def box(name,loc,dim,material,col='04',rot=0):
        dx,dy,dz=[d/2 for d in dim]; v=[(-dx,-dy,-dz),(dx,-dy,-dz),(dx,dy,-dz),(-dx,dy,-dz),(-dx,-dy,dz),(dx,-dy,dz),(dx,dy,dz),(-dx,dy,dz)]
        o=mesh(name,v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],material,col); o.location=loc; o.rotation_euler.z=rot; return o
    def ribbon(name,points,width,material,col='03',height=.25):
        pp=np.array(points,float); v=[]
        for i,(xx,yy) in enumerate(pp):
            d=pp[min(i+1,len(pp)-1)]-pp[max(0,i-1)]; d/=max(np.linalg.norm(d),1e-6); normal=np.array([-d[1],d[0]])*width/2
            for sgn in [-1,1]:
                q=np.array([xx,yy])+normal*sgn; v.append((*q,float(ground(*q))+height))
        o=mesh(name,v,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(len(pp)-1)],material,col); o['access_route_id']=name; return o
    routes=[]
    yy=np.linspace(-9800,9800,850); xx=1900+320*np.sin(yy/1800)+180*np.sin(yy/4900); routes.append(('road.east-access',np.column_stack((xx,yy)),7.))
    yy=np.linspace(-7800,6700,750); xx=-3100+650*np.sin(yy/2500); routes.append(('road.west-service',np.column_stack((xx,yy)),5.))
    lodge=FACILITIES[0]; lx,ly,lz=lodge['x'],lodge['y'],lodge['z']
    xx=np.linspace(lx,1900+320*math.sin(ly/1800)+180*math.sin(ly/4900),130); yy=ly+55*np.sin(np.linspace(0,math.pi,130)); routes.append(('road.lodge-spur',np.column_stack((xx,yy)),5.5))
    theta=np.linspace(-.5,math.tau-.5,1250); pts=np.array([shore(t,1.065) for t in theta]); routes.append(('trail.lake-circuit',pts,1.8))
    for name,pts,width in routes: ribbon(name,pts,width,gravel if name.startswith('road') else pathmat)
    # Bridge on an east-west access route. Route elevations include the bridge approach.
    by=-3500.; bx=float(river_x(by)); xx=np.linspace(-3300,2200,700); yy=by+120*np.sin((xx-bx)/2500); bridgez=float(river_z(by))+9
    v=[]
    for xx0,yy0 in zip(xx,yy):
        blend=1-float(smooth(95,260,abs(xx0-bx)))
        for off in [-3.5,3.5]: v.append((xx0,yy0+off,float(ground(xx0,yy0+off))*(1-blend)+bridgez*blend+.2))
    crossing=mesh('road.south-crossing',v,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(xx)-1)],gravel,'03'); crossing['access_route_id']='road.south-crossing'
    bridge=box('Bridge_South_Deck',(bx,by,bridgez),(180,8,1),wood); bridge['facility_id']='bridge.south'
    for dx in [-68,-22,22,68]: box('Bridge_Pier',(bx+dx,by,bridgez-6),(3,5,12),stone)
    for sy in [-4.2,4.2]:
        box('Bridge_Rail',(bx,by+sy,bridgez+1.2),(180,.18,.22),wood)
        for dx in np.linspace(-88,88,31): box('Bridge_Post',(bx+dx,by+sy,bridgez+.6),(.22,.22,1.8),wood)
    print('Building lodge, cabins, docks and observation tower',flush=True)
    def house(f,big=False):
        xx,yy,zz=f['x'],f['y'],f['z']; a,b,h=(30,15,6) if big else (9,7,3.6)
        pad=box(f['id']+'_gravel-pad',(xx,yy,zz+.04),(a+28,b+27,.12),sand); pad['facility_id']=f['id']
        box(f['id']+'_foundation',(xx,yy,zz+.6),(a+.6,b+.6,1.2),stone)
        box(f['id']+'_timber',(xx,yy,zz+1.2+h/2),(a,b,h),wood)
        # A real gabled roof mesh with ridge, not a roof-shaped texture.
        v=[(-a/2-1,-b/2-1,h), (a/2+1,-b/2-1,h),(a/2+1,0,h+3),(-a/2-1,0,h+3),(-a/2-1,b/2+1,h),(a/2+1,b/2+1,h)]
        ob=mesh(f['id']+'_roof',v,[(0,1,2,3),(3,2,5,4),(0,3,4),(1,5,2)],roof); ob.location=(xx,yy,zz+1.2)
        for off in np.linspace(-a*.36,a*.36,7 if big else 2):
            for side in [-1,1]: box(f['id']+'_window',(xx+off,yy+side*(b/2+.03),zz+3.3),(1.5,.06,1.7),glass)
        box(f['id']+'_porch',(xx,yy-b/2-3,zz+1.05),(a+2,5,.3),wood)
        for dx in np.linspace(-a/2,a/2,7 if big else 3): box(f['id']+'_porch-post',(xx+dx,yy-b/2-5,zz+2.9),(.25,.25,3.5),wood)
        for i in range(4): box(f['id']+'_entry-step',(xx,yy-b/2-6-i*.38,zz+.85-i*.22),(3,.42,.25),stone)
    for i,f in enumerate(FACILITIES): house(f,i==0)
    # Lake side dock at the east shoreline; distinct persistent facility identity.
    sx,sy=shore(0); dock=box('Dock_Main',(sx-16,sy,261.05),(36,3,.35),wood); dock['facility_id']='dock.main'
    for dx in np.arange(-32,3,6):
        for yy0 in [-1.2,1.2]: box('Dock_Pile',(sx+dx,sy+yy0,258),(0.25,.25,6.4),wood)
    box('Dock_End',(sx-33,sy,261.05),(4,12,.35),wood)
    # Lodge sign, gate, service shed and parking bays remain geometry.
    shed=box('Lodge_Service_Shed',(lx+42,ly+25,lz+3),(12,8,6),wood); shed['facility_id']='shed.lodge'
    box('Lodge_Service_Roof',(lx+42,ly+25,lz+6.2),(13,9,.4),roof)
    for dx in np.linspace(-22,22,8): box('Parking_Bay',(lx+dx,ly+30,lz+.13),(.12,8,.02),stone)
    tx,ty=3700.,3600.; tz=float(ground(tx,ty)); tower=box('Lookout_Platform',(tx,ty,tz+12),(6,6,.45),wood); tower['facility_id']='tower.east-ridge'
    for dx in [-2.4,2.4]:
        for dy in [-2.4,2.4]: box('Lookout_Post',(tx+dx,ty+dy,tz+6),(.35,.35,12),wood)
    box('Lookout_Roof',(tx,ty,tz+15.2),(7,7,.4),roof)
    for dx in [-2.5,2.5]:
        box('Lookout_Rail',(tx+dx,ty,tz+13),(0.18,5.5,.2),wood); box('Lookout_Roof_Post',(tx+dx,ty+2.5,tz+13.5),(.2,.2,3),wood)
    for k in range(36): box('Lookout_Stair',(tx-4,ty-5+k*.27,tz+k/3),(1.5,.32,.16),wood)
    print('Building instanced forest assets',flush=True)
    rng=np.random.default_rng(SEED)
    # Mesh prototypes: tapered trunks, branch-tier conifers and clustered hardwood crowns.
    def append_cone(v,f,c,r1,r2,h,segments=9,phase=0):
        start=len(v)
        for zz,rr in [(c[2],r1),(c[2]+h,r2)]:
            for j in range(segments):
                t=math.tau*j/segments; rr0=rr*(1+.12*math.sin(j*3.1+phase)); v.append((c[0]+rr0*math.cos(t),c[1]+rr0*math.sin(t),zz))
        for j in range(segments): f.append((start+j,start+(j+1)%segments,start+segments+(j+1)%segments,start+segments+j))
        f.append(tuple(start+j for j in reversed(range(segments)))); f.append(tuple(start+segments+j for j in range(segments)))
    def append_crown(v,f,c,rad):
        start=len(v); rings=6; seg=9
        for i in range(rings+1):
            phi=math.pi*i/rings
            for j in range(seg):
                t=math.tau*j/seg; rr=math.sin(phi)*(1+.15*math.sin(3*t+phi*2)); v.append((c[0]+rad[0]*rr*math.cos(t),c[1]+rad[1]*rr*math.sin(t),c[2]+rad[2]*math.cos(phi)))
        for i in range(rings):
            for j in range(seg): a=start+i*seg+j; b=start+i*seg+(j+1)%seg; f.append((a,b,b+seg,a+seg))
    for k in range(6):
        v=[];f=[]; append_cone(v,f,(0,0,0),.28,.10,14+k,8); bark_faces=len(f)
        if k<3:
            for j in range(7):
                zz=4+j*1.9; width=(5.0-j*.58)*(1+.07*k); append_cone(v,f,(0,0,zz),width,.08,5.7,11,k+j)
        else:
            for j in range(7):
                a=j*2.4; append_crown(v,f,(math.cos(a)*2.2,math.sin(a)*2.2,12+(j%3)*1.8),(3.9,3.7,4.3))
        proto=mesh(f'Tree_Prototype_{k:02}',v,f,None,'90'); proto.data.materials.append(bark); proto.data.materials.append(leaves[k%4]); proto.location=(0,0,-4000-k*40)
        for i,p0 in enumerate(proto.data.polygons): p0.material_index=0 if i<bark_faces else 1; p0.use_smooth=True
    ng=bpy.data.node_groups.new('Forest | authored points to linked tree instances','GeometryNodeTree')
    if hasattr(ng,'interface'):
        ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry'); ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    else: ng.inputs.new('NodeSocketGeometry','Geometry'); ng.outputs.new('NodeSocketGeometry','Geometry')
    nd=ng.nodes; lk=ng.links; gi=nd.new('NodeGroupInput'); go=nd.new('NodeGroupOutput'); ci=nd.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value=C['90']; ci.inputs['Separate Children'].default_value=True; ci.inputs['Reset Children'].default_value=True
    inst=nd.new('GeometryNodeInstanceOnPoints'); inst.inputs['Pick Instance'].default_value=True; lk.new(gi.outputs['Geometry'],inst.inputs['Points']); lk.new(ci.outputs['Instances'],inst.inputs['Instance'])
    rand=nd.new('FunctionNodeRandomValue'); rand.data_type='INT'; next(s for s in rand.inputs if s.name=='Min' and s.type=='INT').default_value=0; next(s for s in rand.inputs if s.name=='Max' and s.type=='INT').default_value=5; rand.inputs['Seed'].default_value=SEED; lk.new(next(s for s in rand.outputs if s.name=='Value' and s.type=='INT'),inst.inputs['Instance Index'])
    for name,socket in [('tree_scale','Scale'),('tree_rotation','Rotation')]:
        at=nd.new('GeometryNodeInputNamedAttribute'); at.data_type='FLOAT_VECTOR'; at.inputs['Name'].default_value=name; lk.new(at.outputs['Attribute'],inst.inputs[socket])
    lk.new(inst.outputs['Instances'],go.inputs['Geometry'])
    def scatter(name,px,py):
        pz=ground(px,py); valid=(lake_r(px,py)>1.065)&(np.abs(px-river_x(py))>100)&(pz<1050)&(forest_mask(px,py)>rng.uniform(.13,.83,len(px)))
        for f in FACILITIES: valid&=((px-f['x'])**2+(py-f['y'])**2>(f['radius']+20)**2)
        # Keep the east arterial, west service road, bridge and lodge spur clear.
        valid&=(np.abs(px-(1900+320*np.sin(py/1800)+180*np.sin(py/4900)))>13)
        valid&=(np.abs(px-(-3100+650*np.sin(py/2500)))>11)
        valid&=~((px>-3400)&(px<2300)&(np.abs(py-(by+120*np.sin((px-bx)/2500)))<14))
        valid&=~((px>lx-8)&(px<2350)&(np.abs(py-ly)<66))
        px=px[valid]; py=py[valid]; pz=pz[valid]; o=mesh(name,np.column_stack((px,py,pz)).tolist(),[],None,'05')
        sc=rng.uniform(.72,1.42,len(px)); scales=np.column_stack((sc,sc,sc*rng.uniform(.95,1.15,len(px)))); ro=np.column_stack((np.zeros(len(px)),np.zeros(len(px)),rng.uniform(0,math.tau,len(px))))
        for attr,data in [('tree_scale',scales),('tree_rotation',ro)]: a=o.data.attributes.new(attr,'FLOAT_VECTOR','POINT'); a.data.foreach_set('vector',data.ravel())
        mod=o.modifiers.new('Editable forest instances','NODES'); mod.node_group=ng; o['placement_count']=len(px); o['representation']='vegetation art proxy; not wildlife population or final density'; return len(px)
    count=0
    for j in range(8):
        for i in range(8):
            px=rng.uniform(-10000+i*2500,-7500+i*2500,1600); py=rng.uniform(-10000+j*2500,-7500+j*2500,1600); count+=scatter(f'Forest_{j:02}_{i:02}',px,py)
    px=rng.uniform(lx-600,lx+900,8500); py=rng.uniform(ly-850,ly+850,8500); count+=scatter('Forest_Lodge_Detail',px,py)
    # Original rocks grouped into a single mesh, with wetland reed cards.
    v=[]; f=[]
    for k in range(750):
        xx=float(rng.uniform(-9500,9500)); yy=float(rng.uniform(-9500,9500)); zz=float(ground(xx,yy))
        if lake_r(xx,yy)<1.1 or abs(xx-float(river_x(yy)))<75: continue
        r=float(rng.uniform(3,13)); append_crown(v,f,(xx,yy,zz),(r,r*.72,r*.65))
    mesh('Rock_Outcrops_Proxies',v,f,stone,'06')
    v=[]; f=[]
    for k in range(2500):
        yy=float(rng.uniform(-3200,-1000)); xx=float(river_x(yy)+rng.uniform(90,410)); zz=float(ground(xx,yy)); h=float(rng.uniform(1.2,2.7))
        if zz>float(river_z(yy))+14: continue
        q=len(v); v.extend([(xx-.18,yy,zz),(xx+.18,yy,zz),(xx+.08,yy,zz+h),(xx-.08,yy,zz+h)]); f.append((q,q+1,q+2,q+3))
    mesh('Marsh_Reed_Patches',v,f,reedmat,'06')
    # District outlines are editing overlays, not fences or ownership authority.
    district_names=['Southwest Woodland','South Floodplain','West Ridge','Marsh and Lower River','Highland Forest','Lake Basin','Northwest Peaks','Northeast Headwaters']
    district_ids=[]
    for j in range(4):
        for i in range(2):
            idx=j*2+i; xmin=-10000+i*10000; ymin=-10000+j*5000
            o=mesh('District_'+district_names[idx],[(xmin,ymin,0),(xmin+10000,ymin,0),(xmin+10000,ymin+5000,0),(xmin,ymin+5000,0)],[(0,1,2,3)],None,'07'); o.display_type='WIRE'; o.hide_render=True; o['district_id']=f'district.{idx+1:02}'; o['boundary_semantics']='authoring/access proposal; not a physical wildlife barrier'; district_ids.append(o['district_id'])
    C['07'].hide_viewport=True
    # Lighting and saved camera views.
    world=bpy.data.worlds.new('Clear daylight'); world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Color'].default_value=(.52,.65,.78,1); world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55; scene.world=world
    sun_data=bpy.data.lights.new('Sun | late afternoon','SUN'); sun=bpy.data.objects.new('Sun',sun_data); C['08'].objects.link(sun); sun.rotation_euler=(math.radians(26),math.radians(-24),math.radians(-30)); sun_data.energy=3.; sun_data.angle=math.radians(7)
    def camera(name,pos,target,lens=45,ortho=None):
        d=bpy.data.cameras.new(name); o=bpy.data.objects.new(name,d); C['08'].objects.link(o); o.location=pos; o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler(); d.clip_end=100000; d.clip_start=.15; d.lens=lens
        if ortho: d.type='ORTHO'; d.ortho_scale=ortho
        return o
    aerial=camera('01_Reserve_Overview',(18000,-23000,24000),(0,1000,300),ortho=30000)
    top=camera('02_Reserve_Map',(0,0,30000),(0,0,0),ortho=21200)
    detail=camera('03_Lodge_and_Lake',(lx+165,ly-200,lz+96),(-1000,1900,430),lens=33)
    scene.camera=aerial; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=20; scene.cycles.use_denoising=True; scene.cycles.max_bounces=4; scene.cycles.diffuse_bounces=2; scene.cycles.glossy_bounces=2
    scene.render.resolution_x=1400; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
    try: scene.view_settings.view_transform='AgX'
    except TypeError: scene.view_settings.view_transform='Filmic'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.clip_end=80000; area.spaces.active.region_3d.view_distance=23000; area.spaces.active.region_3d.view_location=(0,0,300)
    manifest.update({'blender_version':bpy.app.version_string,'source_commit':os.environ.get('GITHUB_SHA','local-uncommitted'),'terrain_tiles':64,'terrain_raster_samples':[n,n],'height_sample_spacing_m':SIZE/(n-1),'tree_proxy_instances':count,'district_ids':district_ids,'collections':[c.name for c in C.values()],'waterbodies':['water.main-lake','water.main-river'],'asset_provenance':'original procedural geometry and materials; no COTW/third-party assets','stage':'editable environment blockout, not final COTW-quality environment','not_implemented':['wildlife models or behavior','ecological calibration','gameplay','GrindZone runtime','P2P commerce','engine import/streaming/collision','production foliage/art','hydrodynamics','final road earthworks and walkability']})
    (out/'world_manifest.json').write_text(json.dumps(manifest,indent=2))
    # Engine-neutral height source; metadata states north-up row order and actual range.
    lo=float(z.min()); hi=float(z.max()); encoded=np.rint((z-lo)/(hi-lo)*65535).astype('<u2'); encoded.tofile(out/'terrain_height_769.r16')
    (out/'heightfield.json').write_text(json.dumps({'encoding':'unsigned 16-bit little-endian','samples':[n,n],'row_0_y_m':-10000,'last_row_y_m':10000,'column_0_x_m':-10000,'last_column_x_m':10000,'minimum_elevation_m':lo,'maximum_elevation_m':hi,'unreal_import_verified':False},indent=2))
    text=bpy.data.texts.new('START_HERE.txt'); text.write('WILDLIFE RESERVE / ORIGINAL WORLD BLOCKOUT 0.1\n\nEditable 20 x 20 km authoring layout (provisional scale). Metric: 1 unit = 1 meter.\nCollections separate terrain tiles, water, access routes, facilities, vegetation, management overlays and cameras.\nUse saved cameras 01 overview, 02 map, 03 lodge. Geometry Nodes retain editable tree-placement points. Prototype assets are stored below the world.\nDistricts are not physical fences or legal deeds. No wildlife spawn/ownership/gameplay authority is stored in this scene.\nThis is a first-pass environment, not finished COTW-quality art or an ecological simulation.\nSee world_manifest.json and the reproducible source scripts.\n')
    blend=out/'Wildlife_Reserve_World_01.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    print('BLEND_SAVED',str(blend),flush=True)
    if not cfg.no_render:
        for cam,name,rx,ry in [(aerial,'reserve_overview.png',1400,1000),(top,'reserve_map.png',1200,1200),(detail,'lodge_and_lake.png',1400,900)]:
            scene.camera=cam; scene.render.resolution_x=rx; scene.render.resolution_y=ry; scene.render.filepath=str(out/name); print('RENDER',name,flush=True); bpy.ops.render.render(write_still=True)
    receipt={'build_completed':True,'native_scene_created':True,'blender_version':bpy.app.version_string,'source_commit':manifest['source_commit'],'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in out.iterdir() if p.is_file()},'scene_objects':len(bpy.data.objects),'mesh_datablocks':len(bpy.data.meshes),'rendered':not cfg.no_render,'native_reopen_verified':False,'scope':'Blender authoring only; no game release, ecology or multiplayer acceptance'}
    (out/'build_receipt.json').write_text(json.dumps(receipt,indent=2)); print('BUILD_RECEIPT',json.dumps(receipt),flush=True)

if __name__=='__main__': main()
