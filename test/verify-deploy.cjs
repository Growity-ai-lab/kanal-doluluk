// Canli (veya yerel) bir kurulumu dis tarafindan dogrular. Veriyi degistirmez.
//
//   node test/verify-deploy.cjs https://<servis>.onrender.com
//
// Ek (istege bagli) kontroller icin ortam degiskenleri:
//   VERIFY_USER, VERIFY_PASSWORD   -> oturum, cerez bayraklari, arsiv durumu ve yonetici uclari
//   VERIFY_INGEST_TOKEN            -> Windows aktarim anahtarinin dogru tanimlandigi (bos govdeyle; veri yazilmaz)
// Sifreler komut satirina degil ortam degiskenine yazilir; betik hicbir sifreyi ekrana basmaz.
'use strict';
const target = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^\s/]+$/.test(target)) { console.error('Kullanim: node test/verify-deploy.cjs https://<servis>.onrender.com'); process.exit(2); }
if (/servis-adi|<|>|yer-?tutucu|example\.|your-?service/i.test(target)) { console.error('Adres bir yer tutucuya benziyor: ' + target + '\nGercek Render adresini yazin (servis sayfasinin ustunde gorunur). Hicbir istek gonderilmedi.'); process.exit(2); }
const https = target.startsWith('https://');
const env = process.env;
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log((pass ? '  ✓ ' : '  ✗ ') + name + (detail ? '  — ' + detail : '')); };
const skip = (name, why) => console.log('  - ' + name + '  — atlandı: ' + why);
const get = (p, o = {}) => fetch(target + p, { redirect: 'manual', ...o });
const header = (r, h) => r.headers.get(h) || '';

(async () => {
  console.log('\nDogrulama: ' + target + '\n');

  console.log('Sunucu');
  let r;
  try { r = await get('/healthz'); } catch (e) { ok('Sunucuya ulasilir', false, e.message + ' — servis ayakta mi, adres dogru mu?'); process.exit(1); }
  const health = r.status === 200 ? await r.json().catch(() => null) : null;
  ok('/healthz 200 ve {"ok":true}', !!(health && health.ok === true), 'HTTP ' + r.status);
  // Kimlik bilgileri YALNIZCA adres bu uygulamayi gercekten yanit veriyorsa gonderilir.
  if (!(health && health.ok === true)) { console.log('\nBu adres uygulamanin saglik yanitini vermiyor. Kimlik bilgileri ve anahtarlar GONDERILMEDI. Adresi kontrol edin.\n'); process.exit(1); }
  if (https) ok('HTTPS kullaniliyor, HSTS basligi var', /max-age/.test(header(r, 'strict-transport-security')), header(r, 'strict-transport-security') || 'Strict-Transport-Security yok');
  else skip('HTTPS / HSTS', 'adres http:// (canlida https:// kullanin)');

  console.log('\nGiris sayfasi ve basliklar');
  r = await get('/login');
  const html = await r.text();
  const isApp = r.status === 200 && /id="f"/.test(html) && /Kanal Doluluk Analizi/.test(html) && /script-src 'self'/.test(header(r, 'content-security-policy'));
  ok('/login 200 ve giris formu geliyor', r.status === 200 && /id="f"/.test(html), 'HTTP ' + r.status);
  const csp = header(r, 'content-security-policy');
  ok("CSP: script-src 'self', satir ici betik yok", /script-src 'self'/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && !/unsafe-eval/.test(csp), csp ? '' : 'baslik yok');
  ok('frame-ancestors none, X-Frame-Options DENY', /frame-ancestors 'none'/.test(csp) && header(r, 'x-frame-options') === 'DENY');
  ok('nosniff, Referrer-Policy, Cache-Control: no-store', header(r, 'x-content-type-options') === 'nosniff' && header(r, 'referrer-policy') === 'no-referrer' && /no-store/.test(header(r, 'cache-control')));
  for (const f of ['/login.js', '/login.css']) { const x = await get(f); ok(f + ' oturumsuz acilir', x.status === 200, 'HTTP ' + x.status); }

  console.log('\nOturumsuz erisim kapali');
  r = await get('/');
  ok('/ -> /login yonlendirmesi', r.status === 302 && header(r, 'location') === '/login', 'HTTP ' + r.status + ' ' + header(r, 'location'));
  for (const f of ['/app.js', '/app.css', '/worker.js']) { const x = await get(f); ok(f + ' oturum ister', x.status === 302, 'HTTP ' + x.status); }
  for (const f of ['/api/state', '/api/session', '/api/users', '/api/audit', '/api/snapshots']) { const x = await get(f); ok(f + ' 401 doner', x.status === 401, 'HTTP ' + x.status); }
  r = await get('/api/state', { headers: { Authorization: 'Basic ' + Buffer.from('admin:x').toString('base64') } });
  ok('Basic Auth kabul edilmez', r.status === 401, 'HTTP ' + r.status);
  r = await get('/api/import?start=2026-01-01&end=2026-01-01', { method: 'POST', headers: { Authorization: 'Bearer yanlis-anahtar-yanlis-anahtar' }, body: '' });
  ok('Yanlis aktarim anahtari reddedilir', r.status === 401, 'HTTP ' + r.status);

  console.log('\nOtomatik aktarim anahtari (INGEST_TOKEN)');
  if (env.VERIFY_INGEST_TOKEN && !isApp) skip('INGEST_TOKEN', 'adres bu uygulamanin giris sayfasini vermiyor; anahtar gonderilmedi');
  else if (env.VERIFY_INGEST_TOKEN) {
    r = await get('/api/import?start=2026-01-01&end=2026-01-01', { method: 'POST', headers: { Authorization: 'Bearer ' + env.VERIFY_INGEST_TOKEN }, body: '' });
    const body = await r.json().catch(() => ({}));
    ok('Dogru anahtar kabul edilir (bos dosya 400 ile reddedilir, veri yazilmaz)', r.status === 400 && /XLSX/.test(body.error || ''), 'HTTP ' + r.status + ' ' + (body.error || ''));
  } else skip('INGEST_TOKEN', 'VERIFY_INGEST_TOKEN verilmedi');

  console.log('\nGiris yapmis kullanici');
  if (env.VERIFY_USER && env.VERIFY_PASSWORD && !isApp) skip('Oturum kontrolleri', 'adres bu uygulamanin giris sayfasini vermiyor; sifre gonderilmedi');
  else if (env.VERIFY_USER && env.VERIFY_PASSWORD) {
    r = await get('/api/login', { method: 'POST', headers: { 'X-Panel-Request': '1' }, body: JSON.stringify({ username: env.VERIFY_USER, password: env.VERIFY_PASSWORD }) });
    const login = await r.json().catch(() => ({}));
    ok('Giris basarili', r.status === 200, r.status === 200 ? login.username + ' (' + login.role + ')' : 'HTTP ' + r.status + ' ' + (login.error || ''));
    const sc = header(r, 'set-cookie');
    if (r.status === 200) {
      ok('Oturum cerezi HttpOnly + SameSite=Strict', /HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc));
      if (https) ok('Oturum cerezi Secure', /;\s*Secure/i.test(sc), 'Render proxy arkasinda x-forwarded-proto=https olmali');
      const cookie = sc.split(';')[0], H = { headers: { Cookie: cookie } };
      r = await get('/api/session', H); const ses = await r.json();
      ok('/api/session', r.status === 200, 'rol: ' + ses.role + ', saklama: ' + ses.retentionDays + ' gun' + (ses.breakGlass ? ', acil durum hesabi' : ''));
      r = await get('/', H); ok('Ana sayfa aciliyor', r.status === 200 && /app\.js/.test(await r.text()), 'HTTP ' + r.status);
      r = await get('/api/state', H);
      const st = await r.json();
      ok('Arsiv okunuyor', r.status === 200 && Array.isArray(st.rows), st.rows ? st.rows.length.toLocaleString('tr-TR') + ' kayit, ' + (st.coverage || []).length + ' kanal-gun' + (st.updatedAt ? ', son yukleme ' + st.updatedAt : ', henuz veri yuklenmemis') : '');
      if (ses.admin) { r = await get('/api/snapshots', H); const sn = await r.json(); ok('Anlik goruntu listesi (yonetici ve ustu)', r.status === 200, (sn.snapshots || []).length + ' kopya, saklama ' + sn.keep); }
      else { r = await get('/api/snapshots', H); ok('Ekip kullanicisi anlik goruntulere giremez', r.status === 403, 'HTTP ' + r.status); }
      if (ses.superadmin) {
        r = await get('/api/users', H); const us = await r.json(); ok('Kullanici listesi (super-yonetici)', r.status === 200, (us.users || []).length + ' kisi hesabi');
        console.log('  i E-posta bildirimi: ' + (us.mail && us.mail.enabled ? 'acik (gonderen: ' + us.mail.from + ')' : 'kapali (SMTP ayarlari tanimli degil)'));
        r = await get('/api/audit?limit=5', H); const au = await r.json(); ok('Denetim kaydi (super-yonetici)', r.status === 200, (au.entries || []).length + ' son kayit');
      } else {
        r = await get('/api/users', H); ok('Kullanici yonetimi yalniz super-yoneticiye acik', r.status === 403, 'HTTP ' + r.status);
      }
      await get('/api/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Panel-Request': '1' } });
    }
  } else skip('Oturum kontrolleri', 'VERIFY_USER ve VERIFY_PASSWORD verilmedi');

  const failed = results.filter(x => !x.pass);
  console.log('\n' + (failed.length ? failed.length + ' kontrol BASARISIZ, ' + (results.length - failed.length) + ' basarili.' : 'Tum kontroller basarili (' + results.length + ').') + '\n');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
