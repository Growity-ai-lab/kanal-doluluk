'use strict';
// Gunluk ozet e-postasinin icerigi. Panelle ayni hesap cekirdegini (public/core.js) kullanir; bu yuzden rakamlar panelle aynidir.
const core = require('../public/core.js');

const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const N0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const P1 = new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dayLabel = d => core.dayMonth(d) + ' ' + DAYS_TR[new Date(d + 'T12:00:00Z').getUTCDay()];
const BANDS = ['OPT', 'Erken PT', 'PT', 'Geç PT'];
const filt = day => ({ start: day, end: day, granularity: 'day', group: '', channel: '', sector: '', firm: '', brand: '', view: 'channel', hourStart: 7, bands: BANDS });
const sgn = (n, unit, f = N1) => (n >= 0.05 ? '+' : n <= -0.05 ? '−' : '') + f.format(Math.abs(n)) + unit;
const pp = (a, b) => (a == null || b == null ? '' : ' (' + sgn((a - b) * 100, ' puan') + ')');
const pct = (a, b) => (!b ? '' : ' (' + sgn((a - b) / b * 100, '%') + ')');
const occ = x => (x.capacity ? x.included / x.capacity : null);

// Kapsami olan en son gun (<= upTo); yoksa ''.
function lastDataDay(state, upTo) {
  let best = '';
  for (const k of state.coverage) { const d = k.slice(k.lastIndexOf('|') + 1); if (d <= upTo && d > best) best = d; }
  return best;
}

// state: arsiv durumu; yesterday: 'YYYY-MM-DD'. Doner: { subject, lines, day, hasData }
function buildDailySummary(state, { yesterday, expectedChannels = [] }) {
  const base = '[Kanal Doluluk] Günlük özet — ';
  let day = yesterday;
  let analyzed = analyzeDay(state, day);
  const missingYesterday = analyzed.a.capacity === 0;
  const lines = [];
  if (missingYesterday) {
    day = lastDataDay(state, yesterday);
    if (!day) return { subject: base + dayLabel(yesterday), lines: ['Arşivde henüz veri yok. Yönetici bir ADEX dosyası yüklediğinde özetler başlar.'], day: '', hasData: false };
    analyzed = analyzeDay(state, day);
    lines.push('DİKKAT: Dün (' + dayLabel(yesterday) + ') için arşivde veri yok. Aşağıdaki özet, verisi olan son gün içindir: ' + dayLabel(day) + '.', '');
  }
  const { a, b, prev } = analyzed;
  lines.push(dayLabel(day) + ' günü', '');
  const oa = occ(a), ob = occ(b);
  lines.push('Genel doluluk: ' + (oa == null ? '—' : P1.format(oa)) + (ob != null ? ' — geçen hafta aynı gün (' + dayLabel(prev) + '): ' + P1.format(ob) + pp(oa, ob) : ' — geçen hafta aynı gün için veri yok'));
  lines.push('Reklam süresi: ' + N0.format(a.included) + ' sn' + (ob != null ? pct(a.included, b.included) : ''));
  if (a.hasGrp) lines.push('GRP: ' + N1.format(a.grp) + (ob != null && b.hasGrp ? pct(a.grp, b.grp) : '') + ' · GRPxSEC: ' + N1.format(a.grpx) + (ob != null && b.hasGrp ? pct(a.grpx, b.grpx) : ''));

  const byName = new Map(b.list.map(x => [x.name, x]));
  const rate = x => (x.capacity ? x.seconds / x.capacity : null);
  const main = a.list.filter(x => core.MAIN.includes(x.name) && x.capacity).sort((x, y) => rate(y) - rate(x));
  const others = a.list.filter(x => !core.MAIN.includes(x.name) && x.capacity);
  if (main.length) {
    lines.push('', '7 ana kanal (doluluk' + (ob != null ? ', geçen haftaya göre' : '') + '):');
    main.forEach((x, i) => { const y = byName.get(x.name); lines.push((i + 1) + '. ' + x.name + ': ' + P1.format(rate(x)) + (y && y.capacity ? pp(rate(x), rate(y)) : '') + (a.hasGrp ? ' · GRP ' + N1.format(x.grp) : '')); });
  }
  if (others.length) {
    const s = others.reduce((t, x) => [t[0] + x.seconds, t[1] + x.capacity], [0, 0]);
    const ps = others.map(x => byName.get(x.name)).filter(y => y && y.capacity).reduce((t, y) => [t[0] + y.seconds, t[1] + y.capacity], [0, 0]);
    lines.push('', 'Diğer ' + others.length + ' kanalın ortalaması: ' + P1.format(s[0] / s[1]) + (ps[1] ? pp(s[0] / s[1], ps[0] / ps[1]) : ''));
  }
  // saat profili (7 ana kanal)
  const hm = new Map(a.hourly.map(x => [x.key, x]));
  const hours = a.hours.map(h => { let sec = 0, cap = 0; for (const c of main.map(x => x.name)) { const x = hm.get(c + '|' + h); if (x) { sec += x.seconds; cap += x.capacity; } } return cap ? { h, r: sec / cap } : null; }).filter(Boolean);
  if (hours.length) {
    const top = hours.reduce((m, x) => (x.r > m.r ? x : m)), low = hours.reduce((m, x) => (x.r < m.r ? x : m));
    lines.push('En yoğun saat (7 ana kanal): ' + String(top.h).padStart(2, '0') + ':00 — ' + P1.format(top.r) + ' · en sakin: ' + String(low.h).padStart(2, '0') + ':00 — ' + P1.format(low.r));
  }
  if (a.hasGrp) {
    const g = a.list.filter(x => x.grp > 0).sort((x, y) => y.grp - x.grp).slice(0, 3);
    if (g.length) lines.push('En yüksek GRP: ' + g.map(x => x.name + ' ' + N1.format(x.grp)).join(' · '));
  }

  // uyarilar
  const warn = [];
  const covered = new Set(state.coverage.filter(k => k.endsWith('|' + day)).map(k => k.slice(0, k.lastIndexOf('|'))));
  const absent = expectedChannels.filter(c => !covered.has(c));
  if (absent.length) warn.push('Beklenen kanallar için bu günün verisi yok: ' + absent.join('; '));
  if (a.unverified) warn.push(N0.format(a.unverified) + ' kanal-günün kapsamı doğrulanmamış (kaydı olan günler tam kabul edildi).');
  if (a.missing) warn.push(N0.format(a.missing) + ' kanal-gün için kapsam bilgisi yok; kapasiteye eklenmedi.');
  if (a.reviewSeconds) warn.push(N0.format(a.reviewSeconds) + ' sn belirsiz tür hesap dışında (Ayarlar → Hesaplama kuralları).');
  if (a.invalid) warn.push(N0.format(a.invalid) + ' sıfır/geçersiz süreli kayıt hesap dışında.');
  if (warn.length) lines.push('', 'Uyarılar:', ...warn.map(w => '- ' + w));
  lines.push('', 'Bu özet hafta içi her gün 10:00\'da (İstanbul saati) gönderilir. Ayrıntılar için panele girin; almak istemiyorsanız yöneticinizden e-posta adresinizin hesabınızdan kaldırılmasını isteyin.');
  return { subject: base + dayLabel(day), lines, day, hasData: true };
}

function analyzeDay(state, day) {
  const prev = core.addDays(day, -7);
  const rows = state.rows.filter(r => r[6] === day || r[6] === prev);
  return { a: core.analyze(rows, filt(day), state.coverage, state.rules, state.verified), b: core.analyze(rows, filt(prev), state.coverage, state.rules, state.verified), prev };
}

// Istanbul saatine gore { date, dow (0=Pazar), minutes } ve dunun tarihi.
function istanbulNow(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const g = k => parts.find(p => p.type === k).value;
  const date = g('year') + '-' + g('month') + '-' + g('day');
  return { date, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), minutes: Number(g('hour')) * 60 + Number(g('minute')), yesterday: core.addDays(date, -1) };
}

module.exports = { buildDailySummary, istanbulNow, lastDataDay, dayLabel };
