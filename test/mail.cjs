// E-posta istemcisi birim testleri: iletinin bicimi, baslik enjeksiyonu, kimlik dogrulama, TLS/STARTTLS ve sertifika dogrulamasi.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createFakeSmtp } = require('./fake-smtp.cjs');
const { createMailer, smtpSend, buildMessage, isEmail } = require('../lib/mail.cjs');

(async () => {
  // --- ileti bicimi
  const msg = buildMessage({ from: 'Kanal Doluluk <bildirim@example.com>', to: 'a@example.com', subject: 'Silme talebi: Şğü\r\nBcc: kotu@example.com', text: 'Gerekçe: yanlış yüklendi\nİkinci satır' });
  assert.ok(!/^Bcc:/mi.test(msg), 'baslik enjeksiyonu');
  assert.match(msg, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(msg, /Content-Transfer-Encoding: base64/);
  assert.ok(msg.split('\r\n\r\n')[1].split('\r\n').every(l => l.length <= 76));
  assert.equal(Buffer.from(msg.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString(), 'Gerekçe: yanlış yüklendi\r\nİkinci satır');
  assert.ok(isEmail('zafer@example.com') && !['a@b', 'a b@c.com', '@x.com', 'x@y', 'a@b.com,c@d.com', 'a@b.com\r\nBcc: x@y.com'].some(isEmail));

  const base = { host: '127.0.0.1', timeoutMs: 4000, from: 'Kanal Doluluk <bildirim@example.com>' };
  const mailOf = (cfg, to = 'alici@example.com') => smtpSend({ ...base, ...cfg }, { to, subject: 'Merhaba Şğ', text: 'Metin ü' });

  // --- duz baglanti (yalniz localhost + SMTP_TLS=none): AUTH PLAIN ve AUTH LOGIN
  for (const loginOnly of [false, true]) {
    const s = createFakeSmtp({ authLoginOnly: loginOnly }); const port = await s.listen();
    await mailOf({ port, tls: 'none', user: s.user, password: s.password });
    const m = await s.waitFor(() => true);
    assert.equal(m.to, 'alici@example.com'); assert.equal(m.from, 'bildirim@example.com');
    assert.equal(m.subject, 'Merhaba Şğ'); assert.equal(m.text, 'Metin ü');
    // yanlis sifre: hata mesaji sifreyi icermez
    await assert.rejects(mailOf({ port, tls: 'none', user: s.user, password: 'yanlis-sifre-abc' }), e => /535/.test(e.message) && !/yanlis-sifre-abc/.test(e.message));
    await s.close();
  }
  // --- sifreli baglanti olmadan (localhost + none olmadan) kimlik bilgisi gonderilmez
  { const s = createFakeSmtp({ starttls: false }); const port = await s.listen();
    await assert.rejects(mailOf({ port, user: s.user, password: s.password }), /STARTTLS sunmuyor/);
    assert.equal(s.auths.length, 0, 'kimlik bilgisi acik gonderildi'); await s.close(); }
  // --- SMTP_TLS=none yalniz localhost icindir: baska bir adreste (127.0.0.2) yok sayilir, STARTTLS zorunludur ve kimlik bilgisi gitmez
  { const s = createFakeSmtp({ starttls: false }); const port = await s.listen(0, '0.0.0.0');
    await assert.rejects(mailOf({ host: '127.0.0.2', port, tls: 'none', user: s.user, password: s.password }), /STARTTLS sunmuyor/);
    assert.equal(s.auths.length, 0); await s.close(); }

  // --- TLS: dogrudan (465 tarzi) ve STARTTLS (587 tarzi), sertifika dogrulamasi
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-tls-'));
  const gen = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { encoding: 'utf8' });
  if (gen.status !== 0) console.log('ATLANDI: openssl yok, TLS testleri calistirilmadi.');
  else {
    const key = fs.readFileSync(path.join(dir, 'k.pem')), cert = fs.readFileSync(path.join(dir, 'c.pem'));
    for (const mode of ['implicit', 'starttls']) {
      const s = createFakeSmtp({ [mode]: true, key, cert }); const port = await s.listen();
      await mailOf({ host: 'localhost', port, secure: mode === 'implicit', ca: cert, user: s.user, password: s.password });
      const m = await s.waitFor(() => true);
      assert.equal(m.encrypted, true, mode + ': ileti sifreli kanaldan gelmeli');
      assert.deepEqual(s.auths.map(a => a.encrypted), [true], mode + ': kimlik bilgisi yalniz TLS icinde gonderilmeli');
      // guvenilmeyen sertifika (ca verilmedi) reddedilir; kimlik bilgisi gonderilmez
      const before = s.auths.length;
      await assert.rejects(mailOf({ host: 'localhost', port, secure: mode === 'implicit', user: s.user, password: s.password }), e => /self.signed|certificate|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(e.message + (e.code || '')));
      assert.equal(s.auths.length, before, mode + ': sertifika dogrulanamadi ama kimlik bilgisi gitti');
      await s.close();
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });

  // --- zaman asimi
  { const net = require('node:net'); const hang = net.createServer(() => {}); await new Promise(r => hang.listen(0, '127.0.0.1', r));
    await assert.rejects(mailOf({ port: hang.address().port, tls: 'none', user: 'u', password: 'p', timeoutMs: 300 }), /zaman asimi/); hang.close(); }

  // --- mailer: yapilandirma, alici suzme, hata yalitimi, sira
  assert.equal(createMailer({}).enabled, false);
  assert.deepEqual(createMailer({}).missing, ['SMTP_HOST', 'MAIL_FROM', 'SMTP_USER', 'SMTP_PASSWORD']);
  assert.deepEqual(createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', MAIL_FROM: 'a@b.co' }).missing, ['SMTP_PASSWORD']);
  assert.ok(createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASSWORD: 'p', MAIL_FROM: 'gecersiz' }).missing[0].startsWith('MAIL_FROM'));
  assert.deepEqual(createMailer({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASSWORD: 'p', MAIL_FROM: 'a@b.co' }).missing, []);
  assert.equal(createMailer({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'x@example.com' }).enabled, false); // kimlik bilgisi yok
  assert.equal(createMailer({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p', MAIL_FROM: 'gecersiz' }).enabled, false);
  assert.equal(createMailer({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p', MAIL_FROM: 'Kanal <x@example.com>' }).enabled, true);
  const s = createFakeSmtp(); const port = await s.listen(); const errors = [];
  const mailer = createMailer({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_TLS: 'none', SMTP_USER: s.user, SMTP_PASSWORD: s.password, MAIL_FROM: 'bildirim@example.com' }, { onError: (e, k) => errors.push([k, e.message]) });
  assert.equal(mailer.enabled, true);
  const r = await mailer.notify('t', ['A@Example.com', 'a@example.com', 'gecersiz', 'b@example.com\r\nBcc: x@y.com', 'c@example.com'], 'Konu', 'Govde');
  assert.equal(r.sent, 2); // yinelenen ve gecersizler elenir
  assert.deepEqual(s.mails.map(m => m.to).sort(), ['a@example.com', 'c@example.com']);
  assert.ok(s.mails.every(m => m.headerNames.filter(n => n === 'To').length === 1)); // her aliciya ayri ileti
  assert.deepEqual(await mailer.notify('t', [], 's', 't'), { sent: 0, skipped: 'alici yok' });
  s.state.reject = true;
  assert.equal((await mailer.notify('t2', ['d@example.com'], 's', 't')).sent, 0); // hata istegi bozmaz
  assert.equal(errors.length, 1); assert.match(errors[0][1], /550/); assert.equal(errors[0][0], 't2');
  s.state.reject = false;
  assert.equal((await mailer.notify('t', ['e@example.com'], 's', 't')).sent, 1); // hatadan sonra kuyruk calismaya devam eder
  await s.close();
  console.log('OK: e-posta istemcisi (bicim, enjeksiyon, AUTH, TLS/STARTTLS, sertifika dogrulama, zaman asimi, kuyruk).');
})().catch(e => { console.error(e); process.exitCode = 1; });
