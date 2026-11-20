'use strict';
// Bagimliliksiz, saglayicidan bagimsiz SMTP istemcisi (Google Workspace, Microsoft 365, SendGrid, Resend, Brevo, Mailgun ...).
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

function createMailer(env, { onError } = {}) {
  const host = clean(env.SMTP_HOST), user = clean(env.SMTP_USER), from = clean(env.MAIL_FROM);
  const port = Number(env.SMTP_PORT) || 465;
  const enabled = !!(host && from && isEmail(addrOf(from)) && ((user && env.SMTP_PASSWORD) || (env.SMTP_TLS === 'none' && /^(localhost|127\.0\.0\.1)$/.test(host))));
  // Neden kapali? Yalniz degisken ADLARI doner (deger veya sifre asla).
  const local = /^(localhost|127\.0\.0\.1)$/.test(host), plain = env.SMTP_TLS === 'none' && local;
  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!from) missing.push('MAIL_FROM'); else if (!isEmail(addrOf(from))) missing.push('MAIL_FROM (geçerli bir e-posta adresi içermeli, ör. Kanal Doluluk <bildirim@alanadi.com>)');
  if (!plain) { if (!user) missing.push('SMTP_USER'); if (!env.SMTP_PASSWORD) missing.push('SMTP_PASSWORD'); }
  const secureEnv = env.SMTP_SECURE === 'true' ? true : env.SMTP_SECURE === 'false' ? false : undefined;
  const cfg = { secure: secureEnv, host, port, user, password: env.SMTP_PASSWORD || '', from, tls: env.SMTP_TLS || '', timeoutMs: Number(env.SMTP_TIMEOUT_MS) || 30000 };
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
      const job = chain.then(() => smtpSend(cfg, { to: addr, subject, text, html, images })).then(() => true, e => { if (onError) onError(e, kind); return false; }).finally(() => { queued--; });
      chain = job.then(() => {}, () => {});
      return job;
    });
    return Promise.all(jobs).then(r => ({ sent: r.filter(Boolean).length }));
  }
  // Ayar denemesi: hatayi cagirana dondurur (yoneticiye gosterilir).
  const sendNow = (to, subject, text, html, images) => enabled ? smtpSend(cfg, { to, subject, text, html, images }) : Promise.reject(new Error('E-posta bildirimi yapilandirilmamis (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM).'));
  return { enabled, missing: enabled ? [] : missing, from: enabled ? from : '', notify, sendNow, isEmail, pendingCount: () => queued };
}

module.exports = { createMailer, smtpSend, buildMessage, isEmail, EMAIL_RE };
