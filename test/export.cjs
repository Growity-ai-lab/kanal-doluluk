const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const XLSX=require('../public/xlsx.full.min.js'),fflate=require('../public/fflate.js');
let script=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
script=script.slice(0,script.lastIndexOf("$('loadBtn').hidden=true"));
const el={querySelectorAll:()=>[],remove(){},addEventListener(){}};
const ctx=vm.createContext({XLSX,fflate,document:{getElementById:()=>el,querySelectorAll:()=>[]},Worker:class{}});
new vm.Script(fs.readFileSync(require.resolve('../public/core.js'),'utf8')).runInContext(ctx);
new vm.Script(script).runInContext(ctx);
ctx.inputRows=[['Atv','Gıda','Gıda','Firma','Ürün','Marka','2026-11-13','Normal Spot','Kusak Spot',64800,64830,30]];
const result=new vm.Script(`(()=>{const f={start:'2026-11-13',end:'2026-11-13',granularity:'day',group:'',channel:'',sector:'',firm:'',brand:'',view:'channel',hourStart:7,bands:['OPT','Erken PT','PT','Geç PT']};const v=analyze(inputRows,f,['Atv|2026-11-13'],DEFAULT_RULES);return {bytes:buildExport({...v,f}),seconds:v.included};})()`).runInContext(ctx);
assert.equal(result.seconds,30);
const z=fflate.unzipSync(result.bytes);
assert.ok(z['xl/charts/chart1.xml']);
assert.ok(z['xl/charts/chart2.xml']);
assert.ok(XLSX.read(result.bytes,{type:'array'}).SheetNames.length>=5);
console.log('OK: calculation and Excel workbook with both charts.');

// ---- GRP, saatlik ve karsilastirma sayfalari
{
  const ctx2=vm.createContext({XLSX,fflate,document:{getElementById:()=>el,querySelectorAll:()=>[]},Worker:class{}});
  new vm.Script(fs.readFileSync(require.resolve('../public/core.js'),'utf8')).runInContext(ctx2);
  new vm.Script(script).runInContext(ctx2);
  ctx2.inputRows=[
    ['Atv','Gıda','Gıda','Firma A','Ürün','Marka A','2026-11-13','Normal Spot','Kusak Spot',64800,64830,30,0.6,18],       // 18:00 (Erken PT)
    ['Atv','Gıda','Gıda','Firma B','Ürün','Marka B','2026-11-13','Normal Spot','Kusak Spot',36000,36020,20,0.1,2],       // 10:00 (OPT)
    ['Atv','Gıda','Gıda','Firma A','Ürün','Marka A','2026-11-06','Normal Spot','Kusak Spot',64800,64815,15,0.2,3]];      // onceki hafta
  const out=new vm.Script(`(()=>{const mk=(view,s,e)=>({start:s,end:e,granularity:'day',group:'',channel:'',sector:'',firm:'',brand:'',view,hourStart:7,bands:['OPT','Erken PT','PT','Geç PT']});
    const cov=['Atv|2026-11-13','Atv|2026-11-06'];const res={};
    for(const view of ['channel','brand']){const f=mk(view,'2026-11-13','2026-11-13'),f2=mk(view,'2026-11-06','2026-11-06');
      const v=analyze(inputRows,f,cov,DEFAULT_RULES,cov),c=analyze(inputRows,f2,cov,DEFAULT_RULES,cov);
      res[view]=buildExport({...v,f,cmp:c,cmpRange:{start:f2.start,end:f2.end}});}
    const f=mk('channel','2026-11-13','2026-11-13'),v=analyze(inputRows,f,cov,DEFAULT_RULES,cov);res.nocmp=buildExport({...v,f});
    return res;})()`).runInContext(ctx2);
  for(const view of ['channel','brand']){
    const wbk=XLSX.read(out[view],{type:'array'});
    assert.ok(['Saatlik doluluk','Saatlik GRP','Saatlik GRPxSEC','Karşılaştırma','Sonuçlar'].every(n=>wbk.SheetNames.includes(n)),view+': '+wbk.SheetNames);
    const sheet=n=>XLSX.utils.sheet_to_json(wbk.Sheets[n],{header:1,defval:null});
    const hourly=sheet('Saatlik doluluk'),hdr=hourly[0],row=hourly.find(r=>r[0]==='Atv');
    assert.equal(row[hdr.indexOf('18:00')],30/720);assert.equal(row[hdr.indexOf('10:00')],20/720);assert.equal(hdr.at(-1),'25:00');
    const g=sheet('Saatlik GRP'),grow=g.find(r=>r[0]==='Atv');assert.equal(grow[g[0].indexOf('18:00')],0.6);assert.equal(grow[g[0].indexOf('10:00')],0.1);
    const res=sheet('Sonuçlar');assert.deepEqual(res[0].slice(-2),['GRP','GRPxSEC']);const ar=res.find(r=>r[0]==='Atv'||r[0]==='Marka A');assert.equal(ar[ar.length-1]>0,true);
    const cmp=sheet('Karşılaştırma');assert.equal(cmp[2][1],'2026-11-06');
    assert.equal(cmp.find(r=>r[0]==='Reklam süresi (sn)')[1],50);assert.equal(cmp.find(r=>r[0]==='Reklam süresi (sn)')[2],15);   // 30+20 vs 15
    const gxs=sheet('Saatlik GRPxSEC'),gxr=gxs.find(r=>r[0]==='Atv');assert.equal(gxr[gxs[0].indexOf('18:00')],18);assert.equal(gxr[gxs[0].indexOf('10:00')],2);
    assert.equal(cmp.find(r=>r[0]==='GRPxSEC')[1],20);assert.equal(cmp.find(r=>r[0]==='GRPxSEC')[2],3);
    assert.equal(Math.round(cmp.find(r=>r[0]==='GRP')[1]*100)/100,0.7);assert.equal(Math.round(cmp.find(r=>r[0]==='GRP')[2]*100)/100,0.2);
  }
  const nb=XLSX.read(out.nocmp,{type:'array'});assert.ok(!nb.SheetNames.includes('Karşılaştırma'));assert.ok(nb.SheetNames.includes('Saatlik doluluk'));
  // grafikler (sheet3 trend, sheet5 ana kanal) yeni sayfalardan sonra da yerinde
  const z2=fflate.unzipSync(out.channel);assert.ok(z2['xl/charts/chart1.xml']&&z2['xl/charts/chart2.xml']);
  console.log('OK: Excel GRP, saatlik ve karsilastirma sayfalari.');
}
