// Serwer HTTP + WebSocket gry Wiecznomrok.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { World } from './world';
import { PgStore, FileStore, Store } from './store';
import { hashPassword, verifyPassword, signToken, verifyToken, RateLimiter, cleanName } from './auth';
import { CHAR } from '../shared/data/characters';
import { SIZES } from '../shared/world';
import type { WorldSettings } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = +(process.env.PORT || 3000);
const MAX_ACTIVE = +(process.env.MAX_ACTIVE_WORLDS || 12);
const MAX_PLAYERS_DEFAULT = +(process.env.MAX_PLAYERS_PER_WORLD || 6);
const started = Date.now();

const store: Store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const active = new Map<string, World>();
const loading = new Map<string, Promise<World | null>>();
const authLimiter = new RateLimiter(10, 60_000);
const createLimiter = new RateLimiter(5, 600_000);
const wsLimiter = new RateLimiter(30, 60_000);

function log(...a: any[]) {
  console.log(new Date().toISOString(), ...a);
}

async function saveWorld(w: World) {
  await store.saveWorld(w.id, w.settings, w.serialize());
}

async function getWorld(id: string): Promise<World | null> {
  const a = active.get(id);
  if (a) return a;
  if (loading.has(id)) return loading.get(id)!;
  const p = (async () => {
    const row = await store.getWorld(id);
    if (!row) return null;
    if (active.size >= MAX_ACTIVE) {
      // zwolnij najdłużej pusty świat
      const empty = [...active.values()].filter((x) => x.players.size === 0).sort((x, y) => x.emptySince - y.emptySince)[0];
      if (!empty) throw new Error('full');
      await unload(empty);
    }
    const w = new World(id, row.settings, row.state);
    w.saveFn = saveWorld;
    w.lastSave = w.time;
    w.onEmpty = () => scheduleUnload(w);
    w.start();
    active.set(id, w);
    log('[world] załadowano', id, row.settings.name);
    return w;
  })();
  loading.set(id, p);
  try { return await p; } finally { loading.delete(id); }
}

function scheduleUnload(w: World) {
  setTimeout(() => {
    if (w.players.size === 0 && active.get(w.id) === w && Date.now() - w.emptySince >= 59_000) unload(w).catch((e) => log('unload err', e));
  }, 60_000);
}

async function unload(w: World) {
  w.stop();
  await saveWorld(w);
  active.delete(w.id);
  log('[world] zwolniono', w.id);
}

// ===================== HTTP =====================
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.txt': 'text/plain',
};

function json(res: http.ServerResponse, code: number, data: any) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

function ipOf(req: http.IncomingMessage) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function authUser(req: http.IncomingMessage) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
}

function newWorldId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[crypto.randomInt(abc.length)];
  return s;
}

function publicSettings(s: WorldSettings) {
  const { password, ...rest } = s;
  return { ...rest, locked: !!password };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  const p = url.pathname;
  try {
    if (p === '/health') {
      let players = 0;
      for (const w of active.values()) players += w.players.size;
      return json(res, 200, { ok: true, uptime: Math.round((Date.now() - started) / 1000), worlds: active.size, players });
    }
    if (p === '/api/register' && req.method === 'POST') {
      if (!authLimiter.hit(ipOf(req))) return json(res, 429, { error: 'Za dużo prób. Spróbuj za minutę.' });
      const b = await readBody(req);
      const name = cleanName(b.name);
      if (name.length < 3) return json(res, 400, { error: 'Nick musi mieć min. 3 znaki (litery, cyfry).' });
      if (String(b.pass || '').length < 6) return json(res, 400, { error: 'Hasło musi mieć min. 6 znaków.' });
      if (await store.getUserByName(name)) return json(res, 409, { error: 'Ten nick jest zajęty.' });
      const u = await store.createUser(name, hashPassword(String(b.pass)));
      return json(res, 200, { token: signToken({ uid: u.id, name: u.name }), name: u.name, meta: u.meta });
    }
    if (p === '/api/login' && req.method === 'POST') {
      if (!authLimiter.hit(ipOf(req))) return json(res, 429, { error: 'Za dużo prób. Spróbuj za minutę.' });
      const b = await readBody(req);
      const u = await store.getUserByName(String(b.name || ''));
      if (!u || !verifyPassword(String(b.pass || ''), u.pass)) return json(res, 401, { error: 'Zły nick lub hasło.' });
      return json(res, 200, { token: signToken({ uid: u.id, name: u.name }), name: u.name, meta: u.meta });
    }
    if (p === '/api/me') {
      const a = authUser(req);
      if (!a) return json(res, 401, { error: 'unauthorized' });
      const u = await store.getUser(a.uid);
      return u ? json(res, 200, { name: u.name, meta: u.meta }) : json(res, 404, { error: 'not found' });
    }
    if (p === '/api/worlds' && req.method === 'GET') {
      const list = await store.listWorlds();
      return json(res, 200, list.map((x) => {
        const w = active.get(x.id);
        return { id: x.id, ...publicSettings(x.settings), online: w ? w.players.size : 0, day: w ? w.clk.day : x.day, season: w ? w.clk.season : undefined, updated: x.updated };
      }));
    }
    if (p === '/api/worlds' && req.method === 'POST') {
      if (!createLimiter.hit(ipOf(req))) return json(res, 429, { error: 'Utworzono za dużo światów. Spróbuj później.' });
      const b = await readBody(req);
      const a = authUser(req);
      const sizeName = ['small', 'medium', 'large'].includes(b.size) ? b.size : 'medium';
      const clampN = (v: any, lo: number, hi: number, d: number) => (isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d);
      const settings: WorldSettings = {
        name: cleanName(b.name) || 'Nowy świat',
        seed: b.seed && isFinite(+b.seed) ? +b.seed >>> 0 : crypto.randomInt(1, 2 ** 31),
        size: SIZES[sizeName], sizeName,
        dayLength: clampN(b.dayLength, 120, 1200, 480),
        seasonLength: clampN(b.seasonLength, 2, 30, 12),
        difficulty: ['relax', 'normal', 'hardcore'].includes(b.difficulty) ? b.difficulty : 'normal',
        pvp: !!b.pvp,
        password: String(b.password || '').slice(0, 32),
        maxPlayers: clampN(b.maxPlayers, 1, 8, MAX_PLAYERS_DEFAULT),
        resources: clampN(b.resources, 0.4, 1.6, 1),
        monsters: clampN(b.monsters, 0, 2, 1),
        raids: clampN(b.raids, 0, 2, 1),
        bosses: b.bosses !== false,
        protect: !!b.protect,
        creator: a ? `u:${a.uid}` : String(b.guestId || '').slice(0, 40) ? `g:${String(b.guestId).slice(0, 40)}` : '',
        created: Date.now(),
      };
      const id = newWorldId();
      await store.saveWorld(id, settings, null);
      log('[world] utworzono', id, settings.name);
      return json(res, 200, { id });
    }
    if (p.startsWith('/api/worlds/') && req.method === 'DELETE') {
      const id = p.split('/')[3];
      const a = authUser(req);
      const row = await store.getWorld(id);
      if (!row) return json(res, 404, { error: 'Nie ma takiego świata.' });
      const guest = url.searchParams.get('guest');
      const isCreator = (a && row.settings.creator === `u:${a.uid}`) || (guest && row.settings.creator === `g:${guest}`);
      const adminOk = process.env.ADMIN_PASSWORD && url.searchParams.get('admin') === process.env.ADMIN_PASSWORD;
      if (!isCreator && !adminOk) return json(res, 403, { error: 'Tylko twórca świata może go usunąć.' });
      const w = active.get(id);
      if (w) { for (const pl of w.players.values()) pl.ws?.close(); w.stop(); active.delete(id); }
      await store.deleteWorld(id);
      return json(res, 200, { ok: true });
    }
    // pliki statyczne
    let file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    const ext = path.extname(file);
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
  } catch (e: any) {
    log('[http] błąd', e?.message);
    json(res, 500, { error: e?.message === 'full' ? 'Serwer jest pełny – spróbuj później.' : 'Błąd serwera.' });
  }
});

// ===================== WebSocket =====================
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) { socket.destroy(); return; }
  if (!wsLimiter.hit(ipOf(req))) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws: WebSocket) => {
  let world: World | null = null;
  let player: any = null;
  let msgCount = 0;
  const rateIv = setInterval(() => { msgCount = 0; }, 1000);
  ws.on('message', async (data) => {
    if (++msgCount > 120) return; // limit wiadomości na sekundę
    let msg: any;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!player) {
      if (msg.t !== 'hello') return;
      try {
        const w = await getWorld(String(msg.world || ''));
        if (!w) { ws.send(JSON.stringify({ t: 'err', text: 'Nie ma takiego świata.' })); ws.close(); return; }
        if (w.settings.password && w.settings.password !== String(msg.pass || '')) { ws.send(JSON.stringify({ t: 'err', text: 'Złe hasło świata.', pass: 1 })); ws.close(); return; }
        if (w.players.size >= w.settings.maxPlayers) { ws.send(JSON.stringify({ t: 'err', text: 'Świat jest pełny.' })); ws.close(); return; }
        let key: string, name: string, userId = 0;
        const tok = msg.token ? verifyToken(msg.token) : null;
        if (tok) { key = `u:${tok.uid}`; name = tok.name; userId = tok.uid; }
        else {
          const gid = String(msg.guestId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
          if (gid.length < 8) { ws.send(JSON.stringify({ t: 'err', text: 'Brak identyfikatora gościa.' })); ws.close(); return; }
          key = `g:${gid}`;
          name = cleanName(msg.name) || 'Rozbitek';
        }
        for (const other of w.players.values()) if (other.key === key) { w.send(other, { t: 'err', text: 'Zalogowano z innego miejsca.' }); other.ws?.close(); w.removePlayer(other); }
        const char = CHAR[msg.char] ? msg.char : 'bruno';
        const admin = w.settings.creator === key;
        world = w;
        player = w.addPlayer(ws, key, name, char, +msg.skin || 0, admin);
        (player as any).userId = userId;
        ws.send(JSON.stringify({
          t: 'welcome', id: player.id, world: { id: w.id, ...publicSettings(w.settings) }, seed: w.settings.seed, size: w.settings.size,
          resources: w.settings.resources, spawn: w.gen.spawn, char: player.char, admin,
          flags: { circles: w.flags.circles || [], maptable: !!w.flags.maptable, coreRepaired: !!w.flags.coreRepaired, tower: !!w.flags.tower, victory: !!w.flags.victory },
          map: Buffer.from(w.flags.maptable ? w.mapAll : player.map).toString('base64'), mapAll: !!w.flags.tower,
          x: player.x, z: player.z, time: w.time,
        }));
        w.updateChunks(player, true);
        w.sendEnv();
        log('[join]', w.id, name, char);
      } catch (e: any) {
        ws.send(JSON.stringify({ t: 'err', text: e?.message === 'full' ? 'Serwer jest pełny – spróbuj później.' : 'Nie udało się dołączyć.' }));
        log('[join err]', e);
        ws.close();
      }
      return;
    }
    if (world && player) {
      try { world.onMessage(player, msg); } catch (e) { log('[msg err]', e); }
    }
  });
  ws.on('close', async () => {
    clearInterval(rateIv);
    if (world && player && world.players.get(player.id) === player) {
      world.removePlayer(player);
      if (player.userId && player.ach?.length) {
        try {
          const u = await store.getUser(player.userId);
          if (u) {
            const meta = u.meta || {};
            meta.ach = [...new Set([...(meta.ach || []), ...player.ach])];
            await store.updateUserMeta(u.id, meta);
          }
        } catch (e) { log('ach save err', e); }
      }
    }
  });
  ws.on('error', () => { /* */ });
});

// ===================== Start / stop =====================
async function main() {
  await store.init();
  server.listen(PORT, '0.0.0.0', () => log(`[server] Wiecznomrok nasłuchuje na :${PORT}`));
}

let shuttingDown = false;
async function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[server] ${sig} – zapisuję światy...`);
  for (const w of active.values()) {
    w.broadcast({ t: 'toast', text: 'Serwer się restartuje – świat został zapisany. Połącz się ponownie za chwilę.', kind: 'warn' });
    try { w.stop(); await saveWorld(w); } catch (e) { log('save err', e); }
  }
  log('[server] zapisano, koniec.');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((e) => { console.error(e); process.exit(1); });
