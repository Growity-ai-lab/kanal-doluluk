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
console.log('OK: core calculation (bands, midnight, rules, coverage, share, grouping).');
