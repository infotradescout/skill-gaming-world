/** Acceptance against the real published native artifacts. No synthetic model data. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2],origin='https://wildlife-reserve-world-preview.onrender.com';
const report={scope:'Hosted browser and native-image acceptance; not native game performance or final art approval',origin,assetSourceCommit:'9f92ad7f5aaa5946827e61f9137d63f74af8d4e7',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const res=await page.goto(origin,{waitUntil:'networkidle',timeout:90000});
 if(res.status()!==200)throw Error('Preview HTTP '+res.status());report.checks.push('public HTML 200');
 await page.locator('#nativeView').evaluate(el=>el.decode());
 for(const name of ['approach_eye','shore_eye','porch_eye','district_overview']){
  await page.locator(`[data-view="${name}"]`).click();
  await page.waitForFunction(n=>{const i=document.querySelector('#nativeView');return i.complete&&i.naturalWidth===1280&&i.src.endsWith(n+'.png')},name,{timeout:60000});
  report.checks.push('native view loaded '+name);
 }
 await page.locator('[data-view="approach_eye"]').click();await page.locator('#nativeView').evaluate(el=>el.decode());
 await page.screenshot({path:path.join(root,'hosted-desktop.png'),fullPage:true});
 // Compact diagnostic copy of the actual native PNG for remote visual inspection.
 const data=await page.locator('#nativeView').evaluate(i=>{const c=document.createElement('canvas');c.width=512;c.height=288;c.getContext('2d').drawImage(i,0,0,512,288);return c.toDataURL('image/jpeg',.40).split(',')[1]});
 await fs.writeFile(path.join(root,'native-approach-review.jpg'),Buffer.from(data,'base64'));
 for(let i=0;i<data.length;i+=4096)console.log('NATIVE_REVIEW_JPEG_'+String(i/4096).padStart(2,'0')+' '+data.slice(i,i+4096));
 await page.setViewportSize({width:390,height:844});
 if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Mobile horizontal overflow');
 report.checks.push('390px viewport no horizontal overflow');
 await page.screenshot({path:path.join(root,'hosted-phone.png'),fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#openViewer').click();
 try{
  await page.waitForFunction(()=>document.querySelector('#model').loaded===true,null,{timeout:150000});
  report.checks.push('real 64MB GLB loaded by model-viewer');
  await page.locator('#model').screenshot({path:path.join(root,'hosted-3d.png'),timeout:90000});
  await page.locator('#resetCamera').click();
  await page.locator('#closeViewer').click();
  if(!await page.locator('#viewerArea').isHidden())throw Error('Viewer close failed');
  report.checks.push('3D reset and close');
 }catch(e){report.errors.push('3D: '+e.message);}
}catch(e){report.errors.push(e.message);}
finally{await browser.close();}
report.passed=report.errors.length===0;
await fs.writeFile(path.join(root,'hosted_acceptance.json'),JSON.stringify(report,null,2));
console.log('HOSTED_ACCEPTANCE '+JSON.stringify(report));
