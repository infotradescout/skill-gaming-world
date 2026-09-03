import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA build. Output in dist/ works as a static deploy on Render and Vercel.
export default defineConfig({
  plugins: [react()],
  server: { host: true },
  preview: { host: true },
});

