import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Vite と Vitest の共通設定。 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
