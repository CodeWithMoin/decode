# Autopilot plan — Decode departments → agent graph (slice 1 + 2)

Design is LOCKED (see memory `agent-graph-architecture.md`). This plan executes it.
Adopt Anthropic **Managed Agents' shape** (agent config + skills), run on Decode's
own runtime (OpenAI/Claude, not the hosted API). Fake-first. Depth-first per
`dial-in-each-part-first`.

## Dependency order (why this is a pipeline, not a free-for-all)

The `Agent` abstraction is load-bearing; the Visual Director and Renderer depend
on it, and several edits share `schemas.py`. So: research (parallel) → foundation
(sequential) → agents (sequential) → verify → review.

## Slice 1 — the `Agent` abstraction (foundation)

- **Agent config** = `SKILL.md` frontmatter, parsed into a pydantic model:
  `name`, `model {id, effort}`, `system` (the md body), `description`,
  `consumes`, `produces`, `skills` (list of skill names), `tools` (names from the
  27-tool registry in `decode/orchestrator.py`), `multiagent` (delegation roster),
  `metadata`. Reuse/extend the existing `SkillSet` loader (`departments/skills.py`).
- **Runtime** generalizing `departments/_agent.py` (`OpenAIAgent`) + the
  orchestrator observe-loop (`decode/orchestrator.py`): system + on-demand skills
  (progressive disclosure — load a skill's `SKILL.md` only when relevant) + tools
  + **in-process `multiagent` delegation** (a coordinator calls a sub-agent as a
  tool, awaits it, gets its produced artifact back).
- **Fake-first**: a deterministic fake runtime for tests, mirroring the existing
  fake departments. The whole suite passes on fakes.
- **Vendor public skills** into repo `.claude/skills/<name>/` (decision B), copied
  from `~/.claude/skills/<name>/`: `emil-design-eng`, `animation-vocabulary`,
  `apple-design`, `find-animation-opportunities`, `motion-doctrine`,
  `hyperframes-animation`, `hyperframes-keyframes`, `cut-the-curve`,
  `review-animations`, `improve-animations`, `humanise`. Only these trusted ones.

## Slice 2 — split Visualizer → Visual Director + Renderer

- **`visual_plan`** NEW artifact/schema: abstract storyboard, no HTML. Per beat:
  visual metaphor, ordered moments (each: what's shown, the movement/transition
  A→B, overlays), anchored to narration phrases (reuse `decode/timing.py` anchors,
  never hardcoded seconds).
- **Visual Director** (coordinator agent): consumes `teaching_plan`+`script`+
  `production_intent` → `visual_plan`. Custom skill `visual-direction` (author it,
  distilled from the current `visualizer/instructions.md` design guidance). Public
  skills: `emil-design-eng`, `animation-vocabulary`, `apple-design`,
  `find-animation-opportunities`. `multiagent: [renderer, animation-reviewer]`.
- **Renderer**: consumes `visual_plan` → `scene_visuals` (HyperFrames
  `composition_html` + `beats`, exactly today's contract; reuse
  `composition.py`/`lint.py`). Custom skill = existing
  `references/hyperframes-composition.md`. Public skills: `motion-doctrine`,
  `hyperframes-animation`, `hyperframes-keyframes`, `cut-the-curve`,
  `animation-vocabulary`.
- **Remove** `departments/visualizer/samples/scene.tsx`; `FakeVisualizer` emits a
  minimal HyperFrames `composition_html` (+ one anchored beat), so fake mode is
  HyperFrames-native. Update `fixtures.py` + any test asserting the React sample.

## Hard constraints

- Coordinator concept is named **Sisyphus** (not built this slice).
- Keep persisted names: `scene_visuals`, `generate_scene_visuals`,
  `regenerate_scene_visual`, `DECODE_VISUALIZER`, `visualizer/` provenance.
- Fake-first; `make test` green (pytest + eslint + tsc). Backend ruff + mypy
  clean; frontend tsc + eslint clean.
- Do not touch the walking-skeleton `.omc/autopilot/spec.md` content (backup at
  `.omc/autopilot/spec.walking-skeleton.backup.md`).
- Stay on fake providers; never commit secrets; no `Co-Authored-By` trailer.

## Verify

`make test` at the end. New agent-runtime tests, visual_plan resolve test, fake
HyperFrames-native test all green. No unrelated files changed.
