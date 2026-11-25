// Trwały zapis: PostgreSQL (gdy jest DATABASE_URL) albo pliki JSON (lokalnie).
import fs from 'node:fs';
import path from 'node:path';
import type { WorldSettings } from './types';

export interface UserRow { id: number; name: string; pass: string; meta: any }
export interface WorldRow { id: string; settings: WorldSettings; state: any | null; updated: number }

export interface Store {
  init(): Promise<void>;
  getUserByName(name: string): Promise<UserRow | null>;
  getUser(id: number): Promise<UserRow | null>;
  createUser(name: string, pass: string): Promise<UserRow>;
  updateUserMeta(id: number, meta: any): Promise<void>;
  listWorlds(): Promise<{ id: string; settings: WorldSettings; updated: number; day: number }[]>;
  getWorld(id: string): Promise<WorldRow | null>;
  saveWorld(id: string, settings: WorldSettings, state: any | null): Promise<void>;
  deleteWorld(id: string): Promise<void>;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    pass TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    settings JSONB NOT NULL,
    state JSONB,
    day INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)`,
];

export class PgStore implements Store {
  private pool: any;
  constructor(private url: string) {}
  async init() {
    const pg = await import('pg');
    const Pool = (pg as any).default?.Pool || (pg as any).Pool;
    const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(this.url) ? false : { rejectUnauthorized: false };
    this.pool = new Pool({ connectionString: this.url, ssl, max: 5 });
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        for (const m of MIGRATIONS) await this.pool.query(m);
        console.log('[db] PostgreSQL gotowy (migracje wykonane)');
        return;
      } catch (e: any) {
        console.warn('[db] próba połączenia', attempt + 1, e.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw new Error('Nie udało się połączyć z PostgreSQL');
  }
  async getUserByName(name: string) {
    const r = await this.pool.query('SELECT id,name,pass,meta FROM users WHERE lower(name)=lower($1)', [name]);
    return r.rows[0] || null;
  }
  async getUser(id: number) {
    const r = await this.pool.query('SELECT id,name,pass,meta FROM users WHERE id=$1', [id]);
    return r.rows[0] || null;
  }
  async createUser(name: string, pass: string) {
    const r = await this.pool.query('INSERT INTO users(name,pass) VALUES($1,$2) RETURNING id,name,pass,meta', [name, pass]);
    return r.rows[0];
  }
  async updateUserMeta(id: number, meta: any) {
    await this.pool.query('UPDATE users SET meta=$2 WHERE id=$1', [id, meta]);
  }
  async listWorlds() {
    const r = await this.pool.query('SELECT id,settings,day,extract(epoch from updated_at)*1000 AS updated FROM worlds ORDER BY updated_at DESC LIMIT 100');
    return r.rows.map((x: any) => ({ id: x.id, settings: x.settings, day: x.day, updated: +x.updated }));
  }
  async getWorld(id: string) {
    const r = await this.pool.query('SELECT id,settings,state,extract(epoch from updated_at)*1000 AS updated FROM worlds WHERE id=$1', [id]);
    const x = r.rows[0];
    return x ? { id: x.id, settings: x.settings, state: x.state, updated: +x.updated } : null;
  }
  async saveWorld(id: string, settings: WorldSettings, state: any) {
    const day = state?.time ? Math.floor(state.time / settings.dayLength) + 1 : 1;
    await this.pool.query(
      `INSERT INTO worlds(id,settings,state,day,updated_at) VALUES($1,$2,$3,$4,now())
       ON CONFLICT (id) DO UPDATE SET settings=$2, state=COALESCE($3, worlds.state), day=$4, updated_at=now()`,
      [id, settings, state ? JSON.stringify(state) : null, day],
    );
  }
  async deleteWorld(id: string) {
    await this.pool.query('DELETE FROM worlds WHERE id=$1', [id]);
  }
}

export class FileStore implements Store {
  constructor(private dir: string) {}
  private f(name: string) { return path.join(this.dir, name); }
  private readJson(name: string, def: any) {
    try { return JSON.parse(fs.readFileSync(this.f(name), 'utf8')); } catch { return def; }
  }
  private writeJson(name: string, data: any) {
    const tmp = this.f(name + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.f(name));
  }
  async init() {
    fs.mkdirSync(path.join(this.dir, 'worlds'), { recursive: true });
    console.log('[db] zapis plikowy w', this.dir, '(ustaw DATABASE_URL, aby użyć PostgreSQL)');
  }
  async getUserByName(name: string) {
    const users: UserRow[] = this.readJson('users.json', []);
    return users.find((u) => u.name.toLowerCase() === name.toLowerCase()) || null;
  }
  async getUser(id: number) {
    const users: UserRow[] = this.readJson('users.json', []);
    return users.find((u) => u.id === id) || null;
  }
  async createUser(name: string, pass: string) {
    const users: UserRow[] = this.readJson('users.json', []);
    if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) throw new Error('exists');
    const u = { id: (users.at(-1)?.id || 0) + 1, name, pass, meta: {} };
    users.push(u);
    this.writeJson('users.json', users);
    return u;
  }
  async updateUserMeta(id: number, meta: any) {
    const users: UserRow[] = this.readJson('users.json', []);
    const u = users.find((x) => x.id === id);
    if (u) { u.meta = meta; this.writeJson('users.json', users); }
  }
  async listWorlds() {
    const idx: Record<string, any> = this.readJson('worlds.json', {});
    return Object.entries(idx).map(([id, v]: any) => ({ id, settings: v.settings, updated: v.updated, day: v.day || 1 })).sort((a, b) => b.updated - a.updated);
  }
  async getWorld(id: string) {
    const idx: Record<string, any> = this.readJson('worlds.json', {});
    if (!idx[id]) return null;
    const state = this.readJson(path.join('worlds', id + '.json'), null);
    return { id, settings: idx[id].settings, state, updated: idx[id].updated };
  }
  async saveWorld(id: string, settings: WorldSettings, state: any) {
    const idx: Record<string, any> = this.readJson('worlds.json', {});
    const day = state?.time ? Math.floor(state.time / settings.dayLength) + 1 : idx[id]?.day || 1;
    idx[id] = { settings, updated: Date.now(), day };
    this.writeJson('worlds.json', idx);
    if (state) this.writeJson(path.join('worlds', id + '.json'), state);
  }
  async deleteWorld(id: string) {
    const idx: Record<string, any> = this.readJson('worlds.json', {});
    delete idx[id];
    this.writeJson('worlds.json', idx);
    try { fs.unlinkSync(this.f(path.join('worlds', id + '.json'))); } catch { /* */ }
  }
}
