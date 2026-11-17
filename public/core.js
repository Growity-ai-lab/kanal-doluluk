// Ortak hesaplama çekirdeği: tarayıcı (sayfa + worker) ve sunucu aynı dosyayı kullanır.

const DEFAULT_RULES={ 'Normal Spot|Kusak Spot':'include','Cerceve-Bant|Cerceve Reklam':'include','Sosyal Reklam|Zorunlu Kamu Spotu':'exclude','Sosyal Reklam|Sosyal Reklam':'review','Urun Yer - Senaryo Enteg.|Pasif U.Yer':'exclude','Urun Yer - Senaryo Enteg.|Aktif U.Yer':'exclude','Sponsorluk|Jenerik Spon.':'exclude','Sponsorluk|Sponsor Devam':'exclude','Sponsorluk|Sponsor Sunar':'exclude','Sponsorluk|Sponsor Sundu':'exclude','Sponsorluk|Yayin Akisi':'review','Sponsorluk|Diger Spon.':'review','Sanal Reklam|Sanal Reklam':'review','Tanitici Reklam|Tanitici Reklam':'review','Extra Spot|Extra Spot':'review'};
const MAIN=['Atv','Kanal D','Now','Show Tv','Star Tv','Tv8','Trt 1'];
function orderChannels(a,b){let i=MAIN.indexOf(a),j=MAIN.indexOf(b);return (i<0?MAIN.length:i)-(j<0?MAIN.length:j)||(i<0&&j<0?String(a).localeCompare(String(b),'tr'):0);}
function period(d,g){if(g==='month')return d.slice(0,7);if(g==='week'){let t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return t.toISOString().slice(0,10);}return d;}
function timePart(h){return h<18?'OPT':h<20?'Erken PT':h<24?'PT':'Geç PT';}
function datesBetween(a,b){let out=[];for(let t=new Date(a+'T12:00:00Z');t.toISOString().slice(0,10)<=b;t.setUTCDate(t.getUTCDate()+1))out.push(t.toISOString().slice(0,10));return out;}
// Satir: [medya, ana sektor, sektor, firma, urun, marka, tarih, tur, detay, baslangic(sn), bitis(sn), sure(sn)|null, grp|null]
// GRP (ADEX 'G.R.P - 20+ ABC1'): bir spotun GRP'si, secilen saat/zaman dilimi penceresine dusen sure oraninda dagitilir.
function analyze(rows,f,coverage,rules,verified){
 const bandOK=h=>f.bands?f.bands.includes(timePart(h)):!f.band||timePart(h)===f.band;
 let channels=[...new Set(rows.map(r=>r[0]))].filter(c=>(!f.channel||c===f.channel)&&(!f.group||((f.group==='main')===MAIN.includes(c)))).sort(orderChannels);
 const coverageSet=new Set(coverage),verifiedSet=verified?new Set(verified):null;let unverified=0;let ds=datesBetween(f.start,f.end), cap=0, missing=0, periods=new Map(), byChannel=new Map(), entities=new Map(), matrix=new Map(), hourly=new Map();
 const init=()=>({seconds:0,count:0,capacity:0,unverified:0,grp:0});
 const hoursList=[];for(let h=f.hourStart;h<26;h++)if(bandOK(h))hoursList.push(h);
 for(let d of ds)for(let c of channels){let p=period(d,f.granularity),key=c+'|'+p;if(!periods.has(p))periods.set(p,init());if(!byChannel.has(c))byChannel.set(c,init());if(!matrix.has(key))matrix.set(key,init());if(!coverageSet.has(c+'|'+d)){missing++;continue;}if(verifiedSet&&!verifiedSet.has(c+'|'+d)){unverified++;matrix.get(key).unverified++;}let k=hoursList.length*720;cap+=k;periods.get(p).capacity+=k;byChannel.get(c).capacity+=k;matrix.get(key).capacity+=k;for(let h of hoursList){let hk=c+'|'+h;if(!hourly.has(hk))hourly.set(hk,init());hourly.get(hk).capacity+=720;}}
 let included=0,matched=0,reviewSeconds=0,excludedSeconds=0,invalid=0,after=0,baseTotal=0,grpTotal=0,hasGrp=false;
 const add=(map,key,s,n,g)=>{if(!map.has(key))map.set(key,init());let x=map.get(key);x.seconds+=s;x.count+=n;x.grp+=g;};
 for(let r of rows){let[c,main,sector,firm,product,brand,d,type,detail,a,b,duration,grp]=r;if(d<f.start||d>f.end||!channels.includes(c))continue;
 if(duration!=null)b=a+duration;
 if(!(Number.isFinite(a)&&Number.isFinite(b))||b<=a){invalid++;continue;}
 if(a>=93600){after++;continue;}let lo=Math.max(a,f.hourStart*3600),hi=Math.min(b,93600);if(hi<=lo)continue;
 let seconds=0,parts=[];for(let h=Math.floor(lo/3600);h<Math.ceil(hi/3600);h++)if(bandOK(h)){let amt=Math.max(0,Math.min(hi,(h+1)*3600)-Math.max(lo,h*3600));if(amt>0){seconds+=amt;parts.push([h,amt]);}}if(!seconds)continue;
 let rule=rules[type+'|'+detail]||'review';if(rule==='review'){reviewSeconds+=seconds;continue;}if(rule==='exclude'){excludedSeconds+=seconds;continue;}baseTotal+=seconds;
 if(f.sector&&main!==f.sector||f.firm&&firm!==f.firm||f.brand&&brand!==f.brand)continue;
 let len=b-a,g=grp==null?0:(Number(grp)||0);if(grp!=null)hasGrp=true;let gp=g*seconds/len;
 matched++;included+=seconds;grpTotal+=gp;let p=period(d,f.granularity);add(periods,p,seconds,1,gp);add(byChannel,c,seconds,1,gp);add(matrix,c+'|'+p,seconds,1,gp);
 for(let[h,amt]of parts){let hk=c+'|'+h;if(!hourly.has(hk))hourly.set(hk,init());let x=hourly.get(hk);x.seconds+=amt;x.grp+=g*amt/len;}
 let entity=f.view==='sector'?main:f.view==='firm'?firm:f.view==='brand'?brand:c;add(entities,entity,seconds,1,gp);
 }
 let list=[...entities].map(([name,v])=>({name,...v,capacity:f.view==='channel'?(byChannel.get(name)?.capacity||0):cap,share:baseTotal?v.seconds/baseTotal:0})).sort((a,b)=>f.view==='channel'?orderChannels(a.name,b.name):b.seconds-a.seconds);
 return {channels,periods:[...periods].sort().map(([name,v])=>({name,...v})),list,matrix:[...matrix].map(([key,v])=>({key,...v})),hourly:[...hourly].map(([key,v])=>({key,...v})),hours:hoursList,capacity:cap,included,matched,grp:grpTotal,hasGrp,reviewSeconds,excludedSeconds,invalid,after,missing,unverified,baseTotal};
}
if(typeof module!=='undefined')module.exports={DEFAULT_RULES,MAIN,orderChannels,analyze,period,timePart,datesBetween};
