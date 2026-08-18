# Decode

> AI-native production studio for educational content.

---

# Vision

Decode is not an AI video generator.

Decode is an AI-native production studio where humans collaborate with specialized AI departments to transform complex knowledge into engaging educational experiences.

Initially, Decode converts research papers, documentation and technical content into educational videos.

However, the architecture is intentionally designed so that videos are only one output.

Long-term, Decode should become an operating system for learning capable of producing interactive lessons, quizzes, flashcards, podcasts, diagrams and other educational experiences.

The architecture should support this evolution without requiring major redesign.

---

# Where the moat is

Decode's defensibility is **knowledge → teaching → production intelligence**,
plus **dependency-aware editing** (change one scene, only downstream work
regenerates) and **evaluation / trust**. It is explicitly **not** rendering and
**not** media playback — those are a substrate Decode stands on, not the product.

> Decode owns semantic intent + timing; HyperFrames owns executable composition
> + deterministic rendering.

HyperFrames is the replaceable render substrate behind a Decode-owned port (see
`HYPERFRAMES-ARCHITECTURE-REVIEW.md`); the Visualizer's migration onto it is
planned in `VISUALIZER-TO-HYPERFRAMES.md`. Osmo and Motion.so validate the market
but are beatable on this ground: a teaching-first pipeline where narration is the
timing authority is the moat neither of them has.

---

# Philosophy

Decode should never feel like ChatGPT.

Users should never feel like they typed a prompt and waited.

Instead, Decode should feel like professional creative software.

Think:

- Figma
- Cursor
- Linear
- Notion

The user should feel like they are directing an AI production team.

The AI creates the first draft.

Humans direct the production.

---

# Product Principles

## Human-in-the-loop

Human-in-the-loop does NOT mean asking for approval after every stage.

It means collaboration.

The user should be able to inspect every artifact.

The user should be able to edit every artifact.

The user should be able to regenerate any artifact.

When something changes, only downstream work regenerates.

Never regenerate the entire project.

The experience should resemble editing a Figma document rather than regenerating an image.

---

## Transparency

Nothing should happen behind the scenes.

Every department should expose:

- what it received
- what it produced
- why decisions were made
- current status
- evaluation results

The user should always understand what Decode is doing.

---

## Incremental Regeneration

Everything should be artifact based.

Example:

If Scene 5 changes:

Only regenerate

- Scene 5 script
- Scene 5 visual specification
- Scene 5 rendered assets
- Scene 5 timeline

Everything else remains untouched.

---

## Context Isolation

Each department receives only the minimum information required.

Renderer never receives the entire paper.

Reviewer does not need the original PDF.

Every department works with focused context.

This reduces

- token usage
- latency
- hallucinations
- complexity

---

## Artifact Based Architecture

Departments never communicate directly.

Departments communicate through artifacts.

Artifacts are versioned.

Artifacts are inspectable.

Artifacts are editable.

Artifacts are resumable.

Example

Production Brief

↓

Teaching Plan

↓

Scene Script

↓

Visual Specification

↓

Rendered Assets

↓

Timeline

↓

Review Report

↓

Final Project

Artifacts should include

- version
- parent artifact
- creation timestamp
- owning department
- quality score
- compute cost

---

## Evaluation

Every department owns quality.

Each department internally performs

Generate

↓

Evaluate

↓

Revise

↓

Approve

Only approved artifacts are published.

If retries exceed limits

Escalate to the human.

Never silently continue.

---

## AI Compute

Every artifact tracks compute.

Credits are attached to work performed.

Users should always know

Estimated AI Cost

before expensive operations.

Support

Draft Mode

Fast

Cheap

Production Mode

Higher quality

Premium models

More evaluation

---

# Overall Architecture

Decode is organized like a production studio.

Each department owns one responsibility.

Each department can internally use

- sub agents
- tools
- skills
- evaluation loops
- checkpoints

The outside world interacts only with the department.

---

# Project Manager

One orchestrator coordinates everything.

Responsibilities

- scheduling
- artifact routing
- dependency tracking
- execution state
- checkpoint management
- regeneration
- recovery

Departments never invoke each other directly.

> **Designed, not yet built.** The current execution model is the staged
> department pipeline described below (immutable artifacts, deterministic
> dependency tracking). The single orchestrator running a graph of specialist
> agents — and the snapshot + checkpoints that replace per-artifact versions — is
> the planned direction, specified in `AGENT-GRAPH.md` (see §8 for the snapshot
> state model). Read it as the target, not current reality.

---

# Departments

## Intake

Purpose

Understand the project.

Inputs

- documents
- creative brief
- audience
- duration
- depth
- voice
- branding

Responsibilities

- parse documents
- extract metadata
- understand user intent
- understand uploaded content
- estimate complexity
- build Production Brief

Output

Production Brief

---

## Architect

Purpose

Design the learning experience.

Not writing.

Planning.

Responsibilities

- learning objectives
- story structure
- curriculum design
- prerequisite ordering
- teaching strategy
- duration allocation

Output

Teaching Plan

---

## Author

Purpose

Write educational narration.

Responsibilities

- script writing
- audience adaptation
- scene splitting
- educational storytelling

Output

Scene Script

---

## Visualizer

Purpose

Determine how every concept should be visualized.

Not implementation.

The Visualizer's role is the **Motion Designer**: how a beat's teaching intent
becomes animated, positioned, and synced to narration. Decode decides *what
visual teaches*; the Motion Designer turns that into motion; HyperFrames renders
it (see `VISUALIZER-TO-HYPERFRAMES.md`). "Motion Designer" is the role — the
persisted contract names stay put (`scene_visuals`, `generate_scene_visuals` /
`regenerate_scene_visual`, `DECODE_VISUALIZER`, the `visualizer/` folder and
provenance ids).

Responsibilities

- visual reasoning
- animation planning
- diagram planning
- educational visualization

Output

Visual Specification

---

## Renderer

Purpose

Implement visuals.

Responsibilities

- HTML
- SVG
- motion
- assets

Output

Rendered Assets

---

## Composer

Purpose

Synchronize production.

Responsibilities

- voice timing
- scene timing
- animation pacing
- transitions
- timeline

Output

Timeline

---

## Reviewer

Purpose

Production-level review.

Responsibilities

- continuity
- pacing
- educational quality
- consistency
- visual quality
- brand compliance

Output

Review Report

---

## Publisher

Purpose

Finalize.

Responsibilities

- music
- polishing
- rendering
- export

Output

Final Project

---

# Internal Department Architecture

Every department follows the same internal structure.

Department

├── Skills
├── Tools
├── Sub Agents
├── Evaluation Loop
├── Checkpoints
└── Artifact

Departments may use multiple specialized sub agents internally.

Departments may use different models depending on the task.

The architecture should support replacing tools or models without affecting other departments.

---

# UI Philosophy

The interface should never resemble a chatbot.

Instead, it should resemble a collaborative creative workspace.

Projects are the primary object.

Artifacts are first-class citizens.

The exported video is only one output.

Users should always see

- current department
- active artifact
- project timeline
- generated assets
- revision history
- AI reasoning (where useful)

Every stage should remain inspectable after completion.

---

# Visual Design

Design language

Editorial

Minimal

Premium

Calm

Confident

Inspired by

- Linear
- Figma
- Cursor
- Notion
- Wonder

Avoid

- neon gradients
- glowing AI effects
- glassmorphism everywhere
- generic chatbot interfaces
- futuristic clichés

The product should feel like professional software.

---

# Branding

Primary Accent

Burnt Amber

Typography

Headings

Bricolage Grotesque

Body

Plus Jakarta Sans

The design should feel warm rather than cold.

Editorial rather than cyberpunk.

Learning rather than AI.

---

# Technical Philosophy

Prioritize

- modularity
- composability
- resumability
- observability
- debuggability
- extensibility

Every architectural decision should reinforce those principles.

---

# Goal

Build software that feels like working with an experienced production studio.

Not a chatbot.

Not a prompt box.

A workspace where AI and humans create educational experiences together.