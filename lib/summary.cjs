'use strict';
// Gunluk ozet e-postasinin icerigi. Panelle ayni hesap cekirdegini (public/core.js) kullanir; bu yuzden rakamlar panelle aynidir.
const core = require('../public/core.js');

const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const N0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const P1 = new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 });   // yuzdeler tam sayi
const dayLabel = d => core.dayMonth(d) + ' ' + DAYS_TR[new Date(d + 'T12:00:00Z').getUTCDay()];
const BANDS = ['OPT', 'Erken PT', 'PT', 'Geç PT'];
const filt = (start, end = start) => ({ start, end, granularity: 'day', group: '', channel: '', sector: '', firm: '', brand: '', view: 'channel', hourStart: 7, bands: BANDS });
const sgn = (n, unit, f = N0) => (n >= 0.5 ? '+' : n <= -0.5 ? '−' : '') + (unit === '%' ? '%' + f.format(Math.abs(n)) : f.format(Math.abs(n)) + unit);
const whole = x => Math.round(x * 100);   // gorunen tam sayi yuzde; puan farki bunlarin farkidir (54 - 58 = -4, gizli ondalik yok)
const dpp = (a, b) => whole(a) - whole(b);
const pp = (a, b) => (a == null || b == null ? '' : ' (' + sgn(dpp(a, b), ' puan') + ')');
const pct = (a, b) => (!b ? '' : ' (' + sgn((a - b) / b * 100, '%') + ')');
const occ = x => (x.capacity ? x.included / x.capacity : null);

// Kapsami olan en son gun (<= upTo); yoksa ''.
function lastDataDay(state, upTo) {
  let best = '';
  for (const k of state.coverage) { const d = k.slice(k.lastIndexOf('|') + 1); if (d <= upTo && d > best) best = d; }
  return best;
}

// ---- E-posta uyumlu HTML (tablo + satir ici stil; dis resim ve betik yok). Grafikler tablo hucreleridir.
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { ink: '#162642', muted: '#64748b', line: '#e3eaf3', bg: '#f2f5fa', blue: '#315dea', up: '#16834b', down: '#cf2541', track: '#eef2f8',
  bar: { n: '#a8e0c4', b: '#fbd98f', h: '#f7b2c2' }, cell: { n: '#d8f3e5', b: '#ffefc9', h: '#ffd7e0' }, grp: '#9db7f5' };
const band = r => (r <= 0.7 ? 'n' : r <= 0.9 ? 'b' : 'h');
const FONT = "font-family:'Segoe UI',Helvetica,Arial,sans-serif";
const delta = (n, unit, f) => { const t = sgn(n, unit, f); return '<span style="color:' + (n >= 0.5 ? C.up : n <= -0.5 ? C.down : C.muted) + ';font-weight:700">' + esc(t) + '</span>'; };
const bar = (frac, color, label) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.track + ';border-radius:6px"><tr><td width="' + Math.max(1, Math.min(100, Math.round(frac * 100))) + '%" bgcolor="' + color + '" style="background:' + color + ';border-radius:6px;height:20px;line-height:20px;font-size:11px;color:' + C.ink + ';padding:0 6px">' + (label || '&nbsp;') + '</td><td>&nbsp;</td></tr></table>';
const h2 = t => '<tr><td style="padding:22px 28px 8px;' + FONT + ';font-size:13px;font-weight:700;color:' + C.ink + ';text-transform:uppercase;letter-spacing:.04em">' + esc(t) + '</td></tr>';
const kpi = (title, value, sub) => '<td width="50%" valign="top" style="padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafcff;border:1px solid ' + C.line + ';border-radius:10px"><tr><td style="padding:12px 14px;' + FONT + '"><div style="font-size:12px;color:' + C.muted + '">' + esc(title) + '</div><div style="font-size:24px;font-weight:700;color:' + C.ink + ';padding:2px 0">' + value + '</div><div style="font-size:12px;color:' + C.muted + '">' + sub + '</div></td></tr></table></td>';

function renderHtml(m, panelUrl) {
  const rows = [];
  if (m.notice) rows.push('<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ffefc9" style="background:#ffefc9;border-radius:8px;padding:12px 14px;' + FONT + ';font-size:13px;color:' + C.ink + '"><b>Dikkat:</b> ' + esc(m.notice) + '</td></tr></table></td></tr>');
  if (!m.hasData) rows.push('<tr><td style="padding:24px 28px;' + FONT + ';font-size:14px;color:' + C.ink + '">' + esc(m.empty) + '</td></tr>');
  else {
    const dOcc = m.occPrev != null ? delta(dpp(m.occ, m.occPrev), ' puan') : '<span style="color:' + C.muted + '">' + m.cw + ' verisi yok</span>';
    const dSec = m.occPrev != null && m.incPrev ? delta((m.included - m.incPrev) / m.incPrev * 100, '%') : '';
    const kp = [kpi('Genel doluluk', m.occ == null ? '—' : P1.format(m.occ), dOcc + (m.occPrev != null ? ' · ' + m.cw + ' ' + P1.format(m.occPrev) : '')),
      kpi('Reklam süresi', N0.format(m.included) + ' sn', dSec + (dSec ? ' · ' + m.cw + ' ' + N0.format(m.incPrev) + ' sn' : ''))];
    const noGrp = !m.grp && m.grpPrev > 0, noMsg = '<span style="color:' + C.down + ';font-weight:700">Bu günün GRP verisi yok</span> · ' + m.cw + ' ';
    const kp2 = m.hasGrp ? [kpi('GRP', N1.format(m.grp), noGrp ? noMsg + N1.format(m.grpPrev) : m.grpPrev ? delta((m.grp - m.grpPrev) / m.grpPrev * 100, '%') + ' · ' + m.cw + ' ' + N1.format(m.grpPrev) : '&nbsp;'),
      kpi('GRPxSEC', N1.format(m.grpx), noGrp ? noMsg + N1.format(m.grpxPrev) : m.grpxPrev ? delta((m.grpx - m.grpxPrev) / m.grpxPrev * 100, '%') + ' · ' + m.cw + ' ' + N1.format(m.grpxPrev) : '&nbsp;')] : [];
    if (m.highlights && m.highlights.length) {
      const ic = { up: ['▲', C.up], down: ['▼', C.down], hot: ['●', '#d97706'], info: ['◆', C.blue] };
      rows.push('<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#eef3ff" style="background:#eef3ff;border-radius:10px;padding:14px 16px;' + FONT + '"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:' + C.blue + ';text-transform:uppercase;padding-bottom:6px">Günün öne çıkanları</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
        m.highlights.map(x => '<tr><td width="22" valign="top" style="padding:3px 0;font-size:12px;color:' + ic[x.kind][1] + '">' + ic[x.kind][0] + '</td><td style="padding:3px 0;font-size:14px;line-height:1.5;color:' + C.ink + '">' + esc(x.text) + '</td></tr>').join('') + '</table></td></tr></table></td></tr>');
    }
    rows.push('<tr><td style="padding:14px 28px 0;' + FONT + ';font-size:12px;color:' + C.muted + '">Karşılaştırma: <b style="color:' + C.ink + '">' + m.cw + '</b> (' + esc(m.prevLabel) + '). Tüm farklar buna göredir.' + (m.multi ? ' Rakamlar ' + m.dayCount + ' günün toplamıdır.' : '') + '</td></tr>');
    rows.push('<tr><td style="padding:6px 22px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + kp.join('') + '</tr>' + (kp2.length ? '<tr>' + kp2.join('') + '</tr>' : '') + '</table></td></tr>');
    if (m.main.length) {
      rows.push(h2('7 ana kanal — doluluk'));
      rows.push('<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + m.main.map(x => '<tr><td width="82" style="padding:4px 0;' + FONT + ';font-size:13px;font-weight:600;color:' + C.ink + '">' + esc(x.name) + '</td><td style="padding:4px 8px">' + bar(x.rate, C.bar[band(x.rate)]) + '</td><td width="150" align="right" style="padding:4px 0;' + FONT + ';font-size:13px;color:' + C.ink + ';white-space:nowrap"><b>' + P1.format(x.rate) + '</b>' + (x.prev != null ? ' ' + delta(dpp(x.rate, x.prev), ' puan') : '') + '</td></tr>').join('') + '</table>' +
        (m.others ? '<div style="' + FONT + ';font-size:12px;color:' + C.muted + ';padding:8px 0 0">Diğer ' + m.others.count + ' kanalın ortalaması: <b style="color:' + C.ink + '">' + P1.format(m.others.rate) + '</b>' + (m.others.prev != null ? ' ' + delta(dpp(m.others.rate, m.others.prev), ' puan') : '') + '</div>' : '') + '</td></tr>');
    }
    if (m.hours.length) {
      const hh = m.hours;
      rows.push(h2('Saatlik doluluk — 7 ana kanal ortalaması'));
      rows.push('<tr><td style="padding:0 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>' + hh.map(x => '<td align="center" style="' + FONT + ';font-size:10px;color:' + C.muted + ';padding:0 0 3px">' + String(x.h).padStart(2, '0') + '</td>').join('') + '</tr><tr>' +
        hh.map(x => '<td align="center" bgcolor="' + C.cell[band(x.r)] + '" style="background:' + C.cell[band(x.r)] + ';border:2px solid #ffffff;border-radius:6px;' + FONT + ';font-size:10px;color:' + C.ink + ';padding:9px 0">' + Math.round(x.r * 100) + '</td>').join('') + '</tr></table>' +
        '<div style="' + FONT + ';font-size:12px;color:' + C.muted + ';padding:6px 6px 0">Yoğun: <b style="color:' + C.ink + '">' + String(m.top.h).padStart(2, '0') + ':00 ' + P1.format(m.top.r) + '</b> · sakin: <b style="color:' + C.ink + '">' + String(m.low.h).padStart(2, '0') + ':00 ' + P1.format(m.low.r) + '</b> · hücre = % doluluk</div></td></tr>');
    }
    if (m.topGrp.length) {
      const mx = Math.max(...m.topGrp.map(x => x.grp), 0.01);
      rows.push(h2('En yüksek GRP'));
      rows.push('<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + m.topGrp.map(x => '<tr><td width="82" style="padding:4px 0;' + FONT + ';font-size:13px;font-weight:600;color:' + C.ink + '">' + esc(x.name) + '</td><td style="padding:4px 8px">' + bar(x.grp / mx, C.grp) + '</td><td width="150" align="right" style="padding:4px 0;' + FONT + ';font-size:12px;color:' + C.ink + ';white-space:nowrap"><b>' + N1.format(x.grp) + '</b> <span style="color:' + C.muted + '">· GRPxSEC ' + N1.format(x.grpx) + '</span></td></tr>').join('') + '</table></td></tr>');
    }
  }
  const btn = panelUrl ? '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="' + C.blue + '" style="background:' + C.blue + ';border-radius:8px"><a href="' + esc(panelUrl) + '/" style="display:inline-block;padding:11px 22px;' + FONT + ';font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Panele git</a></td></tr></table>' : '';
  rows.push('<tr><td style="padding:24px 28px 26px">' + btn + '<div style="' + FONT + ';font-size:11px;color:' + C.muted + ';line-height:1.6;padding-top:' + (btn ? 16 : 0) + 'px">Bu özet hafta içi her gün 11:00\'da (İstanbul saati) gönderilir. Rakamlar panelle aynı hesaplamadan gelir.</div></td></tr>' +
    '<tr><td align="center" style="padding:14px 28px 18px;border-top:1px solid ' + C.line + '"><div style="' + FONT + ';font-size:11px;color:' + C.muted + ';padding-bottom:6px">powered by</div><img src="cid:kd-growity" width="150" alt="Growity AI Studio" style="border:0;height:auto;width:150px"></td></tr>');
  const pre = m.hasData ? 'Genel doluluk ' + P1.format(m.occ) + (m.occPrev != null ? ' (' + sgn(dpp(m.occ, m.occPrev), ' puan') + ')' : '') + (m.main.length ? ' · en yüksek: ' + m.main[0].name + ' ' + P1.format(m.main[0].rate) : '') : m.empty;
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + esc(m.title) + '</title></head><body style="margin:0;padding:0;background:' + C.bg + '"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.bg + ';font-size:1px">' + esc(pre) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.bg + '"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ' + C.line + ';border-radius:14px">' +
    '<tr><td style="padding:20px 28px 16px;border-bottom:4px solid ' + C.blue + ';border-radius:14px 14px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="cid:kd-time" width="84" alt="time" style="display:block;border:0;height:auto;width:84px"></td><td align="right" valign="middle" style="' + FONT + '"><div style="font-size:11px;letter-spacing:.12em;color:' + C.muted + ';font-weight:700">KANAL DOLULUK · GÜNLÜK ÖZET</div><div style="font-size:' + (m.multi ? 17 : 24) + 'px;font-weight:700;color:' + C.ink + ';padding-top:3px">' + esc(m.title) + '</div></td></tr></table></td></tr>' +
    rows.join('') + '</table></td></tr></table></body></html>';
}

// state: arsiv durumu; yesterday: 'YYYY-MM-DD'. Doner: { subject, lines, html, day, hasData }
function buildDailySummary(state, { yesterday, start = yesterday, expectedChannels = [], panelUrl = '', info = {} }) {
  const base = '[Kanal Doluluk] Günlük özet — ';
  let from = start, to = yesterday;
  let shift = from === to ? 1 : 7;                                // tek gun: bir onceki gun; Cuma-Pazar: gecen hafta
  let analyzed = analyzePeriod(state, from, to, shift);
  const missingYesterday = analyzed.a.capacity === 0;
  const lines = [];
  let notice = '';
  if (missingYesterday) {
    const last = lastDataDay(state, yesterday);
    from = to = last;
    if (!last) { const empty = 'Arşivde henüz veri yok. Yönetici bir ADEX dosyası yüklediğinde özetler başlar.'; return { subject: base + rangeLabel(start, yesterday), lines: [empty], html: renderHtml({ hasData: false, empty, title: rangeLabel(start, yesterday) }, panelUrl), day: '', hasData: false, status: { facts: [], issues: [{ critical: true, text: empty }] } }; }
    shift = 1;
    analyzed = analyzePeriod(state, from, to, shift);
    notice = (start === yesterday ? 'Dün (' + dayLabel(yesterday) + ')' : rangeLabel(start, yesterday)) + ' için arşivde veri yok. Aşağıdaki özet, verisi olan son gün içindir: ' + dayLabel(last) + '.';
    lines.push('DİKKAT: ' + notice, '');
  }
  const { a, b, days } = analyzed;
  const gone = daysOf(from, to).filter(d => !days.includes(d));
  from = days[0] || from; to = days[days.length - 1] || to;     // baslik yalniz verisi olan gunleri gosterir
  const day = to, multi = from !== to, title = rangeLabel(from, to);
  if (!missingYesterday && gone.length) { notice = 'Arşivde verisi olmayan gün: ' + gone.map(dayLabel).join(', ') + '. Özet ve karşılaştırma yalnızca verisi olan günleri kapsar.'; lines.push('DİKKAT: ' + notice, ''); }
  const cw = shift === 1 ? 'bir önceki gün' : 'önceki hafta';
  const prevLabel = rangeLabel(core.addDays(days[0], -shift), core.addDays(days[days.length - 1], -shift)) + (days.length > 1 && days.length !== daysOf(days[0], days[days.length - 1]).length ? ' (yalnız verisi olan günler)' : '');
  lines.push(title + (multi ? ' günleri' : ' günü'), '');
  const hlAt = lines.length;
  
  const oa = occ(a), ob = occ(b);
  lines.push('Genel doluluk: ' + (oa == null ? '—' : P1.format(oa)) + (ob != null ? ' — ' + cw + ' (' + prevLabel + '): ' + P1.format(ob) + pp(oa, ob) : ' — ' + cw + ' için veri yok'));
  lines.push('Reklam süresi: ' + N0.format(a.included) + ' sn' + (ob != null ? pct(a.included, b.included) : ''));
  if (a.hasGrp) lines.push('GRP: ' + N1.format(a.grp) + (ob != null && b.hasGrp ? pct(a.grp, b.grp) : '') + ' · GRPxSEC: ' + N1.format(a.grpx) + (ob != null && b.hasGrp ? pct(a.grpx, b.grpx) : ''));

  const byName = new Map(b.list.map(x => [x.name, x]));
  const rate = x => (x.capacity ? x.seconds / x.capacity : null);
  const main = a.list.filter(x => core.MAIN.includes(x.name) && x.capacity).sort((x, y) => rate(y) - rate(x));
  const model = { hasData: true, title, multi, dayCount: days.length, prevLabel, cw, notice, occ: oa, occPrev: ob, included: a.included, incPrev: b.included, hasGrp: a.hasGrp, grp: a.grp, grpPrev: ob != null && b.hasGrp ? b.grp : 0, grpx: a.grpx, grpxPrev: ob != null && b.hasGrp ? b.grpx : 0, main: main.map(x => { const y = byName.get(x.name); return { name: x.name, rate: rate(x), prev: y && y.capacity ? rate(y) : null }; }), others: null, hours: [], top: null, low: null, topGrp: [], warn: [] };
  const others = a.list.filter(x => !core.MAIN.includes(x.name) && x.capacity);
  if (main.length) {
    lines.push('', '7 ana kanal (doluluk' + (ob != null ? (shift === 1 ? ', bir önceki güne göre' : ', önceki haftaya göre') : '') + '):');
    main.forEach((x, i) => { const y = byName.get(x.name); lines.push((i + 1) + '. ' + x.name + ': ' + P1.format(rate(x)) + (y && y.capacity ? pp(rate(x), rate(y)) : '') + (a.hasGrp ? ' · GRP ' + N1.format(x.grp) : '')); });
  }
  if (others.length) {
    const s = others.reduce((t, x) => [t[0] + x.seconds, t[1] + x.capacity], [0, 0]);
    const ps = others.map(x => byName.get(x.name)).filter(y => y && y.capacity).reduce((t, y) => [t[0] + y.seconds, t[1] + y.capacity], [0, 0]);
    lines.push('', 'Diğer ' + others.length + ' kanalın ortalaması: ' + P1.format(s[0] / s[1]) + (ps[1] ? pp(s[0] / s[1], ps[0] / ps[1]) : ''));
    model.others = { count: others.length, rate: s[0] / s[1], prev: ps[1] ? ps[0] / ps[1] : null };
  }
  // saat profili (7 ana kanal)
  const hm = new Map(a.hourly.map(x => [x.key, x]));
  const hours = a.hours.map(h => { let sec = 0, cap = 0; for (const c of main.map(x => x.name)) { const x = hm.get(c + '|' + h); if (x) { sec += x.seconds; cap += x.capacity; } } return cap ? { h, r: sec / cap } : null; }).filter(Boolean);
  if (hours.length) {
    const top = hours.reduce((m, x) => (x.r > m.r ? x : m)), low = hours.reduce((m, x) => (x.r < m.r ? x : m));
    model.hours = hours; model.top = top; model.low = low;
    lines.push('En yoğun saat (7 ana kanal): ' + String(top.h).padStart(2, '0') + ':00 — ' + P1.format(top.r) + ' · en sakin: ' + String(low.h).padStart(2, '0') + ':00 — ' + P1.format(low.r));
  }
  if (a.hasGrp) {
    const g = a.list.filter(x => x.grp > 0).sort((x, y) => y.grp - x.grp).slice(0, 3);
    if (g.length) lines.push('En yüksek GRP: ' + g.map(x => x.name + ' ' + N1.format(x.grp)).join(' · '));
    model.topGrp = a.list.filter(x => x.grp > 0).sort((x, y) => y.grp - x.grp).slice(0, 5).map(x => ({ name: x.name, grp: x.grp, grpx: x.grpx }));
  }

  // gunun one cikanlari (yalniz kural tabanli; rakamlar yukaridakilerle ayni hesaptan)
  const hl = [];
  const dir = d => (d > 0 ? 'up' : 'down');
  const mv = main.map(x => { const y = byName.get(x.name); return y && y.capacity ? { name: x.name, now: rate(x), prev: rate(y), d: dpp(rate(x), rate(y)) } : null; }).filter(Boolean);
  if (mv.length) {
    const fall = mv.reduce((m, x) => (x.d < m.d ? x : m)), rise = mv.reduce((m, x) => (x.d > m.d ? x : m));
    if (fall.d <= -5) hl.push({ kind: 'down', text: 'En çok düşen ana kanal: ' + fall.name + ' ' + P1.format(fall.prev) + ' → ' + P1.format(fall.now) + ' (' + sgn(fall.d, '%') + ')' });
    if (rise.d >= 5) hl.push({ kind: 'up', text: 'En çok yükselen ana kanal: ' + rise.name + ' ' + P1.format(rise.prev) + ' → ' + P1.format(rise.now) + ' (' + sgn(rise.d, '%') + ')' });
    if (fall.d > -5 && rise.d < 5) { const big = mv.reduce((m, x) => (Math.abs(x.d) > Math.abs(m.d) ? x : m)); hl.push({ kind: 'info', text: 'Ana kanallarda belirgin değişim yok (en büyük fark: ' + big.name + ' ' + P1.format(big.prev) + ' → ' + P1.format(big.now) + ' (' + sgn(big.d, '%') + ')).' }); }
  }
  if (oa != null && ob != null && b.grp > 0 && a.hasGrp) {
    const dO = dpp(oa, ob), dG = (a.grp - b.grp) / b.grp * 100;
    if (Math.abs(dO) >= 2 && Math.abs(dG) >= 2 && dO * dG < 0) hl.push({ kind: dir(dG), text: 'Doluluk ' + P1.format(ob) + ' → ' + P1.format(oa) + ' (' + sgn(dO, '%') + ') iken GRP ' + sgn(dG, '%') + ': ' + (dO < 0 ? 'reklam süresi azaldı ama izlenme (GRP) arttı.' : 'reklam süresi arttı ama izlenme (GRP) azaldı.') });
  }
  const hot = main.filter(x => rate(x) >= 0.9);
  if (hot.length) hl.push({ kind: 'hot', text: 'Yüksek bantta (%90 üzeri): ' + hot.map(x => x.name + ' ' + P1.format(rate(x))).join(', ') });
  else if (main.length) hl.push({ kind: 'info', text: 'En dolu ana kanal: ' + main[0].name + ' ' + P1.format(rate(main[0])) + '.' });
  if (model.top) {
    const pm = new Map(b.hourly.map(x => [x.key, x])), names = main.map(x => x.name);
    const ph = b.hours.map(h => { let sec = 0, cap = 0; for (const c of names) { const x = pm.get(c + '|' + h); if (x) { sec += x.seconds; cap += x.capacity; } } return cap ? { h, r: sec / cap } : null; }).filter(Boolean);
    if (ph.length) { const pt = ph.reduce((m, x) => (x.r > m.r ? x : m)); if (Math.abs(pt.h - model.top.h) >= 2) hl.push({ kind: 'info', text: 'Yoğun saat ' + String(model.top.h).padStart(2, '0') + ':00 (' + P1.format(model.top.r) + '); ' + cw + ' ' + String(pt.h).padStart(2, '0') + ':00 idi.' }); }
  }
  model.highlights = hl.slice(0, 4);
  if (model.highlights.length) lines.splice(hlAt, 0, 'Günün öne çıkanları:', ...model.highlights.map(x => '• ' + x.text), '');

  // veri durumu: yuklenen verinin ozeti + sorunlar/eksikler (yukleme e-postasinda kullanilir, ozet e-postasinda gosterilmez)
  const facts = [], issues = [], dset = new Set(days);
  const istT = iso => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)), g = k => p.find(x => x.type === k).value; return core.dayMonth(g('year') + '-' + g('month') + '-' + g('day')) + ' ' + g('hour') + ':' + g('minute'); } catch { return ''; } };
  if (info.updatedAt) facts.push('Son yükleme: ' + istT(info.updatedAt) + (info.updatedBy ? ' · ' + (info.updatedBy === 'ingest' ? 'otomatik aktarım (Windows)' : info.updatedBy) : ''));
  const li = info.lastImport && info.lastImport.detail;
  if (li && Number.isFinite(li.added)) facts.push('Yükleme ayrıntısı: ' + N0.format(li.added) + ' kayıt eklendi · ' + N0.format(li.updated || 0) + ' güncellendi · ' + N0.format(li.skipped || 0) + ' tekrar atlandı' + (li.mode === 'replace' && li.start ? ' · dönemi yenile (' + core.dayMonth(li.start) + (li.end && li.end !== li.start ? ' – ' + core.dayMonth(li.end) : '') + ')' : ''));
  const prows = state.rows.filter(r => dset.has(r[6]));
  const expDays = daysOf(start, yesterday).length;
  facts.push('Özet dönemi: ' + days.length + '/' + expDays + ' günün verisi var · ' + N0.format(a.list.length) + ' kanal · ' + N0.format(prows.length) + ' kayıt');
  if (state.rows.length) { let lo = '9999', hi = ''; for (const r of state.rows) { if (r[6] < lo) lo = r[6]; if (r[6] > hi) hi = r[6]; } facts.push('Arşiv: ' + core.dayMonth(lo) + ' – ' + core.dayMonth(hi) + ' · ' + N0.format(state.rows.length) + ' kayıt'); }
  if (prows.length) { const g = prows.filter(r => r[12] != null).length; facts.push('GRP: kayıtların ' + P1.format(g / prows.length) + '\'inde var'); if (g < prows.length * 0.98) issues.push({ text: 'Dönemde ' + N0.format(prows.length - g) + ' kayıtta GRP değeri yok.' }); }
  if (!missingYesterday && gone.length) issues.push({ critical: true, text: 'Verisi olmayan gün: ' + gone.map(dayLabel).join(', ') + '.' });
  if (missingYesterday) issues.push({ critical: true, text: (start === yesterday ? 'Dün (' + dayLabel(yesterday) + ')' : rangeLabel(start, yesterday)) + ' için arşivde veri yok.' });
  const covered = new Set(state.coverage.filter(k => days.includes(k.slice(k.lastIndexOf('|') + 1))).map(k => k.slice(0, k.lastIndexOf('|'))));
  const absent = expectedChannels.filter(c => !covered.has(c));
  if (absent.length) issues.push({ critical: true, text: 'Beklenen kanallar için ' + (multi ? 'bu dönemin' : 'bu günün') + ' verisi yok: ' + absent.join('; ') });
  if (a.unverified) issues.push({ text: N0.format(a.unverified) + ' kanal-günün kapsamı doğrulanmamış (kaydı olan günler tam kabul edildi).' });
  if (a.missing) issues.push({ text: N0.format(a.missing) + ' kanal-gün için kapsam bilgisi yok; kapasiteye eklenmedi.' });
  if (a.reviewSeconds) issues.push({ text: N0.format(a.reviewSeconds) + ' sn belirsiz tür hesap dışında (Ayarlar → Hesaplama kuralları).' });
  if (a.invalid) issues.push({ text: N0.format(a.invalid) + ' sıfır/geçersiz süreli kayıt hesap dışında.' });
  if (li && Array.isArray(li.warnings)) for (const w of li.warnings.slice(0, 4)) issues.push({ text: 'Son yüklemede onaylanan uyarı: ' + w });
  model.status = { facts, issues };
  // Veri durumu yalniz yukleme bildirimine (yoneticilere) girer; herkese giden ozette gosterilmez.

  lines.push('', 'Bu özet hafta içi her gün 11:00\'da (İstanbul saati) gönderilir. Ayrıntılar için panele girin; almak istemiyorsanız yöneticinizden e-posta adresinizin hesabınızdan kaldırılmasını isteyin.');
  return { subject: base + title, lines, html: renderHtml(model, panelUrl), day, hasData: true, status: model.status };
}

// Donem: pazartesi gunu Cuma-Cumartesi-Pazar (veri hafta sonu toplu yuklenir), diger gunler yalniz dun.
// Karsilastirma: ayni gunlerin gecen haftasi; yalniz verisi olan gunler iki tarafta da hesaba katilir.
const daysOf = (start, end) => { const out = []; for (let d = start; d <= end; d = core.addDays(d, 1)) out.push(d); return out; };
const dayHasData = (state, d) => state.coverage.some(k => k.endsWith('|' + d));
function analyzePeriod(state, start, end, shift) {
  const days = daysOf(start, end).filter(d => dayHasData(state, d));
  const prevDays = days.map(d => core.addDays(d, -shift)), set = new Set(days), pset = new Set(prevDays);
  const prevStart = core.addDays(start, -shift), prevEnd = core.addDays(end, -shift);
  const dateOf = k => k.slice(k.lastIndexOf('|') + 1);
  const covA = state.coverage.filter(k => set.has(dateOf(k))), covB = state.coverage.filter(k => pset.has(dateOf(k)));
  const rowsA = state.rows.filter(r => set.has(r[6])), rowsB = state.rows.filter(r => pset.has(r[6]));
  const ver = (list, st) => (state.verified ? state.verified.filter(k => st.has(dateOf(k))) : state.verified);
  return { days, a: core.analyze(rowsA, filt(start, end), covA, state.rules, ver(0, set)), b: core.analyze(rowsB, filt(prevStart, prevEnd), covB, state.rules, ver(0, pset)), prevStart, prevEnd };
}
const rangeLabel = (a, b) => (a === b ? dayLabel(a) : dayLabel(a) + ' – ' + dayLabel(b));

// Istanbul saatine gore { date, dow (0=Pazar), minutes } ve dunun tarihi.
function istanbulNow(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const g = k => parts.find(p => p.type === k).value;
  const date = g('year') + '-' + g('month') + '-' + g('day');
  return { date, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), minutes: Number(g('hour')) * 60 + Number(g('minute')), yesterday: core.addDays(date, -1), start: ['Mon'].includes(g('weekday')) ? core.addDays(date, -3) : core.addDays(date, -1) };
}

// Verilen tarihte gonderilecek ozetin donemi: Pazartesi Cuma-Pazar, diger gunler dun.
function summaryTarget(date) {
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  return { date, dow, yesterday: core.addDays(date, -1), start: dow === 1 ? core.addDays(date, -3) : core.addDays(date, -1) };
}

module.exports = { buildDailySummary, istanbulNow, lastDataDay, dayLabel, summaryTarget };
