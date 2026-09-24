import {chromium} from '@playwright/test';
import crypto from 'node:crypto';
const origin='https://wildlife-reserve-world-preview.onrender.com';
const expected='5529248ebb899ba10ce36e4fa7021f343edcd216';
const report={scope:'Read-only live static publication check; no new render or art acceptance',expectedSource:expected,checks:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(origin,{waitUntil:'networkidle',timeout:60000});
 const r=await page.request.get(origin+'/art03/art_receipt.json');if(!r.ok())throw Error('Receipt unavailable');const receipt=await r.json();if(receipt.source_commit!==expected||!receipt.native_reopen_verified)throw Error('Wrong native source');report.checks.push('live source and native reopen receipt');
 for(const name of ['approach_eye','shore_eye','porch_eye','district_overview']){
  const response=await page.request.get(origin+'/art03/'+name+'.png');if(!response.ok())throw Error(name+' unavailable');const bytes=await response.body();if(crypto.createHash('sha256').update(bytes).digest('hex')!==receipt.files[name+'.png'].sha256)throw Error('Changed live image '+name);report.checks.push('live image hash '+name);
 }
 await page.locator('#view').evaluate(i=>i.decode());
 const thumb=await page.locator('#view').evaluate(i=>{const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(i,0,0,320,180);return c.toDataURL('image/jpeg',.18).split(',')[1]});
 console.log('ART03_THUMB_BYTES '+Buffer.from(thumb,'base64').length);
 for(let i=0;i<thumb.length;i+=2048)console.log('ART03_THUMB_'+String(i/2048).padStart(2,'0')+' '+thumb.slice(i,i+2048));
 await page.locator('#previous').click();await page.waitForFunction(()=>{const i=document.querySelector('#view');return i.complete&&i.naturalWidth===1280&&i.src.endsWith('district/approach_eye.png')});await page.locator('#current').click();await page.waitForFunction(()=>{const i=document.querySelector('#view');return i.complete&&i.naturalWidth===1280&&i.src.endsWith('art03/approach_eye.png')});report.checks.push('live before-after toggle');
 await page.setViewportSize({width:390,height:844});if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Live mobile overflow');report.checks.push('live 390px layout');
 const native=await page.request.head(origin+'/art03/Wildlife_Lodge_Shore_03.blend');if(!native.ok())throw Error('Native download missing');report.checks.push('live native file available');report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}finally{await browser.close()}
console.log('ART03_LIVE_REVIEW '+JSON.stringify(report));
