/**
 * Standalone Remotion still renderer called by the Python backend's vision
 * gate. Renders a few frames of ONE scene so a vision model can judge what a
 * viewer would actually see — overlap, readability, coverage, whether the
 * visual teaches the beat.
 *
 * Usage: npx tsx scripts/render-stills.ts <scenes.json> <outDir>
 *
 * scenes.json is the same DecodeComposition props shape render-video.ts takes
 * (normally with exactly one scene). Stills land at <outDir>/p<percent>.png,
 * one per sampled progress point, printed one path per line.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

// Webpack takes ~2 minutes; the scene arrives via inputProps at render time,
// so ONE bundle serves every scene and project. Reused when present.
// ponytail: staleness = delete the dir after changing player/composition code;
// wire a source-hash key if that ever bites.
const BUNDLE_CACHE = path.join(".data", "vision", "bundle");

// Early, middle, late — enough to judge staged reveals without a full render.
const POINTS = [0.15, 0.55, 0.9];

async function main() {
  const scenesPath = process.argv[2];
  const outDir = process.argv[3];
  // Any registered composition renders; the vision gate uses the default.
  const compositionId = process.argv[4] ?? "DecodeComposition";
  if (!scenesPath || !outDir) {
    console.error("Usage: npx tsx scripts/render-stills.ts <scenes.json> <outDir> [compositionId]");
    process.exit(1);
  }
  const props = JSON.parse(readFileSync(scenesPath, "utf-8"));
  mkdirSync(outDir, { recursive: true });

  const root = process.cwd();
  const cache = path.join(root, BUNDLE_CACHE);
  const bundled = existsSync(path.join(cache, "index.html"))
    ? cache
    : await bundle({
        entryPoint: path.join(root, "src", "remotion", "root.tsx"),
        outDir: cache,
        webpackOverride: (config) => {
          const aliases = {
            "@": path.join(root, "src"),
            "@decode/animation-api": path.join(root, "src", "decode", "animation-api.tsx"),
        "@decode/motion-api": path.join(root, "src", "decode", "motion-api", "index.ts"),
          };
          return {
            ...config,
            resolve: {
              ...config.resolve,
              alias: { ...(config.resolve?.alias ?? {}), ...aliases },
            },
          };
        },
      });

  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
    inputProps: props,
  });

  for (const point of POINTS) {
    const frame = Math.min(
      composition.durationInFrames - 1,
      Math.floor(composition.durationInFrames * point),
    );
    const output = path.join(outDir, `p${Math.round(point * 100)}.png`);
    await renderStill({
      composition,
      serveUrl: bundled,
      frame,
      output,
      inputProps: props,
    });
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
