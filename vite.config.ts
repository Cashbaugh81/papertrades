import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The site is served from https://cashbaugh81.github.io/papertrades/, so every
// asset and route lives under /papertrades/. Dev and preview use the same base
// (http://localhost:5173/papertrades/) so nothing differs between them.
export default defineConfig({
  base: "/papertrades/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
