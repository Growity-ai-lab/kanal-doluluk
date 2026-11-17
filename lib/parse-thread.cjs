'use strict';
// XLSX ayristirmasi ayri bir is parcaciginda calisir: buyuk dosyalar (yuz binlerce satir) saniyelerce surer ve
// ana is parcacigini bloke ederse sunucu saglik kontrolune ve diger isteklere yanit veremez.
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');
const XLSX = require('../public/xlsx.full.min.js');
const ctx = vm.createContext({ XLSX, onmessage: null, postMessage: () => {} });
for (const f of ['core.js', 'worker.js']) new vm.Script(fs.readFileSync(path.join(root, f), 'utf8')).runInContext(ctx);
try {
  const { body, options } = workerData;
  parentPort.postMessage({ fresh: ctx.parseWorkbook({ ...options, buffer: new Uint8Array(body) }) });
} catch (err) {
  parentPort.postMessage({ error: String(err && err.message || err) });
}
