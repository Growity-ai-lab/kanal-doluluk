// Olcek testi (npm test'e dahil degildir): sentetik ADEX arsivi uretir, sunucuyu bu arsivle baslatir ve
// bellek, acilis suresi, otomatik/panel yukleme suresi, olay dongusu duraklamasi ve istemci hesabini olcer.
//
//   node test/scale.cjs [--days=90,365,730] [--rows-per-day=3500] [--heap=MB] [--browser] [--out=sonuc.json]
//
// --heap: sunucuyu `--max-old-space-size=MB` ile baslatir (Render Starter 512 MB'ina benzetmek icin).
// --browser[ --browser-days=365]: o boyutta gercek Chromium ile sayfa yukleme suresini ve bellegini de olcer.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { performance } = require('node:perf_hooks');
const XLSX = require('../public/xlsx.full.min.js');
const core = require('../public/core.js');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const DAYS = arg('days', '90,365,730').split(',').map(Number);
const PER_DAY = Number(arg('rows-per-day', '3500'));
const HEAP = Number(arg('heap', '0'));
const BROWSER = process.argv.includes('--browser');
const BROWSER_DAYS = Number(arg('browser-days', DAYS[1] || DAYS[0]));
const OUT = arg('out', '');
const PORT = 18500;
const base = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MB = n => Math.round(n / 1048576);

// ---- Sentetik veri
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const MAIN = core.MAIN;
const CHANNELS = [...MAIN, 'Minor 1', 'Minor 2', 'Minor 3', 'Minor 4', 'Minor 5', 'Minor 6', 'Minor 7', 'Minor 8'];
const SECTORS = Array.from({ length: 30 }, (_, i) => 'Sektor ' + (i + 1));
const FIRMS = Array.from({ length: 800 }, (_, i) => 'Reklamveren ' + (i + 1));
const BRANDS = Array.from({ length: 2500 }, (_, i) => 'Marka ' + (i + 1));
const PRODUCTS = Array.from({ length: 60 }, (_, i) => 'Urun ' + (i + 1));
const TYPES = [['Normal Spot', 'Kusak Spot', 0.9], ['Cerceve-Bant', 'Cerceve Reklam', 0.06], ['Sponsorluk', 'Jenerik Spon.', 0.04]];
const DURS = [10, 15, 20, 30, 30, 45, 60];
const hms = s => String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const isoDay = (start, i) => new Date(Date.parse(start + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);

function dayRows(date, rnd) {
  const out = [], main = Math.round(PER_DAY * 0.7 / MAIN.length), minor = Math.round(PER_DAY * 0.3 / (CHANNELS.length - MAIN.length));
  CHANNELS.forEach((ch, ci) => {
    const n = ci < MAIN.length ? main : minor;
    for (let i = 0; i < n; i++) {
      const a = 25200 + Math.floor(rnd() * 68000), dur = DURS[Math.floor(rnd() * DURS.length)];
      let t = rnd(), ty = TYPES[0];
      for (const x of TYPES) { if (t < x[2]) { ty = x; break; } t -= x[2]; }
      const s = SECTORS[Math.floor(rnd() * 30)];
      out.push([ch, s, s, FIRMS[Math.floor(rnd() * 800)], PRODUCTS[Math.floor(rnd() * 60)], BRANDS[Math.floor(rnd() * 2500)], date, ty[0], ty[1], a, a + dur, dur]);
    }
  });
  return out;
}

async function writeArchive(file, days, start) {
  const gz = zlib.createGzip({ level: 6 }), out = fs.createWriteStream(file);
  gz.pipe(out);
  const put = s => new Promise(r => gz.write(s, r));
  let raw = 0, rows = 0;
  const w = async s => { raw += Buffer.byteLength(s); await put(s); };
  const rnd = rng(42);
  await w('{"rows":[');
  let first = true;
  for (let d = 0; d < days; d++) {
    const rs = dayRows(isoDay(start, d), rnd);
    rows += rs.length;
    await w((first ? '' : ',') + rs.map(r => JSON.stringify(r)).join(','));
    first = false;
  }
  const keys = [];
  for (let d = 0; d < days; d++) for (const c of CHANNELS) keys.push(c + '|' + isoDay(start, d));
  await w('],"coverage":' + JSON.stringify(keys) + ',"verified":' + JSON.stringify(keys) + ',"expectedChannels":[],"rules":' + JSON.stringify(core.DEFAULT_RULES) + ',"updatedAt":"2026-01-01T00:00:00.000Z","updatedBy":"admin"}');
  gz.end(); await once(out, 'close');
  return { rows, rawBytes: raw, gzBytes: fs.statSync(file).size };
}

function workbook(start, days, seed) {
  const rnd = rng(seed), head = ['MEDYA', 'Y.ANA SEKTÖR', 'Y.SEKTÖR', 'REKLAMIN FİRMASI', 'ÜRÜN TÜRÜ', 'MARKA', 'TARİH', 'SPOT TİPİ', 'SPOT TİPİ D.', 'BAŞLANGIÇ', 'BİTİŞ', 'SÜRE'];
  const data = [head];
  for (let d = 0; d < days; d++) for (const r of dayRows(isoDay(start, d), rnd)) data.push([...r.slice(0, 9), hms(r[9]), hms(r[10]), r[11]]);
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(data));
  return XLSX.write(w, { type: 'buffer', bookType: 'xlsx', compression: true }); // Excel dosyalari sikistirilmis zip'tir
}

// ---- Sunucu yardimcilari
const env0 = { ADMIN_PASSWORD: 'scale-admin-0123456789', INGEST_TOKEN: 'scale-ingest-0123456789' };
function proc(pid) {
  let t;
  try { t = fs.readFileSync('/proc/' + pid + '/status', 'utf8'); } catch { return { rss: 0, hwm: 0 }; } // surec oldu
  const g = k => Number((t.match(new RegExp(k + ':\\s+(\\d+)')) || [0, 0])[1]) * 1024;
  return { rss: g('VmRSS'), hwm: g('VmHWM') };
}
async function startServer(dataDir) {
  const args = [...(HEAP ? ['--max-old-space-size=' + HEAP] : []), 'server.cjs'];
  const p = spawn(process.execPath, args, { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...env0, PORT: String(PORT), DATA_DIR: dataDir, SNAPSHOT_KEEP: '3' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => err += d);
  const t0 = performance.now();
  for (let i = 0; i < 1200; i++) {
    if (p.exitCode !== null) return { p, failed: true, err: err.slice(-400), exitCode: p.exitCode };
    try { if ((await fetch(base + '/healthz')).ok) return { p, startMs: performance.now() - t0 }; } catch { /* henuz acilmadi */ }
    await sleep(100);
  }
  return { p, failed: true, err: 'zaman asimi' };
}
async function stopServer(p) { if (p.exitCode === null && p.signalCode === null) { p.kill('SIGKILL'); await once(p, 'exit'); } }
async function cookie() {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'X-Panel-Request': '1' }, body: JSON.stringify({ username: 'admin', password: env0.ADMIN_PASSWORD }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function probed(fn) {
  let stop = false, max = 0;
  const probe = (async () => { while (!stop) { const t = performance.now(); try { await fetch(base + '/healthz'); } catch { /* sunucu dustu */ } max = Math.max(max, performance.now() - t); await sleep(20); } })();
  const t0 = performance.now();
  let result, error;
  try { result = await fn(); } catch (e) { error = e.message; }
  stop = true; await probe;
  return { ms: performance.now() - t0, stallMs: max, result, error };
}
function dirBytes(d) { try { return fs.readdirSync(d).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0); } catch { return 0; } }

async function ingest(label, p, ck, start, days, mode) {
  const buf = workbook(start, days, 7 + days);
  const end = isoDay(start, days - 1);
  const url = mode === 'machine' ? '/api/import?start=' + start + '&end=' + end : '/api/import?mode=append&start=&end=&complete=1';
  const headers = mode === 'machine' ? { Authorization: 'Bearer ' + env0.INGEST_TOKEN } : { Cookie: ck, 'X-Panel-Request': '1' };
  const before = proc(p.pid);
  const r = await probed(async () => { const res = await fetch(base + url, { method: 'POST', headers, body: buf }); return { status: res.status, body: await res.text() }; });
  const after = p.exitCode === null ? proc(p.pid) : { rss: 0, hwm: 0 };
  return { label, xlsxMB: +(buf.length / 1048576).toFixed(1), rows: days * PER_DAY, ms: Math.round(r.ms), stallMs: Math.round(r.stallMs), status: r.result && r.result.status, error: r.error, rssMB: MB(after.rss), peakMB: MB(after.hwm), peakGrowthMB: MB(after.hwm - before.hwm), crashed: p.exitCode !== null };
}

async function clientSide(ck, rowsHint) {
  const t0 = performance.now();
  const res = await fetch(base + '/api/state', { headers: { Cookie: ck } });
  const text = await res.text();
  const fetchMs = performance.now() - t0, h0 = process.memoryUsage().heapUsed;
  const t1 = performance.now(); const s = JSON.parse(text); const parseMs = performance.now() - t1;
  const heapMB = MB(process.memoryUsage().heapUsed - h0);
  const days = [...new Set(s.rows.map(r => r[6]))].sort();
  const f = d0 => ({ start: d0, end: days[days.length - 1], granularity: 'day', group: '', channel: '', sector: '', firm: '', brand: '', view: 'channel', hourStart: 7, bands: ['OPT', 'Erken PT', 'PT', 'Geç PT'] });
  const run = (d0, view, g) => { const t = performance.now(); core.analyze(s.rows, { ...f(d0), view, granularity: g || 'day' }, s.coverage, s.rules, s.verified); return Math.round(performance.now() - t); };
  const last30 = days[Math.max(0, days.length - 30)];
  return { stateMB: MB(Buffer.byteLength(text)), fetchMs: Math.round(fetchMs), parseMs: Math.round(parseMs), parsedHeapMB: heapMB, rows: s.rows.length, calcAllChannelMs: run(days[0], 'channel'), calcAllBrandMs: run(days[0], 'brand'), calcAllWeekMs: run(days[0], 'channel', 'week'), calc30dMs: run(last30, 'channel') };
}

async function browserCheck(ck, dataDir) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { return { skipped: 'playwright yok' }; }
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addCookies([{ name: 'sid', value: ck.split('=')[1], url: base }]);
  const pg = await c.newPage();
  const t0 = performance.now();
  await pg.goto(base + '/');
  await pg.waitForFunction(() => /Ortak ar/.test(document.getElementById('status').textContent) && /kay/.test(document.getElementById('status').textContent), null, { timeout: 300000 });
  await pg.waitForFunction(() => document.getElementById('rate').textContent !== '—', null, { timeout: 300000 });
  const loadMs = performance.now() - t0;
  const heap = await pg.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  const t1 = performance.now();
  await pg.click('nav button[data-view="brand"]');
  await pg.waitForFunction(() => document.getElementById('rankTitle').textContent.includes('Marka'), null, { timeout: 300000 });
  const switchMs = performance.now() - t1;
  const rss = require('node:child_process').execSync("ps -eo rss,args | grep -i chrom | grep -v grep | awk '{s+=$1} END {print s}'").toString().trim();
  await b.close();
  return { loadMs: Math.round(loadMs), pageHeapMB: heap, brandViewMs: Math.round(switchMs), chromeTotalRssMB: Math.round(Number(rss) / 1024) };
}

(async () => {
  const results = [];
  console.log('Olcek testi: gunluk ~' + PER_DAY + ' satir, ' + CHANNELS.length + ' kanal, ' + os.cpus().length + ' CPU, ' + MB(os.totalmem()) + ' MB RAM' + (HEAP ? ', sunucu heap siniri ' + HEAP + ' MB' : '') + '\n');
  for (const days of DAYS) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanal-scale-'));
    const r = { days, rows: days * PER_DAY };
    try {
      const t = performance.now();
      Object.assign(r, await writeArchive(path.join(dataDir, 'archive.json.gz'), days, '2024-01-01'));
      r.rawMB = MB(r.rawBytes); r.gzMB = +(r.gzBytes / 1048576).toFixed(1); delete r.rawBytes; delete r.gzBytes;
      console.log('[' + days + ' gun] arsiv uretildi: ' + r.rows.toLocaleString('tr-TR') + ' satir, ham ' + r.rawMB + ' MB, gzip ' + r.gzMB + ' MB (' + Math.round(performance.now() - t) + ' ms)');
      const s = await startServer(dataDir);
      if (s.failed) { r.start = { failed: true, err: s.err, exitCode: s.exitCode }; console.log('   SUNUCU ACILAMADI:', s.err); results.push(r); await stopServer(s.p); continue; }
      r.startMs = Math.round(s.startMs); r.idle = proc(s.p.pid); r.idleRssMB = MB(r.idle.rss); r.idlePeakMB = MB(r.idle.hwm); delete r.idle;
      console.log('   acilis ' + r.startMs + ' ms, bos RSS ' + r.idleRssMB + ' MB (tepe ' + r.idlePeakMB + ' MB)');
      const ck = await cookie();
      const nextStart = isoDay('2024-01-01', days);
      r.client = await clientSide(ck);
      console.log('   istemci: durum ' + r.client.stateMB + ' MB (indirme ' + r.client.fetchMs + ' ms, parse ' + r.client.parseMs + ' ms, bellek +' + r.client.parsedHeapMB + ' MB); hesap tum aralik kanal ' + r.client.calcAllChannelMs + ' ms, marka ' + r.client.calcAllBrandMs + ' ms, haftalik ' + r.client.calcAllWeekMs + ' ms, son 30 gun ' + r.client.calc30dMs + ' ms');
      r.ingests = [];
      let cursor = 0;
      for (const [label, n, mode] of [['otomatik 1 gun', 1, 'machine'], ['otomatik 7 gun', 7, 'machine'], ['panel 31 gun (aylik dosya)', 31, 'panel']]) {
        if (s.p.exitCode !== null) break;
        const x = await ingest(label, s.p, ck, isoDay(nextStart, cursor), n, mode); cursor += n;
        r.ingests.push(x);
        console.log('   yukleme ' + label + ': ' + x.ms + ' ms, en uzun duraklama ' + x.stallMs + ' ms, xlsx ' + x.xlsxMB + ' MB, RSS ' + x.rssMB + ' MB, tepe ' + x.peakMB + ' MB, HTTP ' + x.status + (x.error ? ' HATA ' + x.error : '') + (x.crashed ? ' SUNUCU COKTU' : ''));
      }
      r.diskMB = MB(dirBytes(dataDir) + dirBytes(path.join(dataDir, 'snapshots')));
      console.log('   disk (arsiv + anlik goruntuler): ' + r.diskMB + ' MB');
      if (BROWSER && days === BROWSER_DAYS && s.p.exitCode === null) {
        r.browser = await browserCheck(ck, dataDir);
        console.log('   tarayici:', JSON.stringify(r.browser));
      }
      await stopServer(s.p);
    } catch (e) { r.error = e.message; console.log('   HATA:', e.stack); }
    fs.rmSync(dataDir, { recursive: true, force: true });
    results.push(r);
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log('\nBitti.');
})().catch(e => { console.error(e); process.exitCode = 1; });
