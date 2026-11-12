import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    // 反代直连容器 IP, 必须监听 0.0.0.0
    host: true,
    // 预览域名走 *.moltly.ai —— 不列白名单 vite 会 "Blocked request.
    // This host is not allowed."
    allowedHosts: [".moltly.ai"],
    // HMR 经 443 回源, 客户端要显式指定端口, 否则拼成 wss://host:/
    hmr: { clientPort: 443 },
  },
});
