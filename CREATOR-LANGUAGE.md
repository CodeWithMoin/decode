# Decode creator language

Decode's backend models production precisely. The product interface explains that production in
language a creator can act on. Internal domain vocabulary must not leak into the default UI.

## Visibility layers

1. **Creator-facing:** named deliverables, progress, decisions, questions, and editable content.
2. **Trust details:** readable quality checks, source references, earlier drafts, and what informed a
   draft. These may use progressive disclosure.
3. **Internal-only:** IDs, schemas, event names, job/run state, provider data, token records, raw
   evaluation payloads, dependency edges, and arbitrary metadata.

## Vocabulary

| Internal term | Creator-facing language |
| --- | --- |
| Artifact | Work, draft, or the named deliverable |
| Artifact version | Draft |
| Latest / historical | Current / earlier |
| Immutable | Kept in history |
| Evaluation | Quality check |
| Evidence | Why Decode says this / source references |
| Source findings | What Decode understood |
| Lineage / dependencies | What informed this draft |
| Job / run | Production step, or omit it |
| Retry run | Try again |
| Production intent | Your direction |
| Schema / canonical state | Omit |
| Usage records | AI usage, only where cost is relevant |

## Rules

- Name the thing the creator is working on: production brief, teaching plan, script, scene.
- Explain outcomes and next actions, not system mechanics.
- Keep source support and uncertainty visible, but translate them into readable references and
  questions. Never show raw JSON as evidence.
- Preserve version history because creators understand drafts. Hide UUIDs and dependency edges.
- Translate API failures at the presentation boundary. Raw provider or database messages belong in
  logs and support tooling.
- Do not claim citations, extraction, or quality checks that the backend did not actually perform.
