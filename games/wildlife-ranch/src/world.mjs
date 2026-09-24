import {finite, probability, crossingProbabilities, lifeSegments, sampleLifeEvent} from './risk.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const text = (v, name) => { if (typeof v !== 'string' || !v.length || v.length > 200) throw new Error(`${name} required`); return v; };
const point = p => { if (!p) throw new Error('Position required'); finite(p.x,'x',-1e7,1e7); finite(p.y,'y',-1e7,1e7); };
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`;
  return JSON.stringify(v);
}
/** Local single-authority event core, not yet autonomous ecosystem or 3D runtime. */
export class WildlifeWorld {
  constructor({seed, founders, region = 'unselected'}) {
    finite(seed,'seed',1,4294967295); if (!Number.isInteger(seed)) throw new Error('Integer seed required');
    if (!Array.isArray(founders)) throw new Error('Founders array required');
    this.state = {schema:1, region, rng:seed, day:0, animals:{}, carcasses:{}, events:[], commands:{},
      foundCount:founders.length, births:0, deaths:0, mortalityClocks:{}};
    for (const a of founders) {
      text(a.id,'id'); text(a.species,'species'); point(a.position);
      finite(a.ageDays,'ageDays'); finite(a.massKg,'massKg',Number.MIN_VALUE);
      if (Object.hasOwn(this.state.animals,a.id) || ['__proto__','constructor','prototype'].includes(a.id)) throw new Error('Duplicate or unsafe identity');
      this.state.animals[a.id] = {...clone(a),alive:true,bornDay:-a.ageDays,origin:'founder',death:null,injured:false};
    }
    this.assertInvariants();
  }
  random() {
    let x=this.state.rng; x^=x<<13; x^=x>>>17; x^=x<<5; this.state.rng=x>>>0;
    return this.state.rng/4294967296;
  }
  animal(id, mustLive=true) {
    const a=Object.hasOwn(this.state.animals,id)?this.state.animals[id]:null;
    if (!a || (mustLive && !a.alive)) throw new Error(`Animal unavailable: ${id}`);
    return a;
  }
  event(type, data) {
    const e={id:`E${this.state.events.length+1}`,day:this.state.day,type,...clone(data)};
    this.state.events.push(e); return e;
  }
  command(id, payload, action) {
    text(id,'command id'); const key=`cmd:${id}`, fingerprint=canonical(payload);
    if (Object.hasOwn(this.state.commands,key)) {
      const old=this.state.commands[key]; if (old.fingerprint!==fingerprint) throw new Error('Conflicting command reuse');
      return clone(old.result);
    }
    const before=clone(this.state);
    try {
      const result=action(); this.assertInvariants();
      this.state.commands[key]={fingerprint,result:clone(result)}; return clone(result);
    } catch(error) { this.state=before; throw error; }
  }
  kill(id,cause,details={},edibleFraction=0) {
    const a=this.animal(id); probability(edibleFraction,'edibleFraction');
    a.alive=false; a.death={day:this.state.day,cause,...clone(details)}; this.state.deaths++;
    const kg=a.massKg*edibleFraction;
    this.state.carcasses[id]={animalId:id,position:clone(a.position),initialKg:kg,remainingKg:kg,consumedKg:0,lostKg:0};
    return this.event('death',{animalId:id,cause,...details});
  }
  /** Advance life clocks. Movement/predation/roads remain separate event adapters.
   * A changed background profile requires explicit migration; no silent rerolls.
   */
  advanceLife(commandId,days,profiles,{allowProvisional=false}={}) {
    finite(days,'days',Number.MIN_VALUE,3660);
    return this.command(commandId,{type:'life',days,profiles,allowProvisional},()=>{
      const start=this.state.day, pending=[];
      for (const a of Object.values(this.state.animals).filter(a=>a.alive).sort((a,b)=>a.id.localeCompare(b.id))) {
        const p=profiles[`${a.species}:${a.sex}`] ?? profiles[a.species];
        if (!p || p.species!==a.species || p.region!==this.state.region || (p.sex && p.sex!=='all' && p.sex!==a.sex))
          throw new Error('Species/sex/region profile missing or mismatched');
        const segments=lifeSegments(p,start-a.bornDay,days,{allowProvisional});
        const fingerprint=canonical(p), key=a.id;
        let clock=this.state.mortalityClocks[key];
        if (clock && clock.profile!==fingerprint) throw new Error('Profile changed: explicit migration required');
        if (!clock) clock={profile:fingerprint,remaining:-Math.log1p(-this.random()),causeDraw:this.random()};
        const outcome=sampleLifeEvent(segments,0,clock.causeDraw,clock.remaining);
        clock.remaining=outcome.remainingClock; this.state.mortalityClocks[key]=clock;
        if (outcome.death) pending.push({id:a.id,at:start+outcome.offsetDays,cause:outcome.cause,profile:p.id,version:p.version});
      }
      pending.sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id));
      for(const loss of pending) { this.state.day=loss.at; this.kill(loss.id,loss.cause,{profile:loss.profile,version:loss.version}); }
      this.state.day=start+days;
      return {day:this.state.day,deaths:pending};
    });
  }
  /** One externally supplied encounter. No targets are generated or teleported. */
  attemptPredation(commandId,predatorId,preyId,parameters) {
    return this.command(commandId,{type:'predation',predatorId,preyId,parameters},()=>{
      const p=this.animal(predatorId), prey=this.animal(preyId);
      if(predatorId===preyId) throw new Error('Self predation invalid');
      const {allowedPreySpecies,rangeMeters,attackProbability,killGivenAttack,edibleFraction,profileId}=parameters;
      text(profileId,'profileId'); finite(rangeMeters,'rangeMeters'); probability(attackProbability); probability(killGivenAttack); probability(edibleFraction);
      if(!Array.isArray(allowedPreySpecies) || !allowedPreySpecies.includes(prey.species)) throw new Error('Prey not in diet profile');
      if(distance(p.position,prey.position)>rangeMeters) return this.event('predation-no-encounter',{predatorId,preyId,profileId});
      if(this.random()>=attackProbability) return this.event('predation-no-attack',{predatorId,preyId,profileId});
      if(this.random()>=killGivenAttack) return this.event('predation-escape',{predatorId,preyId,profileId});
      this.kill(preyId,'predation',{predatorId,profileId},edibleFraction);
      return this.event('predation-kill',{predatorId,preyId,profileId});
    });
  }
  /** Consume from the existing carcass, not a new kill. Cache loss is separate. */
  feed(commandId,predatorId,carcassId,requestedKg,accessRangeMeters) {
    return this.command(commandId,{type:'feed',predatorId,carcassId,requestedKg,accessRangeMeters},()=>{
      const p=this.animal(predatorId), c=this.state.carcasses[carcassId];
      finite(requestedKg,'requestedKg'); finite(accessRangeMeters,'accessRangeMeters');
      if(!c || distance(p.position,c.position)>accessRangeMeters) throw new Error('Carcass not accessible');
      const kg=Math.min(requestedKg,c.remainingKg); c.remainingKg-=kg; c.consumedKg+=kg;
      return this.event('feeding',{predatorId,carcassId,kg});
    });
  }
  loseCarcassMass(commandId,carcassId,kg,reason) {
    return this.command(commandId,{type:'carcass-loss',carcassId,kg,reason},()=>{
      finite(kg,'kg'); if(!['decomposition','scavenger-transfer','abandoned-unavailable'].includes(reason)) throw new Error('Explicit loss reason required');
      const c=this.state.carcasses[carcassId]; if(!c) throw new Error('Missing carcass');
      const lost=Math.min(kg,c.remainingKg); c.remainingKg-=lost; c.lostKg+=lost;
      return this.event('carcass-loss',{carcassId,kg:lost,reason});
    });
  }
  /** Straight-road crossing adapter. Road is a finite vertical strip.
   * Path must actually traverse the road; merely being on the ranch is no exposure.
   */
  crossRoad(commandId,animalId,road,destination,parameters) {
    return this.command(commandId,{type:'road',animalId,road,destination,parameters},()=>{
      const a=this.animal(animalId); point(destination); text(road.id,'road id');
      finite(road.x,'road x',-1e7,1e7); finite(road.yMin,'yMin',-1e7,1e7); finite(road.yMax,'yMax',road.yMin,1e7);
      finite(road.widthMeters,'widthMeters',Number.MIN_VALUE);
      finite(parameters.crossingSpeedMps,'crossingSpeedMps',Number.MIN_VALUE);
      const from=clone(a.position), half=road.widthMeters/2, dx=destination.x-from.x;
      const crosses=(from.x<road.x-half && destination.x>road.x+half)||(from.x>road.x+half && destination.x<road.x-half);
      const t=dx===0?-1:(road.x-from.x)/dx, y=from.y+t*(destination.y-from.y);
      const edgeYs=[road.x-half,road.x+half].map(x=>from.y+(x-from.x)/dx*(destination.y-from.y));
      if(!crosses || !edgeYs.every(edgeY=>Number.isFinite(edgeY) && edgeY>=road.yMin && edgeY<=road.yMax))
        throw new Error('No complete road-crossing exposure');
      const pathLength=distance(from,destination), inRoadLength=pathLength*road.widthMeters/Math.abs(dx);
      const risks=crossingProbabilities({...parameters,exposureSeconds:inRoadLength/parameters.crossingSpeedMps});
      const draw=this.random();
      if(draw<risks.fatal) {
        a.position={x:road.x,y}; return this.kill(animalId,'vehicle',{roadId:road.id,risks,profileId:parameters.profileId??'provisional'});
      }
      a.position=clone(destination);
      if(draw<risks.collision) a.injured=true;
      return this.event(draw<risks.collision?'road-injury':'road-clear',{animalId,roadId:road.id,risks});
    });
  }
  assertInvariants() {
    const s=this.state;
    if(s.schema!==1 || !Number.isInteger(s.rng) || s.rng<1 || s.rng>4294967295) throw new Error('Invalid save schema/RNG');
    finite(s.day,'day');
    for(const k of ['foundCount','births','deaths']) if(!Number.isSafeInteger(s[k]) || s[k]<0) throw new Error('Invalid population counter');
    const list=Object.values(s.animals), dead=list.filter(a=>!a.alive);
    if(list.length!==s.foundCount+s.births || dead.length!==s.deaths) throw new Error('Population does not reconcile');
    for(const a of list) {
      text(a.id,'animal id'); text(a.species,'species'); point(a.position); finite(a.massKg,'massKg',Number.MIN_VALUE);
      if(typeof a.alive!=='boolean' || !Number.isFinite(a.bornDay) || a.bornDay>s.day || s.animals[a.id]!==a) throw new Error('Invalid animal record');
      if(a.alive && a.death!==null || !a.alive && !a.death) throw new Error('Life/death mismatch');
    }
    const deathEvents=s.events.filter(e=>e.type==='death');
    if(deathEvents.length!==s.deaths || new Set(deathEvents.map(e=>e.animalId)).size!==s.deaths) throw new Error('Duplicate or missing death history');
    for(const e of deathEvents) {
      const a=this.animal(e.animalId,false);
      if(a.alive || a.death.cause!==e.cause || a.death.day!==e.day) throw new Error('Death history conflict');
    }
    for(const c of Object.values(s.carcasses)) {
      if(this.animal(c.animalId,false).alive) throw new Error('Living animal carcass');
      for(const k of ['initialKg','remainingKg','consumedKg','lostKg']) finite(c[k],k);
      if(Math.abs(c.initialKg-c.remainingKg-c.consumedKg-c.lostKg)>1e-8) throw new Error('Carcass mass does not reconcile');
    }
    for(const [id,c] of Object.entries(s.mortalityClocks)) {
      this.animal(id,false); finite(c.remaining,'life clock'); probability(c.causeDraw);
      if(c.causeDraw>=1 || typeof c.profile!=='string') throw new Error('Invalid saved mortality clock');
    }
    return true;
  }
  save() {this.assertInvariants();return JSON.stringify(this.state);}
  static load(json) {
    if(typeof json!=='string' || json.length>20000000) throw new Error('Invalid or oversized save');
    const w=Object.create(WildlifeWorld.prototype); w.state=JSON.parse(json); w.assertInvariants(); return w;
  }
}
