// Tryb "czat prowadzi postac": glosowanie widzow co kilka sekund.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pathToFileURL } = require('url');

module.exports = async function setupChat(app, io) {
  const L = await import(pathToFileURL(path.join(__dirname, 'public/chatgame/logic.js')).href);

  const env = process.env;
  const cfg = {
    voteSeconds: Math.max(2, +env.VOTE_SECONDS || 8),
    eventMinutes: Math.max(0.2, +env.EVENT_MINUTES || 15),
    platforms: Math.max(10, +env.PLATFORMS || 240),
    seed: +env.MAP_SEED || 20260101,
    autoplay: env.AUTOPLAY === '1',
    resetSeconds: 60,
  };
  const ADMIN_KEY = env.ADMIN_KEY || '';
  const KICK_SECRET = env.KICK_WEBHOOK_SECRET || 'kick';
  const KICK_VERIFY = env.KICK_VERIFY === '1';
  const DATA_DIR = env.DATA_DIR || path.join(__dirname, 'data');
  const SAVE_FILE = path.join(DATA_DIR, 'chatgame.json');

  const nsp = io.of('/chat');
  const rng = Math.random;
  let map = L.generateMap(cfg.seed, cfg.platforms);
  let compact = L.compactMap(map);
  let state = L.newState(map);
  let stats = { voters: {}, wins: 0, runs: 1, totalVotes: 0 };
  let votes = {};            // user -> cmd (biezace okno)
  let windowEnd = 0;
  let nextEventAt = Date.now() + cfg.eventMinutes * 60000;
  let frozenUntil = 0;
  let wonAt = 0;
  let lastEventInfo = null;
  const feed = [];           // ostatnie komendy
  let lastCounts = '';

  // --- zapis stanu ---
  try {
    const d = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    if (d.seed === cfg.seed && d.platforms === cfg.platforms && d.state) {
      state = Object.assign(L.newState(map), d.state); stats = Object.assign(stats, d.stats || {});
      if (d.nextEventLeft) nextEventAt = Date.now() + d.nextEventLeft;
      console.log('[chat] wczytano zapis, kratka trasy', state.maxRoute);
    }
  } catch (e) { /* brak zapisu */ }
  function save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = SAVE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ seed: cfg.seed, platforms: cfg.platforms, state, stats, nextEventLeft: Math.max(0, nextEventAt - Date.now()) }));
      fs.renameSync(tmp, SAVE_FILE);
    } catch (e) { /* ignoruj */ }
  }

  const view = () => ({
    pos: state.pos, tick: state.tick, shield: state.shield, blackout: state.blackout, chaos: state.chaos,
    glitch: state.glitch, won: state.won, moves: state.moves, falls: state.falls, setbacks: state.setbacks,
    maxRoute: state.maxRoute, cp: state.cp, crumbleAt: state.crumbleAt, sabotage: state.sabotage,
    bonusTaken: state.bonusTaken, events: state.events, routeLen: map.route.length,
    routeNow: map.routeIdx.has(state.pos) ? map.routeIdx.get(state.pos) : -1,
  });
  const hud = () => ({
    windowEnd, voteMs: cfg.voteSeconds * 1000, now: Date.now(), nextEventAt, frozenUntil,
    top: Object.entries(stats.voters).sort((a, b) => b[1] - a[1]).slice(0, 5),
    wins: stats.wins, runs: stats.runs, feed: feed.slice(-8), lastEvent: lastEventInfo,
  });
  const counts = () => L.tally(votes).counts;

  function addVote(user, text, source) {
    const cmd = L.parseCommand(text);
    if (!cmd || state.won) return false;
    user = String(user || 'anon').slice(0, 24);
    votes[user] = cmd;
    stats.totalVotes++;
    stats.voters[user] = (stats.voters[user] || 0) + 1;
    if (Object.keys(stats.voters).length > 3000) { // przycinanie
      const keep = Object.entries(stats.voters).sort((a, b) => b[1] - a[1]).slice(0, 1000);
      stats.voters = Object.fromEntries(keep);
    }
    feed.push({ u: user, c: cmd, s: source }); if (feed.length > 30) feed.shift();
    return true;
  }

  function startWindow() {
    votes = {};
    windowEnd = Date.now() + cfg.voteSeconds * 1000;
    nsp.emit('window', { state: view(), hud: hud() });
  }

  function doEvent(type) {
    type = type || L.pickEvent(rng, state);
    const res = L.applyEvent(map, state, type, rng);
    lastEventInfo = Object.assign({ at: Date.now() }, res.info);
    if (res.info.freezeMs) frozenUntil = Date.now() + res.info.freezeMs;
    nextEventAt = Date.now() + cfg.eventMinutes * 60000;
    nsp.emit('event', { info: res.info, steps: res.steps, state: view(), hud: hud() });
    save();
  }

  function resetGame(newSeed) {
    if (newSeed) { cfg.seed = newSeed; map = L.generateMap(cfg.seed, cfg.platforms); compact = L.compactMap(map); }
    state = L.newState(map); votes = {}; wonAt = 0; frozenUntil = 0; stats.runs++;
    nextEventAt = Date.now() + cfg.eventMinutes * 60000;
    nsp.emit('init', initPayload());
    save();
  }
  const initPayload = () => ({ map: compact, state: view(), hud: hud(), cfg: { voteSeconds: cfg.voteSeconds, eventMinutes: cfg.eventMinutes } });

  function resolveWindow() {
    const t = L.tally(votes, rng);
    if (cfg.autoplay && t.total === 0) { /* autogra: bot glosuje */ }
    const steps = L.applyTick(map, state, t.winner, rng);
    nsp.emit('tick', { winner: t.winner, counts: t.counts, total: t.total, steps, state: view(), hud: hud() });
    if (state.won) {
      stats.wins++; wonAt = Date.now();
      nsp.emit('won', { state: view(), hud: hud(), resetIn: cfg.resetSeconds });
    }
    if (state.tick % 5 === 0 || state.won) save();
  }

  // glowna petla
  setInterval(() => {
    const now = Date.now();
    if (state.won) { if (wonAt && now - wonAt > cfg.resetSeconds * 1000) resetGame(); return; }
    if (now < frozenUntil) { return; }
    if (now >= nextEventAt) { doEvent(); return; }
    if (cfg.autoplay && windowEnd - now > 500 && windowEnd - now < cfg.voteSeconds * 1000 - 400 && Object.keys(votes).length < 12) {
      const best = L.botMove(map, state);
      for (let i = 0; i < 3; i++) {
        const noisy = Math.random() < 0.3 ? L.COMMANDS[Math.floor(Math.random() * 5)] : best;
        addVote('bot' + Math.floor(Math.random() * 40), noisy, 'auto');
      }
    }
    if (now >= windowEnd) { if (windowEnd) resolveWindow(); startWindow(); }
  }, 250);

  // podglad glosow na zywo
  setInterval(() => {
    const c = JSON.stringify(counts());
    if (c !== lastCounts) { lastCounts = c; nsp.emit('votes', { counts: counts(), feed: feed.slice(-8), n: Object.keys(votes).length }); }
  }, 400);

  nsp.on('connection', (socket) => {
    socket.emit('init', initPayload());
    let last = 0;
    socket.on('vote', (d) => {
      if (!d || Date.now() - last < 300) return; last = Date.now();
      const name = String(d.name || '').trim().slice(0, 16) || 'gosc-' + socket.id.slice(0, 4);
      addVote(name, d.cmd, 'www');
    });
  });

  // --- Kick webhook ---
  let kickKey = null;
  async function getKickKey() {
    if (kickKey) return kickKey;
    const r = await fetch('https://api.kick.com/public/v1/public-key');
    const j = await r.json();
    kickKey = (j.data && j.data.public_key) || j.public_key; return kickKey;
  }
  async function verifyKick(req) {
    try {
      const id = req.get('Kick-Event-Message-Id'), ts = req.get('Kick-Event-Message-Timestamp'), sig = req.get('Kick-Event-Signature');
      if (!id || !ts || !sig) return false;
      const base = Buffer.from(`${id}.${ts}.${req.body.toString('utf8')}`);
      const key = crypto.createPublicKey(await getKickKey());
      const s = Buffer.from(sig, 'base64');
      return key.asymmetricKeyType === 'ed25519' ? crypto.verify(null, base, key, s) : crypto.verify('RSA-SHA256', base, key, s);
    } catch (e) { console.log('[kick] blad weryfikacji', e.message); return false; }
  }
  app.post('/kick/webhook/:secret', express.raw({ type: '*/*', limit: '200kb' }), async (req, res) => {
    if (req.params.secret !== KICK_SECRET) return res.sendStatus(404);
    if (KICK_VERIFY && !(await verifyKick(req))) { console.log('[kick] zla sygnatura'); return res.sendStatus(401); }
    res.sendStatus(200);
    try {
      const type = req.get('Kick-Event-Type');
      const body = JSON.parse(req.body.toString('utf8'));
      if (type && type !== 'chat.message.sent') return;
      const user = body.sender && (body.sender.username || body.sender.channel_slug);
      if (addVote(user, body.content, 'kick') && process.env.CHAT_DEBUG) console.log('[kick]', user, body.content);
    } catch (e) { console.log('[kick] zly payload', e.message); }
  });

  // --- admin ---
  const admin = express.Router();
  admin.use(express.json());
  admin.use((req, res, next) => {
    const k = req.get('x-admin-key') || req.query.key;
    if (!ADMIN_KEY || k !== ADMIN_KEY) return res.status(403).json({ error: 'brak dostepu (ustaw ADMIN_KEY)' });
    next();
  });
  admin.post('/event', (req, res) => { const t = req.query.type || (req.body && req.body.type); if (t && !L.EVENT_TYPES[t]) return res.status(400).json({ error: 'typ', types: Object.keys(L.EVENT_TYPES) }); doEvent(t); res.json({ ok: true }); });
  admin.post('/reset', (req, res) => { resetGame(req.query.seed ? +req.query.seed : 0); res.json({ ok: true }); });
  admin.post('/teleport', (req, res) => {
    const i = Math.max(0, Math.min(map.route.length - 2, +req.query.route || 0));
    state.pos = map.route[i]; state.history = map.route.slice(0, i + 1); state.cp = map.start; state.cpHist = 0; state.maxRoute = i;
    for (let r = i; r >= 0; r--) if (map.tiles[map.route[r]].t === 'checkpoint') { state.cp = map.route[r]; state.cpHist = r; break; }
    state.history = [map.start].concat(map.route.slice(1, i + 1)); state.cpHist = Math.min(state.cpHist, state.history.length - 1);
    nsp.emit('init', initPayload()); res.json({ ok: true });
  });
  admin.post('/skip', (_req, res) => { windowEnd = Date.now(); res.json({ ok: true }); });
  admin.post('/vote', (req, res) => { const b = req.body || {}; res.json({ ok: addVote(b.user || 'admin', b.cmd, 'admin') }); });
  admin.post('/settings', (req, res) => {
    const b = req.body || {};
    if (b.voteSeconds) cfg.voteSeconds = Math.max(2, +b.voteSeconds);
    if (b.eventMinutes) { cfg.eventMinutes = Math.max(0.2, +b.eventMinutes); nextEventAt = Date.now() + cfg.eventMinutes * 60000; }
    if (typeof b.autoplay === 'boolean') cfg.autoplay = b.autoplay;
    res.json(cfg);
  });
  admin.get('/status', (_req, res) => res.json({ cfg, state: view(), stats: { wins: stats.wins, runs: stats.runs, totalVotes: stats.totalVotes } }));
  app.use('/admin', admin);

  app.get('/chat-state', (_req, res) => res.json({ cfg, state: view(), hud: hud() }));
  console.log(`[chat] gotowe: ${map.tiles.length} kratek, ${map.platforms.length} platform, glos ${cfg.voteSeconds}s, event co ${cfg.eventMinutes} min`);
  save();
};
