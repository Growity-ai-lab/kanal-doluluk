'use strict';
// Bagimliliksiz e-posta gonderimi. Iki yol:
//   1) Microsoft Graph (Microsoft 365, onerilen): GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, MAIL_FROM (gonderen posta kutusu) -> uygulama izniyle /sendMail
//   2) SMTP (Google Workspace, SendGrid, Resend, Brevo, Mailgun ...) asagidaki gibi.
// Graph ayarlari tanimliysa Graph kullanilir; degilse SMTP.
//   SMTP_HOST, SMTP_PORT (465: dogrudan TLS, 587: STARTTLS; SMTP_SECURE=true|false ile degistirilebilir), SMTP_USER, SMTP_PASSWORD, MAIL_FROM  ->  e-posta bildirimi acik
// Sifre yalnizca AUTH sirasinda ve yalnizca sifreli baglantida gonderilir; sertifika dogrulamasi kapatilamaz.
// Test icin: SMTP_TLS=none yalnizca localhost/127.0.0.1 sunucularda sifresiz baglantiya izin verir.
const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const crypto = require('node:crypto');

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const clean = s => String(s == null ? '' : s).replace(/[\r\n\0]+/g, ' ').trim(); // baslik enjeksiyonunu engeller
const isEmail = s => typeof s === 'string' && s.length <= 120 && EMAIL_RE.test(s);
const addrOf = v => { const m = /<([^<>]+)>/.exec(String(v)); return clean(m ? m[1] : v); };
const nameOf = v => { const m = /^\s*"?([^"<]*?)"?\s*<[^<>]+>\s*$/.exec(String(v)); return m ? clean(m[1]) : ''; };
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const encodeWord = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=';

const wrap64 = s => b64(String(s).replace(/\r?\n/g, '\r\n')).replace(/.{1,76}/g, '$&\r\n');
// html verilirse multipart/alternative: duz metin (yedek) + HTML. Ikisi de base64 oldugundan satir basinda nokta/baslik riski yoktur.
function buildMessage({ from, to, subject, text, html, images }) {
  const fromAddr = addrOf(from), fromName = nameOf(from) || 'Kanal Doluluk';
  const domain = (fromAddr.split('@')[1] || os.hostname()).replace(/[^a-z0-9.-]/gi, '');
  const head = [
    'From: ' + encodeWord(fromName) + ' <' + fromAddr + '>',
    'To: <' + addrOf(to) + '>',
    'Subject: ' + encodeWord(clean(subject)),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@' + domain + '>',
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
  ];
  if (!html) return [...head, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap64(text)].join('\r\n');
  const bd = '=_kd_' + crypto.randomBytes(12).toString('hex');
  const htmlPart = ['Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap64(html)];
  let second = htmlPart;
  if (images && images.length) {   // multipart/related: HTML + gomulu (cid:) resimler; istemci dis adrese gitmeden gosterir
    const br = '=_kr_' + crypto.randomBytes(12).toString('hex');
    second = ['Content-Type: multipart/related; type="text/html"; boundary="' + br + '"', '', '--' + br, ...htmlPart,
      ...images.flatMap(im => ['--' + br, 'Content-Type: ' + im.type + '; name="' + im.cid + '.png"', 'Content-Transfer-Encoding: base64', 'Content-ID: <' + im.cid + '>', 'Content-Disposition: inline; filename="' + im.cid + '.png"', '', im.data.toString('base64').replace(/.{1,76}/g, '$&\r\n')]),
      '--' + br + '--'];
  }
  return [...head, 'Content-Type: multipart/alternative; boundary="' + bd + '"', '',
    '--' + bd, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap64(text),
    '--' + bd, ...second,
    '--' + bd + '--', ''].join('\r\n');
}

// Tek bir mesaji tek alici icin gonderir; hata olursa reddedilir (mesaj sunucu yanitini icerir, sifre icermez).
function smtpSend(cfg, { to, subject, text, html, images }) {
  return new Promise((resolve, reject) => {
    let socket, buffer = '', waiter = null, done = false, stage = 'bağlantı';
    const lines = [];
    const fail = e => { if (done) return; done = true; try { socket && socket.destroy(); } catch { /* kapali */ } reject(e instanceof Error ? e : new Error(String(e))); };
    const ok = () => { if (done) return; done = true; try { socket.end(); } catch { /* kapali */ } resolve(); };
    const attach = s => {
      socket = s; buffer = '';
      s.setTimeout(cfg.timeoutMs || 30000, () => fail(new Error('SMTP zaman asimi (' + (cfg.timeoutMs || 30000) / 1000 + ' sn; adim: ' + stage + '; sunucu: ' + cfg.host + ':' + cfg.port + ')')));
      s.on('error', fail);
      s.on('close', () => fail(new Error('SMTP baglantisi beklenmedik sekilde kapandi')));
      s.on('data', d => {
        buffer += d.toString('utf8');
        let i;
        while ((i = buffer.indexOf('\r\n')) >= 0) { lines.push(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
        pump();
      });
    };
    // Yanit: "250-..." devam satirlari, "250 ..." son satir
    const pump = () => {
      if (!waiter) return;
      const last = lines.findIndex(l => /^\d{3} /.test(l) || /^\d{3}$/.test(l));
      if (last < 0) return;
      const got = lines.splice(0, last + 1), w = waiter; waiter = null;
      w({ code: Number(got[last].slice(0, 3)), text: got.map(l => l.slice(4)).join('\n') });
    };
    const reply = () => new Promise(r => { waiter = r; pump(); });
    const send = s => socket.write(s + '\r\n');
    const expect = async (codes, what) => {
      stage = what;
      const r = await reply();
      if (!codes.includes(r.code)) throw new Error('SMTP ' + what + ' reddedildi: ' + r.code + ' ' + clean(r.text).slice(0, 160));
      return r;
    };
    const local = /^(localhost|127\.0\.0\.1|::1)$/.test(cfg.host);
    const plainAllowed = cfg.tls === 'none' && local;
    (async () => {
      const secure = cfg.secure === undefined ? cfg.port === 465 : cfg.secure;
      await new Promise((res, rej) => {
        const s = secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, ca: cfg.ca }, res) : net.connect({ host: cfg.host, port: cfg.port }, res);
        s.once('error', rej); attach(s);
      });
      await expect([220], 'karsilama');
      const ehlo = async () => { send('EHLO ' + (os.hostname() || 'localhost')); return (await expect([250], 'EHLO')).text; };
      let caps = await ehlo();
      if (!secure && !plainAllowed) {
        if (!/STARTTLS/i.test(caps)) throw new Error('SMTP sunucusu STARTTLS sunmuyor; sifreli baglanti olmadan kimlik bilgisi gonderilmez');
        send('STARTTLS'); await expect([220], 'STARTTLS');
        socket.removeAllListeners('data'); socket.removeAllListeners('close'); socket.removeAllListeners('error'); socket.setTimeout(0);
        await new Promise((res, rej) => { const s = tls.connect({ socket, servername: cfg.host, ca: cfg.ca }, res); s.once('error', rej); attach(s); });
        caps = await ehlo();
      }
      if (cfg.user) {
        if (/AUTH[^\n]*PLAIN/i.test(caps)) { send('AUTH PLAIN ' + b64('\0' + cfg.user + '\0' + cfg.password)); await expect([235], 'kimlik dogrulama'); }
        else if (/AUTH[^\n]*LOGIN/i.test(caps)) {
          send('AUTH LOGIN'); await expect([334], 'kimlik dogrulama');
          send(b64(cfg.user)); await expect([334], 'kimlik dogrulama');
          send(b64(cfg.password)); await expect([235], 'kimlik dogrulama');
        } else throw new Error('SMTP sunucusu PLAIN/LOGIN kimlik dogrulamasi sunmuyor');
      }
      send('MAIL FROM:<' + addrOf(cfg.from) + '>'); await expect([250], 'MAIL FROM');
      send('RCPT TO:<' + addrOf(to) + '>'); await expect([250, 251], 'RCPT TO');
      send('DATA'); await expect([354], 'DATA');
      socket.write(buildMessage({ from: cfg.from, to, subject, text, html, images }) + '\r\n.\r\n');
      await expect([250], 'mesaj');
      send('QUIT');
      ok();
    })().catch(fail);
  });
}

// ---- Microsoft Graph (istemci kimligi/secret ile uygulama izni: Mail.Send). Iletiyi MIME olarak gonderir; boylece gomulu logolar ve duz metin yedegi aynen calisir.
const tokenCache = new Map();
const isLocal = u => { try { return /^(localhost|127\.0\.0\.1)$/.test(new URL(u).hostname); } catch { return false; } };
async function graphFetch(url, opts, timeoutMs, what) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  catch (e) { throw new Error('Graph ' + what + ' ' + (e.name === 'AbortError' ? 'zaman asimi (' + timeoutMs / 1000 + ' sn)' : 'baglanti hatasi: ' + clean(e.cause && e.cause.code || e.message))); }
  finally { clearTimeout(t); }
}
const graphErr = async (r, what) => {
  let j = null; try { j = await r.json(); } catch { /* govde yok */ }
  // Graph: {error:{code,message}}; Entra (token): {error:'invalid_client', error_description:'AADSTS...'}
  const e = j && (j.error && typeof j.error === 'object' ? j.error : j);
  const code = e && (typeof e.code === 'string' ? e.code : typeof e.error === 'string' ? e.error : ''), msg = e && (e.message || e.error_description || '');
  return new Error('Graph ' + what + ' reddedildi: HTTP ' + r.status + (code ? ' ' + clean(code) : '') + (msg ? ' - ' + clean(msg).slice(0, 220) : ''));
};
async function graphToken(cfg) {
  const key = cfg.tenant + '|' + cfg.clientId;
  const c = tokenCache.get(key);
  if (c && c.exp > Date.now() + 60000) return c.token;
  const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const r = await graphFetch(cfg.loginUrl + '/' + encodeURIComponent(cfg.tenant) + '/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, cfg.timeoutMs, 'token alma');
  if (!r.ok) throw await graphErr(r, 'token alma');
  const j = await r.json();
  if (!j.access_token) throw new Error('Graph token alma: yanitta access_token yok');
  tokenCache.set(key, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000 });
  return j.access_token;
}
async function graphSend(cfg, { to, subject, text, html, images }) {
  const mime = buildMessage({ from: cfg.from, to, subject, text, html, images });
  const url = cfg.graphUrl + '/users/' + encodeURIComponent(addrOf(cfg.from)) + '/sendMail';
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await graphToken(cfg);
    const r = await graphFetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' }, body: Buffer.from(mime, 'utf8').toString('base64') }, cfg.timeoutMs, 'gonderim');
    if (r.status === 202 || r.status === 200) return;
    if (r.status === 401 && attempt === 0) { tokenCache.delete(cfg.tenant + '|' + cfg.clientId); continue; } // sure dolmus/iptal edilmis token
    throw await graphErr(r, 'gonderim');
  }
}

function createMailer(env, { onError } = {}) {
  const host = clean(env.SMTP_HOST), user = clean(env.SMTP_USER), from = clean(env.MAIL_FROM);
  const port = Number(env.SMTP_PORT) || 465;
  const tenant = clean(env.GRAPH_TENANT_ID), clientId = clean(env.GRAPH_CLIENT_ID), clientSecret = clean(env.GRAPH_CLIENT_SECRET);
  const useGraph = !!(tenant || clientId || clientSecret);   // Graph degiskenlerinden biri bile varsa Graph yolu secilir
  const graphOk = !!(tenant && clientId && clientSecret && from && isEmail(addrOf(from)));
  const enabled = useGraph ? graphOk : !!(host && from && isEmail(addrOf(from)) && ((user && env.SMTP_PASSWORD) || (env.SMTP_TLS === 'none' && /^(localhost|127\.0\.0\.1)$/.test(host))));
  // Neden kapali? Yalniz degisken ADLARI doner (deger veya sifre asla).
  const local = /^(localhost|127\.0\.0\.1)$/.test(host), plain = env.SMTP_TLS === 'none' && local;
  const missing = [];
  if (useGraph) { if (!tenant) missing.push('GRAPH_TENANT_ID'); if (!clientId) missing.push('GRAPH_CLIENT_ID'); if (!clientSecret) missing.push('GRAPH_CLIENT_SECRET'); }
  else if (!host) missing.push('SMTP_HOST');
  if (!from) missing.push('MAIL_FROM'); else if (!isEmail(addrOf(from))) missing.push('MAIL_FROM (geçerli bir e-posta adresi içermeli, ör. Kanal Doluluk <bildirim@alanadi.com>)');
  if (!useGraph && !plain) { if (!user) missing.push('SMTP_USER'); if (!env.SMTP_PASSWORD) missing.push('SMTP_PASSWORD'); }
  const secureEnv = env.SMTP_SECURE === 'true' ? true : env.SMTP_SECURE === 'false' ? false : undefined;
  const cfg = { secure: secureEnv, host, port, user, password: env.SMTP_PASSWORD || '', from, tls: env.SMTP_TLS || '', timeoutMs: Number(env.SMTP_TIMEOUT_MS) || 30000 };
  // Graph adresleri yalnizca test icin (yerel sahte sunucu) degistirilebilir; gercek ortamda her zaman Microsoft'un adresleri kullanilir.
  const gl = env.GRAPH_BASE_URL && isLocal(env.GRAPH_BASE_URL) ? env.GRAPH_BASE_URL.replace(/\/$/, '') : 'https://graph.microsoft.com/v1.0';
  const ll = env.GRAPH_LOGIN_URL && isLocal(env.GRAPH_LOGIN_URL) ? env.GRAPH_LOGIN_URL.replace(/\/$/, '') : 'https://login.microsoftonline.com';
  const gcfg = { tenant, clientId, clientSecret, from, graphUrl: gl, loginUrl: ll, timeoutMs: cfg.timeoutMs };
  const deliver = useGraph ? msg => graphSend(gcfg, msg) : msg => smtpSend(cfg, msg);
  const dedupe = list => [...new Set((list || []).map(x => clean(x).toLowerCase()).filter(isEmail))].slice(0, 20);
  let chain = Promise.resolve(), queued = 0;

  // Her aliciya ayri mesaj gider (adresler birbirini gormez). Uc istek yolunu bekletmez: kuyrukta sirayla gonderilir.
  function notify(kind, to, subject, text, html, images) {
    if (!enabled) return Promise.resolve({ sent: 0, skipped: 'kapali' });
    const list = dedupe(to);
    if (!list.length) return Promise.resolve({ sent: 0, skipped: 'alici yok' });
    if (queued >= 100) { if (onError) onError(new Error('e-posta kuyrugu dolu'), kind); return Promise.resolve({ sent: 0, skipped: 'kuyruk dolu' }); }
    queued += list.length;
    const jobs = list.map(addr => {
      const job = chain.then(() => deliver({ to: addr, subject, text, html, images })).then(() => true, e => { if (onError) onError(e, kind); return false; }).finally(() => { queued--; });
      chain = job.then(() => {}, () => {});
      return job;
    });
    return Promise.all(jobs).then(r => ({ sent: r.filter(Boolean).length }));
  }
  // Ayar denemesi: hatayi cagirana dondurur (yoneticiye gosterilir).
  const sendNow = (to, subject, text, html, images) => enabled ? deliver({ to, subject, text, html, images }) : Promise.reject(new Error('E-posta bildirimi yapilandirilmamis (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, MAIL_FROM veya SMTP_*).'));
  return { enabled, transport: useGraph ? 'graph' : 'smtp', missing: enabled ? [] : missing, from: enabled ? from : '', notify, sendNow, isEmail, pendingCount: () => queued };
}

module.exports = { createMailer, smtpSend, graphSend, buildMessage, isEmail, EMAIL_RE };
