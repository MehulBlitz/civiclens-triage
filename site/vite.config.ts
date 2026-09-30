import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the repo under /<repo>/ unless a CNAME is present, so
// base must match. `npm run build` locally produces relative paths that work
// from ANY sub-path — the safest default for a zip hand-off.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
