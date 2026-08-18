import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

// Three stills per scene — early, middle, late — enough to judge overlap,
// slide furniture, and reveal pacing without rendering full video.
const POINTS = [0.15, 0.55, 0.9];

async function main() {
  const root = process.cwd();
  const serveUrl = await bundle({
    entryPoint: path.join(root, ".verify", "entry.ts"),
    webpackOverride: (config) => {
      config.resolve ??= {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "@decode/animation-api": path.join(root, "src", "decode", "animation-api.tsx"),
      };
      return config;
    },
  });
  for (const id of ["beat-01", "beat-02", "beat-03"]) {
    const composition = await selectComposition({ serveUrl, id, inputProps: {} });
    for (const p of POINTS) {
      const frame = Math.floor(composition.durationInFrames * p);
      const output = path.join(root, ".verify", `${id}_f${frame}.png`);
      await renderStill({ serveUrl, composition, frame, output });
      console.log("still:", output);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
