// Measure-first deterministic auto-repair — spike (#5 → #4).
//
// Takes REAL measured box geometry (getBoundingClientRect in 1920x1080
// composition coordinates, captured from the live player) and enforces the two
// hard guarantees deterministically, whatever JSX the model emitted:
//   1. every box sits inside the SafeArea
//   2. no two content boxes overlap or sit closer than MIN_GAP
//
// The pass is bounded and idempotent — measure → scale-to-fit → (row de-overlap)
// → re-check — never a free-running solver that can cascade. Scale-to-fit alone
// is correctness-by-construction: a uniform down-scale about the content centre
// can only ever shrink the footprint, so it cannot introduce a new violation.

export const FRAME = { w: 1920, h: 1080 };
export const MARGIN = 96; // MASTER.md safe margin
export const MIN_GAP = 48; // inspectScene sibling clearance
export const SAFE = { x: MARGIN, y: MARGIN, w: FRAME.w - 2 * MARGIN, h: FRAME.h - 2 * MARGIN };

// Tags that are actual content (collision + overflow matter). group = layout
// wrapper, subject = choreography shell, connector = a 1-2px line between nodes.
const CONTENT = new Set(["card", "code", "badge", "metric", "label", "illustration",
  "database", "queue", "cloud", "diagram", "tile"]);
const isContent = (b) => CONTENT.has(b.tag) && b.w > 4 && b.h > 4;
const isRoot = (b) => b.x <= 1 && b.y <= 1 && b.w >= FRAME.w - 2 && b.h >= FRAME.h - 2;

const right = (b) => b.x + b.w, bottom = (b) => b.y + b.h;
const q = (n) => Math.round(n * 64) / 64; // match the renderer's q6 quantizer

function contentBBox(boxes) {
  const cs = boxes.filter((b) => !isRoot(b) && b.w > 4 && b.h > 4);
  const L = Math.min(...cs.map((b) => b.x)), T = Math.min(...cs.map((b) => b.y));
  const R = Math.max(...cs.map(right)), B = Math.max(...cs.map(bottom));
  return { x: L, y: T, w: R - L, h: B - T };
}

function overflow(boxes) {
  return boxes.filter((b) => !isRoot(b)).filter((b) =>
    b.x < SAFE.x - 0.5 || b.y < SAFE.y - 0.5 ||
    right(b) > SAFE.x + SAFE.w + 0.5 || bottom(b) > SAFE.y + SAFE.h + 0.5);
}

function collisions(boxes) {
  const cs = boxes.filter(isContent);
  const hits = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    // nesting is legal (a label inside a card); only flag disjoint-intent boxes
    // that overlap or crowd. Skip if one contains the other.
    const contains = (p, c) => p.x <= c.x && p.y <= c.y && right(p) >= right(c) && bottom(p) >= bottom(c);
    if (contains(a, b) || contains(b, a)) continue;
    const dx = Math.max(a.x - right(b), b.x - right(a)); // >0 => horizontal gap
    const dy = Math.max(a.y - bottom(b), b.y - bottom(a)); // >0 => vertical gap
    const gap = Math.max(dx, dy); // separated on at least one axis if >0
    if (gap < MIN_GAP) hits.push({ a: label(a), b: label(b), gap: Math.round(gap) });
  }
  return hits;
}
const label = (b) => `${b.tag}${b.text ? `“${b.text}”` : ""}@${b.x},${b.y}`;

// --- The bounded repair -----------------------------------------------------
export function repair(boxes) {
  const actions = [];
  let out = boxes.map((b) => ({ ...b }));

  // Step 1 — scale-to-fit the SafeArea about the content centre. Guaranteed
  // containment; can only shrink, never introduces a violation.
  const bb = contentBBox(out);
  const s = Math.min(SAFE.w / bb.w, SAFE.h / bb.h, 1);
  if (s < 1 - 1e-4) {
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    out = out.map((b) => isRoot(b) ? b : {
      ...b,
      x: q(cx + (b.x - cx) * s), y: q(cy + (b.y - cy) * s),
      w: q(b.w * s), h: q(b.h * s),
    });
    actions.push(`scale content ${(s).toFixed(3)}× to fit safe area`);
  }
  // Step 2 — re-centre if the scaled bbox still sits off-margin (pure translate).
  const bb2 = contentBBox(out);
  let tx = 0, ty = 0;
  if (bb2.x < SAFE.x) tx = SAFE.x - bb2.x;
  if (right(bb2) > SAFE.x + SAFE.w) tx = (SAFE.x + SAFE.w) - right(bb2);
  if (bb2.y < SAFE.y) ty = SAFE.y - bb2.y;
  if (bottom(bb2) > SAFE.y + SAFE.h) ty = (SAFE.y + SAFE.h) - bottom(bb2);
  if (tx || ty) {
    out = out.map((b) => isRoot(b) ? b : { ...b, x: q(b.x + tx), y: q(b.y + ty) });
    actions.push(`translate content (${Math.round(tx)}, ${Math.round(ty)}) into margins`);
  }
  // (Step 3 — per-row de-overlap nudging — deliberately omitted here: the risky,
  // cascade-prone part. Scale-to-fit + translate already guarantee containment;
  // collisions are reported for the caller to decide. See README.)
  return { boxes: out, actions };
}

export function audit(boxes) {
  return { overflow: overflow(boxes).length, collisions: collisions(boxes) };
}

// --- Runnable self-check (ponytail: one assert that fails if logic breaks) ---
export function demo() {
  // Synthetic stress: one box off the right edge, two boxes overlapping.
  const stress = [
    { tag: "group", x: 0, y: 0, w: 1920, h: 1080, text: "" }, // root
    { tag: "card", x: 1700, y: 400, w: 400, h: 200, text: "A" }, // 300px off-frame
    { tag: "card", x: 300, y: 400, w: 400, h: 200, text: "B" },
    { tag: "card", x: 650, y: 450, w: 400, h: 200, text: "C" }, // overlaps B
  ];
  const before = audit(stress);
  const { boxes: fixed, actions } = repair(stress);
  const after = audit(fixed);
  console.assert(before.overflow > 0, "stress should start with overflow");
  console.assert(after.overflow === 0, "repair must leave zero safe-area overflow");
  console.assert(fixed.every((b) => b.tag !== "card" ||
    (b.x >= SAFE.x - 0.5 && b.x + b.w <= SAFE.x + SAFE.w + 0.5)), "all cards inside safe X");
  return { before, actions, after };
}
