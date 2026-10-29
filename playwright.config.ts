import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright harness for the Fieldbound production build.
 *
 * The suite never starts the dev server: `webServer` runs the same build the
 * deploy workflow ships, then serves `dist` with `vite preview` on a fixed host
 * and port. `--strictPort` plus `reuseExistingServer: false` means a foreign
 * process already holding 4173 fails the run instead of silently testing
 * something else.
 *
 * Long solo and duel journeys belong to the Chromium project; smoke and
 * responsive checks run on all three engines (REL-FR-01, REL-FR-03).
 */

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;

/**
 * The web server must always serve a root-path build, whatever VITE_BASE the
 * surrounding shell carries. Copying the environment also preserves the
 * Playwright browser cache location and CI variables.
 */
const webServerEnv: Record<string, string> = {};

for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) {
    webServerEnv[key] = value;
  }
}

webServerEnv.VITE_BASE = '/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // The build is part of the harness: specs only ever see `dist`.
    command: 'npm run build && npm run serve:dist',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: webServerEnv,
  },
});
