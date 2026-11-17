// Gunluk ozet e-postasi: icerik, alicilar, zamanlama (hafta ici 11:00 Istanbul), tek gonderim, veri yok durumu, hata, deneme ucu.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createFakeSmtp } = require('./fake-smtp.cjs');
const { createAuth } = require('../lib/auth.cjs');
const { DEFAULT_RULES } = require('../public/core.js');
const { buildDailySummary, istanbulNow } = require('../lib/summary.cjs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ADMIN = 'summary-admin-0123456789', INGEST = 'summary-ingest-0123456789', PW = 'ozet-test-parola-123';
const PORT = 18360, base = 'http://localhost:' + PORT;

// ---- Saf birim: Istanbul saati ve icerik
{
  const t = istanbulNow(new Date('2027-05-10T07:30:00Z'));                         // UTC+3: Pazartesi 10:30
  assert.deepEqual([t.date, t.dow, t.minutes, t.yesterday], ['2027-05-10', 1, 630, '2027-05-09']);
  const late = istanbulNow(new Date('2027-05-09T21:30:00Z'));                      // Istanbul'da ertesi gun 00:30 (Pazartesi)
  assert.deepEqual([late.date, late.dow, late.minutes], ['2027-05-10', 1, 30]);
  { // donem secimi: Pazartesi = Cuma-Pazar (3 gun), diger gunler = dun; eksik gun uyarisi
    const r = (ch, d) => [ch, 'G', 'G', 'F', 'Ü', 'M', d, 'Normal Spot', 'Kusak Spot', 72000, 72300, 300, 0.1, 30];
    const days = ['2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-08', '2027-05-09', '2027-05-10'];
    const st = { rows: days.map(d => r('Atv', d)), coverage: days.map(d => 'Atv|' + d), verified: days.map(d => 'Atv|' + d), rules: DEFAULT_RULES, expectedChannels: [] };
    const mon = istanbulNow(new Date('2027-05-10T08:30:00Z'));
    assert.deepEqual([mon.start, mon.yesterday], ['2027-05-07', '2027-05-09']);
    const tue = istanbulNow(new Date('2027-05-11T08:30:00Z'));
    assert.deepEqual([tue.start, tue.yesterday], ['2027-05-10', '2027-05-10']);
    const m = buildDailySummary(st, { yesterday: mon.yesterday, start: mon.start });          // Cuma verisi yok
    assert.match(m.subject, /08 May Cumartesi – 09 May Pazar$/);
    assert.match(m.lines.join('\n'), /DİKKAT: Arşivde verisi olmayan gün: 07 May Cuma/);
    assert.match(m.lines.join('\n'), /geçen hafta aynı günler \(01 May Cumartesi – 02 May Pazar\)/);
    const t = buildDailySummary(st, { yesterday: tue.yesterday, start: tue.start });
    assert.match(t.subject, /10 May Pazartesi$/);assert.match(t.lines.join('\n'), /geçen hafta aynı gün \(03 May Pazartesi\)/);
    assert.ok(!/DİKKAT/.test(t.lines.join('\n')));
  }
  const e = buildDailySummary({ rows: [], coverage: [], verified: [], rules: DEFAULT_RULES }, { yesterday: '2027-05-09' });
  assert.equal(e.hasData, false);assert.match(e.lines[0], /henüz veri yok/);
}

function seed(dir) {
  const row = (ch, date, a, dur, grp) => [ch, 'Gıda', 'Gıda', 'F', 'Ü', 'M', date, 'Normal Spot', 'Kusak Spot', a, a + dur, dur, grp, grp * dur];
  // Pazartesi ozeti Cuma-Cumartesi-Pazar'i (07-09 May) onceki haftanin ayni gunleriyle (30 Nis - 02 May) karsilastirir
  const cur = ['2027-05-07', '2027-05-08', '2027-05-09'], old = ['2027-04-30', '2027-05-01', '2027-05-02'];
  const rows = [], coverage = [];
  for (const d of cur) { rows.push(row('Atv', d, 72000, 600, 0.5), row('Atv', d, 73000, 600, 0.5), row('Atv', d, 74000, 600, 0.5), row('Kanal D', d, 72000, 600, 0.5), row('Kanal D', d, 73000, 600, 0.5)); coverage.push('Atv|' + d, 'Kanal D|' + d); }
  rows.push(row('Minor 1', '2027-05-09', 72000, 300, 0)); coverage.push('Minor 1|2027-05-09');
  for (const d of old) { rows.push(row('Atv', d, 72000, 600, 0.5), row('Atv', d, 73000, 600, 0.5)); coverage.push('Atv|' + d); }
  const state = { rows, coverage, verified: coverage.filter(k => k !== 'Minor 1|2027-05-09'), expectedChannels: ['Atv', 'Kanal D', 'Minor 1', 'Tv8'], rules: DEFAULT_RULES, updatedAt: '2027-05-09T20:00:00.000Z', updatedBy: 'admin' };
  fs.writeFileSync(path.join(dir, 'archive.json.gz'), zlib.gzipSync(JSON.stringify(state)));
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozet-test-'));
  const fake = createFakeSmtp(), smtpPort = await fake.listen();
  seed(dir);
  // Kullanicilar (kisi hesaplari): e-postasi olanlar, kapali hesap, e-postasiz hesap
  const auth = createAuth({ dir, adminPassword: ADMIN });
  const actor = { username: 'seed' };
  for (const o of [{ username: 'ekip@example.com', role: 'viewer' }, { username: 'yonetici', role: 'admin', email: 'yonetici.kisi@example.com' }, { username: 'super@example.com', role: 'superadmin' }, { username: 'kapali@example.com', role: 'viewer' }, { username: 'emailsiz', role: 'viewer' }])
    await auth.manage(actor, { op: 'create', password: PW, ...o });
  await auth.manage(actor, { op: 'disable', username: 'kapali@example.com' });
  const EXPECT = ['ekip@example.com', 'super@example.com', 'yonetici.kisi@example.com'];

  let proc;
  const start = async env2 => {
    proc = spawn(process.execPath, ['server.cjs'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore', env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, ADMIN_PASSWORD: ADMIN, INGEST_TOKEN: INGEST, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_TLS: 'none', SMTP_USER: fake.user, SMTP_PASSWORD: fake.password, MAIL_FROM: 'Kanal Doluluk <bildirim@example.com>', SUMMARY_TICK_MS: '150', ...env2 } });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) return; } catch { /* henuz acilmadi */ } await sleep(80); }
    throw Error('sunucu acilmadi');
  };
  const stop = async () => { if (proc && proc.exitCode === null && proc.signalCode === null) { proc.kill(); await once(proc, 'exit'); } };
  const run = async (env2, waitMs = 1200) => { fake.mails.length = 0; await start(env2); await sleep(waitMs); const m = fake.mails.slice(); await stop(); return m; };
  const to = m => m.map(x => x.to).sort();
  const stateFile = () => JSON.parse(fs.readFileSync(path.join(dir, 'summary-state.json'), 'utf8'));
  try {
    // 1) Pazartesi 11:30: hesabi acik ve e-postasi olan herkese, bir kez
    let m = await run({ SUMMARY_NOW_OVERRIDE: '2027-05-10T08:30:00Z' }, 1500);
    assert.deepEqual(to(m), EXPECT);
    assert.equal(m[0].subject, '[Kanal Doluluk] Günlük özet — 07 May Cuma – 09 May Pazar');
    const t = m[0].text;
    assert.match(t, /07 May Cuma – 09 May Pazar günleri/);
    assert.match(t, /Genel doluluk: %10 — geçen hafta aynı günler \(30 Nis Cuma – 02 May Pazar\): %9 \(\+1 puan\)/);
    assert.match(t, /1\. Atv: %13 \(\+4 puan\) · GRP 4,5/);
    assert.match(t, /2\. Kanal D: %9 · GRP 3,0/);                                  // geçen hafta Kanal D verisi yok: fark yazilmaz
    assert.match(t, /Diğer 1 kanalın ortalaması: %2/);
    assert.match(t, /GRP: 7,5 \(\+150%\) · GRPxSEC: 4\.500,0/);
    assert.match(t, /En yüksek GRP: Atv 4,5 · Kanal D 3,0/);
    assert.match(t, /Beklenen kanallar için bu dönemin verisi yok: Tv8/);
    assert.match(t, /1 kanal-günün kapsamı doğrulanmamış/);
    assert.ok(!/DİKKAT/.test(t));assert.ok(!/20(26|27)-/.test(t),'ISO tarih/yil gorunmemeli');
    const h = m[0].html;                                                               // grafikli HTML surum
    assert.ok(m[0].multipart && h, 'multipart/alternative olmali');
    assert.deepEqual(m[0].cids.sort(), ['kd-growity', 'kd-time']);assert.ok(/powered by/.test(h) && /Powered by Growity AI Studio/.test(m[0].text));
    assert.ok(![...h.matchAll(/<img[^>]*src="([^"]*)"/g)].some(x => !x[1].startsWith('cid:')), 'yalniz gomulu (cid:) resim');
    assert.ok(!/<script|<link|https?:\/\/(?!example)/i.test(h.replace(/href="[^"]*"/g, '')), 'betik/dis resim olmamali');
    for (const x of ['%10', '%13', 'Atv', 'Kanal D', 'Beklenen', '7 ana kanal', 'Saatlik doluluk', 'En yüksek GRP']) assert.ok(h.includes(x) || /Beklenen/.test(x), 'HTML: ' + x);
    assert.ok(/bgcolor="#a8e0c4"|bgcolor="#fbd98f"|bgcolor="#f7b2c2"/.test(h), 'doluluk cubuklari renkli olmali');
    assert.ok(h.length < 100000);
    assert.equal(stateFile().last, '2027-05-10');
    // 2) Ayni gun sunucu yeniden baslarsa tekrar gonderilmez
    m = await run({ SUMMARY_NOW_OVERRIDE: '2027-05-10T08:40:00Z' });
    assert.deepEqual(m, []);
    // 3) Sali: dunun (Pazartesi) verisi yok -> uyari, verisi olan son gun ozetlenir
    m = await run({ SUMMARY_NOW_OVERRIDE: '2027-05-11T08:30:00Z' }, 1500);
    assert.deepEqual(to(m), EXPECT);
    assert.match(m[0].text, /DİKKAT: Dün \(10 May Pazartesi\) için arşivde veri yok\. .* 09 May Pazar\./);
    assert.match(m[0].subject, /09 May Pazar$/);
    // 4) Hafta sonu, 11:00'dan once ve 3 saatlik pencere disi: gonderilmez
    for (const iso of ['2027-05-15T08:30:00Z' /* Cumartesi */, '2027-05-16T08:30:00Z' /* Pazar */, '2027-05-17T07:30:00Z' /* Pzt 10:30 */, '2027-05-17T11:30:00Z' /* Pzt 14:30 */, '2027-05-17T12:00:00Z' /* Pzt 15:00 */])
      assert.deepEqual(await run({ SUMMARY_NOW_OVERRIDE: iso }, 700), [], 'gonderilmemeli: ' + iso);
    // 5) 11:00'u kacirdiysa pencere icinde yetisir (Pzt 13:30)
    m = await run({ SUMMARY_NOW_OVERRIDE: '2027-05-17T10:30:00Z' }, 1500);
    assert.deepEqual(to(m), EXPECT);
    // 6) NOTIFY_ON'da daily-summary yoksa gonderilmez
    assert.deepEqual(await run({ SUMMARY_NOW_OVERRIDE: '2027-05-18T08:30:00Z', NOTIFY_ON: 'import' }, 800), []);
    // 7) SUMMARY_TIME ile saat degistirilir (11:30 ayari: 10:30'da gitmez)
    assert.deepEqual(await run({ SUMMARY_NOW_OVERRIDE: '2027-05-18T07:30:00Z', SUMMARY_TIME: '11:30' }, 800), []);
    m = await run({ SUMMARY_NOW_OVERRIDE: '2027-05-18T08:35:00Z', SUMMARY_TIME: '11:30' }, 1500);
    assert.equal(m.length, EXPECT.length);
    // 8) SMTP hatasi: gonderildi olarak isaretlenmez, hata denetim kaydina yazilir
    fake.state.reject = true;
    m = await run({ SUMMARY_NOW_OVERRIDE: '2027-05-19T08:30:00Z' }, 1500);
    fake.state.reject = false;
    assert.deepEqual(m, []);
    const st = stateFile();assert.notEqual(st.last, '2027-05-19');assert.equal(st.tries.date, '2027-05-19');assert.equal(st.tries.n, 1);
    assert.ok(fs.readFileSync(path.join(dir, 'audit.log'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).some(e => e.event === 'mail-failed' && e.detail.kind === 'daily-summary'));
    // 9) Deneme ucu: yalniz Super-yonetici, kendi adresine
    fake.mails.length = 0;
    await start({ SUMMARY_NOW_OVERRIDE: '2027-05-15T08:30:00Z' });                    // Cumartesi: zamanlanmis gonderim tetiklenmez, yalniz deneme ucu
    const login = async (u) => (await fetch(base + '/api/login', { method: 'POST', headers: { 'X-Panel-Request': '1' }, body: JSON.stringify({ username: u, password: PW }) })).headers.get('set-cookie').split(';')[0];
    const post = (c) => fetch(base + '/api/summary-test', { method: 'POST', headers: { 'X-Panel-Request': '1', Cookie: c }, body: '{}' });
    assert.equal((await post(await login('ekip@example.com'))).status, 403);
    assert.equal((await post(await login('yonetici'))).status, 403);
    const adm = (await fetch(base + '/api/login', { method: 'POST', headers: { 'X-Panel-Request': '1' }, body: JSON.stringify({ username: 'admin', password: ADMIN }) })).headers.get('set-cookie').split(';')[0];
    assert.equal((await post(adm)).status, 400);                                      // acil durum hesabinin adresi yok
    const ok = await post(await login('super@example.com'));assert.equal(ok.status, 200);
    const mm = await fake.waitFor(() => true);
    assert.equal(mm.to, 'super@example.com');assert.match(mm.subject, /Günlük özet — 09 May Pazar/);assert.match(mm.text, /DİKKAT: Dün \(14 May Cuma\)/);assert.equal(fake.mails.length, 1);
    const info = await (await fetch(base + '/api/users', { headers: { Cookie: await login('super@example.com') } })).json();
    assert.deepEqual(info.mail.summary, { enabled: true, time: '11:00', days: [1, 2, 3, 4, 5] });
    await stop();
    console.log('OK: gunluk ozet (icerik, alicilar, zamanlama, tek gonderim, veri yok, hata, deneme ucu).');
  } finally { await stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
