/**
 * The data seam.
 *
 * Today every function here returns seeded content synchronously. When the
 * FastAPI backend lands, these become `fetch` calls (and the generation
 * endpoints become SSE subscriptions) — the components above never change,
 * because they only ever see the types in `lib/types.ts`.
 *
 * The scene content below is real production teaching copy for "Attention Is
 * All You Need" — objectives, narration, alternate drafts, visual prompts and
 * canvas chips. It is not lorem. Reuse it verbatim.
 */

import type {
  Dependency,
  ExampleSource,
  Opportunity,
  ProcessingStep,
  ProjectCard,
  RecentFile,
  Scene,
  SceneNote,
  Source,
  Template,
  ThreadMessage,
} from "./types";

let seq = 0;
export const uid = (prefix = "s") => `${prefix}_${(seq += 1)}`;

const scene = (s: Omit<Scene, "id" | "altUsed">): Scene => ({
  ...s,
  id: uid("sc"),
  altUsed: false,
});

export const SEED_SCENES = (): Scene[] => [
  scene({
    title: "The Bottleneck",
    dur: 32,
    anim: "Fade sequence",
    reason: "Opening on the failure makes the fix feel earned.",
    objective:
      "why fixed-size hidden states cap what RNNs can translate, and why depth alone can’t fix it.",
    caption: "Memory that fades by word forty",
    prompt:
      "Chain of RNN hidden states passing a shrinking summary vector left to right; early tokens fade out as the chain grows.",
    viz: ["h₁", "→", "h₂", "→", "…", "→", "hₙ"],
    hot: 6,
    narration:
      "Before 2017, machines read sentences the way you’d read through a keyhole — one word at a time. Recurrent networks passed a single summary vector down the line, and by word forty, the beginning was mostly forgotten. Translation quality hit a ceiling, and the ceiling was the architecture itself.",
    alt: "Sequence models had a memory problem. Every sentence, no matter how long, was squeezed through one fixed-size vector — and long-range meaning simply didn’t survive the trip. The field needed a way for any word to reach any other word directly.",
  }),
  scene({
    title: "Queries, Keys & Values",
    dur: 45,
    anim: "Token flow",
    reason: "Borrowed the database framing — it lands faster than the algebra.",
    objective:
      "the database analogy — every token emits a query, a key, and a value via three learned projections.",
    caption: "Every word asks, every word answers",
    prompt:
      "A single token splitting into three labeled projections Q, K, V; other tokens’ keys light up as a query sweeps across them.",
    viz: ["token", "→", "Q", "K", "V"],
    hot: 2,
    narration:
      "Attention starts with a simple idea from databases: every word asks a question, and every word offers an answer. Each token is projected into a query, a key, and a value. The query is what I’m looking for, the key is what I contain, and the value is what I’ll hand over if we match.",
    alt: "Think of a sentence as a tiny database. Each word publishes a key — here’s what I am — and holds a value — here’s what I know. To understand itself, a word broadcasts a query and reads back a blend of everyone’s values, weighted by how well their keys match.",
  }),
  scene({
    title: "Scaled Dot-Product Attention",
    dur: 52,
    anim: "Equation build",
    reason:
      "Longest beat on purpose — this is the one idea they must leave with.",
    objective:
      "how QKᵀ/√dₖ scores all pairs at once, and why the √dₖ scaling keeps softmax gradients alive.",
    caption: "One matrix multiply reads the whole sentence",
    prompt:
      "The attention equation assembling term by term; a heatmap of pairwise scores forming behind it, then softening under softmax.",
    viz: ["softmax(", "QKᵀ / √dₖ", ")", "· V"],
    hot: 1,
    narration:
      "To decide who talks to whom, we take the dot product of every query with every key — a similarity score for all pairs at once. We scale by the square root of the key dimension so the softmax stays in a usable range, then blend the values by those weights. One matrix multiply, and every word has read the entire sentence.",
    alt: "Score every pair: query dot key. Big dot products would shove softmax into regions where gradients vanish, so the paper divides by root d-k first — a one-character fix that keeps training stable. Softmax turns scores into weights; the weights mix the values. That’s the whole mechanism.",
  }),
  scene({
    title: "Multi-Head Attention",
    dur: 48,
    anim: "Head split",
    reason: "Kept as its own beat — folding it into the last one buried it.",
    objective:
      "why eight parallel heads in projected subspaces beat one full-width attention pattern.",
    caption: "Eight heads, eight relationships",
    prompt:
      "One wide attention block splitting into eight slim parallel heads, each with a differently-structured attention map, then concatenating.",
    viz: ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"],
    hot: 2,
    narration:
      "One attention pattern isn’t enough. Syntax, coreference, position — each is a different relationship. So the model runs eight attention heads in parallel, each in its own subspace, then concatenates what they found. Eight specialists reading the same sentence for different reasons.",
    alt: "A single softmax averages everything into one pattern. Split the model into eight lower-dimensional heads and each is free to specialize — one tracks syntax, another resolves pronouns, another watches position. Concatenate, project, done: same cost, far richer readings.",
  }),
  scene({
    title: "Positional Encoding",
    dur: 38,
    anim: "Wave overlay",
    reason: "Placed after the mechanism — it only makes sense once order is missing.",
    objective:
      "how sinusoids at geometric frequencies give each position a unique, learnable signature.",
    caption: "Order, restored by sine waves",
    prompt:
      "A row of identical tokens; sinusoids of increasing frequency layer beneath them, giving each position a distinct striped fingerprint.",
    viz: ["pos 0", "pos 1", "pos 2", "pos 3", "…"],
    hot: 1,
    narration:
      "Attention is order-blind — “dog bites man” and “man bites dog” look identical. The fix is elegant: add a fingerprint of sinusoids to each position. Frequencies vary across the dimension, so every position gets a unique, smooth signature the model can learn to use.",
    alt: "Strip out recurrence and you lose word order entirely. The paper’s answer costs nothing: add sine and cosine waves — slow ones and fast ones — onto each embedding. Position one and position fifty end up with unmistakably different fingerprints, and relative offsets become simple transforms.",
  }),
  scene({
    title: "The Encoder–Decoder Stack",
    dur: 44,
    anim: "Stack build",
    reason: "Assembly beat — pays off every mechanism shown so far.",
    objective:
      "how six encoder and six decoder blocks connect, and what the causal mask does.",
    caption: "Read the source, write the answer",
    prompt:
      "Six encoder blocks stacking on the left, six masked decoder blocks on the right; cross-attention arrows bridging the two towers.",
    viz: ["Encoder ×6", "⇄", "Decoder ×6"],
    hot: 1,
    narration:
      "Stack six of these blocks and you get the encoder; six more, with a causal mask, become the decoder. Residual connections and layer norm keep gradients healthy through the depth. The decoder attends to the encoder’s output — reading the source sentence while writing the new one.",
    alt: "The full machine is two towers. The encoder’s six blocks read the source in parallel. The decoder’s six blocks write the output one step at a time, masked so they can’t peek ahead — and at every layer, cross-attention lets them look back at the source.",
  }),
  scene({
    title: "Training & Results",
    dur: 40,
    anim: "Chart reveal",
    reason:
      "One beat, not two — for this audience the numbers are confirmation, not content.",
    objective:
      "the WMT14 results — 28.4 BLEU — and why parallelism collapsed the training cost.",
    caption: "State of the art, at a fraction of the cost",
    prompt:
      "A bar chart of BLEU scores rising past prior models; a second axis showing training FLOPs falling by an order of magnitude.",
    viz: ["28.4 BLEU", "3.5 days", "8 GPUs"],
    hot: 0,
    narration:
      "Trained on WMT English–German, the Transformer set a new state of the art: 28.4 BLEU, at a fraction of the training cost of previous models. No recurrence meant every position trained in parallel — and parallel meant fast.",
    alt: "The results table did the arguing. 28.4 BLEU on English–German — past every ensemble that came before — after three and a half days on eight GPUs. Removing recurrence didn’t just match the old models; it beat them while training an order of magnitude cheaper.",
  }),
  scene({
    title: "Why It Changed Everything",
    dur: 28,
    anim: "Zoom out",
    reason: "Short closer — the payoff needs air, not more detail.",
    objective: "the through-line from this block to GPT, BERT, and modern scaling.",
    caption: "The title was an understatement",
    prompt:
      "The single Transformer block zooming out to a constellation of descendant models — GPT, BERT, T5, ViT — all sharing its silhouette.",
    viz: ["GPT", "BERT", "T5", "ViT"],
    hot: 0,
    narration:
      "Drop the recurrence, keep the attention — that one decision made scale possible. GPT, BERT, and everything after are this same block, repeated and enlarged. The paper’s title was a claim. It turned out to be an understatement.",
    alt: "Parallelism was the real prize. Once training scaled with hardware instead of sentence length, bigger became better — and the same block, repeated, became GPT, BERT, and the modern stack. Attention wasn’t just all you need. It was all anyone used.",
  }),
];

export const DEFAULT_SOURCE: Source = {
  ext: "PDF",
  file: "attention-is-all-you-need.pdf",
  title: "Attention Is All You Need",
  author: "Vaswani et al. · 2017",
  meta: "11 pages · 5,214 words",
  pages: "11 pp",
  words: "5,214 words",
  kind: "paper",
};

export const SEED_THREAD = (): ThreadMessage[] => [
  {
    id: uid("m"),
    who: "p",
    text: "I read the source and pulled out 37 concepts. Eight of them carry the story — the rest are supporting detail.",
  },
  {
    id: uid("m"),
    who: "p",
    text: "One call I made: the results get one beat, not two. For this audience the numbers confirm the mechanism rather than teach it.",
    receipt: "Beat 07 · 40s allocated",
  },
];

/* ------------------------------------------------------------------
   Understanding — what the Producer extracted
   ------------------------------------------------------------------ */

export const CONCEPTS = [
  "self-attention",
  "query / key / value",
  "softmax scaling",
  "multi-head",
  "positional encoding",
  "residual stream",
  "layer norm",
  "causal mask",
  "BLEU",
  "encoder–decoder",
  "beam search",
  "label smoothing",
];

export const PREREQS = [
  "dot products",
  "softmax",
  "hidden states",
  "gradient flow",
  "embeddings",
  "matrix shapes",
];

export const EQUATIONS = [
  "Attention(Q,K,V) = softmax(QKᵀ/√dₖ)V",
  "PE(pos,2i) = sin(pos / 10000^(2i/d))",
  "MultiHead = Concat(head₁…head₈)Wᴼ",
];

export const OPPORTUNITIES: Opportunity[] = [
  {
    t: "Database analogy",
    d: "Queries, keys, and values map cleanly onto lookups — fastest route into the mechanism.",
  },
  {
    t: "Failure-first opening",
    d: "Showing the RNN bottleneck first makes attention feel inevitable rather than clever.",
  },
  {
    t: "Worked example",
    d: "One sentence, eight heads, side by side — makes specialization visible.",
  },
  {
    t: "Deferred detail",
    d: "Positional encoding held back until order is visibly missing.",
  },
];

export const DEPENDENCIES: Dependency[] = [
  { a: "dot products", b: "attention scores" },
  { a: "softmax", b: "attention weights" },
  { a: "attention", b: "multi-head attention" },
  { a: "no recurrence", b: "positional encoding" },
  { a: "encoder blocks", b: "cross-attention" },
];

export const PROJECT_DESCRIPTION =
  "A 5½-minute explainer for engineers who know backprop but haven’t read the paper. Builds from the RNN bottleneck to the full Transformer — one mechanism per scene.";

/* ------------------------------------------------------------------
   Processing — a named checklist, never a bare spinner
   ------------------------------------------------------------------ */

export const processingSteps = (ctx: {
  sourceMeta: string;
  beats: number;
  runtime: string;
  audience: string;
  scriptWords: number;
}): ProcessingStep[] => [
  {
    label: "Reading document",
    detail: `${ctx.sourceMeta} · 42 citations`,
    time: "0.9s",
  },
  {
    label: "Extracting concepts",
    detail: "37 concepts · 12 equations · 4 figures",
    time: "1.1s",
  },
  {
    label: "Mapping prerequisites",
    detail: "6 prerequisites · 9 dependencies",
    time: "0.9s",
  },
  {
    label: "Finding teaching opportunities",
    detail: "4 analogies · 3 worked examples",
    time: "1.2s",
  },
  {
    label: "Planning the lesson",
    detail: `${ctx.beats} beats · target ${ctx.runtime} · ${ctx.audience.toLowerCase()}`,
    time: "1.3s",
  },
  {
    label: "Drafting the script",
    detail: `${ctx.scriptWords} words · measured pacing`,
    time: "1.1s",
  },
  {
    label: "Preparing the storyboard",
    detail: `${ctx.beats} boards · one idea each`,
    time: "0.9s",
  },
];

export const PROCESSING_GAPS = [900, 1100, 950, 1200, 1300, 1100, 900];

/* ------------------------------------------------------------------
   Dashboard
   ------------------------------------------------------------------ */

export const projectCards = (meta: string): ProjectCard[] => [
  {
    id: "attention",
    title: "Attention Is All You Need",
    meta,
    status: "In edit",
    pillBg: "#DDEBE6",
    pillFg: "#C2410C",
    sourceKind: "Research paper",
    currentStage: "Edit",
    nextAction: "Review the assembled cut",
    progress: 0.67,
  },
  {
    id: "d2l",
    title: "Dive into Deep Learning · Ch. 10",
    meta: "11 scenes · 7:02 · yesterday",
    status: "Plan review",
    pillBg: "#F1F1EE",
    pillFg: "#6B6B68",
    sourceKind: "Book chapter",
    currentStage: "Teaching Plan",
    nextAction: "Approve the production plan",
    progress: 0.28,
  },
  {
    id: "k8s",
    title: "Kubernetes Networking Docs",
    meta: "6 scenes · 3:53 · 3d ago",
    status: "Rendering 64%",
    pillBg: "#F1F1EE",
    pillFg: "#6B6B68",
    sourceKind: "Documentation",
    currentStage: "Export",
    nextAction: "Rendering the current approved cut",
    progress: 0.94,
  },
];

export const TEMPLATES: Template[] = [
  {
    glyph: "§",
    title: "Paper walkthrough",
    desc: "Method-first explainer from any paper or preprint.",
  },
  {
    glyph: "≡",
    title: "Docs onboarding",
    desc: "Turn API docs into a getting-started video.",
  },
  {
    glyph: "✎",
    title: "Lecture recap",
    desc: "Slides or notes into a 5-minute review.",
  },
  {
    glyph: "⌘",
    title: "Book chapter",
    desc: "Turn a dense chapter into a study video.",
  },
];

/* ------------------------------------------------------------------
   New Decode
   ------------------------------------------------------------------ */

export const RECENT_FILES: RecentFile[] = [
  {
    ext: "PDF",
    name: "ddpm-2020.pdf",
    when: "2d ago",
    src: {
      ext: "PDF",
      file: "ddpm-2020.pdf",
      title: "Denoising Diffusion Probabilistic Models",
      author: "Ho et al. · 2020",
      meta: "14 pages · 6,180 words",
      pages: "14 pp",
      words: "6,180 words",
      kind: "paper",
    },
  },
  {
    ext: "PPTX",
    name: "cs224n-lecture-08.pptx",
    when: "3d ago",
    src: {
      ext: "PPTX",
      file: "cs224n-lecture-08.pptx",
      title: "CS224N · Lecture 08",
      author: "Stanford NLP · lecture notes",
      meta: "48 slides · 3,240 words",
      pages: "48 slides",
      words: "3,240 words",
      kind: "slides",
    },
  },
  {
    ext: "EPUB",
    name: "dive-into-deep-learning.epub",
    when: "4d ago",
    src: {
      ext: "EPUB",
      file: "dive-into-deep-learning.epub",
      title: "Dive into Deep Learning · Ch. 10",
      author: "Zhang et al. · book chapter",
      meta: "34 pages · 11,900 words",
      pages: "34 pp",
      words: "11,900 words",
      kind: "book",
    },
  },
  {
    ext: "MD",
    name: "k8s-networking-docs.md",
    when: "1w ago",
    src: {
      ext: "MD",
      file: "k8s-networking-docs.md",
      title: "Kubernetes Networking",
      author: "kubernetes.io · documentation",
      meta: "9 pages · 4,050 words",
      pages: "9 pp",
      words: "4,050 words",
      kind: "docs",
    },
  },
];

export const EXAMPLES: ExampleSource[] = [
  {
    name: "Attention Is All You Need",
    meta: "paper · 11 pp",
    src: DEFAULT_SOURCE,
  },
  {
    name: "Dive into Deep Learning, ch. 10",
    meta: "book · 34 pp",
    src: RECENT_FILES[2].src,
  },
  {
    name: "React Server Components docs",
    meta: "docs · web",
    src: {
      ext: "URL",
      file: "react.dev/reference/rsc",
      title: "React Server Components",
      author: "react.dev · documentation",
      meta: "6 sections · 3,760 words",
      pages: "6 sections",
      words: "3,760 words",
      kind: "docs",
    },
  },
  {
    name: "A blog post on KV caching",
    meta: "article · web",
    src: {
      ext: "URL",
      file: "blog.dev/kv-caching",
      title: "How KV Caching Works",
      author: "blog article",
      meta: "2,400 words",
      pages: "1 article",
      words: "2,400 words",
      kind: "article",
    },
  },
];

export const AUDIENCE_HINTS = [
  "AI engineers who know backprop",
  "Second-year CS undergrads",
  "Researchers outside the subfield",
  "Product managers, no math",
];

export const RUNTIME_OPTIONS = [
  "60 seconds",
  "3 min",
  "5 min",
  "10 min",
  "Deep dive",
];

/**
 * One-tap audience presets.
 *
 * `audience` stays free text — "Second-year CS undergrads" tells the Director
 * far more than "Intermediate", and the Understanding stage is built to render
 * an arbitrary string. These are shortcuts into that field, not a replacement
 * for it: one tap for the common case, typing for the specific one.
 */
export const AUDIENCE_LEVELS = ["Beginner", "Intermediate", "Expert"];
export const DEPTH_OPTIONS = ["Intuition first", "Balanced", "Rigorous"];
export const TONE_OPTIONS = ["Professional", "Friendly", "Storyteller"];

/* ------------------------------------------------------------------
   Scene notes — where the crew disagrees and recommends
   ------------------------------------------------------------------ */

export const SCENE_NOTES: Record<number, SceneNote> = {
  2: {
    crew: "motion",
    text: "The equation can carry this alone, or I can let the heat-map do the explaining. I lean toward the second — the scaling is easier to feel than to read.",
    options: [
      {
        key: "A",
        title: "Equation builds term by term",
        desc: "Precise, but asks the viewer to read maths while listening.",
      },
      {
        key: "B",
        title: "Heat-map forms, then softens",
        desc: "Shows what the scaling does before naming it. My pick.",
      },
    ],
  },
  4: {
    crew: "motion",
    text: "Sinusoids read abstract on their own. I could ground them in real tokens instead — slower, but it lands.",
    options: [
      {
        key: "A",
        title: "Layered sine waves",
        desc: "Faithful to the paper, light on intuition.",
      },
      {
        key: "B",
        title: "Tokens with striped fingerprints",
        desc: "Concrete, costs about four seconds. My pick.",
      },
    ],
  },
};

/* ------------------------------------------------------------------
   Landing
   ------------------------------------------------------------------ */

export const WORKFLOW_STEPS = [
  { n: "01", t: "Upload", d: "Papers, docs, articles, notes, PDFs, plain text." },
  {
    n: "02",
    t: "Understand",
    d: "Concepts, prerequisites, dependencies — extracted and shown.",
  },
  { n: "03", t: "Teaching plan", d: "How it should be taught, not what it says." },
  { n: "04", t: "Script", d: "Narration per beat, editable like a doc." },
  { n: "05", t: "Storyboard", d: "One idea per scene. Split, merge, duplicate." },
  { n: "06", t: "Visuals", d: "Generated per scene, regenerated per scene." },
  { n: "07", t: "Narration", d: "Studio voices, retimed to your pacing." },
  { n: "08", t: "Timeline", d: "Voice and visuals stay in sync on their own." },
  { n: "09", t: "Export", d: "Your project stays editable. Video is one way to publish it." },
];

/** Waveform bar heights — deterministic, so server and client agree. */
export const WAVE_BARS = Array.from(
  { length: 110 },
  (_, i) => 8 + Math.abs(Math.sin(i * 0.9) * 22 + Math.sin(i * 0.23) * 10),
);
