import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev`    desktop, http://localhost:5173
// `npm run phone`  HTTPS on your Wi-Fi so an iPhone can use its compass (Safari needs HTTPS for motion sensors)
// The LangChain agent runs on :8000. When it's down the app falls back to its offline parser.
const phone = process.env.PHONE === "1";

export default defineConfig({
  plugins: phone ? [basicSsl()] : [],
  server: {
    port: 5173,
    host: phone ? true : "localhost",
    open: !phone,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 900 },
});
