import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

async function main() {
  const root = process.cwd(); // apps/frontend
  const entryPoint = path.join(root, ".ablation", "root.tsx");
  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint });
  const composition = await selectComposition({ serveUrl, id: "Bloom", inputProps: {} });
  const outputLocation = path.join(root, ".ablation", "bloom_fframe.mp4");
  console.log("Rendering…");
  await renderMedia({ serveUrl, composition, codec: "h264", outputLocation });
  console.log("OUT:", outputLocation);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
