---
name: remotion-upgrade
description: Avoid version-sensitive Remotion features in generated scene modules.
---

Do not change dependencies or assume a newer Remotion release. Stay within the APIs explicitly
exposed by `@decode/animation-api`. Prefer simple primitives and frame arithmetic so generated scenes
survive runtime upgrades without migration.
