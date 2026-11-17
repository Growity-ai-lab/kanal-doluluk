const assert=require('node:assert/strict');
const {analyze,period,DEFAULT_RULES,timePart}=require('../public/core.js');
const base={start:'2026-11-13',end:'2026-11-13',granularity:'day',group:'',channel:'',sector:'',firm:'',brand:'',view:'channel',hourStart:7,bands:['OPT','Erken PT','PT','Geç PT']};
const row=(a,dur,o={})=>[o.ch||'Atv',o.sector||'Gıda','Gıda',o.firm||'F','Ü',o.brand||'M',o.date||'2026-11-13',o.type||'Normal Spot',o.detail||'Kusak Spot',a,a+dur,dur];
const cov=['Atv|2026-11-13'];
const run=(rows,f={},c=cov,r=DEFAULT_RULES)=>analyze(rows,{...base,...f},c,r);

// Kapasite: 07:00-26:00 = 19 saat x 720 sn
assert.equal(run([row(64800,1)]).capacity,19*720);
assert.equal(run([row(64800,1)],{bands:['OPT']}).capacity,11*720);
assert.equal(run([row(64800,1)],{bands:['Geç PT']}).capacity,2*720);
assert.equal(run([row(64800,1)],{hourStart:2}).capacity,24*720);

// Bant sinirini asan spot oransal bolunur (17:59:30 - 18:00:30)
const split=row(17*3600+59*60+30,60);
assert.equal(run([split],{bands:['OPT']}).included,30);
assert.equal(run([split],{bands:['Erken PT']}).included,30);
assert.equal(run([split]).included,60);

// Analiz baslangicindan once baslayan spotun yalniz sonraki kismi sayilir
assert.equal(run([row(7*3600-50,60)]).included,10);

// Gece yarisi sonrasi (25:00) Gec PT'ye girer; 26:00 ve sonrasi hesap disi
const late=run([row(25*3600,30),row(26*3600,30)],{bands:['Geç PT']});
assert.equal(late.included,30);assert.equal(late.after,1);
assert.equal(timePart(24),'Geç PT');assert.equal(timePart(23),'PT');assert.equal(timePart(19),'Erken PT');assert.equal(timePart(17),'OPT');

// Kurallar: exclude / review hesap disi, ayri sayilir
const rules=run([row(64800,30,{type:'Sponsorluk',detail:'Sponsor Sundu'}),row(64800,20,{type:'Sponsorluk',detail:'Yayin Akisi'}),row(64800,10)]);
assert.equal(rules.excludedSeconds,30);assert.equal(rules.reviewSeconds,20);assert.equal(rules.included,10);
assert.equal(run([row(64800,10,{type:'Bilinmeyen',detail:'X'})]).reviewSeconds,10);

// Gecersiz sure
assert.equal(run([row(64800,0)]).invalid,1);

// Kapsam yoksa kapasiteye eklenmez ve 'missing' sayilir
const nocov=run([row(64800,1)],{}, []);
assert.equal(nocov.capacity,0);assert.equal(nocov.missing,1);

// Pay tabani marka/sektor filtresinden bagimsiz
const rs=[row(64800,30,{sector:'Gıda',brand:'A'}),row(64900,70,{sector:'Otomotiv',brand:'B'})];
const sh=run(rs,{sector:'Gıda'});
assert.equal(sh.included,30);assert.equal(sh.baseTotal,100);

// Gruplama: hafta Pazartesi, ay
assert.equal(period('2026-11-13','week'),'2026-11-09');
assert.equal(period('2026-11-16','week'),'2026-11-16');
assert.equal(period('2026-11-13','month'),'2026-11');
const wk=analyze([row(64800,30),row(64800,30,{date:'2026-11-16'})],{...base,end:'2026-11-16',granularity:'week'},['Atv|2026-11-13','Atv|2026-11-16'],DEFAULT_RULES);
assert.deepEqual(wk.periods.map(p=>p.name),['2026-11-09','2026-11-16']);

// Kanal filtresi / grup
const two=analyze([row(64800,30),row(64800,40,{ch:'Minor X'})],base,['Atv|2026-11-13','Minor X|2026-11-13'],DEFAULT_RULES);
assert.deepEqual(two.channels,['Atv','Minor X']);
assert.deepEqual(analyze([row(64800,30),row(64800,40,{ch:'Minor X'})],{...base,group:'main'},['Atv|2026-11-13','Minor X|2026-11-13'],DEFAULT_RULES).channels,['Atv']);
// Dogrulanmamis kanal-gun: kapasiteye girer ama sayilir ve matriste isaretlenir
const two2=analyze([row(64800,30),row(64800,30,{date:'2026-11-14'})],{...base,end:'2026-11-14'},['Atv|2026-11-13','Atv|2026-11-14'],DEFAULT_RULES,['Atv|2026-11-13']);
assert.equal(two2.unverified,1);assert.equal(two2.missing,0);
assert.deepEqual(two2.matrix.map(m=>m.unverified),[0,1]);
assert.equal(analyze([row(64800,30)],base,cov,DEFAULT_RULES).unverified,0); // dogrulama takibi yoksa sayilmaz

// ---- GRP: bant sinirinda sureye orantili dagitilir; sure yoksa bitis-baslangic; hariç/belirsiz türler GRP'ye girmez
const rowG=(a,dur,grp,o={})=>[o.ch||'Atv',o.sector||'Gıda','Gıda',o.firm||'F','Ü',o.brand||'M',o.date||'2026-11-13',o.type||'Normal Spot',o.detail||'Kusak Spot',a,a+dur,o.nodur?null:dur,grp,...(o.grpx===undefined?[]:[o.grpx])];
const edge=rowG(17*3600+59*60+30,60,0.6,{grpx:36}); // 17:59:30-18:00:30: 30 sn OPT, 30 sn Erken PT; GRPxSURE = 0,6 x 60
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-9,x+' != '+y);
let g=run([edge],{bands:['OPT']});near(g.grp,0.3);near(g.list[0].grp,0.3);assert.equal(g.hasGrp,true);
near(run([edge],{bands:['Erken PT']}).grp,0.3);near(run([edge]).grp,0.6);
near(run([rowG(64800,30,0.5,{nodur:true})]).grp,0.5);                       // sure null: bitis-baslangic
assert.equal(run([rowG(64800,30,null)]).hasGrp,false);                      // GRP yok
assert.equal(run([rowG(64800,30,null)]).grp,0);
near(run([rowG(64800,30,0.5,{type:'Sponsorluk',detail:'Sponsor Sundu'}),rowG(64800,30,0.2)]).grp,0.2); // hariç tür GRP'ye girmez
near(run([rowG(64800,30,0.5,{brand:'A'}),rowG(64830,30,0.25,{brand:'B'})],{brand:'B'}).grp,0.25);       // filtre
near(run([rowG(64800,30,0.5),rowG(64830,30,0.25,{date:'2026-11-12'})]).grp,0.5);                        // aralik disi
// sektor/firma gorunumunde GRP kalemleri toplanir
const v2=run([rowG(64800,30,0.4,{firm:'X'}),rowG(64830,30,0.1,{firm:'X'}),rowG(64860,30,0.3,{firm:'Y'})],{view:'firm'});
near(v2.list.find(x=>x.name==='X').grp,0.5);near(v2.list.find(x=>x.name==='Y').grp,0.3);

// ---- GRPxSEC: ADEX 'GRPxSURE' degeri aynen (pencereye orantili); sutun yoksa GRP x sure
let gx=run([edge],{bands:['OPT']});near(gx.grpx,18);near(gx.list[0].grpx,18);near(run([edge],{bands:['Erken PT']}).grpx,18);near(run([edge]).grpx,36);
near(run([rowG(64800,30,0.5)]).grpx,15);                                    // grpxsec yok: 0,5 x 30
near(run([rowG(64800,30,0.5,{nodur:true})]).grpx,15);                       // sure yoksa bitis-baslangic
near(run([rowG(64800,30,0.5,{grpx:99})]).grpx,99);                          // ADEX degeri oldugu gibi kullanilir
near(run([rowG(64800,30,null,{grpx:7})]).grpx,7);assert.equal(run([rowG(64800,30,null,{grpx:7})]).hasGrp,true);
near(run([rowG(64800,30,0.5,{type:'Sponsorluk',detail:'Sponsor Sundu',grpx:15}),rowG(64830,30,0.2,{grpx:6})]).grpx,6);   // hariç tür girmez
const gxv=run([rowG(64800,30,0.4,{firm:'X',grpx:12}),rowG(64830,30,0.1,{firm:'X',grpx:3}),rowG(64860,30,0.3,{firm:'Y',grpx:9})],{view:'firm'});
near(gxv.list.find(x=>x.name==='X').grpx,15);near(gxv.list.find(x=>x.name==='Y').grpx,9);

// ---- Saatlik kirilim: saniye, GRP ve kapasite saat/kanal bazinda
const hv=run([edge,rowG(20*3600+10,20,0.2)]);
const H=Object.fromEntries(hv.hourly.map(x=>[x.key,x]));
assert.equal(H['Atv|17'].seconds,30);assert.equal(H['Atv|18'].seconds,30);assert.equal(H['Atv|20'].seconds,20);
near(H['Atv|17'].grp,0.3);near(H['Atv|18'].grp,0.3);near(H['Atv|20'].grp,0.2);
near(H['Atv|17'].grpx,18);near(H['Atv|18'].grpx,18);near(H['Atv|20'].grpx,4);                  // 0,2 x 20 (grpxsec yok -> hesaplanir)
near(hv.hourly.reduce((t,x)=>t+x.grpx,0),hv.grpx);near(hv.hourly.reduce((t,x)=>t+x.grp,0),hv.grp);   // saatlik toplamlar genel toplama esit
assert.equal(H['Atv|17'].capacity,720);assert.equal(H['Atv|7'].capacity,720);assert.equal(H['Atv|25'].capacity,720);
assert.deepEqual(hv.hours,[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]);
assert.equal(hv.hourly.reduce((t,x)=>t+x.capacity,0),hv.capacity);                              // saatlik kapasite toplami genel kapasiteye esit
assert.equal(hv.hourly.reduce((t,x)=>t+x.seconds,0),hv.included);                               // saatlik saniye toplami dahil sureye esit
assert.deepEqual(run([edge],{bands:['PT']}).hours,[20,21,22,23]);                               // bant secimi saat listesini daraltir
assert.equal(run([edge],{bands:['PT']}).hourly.filter(x=>x.capacity>0).length,4);
assert.equal(run([edge],{},[]).hourly.filter(x=>x.capacity>0).length,0);                        // kapsam yoksa saatlik kapasite yok
// saatlik toplamlar cok gunde ortalama: 2 gun kapsamli, bir gunde spot
const twoDay=analyze([rowG(64800,36,0.4)],{...base,end:'2026-11-14'},['Atv|2026-11-13','Atv|2026-11-14'],DEFAULT_RULES);
assert.equal(twoDay.hourly.find(x=>x.key==='Atv|18').capacity,1440);assert.equal(twoDay.hourly.find(x=>x.key==='Atv|18').seconds,36);
// karsilastirma donemi ayni filtrelerle ayri analiz: kapsami olmayan donem 'missing' sayar
const cmpRows=[rowG(64800,30,0.5),rowG(64800,60,0.2,{date:'2026-11-06'})];
const cur=analyze(cmpRows,{...base,start:'2026-11-13',end:'2026-11-13'},['Atv|2026-11-13','Atv|2026-11-06'],DEFAULT_RULES);
const prev=analyze(cmpRows,{...base,start:'2026-11-06',end:'2026-11-06'},['Atv|2026-11-13','Atv|2026-11-06'],DEFAULT_RULES);
assert.equal(cur.included,30);assert.equal(prev.included,60);near(cur.grp,0.5);near(prev.grp,0.2);
console.log('OK: core calculation (bands, midnight, rules, coverage, share, grouping, GRP, hourly).');
