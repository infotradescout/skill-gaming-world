import test from 'node:test';
import assert from 'node:assert/strict';
import {hazardProbability,hazardFromNetSurvival,lifeSegments,survivalProbability,sampleLifeEvent,crossingProbabilities,validateProfile,requireCalibration} from '../src/risk.mjs';
import {WildlifeWorld} from '../src/world.mjs';
const options={allowProvisional:true};
// Deliberately synthetic rates for mechanics tests. NEVER wildlife estimates.
const profile={id:'fixture',version:1,species:'deer',region:'fixture',status:'provisional',basis:'cause-specific-hazards',unit:'per-day',sourceIds:[],bands:[{fromDays:0,toDays:10,hazards:{disease:.01}},{fromDays:10,toDays:null,hazards:{disease:.04,senescence:.06}}]};
const founders=[{id:'D1',species:'deer',ageDays:8*365.2425,massKg:80,position:{x:0,y:0},name:'Watched for eight hunting seasons'}, {id:'C1',species:'cougar',ageDays:1000,massKg:60,position:{x:1,y:0}}];
const make=(seed=101)=>new WildlifeWorld({seed,founders,region:'fixture'});
const pred={allowedPreySpecies:['deer'],rangeMeters:5,attackProbability:1,killGivenAttack:1,edibleFraction:.6,profileId:'synthetic-test-only'};
const road={id:'R1',x:10,yMin:-100,yMax:100,widthMeters:8};
const traffic={vehiclesPerHour:0,crossingSpeedMps:2,collisionGivenOverlap:1,fatalGivenCollision:1};
const near=(a,b,e=1e-12)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('annual hazard conversion preserves annual survival',()=>{
 const h=hazardFromNetSurvival(.8,365.2425,'net-cause-specific'); near(1-hazardProbability(h,365.2425),.8);
 near((1-hazardProbability(h,1))**365.2425,.8);
});
test('all-cause survival is rejected as extra natural mortality',()=>{
 assert.throws(()=>hazardFromNetSurvival(.8,365,'all-cause'),/All-cause/);
 assert.throws(()=>validateProfile({...profile,basis:'all-cause-survival'},options));
});
test('bad probabilities and time inputs fail instead of clamping',()=>{
 for(const x of [NaN,Infinity,-1]) assert.throws(()=>hazardProbability(x,1));
 assert.throws(()=>hazardProbability(1,-1)); assert.throws(()=>hazardFromNetSurvival(0,365,'net-cause-specific'));
 assert.throws(()=>sampleLifeEvent([],1,.3)); assert.throws(()=>sampleLifeEvent([],0,.3,-1));
});
test('provisional rates require explicit sandbox opt-in',()=>{
 assert.throws(()=>validateProfile(profile),/Uncalibrated/); validateProfile(profile,options);
 assert.throws(()=>validateProfile({...profile,status:'calibrated'}),/sources/);
});
test('explicit predation, harvest and vehicle causes cannot be double-counted in background profile',()=>{
 for(const cause of ['predation','harvest','vehicle','all-cause']) assert.throws(()=>validateProfile({...profile,bands:[{fromDays:0,toDays:null,hazards:{[cause]:.01}}]},options));
});
test('age bands must cover birth to open-ended old age without gaps',()=>{
 assert.throws(()=>validateProfile({...profile,bands:[{fromDays:1,toDays:null,hazards:{disease:0}}]},options));
 assert.throws(()=>validateProfile({...profile,bands:[{fromDays:0,toDays:100,hazards:{disease:.1}}]},options));
});
test('age boundary integration is exact, not one risk for whole year',()=>{
 const s=lifeSegments(profile,8,5,options); assert.equal(s.length,2);near(survivalProbability(s),Math.exp(-.01*2-.1*3));
});
test('competing causes choose only one cause with correct event time',()=>{
 const s=lifeSegments(profile,10,5,options); const e=sampleLifeEvent(s,0,.8,.2);
 assert.equal(e.death,true);assert.equal(e.cause,'senescence');near(e.offsetDays,2);
});
test('life threshold subdivision preserves fate and remaining hazard',()=>{
 const s=lifeSegments(profile,8,5,options), whole=sampleLifeEvent(s,0,.8,.22);
 const a=sampleLifeEvent(lifeSegments(profile,8,1,options),0,.8,.22);
 const b=sampleLifeEvent(lifeSegments(profile,9,4,options),0,.8,a.remainingClock);
 assert.equal(a.death,false); assert.equal(whole.cause,b.cause);near(whole.offsetDays,1+b.offsetDays);
});
test('zero background risk does not expire old animals on a birthday',()=>{
 const s=[{offsetDays:0,days:100000,hazards:{senescence:0}}];assert.equal(sampleLifeEvent(s,.99,.1).death,false);
});
test('Monte Carlo survival and cause shares match specified math, not a biological validation',()=>{
 const w=make(91823),N=60000;let count=0,disease=0;
 const s=[{offsetDays:0,days:1,hazards:{disease:.2,senescence:.3}}];
 for(let i=0;i<N;i++){const e=sampleLifeEvent(s,w.random(),w.random());if(e.death){count++;if(e.cause==='disease')disease++;}}
 near(count/N,1-Math.exp(-.5),.008); near(disease/count,.4,.015);
});
test('per-species per-region calibration cannot borrow another population silently',()=>{
 assert.deepEqual(requireCalibration([], 'deer','region-A').ready,false);
 const rows=['age-sex-survival','reproduction','food-budget','movement','cause-specific-mortality'].map(metric=>({species:'deer',region:'A',metric,status:'validated',sourceId:'source',validationReceipt:'receipt'}));
 assert.equal(requireCalibration(rows,'deer','A').ready,true);assert.equal(requireCalibration(rows,'deer','B').ready,false);
});
test('every founder identity is unique and invalid/duplicate IDs rejected',()=>{
 assert.throws(()=>new WildlifeWorld({seed:1,founders:[founders[0],founders[0]]}),/identity/);
 assert.throws(()=>new WildlifeWorld({seed:1,founders:[{...founders[0],id:'__proto__'}]}));
});
test('a watched eight-year deer has no immunity to an existing nearby predator',()=>{
 const w=make(); w.attemptPredation('hunt', 'C1','D1',pred); assert.equal(w.animal('D1',false).alive,false);assert.equal(w.state.deaths,1);
 assert.equal(w.animal('D1',false).death.predatorId,'C1');
});
test('missing, dead, inappropriate or remote prey cannot be replaced or killed remotely',()=>{
 const w=make();assert.throws(()=>w.attemptPredation('bad','C1','not-a-deer',pred));
 assert.throws(()=>w.attemptPredation('bad2','D1','C1',pred));
 w.state.animals.C1.position={x:1000,y:0};assert.equal(w.attemptPredation('far','C1','D1',pred).type,'predation-no-encounter');assert.equal(w.state.deaths,0);
});
test('failed attack leaves same prey alive, no replacement body',()=>{
 const w=make();const n=Object.keys(w.state.animals).length;
 assert.equal(w.attemptPredation('escape','C1','D1',{...pred,killGivenAttack:0}).type,'predation-escape');
 assert.equal(w.animal('D1').alive,true);assert.equal(Object.keys(w.state.animals).length,n);
});
test('predation does not magically consume the full animal',()=>{
 const w=make();w.attemptPredation('hunt','C1','D1',pred);const c=w.state.carcasses.D1;
 near(c.initialKg,48);near(c.consumedKg,0);w.feed('meal1','C1','D1',3,5);w.feed('meal2','C1','D1',4,5);
 near(c.consumedKg,7);near(c.remainingKg,41);assert.equal(w.state.deaths,1);
});
test('carcass losses and consumption conserve edible biomass',()=>{
 const w=make();w.attemptPredation('hunt','C1','D1',pred);w.feed('meal','C1','D1',3,5);
 w.loseCarcassMass('decay','D1',10,'decomposition');const e=w.feed('last','C1','D1',1000,5);
 near(e.kg,35);near(w.state.carcasses.D1.remainingKg,0);w.assertInvariants();
});
test('duplicate predation and feeding commands are idempotent; conflicts rejected',()=>{
 const w=make(),e=w.attemptPredation('hunt','C1','D1',pred);
 assert.deepEqual(w.attemptPredation('hunt','C1','D1',pred),e);assert.equal(w.state.deaths,1);
 const f=w.feed('meal','C1','D1',3,5);assert.deepEqual(w.feed('meal','C1','D1',3,5),f);near(w.state.carcasses.D1.consumedKg,3);
 assert.throws(()=>w.feed('meal','C1','D1',4,5),/Conflicting/);
});
test('bad commands roll back state and randomness',()=>{
 const w=make(),before=w.save();assert.throws(()=>w.attemptPredation('bad','C1','D1',{...pred,edibleFraction:4}));assert.equal(w.save(),before);
});
test('zero traffic or zero overlap yields zero road collision probability',()=>{
 near(crossingProbabilities({vehiclesPerHour:0,exposureSeconds:100,collisionGivenOverlap:1,fatalGivenCollision:1}).collision,0);
 near(crossingProbabilities({vehiclesPerHour:100,exposureSeconds:0,collisionGivenOverlap:1,fatalGivenCollision:1}).collision,0);
});
test('road model distinguishes collision, injury and death',()=>{
 const x=crossingProbabilities({vehiclesPerHour:360,exposureSeconds:10,collisionGivenOverlap:.5,fatalGivenCollision:.6});
 near(x.collision,(1-Math.exp(-1))*.5);near(x.fatal+x.injured+x.clear,1);
});
test('no complete road crossing means no global roadkill roll',()=>{
 const w=make(),before=w.save();assert.throws(()=>w.crossRoad('r','D1',road,{x:1,y:0},traffic),/exposure/);assert.equal(w.save(),before);
 assert.throws(()=>w.crossRoad('r2','D1',{...road,yMin:50}, {x:20,y:0},traffic),/exposure/);
});
test('a real traffic-free crossing moves the same animal safely',()=>{
 const w=make();assert.equal(w.crossRoad('r','D1',road,{x:20,y:0},traffic).type,'road-clear');assert.deepEqual(w.animal('D1').position,{x:20,y:0});
});
test('roadkill is permanent and duplicate crossing cannot charge a second death',()=>{
 const w=make();const params={...traffic,vehiclesPerHour:1e10};const e=w.crossRoad('r','D1',road,{x:20,y:0},params);
 assert.equal(e.type,'death');assert.equal(e.cause,'vehicle');assert.deepEqual(w.crossRoad('r','D1',road,{x:20,y:0},params),e);
 const restored=WildlifeWorld.load(w.save());assert.equal(restored.animal('D1',false).alive,false);assert.equal(restored.state.deaths,1);
});
test('nonfatal road collision records injury rather than deleting the animal',()=>{
 const w=make();assert.equal(w.crossRoad('r','D1',road,{x:20,y:0},{...traffic,vehiclesPerHour:1e10,fatalGivenCollision:0}).type,'road-injury');assert.equal(w.animal('D1').injured,true);
});
test('same saved RNG produces identical subsequent results',()=>{
 const w=make(),other=WildlifeWorld.load(w.save());const uncertain={...pred,attackProbability:.6,killGivenAttack:.4};
 assert.deepEqual(w.attemptPredation('p','C1','D1',uncertain),other.attemptPredation('p','C1','D1',uncertain));assert.equal(w.save(),other.save());
});
test('tampered resurrection is rejected on load',()=>{
 const w=make();w.attemptPredation('p','C1','D1',pred);const s=JSON.parse(w.save());s.animals.D1.alive=true;assert.throws(()=>WildlifeWorld.load(JSON.stringify(s)));
});
test('a real birthday is not an automatic death: background age hazards determine fate',()=>{
 const w=make();const zero={...profile,bands:[{fromDays:0,toDays:null,hazards:{senescence:0}}]};
 w.advanceLife('year',365.2425,{deer:zero,cougar:{...zero,species:'cougar'}},options);
 assert.equal(w.state.day,365.2425);assert.equal(w.state.deaths,0);
});
test('save/reload and one-year vs daily life updates preserve death cause and time',()=>{
 const a=make(4401),b=make(4401),p={...profile,bands:[{fromDays:0,toDays:null,hazards:{senescence:.01,disease:.005}}]};
 const profiles={deer:p,cougar:{...p,species:'cougar'}};a.advanceLife('whole',365,profiles,options);
 for(let i=0;i<365;i++) b.advanceLife(`day-${i}`,1,profiles,options);
 for(const id of ['D1','C1']){assert.equal(a.animal(id,false).death.cause,b.animal(id,false).death.cause);near(a.animal(id,false).death.day,b.animal(id,false).death.day,1e-9);}
});
test('changing a calibrated life curve cannot silently reroll existing animal fate',()=>{
 const w=make(),p={...profile,bands:[{fromDays:0,toDays:null,hazards:{senescence:0}}]};const profiles={deer:p,cougar:{...p,species:'cougar'}};
 w.advanceLife('a',1,profiles,options);const before=w.save();assert.throws(()=>w.advanceLife('b',1,{...profiles,deer:{...p,version:2}},options),/migration/);assert.equal(w.save(),before);
});

test('zero-width age bands cannot hide behind floating-point precision',()=>{
 const p={...profile,bands:[{fromDays:0,toDays:1000,hazards:{disease:0}},{fromDays:1000,toDays:1000,hazards:{disease:0}},{fromDays:1000,toDays:null,hazards:{disease:0}}]};
 assert.throws(()=>validateProfile(p,options),/positive duration/);
});
test('diagonal paths beyond finite road ends are rejected rather than overexposed',()=>{
 const w=make(),before=w.save();
 assert.throws(()=>w.crossRoad('corner','D1',{...road,yMin:9,yMax:11},{x:20,y:20},traffic),/exposure/);
 assert.equal(w.save(),before);
});
test('sex-specific survival profiles cannot be silently swapped',()=>{
 const w=new WildlifeWorld({seed:1,founders:[{...founders[0],sex:'male'}],region:'fixture'});
 const p={...profile,sex:'female',bands:[{fromDays:0,toDays:null,hazards:{senescence:0}}]};
 assert.throws(()=>w.advanceLife('wrong',1,{deer:p},options),/sex/);
 w.advanceLife('right',1,{'deer:male':{...p,sex:'male'}},options);
 assert.equal(w.state.deaths,0);
});
test('saved mortality clocks reject invalid random draws',()=>{
 const w=make();const p={...profile,bands:[{fromDays:0,toDays:null,hazards:{senescence:0}}]};
 w.advanceLife('day',1,{deer:p,cougar:{...p,species:'cougar'}},options);
 const saved=JSON.parse(w.save());saved.mortalityClocks.D1.causeDraw=1;
 assert.throws(()=>WildlifeWorld.load(JSON.stringify(saved)),/clock/);
});
