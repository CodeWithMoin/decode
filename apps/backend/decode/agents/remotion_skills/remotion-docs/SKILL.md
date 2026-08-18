---
name: remotion-docs
description: Apply the supported Remotion API conservatively when syntax is uncertain.
---

Use only APIs named in the assignment or exported by `@decode/animation-api`. Prefer established
`useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`, `Easing`, and `AbsoluteFill` patterns
over speculative APIs. This runtime cannot browse documentation; if an API is uncertain, implement
the effect with ordinary frame arithmetic instead.
