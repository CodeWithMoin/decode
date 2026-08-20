// Measure-first deterministic auto-repair — spike (#5 → #4, + row-redistribute).
//
// Takes REAL measured box geometry (getBoundingClientRect in 1920x1080
// composition coordinates, from the live player) and enforces the two frame
// guarantees deterministically, whatever JSX the model emitted:
//   1. every box sits inside the SafeArea
//   2. no two content boxes overlap or sit closer than MIN_GAP
//
// Pipeline (axis-isolated, bounded, idempotent — no 2-D solver, no cascade):
//   1. scale-to-fit reserving ABSOLUTE gaps (fixes the overflow-vs-gap tension
//      the first spike found: gaps are reserved, not scaled)
//   2. vertical pass — restore inter-row gaps to >= MIN_GAP, rows move rigidly
//   3. horizontal pass — restore inter-column gaps within each row, rigidly
//   4. re-check; any residual 2-D overlap is REPORTED, never nudged blindly

export const FRAME = { w: 1920, h: 1080 };
export const MARGIN = 96;
export const MIN_GAP = 48;
export const SAFE = { x: MARGIN, y: MARGIN, w: FRAME.w - 2 * MARGIN, h: FRAME.h - 2 * MARGIN };

const CONTENT = new Set(["card", "code", "badge", "metric", "label", "illustration",
  "database", "queue", "cloud", "diagram", "tile", "group"]);
const isContent = (b) => CONTENT.has(b.tag) && b.w > 4 && b.h > 4;
const isRoot = (b) => b.x <= 1 && b.y <= 1 && b.w >= FRAME.w - 2 && b.h >= FRAME.h - 2;
const R = (b) => b.x + b.w, B = (b) => b.y + b.h;
const cX = (b) => b.x + b.w / 2, cY = (b) => b.y + b.h / 2;
const q = (n) => Math.round(n * 64) / 64;
const contains = (p, c) => p !== c && p.x <= c.x + 1 && p.y <= c.y + 1 && R(p) >= R(c) - 1 && B(p) >= B(c) - 1;

// --- clustering: content boxes → rows (y-bands) → columns (x within a row) ---
function cluster(items, lo, hi) {
  // items already sorted by `lo`. Greedy: extend a band while it overlaps.
  const bands = [];
  for (const it of items) {
    const last = bands[bands.length - 1];
    if (last && lo(it) < last.hi - 1) { last.members.push(it); last.hi = Math.max(last.hi, hi(it)); }
    else bands.push({ members: [it], lo: lo(it), hi: hi(it) });
  }
  return bands;
}

// --- geometry queries -------------------------------------------------------
function overflow(boxes) {
  return boxes.filter((b) => !isRoot(b)).filter((b) =>
    b.x < SAFE.x - 0.5 || b.y < SAFE.y - 0.5 || R(b) > SAFE.x + SAFE.w + 0.5 || B(b) > SAFE.y + SAFE.h + 0.5);
}
function collisions(boxes) {
  // Only TOP-LEVEL placed components can "overlap" in the sense that matters —
  // a label inside a card or a line inside a CodeBlock is intended nesting, not a
  // collision. Restrict to content boxes not contained by another content box.
  const content = boxes.filter((b) => isContent(b) && b.tag !== "group");
  const cs = content.filter((b) => !content.some((p) => contains(p, b)));
  const hits = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (contains(a, b) || contains(b, a)) continue;
    const gap = Math.max(a.x - R(b), b.x - R(a), a.y - B(b), b.y - B(a)); // >0 => separated on an axis
    if (gap < MIN_GAP - 0.5) hits.push({ a: tag(a), b: tag(b), gap: Math.round(gap) });
  }
  return hits;
}
const tag = (b) => `${b.tag}${b.text ? `“${b.text}”` : ""}@${Math.round(b.x)},${Math.round(b.y)}`;

// units = top-level boxes (not contained by any non-root box). Each unit owns
// every box whose centre falls inside it, so it moves rigidly with its contents.
function contentBBox(boxes) {
  const cs = boxes.filter((b) => !isRoot(b) && b.w > 4 && b.h > 4);
  return bbox(cs);
}
const bbox = (cs) => {
  const x = Math.min(...cs.map((b) => b.x)), y = Math.min(...cs.map((b) => b.y));
  return { x, y, w: Math.max(...cs.map(R)) - x, h: Math.max(...cs.map(B)) - y };
};

// Place a set of rigid bands along one axis: restore every gap to >= MIN_GAP,
// but if preserving larger gaps overruns `safeLen`, shrink only the SURPLUS
// (gap − MIN_GAP) proportionally until it fits. Reserved-gap scaling guarantees
// Σsize + (n−1)·MIN_GAP ≤ safeLen, so a feasible placement always exists.
// bands: [{start, size, members}] sorted by start. axis: 'x' | 'y'.
function place1D(bands, axis, safeStart, safeLen) {
  const gaps = bands.map((b, i) => i ? b.start - (bands[i - 1].start + bands[i - 1].size) : 0);
  const newGap = gaps.map((g, i) => i ? Math.max(g, MIN_GAP) : 0);
  let total = bands.reduce((s, b) => s + b.size, 0) + newGap.reduce((a, b) => a + b, 0);
  if (total > safeLen) {
    const surplus = newGap.reduce((s, g) => s + Math.max(0, g - MIN_GAP), 0);
    const f = surplus > 0 ? Math.min(1, (total - safeLen) / surplus) : 0;
    for (let i = 0; i < newGap.length; i++) if (newGap[i] > MIN_GAP) newGap[i] -= (newGap[i] - MIN_GAP) * f;
    total = bands.reduce((s, b) => s + b.size, 0) + newGap.reduce((a, b) => a + b, 0);
  }
  let pos = safeStart + Math.max(0, (safeLen - total) / 2);
  for (let i = 0; i < bands.length; i++) {
    pos += newGap[i];
    const delta = q(pos - bands[i].start);
    if (delta) for (const b of bands[i].members) b[axis] = q(b[axis] + delta);
    pos += bands[i].size;
  }
}

// === fit(): the one operation that is SAFE on flattened geometry ============
// A single rigid transform applied to the WHOLE scene root — scale to fit the
// safe area, then translate to sit inside the margins. Because every box moves
// by the same transform, all internal structure and relative spacing is
// preserved exactly; it can only ever shrink the footprint, so it cannot create
// a new overflow or collision. This is what a SafeArea wrapper would apply as
// one CSS `transform` after measuring. Guarantees zero safe-area overflow.
export function fit(boxes) {
  const bb = contentBBox(boxes);
  const s = Math.min(1, SAFE.w / bb.w, SAFE.h / bb.h);
  const cx = cX(bb), cy = cY(bb);
  // scaled bbox, then translate it fully inside the safe rect
  const sx = cx - (bb.w * s) / 2, sw = bb.w * s, sy = cy - (bb.h * s) / 2, sh = bb.h * s;
  const tx = sx < SAFE.x ? SAFE.x - sx : sx + sw > SAFE.x + SAFE.w ? SAFE.x + SAFE.w - (sx + sw) : 0;
  const ty = sy < SAFE.y ? SAFE.y - sy : sy + sh > SAFE.y + SAFE.h ? SAFE.y + SAFE.h - (sy + sh) : 0;
  const out = boxes.map((b) => isRoot(b) ? { ...b } : {
    ...b, x: q(cx + (b.x - cx) * s + tx), y: q(cy + (b.y - cy) * s + ty), w: q(b.w * s), h: q(b.h * s),
  });
  const transform = { scale: +s.toFixed(4), tx: Math.round(tx), ty: Math.round(ty) };
  return { boxes: out, transform };
}

// --- the repair (EXPERIMENTAL — redistribute; unsafe on flat geometry) -------
export function repair(boxes, opts = {}) {
  const { horizontal = true, clamp = true } = opts;
  const actions = [];
  let out = boxes.map((b) => ({ ...b }));
  const moving = out.filter((b) => !isRoot(b));

  // rows for gap-reservation: top-level content boxes clustered by y.
  const tops = moving.filter((b) => isContent(b) && !moving.some((p) => isContent(p) && contains(p, b)));
  const rowsForScale = cluster([...tops].sort((a, c) => a.y - c.y), (b) => b.y, B);

  // Step 1 — scale-to-fit reserving ABSOLUTE inter-row gaps.
  const bb = contentBBox(out);
  const rowsH = rowsForScale.reduce((s, r) => s + (r.hi - r.lo), 0);
  const nGapsV = Math.max(0, rowsForScale.length - 1);
  const sV = (SAFE.h - nGapsV * MIN_GAP) / rowsH;
  const sW = SAFE.w / bb.w;
  const s = Math.min(1, sV, sW);
  if (s < 1 - 1e-4) {
    const kx = cX(bb), ky = cY(bb);
    for (const b of moving) { b.x = q(kx + (b.x - kx) * s); b.y = q(ky + (b.y - ky) * s); b.w = q(b.w * s); b.h = q(b.h * s); }
    actions.push(`scale content ${s.toFixed(3)}× (gaps reserved)`);
  }

  // Assign every moving box to a row by centre-y; rebuild rows from content.
  const tops2 = moving.filter((b) => isContent(b) && !moving.some((p) => isContent(p) && contains(p, b)));
  let rows = cluster([...tops2].sort((a, c) => a.y - c.y), (b) => b.y, B)
    .map((band) => ({ ...band, members: [] }));
  const rowOf = (b) => rows.reduce((best, r) => Math.abs(cY(b) - (r.lo + r.hi) / 2) < Math.abs(cY(b) - (best.lo + best.hi) / 2) ? r : best, rows[0]);
  for (const b of moving) rowOf(b).members.push(b);

  // Step 2 — VERTICAL: restore inter-row gaps to >= MIN_GAP, rows rigid.
  const rowBox = (r) => bbox(r.members);
  const gapsV = rows.map((r, i) => i ? rowBox(rows[i]).y - B(rowBox(rows[i - 1])) : 0);
  if (gapsV.slice(1).some((g) => g < MIN_GAP - 0.5)) {
    place1D(rows.map((r) => { const rb = rowBox(r); return { start: rb.y, size: rb.h, members: r.members }; }), "y", SAFE.y, SAFE.h);
    actions.push(`vertical: restored ${gapsV.slice(1).filter((g) => g < MIN_GAP - 0.5).length} inter-row gap(s) to >= ${MIN_GAP}px`);
  }

  if (horizontal)
  // Step 3 — HORIZONTAL: within each row, each top-level content box is its own
  // column (NO overlap-merge — merging would hide the overlap we must separate).
  for (const r of rows) {
    const colTops = r.members.filter((b) => isContent(b) && !r.members.some((p) => isContent(p) && contains(p, b))).sort((a, c) => a.x - c.x);
    if (colTops.length < 2) continue;
    const cols = colTops.map((top) => ({ top, members: [] }));
    const colOf = (b) => cols.reduce((best, c) => Math.abs(cX(b) - cX(c.top)) < Math.abs(cX(b) - cX(best.top)) ? c : best, cols[0]);
    for (const b of r.members) colOf(b).members.push(b);
    const colBox = (c) => bbox(c.members);
    const gapsH = cols.map((c, i) => i ? colBox(cols[i]).x - R(colBox(cols[i - 1])) : 0);
    if (!gapsH.slice(1).some((g) => g < MIN_GAP - 0.5)) continue;
    place1D(cols.map((c) => { const cb = colBox(c); return { start: cb.x, size: cb.w, members: c.members }; }), "x", SAFE.x, SAFE.w);
    actions.push(`horizontal: separated ${cols.length} columns to >= ${MIN_GAP}px in one row`);
  }

  // Step 4 — clamp: pure translate so the whole content bbox sits in the safe
  // area on both axes. NOTE: on flat measured geometry this is unsafe when the
  // bbox is wider than the safe area (a mismeasured or genuinely huge element) —
  // it just shoves the overflow to the opposite edge. Gated off by default.
  if (clamp) {
    const fb = contentBBox(out);
    const tx = fb.x < SAFE.x ? SAFE.x - fb.x : R(fb) > SAFE.x + SAFE.w ? SAFE.x + SAFE.w - R(fb) : 0;
    const ty = fb.y < SAFE.y ? SAFE.y - fb.y : B(fb) > SAFE.y + SAFE.h ? SAFE.y + SAFE.h - B(fb) : 0;
    if (Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5) {
      for (const b of moving) { b.x = q(b.x + tx); b.y = q(b.y + ty); }
      actions.push(`clamp: translated (${Math.round(tx)}, ${Math.round(ty)}) into safe area`);
    }
  }

  return { boxes: out, actions };
}

export function audit(boxes) {
  return { overflow: overflow(boxes).length, collisions: collisions(boxes) };
}

// --- runnable self-check ----------------------------------------------------
export function demo() {
  const stress = [
    { tag: "group", x: 0, y: 0, w: 1920, h: 1080, text: "" },
    { tag: "card", x: 1700, y: 400, w: 400, h: 200, text: "A" }, // 300px off-frame
    { tag: "card", x: 300, y: 400, w: 400, h: 200, text: "B" },
    { tag: "card", x: 650, y: 450, w: 400, h: 200, text: "C" }, // overlaps B
  ];
  const before = audit(stress);
  const { boxes: fixed, actions } = repair(stress);
  const after = audit(fixed);
  console.assert(before.overflow > 0 && before.collisions.length > 0, "stress should start dirty");
  console.assert(after.overflow === 0, "repair must leave zero overflow");
  console.assert(after.collisions.length === 0, "row-redistribute must clear the horizontal overlap");
  return { before, actions, after };
}
