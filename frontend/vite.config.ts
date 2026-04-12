import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Prioritize INTERNAL_BACKEND_URL for Docker container-to-container communication
  const backendUrl = process.env.INTERNAL_BACKEND_URL ||
    env.INTERNAL_BACKEND_URL ||
    process.env.VITE_BACKEND_URL ||
    env.VITE_BACKEND_URL ||
    'http://localhost:8000';

  console.log(`🚀 Proxy targeting: ${backendUrl}`);

  // Helper to create proxy config with error handling to avoid noisy alerts
  const createProxyConfig = (isWs = false) => ({
    target: backendUrl,
    changeOrigin: true,
    secure: false,
    ws: isWs,
    configure: (proxy: any) => {
      proxy.on('error', (err: any, _req: any, _res: any) => {
        // Silencing the noisy stack trace during startup/restart
        const code = (err as any).code;
        const message = err.message || '';
        
        if (
          code === 'ECONNREFUSED' || 
          code === 'ENOTFOUND' || 
          code === 'ECONNRESET' ||
          message.includes('ended by the other party') ||
          message.includes('writeAfterFIN')
        ) {
          console.warn(`[proxy] Backend connection issue: ${message || code}. This is usually transient.`);
        } else {
          console.error('[proxy] Unexpected proxy error:', err);
        }
      });
    },
  });

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: {
        clientPort: 3000,
      },
      watch: {
        usePolling: true,
      },
      proxy: {
        // Specific proxy for WebSockets to avoid interfering with regular HTTP calls
        '^/api/v1/.*/ws/.*': createProxyConfig(true),
        '/api': createProxyConfig(true),
        '/ws': createProxyConfig(true),
        '/static': createProxyConfig(false),
      },
    },
    plugins: [
      react(),
      nodePolyfills({
        // Whether to polyfill `node:` protocol imports.
        protocolImports: true,
        exclude: ['net'],
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "http-proxy-agent": path.resolve(__dirname, "./src/utils/empty.ts"),
        "https-proxy-agent": path.resolve(__dirname, "./src/utils/empty.ts"),
        "socks-proxy-agent": path.resolve(__dirname, "./src/utils/empty.ts"),
        "protobufjs/minimal": path.resolve(__dirname, "./src/utils/empty.ts"),
        "protobufjs/minimal.js": path.resolve(__dirname, "./src/utils/empty.ts"),
        "ws": path.resolve(__dirname, "./src/utils/empty.ts"),
        "node:net": path.resolve(__dirname, "./src/utils/mockNet.ts"),
      },
    },
    root: ".",
  };
});