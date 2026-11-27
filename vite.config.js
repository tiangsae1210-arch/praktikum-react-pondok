import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "client",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        configure(proxy) {
          proxy.on("error", (_error, _request, response) => {
            if (!("writeHead" in response) || response.headersSent) return;
            response.writeHead(503, { "Content-Type": "application/json" });
            response.end(JSON.stringify({
              message:
                "Backend SANTRI-CATAT tidak dapat dihubungi. Periksa terminal server, konfigurasi .env, dan koneksi database Neon.",
            }));
          });
        },
      },
    },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
