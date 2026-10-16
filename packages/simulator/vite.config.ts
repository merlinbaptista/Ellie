import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const apiTarget = process.env.SIMULATOR_API_TARGET ?? "http://127.0.0.1:8787";
export default defineConfig({
  base: "/sim/",
  plugins: [react()],
  server: { proxy: { "/api": apiTarget, "/mcp": apiTarget, "/phone": apiTarget, "/l": apiTarget } },
  build: { outDir: "dist", rollupOptions: { output: { manualChunks: undefined } } },
});
