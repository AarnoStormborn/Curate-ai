import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  sourcemap: true,
  // Bundle the workspace shared package (its main is TS source, which plain
  // `node` at runtime cannot load — tsx/vite can, but dist must be self-contained).
  noExternal: ["@curate-ai/shared"],
});
