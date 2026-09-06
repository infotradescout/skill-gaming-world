'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createLoader}=require('../tools/monetaire-test-loader.cjs');
const {session,afterDraw,reply,storage,deck}=require('./monetaire-fixtures.cjs');

// A deliberately small hook/JSX double executes the actual board handlers.
// It does not simulate DOM layout, browser event delivery, React scheduling,
// hydration, focus, drag physics, accessibility APIs, or touch devices.
function boardHarness(t,props,fetcher,{denyStorage=false}={}) {
 const globals=['window','fetch','HTMLElement'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 const local=storage(),tab=storage();const fakeWindow=new EventTarget();
 if(denyStorage){Object.defineProperty(fakeWindow,'localStorage',{get(){throw Error('blocked');}});Object.defineProperty(fakeWindow,'sessionStorage',{get(){throw Error('blocked');}});}
 else {fakeWindow.localStorage=local;fakeWindow.sessionStorage=tab;}
 fakeWindow.setInterval=setInterval;fakeWindow.clearInterval=clearInterval;
 globalThis.window=fakeWindow;globalThis.fetch=fetcher;
 globalThis.HTMLElement=class {constructor(tag='BUTTON'){this.tagName=tag;this.isContentEditable=false;}};
 let hooks=[],cursor=0,effects=[],dirty=false,tree;
 const react={
  useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return [hooks[i].value,action=>{const value=typeof action==='function'?action(hooks[i].value):action;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];},
  useRef(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:{current:initial}};return hooks[i].value;},
  useEffect(callback,deps){const i=cursor++;const old=hooks[i];if(!old||!deps||!old.deps||deps.some((d,j)=>!Object.is(d,old.deps[j]))){effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:callback()};});}},
  useSyncExternalStore(_subscribe,getSnapshot){return getSnapshot();},
 };
 const element=(type,props,key)=>({type,props:props??{},key});
 const load=createLoader({react,'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'fragment'}});
 const {SolitaireBoard}=load('src/components/solitaire-board.tsx');
 function render(){let count=0;do{dirty=false;cursor=0;effects=[];tree=SolitaireBoard(props);for(const run of effects)run();if(++count>15)throw Error('Harness render loop');}while(dirty);return tree;}
 function all(node=tree,out=[]){if(Array.isArray(node)){node.forEach(n=>all(n,out));return out;}if(node&&typeof node==='object'){out.push(node);if(node.props?.children!==undefined)all(node.props.children,out);}return out;}
 function text(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join('');if(typeof node==='object')return text(node.props?.children);return String(node);}
 function button(label){const found=all().find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n).trim()===label));assert.ok(found,'Missing button '+label);return found;}
 function byLabel(prefix){const found=all().find(n=>n.type==='button'&&String(n.props['aria-label']).startsWith(prefix));assert.ok(found,'Missing prefix '+prefix);return found;}
 function section(){return all().find(n=>n.type==='section');}
 async function settle(){await new Promise(setImmediate);render();}
 function unmount(){for(const hook of hooks)hook.cleanup?.();}
 t.after(()=>{unmount();for(const [key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 render();return {render,button,byLabel,section,settle,unmount,local,tab,text:()=>text(tree),all};
}
const click=detail=>({detail});

test('board handler: a lost reply exposes recovery and locks new moves, then original recovery unlocks',async t=>{
 let online=false;const bodies=[];const before=session();
 const h=boardHarness(t,{initialSession:before},async(_,init)=>{bodies.push(init.body);if(!online)throw Error('offline');return reply({accepted:true,currentSession:afterDraw(before)});});
 h.byLabel('Draw from stock').props.onClick();await h.settle();
 assert.equal(bodies.length,2);assert.equal(h.button('Check saved move').props.disabled,false);assert.equal(h.byLabel('Draw from stock').props.disabled,true);
 online=true;h.button('Check saved move').props.onClick();await h.settle();
 assert.equal(new Set(bodies).size,1);assert.equal(bodies.length,3);assert.equal(h.byLabel('Draw from stock').props.disabled,false);assert.equal(h.all().some(n=>n.type==='button'&&n.props.children==='Check saved move'),false);
});
test('board handler: two stock activations before rerender submit once',async t=>{
 let calls=0;const before=session();const h=boardHarness(t,{initialSession:before},async()=>{calls++;return reply({accepted:true,currentSession:afterDraw(before)});});
 const button=h.byLabel('Draw from stock');button.props.onClick();button.props.onClick();await h.settle();assert.equal(calls,1);
});
test('board handler: keyboard activation selects the waste and sends the intended destination',async t=>{
 const before=afterDraw();const sent=[];const h=boardHarness(t,{initialSession:before},async(_,init)=>{sent.push(JSON.parse(init.body));return reply({accepted:false,rejection:{message:'fixture rejection'},currentSession:before},409);});
 h.byLabel('Waste ').props.onClick(click(0));h.render();assert.match(h.text(),/Selected/);
 h.byLabel('A♣, tableau pile 1').props.onClick(click(0));await h.settle();assert.equal(sent.length,1);assert.deepEqual(sent[0].intent,{type:'WASTE_TO_TABLEAU',toColumn:0});
});
test('board handler: keyboard activation can select a tableau card',t=>{
 const h=boardHarness(t,{initialSession:session()},async()=>{throw Error('not expected');});
 h.byLabel('A♣, tableau pile 1').props.onClick(click(0));h.render();assert.match(h.text(),/Selected A♣/);
});
test('board handler: selecting the same tableau source again clears selection without a self-move',t=>{
 let calls=0;const h=boardHarness(t,{initialSession:session()},async()=>{calls++;return reply({});});
 h.byLabel('A♣, tableau pile 1').props.onClick(click(1));h.render();h.byLabel('A♣, tableau pile 1').props.onClick(click(1));h.render();assert.match(h.text(),/Selection cleared/);assert.equal(calls,0);
});
test('board handler: double-click source sends one foundation command',async t=>{
 const before=session();let sent=[];const h=boardHarness(t,{initialSession:before},async(_,init)=>{sent.push(JSON.parse(init.body));return reply({accepted:false,rejection:{message:'fixture rejection'},currentSession:before},409);});
 h.byLabel('A♣, tableau pile 1').props.onClick(click(1));h.render();const card=h.byLabel('A♣, tableau pile 1');card.props.onClick(click(2));card.props.onDoubleClick();await h.settle();
 assert.equal(sent.length,1);assert.deepEqual(sent[0].intent,{type:'TABLEAU_TO_FOUNDATION',fromColumn:0});
});
test('board handler: a destination click cannot become a second foundation move on double-click',async t=>{
 const before=afterDraw();let calls=0;const h=boardHarness(t,{initialSession:before},async()=>{calls++;return reply({accepted:false,rejection:{message:'fixture rejection'},currentSession:before},409);});
 h.byLabel('Waste ').props.onClick(click(1));h.render();const dest=h.byLabel('A♣, tableau pile 1');dest.props.onClick(click(1));await h.settle();h.byLabel('A♣, tableau pile 1').props.onDoubleClick();await h.settle();assert.equal(calls,1);
});
test('board handler: wrong-suit foundation selection does not send a misleading move',async t=>{
 let calls=0;const h=boardHarness(t,{initialSession:afterDraw()},async()=>{calls++;return reply({});});h.byLabel('Waste ').props.onClick(click(0));h.render();h.button('Empty ♠ foundation').props.onClick();await h.settle();assert.equal(calls,0);assert.match(h.text(),/same suit/);
});
test('board handler: draw shortcut ignores browser modifier keys and works without them',async t=>{
 const before=session();let calls=0;const h=boardHarness(t,{initialSession:before},async()=>{calls++;return reply({accepted:true,currentSession:afterDraw(before)});});
 const event={key:'d',repeat:false,ctrlKey:true,metaKey:false,altKey:false,nativeEvent:{isComposing:false},target:new HTMLElement(),preventDefault(){}};
 h.section().props.onKeyDown(event);assert.equal(calls,0);h.section().props.onKeyDown({...event,ctrlKey:false});await h.settle();assert.equal(calls,1);
});
test('board handler: storage denial still resumes a server-held hand without creating one',async t=>{
 const calls=[];const h=boardHarness(t,{},async(url,init)=>{calls.push([url,init.method??'GET']);return reply({sessions:[session()]});},{denyStorage:true});
 h.button('Start or resume').props.onClick();await h.settle();assert.deepEqual(calls,[['/api/game/sessions','GET']]);assert.ok(h.byLabel('Draw from stock'));
});
test('board handler: storage denial cannot discard a successfully created server session',async t=>{
 const calls=[];const h=boardHarness(t,{},async(url,init)=>{calls.push(init.method??'GET');return init.method==='POST'?reply({session:session()},201):reply({sessions:[]});},{denyStorage:true});
 h.button('Start or resume').props.onClick();await h.settle();assert.deepEqual(calls,['GET','POST']);assert.ok(h.byLabel('Draw from stock'));
});
test('board handler: failed saved-hand authorization preserves its ID and does not create another',async t=>{
 const calls=[];const h=boardHarness(t,{},async(url,init)=>{calls.push(init.method??'GET');return reply({error:{message:'Sign in to continue.'}},401);});
 h.local.setItem('monetaire.practice.session-id','saved-id');h.button('Start or resume').props.onClick();await h.settle();assert.deepEqual(calls,['GET']);assert.equal(h.local.getItem('monetaire.practice.session-id'),'saved-id');assert.match(h.text(),/Sign in to continue/);
});
test('board handler: an explicit missing session is not silently replaced with a new practice',async t=>{
 let calls=0;const h=boardHarness(t,{resumeSessionId:'missing-explicit'},async()=>{calls++;return reply({error:{message:'Game session was not found.'}},404);});
 h.button('Start or resume').props.onClick();await h.settle();assert.equal(calls,1);assert.match(h.text(),/not found/);
});
test('board handler: a restored unresolved command is shown before another move is sent',async t=>{
 let calls=0;const h=boardHarness(t,{},async(url)=>{calls++;return reply({session:session()});});
 h.local.setItem('monetaire.practice.session-id',session().id);
 h.tab.setItem('monetaire.pending-move.v1:'+session().id,JSON.stringify({sessionId:session().id,actionId:'saved-action-0001',sequence:1,priorStateHash:'a'.repeat(64),intent:{type:'DRAW_STOCK'}}));
 h.button('Start or resume').props.onClick();await h.settle();assert.equal(calls,1);assert.ok(h.button('Check saved move'));assert.equal(h.byLabel('Draw from stock').props.disabled,true);
});
test('board handler: dragging preserves source and dispatches the selected destination once',async t=>{
 const before=session();const sent=[];const h=boardHarness(t,{initialSession:before},async(_,init)=>{sent.push(JSON.parse(init.body));return reply({accepted:false,rejection:{message:'fixture rejection'},currentSession:before},409);});
 const drag={preventDefault(){},dataTransfer:{effectAllowed:'',setData(){}}};h.byLabel('A♣, tableau pile 1').props.onDragStart(drag);h.render();const dest=h.byLabel('2♥, tableau pile 7');dest.props.onDrop({preventDefault(){}});dest.props.onDrop({preventDefault(){}});await h.settle();assert.equal(sent.length,1);assert.deepEqual(sent[0].intent,{type:'TABLEAU_TO_TABLEAU',fromColumn:0,startIndex:0,toColumn:6});
});

test('board handler: leaving while saved hands load cannot start a new game afterward',async t=>{
 let complete;let requests=0;const h=boardHarness(t,{},async(_url,init)=>{requests++;return new Promise(resolve=>{complete=resolve;});});
 h.button('Start or resume').props.onClick();h.unmount();complete(reply({sessions:[]}));await h.settle();assert.equal(requests,1);
});
test('board handler: an unreadable saved-hand reply does not delete its ID or start another game',async t=>{
 let requests=0;const h=boardHarness(t,{},async()=>{requests++;return {ok:true,status:200,json:async()=>{throw Error('invalid body');}};});
 h.local.setItem('monetaire.practice.session-id','original-saved-hand');h.button('Start or resume').props.onClick();await h.settle();assert.equal(requests,1);assert.equal(h.local.getItem('monetaire.practice.session-id'),'original-saved-hand');
});
