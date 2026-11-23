// 원시섬 실험용 서버 (내 컴퓨터에서 돌리기)
//   node server.js        → http://localhost:8080 에서 게임이 열린다
// 같은 와이파이의 휴대폰·친구 컴퓨터는 아래에 찍히는 http://192.168.x.x:8080 으로 들어온다.
// 설치할 것 없음 (Node.js만 있으면 된다). 저장은 이 폴더의 saves/ 에 이름별로 남는다.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');

const PORT = +process.env.PORT || 8080;
const GAME = [path.join(__dirname, '..', 'dist', '원시섬.html'), path.join(__dirname, '원시섬.html')].find(f => fs.existsSync(f));
const SAVES = path.join(__dirname, 'saves');
fs.mkdirSync(SAVES, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?') || req.url === '/index.html') {
    if (!GAME) { res.writeHead(500); return res.end('원시섬.html 을 찾지 못했어요'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(GAME).pipe(res);
  }
  if (req.url === '/server') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  res.writeHead(404); res.end();
});

// ---- 아주 작은 WebSocket (RFC 6455, 텍스트 메시지만) ----
const clients = new Map();  // id -> {sock, name, last}
let nextId = 1;
function frame(text) {
  const p = Buffer.from(text), n = p.length;
  const h = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
  return Buffer.concat([h, p]);
}
function send(c, obj) { try { c.sock.write(frame(JSON.stringify(obj))); } catch (e) {} }
function broadcast(obj, except) { for (const [id, c] of clients) if (id !== except && c.name) send(c, obj); }
function safeName(n) { return String(n || '').replace(/[^\w가-힣 ]/g, '').trim().slice(0, 12) || '탐험가'; }

server.on('upgrade', (req, sock) => {
  if (req.url !== '/ws') return sock.destroy();
  const key = req.headers['sec-websocket-key'];
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true);
  const id = String(nextId++), c = { sock, name: '', buf: Buffer.alloc(0) };
  clients.set(id, c);
  sock.on('data', d => {
    c.buf = Buffer.concat([c.buf, d]);
    while (c.buf.length >= 2) {
      const op = c.buf[0] & 15, masked = c.buf[1] & 128; let len = c.buf[1] & 127, off = 2;
      if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (c.buf.length < 10) return; len = c.buf.readUInt32BE(6); off = 10; }
      if (len > 1 << 20) return sock.destroy();
      const need = off + (masked ? 4 : 0) + len; if (c.buf.length < need) return;
      const mask = masked ? c.buf.slice(off, off + 4) : null, data = c.buf.slice(off + (masked ? 4 : 0), need);
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      c.buf = c.buf.slice(need);
      if (op === 8) return sock.end();
      if (op === 9) { sock.write(Buffer.from([0x8a, 0])); continue; }
      if (op === 1) { try { onMsg(id, c, JSON.parse(data.toString())); } catch (e) {} }
    }
  });
  const bye = () => { if (!clients.has(id)) return; clients.delete(id); if (c.name) { broadcast({ t: 'leave', id }); console.log('👋 ' + c.name + ' 나감 (' + clients.size + '명)'); } };
  sock.on('close', bye); sock.on('error', bye);
});

function onMsg(id, c, m) {
  if (m.t === 'hello') {
    c.name = safeName(m.name);
    const file = path.join(SAVES, c.name + '.json');
    const save = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    send(c, { t: 'welcome', id, save });
    for (const [oid, o] of clients) if (oid !== id && o.name && o.pos) send(c, Object.assign({ t: 'pos', id: oid, n: o.name }, o.pos));
    console.log('🙋 ' + c.name + ' 들어옴 (' + clients.size + '명)');
  } else if (m.t === 'pos' && c.name) {
    c.pos = { x: +m.x, z: +m.z, y: +m.y, r: +m.r, s: +m.s, e: String(m.e || 'hand').slice(0, 10) };
    broadcast(Object.assign({ t: 'pos', id, n: c.name }, c.pos), id);
  } else if (m.t === 'save' && c.name && m.data && typeof m.data === 'object') {
    fs.writeFile(path.join(SAVES, c.name + '.json'), JSON.stringify(m.data), () => {});
  }
}

server.listen(PORT, () => {
  console.log('\n🌴 원시섬 실험 서버가 켜졌어요');
  console.log('   이 컴퓨터:        http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) console.log('   같은 와이파이 기기: http://' + a.address + ':' + PORT);
  console.log('   끄려면 이 창을 닫거나 Ctrl+C\n');
});
