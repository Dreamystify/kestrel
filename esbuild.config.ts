/**
 * @fileoverview esbuild configuration for @dreamystify/kestrel
 * 
 * This configuration handles ES module bundling for the kestrel 
 * distributed ID generation library.
 * 
 * @author Corey Lylyk
 * @version 2.0.0
 */

import { build, type BuildOptions } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const config: BuildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  outdir: 'lib',
  platform: 'node',
  target: 'ES2022',
  sourcemap: true,
  external: ['ioredis', 'big-integer', 'redis']
};

async function buildLibrary() {
  try {
    console.log(`🚀 Building @dreamystify/kestrel...`);
    const startTime = Date.now();
    
    await build(config);
    
    // Copy the Lua script to the lib directory
    const scriptsDir = join('lib', 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    copyFileSync('src/scripts/generateIds.lua', join(scriptsDir, 'generateIds.lua'));
    console.log(`📄 Copied Lua script to ${scriptsDir}/generateIds.lua`);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`✅ Build completed successfully in ${duration}ms!`);
    console.log(`📦 Output: lib/index.js`);
    console.log(`🎯 Format: ES modules`);
    console.log(`🔧 Target: ${config.target}`);
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildLibrary();
}

export default config;