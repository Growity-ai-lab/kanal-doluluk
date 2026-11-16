const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const XLSX=require('../public/xlsx.full.min.js');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'kanal-test-'));
const env={...process.env,PORT:'18357',DATA_DIR:data,ADMIN_PASSWORD:'test-admin-01234567890',INGEST_TOKEN:'test-ingest-01234567890',SNAPSHOT_KEEP:'3',LOGIN_MAX_FAILS:'4',RETENTION_DAYS:'30'};
let admin='',viewer='';const bot='Bearer '+env.INGEST_TOKEN;
const authHeader=a=>!a?{}:/^(Bearer|Basic) /.test(a)?{Authorization:a}:{Cookie:a};
const req=(p,auth,options={})=>fetch('http://localhost:18357'+p,{...options,headers:{...options.headers,...authHeader(auth)}});
const login=(username,password,header=true)=>req('/api/login',null,{method:'POST',body:JSON.stringify({username,password}),headers:header?{'X-Panel-Request':'1'}:{}});
const cookieOf=r=>r.headers.get('set-cookie').split(';')[0];
const VIEWER_PASS='ayse-parola-12345';
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
 const anon=await req('/',null,{redirect:'manual'});
 assert.equal(anon.status,302);assert.equal(anon.headers.get('location'),'/login');
 assert.equal((await req('/login')).status,200);
 assert.equal((await req('/worker.js',null,{redirect:'manual'})).status,302);
 assert.equal((await req('/api/state')).status,401);
 assert.equal((await req('/api/state',bot)).status,401);
 assert.equal((await req('/api/state','Basic '+Buffer.from('admin:'+env.ADMIN_PASSWORD).toString('base64'))).status,401);
 // Giris: baslik zorunlu, hatali sifre ve bilinmeyen kullanici ayni mesaj
 assert.equal((await login('admin',env.ADMIN_PASSWORD,false)).status,403);
 const wrong=await login('admin','yanlis-sifre-123456789'),ghost1=await login('yok.kullanici','yanlis-sifre-123456789');
 assert.equal(wrong.status,401);assert.equal(ghost1.status,401);
 assert.equal((await wrong.json()).error,(await ghost1.json()).error);
 const adminLogin=await login('admin',env.ADMIN_PASSWORD);
 assert.equal(adminLogin.status,200);
 const setCookie=adminLogin.headers.get('set-cookie');
 assert.ok(/HttpOnly/.test(setCookie)&&/SameSite=Strict/.test(setCookie));
 admin=cookieOf(adminLogin);
 // Kisi hesaplari yalniz yonetici tarafindan olusturulur
 const mk=(o)=>post('/api/users',admin,JSON.stringify(o));
 assert.equal((await mk({op:'create',username:'ayse.yilmaz',password:'kisa',role:'viewer'})).status,400);
 assert.equal((await mk({op:'create',username:'admin',password:VIEWER_PASS,role:'viewer'})).status,400);
 assert.equal((await mk({op:'create',username:'Ayse Yilmaz',password:VIEWER_PASS,role:'viewer'})).status,400);
 assert.equal((await mk({op:'create',username:'ayse.yilmaz',password:VIEWER_PASS,role:'viewer'})).status,200);
 assert.equal((await mk({op:'create',username:'ayse.yilmaz',password:VIEWER_PASS,role:'viewer'})).status,409);
 viewer=cookieOf(await login('ayse.yilmaz',VIEWER_PASS));
 assert.equal((await post('/api/users',viewer,JSON.stringify({op:'create',username:'ali.veli',password:VIEWER_PASS,role:'admin'}))).status,403);
 assert.equal((await req('/api/users',viewer)).status,403);
 assert.equal((await post('/api/users',admin,JSON.stringify({op:'create',username:'ali.veli',password:VIEWER_PASS,role:'admin'}),false)).status,403);
 assert.equal((await req('/',viewer)).status,200);
 assert.equal((await req('/worker.js',viewer)).status,200);
 assert.deepEqual(await (await req('/api/session',viewer)).json(),{admin:false,username:'ayse.yilmaz',role:'viewer',breakGlass:false,retentionDays:30});
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
 assert.equal((await req('/api/session',viewer)).status,200); // oturum yeniden baslatmadan sonra da gecerli
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

 // Kendi sifresini degistirme: eski oturum ve eski sifre gecersiz olur
 const NEW_PASS='yeni-parola-98765';
 assert.equal((await post('/api/password',viewer,JSON.stringify({current:'yanlis-yanlis-123',next:NEW_PASS}))).status,403);
 assert.equal((await post('/api/password',viewer,JSON.stringify({current:VIEWER_PASS,next:'kisa'}))).status,400);
 assert.equal((await post('/api/password',admin,JSON.stringify({current:env.ADMIN_PASSWORD,next:NEW_PASS}))).status,400);
 const changed=await post('/api/password',viewer,JSON.stringify({current:VIEWER_PASS,next:NEW_PASS}));
 assert.equal(changed.status,200);
 assert.equal((await req('/api/state',viewer)).status,401);
 const fresh=cookieOf(changed);
 assert.equal((await req('/api/state',fresh)).status,200);
 assert.equal((await login('ayse.yilmaz',VIEWER_PASS)).status,401);
 viewer=cookieOf(await login('ayse.yilmaz',NEW_PASS));
 // Hesap kapatma, rol degistirme, sifre sifirlama
 assert.equal((await mk({op:'disable',username:'ayse.yilmaz'})).status,200);
 assert.equal((await req('/api/state',viewer)).status,401);
 assert.equal((await login('ayse.yilmaz',NEW_PASS)).status,401);
 assert.equal((await mk({op:'enable',username:'ayse.yilmaz'})).status,200);
 assert.equal((await mk({op:'reset',username:'ayse.yilmaz',password:'sifirlanan-parola-1'})).status,200);
 assert.equal((await login('ayse.yilmaz',NEW_PASS)).status,401);
 viewer=cookieOf(await login('ayse.yilmaz','sifirlanan-parola-1'));
 assert.equal((await mk({op:'role',username:'ayse.yilmaz',role:'admin'})).status,200);
 assert.equal((await (await req('/api/session',viewer)).json()).admin,true);
 assert.equal((await mk({op:'role',username:'ayse.yilmaz',role:'viewer'})).status,200);
 assert.equal((await mk({op:'bogus',username:'ayse.yilmaz'})).status,400);
 assert.equal((await mk({op:'disable',username:'yok.kisi'})).status,404);
 // Excel ciktisi denetim kaydina islenir
 assert.equal((await post('/api/audit/export',viewer,JSON.stringify({view:'channel',start:'2026-11-12',end:'2026-11-15',filters:'channel=Atv'}))).status,200);
 // Denetim kaydi: yalniz yonetici gorur; kimin ne yaptigi kayitlidir
 assert.equal((await req('/api/audit',viewer)).status,403);
 const entries=(await (await req('/api/audit?limit=500',admin)).json()).entries;
 const has=(ev,pred=()=>true)=>entries.some(e=>e.event===ev&&pred(e));
 assert.ok(has('login',e=>e.user==='ayse.yilmaz'&&e.role==='viewer'));
 assert.ok(has('login',e=>e.user==='admin'&&e.detail.breakGlass));
 assert.ok(has('login-failed'));
 assert.ok(has('user-create',e=>e.user==='admin'&&e.detail.target==='ayse.yilmaz'));
 assert.ok(has('user-reset-password',e=>e.detail.target==='ayse.yilmaz'));
 assert.ok(has('password-change',e=>e.user==='ayse.yilmaz'));
 assert.ok(has('import',e=>e.user==='admin'&&e.detail.mode==='append'&&e.detail.added>=0));
 assert.ok(has('import',e=>e.user==='ingest'&&e.role==='machine'&&e.detail.mode==='replace'));
 assert.ok(has('import-rejected',e=>e.user==='ingest'));
 assert.ok(has('rules',e=>e.user==='admin'));
 assert.ok(has('restore',e=>e.user==='admin'));
 assert.ok(has('denied',e=>e.user==='ayse.yilmaz'));
 assert.ok(has('export',e=>e.user==='ayse.yilmaz'&&e.detail.filters==='channel=Atv'));
 assert.equal((await (await req('/api/audit?event=restore',admin)).json()).entries.every(e=>e.event==='restore'),true);
 assert.ok(['admin','ingest'].includes((await (await req('/api/state',admin)).json()).updatedBy));
 // Sifreler ne denetim kaydinda ne kullanici dosyasinda acik metin olarak bulunur
 for(const f of ['audit.log','users.json']){
   const text=fs.readFileSync(path.join(data,f),'utf8');
   for(const secret of [VIEWER_PASS,NEW_PASS,'sifirlanan-parola-1',env.ADMIN_PASSWORD,env.INGEST_TOKEN]) assert.ok(!text.includes(secret),f+' icinde sifre var');
 }
 // Deneme siniri: ayni kullanici adina pes pese hatali giris kilitlenir; dogru yonetici girisi etkilenmez
 for(let i=0;i<4;i++) assert.equal((await login('hedef.kisi','yanlis-sifre-123456789')).status,401);
 const locked=await login('hedef.kisi','yanlis-sifre-123456789');
 assert.equal(locked.status,429);assert.ok(Number(locked.headers.get('retry-after'))>0);
 assert.equal((await login('admin',env.ADMIN_PASSWORD)).status,200);

 // Tekrar kontrolu yalniz gelen dosyanin gunleriyle yapilir; sonuc yine dogru olmalidir
 const append='/api/import?mode=append&start=&end=&complete=0';
 const imp=async(buf)=>{const r=await post(append,admin,buf);assert.equal(r.status,200,await r.clone().text());return r.json();};
 let r1=await imp(book(['2026-12-01','2026-12-02'],30));
 assert.deepEqual([r1.added,r1.skipped,r1.updated],[2,0,0]);
 assert.equal(r1.warning,undefined); // arsiv araligi saklama sinirinin icinde
 r1=await imp(book(['2026-12-02','2026-12-03'],30));
 assert.deepEqual([r1.added,r1.skipped,r1.updated],[1,1,0]);
 r1=await imp(book(['2026-12-02','2026-12-03'],45));
 assert.deepEqual([r1.added,r1.skipped,r1.updated],[0,0,2]);
 // Ayni anda gelen iki yukleme siraya girer; ikisi de arsive islenir (kayip guncelleme olmaz)
 const [pa,pb]=await Promise.all([post(append,admin,book(['2026-12-10'],30)),post(append,admin,book(['2026-12-11'],30))]);
 assert.equal(pa.status,200);assert.equal(pb.status,200);
 const dates=async()=>new Set((await (await req('/api/state',viewer)).json()).rows.map(r=>r[6]));
 let have=await dates();
 assert.ok(have.has('2026-12-10')&&have.has('2026-12-11'));
 // 20 bin satirdan buyuk arsiv parca parca yazilir ve yeniden baslatmada aynen okunur
 const bigRows=Array.from({length:25000},(_,i)=>['Atv','Gıda','Gıda','Örnek '+(i%7),'Ürün','Marka '+(i%11),'2026-12-20','Normal Spot','Kusak Spot',String(Math.floor((25200+i)/3600)).padStart(2,'0')+':'+String(Math.floor((25200+i)%3600/60)).padStart(2,'0')+':'+String((25200+i)%60).padStart(2,'0'),String(Math.floor((25200+i+10)/3600)).padStart(2,'0')+':'+String(Math.floor((25200+i+10)%3600/60)).padStart(2,'0')+':'+String((25200+i+10)%60).padStart(2,'0'),10]);
 const bw=XLSX.utils.book_new();XLSX.utils.book_append_sheet(bw,XLSX.utils.aoa_to_sheet([headers,...bigRows]));
 const big=await imp(XLSX.write(bw,{type:'buffer',bookType:'xlsx',compression:true}));
 assert.equal(big.added,25000);
 assert.match(big.warning,/saklama siniri 30 gun/); // 2026-11-12 ... 2026-12-20 = 39 gun
 const beforeRestart=await (await req('/api/state',viewer)).json();
 await stop();await start();
 const afterRestart=await (await req('/api/state',viewer)).json();
 assert.equal(afterRestart.rows.length,beforeRestart.rows.length);
 assert.deepEqual(afterRestart.rows.at(-1),beforeRestart.rows.at(-1));
 assert.deepEqual(afterRestart.coverage,beforeRestart.coverage);
 assert.deepEqual(afterRestart.rules,beforeRestart.rules);

 // Saklama siniri ve temizlik: yalniz yonetici; once onizleme, sonra anlik goruntu alinarak silme
 assert.equal((await post('/api/prune?keep=30',viewer,'{}')).status,403);
 assert.equal((await post('/api/prune?keep=3',admin,'{}')).status,400);
 const preview=await (await post('/api/prune?keep=30&dry=1',admin,'{}')).json();
 assert.equal(preview.dry,true);assert.equal(preview.cutoff,'2026-11-21');assert.ok(preview.removed>0);
 assert.equal((await (await req('/api/state',viewer)).json()).rows.length,afterRestart.rows.length); // onizleme silmez
 const snapsBefore=(await (await req('/api/snapshots',admin)).json()).snapshots[0].name;
 const pruned=await (await post('/api/prune?keep=30',admin,'{}')).json();
 assert.equal(pruned.removed,preview.removed);
 const afterPrune=await (await req('/api/state',viewer)).json();
 assert.equal(afterPrune.rows.length,afterRestart.rows.length-pruned.removed);
 assert.ok(afterPrune.rows.every(r=>r[6]>='2026-11-21'));
 assert.ok(afterPrune.coverage.every(k=>k.split('|').pop()>='2026-11-21')&&afterPrune.verified.every(k=>k.split('|').pop()>='2026-11-21'));
 const snapAfter=(await (await req('/api/snapshots',admin)).json()).snapshots[0];
 assert.notEqual(snapAfter.name,snapsBefore);assert.equal(snapAfter.reason,'prune');
 assert.ok((await (await req('/api/audit?event=prune',admin)).json()).entries.some(e=>e.user==='admin'&&e.detail.removed===pruned.removed));
 assert.equal((await (await post('/api/prune?keep=30',admin,'{}')).json()).removed,0); // ikinci temizlik bir sey silmez
 // Temizlik anlik goruntuden geri alinabilir
 assert.equal((await post('/api/restore?name='+snapAfter.name,admin,'')).status,200);
 assert.equal((await (await req('/api/state',viewer)).json()).rows.length,afterRestart.rows.length);
 const afterPruneImport=await (await post(append,admin,book(['2026-12-21'],30))).json();
 assert.equal(afterPruneImport.warning,'Arsivde 40 gunluk kayit var (2026-11-12 - 2026-12-21); saklama siniri 30 gun. Eski kayitlari panelden temizleyin.');
 if(process.env.TEST_ADEX_XLSX){
   const sample=await post('/api/import',admin,fs.readFileSync(process.env.TEST_ADEX_XLSX));
   assert.equal(sample.status,200,await sample.clone().text());
   console.log('OK: supplied ADEX workbook accepted.');
 }
 console.log('OK: access controls, Excel import, Monday date validation, replacement, rules, persistence after restart.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();fs.rmSync(data,{recursive:true,force:true});});
