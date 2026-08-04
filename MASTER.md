# MASTER — Decode design system

Single source of truth for every visual and motion decision in Decode.

**Rule: nothing in the product gets a colour, size, radius, shadow, duration or
easing that is not in this file.** No magic numbers, no rogue hex. If something
genuinely needs a value that isn't here, the system is incomplete — add it here
first, then use it.

The machine-readable form of everything below lives in
`apps/frontend/src/app/globals.css`. This file explains *why*; that file is what
ships. They must never disagree.

---

## The two theses

Both approved 2026-08-01. Everything else in this document is downstream of
these two sentences.

**Visual** — Warm paper-light interface: near-black ink on `#EFEFED` warm greys
with a single burnt-amber accent, high-contrast Instrument Serif display against
humanist Plus Jakarta Sans, generously spaced on an 8px rhythm that stays airy
in marketing and tightens to 4px in the tool, with softly-rounded,
hairline-bordered, barely-elevated components, and one deep cinematic `#0E0E10`
stage as the sole dark surface.

**Interaction** *(amended — see below)* — The marketing page behaves like the
instrument it is selling: **scroll is a playhead**, the page is a timeline, and
motion is concentrated in that one continuous spine rather than rationed out in
timid increments — while inside the studio itself motion stays short and
functional, 150/250/400ms on a single ease-out curve
`cubic-bezier(0.22, 1, 0.36, 1)`, with no bounce, no elastic, no spinner without
an explanation, and no entrance animation anywhere.

> **Amendment.** The original thesis read *"motion is quiet and short
> everywhere… except one loud moment."* In practice that produced a page that
> was merely timid: every section was individually correct and the whole thing
> felt static and documentary, which is fatal for a product that sells itself as
> creative software. Rationing motion to one moment did not make that moment
> loud — it made the other twelve inert.
>
> The replacement is not "more animation everywhere." It is **one continuous
> mechanism** the whole page hangs from, so motion reads as a property of the
> instrument rather than as decoration applied per section. The bans survive
> unchanged: no bounce, no elastic, no unexplained spinner, no entrance
> animation inside the studio, `prefers-reduced-motion` always degrades to a
> settled, legible state.

---

## Colour

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `page` | `#EFEFED` | The page ground. Warm grey, never white. |
| `card` | `#FFFFFF` | Cards, panels, anything lifted off the ground. |
| `sunken` | `#FBFBFA` | Inputs, inset rows. |
| `sunken-2` | `#F6F6F4` | Timeline lanes. |
| `sunken-3` | `#F4F4F1` | Deeper inset. |
| `sunken-4` | `#EFEFEB` | Deepest inset; matches the ground so it reads as a hole. |
| `drawer` | `#FCFCFB` | Production room panel. **Opaque on purpose** — see Traps. |

The ground is `#EFEFED` and cards are `#FFFFFF`, so a card is defined by being
*lighter* than the page plus a hairline, not by a heavy shadow. That's what
makes the interface read as paper.

### Ink

| Token | Hex | Contrast on `page` | Use |
|---|---|---|---|
| `ink` | `#141414` | 15.6:1 | Primary text, headlines. |
| `ink-2` | `#2A2A28` | 12.4:1 | Body prose. |
| `ink-3` | `#3A3A38` | 9.9:1 | Secondary text. |
| `t4`–`t6` | `#4A4A47`–`#6B6B68` | 7.9–4.9:1 | De-emphasised body, labels. All pass AA. |
| `t7`–`t8` | `#8A8A86`–`#9A9A96` | 3.2–2.7:1 | **Large text or non-text only.** Fails AA at body size. |
| `t9`–`t11` | `#A3A39E`–`#C4C4BF` | < 2.5:1 | Disabled states, hairline glyphs, timecode ticks. Never carries meaning alone. |

### Accent — burnt amber

| Token | Hex | Use |
|---|---|---|
| `accent` | `#C2410C` | The accent. Large text, fills, rules, the Producer's crew colour. |
| `accent-top` | `#D4551C` | Top stop of the CTA gradient only. |
| `accent-deep` | `#9A3412` | **Accent text at body size.** 7.3:1 on white. |
| `accent-lit` | `#F2A47B` | Accent on the dark canvas, where `accent` goes muddy. |
| `accent-card` | `#FDF7F3` | Approved-card ground. |

`accent` on white is 5.18:1 — clears AA for large text (18.66px+, or 14px bold)
but **not** for body copy. Small accent-coloured text uses `accent-deep`. This
is the single most common way to break the palette; check it every time.

Alpha variants are declared once in `:root` (`--accent-tint`, `--accent-line`,
`--accent-ring`, `--accent-glow`, `--accent-wash`) so re-theming is one edit
rather than a hunt for `rgba()` literals.

The accent does exactly two jobs. In marketing it emphasises. In the studio it
means **approved / active scene / playhead**. It is never decoration.

### The dark canvas — the only dark surface

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#0E0E10` | The scene stage. |
| `canvas-chip` | `#1D1D22` | Small labelled pills on the canvas. |
| `canvas-line` | `#2E2E35` | Hairlines on the canvas. |
| `canvas-cap` | `#E8E8EC` | Captions. |
| `canvas-chip-fg` | `#B9B9C2` | Chip labels. |
| `canvas-meta` / `label` / `faint` | `#8A8A92` / `#6E6E76` / `#5C5C64` | Descending metadata. |

**Diagram surfaces are not chip surfaces.** Scene visuals use `#212129` (fill)
and `#3C3C48` (edge). `canvas-chip` at `#1D1D22` on `#0E0E10` is ≈1.1:1 — fine
for a small pill with a bright label, invisible for eight adjacent shapes. This
already caused one regression where the attention heads collapsed into a single
slab.

### Crew

Five specialists, each with an initial and a colour. This single source drives
handoff cards, approval receipts and scene notes.

| Role | Initial | Colour | Stage |
|---|---|---|---|
| Producer | P | `#C2410C` | Understanding |
| Director | D | `#4C5B7A` | Teaching Plan |
| Writer | W | `#7A5B4C` | Script |
| Motion Designer | M | `#6B4F6B` | Edit · scene visuals |
| Editor | E | `#4A6472` | Edit · Export |

All five are desaturated to sit under the amber rather than compete with it. The
Producer shares the accent because the Producer *is* the through-line — the
production room, the gating explanations and the receipts all come from them.

**Never label the AI "Assistant" or "AI".** Always the specific role.

**Crew identity belongs to the work, not the chrome.** A role name or crew mark
appears when authorship matters: an artifact handoff, scoped proposal, approval
or receipt. Global navigation, headers and the Production room use Decode's app
identity. Roles never occupy persistent sidebar or header space, and the room
does not pretend that the user is privately chatting with one all-purpose
"Producer."

### Two vocabularies — backend modules vs presented crew

The production pipeline has functional module names. The product has crew names.
They are different layers and both are correct; never leak the first into the UI.
"Agent" is not a user-facing word.

| Backend module | Presented as | Stage | Artifact handed off |
|---|---|---|---|
| Intake | Producer | Understanding | Production brief |
| Architect | Director | Teaching Plan | Production plan |
| Author | Writer | Script | Scene script · narration |
| Visualizer + Renderer | Motion Designer | Edit | Visual spec · rendered assets |
| Composer + Publisher | Editor | Edit · Export | Timeline · final project |
| Reviewer | *(cross-cutting)* | — | Review report |

**The crew is a chain, and the UI must show it as one.** Modules never talk to
each other — they exchange versioned artifacts, each knowing its version, parent,
creator, quality score and compute cost. So the crew is never presented as a grid
of five equal cards: it is an ordered call sheet with a visible spine, each member
naming the artifact they hand on. Upstream members read at full strength,
downstream at 45% opacity, the working one carries the presence sweep.

### Settled — regeneration scope

CLAUDE.md says scene-level edits inside Edit reset nothing. The production
architecture says editing Scene 4's script must regenerate Scene 4's visual
spec, its assets, and the timeline around it — nothing else. The reconciliation
this file predicted is the one we took:

**Approvals do not reset. Downstream artifacts go stale, and stale work is
rebuilt only when the user asks for it.**

So a narration edit inside Script:

- leaves every approval intact — you are never sent back through a gate you
  already passed;
- marks that scene's visual spec, its assets and its voice as **stale**, and
  nothing outside that scene;
- rebuilds none of it until the user triggers the update, so no compute is spent
  on work they have not seen and might discard.

The third clause is what keeps this on the right side of "creative software, not
a chatbot": work is never silently redone underneath you. It is also already
asserted publicly — the landing page's one-scene demo shows exactly this
sequence, with the stale frame held until "Update downstream work" is pressed.

**Dependency this creates:** a `stale` state in the design system, which does
not exist yet. It needs to read as *pending*, not as *broken* — it is the
expected result of an edit, not an error — so it should not reuse the error
ramp. Build it with the project shell, before the Edit stage needs it.

Also unhoused, both probably belonging in the Production room: per-artifact
compute cost, and the reviewer escalating to a human after its retry limit.

---

## Typography

| Family | Var | Use |
|---|---|---|
| Instrument Serif | `--font-serif` | Marketing display. One weight (400). Hierarchy comes from size and colour, never a synthesised bold. |
| Plus Jakarta Sans | `--font-sans` | Body and UI. Warm, tall x-height — what keeps the serif from reading cold. |
| Bricolage Grotesque | `--font-display` | Product chrome: card titles, numerals, stage headers. Variable, with optical sizing. |
| Geist Mono | `--font-mono` | Timecodes, durations, technical labels, uppercase kickers at `0.14em` tracking. |
| Caveat | `--font-hand` | One authored word in the hero: “taught.” Never used for generic section labels. |

### Scale

| Step | Size | Family | Use |
|---|---|---|---|
| Display / hero | `clamp(46px, 8.2vw, 104px)` | serif | Landing headline. Capped at 104 — above that it wraps to three lines and orphans the period. |
| Display / section | `clamp(34px, 5vw, 56px)` | serif | Section headlines. |
| Display / card | `clamp(22px, 2.4vw, 30px)` | serif | Card headlines. |
| Body / lead | 17–18px / 1.7 | sans | Lead paragraphs. |
| Body | 14–15px / 1.7 | sans | Default. |
| UI label | 13px / 1.4, 500 | sans | Buttons, nav, controls. |
| Micro / mono | 10.5–11px, `0.14em`, uppercase | mono | Kickers, timecodes, metadata. |

Line length caps at 62–66ch. Line-height 1.7 for prose, 0.94–1.05 for display.
Every display size uses `clamp()` — **no media queries anywhere in the type
system.**

---

## Rhythm

**Spacing** — 8px base in marketing, 4px in the tool.
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128`

Marketing sections breathe at 96–128. Studio panels tighten to 12–16. That
density shift is deliberate: it's how the product signals "you are now working"
without changing colour or type.

Home and project stages use a shared `1200px` desktop workspace cap with 32px
internal padding. They must not each invent a narrower centered page: on a
13–14-inch laptop that turns the tool into a small website with 150–200px dead
gutters. Script may use a narrower `960px` writing measure for readable
narration; Edit remains edge-to-edge because its canvas and timeline are spatial
tools.

**Radii**

| Token | Value | Use |
|---|---|---|
| control | 10–12px | Inputs, small controls. |
| card | 18px | Cards, panels. |
| panel | 22px | Large panels, Production room. |
| stage | 28px | The dark canvas, hero video frame. |
| full | 999px | Glass buttons, pills, crew marks. |

**Elevation** — `xs` through `2xl`, all on `rgba(30,30,28,0.03–0.10)`. Warm-grey
shadow, never black. Alpha stays under 0.12 on light surfaces; the interface is
paper, not glass stacked on glass.

Named elevations for specific jobs: `hover`, `canvas`, `dark-panel`, `drawer`,
`sticky-down`, `sticky-up`, `nav`, `float`.

---

## Motion

| Token | Value | Use |
|---|---|---|
| `--ease-decode` | `cubic-bezier(0.22, 1, 0.36, 1)` | **The only easing in the product.** |
| `--t-fast` | 150ms | Hover, toggles, tint changes. |
| `--t-normal` | 250ms | Panels, state transitions. |
| `--t-slow` | 400ms | Scroll reveals, stage handoffs. |
| `--stagger` | 70ms | Between siblings in a revealed group. |

**Rules**

- Hover = `translateY(-1px)` + one shadow step deeper. Never scale. Never both.
- Scroll reveals fire **once** and never re-play.
- Only `transform` and `opacity` animate. Never width, height, top or left.
- Forbidden: bounce, elastic, overshoot, spin-without-explanation, anything over
  400ms outside the signature moment.
- `prefers-reduced-motion` degrades to a settled state, never to nothing
  visible.

### No entrance animations inside the studio

Studio elements render at their settled state. If a timeline never advances,
nothing is invisible. This is load-bearing, not stylistic.

The landing page is the one exception, and even there no hidden state is
authored in CSS — a `<noscript>` override settles the blur-in text if JS never
runs.

### The spine — scroll is the playhead

The landing page's organising idea, replacing the old "one signature moment"
rule.

The page is presented as a **timeline**, and the reader's scroll position is the
**playhead**. A persistent editor-style ruler tracks position through the page,
each section is a named scene with a timecode, and scrolling literally scrubs
the argument the way it would scrub a cut. Sections are not slides stacked in a
column; they are scenes on one strip.

This does three things at once, which is why it earns the whole motion budget:

- **It makes the page feel like the instrument.** A product that sells a
  timeline should not present itself as a document.
- **It gives motion a reason.** Everything that moves is either the playhead or
  something responding to it, so nothing is decoration.
- **It unifies the composition.** Sections stop being independent panels that
  happen to sit near each other.

Motion still concentrates rather than scatters — but it concentrates in a
mechanism that is present the whole way down, not in one section the reader may
scroll past.

### Presence — how "something is working" is shown

When a specialist is working, **their own crew mark** — their initial, their
colour — takes a slow specular sweep, and the accompanying copy names what they
are doing and why.

Explicitly rejected: a single iridescent orb / AI sphere. It reads as one
anonymous AI entity, which is precisely what the crew model exists to refuse,
and it only survives on a dark surface. Presence must reinforce *which* crew
member is acting.

**Nothing is ever a bare loading state.** No unexplained spinner, no
"Generating…", no "Thinking…". Progress is a named checklist with per-step
detail lines.

---

## Components

Every interactive element implements five states: **default, hover, focus,
active, disabled.** Focus is a 2px accent ring at 2px offset, visible on
keyboard, absent on mouse (`:focus-visible`).

| Component | Spec |
|---|---|
| **Graphite glass** | `linear-gradient(180deg, #2C2C29, #141414)`, `1px rgba(255,255,255,0.13)` border, inset top highlight, radius `full`. The neutral primary: Open Studio, Export, Approve, Regenerate. |
| **Accent glass** | `linear-gradient(180deg, accent-top, accent)`, `1px rgba(255,255,255,0.22)`, amber glow at 0.32. The single CTA: hero, Render, Start decode. One per view, maximum. |
| **Disabled glass** | `#E4E4E0` on `#DCDCD8`, no shadow, `cursor: not-allowed`. |
| **ChipCTA** | Graphite slab, radius 15px, carrying an accent square chip. The marketing primary. The glyph translates 2px on hover — the chip itself never rotates. |
| **Card** | `card` ground, `1px rgba(255,255,255,0.9)` hairline, radius 18–22px, shadow `sm`→`md`. |
| **Glass panel** | `rgba(255,255,255,0.42)` + `blur(24px)`. Sidebar, inspector, timeline, sticky headers. |
| **Concept pill** | `white-space: nowrap`. Must never break mid-label. |
| **Crew mark** | Circle, crew colour, initial. The identity atom — and the presence indicator. |

### The one sanctioned exception: tactile controls

`components/ui/TactileButton.tsx` is a dark, gradient-surfaced, physically
pressable control with an equalizer loading state. It is **scoped to the
`#0E0E10` canvas only** — transport controls in the Edit stage, where a
pressable control is honest because the surface is already a deck.

It is off-thesis by construction: it needs a dark ground, and its loader bounces.
It must never appear on a light surface, and it must never become the default
button. Self-contained (own keyframes, own colour values, no shared tokens) so
it can be deleted in one file.

---

## Product invariants that constrain design

These are product decisions, not styling. Any implementation preserves them.

**Derived timing.** `total = Σ durations`; `starts[i] = Σ durations[0..i-1]`;
word timings distribute a scene's duration evenly across its tokens. Nothing is
stored. Reordering or retiming recomputes the arc bar, timecodes and
timeline automatically. The user never manually syncs anything.

**Stage gating.** `unlockLevel()`: `approvals.script → 5`, `plan → 2`,
`understanding → 1`, else `0`. Nav levels: overview 0, plan 1, script 2,
edit/export 5. Clicking a locked stage opens the Production room with an
explanation — **never a tooltip.** Approving advances the tab automatically.

**One studio shell.** Home, Recent decodes, Templates and New decode stay in a
stable global sidebar. Opening a project does not swap shells; it adds a
"Current project" stage section below that same navigation. The Production room
is project-scoped and is never mounted on Home, New Decode or Processing.

**The Production room is on demand.** It is closed by default, opens for an
explicit question, pushback or locked-stage explanation, and closes when the
user changes stage or returns Home. In Edit it replaces Scene settings. It must
never become permanent chrome or a third simultaneous column.

**Conversation scopes; controls execute.** The Production room is where the
user gives direction, asks why and negotiates scope with the crew. A natural-
language request never silently mutates the project. Read-only questions may be
answered directly; any change is returned as a proposal naming what changes and
what stays untouched, and only runs after **Apply change**. `⌘K` remains the
direct action surface for users who already know the exact operation. Every
applied change posts a receipt back into the Production room.

**Re-approval asymmetry.** Plan-level edits (reorder, cut, add a beat) reset
`plan` *and* `script` approval. Scene-level operations in Edit (split, merge,
duplicate, timing and visual treatment) reset nothing.

**Script writes, Timeline navigates.** Narration is editable in exactly one
place — the Script stage, in place. Edit uses the timeline to select and seek,
and links back to Script when the words need work. Never two copies of the same
text and never a second transcript competing with the cut.

**Scope reassurance.** Every regeneration states what it did *not* touch
("Nothing else in the timeline changes"), and swaps between a scene's `narration`
and `alt` drafts so the change is visibly real.

**The crew can disagree.** On scenes 3 and 5 the Motion Designer offers two
options with a stated preference rather than silently generating. Picking one
collapses into a confirmation and posts a receipt to the Producer thread.

**Voice.** All generated copy is first person, past tense for finished work, and
always states *why*.

---

## Responsive

**No media queries.** Every fixed-column grid is
`repeat(auto-fit, minmax(Xpx, 1fr))`; all display type uses `clamp()`.

The crew is an ordered call sheet, not a card grid. Responsive layouts preserve
that sequence as a vertical chain rather than reflowing specialists into rows.

Verify at 375 / 768 / 1024 / 1440. No horizontal overflow at any width.

---

## Traps — regressions with a history

Each of these was a real bug. Re-introducing one is a regression, not a
preference.

- **Never name a colour token `base`.** Tailwind v4 generates a `text-base`
  *colour* utility that silently shadows the built-in `text-base` font size.
- **Base resets must live inside `@layer base`; primitives inside
  `@layer components`.** Unlayered CSS beats every layered utility regardless of
  specificity — an unlayered `button { color: inherit }` defeats `.text-white`
  and renders black-on-black.
- **The hero is one cinematic stage.** Do not layer floating product cards over
  it; they obscure the reel, compete with the headline and collapse badly near
  laptop widths.
- **The Edit canvas footer is a flex sibling, not absolutely positioned**, or
  tall content overlaps the transport. Canvas chips are `flex: 0 1 auto;
  min-width: 0` with ellipsis.
- **The Production room is opaque** (`#FCFCFB`) and above the sticky header.
  Translucency made the header's Export button a ghost click target.
- **The Understanding "Audience" stat is user free text.** Step the font size
  down at 16 and 26 characters; never line-clamp it.
- **Pinned sections trigger off the pinned element at `center center`**, not off
  the section at `top top` — otherwise the panel sticks partway down with dead
  space above it.

---

## Build order

Design tokens + glass primitives → crew model → project shell → **derived
timing** → stages in order (Understanding → Teaching Plan → Script → Edit →
Export) → Production room → Landing / Dashboard / New Decode /
Processing.

Get derived timing right before building the timeline. Everything downstream
assumes it.

---

## The landing page — composition

Written before the rebuild, because the first attempt failed as a *composition*
rather than as a set of sections. Every section below was individually
defensible and the whole was inert: sections were added, polished and swapped in
isolation until the page was an accretion rather than an argument.

### The arc

The page makes one argument, in order. A section that does not advance it does
not ship.

| # | Scene | What it has to do |
|---|---|---|
| 01 | **Hero** | Land the claim — taught, not summarised — beside one real, user-triggered product reel. |
| 02 | **Nine-stage ruler** | Name the editable stages. The process is the proof, not a logo wall. |
| 03 | **Three decisions** | Upload, direct, export. Make the visitor's job instantly legible. |
| 04 | **One-scene edit** | The load-bearing proof: five specialists, one visible regeneration boundary. |
| 05 | **Why it works** | Receipts, focused context and owned quality: creative software, not a chatbot. |
| 06 | **The workflow** | Nine stages as a compact 3×3 desktop grid — scannable, unhyped. |
| 07 | **Proof + invitation** | Use source-derived numbers, then ask for the document. |

### Identity moves the first build lost

Recovered from the original handoff. These are what made it *not* template, and
dropping them is why the rebuilt page read as generic.

- **Mono production kickers.** Geist Mono, uppercase and tracked, gives every
  section the vocabulary of an editor instead of decorative handwriting.
- **One handwritten word inside the hero headline**, in accent with
  `letter-spacing: 0`. Caveat appears nowhere else.
- **Two-tone headlines** — second clause drops to `t9`. Recurs everywhere.
- **The hero uses one cinematic surface**, with a user-triggered four-phase reel
  from source to plan to scene to ready. It never auto-plays and has no floating
  overlay cards.
- **The strip is a static editor ruler**, not a looping marquee and not logos.
- **Exactly one dark card** in the light bento, showing a real artifact receipt:
  owner, parent, quality and compute.
- **Anti-hype stats.** `11 pages · 37 concepts · 8 scenes`, all derived from the
  seed project. No user counts, no "10× faster".
- **The giant ghost wordmark**, with the copyright rule pulled up to overlap it.

### Rules for this page

- Real content only. The seed project is "Attention Is All You Need" and every
  number, scene title and line of narration comes from it.
- No invented endorsements. No named person praising the product until a real
  one has.
- No claim we cannot support. A speed figure ships only once measured.
