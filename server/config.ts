// Server settings from the environment. Defaults match `docker compose up -d banco redis` on this machine,
// so `bun run dev:online` works with no .env file.
const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

/** Default first-admin credentials: for development only (the server warns when production starts with them). */
export const ADMIN_BOOTSTRAP_DEFAULTS = { email: 'admin@cadu.com', password: 'admin' };

export const CONFIG = {
  production: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://oc:oc@localhost:5442/oc',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6392',
  /**
   * Extra origins allowed to call the API and open the WebSocket. Same-origin requests (the page served
   * by this server, by nginx or through Vite's proxy) are always allowed.
   */
  origins: list(process.env.ORIGENS_PERMITIDAS),
  /** Where the GLB models uploaded for the maps are kept, one file per SHA-256 (a Docker volume in production). */
  mapAssetsDir: process.env.MAPAS_DIR ?? './dados/mapas',
  /** The first admin, made at start while no account is admin (server/bootstrapAdmin.ts). */
  adminBootstrap: {
    email: process.env.ADMIN_BOOTSTRAP_EMAIL ?? ADMIN_BOOTSTRAP_DEFAULTS.email,
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? ADMIN_BOOTSTRAP_DEFAULTS.password,
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID ?? '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    /** Full return URLs registered in the Discord app, one per address the game is played from. */
    returns: list(process.env.DISCORD_RETORNOS),
  },
  smtp: {
    user: process.env.SMTP_USUARIO ?? '',
    appPassword: process.env.SMTP_SENHA_APP ?? '',
    from: process.env.SMTP_REMETENTE ?? process.env.SMTP_USUARIO ?? '',
  },
  /**
   * SHA-256 (lowercase hex) of the remote deploy key (server/deploy.ts); the key itself never reaches the server.
   * Empty (the default, and in development): the /api/deploy routes answer 404.
   */
  deployKeyHash: process.env.DEPLOY_KEY_HASH ?? '',
};
