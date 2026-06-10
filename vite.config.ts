import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
// @ts-expect-error — plain .mjs dev middleware, no type declarations
import { devApi } from "./server/devApi.mjs";

// Build-time transpile (no runtime Babel — PRD §11.8). The same React app
// serves the studio UI (dev), the scaled preview grid, AND the native-size
// capture page. devApi adds /api/analyze + /api/capture in `npm run dev`.
export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
