// Build klienta i serwera (esbuild).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
fs.mkdirSync('dist/public', { recursive: true });
for (const f of fs.readdirSync('public')) fs.cpSync(path.join('public', f), path.join('dist/public', f), { recursive: true });

const client = {
  entryPoints: ['client/main.ts'],
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: 'es2020',
  outfile: 'dist/public/game.js',
  logLevel: 'info',
};
const server = {
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/server.js',
  packages: 'external',
  logLevel: 'info',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
};

if (watch) {
  const c = await esbuild.context(client);
  const s = await esbuild.context(server);
  await Promise.all([c.watch(), s.watch()]);
  console.log('Obserwuję zmiany... (uruchom w drugim terminalu: npm start)');
} else {
  await Promise.all([esbuild.build(client), esbuild.build(server)]);
}
