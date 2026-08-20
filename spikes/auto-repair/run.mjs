import { readFileSync } from "node:fs";
import { repair, audit, demo, SAFE } from "./repair.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url))).boxes;

console.log("SafeArea:", SAFE, "\n");

for (const f of ["measured-beat01.json"]) {
  const boxes = load(f);
  const before = audit(boxes);
  const { boxes: fixed, actions } = repair(boxes);
  const after = audit(fixed);
  console.log(`== ${f} (${boxes.length} boxes, ${boxes.filter(b=>b.tag==="card").length} cards)`);
  console.log("   before:", JSON.stringify(before));
  console.log("   repair:", actions.length ? actions.join("; ") : "no change needed");
  console.log("   after :", JSON.stringify(after), "\n");
}

console.log("== synthetic stress (off-frame + overlap)");
const d = demo();
console.log("   before:", JSON.stringify(d.before));
console.log("   repair:", d.actions.join("; "));
console.log("   after :", JSON.stringify(d.after));
console.log("\nself-check assertions passed (no AssertionError thrown above)");
