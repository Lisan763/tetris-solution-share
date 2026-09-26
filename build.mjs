import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const testing = process.argv.includes('--test');

const browser = await build({
  absWorkingDir: root,
  entryPoints: ['src/app.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  write: false,
  legalComments: 'inline',
  logLevel: 'info',
});
const js = browser.outputFiles[0].text;
const css = await readFile(path.join(root, 'web/style.css'), 'utf8');
const template = await readFile(path.join(root, 'web/template.html'), 'utf8');
const html = template.replace('/*__STYLE__*/', css).replace('/*__APP__*/', js);
await mkdir(path.join(root, 'release'), { recursive: true });
await writeFile(path.join(root, 'release', 'Tetris-Solution-Share.html'), html, 'utf8');
try { await import('node:fs/promises').then(fs => fs.rm(path.join(root, 'release', '俄罗斯方块解题分享器.html'), { force: true })); } catch {}

if (testing) {
  await mkdir(path.join(root, '.build'), { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: { tests: 'tests/tests.ts', 'browser-smoke': 'tests/browser-smoke.ts' },
    outdir: '.build',
    bundle: true,
    platform: 'node',
    target: 'node22',
    outExtension: { '.js': '.mjs' },
    format: 'esm',
    sourcemap: true,
    logLevel: 'info',
  });
}

console.log('Standalone release: release/Tetris-Solution-Share.html');
