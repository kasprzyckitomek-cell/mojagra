// Główna pętla gry po stronie klienta.
import * as THREE from 'three';
import { WorldGen, CHUNK, StaticObj } from '../shared/world';
import { OBJ, BIOME_NAMES } from '../shared/data/objects';
import { ITEMS } from '../shared/data/items';
import { STRUCTS } from '../shared/data/structures';
import { MOBS } from '../shared/data/mobs';
import { CHAR } from '../shared/data/characters';
import { RECIPES, Recipe, recipeStations, BLUEPRINT_ONLY } from '../shared/data/recipes';
import { BASE_SPEED, Season, SEASON_NAMES } from '../shared/env';
import { Terrain, WorldObjects } from './terrain';
import { Entities, EntView } from './entities';
import { FX } from './fx';
import { UI } from './ui';
import { Net } from './net';
import { audio } from './audio';
import { makeStruct } from './models';
import { Post } from './post';

type Target = { k: 'o' | 's' | 'm' | 'd' | 'p'; id: number; alt?: boolean; once?: boolean };

export interface Settings { vol: number; music: number; quality: 'low' | 'medium' | 'high'; view: number; fps: boolean; ink: boolean }

export class Game {
  renderer: THREE.WebGLRenderer;
  post!: Post;
  lightLevel = 1;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  gen: WorldGen;
  terrain: Terrain;
  objects: WorldObjects;
  entities: Entities;
  fx: FX;
  ui: UI;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  amb: THREE.AmbientLight;
  lights: THREE.PointLight[] = [];
  myId: number;
  char: string;
  worldInfo: any;
  me = { x: 0, z: 0, r: 0, anim: 0, moving: false, ghost: false, wolf: false, sleeping: false };
  stats: any = { hp: 100, mhp: 100, hu: 100, mhu: 100, sa: 100, msa: 100, te: 30, we: 0, spd: BASE_SPEED };
  inv: any[] = new Array(15).fill(null);
  equip: any = { hand: null, head: null, body: null, back: null };
  stock: Record<string, number> = {};
  known = new Set<string>();
  wolf = false;
  env: any = { frac: 0.1, ph: 'day', se: 'autumn', w: 'clear', wi: 0, day: 1, moon: 0, dl: 480, sl: 12, sd: 1 };
  envTime = 0;
  flags: any;
  mapBits: Uint8Array;
  mapAll = false;
  mapOpen = false;
  keys = new Set<string>();
  yaw = Math.PI / 4;
  yawTarget = Math.PI / 4;
  zoom = 21;
  mouse = { x: 0, y: 0, down: false, ground: null as THREE.Vector3 | null };
  target: Target | null = null;
  moveTo: { x: number; z: number } | null = null;
  actTimer = 0;
  sendTimer = 0;
  lastSent = { x: 0, z: 0, r: 0 };
  building: { r: Recipe; ghost: THREE.Group; rot: number; ok: boolean; x: number; z: number } | null = null;
  settings: Settings;
  raycaster = new THREE.Raycaster();
  private lastFrame = performance.now();
  t = 0;
  hoverInfo: { k: string; id: number; label: string } | null = null;
  lastHoverCalc = 0;
  lastMini = 0;
  lastExplore = 0;
  fpsAcc = 0; fpsN = 0; fps = 0;
  seasonShown: Season | '' = '';
  phaseShown = '';
  dead = false;
  pingSound = 0;

  constructor(public net: Net, welcome: any) {
    this.myId = welcome.id;
    this.char = welcome.char;
    this.worldInfo = welcome.world;
    this.flags = welcome.flags;
    this.settings = Object.assign({ vol: 0.6, music: 0.35, quality: 'medium', view: 5, fps: false, ink: true }, JSON.parse(localStorage.getItem('wm_settings') || '{}'));
    this.gen = new WorldGen(welcome.seed, welcome.size, welcome.resources);
    const cells = Math.ceil(welcome.size / 16);
    this.mapBits = new Uint8Array(Math.ceil((cells * cells) / 8));
    if (welcome.map) { const b = Uint8Array.from(atob(welcome.map), (c) => c.charCodeAt(0)); this.mapBits.set(b.subarray(0, this.mapBits.length)); }
    this.mapAll = !!welcome.mapAll;
    this.me.x = welcome.x; this.me.z = welcome.z;
    this.envTime = welcome.time;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    document.body.appendChild(this.renderer.domElement);
    this.post = new Post(this.renderer);
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 400);
    this.scene.fog = new THREE.Fog(0x9fc6e0, 70, 170);
    this.scene.background = new THREE.Color(0x9fc6e0);

    this.hemi = new THREE.HemisphereLight(0xd8d4c0, 0x3a2e20, 0.6);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffa850, 0, 14, 1.4);
      this.scene.add(l);
      this.lights.push(l);
    }

    const h = (x: number, z: number) => this.gen.height(x, z);
    this.terrain = new Terrain(this.gen, this.scene);
    this.objects = new WorldObjects(this.gen, this.scene);
    this.entities = new Entities(this.scene, h);
    this.entities.myId = this.myId;
    this.fx = new FX(this.scene, h);
    this.ui = new UI(this);
    this.ui.buildMapBase();
    this.applySettings();
    this.bindInput();
    net.on((m) => this.onMsg(m));
    net.onClose = () => {
      this.ui.toast('Utracono połączenie z serwerem. Odśwież stronę.', 'danger');
      this.ui.bigMessage('Rozłączono', 'Odśwież stronę, aby połączyć się ponownie.');
    };
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.post.resize();
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
    audio.init();
    audio.setVolume(this.settings.vol, this.settings.music);
    this.ui.bigMessage(this.worldInfo.name, `${CHAR[this.char].name} · kod świata: ${this.worldInfo.id}`);
    if (!localStorage.getItem('wm_help_seen')) { localStorage.setItem('wm_help_seen', '1'); setTimeout(() => this.ui.openHelp(), 1500); }
    this.loop();
  }

  applySettings() {
    localStorage.setItem('wm_settings', JSON.stringify(this.settings));
    const q = this.settings.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.25 : 1));
    this.sun.castShadow = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); (this.sun.shadow as any).map = null; }
    if (this.post) { this.post.resize(); this.post.enabled = this.settings.ink !== false; }
    audio.setVolume(this.settings.vol, this.settings.music);
    const far = 40 + this.settings.view * 26;
    (this.scene.fog as THREE.Fog).far = far;
    (this.scene.fog as THREE.Fog).near = far * 0.45;
    this.objects.dirty = true;
    if (!this.settings.fps) this.ui.debug('');
  }

  // ===================== Wiadomości =====================
  onMsg(m: any) {
    switch (m.t) {
      case 's': this.entities.applySnapshot(m.e, performance.now()); break;
      case 'me': this.onMe(m); break;
      case 'inv': this.inv = m.inv; this.equip = m.eq; this.stock = m.stock || {}; this.ui.renderInv(); break;
      case 'known': this.known = new Set(m.k); if (this.ui.craftOpen) this.ui.renderCraft(); break;
      case 'quests': this.ui.setQuests(m); break;
      case 'env': this.onEnv(m); break;
      case 'chunks': this.onChunks(m); break;
      case 'o': {
        if (m.s === null) this.objects.state.delete(m.id); else this.objects.state.set(m.id, m.s);
        this.objects.dirty = true;
        if (this.target && this.target.k === 'o' && this.target.id === m.id && m.s !== null) this.target = null;
        break;
      }
      case 'st': this.entities.setStruct(m.s); this.objects.dirty = true; break;
      case 'sd': this.entities.removeStruct(m.id); if (this.target?.k === 's' && this.target.id === m.id) this.target = null; break;
      case 'fx': this.onFx(m); break;
      case 'toast': this.ui.toast(m.text, m.kind); break;
      case 'sys': this.ui.chat(null, m.text, 'sys'); break;
      case 'chat': this.ui.chat(m.n, m.text); this.showBubble(m.id, m.text); break;
      case 'got': {
        const name = m.id === 'blueprint' ? 'Plan konstrukcyjny' : ITEMS[m.id]?.name;
        this.fx.floatEmoji(this.me.x, this.gen.height(this.me.x, this.me.z) + 2.4, this.me.z, m.id === 'blueprint' ? '📘' : ITEMS[m.id]?.icon || '❔', 0.9);
        if (m.id === 'blueprint' || ITEMS[m.id]?.cat === 'boss') this.ui.toast(`Zdobyto: ${name} ×${m.n}`, 'good');
        audio.play('got', 0.6);
        break;
      }
      case 'dialog': this.ui.openDialog(m); break;
      case 'cont': this.ui.openContainer(m); break;
      case 'openCraft': {
        const map: Record<string, string> = { workbench: 'tools', forge: 'war', kitchen: 'food', loom: 'cloth', alchemy: 'magic', cartography: 'science', mechanic: 'machines', shadow: 'magic' };
        this.ui.craftTab = map[m.st] || 'tools';
        this.ui.toggleCraft(true);
        break;
      }
      case 'far': break;
      case 'pos': this.me.x = m.x; this.me.z = m.z; this.moveTo = null; break;
      case 'dead': this.dead = true; this.target = null; this.ui.showDeath(m.cause, m.hardcore); break;
      case 'revived': this.dead = false; audio.play('revive'); this.ui.toast('Wracasz do życia!', 'good'); break;
      case 'boss': this.ui.setBoss(m); break;
      case 'qdone': this.ui.bigMessage(`✔ ${m.title}`, m.msg || 'Zadanie ukończone!'); audio.play('quest'); break;
      case 'qnew': this.ui.toast(`📜 Nowe zadanie: ${m.title}`, 'info'); break;
      case 'learned': { const r = RECIPES[m.r]; this.ui.toast(`📗 Zapamiętano recepturę: ${ITEMS[r.out]?.name || STRUCTS[r.out]?.name}`, 'good'); break; }
      case 'map': {
        if (m.all) { this.mapAll = true; break; }
        const b = Uint8Array.from(atob(m.b), (c) => c.charCodeAt(0));
        for (let i = 0; i < this.mapBits.length; i++) this.mapBits[i] |= b[i] || 0;
        this.flags.maptable = true;
        break;
      }
      case 'ping': this.ui.pings.push({ x: m.x, z: m.z, n: m.n, t: performance.now() }); this.ui.chat(null, `📍 ${m.n} oznacza miejsce na mapie.`, 'sys'); this.fx.ring(m.x, m.z, 2, 0xff4040, 3, 0); audio.play('click'); break;
      case 'victory': this.ui.showVictory(); this.flags.victory = true; break;
      case 'kicked': this.ui.bigMessage('Wyrzucono cię ze świata', ''); break;
      case 'err': this.ui.toast(m.text, 'danger'); break;
    }
  }

  onMe(m: any) {
    this.stats = m;
    const wasGhost = this.me.ghost;
    this.me.ghost = !!m.g;
    this.me.wolf = !!m.wolf;
    this.me.sleeping = !!m.sl;
    this.wolf = !!m.wolf;
    if (wasGhost && !m.g) this.ui.updateStats(m);
    this.ui.updateStats(m);
  }

  onEnv(m: any) {
    this.env = m;
    this.envTime = m.time;
    this.ui.drawClock(m);
    if (m.se !== this.seasonShown) {
      if (this.seasonShown) this.ui.bigMessage(SEASON_NAMES[m.se as Season], 'Nadeszła nowa pora roku');
      this.seasonShown = m.se;
      this.terrain.season = m.se;
      this.objects.season = m.se;
      this.terrain.recolorAll();
      this.objects.dirty = true;
    }
    if (m.ph !== this.phaseShown) {
      if (this.phaseShown && m.ph === 'dusk') { this.ui.toast('🌆 Zapada zmierzch – przygotuj światło!', 'warn'); }
      if (this.phaseShown && m.ph === 'night') this.ui.toast('🌙 Nastała noc.', 'warn');
      if (this.phaseShown && m.ph === 'day') this.ui.toast('☀️ Nowy dzień!', 'good');
      this.phaseShown = m.ph;
    }
  }

  onChunks(m: any) {
    for (const k of m.rem) {
      this.objects.chunks.delete(k);
      const cx = k % 10000, cz = Math.floor(k / 10000);
      for (const o of this.gen.chunkObjects(cx, cz)) this.objects.state.delete(o.id);
      for (const s of [...this.entities.structs.values()]) if (Math.floor(s.data.x / CHUNK) === cx && Math.floor(s.data.z / CHUNK) === cz) this.entities.removeStruct(s.id);
    }
    for (const [k, os, ss] of m.add) {
      this.objects.chunks.add(k);
      for (const [id, s] of os) this.objects.state.set(id, s);
      for (const s of ss) this.entities.setStruct(s);
    }
    this.objects.dirty = true;
  }

  onFx(m: any) {
    this.fx.play(m.k, m.x, m.z, m);
    const d = Math.hypot(m.x - this.me.x, m.z - this.me.z);
    const vol = Math.max(0.1, 1 - d / 50);
    if (d > 60 && m.k !== 'howl') return;
    switch (m.k) {
      case 'hit': audio.play(m.c === 'chop' ? 'chop' : m.c === 'mine' ? 'mine' : m.c === 'flesh' ? 'hit' : 'pick', vol); break;
      case 'hurt': if (m.id === this.myId) { audio.play('hurt'); this.shake = 0.3; } break;
      case 'lightning': audio.play('thunder', vol); break;
      case 'howl': audio.play('howl'); break;
      case 'charlie': audio.play('charlie'); break;
      case 'bossSpawn': case 'roar': audio.play('roar', vol); break;
      case 'build': audio.play('build', vol); break;
      case 'craft': audio.play('craft', vol); break;
      case 'eat': audio.play('eat', vol); break;
      case 'fuel': audio.play('fire', vol); break;
      case 'splash': audio.play('splash', vol); break;
      case 'revive': audio.play('revive', vol); break;
    }
  }
  shake = 0;

  showBubble(id: number, text: string) {
    const v = this.entities.views.get(id);
    if (!v) return;
    this.fx.floatEmoji(v.x, this.gen.height(v.x, v.z) + 3, v.z, '💬', 2);
    void text;
  }

  // ===================== Crafting (stan lokalny) =====================
  count(id: string) {
    let c = 0;
    for (const s of this.inv) if (s && s.id === id) c += s.n;
    return c;
  }
  recipeCost(r: Recipe): [string, number][] {
    const cd = CHAR[this.char];
    const disc = cd.craftDiscount && cd.craftDiscount.cats.includes(r.cat) ? cd.craftDiscount.mul : 1;
    return r.ing.map(([id, n]) => [id, Math.max(1, Math.ceil(n * disc))]);
  }
  canAfford(r: Recipe) {
    return this.recipeCost(r).every(([id, n]) => this.count(id) >= n);
  }
  stationNear(st: string, lvl = 1) {
    if (st === 'ancient') {
      const core = this.gen.pois.find((p) => p.type === 'ancient_core');
      return !!this.flags.coreRepaired && !!core && Math.hypot(core.x - this.me.x, core.z - this.me.z) < 12;
    }
    for (const s of this.entities.structs.values()) {
      const d = STRUCTS[s.type];
      if (d.station === st && (d.level || 1) >= lvl && Math.hypot(s.data.x - this.me.x, s.data.z - this.me.z) < 6.5) return true;
    }
    return false;
  }
  recipeStatus(r: Recipe): string {
    if (r.char && r.char !== this.char) return 'hidden';
    if (BLUEPRINT_ONLY.has(r.id) && !this.known.has(r.id)) return 'blueprint';
    if (this.known.has(r.id)) return 'ok';
    if (this.char === 'ilma' && r.out.endsWith('_potion')) return 'ok';
    for (const st of recipeStations(r)) if (!this.stationNear(st, r.lvl || 1)) return 'station';
    return 'ok';
  }
  nearFire() {
    for (const s of this.entities.structs.values()) if ((s.type === 'campfire' || s.type === 'firepit') && (s.data.f || 0) > 0 && Math.hypot(s.data.x - this.me.x, s.data.z - this.me.z) < 3.5) return true;
    return false;
  }

  // ===================== Budowanie =====================
  startBuild(r: Recipe) {
    this.cancelBuild();
    const model = makeStruct(r.out);
    model.g.traverse((o: any) => {
      if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.castShadow = false; }
    });
    if (model.flame) model.flame.visible = false;
    this.scene.add(model.g);
    this.building = { r, ghost: model.g, rot: 0, ok: false, x: 0, z: 0 };
    this.target = null;
    this.ui.buildHint(`🔨 Stawiasz: <b>${STRUCTS[r.out].name}</b> — LPM: postaw · R: obróć · PPM/Esc: anuluj`);
  }
  cancelBuild() {
    if (!this.building) return;
    this.scene.remove(this.building.ghost);
    this.building = null;
    this.ui.buildHint(null);
  }
  updateBuild() {
    const b = this.building!;
    const g = this.mouse.ground;
    if (!g) return;
    const def = STRUCTS[b.r.out];
    const isWall = b.r.out.startsWith('wall_') || b.r.out === 'gate';
    const snap = def.floor ? 2 : isWall ? 1 : 0.5;
    let x = Math.round(g.x / snap) * snap, z = Math.round(g.z / snap) * snap;
    if (def.floor) { x += 1; z += 1; }
    b.x = x; b.z = z;
    b.ghost.position.set(x, this.gen.height(x, z), z);
    b.ghost.rotation.y = b.rot;
    let ok = Math.hypot(x - this.me.x, z - this.me.z) < 12 && this.gen.height(x, z) > 0.25;
    if (ok && !def.upgradeOf) {
      for (const s of this.entities.structs.values()) {
        const sd = STRUCTS[s.type];
        if (!!sd.floor !== !!def.floor) continue;
        const otherWall = s.type.startsWith('wall_') || s.type === 'gate';
        const lim = isWall && otherWall ? 0.85 : (def.radius + sd.radius) * 0.85;
        if (Math.hypot(s.data.x - x, s.data.z - z) < lim) { ok = false; break; }
      }
      if (ok && !def.floor) for (const o of this.objects.near(x, z, 3)) {
        const od = OBJ[o.type];
        if (!od?.block) continue;
        const st = this.objects.state.get(o.id);
        if (st === 'gone' || st === 'picked') continue;
        const br = st === 'stump' ? 0.3 : od.block;
        if (Math.hypot(o.x - x, o.z - z) < br + def.radius * 0.7) { ok = false; break; }
      }
    }
    b.ok = ok;
    b.ghost.traverse((o: any) => { if (o.material?.color) { o.material.emissive?.setHex(ok ? 0x103010 : 0x501010); } });
  }
  placeBuild() {
    const b = this.building!;
    if (!b.ok) { this.ui.toast('Nie można tu postawić.', 'warn'); return; }
    this.net.send({ t: 'craft', r: b.r.id, x: b.x, z: b.z, rot: b.rot });
    const multi = (b.r.n || 1) > 1 || (this.stock[b.r.out] || 0) > 1;
    const hasMore = multi || (this.canAfford(b.r) && (b.r.out.startsWith('wall_') || b.r.out.startsWith('floor_')));
    if (!hasMore) this.cancelBuild();
  }

  // ===================== Wejście =====================
  bindInput() {
    const cv = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (this.ui.chatOpen) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Enter') { e.preventDefault(); this.ui.toggleChat(true); return; }
      if (e.key === 'Escape') {
        if (this.building) this.cancelBuild();
        else if (this.ui.modal) this.ui.closeModal();
        else if (this.ui.container) { this.net.send({ t: 'cont', op: 'close' }); this.ui.openContainer({ id: 0 }); }
        else if (this.ui.craftOpen) this.ui.toggleCraft(false);
        else this.ui.openSettings();
        return;
      }
      if (e.key === 'Tab') { e.preventDefault(); this.ui.showPlayers(true); return; }
      if (this.ui.modal === 'emotes' && /^[1-4]$/.test(k)) { this.net.send({ t: 'emote', e: +k }); this.ui.closeModal(); return; }
      if (e.key === 'F3') { e.preventDefault(); this.settings.fps = !this.settings.fps; this.applySettings(); return; }
      this.keys.add(k);
      if (k === 'q') this.yawTarget -= Math.PI / 4;
      if (k === 'e') this.yawTarget += Math.PI / 4;
      if (k === 'c') this.ui.toggleCraft();
      if (k === 'm') { if (this.ui.modal === 'map') this.ui.closeModal(); else this.ui.openMap(); }
      if (k === 'j') { if (this.ui.modal === 'journal') this.ui.closeModal(); else this.ui.openJournal(); }
      if (k === 'h') { if (this.ui.modal === 'help') this.ui.closeModal(); else this.ui.openHelp(); }
      if (k === 'b') this.ui.openEmotes();
      if (k === 'r' && this.building) this.building.rot += Math.PI / 4;
      if (/^[1-9]$/.test(k) && !this.ui.modal) this.net.send({ t: 'inv', op: 'use', a: `i:${+k - 1}`, alt: e.shiftKey ? 1 : 0 });
      if (k === ' ') { e.preventDefault(); this.actNearest(); }
      if (k === 'f') this.attackNearest();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Tab') this.ui.showPlayers(false);
    });
    window.addEventListener('blur', () => this.keys.clear());
    cv.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    cv.addEventListener('mousedown', (e) => {
      audio.init();
      this.mouse.down = true;
      if (this.ui.chatOpen) this.ui.toggleChat(false);
      if (e.button === 1) { e.preventDefault(); const g = this.groundAt(e.clientX, e.clientY); if (g) this.net.send({ t: 'ping', x: g.x, z: g.z }); return; }
      if (this.building) {
        if (e.button === 0) this.placeBuild(); else this.cancelBuild();
        return;
      }
      if (e.button === 2) { this.onClick(e, true); return; }
      if (e.button === 0) this.onClick(e, e.shiftKey);
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { this.zoom = Math.max(9, Math.min(46, this.zoom + Math.sign(e.deltaY) * 2.5)); }, { passive: true });
  }

  groundAt(sx: number, sy: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const near: THREE.Object3D[] = [];
    const cx = Math.floor(this.me.x / CHUNK), cz = Math.floor(this.me.z / CHUNK);
    for (const [k, m] of this.terrain.chunks) if (Math.abs((k % 10000) - cx) <= 3 && Math.abs(Math.floor(k / 10000) - cz) <= 3) near.push(m);
    const hit = this.raycaster.intersectObjects(near, false)[0];
    if (hit) return hit.point;
    // płaszczyzna wody
    const t = -this.raycaster.ray.origin.y / this.raycaster.ray.direction.y;
    if (t > 0) return this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, t);
    return null;
  }

  /** Co jest pod kursorem: encja (z ekranu) albo obiekt/budowla przy punkcie na ziemi */
  pickAt(sx: number, sy: number): { k: Target['k']; id: number; x: number; z: number; label: string } | null {
    const ent = this.entities.pick(this.camera, sx, sy, window.innerWidth, window.innerHeight, (v) => !(v.kind === 0 && v.id === this.myId));
    if (ent) {
      if (ent.kind === 1) {
        const d = MOBS[ent.type];
        const verb = d.ai === 'npc' ? 'Rozmawiaj' : d.ai === 'pig' && this.hasMeat() && !(ent.flags & 16) ? 'Nakarm (Shift: atak)' : d.ai === 'golem' ? 'Sprawdź' : 'Atakuj';
        return { k: 'm', id: ent.id, x: ent.x, z: ent.z, label: `${d.name} — <i>LPM: ${verb}</i>` };
      }
      if (ent.kind === 2) return { k: 'd', id: ent.id, x: ent.x, z: ent.z, label: `${ITEMS[ent.type]?.name || 'Plan'}${(ent.n || 1) > 1 ? ' ×' + ent.n : ''} — <i>LPM: Podnieś</i>` };
      if (ent.kind === 0) return { k: 'p', id: ent.id, x: ent.x, z: ent.z, label: `${ent.name}${ent.flags & 1 ? ' (duch) — <i>LPM: wskrześ Sercem życia</i>' : ''}` };
    }
    const g = this.mouse.ground;
    if (!g) return null;
    let best: { k: Target['k']; id: number; x: number; z: number; label: string } | null = null, bd = 1e9;
    for (const s of this.entities.structs.values()) {
      const def = STRUCTS[s.type];
      if (def.floor && !(this.equip.hand && ITEMS[this.equip.hand.id]?.tool?.includes('hammer'))) continue;
      const d = Math.hypot(s.data.x - g.x, s.data.z - g.z);
      const lim = def.radius + 0.7;
      if (d < lim && d < bd) {
        bd = d;
        const hammer = this.equip.hand && ITEMS[this.equip.hand.id]?.tool?.includes('hammer');
        best = { k: 's', id: s.id, x: s.data.x, z: s.data.z, label: `${def.name}${s.data.f !== undefined ? ` (paliwo ${s.data.f}%)` : ''}${s.data.pl ? ` – ${ITEMS[s.data.pl]?.name} ${s.data.g}%` : ''} — <i>LPM: ${hammer ? 'Rozbierz' : this.structVerb(s.type)}</i>` };
      }
    }
    for (const o of this.objects.near(g.x, g.z, 3)) {
      const def = OBJ[o.type];
      if (!def || def.hidden) continue;
      const st = this.objects.state.get(o.id);
      if (st === 'gone') continue;
      const type = st === 'stump' ? 'stump' : o.type;
      const dd = OBJ[type];
      const d = Math.hypot(o.x - g.x, o.z - g.z);
      const lim = Math.max(0.9, (dd.block || 0.4) + 0.6) * (o.id < 10000 ? 1.6 : 1);
      if (d < lim && d < bd) {
        bd = d;
        const picked = st === 'picked' || st === 'opened';
        best = { k: 'o', id: o.id, x: o.x, z: o.z, label: `${dd.name}${picked ? ' (odrasta)' : ''}${dd.verb && !picked ? ` — <i>LPM: ${dd.verb}${dd.tool && !this.hasTool(dd.tool) ? ` (potrzeba: ${({ chop: 'siekiera', mine: 'kilof', dig: 'łopata', hammer: 'młotek' } as any)[dd.tool]})` : ''}</i>` : ''}` };
      }
    }
    return best;
  }
  structVerb(t: string) {
    if (t === 'campfire' || t === 'firepit') return 'Dorzuć paliwo';
    if (t === 'gate') return 'Otwórz/zamknij';
    if (t === 'tent') return 'Śpij';
    if (t === 'farm') return 'Sadź/zbieraj';
    const d = STRUCTS[t];
    if (d.slots || d.machine === 'furnace' || d.machine === 'generator') return 'Otwórz';
    if (d.station) return 'Receptury';
    return 'Użyj';
  }
  hasTool(t: string) {
    return !!(this.equip.hand && ITEMS[this.equip.hand.id]?.tool?.includes(t as any));
  }
  hasMeat() {
    return this.inv.some((s) => s && ['meat', 'small_meat', 'monster_meat', 'meat_cooked', 'small_meat_cooked'].includes(s.id));
  }

  onClick(e: MouseEvent, alt: boolean) {
    if (this.me.sleeping) { /* ruch budzi */ }
    const g = this.groundAt(e.clientX, e.clientY);
    this.mouse.ground = g;
    // wyrzucanie zaznaczonego przedmiotu
    if (this.ui.selected && g && e.button === 0) {
      this.net.send({ t: 'inv', op: 'drop', a: this.ui.selected });
      this.ui.selected = null;
      this.ui.renderInv();
      return;
    }
    const p = this.pickAt(e.clientX, e.clientY);
    if (p) {
      const once = p.k === 'd' || p.k === 'p' || (p.k === 's' && !this.hasTool('hammer') && !(this.entities.structs.get(p.id)?.type === 'planted_tree')) || (p.k === 'o' && !!OBJ[this.gen.objectById(p.id)?.type || '']?.special) || (p.k === 'm' && ['npc', 'golem'].includes(MOBS[this.entities.views.get(p.id)?.type || '']?.ai));
      this.target = { k: p.k, id: p.id, alt, once };
      this.moveTo = null;
      this.actTimer = 0;
      return;
    }
    if (g) {
      // wędkowanie
      if (this.hasTool('fish') && g.y < 0.05 && this.gen.height(g.x, g.z) < 0) {
        if (Math.hypot(g.x - this.me.x, g.z - this.me.z) < 7) { this.net.send({ t: 'actg', x: g.x, z: g.z }); this.me.r = Math.atan2(g.x - this.me.x, g.z - this.me.z); return; }
      }
      this.moveTo = { x: g.x, z: g.z };
      this.target = null;
    }
  }

  actNearest() {
    if (this.me.ghost) {
      const portal = this.gen.pois.find((p) => p.type === 'portal');
      if (portal && Math.hypot(portal.x - this.me.x, portal.z - this.me.z) < 12) this.target = { k: 'o', id: portal.id, once: true };
      return;
    }
    let best: Target | null = null, bd = 6 * 6;
    for (const v of this.entities.views.values()) {
      if (v.kind !== 2) continue;
      const d = (v.x - this.me.x) ** 2 + (v.z - this.me.z) ** 2;
      if (d < bd) { bd = d; best = { k: 'd', id: v.id, once: true }; }
    }
    if (!best) {
      bd = 6 * 6;
      for (const o of this.objects.near(this.me.x, this.me.z, 6)) {
        const def = OBJ[o.type];
        if (!def?.verb || def.special || def.spawn) continue;
        const st = this.objects.state.get(o.id);
        if (st && st !== 'stump') continue;
        const tool = st === 'stump' ? 'dig' : def.tool;
        if (tool && !this.hasTool(tool)) continue;
        const d = (o.x - this.me.x) ** 2 + (o.z - this.me.z) ** 2;
        if (d < bd) { bd = d; best = { k: 'o', id: o.id }; }
      }
    }
    if (best) { this.target = best; this.moveTo = null; this.actTimer = 0; }
  }

  attackNearest() {
    let best: Target | null = null, bd = 10 * 10;
    for (const v of this.entities.views.values()) {
      if (v.kind !== 1) continue;
      const d = MOBS[v.type];
      if (['npc', 'golem', 'passive'].includes(d.ai) || (d.ai === 'pig' && v.flags & 16) || v.flags & 8) continue;
      const dd = (v.x - this.me.x) ** 2 + (v.z - this.me.z) ** 2;
      if (dd < bd) { bd = dd; best = { k: 'm', id: v.id, alt: true }; }
    }
    if (best) { this.target = best; this.moveTo = null; this.actTimer = 0; }
  }

  targetPos(t: Target): { x: number; z: number; reach: number } | null {
    if (t.k === 'o') {
      const o = this.gen.objectById(t.id);
      if (!o) return null;
      const st = this.objects.state.get(o.id);
      const def = OBJ[st === 'stump' ? 'stump' : o.type];
      return { x: o.x, z: o.z, reach: 1.7 + (def?.block || 0) * (o.id < 10000 ? 1.2 : 1) };
    }
    if (t.k === 's') {
      const s = this.entities.structs.get(t.id);
      if (!s) return null;
      return { x: s.data.x, z: s.data.z, reach: 1.6 + STRUCTS[s.type].radius };
    }
    const v = this.entities.views.get(t.id);
    if (!v) return null;
    if (t.k === 'm') {
      const d = MOBS[v.type];
      const hand = this.equip.hand && ITEMS[this.equip.hand.id];
      const reach = hand?.range ? hand.range - 1 : 1.9 + d.radius;
      return { x: v.x, z: v.z, reach: d.ai === 'npc' ? 3 : reach };
    }
    return { x: v.x, z: v.z, reach: t.k === 'd' ? 1.6 : 2 };
  }

  // ===================== Ruch lokalny =====================
  blockers(x: number, z: number): { x: number; z: number; r: number }[] {
    const res: { x: number; z: number; r: number }[] = [];
    for (const o of this.objects.near(x, z, 4)) {
      const def = OBJ[o.type];
      if (!def?.block) continue;
      const st = this.objects.state.get(o.id);
      if (st === 'gone' || (st === 'picked' && def.after !== 'stump')) continue;
      res.push({ x: o.x, z: o.z, r: (st === 'stump' ? 0.35 : def.block) * (o.id < 10000 ? 1 : o.s) });
    }
    for (const s of this.entities.structs.values()) {
      const d = STRUCTS[s.type];
      if (!d.block || (s.type === 'gate' && s.data.op)) continue;
      if (Math.abs(s.data.x - x) > 5 || Math.abs(s.data.z - z) > 5) continue;
      res.push({ x: s.data.x, z: s.data.z, r: d.radius });
    }
    return res;
  }

  moveLocal(dt: number) {
    if (this.dead && !this.me.ghost) return;
    let dx = 0, dz = 0;
    const k = this.keys;
    const fw = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const rt = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    if (!this.ui.chatOpen) {
      if (k.has('w') || k.has('arrowup')) { dx += fw.x; dz += fw.z; }
      if (k.has('s') || k.has('arrowdown')) { dx -= fw.x; dz -= fw.z; }
      if (k.has('d') || k.has('arrowright')) { dx += rt.x; dz += rt.z; }
      if (k.has('a') || k.has('arrowleft')) { dx -= rt.x; dz -= rt.z; }
    }
    if (dx || dz) { this.target = null; this.moveTo = null; }
    // cel akcji
    if (!dx && !dz && this.target) {
      const tp = this.targetPos(this.target);
      if (!tp) this.target = null;
      else {
        const d = Math.hypot(tp.x - this.me.x, tp.z - this.me.z);
        if (d > tp.reach) { dx = tp.x - this.me.x; dz = tp.z - this.me.z; }
        else {
          this.me.r = Math.atan2(tp.x - this.me.x, tp.z - this.me.z);
          if (this.actTimer <= 0) {
            this.net.send({ t: 'act', id: this.target.id, k: this.target.k, alt: this.target.alt ? 1 : 0 });
            this.actTimer = this.target.k === 'm' ? 0.5 : 0.4;
            if (this.target.once) this.target = null;
          }
        }
      }
    } else if (!dx && !dz && this.moveTo) {
      const d = Math.hypot(this.moveTo.x - this.me.x, this.moveTo.z - this.me.z);
      if (d < 0.4) this.moveTo = null;
      else { dx = this.moveTo.x - this.me.x; dz = this.moveTo.z - this.me.z; }
    }
    this.me.moving = false;
    const stuck = this.me.sleeping && !dx && !dz;
    if ((dx || dz) && !stuck && (this.stats.spd ?? 1) > 0) {
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      let spd = this.stats.spd ?? BASE_SPEED;
      // podłogi przyspieszają
      for (const s of this.entities.structs.values()) {
        const d = STRUCTS[s.type];
        if (d.floor && Math.abs(s.data.x - this.me.x) < 1.05 && Math.abs(s.data.z - this.me.z) < 1.05) { spd *= d.floor; break; }
      }
      let nx = this.me.x + dx * spd * dt, nz = this.me.z + dz * spd * dt;
      if (!this.me.ghost) {
        if (this.gen.height(nx, nz) < -0.3) {
          if (this.gen.height(nx, this.me.z) >= -0.3) nz = this.me.z;
          else if (this.gen.height(this.me.x, nz) >= -0.3) nx = this.me.x;
          else { nx = this.me.x; nz = this.me.z; this.moveTo = null; }
        }
        for (const b of this.blockers(nx, nz)) {
          const ddx = nx - b.x, ddz = nz - b.z;
          const dd = Math.hypot(ddx, ddz);
          const min = b.r + 0.35;
          if (dd < min && dd > 0.0001) { nx = b.x + (ddx / dd) * min; nz = b.z + (ddz / dd) * min; }
        }
      }
      nx = Math.max(1.5, Math.min(this.gen.size - 1.5, nx));
      nz = Math.max(1.5, Math.min(this.gen.size - 1.5, nz));
      const moved = Math.hypot(nx - this.me.x, nz - this.me.z);
      if (moved > 0.001) {
        this.me.x = nx; this.me.z = nz;
        this.me.r = Math.atan2(dx, dz);
        this.me.moving = true;
        this.me.anim = spd > 3.8 ? 10 : 1;
      } else if (this.moveTo) this.moveTo = null;
    }
    // wysyłanie pozycji
    this.sendTimer -= dt;
    const changed = Math.abs(this.me.x - this.lastSent.x) > 0.01 || Math.abs(this.me.z - this.lastSent.z) > 0.01 || Math.abs(this.me.r - this.lastSent.r) > 0.05;
    if ((changed && this.sendTimer <= 0) || this.sendTimer < -1) {
      this.sendTimer = 1 / 15;
      this.net.send({ t: 'in', x: +this.me.x.toFixed(2), z: +this.me.z.toFixed(2), r: +this.me.r.toFixed(2), a: this.me.moving ? this.me.anim : 0 });
      this.lastSent = { x: this.me.x, z: this.me.z, r: this.me.r };
    }
  }

  // ===================== Światło i niebo =====================
  updateLighting(dt: number) {
    const dl = this.env.dl || 480;
    this.envTime += dt;
    const frac = (this.envTime % dl) / dl;
    const se = this.env.se as Season;
    const ph = ({ autumn: [0.5, 0.7], winter: [0.38, 0.56], spring: [0.5, 0.7], summer: [0.62, 0.76] } as any)[se] || [0.5, 0.7];
    let light: number;
    if (frac < 0.06) light = 0.15 + (frac / 0.06) * 0.85;
    else if (frac < ph[0]) light = 1;
    else if (frac < ph[1]) light = 1 - ((frac - ph[0]) / (ph[1] - ph[0])) * 0.85;
    else light = Math.max(0, 0.15 - Math.min(1, (frac - ph[1]) / 0.05) * 0.15);
    const fullMoon = this.env.moon === 5;
    this.lightLevel = light;
    const day = new THREE.Color(se === 'winter' ? 0xb4b8b4 : se === 'summer' ? 0xb0a47e : se === 'autumn' ? 0x9c9478 : 0x8e9a80);
    const dusk = new THREE.Color(0x8a5238), night = new THREE.Color(fullMoon ? 0x141a2a : 0x040508);
    let sky: THREE.Color;
    if (light > 0.6) sky = night.clone().lerp(dusk, 1).lerp(day, (light - 0.6) / 0.4);
    else sky = night.clone().lerp(dusk, light / 0.6);
    const raining = this.env.w === 'rain' || this.env.w === 'storm' || this.env.w === 'snow';
    if (raining) sky.lerp(new THREE.Color(0x707880), 0.4 * (this.env.wi || 0.5));
    const fog = this.scene.fog as THREE.Fog;
    const baseFar = 40 + this.settings.view * 26;
    const inDesertStorm = this.env.ss && this.gen.biome(this.me.x, this.me.z) === 'desert';
    if (inDesertStorm) { sky.lerp(new THREE.Color(0xd0a868), 0.8); fog.far = 40; fog.near = 5; }
    else { fog.far = baseFar * (raining ? 0.8 : 1); fog.near = fog.far * 0.45; }
    (this.scene.background as THREE.Color).copy(sky);
    fog.color.copy(sky);
    // słońce/księżyc
    const ang = frac * Math.PI * 2;
    const sunUp = light > 0.2;
    this.sun.intensity = sunUp ? 0.25 + light * 1.25 : fullMoon ? 0.35 : 0.04;
    this.sun.color.setHex(sunUp ? (light < 0.8 ? 0xff9a60 : 0xffe6c0) : 0x7080b0);
    const sx = Math.cos(ang) * 50, sy = 60 + Math.sin(ang) * 20;
    this.sun.position.set(this.me.x + sx, sy, this.me.z + 30);
    this.sun.target.position.set(this.me.x, 0, this.me.z);
    this.hemi.intensity = 0.05 + light * 0.62 + (fullMoon && !sunUp ? 0.14 : 0);
    const baseAmb = 0.02 + light * 0.18 + (fullMoon && !sunUp ? 0.08 : 0);
    if (this.fx.flash === 0) this.amb.intensity = baseAmb;
    this.fx.update(dt, this.camera.position.x, this.camera.position.z, this.env.w, this.env.wi, this.amb, baseAmb);
    const bio = this.gen.biome(this.me.x, this.me.z);
    this.fx.ambient(dt, this.me.x, this.me.z, light < 0.3 && se !== 'winter' && ['grass', 'forest', 'swamp', 'savanna', 'mushroom'].includes(bio), se === 'autumn' && light > 0.5 && (bio === 'forest' || bio === 'grass'), this.t);
    // pula świateł punktowych
    type L = { x: number; y: number; z: number; r: number; c: number; i: number };
    const cand: L[] = [];
    for (const s of this.entities.structs.values()) {
      const d = s.data;
      const def = STRUCTS[s.type];
      if (Math.abs(d.x - this.me.x) > 60 || Math.abs(d.z - this.me.z) > 60) continue;
      if (d.b) cand.push({ x: d.x, y: 2, z: d.z, r: 10, c: 0xff8030, i: 3 });
      if (s.type === 'campfire' || s.type === 'firepit') { if (d.f > 0) cand.push({ x: d.x, y: 1.4, z: d.z, r: 4 + def.light! * Math.min(1, d.f / 50), c: 0xffa040, i: 2.5 + Math.random() * 0.4 }); }
      else if (s.type === 'lamp') { if (d.pw) cand.push({ x: d.x, y: 2.8, z: d.z, r: 15, c: 0xfff0c0, i: 2.8 }); }
      else if (s.type === 'furnace' || s.type === 'kitchen' || s.type === 'smokehouse') { if (d.on || (d.f ?? 0) > 0) cand.push({ x: d.x, y: 1, z: d.z, r: 6, c: 0xff8030, i: 1.8 }); }
      else if (def.light) cand.push({ x: d.x, y: 1.5, z: d.z, r: def.light * 1.3, c: s.type === 'shadow_altar' ? 0xa040f0 : s.type === 'escape_portal' ? 0x40e0ff : 0xff9040, i: 1.6 });
    }
    for (const v of this.entities.views.values()) {
      if (v.kind === 0) {
        const hand = v.id === this.myId ? this.equip.hand?.id : (v.eq || '').split('|')[0];
        const lr = hand ? ITEMS[hand]?.light : 0;
        const own = CHAR[v.type]?.ownLight;
        if (lr) cand.push({ x: v.x, y: 2.2, z: v.z, r: lr * 1.4, c: hand === 'lantern' ? 0xffe0a0 : 0xffa040, i: 2.4 });
        else if (own) cand.push({ x: v.x, y: 1.5, z: v.z, r: own * 1.6, c: 0xffe080, i: 1.6 });
      } else if (v.kind === 1 && MOBS[v.type]?.boss) cand.push({ x: v.x, y: 3, z: v.z, r: 10, c: 0xff6060, i: 1.4 });
    }
    for (const o of this.objects.visible) {
      const def = OBJ[o.type];
      if (!def?.light || Math.abs(o.x - this.me.x) > 40 || Math.abs(o.z - this.me.z) > 40) continue;
      if (this.objects.state.get(o.id) && o.type !== 'portal') continue;
      cand.push({ x: o.x, y: o.type === 'mushtree' ? 3 : 1.2, z: o.z, r: def.light * 1.8, c: o.type === 'glowcap' || o.type === 'mushtree' || o.type === 'crystal_node' ? 0x60e0ff : 0xffc060, i: o.type === 'portal' || o.type === 'ancient_core' ? 2 : 1.2 });
    }
    cand.sort((a, b) => ((a.x - this.me.x) ** 2 + (a.z - this.me.z) ** 2) - ((b.x - this.me.x) ** 2 + (b.z - this.me.z) ** 2));
    const nightK = 1 - light * 0.6;
    this.lights.forEach((l, i) => {
      const c = cand[i];
      if (!c) { l.intensity = 0; return; }
      l.position.set(c.x, this.gen.height(c.x, c.z) + c.y, c.z);
      l.distance = c.r * 1.6;
      l.color.setHex(c.c);
      l.intensity = c.i * nightK * 4;
    });
    audio.setMood(this.ui.boss && performance.now() - this.ui.boss.t < 3000 ? 'boss' : this.env.ph === 'night' ? 'night' : 'day');
  }

  // ===================== Pętla =====================
  loop = () => {
    requestAnimationFrame(this.loop);
    const nowF = performance.now();
    const dt = Math.min(0.05, (nowF - this.lastFrame) / 1000);
    this.lastFrame = nowF;
    this.t += dt;
    const now = performance.now();
    if (this.actTimer > 0) this.actTimer -= dt;
    this.moveLocal(dt);
    // kamera
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 8);
    const pitch = 0.62 + (this.zoom - 9) / 37 * 0.38;
    const h = Math.max(0, this.gen.height(this.me.x, this.me.z));
    const cd = this.zoom;
    let shx = 0, shz = 0;
    if (this.shake > 0) { this.shake -= dt; shx = (Math.random() - 0.5) * 0.4; shz = (Math.random() - 0.5) * 0.4; }
    this.camera.position.set(this.me.x + Math.sin(this.yaw) * cd * Math.cos(pitch) + shx, h + cd * Math.sin(pitch) + 1, this.me.z + Math.cos(this.yaw) * cd * Math.cos(pitch) + shz);
    this.camera.lookAt(this.me.x, h + 1.4, this.me.z);
    // świat
    this.terrain.update(this.me.x, this.me.z, this.settings.view, this.t);
    if (this.objects.dirty && now - this.objects.lastBuild > 150) {
      this.objects.lastBuild = now;
      this.objects.rebuild(this.me.x, this.me.z, 30 + this.settings.view * 22);
    }
    if (!this.objects.dirty && now - this.objects.lastBuild > 1500) this.objects.dirty = true;
    this.objects.swayU.value = this.t;
    this.objects.windU.value += ((this.env.w === 'storm' ? 4 : this.env.w === 'rain' || this.env.w === 'snow' ? 2 : 1) - this.objects.windU.value) * Math.min(1, dt * 0.5);
    this.entities.update(dt, now, this.t, this.me, this.yaw);
    this.updateLighting(dt);
    // kursor
    if (now - this.lastHoverCalc > 50) {
      this.lastHoverCalc = now;
      this.mouse.ground = this.groundAt(this.mouse.x, this.mouse.y);
      if (this.building) this.updateBuild();
      else {
        const p = this.pickAt(this.mouse.x, this.mouse.y);
        this.ui.hover(p ? p.label : null, this.mouse.x, this.mouse.y);
        this.renderer.domElement.style.cursor = p ? 'pointer' : 'default';
      }
      // trzymanie LPM na ziemi = podążaj za kursorem
      if (this.mouse.down && !this.target && this.moveTo && this.mouse.ground && !this.building) this.moveTo = { x: this.mouse.ground.x, z: this.mouse.ground.z };
    }
    // mapa i eksploracja
    if (now - this.lastExplore > 1000) {
      this.lastExplore = now;
      const cells = Math.ceil(this.gen.size / 16);
      const cx = Math.floor(this.me.x / 16), cz = Math.floor(this.me.z / 16);
      for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) {
        if (a * a + b * b > 25) continue;
        const x = cx + a, z = cz + b;
        if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
        const i = z * cells + x;
        this.mapBits[i >> 3] |= 1 << (i & 7);
      }
    }
    if (now - this.lastMini > 250) { this.lastMini = now; this.ui.drawMinimap(); }
    const san = this.stats.msa ? this.stats.sa / this.stats.msa : 1;
    const u = this.post.mat.uniforms;
    u.insanity.value += ((san < 0.4 ? (0.4 - san) / 0.4 : 0) - u.insanity.value) * Math.min(1, dt * 2);
    u.night.value = Math.max(0, 1 - this.lightLevel * 1.4) * 0.6;
    this.post.render(this.scene, this.camera, this.t);
    // debug
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0;
      if (this.settings.fps) {
        const info = this.renderer.info;
        this.ui.debug(`FPS ${this.fps} · draw ${info.render.calls} · tri ${(info.render.triangles / 1000).toFixed(0)}k · encje ${this.entities.views.size} · budowle ${this.entities.structs.size} · poz ${this.me.x.toFixed(0)},${this.me.z.toFixed(0)} · chunk ${Math.floor(this.me.x / CHUNK)},${Math.floor(this.me.z / CHUNK)} · ${BIOME_NAMES[this.gen.biome(this.me.x, this.me.z)]} · net ${(this.net.bytesIn / 1024).toFixed(0)} KB`);
      }
    }
  };
}
