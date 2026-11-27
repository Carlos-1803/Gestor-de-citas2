import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [react(), {
    name: "entrecortes-offline",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const paths = ["/index.html", "/manifest.json", "/pwa/icon-192.png", "/pwa/icon-512.png",
        ...Object.keys(bundle).filter(path => path.startsWith("assets/")).map(path => "/" + path)];
      const template = readFileSync(new URL("./src/pwa/service-worker.js", import.meta.url), "utf8");
      const entry = Object.values(bundle).find(item => item.type === "chunk" && item.isEntry);
      const version = createHash("sha256").update(JSON.stringify(paths))
        .update(String(bundle["index.html"]?.source || "")).update(template).digest("hex").slice(0, 16);
      this.emitFile({ type: "asset", fileName: "sw.js", source: template
        .replace('["__BUILD_ASSETS__"]', JSON.stringify(paths)).replace("__BUILD_ID__", version)
        .replace("__ENTRY_JS__", "/" + entry.fileName) });
    },
  }],
  server: {
    proxy: {
      "/api": "http://localhost:5191",
      "/uploads": "http://localhost:5191",
    },
  },
});
