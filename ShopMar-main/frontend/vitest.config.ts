import { defineConfig } from "vitest/config"

export default defineConfig({
  envPrefix: ["VITE_", "PUBLIC_"],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})