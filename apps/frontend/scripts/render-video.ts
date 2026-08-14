/**
 * Standalone Remotion render script called by the Python backend worker.
 *
 * Usage: npx tsx scripts/render-video.ts <scenes.json> <output.mp4>
 *
 * Runs from `apps/frontend` (the worker sets `render_cwd`), so every path below
 * is resolved against `process.cwd()` rather than this file's location — the
 * script must work whether it is invoked from the repo root or a deployed copy.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

async function main() {
  const scenesPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!scenesPath || !outputPath) {
    console.error("Usage: npx tsx scripts/render-video.ts <scenes.json> <output.mp4>");
    process.exit(1);
  }

  const raw = readFileSync(scenesPath, "utf-8");
  const props = JSON.parse(raw);

  const root = process.cwd();
  const entryPoint = path.join(root, "src", "remotion", "root.tsx");

  console.log(`Bundling ${entryPoint}...`);
  const bundled = await bundle({
    entryPoint,
    webpackOverride: (config) => {
      // The Remotion bundler does not read the Next.js tsconfig, so it cannot
      // see the two path aliases the composition imports. Map them explicitly:
      // `@/` to the app source, and the Decode SDK to its local implementation.
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

  console.log("Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundled,
    id: "DecodeComposition",
    inputProps: props,
  });

  console.log(`Rendering to ${outputPath}...`);
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
  });

  console.log(`Done: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
