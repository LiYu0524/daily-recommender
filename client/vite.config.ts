import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST ?? "127.0.0.1";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isProduction = mode === "production";
  const base = isProduction ? (env.VITE_PUBLIC_BASE || "/desktop/") : "/";

  return {
    base,
    plugins: [react()],
    clearScreen: false,
    server: {
      host,
      port: 1420,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:8090",
        "/ws": {
          target: "ws://127.0.0.1:8090",
          ws: true,
        },
        "/health": "http://127.0.0.1:8090",
      },
    },
  };
});
