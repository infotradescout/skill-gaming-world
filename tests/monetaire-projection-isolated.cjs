'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createLoader}=require('../tools/monetaire-test-loader.cjs');
const {deck,SUITS}=require('./monetaire-fixtures.cjs');
const real=createLoader();const scoring=real('src/domain/scoring.ts');
const domain={...scoring,hashKlondikeGameState:s=>createHash('sha256').update(JSON.stringify(s)).digest('hex')};
// Only the projection is exercised. Game creation, authorization, database work,
// canonical game hashing and gameplay are NOT being replaced and called proved.
const {publicGameSession}=createLoader({
 '@/domain':domain,'./competition-catalog':{},'./demo-store':{},'./ids':{},'./player-access':{},
})('src/lib/game-service.ts');
function fixture(change={}) {
 let next=0;
 return {id:'projection-fixture',userId:'synthetic-owner',mode:'PRACTICE',seed:'private-practice-seed',createdAt:'2026-01-01T00:00:00Z',
   state:{gameId:'projection-fixture',rulesetVersion:'DRAW3_VERSION_UNCHANGED',dealGeneratorVersion:'GEN_UNCHANGED',dealCommitment:'COMMITMENT_UNCHANGED',
    status:'ACTIVE',lastSequence:0,validMoveCount:0,stock:deck.slice(28),waste:[],
    tableau:Array.from({length:7},(_,c)=>Array.from({length:c+1},(_,i)=>({card:deck[next++],faceUp:i===c}))),foundations:Object.fromEntries(SUITS.map(s=>[s,[]]))},
   activityClock:scoring.createServerActivityClock(1000),...change};
}
test('projection: configured-style persisted clock receives a fresh server observation',t=>{
 t.mock.method(Date,'now',()=>61_000);const input=fixture();const before=JSON.stringify(input);
 const out=publicGameSession(input);assert.equal(out.verifiedActivePlayMs,60_000);assert.equal(out.serverObservedAtMs,61_000);assert.equal(out.activityClockStatus,'RUNNING');assert.equal(JSON.stringify(input),before);
});
test('projection: reopening a serialized session includes idle time',t=>{
 const input=JSON.parse(JSON.stringify(fixture()));t.mock.method(Date,'now',()=>121_000);assert.equal(publicGameSession(input).verifiedActivePlayMs,120_000);
});
test('projection: pause and resume use the original server-clock rules',t=>{
 const input=fixture();input.activityClock=scoring.pauseActivityClock(input.activityClock,5000);t.mock.method(Date,'now',()=>20_000);
 assert.equal(publicGameSession(input).verifiedActivePlayMs,4000);assert.equal(publicGameSession(input).activityClockStatus,'PAUSED');
 input.activityClock=scoring.resumeActivityClock(input.activityClock,19_000);assert.equal(publicGameSession(input).verifiedActivePlayMs,5000);
});
for(const status of ['WON','ABANDONED']) test('projection: '+status+' time cannot grow after finalization',t=>{
 t.mock.method(Date,'now',()=>1_000_000);const input=fixture();input.state.status=status;input.activityClock=scoring.finalizeActivityClock(input.activityClock,5000);
 const out=publicGameSession(input);assert.equal(out.verifiedActivePlayMs,4000);assert.equal(out.activityClockStatus,'FINALIZED');
 const score=scoring.createOfficialScore({scoreId:'score-1',entryId:'entry-1',game:input.state,finalizedClock:input.activityClock});assert.equal(score.verifiedActivePlayMs,4000);assert.equal(score.finalizedAtServerMs,5000);
});
test('projection: a backwards process observation is clamped to the last server event',t=>{
 t.mock.method(Date,'now',()=>0);assert.equal(publicGameSession(fixture()).verifiedActivePlayMs,0);assert.equal(publicGameSession(fixture()).serverObservedAtMs,1000);
});
test('projection: clock repair does not reveal hidden cards or the competition seed',t=>{
 t.mock.method(Date,'now',()=>2000);const out=publicGameSession(fixture({mode:'NONCASH_COMPETITION'}));
 assert.equal(out.seed,null);assert.deepEqual(out.tableau[1][0],{id:null,suit:null,rank:null,faceUp:false});assert.deepEqual(out.stock,{remaining:24});
});
test('projection: board identity, rules, score inputs and moves stay unchanged between observations',t=>{
 let now=2000;t.mock.method(Date,'now',()=>now);const input=fixture();const one=publicGameSession(input);now=99999;const two=publicGameSession(input);
 for(const field of ['stateHash','sequence','validMoveCount','rulesetVersion','dealGeneratorVersion','dealCommitment']) assert.equal(one[field],two[field]);
 assert.deepEqual(one.tableau,two.tableau);assert.deepEqual(one.waste,two.waste);assert.deepEqual(one.foundations,two.foundations);
});
