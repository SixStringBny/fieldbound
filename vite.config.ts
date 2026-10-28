import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';

/**
 * Fieldbound ships a static, same-origin-only app. The policy is injected into
 * the production HTML only; the dev server must stay policy-free so the React
 * Fast Refresh runtime and its WebSocket keep working.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  // React style props render as style attributes; inline styles are not script.
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
].join('; ');

function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'fieldbound-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/**
 * Vite expects a base that starts and ends with a slash. `VITE_BASE` is the
 * single deployment switch: `/` for local preview, `/<repository>/` for GitHub
 * Pages. No runtime code reads a host name.
 */
export function normalizeBase(rawBase: string | undefined): string {
  if (!rawBase || rawBase === '/') {
    return '/';
  }

  const withLeadingSlash = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = normalizeBase(process.env.VITE_BASE ?? env.VITE_BASE);

  return {
    base,
    plugins: [react(), contentSecurityPolicyPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      clearMocks: true,
      restoreMocks: true,
    },
  };
});
