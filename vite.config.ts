import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';

/**
 * Serves /api/* in `npm run dev` by loading the same Vercel handlers (api/*.ts) through Vite's SSR
 * loader. .env is read here, on the server side only: non-VITE_ variables never reach the browser.
 */
function devApi(): Plugin {
  return {
    name: 'incant-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      const proc = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
      if (proc) for (const key of ['ANTHROPIC_API_KEY', 'LLM_MODE', 'LLM_MODEL', 'ELEVENLABS_API_KEY', 'TTS_MODEL', 'TTS_VOICE']) if (env[key] !== undefined) proc.env[key] ??= env[key];

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const m = /^\/api\/([a-z0-9-]+)(?:\?.*)?$/.exec(url);
        if (!m) return next();
        type Handler = (request: Request) => Response | Promise<Response>;
        let mod: Record<string, Handler | undefined>;
        try {
          mod = (await server.ssrLoadModule(`/api/${m[1]}.ts`)) as Record<string, Handler | undefined>;
        } catch {
          res.statusCode = 404;
          res.end();
          return;
        }
        const handler = mod[req.method ?? 'GET'];
        if (!handler) {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Uint8Array[] = [];
        for await (const chunk of req) chunks.push(chunk as Uint8Array);
        const body = new Uint8Array(new ArrayBuffer(chunks.reduce((n, c) => n + c.length, 0)));
        chunks.reduce((offset, c) => (body.set(c, offset), offset + c.length), 0);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'local');
        const request = new Request(`http://localhost${url}`, {
          method: req.method ?? 'GET',
          headers,
          ...(body.length ? { body } : {}),
        });
        try {
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(new Uint8Array(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(`[api] ${String(err)}`);
          res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Known large vendor chunks: three (~530 kB) and rapier3d-compat (~4.3 MB, WASM inlined
    // as base64, ~1.6 MB gzipped). Warn only if something grows past those.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], rapier: ['@dimforge/rapier3d-compat'] },
      },
    },
  },
});
