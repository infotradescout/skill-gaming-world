/** Actual native assets only. Candidate mode is a temporary loopback server in
 * the disposable builder, not an additional hosted service or mock backend. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
const root=path.resolve(process.argv[2]);
await fs.mkdir(root,{recursive:true});
const candidate=process.env.WILDLIFE_CANDIDATE_DIR;
let server,origin='https://wildlife-reserve-world-preview.onrender.com';
if(candidate){
 const base=path.resolve(candidate);
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   const filename=path.resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!filename.startsWith(base+path.sep))throw Error('Outside preview');
   const st=await fs.stat(filename);if(!st.isFile())throw Error('Not a file');
   const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary'};
   res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Content-Length':st.size});
   createReadStream(filename).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
}
const report={scope:candidate?'Exact built candidate assets in Chromium before static publication; not a live-CDN or game-performance claim':'Live hosted browser acceptance',origin,checks:[],errors:[],diagnosticWarnings:[]};
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.setDefaultTimeout(20000);
 const res=await page.goto(origin,{waitUntil:'networkidle',timeout:90000});
 if(res.status()!==200)throw Error('Preview HTTP '+res.status());report.checks.push('HTML 200');
 const receipt=await page.evaluate(async()=>{const r=await fetch('district/district_receipt.json');if(!r.ok)throw Error('receipt unavailable');return r.json();});
 if(!receipt.native_reopen_verified)throw Error('Native reopen not verified');
 report.assetSourceCommit=receipt.source_commit;report.artRevision=receipt.revision;
 await page.addStyleTag({content:'html,body,*{scroll-behavior:auto!important;animation:none!important;transition:none!important}'});
 for(const name of ['approach_eye','shore_eye','porch_eye','district_overview']){
  await page.locator(`[data-view="${name}"]`).click();
  await page.waitForFunction(n=>{const i=document.querySelector('#nativeView');return i.complete&&i.naturalWidth===1280&&i.src.endsWith(n+'.png')},name,{timeout:60000});
  report.checks.push('native view loaded '+name);
 }
 await page.locator('[data-view="approach_eye"]').click();await page.locator('#nativeView').evaluate(el=>el.decode());
 await page.screenshot({path:path.join(root,'desktop.png'),fullPage:true});
 const data=await page.locator('#nativeView').evaluate(i=>{const c=document.createElement('canvas');c.width=512;c.height=288;c.getContext('2d').drawImage(i,0,0,512,288);return c.toDataURL('image/jpeg',.24).split(',')[1]});
 await fs.writeFile(path.join(root,'native-approach-review.jpg'),Buffer.from(data,'base64'));
 for(let i=0;i<data.length;i+=4096)console.log('NATIVE_CORRECTION_JPEG_'+String(i/4096).padStart(2,'0')+' '+data.slice(i,i+4096));
 await page.setViewportSize({width:390,height:844});
 if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Mobile horizontal overflow');
 report.checks.push('390px viewport no horizontal overflow');
 await page.screenshot({path:path.join(root,'phone.png'),fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#openViewer').click();
 await page.waitForFunction(()=>document.querySelector('#model').loaded===true,null,{timeout:150000});
 report.checks.push('actual exported GLB loaded by model-viewer');
 await page.locator('#resetCamera').click({timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#model').cameraOrbit==='-125deg 78deg 75m');
 report.checks.push('3D reset action applied');
 // A bounded page capture does not wait on changing model-element bounds.
 try{await page.screenshot({path:path.join(root,'3d.png'),timeout:20000});}
 catch(e){report.diagnosticWarnings.push('3D capture unavailable: '+e.message);}
 await page.locator('#closeViewer').click({timeout:30000});
 if(!await page.locator('#viewerArea').isHidden())throw Error('Viewer close failed');
 if(await page.locator('#model').getAttribute('src'))throw Error('Model remains attached after close');
 report.checks.push('3D close hides viewer and detaches model source');
}catch(e){report.errors.push(e.message);}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
report.passed=report.errors.length===0;
await fs.writeFile(path.join(root,'browser_acceptance.json'),JSON.stringify(report,null,2));
console.log('NATIVE_BROWSER_ACCEPTANCE '+JSON.stringify(report));
// Preserve the report even if a device/GLB check fails; do not call it a pass.
