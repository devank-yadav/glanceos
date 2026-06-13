import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // Served by the server at /screen in production; plain root in dev.
  base: command === "build" ? "/screen/" : "/",
  build: {
    // Old smart-TV browsers are first-class citizens.
    target: "es2017",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
}));
