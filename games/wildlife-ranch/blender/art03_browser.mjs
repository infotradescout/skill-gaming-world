import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
const root=path.resolve(process.argv[2]);await fs.mkdir(path.join(root,'acceptance03'),{recursive:true});
const report={scope:'Exact candidate files before publication; not live CDN, game performance or visual approval',checks:[],errors:[],visualApproval:false};
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!p.startsWith(root+path.sep))throw Error();const st=await fs.stat(p);if(!st.isFile())throw Error();const types={'.html':'text/html','.json':'application/json','.png':'image/png','.js':'text/javascript'};res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Content-Length':st.size});if(req.method==='HEAD'){res.end();return}createReadStream(p).on('error',()=>res.destroy()).pipe(res)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1365,height:950}});
 const response=await page.goto(origin,{waitUntil:'networkidle'});if(response.status()!==200)throw Error('HTML failed');
 const receipt=await page.evaluate(async()=>{const r=await fetch('art03/art_receipt.json');return r.json()});report.sourceCommit=receipt.source_commit;
 if(!receipt.native_reopen_verified||!receipt.same_camera_verified)throw Error('Native scene not verified');report.checks.push('native reopen and unchanged camera receipt');
 for(const camera of ['approach_eye','shore_eye','porch_eye','district_overview']){
  await page.locator(`[data-view="${camera}"]`).click();await page.waitForFunction(c=>{const i=document.querySelector('#view');return i.complete&&i.naturalWidth===1280&&i.src.endsWith('art03/'+c+'.png')},camera);report.checks.push('native image decoded '+camera);
 }
 await page.locator('[data-view="approach_eye"]').click();await page.locator('#previous').click();await page.waitForFunction(()=>{const i=document.querySelector('#view');return i.complete&&i.naturalWidth===1280&&i.src.endsWith('district/approach_eye.png')});report.checks.push('rejected prior scene available without camera change');
 await page.locator('#current').click();await page.waitForFunction(()=>{const i=document.querySelector('#view');return i.complete&&i.naturalWidth===1280&&i.src.endsWith('art03/approach_eye.png')});
 await page.screenshot({path:path.join(root,'acceptance03/desktop.png'),fullPage:true});
 const jpeg=await page.locator('#view').evaluate(i=>{const c=document.createElement('canvas');c.width=768;c.height=432;c.getContext('2d').drawImage(i,0,0,768,432);return c.toDataURL('image/jpeg',.5).split(',')[1]});
 await fs.writeFile(path.join(root,'acceptance03/native-review.jpg'),Buffer.from(jpeg,'base64'));
 for(let i=0;i<jpeg.length;i+=3072)console.log('ART03_REVIEW_'+String(i/3072).padStart(3,'0')+' '+jpeg.slice(i,i+3072));
 await page.setViewportSize({width:390,height:844});if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Mobile overflow');await page.screenshot({path:path.join(root,'acceptance03/phone.png'),fullPage:true});report.checks.push('390px layout without horizontal overflow');
 const head=await page.request.head(origin+'/art03/Wildlife_Lodge_Shore_03.blend');if(head.status()!==200)throw Error('Native file unavailable');report.checks.push('native scene downloadable');
 report.passed=true;
}catch(e){report.passed=false;report.errors.push(e.message)}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
await fs.writeFile(path.join(root,'acceptance03/browser.json'),JSON.stringify(report,null,2));console.log('ART03_BROWSER_RESULT '+JSON.stringify(report));if(!report.passed)process.exitCode=1;
