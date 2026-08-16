import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
async function main() {
  const root = process.cwd();
  const entryPoint = path.join(root, ".ablation", "proof", "arc", "root.tsx");
  const serveUrl = await bundle({ entryPoint });
  const composition = await selectComposition({ serveUrl, id: "Arc", inputProps: {} });
  await renderMedia({ serveUrl, composition, codec: "h264",
    outputLocation: path.join(root, ".ablation", "proof", "arc", "arc.mp4") });
  console.log("OUT: .ablation/proof/arc/arc.mp4");
}
main().catch((e) => { console.error(e); process.exit(1); });
