# Handoff: Decode — AI-Native Learning Studio

## Overview

Decode turns technical source material (research papers, books, documentation, lecture slides, whitepapers) into **editable educational videos**. Tagline: *"Decode any technical content into stories people understand."*

The defining product idea: **this is not a one-click generator.** The user is a director working with an AI production crew of six named specialists. Each specialist completes a stage, brings the work back with their reasoning, and waits for approval before the next specialist picks it up. Every stage stays editable, and regenerating one scene never touches the rest of the project.

The **project** is the primary artifact. The video is one export from it.

---

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype showing intended look, layout, and behavior. **They are not production code to copy directly.**

`Decode Studio.dc.html` is authored in a bespoke internal template runtime (`support.js`, `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ }}` holes, a `Component extends DCLogic` class). **Do not port that runtime.** It exists only to make the prototype stream and render in our design tool.

Your task is to **recreate these designs in the target codebase's existing environment** — React, Vue, SwiftUI, whatever is already there — using its established component library, routing, and state patterns. If no environment exists yet, choose the most appropriate framework and implement there. A straightforward mapping:

| Prototype construct | Target equivalent |
|---|---|
| `<sc-for list as item>` | `.map()` / `v-for` / `ForEach` |
| `<sc-if value>` | conditional render |
| `{{ value }}` | interpolation / props |
| `renderVals()` return object | derived state + handlers |
| `style-hover="…"` | `:hover` in your styling solution |
| `this.state` in `DCLogic` | `useState` / store |

To read the prototype: open `Decode Studio.dc.html` in a browser. Everything is clickable end to end.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, shadows, motion, and copy are all decided. Recreate pixel-accurately using the codebase's existing libraries. Every hex value, font size, and radius in this document is the intended value, not a placeholder.

The one exception: **scene visuals inside the dark canvas are deliberately abstract** (mono-type chips and a caption). In production those become real generated HTML/SVG animations. Treat the canvas as a slot.

---

## The Crew (core concept — implement this first)

Six specialists. One cohesive AI, presented as a team. Each owns a stage; each speaks in **first person** and always states **why** it made a decision.

| Role | Initial | Color | Owns stage | Speaks about |
|---|---|---|---|---|
| Producer | `P` | `#0F766E` | Understanding | what it read and what it kept |
| Educator | `E` | `#4C5B7A` | Teaching Plan | how the topic should be taught |
| Script Writer | `W` | `#7A5B4C` | Script | narration written for the ear |
| Storyboard Artist | `S` | `#5B7A4C` | Edit | framing each scene |
| Motion Designer | `M` | `#6B4F6B` | Assets | visuals and animation choices |
| Voice Director | `V` | `#4A6472` | Export | narration sync and delivery |

**Never label the AI "Assistant" or "AI".** Always the specific role.

Voice rules for all generated copy:
- First person, past tense for finished work: *"I read 11 pp and pulled out 37 concepts."*
- Always a stated rationale: *"Why — attention has to land before multi-head, so the prerequisite goes first."*
- The crew may **disagree and recommend**: *"I lean toward the second — the scaling is easier to feel than to read."*
- Scope reassurance on every regeneration: *"Nothing else in the timeline changes."*
- Never "Generating…", "Thinking…", "Processing…", or a bare spinner with no explanation.

---

## Design Tokens

### Color

**Surfaces**
| Token | Value | Use |
|---|---|---|
| App background | `linear-gradient(180deg,#F3F3F1,#EBEBE9)` | page body |
| Body base | `#EFEFED` | html/body fallback |
| Card | `#FFFFFF` | all cards |
| Sunken | `#FBFBFA` | inputs, inset rows, strips |
| Sunken alt | `#F6F6F4`, `#F4F4F1` | timeline lanes, chip fills |
| Glass panel | `rgba(255,255,255,0.42)` + `blur(24px)` | project sidebar |
| Glass panel alt | `rgba(255,255,255,0.5)` + `blur(28px)` | inspector, timeline bar |
| Sticky header | `rgba(244,244,242,0.7)` + `blur(24px)` | top bars |
| Drawer | `#FCFCFB` (opaque) | Producer drawer |

**Text**
| Value | Use |
|---|---|
| `#141414` | primary |
| `#2A2A28`, `#3A3A38` | body prose |
| `#4A4A47`, `#5A5A56` | secondary |
| `#6B6B68` | tertiary / paragraph |
| `#8A8A86` | muted labels |
| `#9A9A96` | meta |
| `#A3A39E` | de-emphasised headline half, uppercase micro-labels |
| `#B0B0AC` | hints |
| `#C4C4BF` | faintest (timecodes, disabled) |

**Borders** — `#E7E7E4` (default) · `#E3E3DF` (inputs) · `#EFEFEC` (inner) · `#F1F1EE` (divider) · `#DEDEDA` · `#D4D4CF` · `rgba(255,255,255,0.9)` (card border over gradient bg)

**Accent (teal)** — `#0F766E` primary · `#15897F` gradient top · `#0F5D57` text-on-tint · `rgba(15,118,110,0.06)` tint fill · `rgba(15,118,110,0.3)` approved ring · `#F5FAF9` approved card bg

**Dark canvas** — `#0E0E10` stage · `#1D1D22` chip · `#2E2E35` chip border · `#E8E8EC` caption · `#B9B9C2` chip text · `#8A8A92` meta · `#6E6E76` label · `#5C5C64` faint

**Waveform** — played `#3A3A38` · unplayed `#DBDBD6`

### Typography

Google Fonts:
```
Bricolage Grotesque  opsz,wght 12..96, 300..800   — display / headings / numerals
Geist                400,500,600,700              — all UI text (default)
Geist Mono           400,500                      — timecodes, IDs, technical labels
Caveat               600,700                      — handwritten section kickers only
```

Body default: `Geist`, `-webkit-font-smoothing: antialiased`.

| Role | Family | Size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| Hero H1 | Bricolage | `clamp(30px,4.3vw,54px)` | 600 | `-0.03em` | 1.1 |
| Section H2 | Bricolage | `clamp(26px,3.2vw,38px)` | 600 | `-0.025em` | 1.12 |
| CTA panel H2 | Bricolage | `clamp(30px,3.8vw,46px)` | 600 | `-0.03em` | 1.08 |
| Pull-quote | Bricolage | `clamp(21px,2.6vw,30px)` | 500 | `-0.02em` | 1.3 |
| Page title (app) | Bricolage | 28–30px | 600 | `-0.02em` | 1.15 |
| Card title | Bricolage | 16–20px | 600 | `-0.01em` | — |
| Stat numeral | Bricolage | `clamp(34px,4.4vw,52px)` | 600 | `-0.03em` | 1 |
| Footer wordmark | Bricolage | `clamp(64px,15vw,170px)` | 700 | `-0.05em` | 1.12 |
| Body | Geist | 13.5–15px | 400 | — | 1.55–1.65 |
| Script prose | Geist | 15px | 400 | — | 1.75 |
| UI label | Geist | 12.5–13.5px | 500 | — | — |
| Uppercase micro | Geist | 11–12px | 500 | `0.07–0.12em` | — |
| Mono | Geist Mono | 9.5–12px | 400 | `0.06–0.16em` when tracked | — |
| Kicker | Caveat | 19–24px | 600–700 | — | — |

Use `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs.

### Spacing, Radius, Shadow

Spacing scale (px): `2 3 4 6 7 8 9 10 11 12 14 16 18 20 22 24 26 28 30 32 34 36 40 44 48 56 64 72 88 96 120`

Radius: `999px` pills/buttons/nav · `26px` composer card · `24px` bento · `20px` cards · `19px` chatbar · `18px` list shells · `17px` app mark · `16px` cards/handoff · `14px` small cards · `12px` controls · `11px` icon buttons · `10px` canvas chips · `7px` tiny · `6px` badges

Shadow:
```
xs    0 1px 2px rgba(30,30,28,0.03)
sm    0 2px 10px rgba(30,30,28,0.04)
md    0 6px 20px rgba(30,30,28,0.05)
lg    0 8px 28px rgba(30,30,28,0.06)
xl    0 16px 44px rgba(30,30,28,0.09)
2xl   0 20px 54px rgba(30,30,28,0.10)
hover 0 14px 32px rgba(30,30,28,0.10)
canvas 0 16px 44px rgba(30,30,28,0.12)
dark-panel 0 30px 70px rgba(30,30,28,0.18)
drawer -24px 0 60px rgba(30,30,28,0.14)
sticky-down 0 8px 22px rgba(30,30,28,0.07)
sticky-up   0 -6px 20px rgba(30,30,28,0.07)
```

### Glass buttons (signature treatment)

Gradient fill + inner top highlight + hairline light border + colored glow.

```css
/* Graphite — neutral primary: Open Studio, Export, Approve, Regenerate, New Decode */
background: linear-gradient(180deg,#2C2C29,#141414);
border: 1px solid rgba(255,255,255,0.13);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.17), 0 6px 18px rgba(20,20,20,0.20);
border-radius: 999px;
transition: filter .15s, transform .15s;
/* hover */ filter: brightness(1.18); transform: translateY(-1px);

/* Teal — accent CTA: hero, landing CTA, Render, Start decode */
background: linear-gradient(180deg,#15897F,#0F766E);
border: 1px solid rgba(255,255,255,0.22);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.34), 0 10px 26px rgba(15,118,110,0.34);
/* hover */ filter: brightness(1.07); transform: translateY(-1px);

/* Disabled (Start decode with no source attached) */
background:#E4E4E0; color:#AEAEA9; border:1px solid #DCDCD8; box-shadow:none;
```

**Split button** (dashboard "＋ New Decode"): one graphite glass container, `display:flex; overflow:hidden`, two transparent buttons separated by `border-left:1px solid rgba(255,255,255,0.14)`. Left has a `20px` `rgba(255,255,255,0.16)` rounded chip holding `+`; right is a `▼` at `font-size:9px`, `padding:0 12px`.

### Motion

| Effect | Spec |
|---|---|
| Hover lift | `transform: translateY(-1px … -4px)` + deeper shadow, `.15–.25s ease` |
| Beat card hover | `translateX(3px)`, `.18s ease` |
| Spinner | `@keyframes spin` 360°, `.7–.8s linear infinite`, 2px ring, `border-top-color: accent` |
| Marquee | `@keyframes mq` `translateX(0 → -50%)`, `26s linear infinite`, content duplicated |
| Hero card drift | `@keyframes floaty` `translateY(0 → -8px → 0)` + preserved `rotate(var(--rot))`, `7–9s ease-in-out infinite`, staggered delays |
| Glow breathe | `@keyframes glowpulse` opacity `1 → .5 → 1`, `5s ease-in-out infinite` |
| Playhead tick | `100ms` interval, `+0.1s` per tick |

**No entrance/fade-in animations.** They were deliberately removed — elements must render at their settled state so nothing is invisible if a timeline never advances. Respect `prefers-reduced-motion`.

---

## Information Architecture

```
Landing  ──▶ Dashboard ──▶ New Decode ──▶ Processing ──▶ Project
                 ▲                                          │
                 └──────────────────────────────────────────┘

Project (left rail, gated top→bottom):
  Understanding · Teaching Plan · Script · Edit · Assets · Export

Producer drawer — global overlay, any screen, ⌘J
```

**Stage gating.** A stage unlocks only when the previous one is approved.

```
unlockLevel(): approvals.script → 5 | approvals.plan → 2 | approvals.understanding → 1 | else 0
nav levels:  overview 0 · plan 1 · script 2 · edit 5 · assets 5 · export 5
```

Clicking a locked stage does **not** show a tooltip — it opens the Producer drawer and the Producer explains: *"That stage opens once you've approved the one before it — I build each on the last so nothing gets orphaned."* Locked rows render at `#C4C4BF` with an `–` in the count slot.

Approving advances the tab automatically: understanding→plan, plan→script, script→edit.

**Re-approval.** Plan-level edits (reorder, cut, add a beat) reset `plan` *and* `script` approval. Scene-level edits inside Edit (split, merge, duplicate, narration text) do **not** reset anything.

---

## Screens

### 1. Landing

Max-width `1120px`, `0 32px`.

**Nav** — 22px `#141414` rounded-square mark with white `D`; "Decode" Bricolage 600 16px. Center links (Product / Workflow / Examples / Pricing) 13.5px `#6B6B68`. Right: text "Sign in" + graphite glass "Open Studio".

**Hero** — centered, `padding: clamp(48px,7vw,88px) 0 40px`, `min-height: clamp(430px,44vw,560px)`, `position:relative`.
- Radial teal glow behind: `760×440`, `radial-gradient(closest-side, rgba(15,118,110,0.10), transparent)`, centered, `z-index:0`.
- Center column `z-index:2`, `max-width:min(660px,54vw)`.
- 52px app mark, radius 17px, `linear-gradient(180deg,#2E2E2B,#141414)`, `0 14px 30px rgba(30,30,28,0.18)`.
- H1 two-tone: line 1 `#141414`; line 2 `#A3A39E` with the word **stories** in Caveat 700, `1.22em`, `color: accent`, `letter-spacing:0`.
- Sub: 16px `#6B6B68`, `max-width:440px`.
- Teal glass CTA "Start decoding — it's free".
- Micro-line 12px `#B0B0AC`: "Papers · Books · Docs · Slides · Whitepapers".

**Four floating cards** — `position:absolute`, `z-index:1`, glass (`rgba(255,255,255,0.85)` + `blur(16px)`, radius 18px, `0 18px 44px rgba(30,30,28,0.10)`), each rotated and drifting via `floaty` with its own `--rot`.

| Card | Anchor | Rotation | Width | Content |
|---|---|---|---|---|
| Processing checklist | `left:0; top:clamp(30px,5vw,56px)` | `-6deg` | `clamp(150px,19vw,218px)` | 3 done ✓, 1 spinner, 1 pending |
| Storyboard strip | `left:clamp(0,2vw,18px); bottom:12px` | `4deg` | `clamp(158px,20vw,236px)` | 3 thumbs, middle dark with `QKᵀ` |
| Nova narration | `right:0; top:clamp(26px,4.5vw,48px)` | `5deg` | `clamp(152px,19vw,222px)` | avatar, **static** waveform, quote |
| Dark scene frame | `right:clamp(0,1vw,6px); bottom:6px` | `-4deg` | `clamp(146px,18vw,210px)` | `#0E0E10`, 5 chips, caption, timecode |

> Cards must be anchored **inside** the container (never negative offsets) or they clip and collide with the headline below ~1100px.

**Marquee** — full-bleed (`margin: 56px -32px 0`), `1px` rules top and bottom, `14px 0`. Bricolage 13px, `letter-spacing:.22em`, `#8A8A86`, teal `✦` separators. Stage names duplicated for a seamless `-50%` loop.

**Then:** "The studio" section header (Caveat kicker + H2 + sub) → full app mock → "why it works" bento → stats row → workflow two-column → testimonial → dark CTA panel → footer.

**Bento** — `grid-template-columns: repeat(auto-fit, minmax(232px,1fr))`, gap 16px, radius 24px.
1. *Direct, don't prompt* — spans 2, split with a script-edit mock showing a teal-highlighted phrase and an overlapping graphite "↻ Regenerate scene 03" pill at `right:-12px; bottom:-14px`.
2. *One scene, not the whole video* — `#0E0E10` card, 2×2 tile grid, one tile teal-tinted with a spinner.
3. *A timeline that reads like a doc* — static bar chart, quote with a highlighted phrase.
4. *Voices that teach* — Nova row.
5. *Nothing renders without you* — teal toggle, "Director approval required".

**Dark CTA panel** — radius 32px, `#0E0E10`, `0 30px 70px rgba(30,30,28,0.18)`, overflow hidden; inside, an absolutely-positioned `radial-gradient(640px 260px at 50% -60px, rgba(15,118,110,0.35), transparent 70%)` breathing on `glowpulse`. Caveat kicker `#7FC7BE`. Two buttons: teal glass + `rgba(255,255,255,0.08)` ghost.

**Footer** — brand blurb + 3 link columns, then a giant ghost wordmark "decode" in `#E2E2DD`, then a bottom rule.

---

### 2. Dashboard

Sticky glass header: mark, `⌘K · Search decodes…` pill (260px, `#fff`, radius 999px), split "＋ New Decode" glass button, 30px gradient avatar.

Body max-width `1040px`, `44px 32px`.
- "Good morning, Mo" Bricolage 24px 600 · sub "3 decodes in your studio · 16:22 total runtime".
- **Recent Decodes** — `repeat(auto-fit,minmax(238px,1fr))`, radius 20px. Each card: 130px thumbnail with a **soft tinted gradient** (not black) + mono `SCENE 04` label + frame caption in `#2A2A28`; then title, meta, status pill. Hover `translateY(-2px)`.
  - `Attention Is All You Need` · 8 scenes · 5:27 · 2h ago · **In edit** (teal pill) · `linear-gradient(135deg,#D6E8E1 0%,#E9E7F1 55%,#F3ECE1 100%)`
  - `Dive into Deep Learning · Ch. 10` · 11 scenes · 7:02 · yesterday · **Plan review** · `linear-gradient(135deg,#E6E3F0,#F1E6DE)`
  - `Kubernetes Networking Docs` · 6 scenes · 3:53 · 3d ago · **Rendering 64%** · `linear-gradient(135deg,#E9E8E1,#DCE7E9)`
- **Templates** — `repeat(auto-fit,minmax(188px,1fr))`: Paper walkthrough (`§`), Docs onboarding (`≡`), Lecture recap (`✎`), Book chapter (`⌘`) — glyphs in accent, Geist Mono.

---

### 3. New Decode

Vertically centered. Back pill "← Studio" + "New Decode" label in a light top bar.

- 56px app mark (graphite gradient, radius 17px, inset highlight).
- Two-line greeting, Bricolage 33px 600 `-0.025em`: line 1 `#A3A39E` "Good to see you, Mo." / line 2 `#141414` "What should we decode?"
- Sub 14px `#8A8A86`.

**Composer card** — `720px`, radius 26px, `#fff`, `0 20px 54px rgba(30,30,28,0.10)`, overflow hidden.

1. **Status strip** — `#FBFBFA`, `11px 16px`, bottom border `#F4F4F1`. Left: accepted types, or once attached a source chip (mono ext badge, title, meta, `×`). Right: teal dot + "Producer ready".
2. **Chatbar** — inset field, radius 19px, `linear-gradient(180deg,#FFFFFF,#FAFAF8)`, `border 1px #E9E9E5`, `box-shadow: inset 0 1px 0 #FFFFFF, inset 0 -1px 0 rgba(30,30,28,0.03), 0 1px 2px rgba(30,30,28,0.03)`. Contains: 32px `＋` attach button (radius 11px), textarea (2 rows, 15px, placeholder *"Direct the production — who's watching, what to emphasise, what to leave out."*), and the Start decode pill with a `22px` `rgba(255,255,255,0.18)` circle holding `→`.
3. **Variable pills** — radius 999px, `#FBFBFA`, uppercase 11px `#A3A39E` label + value 12.5px 500:
   - **Audience** — *free text input*, `flex:1 1 230px`, placeholder "who is this for?", default `AI engineers who know backprop`
   - **Runtime** — select: 2–3 min / **5–6 min** / 8–10 min / 15 min deep dive
   - **Depth** — select: Intuition first / **Balanced** / Rigorous
   - **Voice** — select: **Calm explainer** / Energetic / Documentary / Lecture hall

When Audience is empty, a "try" row of one-tap starter chips appears below the card and disappears once filled: *AI engineers who know backprop · Second-year CS undergrads · Researchers outside the subfield · Product managers, no math*.

Below: **Recent files** and **Or try an example**, `repeat(auto-fit,minmax(258px,1fr))`. Both *attach* (they do not launch) so the brief can be set first. Each example carries real metadata that flows through the whole app.

Accepted: `PDF · EPUB · DOCX · PPTX · Markdown · LaTeX · URL`. Source types: Research papers · Books · Documentation · Lecture slides · Whitepapers.

---

### 4. Processing

Centered, 480px. **Never a bare spinner or "Generating…".** A Cursor-style indexing checklist.

Source chip at top (ext badge, filename, page/word count). Then seven steps, each: 18px status slot (done = filled `#141414` circle with `✓`; active = 14px spinner; pending = 6px `#D8D8D2` dot), label 14.5px 500, mono detail line revealed once done, and an elapsed time on the right. Pending rows sit at `opacity:.35`.

| Step | Detail | Time |
|---|---|---|
| Reading document | `11 pages · 5,214 words · 42 citations` | 0.9s |
| Extracting concepts | `37 concepts · 12 equations · 4 figures` | 1.1s |
| Mapping dependencies | *(what must be understood first)* | 0.9s |
| Planning the lesson | `8 beats · target {runtime} · audience: {audience}` | 0.9s |
| Drafting the script | `{n} words · measured pacing` | 1.2s |
| Storyboarding scenes | `8 boards · 1 idea per scene` | 1.3s |
| Building the timeline | `voice · visuals · captions · 5:27` | 0.9s |

Steps advance on staggered timers (~900–1300ms). A 2px accent progress rail sits below. While running: *"You'll review everything before a single frame renders."* On completion that swaps to a graphite "Open project →" button.

---

### 5. Project shell

**Header** (sticky glass, `10px 16px`): back pill · project title · `Draft · saved just now` pill · runtime + scene count in mono · **active specialist pill** (21px colored initial circle + role name — changes with the stage) · graphite Export.

**Left rail** — `200px`, glass `rgba(255,255,255,0.42)` + `blur(24px)`. Nav rows are `999px` pills, active = `#fff` + `0 2px 10px rgba(30,30,28,0.08)`. Each row: **19px specialist mark** (colored circle, white initial; `✓` on accent once approved; transparent with `#DEDEDA` border and `#C4C4BF` initial when locked) + label + mono count. Bottom: a source card (filename, author).

**Right inspector** — `318px` (min 240px), glass `rgba(255,255,255,0.5)` + `blur(28px)`. Only on **Edit**.

---

#### 5a. Understanding — *Producer*

Header: Caveat "understanding" + project title + description. A 180px dark "FIRST FRAME" preview card sits right.

Stat row `repeat(auto-fit,minmax(148px,1fr))`, radius 16px, flex-column so sub-labels bottom-align:
`Concepts 37 / 12 in the cut` · `Audience {free text} / {depth}` · `Target {runtime} / requested` · `Source 11 pp / 5,214 words`

> The Audience value is user-authored free text. Step its size down (`18px → 15px → 13.5px` at 16 and 26 chars) and **do not line-clamp** — clamping truncated real values.

**Concepts extracted** — count on the right ("37 found · 12 in the cut"); pills radius 999px, `white-space: nowrap` (they must never break mid-label), border → accent on hover.

**Scene list** — one bordered shell, rows divided by `#F1F1EE`: number · state dot · title (210px) · caption · animation · duration. Row hover `#FBFBFA`; click opens that scene on the canvas.

**Handoff card** — pinned to the bottom of the scroll area (`position:sticky; bottom:0; margin-top:auto`), opaque `#FFFFFF` (or `#F5FAF9` once approved).

---

#### 5b. Teaching Plan — *Educator*

Header: "3 acts, 8 beats" (both numerals — computed live) + total runtime right.

**Handoff card** pinned to the **top** (`sticky; top:0`).

**Runtime arc** — a card with proportional segments (one per beat, width = share of runtime; active = accent), and beneath it three act columns sized proportionally: `ACT I The problem`, `ACT II The mechanism`, `ACT III The payoff`, each with "n beats · m:ss".

**Beats grouped by act.** Each act: Caveat name + hairline rule + mono meta. Beats sit on a vertical spine (`1.5px #E3E3DF`) with 11px ring markers.

Beat card (radius 18px): `BEAT 01` mono in accent · title Bricolage 17px 600 · pace pill · **grip handle** (2×3 dot grid, `cursor:grab`) · "Viewer learns — {objective}" · footer with the on-screen caption, an animation chip, and a `− 0:32 +` duration stepper.

**Drag to reorder** (not arrow buttons): `draggable`, dragged card drops to `opacity:.4`, a 3px accent bar marks the insertion point, drop does a true **splice-insert** (not a swap). Selection follows the moved beat. Reordering resets plan + script approval.

---

#### 5c. Script — *Script Writer*

**No right inspector** — this is a full-width writing surface. Header shows live word count and wpm.

**Handoff card** pinned to the top.

Screenplay layout, one block per scene: a 60px left gutter (scene number, timecode, and a 2px accent bar when active) and the narration at 15px / 1.75 leading.

**Narration is directly editable in place** — `contentEditable`, saves on blur, syncs to the inspector and timeline. Focus shows `inset 0 0 0 1.5px accent`, hover `#FBFBFA`.

The **selected** block reveals an inline control row (unselected blocks show only word count / duration / pace): duration stepper · animation select · Nova voice chip · "Re-record" · graphite "Open on canvas →".

---

#### 5d. Edit — *Storyboard Artist*

Storyboard and Timeline merged into one workspace.

**Canvas (center)** — `#0E0E10`, radius 20px, flex column: a `flex:1; overflow:hidden` centered region (mono `SCENE 03 · SCALED DOT-PRODUCT ATTENTION`, a single non-wrapping row of shrinkable mono chips, caption in Bricolage `clamp(15px,2.3vh,22px)`) and a **real footer row** (play button, `0:00 / 5:27`, `1920 × 1080 · 24 fps`).

> The footer must be a flex sibling, not absolutely positioned — otherwise tall content overlaps the controls. Chips are `flex:0 1 auto; min-width:0` with ellipsis so they shrink instead of clipping.

Regeneration shows a `rgba(14,14,16,0.82)` + `blur(6px)` overlay with a spinner and a specific label ("Redrawing visuals for scene 03…").

**Right panel — two tabs:**

*Transcript* — grouped by scene, each with a 2px left rail (accent when active), number, title, timecode. Word-level highlighting follows the playhead (`accent + '33'` background); click any word to seek. **Read-only** — this is for navigation; writing happens in Script.

*Scene* — scene number/title, then:
- **Specialist note** (see below) when one is open
- Narration textarea + live word count
- Voice row (Nova, follows the Voice variable)
- Animation select
- Duration stepper + "Pacing: measured · narration auto-retimed"
- Visual prompt textarea
- `↻ Regenerate scene` (graphite glass) + `Visuals only` / `Voice only` + *"Only this scene is touched. Everything else stays."*

**Specialist note — the crew's open question.** On scenes 3 and 5 the Motion Designer brings two options instead of silently generating:

> **M · Motion Designer** — "The equation can carry this alone, or I can let the heat-map do the explaining. I lean toward the second — the scaling is easier to feel than to read."
> **A** Equation builds term by term — *Precise, but asks the viewer to read maths while listening.*
> **B** Heat-map forms, then softens — *Shows what the scaling does before naming it. My pick.*

Scene 5: sine waves vs. tokens with striped fingerprints ("Concrete, costs about four seconds. My pick.").

Picking an option collapses the card into a teal confirmation: *"Motion Designer is rebuilding this visual as option B. Nothing else in the timeline changes."* — and posts to the Producer thread with a receipt.

**Timeline (bottom)** — glass bar. Transport row: play, `0:00 / 5:27`, current scene name, "Drag to scrub · click a scene to select". Then a time ruler (30s ticks) and three lanes: waveform (110 bars, played `#3A3A38` / unplayed `#DBDBD6`), scene lane (proportional widths, active = white + accent border), animation lane. A 2px accent playhead with a 10px square cap spans all lanes. `onMouseDown` starts a document-level drag-scrub. Voice credit line beneath.

---

#### 5e. Assets — *Motion Designer*

Header + filter chips (All / Diagrams / Animations / Charts; All = graphite pill).

Grid `repeat(auto-fit,minmax(178px,1fr))`, radius 16px. Each: a 96px thumbnail — **tinted gradient or `#0E0E10`, alternating**, with a mono glyph and a `rgba(20,20,20,0.5)` + blur scene badge top-right — then name (ellipsis) and a row of kind + file size. Hover `translateY(-3px)`.

> Kind and size share one row: kind gets `min-width:0` + ellipsis, size gets `flex:none`. Without this the meta wraps and spills out of the card.

24 assets; 8 shown.

---

#### 5f. Export — *Voice Director*

"The project stays. Video is one format." — *"Nothing renders until you say so, and rendering never flattens the project — come back and change a scene any time."*

Settings card: Resolution (1080p / 1440p / 4K) · Format (MP4 · H.264 / WebM / ProRes) · Burned-in captions toggle · Chapter markers toggle. Toggles are `38×22` pills, `#141414` on / `#D8D8D2` off, 18px white knob at `left:2px → 18px`, `.15s`.

Teal glass **"Render video · 5:27"** → progress bar (random 1–9% per 220ms) → completion row with a `✓`, `attention-explained.mp4`, `5:27 · 214 MB`, and Download.

---

### 6. Producer drawer (global)

`position:fixed`, right edge, full height, `340px` (max `88vw`), `z-index:80`, **opaque `#FCFCFB`**, `border-left:1px solid #E7E7E4`, `-24px 0 60px rgba(30,30,28,0.14)`.

> Must be opaque and above the sticky header. A translucent drawer let the header's Export button read through and become an unclickable ghost target.

- **Header** — accent 22px `D` mark, "Producer", and a **live context line**: "Looking at Scene 04 · Multi-Head Attention" / "Looking at the Teaching Plan · 8 beats" / "Looking at your studio · 3 decodes" / "Looking at the new decode brief". Plus `×`.
- **Thread** — producer messages left (white, bordered), user right (`#141414`). Messages that changed something carry a **receipt**: a small `✓` plus e.g. `Act II · −20s`, `Beat order changed`, `2 beats revised`.
- **Context-aware quick actions** — the chips change per screen:
  - Dashboard: *What should I decode next?* · *Summarise my last decode*
  - Upload: *Is my brief specific enough?* · *How long should this be?*
  - Plan: *Tighten act II by 20s* (really retimes) · *Open with the results instead* (really moves beat 07 to the front) · *Add a beat on why RNNs failed* (**pushes back** rather than complying)
  - Script: *Make this scene plainer* (rewrites) · *Where does the pacing drag?*
  - Edit: *Why this visual?* · *Make this scene shorter* (retimes)
  - Export: *Which format should I pick?* · *Is it ready to render?*
- **Composer** — "Ask anything, or give a note…" + circular graphite send.

**Access** — `⌘J` / `Ctrl+J` toggles, `Esc` closes, the header specialist pill toggles, and a floating "Ask the producer ⌘J" pill sits bottom-right **on Dashboard and Upload only** (inside the project it would cover the timeline scrub area).

---

## Interactions & Behavior

**Playback** — `setInterval` 100ms, `playhead += 0.1`, stops at total. Scene derives from playhead. Any navigation stops playback.

**Scrubbing** — `onMouseDown` on the lane stack captures the rect, then `mousemove`/`mouseup` on `window`; position maps to `fraction × total`.

**Regeneration** — sets a label, shows the canvas overlay ~1600ms, then swaps in a genuinely different alternate draft (each scene has `narration` and `alt`, and regenerating toggles between them so the change is visible). `Visuals only` skips the text swap.

**Scene ops** — Split (halves duration and narration into two scenes), Merge (joins with the previous), Duplicate. All leave other scenes and all approvals untouched.

**Timing** — all timings are **derived**, never stored: `total = Σ durations`; `starts[i] = Σ durations[0..i-1]`. Word timings distribute a scene's duration evenly across its tokens. Reordering or retiming anything recomputes the arc bar, timecodes, transcript, and timeline automatically. **The user never manually syncs.**

**Responsive** — every fixed-column grid uses `repeat(auto-fit, minmax(Xpx, 1fr))`; all display type uses `clamp()`. There are no media queries.

---

## State Model

```ts
{
  screen: 'landing' | 'dashboard' | 'upload' | 'processing' | 'project'
  tab: 'overview' | 'plan' | 'script' | 'edit' | 'assets' | 'export'
  rightTab: 'transcript' | 'scene'

  // composer
  attached: Source | null
  brief: string
  audience: string          // free text
  runtime: string           // enum
  depth: string             // enum
  tone: string              // enum

  source: Source            // { ext,file,title,author,meta,pages,words,kind }

  // project
  sc: Scene[]               // ordered; reorder mutates this array
  approvals: { understanding: boolean, plan: boolean, script: boolean }
  sceneIdx: number
  playhead: number
  playing: boolean
  visualPick: Record<number,'A'|'B'>   // resolved specialist questions

  // interaction
  dragPos: number | null
  dragOverPos: number | null
  regen: string | null
  pstep: number             // processing 0..7

  // producer
  threadOpen: boolean
  thread: { who:'p'|'u', text:string, receipt?:string }[]
  draft: string
  thinking: boolean

  // export
  exportRes, exportFmt: string
  captions, chapters: boolean
  renderState: 'idle'|'rendering'|'done'
  renderPct: number
}
```

`Scene`: `{ title, dur, anim, reason, objective, caption, prompt, viz[], hot, narration, alt }`

**Real content is included.** Eight scenes of genuine "Attention Is All You Need" teaching copy — objectives, narration, alternate drafts, visual prompts, and canvas chips — are in the `constructor` of the logic class. Reuse it; it is not lorem.

---

## Assets

None external. All visuals are CSS: gradients, mono glyphs (`§ ≡ ✎ ⌘ ▤ ƒ(x) ⧉ ∿ ▆▅ ⧿`), and generated waveform bars (`8 + |sin(i·0.9)·22 + sin(i·0.23)·10|`). Only Google Fonts are fetched.

If the codebase has a brand system, map the accent, neutrals, and type scale onto it rather than hard-coding these values.

---

## Files

| File | What it is |
|---|---|
| `Decode Studio.dc.html` | The complete prototype — all screens, state, and content |
| `support.js` | Prototype-only template runtime. **Do not port.** |

Open the HTML directly in a browser to click through the flow. The tweak props on the root component (`accent`, `startScreen`, `glassPanels`) let you jump straight to any screen.

---

## Build Order

1. **Design tokens + glass button primitives** — everything depends on them.
2. **Crew model** — six roles with initial/color/copy. The handoff card, sidebar mark, header pill, drawer, and scene notes all read from it.
3. **Project shell** — header, gated rail, panel routing.
4. **Derived timing** (`total`, `starts`, word timings). Get this right before the timeline; everything downstream depends on nothing being stored.
5. **Stages** in order: Understanding → Teaching Plan (drag-reorder) → Script (inline editing) → Edit (canvas + transcript + timeline) → Assets → Export.
6. **Producer drawer** with context awareness.
7. **Landing, Dashboard, New Decode, Processing.**

## Things that were deliberately decided — please keep them

- **Never a bare loading state.** Progress is always a named, explained checklist.
- **The AI always says why.** A handoff without a rationale is not finished.
- **The crew can disagree.** Options with a stated preference beat silent generation.
- **Scope is always reassured.** Every regeneration says what it did *not* touch.
- **One canvas, not a wizard.** Storyboard and Timeline are one workspace; stages are navigable, not sequential screens you're pushed through.
- **Script writes, Timeline navigates.** Never two editable copies of the same text.
- **No entrance animations.** Settled state is the authored state.
- **Approve is always reachable.** Handoff cards are pinned, never below the fold.
