'use strict';
// Bildirim e-postalari icin HTML (yukleme bildirimi). Gunluk ozetle ayni gorunum: yalniz tablo ve satir ici stil, dis resim yok (logolar cid: ile gomulu).
const C = { ink: '#162642', muted: '#64748b', line: '#e3eaf3', bg: '#f2f5fa', blue: '#315dea', brand: '#e2215f', up: '#16834b', warn: '#d97706' };
const FONT = "font-family:'Segoe UI',Helvetica,Arial,sans-serif";
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const N0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

// m: { kicker, title, who, rows:[[etiket,deger]], stats:[[baslik,deger]] (3 adet), total, alerts:[{title,items[]}], check:{title,items:[{ok,text}]}, panelUrl }
function buildUploadHtml(m) {
  const rows = [];
  rows.push('<tr><td style="padding:22px 28px 4px;' + FONT + ';font-size:14px;line-height:1.6;color:' + C.ink + '">' + esc(m.who) + '</td></tr>');
  if (m.stats && m.stats.length) {
    rows.push('<tr><td style="padding:10px 22px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      m.stats.map(([t, v]) => '<td width="' + Math.floor(100 / m.stats.length) + '%" valign="top" style="padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafcff;border:1px solid ' + C.line + ';border-radius:12px"><tr><td style="padding:12px 14px;' + FONT + '"><div style="font-size:12px;color:' + C.muted + '">' + esc(t) + '</div><div style="font-size:24px;font-weight:700;color:' + C.ink + ';padding-top:4px">' + esc(N0.format(v)) + '</div></td></tr></table></td>').join('') +
      '</tr></table></td></tr>');
  }
  const info = (m.rows || []).concat(m.total != null ? [['Arşivde toplam', N0.format(m.total) + ' kayıt']] : []);
  if (info.length) rows.push('<tr><td style="padding:10px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + info.map(([k, v]) => '<tr><td width="140" style="padding:5px 0;' + FONT + ';font-size:13px;color:' + C.muted + '">' + esc(k) + '</td><td style="padding:5px 0;' + FONT + ';font-size:13px;font-weight:600;color:' + C.ink + '">' + esc(v) + '</td></tr>').join('') + '</table></td></tr>');
  for (const a of m.alerts || []) {
    if (!a.items.length) continue;
    rows.push('<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ffefc9" style="background:#ffefc9;border-radius:10px;padding:12px 14px;' + FONT + ';font-size:13px;line-height:1.6;color:' + C.ink + '"><b>' + esc(a.title) + '</b>' + a.items.map(t => '<div style="padding-top:3px">• ' + esc(t) + '</div>').join('') + '</td></tr></table></td></tr>');
  }
  if (m.check) {
    const row = (ok, t) => '<tr><td width="20" valign="top" style="padding:2px 0;color:' + (ok ? C.up : C.warn) + ';font-weight:700">' + (ok ? '✓' : '⚠') + '</td><td style="padding:2px 0;color:' + C.ink + '">' + esc(t) + '</td></tr>';
    rows.push('<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#f7f9fc" style="background:#f7f9fc;border:1px solid ' + C.line + ';border-radius:10px;padding:14px 16px;' + FONT + ';font-size:12px;line-height:1.6"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:' + C.muted + ';text-transform:uppercase;padding-bottom:6px">' + esc(m.check.title) + '</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + m.check.items.map(x => row(x.ok, x.text)).join('') + '</table></td></tr></table></td></tr>');
  }
  const btn = m.panelUrl ? '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="' + C.blue + '" style="background:' + C.blue + ';border-radius:8px"><a href="' + esc(m.panelUrl) + '/" style="display:inline-block;padding:11px 22px;' + FONT + ';font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">Panele git</a></td></tr></table>' : '';
  rows.push('<tr><td style="padding:22px 28px 24px">' + btn + '</td></tr>');
  rows.push('<tr><td align="center" style="padding:14px 28px 18px;border-top:1px solid ' + C.line + '"><div style="' + FONT + ';font-size:11px;color:' + C.muted + ';padding-bottom:6px">powered by</div><img src="cid:kd-growity" width="150" alt="Growity AI Studio" style="border:0;height:auto;width:150px"></td></tr>');
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + esc(m.title) + '</title></head><body style="margin:0;padding:0;background:' + C.bg + '"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.bg + ';font-size:1px">' + esc(m.who) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.bg + '"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ' + C.line + ';border-radius:14px">' +
    '<tr><td style="padding:20px 28px 16px;border-bottom:4px solid ' + C.brand + ';border-radius:14px 14px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="cid:kd-time" width="84" alt="time" style="display:block;border:0;height:auto;width:84px"></td><td align="right" valign="middle" style="' + FONT + '"><div style="font-size:11px;letter-spacing:.12em;color:' + C.muted + ';font-weight:700">' + esc(m.kicker) + '</div><div style="font-size:20px;font-weight:700;color:' + C.ink + ';padding-top:3px">' + esc(m.title) + '</div></td></tr></table></td></tr>' +
    rows.join('') + '</table></td></tr></table></body></html>';
}
module.exports = { buildUploadHtml };
