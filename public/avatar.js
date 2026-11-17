// Postać w stylu kreskówki: toon shading + obrys, czapki, plecak, animacje biegu/skoku/mrugania.
import * as THREE from 'three';

const gradData = new Uint8Array([70, 150, 255]);
const gradient = new THREE.DataTexture(gradData, 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradient });
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15122b, side: THREE.BackSide });

const GEO = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  hemi: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  capsule: (r, l) => new THREE.CapsuleGeometry(r, l, 4, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  torus: new THREE.TorusGeometry(1, 0.14, 8, 24, Math.PI),
};

function add(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  if (outline) { const o = new THREE.Mesh(geo, outlineMat); o.scale.setScalar(1.09); m.add(o); }
  parent.add(m);
  return m;
}

const SKIN = [0xffd2a8, 0xf2b98f, 0xd99a6c, 0x9b6a45];
const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 360) + 360) % 360 / 360, s, l);

export function makeAvatar(hue, variant = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skinC = SKIN[variant % SKIN.length];
  const shirt = toon(hsl(hue, 0.78, 0.52));
  const accent = toon(hsl(hue + 40, 0.8, 0.6));
  const pants = toon(hsl(hue + 200, 0.4, 0.28));
  const skin = toon(skinC);
  const white = toon(0xffffff);
  const dark = new THREE.MeshBasicMaterial({ color: 0x1b1530 });
  const hatMat = toon(hsl(hue + 150, 0.75, 0.55));

  // tułów + plecak
  const torso = add(body, GEO.capsule(0.2, 0.26), shirt, 0, 1.03, 0, 1, 1, 0.85);
  add(body, GEO.box, accent, 0, 1.08, 0.2, 0.3, 0.4, 0.16);
  add(body, GEO.box, toon(0xffffff), 0, 0.95, -0.17, 0.4, 0.05, 0.02, false).visible = variant % 2 === 0; // pasek

  // głowa
  const head = new THREE.Group();
  head.position.y = 1.5;
  body.add(head);
  add(head, GEO.sphere, skin, 0, 0, 0, 0.27);
  const eyes = new THREE.Group();
  head.add(eyes);
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.1, 0.03, -0.235); eyes.add(e);
    add(e, GEO.sphere, white, 0, 0, 0, 0.075, 0.085, 0.05, false);
    add(e, GEO.sphere, dark, 0, -0.005, -0.03, 0.04, 0.045, 0.03, false);
    add(head, GEO.sphere, toon(0xff8fa3), sx * 0.17, -0.06, -0.2, 0.05, 0.03, 0.02, false);
  }
  const mouth = new THREE.Mesh(GEO.torus, dark);
  mouth.scale.setScalar(0.07); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.06, -0.255);
  head.add(mouth);

  // nakrycie głowy
  switch (variant % 5) {
    case 0: // czapka z daszkiem
      add(head, GEO.hemi, hatMat, 0, 0.03, 0, 0.29);
      add(head, GEO.box, hatMat, 0, 0.1, -0.28, 0.26, 0.03, 0.2);
      break;
    case 1: // czapka z pomponem
      add(head, GEO.hemi, hatMat, 0, 0.05, 0, 0.3);
      add(head, GEO.sphere, white, 0, 0.33, 0, 0.08);
      break;
    case 2: // kolczasta fryzura
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.55; add(head, GEO.cone, hatMat, Math.sin(a) * 0.17, 0.25 + Math.cos(a) * 0.05, 0.02, 0.09, 0.22, 0.09); }
      break;
    case 3: // słuchawki
      { const band = add(head, GEO.torus, toon(0x2b2b3a), 0, 0.02, 0, 0.3, 0.3, 0.3); band.rotation.z = 0; band.rotation.x = 0; band.rotation.y = 0;
        for (const sx of [-1, 1]) add(head, GEO.cyl, accent, sx * 0.29, 0, 0, 0.1, 0.07, 0.1).rotation.z = Math.PI / 2; }
      break;
    default: // kocie uszy
      for (const sx of [-1, 1]) { const ear = add(head, GEO.cone, hatMat, sx * 0.16, 0.27, 0, 0.1, 0.18, 0.08); ear.rotation.z = -sx * 0.25; }
  }

  // ręce
  const mkArm = (sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.3, 1.3, 0); body.add(p);
    add(p, GEO.capsule(0.075, 0.18), shirt, 0, -0.17, 0);
    add(p, GEO.sphere, skin, 0, -0.38, 0, 0.085);
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  // nogi
  const mkLeg = (sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.11, 0.62, 0); body.add(p);
    add(p, GEO.capsule(0.09, 0.28), pants, 0, -0.26, 0);
    add(p, GEO.sphere, white, 0, -0.55, -0.04, 0.115, 0.075, 0.17);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  return { group: root, body, torso, head, eyes, legL, legR, armL, armR, phase: 0, sq: 1, wasAir: false, blink: 2 + Math.random() * 3, t: 0 };
}

export function animateAvatar(av, speed, airborne, vy, dt) {
  av.t += dt;
  const k = Math.min(speed / 6.5, 1);
  av.phase += dt * (3 + speed * 1.7);
  const s = Math.sin(av.phase);

  if (airborne) {
    const up = vy > 0;
    av.legL.rotation.x = -0.9; av.legR.rotation.x = 0.5;
    av.armL.rotation.x = up ? -2.6 : -1.2; av.armR.rotation.x = up ? -2.6 : -1.2;
    av.armL.rotation.z = up ? 0.2 : 0.9; av.armR.rotation.z = up ? -0.2 : -0.9;
    av.body.rotation.x = -0.1 * k;
    av.body.position.y = 0;
  } else {
    av.legL.rotation.x = s * 1.0 * k; av.legR.rotation.x = -s * 1.0 * k;
    av.armL.rotation.x = -s * 0.95 * k + Math.sin(av.t * 1.6) * 0.04 * (1 - k);
    av.armR.rotation.x = s * 0.95 * k - Math.sin(av.t * 1.6) * 0.04 * (1 - k);
    av.armL.rotation.z = 0.08; av.armR.rotation.z = -0.08;
    av.body.rotation.x = -0.14 * k;
    av.body.position.y = Math.abs(Math.sin(av.phase)) * 0.06 * k;
  }

  // ściśnięcie i rozciągnięcie przy skoku/lądowaniu
  if (av.wasAir && !airborne) av.sq = 0.74;
  av.wasAir = airborne;
  const target = airborne ? (vy > 0 ? 1.1 : 1.04) : 1;
  av.sq += (target - av.sq) * Math.min(1, dt * 12);
  av.body.scale.set(1 / Math.sqrt(av.sq), av.sq, 1 / Math.sqrt(av.sq));
  av.torso.scale.y = 1 + Math.sin(av.t * 2.2) * 0.015 * (1 - k);

  // mruganie
  av.blink -= dt;
  const closed = av.blink < 0.12 && av.blink > 0;
  av.eyes.scale.y = closed ? 0.12 : 1;
  if (av.blink < 0) av.blink = 2.5 + Math.random() * 3;
}
