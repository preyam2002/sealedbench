import { defineConfig } from "vitest/config";

// Only the pure leaderboard logic is unit-tested here (no DOM / Next runtime).
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
