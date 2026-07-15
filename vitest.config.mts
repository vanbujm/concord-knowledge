import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Never descend into git worktrees or skill bundles kept under .claude; they
    // are separate repo copies whose stale test files would run here otherwise.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
