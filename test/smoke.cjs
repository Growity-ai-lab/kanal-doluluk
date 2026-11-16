const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const XLSX=require('../public/xlsx.full.min.js');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'kanal-test-'));
const env={...process.env,PORT:'18357',DATA_DIR:data,ADMIN_PASSWORD:'test-admin-01234567890',TEAM_PASSWORD:'test-viewer-01234567890',INGEST_TOKEN:'test-ingest-01234567890',SNAPSHOT_KEEP:'3'};
const basic=(u,p)=>'Basic '+Buffer.from(u+':'+p).toString('base64');
const admin=basic('admin',env.ADMIN_PASSWORD),viewer=basic('time',env.TEAM_PASSWORD),bot='Bearer '+env.INGEST_TOKEN;
const req=(p,auth,options={})=>fetch('http://localhost:18357'+p,{...options,headers:{...options.headers,...(auth?{Authorization:auth}:{})}});
const headers=['MEDYA','Y.ANA SEKTÖR','Y.SEKTÖR','REKLAMIN FİRMASI','ÜRÜN TÜRÜ','MARKA','TARİH','SPOT TİPİ','SPOT TİPİ D.','BAŞLANGIÇ','BİTİŞ','SÜRE'];
function book(dates,duration){
 const w=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([headers,...dates.map(d=>['Atv','Gıda','Gıda','Örnek','Ürün','Marka',d,'Normal Spot','Kusak Spot','18:00:00','18:00:30',duration])]));
 return XLSX.write(w,{type:'buffer',bookType:'xlsx'});
}
let proc;
async function start(){
 proc=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env,stdio:'inherit'});
 for(let i=0;i<50;i++){try{if((await req('/healthz')).ok)return;}catch{} await new Promise(r=>setTimeout(r,80));}
 throw Error('Server did not start');
}
async function stop(){if(proc&&proc.exitCode===null&&proc.signalCode===null){proc.kill();await once(proc,'exit');}}
const post=(p,auth,body,header=true)=>req(p,auth,{method:'POST',body,headers:header?{'X-Panel-Request':'1'}:{}});
(async()=>{
 await start();
 assert.equal((await req('/')).status,401);
 assert.equal((await req('/api/state')).status,401);
 assert.equal((await req('/api/state',bot)).status,401);
 assert.equal((await req('/',viewer)).status,200);
 assert.equal((await req('/worker.js',viewer)).status,200);
 assert.equal((await (await req('/api/session',viewer)).json()).admin,false);
 assert.equal((await (await req('/api/session',admin)).json()).admin,true);
 const one=book(['2026-11-12'],30);
 assert.equal((await post('/api/import',viewer,one)).status,403);
 assert.equal((await post('/api/import',admin,one,false)).status,403);
 let response=await post('/api/import',admin,one);
 assert.equal(response.status,200,await response.clone().text());
 const url='/api/import?start=2026-11-13&end=2026-11-15';
 assert.equal((await post(url,bot,book(['2026-11-13'],30),false)).status,400);
 assert.equal((await post(url,bot,book(['2026-11-13','2026-11-14','2026-11-16'],30),false)).status,400);
 const weekend=['2026-11-13','2026-11-14','2026-11-15'];
 assert.equal((await post(url,bot,book(weekend,30),false)).status,200);
 assert.equal((await post(url,bot,book(weekend,45),false)).status,200);
 assert.equal((await post('/api/rules',viewer,'{}')).status,403);
 // Arayuzdeki yukleme modlari sunucunun kabul ettigi degerlerle ayni olmali (merge hatasi regresyonu).
 const html=fs.readFileSync(path.resolve(__dirname,'../public/index.html'),'utf8');
 const modes=[...html.match(/<select id="mode">([\s\S]*?)<\/select>/)[1].matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(modes,['append','replace']);
 response=await post('/api/import?mode=append&start=&end=&complete=0',admin,book(['2026-11-12'],30));
 assert.equal(response.status,200,await response.clone().text());
 assert.equal((await post('/api/import?mode=merge',admin,one)).status,400);
 assert.equal((await post('/api/rules',admin,JSON.stringify({rules:{'Normal Spot|Kusak Spot':'include'},expectedChannels:['Atv','Kanal D']}))).status,200);
 assert.equal((await post('/api/rules',admin,JSON.stringify({rules:{'Normal Spot|Kusak Spot':'include'},confirmed:true}))).status,400);
 // Beklenen kanal dosyada yoksa uyari doner
 response=await post(url,bot,book(weekend,45),false);
 assert.deepEqual((await response.json()).missingChannels,['Kanal D']);
 await stop();await start();
 const state=await (await req('/api/state',viewer)).json();
 assert.equal(state.rows.length,4);
 assert.deepEqual(state.rows.map(r=>r[11]),[30,45,45,45]);
 assert.equal(state.confirmed,undefined);
 assert.deepEqual(state.expectedChannels,['Atv','Kanal D']);
 // Otomatik aktarim kanal-gun bazinda dogrular; panelden 'eksiksiz' isaretsiz eklenen gun dogrulanmaz
 assert.deepEqual([...state.verified].sort(),weekend.map(d=>'Atv|'+d));
 assert.ok(state.coverage.includes('Atv|2026-11-12'));
 response=await post('/api/import?mode=append&start=&end=&complete=1',admin,book(['2026-11-12'],30));
 assert.equal(response.status,200,await response.clone().text());
 assert.ok((await (await req('/api/state',viewer)).json()).verified.includes('Atv|2026-11-12'));
 // Dogrulanmis gunler, ayni araligin dogrulanmamis yenilemesiyle dogrulugunu kaybeder
 response=await post('/api/import?mode=replace&start=2026-11-12&end=2026-11-12&complete=0',admin,book(['2026-11-12'],30));
 assert.equal(response.status,200,await response.clone().text());
 assert.ok(!(await (await req('/api/state',viewer)).json()).verified.includes('Atv|2026-11-12'));
 // Anlik goruntuler: yalniz admin gorur, son SNAPSHOT_KEEP adet saklanir, geri yuklenebilir
 assert.equal((await req('/api/snapshots',viewer)).status,403);
 let snaps=(await (await req('/api/snapshots',admin)).json()).snapshots;
 assert.equal(snaps.length,3);
 const oldest=snaps[snaps.length-1];
 const onDisk=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(data,'snapshots',oldest.name))));
 assert.equal((await post('/api/restore?name='+oldest.name,viewer,'')).status,403);
 assert.equal((await post('/api/restore?name=../archive.json.gz',admin,'')).status,404);
 assert.equal((await post('/api/restore?name=20200101T000000000Z-import-append.json.gz',admin,'')).status,404);
 assert.equal((await post('/api/restore?name='+oldest.name,admin,'')).status,200);
 const restoredState=await (await req('/api/state',viewer)).json();
 assert.equal(restoredState.rows.length,onDisk.rows.length);
 assert.equal((await (await req('/api/snapshots',admin)).json()).snapshots[0].reason,'restore');
 // Basarisiz iceri aktarma anlik goruntu olusturmaz
 const before=(await (await req('/api/snapshots',admin)).json()).snapshots[0].name;
 assert.equal((await post('/api/import?mode=bogus',admin,one)).status,400);
 assert.equal((await (await req('/api/snapshots',admin)).json()).snapshots[0].name,before);
 if(process.env.TEST_ADEX_XLSX){
   const sample=await post('/api/import',admin,fs.readFileSync(process.env.TEST_ADEX_XLSX));
   assert.equal(sample.status,200,await sample.clone().text());
   console.log('OK: supplied ADEX workbook accepted.');
 }
 console.log('OK: access controls, Excel import, Monday date validation, replacement, rules, persistence after restart.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();fs.rmSync(data,{recursive:true,force:true});});
