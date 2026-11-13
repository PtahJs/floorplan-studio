import { defineConfig, devices } from "@playwright/test";

// tri-3d-pub-floorplan e2e: webServer launches vite automatically (the dev server is started/stopped by the test process).
// Run: npm run test:e2e
export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: { timeout: 15_000 },
    // 3D pages are heavy on GPU/WGSL compilation; serial is more stable. Headless pages running WebGPU continuously
    // hit device races (first run often hangs, next run self-heals) — retries as a fallback
    workers: 1,
    retries: 2,
    reporter: [["list"]],
    use: {
        baseURL: "http://localhost:5180",
        // enable WebGPU where possible even headless; when unavailable, the three WebGPURenderer falls back to WebGL2
        launchOptions: {
            args: ["--enable-unsafe-webgpu"],
        },
    },
    webServer: {
        command: "pnpm dev --port 5180 --strictPort",
        url: "http://localhost:5180",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
