import { defineConfig } from 'tsup';

const shared = {
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'] as ('esm' | 'cjs')[],
  dts: true,
  sourcemap: true,
  clean: false,
  target: 'es2020',
  external: ['ws'],
};

export default defineConfig([
  {
    ...shared,
    outDir: 'dist/node',
    platform: 'node',
    clean: true,
  },
  {
    ...shared,
    outDir: 'dist/browser',
    platform: 'browser',
    // Never bundle the node-only ws fallback into browser builds.
    esbuildOptions(options) {
      options.external = [...(options.external ?? []), 'ws'];
    },
  },
]);
