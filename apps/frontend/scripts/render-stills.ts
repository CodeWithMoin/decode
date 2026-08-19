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

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

// Early, middle, late — enough to judge staged reveals without a full render.
const POINTS = [0.15, 0.55, 0.9];

async function main() {
  const scenesPath = process.argv[2];
  const outDir = process.argv[3];
  if (!scenesPath || !outDir) {
    console.error("Usage: npx tsx scripts/render-stills.ts <scenes.json> <outDir>");
    process.exit(1);
  }
  const props = JSON.parse(readFileSync(scenesPath, "utf-8"));
  mkdirSync(outDir, { recursive: true });

  const root = process.cwd();
  const bundled = await bundle({
    entryPoint: path.join(root, "src", "remotion", "root.tsx"),
    webpackOverride: (config) => {
      const aliases = {
        "@": path.join(root, "src"),
        "@decode/animation-api": path.join(root, "src", "decode", "animation-api.tsx"),
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
    id: "DecodeComposition",
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
