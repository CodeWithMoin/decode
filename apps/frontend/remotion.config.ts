import path from "node:path";
import { Config } from "@remotion/cli/config";

// `remotion studio` bundles root.tsx without Next's tsconfig path aliases, so
// teach webpack the same three the render scripts (scripts/render-stills.ts)
// already alias at bundle time.
// process.cwd() is apps/frontend under `npm run studio`; __dirname would point
// into the hoisted @remotion/cli dist, not the project.
const root = process.cwd();

Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      "@": path.join(root, "src"),
      "@decode/animation-api": path.join(root, "src", "decode", "animation-api.tsx"),
      "@decode/motion-api": path.join(root, "src", "decode", "motion-api", "index.ts"),
      // The seed library is backend-owned (it shapes generation); the Studio
      // preview imports the same file so there is one canonical seed.
      "@decode/seeds": path.join(root, "..", "backend", "decode", "agents", "renderer", "seeds"),
    },
  },
}));
