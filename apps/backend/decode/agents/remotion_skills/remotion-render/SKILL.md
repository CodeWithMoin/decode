---
name: remotion-render
description: Keep scene code deterministic and useful at checkpoint frames.
---

Author code that produces the same image for the same frame. Ensure the opening, midpoint, and final
frames are intentional inspection checkpoints rather than accidental transition states. Avoid
browser-only layout assumptions, external requests, and motion that never settles. Do not invoke a
renderer; Decode owns rendering and checkpoint capture.
