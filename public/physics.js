// Fizyka gracza: AABB kontra platformy. Moduł działa w przeglądarce i w Node (testy).
export const GRAV = 24;
export const JUMP = 8.6;
export const WALK = 5;
export const SPRINT = 7.5;
export const HALF = 0.3;      // pół szerokości gracza
export const HEIGHT = 1.8;
export const EYE = 1.62;

const EPS = 0.001;

export function buildBoxes(plats) {
  return plats.map((p) => ({
    minx: p.x - p.size / 2, maxx: p.x + p.size / 2,
    minz: p.z - p.size / 2, maxz: p.z + p.size / 2,
    miny: p.y - 1, maxy: p.y,
    kind: p.kind,
  }));
}

export function makePlayer(x, y, z) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: false, groundIdx: -1, coyote: 0, buffer: 0 };
}

function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}

function overlaps(p, b) {
  if (b.off) return false; // znikająca platforma
  return p.x - HALF < b.maxx && p.x + HALF > b.minx &&
         p.z - HALF < b.maxz && p.z + HALF > b.minz &&
         p.y < b.maxy - EPS && p.y + HEIGHT > b.miny + EPS;
}

// inp: { fw, st, sprint, jumpPressed }
export function stepPlayer(p, inp, dt, boxes) {
  if (inp.jumpPressed) p.buffer = 0.12;
  const n = Math.max(1, Math.ceil(dt / (1 / 90)));
  const h = dt / n;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);

  for (let s = 0; s < n; s++) {
    // kierunek chodzenia względem kamery
    let dx = -sin * inp.fw + cos * inp.st;
    let dz = -cos * inp.fw - sin * inp.st;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const speed = inp.sprint ? SPRINT : WALK;

    const ice = p.grounded && p.groundIdx >= 0 && boxes[p.groundIdx].kind === 'ice';
    const accel = p.grounded ? (ice ? 5 : 55) : 14;
    const hasInput = len > 0.01;
    // na lodzie bez wciśniętego klawisza prawie nie hamujesz
    const accelNow = (ice && !hasInput) ? 1.2 : accel;
    p.vx = approach(p.vx, dx * speed, accelNow * h);
    p.vz = approach(p.vz, dz * speed, accelNow * h);

    // coyote time i bufor skoku
    if (p.grounded) p.coyote = 0.1; else p.coyote -= h;
    p.buffer -= h;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = JUMP;
      p.buffer = 0;
      p.coyote = 0;
      p.grounded = false;
    }

    p.vy = Math.max(p.vy - GRAV * h, -45);

    // oś X
    p.x += p.vx * h;
    for (const b of boxes) {
      if (overlaps(p, b)) {
        p.x = p.vx > 0 ? b.minx - HALF - EPS : b.maxx + HALF + EPS;
        p.vx = 0;
      }
    }
    // oś Z
    p.z += p.vz * h;
    for (const b of boxes) {
      if (overlaps(p, b)) {
        p.z = p.vz > 0 ? b.minz - HALF - EPS : b.maxz + HALF + EPS;
        p.vz = 0;
      }
    }
    // oś Y
    const prevY = p.y;
    p.y += p.vy * h;
    p.grounded = false;
    p.groundIdx = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!overlaps(p, b)) continue;
      if (p.vy <= 0 && prevY >= b.maxy - 0.05) {
        p.y = b.maxy;
        p.vy = 0;
        p.grounded = true;
        p.groundIdx = i;
      } else if (p.vy > 0) {
        p.y = b.miny - HEIGHT;
        p.vy = 0;
      }
    }
  }
}
