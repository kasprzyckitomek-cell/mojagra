// Widoki encji: gracze, stworzenia, dropy, pociski, budowle + animacje proceduralne.
import * as THREE from 'three';
import { makeCharacter, makeMobRig, makeStruct, itemModel, emojiTexture, textSprite, projModel, setFarmPlant, ARMOR_COLORS, Rig, StructModel, toon } from './models';
import { CHAR } from '../shared/data/characters';
import { MOBS } from '../shared/data/mobs';
import { ITEMS } from '../shared/data/items';
import { STRUCTS } from '../shared/data/structures';

export interface EntView {
  id: number;
  kind: number; // 0 gracz, 1 mob, 2 drop, 3 pocisk
  type: string;
  obj: THREE.Object3D;
  rig?: Rig;
  x: number; z: number; r: number;
  tx: number; tz: number; tr: number;
  anim: number;
  hp: number;
  flags: number;
  name?: string;
  eq?: string;
  skin?: number;
  emote?: number;
  hpBar?: THREE.Sprite;
  hpCanvas?: HTMLCanvasElement;
  nameTag?: THREE.Sprite;
  seen: number;
  phase: number;
  speed: number;
  n?: number;
  carry?: number;
  lastHit?: number;
}

export interface StructView { id: number; type: string; data: any; model: StructModel; obj: THREE.Group }

function makeHpBar(): { s: THREE.Sprite; c: HTMLCanvasElement } {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.2, 0.15, 1);
  s.renderOrder = 10;
  return { s, c };
}
function drawHp(v: EntView, color = '#e04040') {
  if (!v.hpCanvas || !v.hpBar) return;
  const ctx = v.hpCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = color; ctx.fillRect(1, 1, Math.max(0, (v.hp / 100) * 62), 6);
  (v.hpBar.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}

export class Entities {
  views = new Map<number, EntView>();
  structs = new Map<number, StructView>();
  group = new THREE.Group();
  sgroup = new THREE.Group();
  myId = 0;
  constructor(public scene: THREE.Scene, public heightAt: (x: number, z: number) => number) {
    scene.add(this.group);
    scene.add(this.sgroup);
  }

  // ---------------- Snapshot ----------------
  applySnapshot(e: any[], now: number) {
    for (const a of e) {
      const [id, kind, type, x, z, r] = a;
      let v = this.views.get(id);
      if (!v) {
        const nv = this.create(id, kind, type, a);
        if (!nv) continue;
        v = nv;
        v.x = v.tx = x; v.z = v.tz = z; v.r = v.tr = r;
        this.views.set(id, v);
      }
      if (v.type !== type && kind === 0) { this.remove(id); continue; }
      v.tx = x; v.tz = z; v.tr = r;
      v.seen = now;
      if (kind === 0) {
        v.anim = a[6]; const hp = a[7]; v.name = a[8]; v.flags = a[9];
        if (a[10] !== v.eq) { v.eq = a[10]; this.updateEquip(v); }
        v.emote = a[12];
        if (hp !== v.hp) { v.hp = hp; drawHp(v, '#40d060'); }
      } else if (kind === 1) {
        v.anim = a[6];
        const hp = a[7];
        if (hp !== v.hp) { if (hp < v.hp) v.lastHit = now; v.hp = hp; drawHp(v); }
        v.flags = a[8];
        v.carry = a[9];
      } else if (kind === 2) {
        v.n = a[7];
      }
    }
  }

  create(id: number, kind: number, type: string, a: any[]): EntView | null {
    const base = { id, kind, type, x: 0, z: 0, r: 0, tx: 0, tz: 0, tr: 0, anim: 0, hp: 100, flags: 0, seen: 0, phase: Math.random() * 10, speed: 0 };
    if (kind === 0) {
      const cd = CHAR[type];
      if (!cd) return null;
      const rig = makeCharacter(cd, a[11] || 0);
      const v: EntView = { ...base, obj: rig.root, rig, name: a[8], skin: a[11] };
      if (id !== this.myId) {
        v.nameTag = textSprite(a[8]);
        v.nameTag.position.y = 2.75;
        rig.root.add(v.nameTag);
        const hb = makeHpBar(); v.hpBar = hb.s; v.hpCanvas = hb.c; hb.s.position.y = 2.45; rig.root.add(hb.s);
        v.hp = -1;
      }
      this.group.add(rig.root);
      return v;
    }
    if (kind === 1) {
      const def = MOBS[type];
      if (!def) return null;
      const rig = makeMobRig(def);
      rig.root.scale.setScalar(def.scale);
      const v: EntView = { ...base, obj: rig.root, rig };
      const hb = makeHpBar(); v.hpBar = hb.s; v.hpCanvas = hb.c;
      hb.s.position.y = rig.height + 0.35;
      hb.s.scale.set(1.2 / def.scale, 0.15 / def.scale, 1);
      hb.s.visible = false;
      rig.root.add(hb.s);
      if (def.ai === 'npc' || def.ai === 'pig') {
        const tag = textSprite(def.name, def.ai === 'npc' ? '#ffe080' : '#ffffff');
        tag.position.y = rig.height + 0.7;
        tag.scale.multiplyScalar(1 / def.scale);
        tag.visible = def.ai === 'npc';
        v.nameTag = tag;
        rig.root.add(tag);
      }
      if (def.ai === 'shadow') rig.root.traverse((o: any) => { if (o.material) o.material = o.material; });
      v.hp = -1;
      this.group.add(rig.root);
      return v;
    }
    if (kind === 2) {
      const def = ITEMS[type];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(def?.icon || '❔'), transparent: true }));
      s.scale.setScalar(0.7);
      const g = new THREE.Group();
      g.add(s);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.03;
      g.add(sh);
      this.group.add(g);
      return { ...base, obj: g };
    }
    if (kind === 3) {
      const m = projModel(type);
      const g = new THREE.Group();
      g.add(m);
      this.group.add(g);
      return { ...base, obj: g };
    }
    return null;
  }

  updateEquip(v: EntView) {
    const rig = v.rig!;
    const [hand, head, body, back] = (v.eq || '|||').split('|');
    rig.hand?.clear(); rig.headTop?.clear(); rig.back?.clear();
    if (hand) { const m = itemModel(hand); if (m) { m.rotation.x = Math.PI / 2 - 0.2; rig.hand!.add(m); } }
    if (head) { const m = itemModel(head); if (m) rig.headTop!.add(m); }
    if (back) { const m = itemModel(back); if (m) rig.back!.add(m); }
    if (rig.bodyMesh) {
      const prev = rig.bodyMesh.getObjectByName('armor');
      if (prev) rig.bodyMesh.remove(prev);
      if (body && ARMOR_COLORS[body]) {
        const a = new THREE.Mesh(rig.bodyMesh.geometry, toon(ARMOR_COLORS[body]));
        a.scale.set(1.12, 0.85, 1.12);
        a.position.y = 0.05;
        a.name = 'armor';
        rig.bodyMesh.add(a);
      }
    }
  }

  remove(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    this.group.remove(v.obj);
    v.obj.traverse((o: any) => { if (o.material?.map && o.isSprite && o.material.map !== emojiTexture('❔')) { /* tekstury emoji współdzielone */ } });
    this.views.delete(id);
  }

  // ---------------- Budowle ----------------
  setStruct(d: any) {
    let s = this.structs.get(d.id);
    if (!s || s.type !== d.ty) {
      if (s) this.removeStruct(d.id);
      const model = makeStruct(d.ty);
      const obj = model.g;
      obj.position.set(d.x, this.heightAt(d.x, d.z) - (STRUCTS[d.ty]?.floor ? 0 : 0.05), d.z);
      obj.rotation.y = d.r;
      obj.userData.struct = d.id;
      this.sgroup.add(obj);
      s = { id: d.id, type: d.ty, data: d, model, obj };
      this.structs.set(d.id, s);
    }
    s.data = d;
    const m = s.model;
    const def = STRUCTS[d.ty];
    if (m.flame) m.flame.visible = (d.f ?? 0) > 0;
    if (m.flame && d.f) m.flame.scale.setScalar(0.4 + Math.min(1, d.f / 50) * 0.8);
    const lit = d.ty === 'lamp' || d.ty === 'icebox' || d.ty === 'solar' || d.ty === 'generator' ? !!d.pw : d.ty === 'furnace' || d.ty === 'kitchen' ? !!d.on : d.ty === 'smokehouse' ? (d.f ?? 0) > 0 : true;
    for (const gm of m.glow || []) {
      const mat = gm.material as THREE.MeshToonMaterial;
      if (!(gm as any)._baseE) (gm as any)._baseE = mat.emissive.getHex() || 0xffa040;
      gm.material = toon(mat.color.getHex(), { emissive: lit ? (gm as any)._baseE : 0 });
    }
    if (m.door) m.door.rotation.y = d.op ? -1.5 : 0;
    if (d.ty === 'farm') setFarmPlant(m, d.pl, (d.g ?? 0) / 100);
    if (d.ty === 'planted_tree' && m.plant) { const g = (d.g ?? 0) / 100; m.plant.scale.setScalar(0.15 + g * 0.85); }
    if (d.ty === 'turret' && m.head) m.head.rotation.y = 0;
    // pożar
    let fire = s.obj.getObjectByName('burn');
    if (d.b && !fire) {
      fire = new THREE.Group(); fire.name = 'burn';
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), toon(0xff7020, { emissive: 0xff4000 })); f.position.set((i - 1) * 0.4, 1, 0); fire.add(f); }
      s.obj.add(fire);
    } else if (!d.b && fire) s.obj.remove(fire);
    void def;
  }

  removeStruct(id: number) {
    const s = this.structs.get(id);
    if (!s) return;
    this.sgroup.remove(s.obj);
    this.structs.delete(id);
  }

  // ---------------- Klatka ----------------
  update(dt: number, now: number, t: number, me: { x: number; z: number; r: number; anim: number; moving: boolean; ghost: boolean; wolf: boolean; sleeping: boolean }, camYaw: number) {
    for (const v of [...this.views.values()]) {
      if (now - v.seen > 600 && v.id !== this.myId) { this.remove(v.id); continue; }
      let moving = false;
      if (v.id === this.myId) {
        const dx = me.x - v.x, dz = me.z - v.z;
        v.speed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
        v.x = me.x; v.z = me.z; v.r = me.r;
        moving = me.moving;
        v.anim = v.anim === 0 || v.anim === 1 || v.anim === 10 ? (me.moving ? me.anim : 0) : v.anim;
      } else {
        const k = Math.min(1, dt * (v.kind === 3 ? 25 : 12));
        const dx = v.tx - v.x, dz = v.tz - v.z;
        if (dx * dx + dz * dz > 400) { v.x = v.tx; v.z = v.tz; }
        else { v.x += dx * k; v.z += dz * k; }
        let dr = v.tr - v.r;
        while (dr > Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        v.r += dr * Math.min(1, dt * 10);
        v.speed = Math.hypot(dx, dz) * 10;
        moving = Math.hypot(dx, dz) > 0.05;
      }
      const h = Math.max(-0.35, this.heightAt(v.x, v.z));
      v.obj.position.set(v.x, h, v.z);
      if (v.kind === 2) {
        v.obj.children[0].position.y = 0.45 + Math.sin(t * 3 + v.id) * 0.08;
        continue;
      }
      if (v.kind === 3) { v.obj.rotation.y = v.r; continue; }
      v.obj.rotation.y = v.r;
      if (v.kind === 0) this.animatePlayer(v, t, dt, moving, v.id === this.myId ? me : null);
      else this.animateMob(v, t, dt, moving, now);
    }
    // animacje budowli
    for (const s of this.structs.values()) {
      const m = s.model;
      if (m.flame && m.flame.visible) { m.flame.scale.y = (0.8 + Math.sin(t * 15 + s.id) * 0.15) * m.flame.scale.x; m.flame.rotation.y += dt * 2; }
      const on = s.data.pw || s.data.on;
      for (const a of m.anim || []) {
        if (s.type === 'windmill') a.rotation.z += dt * (on !== 0 ? 1.5 : 0.2);
        else if (s.type === 'waterwheel') a.rotation.x += dt * (s.data.pw ? 1.2 : 0.1);
        else if (s.type === 'sawmill' && s.data.pw) a.rotation.y += dt * 20;
        else if (s.type === 'drill' && s.data.pw) a.rotation.y += dt * 8;
        else if (s.type === 'harvester' && s.data.pw) a.rotation.x += dt * 4;
        else if (s.type === 'sprinkler' && s.data.pw) a.rotation.y += dt * 4;
        else if (s.type === 'generator' && s.data.pw) a.rotation.x += dt * 10;
        else if (s.type === 'weather_station') a.rotation.y += dt * 2;
        else if (s.type === 'mechbench') a.rotation.z += dt * 0.6;
        else if (s.type === 'shadow_altar' || s.type === 'golem_core') { a.rotation.y += dt; a.position.y += Math.sin(t * 2) * 0.002; }
        else if (s.type === 'escape_portal') a.rotation.z += dt * 0.8;
      }
      if (s.type === 'turret' && m.head) m.head.rotation.y = -s.obj.rotation.y + (s.data.r || 0);
    }
  }

  animatePlayer(v: EntView, t: number, dt: number, moving: boolean, me: any) {
    const rig = v.rig!;
    const ghost = me ? me.ghost : !!(v.flags & 1);
    const wolf = me ? me.wolf : !!(v.flags & 2);
    const sleeping = me ? me.sleeping : !!(v.flags & 4);
    rig.normal!.visible = !ghost && !wolf;
    rig.ghost!.visible = ghost;
    if (rig.wolf) rig.wolf.root.visible = wolf && !ghost;
    if (ghost) { rig.ghost!.position.y = 0.5 + Math.sin(t * 2 + v.id) * 0.2; rig.root.rotation.x = 0; return; }
    if (wolf && rig.wolf) { this.animateLegs(rig.wolf, t, moving, v.anim === 10 ? 1.6 : 1.1); return; }
    v.phase += dt * (v.anim === 10 ? 14 : 10) * (moving ? 1 : 0);
    const body = rig.body;
    const sw = moving ? Math.sin(v.phase) : 0;
    const amp = v.anim === 10 ? 0.9 : 0.6;
    rig.legs[0].rotation.x = sw * amp;
    rig.legs[1].rotation.x = -sw * amp;
    rig.armL!.rotation.set(-sw * amp * 0.8, 0, 0.1);
    rig.armR!.rotation.set(sw * amp * 0.8, 0, -0.1);
    body.position.y = moving ? Math.abs(Math.cos(v.phase)) * 0.08 : Math.sin(t * 2) * 0.02;
    body.rotation.x = 0;
    rig.root.rotation.x = 0;
    if (sleeping) {
      rig.normal!.rotation.x = -Math.PI / 2;
      rig.normal!.position.y = 0.35;
      return;
    }
    rig.normal!.rotation.x = 0; rig.normal!.position.y = 0;
    const a = v.anim;
    const tt = t * 1000;
    if (a === 2) { const k = (tt % 400) / 400; rig.armR!.rotation.x = -2.4 + k * 3.0; body.rotation.x = 0.15 * Math.sin(k * Math.PI); }
    else if (a === 3) { const k = Math.sin(t * 12); rig.armR!.rotation.x = -1.6 + k * 1.2; rig.armL!.rotation.x = -1.2 + k * 0.8; body.rotation.x = 0.1; }
    else if (a === 5) { body.rotation.x = 0.5; rig.armR!.rotation.x = -1.2; rig.armL!.rotation.x = -1.2; }
    else if (a === 4) { rig.armR!.rotation.x = -2.2 + Math.sin(t * 14) * 0.3; }
    if (v.emote === 1) { rig.armR!.rotation.set(0, 0, -2.6 + Math.sin(t * 10) * 0.4); }
    else if (v.emote === 2) { rig.root.rotation.y += Math.sin(t * 6) * 0.6; body.position.y = Math.abs(Math.sin(t * 8)) * 0.2; rig.armL!.rotation.z = 2; rig.armR!.rotation.z = -2; }
    else if (v.emote === 3) { rig.normal!.position.y = -0.4; rig.legs[0].rotation.x = -1.4; rig.legs[1].rotation.x = -1.4; }
    else if (v.emote === 4) { rig.armR!.rotation.set(-1.5, 0, 0); rig.armL!.rotation.set(-1.5, 0, 0); }
    const flame = rig.hand?.getObjectByName('flame');
    if (flame) flame.scale.y = 1 + Math.sin(t * 20) * 0.15;
  }

  animateLegs(rig: Rig, t: number, moving: boolean, spd: number) {
    const ph = t * 10 * spd;
    rig.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
  }

  animateMob(v: EntView, t: number, dt: number, moving: boolean, now: number) {
    const rig = v.rig!;
    const def = MOBS[v.type];
    const hidden = !!(v.flags & 8);
    rig.root.visible = !hidden;
    if (v.hpBar) v.hpBar.visible = !!def.boss || (v.lastHit !== undefined && now - v.lastHit < 4000) || v.hp < 100 && v.hp > 0 && (now - (v.lastHit || 0) < 8000);
    if (v.nameTag && def.ai === 'pig') v.nameTag.visible = !!(v.flags & 16);
    const frozen = !!(v.flags & 2);
    if (frozen) { rig.body.rotation.z = Math.sin(t * 30) * 0.03; return; }
    const spd = v.anim === 10 ? 1.6 : 1;
    v.phase += dt * 10 * spd * (moving ? 1 : 0);
    const ph = v.phase;
    switch (rig.kind) {
      case 'tentacle': {
        const sub = v.anim === 6;
        rig.segs!.forEach((s, i) => { s.rotation.x = Math.sin(t * 2.5 + i * 0.7) * (v.anim === 2 ? 0.45 : 0.18); s.rotation.z = Math.cos(t * 2 + i) * 0.12; });
        rig.body.position.y = sub ? -2.4 : 0;
        return;
      }
      case 'shadow': rig.body.position.y = Math.sin(t * 2) * 0.2; rig.body.scale.x = 1 + Math.sin(t * 3) * 0.05; break;
      case 'bird': case 'bat': {
        const fly = rig.kind === 'bat' || moving && v.anim === 10 && v.type !== 'chicken';
        const flap = fly ? Math.sin(t * 18) * 0.9 : Math.sin(t * 2) * 0.1;
        rig.wings![0].rotation.z = flap; rig.wings![1].rotation.z = -flap;
        rig.body.position.y = rig.kind === 'bat' ? 2 + Math.sin(t * 3 + v.id) * 0.3 : fly ? 0.8 : 0;
        rig.legs.forEach((l, i) => (l.rotation.x = moving && !fly ? Math.sin(ph + i * Math.PI) * 0.7 : 0));
        break;
      }
      case 'titan': rig.segs!.forEach((s, i) => (s.position.y = 0.7 + Math.sin(t * 3 + i) * 0.15)); break;
      default:
        rig.legs.forEach((l, i) => {
          if (rig.kind === 'spider' || rig.kind === 'scorpion' || rig.kind === 'crab') l.rotation.x = moving ? Math.sin(ph * 1.5 + i * 1.3) * 0.35 : 0;
          else l.rotation.x = moving ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0;
        });
        if (rig.armL && rig.armR) {
          const sw = moving ? Math.sin(ph) * 0.5 : 0;
          rig.armL.rotation.x = -sw; rig.armR.rotation.x = sw;
        }
        rig.body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 2 + v.id) * 0.015;
    }
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * 4 + v.id) * 0.3;
    if (v.anim === 2) {
      const k = (now % 450) / 450;
      if (rig.head) rig.head.position.z = (rig.head.userData.z0 ??= rig.head.position.z) + Math.sin(k * Math.PI) * 0.25;
      if (rig.armR) rig.armR.rotation.x = -2.2 + k * 2.6;
      rig.body.rotation.x = Math.sin(k * Math.PI) * 0.15;
    } else if (v.anim === 3) {
      if (rig.armR) rig.armR.rotation.x = -1.6 + Math.sin(t * 12) * 1.1;
    } else {
      if (rig.head && rig.head.userData.z0 !== undefined) rig.head.position.z = rig.head.userData.z0;
      rig.body.rotation.x = 0;
    }
    if (v.flags & 4) rig.body.rotation.z = Math.sin(t * 20) * 0.05;
  }

  /** Najbliższa encja do punktu na ekranie */
  pick(camera: THREE.Camera, sx: number, sy: number, w: number, h: number, filter?: (v: EntView) => boolean): EntView | null {
    let best: EntView | null = null, bd = 45 * 45;
    const v3 = new THREE.Vector3();
    for (const v of this.views.values()) {
      if (v.id === this.myId || v.kind === 3) continue;
      if (filter && !filter(v)) continue;
      if (v.kind === 1 && v.flags & 8) continue;
      const hgt = v.kind === 2 ? 0.4 : (v.rig?.height || 1.5) * (v.kind === 1 ? MOBS[v.type].scale : 1) * 0.55;
      v3.set(v.x, v.obj.position.y + hgt, v.z).project(camera);
      if (v3.z > 1) continue;
      const px = (v3.x * 0.5 + 0.5) * w, py = (-v3.y * 0.5 + 0.5) * h;
      const rad = v.kind === 1 ? Math.max(30, MOBS[v.type].radius * 40) : 30;
      const d = (px - sx) ** 2 + (py - sy) ** 2;
      if (d < bd && d < rad * rad * 1.6) { bd = d; best = v; }
    }
    return best;
  }
}
