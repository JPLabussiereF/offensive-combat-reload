import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The game's version, for what the browser keeps across visits (the map editor's thumbnails): the release tag
 * when the build has one (APP_VERSION, given by the deploy program), else the commit it's built from, or (no
 * git: a Docker build without the tag) the package's version and the build's time.
 */
function buildId(): string {
  const release = process.env.APP_VERSION?.trim();
  if (release && release !== 'dev') return release;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
    return `${pkg.version}+${Date.now().toString(36)}`;
  }
}

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  define: { __OC_BUILD__: JSON.stringify(buildId()) },
  server: {
    port: 5173,
    // Reachable from other machines on the network, so friends can join your session.
    host: true,
    // The game server runs separately in dev (bun run server); proxy its API and WebSocket to keep one
    // origin (the session cookie and the Origin check both rely on it). xfwd passes the player's IP along.
    proxy: {
      '/api': { target: 'http://localhost:8787', xfwd: true },
      '/ws': { target: 'ws://localhost:8787', ws: true, xfwd: true },
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
});
