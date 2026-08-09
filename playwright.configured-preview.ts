import { defineConfig, devices } from "@playwright/test";

function configuredPreviewBaseUrl(): string {
  const rawValue = process.env.PREVIEW_BASE_URL?.trim();
  if (!rawValue) {
    throw new Error(
      "PREVIEW_BASE_URL is required for configured-preview verification.",
    );
  }

  const parsed = new URL(rawValue);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "PREVIEW_BASE_URL must not contain credentials, query parameters, or a fragment.",
    );
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(
    parsed.hostname,
  );
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error(
      "PREVIEW_BASE_URL must use HTTPS unless it targets a loopback host.",
    );
  }
  if (parsed.origin === "https://skill-gaming-world.onrender.com") {
    throw new Error(
      "Configured-preview verification refuses to run against the production origin.",
    );
  }

  return parsed.origin;
}

const baseURL = configuredPreviewBaseUrl();

export default defineConfig({
  testDir: "./tests/configured-preview",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: "test-results/configured-preview",
  reporter: [["list"]],
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "configured-preview-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "configured-preview-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
