'use strict';
const SUITS = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const RANKS = ['ACE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','JACK','QUEEN','KING'];
const deck = SUITS.flatMap(suit => RANKS.map(rank => ({id:suit+'_'+rank, suit, rank})));
function session(change={}) {
  let index=0;
  const tableau=Array.from({length:7},(_,c)=>Array.from({length:c+1},(_,i)=>{
    const card=deck[index++];
    return i===c ? {...card,faceUp:true} : {id:null,rank:null,suit:null,faceUp:false};
  }));
  return {
    id:'test-game-00000001',mode:'PRACTICE',rulesetVersion:'DRAW3_FIXTURE_V1',
    dealGeneratorVersion:'FIXTURE_GENERATOR_V1',dealCommitment:'fixture-only-commitment',
    stateHash:'a'.repeat(64),status:'ACTIVE',sequence:0,validMoveCount:0,
    verifiedActivePlayMs:1000,serverObservedAtMs:2000,activityClockStatus:'RUNNING',
    stock:{remaining:24},waste:{count:0,top:null},tableau,
    foundations:Object.fromEntries(SUITS.map(s=>[s,{count:0,top:null}])),serverAuthoritative:true,
    ...change,
  };
}
function afterDraw(before=session()) {
  return {...before,sequence:before.sequence+1,validMoveCount:before.validMoveCount+1,
    stateHash:'b'.repeat(64),stock:{remaining:before.stock.remaining-3},
    waste:{count:before.waste.count+3,top:deck[30]},
    serverObservedAtMs:before.serverObservedAtMs+100,verifiedActivePlayMs:before.verifiedActivePlayMs+100};
}
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const storage=()=>{
  const entries=new Map();
  return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
};
module.exports={session,afterDraw,reply,storage,deck,SUITS};
