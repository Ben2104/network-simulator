import { defineConfig } from '@playwright/test';

const ci = !!process.env.CI;

/**
 * E2E and 3D smoke tests. Not part of `npm test` (needs a browser); run with
 * `npm run test:e2e -w @netsim/web`. Starts the API and web dev servers unless already running
 * (locally only; CI always starts its own). CI runs it in the `e2e` job of `.github/workflows/ci.yml`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // Software WebGL shares the runner CPU; parallel scenes starve API/UI updates.
  workers: ci ? 1 : undefined,
  // The HTML report is uploaded as an artifact when the CI job fails.
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    // Software WebGL so the 3D smoke test runs on machines and CI runners without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev',
    cwd: '../..',
    // Through the Vite proxy, so tests start only once the API answers too.
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
});
