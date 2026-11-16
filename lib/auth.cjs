'use strict';
// Kisi bazli giris, oturum cerezi, kullanici yonetimi, giris denemesi siniri ve denetim kaydi.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

// Kullanici adi: kucuk harf/rakam/nokta/tire/alt cizgi/arti; istenirse e-posta bicimi (ad@alanadi.com). 3-64 karakter.
const USER_RE = /^(?=.{3,64}$)[a-z0-9][a-z0-9._+-]*(@[a-z0-9-]+(\.[a-z0-9-]+)+)?$/;
const MIN_PASSWORD = 12;
const SESSION_MS = 12 * 3600 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const AUDIT_KEEP = 10;
// Roller: viewer (Ekip: goruntuler, Excel alir) < admin (Yonetici: + veri yukler/siler, kurallar) < superadmin (Super-yonetici: + kullanicilar, denetim kaydi)
const ROLES = ['viewer', 'admin', 'superadmin'];
const RANK = { viewer: 0, admin: 1, superadmin: 2 };
const BREAK_GLASS = 'admin'; // Render ortam degiskeniyle (ADMIN_PASSWORD) giris yapan acil durum hesabi

function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const b64u = b => Buffer.from(b).toString('base64url');

function createAuth({ dir, adminPassword, maxFails = 8 }) {
  const usersFile = path.join(dir, 'users.json');
  const keyFile = path.join(dir, 'session.key');
  const auditFile = path.join(dir, 'audit.log');

  function writeAtomic(file, data) {
    const staged = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(staged, data, { mode: 0o600 }); fs.renameSync(staged, file); }
    finally { fs.rmSync(staged, { force: true }); }
  }

  let key;
  if (fs.existsSync(keyFile)) key = fs.readFileSync(keyFile);
  else { key = crypto.randomBytes(32); writeAtomic(keyFile, key); }

  let users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')).users : [];
  const saveUsers = () => writeAtomic(usersFile, JSON.stringify({ users }));
  const find = name => users.find(u => u.username === name);
  const hmac = s => crypto.createHmac('sha256', key).update(s).digest();

  async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    return { salt: salt.toString('base64'), hash: (await scrypt(password, salt, 64)).toString('base64') };
  }
  const DUMMY = { salt: crypto.randomBytes(16).toString('base64'), hash: crypto.randomBytes(64).toString('base64') };
  async function verifyPassword(user, password) {
    const h = await scrypt(password, Buffer.from(user.salt, 'base64'), 64);
    return crypto.timingSafeEqual(h, Buffer.from(user.hash, 'base64'));
  }
  const adminDigest = sha(adminPassword);
  const adminVersion = () => hmac('pv|' + adminPassword).toString('hex').slice(0, 16);
  const userVersion = u => hmac('pv|' + u.hash).toString('hex').slice(0, 16);

  function checkPassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200)
      throw fail('Sifre en az ' + MIN_PASSWORD + ' karakter olmali.');
  }
  function checkUsername(name) {
    if (typeof name !== 'string' || !USER_RE.test(name) || name === BREAK_GLASS)
      throw fail('Kullanici adi veya e-posta 3-64 karakter olmali (kucuk harf, rakam, nokta, tire, alt cizgi; e-posta icin ad@alanadi.com); "admin" ayrilmistir.');
  }

  // ---- Denetim kaydi (JSON satirlari, boyuta gore donen dosyalar)
  function rotate() {
    try {
      if (!fs.existsSync(auditFile) || fs.statSync(auditFile).size < AUDIT_MAX_BYTES) return;
      for (let i = AUDIT_KEEP - 1; i >= 1; i--) {
        const from = i === 1 ? auditFile : auditFile + '.' + (i - 1);
        const to = auditFile + '.' + i;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
    } catch (e) { console.error('audit rotate:', e.message); }
  }
  function audit(event, ctx = {}, detail = {}) {
    const entry = { ts: new Date().toISOString(), event, user: ctx.user || null, role: ctx.role || null, ip: ctx.ip || null, detail };
    try { rotate(); fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n', { mode: 0o600 }); }
    catch (e) { console.error('audit:', e.message); }
  }
  function readAudit(limit = 200, event = '') {
    const files = [auditFile];
    for (let i = 1; i < AUDIT_KEEP; i++) files.push(auditFile + '.' + i);
    const out = [];
    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        try { const e = JSON.parse(lines[i]); if (!event || e.event === event) out.push(e); } catch { /* bozuk satir atlanir */ }
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  // ---- Giris denemesi siniri (bellekte; yeniden baslatmada sifirlanir)
  const fails = new Map();
  const locked = k => { const f = fails.get(k); return f && f.until > Date.now() ? f.until : 0; };
  function noteFail(k, max) {
    const now = Date.now();
    let f = fails.get(k);
    if (!f || now - f.first > WINDOW_MS) f = { count: 0, first: now, until: 0 };
    f.count++;
    if (f.count >= max) f.until = now + WINDOW_MS;
    fails.set(k, f);
  }
  setInterval(() => { const now = Date.now(); for (const [k, f] of fails) if (now - f.first > WINDOW_MS && f.until < now) fails.delete(k); }, WINDOW_MS).unref();

  // ---- Oturum cerezi: imzali, durumsuz; sifre degisince veya hesap kapaninca gecersiz olur
  function makeCookie(username, version) {
    const payload = b64u(JSON.stringify({ u: username, e: Date.now() + SESSION_MS, v: version }));
    return payload + '.' + b64u(hmac('sid|' + payload));
  }
  function identify(cookieHeader) {
    const m = /(?:^|;\s*)sid=([A-Za-z0-9_\-.]+)/.exec(cookieHeader || '');
    if (!m) return null;
    const [payload, sig] = m[1].split('.');
    if (!payload || !sig) return null;
    const want = hmac('sid|' + payload), got = Buffer.from(sig, 'base64url');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    let p;
    try { p = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
    if (!p || typeof p.u !== 'string' || p.e < Date.now()) return null;
    if (p.u === BREAK_GLASS) return p.v === adminVersion() ? { username: BREAK_GLASS, role: 'superadmin', breakGlass: true } : null;
    const u = find(p.u);
    if (!u || u.disabled || p.v !== userVersion(u)) return null;
    return { username: u.username, role: u.role, breakGlass: false };
  }

  async function login(username, password, ip) {
    username = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const keys = ['u:' + username, 'ip:' + ip];
    const until = Math.max(locked(keys[0]), locked(keys[1]));
    if (until) throw Object.assign(fail('Cok fazla basarisiz deneme. Biraz sonra tekrar deneyin.', 429), { retryAfter: Math.ceil((until - Date.now()) / 1000) });
    let ok = false, who = null;
    if (typeof password === 'string' && password.length <= 200) {
      if (username === BREAK_GLASS) {
        ok = crypto.timingSafeEqual(sha(password), adminDigest);
        if (ok) who = { username: BREAK_GLASS, role: 'superadmin', version: adminVersion() };
      } else {
        const u = find(username);
        const matches = await verifyPassword(u || DUMMY, password);
        if (u && !u.disabled && matches) { ok = true; who = { username: u.username, role: u.role, version: userVersion(u), user: u }; }
      }
    }
    if (!ok) {
      noteFail(keys[0], maxFails); noteFail(keys[1], maxFails * 3);
      audit('login-failed', { user: username.slice(0, 40), ip });
      throw fail('Kullanici adi veya sifre hatali.', 401);
    }
    fails.delete(keys[0]);
    if (who.user) { who.user.lastLogin = new Date().toISOString(); saveUsers(); }
    audit('login', { user: who.username, role: who.role, ip }, who.username === BREAK_GLASS ? { breakGlass: true } : {});
    return { username: who.username, role: who.role, cookie: makeCookie(who.username, who.version) };
  }

  // ---- Kullanici yonetimi
  const publicUser = u => ({ username: u.username, role: u.role, disabled: !!u.disabled, createdAt: u.createdAt, createdBy: u.createdBy, lastLogin: u.lastLogin || null });
  const listUsers = () => users.map(publicUser);

  async function changeOwnPassword(me, current, next) {
    if (me.breakGlass) throw fail('Bu hesabin sifresi Render ortam degiskeninden (ADMIN_PASSWORD) degistirilir.');
    const u = find(me.username);
    if (typeof current !== 'string' || !(await verifyPassword(u, current))) throw fail('Mevcut sifre hatali.', 403);
    checkPassword(next);
    if (next === current) throw fail('Yeni sifre eskisinden farkli olmali.');
    Object.assign(u, await hashPassword(next));
    saveUsers();
    return { cookie: makeCookie(u.username, userVersion(u)) };
  }

  async function manage(actor, input) {
    const op = input && input.op, name = input && input.username;
    if (op === 'create') {
      checkUsername(name); checkPassword(input.password);
      if (find(name)) throw fail('Bu kullanici adi zaten var.', 409);
      if (!ROLES.includes(input.role)) throw fail('Gecersiz rol.');
      users.push({ username: name, role: input.role, ...(await hashPassword(input.password)), createdAt: new Date().toISOString(), createdBy: actor.username });
      saveUsers();
      return { event: 'user-create', detail: { target: name, role: input.role } };
    }
    const u = typeof name === 'string' ? find(name) : null;
    if (!u) throw fail('Kullanici bulunamadi.', 404);
    if (op === 'reset') {
      checkPassword(input.password);
      Object.assign(u, await hashPassword(input.password));
      saveUsers();
      return { event: 'user-reset-password', detail: { target: name } };
    }
    if (u.username === actor.username && ['role', 'disable', 'delete'].includes(op)) throw fail('Kendi rolunuzu, hesabinizi veya kaydinizi degistiremez/silemezsiniz.');
    if (op === 'delete') {
      users = users.filter(x => x !== u); saveUsers();
      return { event: 'user-delete', detail: { target: name, role: u.role } };
    }
    if (op === 'role') {
      if (!ROLES.includes(input.role)) throw fail('Gecersiz rol.');
      u.role = input.role; saveUsers();
      return { event: 'user-role', detail: { target: name, role: input.role } };
    }
    if (op === 'disable' || op === 'enable') {
      u.disabled = op === 'disable'; saveUsers();
      return { event: 'user-' + op, detail: { target: name } };
    }
    throw fail('Gecersiz islem.');
  }

  return { identify, login, changeOwnPassword, manage, listUsers, audit, readAudit, makeCookie, BREAK_GLASS, fail };
}

module.exports = { createAuth, MIN_PASSWORD, SESSION_MS, ROLES, RANK };
