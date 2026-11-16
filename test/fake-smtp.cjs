// Test icin sahte SMTP sunucusu. Kipler: duz (opts.plain), dogrudan TLS (opts.implicit), STARTTLS (opts.starttls).
// Gelen iletileri cozer (RFC2047 konu, base64 govde) ve kimlik bilgisinin sifreli kanalda gelip gelmedigini kaydeder.
'use strict';
const net = require('node:net');
const tls = require('node:tls');

function createFakeSmtp(opts = {}) {
  const mails = [], auths = [], state = { reject: false };
  const user = opts.user || 'bildirim@example.com', password = opts.password || 'smtp-test-sifresi';
  const decodeWord = s => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
  function handle(sock) {
    let buf = '', inData = false, data = '', from = '', rcpt = [], upgraded = !!opts.implicit, loginStep = 0, loginUser = '';
    const w = s => sock.write(s + '\r\n');
    const finish = () => {
      const [head, ...rest] = data.split('\r\n\r\n'), body = rest.join('\r\n\r\n');
      const unfolded = head.replace(/\r\n[ \t]+/g, ' ');
      const h = n => { const m = new RegExp('^' + n + ': (.*)$', 'mi').exec(unfolded); return m ? m[1] : ''; };
      mails.push({ from, to: rcpt[0], subject: decodeWord(h('Subject')), text: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), head, encrypted: !!sock.encrypted, headerNames: unfolded.split('\r\n').map(l => l.split(':')[0]) });
    };
    const onData = d => {
      buf += d.toString('utf8');
      for (;;) {
        if (inData) {
          const i = buf.indexOf('\r\n.\r\n');
          if (i < 0) return;
          data += buf.slice(0, i); buf = buf.slice(i + 5); inData = false; finish(); w('250 2.0.0 kuyruga alindi'); continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (loginStep === 1) { loginUser = Buffer.from(line, 'base64').toString(); loginStep = 2; w('334 UGFzc3dvcmQ6'); continue; }
        if (loginStep === 2) { loginStep = 0; auth(loginUser, Buffer.from(line, 'base64').toString()); continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') {
          const caps = ['fake.example'];
          if (opts.starttls && !upgraded) caps.push('STARTTLS');
          if (!opts.starttls || upgraded) caps.push('AUTH ' + (opts.authLoginOnly ? 'LOGIN' : 'PLAIN LOGIN'));
          caps.push('8BITMIME');
          caps.forEach((c, k) => w('250' + (k === caps.length - 1 ? ' ' : '-') + c));
        } else if (cmd === 'STAR') {
          w('220 hazir');
          sock.removeListener('data', onData);
          const t = new tls.TLSSocket(sock, { isServer: true, key: opts.key, cert: opts.cert });
          t.on('data', onData); t.on('error', () => {});
          sock = t; upgraded = true;
        } else if (cmd === 'AUTH') {
          const parts = line.split(' ');
          if (parts[1].toUpperCase() === 'PLAIN') { const [, u, p] = Buffer.from(parts[2] || '', 'base64').toString().split('\0'); auth(u, p); }
          else { loginStep = 1; w('334 VXNlcm5hbWU6'); }
        } else if (cmd === 'MAIL') { from = /<([^>]*)>/.exec(line)[1]; rcpt = []; w('250 2.1.0 tamam'); }
        else if (cmd === 'RCPT') { if (state.reject) w('550 5.1.1 alici reddedildi'); else { rcpt.push(/<([^>]*)>/.exec(line)[1]); w('250 2.1.5 tamam'); } }
        else if (cmd === 'DATA') { inData = true; data = ''; w('354 devam'); }
        else if (cmd === 'QUIT') { w('221 gule gule'); sock.end(); }
        else w('502 komut yok');
      }
    };
    const auth = (u, p) => {
      auths.push({ user: u, encrypted: !!sock.encrypted, ok: u === user && p === password });
      if (u === user && p === password) w('235 2.7.0 kimlik dogrulandi'); else w('535 5.7.8 kimlik bilgisi hatali');
    };
    sock.on('data', onData); sock.on('error', () => {});
    w('220 fake.example ESMTP');
  }
  const server = opts.implicit ? tls.createServer({ key: opts.key, cert: opts.cert }, handle) : net.createServer(handle);
  return {
    mails, auths, state, user, password,
    listen: (port = 0, host = '127.0.0.1') => new Promise(r => server.listen(port, host, () => r(server.address().port))),
    close: () => new Promise(r => server.close(r)),
    waitFor: async (pred, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = mails.find(pred); if (m) return m; await new Promise(r => setTimeout(r, 25)); } return null; },
  };
}
module.exports = { createFakeSmtp };
