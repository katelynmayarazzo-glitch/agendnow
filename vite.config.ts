import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  base: mode === "arquivo" ? "./" : "/agendnow/",
  plugins: [react(), tailwindcss(), ...(mode === "arquivo" ? [viteSingleFile()] : [])],
  build: mode === "arquivo" ? { outDir: "dist-arquivo" } : {},
}));
