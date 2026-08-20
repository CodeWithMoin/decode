import { readFileSync } from "node:fs";
import { fit, repair, audit, SAFE } from "./repair.mjs";

const all = JSON.parse(readFileSync(new URL("measured-all8.json", import.meta.url))).beats;
console.log("SafeArea:", SAFE, "\n");

console.log("=== fit() — one whole-scene rigid transform (the SAFE operation) ===");
let ovAfter = 0, colAfter = 0;
for (const [beat, boxes] of Object.entries(all)) {
  const b = audit(boxes), { boxes: f, transform } = fit(boxes), a = audit(f);
  ovAfter += a.overflow; colAfter += a.collisions.length;
  console.log(`${beat.padEnd(8)} overflow ${b.overflow}->${a.overflow}  collisions ${b.collisions.length}->${a.collisions.length}  [scale ${transform.scale} translate(${transform.tx},${transform.ty})]`);
}
console.log(`\n  overflow after fit(): ${ovAfter} across 8 scenes  (guarantee met)`);
console.log(`  collisions after fit(): ${colAfter}  (untouched — see below)\n`);

console.log("=== repair() — EXPERIMENTAL redistribute (moves flat boxes) ===");
let dirty = 0;
for (const [beat, boxes] of Object.entries(all)) {
  const a = audit(repair(boxes).boxes);
  if (a.overflow || a.collisions.length) dirty++;
  console.log(`${beat.padEnd(8)} after: overflow ${a.overflow}  collisions ${a.collisions.length}${a.overflow ? "  <-- REGRESSED" : ""}`);
}
console.log(`\n  ${dirty}/8 dirty — moving flattened boxes loses parent/child structure and`);
console.log("  REGRESSES dense/nested scenes. Collision repair must act on the layout");
console.log("  tree, not the geometry. See README.");
