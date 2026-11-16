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
const auth = createAuth({dir,adminPassword:secrets[0],maxFails:Number(env.LOGIN_MAX_FAILS)||8});
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
function parseImport(body,options) {
  let result;
  const ctx=vm.createContext({XLSX,onmessage:null,postMessage:m=>{result=m;}});
  core.runInContext(ctx);
  worker.runInContext(ctx);
  ctx.onmessage({data:{op:'init',rows:state.rows.slice(),coverage:state.coverage.slice(),verified:state.verified.slice()}});
  ctx.onmessage({data:{op:'import',buffer:new Uint8Array(body),...options}});
  if(result.error) throw bad(result.error);
  return result;
}
const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/app.css':'app.css','/worker.js':'worker.js','/core.js':'core.js','/fflate.js':'fflate.js','/xlsx.full.min.js':'xlsx.full.min.js'};
// Giris sayfasinin kaynaklari oturumsuz da sunulur (icerik gizli degildir).
const publicAssets={'/login.js':'login.js','/login.css':'login.css'};
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const mime=name=>MIME[path.extname(name)];
// Icerik guvenlik politikasi: betikler yalniz kendi kaynagimizdan; satir ici betik, eval ve dis kaynak yok.
// Stil ozniteliklerine (grafik cubuk boyutlari) izin verilir; <style> bloklari ve dis stil dosyalari verilmez.
const CSP=["default-src 'none'","script-src 'self'","style-src 'self'","style-src-attr 'unsafe-inline'","img-src 'self' data:","font-src 'self'","connect-src 'self'","worker-src 'self'","manifest-src 'none'","base-uri 'none'","form-action 'self'","frame-ancestors 'none'","object-src 'none'"].join('; ');
function date(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
}
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
    if(route==='/api/users'&&method==='GET') {need(2); return send(res,200,{users:auth.listUsers()});}
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
    if(method==='POST'&&['/api/import','/api/rules','/api/restore','/api/prune'].includes(route)) {
      if(!machine) {need(1); panel(req);}
      if(route==='/api/prune') {
        const keep=Number(url.searchParams.get('keep')||retentionDays), dry=url.searchParams.get('dry')==='1';
        if(!Number.isInteger(keep)||keep<7||keep>1100) throw bad('Gecersiz saklama suresi.');
        return await exclusive(async()=>{
          const {last}=archiveSpan();
          if(!last) return send(res,200,{removed:0,kept:0,cutoff:null,dry});
          const cutoff=new Date(Date.parse(last+'T12:00:00Z')-(keep-1)*86400000).toISOString().slice(0,10);
          const dayOf=k=>k.slice(k.lastIndexOf('|')+1);
          const rows=state.rows.filter(r=>r[6]>=cutoff);
          const coverage=state.coverage.filter(k=>dayOf(k)>=cutoff), verified=state.verified.filter(k=>dayOf(k)>=cutoff);
          const removed=state.rows.length-rows.length;
          if(!dry&&(removed||coverage.length!==state.coverage.length||verified.length!==state.verified.length)) {
            await save({...state,rows,coverage,verified},'prune');
            auth.audit('prune',ctx,{keep,cutoff,removed,kept:rows.length});
          }
          return send(res,200,{removed,kept:rows.length,cutoff,dry});
        });
      }
      if(route==='/api/restore') {
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
          try {m=parseImport(body,{mode,start,end,requireDays:machine,expected:machine?state.expectedChannels:[],complete:!machine&&url.searchParams.get('complete')==='1'});}
          catch(err) {auth.audit('import-rejected',ctx,{mode,start,end,bytes:body.length,reason:String(err.message).slice(0,200)});throw err;}
          await save({...state,rows:m.rows,coverage:m.coverage,verified:m.verified,updatedAt:new Date().toISOString(),updatedBy:who.username},machine?'import-auto':'import-'+mode);
          auth.audit('import',ctx,{mode,start,end,complete:!machine&&url.searchParams.get('complete')==='1',bytes:body.length,added:m.added,updated:m.updated,skipped:m.skipped,total:m.rows.length,missingChannels:m.missingChannels});
          return send(res,200,{added:m.added,updated:m.updated,skipped:m.skipped,total:m.rows.length,missingChannels:m.missingChannels,warning:retentionWarning()});
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
