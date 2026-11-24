const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const XLSX=require('../public/xlsx.full.min.js');
const {createFakeSmtp}=require('./fake-smtp.cjs');
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
const post=(p,auth,body,header=true,force=true)=>req(force&&p.startsWith('/api/import')&&!p.includes('force=')?p+(p.includes('?')?'&':'?')+'force=1':p,auth,{method:'POST',body,headers:header?{'X-Panel-Request':'1'}:{}});   // eski testler uyari onayini otomatik verir; uyari akisi asagida ayri sinanir
const fake=createFakeSmtp();
(async()=>{
 Object.assign(env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(await fake.listen()),SMTP_TLS:'none',SMTP_USER:fake.user,SMTP_PASSWORD:fake.password,MAIL_FROM:'Kanal Doluluk <bildirim@example.com>',NOTIFY_EMAILS:'ops@example.com'});
 await start();
 const anon=await req('/',null,{redirect:'manual'});
 assert.equal(anon.status,302);assert.equal(anon.headers.get('location'),'/login');
 assert.equal((await req('/login')).status,200);
 // CSP: her yanitta bulunur; sayfalar satir ici betik / <style> blogu / olay ozniteligi icermez (politika bozulmasin)
 const csp=(await req('/login')).headers.get('content-security-policy');
 assert.match(csp,/script-src 'self'/);
 assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline|style-src 'self'[^;]*unsafe-inline/.test(csp));
 assert.equal((await req('/api/state')).headers.get('content-security-policy'),csp);
 assert.equal((await req('/login.js')).status,200);assert.equal((await req('/login.css')).status,200);
 assert.equal((await req('/app.js',null,{redirect:'manual'})).status,302); // uygulama kaynaklari oturum ister
 for(const f of ['index.html','login.html']){
   const h=fs.readFileSync(path.resolve(__dirname,'../public/'+f),'utf8');
   assert.ok(!/<script(?![^>]*\ssrc=)/i.test(h),f+': satir ici betik var');
   assert.ok(!/<style/i.test(h),f+': <style> blogu var');
   assert.ok(!/\son[a-z]+\s*=/i.test(h),f+': olay ozniteligi var');
 }
 for(const f of ['app.js','login.js','core.js','worker.js']){
   const j=fs.readFileSync(path.resolve(__dirname,'../public/'+f),'utf8');
   assert.ok(!/\beval\(|new Function/.test(j),f+': eval/Function var');
   assert.ok(!/\son(click|change|input|submit|load)=/.test(j),f+': olay ozniteligi uretiliyor');
 }
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
 assert.deepEqual(await (await req('/api/session',viewer)).json(),{admin:false,superadmin:false,username:'ayse.yilmaz',role:'viewer',breakGlass:false,retentionDays:30});
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
 assert.equal((await post('/api/rules',admin,JSON.stringify({rules:{'Normal Spot|Kusak Spot':'include'},expectedChannels:['Atv','Kanal D','Tv8,5']}))).status,200);
 assert.equal((await post('/api/rules',admin,JSON.stringify({rules:{'Normal Spot|Kusak Spot':'include'},confirmed:true}))).status,400);
 // Beklenen kanal dosyada yoksa uyari doner
 response=await post(url,bot,book(weekend,45),false);
 assert.deepEqual((await response.json()).missingChannels,['Kanal D','Tv8,5']); // kanal adinda virgul olabilir
 await stop();await start();
 assert.equal((await req('/api/session',viewer)).status,200); // oturum yeniden baslatmadan sonra da gecerli
 const state=await (await req('/api/state',viewer)).json();
 assert.equal(state.rows.length,4);
 assert.deepEqual(state.rows.map(r=>r[11]),[30,45,45,45]);
 assert.equal(state.confirmed,undefined);
 assert.deepEqual(state.expectedChannels,['Atv','Kanal D','Tv8,5']);
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
 assert.equal((await post('/api/prune?keep=30',admin,'{}')).status,400); // gerekce zorunlu
 const pruned=await (await post('/api/prune?keep=30',admin,JSON.stringify({reason:'Saklama suresi doldu; 6 aydan eski kayitlar temizleniyor'}))).json();
 assert.equal(pruned.done,true);assert.equal(pruned.removed,preview.removed);
 const afterPrune=await (await req('/api/state',viewer)).json();
 assert.equal(afterPrune.rows.length,afterRestart.rows.length-pruned.removed);
 assert.ok(afterPrune.rows.every(r=>r[6]>='2026-11-21'));
 assert.ok(afterPrune.coverage.every(k=>k.split('|').pop()>='2026-11-21')&&afterPrune.verified.every(k=>k.split('|').pop()>='2026-11-21'));
 const snapAfter=(await (await req('/api/snapshots',admin)).json()).snapshots[0];
 assert.notEqual(snapAfter.name,snapsBefore);assert.equal(snapAfter.reason,'delete');
 assert.ok((await (await req('/api/audit?event=data-delete',admin)).json()).entries.some(e=>e.user==='admin'&&e.detail.kind==='prune'&&e.detail.removed===pruned.removed&&/Saklama suresi/.test(e.detail.reason)));
 assert.equal((await (await post('/api/prune?keep=30',admin,'{}')).json()).removed,0); // ikinci temizlik bir sey silmez
 // Temizlik anlik goruntuden geri alinabilir
 assert.equal((await post('/api/restore?name='+snapAfter.name,admin,'')).status,200);
 assert.equal((await (await req('/api/state',viewer)).json()).rows.length,afterRestart.rows.length);
 const afterPruneImport=await (await post(append,admin,book(['2026-12-21'],30))).json();
 assert.equal(afterPruneImport.warning,'Arsivde 40 gunluk kayit var (2026-11-12 - 2026-12-21); saklama siniri 30 gun. Eski kayitlari panelden temizleyin.');

 // Roller: Ekip < Yonetici < Super-yonetici
 const RP='rol-test-parola-123';
 const mkAs=(c,o)=>post('/api/users',c,JSON.stringify(o));
 for(const [u,role] of [['ekip.bir','viewer'],['yonetici.bir','admin'],['super.bir','superadmin']]) assert.equal((await mkAs(admin,{op:'create',username:u,password:RP,role})).status,200);
 assert.equal((await mkAs(admin,{op:'create',username:'bozuk.rol',password:RP,role:'patron'})).status,400);
 // E-posta bicimli kullanici adi: gecerli olan kabul edilir, bozuk bicimler ve buyuk harf reddedilir; giris buyuk/kucuk harfe duyarsizdir
 for(const bad of ['a@b','bos bosluk@x.com','@x.com','x@@y.com','x@y..com','Buyuk.Harf@x.com','x@y.com.','admin@x.com@z.com']) assert.equal((await mkAs(admin,{op:'create',username:bad,password:RP,role:'viewer'})).status,400,'kabul edilmemeli: '+bad);
 assert.equal((await mkAs(admin,{op:'create',username:'test.kisi@example.com',password:RP,role:'superadmin'})).status,200);
 const mailSes=await login('Test.Kisi@Example.com',RP);assert.equal(mailSes.status,200);
 const mailJson=await (await req('/api/session',cookieOf(mailSes))).json();
 assert.deepEqual([mailJson.username,mailJson.role,mailJson.superadmin],['test.kisi@example.com','superadmin',true]);
 const ekip=cookieOf(await login('ekip.bir',RP)),yon=cookieOf(await login('yonetici.bir',RP)),sup=cookieOf(await login('super.bir',RP));
 const sess=async c=>{const j=await (await req('/api/session',c)).json();return [j.role,j.admin,j.superadmin];};
 assert.deepEqual(await sess(ekip),['viewer',false,false]);
 assert.deepEqual(await sess(yon),['admin',true,false]);
 assert.deepEqual(await sess(sup),['superadmin',true,true]);
 assert.deepEqual(await sess(admin),['superadmin',true,true]); // acil durum hesabi super-yoneticidir
 const rulesBody=JSON.stringify({rules:{'Normal Spot|Kusak Spot':'include'},expectedChannels:[]});
 // Ekip: gorur ve Excel alir; veriyi ve ayarlari degistiremez, kullanici/denetim goremez
 assert.equal((await req('/api/state',ekip)).status,200);
 assert.equal((await post('/api/audit/export',ekip,JSON.stringify({view:'channel',start:'2026-11-12',end:'2026-11-12'}))).status,200);
 assert.equal((await post(append,ekip,book(['2027-01-04'],30))).status,403);
 for(const [m,u] of [['GET','/api/snapshots'],['GET','/api/users'],['GET','/api/audit']]) assert.equal((await req(u,ekip)).status,403,'ekip '+u);
 for(const u of ['/api/prune?keep=30&dry=1','/api/rules','/api/restore?name=x']) assert.equal((await post(u,ekip,u==='/api/rules'?rulesBody:'{}')).status,403,'ekip '+u);
 // Yonetici: Excel yukler, siler (temizlik, geri yukleme), kural ve anlik goruntuleri yonetir; kullanici ve denetim yok
 let yr=await post(append,yon,book(['2027-01-05'],30));assert.equal(yr.status,200,await yr.clone().text());
 assert.equal((await post('/api/prune?keep=30&dry=1',yon,'{}')).status,200);
 assert.equal((await post('/api/rules',yon,rulesBody)).status,200);
 assert.equal((await req('/api/snapshots',yon)).status,200);
 assert.equal((await post('/api/restore?name=20200101T000000000Z-prune.json.gz',yon,'{}')).status,403); // geri yukleme yalniz super-yonetici
 assert.equal((await post('/api/restore?name=20200101T000000000Z-prune.json.gz',admin,'{}')).status,404); // super-yonetici yetkili ama kayit yok
 assert.equal((await req('/api/users',yon)).status,403);
 assert.equal((await req('/api/audit',yon)).status,403);
 for(const o of [{op:'create',username:'yetkisiz.kisi',password:RP,role:'viewer'},{op:'delete',username:'ekip.bir'},{op:'role',username:'ekip.bir',role:'superadmin'},{op:'reset',username:'ekip.bir',password:RP+'x'}]) assert.equal((await mkAs(yon,o)).status,403,'yonetici '+o.op);
 assert.equal((await login('yetkisiz.kisi',RP)).status,401);
 // Super-yonetici: kullanici ekler/siler; veri islemleri de yapar
 assert.equal((await req('/api/users',sup)).status,200);
 assert.equal((await req('/api/audit?limit=5',sup)).status,200);
 assert.equal((await post(append,sup,book(['2027-01-06'],30))).status,200);
 assert.equal((await mkAs(sup,{op:'create',username:'silinecek.kisi',password:RP,role:'admin'})).status,200);
 const silinecek=cookieOf(await login('silinecek.kisi',RP));
 assert.equal((await req('/api/state',silinecek)).status,200);
 assert.equal((await mkAs(sup,{op:'delete',username:'super.bir'})).status,400); // kendini silemez
 assert.equal((await mkAs(sup,{op:'delete',username:'yok.kisi'})).status,404);
 const del=await mkAs(sup,{op:'delete',username:'silinecek.kisi'});
 assert.equal(del.status,200);assert.ok(!(await del.json()).users.some(u=>u.username==='silinecek.kisi'));
 assert.equal((await req('/api/state',silinecek)).status,401); // acik oturum hemen duser
 assert.equal((await login('silinecek.kisi',RP)).status,401);
 // ayni ad yeniden acilirsa eski cerez gecersiz kalir
 assert.equal((await mkAs(sup,{op:'create',username:'silinecek.kisi',password:RP,role:'viewer'})).status,200);
 assert.equal((await req('/api/state',silinecek)).status,401);
 assert.equal((await mkAs(sup,{op:'role',username:'yonetici.bir',role:'superadmin'})).status,200);
 assert.equal((await req('/api/users',yon)).status,200); // rol yukselince oturum yeni yetkiyi alir
 assert.equal((await mkAs(sup,{op:'role',username:'yonetici.bir',role:'admin'})).status,200);
 assert.equal((await req('/api/users',yon)).status,403);
 const roleAudit=(await (await req('/api/audit?limit=500',sup)).json()).entries;
 assert.ok(roleAudit.some(e=>e.event==='user-delete'&&e.user==='super.bir'&&e.detail.target==='silinecek.kisi'));
 assert.ok(roleAudit.some(e=>e.event==='denied'&&e.user==='yonetici.bir'));
 assert.ok(roleAudit.some(e=>e.event==='denied'&&e.user==='ekip.bir'));

 // Veri sil: gerekce zorunlu; Yonetici talep eder, Super-yonetici onaylar/reddeder; Super-yonetici gerekceyle dogrudan siler
 const delData=(c,o)=>post('/api/delete',c,JSON.stringify(o));
 const decide=(c,o)=>post('/api/delete-requests',c,JSON.stringify(o));
 const rowsNow=async()=>(await (await req('/api/state',yon)).json());
 const REASON='Yanlis kanal kodlariyla yuklendi; duzeltilmis dosya yeniden yuklenecek.';
 const range={start:'2027-01-05',end:'2027-01-06',channel:'Atv'};
 assert.equal((await delData(ekip,{...range,dry:true})).status,403);
 for(const bad of [{start:'2027-01-06',end:'2027-01-05'},{start:'x',end:'2027-01-06'},{...range,channel:'x'.repeat(61)},{}]) assert.equal((await delData(yon,bad)).status,400);
 assert.equal((await (await delData(yon,{...range,channel:'Kanal D',dry:true})).json()).removed,0); // baska kanal etkilenmez
 const dprev=await (await delData(yon,{...range,dry:true})).json();
 assert.equal(dprev.dry,true);assert.ok(dprev.removed>=2);
 const base=await rowsNow();
 // gerekce zorunlu
 assert.equal((await delData(yon,range)).status,400);
 assert.equal((await delData(yon,{...range,reason:'kisa'})).status,400);
 // Yonetici talep olusturur; hicbir sey silinmez
 const pend=await (await delData(yon,{...range,reason:REASON})).json();
 assert.equal(pend.pending,true);assert.equal(pend.removed,dprev.removed);
 assert.equal((await rowsNow()).rows.length,base.rows.length);
 // talepleri gorme: Ekip goremez; Yonetici kendisininkini, Super-yonetici hepsini
 assert.equal((await req('/api/delete-requests',ekip)).status,403);
 const ylist=await (await req('/api/delete-requests',yon)).json();
 assert.equal(ylist.pending,1);assert.equal(ylist.requests[0].reason,REASON);assert.equal(ylist.requests[0].impact.removed,dprev.removed);
 assert.ok((await (await req('/api/delete-requests',sup)).json()).requests.some(r=>r.id===pend.id&&r.requestedBy==='yonetici.bir'));
 // karar yetkisi yalniz Super-yoneticide; kendi talebini onaylayamaz
 assert.equal((await decide(yon,{op:'approve',id:pend.id})).status,403);
 assert.equal((await decide(ekip,{op:'approve',id:pend.id})).status,403);
 assert.equal((await decide(sup,{op:'approve',id:'yok'})).status,404);
 assert.equal((await decide(sup,{op:'bogus',id:pend.id})).status,400);
 // Super-yonetici reddeder: hicbir sey silinmez, karar kalici
 assert.equal((await decide(sup,{op:'reject',id:pend.id,note:'Once sube ile teyit edin'})).status,200);
 assert.equal((await rowsNow()).rows.length,base.rows.length);
 assert.equal((await decide(sup,{op:'approve',id:pend.id})).status,409);
 // Yonetici bekleyen talebini iptal eder
 const p2=await (await delData(yon,{...range,reason:REASON+' (2)'})).json();
 assert.equal((await decide(ekip,{op:'cancel',id:p2.id})).status,403);
 assert.equal((await decide(yon,{op:'cancel',id:p2.id})).status,200);
 assert.equal((await decide(sup,{op:'approve',id:p2.id})).status,409);
 // Onaylanan talep silinir: once anlik goruntu, sonra silme
 const p3=await (await delData(yon,{...range,reason:REASON+' (3)'})).json();
 const snapTop=(await (await req('/api/snapshots',yon)).json()).snapshots[0].name;
 const ap=await decide(sup,{op:'approve',id:p3.id,note:'Uygun'});assert.equal(ap.status,200);
 assert.equal((await ap.json()).result.removed,dprev.removed);
 const afterDel=await rowsNow();
 assert.equal(afterDel.rows.length,base.rows.length-dprev.removed);
 assert.ok(!afterDel.rows.some(r=>r[6]>='2027-01-05'&&r[6]<='2027-01-06'&&r[0]==='Atv'));
 assert.ok(!afterDel.coverage.some(k=>k==='Atv|2027-01-05'||k==='Atv|2027-01-06'));
 const snapDel=(await (await req('/api/snapshots',yon)).json()).snapshots[0];
 assert.notEqual(snapDel.name,snapTop);assert.equal(snapDel.reason,'delete');
 // denetim: kim, ne zaman, hangi gerekce, kim onayladi
 const dAudit=(await (await req('/api/audit?limit=500',sup)).json()).entries;
 assert.ok(dAudit.some(e=>e.event==='delete-request'&&e.user==='yonetici.bir'&&e.detail.reason===REASON));
 assert.ok(dAudit.some(e=>e.event==='delete-reject'&&e.user==='super.bir'&&e.detail.note==='Once sube ile teyit edin'));
 assert.ok(dAudit.some(e=>e.event==='delete-cancel'&&e.user==='yonetici.bir'));
 assert.ok(dAudit.some(e=>e.event==='delete-approve'&&e.user==='super.bir'&&e.detail.requestedBy==='yonetici.bir'));
 assert.ok(dAudit.some(e=>e.event==='data-delete'&&e.detail.requestId===p3.id&&e.detail.approvedBy==='super.bir'&&e.detail.requestedBy==='yonetici.bir'&&e.detail.reason===REASON+' (3)'));
 // Yonetici geri yukleyemez (eski goruntuye donmek veri silebilir); Super-yonetici geri alabilir
 assert.equal((await post('/api/restore?name='+snapDel.name,yon,'{}')).status,403);
 assert.equal((await post('/api/restore?name='+snapDel.name,sup,'{}')).status,200);
 assert.equal((await rowsNow()).rows.length,base.rows.length);
 // Super-yonetici dogrudan siler (gerekce yine zorunlu); kayit otomatik onayli olarak tutulur
 assert.equal((await delData(sup,range)).status,400);
 const direct=await (await delData(sup,{...range,reason:REASON+' (dogrudan)'})).json();
 assert.equal(direct.done,true);assert.equal(direct.removed,dprev.removed);
 assert.ok((await (await req('/api/delete-requests',sup)).json()).requests.some(r=>r.id===direct.id&&r.status==='approved'&&r.auto===true&&r.decidedBy==='super.bir'));
 assert.equal((await post('/api/restore?name='+(await (await req('/api/snapshots',sup)).json()).snapshots[0].name,sup,'{}')).status,200);
 assert.equal((await rowsNow()).rows.length,base.rows.length);
 // Eski kayit temizligi de ayni akistan gecer: Yonetici talep eder, Super-yonetici reddeder
 assert.equal((await post('/api/prune?keep=30',yon,'{}')).status,400);
 const pr=await (await post('/api/prune?keep=30',yon,JSON.stringify({reason:'Saklama suresini asan kayitlar temizlenecek'}))).json();
 assert.equal(pr.pending,true);assert.ok(pr.removed>0);
 assert.equal((await rowsNow()).rows.length,base.rows.length);
 const prRec=(await (await req('/api/delete-requests',sup)).json()).requests.find(r=>r.id===pr.id);
 assert.equal(prRec.kind,'prune');assert.equal(prRec.start,'1970-01-01');
 assert.equal((await decide(sup,{op:'reject',id:pr.id})).status,200);
 // Bekleyen talep siniri (kisi basina 5)
 const ids=[];
 for(let i=0;i<5;i++){const x=await delData(yon,{...range,reason:'Sinir testi talebi numara '+i});assert.equal(x.status,200);ids.push((await x.json()).id);}
 assert.equal((await delData(yon,{...range,reason:'Sinir testi: altinci talep'})).status,409);
 for(const id of ids) assert.equal((await decide(sup,{op:'cancel',id})).status,200); // Super-yonetici baskasinin talebini iptal edebilir
 assert.equal((await (await req('/api/delete-requests',yon)).json()).pending,0);
 // Talepler yeniden baslatmada korunur
 const keepPending=await (await delData(yon,{...range,reason:'Yeniden baslatma testi icin bekleyen talep'})).json();
 await stop();await start();
 const afterRestart2=await (await req('/api/delete-requests',sup)).json();
 assert.ok(afterRestart2.requests.some(r=>r.id===keepPending.id&&r.status==='pending'));
 assert.ok(afterRestart2.requests.some(r=>r.id===pr.id&&r.status==='rejected'));
 assert.equal((await decide(sup,{op:'cancel',id:keepPending.id})).status,200);

 // ---- E-posta bildirimi (sahte SMTP sunucusuyla): kime, ne zaman, hangi icerikle
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const gather=async(action,expected)=>{const i=fake.mails.length;const r=await action();const t0=Date.now();while(fake.mails.length<i+expected&&Date.now()-t0<5000)await sleep(25);await sleep(expected?150:350);return {r,mails:fake.mails.slice(i)};};
 const toSet=m=>m.map(x=>x.to).sort();
 const SUPERS=['mail.super@example.com','ops@example.com','test.kisi@example.com'];
 for(const o of [{username:'mail.super@example.com',role:'superadmin'},{username:'yonetici.mail',role:'admin',email:'Yonetici.Mail@Example.com'},{username:'yonetici.iki',role:'admin'},{username:'ekip.mail@example.com',role:'viewer'}]) assert.equal((await mkAs(admin,{op:'create',password:RP,...o})).status,200);
 assert.equal((await mkAs(admin,{op:'create',username:'bozuk.eposta',password:RP,role:'viewer',email:'gecersiz'})).status,400);
 assert.equal((await mkAs(admin,{op:'email',username:'yonetici.iki',email:'a b@c'})).status,400);
 const emUsers=await (await mkAs(admin,{op:'email',username:'yonetici.iki',email:'Yonetici.Iki@Example.com'})).json();
 assert.equal(emUsers.users.find(u=>u.username==='yonetici.iki').email,'yonetici.iki@example.com'); // kucuk harfe cevrilir
 assert.equal(emUsers.users.find(u=>u.username==='yonetici.mail').notifyAddress,'yonetici.mail@example.com');
 assert.equal(emUsers.users.find(u=>u.username==='ekip.mail@example.com').notifyAddress,'ekip.mail@example.com'); // kullanici adi e-postaysa o kullanilir
 const ms=cookieOf(await login('mail.super@example.com',RP)),ym=cookieOf(await login('yonetici.mail',RP)),yi=cookieOf(await login('yonetici.iki',RP)),em=cookieOf(await login('ekip.mail@example.com',RP));
 await sleep(300);
 // durum ve ayar denemesi
 const mst=await (await req('/api/users',ms)).json();
 assert.equal(mst.mail.enabled,true);assert.match(mst.mail.from,/bildirim@example\.com/);
 assert.equal((await req('/api/users',ym)).status,403);
 assert.equal((await post('/api/mail-test',admin,'{}')).status,400); // acil durum hesabinin e-postasi yok
 let g=await gather(()=>post('/api/mail-test',ms,'{}'),1);
 assert.equal(g.r.status,200);assert.deepEqual(toSet(g.mails),['mail.super@example.com']);assert.match(g.mails[0].subject,/Test e-postası/);
 fake.state.reject=true;
 const bt=await post('/api/mail-test',ms,'{}');assert.equal(bt.status,502);assert.match((await bt.json()).error,/550/);
 fake.state.reject=false;
 // silme talebi -> yalniz super-yoneticilere (+ NOTIFY_EMAILS); talep edene, diger yoneticiye ve ekibe gitmez
 const mrange={start:'2027-02-01',end:'2027-02-02',channel:'Atv'};
 await post(append,ym,book(['2027-02-01'],30));await sleep(600);
 g=await gather(()=>delData(ym,{...mrange,reason:'Yanlis kanal kodlariyla yuklendi; duzeltilmis dosya yuklenecek.'}),SUPERS.length);
 const reqId=(await g.r.json()).id;
 assert.deepEqual(toSet(g.mails),SUPERS);
 assert.match(g.mails[0].subject,/^\[Kanal Doluluk\] Silme talebi onayınızı bekliyor$/);
 assert.match(g.mails[0].text,/yonetici\.mail bir silme talebi açtı/);assert.match(g.mails[0].text,/Gerekçe: Yanlis kanal kodlariyla/);assert.match(g.mails[0].text,/Etkilenecek kayıt: 1/);assert.match(g.mails[0].text,/Atv/);
 assert.ok(g.mails.every(m=>m.from==='bildirim@example.com'&&m.encrypted===false));
 // karar -> talebi acan kisiye
 g=await gather(()=>decide(ms,{op:'reject',id:reqId,note:'Once sube ile teyit edin'}),1);
 assert.deepEqual(toSet(g.mails),['yonetici.mail@example.com']);assert.match(g.mails[0].subject,/reddedildi/);assert.match(g.mails[0].text,/Not: Once sube ile teyit edin/);
 let id2=(await (await delData(ym,{...mrange,reason:'Ikinci talep: onay mesaji denemesi'})).json()).id;await sleep(600);
 g=await gather(()=>decide(ms,{op:'approve',id:id2}),1);
 assert.deepEqual(toSet(g.mails),['yonetici.mail@example.com']);assert.match(g.mails[0].subject,/onaylandı/);assert.match(g.mails[0].text,/Silinen kayıt: 1/);
 const id3=(await (await delData(ym,{...mrange,reason:'Ucuncu talep: iptal denemesi'})).json()).id;await sleep(600);
 g=await gather(()=>decide(ym,{op:'cancel',id:id3}),0);assert.equal(g.mails.length,0); // kendi iptali icin e-posta yok
 const id4=(await (await delData(ym,{...mrange,reason:'Dorduncu talep: yonetici iptali'})).json()).id;await sleep(600);
 g=await gather(()=>decide(ms,{op:'cancel',id:id4}),1);assert.deepEqual(toSet(g.mails),['yonetici.mail@example.com']);assert.match(g.mails[0].subject,/iptal edildi/);
 // panelden veri yukleme -> yoneticiler ve super-yoneticiler (yukleyen haric); ekibe gitmez
 g=await gather(()=>post(append,ym,book(['2027-03-01'],30)),SUPERS.length+1);
 assert.equal(g.r.status,200);assert.deepEqual(toSet(g.mails),[...SUPERS,'yonetici.iki@example.com'].sort());
 assert.match(g.mails[0].subject,/Yeni veri yüklendi/);assert.match(g.mails[0].text,/yonetici\.mail \(panel\) veri yükledi/);assert.match(g.mails[0].text,/Eklenen: 1 .* Güncellenen: 0/);assert.match(g.mails[0].text,/Veri durumu — sonraki özet için \(.*\):/);assert.match(g.mails[0].text,/(✓ Eksik veya sorun yok\.|⚠ )/);assert.match(g.mails[0].text,/Arşivde toplam: \d+ kayıt/);
 // otomatik aktarim -> tum yoneticiler; reddedilirse yalniz super-yoneticilere
 const wk=['2026-11-13','2026-11-14','2026-11-15'],aurl='/api/import?start=2026-11-13&end=2026-11-15';
 g=await gather(()=>post(aurl,bot,book(wk,45),false),SUPERS.length+2);
 assert.equal(g.r.status,200);assert.deepEqual(toSet(g.mails),[...SUPERS,'yonetici.iki@example.com','yonetici.mail@example.com'].sort());
 assert.match(g.mails[0].subject,/Otomatik veri aktarımı tamamlandı/);assert.match(g.mails[0].text,/Otomatik aktarım \(Windows\)/);
 g=await gather(()=>post(aurl,bot,book(['2026-11-13'],30),false),SUPERS.length);
 assert.equal(g.r.status,400);assert.deepEqual(toSet(g.mails),SUPERS);assert.match(g.mails[0].subject,/REDDEDİLDİ/);assert.match(g.mails[0].text,/eksik g[uü]n/i);
 // ekip hicbir bildirim almaz
 assert.ok(!fake.mails.some(m=>m.to==='ekip.mail@example.com'),'ekip e-posta aldi');
 // posta sunucusu hata verse de islem basarili olur; hata denetim kaydina yazilir
 fake.state.reject=true;
 const iso=await post(append,ym,book(['2027-03-02'],30));assert.equal(iso.status,200);
 for(let i=0;i<40&&!(await (await req('/api/audit?event=mail-failed',ms)).json()).entries.some(e=>e.detail.kind==='import'&&/550/.test(e.detail.error));i++)await sleep(100);
 assert.ok((await (await req('/api/audit?event=mail-failed',ms)).json()).entries.some(e=>e.detail.kind==='import'&&/550/.test(e.detail.error)));
 fake.state.reject=false;
 // sifre ve gizli bilgiler e-postada/denetimde gecmez
 assert.ok(!fake.mails.some(m=>m.text.includes(RP)||m.text.includes(env.INGEST_TOKEN)||m.text.includes(env.ADMIN_PASSWORD)));
 assert.ok(fake.auths.length>0&&fake.auths.every(a=>a.ok));
 // Bozuk dosya: ayristirma is parcaciginda hataya donusur (JSON 400), sunucu ayakta kalir
 const junk=Buffer.concat([Buffer.from([0x50,0x4b,3,4]),Buffer.from('bozuk icerik '.repeat(200))]);
 const jr=await post(append,admin,junk);assert.equal(jr.status,400);assert.ok((await jr.json()).error);
 assert.equal((await post('/api/import?start=2026-01-01&end=2026-01-02',bot,junk,false)).status,400);
 assert.equal((await req('/healthz')).status,200);
 // Ayristirma sirasinda sunucu diger isteklere yanit vermeye devam eder (buyuk dosya ana is parcacigini bloke etmez)
 const stallBook=(()=>{const rows=[headers];for(let i=0;i<60000;i++)rows.push(['Atv','Gıda','Gıda','Firma '+(i%500),'Ürün','Marka '+(i%900),'2027-04-01','Normal Spot','Kusak Spot',String(7+Math.floor(i/3600)).padStart(2,'0')+':'+String(Math.floor(i%3600/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0'),String(7+Math.floor(i/3600)).padStart(2,'0')+':'+String(Math.floor(i%3600/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0'),5]);const w2=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w2,XLSX.utils.aoa_to_sheet(rows));return XLSX.write(w2,{type:'buffer',bookType:'xlsx',compression:true});})();
 let worst=0,probing=true;
 const prober=(async()=>{while(probing){const t=Date.now();await req('/healthz');worst=Math.max(worst,Date.now()-t);await sleep(15);}})();
 const bigRes=await post(append,admin,stallBook);probing=false;await prober;
 assert.equal(bigRes.status,200,await bigRes.clone().text());
 assert.ok(worst<2500,'ayristirma sirasinda saglik kontrolu '+worst+' ms bekledi');

 // ---- GRP: 'G.R.P - 20+ ABC1' okunur, 'GRPxSURE' yok sayilir; virgullu ondalik ve bos hucre; GRP'siz eski kayitlar GRP ile guncellenir
 const grpHead=[...headers,'ADET','G.R.P - 20+ ABC1','GRPxSURE - 20+ ABC1'];
 const grpBook=lines=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([grpHead,...lines]));return XLSX.write(w,{type:'buffer',bookType:'xlsx',compression:true});};
 const gl=(date,brand,grp,gx=99)=>['Atv','Gıda','Gıda','Örnek','Ürün',brand,date,'Normal Spot','Kusak Spot','18:00:00','18:00:30',30,1,grp,gx];
 const day1=r=>r.rows.filter(x=>x[6]==='2027-05-01');
 await imp(book(['2027-05-01'],30));                                               // GRP'siz (eski) kayit
 assert.equal(day1(await rowsNow()).every(x=>x[12]===undefined),true);
 let gr=await imp(grpBook([gl('2027-05-01','Marka',0.123456),gl('2027-05-01','Marka B','0,5'),gl('2027-05-01','Marka C','')]));
 assert.deepEqual([gr.added,gr.updated,gr.skipped],[2,1,0]);                       // eski kayit GRP ile guncellendi
 const gs=Object.fromEntries(day1(await rowsNow()).map(x=>[x[5],x]));
 assert.equal(gs['Marka'][12],0.123);assert.equal(gs['Marka B'][12],0.5);assert.equal(gs['Marka C'][12],null);
 assert.equal(gs['Marka'].length,14);assert.equal(gs['Marka'][11],30);assert.equal(gs['Marka'][13],99);   // GRPxSURE (GRPxSEC) saklanir; ADET yok sayilir
 gr=await imp(grpBook([gl('2027-05-01','Marka',0.123456),gl('2027-05-01','Marka B','0,5'),gl('2027-05-01','Marka C','')]));
 assert.deepEqual([gr.added,gr.updated,gr.skipped],[0,0,3]);                       // ayni dosya: gereksiz guncelleme yok
 gr=await imp(grpBook([gl('2027-05-01','Marka',0.2)]));
 assert.deepEqual([gr.added,gr.updated,gr.skipped],[0,1,0]);                       // GRP degisti: guncellenir
 assert.equal(day1(await rowsNow()).find(x=>x[5]==='Marka')[12],0.2);
 gr=await imp(grpBook([gl('2027-05-01','Marka',0.2,88)]));
 assert.deepEqual([gr.added,gr.updated,gr.skipped],[0,1,0]);                       // yalniz GRPxSURE degisti: guncellenir
 assert.equal(day1(await rowsNow()).find(x=>x[5]==='Marka')[13],88);
 // SÜRE sutunu olmayan ama GRP olan dosya: sure null (bitis-baslangic kullanilir), GRP korunur
 const noDur=(()=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([[...headers.slice(0,11),'G.R.P - 20+ ABC1'],['Atv','Gıda','Gıda','Örnek','Ürün','Marka','2027-05-02','Normal Spot','Kusak Spot','18:00:00','18:00:30',0.4]]));return XLSX.write(w,{type:'buffer',bookType:'xlsx'});})();
 gr=await imp(noDur);assert.equal(gr.added,1);
 const nd=(await rowsNow()).rows.find(x=>x[6]==='2027-05-02');assert.equal(nd[11],null);assert.equal(nd[12],0.4);
 // kalici: yeniden baslatmadan sonra da ayni
 await stop();await start();
 assert.equal((await rowsNow()).rows.find(x=>x[6]==='2027-05-02')[12],0.4);
 if(process.env.TEST_ADEX_XLSX){
   const sample=await post('/api/import',admin,fs.readFileSync(process.env.TEST_ADEX_XLSX));
   assert.equal(sample.status,200,await sample.clone().text());
   console.log('OK: supplied ADEX workbook accepted.');
 }
  { // yukleme oncesi uyari: GRP sutunu yok -> 409 + uyari, hicbir sey yazilmaz; force=1 ile yazilir
   const before=(await (await req('/api/state',admin)).json()).rows.length;
   const w=await post('/api/import?mode=append&start=&end=&complete=0',admin,book(['2026-12-27'],30),true,false);
   const wj=await w.json();
   assert.equal(w.status,409);assert.equal(wj.needsConfirm,true);assert.ok(wj.warnings.some(x=>/GRP/.test(x)),'GRP uyarisi: '+wj.warnings);
   assert.equal((await (await req('/api/state',admin)).json()).rows.length,before,'onaylanmadan yazilmamali');
   const ok=await post('/api/import?mode=append&start=&end=&complete=0&force=1',admin,book(['2026-12-27'],30),true,false);
   const okj=await ok.json();assert.equal(ok.status,200,JSON.stringify(okj));
   const after=(await (await req('/api/state',admin)).json()).rows.length;assert.ok(after>before,'before '+before+' after '+after+' '+JSON.stringify(okj));
 }

console.log('OK: access controls, Excel import, Monday date validation, replacement, rules, persistence after restart.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await stop();await fake.close();fs.rmSync(data,{recursive:true,force:true});});
