import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');

async function build() {
  const mainContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, 'src/main/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.resolve(__dirname, 'dist-electron/main.cjs'),
    external: ['electron', 'better-sqlite3'],
    sourcemap: true
  });

  const preloadContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, 'src/preload/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.resolve(__dirname, 'dist-electron/preload.cjs'),
    external: ['electron'],
    sourcemap: true
  });

  if (isWatch) {
    await mainContext.watch();
    await preloadContext.watch();
    console.log('[Electron Build] Watching for changes...');
  } else {
    await mainContext.rebuild();
    await preloadContext.rebuild();
    await mainContext.dispose();
    await preloadContext.dispose();
    console.log('[Electron Build] Main & Preload built successfully.');
  }
}

build().catch((err) => {
  console.error('[Electron Build Error]', err);
  process.exit(1);
});
