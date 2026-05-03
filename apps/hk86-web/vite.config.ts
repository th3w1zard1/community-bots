import { defineConfig } from "vite";

const base = process.env.BASE || "/";

export default defineConfig({
  base,
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
});
