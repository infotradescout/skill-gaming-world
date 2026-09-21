/** Actual candidate HTML and existing downloads, not native-engine acceptance. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]);
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  const p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  if(!p.startsWith(root+path.sep))throw Error('Outside root');
  const st=await fs.stat(p);if(!st.isFile())throw Error('Not a file');
  const types={'.html':'text/html','.png':'image/png','.json':'application/json','.cmd':'application/octet-stream'};
  res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Content-Length':st.size});
  if(req.method==='HEAD')return res.end();
  createReadStream(p).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;const checks=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(base,{waitUntil:'networkidle'});
 if(await page.locator('header a[href$=".blend"],header a[href$=".cmd"]').count())throw Error('Source still promoted');
 if(!await page.getByRole('heading',{name:'No playable Windows build is available yet'}).isVisible())throw Error('Missing delivery status');
 if(await page.locator('#build-tools').getAttribute('open')!==null || await page.locator('#source-files').getAttribute('open')!==null)throw Error('Development files must be collapsed');
 checks.push('No primary Blender or unverified Play action');
 await page.locator('#view').evaluate(img=>img.decode());
 await page.locator('#previous').click();await page.locator('#view').evaluate(img=>img.decode());
 await page.locator('#current').click();await page.locator('#view').evaluate(img=>img.decode());
 checks.push('Existing image comparison preserved');
 await page.setViewportSize({width:390,height:844});
 if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Horizontal overflow');
 checks.push('Mobile status visible without horizontal overflow');
 await page.locator('#build-tools summary').click();
 const script=await page.request.get(base+'/START-WILDLIFE.cmd');
 if(script.status()!==200 || createHash('sha256').update(await script.body()).digest('hex')!=='caa0ce7f823e13c53ab5cf4544a01fea29f48aeb8145c084cb7f54617db08ddf')throw Error('Existing build script changed');
 const entry=JSON.parse(await fs.readFile(path.join(root,'unreal01/windows-entry.json'),'utf8'));
 const release=await page.request.head(base+new URL(entry.kit_url).pathname);
 if(release.status()!==200 || Number(release.headers()['content-length'])!==entry.kit_bytes)throw Error('Pinned release unavailable');
 checks.push('Existing script and pinned source kit preserved, not replaced by .blend');
 await fs.mkdir(path.join(root,'delivery-review'),{recursive:true});
 await page.screenshot({path:path.join(root,'delivery-review/mobile.png'),fullPage:true});
 const report={scope:'Candidate download page only; no native build',passed:true,checks,native_compile:'not_run',windows_game:'not_built'};
 await fs.writeFile(path.join(root,'delivery-review/browser.json'),JSON.stringify(report,null,2));
 console.log('DELIVERY_BROWSER_VERIFIED '+JSON.stringify(report));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
