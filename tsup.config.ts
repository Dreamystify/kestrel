/**
 * @fileoverview tsup configuration for @dreamystify/kestrel
 * 
 * This configuration handles ES module bundling for the kestrel 
 * distributed ID generation library.
 * 
 * @author Corey Lylyk
 * @version 3.0.0
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
    entry: 'src/index.ts',
    compilerOptions: {
      moduleResolution: 'bundler',
      module: 'ES2022'
    }
  },
  sourcemap: true,
  clean: true,
  outDir: 'lib',
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  platform: 'node',
  external: ['ioredis', 'big-integer', 'redis'],
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs',
    }
  },
});

