// Interfejs użytkownika (DOM): HUD, ekwipunek, crafting, questy, mapa, czat, dialogi.
import { ITEMS, itemIcon, itemName } from '../shared/data/items';
import { RECIPES, CATS, Recipe, recipeStations, BLUEPRINT_ONLY } from '../shared/data/recipes';
import { STRUCTS, STATIONS } from '../shared/data/structures';
import { CHAR } from '../shared/data/characters';
import { SEASON_NAMES, PHASES, Season } from '../shared/env';
import { BIOME_NAMES } from '../shared/data/objects';
import { MOBS } from '../shared/data/mobs';
import { audio } from './audio';
import type { Game } from './game';

const $ = (sel: string, root: ParentNode = document) => root.querySelector(sel) as HTMLElement;
function el(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const EQ_SLOTS: { k: 'hand' | 'head' | 'body' | 'back'; icon: string; name: string }[] = [
  { k: 'hand', icon: '✋', name: 'Ręka' }, { k: 'body', icon: '👕', name: 'Tułów' }, { k: 'head', icon: '🎩', name: 'Głowa' }, { k: 'back', icon: '🎒', name: 'Plecy' },
];

export class UI {
  root: HTMLElement;
  selected: string | null = null; // np. 'i:3'
  craftTab = 'tools';
  craftOpen = false;
  quests: any = { list: [], daily: [] };
  container: any = null;
  mapCanvas!: HTMLCanvasElement;
  mini!: HTMLCanvasElement;
  mapBase: HTMLCanvasElement | null = null;
  chatOpen = false;
  modal: string | null = null;
  pings: { x: number; z: number; n: string; t: number }[] = [];
  boss: { n: string; hp: number; t: number } | null = null;
  journalTab = 'active';
  detailRecipe: string | null = null;

  constructor(public game: Game) {
    this.root = el('div', 'ui');
    document.body.appendChild(this.root);
    this.root.innerHTML = `
      <div class="hud-top-right">
        <div class="clock"><canvas width="110" height="110"></canvas><div class="clock-txt"></div></div>
        <div class="stats">
          <div class="stat hp" title="Zdrowie"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg"/></svg><span class="ic">❤️</span><b></b></div>
          <div class="stat hu" title="Głód"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg"/></svg><span class="ic">🍗</span><b></b></div>
          <div class="stat sa" title="Poczytalność"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg"/></svg><span class="ic">🧠</span><b></b></div>
        </div>
        <div class="stats2"><span class="temp" title="Temperatura ciała"></span><span class="wet" title="Wilgotność"></span></div>
        <div class="buffs"></div>
        <div class="forecast"></div>
      </div>
      <div class="boss-bar hidden"><div class="boss-name"></div><div class="boss-hp"><div></div></div></div>
      <div class="toasts"></div>
      <div class="tracker"></div>
      <div class="minimap"><canvas width="180" height="180"></canvas><div class="mm-info"></div></div>
      <div class="craft-tabs"></div>
      <div class="craft-panel hidden"><div class="craft-head"></div><div class="craft-list"></div><div class="craft-detail"></div></div>
      <div class="inv-wrap"><div class="equip"></div><div class="inv"></div><div class="inv2"></div><div class="inv-hint">LPM: wybierz/przenieś · PPM: użyj/załóż/zjedz · Shift+LPM: do skrzyni · Ctrl+LPM: wyrzuć</div></div>
      <div class="container hidden"></div>
      <div class="chat"><div class="chat-log"></div><input class="chat-in hidden" maxlength="200" placeholder="Napisz wiadomość... (/help)"/></div>
      <div class="tooltip hidden"></div>
      <div class="hover-label hidden"></div>
      <div class="build-hint hidden"></div>
      <div class="vignette"></div>
      <div class="sanity-fx"></div>
      <div class="modal-bg hidden"><div class="modal"></div></div>
      <div class="dead hidden"><h1>Nie żyjesz</h1><p class="dead-cause"></p><p class="dead-help"></p></div>
      <div class="plist hidden"></div>
      <div class="help-btn" title="Pomoc (H)">?</div>
    `;
    this.mini = $('.minimap canvas', this.root) as HTMLCanvasElement;
    this.buildEquip();
    this.buildCraftTabs();
    $('.help-btn', this.root).onclick = () => this.openHelp();
    $('.modal-bg', this.root).addEventListener('mousedown', (e) => { if (e.target === $('.modal-bg', this.root)) this.closeModal(); });
    const ci = $('.chat-in', this.root) as HTMLInputElement;
    ci.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        if (ci.value.trim()) this.game.net.send({ t: 'chat', text: ci.value.trim() });
        ci.value = ''; this.toggleChat(false);
      } else if (e.key === 'Escape') this.toggleChat(false);
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.mini.addEventListener('click', () => this.openMap());
  }

  // ================== HUD ==================
  updateStats(me: any) {
    const set = (cls: string, v: number, max: number) => {
      const s = $(`.stat.${cls}`, this.root);
      const fg = s.querySelector('.fg') as SVGCircleElement;
      const k = Math.max(0, Math.min(1, v / max));
      fg.style.strokeDasharray = `${k * 94.2} 94.2`;
      (s.querySelector('b') as HTMLElement).textContent = String(Math.ceil(v));
      s.classList.toggle('low', k < 0.25);
    };
    set('hp', me.hp, me.mhp); set('hu', me.hu, me.mhu); set('sa', me.sa, me.msa);
    const t = me.te;
    $('.temp', this.root).innerHTML = `🌡 ${Math.round(t)}°`;
    $('.temp', this.root).className = 'temp' + (t < 5 ? ' cold' : t > 65 ? ' hot' : '');
    $('.wet', this.root).innerHTML = me.we > 5 ? `💧 ${me.we}%` : '';
    const names: Record<string, string> = { speed: '💨 Szybkość', warm: '🔥 Ciepło', cool: '❄️ Chłód', glow: '🔆 Blask', blessed: '🙏 Błogosławieństwo', god: '⭐ Bóg' };
    $('.buffs', this.root).innerHTML = Object.entries(me.bf || {}).map(([k, v]) => `<span>${names[k] || k} ${v}s</span>`).join('') +
      (me.st || []).map((s: string) => `<span class="bad">${({ freeze: '🧊 Zamrożony', web: '🕸 Sieć', slow: '🐌 Spowolniony', burn: '🔥 Płoniesz', stun: '💫 Ogłuszony' } as any)[s] || s}</span>`).join('') +
      (me.wolf ? '<span>🐺 Wilk</span>' : '') + (me.sl ? '<span>💤 Śpisz</span>' : '');
    const san = me.sa / me.msa;
    const fx = $('.sanity-fx', this.root);
    fx.style.opacity = san < 0.4 ? String((0.4 - san) * 2) : '0';
    this.game.renderer.domElement.style.filter = san < 0.3 ? `saturate(${0.3 + san * 2}) hue-rotate(${(0.3 - san) * 60}deg)` : '';
    const dead = $('.dead', this.root);
    if (me.g) {
      dead.classList.remove('hidden');
    } else dead.classList.add('hidden');
  }

  showDeath(cause: string, hardcore: boolean) {
    $('.dead-cause', this.root).textContent = `Przyczyna: ${cause}`;
    $('.dead-help', this.root).innerHTML = hardcore ? 'Tryb Hardcore – za chwilę zaczniesz od nowa przy portalu.' : 'Jesteś duchem. Dotknij <b>Kamiennego Portalu</b> (kliknij go), poproś przyjaciela o <b>Serce życia</b> albo znajdź <b>Ołtarz wskrzeszenia</b>.';
    audio.play('death');
  }

  drawClock(env: any) {
    const c = $('.clock canvas', this.root) as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const [d, k] = PHASES[env.se as Season];
    ctx.clearRect(0, 0, 110, 110);
    const seg = (a0: number, a1: number, col: string) => {
      ctx.beginPath(); ctx.moveTo(55, 55); ctx.arc(55, 55, 48, a0 * Math.PI * 2 - Math.PI / 2, a1 * Math.PI * 2 - Math.PI / 2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    seg(0, d, '#e8c050'); seg(d, k, '#b0503a'); seg(k, 1, '#2a3060');
    ctx.lineWidth = 4; ctx.strokeStyle = '#2a1f14'; ctx.beginPath(); ctx.arc(55, 55, 48, 0, Math.PI * 2); ctx.stroke();
    const a = env.frac * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(55, 55); ctx.lineTo(55 + Math.cos(a) * 44, 55 + Math.sin(a) * 44); ctx.stroke();
    ctx.fillStyle = '#2a1f14'; ctx.beginPath(); ctx.arc(55, 55, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4ead0'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Dzień', 55, 50); ctx.font = 'bold 18px sans-serif'; ctx.fillText(String(env.day), 55, 68);
    const w = ({ clear: '', rain: '🌧', storm: '⛈', snow: '🌨' } as any)[env.w] || '';
    const moon = env.moon === 5 ? ' 🌕' : '';
    $('.clock-txt', this.root).innerHTML = `${SEASON_NAMES[env.se as Season]} ${env.sd}/${env.sl} ${w}${moon}${env.ss ? ' 🌪' : ''}`;
    const fc = env.fc;
    $('.forecast', this.root).innerHTML = fc ? `Prognoza: ${({ clear: '☀️ pogodnie', rain: '🌧 deszcz', storm: '⛈ burza', snow: '🌨 śnieg' } as any)[fc.k] || fc.k} za ${Math.ceil(fc.in / 60)} min` : '';
  }

  // ================== Ekwipunek ==================
  buildEquip() {
    const eq = $('.equip', this.root);
    eq.innerHTML = '';
    for (const s of EQ_SLOTS) {
      const d = el('div', 'slot eq', `<span class="ph">${s.icon}</span>`);
      d.dataset.ref = `e:${s.k}`;
      d.title = s.name;
      this.bindSlot(d);
      eq.appendChild(d);
    }
  }

  renderInv() {
    const g = this.game;
    const inv = $('.inv', this.root), inv2 = $('.inv2', this.root);
    inv.innerHTML = ''; inv2.innerHTML = '';
    g.inv.forEach((s: any, i: number) => {
      const d = this.slotEl(s, `i:${i}`);
      if (i < 9) d.appendChild(el('span', 'key', String(i + 1)));
      (i < 15 ? inv : inv2).appendChild(d);
    });
    for (const s of EQ_SLOTS) {
      const d = $(`.equip [data-ref="e:${s.k}"]`, this.root);
      this.fillSlot(d, g.equip[s.k], `<span class="ph">${s.icon}</span>`);
      d.classList.toggle('sel', this.selected === `e:${s.k}`);
    }
    if (this.container) this.renderContainer();
    if (this.craftOpen) this.renderCraft();
    this.renderTracker();
  }

  slotEl(s: any, ref: string) {
    const d = el('div', 'slot');
    d.dataset.ref = ref;
    this.fillSlot(d, s);
    if (this.selected === ref) d.classList.add('sel');
    this.bindSlot(d);
    return d;
  }

  fillSlot(d: HTMLElement, s: any, empty = '') {
    if (!s) { d.innerHTML = empty; d.classList.remove('full'); return; }
    d.classList.add('full');
    const icon = s.id === 'blueprint' ? '📘' : itemIcon(s.id);
    let h = `<span class="icon">${icon}</span>`;
    if (s.n > 1) h += `<span class="n">${s.n}</span>`;
    if (s.d !== undefined) h += `<span class="dur"><i style="width:${Math.max(0, s.d * 100)}%"></i></span>`;
    if (s.f !== undefined) h += `<span class="fresh" style="background:${s.f > 0.5 ? '#5c5' : s.f > 0.2 ? '#dc4' : '#d44'}"></span>`;
    d.innerHTML = h;
  }

  bindSlot(d: HTMLElement) {
    d.onmousedown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const ref = d.dataset.ref!;
      const g = this.game;
      audio.play('click');
      if (e.button === 2) { g.net.send({ t: 'inv', op: 'use', a: ref, alt: e.shiftKey ? 1 : 0 }); this.selected = null; this.renderInv(); return; }
      if (e.ctrlKey) { g.net.send({ t: 'inv', op: 'drop', a: ref, one: e.altKey ? 1 : 0 }); return; }
      if (e.shiftKey && this.container) { g.net.send({ t: 'inv', op: 'quick', a: ref }); return; }
      if (this.selected) {
        if (this.selected !== ref) g.net.send({ t: 'inv', op: 'move', a: this.selected, b: ref });
        this.selected = null;
      } else if (d.classList.contains('full')) this.selected = ref;
      this.renderInv();
    };
    d.onmouseenter = () => this.showItemTip(d);
    d.onmouseleave = () => this.hideTip();
  }

  slotData(ref: string): any {
    const [k, v] = ref.split(':');
    if (k === 'i') return this.game.inv[+v];
    if (k === 'e') return this.game.equip[v];
    if (k === 'c') return this.container?.slots?.[+v];
    return null;
  }

  showItemTip(d: HTMLElement) {
    const s = this.slotData(d.dataset.ref!);
    if (!s) return;
    const def = ITEMS[s.id];
    let h = `<b>${s.id === 'blueprint' ? `Plan: ${esc(itemName(RECIPES[s.m]?.out || '') || STRUCTS[RECIPES[s.m]?.out]?.name || s.m)}` : esc(def?.name || s.id)}</b>`;
    if (def?.desc) h += `<div>${esc(def.desc)}</div>`;
    const st: string[] = [];
    if (def?.food) st.push(`🍗 ${def.food.hunger} ❤️ ${def.food.hp} 🧠 ${def.food.san}`);
    if (def?.dmg && (def.cat === 'weapon' || def.cat === 'tool')) st.push(`⚔ ${def.dmg}`);
    if (def?.armor) st.push(`🛡 ${Math.round(def.armor * 100)}%`);
    if (def?.warmth) st.push(`🔥 ciepło ${def.warmth}`);
    if (def?.cool) st.push(`❄ chłód ${def.cool}`);
    if (def?.water) st.push(`☔ ${Math.round(def.water * 100)}%`);
    if (def?.light) st.push(`💡 światło`);
    if (def?.fuel) st.push(`🔥 paliwo ${def.fuel}s`);
    if (s.d !== undefined) st.push(`trwałość ${Math.round(s.d * 100)}%`);
    if (s.f !== undefined) st.push(`świeżość ${Math.round(s.f * 100)}%`);
    if (st.length) h += `<div class="tip-stats">${st.join(' · ')}</div>`;
    const acts: string[] = [];
    if (def?.slot) acts.push('PPM: załóż');
    else if (def?.food?.cooked && this.game.nearFire()) acts.push('PPM: upiecz (Shift+PPM: zjedz)');
    else if (def?.food) acts.push('PPM: zjedz');
    else if (def?.effect) acts.push('PPM: użyj');
    if (acts.length) h += `<div class="tip-act">${acts.join(' · ')}</div>`;
    this.tip(h, d);
  }

  tip(html: string, anchor: HTMLElement) {
    const t = $('.tooltip', this.root);
    t.innerHTML = html;
    t.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    t.style.left = Math.min(window.innerWidth - 270, Math.max(4, r.left)) + 'px';
    t.style.top = '';
    t.style.bottom = window.innerHeight - r.top + 8 + 'px';
  }
  hideTip() { $('.tooltip', this.root).classList.add('hidden'); }

  // ================== Kontener ==================
  openContainer(c: any) {
    if (!c.id) { this.container = null; $('.container', this.root).classList.add('hidden'); return; }
    this.container = c;
    $('.container', this.root).classList.remove('hidden');
    this.renderContainer();
  }

  renderContainer() {
    const c = this.container;
    const box = $('.container', this.root);
    const def = STRUCTS[c.ty];
    let h = `<div class="cont-title">${def?.icon || ''} ${esc(def?.name || '')}<span class="x">✕</span></div>`;
    const labels: Record<string, string[]> = { furnace: ['Wsad', 'Paliwo', 'Wynik'], generator: ['Paliwo'] };
    h += `<div class="cont-slots ${c.ty}"></div>`;
    const info: string[] = [];
    if (c.fuel !== undefined) info.push(`🔥 Paliwo: ${c.fuel}%`);
    if (c.prog) info.push(`⏳ Postęp: ${c.prog}%`);
    if (def?.power) info.push(c.pw ? '⚡ Zasilanie: TAK' : '⚡ Zasilanie: BRAK');
    if (info.length) h += `<div class="cont-info">${info.join(' · ')}</div>`;
    if (c.ty === 'kitchen') h += `<button class="btn cook">🍲 Gotuj</button><div class="cont-hint">Włóż 4 składniki. Mięso + warzywa = bigos, jajo + warzywa + mięso = pierogi...</div>`;
    if (def?.power) h += `<button class="btn toggle">${c.on === false ? 'Włącz' : 'Wyłącz'}</button>`;
    if (c.ty === 'furnace') h += `<div class="cont-hint">Ruda żelaza/miedzi → sztabka, 2 złota → sztabka złota, 2 piasku → szkło, glina → 2 cegły, kłoda → węgiel.</div>`;
    if (c.ty === 'sawmill') h += `<div class="cont-hint">Włóż kłody – tartak zrobi z nich deski (wymaga zasilania).</div>`;
    box.innerHTML = h;
    const sl = $('.cont-slots', box);
    (c.slots || []).forEach((s: any, i: number) => {
      const d = this.slotEl(s, `c:${i}`);
      if (labels[c.ty]?.[i]) d.appendChild(el('span', 'lbl', labels[c.ty][i]));
      sl.appendChild(d);
    });
    $('.x', box).onclick = () => { this.game.net.send({ t: 'cont', op: 'close' }); this.openContainer({ id: 0 }); };
    const cook = box.querySelector('.cook') as HTMLElement;
    if (cook) cook.onclick = () => this.game.net.send({ t: 'cont', op: 'cook' });
    const tg = box.querySelector('.toggle') as HTMLElement;
    if (tg) tg.onclick = () => this.game.net.send({ t: 'cont', op: 'toggle' });
  }

  // ================== Crafting ==================
  buildCraftTabs() {
    const tabs = $('.craft-tabs', this.root);
    tabs.innerHTML = '';
    for (const c of CATS) {
      const b = el('div', 'ctab', c.icon);
      b.title = c.name;
      b.dataset.cat = c.id;
      b.onmousedown = (e) => {
        e.stopPropagation();
        if (this.craftOpen && this.craftTab === c.id) this.toggleCraft(false);
        else { this.craftTab = c.id; this.detailRecipe = null; this.toggleCraft(true); }
      };
      tabs.appendChild(b);
    }
  }

  toggleCraft(open?: boolean) {
    this.craftOpen = open ?? !this.craftOpen;
    $('.craft-panel', this.root).classList.toggle('hidden', !this.craftOpen);
    if (this.craftOpen) this.renderCraft();
    for (const t of this.root.querySelectorAll('.ctab')) t.classList.toggle('on', this.craftOpen && (t as HTMLElement).dataset.cat === this.craftTab);
  }

  renderCraft() {
    const g = this.game;
    const cat = CATS.find((c) => c.id === this.craftTab)!;
    $('.craft-head', this.root).innerHTML = `${cat.icon} ${cat.name}<span class="x">✕</span>`;
    ($('.craft-head .x', this.root) as HTMLElement).onclick = () => this.toggleCraft(false);
    const list = $('.craft-list', this.root);
    list.innerHTML = '';
    const recipes = Object.values(RECIPES).filter((r) => r.cat === this.craftTab && (!r.char || r.char === g.char));
    const best = new Map<string, { r: Recipe; st: string; can: boolean }>();
    const rank = (x: { st: string; can: boolean }) => (x.can ? 3 : x.st === 'ok' ? 2 : x.st === 'station' ? 1 : 0);
    const rows: { r: Recipe; st: string; can: boolean }[] = [];
    for (const r of recipes) {
      const st = g.recipeStatus(r);
      if (st === 'hidden') continue;
      const row = { r, st, can: st === 'ok' && g.canAfford(r) };
      const prev = best.get(r.out);
      if (!prev) { best.set(r.out, row); rows.push(row); }
      else if (rank(row) > rank(prev)) { rows[rows.indexOf(prev)] = row; best.set(r.out, row); }
    }
    rows.sort((a, b) => (b.can ? 2 : b.st === 'ok' ? 1 : 0) - (a.can ? 2 : a.st === 'ok' ? 1 : 0));
    for (const { r, st, can } of rows) {
      const out = ITEMS[r.out] || STRUCTS[r.out];
      const d = el('div', 'recipe ' + (can ? 'can' : st === 'ok' ? 'miss' : 'lock'));
      const stockN = g.stock[r.out] || 0;
      d.innerHTML = `<span class="icon">${out?.icon || '❔'}</span><span class="rn">${esc(out?.name || r.out)}${(r.n || 1) > 1 ? ` ×${r.n}` : ''}${stockN && r.place ? ` <i>(zapas ${stockN})</i>` : ''}</span>${st === 'station' ? `<span class="st">${recipeStations(r).map((s) => STATIONS[s]?.icon || '?').join('')}</span>` : st === 'blueprint' ? '<span class="st">📘</span>' : ''}`;
      d.onmousedown = (e) => { e.stopPropagation(); this.detailRecipe = r.id; this.renderCraft(); };
      if (this.detailRecipe === r.id) d.classList.add('sel');
      list.appendChild(d);
    }
    const det = $('.craft-detail', this.root);
    const r = this.detailRecipe ? RECIPES[this.detailRecipe] : null;
    if (!r) { det.innerHTML = '<div class="cd-empty">Wybierz przedmiot z listy.<br><br>Nowe receptury odblokowujesz, stojąc przy stołach rzemieślniczych (🛠️ ⚒️ 🍲 🧵 ⚗️ 🗺️ 🔧 🕯️). Raz wykonana receptura zostaje zapamiętana.</div>'; return; }
    const out: any = ITEMS[r.out] || STRUCTS[r.out];
    const st = g.recipeStatus(r);
    const cost = g.recipeCost(r);
    const stockN = r.place ? g.stock[r.out] || 0 : 0;
    let h = `<div class="cd-title"><span class="icon">${out.icon}</span> ${esc(out.name)}</div>`;
    if (out.desc) h += `<div class="cd-desc">${esc(out.desc)}</div>`;
    else if (ITEMS[r.out]) {
      const d = ITEMS[r.out];
      const s: string[] = [];
      if (d.dmg) s.push(`Obrażenia ${d.dmg}`); if (d.armor) s.push(`Pancerz ${Math.round(d.armor * 100)}%`); if (d.warmth) s.push(`Ciepło ${d.warmth}`); if (d.food) s.push(`Głód +${d.food.hunger}`);
      if (s.length) h += `<div class="cd-desc">${s.join(' · ')}</div>`;
    }
    h += '<div class="cd-ing">' + (stockN ? `<div class="have">Masz zapas: ${stockN} – postawienie za darmo</div>` : cost.map(([id, n]) => {
      const have = g.count(id);
      return `<div class="${have >= n ? 'have' : 'need'}">${itemIcon(id)} ${esc(itemName(id))} <b>${have}/${n}</b></div>`;
    }).join('')) + '</div>';
    if (st === 'station') h += `<div class="cd-lock">Wymaga: ${recipeStations(r).map((s) => `${STATIONS[s]?.icon} ${STATIONS[s]?.name}`).join(' + ')}${r.lvl && r.lvl > 1 ? ` (poziom ${r.lvl})` : ''}</div>`;
    if (st === 'blueprint') h += `<div class="cd-lock">Wymaga planu konstrukcyjnego (📘) – zdobądź go z questów, skrzyń lub bossów.</div>`;
    if (g.wolf) h += `<div class="cd-lock">Jako wilk nie możesz craftować.</div>`;
    const can = st === 'ok' && (stockN > 0 || g.canAfford(r));
    h += `<button class="btn craft-btn" ${can ? '' : 'disabled'}>${r.place ? '🔨 Postaw' : '✨ Wytwórz'}</button>`;
    det.innerHTML = h;
    ($('.craft-btn', det) as HTMLButtonElement).onclick = () => {
      if (r.place) { this.game.startBuild(r); this.toggleCraft(false); }
      else { this.game.net.send({ t: 'craft', r: r.id }); audio.play('craft'); }
    };
  }

  // ================== Questy ==================
  setQuests(q: any) {
    this.quests = q;
    this.renderTracker();
    if (this.modal === 'journal') this.openJournal();
  }

  renderTracker() {
    const tr = $('.tracker', this.root);
    const list = (this.quests.list || []).filter((q: any) => !q.done && q.tr);
    let h = '';
    for (const q of list.slice(0, 4)) {
      h += `<div class="tq ${q.world ? 'world' : ''}"><div class="tq-t">${q.world ? '🌍 ' : ''}${esc(q.title)}</div>`;
      for (const g of q.goals) h += `<div class="tq-g ${g.c >= g.n ? 'ok' : ''}">${g.c >= g.n ? '✔' : '•'} ${esc(g.l)} <b>${Math.min(g.c, g.n)}/${g.n}</b></div>`;
      h += '</div>';
    }
    const daily = (this.quests.daily || []).filter((t: any) => !t.done);
    if (daily.length) h += `<div class="tq daily"><div class="tq-t">📋 Zlecenia dnia</div>${daily.map((t: any) => `<div class="tq-g">• ${esc(t.l)} <b>${t.c}/${t.n}</b></div>`).join('')}</div>`;
    h += '<div class="tq-hint">J – dziennik questów</div>';
    tr.innerHTML = h;
  }

  openJournal() {
    this.modal = 'journal';
    const tabs = [['active', 'Aktywne'], ['world', 'Świat'], ['done', 'Ukończone'], ['daily', 'Zlecenia']];
    let h = `<h2>📜 Dziennik questów</h2><div class="tabs">${tabs.map(([k, n]) => `<span data-t="${k}" class="${this.journalTab === k ? 'on' : ''}">${n}</span>`).join('')}</div><div class="jlist">`;
    const list = this.quests.list || [];
    let items: any[] = [];
    if (this.journalTab === 'active') items = list.filter((q: any) => !q.done && !q.world);
    if (this.journalTab === 'world') items = list.filter((q: any) => q.world);
    if (this.journalTab === 'done') items = list.filter((q: any) => q.done && !q.world);
    if (this.journalTab === 'daily') {
      const d = this.quests.daily || [];
      h += d.length ? d.map((t: any) => `<div class="jq ${t.done ? 'done' : ''}"><b>${esc(t.l)}</b> – ${t.c}/${t.n} ${t.done ? '✔' : ''}<div class="jr">Nagroda: ${t.rw.map(([i, n]: any) => `${itemIcon(i)}×${n}`).join(' ')}</div></div>`).join('') : '<p>Zbuduj <b>📋 Tablicę ogłoszeń</b> (Warsztat), aby codziennie dostawać zlecenia.</p>';
    }
    const typeName: Record<string, string> = { tutorial: 'Samouczek', story: 'Fabuła', char: 'Postać', npc: 'Wioska', explore: 'Odkrywanie', server: 'Cel serwera', daily: 'Zlecenie' };
    for (const q of items) {
      h += `<div class="jq ${q.done ? 'done' : ''}"><div class="jq-h"><b>${esc(q.title)}</b> <span class="jtype">${typeName[q.type] || q.type}</span>${!q.world && !q.done ? `<span class="jtrack" data-q="${q.id}">${q.tr ? '📌 Śledzone' : 'Śledź'}</span>` : ''}</div><div class="jd">${esc(q.desc)}</div>`;
      for (const g of q.goals) h += `<div class="tq-g ${g.c >= g.n ? 'ok' : ''}">${g.c >= g.n ? '✔' : '•'} ${esc(g.l)} <b>${Math.min(g.c, g.n)}/${g.n}</b></div>`;
      if (q.giver && !q.done) h += `<div class="jr">Oddaj u: Wódz Chrumcio (wioska)</div>`;
      h += '</div>';
    }
    if (!items.length && this.journalTab !== 'daily') h += '<p>Brak questów w tej kategorii.</p>';
    h += '</div>';
    this.showModal(h);
    for (const t of this.root.querySelectorAll('.modal .tabs span')) (t as HTMLElement).onclick = () => { this.journalTab = (t as HTMLElement).dataset.t!; this.openJournal(); };
    for (const t of this.root.querySelectorAll('.jtrack')) (t as HTMLElement).onclick = () => this.game.net.send({ t: 'track', q: (t as HTMLElement).dataset.q });
  }

  // ================== Dialogi ==================
  openDialog(d: any) {
    let h = `<h2>${esc(d.title)}</h2><p class="dtext">${esc(d.text || '')}</p>`;
    if (d.kind === 'npc') {
      for (const q of d.active || []) h += `<div class="dq">${q.ready ? '✅' : '⏳'} <b>${esc(q.title)}</b> ${q.ready ? `<button class="btn" data-turn="${q.id}">Oddaj</button>` : '<i>w toku</i>'}</div>`;
      for (const q of d.offer || []) h += `<div class="dq">❗ <b>${esc(q.title)}</b><div class="jd">${esc(q.desc)}</div><button class="btn" data-acc="${q.id}">Przyjmij zadanie</button></div>`;
      if (!(d.active || []).length && !(d.offer || []).length) h += '<p><i>Wódz nie ma teraz dla ciebie zadań.</i></p>';
    }
    if (d.kind === 'portal' && d.tower) {
      h += '<h3>🏗 Wieża sygnałowa (cel całego serwera)</h3>';
      for (const g of d.tower) h += `<div class="dq">${itemIcon(g.t)} ${esc(g.l)}: <b>${g.c}/${g.n}</b> (masz ${g.have}) ${g.c < g.n && g.have > 0 ? `<button class="btn" data-contr="${g.t}">Oddaj</button>` : ''}</div>`;
    }
    if (d.kind === 'circle') for (const c of d.dest || []) h += `<button class="btn" data-tp="${c.id}">🔮 ${esc(c.name)} – ${esc(BIOME_NAMES[c.biome] || c.biome)}</button> `;
    if (d.kind === 'board') for (const t of d.tasks || []) h += `<div class="dq">${t.done ? '✅' : '📌'} ${esc(t.l)} <b>${t.c}/${t.n}</b> – nagroda: ${t.rw.map(([i, n]: any) => `${itemIcon(i)}×${n}`).join(' ')}</div>`;
    if (d.kind === 'note') h = `<h2>${esc(d.title)}</h2><p class="note">${esc(d.text)}</p>`;
    h += '<div class="dclose"><button class="btn">Zamknij</button></div>';
    this.showModal(h);
    this.modal = 'dialog';
    const m = $('.modal', this.root);
    for (const b of m.querySelectorAll('[data-acc]')) (b as HTMLElement).onclick = () => { this.game.net.send({ t: 'q', op: 'accept', q: (b as HTMLElement).dataset.acc }); this.closeModal(); };
    for (const b of m.querySelectorAll('[data-turn]')) (b as HTMLElement).onclick = () => { this.game.net.send({ t: 'q', op: 'turnin', q: (b as HTMLElement).dataset.turn }); this.closeModal(); };
    for (const b of m.querySelectorAll('[data-contr]')) (b as HTMLElement).onclick = () => { this.game.net.send({ t: 'q', op: 'contribute', q: 'srv_tower', item: (b as HTMLElement).dataset.contr }); this.closeModal(); };
    for (const b of m.querySelectorAll('[data-tp]')) (b as HTMLElement).onclick = () => { this.game.net.send({ t: 'tp', from: d.from, to: +(b as HTMLElement).dataset.tp! }); this.closeModal(); };
    ($('.dclose .btn', m) as HTMLElement).onclick = () => this.closeModal();
  }

  showModal(html: string) {
    $('.modal', this.root).innerHTML = html;
    $('.modal-bg', this.root).classList.remove('hidden');
  }
  closeModal() {
    this.modal = null;
    $('.modal-bg', this.root).classList.add('hidden');
    this.game.mapOpen = false;
  }

  openHelp() {
    this.modal = 'help';
    const cd = CHAR[this.game.char];
    this.showModal(`<h2>❓ Jak grać</h2>
      <div class="help-grid">
      <div><h3>Sterowanie</h3>
      <p><b>WASD</b> – ruch · <b>LPM</b> na obiekcie – podejdź i użyj (zetnij, zbierz, atakuj) · <b>LPM</b> na ziemi – idź tam</p>
      <p><b>Spacja</b> – zbierz/podnieś najbliższą rzecz · <b>F</b> – atakuj najbliższego wroga · <b>Shift+LPM</b> – wymuś atak / akcja alternatywna</p>
      <p><b>Q / E</b> – obrót kamery · <b>kółko</b> – zoom · <b>1–9</b> – użyj slotu · <b>C</b> – crafting · <b>M</b> – mapa · <b>J</b> – questy · <b>Tab</b> – gracze · <b>Enter</b> – czat · <b>B</b> – emotki (1–4) · <b>klik kółkiem</b> – ping na mapie · <b>Esc</b> – ustawienia</p>
      <h3>Przetrwanie</h3>
      <p>❤️ Zdrowie, 🍗 głód i 🧠 poczytalność nie mogą spaść do zera. <b>Nigdy nie stój w ciemności</b> – w nocy miej ognisko lub pochodnię. Zimą ogrzewaj się, latem chłodź. Jedzenie się psuje.</p>
      <p>Stoły rzemieślnicze odblokowują nowe receptury, gdy stoisz obok nich. Warsztat → Kuźnia → Pracownia/Kartograf/Mechanik → Ołtarz Cienia → Starożytny Rdzeń.</p>
      <p>Po śmierci stajesz się duchem – dotknij Kamiennego Portalu, aby wrócić.</p></div>
      <div><h3>Twoja postać: ${esc(cd.name)}</h3><p>${esc(cd.desc)}</p><p>✅ ${esc(cd.perk)}<br>⚠️ ${esc(cd.flaw)}</p>
      <h3>Wskazówki</h3><ul><li>Pierwszego dnia zbierz gałązki, trawę i krzemień, zrób siekierę i ognisko.</li><li>Wódz Chrumcio w wiosce ma zadania i nagrody.</li><li>Co kilka dni nadciągają ogary – broń się w grupie.</li><li>Kręgi kamienne + Stół Kartografa = szybka podróż.</li></ul></div></div>
      <div class="dclose"><button class="btn">Zamknij</button></div>`);
    ($('.modal .dclose .btn', this.root) as HTMLElement).onclick = () => this.closeModal();
  }

  openSettings() {
    this.modal = 'settings';
    const s = this.game.settings;
    this.showModal(`<h2>⚙️ Ustawienia</h2>
      <label>Głośność <input type="range" min="0" max="1" step="0.05" value="${s.vol}" data-k="vol"></label>
      <label>Muzyka <input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></label>
      <label>Jakość grafiki <select data-k="quality"><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Niska (bez cieni)</option><option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Średnia</option><option value="high" ${s.quality === 'high' ? 'selected' : ''}>Wysoka</option></select></label>
      <label>Zasięg widzenia <input type="range" min="3" max="6" step="1" value="${s.view}" data-k="view"></label>
      <label><input type="checkbox" data-k="fps" ${s.fps ? 'checked' : ''}> Pokaż panel debug (F3)</label>
      <p class="small">Świat: <b>${esc(this.game.worldInfo.name)}</b> · kod zaproszenia: <b class="code">${esc(this.game.worldInfo.id)}</b> (podaj go znajomym)</p>
      <div class="dclose"><button class="btn quit">Wyjdź do menu</button> <button class="btn ok">Zamknij</button></div>`);
    for (const inp of this.root.querySelectorAll('.modal [data-k]')) {
      inp.addEventListener('input', () => {
        const k = (inp as HTMLInputElement).dataset.k!;
        const v = (inp as HTMLInputElement).type === 'checkbox' ? (inp as HTMLInputElement).checked : (inp as HTMLInputElement).value;
        (s as any)[k] = typeof v === 'string' && k !== 'quality' ? +v : v;
        this.game.applySettings();
      });
    }
    ($('.modal .ok', this.root) as HTMLElement).onclick = () => this.closeModal();
    ($('.modal .quit', this.root) as HTMLElement).onclick = () => location.reload();
  }

  openEmotes() {
    this.modal = 'emotes';
    this.showModal(`<h2>Emotki</h2><div class="emotes">${['👋 Pomachaj', '💃 Taniec', '🪑 Usiądź', '🙌 Hura'].map((e, i) => `<button class="btn" data-e="${i + 1}">${i + 1}. ${e}</button>`).join(' ')}</div>`);
    for (const b of this.root.querySelectorAll('[data-e]')) (b as HTMLElement).onclick = () => { this.game.net.send({ t: 'emote', e: +(b as HTMLElement).dataset.e! }); this.closeModal(); };
  }

  showVictory() {
    this.showModal(`<h2>🌀 Zwycięstwo!</h2><p>Strażnik Rdzenia pokonany, Portal Ucieczki otwarty. Wasza drużyna uciekła z Wiecznomroku!</p><p>Możecie grać dalej w tym świecie – a może spróbować w trybie Hardcore?</p><div class="dclose"><button class="btn">Super!</button></div>`);
    this.modal = 'victory';
    ($('.modal .dclose .btn', this.root) as HTMLElement).onclick = () => this.closeModal();
    audio.play('quest');
  }

  // ================== Lista graczy ==================
  showPlayers(show: boolean) {
    const pl = $('.plist', this.root);
    pl.classList.toggle('hidden', !show);
    if (!show) return;
    const rows = [...this.game.entities.views.values()].filter((v) => v.kind === 0);
    pl.innerHTML = `<h3>Gracze w pobliżu (${rows.length})</h3>` + rows.map((v) => `<div>${v.flags & 1 ? '👻' : '🙂'} <b>${esc(v.name || '')}</b> – ${esc(CHAR[v.type]?.name || '')} ${v.id === this.game.myId ? '(ty)' : `❤️ ${v.hp}%`}</div>`).join('') + `<p class="small">Kod świata: <b>${esc(this.game.worldInfo.id)}</b></p>`;
  }

  // ================== Czat i komunikaty ==================
  toggleChat(open?: boolean) {
    this.chatOpen = open ?? !this.chatOpen;
    const ci = $('.chat-in', this.root) as HTMLInputElement;
    ci.classList.toggle('hidden', !this.chatOpen);
    if (this.chatOpen) ci.focus(); else ci.blur();
  }
  chat(name: string | null, text: string, cls = '') {
    const log = $('.chat-log', this.root);
    const line = el('div', 'cl ' + cls, name ? `<b>${esc(name)}:</b> ${esc(text)}` : esc(text));
    log.appendChild(line);
    while (log.children.length > 40) log.removeChild(log.firstChild!);
    log.scrollTop = log.scrollHeight;
    setTimeout(() => line.classList.add('old'), 15000);
  }
  toast(text: string, kind = 'info') {
    const box = $('.toasts', this.root);
    const last = box.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text) { last.dataset.n = String(+(last.dataset.n || 1) + 1); clearTimeout(+last.dataset.tm!); last.dataset.tm = String(setTimeout(() => last.remove(), 3500)); return; }
    const t = el('div', 'toast ' + kind, esc(text));
    t.dataset.text = text;
    box.appendChild(t);
    while (box.children.length > 5) box.removeChild(box.firstChild!);
    t.dataset.tm = String(setTimeout(() => t.remove(), 3500));
    if (kind === 'danger') audio.play('warn');
  }
  bigMessage(title: string, sub: string) {
    const b = el('div', 'big-msg', `<div>${esc(title)}</div><small>${esc(sub)}</small>`);
    this.root.appendChild(b);
    setTimeout(() => b.remove(), 4500);
  }

  setBoss(b: any) {
    const bar = $('.boss-bar', this.root);
    if (!b || b.hp <= 0) { bar.classList.add('hidden'); this.boss = null; return; }
    this.boss = { n: b.n, hp: b.hp, t: performance.now() };
    bar.classList.remove('hidden');
    $('.boss-name', bar).textContent = b.n;
    ($('.boss-hp div', bar) as HTMLElement).style.width = b.hp + '%';
  }

  hover(text: string | null, x = 0, y = 0) {
    const h = $('.hover-label', this.root);
    if (!text) { h.classList.add('hidden'); return; }
    h.classList.remove('hidden');
    h.innerHTML = text;
    h.style.left = x + 16 + 'px';
    h.style.top = y + 12 + 'px';
  }
  buildHint(text: string | null) {
    const h = $('.build-hint', this.root);
    h.classList.toggle('hidden', !text);
    if (text) h.innerHTML = text;
  }
  debug(text: string) {
    let d = this.root.querySelector('.debug') as HTMLElement;
    if (!d) { d = el('div', 'debug'); this.root.appendChild(d); }
    d.textContent = text;
    d.style.display = text ? 'block' : 'none';
  }

  // ================== Mapa ==================
  buildMapBase() {
    const g = this.game.gen;
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    const col: Record<string, number[]> = { ocean: [40, 80, 120], beach: [226, 207, 148], grass: [127, 178, 74], forest: [55, 110, 52], swamp: [74, 90, 58], rocky: [138, 132, 120], savanna: [200, 180, 90], desert: [228, 200, 128], mushroom: [100, 80, 130], ruins: [110, 104, 94] };
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N * g.size, z = (j + 0.5) / N * g.size;
        const h = g.height(x, z);
        const b = g.biome(x, z);
        const cc = col[b] || [255, 0, 255];
        const k = b === 'ocean' ? Math.max(0.6, 1 + h / 30) : 0.85 + Math.min(0.3, h / 40);
        const o = (j * N + i) * 4;
        img.data[o] = cc[0] * k; img.data[o + 1] = cc[1] * k; img.data[o + 2] = cc[2] * k; img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    this.mapBase = c;
  }

  drawMap(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cz: number, scale: number, full: boolean) {
    const g = this.game;
    const size = g.gen.size;
    if (!this.mapBase) return;
    ctx.fillStyle = '#16202a';
    ctx.fillRect(0, 0, W, H);
    const toS = (x: number, z: number) => [W / 2 + (x - cx) * scale, H / 2 + (z - cz) * scale];
    const [ox, oz] = toS(0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapBase, ox, oz, size * scale, size * scale);
    // mgła wojny
    const cells = Math.ceil(size / 16);
    const cs = 16 * scale;
    ctx.fillStyle = '#0d141c';
    const i0 = Math.max(0, Math.floor((cx - W / 2 / scale) / 16)), i1 = Math.min(cells - 1, Math.ceil((cx + W / 2 / scale) / 16));
    const j0 = Math.max(0, Math.floor((cz - H / 2 / scale) / 16)), j1 = Math.min(cells - 1, Math.ceil((cz + H / 2 / scale) / 16));
    if (!g.mapAll) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const idx = j * cells + i;
      if (!(g.mapBits[idx >> 3] & (1 << (idx & 7)))) { const [sx, sy] = toS(i * 16, j * 16); ctx.fillRect(sx - 0.5, sy - 0.5, cs + 1, cs + 1); }
    }
    const known = (x: number, z: number) => {
      if (g.mapAll) return true;
      const i = Math.floor(x / 16), j = Math.floor(z / 16);
      const idx = j * cells + i;
      return !!(g.mapBits[idx >> 3] & (1 << (idx & 7)));
    };
    // POI
    const poiIcons: Record<string, string> = { portal: '🌀', village_fire: '🏘', ancient_core: '💠', stone_circle: '🔮', shrine: '⛩', queen_nest: '🕷', storm_nest: '🌩', titan_lair: '🏜', mole_mound: '⛰', wreck: '⚓' };
    ctx.font = `${full ? 18 : 13}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of g.gen.pois) {
      const ic = poiIcons[p.type];
      if (!ic || !known(p.x, p.z)) continue;
      const [sx, sy] = toS(p.x, p.z);
      if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
      if (p.type === 'stone_circle' && g.flags.circles.includes(p.id)) { ctx.fillStyle = 'rgba(160,80,255,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, full ? 12 : 8, 0, 7); ctx.fill(); }
      ctx.fillText(ic, sx, sy);
    }
    // budowle (bazy)
    ctx.fillStyle = '#f0d080';
    for (const s of g.entities.structs.values()) {
      if (STRUCTS[s.type]?.floor) continue;
      const [sx, sy] = toS(s.data.x, s.data.z);
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
    // gracze
    for (const v of g.entities.views.values()) {
      if (v.kind === 1 && full && MOBS[v.type]?.boss) { const [sx, sy] = toS(v.x, v.z); ctx.fillText('💀', sx, sy); }
      if (v.kind !== 0 || v.id === g.myId) continue;
      const [sx, sy] = toS(v.x, v.z);
      ctx.fillStyle = '#40c0ff'; ctx.beginPath(); ctx.arc(sx, sy, full ? 6 : 4, 0, 7); ctx.fill();
      if (full) { ctx.fillStyle = '#fff'; ctx.fillText(v.name || '', sx, sy - 14); }
    }
    // pingi
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.t < 10000);
    for (const p of this.pings) {
      const [sx, sy] = toS(p.x, p.z);
      ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 6 + ((now - p.t) / 100) % 10, 0, 7); ctx.stroke();
    }
    // ja
    const [mx, my] = toS(g.me.x, g.me.z);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(-g.me.r + Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawMinimap() {
    const ctx = this.mini.getContext('2d')!;
    const g = this.game;
    ctx.save();
    ctx.beginPath(); ctx.arc(90, 90, 88, 0, 7); ctx.clip();
    this.drawMap(ctx, 180, 180, g.me.x, g.me.z, 0.9, false);
    ctx.restore();
    $('.mm-info', this.root).textContent = `${BIOME_NAMES[g.gen.biome(g.me.x, g.me.z)] || ''}`;
    if (this.game.mapOpen) this.drawBigMap();
  }

  openMap() {
    this.modal = 'map';
    this.game.mapOpen = true;
    this.showModal(`<h2>🗺 Mapa wyspy</h2><canvas class="bigmap" width="720" height="560"></canvas><p class="small">Klik – postaw ping widoczny dla drużyny. ${this.game.flags.maptable ? '🗺 Mapy drużyny są połączone.' : 'Zbuduj Stół Kartografa, aby dzielić mapę z drużyną.'}</p>`);
    this.mapCanvas = $('.bigmap', this.root) as HTMLCanvasElement;
    this.mapCanvas.onclick = (e) => {
      const r = this.mapCanvas.getBoundingClientRect();
      const scale = this.bigScale();
      const k = 720 / r.width;
      const x = this.game.gen.size / 2 + ((e.clientX - r.left) * k - 360) / scale, z = this.game.gen.size / 2 + ((e.clientY - r.top) * k - 280) / scale;
      this.game.net.send({ t: 'ping', x, z });
    };
    this.drawBigMap();
  }
  bigScale() { return (Math.min(720, 560) / this.game.gen.size) * 0.95; }
  drawBigMap() {
    if (!this.mapCanvas) return;
    const ctx = this.mapCanvas.getContext('2d')!;
    this.drawMap(ctx, 720, 560, this.game.gen.size / 2, this.game.gen.size / 2, this.bigScale(), true);
  }
}
