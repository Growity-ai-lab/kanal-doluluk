// Ortak hesaplama çekirdeği: tarayıcı (sayfa + worker) ve sunucu aynı dosyayı kullanır.

const DEFAULT_RULES={ 'Normal Spot|Kusak Spot':'include','Cerceve-Bant|Cerceve Reklam':'include','Sosyal Reklam|Zorunlu Kamu Spotu':'exclude','Sosyal Reklam|Sosyal Reklam':'review','Urun Yer - Senaryo Enteg.|Pasif U.Yer':'exclude','Urun Yer - Senaryo Enteg.|Aktif U.Yer':'exclude','Sponsorluk|Jenerik Spon.':'exclude','Sponsorluk|Sponsor Devam':'exclude','Sponsorluk|Sponsor Sunar':'exclude','Sponsorluk|Sponsor Sundu':'exclude','Sponsorluk|Yayin Akisi':'review','Sponsorluk|Diger Spon.':'review','Sanal Reklam|Sanal Reklam':'review','Tanitici Reklam|Tanitici Reklam':'review','Extra Spot|Extra Spot':'review'};
const MAIN=['Atv','Kanal D','Now','Show Tv','Star Tv','Tv8','Trt 1'];
function orderChannels(a,b){let i=MAIN.indexOf(a),j=MAIN.indexOf(b);return (i<0?MAIN.length:i)-(j<0?MAIN.length:j)||(i<0&&j<0?String(a).localeCompare(String(b),'tr'):0);}
function period(d,g){if(g==='month')return d.slice(0,7);if(g==='week'){let t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return t.toISOString().slice(0,10);}return d;}
function timePart(h){return h<18?'OPT':h<20?'Erken PT':h<24?'PT':'Geç PT';}
function datesBetween(a,b){let out=[];for(let t=new Date(a+'T12:00:00Z');t.toISOString().slice(0,10)<=b;t.setUTCDate(t.getUTCDate()+1))out.push(t.toISOString().slice(0,10));return out;}
// Satir: [medya, ana sektor, sektor, firma, urun, marka, tarih, tur, detay, baslangic(sn), bitis(sn), sure(sn)|null, grp|null, grpxsec|null]
// GRP (ADEX 'G.R.P - 20+ ABC1') ve GRPxSEC (ADEX 'GRPxSURE - 20+ ABC1' = GRP x spot suresi): bir spotun degeri, secilen saat/zaman dilimi
// penceresine dusen sure oraninda dagitilir. GRPxSURE sutunu yoksa GRP x sure olarak hesaplanir.
function analyze(rows,f,coverage,rules,verified){
 const bandOK=h=>f.bands?f.bands.includes(timePart(h)):!f.band||timePart(h)===f.band;
 let channels=[...new Set(rows.map(r=>r[0]))].filter(c=>(!f.channel||c===f.channel)&&(!f.group||((f.group==='main')===MAIN.includes(c)))).sort(orderChannels);
 const coverageSet=new Set(coverage),verifiedSet=verified?new Set(verified):null;let unverified=0;let ds=datesBetween(f.start,f.end), cap=0, missing=0, periods=new Map(), byChannel=new Map(), entities=new Map(), matrix=new Map(), hourly=new Map();
 const init=()=>({seconds:0,count:0,capacity:0,unverified:0,grp:0,grpx:0});
 const hoursList=[];for(let h=f.hourStart;h<26;h++)if(bandOK(h))hoursList.push(h);
 for(let d of ds)for(let c of channels){let p=period(d,f.granularity),key=c+'|'+p;if(!periods.has(p))periods.set(p,init());if(!byChannel.has(c))byChannel.set(c,init());if(!matrix.has(key))matrix.set(key,init());if(!coverageSet.has(c+'|'+d)){missing++;continue;}if(verifiedSet&&!verifiedSet.has(c+'|'+d)){unverified++;matrix.get(key).unverified++;}let k=hoursList.length*720;cap+=k;periods.get(p).capacity+=k;byChannel.get(c).capacity+=k;matrix.get(key).capacity+=k;for(let h of hoursList){let hk=c+'|'+h;if(!hourly.has(hk))hourly.set(hk,init());hourly.get(hk).capacity+=720;}}
 let included=0,matched=0,reviewSeconds=0,excludedSeconds=0,invalid=0,after=0,baseTotal=0,grpTotal=0,grpxTotal=0,hasGrp=false;
 const add=(map,key,s,n,g,gx)=>{if(!map.has(key))map.set(key,init());let x=map.get(key);x.seconds+=s;x.count+=n;x.grp+=g;x.grpx+=gx;};
 for(let r of rows){let[c,main,sector,firm,product,brand,d,type,detail,a,b,duration,grp,grpx]=r;if(d<f.start||d>f.end||!channels.includes(c))continue;
 if(duration!=null)b=a+duration;
 if(!(Number.isFinite(a)&&Number.isFinite(b))||b<=a){invalid++;continue;}
 if(a>=93600){after++;continue;}let lo=Math.max(a,f.hourStart*3600),hi=Math.min(b,93600);if(hi<=lo)continue;
 let seconds=0,parts=[];for(let h=Math.floor(lo/3600);h<Math.ceil(hi/3600);h++)if(bandOK(h)){let amt=Math.max(0,Math.min(hi,(h+1)*3600)-Math.max(lo,h*3600));if(amt>0){seconds+=amt;parts.push([h,amt]);}}if(!seconds)continue;
 let rule=rules[type+'|'+detail]||'review';if(rule==='review'){reviewSeconds+=seconds;continue;}if(rule==='exclude'){excludedSeconds+=seconds;continue;}baseTotal+=seconds;
 if(f.sector&&main!==f.sector||f.firm&&firm!==f.firm||f.brand&&brand!==f.brand)continue;
 let len=b-a,dur=duration!=null?duration:len,g=grp==null?0:(Number(grp)||0),gx=grpx!=null?(Number(grpx)||0):g*dur;if(grp!=null||grpx!=null)hasGrp=true;let gp=g*seconds/len,gxp=gx*seconds/len;
 matched++;included+=seconds;grpTotal+=gp;grpxTotal+=gxp;let p=period(d,f.granularity);add(periods,p,seconds,1,gp,gxp);add(byChannel,c,seconds,1,gp,gxp);add(matrix,c+'|'+p,seconds,1,gp,gxp);
 for(let[h,amt]of parts){let hk=c+'|'+h;if(!hourly.has(hk))hourly.set(hk,init());let x=hourly.get(hk);x.seconds+=amt;x.grp+=g*amt/len;x.grpx+=gx*amt/len;}
 let entity=f.view==='sector'?main:f.view==='firm'?firm:f.view==='brand'?brand:c;add(entities,entity,seconds,1,gp,gxp);
 }
 let list=[...entities].map(([name,v])=>({name,...v,capacity:f.view==='channel'?(byChannel.get(name)?.capacity||0):cap,share:baseTotal?v.seconds/baseTotal:0})).sort((a,b)=>f.view==='channel'?orderChannels(a.name,b.name):b.seconds-a.seconds);
 return {channels,periods:[...periods].sort().map(([name,v])=>({name,...v})),list,matrix:[...matrix].map(([key,v])=>({key,...v})),hourly:[...hourly].map(([key,v])=>({key,...v})),hours:hoursList,capacity:cap,included,matched,grp:grpTotal,grpx:grpxTotal,hasGrp,reviewSeconds,excludedSeconds,invalid,after,missing,unverified,baseTotal};
}
// ---- Tarih ve donem yardimcilari (saf; testlenebilir)
function addDays(d,n){let t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
function daysBetween(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5)+1;}
function monthEnd(y,m){return new Date(Date.UTC(y,m,0,12)).getUTCDate();}                         // m: 1-12
function addMonths(d,k){let y=+d.slice(0,4),m=+d.slice(5,7),day=+d.slice(8,10),t=y*12+(m-1)+k,ny=Math.floor(t/12),nm=t%12+1;return ny+'-'+String(nm).padStart(2,'0')+'-'+String(Math.min(day,monthEnd(ny,nm))).padStart(2,'0');}
const isMonthStart=d=>d.slice(8,10)==='01',isMonthEnd=d=>+d.slice(8,10)===monthEnd(+d.slice(0,4),+d.slice(5,7)),weekdayMon0=d=>(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
// Karsilastirma donemi. mode: 'prev' (onceki donem), 'week' (7 gun once), 'month' (onceki ay, ayni gunler), 'custom' (custom.start[, custom.end]).
//  prev : ayni uzunlukta hemen onceki aralik; aralik tam takvim ay(lar)iysa hemen onceki ayni sayida tam ay.
//  week : her iki ucu 7 gun geri (yalniz 7 gune kadar; daha uzun aralikta ortusme olacagindan 'prev'e doner, note ile bildirir).
//  month: her iki ucu 1 takvim ayi geri (ay sonu gunleri kisaltilir); tam ay secildiyse onceki tam ay.
//  custom: custom.end yoksa secili aralikla ayni uzunluk.
function resolveCompare(start,end,mode,custom){custom=custom||{};if(!mode)return null;let n=daysBetween(start,end);
 const prev=()=>{if(isMonthStart(start)&&isMonthEnd(end)){let m=(+end.slice(0,4)*12+ +end.slice(5,7))-(+start.slice(0,4)*12+ +start.slice(5,7))+1;return {start:addMonths(start,-m),end:addDays(start,-1),kind:'prev-months'};}return {start:addDays(start,-n),end:addDays(start,-1),kind:'prev'};};
 if(mode==='prev')return prev();
 if(mode==='week'){if(n>7)return {...prev(),note:'“7 gün önce” en fazla 7 günlük aralıklar içindir (daha uzun aralıkta dönemler örtüşür); önceki dönem kullanıldı.'};return {start:addDays(start,-7),end:addDays(end,-7),kind:'week'};}
 if(mode==='month'){let pe=addMonths(end,-1),full=isMonthStart(start)&&isMonthEnd(end);return {start:addMonths(start,-1),end:full?pe.slice(0,8)+String(monthEnd(+pe.slice(0,4),+pe.slice(5,7))).padStart(2,'0'):pe,kind:'month'};}
 if(mode==='custom'){if(!custom.start)return null;let e=custom.end||addDays(custom.start,n-1);return e<custom.start?null:{start:custom.start,end:e,kind:'custom'};}
 return null;}
// Gorunen tarih etiketleri: yil yok, gun-ay ('16 Kas'). Hafta: '09–15 Kas' / '30 Eki–05 Kas'; ay: 'Kasım'.
const MON_SHORT=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'],MON_LONG=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function dayMonth(d){return d?d.slice(8,10)+' '+MON_SHORT[+d.slice(5,7)-1]:'';}
function periodLabel(name,g){if(g==='month')return MON_LONG[+name.slice(5,7)-1];if(g==='week'){let e=addDays(name,6);return name.slice(5,7)===e.slice(5,7)?name.slice(8,10)+'–'+dayMonth(e):dayMonth(name)+'–'+dayMonth(e);}return dayMonth(name);}
// Hizli donemler; last = analiz icin tamamlanmis son gun (dun). Hafta Pazartesi-Pazar.
function presetRange(name,last){let wd=weekdayMon0(last),m1=last.slice(0,8)+'01';
 switch(name){case 'yesterday':return [last,last];case 'last7':return [addDays(last,-6),last];case 'last30':return [addDays(last,-29),last];
  case 'thisWeek':return [addDays(last,-wd),last];case 'prevWeek':{let ms=addDays(last,-wd-7);return [ms,addDays(ms,6)];}
  case 'thisMonth':return [m1,last];case 'prevMonth':return [addMonths(m1,-1),addDays(m1,-1)];}return null;}
if(typeof module!=='undefined')module.exports={DEFAULT_RULES,MAIN,orderChannels,analyze,period,timePart,datesBetween,addDays,daysBetween,addMonths,resolveCompare,presetRange,dayMonth,periodLabel};
