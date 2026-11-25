// Silnik questów: postęp, nagrody, questy świata, codzienne zlecenia.
import { QUESTS, QuestDef, DAILY_TEMPLATES } from '../shared/data/quests';
import type { World } from './world';
import type { Player } from './types';
import { countItem } from './inventory';

function questActive(qp: { done?: boolean } | undefined) {
  return qp && !qp.done;
}

export function questEvent(w: World, p: Player | null, kind: string, target: string, n = 1) {
  if (p) {
    for (const [qid, qp] of Object.entries(p.quests)) {
      if (!questActive(qp)) continue;
      const q = QUESTS[qid];
      if (!q) continue;
      let ch = false;
      q.goals.forEach((g, i) => {
        if (g.k !== kind) return;
        if (g.t !== '*' && g.t !== target) return;
        if (qp.g[i] >= g.n) return;
        qp.g[i] = Math.min(g.n, qp.g[i] + n);
        ch = true;
      });
      if (ch) { p.dirty.quests = true; checkComplete(w, p, qid); }
    }
    // codzienne zlecenia
    for (const t of w.daily.tasks) {
      if (t.done || t.k !== kind || (t.t !== '*' && t.t !== target)) continue;
      t.prog = Math.min(t.n, t.prog + n);
      if (t.prog >= t.n) {
        t.done = true;
        for (const [it, k] of t.reward) w.giveItem(p, it, k, true);
        w.broadcast({ t: 'toast', text: `📋 ${p.name} wykonał(a) zlecenie: ${t.label}`, kind: 'good' });
      }
      for (const q of w.players.values()) q.dirty.quests = true;
    }
  }
  // questy świata (wszyscy przyczyniają się)
  for (const [qid, qp] of Object.entries(w.wq)) {
    if (!questActive(qp)) continue;
    const q = QUESTS[qid];
    if (!q) continue;
    let ch = false;
    q.goals.forEach((g, i) => {
      if (g.k !== kind || g.k === 'contribute') return;
      if (g.t !== '*' && g.t !== target) return;
      if (kind === 'survive' && p) return; // dni liczone globalnie (p=null)
      if (kind === 'activate' && g.t === 'stone_circle') { qp.g[i] = Math.min(g.n, (w.flags.circles || []).length); ch = true; return; }
      if (qp.g[i] >= g.n) return;
      qp.g[i] = Math.min(g.n, qp.g[i] + n);
      ch = true;
    });
    if (ch) { for (const q2 of w.players.values()) q2.dirty.quests = true; checkWorldComplete(w, qid); }
  }
}

function goalsDone(q: QuestDef, g: number[], p?: Player) {
  return q.goals.every((goal, i) => {
    if (goal.k === 'deliver') return p ? countItem(p.inv, goal.t) >= goal.n : false;
    return g[i] >= goal.n;
  });
}

export function checkComplete(w: World, p: Player, qid: string) {
  const q = QUESTS[qid];
  const qp = p.quests[qid];
  if (!q || !qp || qp.done) return;
  if (q.goals.some((g) => g.k === 'deliver')) return; // oddaje się u zleceniodawcy
  if (!goalsDone(q, qp.g, p)) return;
  completeQuest(w, p, qid);
}

export function completeQuest(w: World, p: Player, qid: string) {
  const q = QUESTS[qid];
  const qp = p.quests[qid];
  qp.done = true;
  p.tracked = p.tracked.filter((t) => t !== qid);
  for (const [it, n] of q.rewards.items || []) w.giveItem(p, it, n, true);
  for (const r of q.rewards.recipes || []) { p.known.add(r); p.dirty.known = true; }
  w.send(p, { t: 'qdone', title: q.title, msg: q.rewards.msg || '' });
  p.dirty.quests = true;
  startAutoQuests(w, p);
}

function checkWorldComplete(w: World, qid: string) {
  const q = QUESTS[qid];
  const qp = w.wq[qid];
  if (!q || !qp || qp.done) return;
  if (!goalsDone(q, qp.g)) return;
  qp.done = true;
  for (const p of w.players.values()) {
    for (const [it, n] of q.rewards.items || []) w.giveItem(p, it, n, true);
    w.send(p, { t: 'qdone', title: q.title, msg: q.rewards.msg || '', world: 1 });
    p.dirty.quests = true;
  }
  if (q.rewards.flag) {
    w.flags[q.rewards.flag] = true;
    if (q.rewards.flag === 'tower') { w.mapAll.fill(255); w.sendMaps(); }
  }
  startAutoQuests(w, null);
}

/** Uruchamia questy, których wymagania są spełnione. */
export function startAutoQuests(w: World, p: Player | null) {
  for (const q of Object.values(QUESTS)) {
    if (q.scope === 'world') {
      if (w.wq[q.id]) continue;
      if ((q.req || []).every((r) => w.wq[r]?.done)) {
        w.wq[q.id] = { g: q.goals.map(() => 0) };
        if (q.id === 'act1') w.wq[q.id].g[0] = Math.min(3, w.clk ? w.clk.day - 1 : 0);
        for (const pl of w.players.values()) { pl.dirty.quests = true; w.send(pl, { t: 'qnew', title: q.title, world: 1 }); }
      }
    } else if (p) {
      if (p.quests[q.id] || q.giver) continue;
      if (q.type === 'char' && q.char !== p.char) continue;
      if (q.type !== 'tutorial' && q.type !== 'char' && q.type !== 'explore') continue;
      if ((q.req || []).every((r) => p.quests[r]?.done)) {
        w.questStart(p, q.id);
        if (q.type === 'tutorial') w.send(p, { t: 'qnew', title: q.title });
      }
    }
  }
}

export function questSummary(w: World, p: Player) {
  const list: any[] = [];
  for (const [qid, qp] of Object.entries(p.quests)) {
    const q = QUESTS[qid];
    if (!q) continue;
    list.push({
      id: qid, title: q.title, desc: q.desc, type: q.type, done: !!qp.done, tr: p.tracked.includes(qid), giver: q.giver,
      goals: q.goals.map((g, i) => ({ l: g.label, n: g.n, c: g.k === 'deliver' ? Math.min(g.n, countItem(p.inv, g.t)) : qp.g[i] })),
    });
  }
  for (const [qid, qp] of Object.entries(w.wq)) {
    const q = QUESTS[qid];
    if (!q) continue;
    list.push({
      id: qid, title: q.title, desc: q.desc, type: q.type, done: !!qp.done, world: 1, tr: !qp.done,
      goals: q.goals.map((g, i) => ({ l: g.label, n: g.n, c: qp.g[i] })),
    });
  }
  return { list, daily: w.daily.tasks.map((t) => ({ l: t.label, n: t.n, c: t.prog, done: t.done, rw: t.reward })) };
}

export function dailyTick(w: World) {
  if (!w.daily || w.daily.day === w.clk.day) return;
  if (![...w.structs.values()].some((s) => s.type === 'quest_board')) { w.daily = { day: w.clk.day, tasks: [] }; return; }
  const tasks: any[] = [];
  const pool = [...DAILY_TEMPLATES];
  for (let i = 0; i < 3 && pool.length; i++) {
    const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const n = t.n[0] + Math.floor(Math.random() * (t.n[1] - t.n[0] + 1));
    tasks.push({ k: t.k, t: t.t, n, prog: 0, done: false, label: `${t.label} (${n})`, reward: t.reward });
  }
  w.daily = { day: w.clk.day, tasks };
  w.broadcast({ t: 'toast', text: '📋 Nowe zlecenia na Tablicy ogłoszeń!', kind: 'info' });
  for (const p of w.players.values()) p.dirty.quests = true;
}

export function npcQuestsFor(w: World, p: Player, giver: string) {
  const offer: any[] = [], active: any[] = [];
  for (const q of Object.values(QUESTS)) {
    if (q.giver !== giver) continue;
    const qp = p.quests[q.id];
    if (!qp) {
      if ((q.req || []).every((r) => p.quests[r]?.done)) offer.push({ id: q.id, title: q.title, desc: q.desc });
    } else if (!qp.done) {
      const ready = q.goals.every((g, i) => (g.k === 'deliver' ? countItem(p.inv, g.t) >= g.n : qp.g[i] >= g.n));
      active.push({ id: q.id, title: q.title, ready });
    }
  }
  return { offer, active };
}
