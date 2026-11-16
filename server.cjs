const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { timingSafeEqual, randomUUID } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const root = path.join(__dirname,'public');
const env = process.env;
const secrets = [env.ADMIN_PASSWORD, env.TEAM_PASSWORD, env.INGEST_TOKEN];
if (secrets.some(s => !s || s.length < 20) || new Set(secrets).size !== 3)
  throw Error('ADMIN_PASSWORD, TEAM_PASSWORD ve INGEST_TOKEN farkli ve en az 20 karakter olmali.');
const dir = path.resolve(env.DATA_DIR || './data');
fs.mkdirSync(dir,{recursive:true});
const stateFile = path.join(dir,'archive.json.gz');
const worker = new vm.Script(fs.readFileSync(path.join(root,'worker.js'),'utf8'));
const XLSX = require('./public/xlsx.full.min.js');
const core = new vm.Script(fs.readFileSync(path.join(root,'core.js'),'utf8'));
const { DEFAULT_RULES } = require('./public/core.js');
const initial = {rows:[],coverage:[],rules:DEFAULT_RULES,confirmed:false,updatedAt:null};
let snapshot = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : gzipSync(JSON.stringify(initial));
let state = JSON.parse(gunzipSync(snapshot));
function save(next) {
  const staged = stateFile+'.'+randomUUID()+'.tmp';
  const zipped = gzipSync(JSON.stringify(next));
  try { fs.writeFileSync(staged,zipped,{mode:0o600}); fs.renameSync(staged,stateFile); }
  finally { fs.rmSync(staged,{force:true}); }
  state=next; snapshot=zipped;
}
function eq(a,b) {
  const x=Buffer.from(a||''),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
function role(req) {
  const auth=req.headers.authorization||'';
  if (!auth.startsWith('Basic ')) return '';
  const value=Buffer.from(auth.slice(6),'base64').toString();
  if (eq(value,'admin:'+secrets[0])) return 'admin';
  if (eq(value,'time:'+secrets[1])) return 'viewer';
  return '';
}
function send(res,code,data) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}
function bad(message,status=400) {return Object.assign(new Error(message),{status});}
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
  ctx.onmessage({data:{op:'init',rows:state.rows.slice(),coverage:state.coverage.slice()}});
  ctx.onmessage({data:{op:'import',buffer:new Uint8Array(body),...options}});
  if(result.error) throw bad(result.error);
  return result;
}
const assets={'/':'index.html','/index.html':'index.html','/worker.js':'worker.js','/core.js':'core.js','/fflate.js':'fflate.js','/xlsx.full.min.js':'xlsx.full.min.js'};
function date(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
}
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  try {
    const url=new URL(req.url,'http://localhost');
    const route=url.pathname, method=req.method;
    if(route==='/healthz'&&method==='GET') return send(res,200,{ok:true});
    const access=role(req);
    const machine=route==='/api/import'&&method==='POST'&&eq(req.headers.authorization,'Bearer '+secrets[2]);
    if(!access&&!machine) {
      if(route.startsWith('/api/')) return send(res,401,{error:'Yetki gerekli.'});
      res.setHeader('WWW-Authenticate','Basic realm="TIME Kanal Doluluk", charset="UTF-8"');
      return send(res,401,{error:'TIME ekip girisi gerekli.'});
    }
    if(method==='GET'&&Object.hasOwn(assets,route)) {
      const name=assets[route];
      res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8'});
      return res.end(fs.readFileSync(path.join(root,name)));
    }
    if(route==='/api/session'&&method==='GET') return send(res,200,{admin:access==='admin'});
    if(route==='/api/state'&&method==='GET') {
      res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'});
      return res.end(snapshot);
    }
    if(method==='POST'&&['/api/import','/api/rules'].includes(route)) {
      if(!machine&&(access!=='admin'||req.headers['x-panel-request']!=='1'))
        return send(res,403,{error:'Yonetici yetkisi gerekli.'});
      if(route==='/api/import') {
        const mode=machine?'replace':(url.searchParams.get('mode')||'append');
        const start=url.searchParams.get('start')||'',end=url.searchParams.get('end')||'';
        if(!['append','replace'].includes(mode)||(mode==='replace'&&(!date(start)||!date(end)||end<start||Date.parse(end)-Date.parse(start)>366*86400000))) throw bad('Gecersiz yenileme araligi.');
        const body=await read(req,35*1024*1024);
        if(body.length<4||body.readUInt32LE(0)!==0x04034b50) throw bad('Gecerli bir XLSX dosyasi secin.');
        const m=parseImport(body,{mode,start,end,requireDays:machine,complete:!machine&&url.searchParams.get('complete')==='1'});
        save({...state,rows:m.rows,coverage:m.coverage,confirmed:state.confirmed&&!machine&&url.searchParams.get('complete')==='1',updatedAt:new Date().toISOString()});
        return send(res,200,{added:m.added,updated:m.updated,skipped:m.skipped,total:m.rows.length});
      }
      const raw=await read(req,512*1024);
      let input;
      try {input=JSON.parse(raw);} catch {throw bad('Gecersiz kural verisi.');}
      if(!input||!input.rules||Array.isArray(input.rules)||typeof input.rules!=='object'||typeof input.confirmed!=='boolean'||Object.entries(input.rules).some(([k,v])=>k.length>320||!k.includes('|')||!['include','exclude','review'].includes(v))) throw bad('Gecersiz kural verisi.');
      save({...state,rules:input.rules,confirmed:input.confirmed});
      return send(res,200,{ok:true});
    }
    send(res,404,{error:'Bulunamadi.'});
  } catch(err) {
    if(!err.status) console.error(err.message);
    if(!res.headersSent) send(res,err.status||500,{error:err.status?err.message:'Sunucu islemi tamamlanamadi.'});
    else res.destroy();
  }
}).listen(Number(env.PORT||3000),'0.0.0.0');
