import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  // tsconfig says "jsx": "preserve" (Next compiles it); tests need real JSX.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
  },
});
