'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../tools/monetaire-test-loader.cjs');
const {session,afterDraw,reply,storage}=require('./monetaire-fixtures.cjs');
const load=createLoader();
const {MonetaireMoveClient,requestGameJson,GameRequestTimeout,parsePendingMove,pendingMoveKey}=load('src/components/monetaire-move-client.ts');
const {isServerGameSession,canAdoptGameSnapshot}=load('src/components/monetaire-session-types.ts');
const {createDisplayClockAnchor,displayElapsedMs,formatGameTime}=load('src/components/monetaire-display-clock.ts');
const {isCardSelectionClick,isDrawShortcut}=load('src/components/monetaire-input.ts');
const {readBrowserStorage,writeBrowserStorage}=load('src/components/browser-storage.ts');
const command=()=>({sessionId:session().id,actionId:'original-action-0001',sequence:1,priorStateHash:'a'.repeat(64),intent:{type:'DRAW_STOCK'}});
function client(fetcher,extra={}) {return new MonetaireMoveClient({fetcher,timeoutMs:30,createActionId:()=>command().actionId,...extra});}

test('wire: accepts a complete public session',()=>assert.equal(isServerGameSession(session()),true));
for(const [name,change] of Object.entries({foreignAuthority:{serverAuthoritative:false},badHash:{stateHash:'x'},fractionalSequence:{sequence:1.5},negativeTime:{verifiedActivePlayMs:-1},unknownClock:{activityClockStatus:'CLIENT'},incompleteBoard:{tableau:[]},missingCards:{stock:{remaining:23}},wrongWasteCount:{waste:{count:2,top:null}},malformedFoundations:{foundations:{}}})){
 test('wire: rejects '+name,()=>assert.equal(isServerGameSession(session(change)),false));
}
test('wire: rejects hidden identity disclosure',()=>{const s=session();s.tableau[1][0].id='secret';assert.equal(isServerGameSession(s),false);});
test('snapshots: rejects older, foreign and changed-rules boards',()=>{
 const current=afterDraw();
 for(const next of [session(),afterDraw(session({id:'other'})),{...current,rulesetVersion:'other'}]) assert.equal(canAdoptGameSnapshot(current,next),false);
});
test('snapshots: rejects same-sequence hash disagreement',()=>assert.equal(canAdoptGameSnapshot(session(),session({stateHash:'c'.repeat(64)})),false));
test('snapshots: does not roll back a fresher time observation',()=>assert.equal(canAdoptGameSnapshot(session(),session({serverObservedAtMs:1999})),false));
test('snapshots: accepts a later move',()=>assert.equal(canAdoptGameSnapshot(session(),afterDraw()),true));
test('snapshots: a terminal hand cannot reopen or change final time',()=>{
 const final=session({status:'ABANDONED',activityClockStatus:'FINALIZED'});
 assert.equal(canAdoptGameSnapshot(final,{...final,status:'ACTIVE'}),false);
 assert.equal(canAdoptGameSnapshot(final,{...final,verifiedActivePlayMs:9000}),false);
 assert.equal(canAdoptGameSnapshot(final,{...final,serverObservedAtMs:8000}),true);
});

test('recovery: lost accepted reply repeats the exact original body and applies once',async()=>{
 const bodies=[];const acceptedIds=new Set();let effects=0;
 const c=client(async(_,init)=>{
   bodies.push(init.body);const payload=JSON.parse(init.body);
   if(!acceptedIds.has(payload.actionId)){acceptedIds.add(payload.actionId);effects++;throw Error('reply lost AFTER acceptance');}
   return reply({accepted:true,idempotentReplay:true,currentSession:afterDraw()});
 });
 const result=await c.submit(session(),{type:'DRAW_STOCK'});
 assert.equal(result.kind,'confirmed');assert.equal(effects,1);assert.equal(bodies.length,2);
 assert.equal(bodies[0],bodies[1]);assert.equal(c.pending,null);assert.equal(c.busy,false);
});
test('recovery: no response retains the original and blocks a replacement action',async()=>{
 let calls=0;const c=client(async()=>{calls++;throw Error('offline');});
 assert.equal((await c.submit(session(),{type:'DRAW_STOCK'})).kind,'uncertain');
 const original=c.pending;
 assert.equal((await c.submit(session(),{type:'ABANDON'})).kind,'uncertain');
 assert.equal(calls,2);assert.equal(c.pending,original);assert.equal(original.intent.type,'DRAW_STOCK');
});
test('recovery: manual checking uses the original identifier and clears confirmed rejection',async()=>{
 let online=false;const bodies=[];const c=client(async(_,init)=>{bodies.push(init.body);if(!online)throw Error('offline');return reply({accepted:false,rejection:{code:'ILLEGAL_MOVE',message:'No legal move'},currentSession:session()},409);});
 await c.submit(session(),{type:'DRAW_STOCK'});online=true;
 const r=await c.recover(session());assert.equal(r.kind,'confirmed');assert.equal(r.accepted,false);assert.equal(r.message,'No legal move');
 assert.equal(new Set(bodies).size,1);assert.equal(c.pending,null);
});
test('recovery: survives a JSON round trip and new client instance',async()=>{
 const store=storage();const config={readPending:k=>store.getItem(k),writePending:(k,v)=>v===null?store.removeItem(k):store.setItem(k,v)};
 const first=client(async()=>{throw Error('lost');},config);await first.submit(session(),{type:'DRAW_STOCK'});
 const serialized=JSON.stringify(first.pending);let received;
 const second=client(async(_,init)=>{received=JSON.parse(init.body);return reply({accepted:true,currentSession:afterDraw()});},config);
 const r=await second.recover(session());assert.equal(r.kind,'confirmed');assert.equal(received.actionId,JSON.parse(serialized).actionId);assert.equal(store.entries.size,0);
});
test('recovery: terminal receipt can be recovered without issuing a new move',async()=>{
 const saved=command();saved.intent={type:'ABANDON'};
 const final=afterDraw();final.status='ABANDONED';final.activityClockStatus='FINALIZED';
 const c=client(async()=>reply({accepted:true,idempotentReplay:true,currentSession:final}),{readPending:()=>JSON.stringify(saved)});
 assert.equal((await c.recover(final)).kind,'confirmed');assert.equal(c.pending,null);
});
test('recovery: same-turn duplicate calls are serialized before an await',async()=>{
 let resolveFetch;let calls=0;const c=client(()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});});
 const first=c.submit(session(),{type:'DRAW_STOCK'});
 assert.equal((await c.submit(session(),{type:'DRAW_STOCK'})).kind,'busy');assert.equal(calls,1);
 resolveFetch(reply({accepted:true,currentSession:afterDraw()}));await first;
});
for(const status of [400,401,403,404,429]) test('recovery: HTTP '+status+' retains uncertainty without automatic repeated requests',async()=>{
 let calls=0;const c=client(async()=>{calls++;return reply({error:{message:'Access or request hold'}},status);});
 const r=await c.submit(session(),{type:'DRAW_STOCK'});assert.equal(r.kind,'uncertain');assert.equal(calls,1);assert.notEqual(c.pending,null);
});
for(const [name,body] of [['empty',{}],['foreign',{accepted:true,currentSession:afterDraw(session({id:'foreign'}))}],['malformed',{accepted:true,currentSession:{id:session().id}}],['noMoveAdvance',{accepted:true,currentSession:session()}]]){
 test('recovery: '+name+' response cannot clear an unresolved command',async()=>{
  const c=client(async()=>reply(body));assert.equal((await c.submit(session(),{type:'DRAW_STOCK'})).kind,'uncertain');assert.ok(c.pending);
 });
}
test('recovery: throws from optional storage do not prevent in-memory confirmation',async()=>{
 const c=client(async()=>reply({accepted:true,currentSession:afterDraw()}),{readPending:()=>{throw Error('denied');},writePending:()=>{throw Error('full');}});
 assert.equal((await c.submit(session(),{type:'DRAW_STOCK'})).kind,'confirmed');assert.equal(c.pending,null);
});
test('recovery: failed storage deletion does not resurrect a confirmed move in the same client',async()=>{
 const raw=JSON.stringify(command());const c=client(async()=>reply({accepted:true,currentSession:afterDraw()}),{readPending:()=>raw,writePending:()=>{throw Error('read only');}});
 await c.recover(session());assert.equal(c.restore(session().id),null);assert.equal(c.pending,null);
});
test('recovery: unmount cancellation preserves the original; later recovery still works',async()=>{
 let online=false;const c=client(async()=>online?reply({accepted:true,currentSession:afterDraw()}):new Promise(()=>{}));
 const running=c.submit(session(),{type:'DRAW_STOCK'});c.dispose();
 assert.equal((await running).kind,'uncertain');assert.ok(c.pending);assert.equal(c.busy,false);
 online=true;assert.equal((await c.recover(session())).kind,'confirmed');
});
test('recovery: caller mutation cannot change the saved payload',async()=>{
 const intent={type:'WASTE_TO_TABLEAU',toColumn:0};let release;
 const c=client(()=>new Promise(r=>{release=r;}));const running=c.submit(session(),intent);intent.toColumn=6;
 assert.equal(c.pending.intent.toColumn,0);assert.equal(Object.isFrozen(c.pending.intent),true);
 release(reply({accepted:false,rejection:{message:'not legal'},currentSession:session()},409));await running;
});

test('deadline: a hanging fetch releases the request and aborts the signal',async()=>{
 let signal;await assert.rejects(()=>requestGameJson('/test',{}, {timeoutMs:5,fetcher:(_,init)=>{signal=init.signal;return new Promise(()=>{});}}),GameRequestTimeout);assert.equal(signal.aborted,true);
});
test('deadline: a hanging JSON body is also bounded',async()=>{
 await assert.rejects(()=>requestGameJson('/test',{}, {timeoutMs:5,fetcher:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})}),GameRequestTimeout);
});
test('deadline: successful response is parsed and credentials remain same-origin',async()=>{
 const r=await requestGameJson('/test',{credentials:'omit'},{fetcher:async(_,init)=>{assert.equal(init.credentials,'same-origin');return reply({ok:true});}});assert.deepEqual(r.body,{ok:true});
});
test('deadline: pre-cancelled request performs no fetch',async()=>{
 const stop=new AbortController();stop.abort();let calls=0;
 await assert.rejects(()=>requestGameJson('/test',{}, {signal:stop.signal,fetcher:async()=>{calls++;return reply({});}}));assert.equal(calls,0);
});
test('journal: rejects malformed, foreign, oversized and invalid commands',()=>{
 for(const raw of ['{',JSON.stringify({...command(),sessionId:'wrong'}),JSON.stringify({...command(),sequence:0}),JSON.stringify({...command(),priorStateHash:'bad'}),JSON.stringify({...command(),intent:{type:'TICK'}}),'x'.repeat(5000)]) assert.equal(parsePendingMove(raw,session().id),null);
 assert.equal(pendingMoveKey(session().id),'monetaire.pending-move.v1:'+session().id);
});

test('display clock: advances through an idle interval without any move',()=>{
 const anchor=createDisplayClockAnchor(session(),500);assert.equal(displayElapsedMs(anchor,65_500),66_000);
});
test('display clock: monotonic timer is independent of the device wall clock',t=>{
 const anchor=createDisplayClockAnchor(session(),100);t.mock.method(Date,'now',()=>-1_000_000);assert.equal(displayElapsedMs(anchor,2100),3000);
});
test('display clock: paused, finalized and legacy observations do not extrapolate',()=>{
 for(const change of [{activityClockStatus:'PAUSED'},{activityClockStatus:'FINALIZED'},{activityClockStatus:undefined},{status:'WON'},{status:'ABANDONED'}]) assert.equal(displayElapsedMs(createDisplayClockAnchor(session(change),100),500_000),1000);
});
test('display clock: fresh server observation replaces the estimate; final time remains exact',()=>{
 const active=createDisplayClockAnchor(session(),100);assert.equal(displayElapsedMs(active,5100),6000);
 const final=createDisplayClockAnchor(session({status:'WON',verifiedActivePlayMs:5500,activityClockStatus:'FINALIZED'}),5100);assert.equal(displayElapsedMs(final,99999),5500);
});
test('display clock: nonmonotonic or invalid browser observations cannot subtract time',()=>{
 const anchor=createDisplayClockAnchor(session(),100);assert.equal(displayElapsedMs(anchor,0),1000);assert.equal(displayElapsedMs(anchor,NaN),1000);assert.throws(()=>createDisplayClockAnchor(session(),-1));
});
test('display clock: minutes and seconds format without wrapping an hour',()=>{assert.equal(formatGameTime(3_661_000),'61:01');assert.equal(formatGameTime(0),'00:00');});

test('input: keyboard and first pointer click select; repeated mouse clicks do not',()=>{assert.equal(isCardSelectionClick(0),true);assert.equal(isCardSelectionClick(1),true);assert.equal(isCardSelectionClick(2),false);assert.equal(isCardSelectionClick(3),false);});
test('input: draw shortcut excludes typing, composition, repeat and browser shortcuts',()=>{
 const event={key:'D',repeat:false,ctrlKey:false,metaKey:false,altKey:false,isComposing:false,targetTag:'BUTTON',contentEditable:false};assert.equal(isDrawShortcut(event),true);
 for(const change of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{targetTag:'input'},{targetTag:'TEXTAREA'},{targetTag:'SELECT'},{contentEditable:true},{key:'x'}]) assert.equal(isDrawShortcut({...event,...change}),false);
});
test('storage: server rendering does not require a window',()=>{assert.deepEqual(readBrowserStorage('localStorage','key'),{available:false,value:null});assert.equal(writeBrowserStorage('localStorage','key','x'),false);});
test('storage: denied property access, full stores and failed removal are contained',t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');t.after(()=>original?Object.defineProperty(globalThis,'window',original):delete globalThis.window);
 globalThis.window={get localStorage(){throw Error('blocked');}};
 assert.equal(readBrowserStorage('localStorage','key').available,false);assert.equal(writeBrowserStorage('localStorage','key','x'),false);
 globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{throw Error('full');},removeItem:()=>{throw Error('denied');}}};
 assert.equal(writeBrowserStorage('localStorage','key','x'),false);assert.equal(writeBrowserStorage('localStorage','key',null),false);
});
test('preferences: failed persistence still updates the current tab',t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'window');t.after(()=>old?Object.defineProperty(globalThis,'window',old):delete globalThis.window);
 const fakeWindow=new EventTarget();Object.defineProperty(fakeWindow,'localStorage',{get(){throw Error('blocked');}});globalThis.window=fakeWindow;
 const prefs=createLoader({react:{useSyncExternalStore:(_subscribe,get)=>get()}})('src/components/card-preferences.ts');
 assert.equal(prefs.useCardPreferences().front,'classic');prefs.saveCardPreferences({front:'midnight',back:'blueprint'});
 assert.deepEqual(prefs.useCardPreferences(),{front:'midnight',back:'blueprint'});assert.equal(prefs.useCardPreferences(),prefs.useCardPreferences());
});
test('preferences: front and back remain independent and invalid stored data is harmless',t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'window');t.after(()=>old?Object.defineProperty(globalThis,'window',old):delete globalThis.window);
 const store=storage();const fakeWindow=new EventTarget();fakeWindow.localStorage=store;globalThis.window=fakeWindow;
 store.setItem('monetaire.card-appearance.v1','broken JSON');
 const prefs=createLoader({react:{useSyncExternalStore:(_s,get)=>get()}})('src/components/card-preferences.ts');
 assert.equal(prefs.useCardPreferences().front,'classic');prefs.saveCardPreferences({front:'parchment',back:'shipyard'});
 assert.deepEqual(prefs.mergeCardPreferences(prefs.useCardPreferences(),{back:'blueprint'}),{front:'parchment',back:'blueprint'});
});
