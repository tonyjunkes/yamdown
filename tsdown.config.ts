import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    tsgo: true
  },
  entry: ['src/index.ts', 'src/cli.ts', 'src/json-schema.ts'],
  format: ['esm'],
  sourcemap: true
});
