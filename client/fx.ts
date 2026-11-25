// Efekty cząsteczkowe, telegrafy ataków bossów, błyskawice, pogoda.
import * as THREE from 'three';
import { emojiTexture } from './models';

let dotTex: THREE.Texture | null = null;
function dot() {
  if (!dotTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    dotTex = new THREE.CanvasTexture(c);
  }
  return dotTex;
}
let leafTex: THREE.Texture | null = null;
function leaf() {
  if (!leafTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 6, 0.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.stroke();
    leafTex = new THREE.CanvasTexture(c);
  }
  return leafTex;
}
interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number; grav: number }
interface Ring { mesh: THREE.Mesh; life: number; max: number; grow: number; fill?: boolean }

export class FX {
  parts: P[] = [];
  inst: THREE.InstancedMesh;
  rings: Ring[] = [];
  sprites: { s: THREE.Sprite; life: number; max: number; vy: number }[] = [];
  bolts: { l: THREE.Line; life: number }[] = [];
  flash = 0;
  private m4 = new THREE.Matrix4();
  private col = new THREE.Color();
  rain: THREE.LineSegments;
  flies: THREE.Points;
  leaves: THREE.Points;
  private flyData: { x: number; y: number; z: number; ph: number }[] = [];
  snow: THREE.Points;
  constructor(public scene: THREE.Scene, public heightAt: (x: number, z: number) => number) {
    const geo = new THREE.OctahedronGeometry(0.12, 0);
    this.inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 800);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    scene.add(this.inst);
    // deszcz
    const rg = new THREE.BufferGeometry();
    const N = 1600;
    const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 70, y = Math.random() * 30, z = (Math.random() - 0.5) * 70; rp.set([x, y, z, x + 0.05, y - 0.9, z], i * 6); }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8c0e0, transparent: true, opacity: 0.45 }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 70, Math.random() * 30, (Math.random() - 0.5) * 70], i * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, transparent: true, opacity: 0.9, map: dot(), depthWrite: false }));
    this.snow.visible = false;
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    // świetliki (noc) i spadające liście (jesień)
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    this.flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xd8ff70, size: 0.45, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, map: dot() }));
    this.flies.frustumCulled = false; this.flies.visible = false;
    scene.add(this.flies);
    for (let i = 0; i < 40; i++) this.flyData.push({ x: (Math.random() - 0.5) * 50, y: 0.5 + Math.random() * 2, z: (Math.random() - 0.5) * 50, ph: Math.random() * 10 });
    const lg = new THREE.BufferGeometry();
    const lp = new Float32Array(50 * 3);
    for (let i = 0; i < 50; i++) lp.set([(Math.random() - 0.5) * 60, Math.random() * 14, (Math.random() - 0.5) * 60], i * 3);
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    this.leaves = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xb05a20, size: 0.45, transparent: true, opacity: 0.9, map: leaf(), alphaTest: 0.3, depthWrite: false }));
    this.leaves.frustumCulled = false; this.leaves.visible = false;
    scene.add(this.leaves);
  }

  ambient(dt: number, px: number, pz: number, flies: boolean, leaves: boolean, t: number) {
    this.flies.visible = flies;
    if (flies) {
      const a = this.flies.geometry.attributes.position as THREE.BufferAttribute;
      this.flyData.forEach((f, i) => {
        f.ph += dt;
        f.x += Math.sin(f.ph * 0.7 + i) * dt * 0.8; f.z += Math.cos(f.ph * 0.6 + i * 2) * dt * 0.8;
        if (Math.abs(f.x) > 25) f.x *= -0.9; if (Math.abs(f.z) > 25) f.z *= -0.9;
        const wx = px + f.x, wz = pz + f.z;
        a.setXYZ(i, wx, this.heightAt(wx, wz) + f.y + Math.sin(f.ph * 2) * 0.3, wz);
      });
      a.needsUpdate = true;
      (this.flies.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(t * 3) * 0.3;
    }
    this.leaves.visible = leaves;
    if (leaves) {
      this.leaves.position.set(px, this.heightAt(px, pz), pz);
      const a = this.leaves.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 0.9;
        if (y < 0) y = 12 + Math.random() * 2;
        a.setXYZ(i, a.getX(i) + Math.sin(t + i) * dt * 0.6, y, a.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.4);
      }
      a.needsUpdate = true;
    }
  }

  burst(x: number, y: number, z: number, n: number, color: number, speed = 3, life = 0.8, size = 1, grav = 9) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.parts.length < 800; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.8 + 0.2;
      this.parts.push({ x, y, z, vx: Math.cos(a) * speed * (0.4 + Math.random()), vy: e * speed * 1.2, vz: Math.sin(a) * speed * (0.4 + Math.random()), life, max: life, size: size * (0.6 + Math.random() * 0.8), r: c.r, g: c.g, b: c.b, grav });
    }
  }

  ring(x: number, z: number, r: number, color: number, dur: number, grow = 0, fill = false, opacity = 0.6) {
    const geo = fill ? new THREE.CircleGeometry(1, 40) : new THREE.RingGeometry(0.85, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, this.heightAt(x, z) + 0.12, z);
    m.scale.setScalar(r);
    m.renderOrder = 5;
    this.scene.add(m);
    this.rings.push({ mesh: m, life: dur, max: dur, grow, fill });
  }

  floatEmoji(x: number, y: number, z: number, e: string, life = 1.2) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(e), transparent: true, depthTest: false }));
    s.position.set(x, y, z);
    s.scale.setScalar(0.8);
    s.renderOrder = 11;
    this.scene.add(s);
    this.sprites.push({ s, life, max: life, vy: 1.2 });
  }

  bolt(x: number, z: number) {
    const y0 = this.heightAt(x, z);
    const pts: THREE.Vector3[] = [];
    let cx = x, cz = z;
    for (let i = 0; i <= 10; i++) { pts.push(new THREE.Vector3(cx, y0 + 30 - i * 3, cz)); cx += (Math.random() - 0.5) * 2; cz += (Math.random() - 0.5) * 2; }
    pts[pts.length - 1].set(x, y0, z);
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.scene.add(l);
    this.bolts.push({ l, life: 0.25 });
    this.flash = 1;
    this.burst(x, y0 + 0.5, z, 30, 0xffffa0, 7, 0.6);
  }

  play(k: string, x: number, z: number, d: any) {
    const y = this.heightAt(x, z) + 0.8;
    switch (k) {
      case 'hit': {
        const c = d.c === 'chop' ? 0xc8a070 : d.c === 'mine' ? 0xb0b0b0 : d.c === 'flesh' ? 0xd03030 : d.c === 'pick' ? 0x80c060 : d.c === 'ice' ? 0x90e0ff : d.c === 'fire' ? 0xff8020 : 0xe0d0a0;
        this.burst(x, y, z, d.c === 'flesh' ? 8 : 6, c, 3, 0.5, 0.8);
        break;
      }
      case 'hurt': this.burst(x, y + 0.6, z, 8, 0xff2020, 2.5, 0.5, 0.8); break;
      case 'death': this.burst(x, y, z, d.big ? 80 : 20, 0x606060, d.big ? 6 : 3, 1.2, d.big ? 2 : 1.2, 2); break;
      case 'revive': this.burst(x, y, z, 40, 0xffe080, 3, 1.4, 1, -1); this.ring(x, z, 3, 0xffe080, 1, 2); break;
      case 'poof': this.burst(x, y, z, 25, 0xd0d0e0, 3, 0.8, 1.4, 0); break;
      case 'tele': this.ring(x, z, d.r || 4, d.c === 'ice' ? 0x60c0ff : d.c === 'web' ? 0xffffff : d.c === 'bolt' ? 0xffff60 : d.c === 'sand' ? 0xd0a060 : 0xff3020, d.d || 1.2, 0, true, 0.35); break;
      case 'slam': this.ring(x, z, 0.5, 0xffffff, 0.5, (d.r || 5) * 2.2); this.burst(x, y - 0.6, z, 40, 0x8a7a60, 6, 0.8, 1.4); break;
      case 'freeze': this.ring(x, z, 0.5, 0x80e0ff, 0.6, (d.r || 8) * 2); this.burst(x, y, z, 50, 0xc0f0ff, 7, 1, 1); break;
      case 'web': this.ring(x, z, d.r || 5, 0xf0f0f0, 4, 0, true, 0.35); break;
      case 'lightning': this.bolt(x, z); break;
      case 'smoke': this.burst(x, y, z, 15, 0x707070, 1, 1.5, 1.6, -0.5); break;
      case 'fuel': this.burst(x, y - 0.4, z, 14, 0xffa030, 2.5, 0.6, 0.7, -2); break;
      case 'cook': case 'cooked': this.burst(x, y + 0.3, z, 10, 0xf0f0f0, 1, 1, 1.2, -1); break;
      case 'heart': this.floatEmoji(x, y + 1.5, z, '❤️'); break;
      case 'eat': this.burst(x, y + 0.8, z, 6, 0xe0c080, 1.5, 0.4, 0.6); break;
      case 'heal': this.burst(x, y, z, 16, 0x60ff80, 1.5, 1, 0.8, -2); break;
      case 'charlie': this.burst(x, y, z, 20, 0x100010, 3, 0.6, 1.4, 0); this.flash = -0.6; break;
      case 'bossSpawn': this.burst(x, y, z, 70, 0xa040f0, 6, 1.4, 1.6, 0); this.ring(x, z, 1, 0xa040f0, 1.2, 12); break;
      case 'roar': this.ring(x, z, 1, 0xffffff, 0.5, 6); break;
      case 'dig': this.burst(x, y - 0.5, z, 30, 0x8a6a40, 4, 0.9, 1.3); break;
      case 'splash': this.burst(x, y - 0.6, z, 14, 0x80c0ff, 3, 0.6, 0.8); break;
      case 'build': this.burst(x, y - 0.4, z, 20, 0xc0b090, 3, 0.7, 1.1); break;
      case 'craft': this.burst(x, y + 0.6, z, 12, 0xffe080, 2, 0.6, 0.6, -1); break;
      case 'break': this.burst(x, y, z, 20, 0x8a6a40, 4, 0.7, 1); break;
      case 'pick': this.burst(x, y - 0.3, z, 8, 0x80c060, 2, 0.5, 0.7); break;
      case 'smelt': this.burst(x, y + 1, z, 10, 0xff8020, 2, 0.5, 0.6, -3); break;
      case 'saw': this.burst(x, y + 0.4, z, 8, 0xd0b080, 3, 0.4, 0.5); break;
      case 'drill': this.burst(x, y - 0.6, z, 8, 0x909090, 3, 0.4, 0.6); break;
      case 'break_item': break;
    }
  }

  update(dt: number, camX: number, camZ: number, weather: string, wi: number, ambient: THREE.Light, baseAmb: number) {
    // cząsteczki
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = p.size * (p.life / p.max);
      this.m4.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      this.inst.setMatrixAt(n, this.m4);
      this.col.setRGB(p.r, p.g, p.b);
      this.inst.setColorAt(n, this.col);
      n++;
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); this.rings.splice(i, 1); continue; }
      if (r.grow) r.mesh.scale.multiplyScalar(1 + r.grow * dt / Math.max(0.5, r.mesh.scale.x));
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = r.fill ? 0.25 + 0.35 * (1 - r.life / r.max) : (r.life / r.max) * 0.8;
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.life -= dt;
      s.s.position.y += s.vy * dt;
      (s.s.material as THREE.SpriteMaterial).opacity = Math.min(1, s.life / s.max * 2);
      if (s.life <= 0) { this.scene.remove(s.s); this.sprites.splice(i, 1); }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.life <= 0) { this.scene.remove(b.l); b.l.geometry.dispose(); this.bolts.splice(i, 1); }
    }
    // błysk
    if (this.flash !== 0) {
      ambient.intensity = baseAmb + this.flash * 2.5;
      this.flash = this.flash > 0 ? Math.max(0, this.flash - dt * 4) : Math.min(0, this.flash + dt * 2);
    }
    // opady
    const rainy = weather === 'rain' || weather === 'storm';
    this.rain.visible = rainy;
    this.snow.visible = weather === 'snow';
    if (rainy) {
      this.rain.position.set(camX, 0, camZ);
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const fall = 26 * dt;
      const count = Math.floor((arr.length / 6) * Math.max(0.3, wi));
      for (let i = 0; i < arr.length / 6; i++) {
        if (i > count) { arr[i * 6 + 1] = -50; arr[i * 6 + 4] = -51; continue; }
        arr[i * 6 + 1] -= fall; arr[i * 6 + 4] -= fall;
        if (arr[i * 6 + 1] < 0) { const y = 25 + Math.random() * 5; arr[i * 6 + 1] = y; arr[i * 6 + 4] = y - 0.9; }
      }
      pos.needsUpdate = true;
    }
    if (weather === 'snow') {
      this.snow.position.set(camX, 0, camZ);
      const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const t = performance.now() / 1000;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] -= 2.5 * dt;
        arr[i * 3] += Math.sin(t + i) * 0.01;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 28 + Math.random() * 3;
      }
      pos.needsUpdate = true;
    }
  }
}
