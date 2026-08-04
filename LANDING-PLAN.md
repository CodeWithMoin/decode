# Decode — landing page design plan

Written as if starting the site from zero, for a startup that turns technical
documents into educational videos you direct.

---

## 1. The problem with the current page

| Symptom | Cause |
|---|---|
| "You direct. It produces." reads as a riddle | It's a slogan. It names no object. A cold visitor cannot tell what "it" is. |
| The scroll feels heavy | The studio section pins for ~6 viewport heights. The reader scrolls and the page refuses to move. |
| Sections feel unrelated | Each headline speaks in a different register — some declarative, some poetic, some functional. |

## 2. The one idea: **assertion + negation**

`Built like creative software. Not like a chatbot.` works because it does two
jobs in seven words: it makes a claim, then names the thing you were about to
mistake it for. The reader never has to guess the category.

**So every section headline on the site uses that shape.** Statement in ink,
counter-statement in `t9`. It becomes the site's voice — recognisable after two
sections, and it forces every section to be *about* something rather than
gesturing at it.

It also solves "make it easy" for free: you cannot write this shape without
saying plainly what the thing is not.

## 3. The page, in order — *as built*

Each section has one job. The public vocabulary is deliberately smaller than the
plan above assumed: the user makes three decisions, and Decode does the rest.
The nine internal stages are **not** named on the page — explaining the system
to someone who has not yet been told what it does was the single biggest
comprehension failure of the previous version.

| # | Headline | Job |
|---|---|---|
| 01 | **Understand anything.** *Not summarised — taught.* | The promise. |
| 02 | *(source → scene diptych, then "works with")* | Show the transformation itself, then name what it accepts. No copy required. |
| 03 | **Three decisions,** *and Decode does the rest.* | Upload → Direct → Export. The visitor's job, stated plainly. |
| 04 | **Change one scene,** *and only that scene changes.* | The differentiator: a user-controlled edit with a visible regeneration boundary. |
| 05 | **Built like creative software.** *Not like a chatbot.* | Receipts, source-grounding, review before you see it. |
| 06 | **For the people who have to** *actually understand it.* | Proof numbers, then who this is for. |
| 07 | **Bring the source.** *Leave with a film.* | Invitation. |

Cut from the plan: the nine-stage editor ruler (02) and the "Nine editable
stages" workflow grid (06). Both explained Decode's internals to a reader who
had not yet been sold on the outcome.

### The new section — 03, "Three decisions"

The single biggest comprehension fix. Directly under the hero, three columns,
no cards, hairline rules between:

```
01  Upload            Drop a paper, a doc, a chapter, a set of notes.
02  Direct            Decode proposes the whole cut. You change what's wrong.
03  Export            Nothing renders until you say so.
```

If a visitor reads only this, they understand the product. Everything below is
elaboration.

## 4. Motion budget — the fix for "too heavy"

Hard rule: **the page is at most 7 viewport heights, and nothing pins for more
than 1.**

| Element | Now | Plan |
|---|---|---|
| Studio demo | pinned, 13 beats, ~6 screens | **Unpinned and user-controlled.** Edit → inspect scope → update downstream. No background clock. |
| Timeline spine | fixed transport bar | **Cut.** It was a transport that transported nothing — a play button and a `5:17 / 5:27` counter over a page that cannot play. A fake affordance is worse than no affordance. |
| Section reveals | fade + 22px rise, once | Keep. 400ms, 70ms stagger. |
| Hero | word-split blur-in | Keep, at 0.42s / 55ms stagger. A slower 0.78s / 90ms version read as waiting rather than as weight. |
| Hero diptych | — | One beat: the paragraph highlights, the link draws. Once, then settled. |
| Everything else | — | Hover and press only. |

The pin goes because it charges the reader six screens for one idea. Nothing on
the page loops: every animation resolves and stops.

## 5. What carries over unchanged

- The identity: `#EFEFED` paper, burnt amber, Instrument Serif + Plus Jakarta.
- The handwritten word in the hero. Section kickers are Caveat in accent
  (`Kicker` = `font-hand text-accent`), *not* the mono production vocabulary —
  that vocabulary is internal and stays off the marketing surface.
- `SceneVisual` — the eight real scene renderers — used wherever output is
  shown, and a **different** renderer in each section. Three sections once
  showed the same one, which made the product look like it had a single scene.
- Real content only. The rendered scenes are necessarily "Attention Is All You
  Need" because the eight renderers draw its specific diagrams; everywhere a
  source is merely *named*, the page speaks in kinds — a paper, lecture slides,
  a book chapter, docs, an article, your own notes.
- No invented testimonials. No unmeasured speed claims.

## 6. What gets cut

- The pin on the studio section.
- `SignatureMoment` as a standalone section — it is one sentence on a dark
  panel and it duplicates what 06 does better. Fold it into 06 or delete.
- Any headline that does not use the device.

## 7. Build order

1. Rewrite all seven headlines to the device. Copy first, alone, no styling.
2. Build 03 "Three decisions" — highest comprehension gain per line of code.
3. Replace the studio reel with the user-controlled one-scene edit.
4. Put the five presented crew roles beside the artifact, in handoff order.
5. Delete `SignatureMoment`.
6. Re-verify: page height, overflow at 4 widths, reduced motion, contrast.
