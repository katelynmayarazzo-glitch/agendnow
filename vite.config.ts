import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:arquivo` gera UM único .html que abre direto no navegador (sem servidor).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "arquivo" ? [viteSingleFile()] : [])],
  build: mode === "arquivo" ? { outDir: "dist-arquivo" } : {},
}));
