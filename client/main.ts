// Menu główne: konto, lista światów, tworzenie świata, wybór postaci.
import * as THREE from 'three';
import { CHARACTERS, CHAR } from '../shared/data/characters';
import { makeCharacter, SKIN_TINTS } from './models';
import { Net } from './net';
import { Game } from './game';
import { audio } from './audio';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const state = {
  token: localStorage.getItem('wm_token') || '',
  user: localStorage.getItem('wm_user') || '',
  guestId: localStorage.getItem('wm_guest') || '',
  guestName: localStorage.getItem('wm_gname') || '',
  ach: JSON.parse(localStorage.getItem('wm_ach') || '[]') as string[],
  world: '' as string,
  worldLocked: false,
  char: localStorage.getItem('wm_char') || 'bruno',
  skin: 0,
};
if (!state.guestId) {
  state.guestId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('wm_guest', state.guestId);
}
if (!state.guestName) state.guestName = 'Rozbitek' + Math.floor(Math.random() * 900 + 100);

async function api(path: string, method = 'GET', body?: any) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Błąd');
  return j;
}

const SEASON: Record<string, string> = { autumn: 'Jesień', winter: 'Zima', spring: 'Wiosna', summer: 'Lato' };
const DIFF: Record<string, string> = { relax: 'Relaks', normal: 'Normalny', hardcore: 'Hardcore' };
const SIZE: Record<string, string> = { small: 'Mała', medium: 'Średnia', large: 'Duża' };

function render() {
  const lobby = $('#lobby');
  lobby.innerHTML = `
    <div class="title"><h1>Wiecznomrok</h1><p>Kooperacyjny survival 3D · przetrwaj razem z przyjaciółmi</p></div>
    <div class="lobby-grid">
      <section class="panel account">
        <h2>👤 Gracz</h2>
        ${state.token ? `<p>Zalogowano jako <b>${esc(state.user)}</b></p><p class="small">Postęp i osiągnięcia zapisują się na koncie.</p><button class="btn ghost" id="logout">Wyloguj</button>` : `
          <label>Nick gościa<input id="gname" maxlength="16" value="${esc(state.guestName)}"></label>
          <p class="small">Grasz jako gość (postęp zapisuje się w tej przeglądarce). Albo załóż konto:</p>
          <label>Nick<input id="lname" maxlength="16" autocomplete="username"></label>
          <label>Hasło<input id="lpass" type="password" autocomplete="current-password"></label>
          <div class="row"><button class="btn" id="login">Zaloguj</button><button class="btn ghost" id="register">Załóż konto</button></div>
          <p class="err" id="aerr"></p>`}
        <h2>🏆 Osiągnięcia</h2>
        <div class="ach">${['days10', 'days50', 'days100', 'boss1', 'allstations'].map((a) => `<span class="${state.ach.includes(a) ? 'on' : ''}" title="${({ days10: 'Przetrwaj 10 dni', days50: 'Przetrwaj 50 dni', days100: 'Przetrwaj 100 dni', boss1: 'Pokonaj bossa', allstations: 'Zbuduj wszystkie stoły' } as any)[a]}">${({ days10: '🌙', days50: '🌗', days100: '🌕', boss1: '💀', allstations: '🛠️' } as any)[a]}</span>`).join('')}</div>
      </section>
      <section class="panel worlds">
        <h2>🌍 Światy <button class="btn small ghost" id="refresh">↻</button></h2>
        <div class="row"><input id="code" placeholder="Kod zaproszenia (np. AB12CD)" maxlength="6"><button class="btn" id="joincode">Dołącz</button></div>
        <div class="wlist" id="wlist"><p>Ładowanie...</p></div>
        <button class="btn big" id="create">➕ Stwórz nowy świat</button>
      </section>
    </div>
    <p class="foot">Inspiracja: gry survivalowe w klimacie mrocznej baśni. Wszystkie postacie, nazwy i modele są oryginalne.</p>`;
  const bind = (id: string, fn: () => void) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
  bind('logout', () => { state.token = ''; state.user = ''; localStorage.removeItem('wm_token'); localStorage.removeItem('wm_user'); render(); });
  const doAuth = async (path: string) => {
    try {
      const r = await api(path, 'POST', { name: ($('#lname') as HTMLInputElement).value, pass: ($('#lpass') as HTMLInputElement).value });
      state.token = r.token; state.user = r.name;
      localStorage.setItem('wm_token', r.token); localStorage.setItem('wm_user', r.name);
      if (r.meta?.ach) { state.ach = [...new Set([...state.ach, ...r.meta.ach])]; localStorage.setItem('wm_ach', JSON.stringify(state.ach)); }
      render();
    } catch (e: any) { $('#aerr').textContent = e.message; }
  };
  bind('login', () => doAuth('/api/login'));
  bind('register', () => doAuth('/api/register'));
  const gn = document.getElementById('gname') as HTMLInputElement | null;
  if (gn) gn.oninput = () => { state.guestName = gn.value; localStorage.setItem('wm_gname', gn.value); };
  bind('refresh', loadWorlds);
  bind('create', openCreate);
  bind('joincode', () => { const c = ($('#code') as HTMLInputElement).value.trim().toUpperCase(); if (c) { state.world = c; state.worldLocked = false; openChars(); } });
  loadWorlds();
}

async function loadWorlds() {
  const box = $('#wlist');
  try {
    const list = await api('/api/worlds');
    if (!list.length) { box.innerHTML = '<p>Brak światów – stwórz pierwszy!</p>'; return; }
    box.innerHTML = `<table><tr><th>Nazwa</th><th>Kod</th><th>Gracze</th><th>Dzień</th><th>Ustawienia</th><th></th></tr>${list.map((w: any) => `
      <tr><td><b>${esc(w.name)}</b>${w.locked ? ' 🔒' : ''}</td><td class="code">${esc(w.id)}</td><td>${w.online}/${w.maxPlayers}</td><td>${w.day}${w.season ? ` · ${SEASON[w.season]}` : ''}</td>
      <td class="small">${SIZE[w.sizeName] || ''} · ${DIFF[w.difficulty] || ''}${w.pvp ? ' · PvP' : ''}</td>
      <td><button class="btn small" data-w="${esc(w.id)}" data-l="${w.locked ? 1 : 0}">Graj</button></td></tr>`).join('')}</table>`;
    for (const b of box.querySelectorAll('[data-w]')) (b as HTMLElement).onclick = () => { state.world = (b as HTMLElement).dataset.w!; state.worldLocked = (b as HTMLElement).dataset.l === '1'; openChars(); };
  } catch (e: any) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function modal(html: string) {
  const m = $('#lmodal');
  m.innerHTML = `<div class="lm">${html}</div>`;
  m.classList.remove('hidden');
  m.onmousedown = (e) => { if (e.target === m) m.classList.add('hidden'); };
  return m;
}

function openCreate() {
  const m = modal(`<h2>➕ Nowy świat</h2>
    <div class="form">
      <label>Nazwa świata<input id="cw_name" maxlength="16" value="Wyspa ${esc(state.token ? state.user : state.guestName)}"></label>
      <label>Rozmiar mapy<select id="cw_size"><option value="small">Mała – 768 m (1–3 graczy)</option><option value="medium" selected>Średnia – 1536 m (2–6 graczy)</option><option value="large">Duża – 2560 m (4–8 graczy)</option></select></label>
      <label>Trudność<select id="cw_diff"><option value="relax">Relaks – łagodne kary</option><option value="normal" selected>Normalny</option><option value="hardcore">Hardcore – śmierć = start od zera</option></select></label>
      <label>Długość dnia<select id="cw_day"><option value="240">4 min (szybko)</option><option value="480" selected>8 min (standard)</option><option value="720">12 min (wolno)</option></select></label>
      <label>Długość pory roku (dni)<input id="cw_season" type="number" min="2" max="30" value="12"></label>
      <label>Maks. graczy<input id="cw_max" type="number" min="1" max="8" value="6"></label>
      <label>Ilość zasobów<select id="cw_res"><option value="0.6">Mało</option><option value="1" selected>Normalnie</option><option value="1.4">Dużo</option></select></label>
      <label>Potwory<select id="cw_mon"><option value="0.5">Mało</option><option value="1" selected>Normalnie</option><option value="1.6">Dużo</option></select></label>
      <label>Najazdy ogarów<select id="cw_raid"><option value="0">Wyłączone</option><option value="0.6">Rzadko</option><option value="1" selected>Normalnie</option><option value="1.6">Często</option></select></label>
      <label>Hasło (opcjonalnie)<input id="cw_pass" maxlength="32"></label>
      <label class="chk"><input type="checkbox" id="cw_pvp"> PvP (gracze mogą się atakować)</label>
      <label class="chk"><input type="checkbox" id="cw_boss" checked> Bossowie</label>
      <label class="chk"><input type="checkbox" id="cw_prot"> Ochrona baz (tylko właściciel rozbiera budowle)</label>
      <label>Seed (opcjonalnie)<input id="cw_seed" placeholder="losowy"></label>
    </div>
    <p class="err" id="cw_err"></p>
    <div class="row"><button class="btn big" id="cw_go">Stwórz i graj</button><button class="btn ghost" id="cw_cancel">Anuluj</button></div>`);
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const c = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;
  ($('#cw_cancel')).onclick = () => m.classList.add('hidden');
  ($('#cw_go')).onclick = async () => {
    try {
      const r = await api('/api/worlds', 'POST', {
        name: v('cw_name'), size: v('cw_size'), difficulty: v('cw_diff'), dayLength: +v('cw_day'), seasonLength: +v('cw_season'), maxPlayers: +v('cw_max'),
        resources: +v('cw_res'), monsters: +v('cw_mon'), raids: +v('cw_raid'), password: v('cw_pass'), pvp: c('cw_pvp'), bosses: c('cw_boss'), protect: c('cw_prot'),
        seed: v('cw_seed') || undefined, guestId: state.guestId,
      });
      state.world = r.id;
      state.worldLocked = !!v('cw_pass');
      (window as any).__createdPass = v('cw_pass');
      m.classList.add('hidden');
      openChars();
    } catch (e: any) { $('#cw_err').textContent = e.message; }
  };
}

let previews: Record<string, string> = {};
function renderPreviews() {
  if (Object.keys(previews).length) return;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(220, 260);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x604020, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(3, 5, 6); scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, 220 / 260, 0.1, 50);
  cam.position.set(0, 1.6, 6.2); cam.lookAt(0, 1.15, 0);
  for (const c of CHARACTERS) for (let s = 0; s < 3; s++) {
    const rig = makeCharacter(c, s);
    rig.root.rotation.y = 0.4;
    rig.armR!.rotation.z = -0.3; rig.armL!.rotation.z = 0.3;
    scene.add(rig.root);
    r.render(scene, cam);
    previews[`${c.id}_${s}`] = r.domElement.toDataURL();
    scene.remove(rig.root);
  }
  r.dispose();
}

function skinUnlocked(s: number) {
  if (s === 0) return true;
  if (s === 1) return state.ach.includes('days10');
  return state.ach.includes('boss1');
}

function openChars() {
  try { renderPreviews(); } catch { previews = {}; }
  const m = modal(`<h2>Wybierz postać</h2><p class="small">Świat: <b class="code">${esc(state.world)}</b>. Jeśli grałeś już w tym świecie, wrócisz swoją dotychczasową postacią.</p>
    <div class="chars">${CHARACTERS.map((c) => `<div class="char ${state.char === c.id ? 'sel' : ''}" data-c="${c.id}">
      ${previews[`${c.id}_0`] ? `<img src="${previews[`${c.id}_${state.char === c.id ? state.skin : 0}`]}">` : ''}
      <b>${esc(c.name)}</b><i>${esc(c.title)}</i><div class="perk">✅ ${esc(c.perk)}</div><div class="flaw">⚠️ ${esc(c.flaw)}</div>
      <div class="cstats">❤️ ${c.hp} 🍗 ${c.hunger} 🧠 ${c.sanity}</div></div>`).join('')}</div>
    <div class="skins">Wariant stroju: ${[0, 1, 2].map((s) => `<span class="skin ${state.skin === s ? 'sel' : ''} ${skinUnlocked(s) ? '' : 'locked'}" data-s="${s}" style="background:${s ? '#' + SKIN_TINTS[s].toString(16).padStart(6, '0') : '#8a6a40'}" title="${s === 0 ? 'Domyślny' : s === 1 ? 'Odblokuj: przetrwaj 10 dni' : 'Odblokuj: pokonaj bossa'}">${skinUnlocked(s) ? '' : '🔒'}</span>`).join('')}</div>
    ${state.worldLocked ? `<label>Hasło świata<input id="wpass" type="password" value="${esc((window as any).__createdPass || '')}"></label>` : ''}
    <p class="err" id="jerr"></p>
    <div class="row"><button class="btn big" id="play">▶ Wejdź do gry</button><button class="btn ghost" id="back">Wróć</button></div>`);
  for (const d of m.querySelectorAll('[data-c]')) (d as HTMLElement).onclick = () => { state.char = (d as HTMLElement).dataset.c!; localStorage.setItem('wm_char', state.char); openChars(); };
  for (const d of m.querySelectorAll('[data-s]')) (d as HTMLElement).onclick = () => { const s = +(d as HTMLElement).dataset.s!; if (skinUnlocked(s)) { state.skin = s; openChars(); } };
  ($('#back')).onclick = () => m.classList.add('hidden');
  ($('#play')).onclick = () => start();
}

async function start(passOverride?: string) {
  audio.init();
  const pass = passOverride ?? ((document.getElementById('wpass') as HTMLInputElement)?.value || '');
  const net = new Net();
  ($('#play') as HTMLButtonElement).disabled = true;
  $('#jerr').textContent = 'Łączenie...';
  try {
    const welcome = await net.connect({ t: 'hello', world: state.world, token: state.token || undefined, guestId: state.guestId, name: state.guestName, char: state.char, skin: state.skin, pass });
    $('#lobby').remove();
    $('#lmodal').remove();
    document.body.classList.add('ingame');
    const g = new Game(net, welcome);
    (window as any).game = g;
    window.addEventListener('beforeunload', () => {
      // zapamiętaj osiągnięcia gościa lokalnie
      localStorage.setItem('wm_ach', JSON.stringify(state.ach));
    });
  } catch (e: any) {
    ($('#play') as HTMLButtonElement).disabled = false;
    $('#jerr').textContent = e.text || e.message || 'Nie udało się połączyć.';
    if (e.pass && !document.getElementById('wpass')) { state.worldLocked = true; openChars(); }
  }
}

void CHAR;
render();
