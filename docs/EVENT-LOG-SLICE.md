# The durable event log slice

The foundation the §8 checkpoint migration writes into, and the recorder that
makes every real run a test fixture. Written for a first pass — each step is
small, shippable alone, and explained from zero.

## The idea in one paragraph

An **event log** is an append-only diary of everything that happened to a
project: "creator asked X", "orchestrator proposed Y", "creator applied it",
"scene 3 regenerated". You never edit or delete a line — you only add. Every
other view of the project (the chat history, the receipts list, the progress
checklist, eventually undo) is *computed from the diary*, the way `derive.ts`
computes timing from placement instead of storing it. One source of truth,
many cheap views.

Decode already lives by this philosophy on the frontend (nothing derived is
stored) and already has half the machinery on the backend (`outbox_events`
rows survive delivery). The slice closes the gaps.

## Step 1 — Give events a project sequence number

**What:** add `project_id` and a per-project, gap-free `seq` (1, 2, 3…) to the
event row (today's `outbox_events` has `aggregate_id` but no ordering a client
can resume from).

**Why:** "give me everything after seq 41" is what makes reconnecting SSE,
replay, and undo possible. Timestamps can't do this job — two events can share
a millisecond; a sequence can't lie about order.

**How small:** one migration + one line in the write path. Postgres enforces
uniqueness on `(project_id, seq)`; an append-only trigger (copy the artifact
immutability trigger) makes tampering impossible rather than just discouraged.

## Step 2 — Log the conversation, not just the jobs

**What:** the orchestrator router writes an event row for each thing that
happens in a turn: `chat.turn.started` (the creator's message),
`chat.observed` (each read tool it called), `chat.replied` (reply + proposal),
`chat.applied` (the creator clicked Apply), `chat.receipt`.

**Why:** today those exist only in the SSE stream — close the tab and the
turn never happened. Once they're rows: chat history survives reload (the bug
you hit), receipts are queryable, and the orchestrator's episodic memory
(AGENT-GRAPH §4) is a SQL query instead of a new store.

**How:** the turn endpoint already has every value in hand when it yields an
SSE line — add one `session.add(Event(...))` beside each yield. Same
transaction as the work, so the log can never disagree with what happened.

## Step 3 — Serve SSE *from* the log

**What:** flip the stream's direction. Instead of "do work → push to stream →
also maybe store", it becomes "append to log → stream reads the log forward".
The client sends `Last-Event-ID: 41` on reconnect and receives 42 onward.

**Why:** this is the dsh lesson (`session/event` vs `agent/*`): the durable
record and the live feed must be the same data, or they drift. It kills the
whole class of "the UI showed it but the DB never heard of it" bugs — the
reload-revert bug is that class.

**How:** the SSE generator becomes a loop: `SELECT * FROM events WHERE
project_id=? AND seq>? ORDER BY seq` then poll (or LISTEN/NOTIFY later — the
poll is fine at this scale; `id` stamps `Last-Event-ID`).

## Step 4 — Turn stored views into projections

**What:** anything currently maintained as its own table *and* derivable from
events becomes a read that folds over events (a **projection**). First
candidate: the chat/receipt history the Production room shows.

**Why:** every maintained copy is a sync bug waiting to happen (the
"one owner per piece of state" invariant, applied to the backend). A
projection can't drift from the log because it *is* the log, folded.

**How:** start with zero infrastructure — a function that reads events and
returns the view, called per request. Cache later only if it's ever slow.

## Step 5 — The LLM recorder (record / replay)

**What:** a thin wrapper around every provider call. **Record mode** (always
on): before calling, hash the request (model + messages + tools); after,
store `(hash → response)` in an `llm_calls` table. **Replay mode** (a
setting): look up the hash and return the stored response without calling the
provider at all.

**Why, in plain terms:** LLM calls are slow, cost money, and answer
differently every time — the three properties that make software untestable.
Recording turns every real run into a cassette. Replaying the cassette gives
you: end-to-end tests with zero spend, bug reproduction of the *exact* run
that misbehaved, and prompt-change diffing (replay the same project through a
new prompt, diff the outputs). Your deterministic fakes generalized — the
fake is now "whatever really happened last Tuesday".

**How:** one table, one wrapper class implementing the same provider port,
selected by `Settings` exactly like `DECODE_VISUALIZER` fakes are today.
Storing `request_json` alongside the hash keeps recordings debuggable.

## Step 6 (later) — checkpoints anchor to the log

When §8's snapshot+checkpoint migration lands, a checkpoint is "snapshot as
of seq N". Undo restores the snapshot; the events after N *are* the story of
what undo discarded — which is what a receipt-driven editing product wants to
show. Nothing in steps 1–5 has to change.

## Order and size

1–2 are one small PR (migration + router edits) and immediately fix chat
persistence. 3 is a second PR that makes reconnect honest. 4 falls out of 3.
5 is independent and can ship any time — it pays for itself the first time a
generation bug needs reproducing. 6 waits for the §8 migration by design.
