const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { timingSafeEqual, randomUUID } = require('node:crypto');
const zlib = require('node:zlib');
const { gzipSync, gunzipSync } = zlib;
const { once } = require('node:events');
const root = path.join(__dirname,'public');
const env = process.env;
const secrets = [env.ADMIN_PASSWORD, env.INGEST_TOKEN];
if (secrets.some(s => !s || s.length < 20) || new Set(secrets).size !== 2)
  throw Error('ADMIN_PASSWORD ve INGEST_TOKEN farkli ve en az 20 karakter olmali.');
const dir = path.resolve(env.DATA_DIR || './data');
fs.mkdirSync(dir,{recursive:true});
const { createAuth, RANK } = require('./lib/auth.cjs');
const auth = createAuth({dir,adminPassword:secrets[0],adminEmail:env.ADMIN_EMAIL||'',maxFails:Number(env.LOGIN_MAX_FAILS)||8});
// E-posta bildirimi (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/MAIL_FROM tanimliysa acik). Gonderim hatalari istegi bozmaz; denetim kaydina yazilir.
const { createMailer } = require('./lib/mail.cjs');
const mail = createMailer(env,{onError:(e,kind)=>auth.audit('mail-failed',{user:'sistem'},{kind,error:String(e.message).slice(0,200)})});
const NOTIFY_KINDS = ['delete-request','delete-decision','import','import-auto','import-rejected','daily-summary','data-alert'];
const notifyOn = new Set(String(env.NOTIFY_ON||NOTIFY_KINDS.join(',')).split(',').map(x=>x.trim()).filter(k=>NOTIFY_KINDS.includes(k)));
const extraRecipients = String(env.NOTIFY_EMAILS||'').split(/[;,\s]+/).filter(Boolean);
const publicUrl = String(env.PUBLIC_URL||env.RENDER_EXTERNAL_URL||'').replace(/\/+$/,'');
const supers = (exclude='') => [...auth.recipients(['superadmin'],{exclude}),...extraRecipients];
const managers = (exclude='') => [...auth.recipients(['admin','superadmin'],{exclude}),...extraRecipients];
function notify(kind,to,subject,lines) {
  if (!mail.enabled || !notifyOn.has(kind)) return;
  mail.notify(kind,to,'[Kanal Doluluk] '+subject,lines.join('\n')+(publicUrl?'\n\nPanel: '+publicUrl+'/':''));
}
const scopeText = (spec,kind) => (kind==='prune'?'Eski kayıt temizliği · ':'')+(spec.channel||'Tüm kanallar')+' · '+(spec.start==='1970-01-01'?'... - ':spec.start+' - ')+spec.end;
const stateFile = path.join(dir,'archive.json.gz');
const worker = new vm.Script(fs.readFileSync(path.join(root,'worker.js'),'utf8'));
const XLSX = require('./public/xlsx.full.min.js');
const core = new vm.Script(fs.readFileSync(path.join(root,'core.js'),'utf8'));
const { DEFAULT_RULES } = require('./public/core.js');
const initial = {rows:[],coverage:[],verified:[],expectedChannels:[],rules:DEFAULT_RULES,updatedAt:null};
let snapshot = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : gzipSync(JSON.stringify(initial));
// Eski arsiv: global 'confirmed' bayragi kanal-gun bazli dogrulamaya cevrilir. Degistiyse true doner.
function normalize(s) {
  if (!s || !Array.isArray(s.rows) || !Array.isArray(s.coverage) || !s.rules || typeof s.rules !== 'object' || Array.isArray(s.rules)) throw bad('Gecersiz arsiv dosyasi.');
  const changed = !s.verified || !s.expectedChannels || 'confirmed' in s;
  s.verified = s.verified || (s.confirmed ? s.coverage.slice() : []);
  s.expectedChannels = s.expectedChannels || [];
  delete s.confirmed;
  return changed;
}
function bad(message,status=400) {return Object.assign(new Error(message),{status});}
let state = JSON.parse(gunzipSync(snapshot));
if (normalize(state)) snapshot = gzipSync(JSON.stringify(state));
// Anlik goruntuler: her veri degisikliginden once mevcut arsivin kopyasi alinir; son SNAPSHOT_KEEP adedi saklanir.
const snapDir = path.join(dir,'snapshots');
fs.mkdirSync(snapDir,{recursive:true});
const snapKeep = Math.max(1,Number(env.SNAPSHOT_KEEP)||14);
// Saklama siniri: arsivdeki en eski ve en yeni kayit arasi bu gunu asarsa yoneticiye temizlik uyarisi verilir.
const retentionDays = Math.max(7,Number(env.RETENTION_DAYS)||183);
let spanCache = {ref:null,val:null};
function archiveSpan() {
  if (spanCache.ref === state) return spanCache.val;
  let first = '', last = '';
  for (const r of state.rows) { const d = r[6]; if (!first || d < first) first = d; if (d > last) last = d; }
  const days = first ? Math.round((Date.parse(last)-Date.parse(first))/86400000)+1 : 0;
  spanCache = {ref:state,val:{first,last,days,rows:state.rows.length}};
  return spanCache.val;
}
function retentionWarning() {
  const s = archiveSpan();
  return s.days > retentionDays ? 'Arsivde '+s.days+' gunluk kayit var ('+s.first+' - '+s.last+'); saklama siniri '+retentionDays+' gun. Eski kayitlari panelden temizleyin.' : undefined;
}
const snapName = /^\d{8}T\d{9}Z-[a-z-]+\.json\.gz$/;
function listSnapshots() {
  return fs.readdirSync(snapDir).filter(n=>snapName.test(n)).sort().reverse().map(name=>{
    const st = fs.statSync(path.join(snapDir,name));
    return {name,size:st.size,createdAt:st.mtime.toISOString(),reason:name.slice(name.indexOf('Z-')+2,-8)};
  });
}
function takeSnapshot(reason) {
  if (!fs.existsSync(stateFile)) return; // henuz kaydedilmis arsiv yok
  const name = new Date().toISOString().replace(/[-:.]/g,'')+'-'+reason+'.json.gz';
  const file = path.join(snapDir,name), staged = file+'.tmp';
  try { fs.writeFileSync(staged,snapshot,{mode:0o600}); fs.renameSync(staged,file); }
  finally { fs.rmSync(staged,{force:true}); }
  for (const old of listSnapshots().slice(snapKeep)) fs.rmSync(path.join(snapDir,old.name),{force:true});
}
// Arsivi parca parca serilestirip sikistirir; parcalar arasinda olay dongusune birakir, boylece buyuk arsivde
// diger istekler (sayfa acma, filtreleme) yazim sirasinda beklemez ve tek bir dev JSON dizgisi olusmaz.
async function serialize(next) {
  const gz = zlib.createGzip({level:3}), chunks = [];
  gz.on('data',c=>chunks.push(c));
  const finished = new Promise((resolve,reject)=>{gz.on('end',resolve);gz.on('error',reject);});
  const { rows, ...rest } = next;
  const put = async s => { if (!gz.write(s)) await once(gz,'drain'); };
  await put('{"rows":[');
  for (let i=0;i<rows.length;i+=20000) {
    await put((i?',':'')+JSON.stringify(rows.slice(i,i+20000)).slice(1,-1));
    await new Promise(setImmediate);
  }
  await put('],'+JSON.stringify(rest).slice(1));
  gz.end(); await finished;
  return Buffer.concat(chunks);
}
// Durum degistiren islemler (yukleme, kural, geri yukleme) sirayla calisir; yazim sirasinda baska bir islem eski durumu okumaz.
let queue = Promise.resolve();
function exclusive(task) {
  const run = queue.then(task);
  queue = run.catch(()=>{});
  return run;
}
// reason verilirse yazmadan once anlik goruntu alinir; goruntu alinamazsa islem iptal edilir. Yalnizca exclusive() icinde cagrilir.
async function save(next,reason) {
  if (reason) takeSnapshot(reason);
  const staged = stateFile+'.'+randomUUID()+'.tmp';
  const zipped = await serialize(next);
  try { fs.writeFileSync(staged,zipped,{mode:0o600}); fs.renameSync(staged,stateFile); }
  finally { fs.rmSync(staged,{force:true}); }
  state=next; snapshot=zipped;
}
// ---- Silme talepleri: Yonetici gerekceyle talep eder, Super-yonetici onaylar/reddeder (Super-yonetici gerekceyle dogrudan siler).
const reqFile = path.join(dir,'delete-requests.json');
let requests = fs.existsSync(reqFile) ? JSON.parse(fs.readFileSync(reqFile,'utf8')).requests : [];
function saveRequests() {
  requests = requests.slice(-500);
  const staged = reqFile+'.'+randomUUID()+'.tmp';
  try { fs.writeFileSync(staged,JSON.stringify({requests}),{mode:0o600}); fs.renameSync(staged,reqFile); }
  finally { fs.rmSync(staged,{force:true}); }
}
const splitKey = k => { const p = k.lastIndexOf('|'); return [k.slice(0,p),k.slice(p+1)]; };
const inSpec = (spec,c,d) => d >= spec.start && d <= spec.end && (!spec.channel || c === spec.channel);
function countDelete(spec) {
  let removed = 0;
  for (const r of state.rows) if (inSpec(spec,r[0],r[6])) removed++;
  const coverageRemoved = state.coverage.filter(k => inSpec(spec,...splitKey(k))).length;
  return {removed,coverageRemoved,kept:state.rows.length-removed};
}
async function executeDelete(spec,ctx,meta) {
  const c = countDelete(spec);
  if (c.removed || c.coverageRemoved) {
    const keep = k => !inSpec(spec,...splitKey(k));
    await save({...state,rows:state.rows.filter(r=>!inSpec(spec,r[0],r[6])),coverage:state.coverage.filter(keep),verified:state.verified.filter(keep)},'delete');
    auth.audit('data-delete',ctx,{start:spec.start,end:spec.end,channel:spec.channel||'tum kanallar',...c,...meta});
  }
  return c;
}
function reasonOf(v) {
  const r = String(v==null?'':v).replace(/\s+/g,' ').trim();
  if (r.length < 10 || r.length > 500) throw bad('Silme gerekcesi 10-500 karakter olmali.');
  return r;
}
// exclusive() icinde cagrilir. Super-yonetici dogrudan siler; Yonetici icin bekleyen talep olusturur.
async function submitDeletion(spec,reason,ctx,who,isSuper,kind) {
  const rec = {id:randomUUID().slice(0,8),kind,start:spec.start,end:spec.end,channel:spec.channel,reason,requestedBy:who.username,requestedAt:new Date().toISOString(),status:'pending'};
  if (isSuper) {
    const result = await executeDelete(spec,ctx,{requestId:rec.id,reason,kind});
    Object.assign(rec,{status:'approved',auto:true,decidedBy:who.username,decidedAt:rec.requestedAt,result});
    requests.push(rec); saveRequests();
    return {done:true,id:rec.id,...result};
  }
  if (requests.filter(r=>r.status==='pending'&&r.requestedBy===who.username).length >= 5) throw bad('En fazla 5 bekleyen silme talebiniz olabilir. Birini iptal edin veya karar bekleyin.',409);
  const c = countDelete(spec);
  rec.impact = {removed:c.removed,coverageRemoved:c.coverageRemoved};
  requests.push(rec); saveRequests();
  auth.audit('delete-request',ctx,{id:rec.id,kind,start:spec.start,end:spec.end,channel:spec.channel||'tum kanallar',removed:c.removed,reason});
  notify('delete-request',supers(who.username),'Silme talebi onayınızı bekliyor',[who.username+' bir silme talebi açtı.','','Kapsam: '+scopeText(spec,kind),'Etkilenecek kayıt: '+c.removed,'Gerekçe: '+reason,'','Onaylamak veya reddetmek için panelde "Silme talepleri" ekranını açın.']);
  return {pending:true,id:rec.id,removed:c.removed};
}
function eq(a,b) {
  const x=Buffer.from(a||''),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
function send(res,code,data) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}
async function read(req,max) {
  if (Number(req.headers['content-length'])>max) {req.resume();throw bad('Dosya boyutu siniri asildi.',413);}
  const chunks=[];
  let size=0, oversized=false;
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>max) oversized=true;
    if(!oversized) chunks.push(chunk);
  }
  if(oversized) throw bad('Dosya boyutu siniri asildi.',413);
  return Buffer.concat(chunks);
}
// Ayristirma (agir kisim) ayri bir is parcaciginda; arsive birlestirme ana is parcaciginda ve kisadir.
const { Worker } = require('node:worker_threads');
const PARSE_TIMEOUT_MS = Number(env.PARSE_TIMEOUT_MS) || 180000;
function parseInThread(body,options) {
  return new Promise((resolve,reject)=>{
    const thread = new Worker(path.join(__dirname,'lib','parse-thread.cjs'),{workerData:{body,options:{start:options.start,end:options.end,requireDays:options.requireDays}},resourceLimits:{maxOldGenerationSizeMb:1536}});
    let settled=false;
    const finish=(fn,v)=>{ if(settled) return; settled=true; clearTimeout(timer); thread.terminate(); fn(v); };
    const timer=setTimeout(()=>finish(reject,bad('Dosya islenemedi: sure asildi. Dosyayi daha kisa donemlere bolup yukleyin.',408)),PARSE_TIMEOUT_MS);
    thread.once('message',m=>m.error?finish(reject,bad(m.error)):finish(resolve,m.fresh));
    thread.once('error',e=>{ console.error('parse thread:',e.message); finish(reject,bad(e.code==='ERR_WORKER_OUT_OF_MEMORY'?'Dosya islenemedi: bellek yetersiz. Dosyayi daha kisa donemlere bolup yukleyin.':'Dosya islenemedi.',e.code==='ERR_WORKER_OUT_OF_MEMORY'?413:400)); });
    thread.once('exit',code=>finish(reject,bad('Dosya islenemedi (islem beklenmedik sekilde kapandi).',500)));
  });
}
// Yukleme oncesi kontrol: eksik GRP, eksik gun/kanal, aralik yenilemede veri azalmasi. Bos donerse uyari yoktur.
function importWarnings(r) {
  const out=[],n0=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format,dm=core.dayMonth;
  if(!r) return out;
  if(!r.hasGrpCol) out.push('Dosyada GRP / GRPxSEC sütunu yok; bu günlerin GRP verisi boş kalır'+(r.archiveHasGrp?' (arşivdeki diğer günlerde GRP var).':'.'));
  else if(r.grpRows<r.total*0.98) out.push(n0(r.total-r.grpRows)+' kayıtta (%'+n0((r.total-r.grpRows)/r.total*100)+') GRP değeri boş.');
  if(r.gapDays.length) out.push('Dosyada hiç verisi olmayan gün: '+r.gapDays.slice(0,8).map(dm).join(', ')+(r.gapDays.length>8?' ve '+(r.gapDays.length-8)+' gün daha':'')+'.');
  if(r.absent.length) out.push('Beklenen kanallar dosyada yok: '+r.absent.slice(0,10).join(', ')+'.');
  if(r.partial.length) out.push(n0(r.partial.length)+' kanal-gün için veri yok (örn. '+r.partial.slice(0,4).map(k=>k.slice(0,k.lastIndexOf('|'))+' '+dm(k.slice(k.lastIndexOf('|')+1))).join(', ')+').');
  if(r.replaceRemoved>0&&r.total<r.replaceRemoved*0.8) out.push('Dönemi yenile: aralıktaki '+n0(r.replaceRemoved)+' mevcut kayıt silinip yerine '+n0(r.total)+' kayıt yazılacak (veri azalıyor).');
  return out;
}
async function parseImport(body,options) {
  const fresh = await parseInThread(body,options);
  let result;
  const ctx=vm.createContext({XLSX,onmessage:null,postMessage:m=>{result=m;}});
  core.runInContext(ctx);
  worker.runInContext(ctx);
  ctx.onmessage({data:{op:'init',rows:state.rows.slice(),coverage:state.coverage.slice(),verified:state.verified.slice()}});
  ctx.onmessage({data:{op:'merge',fresh,...options}});
  if(result.error) throw bad(result.error);
  return result;
}
const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/app.css':'app.css','/worker.js':'worker.js','/core.js':'core.js','/fflate.js':'fflate.js','/xlsx.full.min.js':'xlsx.full.min.js'};
// Giris sayfasinin kaynaklari oturumsuz da sunulur (icerik gizli degildir).
const publicAssets={'/login.js':'login.js','/login.css':'login.css','/logo-time.png':'logo-time.png','/logo-growity.png':'logo-growity.png'};
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const mime=name=>MIME[path.extname(name)];
// Icerik guvenlik politikasi: betikler yalniz kendi kaynagimizdan; satir ici betik, eval ve dis kaynak yok.
// Stil ozniteliklerine (grafik cubuk boyutlari) izin verilir; <style> bloklari ve dis stil dosyalari verilmez.
const CSP=["default-src 'none'","script-src 'self'","style-src 'self'","style-src-attr 'unsafe-inline'","img-src 'self' data:","font-src 'self'","connect-src 'self'","worker-src 'self'","manifest-src 'none'","base-uri 'none'","form-action 'self'","frame-ancestors 'none'","object-src 'none'"].join('; ');
function date(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
}
// ---- Gunluk ozet e-postasi: hafta ici 11:00 (Istanbul), e-postasi olan ve hesabi acik herkese. Ayni gun bir kez; sunucu kapaliysa 3 saat icinde yetisir.
const { buildDailySummary, istanbulNow } = require('./lib/summary.cjs');
const SUMMARY_DAYS = String(env.SUMMARY_DAYS||'1,2,3,4,5').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6);
const SUMMARY_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(env.SUMMARY_TIME||'11:00')) ? String(env.SUMMARY_TIME||'11:00') : '11:00';
const SUMMARY_MIN = Number(SUMMARY_TIME.split(':')[0])*60+Number(SUMMARY_TIME.split(':')[1]), SUMMARY_WINDOW = 180;
const summaryFile = path.join(dir,'summary-state.json');
let summaryState = {last:'',tries:{date:'',n:0,next:0}};
try { summaryState = {...summaryState,...JSON.parse(fs.readFileSync(summaryFile,'utf8'))}; } catch { /* ilk calistirma */ }
const saveSummaryState = () => { try { fs.writeFileSync(summaryFile,JSON.stringify(summaryState),{mode:0o600}); } catch(e) { console.error('summary state:',e.message); } };
const summaryNow = () => env.SUMMARY_NOW_OVERRIDE ? new Date(env.SUMMARY_NOW_OVERRIDE) : new Date();   // SUMMARY_NOW_OVERRIDE yalniz testler icindir
const mailImages = [['kd-time','logo-time.png'],['kd-growity','logo-growity.png']].map(([cid,f])=>({cid,type:'image/png',data:fs.readFileSync(path.join(root,f))}));
function summaryText(t) {
  const li = auth.readAudit(1,'import')[0];
  const s = buildDailySummary(state,{yesterday:t.yesterday,start:t.start,expectedChannels:state.expectedChannels,panelUrl:publicUrl,info:{updatedAt:state.updatedAt,updatedBy:state.updatedBy,lastImport:li}});
  return {...s,text:s.lines.join('\n')+(publicUrl?'\n\nPanel: '+publicUrl+'/':'')+'\n\nPowered by Growity AI Studio',images:mailImages};
}
async function sendDailySummary(t) {
  const to = auth.recipients(['viewer','admin','superadmin']);
  if (!to.length) return {sent:0,recipients:0};
  const s = summaryText(t);
  const r = await mail.notify('daily-summary',to,s.subject,s.text,s.html,s.images);
  return {...r,recipients:to.length,hasData:s.hasData};
}
// Veri on kontrolu: ozetten bir saat once (varsayilan 10:00) kritik eksik varsa (veri yok, eksik gun, beklenen kanal yok) Yonetici ve Super-yoneticilere bir kez bildirilir.
let summaryBusy = false;
async function alertCheck(t) {
  const from = SUMMARY_MIN-60;
  if (!notifyOn.has('data-alert')||!SUMMARY_DAYS.includes(t.dow)||t.minutes<from||t.minutes>=SUMMARY_MIN||summaryState.alert===t.date) return;
  const s = summaryText(t), crit = (s.status&&s.status.issues||[]).filter(x=>x.critical);
  summaryState.alert = t.date; saveSummaryState();                           // sorun olmasa da bugun tekrar bakilmaz
  if (!crit.length) return;
  const to = auth.recipients(['admin','superadmin']);
  if (!to.length) return;
  const text = ['Günlük özet '+SUMMARY_TIME+'\'da gönderilecek; şu an verilerde eksik var:','',...crit.map(x=>'⚠ '+x.text),'','Eksik veriyi yüklerseniz özet tam gider. Yüklemeden bırakırsanız özet, eksik bilgiyle birlikte (uyarı yazarak) gönderilir.',...(publicUrl?['','Panel: '+publicUrl+'/']:[])].join('\n');
  const r = await mail.notify('data-alert',to,'[Kanal Doluluk] Veri eksik — özetten önce kontrol edin',text);
  auth.audit('data-alert',{user:'sistem'},{date:t.yesterday,issues:crit.map(x=>x.text),recipients:to.length,sent:r.sent});
}
async function summaryTick() {
  if (summaryBusy||!mail.enabled) return;
  const t = istanbulNow(summaryNow());
  try { await alertCheck(t); } catch(e) { console.error('data alert:',e.message); }
  if (!notifyOn.has('daily-summary')) return;
  if (!SUMMARY_DAYS.includes(t.dow)||t.minutes<SUMMARY_MIN||t.minutes>=SUMMARY_MIN+SUMMARY_WINDOW||summaryState.last===t.date) return;
  if (summaryState.tries.date===t.date&&(summaryState.tries.n>=3||Date.now()<summaryState.tries.next)) return;
  summaryBusy = true;
  try {
    const r = await sendDailySummary(t);
    if (r.recipients===0||r.sent>0) { summaryState.last = t.date; auth.audit('daily-summary',{user:'sistem'},{date:t.yesterday,recipients:r.recipients,sent:r.sent,hasData:r.hasData}); }
    else summaryState.tries = {date:t.date,n:(summaryState.tries.date===t.date?summaryState.tries.n:0)+1,next:Date.now()+10*60*1000};   // gonderilemedi: 10 dk arayla en fazla 3 deneme
    saveSummaryState();
  } catch(e) { console.error('daily summary:',e.message); }
  finally { summaryBusy = false; }
}
if (mail.enabled) { const ms = Number(env.SUMMARY_TICK_MS)||60000; setInterval(summaryTick,ms).unref(); setTimeout(summaryTick,Math.min(ms,2000)).unref(); }
function clientIp(req) {
  const f=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean);
  return f.length?f[f.length-1]:(req.socket.remoteAddress||'');
}
const secureCookie=req=>env.COOKIE_SECURE==='1'||req.headers['x-forwarded-proto']==='https';
const cookieHeader=(req,value,maxAge)=>'sid='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secureCookie(req)?'; Secure':'');
async function json(req,max=8192) {
  const raw=await read(req,max);
  try {return JSON.parse(raw);} catch {throw bad('Gecersiz istek.');}
}
function panel(req) { if(req.headers['x-panel-request']!=='1') throw bad('Gecersiz istek.',403); }
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',CSP);
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(secureCookie(req)) res.setHeader('Strict-Transport-Security','max-age=31536000');
  try {
    const url=new URL(req.url,'http://localhost');
    const route=url.pathname, method=req.method, ip=clientIp(req);
    if(route==='/healthz'&&method==='GET') return send(res,200,{ok:true});
    if(method==='GET'&&Object.hasOwn(publicAssets,route)) {
      res.writeHead(200,{'Content-Type':mime(publicAssets[route])});
      return res.end(fs.readFileSync(path.join(root,publicAssets[route])));
    }
    const me=auth.identify(req.headers.cookie);
    if(route==='/login'&&method==='GET') {
      if(me) {res.writeHead(302,{Location:'/'});return res.end();}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end(fs.readFileSync(path.join(root,'login.html')));
    }
    if(route==='/api/login'&&method==='POST') {
      panel(req);
      const input=await json(req,2048);
      try {
        const r=await auth.login(input&&input.username,input&&input.password,ip);
        res.setHeader('Set-Cookie',cookieHeader(req,r.cookie,43200));
        return send(res,200,{ok:true,username:r.username,role:r.role});
      } catch(err) {
        if(err.retryAfter) res.setHeader('Retry-After',err.retryAfter);
        throw err;
      }
    }
    const machine=route==='/api/import'&&method==='POST'&&eq(req.headers.authorization,'Bearer '+secrets[1]);
    if(!me&&!machine) {
      if(route.startsWith('/api/')) return send(res,401,{error:'Oturum gerekli.'});
      if(method==='GET') {res.writeHead(302,{Location:'/login'});return res.end();}
      return send(res,401,{error:'Oturum gerekli.'});
    }
    const who=machine?{username:'ingest',role:'machine'}:me;
    const ctx={user:who.username,role:who.role,ip};
    // Ekip (0) goruntuler ve Excel alir; Yonetici (1) veri yukler/siler, kural ve anlik goruntuleri yonetir; Super-yonetici (2) ayrica kullanicilari ve denetim kaydini yonetir.
    const rank=machine?-1:(RANK[me.role]??0), isAdmin=rank>=1, isSuper=rank>=2;
    const need=min=>{ if(rank<min) {auth.audit('denied',ctx,{route,method});throw bad(min>=2?'Super yonetici yetkisi gerekli.':'Yonetici yetkisi gerekli.',403);} };
    if(method==='GET'&&Object.hasOwn(assets,route)&&me) {
      const name=assets[route];
      res.writeHead(200,{'Content-Type':mime(name)});
      return res.end(fs.readFileSync(path.join(root,name)));
    }
    if(route==='/api/session'&&method==='GET'&&me) return send(res,200,{admin:isAdmin,superadmin:isSuper,username:me.username,role:me.role,breakGlass:me.breakGlass,retentionDays});
    if(route==='/api/logout'&&method==='POST'&&me) {
      panel(req);
      auth.audit('logout',ctx);
      res.setHeader('Set-Cookie',cookieHeader(req,'',0));
      return send(res,200,{ok:true});
    }
    if(route==='/api/password'&&method==='POST'&&me) {
      panel(req);
      const input=await json(req,2048);
      const r=await auth.changeOwnPassword(me,input.current,input.next);
      auth.audit('password-change',ctx);
      res.setHeader('Set-Cookie',cookieHeader(req,r.cookie,43200));
      return send(res,200,{ok:true});
    }
    if(route==='/api/users'&&method==='GET') {need(2); return send(res,200,{users:auth.listUsers(),mail:{enabled:mail.enabled,missing:mail.missing,from:mail.from,notifyOn:[...notifyOn],extraRecipients:extraRecipients.length,summary:{enabled:notifyOn.has('daily-summary'),time:SUMMARY_TIME,days:SUMMARY_DAYS}}});}
    if(route==='/api/summary-test'&&method==='POST') {
      need(2); panel(req);
      if(url.searchParams.get('to')==='supers') {   // deneme: yalniz e-postasi olan tum Super-yoneticilere (diger kullanicilara gitmez)
        const list=auth.recipients(['superadmin']);
        if(!list.length) throw bad('E-postası tanımlı Süper-yönetici yok. Kullanıcılar > E-posta bölümünden ekleyin.');
        const s=summaryText(istanbulNow(summaryNow()));
        const failed=[];
        for(const to of list) { try { await mail.sendNow(to,s.subject,s.text,s.html,s.images); } catch(err) { failed.push(to+': '+String(err.message).slice(0,120)); } }
        auth.audit('summary-test',ctx,{ok:failed.length===0,to:'supers',sent:list.length-failed.length,failed});
        if(failed.length===list.length) throw bad('E-posta gonderilemedi: '+failed[0],502);
        return send(res,200,{ok:true,sent:list.length-failed.length,total:list.length,failed,day:s.day});
      }
      const to=auth.emailFor(me.username);
      if(!to) throw bad(me.breakGlass?'Acil durum (admin) hesabinin e-posta adresi yoktur. Deneme icin kisi hesabinizla girin.':'Hesabiniza bir e-posta adresi ekleyin (Kullanicilar > E-posta); ozet oraya gider.');
      const s=summaryText(istanbulNow(summaryNow()));
      try { await mail.sendNow(to,s.subject,s.text,s.html,s.images); }
      catch(err) { auth.audit('summary-test',ctx,{ok:false,error:String(err.message).slice(0,200)}); throw bad('E-posta gonderilemedi: '+String(err.message).slice(0,200),502); }
      auth.audit('summary-test',ctx,{ok:true,to});
      return send(res,200,{ok:true,to,day:s.day});
    }
    if(route==='/api/summary-preview'&&method==='GET') {
      need(2);
      const s=summaryText(istanbulNow(summaryNow()));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src-attr 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'"});
      return res.end(s.html.replace('cid:kd-time','/logo-time.png').replace('cid:kd-growity','/logo-growity.png'));
    }
    if(route==='/api/mail-test'&&method==='POST') {
      need(2); panel(req);
      const to=auth.emailFor(me.username);
      if(!to) throw bad(me.breakGlass?'Acil durum (admin) hesabinin e-posta adresi yoktur. Test icin kisi hesabinizla girin.':'Hesabiniza bir e-posta adresi ekleyin (Kullanicilar > E-posta); test e-postasi oraya gider.');
      try { await mail.sendNow(to,'[Kanal Doluluk] Test e-postası','Bu bir test e-postasıdır. E-posta bildirimi çalışıyor.'+(publicUrl?'\n\nPanel: '+publicUrl+'/':'')); }
      catch(err) { auth.audit('mail-test',ctx,{ok:false,error:String(err.message).slice(0,200)}); throw bad('E-posta gonderilemedi: '+String(err.message).slice(0,200),502); }
      auth.audit('mail-test',ctx,{ok:true,to});
      return send(res,200,{ok:true,to});
    }
    if(route==='/api/users'&&method==='POST') {
      need(2); panel(req);
      const input=await json(req,2048);
      const r=await auth.manage(me,input);
      auth.audit(r.event,ctx,r.detail);
      return send(res,200,{users:auth.listUsers()});
    }
    if(route==='/api/audit'&&method==='GET') {
      need(2);
      const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||200));
      const event=/^[a-z-]{0,40}$/.test(url.searchParams.get('event')||'')?url.searchParams.get('event')||'':'';
      return send(res,200,{entries:auth.readAudit(limit,event)});
    }
    if(route==='/api/audit/export'&&method==='POST'&&me) {
      panel(req);
      const input=await json(req,2048);
      const clip=v=>String(v==null?'':v).slice(0,40);
      auth.audit('export',ctx,{view:clip(input.view),start:clip(input.start),end:clip(input.end),filters:clip(input.filters)});
      return send(res,200,{ok:true});
    }
    if(route==='/api/snapshots'&&method==='GET') {
      need(1);
      return send(res,200,{keep:snapKeep,snapshots:listSnapshots()});
    }
    if(route==='/api/state'&&method==='GET'&&me) {
      res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'});
      return res.end(snapshot);
    }
    if(route==='/api/delete-requests'&&method==='GET') {
      need(1);
      const mine=isSuper?requests:requests.filter(r=>r.requestedBy===me.username);
      const list=mine.slice(-200).reverse().map(r=>r.status==='pending'?{...r,impact:countDelete(r)}:r);
      return send(res,200,{requests:list,pending:mine.filter(r=>r.status==='pending').length});
    }
    if(route==='/api/delete-requests'&&method==='POST') {
      need(1); panel(req);
      const input=await json(req,2048);
      return await exclusive(async()=>{
        const rec=requests.find(r=>r.id===input.id);
        if(!rec) throw bad('Talep bulunamadi.',404);
        if(rec.status!=='pending') throw bad('Bu talep zaten sonuclandirilmis.',409);
        const note=String(input.note||'').replace(/\s+/g,' ').trim().slice(0,300);
        const detail={id:rec.id,requestedBy:rec.requestedBy,start:rec.start,end:rec.end,channel:rec.channel||'tum kanallar',reason:rec.reason,note};
        if(input.op==='cancel') {
          if(rec.requestedBy!==me.username&&!isSuper) {auth.audit('denied',ctx,{route,method});throw bad('Yalnizca talebi acan kisi veya super-yonetici iptal edebilir.',403);}
          Object.assign(rec,{status:'cancelled',decidedBy:me.username,decidedAt:new Date().toISOString(),note});
          auth.audit('delete-cancel',ctx,detail);
        } else if(input.op==='approve'||input.op==='reject') {
          need(2);
          if(rec.requestedBy===me.username) throw bad('Kendi talebinizi onaylayamaz veya reddedemezsiniz.',403);
          if(input.op==='reject') {
            Object.assign(rec,{status:'rejected',decidedBy:me.username,decidedAt:new Date().toISOString(),note});
            auth.audit('delete-reject',ctx,detail);
          } else {
            const result=await executeDelete(rec,ctx,{requestId:rec.id,reason:rec.reason,kind:rec.kind,requestedBy:rec.requestedBy,approvedBy:me.username});
            Object.assign(rec,{status:'approved',decidedBy:me.username,decidedAt:new Date().toISOString(),note,result});
            auth.audit('delete-approve',ctx,{...detail,...result});
          }
        } else throw bad('Gecersiz islem.');
        saveRequests();
        if(rec.status==='approved'||rec.status==='rejected'||(rec.status==='cancelled'&&rec.requestedBy!==me.username)) {
          const word={approved:'onaylandı',rejected:'reddedildi',cancelled:'iptal edildi'}[rec.status];
          notify('delete-decision',[auth.emailFor(rec.requestedBy)],'Silme talebiniz '+word,['Silme talebiniz '+me.username+' tarafından '+word+'.','','Kapsam: '+scopeText(rec,rec.kind),'Gerekçe: '+rec.reason,...(rec.status==='approved'?['Silinen kayıt: '+rec.result.removed]:[]),...(note?['Not: '+note]:[])]);
        }
        return send(res,200,{ok:true,status:rec.status,result:rec.result});
      });
    }
    if(method==='POST'&&['/api/import','/api/rules','/api/restore','/api/prune','/api/delete'].includes(route)) {
      if(!machine) {need(1); panel(req);}
      if(route==='/api/delete') {
        // Tarih araligi (+ istege bagli kanal) bazinda veri silme. dry:true yalniz sayar; gercek silme gerekce ister ve Yonetici icin onaya gider.
        const input=await json(req,4096);
        const spec={start:String(input.start||''),end:String(input.end||''),channel:input.channel==null?'':String(input.channel)};
        if(!date(spec.start)||!date(spec.end)||spec.end<spec.start||spec.channel.length>60) throw bad('Gecerli bir tarih araligi secin (baslangic <= bitis).');
        if(input.dry===true) return send(res,200,{...countDelete(spec),dry:true});
        const reason=reasonOf(input.reason);
        return await exclusive(async()=>send(res,200,await submitDeletion(spec,reason,ctx,me,isSuper,'range')));
      }
      if(route==='/api/prune') {
        // Saklama suresinden eski kayitlari silme: ayni gerekce + onay akisina girer.
        const keep=Number(url.searchParams.get('keep')||retentionDays), dry=url.searchParams.get('dry')==='1';
        if(!Number.isInteger(keep)||keep<7||keep>1100) throw bad('Gecersiz saklama suresi.');
        const input=await json(req,4096);
        return await exclusive(async()=>{
          const {last}=archiveSpan();
          if(!last) return send(res,200,{removed:0,kept:0,cutoff:null,dry});
          const cutoff=new Date(Date.parse(last+'T12:00:00Z')-(keep-1)*86400000).toISOString().slice(0,10);
          const spec={start:'1970-01-01',end:new Date(Date.parse(cutoff+'T12:00:00Z')-86400000).toISOString().slice(0,10),channel:''};
          const c=countDelete(spec);
          if(dry||(!c.removed&&!c.coverageRemoved)) return send(res,200,{removed:c.removed,kept:c.kept,cutoff,dry});
          const out=await submitDeletion(spec,reasonOf(input.reason),ctx,me,isSuper,'prune');
          return send(res,200,{...out,removed:c.removed,kept:c.kept,cutoff,dry:false});
        });
      }
      if(route==='/api/restore') {
        need(2); // eski bir goruntuye donmek yeni verileri silebilir: silme ile ayni yetki duzeyi
        const name=url.searchParams.get('name')||'';
        if(!snapName.test(name)||!listSnapshots().some(s=>s.name===name)) throw bad('Anlik goruntu bulunamadi.',404);
        return await exclusive(async()=>{
          let restored;
          try {restored=JSON.parse(gunzipSync(fs.readFileSync(path.join(snapDir,name))));} catch {throw bad('Anlik goruntu okunamadi.');}
          normalize(restored);
          await save(restored,'restore');
          auth.audit('restore',ctx,{snapshot:name,total:restored.rows.length});
          return send(res,200,{ok:true,total:restored.rows.length});
        });
      }
      if(route==='/api/import') {
        const mode=machine?'replace':(url.searchParams.get('mode')||'append');
        const start=url.searchParams.get('start')||'',end=url.searchParams.get('end')||'';
        if(!['append','replace'].includes(mode)||(mode==='replace'&&(!date(start)||!date(end)||end<start||Date.parse(end)-Date.parse(start)>366*86400000))) throw bad('Gecersiz yenileme araligi.');
        const body=await read(req,35*1024*1024);
        if(body.length<4||body.readUInt32LE(0)!==0x04034b50) throw bad('Gecerli bir XLSX dosyasi secin.');
        return await exclusive(async()=>{
          let m;
          try {m=await parseImport(body,{mode,start,end,requireDays:machine,expected:machine?state.expectedChannels:[],checkExpected:state.expectedChannels,complete:!machine&&url.searchParams.get('complete')==='1'});}
          catch(err) {auth.audit('import-rejected',ctx,{mode,start,end,bytes:body.length,reason:String(err.message).slice(0,200)});if(machine)notify('import-rejected',supers(),'Otomatik veri aktarımı REDDEDİLDİ',['Windows otomatik aktarımı şu nedenle reddedildi:',String(err.message).slice(0,300),'','Aralık: '+start+' - '+end,'Arşive hiçbir şey yazılmadı. ADEX dosyasını ve betik günlüğünü kontrol edin.']);throw err;}
          const warnings=importWarnings(m.report);
          if(warnings.length&&!machine&&url.searchParams.get('force')!=='1') {
            auth.audit('import-warned',ctx,{mode,start,end,bytes:body.length,warnings});
            return send(res,409,{needsConfirm:true,warnings,error:'Dosyada eksik veya şüpheli veri var: '+warnings.join(' ')});
          }
          await save({...state,rows:m.rows,coverage:m.coverage,verified:m.verified,updatedAt:new Date().toISOString(),updatedBy:who.username},machine?'import-auto':'import-'+mode);
          auth.audit('import',ctx,{mode,start,end,complete:!machine&&url.searchParams.get('complete')==='1',bytes:body.length,added:m.added,updated:m.updated,skipped:m.skipped,total:m.rows.length,missingChannels:m.missingChannels,warnings,forced:!machine&&warnings.length>0});
          const retWarn=retentionWarning();
          notify(machine?'import-auto':'import',managers(machine?'':who.username),machine?'Otomatik veri aktarımı tamamlandı':'Yeni veri yüklendi',[
            (machine?'Otomatik aktarım (Windows)':who.username+' (panel)')+' veri yükledi.','',
            'Yöntem: '+(machine?'otomatik, dönemi yenile':mode==='replace'?'dönemi yenile':'ekle')+(mode==='replace'?' ('+start+' - '+end+')':''),
            'Eklenen: '+m.added+' · Güncellenen: '+m.updated+' · Atlanan (tekrar): '+m.skipped,
            'Arşivde toplam: '+m.rows.length+' kayıt',
            ...(m.missingChannels&&m.missingChannels.length?['','UYARI: dosyada eksik kanallar: '+m.missingChannels.join('; ')]:[]),
            ...(warnings.length?['',(machine?'UYARI':'UYARI (yükleyen onayladı)')+':',...warnings.map(w=>'- '+w)]:[]),
            ...(retWarn?['','UYARI: '+retWarn]:[])]);
          return send(res,200,{added:m.added,updated:m.updated,skipped:m.skipped,total:m.rows.length,missingChannels:m.missingChannels,warning:retWarn});
        });
      }
      const raw=await read(req,512*1024);
      let input;
      try {input=JSON.parse(raw);} catch {throw bad('Gecersiz kural verisi.');}
      if(!input||!input.rules||Array.isArray(input.rules)||typeof input.rules!=='object'||!Array.isArray(input.expectedChannels)||input.expectedChannels.length>40||input.expectedChannels.some(c=>typeof c!=='string'||!c.trim()||c.length>60)||Object.entries(input.rules).some(([k,v])=>k.length>320||!k.includes('|')||!['include','exclude','review'].includes(v))) throw bad('Gecersiz kural verisi.');
      const expectedChannels=[...new Set(input.expectedChannels.map(c=>c.trim()))];
      return await exclusive(async()=>{
        const changed=[...new Set([...Object.keys(state.rules),...Object.keys(input.rules)])].filter(k=>state.rules[k]!==input.rules[k]);
        await save({...state,rules:input.rules,expectedChannels});
        auth.audit('rules',ctx,{changed:changed.slice(0,30).map(k=>k+' -> '+(input.rules[k]||'silindi')),changedCount:changed.length,expectedChannels});
        return send(res,200,{ok:true});
      });
    }
    send(res,404,{error:'Bulunamadi.'});
  } catch(err) {
    if(!err.status) console.error(err.message);
    if(!res.headersSent) send(res,err.status||500,{error:err.status?err.message:'Sunucu islemi tamamlanamadi.'});
    else res.destroy();
  }
}).listen(Number(env.PORT||3000),'0.0.0.0');
